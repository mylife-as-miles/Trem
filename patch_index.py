import re

with open('/app/worker/src/index.ts', 'r') as f:
    content = f.read()

new_routes = """
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
"""

# Insert before the last export default app;
content = content.replace('export default app;', new_routes + '\nexport default app;')

with open('/app/worker/src/index.ts', 'w') as f:
    f.write(content)
