import { Hono } from 'hono';
import { cors } from 'hono/cors';

export { ProjectCoordinatorDO } from './durable-objects/project-coordinator';
export { IngestionWorkflow } from './workflows/ingestion-workflow';

type Env = {
  DB: D1Database;
  BUCKET: R2Bucket;
  PROJECT_COORDINATOR: DurableObjectNamespace;
  INGESTION_WORKFLOW: any; // Workflow API
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
};

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());

const ACTIVE_WORKFLOW_STATUSES = new Set<WorkflowInstanceStatus>(['queued', 'running', 'paused', 'waiting']);
const ACTIVE_COORDINATOR_STATUSES = new Set(['queued', 'running', 'transcribing', 'analyzing']);

const getCoordinatorStub = (env: Env, projectId: string) => {
  const doId = env.PROJECT_COORDINATOR.idFromName(projectId);
  return env.PROJECT_COORDINATOR.get(doId);
};

const resetCoordinator = async (
  env: Env,
  projectId: string,
  jobStatus: string = 'idle',
  progress: number = 0,
) => {
  const stub = getCoordinatorStub(env, projectId);
  await stub.fetch(
    new Request('http://do/reset', {
      method: 'POST',
      body: JSON.stringify({ jobStatus, progress }),
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
    await resetCoordinator(env, projectId, 'completed', 100);

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
  await resetCoordinator(env, projectId, 'idle', 0);

  return {
    recovered: true,
    response: null,
    statusCode: 200,
  };
};

// --- Project Routes ---

app.post('/api/projects', async (c) => {
  const { name, brief } = await c.req.json();
  const id = crypto.randomUUID();

  await c.env.DB.prepare(
    "INSERT INTO projects (id, name, brief) VALUES (?, ?, ?)"
  ).bind(id, name, brief || '').run();

  const project = await c.env.DB.prepare("SELECT * FROM projects WHERE id = ?").bind(id).first();
  return c.json(project);
});

app.get('/api/projects', async (c) => {
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
    c.env.DB.prepare("DELETE FROM projects WHERE id = ?").bind(id),
  ]);

  await resetCoordinator(c.env, id);

  return c.json({ success: true });
});


app.get('/api/projects/:id', async (c) => {
  const id = c.req.param('id');
  const project = await c.env.DB.prepare("SELECT * FROM projects WHERE id = ?").bind(id).first();

  if (!project) return c.json({ error: 'Not found' }, 404);

  const assets = await c.env.DB.prepare("SELECT * FROM assets WHERE project_id = ?").bind(id).all();
  const jobs = await c.env.DB.prepare("SELECT * FROM jobs WHERE project_id = ? ORDER BY created_at DESC LIMIT 1").bind(id).all();
  const logs = await c.env.DB.prepare("SELECT * FROM event_logs WHERE project_id = ? ORDER BY created_at DESC LIMIT 50").bind(id).all();

  // Get live status from DO
  const doStatus = await getCoordinatorStatus(c.env, id);

  return c.json({
    project,
    assets: assets.results,
    activeJob: jobs.results[0] || null,
    logs: logs.results,
    liveProgress: doStatus.progress,
    liveStatus: doStatus.jobStatus,
    liveAgents: doStatus.agents || []
  });
});

app.get('/api/projects/:id/payload', async (c) => {
  const id = c.req.param('id');
  const project = await c.env.DB.prepare("SELECT * FROM projects WHERE id = ?").bind(id).first();

  if (!project) return c.json({ error: 'Not found' }, 404);

  const assets = await c.env.DB.prepare("SELECT * FROM assets WHERE project_id = ?").bind(id).all();
  const jobs = await c.env.DB.prepare("SELECT * FROM jobs WHERE project_id = ? ORDER BY created_at DESC LIMIT 1").bind(id).all();
  const logs = await c.env.DB.prepare("SELECT * FROM event_logs WHERE project_id = ? ORDER BY created_at ASC").bind(id).all();
  const artifacts = await c.env.DB.prepare("SELECT name, size FROM artifacts WHERE project_id = ?").bind(id).all();

  // Get live status from DO
  const doStatus = await getCoordinatorStatus(c.env, id);

  return c.json({
    project,
    assets: assets.results,
    activeJob: jobs.results[0] || null,
    artifacts: artifacts.results,
    logs: logs.results,
    liveProgress: doStatus.progress,
    liveStatus: doStatus.jobStatus,
    liveAgents: doStatus.agents || []
  });
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

app.get('/api/projects/:projectId/artifacts/:name', async (c) => {
  const projectId = c.req.param('projectId');
  const name = c.req.param('name');
  
  const storageKey = `projects/${projectId}/artifacts/${name}`;
  const object = await c.env.BUCKET.get(storageKey);

  if (!object) {
    return c.json({ error: 'Artifact not found' }, 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);

  return new Response(object.body, { headers });
});

// --- Job / Workflow Routes ---

app.post('/api/projects/:projectId/ingest', async (c) => {
  const projectId = c.req.param('projectId');

  // Check D1 for any active or queued jobs for this project
  const existingJob = await c.env.DB.prepare(
    "SELECT id, status, workflow_id FROM jobs WHERE project_id = ? AND status IN ('queued', 'running')"
  ).bind(projectId).first<ExistingJob>();

  if (existingJob) {
    const staleJobResolution = await recoverStaleJobIfNeeded(c.env, projectId, existingJob);
    if (!staleJobResolution.recovered) {
      return c.json(staleJobResolution.response, staleJobResolution.statusCode as 409);
    }
  }

  const jobId = crypto.randomUUID();

  // Try to lock the project via DO
  const stub = getCoordinatorStub(c.env, projectId);
  const lockRes = await stub.fetch(new Request('http://do/lock', {
    method: 'POST',
    body: JSON.stringify({ jobId })
  }));

  if (!lockRes.ok) {
    return c.json(await lockRes.json(), lockRes.status as any);
  }

  // Create Job in D1
  await c.env.DB.prepare(
    "INSERT INTO jobs (id, project_id, status) VALUES (?, ?, 'queued')"
  ).bind(jobId, projectId).run();

  // Start Workflow
  const instance = await c.env.INGESTION_WORKFLOW.create({
    params: { projectId, jobId }
  });

  await c.env.DB.prepare(
    "UPDATE jobs SET workflow_id = ? WHERE id = ?"
  ).bind(instance.id, jobId).run();

  return c.json({ jobId, workflowId: instance.id });
});

// --- WebSocket for Live Updates ---
app.get('/api/projects/:projectId/ws', async (c) => {
  const projectId = c.req.param('projectId');
  const doId = c.env.PROJECT_COORDINATOR.idFromName(projectId);
  const stub = c.env.PROJECT_COORDINATOR.get(doId);

  // Pass the WebSocket request to the Durable Object
  return stub.fetch(c.req.raw);
});

export default app;
