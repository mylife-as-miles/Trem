export { PlanWorkflow } from './workflows/plan-workflow';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  buildBranchArtifactStorageKey,
  cloneBranchArtifacts,
  createMergeCommitRecord,
  ensureBranchExists,
  ensureBranchSchema,
  ensureProjectBranches,
  filterCommitsForBranch,
  getBranchHead,
  getBranchHeads,
  getNextCommitId,
  getProjectActiveBranch,
  getProjectCommits,
  listProjectBranches,
  sanitizeBranchName,
  setProjectActiveBranch,
  updateBranchHead,
  type CommitSummary,
} from './db/branching';

export { ProjectCoordinatorDO } from './durable-objects/project-coordinator';
export { IngestionWorkflow } from './workflows/ingestion-workflow';

type Env = {
  DB: D1Database;
  BUCKET: R2Bucket;
  PROJECT_COORDINATOR: DurableObjectNamespace;
  INGESTION_WORKFLOW: any; // Workflow API
  PLAN_WORKFLOW: any;
};

type WorkflowInstanceStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'waiting'
  | 'errored'
  | 'terminated'
  | 'complete';

type WorkflowInstanceLike = {
  terminate: () => Promise<void>;
  status: () => Promise<{ status: WorkflowInstanceStatus }>;
};

type ExistingJob = {
  id: string;
  status: string;
  workflow_id: string | null;
  branch_name?: string | null;
};

type QueueAssetPreview = {
  id: string;
  name: string;
};

const app = new Hono<{ Bindings: Env }>();

