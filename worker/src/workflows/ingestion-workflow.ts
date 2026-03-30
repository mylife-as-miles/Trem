import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';

type Env = {
  DB: D1Database;
  BUCKET: R2Bucket;
  PROJECT_COORDINATOR: DurableObjectNamespace;
};

type IngestionParams = {
  projectId: string;
  jobId: string;
};

export class IngestionWorkflow extends WorkflowEntrypoint<Env, IngestionParams> {
  async run(event: WorkflowEvent<IngestionParams>, step: WorkflowStep) {
    const { projectId, jobId } = event.payload;

    // Helper to log and update progress
    const logProgress = async (msg: string, progress: number) => {
      await step.do(`log-${progress}`, async () => {
        // Log to D1
        await this.env.DB.prepare(
          "INSERT INTO event_logs (id, project_id, message) VALUES (?, ?, ?)"
        ).bind(crypto.randomUUID(), projectId, msg).run();

        // Update Job progress in D1
        await this.env.DB.prepare(
          "UPDATE jobs SET progress = ? WHERE id = ?"
        ).bind(progress, jobId).run();

        // Update Durable Object
        const doId = this.env.PROJECT_COORDINATOR.idFromName(projectId);
        const stub = this.env.PROJECT_COORDINATOR.get(doId);
        await stub.fetch(new Request('http://do/progress', {
          method: 'POST',
          body: JSON.stringify({ progress, message: msg })
        }));
      });
    };

    try {
      // Step 1: Prepare Assets
      const assetsToProcess = await step.do('prepare_assets', async () => {
        await logProgress("Preparing assets for ingestion...", 10);

        await this.env.DB.prepare(
          "UPDATE projects SET status = 'ingesting' WHERE id = ?"
        ).bind(projectId).run();

        const assetsRes = await this.env.DB.prepare(
          "SELECT * FROM assets WHERE project_id = ? AND status IN ('uploaded', 'pending')"
        ).bind(projectId).all();

        for (const asset of assetsRes.results) {
          await this.env.DB.prepare(
            "UPDATE assets SET status = 'processing' WHERE id = ?"
          ).bind(asset.id).run();
        }

        return assetsRes.results;
      });

      // Step 2: Parallel Analyze & Transcribe (Mocked for now)
      await step.do('process_assets', async () => {
        await logProgress(`Processing ${assetsToProcess.length} assets...`, 30);

        // In a real implementation, we would iterate and call Replicate/Gemini here.
        // For now, we update them to 'ready'
        for (const asset of assetsToProcess) {
          await this.env.DB.prepare(
            "UPDATE assets SET status = 'ready', metadata = ? WHERE id = ?"
          ).bind(JSON.stringify({ tags: ['auto-tagged'], description: 'Processed by workflow' }), asset.id).run();
        }
      });

      // Step 3: Repo Synthesis
      await step.do('repo_synthesis', async () => {
        await logProgress("Synthesizing repository structure...", 80);
        // Call Gemini Thinking here to synthesize the repo based on all asset metadata
        // Mocking for now
      });

      // Step 4: Finalize
      await step.do('finalize', async () => {
        await logProgress("Ingestion complete. Ready for commit.", 100);

        await this.env.DB.prepare(
          "UPDATE projects SET status = 'ready_to_commit' WHERE id = ?"
        ).bind(projectId).run();

        await this.env.DB.prepare(
          "UPDATE jobs SET status = 'completed', progress = 100, completed_at = ? WHERE id = ?"
        ).bind(Date.now(), jobId).run();

        const doId = this.env.PROJECT_COORDINATOR.idFromName(projectId);
        const stub = this.env.PROJECT_COORDINATOR.get(doId);
        await stub.fetch(new Request('http://do/unlock', { method: 'POST' }));
      });

    } catch (e: any) {
      await step.do('handle_error', async () => {
        await this.env.DB.prepare(
          "INSERT INTO event_logs (id, project_id, message, level) VALUES (?, ?, ?, 'error')"
        ).bind(crypto.randomUUID(), projectId, `Workflow failed: ${e.message}`).run();

        await this.env.DB.prepare(
          "UPDATE projects SET status = 'failed' WHERE id = ?"
        ).bind(projectId).run();

        await this.env.DB.prepare(
          "UPDATE jobs SET status = 'failed' WHERE id = ?"
        ).bind(jobId).run();

        const doId = this.env.PROJECT_COORDINATOR.idFromName(projectId);
        const stub = this.env.PROJECT_COORDINATOR.get(doId);
        await stub.fetch(new Request('http://do/unlock', { method: 'POST' }));
      });
      throw e;
    }
  }
}
