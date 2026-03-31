import React, { useState, useEffect, useRef } from 'react';
import TopNavigation from '../../components/layout/TopNavigation';
import { 
    useCreateCFProject, 
    useStartIngestion, 
    useProjectPayload 
} from '../../hooks/useQueries';
import { apiClient } from '../../api-client';

interface CreateRepoViewProps {
    onNavigate: (view: 'dashboard' | 'repo' | 'timeline' | 'diff' | 'assets' | 'settings' | 'create-repo' | string) => void;
    initialJobId?: string;
}

const formatFileSize = (bytes: number) => {
    if (!bytes) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex += 1;
    }

    return `${size >= 10 || unitIndex === 0 ? Math.round(size) : size.toFixed(1)} ${units[unitIndex]}`;
};

const getFileIcon = (type: string) => {
    if (type.startsWith('video')) return 'movie';
    if (type.startsWith('audio')) return 'audiotrack';
    return 'image';
};

export const CreateRepoView: React.FC<CreateRepoViewProps> = ({ onNavigate, initialJobId }) => {
    // Current Step: 'details' -> 'uploading' -> 'ingest' -> 'completed'
    const [step, setStep] = useState<'details' | 'uploading' | 'ingest' | 'completed'>('details');
    
    // Form State
    const [repoName, setRepoName] = useState('');
    const [repoBrief, setRepoBrief] = useState('');
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Upload Progress
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadStatus, setUploadStatus] = useState('');

    // Active Project Tracking
    const [activeProjectId, setActiveProjectId] = useState<string | null>(initialJobId || null);
    
    // Mutations
    const createProjectMutation = useCreateCFProject();
    const startIngestionMutation = useStartIngestion();

    // Polling Status (only active if activeProjectId is set)
    const { data: projectPayload } = useProjectPayload(activeProjectId || undefined);

    // Initialization check for directly viewing a job
    useEffect(() => {
        if (initialJobId) {
            setActiveProjectId(initialJobId);
            setStep('ingest');
        } else {
            // Reset state
            setStep('details');
            setRepoName('');
            setRepoBrief('');
            setSelectedFiles([]);
            setUploadProgress(0);
            setActiveProjectId(null);
        }
    }, [initialJobId]);

    // Background job state monitoring
    useEffect(() => {
        if (projectPayload) {
            if (projectPayload.activeJob?.status === 'completed') {
                setStep('completed');
            } else if (projectPayload.activeJob?.status === 'failed') {
                // Optionally handle failure explicitly, but for now we'll just show it in the ingest UI
            } else {
                setStep('ingest');
            }
        }
    }, [projectPayload]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setSelectedFiles(Array.from(e.target.files));
        }
    };

    const handleCreateProject = async () => {
        if (!repoName || selectedFiles.length === 0) return;

        setStep('uploading');
        setUploadStatus('Initializing project...');
        setUploadProgress(0);

        try {
            // 1. Create Project
            const project = await createProjectMutation.mutateAsync({
                name: repoName,
                brief: repoBrief
            });
            setActiveProjectId(project.id);
            onNavigate(`create-repo/${project.id}`);

            // 2. Upload Assets Sequencing
            let uploaded = 0;
            for (const file of selectedFiles) {
                setUploadStatus(`Uploading ${file.name}...`);
                await apiClient.createAsset(project.id, file.name, file.type, file);
                uploaded++;
                setUploadProgress((uploaded / selectedFiles.length) * 100);
            }

            // 3. Start Ingestion
            setUploadStatus('Starting Cloudflare Workflow...');
            await startIngestionMutation.mutateAsync(project.id);
            
            // Move to monitoring
            setStep('ingest');

        } catch (error) {
            console.error("Failed to create project", error);
            setUploadStatus(`Error: ${error instanceof Error ? error.message : 'Upload failed'}`);
        }
    };

    // Calculate Real Stats for display when completed
    const getStats = () => {
        if (!projectPayload) return { scenes: 0, items: 0, artifactsCount: 0 };
        return { 
            scenes: 0, 
            items: projectPayload.assets?.length || 0,
            artifactsCount: projectPayload.artifacts?.length || 0
        };
    };

    const stats = getStats();
    const totalSelectedSize = selectedFiles.reduce((sum, file) => sum + file.size, 0);
    const persistedAssetSize = projectPayload?.assets?.reduce((sum: number, asset: any) => sum + (asset.size || asset.file_size || 0), 0) || 0;
    const stagedFileCount = selectedFiles.length || projectPayload?.assets?.length || 0;
    const stagedFileSize = totalSelectedSize || persistedAssetSize;
    const selectedVideoCount = selectedFiles.filter((file) => file.type.startsWith('video')).length;
    const selectedAudioCount = selectedFiles.filter((file) => file.type.startsWith('audio')).length;
    const selectedImageCount = selectedFiles.filter((file) => file.type.startsWith('image')).length;
    const currentProgress = step === 'uploading'
        ? uploadProgress
        : (projectPayload?.liveProgress || projectPayload?.activeJob?.progress || 0);
    const currentWorkflowLabel = step === 'details'
        ? 'Ready to stage'
        : step === 'uploading'
            ? 'Uploading media'
            : step === 'ingest'
                ? (projectPayload?.activeJob?.status || 'processing')
                : 'Commit ready';
    const journeySteps = [
        {
            key: 'details',
            label: 'Define',
            description: 'Name the repository and frame the brief.',
            active: step === 'details',
            complete: step !== 'details',
        },
        {
            key: 'ingest',
            label: 'Ingest',
            description: 'Upload source media and run the workflow.',
            active: step === 'uploading' || step === 'ingest',
            complete: step === 'completed',
        },
        {
            key: 'completed',
            label: 'Commit',
            description: 'Review artifacts and move into the workspace.',
            active: step === 'completed',
            complete: false,
        },
    ];
    
    // Construct simulation logs from actual DB logs
    const simLogs = projectPayload?.logs?.map((l: any) => `[${new Date(l.created_at || Date.now()).toLocaleTimeString()}] ${l.message}`) || [];
    if (uploadStatus && step === 'uploading') {
        simLogs.push(`> ${uploadStatus}`);
    }

    return (
        <div className="flex h-full flex-col overflow-hidden bg-slate-50 text-slate-900 selection:bg-primary selection:text-black dark:bg-background-dark dark:text-white">
            <TopNavigation onNavigate={onNavigate} activeTab="create" />
            <main className="flex-1 overflow-y-auto bg-slate-50/50 p-6 dark:bg-background-dark md:p-10">
                <div className="mx-auto flex w-full max-w-6xl flex-col space-y-10 pb-10">
                    <div className="space-y-6 py-8 text-center md:py-12">
                        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium tracking-wide text-emerald-600 dark:text-primary">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse"></span>
                            CLOUDFLARE REPOSITORY INGESTION
                        </div>

                        <h1 className="text-5xl font-display font-bold tracking-tight text-slate-900 dark:text-white md:text-7xl">
                            Create a <span className="text-primary">semantic repo</span>
                        </h1>

                        <p className="mx-auto max-w-2xl text-lg font-light leading-relaxed text-slate-500 dark:text-gray-400 md:text-xl">
                            Stage the brief, upload the source media, and let Trem initialize the repository before you move into the workspace.
                        </p>

                        <div className="flex flex-wrap justify-center gap-2 pt-2">
                            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 dark:border-border-dark dark:bg-surface-card dark:text-gray-300">
                                <span className="h-1.5 w-1.5 rounded-full bg-primary"></span>
                                {stagedFileCount} queued files
                            </div>
                            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 dark:border-border-dark dark:bg-surface-card dark:text-gray-300">
                                <span className="h-1.5 w-1.5 rounded-full bg-primary"></span>
                                {formatFileSize(stagedFileSize)} source volume
                            </div>
                            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium capitalize text-slate-600 dark:border-border-dark dark:bg-surface-card dark:text-gray-300">
                                <span className="h-1.5 w-1.5 rounded-full bg-primary"></span>
                                {currentWorkflowLabel}
                            </div>
                        </div>
                    </div>

                    <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white/75 shadow-xl dark:border-border-dark dark:bg-surface-card/85">
                        <div className="flex flex-col gap-5 border-b border-slate-200/70 bg-slate-50/70 px-5 py-5 dark:border-border-dark dark:bg-background-dark/50 md:px-6">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                                <div className="max-w-2xl">
                                    <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">Repository Workflow</h2>
                                    <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-gray-400">
                                        Keep the setup calm and explicit: define the repository, stage the source set, then monitor the workflow until artifacts are ready.
                                    </p>
                                </div>
                                <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.18em] text-slate-500 dark:border-border-dark dark:bg-surface-card dark:text-gray-400">
                                    {activeProjectId ? `Project ${activeProjectId.slice(0, 8)}` : 'No live project yet'}
                                </div>
                            </div>

                            <div className="grid gap-3 md:grid-cols-3">
                                {journeySteps.map((item, index) => (
                                    <div
                                        key={item.key}
                                        className={`rounded-2xl border px-4 py-4 transition-colors ${item.active ? 'border-primary/40 bg-primary/10' : item.complete ? 'border-slate-200 bg-white dark:border-border-dark dark:bg-surface-card' : 'border-slate-200/80 bg-white/70 dark:border-border-dark dark:bg-background-dark/30'}`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`flex h-9 w-9 items-center justify-center rounded-full border text-sm font-display font-bold ${item.active ? 'border-primary bg-primary text-black' : item.complete ? 'border-primary/40 bg-primary/10 text-primary' : 'border-slate-200 bg-slate-100 text-slate-500 dark:border-border-dark dark:bg-background-dark dark:text-gray-400'}`}>
                                                {index + 1}
                                            </div>
                                            <div>
                                                <div className="text-sm font-display font-bold tracking-tight text-slate-900 dark:text-white">{item.label}</div>
                                                <div className="mt-1 text-xs leading-5 text-slate-500 dark:text-gray-400">{item.description}</div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="grid gap-6 p-5 md:p-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                            <div className="space-y-8">

                        {/* Step 1: Repo Details */}
                        <section className={`transition-opacity duration-300 ${step !== 'details' && 'hidden'}`}>
                            <div className="space-y-8">
                                <div className="grid gap-6 md:grid-cols-2">
                                    <div className="space-y-3">
                                        <label className="block text-sm font-bold uppercase tracking-wider text-slate-400 dark:text-gray-500">Repository Name</label>
                                        <input
                                            type="text"
                                            value={repoName}
                                            onChange={(e) => setRepoName(e.target.value)}
                                            placeholder="e.g., nike-commercial-q3"
                                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-xl font-display tracking-tight text-slate-900 transition-colors placeholder:text-slate-400 focus:border-primary focus:outline-none dark:border-border-dark dark:bg-background-dark dark:text-white dark:placeholder:text-gray-500"
                                        />
                                        <p className="text-sm leading-6 text-slate-500 dark:text-gray-400">
                                            Use a short project slug the team will recognize in the workspace and artifact list.
                                        </p>
                                    </div>

                                    <div className="space-y-3">
                                        <label className="block text-sm font-bold uppercase tracking-wider text-slate-400 dark:text-gray-500">
                                            Creative Brief
                                        </label>
                                        <textarea
                                            value={repoBrief}
                                            onChange={(e) => setRepoBrief(e.target.value)}
                                            placeholder="Describe the goals, tone, references, delivery format, and any constraints..."
                                            className="h-40 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm leading-6 text-slate-900 transition-colors placeholder:text-slate-400 focus:border-primary focus:outline-none dark:border-border-dark dark:bg-background-dark dark:text-white dark:placeholder:text-gray-500"
                                        />
                                        <p className="text-sm leading-6 text-slate-500 dark:text-gray-400">
                                            The clearer this brief is, the more useful the first repository pass becomes.
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                                        <div>
                                            <h3 className="text-lg font-display font-bold tracking-tight text-slate-900 dark:text-white">Source Media</h3>
                                            <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">
                                                Bring in the footage, stills, or audio that should seed this repository.
                                            </p>
                                        </div>
                                        {selectedFiles.length > 0 && (
                                            <div className="flex flex-wrap gap-2">
                                                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.18em] text-slate-500 dark:border-border-dark dark:bg-background-dark dark:text-gray-400">
                                                    {selectedVideoCount} video
                                                </div>
                                                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.18em] text-slate-500 dark:border-border-dark dark:bg-background-dark dark:text-gray-400">
                                                    {selectedAudioCount} audio
                                                </div>
                                                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.18em] text-slate-500 dark:border-border-dark dark:bg-background-dark dark:text-gray-400">
                                                    {selectedImageCount} image
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <input
                                        type="file"
                                        multiple
                                        className="hidden"
                                        ref={fileInputRef}
                                        onChange={handleFileChange}
                                        accept="video/*,audio/*,image/*"
                                    />

                                    {selectedFiles.length === 0 ? (
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            className="group flex h-56 w-full flex-col items-center justify-center gap-4 rounded-[24px] border border-dashed border-slate-300 bg-slate-50/70 px-6 text-center transition-all duration-300 hover:-translate-y-0.5 hover:border-primary hover:bg-primary/5 dark:border-border-dark dark:bg-background-dark/40 dark:hover:bg-primary/10"
                                        >
                                            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-105">
                                                <span className="material-icons-outlined text-3xl">cloud_upload</span>
                                            </div>
                                            <div className="space-y-2">
                                                <p className="text-base font-display font-bold tracking-tight text-slate-900 dark:text-white">
                                                    Drop in your source set
                                                </p>
                                                <p className="mx-auto max-w-md text-sm leading-6 text-slate-500 dark:text-gray-400">
                                                    Select raw footage, stills, audio, or mixed reference material. Trem will stage everything into one repository pass.
                                                </p>
                                            </div>
                                        </button>
                                    ) : (
                                        <div className="space-y-4">
                                            <div className="flex flex-wrap gap-3">
                                                <button
                                                    onClick={() => fileInputRef.current?.click()}
                                                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-all duration-200 ease-out hover:border-primary/40 hover:text-slate-900 active:scale-95 dark:border-border-dark dark:bg-background-dark dark:text-gray-300 dark:hover:text-white"
                                                >
                                                    <span className="material-icons-outlined text-base">add</span>
                                                    Add More Files
                                                </button>
                                                <button
                                                    onClick={() => setSelectedFiles([])}
                                                    className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 transition-all duration-200 ease-out hover:bg-red-100 active:scale-95 dark:border-red-950/60 dark:bg-red-950/20 dark:text-red-400 dark:hover:bg-red-950/30"
                                                >
                                                    <span className="material-icons-outlined text-base">delete_sweep</span>
                                                    Clear All
                                                </button>
                                            </div>

                                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                                {selectedFiles.map((file, index) => (
                                                    <div
                                                        key={`${file.name}-${index}`}
                                                        className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-border-dark dark:bg-background-dark"
                                                    >
                                                        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 dark:border-border-dark dark:bg-surface-card dark:text-gray-400">
                                                            <span className="material-icons-outlined text-lg">{getFileIcon(file.type)}</span>
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="truncate text-sm font-medium text-slate-900 dark:text-white">{file.name}</div>
                                                            <div className="mt-1 text-[11px] font-mono uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">
                                                                {formatFileSize(file.size)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4 dark:border-border-dark dark:bg-background-dark/50 lg:flex-row lg:items-center lg:justify-between">
                                                <div>
                                                    <div className="text-sm font-display font-bold tracking-tight text-slate-900 dark:text-white">
                                                        Ready to upload {selectedFiles.length} file{selectedFiles.length === 1 ? '' : 's'}
                                                    </div>
                                                    <div className="mt-1 text-sm text-slate-500 dark:text-gray-400">
                                                        The repository will be created first, then each source asset will stream into the workflow.
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={handleCreateProject}
                                                    disabled={!repoName}
                                                    className={`inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-display font-bold tracking-wide transition-all duration-200 ease-out active:scale-95 ${repoName ? 'bg-primary text-black shadow-[0_0_20px_rgba(217,248,95,0.22)] hover:bg-primary_hover' : 'cursor-not-allowed bg-slate-200 text-slate-400 dark:bg-border-dark dark:text-gray-500'}`}
                                                >
                                                    <span className="material-icons-outlined text-base">cloud_upload</span>
                                                    Upload & Ingest
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </section>

                        {/* Step 2 & 3: Uploading & Ingestion */}
                        {(step === 'uploading' || step === 'ingest') && (
                            <section className="space-y-6">
                                <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-6 dark:border-border-dark dark:bg-background-dark/50">
                                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                        <div>
                                            <div className="text-lg font-display font-bold tracking-tight text-slate-900 dark:text-white">
                                                {step === 'uploading' ? 'Uploading source media' : 'Cloudflare workflow running'}
                                            </div>
                                            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-gray-400">
                                                {step === 'uploading'
                                                    ? 'Trem is pushing your staged files into the repository one by one.'
                                                    : 'The ingestion workflow is extracting the first semantic pass and writing artifacts back to storage.'}
                                            </p>
                                        </div>
                                        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.18em] text-primary">
                                            <span className="h-2 w-2 rounded-full bg-primary animate-pulse"></span>
                                            {(projectPayload?.activeJob?.status || currentWorkflowLabel).toUpperCase()}
                                        </div>
                                    </div>

                                    <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-border-dark">
                                        <div
                                            className="h-full bg-primary shadow-[0_0_14px_rgba(217,248,95,0.35)] transition-all duration-300 ease-out"
                                            style={{ width: `${currentProgress}%` }}
                                        ></div>
                                    </div>

                                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-border-dark dark:bg-surface-card">
                                            <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">Progress</div>
                                            <div className="mt-2 text-2xl font-display font-bold tracking-tight text-slate-900 dark:text-white">
                                                {Math.round(currentProgress)}%
                                            </div>
                                        </div>
                                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-border-dark dark:bg-surface-card">
                                            <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">Queued Files</div>
                                            <div className="mt-2 text-2xl font-display font-bold tracking-tight text-slate-900 dark:text-white">
                                                {stagedFileCount}
                                            </div>
                                        </div>
                                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-border-dark dark:bg-surface-card">
                                            <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">Project</div>
                                            <div className="mt-2 truncate text-sm font-medium text-slate-900 dark:text-white">
                                                {projectPayload?.project?.name || repoName || 'Initializing repository'}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Terminal Log */}
                                <div className="flex h-[420px] flex-col overflow-y-auto rounded-[24px] border border-slate-200 bg-[#0c0c0c] p-5 font-mono text-xs shadow-xl dark:border-border-dark">
                                    <div className="sticky top-0 z-10 mb-4 flex w-full items-center gap-2 border-b border-primary/20 bg-[#0c0c0c] pb-2 text-primary">
                                        <span className="material-icons-outlined text-sm">terminal</span>
                                        <span className="font-bold">CLOUD_WORKER_LOGS</span>
                                    </div>
                                    <div className="space-y-2 pb-4">
                                        {simLogs.map((log: string, i: number) => (
                                            <div key={i} className="break-words border-l-2 border-zinc-800 pl-2 font-mono text-slate-300 opacity-90">
                                                {log}
                                            </div>
                                        ))}
                                        {projectPayload?.activeJob?.status === 'failed' && (
                                            <div className="text-red-500 break-words font-mono font-bold mt-4">
                                                CRITICAL ERROR: {projectPayload.activeJob.error}
                                            </div>
                                        )}
                                        <div className="animate-pulse text-primary mt-2">_</div>
                                    </div>
                                </div>
                            </section>
                        )}

                        {/* Step 4: Completed */}
                        {step === 'completed' && projectPayload && (
                            <section className="animate-fade-in-up space-y-6">
                                <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50/80 dark:border-border-dark dark:bg-background-dark/50">
                                    <div className="flex flex-col gap-4 border-b border-slate-200/70 bg-white/60 p-5 dark:border-border-dark dark:bg-surface-card/70 md:flex-row md:items-center md:justify-between md:p-6">
                                        <div>
                                            <h3 className="text-lg font-display font-bold tracking-tight text-slate-900 dark:text-white">Repository initialized</h3>
                                            <p className="mt-2 text-sm text-slate-500 dark:text-gray-400">
                                                Your source set has been staged and the first artifacts are ready for the next workspace step.
                                            </p>
                                        </div>
                                        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.18em] text-primary">
                                            <span className="h-2 w-2 rounded-full bg-primary animate-pulse"></span>
                                            Commit Ready
                                        </div>
                                    </div>

                                    <div className="space-y-6 p-5 md:p-6">
                                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 dark:border-border-dark dark:bg-surface-card">
                                                <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">Processed Assets</div>
                                                <div className="mt-2 text-2xl font-display font-bold tracking-tight text-slate-900 dark:text-white">
                                                    {stats.items} <span className="text-sm font-normal text-slate-400 dark:text-gray-500">files</span>
                                                </div>
                                            </div>
                                            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 dark:border-border-dark dark:bg-surface-card">
                                                <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">Generated Artifacts</div>
                                                <div className="mt-2 text-2xl font-display font-bold tracking-tight text-slate-900 dark:text-white">
                                                    {stats.artifactsCount} <span className="text-sm font-normal text-slate-400 dark:text-gray-500">files</span>
                                                </div>
                                            </div>
                                            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 dark:border-border-dark dark:bg-surface-card sm:col-span-2 xl:col-span-1">
                                                <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">Project Name</div>
                                                <div className="mt-2 truncate text-lg font-display font-bold tracking-tight text-primary">
                                                    {projectPayload.project.name}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between border-b border-slate-200 pb-2 dark:border-border-dark">
                                                <label className="text-xs font-mono font-bold uppercase text-slate-400 dark:text-gray-500">Cloudflare Artifacts</label>
                                                <span className="rounded border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-mono text-primary">D1 / R2</span>
                                            </div>

                                            <div className="space-y-2 font-mono text-xs text-slate-500 dark:text-gray-400">
                                                {(projectPayload.artifacts?.length || 0) > 0 ? (
                                                    projectPayload.artifacts?.map((artifact: any, idx: number) => (
                                                        <div key={idx} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 py-3 dark:border-border-dark dark:bg-surface-card">
                                                            <div className="flex items-center gap-3">
                                                                <span className="material-icons-outlined text-sm text-primary">description</span>
                                                                <span className="text-slate-800 dark:text-slate-200">{artifact.name}</span>
                                                            </div>
                                                            <span className="text-slate-400 dark:text-gray-500">
                                                                {artifact.size ? `${(artifact.size / 1024).toFixed(1)} KB` : 'Ready'}
                                                            </span>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-500 dark:border-border-dark dark:bg-background-dark dark:text-gray-400">
                                                        Artifacts are still being indexed for display.
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex justify-end border-t border-slate-200/70 bg-white/60 p-5 dark:border-border-dark dark:bg-surface-card/70 md:p-6">
                                        <button
                                            onClick={() => {
                                                onNavigate('dashboard');
                                            }}
                                            className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-display font-bold tracking-wide text-black transition-all duration-200 ease-out hover:bg-primary_hover active:scale-95"
                                        >
                                            <span className="material-icons-outlined text-base">folder</span>
                                            Go to Workspace
                                        </button>
                                    </div>
                                </div>
                            </section>
                        )}
                    </div>

                    <aside className="space-y-4">
                        <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5 dark:border-border-dark dark:bg-background-dark/50">
                            <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">Current Snapshot</div>
                            <div className="mt-4 space-y-4">
                                <div>
                                    <div className="text-sm font-display font-bold tracking-tight text-slate-900 dark:text-white">
                                        {repoName || projectPayload?.project?.name || 'Untitled repository'}
                                    </div>
                                    <div className="mt-1 text-sm text-slate-500 dark:text-gray-400">
                                        {repoBrief || 'Add a brief to guide the first semantic pass.'}
                                    </div>
                                </div>
                                <div className="grid gap-3">
                                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-border-dark dark:bg-surface-card">
                                        <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">Files</div>
                                        <div className="mt-2 text-xl font-display font-bold tracking-tight text-slate-900 dark:text-white">{stagedFileCount}</div>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-border-dark dark:bg-surface-card">
                                        <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">Volume</div>
                                        <div className="mt-2 text-xl font-display font-bold tracking-tight text-slate-900 dark:text-white">{formatFileSize(stagedFileSize)}</div>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-border-dark dark:bg-surface-card">
                                        <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">Workflow</div>
                                        <div className="mt-2 text-sm font-medium capitalize text-slate-900 dark:text-white">{currentWorkflowLabel}</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5 dark:border-border-dark dark:bg-background-dark/50">
                            <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">What Happens Next</div>
                            <div className="mt-4 space-y-4">
                                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-border-dark dark:bg-surface-card">
                                    <div className="text-sm font-display font-bold tracking-tight text-slate-900 dark:text-white">1. Create project record</div>
                                    <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-gray-400">Trem opens the repository and assigns the active Cloudflare workflow context.</p>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-border-dark dark:bg-surface-card">
                                    <div className="text-sm font-display font-bold tracking-tight text-slate-900 dark:text-white">2. Stream source media</div>
                                    <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-gray-400">Each file is uploaded in sequence so the workflow can begin with a complete source set.</p>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-border-dark dark:bg-surface-card">
                                    <div className="text-sm font-display font-bold tracking-tight text-slate-900 dark:text-white">3. Review the first pass</div>
                                    <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-gray-400">Artifacts land back in the repository so you can continue in the workspace without re-uploading.</p>
                                </div>
                            </div>
                        </div>
                    </aside>
                </div>

                <div className="flex flex-col gap-3 border-t border-slate-200/70 bg-slate-50/70 px-5 py-4 dark:border-border-dark dark:bg-background-dark/50 sm:flex-row sm:items-center sm:justify-between md:px-6">
                    <button
                        onClick={() => onNavigate('dashboard')}
                        className="text-left text-sm font-medium text-slate-500 transition-colors hover:text-slate-900 dark:text-gray-400 dark:hover:text-white"
                    >
                        Cancel & Discard
                    </button>
                    <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">
                        Trem-AI CF Pipeline v2.0
                    </div>
                </div>
            </section>
                </div>
            </main>
        </div>
    );
};

export default CreateRepoView;
