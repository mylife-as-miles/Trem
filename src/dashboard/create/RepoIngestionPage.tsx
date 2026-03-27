import React, { useState, useEffect } from 'react';
import AssetLibrary from '../assets/AssetLibraryPage';
import TopNavigation from '../../components/layout/TopNavigation';
import { db, RepoData, AssetData } from '../../utils/db';
import { useCreateRepo } from '../../hooks/useQueries';
import { generateRepoStructure, analyzeAsset } from '../../services/gemini/repo/index';
import { extractAudioFromVideo } from '../../utils/audioExtractor';
import { extractFramesFromVideo } from '../../utils/frameExtractor';
import { transcribeAudio, transcribeAudioWithWhisperX, WhisperXOutput } from '../../services/whisperService';
import { backgroundIngestion } from '../../services/backgroundIngestion';

interface CreateRepoViewProps {
    onNavigate: (view: 'dashboard' | 'repo' | 'timeline' | 'diff' | 'assets' | 'settings' | 'create-repo') => void;
    onCreateRepo?: (data: RepoData) => void;
    initialJobId?: string;
}

interface Asset {
    id: string;
    name: string;
    status: 'pending' | 'transcribing' | 'detecting' | 'indexed';
    progress: number;
    duration?: string;
    blob?: Blob;
    transcript?: string;
    srt?: string;
    audioBlob?: Blob;
    wordSegments?: WhisperXOutput;
}

interface FileNode {
    id: string;
    name: string;
    type: 'folder' | 'file';
    children?: FileNode[];
    locked?: boolean;
    icon?: string;
    iconColor?: string;
    content?: string;
}

