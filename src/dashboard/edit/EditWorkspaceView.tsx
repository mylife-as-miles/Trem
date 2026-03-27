import React, { useState, useEffect, useRef } from 'react';
import { interpretAgentCommand } from '../../services/gemini/edit/index';
// Note: TopNavigation is now handled in the parent container
import { db, RepoData, AssetData } from '../../utils/db';
import AssetLibrary from '../assets/AssetLibraryPage';
import { useTremStore } from '../../store/useTremStore';
import { useRepos } from '../../hooks/useQueries';

interface EditWorkspaceViewProps {
    onNavigate: (view: any) => void; // Using any for compatibility with common types
    onSelectRepo?: (repo: RepoData) => void;
    onBack?: () => void;
    initialRepo?: RepoData;
    templateMode?: string;
    onPlan?: (prompt: string) => void;
}

const SUGGESTIONS = [
    "Auto-edit the highlights from yesterday's raw footage",
    "Apply the 'Cinematic' LUT to all clips",
    "Detect and cut silence from the interview track",
    "Generate subtitles and translate to Spanish",
    "Sync cuts to the beat of the music track",
    "Stabilize shaky footage in the B-roll"
];

const MSG_MODES = [
    { id: 'interactive', label: 'Interactive Planning', icon: 'forum', description: 'Collaborate on the plan before execution.' },
    { id: 'start', label: 'Start / Auto-Execute', icon: 'play_arrow', description: 'Immediately execute the command.' },
];

