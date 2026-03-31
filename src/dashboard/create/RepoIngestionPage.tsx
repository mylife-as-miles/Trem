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
        <div className="flex flex-col h-full overflow-hidden bg-black text-white selection:bg-primary selection:text-black font-mono">
            <TopNavigation onNavigate={onNavigate} />
            <div className="flex-1 overflow-hidden p-8">
                <div className="max-w-6xl mx-auto w-full flex flex-col h-full">

                    {/* Header */}
                    <header className="mb-8 flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-display font-bold tracking-tight text-slate-900 dark:text-white">Create Semantic Repository</h1>
                            <p className="text-slate-500 dark:text-slate-400 mt-2">Powered by Cloudflare Workflows & D1</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${step === 'details' ? 'bg-primary' : 'bg-primary/30'}`}></div>
                            <div className="w-8 h-px bg-slate-300 dark:bg-white/10"></div>
                            <div className={`w-3 h-3 rounded-full ${step === 'uploading' || step === 'ingest' ? 'bg-primary' : 'bg-primary/30'}`}></div>
                            <div className="w-8 h-px bg-slate-300 dark:bg-white/10"></div>
                            <div className={`w-3 h-3 rounded-full ${step === 'completed' ? 'bg-primary' : 'bg-primary/30'}`}></div>
                        </div>
                    </header>

                    {/* Form Content */}
                    <div className="flex-1 overflow-y-auto space-y-10">

                        {/* Step 1: Repo Details */}
                        <section className={`transition-opacity duration-300 ${step !== 'details' && 'hidden'}`}>
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
                                        Creative Brief
                                    </label>
                                    <textarea
                                        value={repoBrief}
                                        onChange={(e) => setRepoBrief(e.target.value)}
                                        placeholder="Describe the goals, tone, and visual style..."
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-4 font-mono text-sm h-32 text-white focus:border-primary focus:outline-none transition-colors resize-none placeholder-zinc-500"
                                    />
                                </div>
                            </div>
                            
                            <div className="mt-8">
                                <h2 className="text-lg font-bold font-display text-slate-900 dark:text-white mb-4">
                                    Source Media
                                </h2>
                                <input 
                                    type="file" 
                                    multiple 
                                    className="hidden" 
                                    ref={fileInputRef} 
                                    onChange={handleFileChange} 
                                    accept="video/*,audio/*,image/*" 
                                />
                                
                                {selectedFiles.length === 0 ? (
                                    <div
                                        onClick={() => fileInputRef.current?.click()}
                                        className="border-2 border-dashed border-zinc-800 rounded-2xl h-48 flex flex-col items-center justify-center gap-4 bg-transparent hover:border-primary/50 cursor-pointer transition-colors"
                                    >
                                        <span className="material-icons-outlined text-4xl text-zinc-600">cloud_upload</span>
                                        <p className="font-mono text-sm text-zinc-600">
                                            Click to select raw footage or audio files
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="flex gap-4">
                                            <button 
                                                onClick={() => fileInputRef.current?.click()}
                                                className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors"
                                            >
                                                Add More Files
                                            </button>
                                            <button 
                                                onClick={() => setSelectedFiles([])}
                                                className="bg-transparent border border-red-900/50 text-red-500 hover:bg-red-950/30 px-4 py-2 rounded-lg font-medium text-sm transition-colors"
                                            >
                                                Clear All
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                            {selectedFiles.map((f, i) => (
                                                <div key={i} className="bg-zinc-900/50 border border-zinc-800 p-3 rounded-lg flex items-center gap-3">
                                                    <span className="material-icons-outlined text-zinc-500 text-sm">
                                                        {f.type.startsWith('video') ? 'movie' : f.type.startsWith('audio') ? 'audiotrack' : 'image'}
                                                    </span>
                                                    <span className="text-sm truncate text-zinc-300 font-medium flex-1">{f.name}</span>
                                                    <span className="text-xs text-zinc-600">{(f.size / 1024 / 1024).toFixed(1)}MB</span>
                                                </div>
                                            ))}
                                        </div>
                                        
                                        <div className="mt-8 flex justify-end">
                                            <button
                                                onClick={handleCreateProject}
                                                disabled={!repoName}
                                                className={`px-6 py-3 rounded-lg font-bold transition-all flex items-center gap-2 
                                                    ${repoName ? 'bg-primary hover:bg-primary_hover text-black shadow-[0_0_15px_rgba(132,204,22,0.3)]' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'}
                                                `}
                                            >
                                                <span className="material-icons-outlined">cloud_upload</span>
                                                Upload & Ingest to Cloudflare
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </section>

                        {/* Step 2 & 3: Uploading & Ingestion */}
                        {(step === 'uploading' || step === 'ingest') && (
                            <section className="space-y-6">
                                <div className="bg-zinc-900/30 border border-zinc-800 rounded-lg p-6 flex flex-col justify-center gap-4">
                                    <div className="flex justify-between items-center">
                                        <div className="text-lg font-bold text-white">
                                            {step === 'uploading' ? 'Uploading Media...' : 'Cloudflare Workflow Running'}
                                        </div>
                                        {projectPayload?.activeJob && (
                                            <div className="text-xs font-mono px-2 py-1 bg-zinc-800 rounded text-amber-400">
                                                {projectPayload.activeJob.status.toUpperCase()}
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                                        <div 
                                            className="h-full bg-primary shadow-[0_0_10px_rgba(132,204,22,0.5)] transition-all duration-300 ease-out" 
                                            style={{ width: `${step === 'uploading' ? uploadProgress : (projectPayload?.liveProgress || projectPayload?.activeJob?.progress || 0)}%` }}
                                        ></div>
                                    </div>
                                </div>

                                {/* Terminal Log */}
                                <div className="bg-[#0c0c0c] border border-zinc-800 rounded-lg p-5 font-mono text-xs h-[400px] overflow-y-auto custom-scrollbar flex flex-col shadow-xl">
                                    <div className="flex items-center gap-2 text-primary mb-4 border-b border-primary/20 pb-2 sticky top-0 bg-[#0c0c0c] z-10 w-full">
                                        <span className="material-icons-outlined text-sm">terminal</span>
                                        <span className="font-bold">CLOUD_WORKER_LOGS</span>
                                    </div>
                                    <div className="space-y-2 pb-4">
                                        {simLogs.map((log: string, i: number) => (
                                            <div key={i} className="text-slate-300 break-words font-mono opacity-90 border-l-2 border-zinc-800 pl-2">
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
                                <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl overflow-hidden">
                                    <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
                                        <h3 className="text-lg font-bold font-display text-white">Repository Initialized</h3>
                                        <div className="flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_10px_rgba(132,204,22,0.5)]"></span>
                                            <span className="text-xs font-mono uppercase tracking-wider text-primary">Commit Ready</span>
                                        </div>
                                    </div>
                                    
                                    <div className="p-6 space-y-6">
                                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                            <div className="p-4 rounded-lg bg-zinc-900 border border-zinc-800 relative group overflow-hidden">
                                                <div className="absolute inset-0 bg-primary/5 group-hover:bg-primary/10 transition-colors"></div>
                                                <div className="text-xs text-zinc-500 font-mono mb-1 relative z-10">Processed Assets</div>
                                                <div className="text-2xl font-bold text-white relative z-10">{stats.items} <span className="text-sm font-normal text-zinc-500">files</span></div>
                                            </div>
                                            <div className="p-4 rounded-lg bg-zinc-900 border border-zinc-800 relative group overflow-hidden">
                                                <div className="absolute inset-0 bg-primary/5 group-hover:bg-primary/10 transition-colors"></div>
                                                <div className="text-xs text-zinc-500 font-mono mb-1 relative z-10">Generated Artifacts</div>
                                                <div className="text-2xl font-bold text-white relative z-10">{stats.artifactsCount} <span className="text-sm font-normal text-zinc-500">files</span></div>
                                            </div>
                                            <div className="p-4 rounded-lg bg-zinc-900 border border-zinc-800 relative group overflow-hidden col-span-2">
                                                <div className="absolute inset-0 bg-primary/5 group-hover:bg-primary/10 transition-colors"></div>
                                                <div className="text-xs text-zinc-500 font-mono mb-1 relative z-10">Project Name</div>
                                                <div className="text-xl font-bold text-primary truncate relative z-10">{projectPayload.project.name}</div>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                                                <label className="text-xs font-mono uppercase text-zinc-500 font-bold">Cloudflare R2 Artifacts</label>
                                                <span className="text-[10px] font-mono text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">D1/R2</span>
                                            </div>
                                            <div className="font-mono text-xs text-zinc-400 space-y-2">
                                                {projectPayload.artifacts?.map((artifact: any, idx: number) => (
                                                    <div key={idx} className="flex items-center justify-between p-2 rounded bg-zinc-900/50 border border-zinc-800/50">
                                                        <div className="flex items-center gap-3">
                                                            <span className="material-icons-outlined text-sm text-primary">description</span>
                                                            <span className="text-zinc-200">{artifact.name}</span>
                                                        </div>
                                                        <span className="text-zinc-600">
                                                            {artifact.size ? `${(artifact.size / 1024).toFixed(1)} KB` : 'Ready'}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="p-6 bg-zinc-900/50 border-t border-zinc-800 flex justify-end">
                                        <button
                                            onClick={() => {
                                                // Ideally, we navigate to the new backend-driven specific repo view
                                                // But since that might not exist yet, we'll navigate back to dashboard
                                                onNavigate('dashboard');
                                            }}
                                            className="bg-primary hover:bg-primary_hover text-black px-6 py-3 rounded-lg font-bold transition-all flex items-center gap-2 transform active:scale-95"
                                        >
                                            <span className="material-icons-outlined">folder</span>
                                            Go to Workspace
                                        </button>
                                    </div>
                                </div>
                            </section>
                        )}
                    </div>

                    {/* Footer Controls */}
                    <div className="mt-8 pt-6 border-t border-zinc-800 flex justify-between">
                        <button onClick={() => onNavigate('dashboard')} className="text-zinc-500 hover:text-white transition-colors font-mono text-sm">
                            Cancel & Discard
                        </button>
                        <div className="text-xs text-zinc-600 font-mono">
                            Trem-AI CF Pipeline v2.0
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default CreateRepoView;