app.get('/api/diag/db', async (c) => {
  try {
    const { results: tables } = await c.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    const { results: projectCount } = await c.env.DB.prepare("SELECT count(*) as count FROM projects").all();
    const { results: assetCount } = await c.env.DB.prepare("SELECT count(*) as count FROM assets").all();
    const { results: jobCount } = await c.env.DB.prepare("SELECT count(*) as count FROM jobs").all();
    
    return c.json({
      status: 'ok',
      tables: tables.map((t: any) => t.name),
      counts: {
        projects: projectCount[0]?.count,
        assets: assetCount[0]?.count,
        jobs: jobCount[0]?.count
      },
      env: {
        has_db: !!c.env.DB,
        has_bucket: !!c.env.BUCKET,
        has_workflow: !!c.env.INGESTION_WORKFLOW
      },
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    return c.json({ status: 'error', message: err.message, stack: err.stack }, 500);
  }
});



app.use('*', cors());

const ACTIVE_WORKFLOW_STATUSES = new Set<WorkflowInstanceStatus>(['queued', 'running', 'paused', 'waiting']);
const ACTIVE_COORDINATOR_STATUSES = new Set(['queued', 'running', 'transcribing', 'analyzing']);
const createQueuedAgentStates = (assets: QueueAssetPreview[]) =>
  Array.from({ length: 4 }, (_, index) => {
    const asset = assets[index];
    return {
      slot: index + 1,
      status: asset ? 'queued' : 'idle',
      assetId: asset?.id ?? null,
      assetName: asset?.name ?? null,
      completedCount: 0,
    };
  });

const buildObjectResponse = async (
  env: Env,
  storageKey: string,
  fallbackContentType?: string,
) => {
  const object = await env.BUCKET.get(storageKey);

  if (!object) {
    return null;
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);

  if (fallbackContentType && !headers.get('content-type')) {
    headers.set('content-type', fallbackContentType);
  }

  return new Response(object.body, { headers });
};

const readRequestedBranch = (request: Request) => {
  const url = new URL(request.url);
  const branch = url.searchParams.get('branch');
  return branch ? sanitizeBranchName(branch) : null;
};

const resolveSelectedBranch = async (
  env: Env,
  projectId: string,
  request: Request,
) => {
  await ensureProjectBranches(env, projectId);
  const requestedBranch = readRequestedBranch(request);
  if (requestedBranch) {
    const existingBranch = await env.DB.prepare(
      "SELECT name FROM branches WHERE project_id = ? AND name = ?"
    ).bind(projectId, requestedBranch).first<{ name: string }>();
    if (existingBranch?.name) {
      return requestedBranch;
    }
  }

  return getProjectActiveBranch(env, projectId);
};

const buildProjectPayload = async (
  env: Env,
  projectId: string,
  request: Request,
) => {
  await ensureBranchSchema(env);
  const selectedBranch = await resolveSelectedBranch(env, projectId, request);
  const project = await env.DB.prepare("SELECT * FROM projects WHERE id = ?").bind(projectId).first();

  if (!project) {
    return null;
  }

  const assets = await env.DB.prepare("SELECT * FROM assets WHERE project_id = ? ORDER BY created_at ASC").bind(projectId).all();
  const jobs = await env.DB.prepare(
    "SELECT * FROM jobs WHERE project_id = ? AND branch_name = ? ORDER BY created_at DESC LIMIT 1"
  ).bind(projectId, selectedBranch).all();
  const logs = await env.DB.prepare(
    "SELECT * FROM event_logs WHERE project_id = ? AND branch_name = ? ORDER BY created_at ASC"
  ).bind(projectId, selectedBranch).all();
  const artifacts = await env.DB.prepare(
    "SELECT name, size, content_type FROM artifacts WHERE project_id = ? AND branch_name = ? ORDER BY name ASC"
  ).bind(projectId, selectedBranch).all();
  const commits = await getProjectCommits(env, projectId);
  const branches = await listProjectBranches(env, projectId);
  const branchHeads = await getBranchHeads(env, projectId);
  const currentBranchCommits = filterCommitsForBranch(commits, branchHeads[selectedBranch] ?? null);
  const doStatus = await getCoordinatorStatus(env, projectId);

  return {
    project,
    assets: assets.results,
    activeJob: jobs.results[0] || null,
    artifacts: artifacts.results,
    commits,
    currentBranchCommits,
    logs: logs.results,
    branches,
    activeBranch: await getProjectActiveBranch(env, projectId),
    selectedBranch,
    branchHeads,
    liveProgress: doStatus.progress,
    liveStatus: doStatus.jobStatus,
    liveMessage: doStatus.message,
    liveAgents: doStatus.agents || [],
  };
};

const storeBranchArtifact = async (
  env: Env,
  projectId: string,
  branchName: string,
  jobId: string | null,
  name: string,
  data: unknown,
) => {
  const content = JSON.stringify(data, null, 2);
  const storageKey = buildBranchArtifactStorageKey(projectId, branchName, name);

  await env.BUCKET.put(storageKey, content, {
    httpMetadata: { contentType: 'application/json' },
  });

  await env.DB.prepare(
    "INSERT INTO artifacts (id, project_id, job_id, branch_name, name, storage_key, content_type, size) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    crypto.randomUUID(),
    projectId,
    jobId,
    branchName,
    name,
    storageKey,
    'application/json',
    content.length,
  ).run();
};

const getCoordinatorStub = (env: Env, projectId: string) => {
  const doId = env.PROJECT_COORDINATOR.idFromName(projectId);
  return env.PROJECT_COORDINATOR.get(doId);
};

const resetCoordinator = async (
  env: Env,
  projectId: string,
  jobStatus: string = 'idle',
  progress: number = 0,
  message: string = 'Waiting for a Trem workflow.',
) => {
  const stub = getCoordinatorStub(env, projectId);
  await stub.fetch(
    new Request('http://do/reset', {
      method: 'POST',
      body: JSON.stringify({ jobStatus, progress, message }),
    }),
  );
};

const getCoordinatorStatus = async (env: Env, projectId: string) => {
  const stub = getCoordinatorStub(env, projectId);
  const doStatusRes = await stub.fetch(new Request('http://do/status'));
  return (await doStatusRes.json()) as {
    activeJobId: string | null;
    progress: number;
    jobStatus: string;
    message: string;
    agents?: unknown[];
  };
};

const recoverStaleJobIfNeeded = async (env: Env, projectId: string, job: ExistingJob) => {
  const doStatus = await getCoordinatorStatus(env, projectId);
  const now = Math.floor(Date.now() / 1000);

  let workflowStatus: WorkflowInstanceStatus | 'missing' | null = null;
  if (job.workflow_id) {
    try {
      const instance = (await env.INGESTION_WORKFLOW.get(job.workflow_id)) as WorkflowInstanceLike;
      const workflow = await instance.status();
      workflowStatus = workflow.status;
    } catch (error) {
      workflowStatus = 'missing';
    }
  }

  const workflowIsActive =
    workflowStatus !== null &&
    workflowStatus !== 'missing' &&
    ACTIVE_WORKFLOW_STATUSES.has(workflowStatus);
  const coordinatorOwnsJob = doStatus.activeJobId === job.id;
  const coordinatorIsActive =
    coordinatorOwnsJob &&
    ACTIVE_COORDINATOR_STATUSES.has(doStatus.jobStatus);

  if (workflowIsActive || coordinatorIsActive) {
    return {
      recovered: false,
      response: {
        error: 'Job already in progress',
        jobId: job.id,
        workflowId: job.workflow_id,
        status: job.status,
      },
      statusCode: 409,
    };
  }

  if (workflowStatus === 'complete') {
    await env.DB.prepare(
      "UPDATE jobs SET status = 'completed', progress = 100, completed_at = COALESCE(completed_at, ?) WHERE id = ?"
    ).bind(now, job.id).run();
    await env.DB.prepare(
      "UPDATE projects SET status = 'ready', updated_at = ? WHERE id = ?"
    ).bind(now, projectId).run();
    await resetCoordinator(env, projectId, 'completed', 100, 'Workflow completed. Refreshing repository state.');

    return {
      recovered: false,
      response: {
        error: 'The latest ingestion already completed. Refresh the project before starting another run.',
        jobId: job.id,
        workflowId: job.workflow_id,
        status: 'completed',
      },
      statusCode: 409,
    };
  }

  const staleReason =
    workflowStatus === 'missing'
      ? 'Recovered stale job after the workflow instance could not be found.'
      : `Recovered stale job after the workflow ended with status "${workflowStatus ?? 'unknown'}".`;

  await env.DB.prepare(
    "UPDATE jobs SET status = 'failed', error = COALESCE(error, ?), completed_at = COALESCE(completed_at, ?) WHERE id = ?"
  ).bind(staleReason, now, job.id).run();
  await env.DB.prepare(
    "UPDATE projects SET status = 'idle', updated_at = ? WHERE id = ?"
  ).bind(now, projectId).run();
  await resetCoordinator(env, projectId, 'idle', 0, 'Recovered a stale workflow. Ready for a new ingest run.');

  return {
    recovered: true,
    response: null,
    statusCode: 200,
  };
};

// --- Project Routes ---

app.post('/api/projects', async (c) => {
  await ensureBranchSchema(c.env);
  const { name, brief } = await c.req.json();
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  await c.env.DB.prepare(
    "INSERT INTO projects (id, name, brief, active_branch, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(id, name, brief || '', 'main', now).run();

  await ensureProjectBranches(c.env, id);

  const project = await c.env.DB.prepare("SELECT * FROM projects WHERE id = ?").bind(id).first();
  return c.json(project);
});

app.patch('/api/projects/:id', async (c) => {
  await ensureBranchSchema(c.env);
  const id = c.req.param('id');
  const { name, brief } = await c.req.json();
  const now = Math.floor(Date.now() / 1000);

  await c.env.DB.prepare(
    "UPDATE projects SET name = COALESCE(?, name), brief = COALESCE(?, brief), updated_at = ? WHERE id = ?"
  ).bind(name || null, brief || null, now, id).run();

  return c.json({ success: true });
});

app.get('/api/projects', async (c) => {
  await ensureBranchSchema(c.env);
  const { results } = await c.env.DB.prepare("SELECT * FROM projects ORDER BY created_at DESC").all();
  return c.json(results);
});

app.on('DELETE', '/api/projects/:id', async (c) => {
  const id = c.req.param('id');
  
  // 1. Find any active jobs and terminate their workflows
  try {
    const activeJobs = await c.env.DB.prepare(
      "SELECT id, workflow_id FROM jobs WHERE project_id = ? AND status NOT IN ('completed', 'failed', 'cancelled')"
    ).bind(id).all<{ id: string; workflow_id: string }>();

    if (activeJobs.results) {
      for (const job of activeJobs.results) {
        if (job.workflow_id) {
          try {
            const instance = await c.env.INGESTION_WORKFLOW.get(job.workflow_id);
            await instance.terminate();
          } catch (wfErr) {
            console.error(`Failed to terminate workflow ${job.workflow_id}:`, wfErr);
          }
        }
      }
    }
  } catch (err) {
    console.error('Error finding active jobs for termination:', err);
  }

  // 2. Use a batch to delete all related resources in one go
  // Must delete child records first to satisfy SQLite foreign key constraints
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM assets WHERE project_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM jobs WHERE project_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM event_logs WHERE project_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM artifacts WHERE project_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM branches WHERE project_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM projects WHERE id = ?").bind(id),
  ]);

  await resetCoordinator(c.env, id);

  return c.json({ success: true });
});


app.get('/api/projects/:id', async (c) => {
  const id = c.req.param('id');
  const payload = await buildProjectPayload(c.env, id, c.req.raw);
  if (!payload) return c.json({ error: 'Not found' }, 404);
  return c.json(payload);
});

app.get('/api/projects/:id/payload', async (c) => {
  const id = c.req.param('id');
  const payload = await buildProjectPayload(c.env, id, c.req.raw);
  if (!payload) return c.json({ error: 'Not found' }, 404);
  return c.json(payload);
});

app.get('/api/projects/:id/branches', async (c) => {
  const id = c.req.param('id');
  const project = await c.env.DB.prepare("SELECT id FROM projects WHERE id = ?").bind(id).first();
  if (!project) return c.json({ error: 'Not found' }, 404);

  const branches = await listProjectBranches(c.env, id);
  const activeBranch = await getProjectActiveBranch(c.env, id);
  const branchHeads = await getBranchHeads(c.env, id);

  return c.json({ activeBranch, branches, branchHeads });
});

app.post('/api/projects/:id/branches', async (c) => {
  const id = c.req.param('id');
  const { name, sourceBranch } = await c.req.json<{ name: string; sourceBranch?: string }>();
  const project = await c.env.DB.prepare("SELECT id FROM projects WHERE id = ?").bind(id).first();
  if (!project) return c.json({ error: 'Not found' }, 404);

  const baseBranch = sourceBranch
    ? sanitizeBranchName(sourceBranch)
    : await getProjectActiveBranch(c.env, id);
  const branchName = await ensureBranchExists(c.env, id, name, baseBranch);

  const branches = await listProjectBranches(c.env, id);
  return c.json({ success: true, branchName, sourceBranch: baseBranch, branches });
});

app.post('/api/projects/:id/branches/switch', async (c) => {
  const id = c.req.param('id');
  const { branchName } = await c.req.json<{ branchName: string }>();
  const project = await c.env.DB.prepare("SELECT id FROM projects WHERE id = ?").bind(id).first();
  if (!project) return c.json({ error: 'Not found' }, 404);

  const normalizedBranch = await ensureBranchExists(
    c.env,
    id,
    branchName,
    await getProjectActiveBranch(c.env, id),
  );
  await setProjectActiveBranch(c.env, id, normalizedBranch);

  const payload = await buildProjectPayload(c.env, id, new Request(`${c.req.url}?branch=${encodeURIComponent(normalizedBranch)}`));
  return c.json(payload);
});

app.post('/api/projects/:id/branches/merge', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ sourceBranch: string; targetBranch: string; message?: string }>();
  const project = await c.env.DB.prepare("SELECT id FROM projects WHERE id = ?").bind(id).first();
  if (!project) return c.json({ error: 'Not found' }, 404);

  const sourceBranch = sanitizeBranchName(body.sourceBranch);
  const targetBranch = sanitizeBranchName(body.targetBranch);
  if (sourceBranch === targetBranch) {
    return c.json({ error: 'Source and target branches must differ' }, 400);
  }

  await ensureBranchExists(c.env, id, sourceBranch, 'main');
  await ensureBranchExists(c.env, id, targetBranch, 'main');
  await cloneBranchArtifacts(c.env, id, sourceBranch, targetBranch, { overwrite: true });

  const nextCommitId = await getNextCommitId(c.env, id);
  const sourceHead = await getBranchHead(c.env, id, sourceBranch);
  const targetHead = await getBranchHead(c.env, id, targetBranch);
  const mergeMessage = body.message?.trim() || `merge: ${sourceBranch} into ${targetBranch}`;
  const commitRecord = createMergeCommitRecord({
    commitId: nextCommitId,
    targetBranch,
    targetHead,
    sourceHead,
    message: mergeMessage,
  });

  await storeBranchArtifact(c.env, id, targetBranch, null, `commits/${nextCommitId}.json`, commitRecord);
  await updateBranchHead(c.env, id, targetBranch, nextCommitId);
  await setProjectActiveBranch(c.env, id, targetBranch);

  await c.env.DB.prepare(
    "INSERT INTO event_logs (id, project_id, job_id, branch_name, message, level) VALUES (?, ?, ?, ?, ?, 'info')"
  ).bind(
    crypto.randomUUID(),
    id,
    null,
    targetBranch,
    `Merged ${sourceBranch} into ${targetBranch} with commit ${nextCommitId}.`,
  ).run();

  const payload = await buildProjectPayload(c.env, id, new Request(`${c.req.url}?branch=${encodeURIComponent(targetBranch)}`));
  return c.json(payload);
});

