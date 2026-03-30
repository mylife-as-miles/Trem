// @ts-ignore
import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';

type Env = {
  DB: D1Database;
  BUCKET: R2Bucket;
  PROJECT_COORDINATOR: DurableObjectNamespace;
  GEMINI_API_KEY: string;
  REPLICATE_API_TOKEN: string;
};

type IngestionParams = {
  projectId: string;
  jobId: string;
};

export class IngestionWorkflow extends WorkflowEntrypoint<Env, IngestionParams> {
  async run(event: WorkflowEvent<IngestionParams>, step: WorkflowStep) {
    const { projectId, jobId } = event.payload;

    const logProgress = async (msg: string, progress: number) => {
      await step.do(`log-${progress}`, async () => {
        await this.env.DB.prepare(
          "INSERT INTO event_logs (id, project_id, message) VALUES (?, ?, ?)"
        ).bind(crypto.randomUUID(), projectId, msg).run();

        await this.env.DB.prepare(
          "UPDATE jobs SET progress = ? WHERE id = ?"
        ).bind(progress, jobId).run();

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

        return assetsRes.results as any[];
      });

      // Step 2: Parallel Analyze & Transcribe
      await step.do('process_assets', async () => {
        await logProgress(`Processing ${assetsToProcess.length} assets...`, 30);

        for (const asset of assetsToProcess) {
           let description = "Auto-processed";
           let tags = ["auto-tagged"];
           let transcript = "";

           try {
             if (!asset.storage_key) throw new Error("Missing storage key");

             // In a real implementation we would:
             // 1. Fetch from R2 using `this.env.BUCKET.get(asset.storage_key)`
             // 2. Convert to base64
             // 3. Call Replicate Whisper
             if (this.env.REPLICATE_API_TOKEN) {
               // mock Whisper for workflow
               transcript = `1\n00:00:00,000 --> 00:00:05,000\n[Real workflow would transcribe ${asset.name} here]\n`;
             }

             // 4. Call Gemini Flash
             if (this.env.GEMINI_API_KEY) {
                 const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.env.GEMINI_API_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                       contents: [{ parts: [{ text: `Generate a short description and 3 comma-separated tags for a video named: ${asset.name}. Output format: JSON { "description": "...", "tags": ["..."] }` }] }]
                    })
                 });
                 if (response.ok) {
                     const data = await response.json() as any;
                     try {
                        const text = data.candidates[0].content.parts[0].text;
                        const match = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\{[\s\S]*\}/);
                        if (match) {
                            const parsed = JSON.parse(match[1] || match[0]);
                            description = parsed.description || description;
                            tags = parsed.tags || tags;
                        }
                     } catch(e) {}
                 }
             }
           } catch (e) {
              console.error(`Asset processing failed for ${asset.id}`, e);
           }

           await this.env.DB.prepare(
            "UPDATE assets SET status = 'ready', metadata = ? WHERE id = ?"
          ).bind(JSON.stringify({ tags, description, srt: transcript }), asset.id).run();
        }
      });

      // Step 3: Repo Synthesis
      await step.do('repo_synthesis', async () => {
        await logProgress("Synthesizing repository structure...", 80);
        // Call Gemini Thinking here to synthesize the repo based on all asset metadata
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
