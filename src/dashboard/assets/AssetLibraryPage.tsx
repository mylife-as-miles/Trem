import React, { useState, useEffect, useRef } from 'react';
import { db, AssetData } from '../../utils/db';
import TopNavigation from '../../components/layout/TopNavigation';

interface AssetLibraryProps {
    isModal?: boolean;
    onClose?: () => void;
    onSelect?: (assets: string[]) => void;
    onNavigate?: (view: 'dashboard' | 'repo' | 'timeline' | 'diff' | 'assets' | 'settings' | 'create-repo' | 'repo-files' | 'trem-create' | 'trem-edit') => void;
}

const AssetLibrary: React.FC<AssetLibraryProps> = ({ isModal, onClose, onSelect, onNavigate }) => {
    const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
    const [assets, setAssets] = useState<AssetData[]>([]);
    const [isDragging, setIsDragging] = useState(false);
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


    return (
        <div
            className={`flex flex-col bg-slate-50 dark:bg-background-dark text-slate-900 dark:text-white font-sans overflow-hidden selection:bg-primary selection:text-white ${isModal ? 'h-[80vh] w-full rounded-xl border border-slate-200 dark:border-white/10 shadow-2xl' : 'h-screen'}`}
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
                <div className="absolute inset-0 z-50 bg-primary/20 backdrop-blur-sm border-4 border-primary border-dashed m-4 rounded-xl flex items-center justify-center pointer-events-none">
                    <div className="text-center animate-bounce">
                        <span className="material-icons-outlined text-6xl text-white drop-shadow-lg">cloud_upload</span>
                        <h2 className="text-2xl font-bold text-white mt-4 drop-shadow-md">Drop Files to Upload</h2>
                    </div>
                </div>
            )}



            {/* Top Navigation (only when not in modal mode) */}
            {!isModal && onNavigate && (
                <TopNavigation onNavigate={onNavigate} />
            )}

            {/* Main Content */}
            <main className="flex-1 flex flex-col relative bg-slate-50 dark:bg-background-dark overflow-hidden">
                {isModal && (
                    <header className="h-20 flex-shrink-0 flex items-center justify-between px-8 border-b border-slate-200 dark:border-white/10 bg-white/80 dark:bg-black/80 backdrop-blur-md sticky top-0 z-30 bg-white dark:bg-black">
                        <div className="flex flex-col justify-center">
                            <h1 className="text-2xl font-display font-bold text-slate-900 dark:text-white tracking-tight">Select Assets</h1>
                        </div>
                        <div className="flex items-center gap-6 flex-1 justify-end">
                            <div className="flex items-center gap-3">
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
                                    className="bg-primary hover:bg-primary_hover text-white px-5 py-2 rounded-lg text-sm font-medium font-display tracking-wide transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                    disabled={selectedAssets.length === 0}
                                >
                                    Add Selected
                                </button>
                            </div>
                        </div>
                    </header>
                )}

                <div className="flex-1 overflow-y-auto p-8 scroll-smooth">
                    {/* Masonry Layout Container */}
                    <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-6 pb-20 space-y-6">

                        {/* Upload Placeholder - First Item */}
                        <div
                            onClick={triggerFileInput}
                            className="relative group w-full aspect-[16/9] bg-white dark:bg-black rounded-xl overflow-hidden border border-dashed border-slate-300 dark:border-white/10 hover:border-primary dark:hover:border-primary transition-all duration-300 flex flex-col items-center justify-center cursor-pointer mb-6 break-inside-avoid shadow-sm hover:shadow-md"
                        >
                            <div className="text-slate-400 dark:text-gray-600 mb-2 group-hover:text-blue-500 transition-colors">
                                <span className="material-icons-outlined text-4xl">add_circle_outline</span>
                            </div>
                            <div className="text-xs font-mono text-slate-500 dark:text-gray-500 uppercase tracking-widest group-hover:text-blue-500 transition-colors">Upload New</div>
                        </div>

                        {assets.map((asset) => (
                            <div
                                key={asset.id}
                                onClick={() => isModal && toggleAssetSelection(asset.id)}
                                className={`
                                    relative group w-full bg-white dark:bg-black rounded-xl overflow-hidden border transition-all duration-300 mb-6 break-inside-avoid shadow-sm
                                    ${isModal && selectedAssets.includes(asset.id)
                                        ? 'border-primary ring-2 ring-primary/50 shadow-lg scale-[1.02]'
                                        : 'border-slate-200 dark:border-white/10 hover:border-primary dark:hover:border-primary'
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
                                        <div className="w-full aspect-video bg-slate-200 dark:bg-gray-900 flex items-center justify-center">
                                            <span className="material-icons-outlined text-4xl text-slate-400 dark:text-gray-600">
                                                {asset.type === 'image' ? 'image' : 'movie'}
                                            </span>
                                        </div>
                                    )}

                                    {/* Gradient Overlay for Readability */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity"></div>
                                </div>

                                {/* Selection Checkbox Overlay for Modal */}
                                {isModal && (
                                    <div className="absolute top-2 left-2 z-20">
                                        <div className={`w-6 h-6 rounded-full border border-white/30 flex items-center justify-center transition-colors ${selectedAssets.includes(asset.id) ? 'bg-primary border-primary' : 'bg-black/50'}`}>
                                            {selectedAssets.includes(asset.id) && <span className="material-icons-outlined text-sm text-white">check</span>}
                                        </div>
                                    </div>
                                )}

                                {/* Delete Button - Non-Modal Only */}
                                {!isModal && (
                                    <div className="absolute top-2 right-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (window.confirm('Delete this asset permanently?')) {
                                                    db.deleteAsset(asset.id).then(() => {
                                                        loadAssets();
                                                    });
                                                }
                                            }}
                                            className="w-8 h-8 rounded-full bg-black/60 hover:bg-red-500/80 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white transition-all shadow-lg"
                                            title="Delete Asset"
                                        >
                                            <span className="material-icons-outlined text-sm">delete</span>
                                        </button>
                                    </div>
                                )}

                                <div className="absolute bottom-3 left-3 z-10 transition-opacity duration-300 group-hover:opacity-0 w-full pr-6">
                                    <div className="text-xs font-mono text-white font-bold bg-black/50 px-2 py-1 rounded backdrop-blur-sm border border-white/10 truncate">{asset.name}</div>
                                </div>
                                <div className="absolute top-3 right-3 z-10 transition-opacity duration-300 group-hover:opacity-0">
                                    <div className="text-[10px] font-mono text-gray-300 bg-black/60 px-1.5 py-0.5 rounded backdrop-blur-sm">{asset.duration || asset.type}</div>
                                </div>

                                {/* Detail Overlay - Only show in non-modal or if not interfering with selection */}
                                {!isModal && (
                                    <div className="absolute inset-0 bg-black/60 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-between p-5 border border-primary/30">
                                        <div className="flex flex-wrap gap-2 transform -translate-y-2 group-hover:translate-y-0 transition-transform duration-300 delay-75">
                                            {asset.tags?.map(tag => (
                                                <span key={tag} className="px-2.5 py-1 rounded-full bg-primary/20 border border-primary/50 text-emerald-200 text-[10px] font-mono tracking-wide">{tag}</span>
                                            ))}
                                        </div>
                                        {asset.meta && (
                                            <div className="font-mono text-xs text-blue-300 bg-black/80 p-3 rounded border border-blue-500/20 transform scale-95 group-hover:scale-100 transition-transform duration-300 delay-100 relative overflow-hidden">
                                                <div className="absolute top-0 right-0 w-2 h-2 bg-primary rounded-full animate-ping"></div>
                                                <span className="text-gray-500">{`{`}</span><br />
                                                &nbsp;&nbsp;<span className="text-emerald-300">"object"</span>: <span className="text-green-400">"{asset.meta.object}"</span>,<br />
                                                &nbsp;&nbsp;<span className="text-emerald-300">"motion"</span>: <span className="text-green-400">"{asset.meta.motion}"</span><br />
                                                <span className="text-gray-500">{`}`}</span>
                                            </div>
                                        )}
                                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                            <span className="material-icons-outlined text-white text-4xl">play_circle</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default AssetLibrary;