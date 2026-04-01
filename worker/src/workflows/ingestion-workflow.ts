// @ts-ignore
import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import mime from 'mime';
import {
  buildBranchArtifactStorageKey,
  clearGeneratedArtifactsForBranch,
  ensureBranchExists,
  getCommitLineage,
  updateBranchHead,
} from '../db/branching';

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
  branchName?: string;
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

type CommitArtifact = {
  id: string;
  parent: string | null;
  parents: string[];
  timestamp: string;
  author: string;
  branch: string;
  message: string;
  hashtags: string[];
  state: Record<string, string | string[] | null>;
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

const toRepoSlug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'trem-repository';

const defaultCommitMessage = ({
  isInitial,
  repoName,
}: {
  isInitial: boolean;
  repoName: string;
}) => {
  const slug = toRepoSlug(repoName);
  return isInitial
    ? `feat: initialize ${slug} repository analysis`
    : `feat: update ${slug} repository analysis`;
};

const normalizeCommitMessage = (message: unknown, fallback: string) => {
  if (typeof message !== 'string') return fallback;
  const normalized = message.replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  if (/^[a-z]+(\([^)]+\))?:\s+.+$/i.test(normalized)) {
    return normalized;
  }
  return `feat: ${normalized.charAt(0).toLowerCase()}${normalized.slice(1)}`;
};

const normalizeHashtags = (hashtags: unknown) => {
  if (!Array.isArray(hashtags)) {
    return ['#trem', '#ai-generated'];
  }

  const cleaned = hashtags
    .map((tag) => String(tag || '').trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith('#') ? tag : `#${tag}`));

  return cleaned.length > 0
    ? Array.from(new Set(cleaned)).slice(0, 6)
    : ['#trem', '#ai-generated'];
};

const buildCommitState = (hasCaptions: boolean) => ({
  repo: 'repo.json',
  timeline: 'timeline/base.otio.json',
  scenes: 'scenes/scenes.json',
  captions: hasCaptions ? 'captions/captions.srt' : null,
  metadata: ['metadata/video.md', 'metadata/scenes.md'],
  dag: 'dag/ingest.json',
});

const buildFallbackSynthesis = ({
  projectId,
  repoName,
  processedAssets,
  commitId,
  parentCommitId,
  branchName,
}: {
  projectId: string;
  repoName: string;
  processedAssets: Array<{ id: string; name: string; type: string; metadata: AssetMetadata }>;
  commitId: string;
  parentCommitId: string | null;
  branchName: string;
}) => ({
  provenance: {
    model: 'trem-fallback',
    timestamp: new Date().toISOString(),
    input_hash: `${projectId}:${commitId}`,
    agent_version: 'trem-core-v3',
  },
  confidence: 0.32,
  detection_method: 'fallback-analysis',
  repo: {
    name: toRepoSlug(repoName),
    brief: `Processed ${processedAssets.length} asset(s). Trem generated a conservative repository scaffold because Gemini synthesis was unavailable.`,
    created: Date.now(),
    version: '1.0.0',
    pipeline: 'trem-video-pipeline-v2',
  },
  scenes: { scenes: generateFallbackScenes(processedAssets) },
  timeline: generateFallbackTimeline(processedAssets),
    captions_srt: processedAssets.map((asset) => asset.metadata.srt || '').filter(Boolean).join('\n\n'),
    metadata: {
      video_md: `# ${repoName}\n\nFallback repository scaffold generated for ${processedAssets.length} asset(s).`,
      scenes_md: processedAssets.map((asset, index) => `## Scene ${index + 1}\n- Asset: ${asset.name}\n- Notes: ${asset.metadata.description}`).join('\n\n'),
  },
  dag: {
    stage: 'fallback-ingest',
    assets: processedAssets.map((asset) => asset.id),
  },
  commit: {
    id: commitId,
    parent: parentCommitId,
    parents: parentCommitId ? [parentCommitId] : [],
    author: 'Trem-AI',
    branch: branchName,
    timestamp: new Date().toISOString(),
    message: defaultCommitMessage({ isInitial: !parentCommitId, repoName }),
    hashtags: ['#trem', '#ai-generated'],
    state: buildCommitState(
      processedAssets.some((asset) => Boolean(asset.metadata.srt)),
    ),
  },
});

