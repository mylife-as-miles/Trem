// @ts-ignore
import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import mime from 'mime';

type Env = {
  DB: D1Database;
  BUCKET: R2Bucket;
  PROJECT_COORDINATOR: DurableObjectNamespace;
  GEMINI_API_KEY?: string;
  REPLICATE_API_TOKEN?: string;
};

type IngestionParams = {
  projectId: string;
  jobId: string;
};

type AssetRow = {
  id: string;
  name: string;
  type: string;
  status: string;
  storage_key: string | null;
  metadata: string | null;
  size: number | null;
  duration?: number;
};

type AssetMetadata = {
  description: string;
  tags: string[];
  transcript?: string;
  srt?: string;
  mimeType?: string;
  size?: number;
  storageKey?: string | null;
  error?: string;
};

type TranscriptionResult = {
  text: string;
  srt: string;
};

const REPLICATE_WHISPER_VERSION = '8099696689d249cf8b122d833c36ac3f75505c666a395ca40ef26f68e7d3d16e';
const MAX_TRANSCRIBE_BYTES = 25 * 1024 * 1024; // 25MB for Replicate
const MAX_INGEST_AGENTS = 4;

type AgentState = {
  slot: number;
  status: 'idle' | 'queued' | 'transcribing' | 'analyzing' | 'completed' | 'error';
  assetId: string | null;
  assetName: string | null;
  completedCount: number;
};

const createAgentStates = (activeAssetCount: number): AgentState[] =>
  Array.from({ length: MAX_INGEST_AGENTS }, (_, index) => ({
    slot: index + 1,
    status: index < activeAssetCount ? 'queued' : 'idle',
    assetId: null,
    assetName: null,
    completedCount: 0,
  }));

