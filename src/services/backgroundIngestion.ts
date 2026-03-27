import { db, AssetData, PendingRepoData } from '../utils/db';
import { create } from 'zustand';

interface BackgroundIngestionState {
    activeJobs: string[];
    setActiveJobs: (jobs: string[]) => void;
}

export const useBackgroundIngestionStore = create<BackgroundIngestionState>((set) => ({
    activeJobs: [],
    setActiveJobs: (jobs) => set({ activeJobs: jobs }),
}));

class BackgroundIngestionService {

    constructor() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', (event) => {
                this.handleMessage(event.data);
            });
        }
        this.syncActiveJobs();
        this.resumeInterruptedJobs();
    }

    private async resumeInterruptedJobs() {
        if (!('serviceWorker' in navigator)) return;

        await navigator.serviceWorker.ready; // Wait for SW active

        const jobs = await db.getAllPendingRepos();
        const interrupted = jobs.filter(j => j.jobStatus === 'ingesting');

        if (interrupted.length > 0) {
            console.log(`[BackgroundIngestion] Resuming ${interrupted.length} interrupted jobs...`);
            interrupted.forEach(job => {
                if (navigator.serviceWorker.controller) {
                    navigator.serviceWorker.controller.postMessage({
                        type: 'START_INGESTION',
                        repoId: job.id
                    });
                }
            });
        }
    }

    private handleMessage(data: any) {
        console.log('[BackgroundIngestion] Received:', data);
        if (data.type === 'JOB_STARTED' || data.type === 'JOB_COMPLETED') {
            this.syncActiveJobs();
        }
    }

    private async syncActiveJobs() {
        const jobs = await db.getAllPendingRepos();
        const active = jobs
            .filter(j => j.jobStatus === 'ingesting')
            .map(j => j.id);
        useBackgroundIngestionStore.getState().setActiveJobs(active);
    }

    async startIngestion(repoId: string, repoData: PendingRepoData) {
        // 1. Save to DB
        await db.addPendingRepo({
            ...repoData,
            jobStatus: 'ingesting',
            createdAt: Date.now()
        });

        // 2. Notify SW
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: 'START_INGESTION',
                repoId
            });
        } else {
            console.warn('Service Worker not ready. Job saved but not started in background.');
            // Fallback: reload page? or just wait?
        }

        this.syncActiveJobs();
    }
}

export const backgroundIngestion = new BackgroundIngestionService();
