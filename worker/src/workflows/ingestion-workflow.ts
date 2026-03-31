// @ts-ignore
import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';

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

export class IngestionWorkflow extends WorkflowEntrypoint<Env, IngestionParams> {
  async run(event: WorkflowEvent<IngestionParams>, step: WorkflowStep) {
    const { projectId, jobId } = event.payload;

    const insertEventLog = async (message: string, level: 'info' | 'warn' | 'error' = 'info') => {
      await this.env.DB.prepare(
        "INSERT INTO event_logs (id, project_id, job_id, message, level) VALUES (?, ?, ?, ?, ?)"
      ).bind(crypto.randomUUID(), projectId, jobId, message, level).run();
    };

    const updateCoordinator = async (progress: number, message: string, jobStatus?: string) => {
      const doId = this.env.PROJECT_COORDINATOR.idFromName(projectId);
      const stub = this.env.PROJECT_COORDINATOR.get(doId);
      await stub.fetch(new Request('http://do/progress', {
        method: 'POST',
        body: JSON.stringify({ progress, message, jobStatus })
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
        return assetsRes.results;
      });

      // ============================================================
      // Step 2: PROCESS ASSETS (transcription + analysis)
      // ============================================================
      const processedAssets = await step.do('process_assets', async () => {
        await logProgress(`Processing ${assetsToProcess.length} assets...`, 15, 'running');

        const results: Array<{ id: string; name: string; type: string; metadata: AssetMetadata }> = [];

        for (let i = 0; i < assetsToProcess.length; i++) {
          const asset = assetsToProcess[i];
          const progressPct = 15 + Math.floor(((i + 1) / assetsToProcess.length) * 45);

          try {
            if (!asset.storage_key) {
              throw new Error('Missing storage key');
            }

            const object = await this.env.BUCKET.get(asset.storage_key);
            if (!object) {
              throw new Error(`Asset not found in R2: ${asset.storage_key}`);
            }

            const mimeType = object.httpMetadata?.contentType || inferMimeType(asset.name, asset.type);
            const size = object.size;

            // -- Transcription --
            let transcript: TranscriptionResult | null = null;
            if (this.env.REPLICATE_API_TOKEN && shouldTranscribe(mimeType, size)) {
              await insertEventLog(`Transcribing ${asset.name}...`);
              await updateJobStatus('transcribing', progressPct - 10);
              await updateCoordinator(progressPct - 10, `Transcribing ${asset.name}...`, 'transcribing');

              await this.env.DB.prepare(
                "UPDATE assets SET status = 'transcribing' WHERE id = ?"
              ).bind(asset.id).run();

              transcript = await transcribeWithReplicate(
                await object.arrayBuffer(),
                mimeType,
                this.env.REPLICATE_API_TOKEN
              );

              // Store transcript as separate R2 object
              if (transcript) {
                const srtKey = `projects/${projectId}/transcripts/${asset.id}.srt`;
                const jsonKey = `projects/${projectId}/transcripts/${asset.id}.json`;

                await this.env.BUCKET.put(srtKey, transcript.srt, {
                  httpMetadata: { contentType: 'text/plain' }
                });
                await this.env.BUCKET.put(jsonKey, JSON.stringify(transcript), {
                  httpMetadata: { contentType: 'application/json' }
                });

                await insertEventLog(`Transcription complete for ${asset.name}`);
              }
            } else if (isMediaWithAudio(mimeType) && size > MAX_TRANSCRIBE_BYTES) {
              await insertEventLog(
                `Skipped transcription for ${asset.name} (${(size / 1024 / 1024).toFixed(1)}MB exceeds limit)`,
                'warn'
              );
            }

            // -- Analysis (Gemini) --
            await insertEventLog(`Analyzing ${asset.name}...`);
            await updateJobStatus('analyzing', progressPct - 5);
            await updateCoordinator(progressPct - 5, `Analyzing ${asset.name}...`, 'analyzing');

            await this.env.DB.prepare(
              "UPDATE assets SET status = 'analyzing' WHERE id = ?"
            ).bind(asset.id).run();

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

            results.push({ id: asset.id, name: asset.name, type: asset.type, metadata });
            await insertEventLog(`Finished processing ${asset.name}`);

            await updateCoordinator(progressPct, `Processed ${i + 1}/${assetsToProcess.length} assets`, 'running');
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

            await insertEventLog(`Failed processing ${asset.name}: ${errorMsg}`, 'error');

            // Don't push to results but continue processing other assets
          }
        }

        return results;
      });

      // ============================================================
      // Step 3: REPO SYNTHESIS (Gemini generates project summary)
      // ============================================================
      const synthesis = await step.do('repo_synthesis', async () => {
        await logProgress('Synthesizing repository structure...', 70, 'synthesizing');

        if (processedAssets.length === 0) {
          await insertEventLog('No assets were successfully processed', 'warn');
          return { summary: 'No assets available for synthesis.', scenes: [], timeline: {} };
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

        if (!this.env.GEMINI_API_KEY) {
          return {
            summary: `Processed ${processedAssets.length} asset(s). Gemini API key not configured.`,
            scenes: generateFallbackScenes(processedAssets),
            timeline: generateFallbackTimeline(processedAssets),
            transcript: fullTranscript,
          };
        }

        // Use Gemini to generate structured repo output
        const repoStructure = await generateRepoWithGemini(
          this.env.GEMINI_API_KEY,
          assetContext,
          fullTranscript,
          processedAssets
        );

        await insertEventLog(`Repository synthesis complete`);
        return repoStructure;
      });

      // ============================================================
      // Step 4: GENERATE ARTIFACTS (write to R2 + register in D1)
      // ============================================================
      await step.do('generate_artifacts', async () => {
        await logProgress('Generating repository artifacts...', 85, 'generating_artifacts');

        // Get project info
        const project = await this.env.DB.prepare(
          "SELECT name, brief FROM projects WHERE id = ?"
        ).bind(projectId).first<{ name: string; brief: string }>();

        const projectName = project?.name || 'Untitled';
        const projectBrief = project?.brief || '';

        // ---- repo.json ----
        const repoJson = {
          name: projectName,
          brief: projectBrief,
          version: '1.0.0',
          pipeline: 'trem-video-pipeline-v2',
          created: Date.now(),
          summary: synthesis.summary,
          assetCount: processedAssets.length,
          assets: processedAssets.map(a => ({
            id: a.id,
            name: a.name,
            type: a.type,
            description: a.metadata.description,
            tags: a.metadata.tags,
          })),
        };
        await storeArtifact(this.env, projectId, jobId, 'repo.json', repoJson);

        // ---- scenes.json ----
        const scenesJson = {
          projectId,
          generatedAt: Date.now(),
          scenes: synthesis.scenes || [],
        };
        await storeArtifact(this.env, projectId, jobId, 'scenes.json', scenesJson);

        // ---- main.otio.json ----
        const otioJson = {
          version: '1.0',
          projectId,
          timeline: synthesis.timeline || {},
        };
        await storeArtifact(this.env, projectId, jobId, 'main.otio.json', otioJson);

        // ---- graph.json ----
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

        await insertEventLog(`Generated 4 repository artifacts`);
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

        // Unlock coordinator
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
// HELPER: Store artifact in R2 + register in D1
// ============================================================

async function storeArtifact(env: Env, projectId: string, jobId: string, name: string, data: any) {
  const content = JSON.stringify(data, null, 2);
  const storageKey = `projects/${projectId}/artifacts/${name}`;

  await env.BUCKET.put(storageKey, content, {
    httpMetadata: { contentType: 'application/json' }
  });

  await env.DB.prepare(
    "INSERT INTO artifacts (id, project_id, job_id, name, storage_key, content_type, size) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    crypto.randomUUID(),
    projectId,
    jobId,
    name,
    storageKey,
    'application/json',
    content.length
  ).run();
}

// ============================================================
// Fallback generators (when Gemini unavailable)
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
// Gemini: Generate structured repo output
// ============================================================

async function generateRepoWithGemini(
  apiKey: string,
  assetContext: string,
  transcript: string,
  assets: Array<{ id: string; name: string; type: string; metadata: AssetMetadata }>
): Promise<{ summary: string; scenes: any[]; timeline: any; transcript?: string }> {
  const prompt = [
    'You are generating a structured video repository analysis.',
    'Given the following media assets and their metadata, generate a JSON object with:',
    '1. "summary": A 2-3 sentence project summary',
    '2. "scenes": An array of detected scenes, each with {id, label, description, assetId, startTime?, endTime?}',
    '3. "timeline": A simple timeline with {tracks: [{name, items: [{assetId, name, startFrame, endFrame}]}]}',
    '',
    'Return ONLY valid JSON. No markdown fences.',
    '',
    '--- Asset Context ---',
    assetContext,
    '',
    transcript ? `--- Full Transcript ---\n${transcript.slice(0, 2000)}` : '',
  ].filter(Boolean).join('\n');

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      }
    );

    if (!res.ok) {
      throw new Error(`Gemini synthesis failed: ${res.status}`);
    }

    const data = await res.json() as any;
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const parsed = extractFirstJsonObject(text);

    return {
      summary: parsed?.summary || `Processed ${assets.length} asset(s)`,
      scenes: Array.isArray(parsed?.scenes) ? parsed.scenes : generateFallbackScenes(assets),
      timeline: parsed?.timeline || generateFallbackTimeline(assets),
      transcript,
    };
  } catch (err) {
    return {
      summary: `Processed ${assets.length} asset(s). Gemini synthesis failed.`,
      scenes: generateFallbackScenes(assets),
      timeline: generateFallbackTimeline(assets),
      transcript,
    };
  }
}

// ============================================================
// Utility functions
// ============================================================

const inferMimeType = (name: string, assetType: string): string => {
  const lowerName = name.toLowerCase();
  if (lowerName.endsWith('.mp3')) return 'audio/mpeg';
  if (lowerName.endsWith('.wav')) return 'audio/wav';
  if (lowerName.endsWith('.m4a')) return 'audio/mp4';
  if (lowerName.endsWith('.mp4')) return 'video/mp4';
  if (lowerName.endsWith('.mov')) return 'video/quicktime';
  if (lowerName.endsWith('.webm')) return 'video/webm';
  if (lowerName.endsWith('.png')) return 'image/png';
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg';
  if (assetType === 'audio') return 'audio/mpeg';
  if (assetType === 'video') return 'video/mp4';
  if (assetType === 'image') return 'image/jpeg';
  return 'application/octet-stream';
};

const isMediaWithAudio = (mimeType: string): boolean => {
  return mimeType.startsWith('audio/') || mimeType.startsWith('video/');
};

const shouldTranscribe = (mimeType: string, size: number): boolean => {
  return isMediaWithAudio(mimeType) && size > 0 && size <= MAX_TRANSCRIBE_BYTES;
};

const buildFallbackTags = (name: string, type: string, mimeType: string): string[] => {
  const sanitizedName = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2);
  return Array.from(new Set([type, mimeType.split('/')[0], ...sanitizedName])).slice(0, 4);
};

const toBase64 = (buffer: ArrayBuffer): string => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
};

const transcribeWithReplicate = async (
  fileBuffer: ArrayBuffer,
  mimeType: string,
  token: string
): Promise<TranscriptionResult | null> => {
  const audioDataUrl = `data:${mimeType};base64,${toBase64(fileBuffer)}`;

  const createRes = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: REPLICATE_WHISPER_VERSION,
      input: {
        audio: audioDataUrl,
        language: 'auto',
        translate: false,
        transcription: 'srt',
      },
    }),
  });

  if (!createRes.ok) {
    throw new Error(`Replicate create failed with status ${createRes.status}`);
  }

  const prediction = await createRes.json() as { id: string; status: string; output?: any };
  const output = prediction.id ? await pollReplicatePrediction(prediction.id, token) : prediction.output;

  return parseReplicateOutput(output);
};