export class IngestionWorkflow extends WorkflowEntrypoint<Env, IngestionParams> {
  async run(event: WorkflowEvent<IngestionParams>, step: WorkflowStep) {
    const { projectId, jobId } = event.payload;
    console.log(`[IngestionWorkflow] Starting run for project: ${projectId}, job: ${jobId}`);
    
    // Check if DB is bound
    if (!this.env.DB) {
      console.error(`[IngestionWorkflow] DB binding NOT FOUND!`);
    } else {
      console.log(`[IngestionWorkflow] DB binding exists.`);
    }


    const insertEventLog = async (message: string, level: 'info' | 'warn' | 'error' = 'info') => {
      await this.env.DB.prepare(
        "INSERT INTO event_logs (id, project_id, job_id, message, level) VALUES (?, ?, ?, ?, ?)"
      ).bind(crypto.randomUUID(), projectId, jobId, message, level).run();
    };

    const updateCoordinator = async (
      progress: number,
      message: string,
      jobStatus?: string,
      agents?: AgentState[],
    ) => {
      const doId = this.env.PROJECT_COORDINATOR.idFromName(projectId);
      const stub = this.env.PROJECT_COORDINATOR.get(doId);
      await stub.fetch(new Request('http://do/progress', {
        method: 'POST',
        body: JSON.stringify({ progress, message, jobStatus, agents })
      }));
    };

    const updateJobStatus = async (status: string, progress: number) => {
      await this.env.DB.prepare(
        "UPDATE jobs SET status = ?, progress = ? WHERE id = ?"
      ).bind(status, progress, jobId).run();
    };

    const logProgress = async (message: string, progress: number, status: string, level: 'info' | 'warn' | 'error' = 'info') => {
      await insertEventLog(message, level);
      await updateJobStatus(status, progress);
      await updateCoordinator(progress, message, status);
    };

    try {
      // ============================================================
      // Step 1: PREPARE ASSETS
      // ============================================================
      const assetsToProcess = await step.do('prepare_assets', async () => {
        await logProgress('Preparing assets for ingestion...', 5, 'running');

        await this.env.DB.prepare(
          "UPDATE projects SET status = 'ingesting', updated_at = ? WHERE id = ?"
        ).bind(Math.floor(Date.now() / 1000), projectId).run();

        const assetsRes = await this.env.DB.prepare(
          "SELECT * FROM assets WHERE project_id = ? AND status IN ('uploaded', 'pending')"
        ).bind(projectId).all<AssetRow>();

        if (assetsRes.results.length === 0) {
          throw new Error('No assets available for ingestion');
        }

        for (const asset of assetsRes.results) {
          await this.env.DB.prepare(
            "UPDATE assets SET status = 'processing' WHERE id = ?"
          ).bind(asset.id).run();
        }

        await insertEventLog(`Found ${assetsRes.results.length} asset(s) to process`);
        await updateCoordinator(
          5,
          `Prepared ${assetsRes.results.length} asset(s) for the 4-agent pool`,
          'running',
          createAgentStates(Math.min(assetsRes.results.length, MAX_INGEST_AGENTS)),
        );
        return assetsRes.results;
      });

      // ============================================================
      // Step 2: PROCESS ASSETS (transcription + analysis)
      // ============================================================
      const processedAssets = await step.do('process_assets', async () => {
        await logProgress(`Processing ${assetsToProcess.length} assets...`, 15, 'running');

        const results: Array<{ id: string; name: string; type: string; metadata: AssetMetadata } | null> =
          Array.from({ length: assetsToProcess.length }, () => null);
        const agentStates = createAgentStates(Math.min(assetsToProcess.length, MAX_INGEST_AGENTS));
        const workerCount = Math.min(MAX_INGEST_AGENTS, assetsToProcess.length);
        let nextAssetIndex = 0;
        let completedAssets = 0;

        const computeProgress = () =>
          15 + Math.floor((completedAssets / Math.max(assetsToProcess.length, 1)) * 45);

        const syncAgents = async (message: string, status = 'running') => {
          await updateCoordinator(computeProgress(), message, status, agentStates);
        };

        const runAgent = async (agentIndex: number) => {
          const agent = agentStates[agentIndex];

          while (true) {
            const assetIndex = nextAssetIndex;
            nextAssetIndex += 1;

            if (assetIndex >= assetsToProcess.length) {
              agent.status = 'idle';
              agent.assetId = null;
              agent.assetName = null;
              await syncAgents(`Agent ${agent.slot} is idle`);
              return;
            }

            const asset = assetsToProcess[assetIndex];
            agent.assetId = asset.id;
            agent.assetName = asset.name;
            agent.status = 'queued';

            await insertEventLog(`Agent ${agent.slot} picked up ${asset.name}`);
            await syncAgents(`Agent ${agent.slot} picked up ${asset.name}`);

            try {
              if (!asset.storage_key) {
                throw new Error('Missing storage key');
              }

              const object = await this.env.BUCKET.get(asset.storage_key);
              if (!object) {
                throw new Error(`Asset not found in R2: ${asset.storage_key}`);
              }

              const mimeType = object.httpMetadata?.contentType || (mime.getType(asset.name) || 'application/octet-stream');
              const size = object.size;
              const fileBuffer = await object.arrayBuffer();

              let transcript: TranscriptionResult | null = null;
              if (this.env.REPLICATE_API_TOKEN && shouldTranscribe(mimeType, size)) {
                agent.status = 'transcribing';
                await insertEventLog(`Agent ${agent.slot} transcribing ${asset.name}...`);
                await updateJobStatus('transcribing', computeProgress());
                await updateCoordinator(
                  computeProgress(),
                  `Agent ${agent.slot} transcribing ${asset.name}...`,
                  'transcribing',
                  agentStates,
                );

                await this.env.DB.prepare(
                  "UPDATE assets SET status = 'transcribing' WHERE id = ?"
                ).bind(asset.id).run();

                transcript = await transcribeWithReplicate(
                  fileBuffer,
                  mimeType,
                  this.env.REPLICATE_API_TOKEN
                );

                if (transcript) {
                  const srtKey = `projects/${projectId}/transcripts/${asset.id}.srt`;
                  const jsonKey = `projects/${projectId}/transcripts/${asset.id}.json`;

                  await this.env.BUCKET.put(srtKey, transcript.srt, {
                    httpMetadata: { contentType: 'text/plain' }
                  });
                  await this.env.BUCKET.put(jsonKey, JSON.stringify(transcript), {
                    httpMetadata: { contentType: 'application/json' }
                  });

                  await insertEventLog(`Agent ${agent.slot} completed transcription for ${asset.name}`);
                }
              }

              agent.status = 'analyzing';
              await insertEventLog(`Agent ${agent.slot} analyzing ${asset.name}...`);
              await updateJobStatus('analyzing', computeProgress());
              await updateCoordinator(
                computeProgress(),
                `Agent ${agent.slot} analyzing ${asset.name}...`,
                'analyzing',
                agentStates,
              );

              await this.env.DB.prepare(
                "UPDATE assets SET status = 'analyzing' WHERE id = ?"
              ).bind(asset.id).run();

              await insertEventLog(`Agent ${agent.slot} applying Trem asset-tagging prompt to ${asset.name}`);
              const analysis = this.env.GEMINI_API_KEY
                ? await analyzeAssetWithGemini({
                    apiKey: this.env.GEMINI_API_KEY,
                    assetName: asset.name,
                    assetType: asset.type,
                    mimeType,
                    size,
                    transcript: transcript?.text || '',
                  })
                : {
                    description: `Uploaded ${asset.type} asset: ${asset.name}`,
                    tags: buildFallbackTags(asset.name, asset.type, mimeType),
                  };

              const metadata: AssetMetadata = {
                ...analysis,
                transcript: transcript?.text || undefined,
                srt: transcript?.srt || undefined,
                mimeType,
                size,
                storageKey: asset.storage_key,
              };

              await this.env.DB.prepare(
                "UPDATE assets SET status = 'ready', metadata = ? WHERE id = ?"
              ).bind(JSON.stringify(metadata), asset.id).run();

              results[assetIndex] = { id: asset.id, name: asset.name, type: asset.type, metadata };
              agent.status = 'completed';
              agent.completedCount += 1;
              completedAssets += 1;

              await insertEventLog(`Agent ${agent.slot} finished ${asset.name}`);
              await updateCoordinator(
                computeProgress(),
                `Processed ${completedAssets}/${assetsToProcess.length} assets`,
                'running',
                agentStates,
              );
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              const errorMeta: AssetMetadata = {
                description: `Processing failed for ${asset.name}`,
                tags: ['error'],
                error: errorMsg,
                storageKey: asset.storage_key,
              };

              await this.env.DB.prepare(
                "UPDATE assets SET status = 'error', metadata = ? WHERE id = ?"
              ).bind(JSON.stringify(errorMeta), asset.id).run();

              agent.status = 'error';
              completedAssets += 1;
              await insertEventLog(`Agent ${agent.slot} failed ${asset.name}: ${errorMsg}`, 'error');
              await updateCoordinator(
                computeProgress(),
                `Processed ${completedAssets}/${assetsToProcess.length} assets`,
                'running',
                agentStates,
              );
            } finally {
              agent.assetId = null;
              agent.assetName = null;
              agent.status = nextAssetIndex < assetsToProcess.length ? 'queued' : 'idle';
            }
          }
        };

        await Promise.all(
          Array.from({ length: workerCount }, (_, index) => runAgent(index))
        );

        await updateCoordinator(
          60,
          `Agent pool complete. ${completedAssets}/${assetsToProcess.length} asset(s) processed.`,
          'running',
          agentStates,
        );

        return results.filter(
          (item): item is { id: string; name: string; type: string; metadata: AssetMetadata } => Boolean(item)
        );
      });

      // ============================================================
      // Step 3: REPO SYNTHESIS (Gemini generates project summary)
      // ============================================================
      const synthesis = await step.do('repo_synthesis', async () => {
        await logProgress('Synthesizing repository structure...', 70, 'synthesizing');

        if (processedAssets.length === 0) {
          await insertEventLog('No assets were successfully processed', 'warn');
          return null;
        }

        // Build aggregated context
        const assetContext = processedAssets.map(a => {
          return [
            `Name: ${a.name}`,
            `Type: ${a.type}`,
            `Description: ${a.metadata.description || 'None'}`,
            `Tags: ${(a.metadata.tags || []).join(', ') || 'None'}`,
            `Transcript: ${(a.metadata.transcript || '').slice(0, 500) || 'None'}`,
          ].join('\n');
        }).join('\n\n---\n\n');

        const fullTranscript = processedAssets
          .map(a => a.metadata.srt || '')
          .filter(Boolean)
          .join('\n\n');

        const durationSeconds = 0; // Estimation

        if (!this.env.GEMINI_API_KEY) {
          return {
            repo: {
              name: `project-${projectId.slice(0, 8)}`,
              brief: `Processed ${processedAssets.length} asset(s). Gemini API key not configured.`,
              created: Date.now(),
              version: '1.0.0',
              pipeline: 'trem-video-pipeline-v2'
            },
            scenes: { scenes: generateFallbackScenes(processedAssets) },
            timeline: generateFallbackTimeline(processedAssets),
            captions_srt: '',
            metadata: { video_md: '# Repository Overview\n\nGemini API not configured.', scenes_md: '' },
            commit: { id: '0001', message: 'feat: fallback ingest' }
          };
        }

        await insertEventLog('Applying the Trem repository system prompt to generate scenes, captions, metadata, OTIO, DAG, commits, and repo output.');
        const repoStructure = await generateRepoWithGemini(
          this.env.GEMINI_API_KEY,
          {
            duration: `${durationSeconds}s`,
            transcript: fullTranscript,
            assetContext,
            projectId
          }
        );

        await insertEventLog(`Repository synthesis complete`);
        return repoStructure;
      });

      // ============================================================
      // Step 4: GENERATE ARTIFACTS (write to R2 + register in D1)
      // ============================================================
      await step.do('generate_artifacts', async () => {
        if (!synthesis) return;
        await logProgress('Generating repository artifacts...', 85, 'generating_artifacts');

        await this.env.DB.prepare(
          "DELETE FROM artifacts WHERE project_id = ?"
        ).bind(projectId).run();

        await storeArtifact(this.env, projectId, jobId, 'repo.json', synthesis.repo || {});
        await storeArtifact(this.env, projectId, jobId, 'scenes.json', synthesis.scenes || {});
        await storeArtifact(this.env, projectId, jobId, 'main.otio.json', synthesis.timeline || {});

        if (synthesis.captions_srt) {
          await storeArtifactRaw(this.env, projectId, jobId, 'captions.srt', synthesis.captions_srt, 'text/plain');
        }
        if (synthesis.metadata?.video_md) {
          await storeArtifactRaw(this.env, projectId, jobId, 'video.md', synthesis.metadata.video_md, 'text/markdown');
        }
        if (synthesis.metadata?.scenes_md) {
          await storeArtifactRaw(this.env, projectId, jobId, 'scenes.md', synthesis.metadata.scenes_md, 'text/markdown');
        }
        if (synthesis.commit) {
          await storeArtifact(this.env, projectId, jobId, '0001.json', synthesis.commit);
        }
        if (synthesis.dag) {
          await storeArtifact(this.env, projectId, jobId, 'ingest.json', synthesis.dag);
        }

        const graphJson = {
          projectId,
          nodes: processedAssets.map(a => ({
            id: a.id,
            label: a.name,
            type: a.type,
            tags: a.metadata.tags,
          })),
          edges: [],
        };
        await storeArtifact(this.env, projectId, jobId, 'graph.json', graphJson);

        await insertEventLog(`Generated intelligence artifacts (OTIO, Commits, Metadata)`);
      });

      // ============================================================
      // Step 5: FINALIZE
      // ============================================================
      await step.do('finalize', async () => {
        const errorAssets = await this.env.DB.prepare(
          "SELECT COUNT(*) as count FROM assets WHERE project_id = ? AND status = 'error'"
        ).bind(projectId).first<{ count: number }>();

        const hasErrors = (errorAssets?.count || 0) > 0;
        const completionMessage = hasErrors
          ? `Ingestion complete with ${errorAssets!.count} asset error(s). Review artifacts.`
          : `Ingestion complete. ${processedAssets.length} asset(s) processed successfully.`;

        await logProgress(completionMessage, 100, 'completed', hasErrors ? 'warn' : 'info');

        await this.env.DB.prepare(
          "UPDATE projects SET status = 'completed', updated_at = ? WHERE id = ?"
        ).bind(Math.floor(Date.now() / 1000), projectId).run();

        await this.env.DB.prepare(
          "UPDATE jobs SET status = 'completed', progress = 100, completed_at = ? WHERE id = ?"
        ).bind(Math.floor(Date.now() / 1000), jobId).run();

        const doId = this.env.PROJECT_COORDINATOR.idFromName(projectId);
        const stub = this.env.PROJECT_COORDINATOR.get(doId);
        await stub.fetch(new Request('http://do/unlock', { method: 'POST' }));
      });
    } catch (error) {
      await step.do('handle_error', async () => {
        const message = error instanceof Error ? error.message : String(error);
        await insertEventLog(`Workflow failed: ${message}`, 'error');
        await this.env.DB.prepare(
          "UPDATE projects SET status = 'failed', updated_at = ? WHERE id = ?"
        ).bind(Math.floor(Date.now() / 1000), projectId).run();
        await this.env.DB.prepare(
          "UPDATE jobs SET status = 'failed', error = ? WHERE id = ?"
        ).bind(message, jobId).run();
        await updateCoordinator(0, `Failed: ${message}`, 'failed');
        const doId = this.env.PROJECT_COORDINATOR.idFromName(projectId);
        const stub = this.env.PROJECT_COORDINATOR.get(doId);
        await stub.fetch(new Request('http://do/unlock', { method: 'POST' }));
      });
      throw error;
    }
  }
}