const normalizeRepoSynthesis = ({
  synthesis,
  projectId,
  repoName,
  commitId,
  parentCommitId,
  branchName,
}: {
  synthesis: any;
  projectId: string;
  repoName: string;
  commitId: string;
  parentCommitId: string | null;
  branchName: string;
}) => {
  const timestamp = new Date().toISOString();
  const captions = typeof synthesis?.captions_srt === 'string' ? synthesis.captions_srt : '';
  const parents = Array.isArray(synthesis?.commit?.parents)
    ? synthesis.commit.parents.map((parent: unknown) => String(parent)).filter(Boolean)
    : parentCommitId
      ? [parentCommitId]
      : [];
  const commit: CommitArtifact = {
    id: commitId,
    parent: parentCommitId,
    parents,
    timestamp,
    author: typeof synthesis?.commit?.author === 'string' ? synthesis.commit.author : 'Trem-AI',
    branch: branchName,
    message: normalizeCommitMessage(
      synthesis?.commit?.message,
      defaultCommitMessage({ isInitial: !parentCommitId, repoName }),
    ),
    hashtags: normalizeHashtags(synthesis?.commit?.hashtags),
    state: buildCommitState(Boolean(captions)),
  };

  return {
    provenance: {
      model: synthesis?.provenance?.model || 'gemini-3.1-pro-preview',
      timestamp,
      input_hash: synthesis?.provenance?.input_hash || `${projectId}:${commitId}`,
      agent_version: synthesis?.provenance?.agent_version || 'trem-core-v3',
    },
    confidence: typeof synthesis?.confidence === 'number' ? synthesis.confidence : 0.55,
    detection_method: synthesis?.detection_method || 'vision+audio',
    repo: {
      name: typeof synthesis?.repo?.name === 'string' && synthesis.repo.name.trim()
        ? synthesis.repo.name.trim()
        : toRepoSlug(repoName),
      brief: typeof synthesis?.repo?.brief === 'string' && synthesis.repo.brief.trim()
        ? synthesis.repo.brief.trim()
        : `Repository intelligence generated for ${repoName}.`,
      created: typeof synthesis?.repo?.created === 'number' ? synthesis.repo.created : Date.now(),
      version: typeof synthesis?.repo?.version === 'string' ? synthesis.repo.version : '1.0.0',
      pipeline: typeof synthesis?.repo?.pipeline === 'string' ? synthesis.repo.pipeline : 'trem-video-pipeline-v2',
    },
    scenes: synthesis?.scenes && Array.isArray(synthesis.scenes.scenes)
      ? synthesis.scenes
      : { scenes: [] },
    captions_srt: captions,
    metadata: {
      video_md: typeof synthesis?.metadata?.video_md === 'string' ? synthesis.metadata.video_md : '',
      scenes_md: typeof synthesis?.metadata?.scenes_md === 'string' ? synthesis.metadata.scenes_md : '',
    },
    timeline: synthesis?.timeline || generateFallbackTimeline([]),
    dag: synthesis?.dag || {},
    commit,
  };
};

