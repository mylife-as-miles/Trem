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
const MAX_TRANSCRIBE_BYTES = 3 * 1024 * 1024;

export class IngestionWorkflow extends WorkflowEntrypoint<Env, IngestionParams> {
  async run(event: WorkflowEvent<IngestionParams>, step: WorkflowStep) {
    const { projectId, jobId } = event.payload;

    const insertEventLog = async (message: string, level: 'info' | 'warn' | 'error' = 'info') => {
      await this.env.DB.prepare(
        "INSERT INTO event_logs (id, project_id, message, level) VALUES (?, ?, ?, ?)"
      ).bind(crypto.randomUUID(), projectId, message, level).run();
    };

    const updateCoordinator = async (progress: number, message: string) => {
      const doId = this.env.PROJECT_COORDINATOR.idFromName(projectId);
      const stub = this.env.PROJECT_COORDINATOR.get(doId);
      await stub.fetch(new Request('http://do/progress', {
        method: 'POST',
        body: JSON.stringify({ progress, message })
      }));
    };

    const logProgress = async (message: string, progress: number, level: 'info' | 'warn' | 'error' = 'info') => {
      await step.do(`log-${progress}-${level}-${message.slice(0, 24)}`, async () => {
        await insertEventLog(message, level);
        await this.env.DB.prepare(
          "UPDATE jobs SET progress = ? WHERE id = ?"
        ).bind(progress, jobId).run();
        await updateCoordinator(progress, message);
      });
    };

    try {
      const assetsToProcess = await step.do('prepare_assets', async () => {
        await logProgress('Preparing assets for ingestion...', 10);

        await this.env.DB.prepare(
          "UPDATE projects SET status = 'ingesting' WHERE id = ?"
        ).bind(projectId).run();

        await this.env.DB.prepare(
          "UPDATE jobs SET status = 'running' WHERE id = ?"
        ).bind(jobId).run();

        const assetsRes = await this.env.DB.prepare(
          "SELECT * FROM assets WHERE project_id = ? AND status IN ('uploaded', 'pending')"
        ).bind(projectId).all<AssetRow>();

        for (const asset of assetsRes.results) {
          await this.env.DB.prepare(
            "UPDATE assets SET status = 'processing' WHERE id = ?"
          ).bind(asset.id).run();
        }

        return assetsRes.results;
      });

      const processingSummary = await step.do('process_assets', async () => {
        await logProgress(`Processing ${assetsToProcess.length} assets...`, 30);

        let processedCount = 0;
        let errorCount = 0;

        for (const asset of assetsToProcess) {
          try {
            if (!asset.storage_key) {
              throw new Error('Missing storage key');
            }

            const object = await this.env.BUCKET.get(asset.storage_key);
            if (!object) {
              throw new Error(`Asset object not found in R2 for ${asset.storage_key}`);
            }

            const mimeType = object.httpMetadata?.contentType || inferMimeType(asset.name, asset.type);
            const size = object.size;

            let transcript: TranscriptionResult | null = null;
            if (this.env.REPLICATE_API_TOKEN && shouldTranscribe(mimeType, size)) {
              await insertEventLog(`Transcribing ${asset.name}...`);
              transcript = await transcribeWithReplicate(
                await object.arrayBuffer(),
                mimeType,
                this.env.REPLICATE_API_TOKEN
              );
            } else if (isMediaWithAudio(mimeType) && size > MAX_TRANSCRIBE_BYTES) {
              await insertEventLog(
                `Skipped transcription for ${asset.name} because the file exceeds ${MAX_TRANSCRIBE_BYTES} bytes.`,
                'warn'
              );
            }

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
                  description: `Uploaded ${asset.type} asset ${asset.name}`,
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

            processedCount += 1;
            await insertEventLog(`Finished processing ${asset.name}.`);
          } catch (error) {
            errorCount += 1;

            const metadata: AssetMetadata = {
              description: `Processing failed for ${asset.name}`,
              tags: ['error'],
              error: error instanceof Error ? error.message : String(error),
              storageKey: asset.storage_key,
            };

            await this.env.DB.prepare(
              "UPDATE assets SET status = 'error', metadata = ? WHERE id = ?"
            ).bind(JSON.stringify(metadata), asset.id).run();

            await insertEventLog(
              `Failed processing ${asset.name}: ${error instanceof Error ? error.message : String(error)}`,
              'error'
            );
          }
        }

        return { processedCount, errorCount };
      });

      await step.do('repo_synthesis', async () => {
        await logProgress('Synthesizing repository structure...', 80);

        const readyAssetsRes = await this.env.DB.prepare(
          "SELECT name, type, metadata FROM assets WHERE project_id = ? AND status = 'ready'"
        ).bind(projectId).all<{ name: string; type: string; metadata: string | null }>();

        const readyAssets = readyAssetsRes.results.map((asset) => ({
          name: asset.name,
          type: asset.type,
          metadata: parseMetadata(asset.metadata),
        }));

        if (readyAssets.length === 0) {
          await insertEventLog('No assets were ready after processing.', 'warn');
          return;
        }

        const summary = this.env.GEMINI_API_KEY
          ? await synthesizeProjectSummary(this.env.GEMINI_API_KEY, readyAssets)
          : `Prepared ${readyAssets.length} asset(s) for repository commit.`;

        await insertEventLog(`Repository summary: ${summary}`);
      });

      await step.do('finalize', async () => {
        const hasErrors = processingSummary.errorCount > 0;
        const completionMessage = hasErrors
          ? `Ingestion complete with ${processingSummary.errorCount} asset error(s). Ready for review.`
          : 'Ingestion complete. Ready for commit.';

        await logProgress(completionMessage, 100, hasErrors ? 'warn' : 'info');

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
    } catch (error) {
      await step.do('handle_error', async () => {
        const message = error instanceof Error ? error.message : String(error);

        await this.env.DB.prepare(
          "INSERT INTO event_logs (id, project_id, message, level) VALUES (?, ?, ?, 'error')"
        ).bind(crypto.randomUUID(), projectId, `Workflow failed: ${message}`).run();

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

      throw error;
    }
  }
}

const parseMetadata = (metadata: string | null): AssetMetadata => {
  if (!metadata) {
    return {
      description: '',
      tags: [],
    };
  }

  try {
    return JSON.parse(metadata) as AssetMetadata;
  } catch {
    return {
      description: metadata,
      tags: [],
    };
  }
};

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
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const res = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      throw new Error(`Replicate polling failed with status ${res.status}`);
    }

    const prediction = await res.json() as { status: string; output?: any; error?: string };
    if (prediction.status === 'succeeded') {
      return prediction.output;
    }
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
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return { text: parsed, srt: '' };
    }
  }

