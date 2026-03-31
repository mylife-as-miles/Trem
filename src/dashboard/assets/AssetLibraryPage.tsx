import React, { useState, useEffect, useRef } from 'react';
import { db, AssetData } from '../../utils/db';
import TopNavigation from '../../components/layout/TopNavigation';
import AlertDialog from '../../components/ui/AlertDialog';

interface AssetLibraryProps {
    isModal?: boolean;
    onClose?: () => void;
    onSelect?: (assets: string[]) => void;
    onNavigate?: (view: 'dashboard' | 'repo' | 'timeline' | 'diff' | 'assets' | 'settings' | 'create-repo' | 'repo-files' | 'trem-create' | 'trem-edit') => void;
}

const formatFileSize = (bytes?: number) => {
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

const getAssetTypeLabel = (type?: string) => {
    if (type === 'video') return 'Video';
    if (type === 'image') return 'Image';
    return 'Audio';
};

const getAssetIcon = (type?: string) => {
    if (type === 'video') return 'movie';
    if (type === 'image') return 'image';
    return 'graphic_eq';
};

const AssetLibrary: React.FC<AssetLibraryProps> = ({ isModal, onClose, onSelect, onNavigate }) => {
    const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
    const [assets, setAssets] = useState<AssetData[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [deleteAssetId, setDeleteAssetId] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Load assets from DB
    const loadAssets = async () => {
        try {
            const dbAssets = await db.getAllAssets();
            setAssets(dbAssets.reverse());
        } catch (e) {
            console.error("Failed to load assets", e);
            setAssets([]);
        }
    };

    useEffect(() => {
        loadAssets();
        const interval = setInterval(loadAssets, 5000);
        return () => clearInterval(interval);
    }, []);

    const toggleAssetSelection = (assetId: string) => {
        if (selectedAssets.includes(assetId)) {
            setSelectedAssets(selectedAssets.filter(id => id !== assetId));
        } else {
            setSelectedAssets([...selectedAssets, assetId]);
        }
    };

    const handleConfirmSelection = () => {
        if (onSelect) {
            onSelect(selectedAssets);
        }
    };

    // Helper to extract video metadata
    const processVideoFile = (file: File): Promise<{ duration: string, thumb: string, width: number, height: number }> => {
        return new Promise((resolve) => {
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.muted = true;
            video.playsInline = true;
            const url = URL.createObjectURL(file);
            video.src = url;

            // Timeout fallback
            const timeout = setTimeout(() => {
                resolve({ duration: '--:--', thumb: '', width: 1920, height: 1080 });
                URL.revokeObjectURL(url);
            }, 3000);

            video.onloadeddata = () => {
                if (video.duration > 1) {
                    video.currentTime = 1.0;
                } else {
                    video.currentTime = 0;
                }
            };

            video.onseeked = () => {
                clearTimeout(timeout);

                // Duration
                const seconds = Math.floor(video.duration);
                const mm = Math.floor(seconds / 60).toString().padStart(2, '0');
                const ss = (seconds % 60).toString().padStart(2, '0');
                const durationStr = `${mm}:${ss}`;

                // Dimensions & Aspect Ratio
                const { videoWidth, videoHeight } = video;

                // Thumbnail
                const canvas = document.createElement('canvas');
                // Scale down but maintain aspect ratio
                const scale = Math.min(320 / videoWidth, 480 / videoHeight); // Max width 320, Max height 480
                canvas.width = videoWidth * scale;
                canvas.height = videoHeight * scale;

                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    const thumbData = canvas.toDataURL('image/jpeg', 0.7);

                    resolve({ duration: durationStr, thumb: thumbData, width: videoWidth, height: videoHeight });
                } else {
                    resolve({ duration: durationStr, thumb: '', width: videoWidth, height: videoHeight });
                }

                URL.revokeObjectURL(url);
            };

            video.onerror = () => {
                clearTimeout(timeout);
                console.warn("Could not process video file:", file.name);
                resolve({ duration: '--:--', thumb: '', width: 0, height: 0 });
                URL.revokeObjectURL(url);
            };
        });
    };

    // File Upload Handlers
    const handleFiles = async (files: FileList | null) => {
        if (!files) return;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const isImage = file.type.startsWith('image');
            const isVideo = file.type.startsWith('video');

            let thumb = undefined;
            let duration = undefined;
            let meta = { width: 0, height: 0 };

            if (isImage) {
                thumb = URL.createObjectURL(file);
            } else if (isVideo) {
                const videoData = await processVideoFile(file);
                thumb = videoData.thumb;
                duration = videoData.duration;
                meta = { width: videoData.width, height: videoData.height };
            }

            const asset: AssetData = {
                id: crypto.randomUUID(),
                name: file.name,
                type: isImage ? 'image' : isVideo ? 'video' : 'audio',
                blob: file,
                size: file.size,
                created: Date.now(),
                status: 'ready',
                thumb: thumb,
                duration: duration || (isVideo ? '00:00' : undefined),
                tags: ['Uploaded', 'Local'],
                meta: isVideo ? { original_width: meta.width, original_height: meta.height } : undefined
            };

            await db.addAsset(asset);
        }
        loadAssets(); // Refresh view
    };

    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const onDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const onDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        await handleFiles(e.dataTransfer.files);
    };

    const triggerFileInput = () => {
        fileInputRef.current?.click();
    };

    const totalAssets = assets.length;
    const videoCount = assets.filter((asset) => asset.type === 'video').length;
    const imageCount = assets.filter((asset) => asset.type === 'image').length;
    const audioCount = assets.filter((asset) => asset.type === 'audio').length;

    const libraryStats = [
        { label: 'All media', value: totalAssets },
        { label: 'Video', value: videoCount },
        { label: 'Images', value: imageCount },
        { label: 'Audio', value: audioCount },
    ];

    const latestAssetLabel = totalAssets > 0
        ? `Last upload ${new Date(assets[0].created).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
        : 'Ready for your first upload';

    const renderUploadCard = () => (
        <button
            onClick={triggerFileInput}
            className="relative group w-full aspect-[16/10] bg-white dark:bg-background-dark rounded-2xl overflow-hidden border border-dashed border-slate-300 dark:border-border-dark hover:border-primary transition-all duration-300 flex flex-col items-center justify-center cursor-pointer mb-5 break-inside-avoid shadow-sm hover:-translate-y-1 hover:shadow-xl"
        >
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-[radial-gradient(circle_at_top,rgba(217,248,95,0.18),transparent_52%)]" />
            <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 text-primary mb-4">
                <span className="material-icons-outlined text-3xl">add_circle_outline</span>
            </div>
            <div className="relative z-10 text-sm font-display font-bold text-slate-900 dark:text-white tracking-tight">
                Upload New Media
            </div>
            <div className="relative z-10 text-[11px] font-mono uppercase tracking-[0.22em] text-slate-400 dark:text-gray-500 mt-2">
                Video, image, and audio
            </div>
        </button>
    );


    return (
        <div
            className={`flex flex-col bg-slate-50 dark:bg-background-dark text-slate-900 dark:text-white font-sans overflow-hidden selection:bg-primary selection:text-black ${isModal ? 'h-[80vh] w-full rounded-xl border border-slate-200 dark:border-border-dark shadow-2xl' : 'h-screen'}`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
        >
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                multiple
                accept="video/*,image/*,audio/*"
                onChange={(e) => handleFiles(e.target.files)}
            />

            {/* Drag Overlay */}
            {isDragging && (
                <div className="absolute inset-0 z-50 m-4 rounded-[28px] border-2 border-dashed border-primary bg-background-dark/72 backdrop-blur-md flex items-center justify-center pointer-events-none">
                    <div className="text-center px-6">
                        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-black shadow-[0_0_24px_rgba(217,248,95,0.32)]">
                            <span className="material-icons-outlined text-4xl">cloud_upload</span>
                        </div>
                        <h2 className="text-2xl font-display font-bold text-white mt-5 tracking-tight">Drop Files to Upload</h2>
                        <p className="mt-2 text-sm text-gray-300">We will stage them directly into your Trem asset library.</p>
                    </div>
                </div>
            )}



            {/* Top Navigation (only when not in modal mode) */}
            {!isModal && onNavigate && (
                <TopNavigation onNavigate={onNavigate} activeTab="assets" />
            )}

            {/* Main Content */}
            <main className="flex-1 flex flex-col relative bg-slate-50 dark:bg-background-dark overflow-hidden">
                {isModal && (
                    <header className="h-20 flex-shrink-0 flex items-center justify-between px-5 md:px-8 border-b border-slate-200 dark:border-border-dark bg-white/80 dark:bg-surface-card/90 backdrop-blur-md sticky top-0 z-30">
                        <div className="flex flex-col justify-center">
                            <h1 className="text-2xl font-display font-bold text-slate-900 dark:text-white tracking-tight">Select Assets</h1>
                            <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">Choose media from your library and add it to the current flow.</p>
                        </div>
                        <div className="flex items-center gap-3 md:gap-4 flex-1 justify-end">
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={triggerFileInput}
                                    className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-border-dark text-sm font-medium text-slate-600 dark:text-gray-300 hover:border-primary/40 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-white/5 transition-all active:scale-95"
                                >
                                    <span className="material-icons-outlined text-base">upload</span>
                                    Upload
                                </button>
                                <div className="text-sm font-mono text-slate-500 dark:text-gray-400">
                                    {selectedAssets.length} selected
                                </div>
                                <button
                                    onClick={onClose}
                                    className="px-4 py-2 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-900 dark:text-gray-400 dark:hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleConfirmSelection}
                                    className="bg-primary hover:bg-primary_hover text-black px-5 py-2 rounded-lg text-sm font-medium font-display tracking-wide transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                    disabled={selectedAssets.length === 0}
                                >
                                    Add Selected
                                </button>
                            </div>
                        </div>
                    </header>
                )}

                <div className={`flex-1 overflow-y-auto scroll-smooth ${isModal ? 'p-4 md:p-6 bg-slate-50/70 dark:bg-background-dark/70' : 'p-6 md:p-10 fade-in bg-slate-50/50 dark:bg-background-dark'}`}>
                    {!isModal && (
                        <div className="max-w-6xl mx-auto space-y-16">
                            <div className="text-center space-y-6 py-8 md:py-12">
                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-emerald-600 dark:text-primary text-xs font-medium tracking-wide">
                                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                                    AI-READY MEDIA LIBRARY
                                </div>

                                <h1 className="text-5xl md:text-7xl font-display font-bold text-slate-900 dark:text-white tracking-tight leading-tight">
                                    Assets for <span className="text-primary">Trem AI</span>
                                </h1>

                                <p className="text-xl text-slate-500 dark:text-gray-400 max-w-2xl mx-auto font-light leading-relaxed">
                                    Upload, organize, and stage footage, stills, and audio in one library before you send them into Create or Edit.
                                </p>

                                <div className="flex flex-wrap justify-center gap-2 pt-2">
                                    {libraryStats.map((stat) => (
                                        <div
                                            key={stat.label}
                                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white dark:bg-surface-card border border-slate-200 dark:border-border-dark text-xs font-medium text-slate-600 dark:text-gray-300"
                                        >
                                            <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                                            {stat.value} {stat.label}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className={isModal ? '' : 'max-w-6xl mx-auto'}>
                        {!isModal && (
                            <div className="space-y-6">
                                <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 px-2">
                                    <div className="max-w-xl">
                                        <h2 className="text-sm font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">Media Library</h2>
                                        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-gray-400">
                                            Keep your working set ready. Upload once, then reuse across every Trem workflow with the same source-of-truth library.
                                        </p>
                                    </div>
                                    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                                        <div className="rounded-full border border-slate-200 dark:border-border-dark bg-white dark:bg-surface-card px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.18em] text-slate-500 dark:text-gray-400">
                                            {latestAssetLabel}
                                        </div>
                                        <button
                                            onClick={triggerFileInput}
                                            className="bg-primary hover:bg-primary_hover text-black px-5 py-3 rounded-xl text-sm font-medium font-display tracking-wide transition-all shadow-lg active:scale-95 inline-flex items-center justify-center gap-2"
                                        >
                                            <span className="material-icons-outlined text-base">upload</span>
                                            Upload Assets
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className={isModal ? '' : 'rounded-[28px] border border-slate-200 dark:border-border-dark bg-white/70 dark:bg-surface-card/80 shadow-xl overflow-hidden'}>
                            {!isModal && (
                                <div className="px-5 md:px-6 py-4 border-b border-slate-200/70 dark:border-border-dark bg-slate-50/70 dark:bg-background-dark/50 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                    <div className="flex flex-wrap gap-2">
                                        {libraryStats.map((stat) => (
                                            <div
                                                key={stat.label}
                                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white dark:bg-surface-card border border-slate-200 dark:border-border-dark text-[11px] font-mono uppercase tracking-[0.18em] text-slate-500 dark:text-gray-400"
                                            >
                                                <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                                                {stat.label}: {stat.value}
                                            </div>
                                        ))}
                                    </div>
                                    <div className="text-xs font-mono text-slate-400 dark:text-gray-500">
                                        {totalAssets === 0 ? 'No media uploaded yet' : `${totalAssets} assets available`}
                                    </div>
                                </div>
                            )}

                            <div className={isModal ? '' : 'p-5 md:p-6'}>

                    <div className="columns-1 sm:columns-2 xl:columns-3 gap-5 pb-10 space-y-5">

                        {/* Upload Placeholder - First Item */}
                        {renderUploadCard()}

                        {assets.map((asset) => (
                            <div
                                key={asset.id}
                                onClick={() => isModal && toggleAssetSelection(asset.id)}
                                className={`
                                    relative group w-full bg-white dark:bg-surface-card rounded-2xl overflow-hidden border transition-all duration-300 mb-5 break-inside-avoid shadow-sm
                                    ${isModal && selectedAssets.includes(asset.id)
                                        ? 'border-primary ring-2 ring-primary/50 shadow-lg scale-[1.02]'
                                        : 'border-slate-200 dark:border-border-dark hover:border-primary dark:hover:border-primary'
                                    }
                                    ${!isModal && 'hover:shadow-xl hover:translate-y-[-2px]'}
                                    ${isModal ? 'cursor-pointer' : ''}
                                `}
                            >
                                {/* Thumbnail Container with Natural Aspect Ratio */}
                                <div className="relative w-full">
                                    {asset.thumb ? (
                                        <img
                                            src={asset.thumb}
                                            alt={asset.name}
                                            className="w-full h-auto object-cover block"
                                            loading="lazy"
                                        />
                                    ) : (
                                        <div className="w-full aspect-video bg-slate-100 dark:bg-background-dark flex items-center justify-center">
                                            <span className="material-icons-outlined text-4xl text-slate-400 dark:text-gray-600">
                                                {getAssetIcon(asset.type)}
                                            </span>
                                        </div>
                                    )}

                                    {/* Gradient Overlay for Readability */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity"></div>
                                </div>

                                {/* Selection Checkbox Overlay for Modal */}
                                {isModal && (
                                    <div className="absolute top-2 left-2 z-20">
                                        <div className={`w-6 h-6 rounded-full border border-white/30 flex items-center justify-center transition-colors ${selectedAssets.includes(asset.id) ? 'bg-primary border-primary text-black' : 'bg-black/50 text-white'}`}>
                                            {selectedAssets.includes(asset.id) ? (
                                                <span className="material-icons-outlined text-sm">check</span>
                                            ) : (
                                                <span className="material-icons-outlined text-sm">{getAssetIcon(asset.type)}</span>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Delete Button - Non-Modal Only */}
                                {!isModal && (
                                    <div className="absolute top-2 right-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (asset.id) { setDeleteAssetId(asset.id); }
                                            }}
                                            className="w-8 h-8 rounded-full bg-black/60 hover:bg-red-500/80 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white transition-all shadow-lg"
                                            title="Delete Asset"
                                        >
                                            <span className="material-icons-outlined text-sm">delete</span>
                                        </button>
                                    </div>
                                )}

                                <div className="absolute top-3 left-3 z-10 transition-opacity duration-300 group-hover:opacity-0 w-full pr-24">
                                    <div className="text-[10px] font-mono text-white bg-black/60 px-2 py-1 rounded-full backdrop-blur-sm border border-white/10 inline-flex items-center gap-1 uppercase tracking-[0.18em]">
                                        {getAssetTypeLabel(asset.type)}
                                    </div>
                                </div>
                                <div className="absolute top-3 right-3 z-10 transition-opacity duration-300 group-hover:opacity-0">
                                    <div className="text-[10px] font-mono text-gray-300 bg-black/60 px-1.5 py-0.5 rounded backdrop-blur-sm">{asset.duration || getAssetTypeLabel(asset.type)}</div>
                                </div>

                                {/* Detail Overlay - Only show in non-modal or if not interfering with selection */}
                                {!isModal && (
                                    <div className="absolute inset-0 bg-black/60 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-between p-5 border border-primary/20">
                                        <div className="flex flex-wrap gap-2 transform -translate-y-2 group-hover:translate-y-0 transition-transform duration-300 delay-75">
                                            {asset.tags?.map(tag => (
                                                <span key={tag} className="px-2.5 py-1 rounded-full bg-primary/15 border border-primary/30 text-primary text-[10px] font-mono tracking-wide">{tag}</span>
                                            ))}
                                        </div>
                                        {(asset.meta || asset.size) && (
                                            <div className="font-mono text-xs text-slate-200 bg-black/80 p-3 rounded border border-white/10 transform scale-95 group-hover:scale-100 transition-transform duration-300 delay-100 relative overflow-hidden">
                                                <div className="absolute top-0 right-0 w-2 h-2 bg-primary rounded-full animate-ping"></div>
                                                <span className="text-gray-500">{`{`}</span><br />
                                                &nbsp;&nbsp;<span className="text-primary">"type"</span>: <span className="text-white/90">"{getAssetTypeLabel(asset.type)}"</span>,<br />
                                                &nbsp;&nbsp;<span className="text-primary">"size"</span>: <span className="text-white/90">"{formatFileSize(asset.size)}"</span>
                                                {asset.meta?.original_width && asset.meta?.original_height ? (
                                                    <>
                                                        ,<br />
                                                        &nbsp;&nbsp;<span className="text-primary">"frame"</span>: <span className="text-white/90">"{asset.meta.original_width}x{asset.meta.original_height}"</span>
                                                    </>
                                                ) : null}
                                                <br />
                                                <span className="text-gray-500">{`}`}</span>
                                            </div>
                                        )}
                                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                            <span className="material-icons-outlined text-white text-4xl">play_circle</span>
                                        </div>
                                    </div>
                                )}

                                <div className="border-t border-slate-100 dark:border-border-dark px-4 py-4 bg-white dark:bg-surface-card/90">
                                    <div className="min-w-0">
                                        <h3 className="font-bold text-slate-900 dark:text-white tracking-tight truncate">{asset.name}</h3>
                                        <p className="mt-1 text-[11px] font-mono uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">
                                            {formatFileSize(asset.size)} / {new Date(asset.created).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                        </p>
                                    </div>

                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {asset.meta?.original_width && asset.meta?.original_height && (
                                            <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-background-dark border border-slate-200 dark:border-border-dark text-[10px] font-mono text-slate-500 dark:text-gray-400">
                                                {asset.meta.original_width}x{asset.meta.original_height}
                                            </span>
                                        )}
                                        {(asset.tags || []).slice(0, 2).map((tag) => (
                                            <span
                                                key={`${asset.id}-${tag}`}
                                                className="px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-mono text-emerald-700 dark:text-primary"
                                            >
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                            </div>
                        </div>
                    </div>
                </div>
            
            <AlertDialog
                isOpen={!!deleteAssetId}
                title="Delete Asset"
                description="Are you sure you want to delete this asset? This action cannot be undone."
                confirmText="Delete"
                cancelText="Cancel"
                type="danger"
                onConfirm={() => {
                    if (deleteAssetId) {
                        db.deleteAsset(deleteAssetId).then(() => {
                            loadAssets();
                            setDeleteAssetId(null);
                        });
                    }
                }}
                onCancel={() => setDeleteAssetId(null)}
            />
</main>
        </div>
    );
};

export default AssetLibrary;