const pollReplicatePrediction = async (id: string, token: string): Promise<any> => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const res = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new Error(`Replicate polling failed with status ${res.status}`);
    }

    const prediction = await res.json() as { status: string; output?: any; error?: string };
    if (prediction.status === 'succeeded') return prediction.output;
    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      throw new Error(prediction.error || `Replicate prediction ${prediction.status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error('Replicate prediction timed out');
};

const parseReplicateOutput = (output: any): TranscriptionResult | null => {
  if (!output) return null;
  let parsed = output;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch { return { text: parsed, srt: '' }; }
  }
  const segments = Array.isArray(parsed?.segments) ? parsed.segments : [];
  const text = typeof parsed?.transcription === 'string' && !parsed.transcription.includes('-->')
    ? parsed.transcription
    : segments.map((s: any) => String(s.text || '').trim()).join(' ');
  const srt = typeof parsed?.transcription === 'string' && parsed.transcription.includes('-->')
    ? parsed.transcription
    : '';
  return { text, srt };
};

const analyzeAssetWithGemini = async ({
  apiKey, assetName, assetType, mimeType, size, transcript,
}: {
  apiKey: string; assetName: string; assetType: string; mimeType: string; size: number; transcript: string;
}): Promise<{ description: string; tags: string[] }> => {
  const transcriptExcerpt = transcript ? transcript.slice(0, 500) : 'No transcript available.';
  const prompt = [
    'You are tagging an uploaded media asset for a creative repository.',
    'Return strict JSON only: {"description":"...","tags":["..."]}.',
    `Asset name: ${assetName}`,
    `Asset type: ${assetType}`,
    `MIME type: ${mimeType}`,
    `File size: ${size} bytes`,
    `Transcript excerpt: ${transcriptExcerpt}`,
  ].join('\n');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    }
  );

  if (!res.ok) throw new Error(`Gemini analysis failed with status ${res.status}`);

  const data = await res.json() as any;
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const parsed = extractFirstJsonObject(text);

  return {
    description: typeof parsed?.description === 'string'
      ? parsed.description
      : `Processed ${assetType} asset ${assetName}`,
    tags: Array.isArray(parsed?.tags) && parsed.tags.length > 0
      ? parsed.tags.map((t: unknown) => String(t)).slice(0, 5)
      : buildFallbackTags(assetName, assetType, mimeType),
  };
};

const extractFirstJsonObject = (text: string): any => {
  const markdownMatch = text.match(/```json\s*([\s\S]*?)\s*```/i);
  const candidate = markdownMatch?.[1] || text.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) return null;
  try { return JSON.parse(candidate); } catch { return null; }
};