  const segments = Array.isArray(parsed?.segments) ? parsed.segments : [];
  const text = typeof parsed?.transcription === 'string' && !parsed.transcription.includes('-->')
    ? parsed.transcription
    : segments.map((segment: any) => String(segment.text || '').trim()).join(' ');
  const srt = typeof parsed?.transcription === 'string' && parsed.transcription.includes('-->')
    ? parsed.transcription
    : '';

  return {
    text,
    srt,
  };
};

const analyzeAssetWithGemini = async ({
  apiKey,
  assetName,
  assetType,
  mimeType,
  size,
  transcript,
}: {
  apiKey: string;
  assetName: string;
  assetType: string;
  mimeType: string;
  size: number;
  transcript: string;
}): Promise<{ description: string; tags: string[] }> => {
  const transcriptExcerpt = transcript ? transcript.slice(0, 500) : 'No transcript available.';
  const prompt = [
    'You are tagging an uploaded media asset for a creative repository.',
    'Return strict JSON only in the form {"description":"...","tags":["..."]}.',
    `Asset name: ${assetName}`,
    `Asset type: ${assetType}`,
    `MIME type: ${mimeType}`,
    `File size in bytes: ${size}`,
    `Transcript excerpt: ${transcriptExcerpt}`,
  ].join('\n');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Gemini analysis failed with status ${res.status}`);
  }

  const data = await res.json() as any;
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const parsed = extractFirstJsonObject(text);

  return {
    description: typeof parsed?.description === 'string'
      ? parsed.description
      : `Processed ${assetType} asset ${assetName}`,
    tags: Array.isArray(parsed?.tags) && parsed.tags.length > 0
      ? parsed.tags.map((tag: unknown) => String(tag)).slice(0, 5)
      : buildFallbackTags(assetName, assetType, mimeType),
  };
};

const synthesizeProjectSummary = async (
  apiKey: string,
  assets: Array<{ name: string; type: string; metadata: AssetMetadata }>
): Promise<string> => {
  const context = assets.map((asset) => {
    return [
      `Name: ${asset.name}`,
      `Type: ${asset.type}`,
      `Description: ${asset.metadata.description || 'None'}`,
      `Tags: ${(asset.metadata.tags || []).join(', ') || 'None'}`,
      `Transcript: ${(asset.metadata.transcript || '').slice(0, 200) || 'None'}`
    ].join('\n');
  }).join('\n\n---\n\n');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: [
                  'Summarize this media project in 2 concise sentences for an internal event log.',
                  context,
                ].join('\n\n'),
              },
            ],
          },
        ],
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Gemini synthesis failed with status ${res.status}`);
  }

  const data = await res.json() as any;
  return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || `Prepared ${assets.length} asset(s) for repository commit.`;
};

const extractFirstJsonObject = (text: string): any => {
  const markdownMatch = text.match(/```json\s*([\s\S]*?)\s*```/i);
  const candidate = markdownMatch?.[1] || text.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) return null;

  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
};