const EditWorkspaceView: React.FC<EditWorkspaceViewProps> = ({ onNavigate, onSelectRepo, onBack, initialRepo, templateMode, onPlan }) => {
    const [prompt, setPrompt] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const [feedback, setFeedback] = useState<string | null>(null);

    // Repo Selection State
    // Repo Selection State
    const { data: repos = [], isLoading: isLoadingRepos } = useRepos();
    const [selectedRepoId, setSelectedRepoId] = useState<number | undefined>(initialRepo?.id);
    const [isRepoDropdownOpen, setIsRepoDropdownOpen] = useState(false);
    const [repoSearch, setRepoSearch] = useState("");
    const repoDropdownRef = useRef<HTMLDivElement>(null);

    // Mode Selection State
    const [selectedModeId, setSelectedModeId] = useState<string>("interactive");
    const [isModeDropdownOpen, setIsModeDropdownOpen] = useState(false);
    const modeDropdownRef = useRef<HTMLDivElement>(null);

    // Typewriter State
    const [suggestionIndex, setSuggestionIndex] = useState(0);
    const [charIndex, setCharIndex] = useState(0);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isPaused, setIsPaused] = useState(false);

    // Asset Library Modal State
    const [showAssetLibrary, setShowAssetLibrary] = useState(false);
    const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);

    // Initial Prompt from Template
    useEffect(() => {
        if (templateMode) {
            setPrompt(`Apply ${templateMode} to the current sequence...`);
        }
    }, [templateMode]);

    // Initialize Selected Repo
    useEffect(() => {
        if (initialRepo && !selectedRepoId) {
            setSelectedRepoId(initialRepo.id);
        }

        // Click outside listener
        const handleClickOutside = (event: MouseEvent) => {
            if (repoDropdownRef.current && !repoDropdownRef.current.contains(event.target as Node)) {
                setIsRepoDropdownOpen(false);
            }
            if (modeDropdownRef.current && !modeDropdownRef.current.contains(event.target as Node)) {
                setIsModeDropdownOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [initialRepo, selectedRepoId]);

    // Typewriter Effect
    useEffect(() => {
        const currentText = SUGGESTIONS[suggestionIndex];
        let timer: NodeJS.Timeout;

        if (isPaused) {
            timer = setTimeout(() => {
                setIsPaused(false);
                setIsDeleting(true);
            }, 2000);
            return () => clearTimeout(timer);
        }

        if (isDeleting) {
            if (charIndex > 0) {
                timer = setTimeout(() => {
                    setCharIndex((prev) => prev - 1);
                }, 30);
            } else {
                setIsDeleting(false);
                setSuggestionIndex((prev) => (prev + 1) % SUGGESTIONS.length);
            }
        } else {
            if (charIndex < currentText.length) {
                timer = setTimeout(() => {
                    setCharIndex((prev) => prev + 1);
                }, 50);
            } else {
                setIsPaused(true);
            }
        }

        return () => clearTimeout(timer);
    }, [charIndex, isDeleting, isPaused, suggestionIndex]);

    const displayedPlaceholder = "Example: " + SUGGESTIONS[suggestionIndex].substring(0, charIndex);


    const handleSubmit = async () => {
        if (!prompt.trim()) return;

        // Interactive Mode -> Go to Planning View
        if (selectedModeId === 'interactive' && onPlan) {
            onPlan(prompt);
            return;
        }

        setIsProcessing(true);
        setFeedback(null);

        try {
            // Edit Logic (Auto-Execute)
            const response = await interpretAgentCommand(prompt);
            setFeedback(response);

            // Update Store with Auto-Execute Plan
            useTremStore.getState().setEditPlan({
                title: 'Auto-Execute Run',
                tasks: [],
                description: response
            });

            setTimeout(() => {
                onNavigate('timeline');
            }, 1500);

        } catch (e) {
            console.error(e);
            setFeedback("Error processing edit command. Please try again.");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            handleSubmit();
        }
    }

    const filteredRepos = repos.filter(repo =>
        repo.name.toLowerCase().includes(repoSearch.toLowerCase())
    );

    const activeRepo = repos.find(r => r.id === selectedRepoId) || (initialRepo || { name: 'Select Repo' });
    const activeMode = MSG_MODES.find(m => m.id === selectedModeId) || MSG_MODES[0];

    return (
        <div className="flex flex-col min-h-full relative fade-in bg-slate-50/50 dark:bg-background-dark font-sans">

            {/* Header / Breadcrumb Area */}
            <div className="sticky top-0 z-30 flex items-center justify-between px-6 h-14 bg-slate-50/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-slate-200 dark:border-border-dark">
                <div className="flex items-center gap-4">
                    {onBack && (
                        <button
                            onClick={onBack}
                            className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 transition-colors text-slate-500 dark:text-gray-400"
                        >
                            <span className="material-icons-outlined text-lg">arrow_back</span>
                        </button>
                    )}
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-slate-500 dark:text-gray-500">Trem Edit</span>
                        <span className="text-slate-300 dark:text-gray-700">/</span>
                        <span className="font-semibold text-slate-900 dark:text-white">
                            {activeRepo.name}
                        </span>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-12 w-full max-w-5xl mx-auto">
                <div className="w-full space-y-8">

                    {/* Hero Text */}
                    <div className="text-center space-y-3">
                        <h1 className="text-4xl md:text-5xl font-display font-bold text-slate-900 dark:text-white tracking-tight">
                            How should we edit this?
                        </h1>
                        <p className="text-lg text-slate-500 dark:text-gray-400 max-w-2xl mx-auto">
                            Describe your changes, select your repository, and choose your execution mode.
                        </p>
                    </div>

                    {/* Main Command Center Card */}
                    <div className="relative group w-full max-w-3xl mx-auto">

                        <div className="relative bg-white dark:bg-surface-card border border-slate-200 dark:border-border-dark rounded-2xl shadow-xl flex flex-col min-h-[320px]">

                            {/* Input Area */}
                            <div className="flex-1 p-6 relative">
                                <div className="absolute top-6 left-6 text-primary pointer-events-none">
                                    <span className="material-icons-outlined text-xl">auto_fix_high</span>
                                </div>

                                <textarea
                                    className="w-full h-full bg-transparent border-none focus:ring-0 text-xl font-display text-slate-800 dark:text-white placeholder-slate-300 dark:placeholder-zinc-600 resize-none pl-10 p-0 leading-relaxed caret-primary outline-none"
                                    placeholder={displayedPlaceholder}
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    autoFocus
                                />
                            </div>

                            {/* Toolbar / Action Bar */}
                            <div className="px-6 py-4 bg-slate-50/50 dark:bg-white/[0.02] border-t border-slate-100 dark:border-border-dark flex flex-col sm:flex-row items-center justify-between gap-4">

                                {/* Tools */}
                                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">

                                    {/* Repo Dropdown */}
                                    <div className="relative" ref={repoDropdownRef}>
                                        <button
                                            onClick={() => setIsRepoDropdownOpen(!isRepoDropdownOpen)}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all whitespace-nowrap ${isRepoDropdownOpen
                                                ? 'bg-primary/20 dark:bg-primary/10 border-primary/30 dark:border-primary/20 text-emerald-700 dark:text-primary'
                                                : 'border-transparent hover:bg-white dark:hover:bg-white/10 hover:border-slate-200 dark:hover:border-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                                }`}
                                        >
                                            <span className="material-icons-outlined text-lg">folder_open</span>
                                            <span className="max-w-[150px] truncate">{activeRepo.name}</span>
                                            <span className="material-icons-outlined text-xs opacity-50">expand_more</span>
                                        </button>

                                        {isRepoDropdownOpen && (
                                            <div className="absolute bottom-full left-0 mb-2 w-72 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-dark rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col origin-bottom-left animate-in fade-in zoom-in-95 duration-100">
                                                <div className="p-2 border-b border-slate-100 dark:border-border-dark">
                                                    <input
                                                        type="text"
                                                        placeholder="Search repositories..."
                                                        className="w-full bg-slate-50 dark:bg-white/5 border-none rounded-lg px-3 py-1.5 text-xs focus:ring-1 focus:ring-primary text-slate-700 dark:text-gray-200 placeholder-slate-400"
                                                        value={repoSearch}
                                                        onChange={(e) => setRepoSearch(e.target.value)}
                                                        autoFocus
                                                    />
                                                </div>
                                                <div className="max-h-60 overflow-y-auto p-1 custom-scrollbar">
                                                    {filteredRepos.length === 0 ? (
                                                        <div className="px-3 py-2 text-xs text-slate-400 text-center">No projects found</div>
                                                    ) : (
                                                        filteredRepos.map(repo => (
                                                            <button
                                                                key={repo.id}
                                                                onClick={() => {
                                                                    setSelectedRepoId(repo.id);
                                                                    setIsRepoDropdownOpen(false);
                                                                    setRepoSearch("");
                                                                    if (onSelectRepo) onSelectRepo(repo);
                                                                }}
                                                                className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors flex items-center gap-2 ${selectedRepoId === repo.id
                                                                    ? 'bg-primary/20 dark:bg-primary/10 text-emerald-700 dark:text-primary'
                                                                    : 'hover:bg-slate-50 dark:hover:bg-white/5 text-slate-600 dark:text-slate-300'
                                                                    }`}
                                                            >
                                                                <span className="material-icons-outlined text-sm opacity-70">movie</span>
                                                                <span className="flex-1 truncate">{repo.name}</span>
                                                                {selectedRepoId === repo.id && <span className="material-icons-outlined text-sm">check</span>}
                                                            </button>
                                                        ))
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="w-px h-4 bg-slate-200 dark:bg-white/10 mx-1"></div>

                                    {/* Mode Selector */}
                                    <div className="relative" ref={modeDropdownRef}>
                                        <button
                                            onClick={() => setIsModeDropdownOpen(!isModeDropdownOpen)}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all whitespace-nowrap ${isModeDropdownOpen
                                                ? 'bg-primary/20 dark:bg-primary/10 border-primary/30 dark:border-primary/20 text-emerald-700 dark:text-primary'
                                                : 'border-transparent hover:bg-white dark:hover:bg-white/10 hover:border-slate-200 dark:hover:border-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                                }`}
                                        >
                                            <span className="material-icons-outlined text-lg">{activeMode.icon}</span>
                                            <span>{activeMode.label}</span>
                                            <span className="material-icons-outlined text-xs opacity-50">expand_more</span>
                                        </button>

                                        {isModeDropdownOpen && (
                                            <div className="absolute bottom-full left-0 mb-2 w-64 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-dark rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col origin-bottom-left animate-in fade-in zoom-in-95 duration-100">
                                                <div className="p-1">
                                                    {MSG_MODES.map(mode => (
                                                        <button
                                                            key={mode.id}
                                                            onClick={() => {
                                                                setSelectedModeId(mode.id);
                                                                setIsModeDropdownOpen(false);
                                                            }}
                                                            className={`w-full text-left px-3 py-2.5 rounded-lg text-xs transition-colors flex items-start gap-3 ${selectedModeId === mode.id
                                                                ? 'bg-primary/20 dark:bg-primary/10 text-emerald-700 dark:text-primary'
                                                                : 'hover:bg-slate-50 dark:hover:bg-white/5 text-slate-600 dark:text-slate-300'
                                                                }`}
                                                        >
                                                            <span className="material-icons-outlined text-lg opacity-70 mt-0.5">{mode.icon}</span>
                                                            <div className="flex-1">
                                                                <div className="font-medium">{mode.label}</div>
                                                                <div className="text-[10px] opacity-70 mt-0.5 leading-tight">{mode.description}</div>
                                                            </div>
                                                            {selectedModeId === mode.id && <span className="material-icons-outlined text-sm mt-0.5">check</span>}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Generate Button */}
                                <button
                                    onClick={handleSubmit}
                                    disabled={isProcessing || !prompt.trim()}
                                    className={`relative group overflow-hidden bg-slate-900 dark:bg-white text-white dark:text-black px-6 py-2.5 rounded-xl font-medium text-sm transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none w-full sm:w-auto`}
                                >
                                    <div className="absolute inset-0 bg-primary opacity-0 group-hover:opacity-10 transition-opacity"></div>
                                    <div className="flex items-center gap-2 relative z-10">
                                        <span className={isProcessing ? "animate-pulse" : ""}>{isProcessing ? 'Processing' : (selectedModeId === 'interactive' ? 'Plan Changes' : 'Execute Edit')}</span>
                                        <span className={`material-icons-outlined text-base ${isProcessing ? 'animate-spin' : ''}`}>
                                            {isProcessing ? 'sync' : (selectedModeId === 'interactive' ? 'forum' : 'auto_fix_high')}
                                        </span>
                                    </div>
                                </button>
                            </div>

                            {/* Processing Progress Bar (Optional) */}
                            {isProcessing && (
                                <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-100 dark:bg-white/5">
                                    <div className="h-full bg-primary animate-pulse w-full"></div>
                                </div>
                            )}
                        </div>

                        {/* Feedback / Status Message under the card */}
                        {feedback && (
                            <div className="mt-4 text-center animate-in fade-in slide-in-from-top-2">
                                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-white/10 border border-slate-200 dark:border-white/20 text-slate-900 dark:text-white text-xs font-medium">
                                    <span className="material-icons-outlined text-sm">check_circle</span>
                                    {feedback}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Quick Suggestions */}
                    <div className="flex flex-wrap justify-center gap-2 max-w-4xl mx-auto opacity-0 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200 fill-mode-forwards">
                        {SUGGESTIONS.slice(0, 3).map((sugg, i) => (
                            <button
                                key={i}
                                onClick={() => setPrompt(sugg)}
                                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-border-dark hover:border-primary/20 dark:hover:border-primary/20 bg-white dark:bg-surface-card hover:bg-primary/5 dark:hover:bg-primary/5 text-xs text-slate-500 dark:text-slate-400 transition-colors"
                            >
                                {sugg}
                            </button>
                        ))}
                    </div>

                </div>
            </div>

            {/* Asset Library Modal Overlay */}
            {showAssetLibrary && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background-dark/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
                    <AssetLibrary
                        isModal
                        onClose={() => setShowAssetLibrary(false)}
                        onSelect={(assets) => {
                            setSelectedAssetIds(prev => [...new Set([...prev, ...assets])]);
                            setShowAssetLibrary(false);
                        }}
                    />
                </div>
            )}
        </div>
    );
};

export default EditWorkspaceView;