export class IngestionWorkflow extends WorkflowEntrypoint<Env, IngestionParams> {
  async run(event: WorkflowEvent<IngestionParams>, step: WorkflowStep) {
    const { projectId, jobId } = event.payload;
    const branchName = await ensureBranchExists(
      this.env,
      projectId,
      event.payload.branchName || 'main',
      'main',
    );
    console.log(`[IngestionWorkflow] Starting run for project: ${projectId}, job: ${jobId}`);
    
    // Check if DB is bound
    if (!this.env.DB) {
      console.error(`[IngestionWorkflow] DB binding NOT FOUND!`);
    } else {
      console.log(`[IngestionWorkflow] DB binding exists.`);
    }


    const insertEventLog = async (message: string, level: 'info' | 'warn' | 'error' = 'info') => {
      await this.env.DB.prepare(
        "INSERT INTO event_logs (id, project_id, job_id, branch_name, message, level) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(crypto.randomUUID(), projectId, jobId, branchName, message, level).run();
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
      const project = await this.env.DB.prepare(
        "SELECT name FROM projects WHERE id = ?"
      ).bind(projectId).first<{ name: string }>();
      const repoName = project?.name || `project-${projectId.slice(0, 8)}`;
      const commitLineage = await getCommitLineage(this.env, projectId, branchName);

      // ============================================================
      // Step 1: PREPARE ASSETS
      // ============================================================
      const assetsToProcess = await step.do('prepare_assets', async () => {
        await logProgress('Preparing assets for ingestion...', 5, 'running');

        await this.env.DB.prepare(
          "UPDATE projects SET status = 'ingesting', updated_at = ? WHERE id = ?"
        ).bind(Math.floor(Date.now() / 1000), projectId).run();

        const assetsRes = await this.env.DB.prepare(
          "SELECT * FROM assets WHERE project_id = ? AND status IN ('uploaded', 'pending', 'ready')"
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
          return normalizeRepoSynthesis({
            synthesis: buildFallbackSynthesis({
              projectId,
              repoName,
              processedAssets,
              commitId: commitLineage.nextCommitId,
              parentCommitId: commitLineage.parentCommitId,
              branchName,
            }),
            projectId,
            repoName,
            commitId: commitLineage.nextCommitId,
            parentCommitId: commitLineage.parentCommitId,
            branchName,
          });
        }

        await insertEventLog('Applying the Trem repository system prompt to generate scenes, captions, metadata, OTIO, DAG, commits, and repo output.');
        const repoStructure = await generateRepoWithGemini(
          this.env.GEMINI_API_KEY,
          {
            duration: `${durationSeconds}s`,
            transcript: fullTranscript,
            assetContext,
            projectId,
            projectName: repoName,
            nextCommitId: commitLineage.nextCommitId,
            parentCommitId: commitLineage.parentCommitId,
            branchName,
          }
        );

        if (!repoStructure) {
          return normalizeRepoSynthesis({
            synthesis: buildFallbackSynthesis({
              projectId,
              repoName,
              processedAssets,
              commitId: commitLineage.nextCommitId,
              parentCommitId: commitLineage.parentCommitId,
              branchName,
            }),
            projectId,
            repoName,
            commitId: commitLineage.nextCommitId,
            parentCommitId: commitLineage.parentCommitId,
            branchName,
          });
        }

        await insertEventLog(`Repository synthesis complete`);
        return normalizeRepoSynthesis({
          synthesis: repoStructure,
          projectId,
          repoName,
          commitId: commitLineage.nextCommitId,
          parentCommitId: commitLineage.parentCommitId,
          branchName,
        });
      });

      // ============================================================
      // Step 4: GENERATE ARTIFACTS (write to R2 + register in D1)
      // ============================================================
      await step.do('generate_artifacts', async () => {
        if (!synthesis) return;
        await logProgress('Generating repository artifacts...', 85, 'generating_artifacts');

        await clearGeneratedArtifactsForBranch(this.env, projectId, branchName);

        await storeArtifact(this.env, projectId, jobId, branchName, 'repo.json', synthesis.repo || {});
        await storeArtifact(this.env, projectId, jobId, branchName, 'scenes/scenes.json', synthesis.scenes || {});
        await storeArtifact(this.env, projectId, jobId, branchName, 'timeline/base.otio.json', synthesis.timeline || {});

        if (synthesis.captions_srt) {
          await storeArtifactRaw(this.env, projectId, jobId, branchName, 'captions/captions.srt', synthesis.captions_srt, 'text/plain');
        }
        if (synthesis.metadata?.video_md) {
          await storeArtifactRaw(this.env, projectId, jobId, branchName, 'metadata/video.md', synthesis.metadata.video_md, 'text/markdown');
        }
        if (synthesis.metadata?.scenes_md) {
          await storeArtifactRaw(this.env, projectId, jobId, branchName, 'metadata/scenes.md', synthesis.metadata.scenes_md, 'text/markdown');
        }
        if (synthesis.commit) {
          await storeArtifact(this.env, projectId, jobId, branchName, `commits/${synthesis.commit.id}.json`, synthesis.commit);
          await updateBranchHead(this.env, projectId, branchName, synthesis.commit.id);
          await insertEventLog(`Created commit ${synthesis.commit.id}: ${synthesis.commit.message}`);
        }
        if (synthesis.dag) {
          await storeArtifact(this.env, projectId, jobId, branchName, 'dag/ingest.json', synthesis.dag);
        }

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

async function storeArtifact(
  env: Env,
  projectId: string,
  jobId: string | null,
  branchName: string,
  name: string,
  data: any,
) {
  const content = JSON.stringify(data, null, 2);
  const storageKey = buildBranchArtifactStorageKey(projectId, branchName, name);
  await env.BUCKET.put(storageKey, content, { httpMetadata: { contentType: 'application/json' } });

  await env.DB.prepare(
    "INSERT INTO artifacts (id, project_id, job_id, branch_name, name, storage_key, content_type, size) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(crypto.randomUUID(), projectId, jobId, branchName, name, storageKey, 'application/json', content.length).run();
}

async function storeArtifactRaw(
  env: Env,
  projectId: string,
  jobId: string | null,
  branchName: string,
  name: string,
  content: string,
  contentType: string,
) {
  const storageKey = buildBranchArtifactStorageKey(projectId, branchName, name);
  await env.BUCKET.put(storageKey, content, { httpMetadata: { contentType } });

  await env.DB.prepare(
    "INSERT INTO artifacts (id, project_id, job_id, branch_name, name, storage_key, content_type, size) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(crypto.randomUUID(), projectId, jobId, branchName, name, storageKey, contentType, content.length).run();
}

// ============================================================
// FALLBACKS
// ============================================================

function generateFallbackScenes(assets: Array<{ id: string; name: string; type: string; metadata: AssetMetadata }>) {
  return assets.map((asset, index) => {
    const start = index * 5;
    const end = start + 5;
    return {
      id: `scene-${String(index + 1).padStart(3, '0')}`,
      start,
      end,
      summary: asset.metadata.description || `General scene coverage for ${asset.name}`,
      emotion: 'neutral',
      shot_type: 'medium',
      motion: 'static',
      audio_cues: asset.metadata.transcript ? ['dialogue'] : ['ambient'],
      characters: [],
      visual_notes: asset.metadata.tags || [],
      confidence: 0.32,
      agent_annotations: {},
    };
  });
}

function generateFallbackTimeline(assets: Array<{ id: string; name: string; type: string; metadata: AssetMetadata }>) {
  const videoAssets = assets.filter((asset) => asset.type !== 'audio');
  return {
    OTIO_SCHEMA: 'OpenTimelineIO.v1',
    tracks: {
      children: [
        {
          OTIO_SCHEMA: 'Track.v1',
          kind: 'Video',
          children: videoAssets.map((asset, index) => ({
            OTIO_SCHEMA: 'Clip.v1',
            name: `Clip_${String(index + 1).padStart(3, '0')}`,
            source_range: {
              start_time: { value: index * 150, rate: 30.0 },
              duration: { value: 150, rate: 30.0 },
            },
          })),
        },
      ],
    },
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
    projectName: string;
    nextCommitId: string;
    parentCommitId: string | null;
    branchName: string;
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
- **Visual Context**: I have attached 0 keyframes from the video. Correlate these visual frames with the timestamps in the transcript to determine scene changes.

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
- **Branch**: You are authoring the commit on branch "${context.branchName}".
- **Commit History**: If a previous commit exists, you MUST generate the new commit ID "${context.nextCommitId}" and set the 'parent' field to ${context.parentCommitId ? `"${context.parentCommitId}"` : 'null'}.
- **State Diffing**: Only update files that have changed. If a file is identical to the previous version, do not regenerate it; reference the existing file path.
- **Message**: Commit messages must describe the *change* (e.g., "fix: adjust scene 2 boundary", "feat: refine emotion tags").

---

# Tasks
1. Generate scenes/scenes.json
2. Generate captions/captions.srt
3. Generate metadata/video.md
4. Generate metadata/scenes.md
5. Generate timeline/base.otio.json (Valid OTIO Schema)
6. Generate dag/ingest.json
7. Generate commits/${context.nextCommitId}.json
8. Generate repo.json

# Output Schema (Strict JSON)
You MUST output ONLY valid JSON matching this exact structure. No markdown, no commentary.

{
  "provenance": {
    "model": "string (e.g. gemini-3-flash-preview)",
    "timestamp": "string (ISO 8601)",
    "input_hash": "string (sha256 of inputs)",
    "agent_version": "string (e.g. trem-core-v1)"
  },
  "confidence": 0.0,
  "detection_method": "string (vision+audio, vision-only, or audio-only)",
  "repo": {
    "name": "string (kebab-case repo name)",
    "brief": "string (1-2 sentence video summary)",
    "created": "number (Unix timestamp)",
    "version": "1.0.0",
    "pipeline": "trem-video-pipeline-v2"
  },
  "scenes": {
    "scenes": [
      {
        "id": "scene-001",
        "start": 0.0,
        "end": 3.5,
        "summary": "string (concise visual description)",
        "emotion": "string (from ontology)",
        "shot_type": "string (from ontology)",
        "motion": "string (from ontology)",
        "audio_cues": ["string (music, dialogue, ambient, silence)"],
        "characters": ["string (detected characters or subjects)"],
        "visual_notes": ["string (lighting, color grade, composition notes)"],
        "confidence": "number (0.0 - 1.0 confidence in scene boundaries and content)",
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
                          "duration": { "value": 105, "rate": 30.0 }
                        }
                    }
                ]
            }
        ]
    }
  },
  "dag": {},
  "commit": {
    "id": "${context.nextCommitId}",
    "parent": ${context.parentCommitId ? `"${context.parentCommitId}"` : 'null'},
    "branch": "${context.branchName}",
    "timestamp": "string (ISO 8601)",
    "message": "string (conventional commit: feat: ingest 14s makeup transformation...)",
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
    "hashtags": ["#tag1", "#tag2", "#tag3"]
  }
}

---

# Hashtag Generation Rules
Generate 4-6 hashtags based on actual content analysis:
- **Format**: #vertical, #horizontal, #square, #4k, #1080p
- **Style**: #cinematic, #documentary, #vlog, #tutorial, #high-contrast, #low-key, #neon, #natural-light
- **Content**: #glow-up, #transformation, #dance, #music, #dialogue, #b-roll, #timelapse, #action
- **Platform**: #tiktok, #reels, #youtube-shorts, #social-media

---

# Final Reminders
- Output ONLY the JSON object. No explanation, no markdown fences.
- IMPORTANT: For the 'captions_srt' and 'metadata' fields, you must properly escape all newlines (\\\\n) and double quotes (\\\\") so the JSON remains valid.
- Scenes array must contain **multiple scenes** proportional to video length.
- Be precise with timestamps (use decimals like 3.5, 7.25).
- For OTIO 'source_range', use a default rate of 30.0 fps unless detected otherwise. Calculate 'value' as 'seconds * rate'.
- Use the Asset Context to inform descriptions and tags.
- If critical inputs are missing, infer conservatively and set 'confidence' accordingly.
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