// ============================================================
// ARTIFACT HELPERS
// ============================================================

async function storeArtifact(env: Env, projectId: string, jobId: string, name: string, data: any) {
  const content = JSON.stringify(data, null, 2);
  const storageKey = `projects/${projectId}/artifacts/${name}`;
  await env.BUCKET.put(storageKey, content, { httpMetadata: { contentType: 'application/json' } });

  await env.DB.prepare(
    "INSERT INTO artifacts (id, project_id, job_id, name, storage_key, content_type, size) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(crypto.randomUUID(), projectId, jobId, name, storageKey, 'application/json', content.length).run();
}

async function storeArtifactRaw(env: Env, projectId: string, jobId: string, name: string, content: string, contentType: string) {
  const storageKey = `projects/${projectId}/artifacts/${name}`;
  await env.BUCKET.put(storageKey, content, { httpMetadata: { contentType } });

  await env.DB.prepare(
    "INSERT INTO artifacts (id, project_id, job_id, name, storage_key, content_type, size) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(crypto.randomUUID(), projectId, jobId, name, storageKey, contentType, content.length).run();
}

// ============================================================
// FALLBACKS
// ============================================================

function generateFallbackScenes(assets: Array<{ id: string; name: string; type: string; metadata: AssetMetadata }>) {
  return assets.map((a, i) => ({
    id: `scene_${i + 1}`,
    label: `Scene ${i + 1} — ${a.name}`,
    assetId: a.id,
    description: a.metadata.description,
  }));
}

function generateFallbackTimeline(assets: Array<{ id: string; name: string; type: string; metadata: AssetMetadata }>) {
  return {
    tracks: [{
      name: 'V1',
      items: assets.filter(a => a.type !== 'audio').map((a, i) => ({
        assetId: a.id,
        name: a.name,
        startFrame: i * 300,
        endFrame: (i + 1) * 300,
      })),
    }],
  };
}

// ============================================================
// GEMINI SDK INTEGRATION (PRO 3.1)
// ============================================================

async function generateRepoWithGemini(
  apiKey: string,
  context: {
    duration: string;
    transcript: string;
    assetContext: string;
    projectId: string;
  }
): Promise<any> {
  const ai = new GoogleGenAI({ apiKey });
  
  const prompt = `
# Identity
You are Trem, a highly advanced Video Intelligence Engine designed for the Trem AI video editing platform. Your purpose is to analyze video content and generate a comprehensive, AI-native repository structure that enables intelligent video editing workflows.

## Core Capabilities
You excel at:
- **Scene Detection**: Identifying visual and audio scene boundaries with frame-level precision.
- **Content Analysis**: Understanding narrative structure, emotional arcs, and visual composition.
- **Metadata Generation**: Creating rich, structured metadata for downstream AI agents.

---

# Inputs
- **Video Duration**: ${context.duration}
- **Audio Transcript**: ${context.transcript || 'Not available'}
- **Scene Boundaries**: Inferred from analysis
- **Asset Context**: ${context.assetContext}
- **Visual Context**: Visual features and temporal coherence inferred from asset metadata and transcript.

---

# Robustness & Error Handling
- **Missing Duration**: If duration is unknown, estimate it based on the transcript length (approx. 150 words/min) or visual cues.
- **Missing Transcript**: If no transcript is provided, rely entirely on visual scene detection.
- **Ambiguity**: If a scene boundary is unclear, choose the most likely cut point and lower the confidence score.
- **Fail-Safe**: If detection fails completely for a segment, create a single "General Scene" covering that duration.

---

# Strict Ontology / Taxonomy
You must strictly adhere to these values for metadata fields to ensure downstream compatibility:
- **Emotion**: [joy, sadness, tension, calm, fear, anger, surprise, neutral]
- **Shot Type**: [extreme-wide, wide, medium, close-up, extreme-close-up]
- **Motion**: [static, pan, tilt, zoom, dolly, truck, handheld]

# Versioning & State Evolution
- **Commit History**: Generate a new commit ID (e.g., 0001) for this ingestion.
- **State Diffing**: Only update files that have changed.
- **Message**: Commit messages must describe the *change* (e.g., "feat: initial ingestion of ${context.projectId}").

---

# Tasks
1. Generate scenes/scenes.json
2. Generate captions/captions.srt
3. Generate metadata/video.md
4. Generate metadata/scenes.md
5. Generate timeline/base.otio.json (Valid OTIO Schema)
6. Generate dag/ingest.json
7. Generate commits/0001.json
8. Generate repo.json

# Output Schema (Strict JSON)
You MUST output ONLY valid JSON matching this exact structure. No markdown, no commentary.

{
  "provenance": {
    "model": "gemini-3.1-pro-preview",
    "timestamp": "${new Date().toISOString()}",
    "input_hash": "${context.projectId}",
    "agent_version": "trem-core-v3"
  },
  "confidence": 0.0,
  "detection_method": "reasoning-analysis",
  "repo": {
    "name": "project-${context.projectId}",
    "brief": "string (1-2 sentence video summary)",
    "created": ${Date.now()},
    "version": "1.0.0",
    "pipeline": "trem-video-pipeline-v2"
  },
  "scenes": {
    "scenes": [
      {
        "id": "scene-001",
        "start": 0.0,
        "end": 0.0,
        "summary": "string (concise visual description)",
        "emotion": "string (from ontology)",
        "shot_type": "string (from ontology)",
        "motion": "string (from ontology)",
        "audio_cues": ["string"],
        "characters": ["string"],
        "visual_notes": ["string"],
        "confidence": 1.0,
        "agent_annotations": {}
      }
    ]
  },
  "captions_srt": "string (valid SRT format)",
  "metadata": {
    "video_md": "string (Markdown video overview)",
    "scenes_md": "string (Markdown scene-by-scene breakdown)"
  },
  "timeline": {
    "OTIO_SCHEMA": "OpenTimelineIO.v1",
    "tracks": {
        "children": [
            {
                "OTIO_SCHEMA": "Track.v1",
                "kind": "Video",
                "children": [
                    {
                        "OTIO_SCHEMA": "Clip.v1",
                        "name": "Clip_001",
                        "source_range": {
                          "start_time": { "value": 0, "rate": 30.0 },
                          "duration": { "value": 0, "rate": 30.0 }
                        }
                    }
                ]
            }
        ]
    }
  },
  "dag": {},
  "commit": {
    "id": "0001",
    "parent": null,
    "timestamp": "${new Date().toISOString()}",
    "message": "feat: ingest ${context.projectId}",
    "state": {
      "timeline": "timeline/base.otio.json",
      "scenes": "scenes/scenes.json",
      "captions": "captions/captions.srt",
      "metadata": [
        "metadata/video.md",
        "metadata/scenes.md"
      ],
      "dag": "dag/ingest.json"
    },
    "hashtags": ["#tag1", "#tag2"]
  }
}

---

# Hashtag Generation Rules
Generate 4-6 hashtags based on actual content analysis.

---

# Final Reminders
- Output ONLY the JSON object. No explanation, no markdown fences.
- IMPORTANT: For the 'captions_srt' and 'metadata' fields, you must properly escape all newlines (\\\\n) and double quotes (\\\\") so the JSON remains valid.
- Scenes array must contain **multiple scenes** proportional to video length.
- Be precise with timestamps (use decimals like 3.5, 7.25).
- For OTIO 'source_range', use a default rate of 30.0 fps unless detected otherwise.
`;

  try {
    const config = { thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }, responseMimeType: 'application/json' };
    const responseStream = await ai.models.generateContentStream({
      model: 'gemini-3.1-pro-preview',
      config,
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });
    
    let fullText = '';
    for await (const chunk of responseStream) {
      fullText += chunk.text;
    }
    
    return extractFirstJsonObject(fullText);
  } catch (err) {
    console.error('Unified Gemini Pro synthesis failed:', err);
    return null;
  }
}

async function analyzeAssetWithGemini({
  apiKey, assetName, assetType, mimeType, size, transcript,
}: {
  apiKey: string; assetName: string; assetType: string; mimeType: string; size: number; transcript: string;
}): Promise<{ description: string; tags: string[] }> {
  const ai = new GoogleGenAI({ apiKey });
  const transcriptExcerpt = transcript ? transcript.slice(0, 500) : 'No transcript available.';
  
  const prompt = `
You are tagging an uploaded media asset for a creative repository.
Return strict JSON only: {"description":"...","tags":["..."]}.
Asset name: ${assetName}
Asset type: ${assetType}
MIME type: ${mimeType}
File size: ${size} bytes
Transcript excerpt: ${transcriptExcerpt}
`;

  try {
    const responseStream = await ai.models.generateContentStream({
      model: 'gemini-3.1-pro-preview',
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });
    let fullText = '';
    for await (const chunk of responseStream) {
      fullText += chunk.text;
    }
    const parsed = extractFirstJsonObject(fullText);

    return {
      description: typeof parsed?.description === 'string'
        ? parsed.description
        : `Processed ${assetType} asset ${assetName}`,
      tags: Array.isArray(parsed?.tags) && parsed.tags.length > 0
        ? parsed.tags.map((t: unknown) => String(t)).slice(0, 5)
        : buildFallbackTags(assetName, assetType, mimeType),
    };
  } catch {
    return {
      description: `Processed ${assetType} asset ${assetName}`,
      tags: buildFallbackTags(assetName, assetType, mimeType),
    };
  }
}

// ============================================================
// UTILITIES
// ============================================================

const shouldTranscribe = (mimeType: string, size: number): boolean => {
  return (mimeType.startsWith('audio/') || mimeType.startsWith('video/')) && size > 0 && size <= MAX_TRANSCRIBE_BYTES;
};

const buildFallbackTags = (name: string, type: string, mimeType: string): string[] => {
  const sanitizedName = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean).slice(0, 2);
  return Array.from(new Set([type, mimeType.split('/')[0], ...sanitizedName])).slice(0, 4);
};

