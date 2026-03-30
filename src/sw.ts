/// <reference lib="webworker" />
import { db, IngestionJob } from './utils/db';
import { transcribeAudio } from './services/whisperService';
import { analyzeAsset, generateRepoStructure } from './services/gemini/repo/index';

declare const self: ServiceWorkerGlobalScope & {
    __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

const manifest = self.__WB_MANIFEST;
if (manifest) {
    console.log('SW manifest injected', manifest);
}

self.addEventListener('install', (event) => {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

class JobManager {
    private processingJobs = new Set<string>();

    async addJob(job: IngestionJob) {
        await this.processJob(job.repoId);
    }

    async processJob(repoId: string) {
        if (this.processingJobs.has(repoId)) {
            console.log(`[SW] Job ${repoId} already processing.`);
            return;
        }

        this.processingJobs.add(repoId);

        try {
            let repo = await db.getPendingRepo(repoId);
            if (!repo || repo.jobStatus === 'completed' || repo.jobStatus === 'ready_to_commit') {
                return;
            }

            this.broadcast({ type: 'JOB_STARTED', repoId });

            const pendingAssets = repo.assets.filter((asset) => asset.status !== 'ready');

            for (const asset of pendingAssets) {
                await this.processSingleAsset(repoId, asset);
            }

            repo = await db.getPendingRepo(repoId);
            if (!repo) {
                throw new Error('Repo disappeared during processing');
            }

            await this.log(repoId, 'Generating semantic repository structure...');

            const analyzedData = repo.assets
                .map((asset) => {
                    return `Asset: ${asset.name}\nDescription: ${asset.meta?.analysis?.description}\nTags: ${asset.tags?.join(', ')}\nTranscript: ${asset.meta?.transcription?.text}`;
                })
                .join('\n\n');

            const fullTranscript = repo.assets
                .map((asset) => asset.meta?.srt || '')
                .filter(Boolean)
                .join('\n\n');

            const globalFrames = repo.assets.flatMap((asset) => (asset.meta?.frames || []).slice(0, 2));

            const generatedData = await generateRepoStructure(
                {
                    duration: 'Auto-detected',
                    transcript: fullTranscript || 'No dialogue detected.',
                    sceneBoundaries: 'auto-detected',
                    assetContext: analyzedData,
                    images: globalFrames,
                },
                async (message) => this.log(repoId, message),
            );

            await db.updatePendingRepo(repoId, {
                jobStatus: 'ready_to_commit',
                generatedData,
            });

            this.broadcast({
                type: 'JOB_READY_TO_COMMIT',
                repoId,
                generatedData,
            });

            await this.log(repoId, 'Pipeline analysis complete. Ready for review.');
        } catch (error) {
            console.error(`[SW] Error processing job ${repoId}`, error);
            await this.log(repoId, `Critical error: ${String(error)}`);
            this.broadcast({ type: 'JOB_FAILED', repoId, error: String(error) });
        } finally {
            this.processingJobs.delete(repoId);
        }
    }

    private async processSingleAsset(repoId: string, asset: any) {
        try {
            await db.updatePendingAsset(repoId, asset.id, { status: 'processing' });
            this.broadcast({ type: 'ASSET_UPDATE', repoId, asset: { ...asset, status: 'processing' } });

            const audioBlob = (asset.meta?.optimizedAudio as Blob | undefined) || asset.blob;
            const hasAudio = asset.meta?.hasAudio !== false;

            let transcription = asset.meta?.transcription;

            if (hasAudio && audioBlob && (asset.type === 'video' || asset.type === 'audio')) {
                await this.log(repoId, `Transcribing ${asset.name}...`);
                transcription = await transcribeAudio(audioBlob);

                await db.updatePendingAsset(repoId, asset.id, {
                    meta: { ...asset.meta, transcription, srt: transcription.srt },
                });
            }

            if (asset.blob) {
                await this.log(repoId, `Analyzing ${asset.name}...`);
                const analysis = await analyzeAsset({
                    id: asset.id,
                    name: asset.name,
                    blob: asset.blob,
                    images: asset.meta?.frames,
                });

                await db.updatePendingAsset(repoId, asset.id, {
                    tags: analysis.tags,
                    meta: {
                        ...asset.meta,
                        analysis,
                        transcription,
                    },
                    status: 'ready',
                    progress: 100,
                });

                this.broadcast({ type: 'ASSET_UPDATE', repoId, asset: { ...asset, status: 'ready', progress: 100 } });
                await this.log(repoId, `${asset.name}: analysis complete.`);
            }
        } catch (error) {
            console.error(`[SW] Asset ${asset.name} failed`, error);
            await db.updatePendingAsset(repoId, asset.id, {
                status: 'error',
                meta: { ...asset.meta, error: String(error) },
            });
            await this.log(repoId, `${asset.name} failed: ${String(error)}`);
            this.broadcast({ type: 'ASSET_UPDATE', repoId, asset: { ...asset, status: 'error' } });
        }
    }

    private async log(repoId: string, message: string) {
        const timestampedLog = `[${new Date().toLocaleTimeString()}] ${message}`;
        await db.addLogToPendingRepo(repoId, timestampedLog);
        this.broadcast({ type: 'JOB_LOG', repoId, message, timestampedLog });
    }

    private broadcast(message: any) {
        self.clients.matchAll().then((clients) => {
            clients.forEach((client) => client.postMessage(message));
        });
    }
}

const jobManager = new JobManager();

self.addEventListener('message', (event) => {
    if (event.data?.type === 'START_INGESTION') {
        jobManager.processJob(event.data.repoId);
    }
});