// --- Asset / Upload Routes ---

app.post('/api/projects/:projectId/assets', async (c) => {
  const projectId = c.req.param('projectId');
  const { name, type } = await c.req.json();

  const id = crypto.randomUUID();
  const storageKey = `projects/${projectId}/assets/${id}-${name}`;

  await c.env.DB.prepare(
    "INSERT INTO assets (id, project_id, name, type, storage_key) VALUES (?, ?, ?, ?, ?)"
  ).bind(id, projectId, name, type, storageKey).run();

  // Route uploads through the Worker so the frontend does not need R2 signing credentials.
  const origin = new URL(c.req.url).origin;
  const uploadUrl = `${origin}/api/assets/${id}/upload`;

  const asset = await c.env.DB.prepare("SELECT * FROM assets WHERE id = ?").bind(id).first();

  return c.json({ asset, uploadUrl });
});

app.put('/api/assets/:id/upload', async (c) => {
  const id = c.req.param('id');
  const asset = await c.env.DB.prepare(
    "SELECT id, storage_key FROM assets WHERE id = ?"
  ).bind(id).first<{ id: string; storage_key: string | null }>();

  if (!asset || !asset.storage_key) {
    return c.json({ error: 'Asset not found' }, 404);
  }

  const body = await c.req.raw.arrayBuffer();
  if (body.byteLength === 0) {
    return c.json({ error: 'Upload body is empty' }, 400);
  }

  const contentType = c.req.header('content-type') || 'application/octet-stream';
  await c.env.BUCKET.put(asset.storage_key, body, {
    httpMetadata: {
      contentType,
    },
  });

  return c.json({ success: true });
});

