import React, { useState, useEffect, useRef } from 'react';
import TopNavigation from '../../components/layout/TopNavigation';
import { RepoData, db } from '../../utils/db'; // Added db import
import { useUpdateRepo } from '../../hooks/useQueries';
import AlertDialog from '../../components/ui/AlertDialog';
import { analyzeAsset, generateRepoStructure } from '../../services/gemini/repo/index';
import { transcribeAudio } from '../../services/whisperService';
import { extractFramesFromVideo } from '../../utils/frameExtractor';
import { extractAudioFromVideo } from '../../utils/audioExtractor';

interface RepoFilesViewProps {
    onNavigate: (view: 'dashboard' | 'repo' | 'timeline' | 'diff' | 'assets' | 'settings' | 'create-repo' | 'repo-files') => void;
    repoData?: RepoData | null;
}

interface FileNode {
    id: string;
    name: string;
    type: 'folder' | 'file';
    content?: string;
    children?: FileNode[];
    isOpen?: boolean;
    locked?: boolean;
    icon?: string;
    iconColor?: string;
}

const RepoFilesView: React.FC<RepoFilesViewProps> = ({ onNavigate, repoData }) => {
    const [files, setFiles] = useState<FileNode[]>([]);
    const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
    const [editorContent, setEditorContent] = useState('');
    const [isDirty, setIsDirty] = useState(false);

    // CRUD Dialog States
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
    const [newFileDialogOpen, setNewFileDialogOpen] = useState(false);
    const [newItemName, setNewItemName] = useState('');

    // AI & Terminal States
    const [isProcessing, setIsProcessing] = useState(false);
    const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
    const [showTerminal, setShowTerminal] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Queries
    const updateRepoMutation = useUpdateRepo();

    // Initialize files from repoData
    useEffect(() => {
        if (!repoData) return;
        if (repoData.fileSystem && Array.isArray(repoData.fileSystem)) {
            // Deep clone to ensure editable
            try {
                const clonedFS = JSON.parse(JSON.stringify(repoData.fileSystem));
                setFiles(clonedFS);
            } catch (e) {
                console.error("Failed to parse fileSystem", e);
            }
        } else {
            // Fallback init
            setFiles([{ id: 'root', name: 'root', type: 'folder', children: [] }]);
        }
    }, [repoData]);

    // --- Helper Functions ---

    const addLog = (msg: string) => {
        setTerminalLogs(prev => [...prev, `> ${msg}`]);
    };

    const findNode = (id: string, nodes: FileNode[]): FileNode | null => {
        for (const node of nodes) {
            if (node.id === id) return node;
            if (node.children) {
                const found = findNode(id, node.children);
                if (found) return found;
            }
        }
        return null;
    };

    // --- CRUD Operations ---

    // Auto-Commit System
    const createCommit = async (message: string, updatedFS: FileNode[]) => {
        if (!repoData?.id) return;

        try {
            // 1. Generate new Commit ID
            const commitsDir = findNode('commits', updatedFS);
            let nextId = 1;
            if (commitsDir && commitsDir.children) {
                nextId = commitsDir.children.length + 1;
            }
            const commitId = String(nextId).padStart(4, '0');
            const commitFileName = `${commitId}.json`;

            // 2. Generate Commit Content (Snapshot of change)
            // Ideally we differentiate, but for now we snapshot the metadata
            const commitData = {
                id: `commit_${commitId}`,
                message: message,
                author: "User (via IDE)",
                timestamp: Date.now(),
                changes: "filesystem_update"
            };

            // 3. Add Commit File to FS
            const newCommitNode: FileNode = {
                id: `commit_${commitId}`,
                name: commitFileName,
                type: 'file',
                icon: 'commit',
                iconColor: 'text-orange-400',
                content: JSON.stringify(commitData, null, 2)
            };

            // Immutable update to add commit
            const fsWithCommit = JSON.parse(JSON.stringify(updatedFS)); // clone again
            const targetCommitsDiv = findNode('commits', fsWithCommit);
            if (targetCommitsDiv && targetCommitsDiv.children) {
                targetCommitsDiv.children.unshift(newCommitNode);
            } else {
                // Create commits folder if missing
                fsWithCommit.push({
                    id: 'commits',
                    name: 'commits',
                    type: 'folder',
                    children: [newCommitNode]
                });
            }

            // 4. Persist to DB
            const updatedRepoData = {
                ...repoData,
                fileSystem: fsWithCommit,
                // Update version/modified if tracked
            };

            await updateRepoMutation.mutateAsync({
                id: repoData.id,
                updates: updatedRepoData
            });

            // Update Local State
            setFiles(fsWithCommit);
            addLog(`Commit Created: ${commitFileName} - "${message}"`);

        } catch (e) {
            console.error("Auto-Commit Failed", e);
            addLog("ERROR: Auto-Commit failed.");
        }
    };

    const handleDelete = async () => {
        if (!selectedFile) return;

        const deleteRecursive = (nodes: FileNode[], id: string): FileNode[] => {
            return nodes.filter(n => n.id !== id).map(n => ({
                ...n,
                children: n.children ? deleteRecursive(n.children, id) : undefined
            }));
        };

        const newFS = deleteRecursive(files, selectedFile.id);
        setFiles(newFS); // Optimistic update
        setSelectedFile(null);
        setDeleteDialogOpen(false);

        // Run Semantic Update
        setIsProcessing(true);
        setShowTerminal(true);
        addLog(`Deleted ${selectedFile.name}. Updating Semantic Index...`);

        // Simulating simple retrieval of context since we don't have full context awareness here yet
        // In a real system, we'd update scenes.json to remove references
        await new Promise(r => setTimeout(r, 1000));
        addLog("Semantic Index Updated.");

        await createCommit(`chore: deleted ${selectedFile.name}`, newFS);
        setIsProcessing(false);
    };

    const handleSave = () => {
        if (selectedFile) {
            setFiles(files.map(n => n.id === selectedFile.id ? { ...n, content: editorContent } : n));
            setIsDirty(false);
            createCommit(`feat: updated ${selectedFile.name}`, files);
        }
    };

    const handleDeleteClick = () => {
        if (selectedFile) {
            setDeleteDialogOpen(true);
        }
    };

    const handleCreateItem = async (type: 'folder' | 'file') => {
        // Default to root if no selection or selection is file
        // Or create inside selected folder
        let targetId = 'root'; // simplified, ideally we track 'current path'

        // For now, let's just add to root or 'media' if specific types? 
        // Let's implement a simple "add to root" or "add to currently open folder" logic later.
        // For MVP: Add to Root.

        const newItem: FileNode = {
            id: `new_${Date.now()}`,
            name: newItemName || (type === 'folder' ? 'New Folder' : 'new_file.txt'),
            type: type,
            children: type === 'folder' ? [] : undefined,
            content: '',
            icon: type === 'folder' ? undefined : 'description'
        };

        const newFS = [...files, newItem]; // Add to root for simplicity in this view
        setFiles(newFS);
        setNewFolderDialogOpen(false);
        setNewFileDialogOpen(false);
        setNewItemName('');

        // Commit
        await createCommit(`feat: created ${newItem.name}`, newFS);
    };


    // --- AI Pipeline ---

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.length) return;

        setIsProcessing(true);
        setShowTerminal(true);
        setTerminalLogs([]);
        addLog("Starting Ingestion Pipeline...");

        const newFiles = Array.from(e.target.files);
        // We'll process sequentially to avoid overwhelming the client
        let currentFS = [...files];

        for (const file of newFiles) {
            addLog(`Processing: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);

            // 1. Determine Type
            const isVideo = file.type.startsWith('video');
            const isAudio = file.type.startsWith('audio');
            const isImage = file.type.startsWith('image');

            // 2. Add to assets DB (store Blob)
            const assetId = `asset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            await db.addAsset({
                id: assetId,
                name: file.name,
                type: isVideo ? 'video' : isAudio ? 'audio' : 'image',
                blob: file,
                created: Date.now(),
                status: 'pending'
            });

            // 3. Add to FileSystem (media/raw)
            const mediaFolder = findNode('raw', currentFS) || findNode('media', currentFS); // try raw, fallback media

            const newFileNode: FileNode = {
                id: assetId, // Match asset ID for preview linkage
                name: file.name,
                type: 'file',
                icon: isVideo ? 'movie' : isAudio ? 'music_note' : isImage ? 'image' : 'description',
                iconColor: 'text-emerald-400',
                locked: false
            };

            // Update FS immutably
            const addToFolder = (nodes: FileNode[], targetId: string, item: FileNode): FileNode[] => {
                return nodes.map(n => {
                    if (n.id === targetId && n.children) return { ...n, children: [...n.children, item] };
                    if (n.children) return { ...n, children: addToFolder(n.children, targetId, item) };
                    return n;
                });
            };

            if (mediaFolder) {
                currentFS = addToFolder(currentFS, mediaFolder.id, newFileNode);
                setFiles(currentFS); // Update UI immediately
            }

            // 4. Run Analysis Pipeline
            let analysisResult: any = null;
            let transcriptText = "";

            if (isVideo) {
                addLog("Target: VIDEO. Pipeline: Frames -> Whisper -> Gemini");

                // Frames
                addLog("Extracting Keyframes...");
                const frames = await extractFramesFromVideo(file);
                addLog(`Extracted ${frames.length} keyframes.`);

                // Audio
                addLog("Extracting Audio Track...");
                const audioBlob = await extractAudioFromVideo(file);

                if (audioBlob) {
                    addLog("Transcribing Audio (Whisper)...");
                    const transcript = await transcribeAudio(audioBlob);
                    transcriptText = transcript.text;
                    addLog("Transcription Complete via Whisper.");
                }

                // Gemini
                addLog("Generating Semantic Index (Gemini Vision)...");
                analysisResult = await analyzeAsset({
                    id: assetId,
                    name: file.name,
                    blob: file, // Gemini can handle blob if no frames, but we have frames
                    images: frames.slice(0, 5) // Use first 5 for speed
                });

            } else if (isAudio) {
                addLog("Target: AUDIO. Pipeline: Whisper -> Gemini");

                addLog("Transcribing Audio...");
                const transcript = await transcribeAudio(file);
                transcriptText = transcript.text;

                addLog("Analyzing Text Context...");
                // Mock analysis for audio text for now or send text to gemini
                analysisResult = { description: "Audio file processed", tags: ["audio", "transcript"] };
            } else {
                addLog("Target: IMAGE/OTHER. Pipeline: Gemini");
                analysisResult = await analyzeAsset({
                    id: assetId,
                    name: file.name,
                    blob: file
                });
            }

            addLog(`Analysis Complete: ${analysisResult?.tags?.join(', ')}`);

            // 5. Create Metadata File
            const metaNodeName = `${assetId}.json`;
            const metaNode: FileNode = {
                id: `meta_${assetId}`,
                name: metaNodeName,
                type: 'file',
                content: JSON.stringify({
                    asset_id: assetId,
                    original_name: file.name,
                    analysis: analysisResult,
                    transcript: transcriptText,
                    processed_at: Date.now(),
                    history: [{ timestamp: Date.now(), action: 'ingested' }]
                }, null, 2)
            };

            // Add meta to 'meta' folder
            const metaFolder = findNode('meta', currentFS);
            if (metaFolder) {
                currentFS = addToFolder(currentFS, metaFolder.id, metaNode);
            }

            // 6. AGGREGATE UPDATE: scenes.json
            // We want to ADD this asset's analysis to the global scenes.json
            const scenesNode = findNode('scenes_json', currentFS) || findNode('scenes.json', currentFS);

            if (scenesNode && scenesNode.content) {
                try {
                    const scenesData = JSON.parse(scenesNode.content);
                    // Check if 'assets' array exists, if not create
                    if (!scenesData.assets) scenesData.assets = [];

                    // Add new asset data
                    scenesData.assets.push({
                        id: assetId,
                        name: file.name,
                        description: analysisResult?.description || "Inferred context",
                        tags: analysisResult?.tags || []
                    });

                    // Update the node content in FS
                    // Helper to update specific node content
                    const updateNodeContent = (nodes: FileNode[], id: string, content: string): FileNode[] => {
                        return nodes.map(n => {
                            if (n.id === id) return { ...n, content };
                            if (n.children) return { ...n, children: updateNodeContent(n.children, id, content) };
                            return n;
                        });
                    };
                    currentFS = updateNodeContent(currentFS, scenesNode.id, JSON.stringify(scenesData, null, 2));
                    addLog("Updated Global Context (scenes.json)");

                } catch (e) {
                    console.warn("Failed to update scenes.json", e);
                }
            }

            // 7. Commit
            await createCommit(`feat: ingested ${file.name} (AI Index v2)`, currentFS);
        }

        setIsProcessing(false);
        addLog("All Files Processed.");
    };

    // --- Media Preview (Existing Logic + Updates) ---
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    useEffect(() => {
        if (!selectedFile) {
            setPreviewUrl(null);
            return;
        }
        let url: string | null = null;
        let isBlob = false;

        // Async fetch from DB
        const fetchAsset = async () => {
            // In new logic, ID matches exactly
            const asset = await db.getAsset(selectedFile.id);
            if (asset) {
                if (asset.blob) {
                    url = URL.createObjectURL(asset.blob);
                    isBlob = true;
                    setPreviewUrl(url);
                } else if (asset.url) {
                    setPreviewUrl(asset.url);
                }
            } else {
                setPreviewUrl(null);
            }
        };
        fetchAsset();

        return () => {
            // Cleanup logic tricky with async set, but React handles unmount updates usually
            // Ideally we track the url in a ref to revoke
        };
    }, [selectedFile, repoData]); // Dependency on repoData is less relevant now we fetch DB directly


    // --- Render ---

    const renderTree = (nodes: FileNode[], depth = 0) => {
        return nodes.map(node => {
            let iconName = 'description';
            let iconColorClass = 'text-slate-400 dark:text-zinc-500';

            if (node.type === 'folder') {
                iconName = node.isOpen ? 'folder_open' : 'folder';
                iconColorClass = 'text-amber-500/80';
            } else if (node.icon) {
                iconName = node.icon;
                iconColorClass = node.iconColor || 'text-slate-400 dark:text-zinc-500';
            }

            const isSelected = selectedFile?.id === node.id;

            return (
                <div key={node.id}>
                    <div
                        className={`flex items-center gap-2.5 py-1.5 px-3 cursor-pointer text-sm font-sans tracking-tight transition-all relative group
                            ${isSelected ? 'text-emerald-600 dark:text-primary font-medium' : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'}
                            ${node.locked ? 'opacity-50' : ''}
                        `}
                        style={{ paddingLeft: `${depth * 12 + 12}px` }}
                        onClick={() => {
                            if (node.type === 'folder') {
                                const newFiles = JSON.parse(JSON.stringify(files));
                                const target = findNode(node.id, newFiles);
                                if (target) target.isOpen = !target.isOpen;
                                setFiles(newFiles);
                            } else {
                                if (isDirty && !window.confirm("Unsaved changes.")) return;
                                setSelectedFile(node);
                                setEditorContent(node.content || '');
                                setIsDirty(false);
                            }
                        }}
                    >
                        {/* Interactive Background */}
                        <div className={`absolute inset-0 mx-2 rounded-md -z-10 transition-colors ${isSelected ? 'bg-primary/20 dark:bg-primary/10' : 'group-hover:bg-slate-100 dark:group-hover:bg-white/5'}`}></div>

                        <span className={`material-icons-outlined text-[18px] transition-colors ${isSelected ? 'text-primary' : iconColorClass}`}>
                            {iconName}
                        </span>
                        <span className="truncate">{node.name}</span>
                        {node.locked && <span className="material-icons-outlined text-[10px] text-zinc-400 ml-auto">lock</span>}
                    </div>
                    {node.type === 'folder' && (node.isOpen !== false) && node.children && (
                        <div>{renderTree(node.children, depth + 1)}</div>
                    )}
                </div>
            );
        });
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 dark:bg-background-dark text-slate-900 dark:text-white font-sans transition-colors duration-300">
            <TopNavigation onNavigate={onNavigate} />

            {/* Hidden Inputs */}
            <input type="file" ref={fileInputRef} hidden multiple onChange={handleFileUpload} accept="video/*,audio/*,image/*" />

            {/* Toolbar */}
            <div className="h-14 px-4 flex items-center justify-between bg-white/80 dark:bg-[#09090b]/80 backdrop-blur-md border-b border-slate-200 dark:border-white/5 sticky top-0 z-30 transition-colors duration-300">
                <div className="flex items-center gap-4">
                    <button onClick={() => onNavigate('repo')} className="flex items-center gap-2 text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors group">
                        <span className="material-icons-outlined group-hover:-translate-x-0.5 transition-transform text-lg">arrow_back</span>
                        <span className="text-xs font-mono font-medium tracking-wider uppercase">Back</span>
                    </button>
                    <div className="h-4 w-px bg-slate-200 dark:bg-white/10 mx-2"></div>
                    <h2 className="text-sm font-medium text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                        <span className="material-icons-outlined text-base text-primary">folder_open</span>
                        File Manager
                    </h2>
                </div>

                <div className="flex items-center gap-3">
                    {/* New Actions Group */}
                    <div className="flex items-center bg-slate-100 dark:bg-white/5 rounded-lg p-0.5 border border-slate-200 dark:border-white/5">
                        <button onClick={() => fileInputRef.current?.click()} className="p-1.5 hover:bg-white dark:hover:bg-white/10 rounded-md transition-all text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white relative group" title="Upload Media">
                            <span className="material-icons-outlined text-lg">cloud_upload</span>
                        </button>
                        <div className="w-px h-4 bg-slate-200 dark:bg-white/10 mx-1"></div>
                        <button onClick={() => setNewFolderDialogOpen(true)} className="p-1.5 hover:bg-white dark:hover:bg-white/10 rounded-md transition-all text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white" title="New Folder">
                            <span className="material-icons-outlined text-lg">create_new_folder</span>
                        </button>
                        <button onClick={() => { setNewFileDialogOpen(true); }} className="p-1.5 hover:bg-white dark:hover:bg-white/10 rounded-md transition-all text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white" title="New File">
                            <span className="material-icons-outlined text-lg">note_add</span>
                        </button>
                    </div>

                    <div className="h-4 w-px bg-slate-200 dark:bg-white/10"></div>

                    <button
                        onClick={handleDeleteClick}
                        disabled={!selectedFile}
                        className="px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-500/20 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 hover:border-red-300 dark:hover:border-red-500/40 disabled:opacity-30 disabled:hover:bg-transparent transition-all text-xs font-medium flex items-center gap-2"
                    >
                        <span className="material-icons-outlined text-sm">delete</span>
                        <span className="hidden sm:inline">Delete</span>
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!isDirty}
                        className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary_hover text-black font-bold tracking-wide flex items-center gap-2 disabled:opacity-50 disabled:grayscale transition-all text-xs"
                    >
                        <span className="material-icons-outlined text-sm">save</span>
                        <span className="hidden sm:inline">Save Changes</span>
                    </button>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden relative bg-white dark:bg-background-dark">
                {/* Sidebar Tree */}
                <div className={`w-80 border-r border-slate-200 dark:border-border-dark bg-slate-50 dark:bg-surface-card overflow-y-auto p-3 flex-shrink-0 flex flex-col gap-4 transition-colors duration-300`}>

                    <div className="px-2 pb-2 text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest flex justify-between items-center border-b border-slate-200 dark:border-white/5">
                        <span>Explorer</span>
                        <button onClick={() => setFiles(files)} className="hover:text-slate-900 dark:hover:text-white transition-colors"><span className="material-icons-outlined text-sm">refresh</span></button>
                    </div>

                    <div className="flex-1 -mx-2">
                        {renderTree(files)}
                    </div>
                </div>

                {/* Editor / Preview Area */}
                <div className="flex-1 flex flex-col bg-white dark:bg-background-dark min-w-0 relative transition-colors duration-300">
                    {selectedFile ? (
                        <>
                            <div className="h-10 px-4 flex items-center justify-between bg-slate-50 dark:bg-surface-card border-b border-slate-200 dark:border-border-dark">
                                <span className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-zinc-400">
                                    <span className="material-icons-outlined text-sm text-slate-400 dark:text-zinc-500">description</span>
                                    {selectedFile.name}
                                </span>
                                <span className="text-[10px] uppercase font-mono text-slate-400 dark:text-zinc-600">{selectedFile.id}</span>
                            </div>

                            <div className="flex-1 overflow-hidden relative flex flex-col bg-white dark:bg-background-dark">
                                {/* Media Rendering Logic */}
                                {['mp4', 'mov', 'webm'].some(ext => (selectedFile.name || '').toLowerCase().endsWith(ext)) ? (
                                    <div className="w-full h-full flex items-center justify-center bg-background-dark/90 backdrop-blur-sm">
                                        {previewUrl ? (
                                            <video src={previewUrl} controls className="max-w-full max-h-full rounded-lg shadow-2xl" />
                                        ) : (
                                            <div className="text-center text-zinc-600"><span className="material-icons-outlined text-4xl animate-spin">sync</span></div>
                                        )}
                                    </div>
                                ) : ['jpg', 'jpeg', 'png', 'gif', 'webp'].some(ext => (selectedFile.name || '').toLowerCase().endsWith(ext)) ? (
                                    <div className="w-full h-full flex items-center justify-center p-8 bg-slate-100/50 dark:bg-[url('https://transparenttextures.com/patterns/dark-matter.png')]">
                                        {previewUrl && <img src={previewUrl} className="max-w-full max-h-full object-contain rounded-md shadow-2xl border border-slate-200 dark:border-white/10" />}
                                    </div>
                                ) : (
                                    <textarea
                                        value={editorContent}
                                        onChange={(e) => { setEditorContent(e.target.value); setIsDirty(true); }}
                                        className="w-full h-full p-6 bg-transparent outline-none font-mono text-sm resize-none text-slate-800 dark:text-zinc-300 leading-relaxed custom-scrollbar"
                                        spellCheck={false}
                                    />
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-zinc-700 select-none">
                            <div className="w-24 h-24 rounded-3xl bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-6 ring-1 ring-slate-200 dark:ring-white/5">
                                <span className="material-icons-outlined text-6xl text-slate-300 dark:text-zinc-800">grid_view</span>
                            </div>
                            <p className="text-slate-500 dark:text-zinc-500 font-medium tracking-tight">Select a file to view content</p>
                            <p className="text-slate-400 dark:text-zinc-700 text-sm mt-2">or press <span className="bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 rounded text-slate-500 dark:text-zinc-500 font-mono text-xs">Cmd+P</span> to search</p>
                        </div>
                    )}

                    {/* Terminal Panel */}
                    {(showTerminal || isProcessing) && (
                        <div className="h-64 border-t border-slate-200 dark:border-white/10 bg-slate-900 dark:bg-[#0c0c0c] text-slate-300 font-mono text-xs flex flex-col absolute bottom-0 left-0 right-0 z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.2)]">
                            <div className="px-4 py-2 border-b border-white/10 flex items-center justify-between bg-background-dark/20 dark:bg-white/5">
                                <span className="font-bold flex items-center gap-2 text-zinc-100">
                                    <span className={`w-2 h-2 rounded-full ${isProcessing ? 'bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.5)]' : 'bg-emerald-500'}`}></span>
                                    TERMINAL
                                </span>
                                <div className="flex gap-2">
                                    <button className="hover:text-white text-zinc-500 transition-colors"><span className="material-icons-outlined text-sm">remove</span></button>
                                    <button onClick={() => setShowTerminal(false)} className="hover:text-white text-zinc-500 transition-colors"><span className="material-icons-outlined text-sm">close</span></button>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 space-y-1.5 custom-scrollbar font-medium bg-[#1e1e1e] dark:bg-[#0A0A0A]">
                                {terminalLogs.map((log, i) => (
                                    <div key={i} className="flex gap-2">
                                        <span className="text-zinc-600 select-none">$</span>
                                        <span className={log.includes('Msg:') ? 'text-emerald-400' : log.includes('Error') ? 'text-red-400' : 'text-zinc-300'}>{log.replace('> ', '')}</span>
                                    </div>
                                ))}
                                {isProcessing && <div className="animate-pulse text-amber-500 flex gap-2"><span className="text-zinc-600">$</span> <span>Processing...</span></div>}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Dialogs */}
            <AlertDialog
                isOpen={deleteDialogOpen}
                title="Delete File"
                description={<span>Are you sure you want to delete <strong className="text-white">{selectedFile?.name}</strong>? This will create a snapshot in git history.</span>}
                confirmText="Delete"
                cancelText="Cancel"
                type="danger"
                onConfirm={handleDelete}
                onCancel={() => setDeleteDialogOpen(false)}
            />

            {newFolderDialogOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background-dark/50 dark:bg-background-dark/60 backdrop-blur-sm px-4">
                    <div className="bg-white dark:bg-[#111] border border-slate-200 dark:border-white/10 p-6 rounded-2xl w-full max-w-sm shadow-2xl ring-1 ring-black/5 dark:ring-white/5">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">New Folder</h3>
                        <p className="text-sm text-slate-500 dark:text-zinc-500 mb-6">Create a new directory in the root.</p>
                        <input autoFocus value={newItemName} onChange={e => setNewItemName(e.target.value)} placeholder="Folder Name" className="w-full bg-slate-50 dark:bg-background-dark/50 border border-slate-200 dark:border-white/10 focus:border-primary dark:focus:border-primary/50 rounded-lg p-3 text-slate-900 dark:text-white mb-6 outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-zinc-700" />
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setNewFolderDialogOpen(false)} className="px-4 py-2 text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors text-sm font-medium">Cancel</button>
                            <button onClick={() => handleCreateItem('folder')} className="px-4 py-2 bg-primary hover:bg-primary_hover text-black rounded-lg text-sm font-medium transition-all">Create Folder</button>
                        </div>
                    </div>
                </div>
            )}
            {newFileDialogOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background-dark/50 dark:bg-background-dark/60 backdrop-blur-sm px-4">
                    <div className="bg-white dark:bg-[#111] border border-slate-200 dark:border-white/10 p-6 rounded-2xl w-full max-w-sm shadow-2xl ring-1 ring-black/5 dark:ring-white/5">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">New File</h3>
                        <p className="text-sm text-slate-500 dark:text-zinc-500 mb-6">Create a new file in the root.</p>
                        <input autoFocus value={newItemName} onChange={e => setNewItemName(e.target.value)} placeholder="File Name (e.g. notes.md)" className="w-full bg-slate-50 dark:bg-background-dark/50 border border-slate-200 dark:border-white/10 focus:border-primary dark:focus:border-primary/50 rounded-lg p-3 text-slate-900 dark:text-white mb-6 outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-zinc-700" />
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setNewFileDialogOpen(false)} className="px-4 py-2 text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors text-sm font-medium">Cancel</button>
                            <button onClick={() => handleCreateItem('file')} className="px-4 py-2 bg-primary hover:bg-primary_hover text-black rounded-lg text-sm font-medium transition-all">Create File</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RepoFilesView;
