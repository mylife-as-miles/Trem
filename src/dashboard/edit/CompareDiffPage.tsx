import React, { useState, useRef } from 'react';
import MarkdownRenderer from '../../components/ui/MarkdownRenderer';
import TopNavigation from '../../components/layout/TopNavigation';
import { useTremStore } from '../../store/useTremStore';

interface CompareDiffViewProps {
    onNavigate?: (view: 'timeline' | 'dashboard' | 'repo' | 'diff' | 'assets') => void;
}

const CompareDiffView: React.FC<CompareDiffViewProps> = ({ onNavigate }) => {
    // Global State
    const { repoData } = useTremStore();

    // For the slider interaction
    const [sliderPosition, setSliderPosition] = useState(50);
    const containerRef = useRef<HTMLDivElement>(null);
    const isDragging = useRef(false);

    const handleMouseDown = () => {
        isDragging.current = true;
    };

    const handleMouseUp = () => {
        isDragging.current = false;
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging.current || !containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width;

        let percentage = (x / width) * 100;
        percentage = Math.max(0, Math.min(100, percentage)); // Clamp between 0 and 100

        setSliderPosition(percentage);
    };

    // Global event listener for mouse up to handle dragging outside the div
    React.useEffect(() => {
        const handleGlobalMouseUp = () => {
            isDragging.current = false;
        };

        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }, []);


    return (
        <div className="flex flex-col h-full bg-background-light dark:bg-background-dark text-slate-800 dark:text-slate-200 font-sans overflow-hidden selection:bg-primary selection:text-white transition-colors duration-200">
            {/* Main Header: Context & Actions */}
            <div className="h-16 border-b border-border-dark bg-surface-card flex items-center justify-between px-6 flex-shrink-0 z-30 relative">
                <div className="flex items-center gap-4 text-xs font-mono">
                    <div
                        className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-white shadow-[0_0_15px_rgba(34,197,94,0.5)] cursor-pointer hover:scale-105 transition-transform"
                        onClick={() => onNavigate && onNavigate('repo')}
                    >
                        <span className="material-icons-outlined text-xl">folder_open</span>
                    </div>
                    <div className="flex flex-col">
                        <span
                            className="text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer transition-colors mb-1"
                            onClick={() => onNavigate && onNavigate('repo')}
                        >
                            {repoData ? repoData.name : 'untitled-project'}
                        </span>
                        <div className="flex items-center gap-2">
                            <span className="text-slate-400">Comparing:</span>
                            <div className="flex items-center gap-2 px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-300">
                                <span className="material-icons-outlined text-[10px]">call_split</span>
                                main
                            </div>
                            <span className="material-icons-outlined text-slate-500 text-sm">arrow_forward</span>
                            <div className="flex items-center gap-2 px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary">
                                <span className="material-icons-outlined text-[10px]">call_split</span>
                                faster-cut
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button className="px-3 py-1.5 rounded-md border border-white/10 hover:bg-white/5 text-slate-400 hover:text-white transition-colors text-xs font-bold tracking-wide uppercase">
                        Reject
                    </button>
                    <button
                        onClick={() => onNavigate && onNavigate('repo')}
                        className="px-3 py-1.5 rounded-md bg-primary hover:bg-primary_hover text-black text-xs font-bold shadow-lg transition-all tracking-wide uppercase flex items-center gap-2"
                    >
                        <span className="material-icons-outlined text-sm">merge</span>
                        Merge PR #{repoData ? '84' : '42'}
                    </button>
                </div>
            </div>

            <div className="flex-1 flex flex-col min-h-0">

                {/* Visual Diff Viewer */}
                <div
                    ref={containerRef}
                    className="h-[55%] relative w-full bg-black border-b border-border-dark overflow-hidden group select-none cursor-ew-resize"
                    onMouseMove={handleMouseMove}
                    onMouseDown={handleMouseDown}
                >
                    {/* Layer 1: Original (Bottom/Full) */}
                    <div className="absolute inset-0 w-full h-full">
                        <div className="w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-800 via-slate-900 to-black flex items-center justify-center relative">
                            <div className="absolute inset-0 opacity-30 diff-pattern"></div>
                            <div className="text-white/5 text-[8rem] md:text-[10rem] font-display font-bold rotate-12 absolute scale-150">
                                {repoData ? repoData.name.split('-')[0].toUpperCase() : 'NIKE'}
                            </div>
                        </div>
                    </div>

                    {/* Layer 2: New/Modified (Top/Clipped) */}
                    <div
                        className="absolute inset-0 w-full h-full"
                        style={{ clipPath: `polygon(${sliderPosition}% 0, 100% 0, 100% 100%, ${sliderPosition}% 100%)` }}
                    >
                        <div className="w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-900/40 via-slate-900 to-black flex items-center justify-center relative">
                            <div className="absolute inset-0 opacity-20 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjMDAwIiAvPgo8cmVjdCB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjYTg1NWY3IiBvcGFjaXR5PSIwLjMiIC8+Cjwvc3ZnPg==')]"></div>
                            <div className="text-blue-400/10 text-[8rem] md:text-[10rem] font-display font-bold rotate-12 absolute scale-150 blur-sm animate-pulse">
                                {repoData ? 'V2' : 'RUN'}
                            </div>
                        </div>
                    </div>

                    {/* Slider Handle */}
                    <div
                        className="absolute top-0 bottom-0 w-0.5 bg-primary cursor-col-resize z-20 flex items-center justify-center group-hover:bg-primary_hover transition-colors"
                        style={{ left: `${sliderPosition}%` }}
                    >
                        <div className="absolute top-1/2 -translate-y-1/2 w-8 h-8 md:w-10 md:h-10 rounded-full bg-primary flex items-center justify-center shadow-[0_0_15px_rgba(34,197,94,0.6)] border-2 border-black text-black cursor-col-resize hover:scale-110 transition-transform">
                            <span className="material-icons-outlined text-lg">code</span>
                        </div>
                    </div>

                    {/* Labels */}
                    <div className="absolute top-6 left-6 z-10 transition-opacity duration-200" style={{ opacity: sliderPosition < 10 ? 0 : 1 }}>
                        <div className="px-3 py-1.5 rounded bg-black/80 backdrop-blur-md border border-white/10 text-xs font-mono text-slate-400 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-slate-500"></span>
                            ORIGINAL (main)
                        </div>
                    </div>
                    <div className="absolute top-6 right-6 z-10 transition-opacity duration-200" style={{ opacity: sliderPosition > 90 ? 0 : 1 }}>
                        <div className="px-3 py-1.5 rounded bg-black/80 backdrop-blur-md border border-primary/30 text-xs font-mono text-primary flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                            AI EDIT (faster-cut)
                        </div>
                    </div>

                    {/* Media Controls */}
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-4 px-6 py-2 rounded-full bg-black/80 backdrop-blur border border-white/10 shadow-lg" onMouseDown={(e) => e.stopPropagation()}>
                        <button className="text-slate-300 hover:text-white transition-colors"><span className="material-icons-outlined">skip_previous</span></button>
                        <button className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:bg-primary hover:text-black transition-colors"><span className="material-icons-outlined">play_arrow</span></button>
                        <button className="text-slate-300 hover:text-white transition-colors"><span className="material-icons-outlined">skip_next</span></button>
                        <div className="h-4 w-px bg-white/20 mx-2"></div>
                        <span className="font-mono text-xs text-slate-400">00:15:04 / 00:30:00</span>
                    </div>
                </div>

                {/* Bottom Panel: Details */}
                <div className="h-[45%] flex w-full">

                    {/* Changes List */}
                    <div className="w-1/3 min-w-[320px] max-w-md border-r border-slate-200 dark:border-border-dark bg-white dark:bg-surface-card/50 flex flex-col">
                        <div className="px-6 py-4 border-b border-slate-200 dark:border-white/5 flex items-center justify-between">
                            <h3 className="font-display font-medium text-sm text-slate-900 dark:text-white tracking-wide">Changes</h3>
                            <span className="text-xs font-mono text-slate-500">3 diffs</span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-sm">
                            <div className="group p-3 rounded-lg border border-red-500/10 bg-red-50 dark:bg-red-500/5 hover:bg-red-100 dark:hover:bg-red-500/10 transition-all cursor-pointer">
                                <div className="flex items-start gap-3">
                                    <span className="material-icons-outlined text-red-500 text-lg mt-0.5">remove_circle</span>
                                    <div>
                                        <div className="text-red-600 dark:text-red-400 font-medium">Deleted: Shot_03</div>
                                        <div className="text-red-500/60 dark:text-red-400/60 text-xs mt-1">(Walking Sequence)</div>
                                    </div>
                                </div>
                            </div>
                            <div className="group p-3 rounded-lg border border-emerald-500/10 bg-emerald-50 dark:bg-emerald-500/5 hover:bg-emerald-100 dark:hover:bg-emerald-500/10 transition-all cursor-pointer">
                                <div className="flex items-start gap-3">
                                    <span className="material-icons-outlined text-emerald-500 text-lg mt-0.5">add_circle</span>
                                    <div>
                                        <div className="text-emerald-600 dark:text-emerald-400 font-medium">Added: Shot_05</div>
                                        <div className="text-emerald-500/60 dark:text-emerald-400/60 text-xs mt-1">(Running) @ 00:15</div>
                                    </div>
                                </div>
                            </div>
                            <div className="group p-3 rounded-lg border border-amber-500/10 bg-amber-50 dark:bg-amber-500/5 hover:bg-amber-100 dark:hover:bg-amber-500/10 transition-all cursor-pointer">
                                <div className="flex items-start gap-3">
                                    <span className="material-icons-outlined text-amber-500 text-lg mt-0.5">change_history</span>
                                    <div>
                                        <div className="text-amber-600 dark:text-amber-400 font-medium">Modified: Shot_02</div>
                                        <div className="text-amber-500/60 dark:text-amber-400/60 text-xs mt-1">Trimmed -2.5s to sync beat</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Agent Reasoning */}
                    <div className="flex-1 bg-gray-50 dark:bg-background-dark relative flex flex-col">
                        <div className="px-8 py-4 border-b border-slate-200 dark:border-white/5">
                            <div className="flex items-center gap-2">
                                <span className="material-icons-outlined text-primary text-sm">psychology</span>
                                <h3 className="font-display font-medium text-sm text-slate-900 dark:text-white tracking-wide">Agent Reasoning</h3>
                            </div>
                        </div>
                        <div className="flex-1 p-8 overflow-y-auto">
                            <div className="max-w-3xl">
                                <div className="flex gap-4 mb-6">
                                    <div className="flex-shrink-0">
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary to-emerald-900 flex items-center justify-center shadow-[0_0_10px_rgba(34,197,94,0.4)]">
                                            <span className="material-icons-outlined text-black text-lg">smart_toy</span>
                                        </div>
                                    </div>
                                    <div className="bg-white dark:bg-surface-card/60 p-6 rounded-2xl rounded-tl-none border border-slate-200 dark:border-white/10 relative shadow-sm">
                                        <div className="absolute -left-2 top-0 w-4 h-4 bg-transparent border-t border-l border-slate-200 dark:border-white/10 [clip-path:polygon(0_0,100%_0,100%_100%)] bg-white dark:bg-background-dark"></div>
                                        <MarkdownRenderer
                                            content={`I've optimized the edit based on your request for a **"faster, higher energy"** cut.

Here is the logic behind the changes:

1.  **Removed Slow Walking (Shot_03)**:
    -   *Reasoning*: This shot dragged the pacing down and didn't fit the high-energy music track.
    
2.  **Added Running Sequence (Shot_05)**:
    -   *Reasoning*: Replaced the walking shot with this dynamic running angle. It matches the beat drop at 00:15 perfectly.

3.  **Trimmed Close-up (Shot_02)**:
    -   *Reasoning*: Tightened the reaction shot to remove the lingering confusion. It now cuts directly on the eye movement.

**Impact**: The total duration is reduced by 2 seconds, but the perceived energy is significantly higher. Do you want to review the audio mix next?`}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Floating Action Bar */}
                        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50">
                            <div className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl border border-slate-200 dark:border-white/10 p-1.5 rounded-full flex items-center gap-2 shadow-2xl pl-2">
                                <div className="px-3 text-xs font-mono text-slate-500 flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                                    Agent_GPT4
                                </div>
                                <div className="h-4 w-px bg-slate-200 dark:bg-white/10"></div>
                                <button className="px-4 py-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/5 text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors text-xs font-medium border border-transparent hover:border-slate-200 dark:hover:border-white/10">
                                    Reject
                                </button>
                                <button className="px-4 py-2 rounded-full bg-primary hover:bg-primary_hover text-black text-xs font-bold transition-all shadow-lg flex items-center gap-2">
                                    Merge Changes
                                </button>
                                <div className="h-4 w-px bg-slate-200 dark:bg-white/10"></div>
                                <button className="w-10 h-10 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-border-dark flex items-center justify-center text-primary transition-colors tooltip" title="Open Command">
                                    <span className="material-icons-outlined text-lg">chat_bubble</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CompareDiffView;