app.post('/api/assets/:id/uploaded', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare(
    "UPDATE assets SET status = 'uploaded' WHERE id = ?"
  ).bind(id).run();
  return c.json({ success: true });
});

app.get('/api/assets/:id/content', async (c) => {
  const id = c.req.param('id');
  const asset = await c.env.DB.prepare(
    "SELECT storage_key, type FROM assets WHERE id = ?"
  ).bind(id).first<{ storage_key: string | null; type: string | null }>();

  if (!asset?.storage_key) {
    return c.json({ error: 'Asset not found' }, 404);
  }

  const response = await buildObjectResponse(c.env, asset.storage_key, asset.type || 'application/octet-stream');
  if (!response) {
    return c.json({ error: 'Asset not found' }, 404);
  }

  return response;
});

app.get('/api/projects/:projectId/artifact', async (c) => {
  const projectId = c.req.param('projectId');
  const name = c.req.query('name');
  const branchName = await resolveSelectedBranch(c.env, projectId, c.req.raw);

  if (!name) {
    return c.json({ error: 'Artifact name is required' }, 400);
  }

  const artifact = await c.env.DB.prepare(
    "SELECT storage_key, content_type FROM artifacts WHERE project_id = ? AND branch_name = ? AND name = ?"
  ).bind(projectId, branchName, name).first<{ storage_key: string; content_type: string | null }>();

  if (!artifact?.storage_key) {
    return c.json({ error: 'Artifact not found' }, 404);
  }

  const response = await buildObjectResponse(c.env, artifact.storage_key, artifact.content_type || 'application/octet-stream');
  if (!response) {
    return c.json({ error: 'Artifact not found' }, 404);
  }

  return response;
});

