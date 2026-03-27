/// <reference lib="webworker" />
import { db, IngestionJob, PendingRepoData } from './utils/db';
import { transcribeAudio, generateSRT } from './services/whisperService';
import { analyzeAsset, generateRepoStructure } from './services/gemini/repo/index';

// Type declaration for workbox manifest
declare const self: ServiceWorkerGlobalScope & {
    __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// @ts-ignore
const manifest = self.__WB_MANIFEST;
if (manifest) {
    // Prevent tree-shaking
    console.log('SW Manifest injected', manifest);
}

// cleanup old caches
const CACHE_NAME = 'trem-ai-cache-v1';

self.addEventListener('install', (event) => {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// Job Queue Manager
class JobManager {
    private isProcessing = false;
    private processingJobs = new Set<string>();

    async addJob(job: IngestionJob) {
        await this.processJob(job.repoId);
    }

    async processJob(repoId: string) {
        if (this.processingJobs.has(repoId)) {
            console.log(`[SW] Job ${repoId} already actively processing. Ignoring duplicate start request.`);
            return;
        }

        this.processingJobs.add(repoId);

        try {
            // 1. Get Repo Data
            let repo = await db.getPendingRepo(repoId);
            if (!repo || repo.jobStatus === 'completed' || repo.jobStatus === 'ready_to_commit') {
                this.processingJobs.delete(repoId);
                return;
            }

            console.log(`[SW] Starting ingestion for ${repo.name}`);
            this.broadcast({ type: 'JOB_STARTED', repoId });

            // 2. Parallel Asset Processing (Batch Size: 3)
            const BATCH_SIZE = 3;
            // Filter pending assets
            const pendingAssets = repo.assets.filter(a => a.status !== 'ready');

            for (let i = 0; i < pendingAssets.length; i += BATCH_SIZE) {
                const batch = pendingAssets.slice(i, i + BATCH_SIZE);
                await this.log(repoId, `⚡ Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(pendingAssets.length / BATCH_SIZE)}...`);

                await Promise.all(batch.map(asset => this._processSingleAsset(repoId, asset)));
            }

            // 3. Final Repo Generation (Big Brain Analysis)
            // CRITICAL: Re-fetch repo to get latest updates from all parallel workers
            repo = await db.getPendingRepo(repoId);
            if (!repo) throw new Error("Repo Disappeared during processing");

            await this.log(repoId, `📝 Generating semantic repository structure...`);

            // Consolidate context for Repo Generation
            const analyzedData: string[] = repo.assets.map(a =>
                `Asset: ${a.name}\nDescription: ${a.meta?.analysis?.description}\nTags: ${a.tags?.join(', ')}\nTranscript: ${a.meta?.transcription?.text}`
            );

            const fullTranscript = repo.assets
                .map(a => a.meta?.srt || "")
                .filter(t => t.length > 0)
                .join("\n\n");

            // Collect frames for global analysis (limit to 2 per asset to stay in context limits)
            const globalFrames = repo.assets.flatMap(a => (a.meta?.frames || []).slice(0, 2));

            try {
                // Pass log callback for Streaming updates
                const generatedData = await generateRepoStructure({
                    duration: "Auto-detected",
                    transcript: fullTranscript || "No dialogue detected.",
                    sceneBoundaries: "auto-detected",
                    assetContext: analyzedData.join('\n\n'),
                    images: globalFrames
                }, async (msg) => {
                    // Streaming Log Handler
                    await this.log(repoId, msg);
                });

                // Update job to ready state
                await db.updatePendingRepo(repoId, {
                    jobStatus: 'ready_to_commit',
                    generatedData
                });

                this.broadcast({
                    type: 'JOB_READY_TO_COMMIT',
                    repoId,
                    generatedData
                });

                await this.log(repoId, `✅ Pipeline analysis complete. Ready for review!`);

            } catch (genErr) {
                console.error("[SW] Repo Generation Failed", genErr);
                await this.log(repoId, `⚠️ AI Structure Generation failed, but assets are ready.`);

                await db.updatePendingRepo(repoId, {
                    jobStatus: 'ready_to_commit',
                    generatedData: { error: "Generation failed" }
                });

                this.broadcast({ type: 'JOB_READY_TO_COMMIT', repoId });
            }
        } catch (e) {
            console.error(`[SW] Error processing job ${repoId}`, e);
            this.broadcast({ type: 'JOB_FAILED', repoId, error: String(e) });
            await this.log(repoId, `CRITICAL ERROR: ${String(e)}`);
        } finally {
            this.processingJobs.delete(repoId);
        }
    }

    private async _processSingleAsset(repoId: string, asset: any) {
        try {
            // Update status (Atomic)
            await db.updatePendingAsset(repoId, asset.id, { status: 'processing' });
            // Broadcast locally updated state for UI
            this.broadcast({ type: 'ASSET_UPDATE', repoId, asset: { ...asset, status: 'processing' } });

            console.log(`[SW] Processing asset ${asset.name} (${asset.type})`);

            // 1. Transcribe
            // @ts-ignore
            const audioBlob = (asset.meta?.optimizedAudio as Blob) || asset.blob;
            // @ts-ignore
            const hasAudio = asset.meta?.hasAudio !== false;

            let transcription = asset.meta?.transcription;

            if (hasAudio && audioBlob && (asset.type === 'video' || asset.type === 'audio')) {
                if (audioBlob.size < 100) {
                    await this.log(repoId, `⚠️ ${asset.name}: No audio track detected.`);
                } else {
                    await this.log(repoId, `🎤 Transcribing ${asset.name}...`);
                    try {
                        // @ts-ignore
                        const standard = await transcribeAudio(audioBlob);
                        transcription = standard;

                        await db.updatePendingAsset(repoId, asset.id, {
                            meta: { ...asset.meta, transcription: standard, srt: standard.srt }
                        });
                    } catch (transcribeError) {
                        console.warn(`[SW] Transcription failed for ${asset.name}`, transcribeError);
                        await this.log(repoId, `⚠️ ${asset.name}: Transcription failed.`);
                    }
                }
            }

            // 2. Analyze Content (Gemini)
            if (asset.blob) {
                await this.log(repoId, `🔍 Analyzing ${asset.name}...`);
                // @ts-ignore
                const analysis = await analyzeAsset({
                    id: asset.id,
                    name: asset.name,
                    blob: asset.blob,
                    // @ts-ignore
                    images: asset.meta?.frames
                });

                await this.log(repoId, `✅ ${asset.name}: Analysis complete.`);

                // Atomic Update
                await db.updatePendingAsset(repoId, asset.id, {
                    tags: analysis.tags,
                    meta: {
                        ...asset.meta,
                        analysis,
                        transcription // Re-save ensuring both stick
                    },
                    status: 'ready',
                    progress: 100
                });

                this.broadcast({ type: 'ASSET_UPDATE', repoId, asset: { ...asset, status: 'ready', progress: 100 } });
            }

        } catch (e) {
            console.error(`[SW] Asset ${asset.name} failed`, e);
            await this.log(repoId, `❌ ${asset.name} failed: ${String(e)}`);

            await db.updatePendingAsset(repoId, asset.id, {
                status: 'error',
                meta: { ...asset.meta, error: String(e) }
            });

            this.broadcast({ type: 'ASSET_UPDATE', repoId, asset: { ...asset, status: 'error' } });
        }
    }

    private async log(repoId: string, message: string) {
        // Atomic Log Append
        await db.addLogToPendingRepo(repoId, `[${new Date().toLocaleTimeString()}] ${message}`);
        this.broadcast({ type: 'JOB_LOG', repoId, message, timestampedLog: `[${new Date().toLocaleTimeString()}] ${message}` });
    }

    private broadcast(message: any) {
        self.clients.matchAll().then(clients => {
            clients.forEach(client => client.postMessage(message));
        });
    }
}

const jobManager = new JobManager();

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'START_INGESTION') {
        const repoId = event.data.repoId;
        jobManager.processJob(repoId);
    }
});