const toBase64 = (buffer: ArrayBuffer): string => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const transcribeWithReplicate = async (fileBuffer: ArrayBuffer, mimeType: string, token: string): Promise<TranscriptionResult | null> => {
  const audioDataUrl = `data:${mimeType};base64,${toBase64(fileBuffer)}`;
  const createRes = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: REPLICATE_WHISPER_VERSION, input: { audio: audioDataUrl, language: 'auto', translate: false, transcription: 'srt' } }),
  });

  if (!createRes.ok) throw new Error(`Replicate create failed with status ${createRes.status}`);
  const prediction = await createRes.json() as { id: string; status: string; output?: any };
  const output = prediction.id ? await pollReplicatePrediction(prediction.id, token) : prediction.output;
  return parseReplicateOutput(output);
};

const pollReplicatePrediction = async (id: string, token: string): Promise<any> => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const res = await fetch(`https://api.replicate.com/v1/predictions/${id}`, { headers: { 'Authorization': `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Replicate polling failed with status ${res.status}`);
    const prediction = await res.json() as { status: string; output?: any; error?: string };
    if (prediction.status === 'succeeded') return prediction.output;
    if (prediction.status === 'failed' || prediction.status === 'canceled') throw new Error(prediction.error || `Replicate prediction ${prediction.status}`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error('Replicate prediction timed out');
};

const parseReplicateOutput = (output: any): TranscriptionResult | null => {
  if (!output) return null;
  let parsed = output;
  if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed); } catch { return { text: parsed, srt: '' }; } }
  const segments = Array.isArray(parsed?.segments) ? parsed.segments : [];
  const text = typeof parsed?.transcription === 'string' && !parsed.transcription.includes('-->')
    ? parsed.transcription : segments.map((s: any) => String(s.text || '').trim()).join(' ');
  const srt = typeof parsed?.transcription === 'string' && parsed.transcription.includes('-->') ? parsed.transcription : '';
  return { text, srt };
};

const extractFirstJsonObject = (text: string): any => {
  const markdownMatch = text.match(/```json\s*([\s\S]*?)\s*```/i);
  const candidate = markdownMatch?.[1] || text.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) return null;
  try { return JSON.parse(candidate); } catch { return null; }
};