app.get('/api/projects/:projectId/artifacts/:name', async (c) => {
  const projectId = c.req.param('projectId');
  const name = c.req.param('name');
  const branchName = await resolveSelectedBranch(c.env, projectId, c.req.raw);

  const artifact = await c.env.DB.prepare(
    "SELECT storage_key, content_type FROM artifacts WHERE project_id = ? AND branch_name = ? AND name = ?"
  ).bind(projectId, branchName, name).first<{ storage_key: string; content_type: string | null }>();

  if (!artifact?.storage_key) {
    return c.json({ error: 'Artifact not found' }, 404);
  }

  const response = await buildObjectResponse(c.env, artifact.storage_key, artifact.content_type || 'application/octet-stream');
  if (!response) {
    return c.json({ error: 'Artifact not found' }, 404);
  }

  return response;
});

// --- Job / Workflow Routes ---

app.post('/api/projects/:projectId/ingest', async (c) => {
  const projectId = c.req.param('projectId');
  const now = Math.floor(Date.now() / 1000);
  const body: { branchName?: string } = await c.req.json<{ branchName?: string }>().catch(() => ({} as { branchName?: string }));
  const branchName = await ensureBranchExists(
    c.env,
    projectId,
    body.branchName || await getProjectActiveBranch(c.env, projectId),
    await getProjectActiveBranch(c.env, projectId),
  );

  const assets = await c.env.DB.prepare(
    "SELECT id, name FROM assets WHERE project_id = ? ORDER BY created_at ASC"
  ).bind(projectId).all<QueueAssetPreview>();

  if (!assets.results.length) {
    return c.json({ error: 'No uploaded assets found for this project.' }, 400);
  }

  // Check D1 for any active or queued jobs for this project
  const existingJob = await c.env.DB.prepare(
    "SELECT id, status, workflow_id, branch_name FROM jobs WHERE project_id = ? AND status IN ('queued', 'running')"
  ).bind(projectId).first<ExistingJob>();

  if (existingJob) {
    const staleJobResolution = await recoverStaleJobIfNeeded(c.env, projectId, existingJob);
    if (!staleJobResolution.recovered) {
      return c.json(staleJobResolution.response, staleJobResolution.statusCode as 409);
    }
  }

  const jobId = crypto.randomUUID();
  const queuedAgents = createQueuedAgentStates(assets.results);
  const initialQueueMessage = assets.results.length === 1
    ? `Cloudflare queued ${assets.results[0].name} for Trem analysis.`
    : `Cloudflare queued ${assets.results.length} source files for the Trem agent pool.`;

  // Try to lock the project via DO
  const stub = getCoordinatorStub(c.env, projectId);
  const lockRes = await stub.fetch(new Request('http://do/lock', {
    method: 'POST',
    body: JSON.stringify({
      jobId,
      message: initialQueueMessage,
      agents: queuedAgents,
    })
  }));

  if (!lockRes.ok) {
    return c.json(await lockRes.json(), lockRes.status as any);
  }

  // Create Job in D1
  await c.env.DB.prepare(
    "INSERT INTO jobs (id, project_id, branch_name, status) VALUES (?, ?, ?, 'queued')"
  ).bind(jobId, projectId, branchName).run();

  await c.env.DB.prepare(
    "UPDATE projects SET status = 'queued', active_branch = ?, updated_at = ? WHERE id = ?"
  ).bind(branchName, now, projectId).run();

  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO event_logs (id, project_id, job_id, branch_name, message, level) VALUES (?, ?, ?, ?, ?, 'info')"
    ).bind(crypto.randomUUID(), projectId, jobId, branchName, 'Backend accepted the ingest request.'),
    c.env.DB.prepare(
      "INSERT INTO event_logs (id, project_id, job_id, branch_name, message, level) VALUES (?, ?, ?, ?, ?, 'info')"
    ).bind(crypto.randomUUID(), projectId, jobId, branchName, initialQueueMessage),
    c.env.DB.prepare(
      "INSERT INTO event_logs (id, project_id, job_id, branch_name, message, level) VALUES (?, ?, ?, ?, ?, 'info')"
    ).bind(crypto.randomUUID(), projectId, jobId, branchName, 'Polling Cloudflare workflow steps every second until the first worker update lands.'),
  ]);

  // Start Workflow
  const instance = await c.env.INGESTION_WORKFLOW.create({
    params: { projectId, jobId, branchName }
  });

  await c.env.DB.prepare(
    "UPDATE jobs SET workflow_id = ? WHERE id = ?"
  ).bind(instance.id, jobId).run();

  await stub.fetch(new Request('http://do/progress', {
    method: 'POST',
    body: JSON.stringify({
      progress: 1,
      jobStatus: 'queued',
      message: `Cloudflare workflow ${instance.id.slice(0, 8)} is live and waiting for the first step.`,
      agents: queuedAgents,
    }),
  }));

  await c.env.DB.prepare(
    "INSERT INTO event_logs (id, project_id, job_id, branch_name, message, level) VALUES (?, ?, ?, ?, ?, 'info')"
  ).bind(
    crypto.randomUUID(),
    projectId,
    jobId,
    branchName,
    `Cloudflare workflow instance ${instance.id.slice(0, 8)} created successfully.`
  ).run();

  return c.json({ jobId, workflowId: instance.id, branchName });
});

