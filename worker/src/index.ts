import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { AwsClient } from 'aws4fetch';

export { ProjectCoordinatorDO } from './durable-objects/project-coordinator';
export { IngestionWorkflow } from './workflows/ingestion-workflow';

type Env = {
  DB: D1Database;
  BUCKET: R2Bucket;
  PROJECT_COORDINATOR: DurableObjectNamespace;
  INGESTION_WORKFLOW: any; // Workflow API

  // R2 Credentials for AWS SDK (v4 signing)
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_ACCOUNT_ID: string;
  R2_BUCKET_NAME: string;
};

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());

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

app.get('/api/projects/:id', async (c) => {
  const id = c.req.param('id');
  const project = await c.env.DB.prepare("SELECT * FROM projects WHERE id = ?").bind(id).first();

  if (!project) return c.json({ error: 'Not found' }, 404);

  const assets = await c.env.DB.prepare("SELECT * FROM assets WHERE project_id = ?").bind(id).all();
  const jobs = await c.env.DB.prepare("SELECT * FROM jobs WHERE project_id = ? ORDER BY created_at DESC LIMIT 1").bind(id).all();
  const logs = await c.env.DB.prepare("SELECT * FROM event_logs WHERE project_id = ? ORDER BY created_at DESC LIMIT 50").bind(id).all();

  // Get live status from DO
  const doId = c.env.PROJECT_COORDINATOR.idFromName(id);
  const stub = c.env.PROJECT_COORDINATOR.get(doId);
  const doStatusRes = await stub.fetch(new Request('http://do/status'));
  const doStatus = await doStatusRes.json() as any;

  return c.json({
    project,
    assets: assets.results,
    activeJob: jobs.results[0] || null,
    logs: logs.results,
    liveProgress: doStatus.progress
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

  // Generate R2 presigned URL for upload via aws4fetch
  const aws = new AwsClient({
      accessKeyId: c.env.R2_ACCESS_KEY_ID || 'mock',
      secretAccessKey: c.env.R2_SECRET_ACCESS_KEY || 'mock',
      service: 's3',
      region: 'auto',
  });

  const url = new URL(`https://${c.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${c.env.R2_BUCKET_NAME || 'trem-ai-assets'}/${storageKey}`);
  url.searchParams.set('X-Amz-Expires', '3600'); // 1 hour

  const signedRequest = await aws.sign(url, {
      method: 'PUT',
      aws: { signQuery: true }
  });

  const uploadUrl = signedRequest.url;

  const asset = await c.env.DB.prepare("SELECT * FROM assets WHERE id = ?").bind(id).first();

  return c.json({ asset, uploadUrl });
});

app.post('/api/assets/:id/uploaded', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare(
    "UPDATE assets SET status = 'uploaded' WHERE id = ?"
  ).bind(id).run();
  return c.json({ success: true });
});

// --- Job / Workflow Routes ---

app.post('/api/projects/:projectId/ingest', async (c) => {
  const projectId = c.req.param('projectId');

  const jobId = crypto.randomUUID();

  // Try to lock the project via DO
  const doId = c.env.PROJECT_COORDINATOR.idFromName(projectId);
  const stub = c.env.PROJECT_COORDINATOR.get(doId);
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
