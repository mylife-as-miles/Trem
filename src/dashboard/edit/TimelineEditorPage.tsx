import React, { useState, useEffect } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import TopNavigation from '../../components/layout/TopNavigation';
import { useTremStore } from '../../store/useTremStore';
import { Player, PlayerRef } from '@remotion/player';
import { MyVideo } from '../../remotion/MyVideo';

interface Clip {
    id: string;
    name: string;
    duration: string;
    description: string;
    type: string;
    resolution?: string;
    icon: string;
    colorClass: string;
    gradientClass: string;
    isAiEdit?: boolean;
}

const SortableClip = ({ clip }: { clip: Clip }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id: clip.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners} className={`clip-card glass-panel rounded-lg p-3 cursor-move group relative mb-3 ${clip.isAiEdit ? 'border-l-2 border-l-primary' : ''}`}>
            {clip.isAiEdit && (
                <div className="absolute -right-1 -top-1 w-2 h-2 bg-primary rounded-full shadow-[0_0_5px_rgba(34,197,94,0.8)] z-10"></div>
            )}
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${clip.colorClass} rounded-l-lg opacity-50 group-hover:opacity-100 transition-opacity`}></div>
            <div className="flex gap-3">
                <div className="w-16 h-12 bg-zinc-800 rounded border border-white/10 flex-shrink-0 overflow-hidden relative">
                    <div className={`absolute inset-0 bg-gradient-to-br ${clip.gradientClass}`}></div>
                    <span className="material-icons-outlined absolute inset-0 m-auto text-white/20 text-lg flex items-center justify-center">{clip.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                        <h3 className="text-sm font-bold text-gray-200 truncate">{clip.name}</h3>
                        <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-400">{clip.duration}</span>
                    </div>
                    <p className="text-[11px] text-gray-500 truncate leading-tight">{clip.description}</p>
                </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
                {clip.isAiEdit ? (
                    <span className="px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 text-[9px] font-mono text-primary flex items-center gap-1">
                        <span className="material-icons-outlined text-[10px]">auto_fix_high</span> AI Edit
                    </span>
                ) : (
                    <>
                        <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/5 text-[9px] font-mono text-gray-400">{clip.type}</span>
                        {clip.resolution && <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/5 text-[9px] font-mono text-gray-400">{clip.resolution}</span>}
                    </>
                )}
            </div>
        </div>
    );
};

interface TimelineEditorProps {
    onNavigate: (view: any) => void;
}

const TimelineEditor: React.FC<TimelineEditorProps> = ({ onNavigate }) => {
    const [activeTab, setActiveTab] = useState<'timeline' | 'instructions' | 'copilot'>('instructions');
    const { editPlan, repoData } = useTremStore();
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);

    const [clips, setClips] = useState<Clip[]>([
        {
            id: '1',
            name: 'Shot_01_Sprint',
            duration: '05:00s',
            description: 'Man running on track, low angle',
            type: 'RAW',
            resolution: '4K',
            icon: 'movie',
            colorClass: 'bg-primary',
            gradientClass: 'from-emerald-900/40 to-black',
        },
        {
            id: '2',
            name: 'Shot_02_CloseUp',
            duration: '03:12s',
            description: 'Face details, sweat beads',
            type: 'LOG',
            icon: 'face',
            colorClass: 'bg-primary',
            gradientClass: 'from-blue-900/40 to-black',
        },
        {
            id: '3',
            name: 'Shot_03_FinishLine',
            duration: '04:45s',
            description: 'Crossing the line, slow mo',
            type: 'LOG',
            icon: 'flag',
            colorClass: 'bg-primary',
            gradientClass: 'from-green-900/40 to-black',
            isAiEdit: true,
        }
    ]);

    // Sync Player State with UI (Optional: Use Player's onFrameUpdate if we want precise scrubber sync)
    // For now, simpler interval is okay for UI feedback, but connecting to Player's event is better.
    // However, Player callback is in the component props.

    // We can use a simple effect to poll current frame if playing
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isPlaying) {
            interval = setInterval(() => {
                if (playerRef.current) {
                    const frame = playerRef.current.getCurrentFrame();
                    const total = 900; // Match durationInFrames
                    setCurrentTime((frame / total) * 100);
                }
            }, 1000 / 30); // 30fps poll
        }
        return () => clearInterval(interval);
    }, [isPlaying]);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            setClips((items) => {
                const oldIndex = items.findIndex((item) => item.id === active.id);
                const newIndex = items.findIndex((item) => item.id === over.id);
                return arrayMove(items, oldIndex, newIndex);
            });
        }
    };



    const playerRef = React.useRef<PlayerRef>(null);

    const togglePlay = () => {
        const playing = !isPlaying;
        setIsPlaying(playing);
        if (playerRef.current) {
            if (playing) {
                playerRef.current.play();
            } else {
                playerRef.current.pause();
            }
        }
    };

    const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width;
        const percentage = Math.max(0, Math.min(1, x / width));

        // Assume 30 second timeline for now = 900 frames
        const totalFrames = 900;
        const frame = Math.floor(percentage * totalFrames);

        if (playerRef.current) {
            playerRef.current.seekTo(frame);
        }
        setCurrentTime(percentage * 100);
    };

    return (
        <div className="flex flex-col h-full bg-background-light dark:bg-background-dark text-slate-800 dark:text-white font-sans overflow-hidden relative selection:bg-primary selection:text-white">

            {/* Main Header: Project Context & Actions */}
            <div className="h-16 flex-shrink-0 flex items-center justify-between px-6 border-b border-slate-200 dark:border-border-dark bg-white/95 dark:bg-background-dark z-20">
                <div className="flex items-center gap-4">
                    <div
                        className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-white shadow-[0_0_15px_rgba(34,197,94,0.5)] cursor-pointer hover:scale-105 transition-transform"
                        onClick={() => onNavigate && onNavigate('repo')}
                    >
                        <span className="material-icons-outlined text-xl">auto_awesome_motion</span>
                    </div>
                    <nav className="flex items-center text-sm font-mono tracking-tight hidden md:flex">
                        <span
                            className="text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer transition-colors"
                            onClick={() => onNavigate && onNavigate('repo')}
                        >
                            {repoData?.name || 'untitled-project'}
                        </span>
                        <span className="mx-2 text-slate-400 dark:text-gray-700">/</span>
                        <span className="text-slate-900 dark:text-white font-bold bg-slate-100 dark:bg-white/5 px-2 py-1 rounded border border-slate-200 dark:border-white/10">
                            {editPlan?.title || 'Main Sequence'}
                        </span>
                    </nav>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center -space-x-2 mr-4 hidden sm:flex">
                        <div className="w-8 h-8 rounded-full border-2 border-white dark:border-black bg-slate-200 dark:bg-zinc-800 flex items-center justify-center text-[10px] text-slate-600 dark:text-white font-bold">AI</div>
                    </div>
                    <button
                        onClick={() => onNavigate && onNavigate('diff')}
                        className="hidden sm:block px-4 py-2 rounded-md border border-slate-300 dark:border-border-dark text-slate-600 dark:text-zinc-300 text-xs font-bold font-display uppercase tracking-wider hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                    >
                        Compare & Commit
                    </button>
                    <button className="px-4 py-2 rounded-md bg-primary text-black text-xs font-bold font-display uppercase tracking-wider hover:bg-primary_hover transition-colors flex items-center gap-2 shadow-lg">
                        <span className="material-icons-outlined text-sm">ios_share</span>
                        <span className="hidden sm:inline">Export</span>
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex overflow-hidden relative">

                {/* Left Sidebar: Instruction Stack */}
                <aside className={`w-80 flex-shrink-0 flex flex-col border-r border-slate-200 dark:border-border-dark bg-white dark:bg-background-dark absolute top-0 bottom-0 left-0 z-30 lg:relative transition-transform duration-300 ${activeTab === 'instructions' ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
                    <div className="p-4 border-b border-slate-200 dark:border-border-dark flex items-center justify-between">
                        <h2 className="font-display font-bold text-lg text-slate-900 dark:text-white">Instruction Stack</h2>
                        <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-400 uppercase border border-slate-200 dark:border-border-dark px-1.5 py-0.5 rounded bg-slate-50 dark:bg-surface-card">OTIO v2.1</span>
                    </div>

                    {/* Display Edit Plan if available */}
                    {/* Display Edit Plan if available */}
                    {editPlan && (
                        <div className="px-4 pt-4 pb-0">
                            <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 mb-2">
                                <div className="text-xs font-bold text-primary mb-1 flex items-center gap-2">
                                    <span className="material-icons-outlined text-sm">smart_toy</span>
                                    Active Plan: {editPlan.title || 'Untitled'}
                                </div>
                                <div className="text-[10px] text-slate-300">
                                    {editPlan.tasks && Array.isArray(editPlan.tasks) ? `${editPlan.tasks.length} tasks synced` : 'Plan configuration loaded'}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        <div className="text-xs font-mono text-slate-500 dark:text-gray-500 uppercase mb-2 ml-1">Sequence A</div>

                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleDragEnd}
                        >
                            <SortableContext
                                items={clips}
                                strategy={verticalListSortingStrategy}
                            >
                                {clips.map((clip) => (
                                    <SortableClip key={clip.id} clip={clip} />
                                ))}
                            </SortableContext>
                        </DndContext>

                        <div className="h-10 border-2 border-dashed border-slate-200 dark:border-white/5 rounded-lg flex items-center justify-center text-slate-400 dark:text-gray-600 text-xs font-mono">
                            Drop clips here
                        </div>
                    </div>
                    <div className="p-3 border-t border-slate-200 dark:border-border-dark bg-white dark:bg-background-dark text-[10px] font-mono text-slate-500 dark:text-gray-600 flex justify-between">
                        <span>TOTAL: 00:12:57</span>
                        <span>{clips.length} CLIPS</span>
                    </div>
                </aside>

                {/* Center: Viewer & Timeline */}
                <main className="flex-1 flex flex-col relative bg-background-dark border-r border-slate-200 dark:border-border-dark z-0 min-w-0">
                    {/* Viewer */}
                    <div className="flex-1 flex items-center justify-center p-4 md:p-8 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-zinc-800 via-zinc-900 to-black">
                        <div className="relative w-full aspect-video bg-background-dark border border-border-dark rounded-lg shadow-2xl overflow-hidden group max-h-[60vh] flex items-center justify-center">
                            <Player
                                ref={playerRef}
                                component={MyVideo}
                                durationInFrames={900}
                                compositionWidth={1920}
                                compositionHeight={1080}
                                fps={30}
                                controls={false} // Use our custom controls
                                style={{
                                    width: '100%',
                                    height: '100%',
                                }}
                                inputProps={{
                                    title: editPlan?.title || 'Trem AI Project'
                                }}
                            />

                            {/* Overlay Play Button (only when paused) */}
                            {!isPlaying && (
                                <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/20 backdrop-blur-[1px] transition-opacity">
                                    <button
                                        onClick={togglePlay}
                                        className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white hover:bg-primary hover:border-primary transition-all transform hover:scale-110 shadow-lg"
                                    >
                                        <span className="material-icons-outlined text-4xl ml-1">play_arrow</span>
                                    </button>
                                </div>
                            )}

                            {/* Rec Indicator */}
                            <div className="absolute top-4 left-4 z-20 flex items-center gap-2 pointer-events-none">
                                <span className={`w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] ${isPlaying ? 'animate-pulse' : 'opacity-50'}`}></span>
                                <span className="text-xs font-mono text-white/80 drop-shadow-md">LIVE PREVIEW</span>
                            </div>
                        </div>
                    </div>

                    <div className="h-40 md:h-32 bg-white dark:bg-background-dark border-t border-slate-200 dark:border-border-dark p-4 flex flex-col justify-between">
                        {/* Timeline Bar */}
                        <div className="w-full h-8 flex items-center gap-2 md:gap-4 group">
                            <span className="text-xs font-mono text-slate-600 dark:text-zinc-400 w-12 md:w-16 text-right">00:00:{Math.floor(currentTime / 2)}</span>
                            <div className="flex-1 h-1.5 bg-slate-200 dark:bg-surface-card rounded-full relative cursor-pointer overflow-visible" onClick={handleSeek}>
                                <div
                                    className="absolute left-0 top-0 h-full bg-primary rounded-full transition-all duration-100 ease-linear"
                                    style={{ width: `${currentTime}%` }}
                                ></div>
                                <div
                                    className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)] transform scale-0 group-hover:scale-125 transition-all duration-100 z-10 border border-slate-200 dark:border-none pointer-events-none"
                                    style={{ left: `${currentTime}%` }}
                                ></div>
                            </div>
                            <span className="text-xs font-mono text-slate-400 dark:text-gray-500 w-12 md:w-16">00:01:30</span>
                        </div>

                        {/* Controls */}
                        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                            <div className="flex items-center gap-1 justify-center w-full md:w-auto">
                                <button className="p-2 text-slate-400 hover:text-slate-900 dark:text-gray-400 dark:hover:text-white transition-colors"><span className="material-icons-outlined">skip_previous</span></button>
                                <button onClick={togglePlay} className="p-2 text-slate-900 dark:text-white hover:text-primary transition-colors">
                                    <span className="material-icons-outlined text-3xl">{isPlaying ? 'pause_circle_filled' : 'play_circle_filled'}</span>
                                </button>
                                <button className="p-2 text-slate-400 hover:text-slate-900 dark:text-gray-400 dark:hover:text-white transition-colors"><span className="material-icons-outlined">skip_next</span></button>
                            </div>

                            <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-md px-4 py-2 w-full max-w-md mx-4 hidden sm:flex">
                                <div className="relative">
                                    <div className="w-2 h-2 bg-primary rounded-full animate-ping absolute opacity-75"></div>
                                    <div className="w-2 h-2 bg-primary rounded-full relative shadow-[0_0_8px_rgba(34,197,94,0.8)]"></div>
                                </div>
                                <div className="flex-1">
                                    <div className="flex justify-between items-center text-[10px] uppercase font-mono tracking-wider mb-1">
                                        <span className="text-slate-700 dark:text-white font-bold">Proxy Render</span>
                                        <span className="text-slate-400 dark:text-gray-400">78%</span>
                                    </div>
                                    <div className="w-full h-1 bg-slate-200 dark:bg-surface-card rounded-full overflow-hidden">
                                        <div className="h-full bg-primary w-[78%]"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </main>

                {/* Right Sidebar: AI Co-pilot */}
                <aside className={`w-80 flex-shrink-0 flex flex-col bg-gray-50 dark:bg-background-dark border-l border-slate-200 dark:border-border-dark absolute top-0 bottom-0 right-0 z-30 lg:relative transition-transform duration-300 ${activeTab === 'copilot' ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}>
                    <div className="p-4 border-b border-slate-200 dark:border-border-dark flex items-center justify-between bg-white dark:bg-background-dark z-10">
                        <div className="flex items-center gap-2">
                            <span className="material-icons-outlined text-primary">smart_toy</span>
                            <h2 className="font-display font-bold text-slate-900 dark:text-white">AI Co-pilot</h2>
                        </div>
                        <button className="text-slate-400 dark:text-gray-500 hover:text-slate-900 dark:hover:text-white"><span className="material-icons-outlined">history</span></button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-6 flex flex-col">
                        <div className="text-center">
                            <span className="text-[10px] text-slate-500 dark:text-zinc-700 font-mono bg-slate-200 dark:bg-surface-card px-2 py-1 rounded">Today, 10:23 AM</span>
                        </div>

                        <div className="flex flex-col items-end gap-1 ml-4 animate-fade-in-up">
                            <div className="bg-white border border-slate-200 dark:bg-surface-card dark:border-border-dark text-slate-800 dark:text-gray-100 text-sm p-3 rounded-2xl rounded-tr-sm shadow-sm max-w-full">
                                Swap the second clip for a close-up
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-[9px] text-slate-400 dark:text-gray-600 font-mono uppercase">User</span>
                            </div>
                        </div>

                        <div className="flex flex-col items-start gap-1 mr-4 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
                            <div className="flex gap-2 w-full">
                                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-primary to-emerald-800 flex items-center justify-center shrink-0 mt-1 shadow-[0_0_10px_rgba(34,197,94,0.4)]">
                                    <span className="material-icons-outlined text-[14px] text-white">auto_awesome</span>
                                </div>
                                <div className="flex-1">
                                    <div className="bg-white dark:bg-primary/5 text-slate-700 dark:text-gray-200 text-sm p-3 rounded-2xl rounded-tl-sm border border-slate-200 dark:border-primary/20 backdrop-blur-sm shadow-sm dark:shadow-[0_0_20px_-5px_rgba(34,197,94,0.15)]">
                                        <p className="mb-3 leading-relaxed">I'm on it. I've identified <span className="text-slate-700 dark:text-white font-mono text-xs bg-slate-100 dark:bg-white/10 px-1 rounded">Shot_02_CloseUp</span> as the best candidate.</p>
                                        <div className="bg-slate-50 dark:bg-background-dark/40 rounded border border-slate-200 dark:border-primary/30 p-2.5 flex items-center gap-3">
                                            <span className="material-icons-outlined text-primary animate-spin text-lg">sync</span>
                                            <div>
                                                <div className="text-xs font-bold text-slate-800 dark:text-white mb-0.5">Updating OTIO instructions...</div>
                                                <div className="text-[10px] font-mono text-slate-500 dark:text-gray-400">Re-rendering proxy (Layer 3)</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="p-4 border-t border-slate-200 dark:border-border-dark bg-white dark:bg-background-dark">
                        <div className="relative group">
                            <div className="absolute -inset-0.5 bg-gradient-to-r from-primary to-emerald-900 rounded-lg blur opacity-20 group-focus-within:opacity-50 transition duration-500 hidden dark:block"></div>
                            <div className="relative flex items-center bg-slate-50 dark:bg-surface-card rounded-lg border border-slate-200 dark:border-border-dark focus-within:border-primary/50 transition-colors">
                                <input
                                    className="w-full bg-transparent border-none text-sm text-slate-800 dark:text-white focus:ring-0 py-3 pl-3 pr-10 font-mono placeholder-slate-400 dark:placeholder-zinc-600 focus:outline-none"
                                    placeholder="Command agents..."
                                    type="text"
                                />
                                <button className="absolute right-2 p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 rounded transition-all">
                                    <span className="material-icons-outlined text-lg">send</span>
                                </button>
                            </div>
                        </div>
                        <div className="flex justify-between mt-2 px-1">
                            <span className="text-[10px] text-slate-400 dark:text-zinc-600 font-mono">Model: Trem-v4-Turbo</span>
                            <span className="text-[10px] text-slate-400 dark:text-zinc-600 font-mono">Context: 4k Tokens</span>
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );
};

export default TimelineEditor;