// --- WebSocket for Live Updates ---
app.get('/api/projects/:projectId/ws', async (c) => {
  const projectId = c.req.param('projectId');
  const doId = c.env.PROJECT_COORDINATOR.idFromName(projectId);
  const stub = c.env.PROJECT_COORDINATOR.get(doId);

  // Pass the WebSocket request to the Durable Object
  return stub.fetch(c.req.raw);
});


// --- Agent Planning Routes ---

app.post('/api/projects/:projectId/plan', async (c) => {
  const projectId = c.req.param('projectId');
  const body = await c.req.json();
  const prompt = body.prompt;

  if (!prompt) {
    return c.json({ error: 'Prompt is required' }, 400);
  }

  const db = c.env.DB;
  const jobId = crypto.randomUUID();
  const planId = crypto.randomUUID();

  // Create Job Record
  await db.prepare(
    `INSERT INTO jobs (id, project_id, status) VALUES (?, ?, 'queued')`
  ).bind(jobId, projectId).run();

  // Create Plan Record
  await db.prepare(
    `INSERT INTO agent_plans (id, project_id, job_id, prompt, status) VALUES (?, ?, ?, ?, 'planning')`
  ).bind(planId, projectId, jobId, prompt).run();

  // Trigger Workflow
  if (c.env.PLAN_WORKFLOW) {
      await c.env.PLAN_WORKFLOW.create({
        id: jobId,
        params: { projectId, jobId, planId, prompt, branchName: body.branchName || 'main' }
      });
  }

  return c.json({ jobId, planId, status: 'planning' });
});

app.get('/api/projects/:projectId/plans/:planId', async (c) => {
  const planId = c.req.param('planId');
  const db = c.env.DB;

  const plan = await db.prepare(`SELECT * FROM agent_plans WHERE id = ?`).bind(planId).first();
  if (!plan) return c.json({ error: 'Plan not found' }, 404);

  // Parse JSON fields
  return c.json({
      ...plan,
      strategy: plan.strategy_json ? JSON.parse(plan.strategy_json) : null,
      agents: plan.agents_json ? JSON.parse(plan.agents_json) : null,
      workflow: plan.workflow_json ? JSON.parse(plan.workflow_json) : null,
      otioDraft: plan.otio_json ? JSON.parse(plan.otio_json) : null,
  });
});

// --- End Agent Planning Routes ---

export default app;