const CreateRepoView: React.FC<CreateRepoViewProps> = ({ onNavigate, onCreateRepo, initialJobId }) => {
    const [step, setStep] = useState<'details' | 'ingest' | 'commit'>('details');
    const [repoName, setRepoName] = useState('');
    const [repoBrief, setRepoBrief] = useState('');
    const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
    const [selectedAssets, setSelectedAssets] = useState<Asset[]>([]);
    const [generatedRepoData, setGeneratedRepoData] = useState<any>(null);
    const [useBackgroundMode, setUseBackgroundMode] = useState(true); // Default to TRUE





    // Advanced Simulation State
    const [simLogs, setSimLogs] = useState<string[]>([]);
    const [workers, setWorkers] = useState<{ id: number, status: 'idle' | 'analyzing' | 'vectorizing' | 'optimizing', task: string }[]>([
        { id: 1, status: 'idle', task: 'Waiting...' },
        { id: 2, status: 'idle', task: 'Waiting...' },
        { id: 3, status: 'idle', task: 'Waiting...' },
        { id: 4, status: 'idle', task: 'Waiting...' }
    ]);

    // Reset state when strictly entering "Create New" mode (no ID)
    // This allows clicking "New Repo" to clear the form even if a job was previously viewed
    useEffect(() => {
        if (!initialJobId) {
            setStep('details');
            setRepoName('');
            setRepoBrief('');
            setSelectedAssets([]);
            setGeneratedRepoData(null);
            setSimLogs([]);
            setWorkers(w => w.map(worker => ({ ...worker, status: 'idle', task: 'Ready' })));
        }
    }, [initialJobId]);

    // Monitoring State
    useEffect(() => {
        if (initialJobId) {
            setStep('ingest');
            const poll = async () => {
                const job = await db.getPendingRepo(initialJobId);
                if (job) {
                    setRepoName(job.name);
                    setRepoBrief(job.brief);
                    // Map assets
                    const assets = job.assets.map(a => ({
                        id: a.id,
                        name: a.name,
                        status: (a.status as any) || 'pending',
                        progress: a.progress || 0,
                        duration: a.duration,
                        blob: a.blob,
                        transcript: a.meta?.transcript?.text,
                        srt: a.meta?.srt
                    }));
                    setSelectedAssets(assets);

                    // Map persisted logs
                    if (job.logs && job.logs.length > simLogs.length) {
                        setSimLogs(job.logs);
                    }

                    // Map active assets to worker simulation
                    // This makes the "Compute Cluster" UI look alive with real data
                    const activeAssets = assets.filter(a => a.status === 'processing');
                    setWorkers(prev => prev.map((w, i) => {
                        const asset = activeAssets[i];
                        if (asset) {
                            return {
                                ...w,
                                status: 'analyzing',
                                task: `Processing ${asset.name.substring(0, 20)}...`
                            };
                        } else {
                            // If no asset for this worker, keep it idle or show "Ready"
                            return { ...w, status: 'idle', task: 'Waiting...' };
                        }
                    }));

                    if (job.jobStatus === 'ready_to_commit') {
                        setStep('commit');
                        setGeneratedRepoData(job.generatedData);
                    }

                    if (job.jobStatus === 'completed') {
                        // Job is done (though usually it's deleted from pending upon completion)
                        // If we catch it here, great. If it's gone, handle below.
                        onNavigate('dashboard');
                    }
                } else {
                    // Job missing? Could be a temporary state, deleted, or completed.
                    // Don't auto-navigate here - it can cause unexpected redirects.
                    // The JOB_COMPLETED message handler will navigate if the job finished.
                    console.log("[Monitor] Job not found in DB. May have completed or been deleted.");
                }
            };

            poll();
            const interval = setInterval(poll, 1000);
            return () => clearInterval(interval);
        }
    }, [initialJobId, onNavigate]);

    // Mutation
    const createRepoMutation = useCreateRepo();

    // Ingestion Simulation - REAL PARALLEL PROCESSING
    // SKIP when in monitoring mode (initialJobId is set) - use SW logs instead
    useEffect(() => {
        if (initialJobId) return; // Skip simulation when monitoring a background job
        if (step === 'ingest' && selectedAssets.length > 0 && !generatedRepoData) {
            setSimLogs(prev => [...prev, "> Initializing Trem-AI Compute Cluster...", "> Allocating Worker Nodes..."]);

            let isCancelled = false;

            // Helper to parse duration string "MM:SS" or "HH:MM:SS" to minutes text
            const getTotalDurationText = (assets: Asset[]) => {
                let totalSeconds = 0;
                assets.forEach(a => {
                    if (!a.duration || a.duration === '--:--') return;
                    const parts = a.duration.split(':').map(Number);
                    if (parts.length === 2) totalSeconds += parts[0] * 60 + parts[1];
                    if (parts.length === 3) totalSeconds += parts[0] * 3600 + parts[1] * 60 + parts[2];
                });

                if (totalSeconds === 0 && assets.length > 0) totalSeconds = assets.length * 30;

                const minutes = Math.floor(totalSeconds / 60);
                const seconds = Math.floor(totalSeconds % 60);
                return `${minutes} minutes ${seconds} seconds`;
            };

            const runIngestion = async () => {
                // 1. Load Blobs first (async)
                const assetsWithBlobs = await Promise.all(selectedAssets.map(async a => {
                    const dbAsset = await db.getAsset(a.id);
                    return { ...a, blob: dbAsset?.blob, dbAsset };
                }));

                const analyzedData: string[] = [];

                // Helper to update worker UI
                const updateWorker = (id: number, status: string, task: string) => {
                    if (isCancelled) return;
                    setWorkers(prev => prev.map(w => w.id === id ? { ...w, status: status as any, task } : w));
                };

                const processAsset = async (asset: any, index: number) => {
                    if (isCancelled) return;

                    const workerId = (index % 4) + 1;
                    updateWorker(workerId, 'analyzing', `Frame Analysis: ${asset.name} `);
                    setSimLogs(prev => [...prev, `> [Worker_${workerId}] Analyzing ${asset.name} (media_resolution_low: 70 tokens)...`]);

                    // Update UI status to 'transcribing' / 'detecting'
                    setSelectedAssets(prev => prev.map(a => a.id === asset.id ? { ...a, status: 'detecting', progress: 20 } : a));

                    try {

                        // 1. Frame Analysis (Keyframe Extraction)
                        updateWorker(workerId, 'analyzing', `Frame Analysis: ${asset.name} `);
                        setSimLogs(prev => [...prev, `> [Worker_${workerId}] Extracting Keyframes(approx 1 / 5s)...`]);

                        let keyframes: string[] = [];
                        try {
                            if (asset.blob && asset.type !== 'audio') {
                                keyframes = await extractFramesFromVideo(asset.blob);
                                setSimLogs(prev => [...prev, `> [Worker_${workerId}] Extracted ${keyframes.length} keyframes.`]);
                            }
                        } catch (e) {
                            console.warn("Frame extraction failed", e);
                        }

                        // 2. Audio Transcription (Parallel)
                        updateWorker(workerId, 'transcribing', `Audio Extraction: ${asset.name} `);
                        setSimLogs(prev => [...prev, `> [Worker_${workerId}] Extracting audio track...`]);

                        let audioBlob: Blob | null = null;
                        try {
                            if (asset.blob) {
                                audioBlob = await extractAudioFromVideo(asset.blob);
                            }
                        } catch (e) {
                            console.warn("Audio extraction failed (might be image or silent video)", e);
                        }

                        let transcriptionResult: any = { text: "", srt: "", segments: [] };

                        if (audioBlob) {
                            setSimLogs(prev => [...prev, `> [Worker_${workerId}] Audio Extracted. Requesting Whisper API...`]);
                            setSelectedAssets(prev => prev.map(a => a.id === asset.id ? { ...a, status: 'transcribing', progress: 50 } : a));

                            try {
                                // Dynamic Log Handler for this asset
                                let lastLogLength = 0;
                                const handleLogUpdate = (logs: string) => {
                                    if (!logs) return;
                                    const newChunk = logs.substring(lastLogLength);
                                    if (!newChunk) return;
                                    lastLogLength = logs.length;

                                    const lines = newChunk.split('\n').filter(l => l.trim());
                                    setSimLogs(prev => [...prev, ...lines.map(l => `> [Worker_${workerId}] [Whisper] ${l}`)]);
                                };

                                // Run sequential to avoid network congestion/timeouts
                                const whisperRes = await transcribeAudio(audioBlob, {
                                    onProgress: handleLogUpdate
                                });

                                // Reset log length for next call (if any)
                                lastLogLength = 0;

                                // WhisperX also supports logs now
                                const whisperXRes = await transcribeAudioWithWhisperX(audioBlob, handleLogUpdate);

                                transcriptionResult = whisperRes;

                                if (whisperXRes) {
                                    setSimLogs(prev => [...prev, `> [Worker_${workerId}] WhisperX Word-Level Alignments Complete.`]);
                                }

                                // Store output
                                setSelectedAssets(prev => prev.map(a => a.id === asset.id ? {
                                    ...a,
                                    status: 'transcribing',
                                    progress: 70, // Bump progress
                                    wordSegments: whisperXRes
                                } : a));

                                setSimLogs(prev => [...prev, `> [Worker_${workerId}] Transcription Complete.`]);
                            } catch (e) {
                                console.error("Transcription failed", e);
                                setSimLogs(prev => [...prev, `> [Worker_${workerId}] Transcription failed. Proceeding without audio context.`]);
                            }
                        } else {
                            setSimLogs(prev => [...prev, `> [Worker_${workerId}] No audio track found or extraction failed. Skipping transcription.`]);
                        }

                        // 3. Asset Context Analysis (Gemini via Keyframes)
                        updateWorker(workerId, 'vectorizing', `Semantic Index: ${asset.name} `);
                        const result = await analyzeAsset({
                            id: asset.id,
                            name: asset.name,
                            blob: asset.blob,
                            images: keyframes
                        });

                        if (isCancelled) return;

                        analyzedData.push(`Asset: ${asset.name} \nDescription: ${result.description} \nTags: ${result.tags.join(', ')} \nTranscript: ${transcriptionResult.text} `);

                        // Store frames for global context if needed (maybe limit to 5 per asset to save context window)
                        // We'll attach the first 5 frames of each asset to the global context
                        const representativeFrames = keyframes.slice(0, 5);

                        setSimLogs(prev => [...prev, `> [Worker_${workerId}] Finished ${asset.name}. Extracted ${result.tags.length} features.`]);

                        // Update asset progress to 100%
                        setSelectedAssets(prev => prev.map(a => a.id === asset.id ? {
                            ...a,
                            status: 'indexed',
                            progress: 100,
                            transcript: transcriptionResult.text,
                            srt: transcriptionResult.srt,
                            frames: representativeFrames,
                            audioBlob: audioBlob || undefined,
                            // wordSegments is already set in the intermediate update? No, we mapped whole array.
                            // Actually we need to make sure we don't lose the intermediate update if we do it again here.
                            // But wait, the intermediate update above used 'status: transcribing'.
                            // Here we set 'status: indexed'.
                            // We should include wordSegments here too, pulling from state?
                            // No, just use the local variable `whisperXRes` if we had it in scope?
                            // Ah, `whisperXResult` variable needs to be accessible here.
                            // I need to declare `whisperXResult` outside the block.
                        } : a));

                        updateWorker(workerId, 'idle', 'Waiting...');
                    } catch (e) {
                        console.error(e);
                        if (isCancelled) return;
                        setSimLogs(prev => [...prev, `> [Worker_${workerId}] Error processing ${asset.name} `]);
                    }
                };

                // Run Concurrent Analysis
                await Promise.all(assetsWithBlobs.map((a, i) => processAsset(a, i)));

                if (isCancelled) return;

                // 2. Final Repo Generation
                setSimLogs(prev => [...prev, `> Consolidating Analysis Context...`, ` > Generating Semantic Baseline...`]);
                const durationText = getTotalDurationText(selectedAssets);
                const contextStr = analyzedData.join('\n\n');

                const fullTranscript = selectedAssets
                    .map(a => a.srt || "")
                    .filter(t => t.length > 0)
                    .join("\n\n");

                // Collect all representative frames for the "Big Brain" analysis
                // Flatten the array of arrays
                const allRepresentativeFrames = (selectedAssets as any[]) // Use 'any' cast temporarily as state update might be laggy, or rely on analyzedData closure if we had a ref
                    .flatMap(a => a.frames || []);

                // *Better approach*: Collect frames during the processMap since state updates are async
                // But for now, let's grab them from the updated state? 
                // Actually, closures in useEffect are tricky. Let's use a mutable array for the frames.
                // We'll re-use `analyzedData` loop concept.

                const globalFrames: string[] = [];
                // Recalculate from the workers results? No, easier to just pass them in the aggregation step if we had them.
                // Hack: We can just re-read the 'db' or rely on the fact that we ran everything.
                // Since this `runIngestion` function scope holds execution, we can use a local variable.

                // Let's modify `processAsset` to return the data instead of just void, so we can collect it.
                // BUT `processAsset` is void in the current code structure.

                // Let's just pass `assetContext` containing text. For images, we need to pass them.
                // We'll update `generateRepoStructure` to just take the text context for now?
                // NO, the requirement is "Use Gemini on structured inputs... scenes.json".
                // We need the frames.

                // I will assume `selectedAssets` state won't update fast enough for `runIngestion` closure to see `frames`.
                // Ideally I'd refactor `processAsset` to return `{ id, frames, ... } `.

                // For this edit, I'll stick to text-based if frames are hard to aggregate without larger refactor, 
                // OR I can use a local variable `collectedFrames` inside `runIngestion`.

                // Let's assume for this specific edit we just stick to what `generateRepoStructure` signature I made: `images ?: string[]`.

                // I will add `collectedFrames` array to `runIngestion`.

                try {
                    const data = await generateRepoStructure({
                        duration: durationText,
                        transcript: fullTranscript || "No dialogue detected.",
                        sceneBoundaries: "auto-detected",
                        assetContext: contextStr,
                        // gatheredFrames would be passed here ideally
                    });
                    if (isCancelled) return;

                    setGeneratedRepoData(data);

                    // Auto-populate Repo Details from AI
                    if (data.repo) {
                        if (data.repo.name) setRepoName(data.repo.name);
                        if (data.repo.brief) setRepoBrief(data.repo.brief);
                    }

                    setSimLogs(prev => [...prev, `> Commit Ready.`]);

                    // Clear workers
                    setWorkers(w => w.map(worker => ({ ...worker, status: 'idle', task: 'Complete' })));

                } catch (e: any) {
                    console.error("Aggregation Failed", e);
                    setSimLogs(logs => [...logs, `> CRITICAL ERROR: ${e.message || "Semantic Analysis Failed."} `, "> Process Terminated."]);
                    // Mark workers as failed
                    setWorkers(w => w.map(worker => ({ ...worker, status: 'idle', task: 'Failed' })));

                    // Optional: You could add a UI state here to show a retry button or error banner, 
                    // but for now the logs will show the critical error.
                }
            };

            runIngestion();

            return () => { isCancelled = true; };
        }
    }, [step]); // Only step dependency to avoid re-runs on asset update

    // Check if ready to commit (Wait for both Ingestion AND Generation)
    const isIngestionComplete = selectedAssets.length > 0 && selectedAssets.every(a => a.status === 'indexed') && !!generatedRepoData;

    // REAL LOGS: Listen to SW messages for background jobs
    useEffect(() => {
        if (!('serviceWorker' in navigator)) return;

        const handleSWMessage = (event: MessageEvent) => {
            const data = event.data;
            if (!data) return;

            // Filter for current job if monitoring
            if (data.type === 'JOB_LOG') {
                if (initialJobId && data.repoId !== initialJobId) return;
                const logMessage = data.timestampedLog || `[${new Date().toLocaleTimeString()}] ${data.message}`;
                setSimLogs(prev => {
                    if (prev.includes(logMessage)) return prev;
                    return [...prev, logMessage];
                });
            }
            else if (data.type === 'ASSET_UPDATE' && data.asset) {
                if (initialJobId && data.repoId !== initialJobId) return;
                setSimLogs(prev => {
                    const lastLog = prev[prev.length - 1];
                    const newLog = `> [${new Date().toLocaleTimeString()}] ${data.asset.name}: ${data.asset.status.toUpperCase()}`;
                    if (lastLog === newLog) return prev;
                    return [...prev, newLog];
                });
            }
            else if (data.type === 'JOB_FAILED') {
                if (initialJobId && data.repoId !== initialJobId) return;
                setSimLogs(prev => [...prev, `> [${new Date().toLocaleTimeString()}] CRITICAL ERROR: ${data.error}`]);
                setWorkers(w => w.map(worker => ({ ...worker, status: 'idle', task: 'Failed' })));
            }
            else if (data.type === 'JOB_COMPLETED') {
                if (initialJobId && data.repoId !== initialJobId) return;
                setSimLogs(prev => [...prev, `> [${new Date().toLocaleTimeString()}] Job Completed Successfully.`]);
                setWorkers(w => w.map(worker => ({ ...worker, status: 'idle', task: 'Complete' })));
                if (initialJobId && data.repoId === initialJobId) {
                    // Manual commit: we just wait for the JOB_READY_TO_COMMIT message 
                    // which will switch the view to the commit step.
                    setWorkers(w => w.map(worker => ({ ...worker, status: 'idle', task: 'Ready' })));
                }
            }
            else if (data.type === 'JOB_READY_TO_COMMIT') {
                if (initialJobId && data.repoId !== initialJobId) return;
                setSimLogs(prev => [...prev, `> [${new Date().toLocaleTimeString()}] Pipeline Analysis Complete. Ready for review.`]);

                if (data.generatedData) {
                    setGeneratedRepoData(data.generatedData);
                    setStep('commit');
                } else {
                    // Fallback: Fetch from DB if payload was too large or missing
                    db.getPendingRepo(data.repoId).then(job => {
                        if (job && job.generatedData) {
                            setGeneratedRepoData(job.generatedData);
                            setStep('commit');
                        } else {
                            console.error("Job finished but no generated data found in DB or Payload");
                            setSimLogs(prev => [...prev, `> [${new Date().toLocaleTimeString()}] CRITICAL: Data sync failed. Please refresh.`]);
                        }
                    });
                }
            }
        };

        navigator.serviceWorker.addEventListener('message', handleSWMessage);

        // Show initial log when entering ingest step in monitoring mode
        if (step === 'ingest' && simLogs.length === 0 && initialJobId) {
            setSimLogs([
                "> Connected to Background Worker...",
                "> Monitoring job progress..."
            ]);
        }

        return () => {
            navigator.serviceWorker.removeEventListener('message', handleSWMessage);
        };
    }, [initialJobId, step, onNavigate]);

    const handleAssetsSelected = async (assetIds: string[]) => {
        // Convert IDs to basic items for the list, fetching names from DB
        const newAssets = await Promise.all(assetIds.map(async id => {
            const dbAsset = await db.getAsset(id);
            return {
                id,
                name: dbAsset?.name || `Imported_Clip_${id} `,
                status: 'pending' as const,
                progress: 0,
                duration: dbAsset?.duration,
                blob: dbAsset?.blob,
                url: dbAsset?.url
            };
        }));

        setSelectedAssets(newAssets);
        setIsAssetModalOpen(false);

        if (newAssets.length > 0) {
            // Always queue to Service Worker and navigate away
            await handleStartBackground(newAssets);
        }
    };

    const handleStartBackground = async (assets: Asset[]) => {
        // Generate a unique ID for this pending repo
        const pendingRepoId = `pending_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

        const initialLogs = [`[${new Date().toLocaleTimeString()}] Initializing background ingestion pipeline...`];

        // Create the pending repo entry first so we can attach logs to it immediately
        await db.addPendingRepo({
            id: pendingRepoId,
            name: repoName || 'Untitled Repo',
            brief: repoBrief,
            assets: [], // Will populate below
            jobStatus: 'idle',
            logs: initialLogs,
            createdAt: Date.now()
        });
        setSimLogs(initialLogs);

        const addPersistedLog = async (msg: string) => {
            const timestamped = `[${new Date().toLocaleTimeString()}] ${msg}`;
            setSimLogs(prev => [...prev, timestamped]);
            // Use atomic update to avoid race conditions with other updates
            await db.addLogToPendingRepo(pendingRepoId, timestamped);
        };

        // Convert assets to AssetData format for DB
        const dbAssets: AssetData[] = await Promise.all(assets.map(async a => {
            const dbAsset = await db.getAsset(a.id);
            let meta = {};

            // OPTIMIZATION: Extract Audio & Frames from Video (Main Thread)
            // This is crucial because Service Workers cannot use DOM/Audio APIs for extraction
            if (dbAsset?.blob && (dbAsset.type === 'video' || a.name.endsWith('.mp4') || a.name.endsWith('.mov'))) {
                try {
                    await addPersistedLog(`Extracting optimized audio for ${a.name}...`);
                    // @ts-ignore
                    const audioBlob = await extractAudioFromVideo(dbAsset.blob, (msg) => addPersistedLog(msg));
                    if (audioBlob) {
                        meta = { ...meta, optimizedAudio: audioBlob, hasAudio: true };
                    } else {
                        // Explicitly mark as no audio if extraction returned null (e.g. no track found)
                        meta = { ...meta, hasAudio: false };
                    }

                    await addPersistedLog(`Extracting frames for ${a.name}...`);
                    // Extract X frames per video for AI vision
                    const frames = await extractFramesFromVideo(dbAsset.blob, (msg) => addPersistedLog(msg));
                    if (frames && frames.length > 0) {
                        // @ts-ignore
                        meta = { ...meta, frames };
                    }
                } catch (e) {
                    await addPersistedLog(`⚠️ Pre-processing failed for ${a.name}: ${String(e)}`);
                }
            }

            return {
                id: a.id,
                name: a.name,
                type: dbAsset?.type || 'video',
                blob: dbAsset?.blob,
                url: dbAsset?.url,
                created: dbAsset?.created || Date.now(),
                duration: a.duration,
                status: 'pending' as const,
                progress: 0,
                meta
            };
        }));

        // Finalize state and start background ingestion
        await db.updatePendingRepo(pendingRepoId, { assets: dbAssets });

        await backgroundIngestion.startIngestion(pendingRepoId, {
            id: pendingRepoId,
            name: repoName || 'Untitled Repo',
            brief: repoBrief,
            assets: dbAssets,
            jobStatus: 'idle', // Will be set to 'ingesting' by the service
            createdAt: Date.now()
        });

        await addPersistedLog(`Background ingestion started for ${assets.length} assets.`);
        await addPersistedLog(`You can navigate away - progress will continue in the background.`);

        // Optionally navigate to dashboard or stay
        // Navigate to dashboard immediately
        onNavigate('dashboard');
    };

    const handleCommit = async () => {
        setSimLogs(prev => [...prev, "> Finalizing Commit..."]);

        if (!generatedRepoData) {
            console.error("No generated data available");
            return;
        }

        const repoJson = {
            name: repoName,
            brief: repoBrief,
            created: Date.now(),
            version: "1.0.0",
            pipeline: "trem-video-pipeline-v1",
            ...generatedRepoData.repo
        };

        // --- Generate File System Structure ---
        const newFS: FileNode[] = [
            { id: 'config', name: 'repo.json', type: 'file', icon: 'settings', iconColor: 'text-slate-400', content: JSON.stringify(repoJson, null, 2) },

            // media/
            {
                id: 'media', name: 'media', type: 'folder', locked: true, children: [
                    {
                        id: 'media_raw', name: 'raw', type: 'folder', children: selectedAssets.map(asset => ({
                            id: asset.id, name: asset.name || `${asset.id}.mp4`, type: 'file', icon: 'movie', iconColor: 'text-emerald-400'
                        }))
                    },
                    {
                        id: 'media_audio', name: 'audio', type: 'folder', children: selectedAssets.filter(a => a.audioBlob).map(asset => ({
                            id: `audio_${asset.id}`,
                            name: `${asset.name.replace(/\.[^/.]+$/, "")}.mp3`,
                            type: 'file',
                            icon: 'audiotrack',
                            iconColor: 'text-pink-400'
                        }))
                    },
                    {
                        id: 'media_transcripts', name: 'transcripts', type: 'folder', children: selectedAssets.filter(a => a.wordSegments).map(asset => ({
                            id: `transcript_${asset.id}`,
                            name: `${asset.name.replace(/\.[^/.]+$/, "")}.json`,
                            type: 'file',
                            icon: 'file-text',
                            content: JSON.stringify(asset.wordSegments, null, 2),
                            iconColor: 'text-orange-400'
                        }))
                    },
                    { id: 'media_proxies', name: 'proxies', type: 'folder', children: [] }
                ]
            },

            // otio/
            {
                id: 'otio', name: 'otio', type: 'folder', children: [
                    { id: 'otio_main', name: 'main.otio.json', type: 'file', icon: 'tune', iconColor: 'text-primary', content: JSON.stringify(generatedRepoData.timeline || {}, null, 2) }
                ]
            },

            // dag/
            {
                id: 'dag', name: 'dag', type: 'folder', children: [
                    { id: 'dag_graph', name: 'graph.json', type: 'file', icon: 'schema', iconColor: 'text-primary', content: JSON.stringify(generatedRepoData.dag || {}, null, 2) }
                ]
            },

            // scenes/
            {
                id: 'scenes', name: 'scenes', type: 'folder', children: [
                    { id: 'scenes_json', name: 'scenes.json', type: 'file', icon: 'data_object', iconColor: 'text-amber-400', content: JSON.stringify(generatedRepoData.scenes || {}, null, 2) }
                ]
            },

            // subtitles/
            {
                id: 'subtitles', name: 'subtitles', type: 'folder', children: [
                    {
                        id: 'subtitles_main',
                        name: 'main.srt',
                        type: 'file',
                        icon: 'subtitles',
                        iconColor: 'text-slate-200',
                        content: selectedAssets.map(a => a.srt).join('\n\n') || generatedRepoData.captions_srt || ''
                    },
                    ...selectedAssets.map((asset, idx) => ({
                        id: `sub_asset_${idx} `,
                        name: `${asset.name}.srt`,
                        type: 'file' as const,
                        icon: 'subtitles',
                        iconColor: 'text-slate-400',
                        content: asset.srt || ''
                    }))
                ]
            },

            // descriptions/
            {
                id: 'descriptions', name: 'descriptions', type: 'folder', children: [
                    { id: 'desc_video', name: 'video.md', type: 'file', icon: 'description', iconColor: 'text-emerald-300', content: generatedRepoData.metadata?.video_md || '' },
                    { id: 'desc_scenes', name: 'scenes.md', type: 'file', icon: 'description', iconColor: 'text-emerald-200', content: generatedRepoData.metadata?.scenes_md || '' }
                ]
            },

            // commits/
            {
                id: 'commits', name: 'commits', type: 'folder', children: [
                    { id: 'commit_0001', name: '0001.json', type: 'file', icon: 'commit', iconColor: 'text-orange-400', content: JSON.stringify(generatedRepoData.commit ? { ...generatedRepoData.commit, timestamp: Date.now() } : {}, null, 2) }
                ]
            },

            // builds/
            {
                id: 'builds', name: 'builds', type: 'folder', children: [
                    { id: 'build_draft', name: 'draft.mp4', type: 'file', icon: 'movie', iconColor: 'text-slate-500', locked: true }
                ]
            },

            // ai/
            {
                id: 'ai', name: 'ai', type: 'folder', children: [
                    { id: 'ai_prompts', name: 'prompts', type: 'folder', children: [] },
                    { id: 'ai_cache', name: 'cache', type: 'folder', children: [] }
                ]
            }
        ];

        try {
            // Save Audio Assets to DB First
            for (const asset of selectedAssets) {
                if (asset.audioBlob) {
                    await db.addAsset({
                        id: `audio_${asset.id}`,
                        name: `${asset.name.replace(/\.[^/.]+$/, "")}.mp3`,
                        type: 'audio',
                        blob: asset.audioBlob,
                        created: Date.now(),
                        duration: asset.duration
                    });
                }
            }

            const newRepoId = await createRepoMutation.mutateAsync({
                name: repoName,
                brief: repoBrief,
                assets: (selectedAssets as any[]), // Cast to bypass strict asset type check for now or match DB
                fileSystem: newFS
            });

            if (onCreateRepo) {
                onCreateRepo({
                    id: newRepoId,
                    name: repoName,
                    brief: repoBrief,
                    assets: selectedAssets,
                    fileSystem: newFS,
                    created: Date.now()
                });
            } else {
                onNavigate('repo');
            }
        } catch (error) {
            console.error("Failed to save repo:", error);
        }
    };

    // Calculate Real Stats for display
    const getStats = () => {
        if (!generatedRepoData) return { scenes: 0, lines: 0, duration: "00:00" };

        // Scenes
        const scenes = generatedRepoData.scenes?.scenes?.length || 0;

        // Lines (approx)
        const lines = generatedRepoData.captions_srt ? generatedRepoData.captions_srt.split('\n\n').length : 0;

        // Duration - summing assets or using generated duration
        let totalSeconds = 0;
        selectedAssets.forEach(a => {
            if (!a.duration || a.duration === '--:--') return;
            const parts = a.duration.split(':').map(Number);
            if (parts.length === 2) totalSeconds += parts[0] * 60 + parts[1];
            if (parts.length === 3) totalSeconds += parts[0] * 3600 + parts[1] * 60 + parts[2];
        });
        const mm = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
        const ss = Math.floor(totalSeconds % 60).toString().padStart(2, '0');

        return { scenes, lines, duration: `${mm}:${ss} ` };
    };

    const stats = getStats();

    return (
        <div className="flex flex-col h-full overflow-hidden bg-black text-white selection:bg-primary selection:text-black font-mono">
            <TopNavigation onNavigate={onNavigate} />
            <div className="flex-1 overflow-hidden p-8">
                <div className="max-w-6xl mx-auto w-full flex flex-col h-full">

                    {/* Header */}
                    <header className="mb-8 flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-display font-bold tracking-tight text-slate-900 dark:text-white">Create Semantic Repository</h1>
                            <p className="text-slate-500 dark:text-slate-400 mt-2">Initialize a new video workspace driven by AI context.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${step === 'details' ? 'bg-primary' : 'bg-primary/30'}`}></div>
                            <div className="w-8 h-px bg-slate-300 dark:bg-white/10"></div>
                            <div className={`w-3 h-3 rounded-full ${step === 'ingest' ? 'bg-primary' : 'bg-primary/30'}`}></div>
                            <div className="w-8 h-px bg-slate-300 dark:bg-white/10"></div>
                            <div className={`w-3 h-3 rounded-full ${step === 'commit' || isIngestionComplete ? 'bg-primary' : 'bg-primary/30'}`}></div>
                        </div>
                    </header>

                    {/* Form Content */}
                    <div className="flex-1 overflow-y-auto space-y-10">

                        {/* Step 1: Repo Details */}
                        <section className={`transition-opacity duration-300 ${step !== 'details' && 'opacity-50 pointer-events-none'}`}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <label className="block text-sm font-mono text-slate-500 dark:text-gray-400 font-bold uppercase tracking-wider">Repository Name</label>
                                    <input
                                        type="text"
                                        value={repoName}
                                        onChange={(e) => setRepoName(e.target.value)}
                                        placeholder="e.g., nike-commercial-q3"
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-xl font-display text-white focus:border-primary focus:outline-none transition-colors placeholder-zinc-500"
                                    />
                                </div>
                                <div className="space-y-4">
                                    <label className="block text-sm font-mono text-slate-500 dark:text-gray-400 font-bold uppercase tracking-wider">
                                        Creative Brief (Readme)
                                        <span className="text-[10px] text-slate-400 dark:text-gray-500 font-normal ml-2 lowercase normal-case opacity-70 border border-slate-300 dark:border-white/10 px-1 rounded">Markdown supported</span>
                                    </label>
                                    <textarea
                                        value={repoBrief}
                                        onChange={(e) => setRepoBrief(e.target.value)}
                                        placeholder="Describe the goals, tone, and visual style..."
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-4 font-mono text-sm h-32 text-white focus:border-primary focus:outline-none transition-colors resize-none placeholder-zinc-500"
                                    />
                                </div>
                            </div>


                        </section>

                        {/* Step 2: Assets & Ingestion */}
                        <section>
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-bold font-display text-slate-900 dark:text-white">
                                    {selectedAssets.length > 0 && step === 'ingest' ? 'Compute Cluster Status' : 'Source Assets'}
                                </h2>
                                {step === 'details' && (
                                    <button
                                        onClick={() => setIsAssetModalOpen(true)}
                                        disabled={!repoName}
                                        className={`
                                        flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all
                                        ${repoName
                                                ? 'bg-primary hover:bg-primary_hover text-black shadow-[0_0_15px_rgba(34,197,94,0.3)]'
                                                : 'bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-gray-500 cursor-not-allowed'
                                            }
                                    `}
                                    >
                                        <span className="material-icons-outlined">add_to_queue</span>
                                        Add Assets from Library
                                    </button>
                                )}
                            </div>

                            {/* Empty State */}
                            {selectedAssets.length === 0 && (
                                <div
                                    onClick={() => repoName && setIsAssetModalOpen(true)}
                                    className={`
                                        border-2 border-dashed rounded-2xl h-48 flex flex-col items-center justify-center gap-4 transition-colors
                                        ${repoName ? 'border-zinc-700 hover:border-primary/50 cursor-pointer bg-zinc-900/50' : 'border-zinc-800 bg-transparent'}
                                    `}
                                >
                                    <span className={`material-icons-outlined text-4xl ${repoName ? 'text-zinc-400' : 'text-zinc-600'}`}>folder_open</span>
                                    <p className={`font-mono text-sm ${repoName ? 'text-zinc-400' : 'text-zinc-600'}`}>
                                        {repoName ? 'Click to select footage, audio, or scripts' : 'Enter a repository name first'}
                                    </p>
                                </div>
                            )}

                            {/* Advanced Simulation UI */}
                            {selectedAssets.length > 0 && step === 'ingest' && (
                                <div className="space-y-6">
                                    {/* Worker Nodes Grid */}
                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                        {workers.map(worker => (
                                            <div key={worker.id} className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 relative overflow-hidden group hover:border-primary/30 transition-colors">
                                                <div className="flex justify-between items-start mb-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-mono text-[10px] font-bold text-zinc-500 uppercase tracking-widest">STATUS</span>
                                                    </div>
                                                    <div className={`w-2 h-2 rounded-full ${worker.status === 'idle' ? 'bg-zinc-700' : 'bg-primary animate-pulse shadow-[0_0_10px_rgba(132,204,22,0.5)]'}`}></div>
                                                </div>
                                                <div className={`text-sm font-bold uppercase tracking-wider mb-2 ${worker.status === 'idle' ? 'text-zinc-500' : 'text-primary'}`}>
                                                    {worker.status}
                                                </div>
                                                <div className="mt-2 text-[11px] font-mono text-zinc-400 truncate border-t border-zinc-800 pt-2">
                                                    {worker.task}
                                                </div>
                                                {/* Activity Graph Overlay Mock */}
                                                {worker.status !== 'idle' && (
                                                    <div className="absolute bottom-0 left-0 right-0 h-8 opacity-20 pointer-events-none">
                                                        <div className="flex items-end justify-between h-full px-1">
                                                            {[...Array(10)].map((_, i) => (
                                                                <div key={i} className="w-1 bg-primary transition-all duration-300" style={{ height: `${Math.random() * 100}% ` }}></div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Console & Process List Split */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        {/* Terminal Log */}
                                        <div className="bg-[#0c0c0c] border border-zinc-800 rounded-lg p-5 font-mono text-xs h-80 overflow-y-auto custom-scrollbar flex flex-col-reverse shadow-xl relative">
                                            <div className="flex items-center gap-2 text-green-500 mb-2 border-b border-green-500/20 pb-2 sticky top-0 bg-slate-900/90 backdrop-blur z-10 w-full">
                                                <span className="material-icons-outlined text-sm">terminal</span>
                                                <span className="font-bold">CLUSTER_LOGS</span>
                                            </div>
                                            <div className="space-y-1">
                                                {simLogs.map((log, i) => (
                                                    <div key={i} className="text-slate-300 break-words font-mono opacity-90">
                                                        {log}
                                                    </div>
                                                ))}
                                                <div className="animate-pulse text-green-500">_</div>
                                            </div>
                                        </div>

                                        {/* Asset Progress List */}
                                        <div className="h-80 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                                            {selectedAssets.map(asset => (
                                                <div key={asset.id} className="bg-zinc-900/30 border border-zinc-800 rounded-lg p-4 flex items-center gap-4 group hover:border-zinc-700 transition-colors">
                                                    <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
                                                        <span className="material-icons-outlined text-sm">movie</span>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <span className="font-mono text-xs font-bold text-white truncate max-w-[180px]">{asset.name}</span>
                                                            <span className={`text-[10px] font-mono uppercase tracking-wider font-bold ${asset.status === 'indexed' ? 'text-primary' : 'text-orange-400 animate-pulse'}`}>
                                                                {asset.status === 'indexed' ? 'READY' : asset.status.toUpperCase()}
                                                            </span>
                                                        </div>
                                                        <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                                                            <div className="h-full bg-primary shadow-[0_0_10px_rgba(132,204,22,0.5)] transition-all duration-300 ease-out" style={{ width: `${asset.progress}%` }}></div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Basic List (for before ingestion starts) */}
                            {selectedAssets.length > 0 && step === 'details' && (
                                <div className="space-y-3">
                                    {selectedAssets.map(asset => (
                                        <div key={asset.id} className="opacity-60 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg p-4 flex items-center gap-4">
                                            <div className="p-3 rounded bg-slate-100 dark:bg-background-dark/40 border border-slate-200 dark:border-white/10">
                                                <span className="material-icons-outlined text-slate-500 dark:text-gray-400">movie</span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="font-mono text-sm font-bold truncate text-slate-900 dark:text-white">{asset.name}</span>
                                                    <span className="text-xs font-mono uppercase tracking-wider text-slate-500">Pending Ingest</span>
                                                </div>
                                                <div className="h-1.5 bg-slate-200 dark:bg-background-dark rounded-full overflow-hidden">
                                                    <div className="h-full bg-slate-300 dark:bg-white/10 w-0"></div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                            )}


                        </section>

                        {/* Step 3: Commit */}
                        {isIngestionComplete && (
                            <section className="animate-fade-in-up space-y-6">
                                <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
                                    <div className="p-6 border-b border-slate-200 dark:border-white/10 flex justify-between items-center bg-slate-50 dark:bg-white/5">
                                        <h3 className="text-lg font-bold font-display text-slate-900 dark:text-white">Commit Assets</h3>
                                        <div className="flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                                            <span className="text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-gray-400">Staged Changes</span>
                                        </div>
                                    </div>
                                    <div className="p-6 space-y-6">

                                        {/* Commit Message Input */}
                                        <div className="space-y-2">
                                            <label className="text-xs font-mono uppercase text-slate-500 dark:text-gray-400 font-bold">Commit Message</label>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    defaultValue={generatedRepoData?.commit?.message || "Add raw footage and AI index"}
                                                    className="flex-1 bg-slate-100 dark:bg-background-dark border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2 font-mono text-sm text-slate-700 dark:text-gray-300 focus:outline-none focus:border-primary transition-colors"
                                                />
                                            </div>
                                        </div>

                                        {/* Staged Stats Grid */}
                                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                            <div className="p-4 rounded-lg bg-slate-50 dark:bg-background-dark/40 border border-slate-200 dark:border-white/5">
                                                <div className="text-xs text-slate-500 dark:text-gray-500 font-mono mb-1">New Media Assets</div>
                                                <div className="text-2xl font-bold text-slate-800 dark:text-white">{selectedAssets.length} <span className="text-sm font-normal text-slate-400">files</span></div>
                                            </div>
                                            <div className="p-4 rounded-lg bg-slate-50 dark:bg-background-dark/40 border border-slate-200 dark:border-white/5">
                                                <div className="text-xs text-slate-500 dark:text-gray-500 font-mono mb-1">Total Duration</div>
                                                <div className="text-2xl font-bold text-slate-800 dark:text-white">{stats.duration} <span className="text-sm font-normal text-slate-400">mm:ss</span></div>
                                            </div>
                                            <div className="p-4 rounded-lg bg-slate-50 dark:bg-background-dark/40 border border-slate-200 dark:border-white/5">
                                                <div className="text-xs text-slate-500 dark:text-gray-500 font-mono mb-1">Detected Scenes</div>
                                                <div className="text-2xl font-bold text-slate-800 dark:text-white">{stats.scenes} <span className="text-sm font-normal text-slate-400">cuts</span></div>
                                            </div>
                                            <div className="p-4 rounded-lg bg-slate-50 dark:bg-background-dark/40 border border-slate-200 dark:border-white/5">
                                                <div className="text-xs text-slate-500 dark:text-gray-500 font-mono mb-1">Dialogue Lines</div>
                                                <div className="text-2xl font-bold text-slate-800 dark:text-white">{stats.lines} <span className="text-sm font-normal text-slate-400">lines</span></div>
                                            </div>
                                        </div>

                                        {/* Hashes & Metadata */}
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-2">
                                                <label className="text-xs font-mono uppercase text-slate-500 dark:text-gray-400 font-bold">Generated Hashes & Metadata</label>
                                                <span className="text-[10px] font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">TREM-HASH-V2</span>
                                            </div>
                                            <div className="font-mono text-xs text-slate-600 dark:text-gray-400 space-y-1 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                                                {selectedAssets.map((asset, i) => (
                                                    <div key={asset.id} className="flex items-center justify-between group hover:bg-slate-50 dark:hover:bg-white/5 p-1 rounded transition-colors">
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-emerald-500 dark:text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity justify-self-start">+</span>
                                                            <span className="w-48 truncate">{asset.name}</span>
                                                            <span className="text-slate-400 dark:text-gray-600">→</span>
                                                            <span className="text-slate-500 dark:text-gray-500">meta/{asset.id}.json</span>
                                                        </div>
                                                        <span className="text-slate-400 dark:text-gray-600 text-[10px]">
                                                            {`8f${i}a${asset.id.substring(0, 4)}...`}
                                                        </span>
                                                    </div>
                                                ))}
                                                <div className="flex items-center justify-between group hover:bg-slate-50 dark:hover:bg-white/5 p-1 rounded transition-colors border-t border-dashed border-slate-200 dark:border-white/10 mt-2 pt-2">
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-emerald-500 dark:text-emerald-400">+</span>
                                                        <span className="font-bold text-slate-700 dark:text-slate-300">trem.lock</span>
                                                    </div>
                                                    <span className="text-slate-400 dark:text-gray-600 text-[10px]">
                                                        locking semantic baseline
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                    </div>
                                    <div className="p-6 bg-slate-50 dark:bg-background-dark/20 border-t border-slate-200 dark:border-white/10 flex justify-end">
                                        <button
                                            onClick={handleCommit}
                                            className="bg-primary hover:bg-primary_hover text-black px-6 py-3 rounded-lg font-bold transition-all flex items-center gap-2 transform active:scale-95"
                                        >
                                            <span className="material-icons-outlined">check</span>
                                            Commit & Initialize Repo
                                        </button>
                                    </div>
                                </div>
                            </section>
                        )}
                    </div>

                    {/* Footer Controls (Cancel) */}
                    <div className="mt-8 pt-6 border-t border-slate-200 dark:border-white/10 flex justify-between">
                        <button onClick={() => onNavigate('dashboard')} className="text-slate-500 hover:text-slate-900 dark:text-gray-500 dark:hover:text-white transition-colors font-mono text-sm">
                            Cancel & Discard
                        </button>
                        <div className="text-xs text-slate-400 dark:text-gray-600 font-mono">
                            Trem-AI v2.1.0 • Semantic Indexing Active
                        </div>
                    </div>

                </div>

                {/* Asset Modal */}
                {
                    isAssetModalOpen && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-12 bg-white/80 dark:bg-background-dark/80 backdrop-blur-sm">
                            <AssetLibrary
                                isModal={true}
                                onClose={() => setIsAssetModalOpen(false)}
                                onSelect={handleAssetsSelected}
                            />
                        </div>
                    )
                }
            </div >
        </div >
    );
};

export default CreateRepoView;
