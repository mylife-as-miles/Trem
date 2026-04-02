import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { GoogleGenAI } from '@google/genai';
import { buildBranchArtifactStorageKey } from '../db/branching';


type PlanParams = {
  projectId: string;
  jobId: string;
  planId: string;
  prompt: string;
  branchName?: string;
};

export class PlanWorkflow extends WorkflowEntrypoint<Env, PlanParams> {
  async run(event: WorkflowEvent<PlanParams>, step: WorkflowStep) {
    const { projectId, jobId, planId, prompt, branchName = 'main' } = event.payload;

    try {
      // 1. Fetch Context (Repo structure, scenes)
      const context = await step.do('Fetch Context', async (): Promise<any> => {
        // Fetch repo.json and scenes.json from R2
        const repoKey = buildBranchArtifactStorageKey(projectId, branchName, 'repo.json');
        const scenesKey = buildBranchArtifactStorageKey(projectId, branchName, 'scenes.json');

        const repoObj = await this.env.BUCKET.get(repoKey);
        const scenesObj = await this.env.BUCKET.get(scenesKey);

        const repoData = repoObj ? await repoObj.json() : null;
        const scenesData = scenesObj ? await scenesObj.json() : null;

        return { repoData, scenesData };
      });

      // 2. Generate Strategy & Select Agents (Simulate LLM Call if no key)
      const agentPlan = await step.do('Generate Plan', async (): Promise<any> => {
        let strategy, agents, workflow, otioDraft;

        if (this.env.GEMINI_API_KEY) {
           // Real LLM Integration logic would go here
           // We'll create a structured prompt using context.repoData and context.scenesData
           strategy = [
             { icon: 'bolt', title: 'AI Driven Pacing', details: `Prompt: ${prompt}` },
             { icon: 'graphic_eq', title: 'Audio Analysis Complete', details: 'Detected key moments' }
           ];
           agents = [
             { id: 'video_cutter', name: 'Video Cutter', role: 'cpu_edit_worker_01', type: 'cpu' },
             { id: 'creative_director', name: 'Creative Director', role: 'llm_light_v4', type: 'llm' }
           ];
           workflow = {
              nodes: ['video_cutter', 'creative_director'],
              edges: [['video_cutter', 'creative_director']]
           };
           otioDraft = { OTIO_SCHEMA: "OpenTimelineIO.v1", tracks: [] };

        } else {
            // Fallback for local dev without API key
            await new Promise(r => setTimeout(r, 2000)); // Simulate work
            strategy = [
                { icon: 'bolt', title: 'Establish pace with high-energy sprint', details: "Selection: Clips tagged 'running', 'sprinting' > 0.8" },
                { icon: 'graphic_eq', title: 'Sync brand reveal to audio drop at 00:15', details: 'Timing: Frame precise cut at beat index 42' },
                { icon: 'filter_vintage', title: "Apply 'Urban Night' color grade", details: 'Look: High contrast, cool shadows, neon highlights' },
            ];
            agents = [
                { id: 'video_cutter', title: 'Video Cutter', role: 'cpu_edit_worker_01', color: 'border-primary', icon: 'memory' },
                { id: 'creative_director', title: 'Creative Director', role: 'llm_light_v4', color: 'border-emerald-500/50', icon: 'lightbulb' },
                { id: 'colorist', title: 'Colorist', role: 'gpu_grade_node', color: 'border-emerald-500/30', icon: 'palette' },
                { id: 'audio_engineer', title: 'Audio Engineer', role: 'audio_sync_bot', color: 'border-emerald-500/30', icon: 'volume_up' }
            ];
            workflow = {
                nodes: agents.map(a => a.id),
                edges: []
            };
            otioDraft = {
              "OTIO_SCHEMA": "OpenTimelineIO.v1",
              "tracks": [
                {
                  "name": "Video Track 1",
                  "kind": "Video",
                  "children": [
                    {
                      "name": "Generated_Clip_1",
                      "source_range": { "start_time": "00:00:00:00", "duration": "00:00:05:00" },
                      "effects": []
                    }
                  ]
                }
              ]
            };
        }

        return { strategy, agents, workflow, otioDraft };
      });

      // 3. Save Plan to D1
      await step.do('Save Plan', async (): Promise<any> => {
         await this.env.DB.prepare(
          `UPDATE agent_plans
           SET status = 'ready',
               strategy_json = ?,
               agents_json = ?,
               workflow_json = ?,
               otio_json = ?,
               updated_at = (unixepoch())
           WHERE id = ?`
        ).bind(
            JSON.stringify(agentPlan.strategy),
            JSON.stringify(agentPlan.agents),
            JSON.stringify(agentPlan.workflow),
            JSON.stringify(agentPlan.otioDraft),
            planId
        ).run();

        // Update Job Status
        await this.env.DB.prepare(
            `UPDATE jobs SET status = 'completed', progress = 100 WHERE id = ?`
        ).bind(jobId).run();
      });

      // 4. Notify UI via Durable Object (Optional but good for real-time)
      await step.do('Notify UI', async (): Promise<any> => {
        const doId = this.env.PROJECT_COORDINATOR.idFromName(projectId);
        const coordinator = this.env.PROJECT_COORDINATOR.get(doId);
        await coordinator.fetch(`http://internal/broadcast`, {
            method: 'POST',
            body: JSON.stringify({
                type: 'PLAN_GENERATED',
                payload: { planId, jobId }
            })
        });
      });

    } catch (e: any) {
        // Handle Error
        await step.do('Handle Error', async (): Promise<any> => {
           await this.env.DB.prepare(`UPDATE agent_plans SET status = 'failed' WHERE id = ?`).bind(planId).run();
           await this.env.DB.prepare(`UPDATE jobs SET status = 'failed', error = ? WHERE id = ?`).bind(e.message, jobId).run();
        });
        throw e;
    }
  }
}
