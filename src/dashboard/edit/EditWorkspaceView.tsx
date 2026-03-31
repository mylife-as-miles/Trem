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

    const fallbackRepo = initialRepo || { name: 'Select Repo', brief: 'Choose a repository before you run an edit plan.', created: Date.now() } as RepoData;
    const activeRepo = repos.find(r => r.id === selectedRepoId) || fallbackRepo;
    const activeMode = MSG_MODES.find(m => m.id === selectedModeId) || MSG_MODES[0];
    const primaryActionLabel = selectedModeId === 'interactive' ? 'Plan Changes' : 'Execute Edit';
    const statusLabel = isProcessing ? 'Processing request' : (selectedModeId === 'interactive' ? 'Planning mode' : 'Auto-execute mode');

    return (
        <div className="relative flex min-h-full flex-col fade-in bg-slate-50/50 font-sans dark:bg-background-dark">

            <div className="sticky top-0 z-30 border-b border-slate-200 bg-slate-50/80 backdrop-blur-md dark:border-border-dark dark:bg-background-dark/80">
                <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 md:px-6">
                    <div className="flex items-center gap-3 md:gap-4">
                        {onBack && (
                            <button
                                onClick={onBack}
                                className="rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
                            >
                                <span className="material-icons-outlined text-lg">arrow_back</span>
                            </button>
                        )}
                        <div className="flex items-center gap-2 text-sm">
                            <span className="text-slate-500 dark:text-gray-500">Trem Edit</span>
                            <span className="text-slate-300 dark:text-gray-700">/</span>
                            <span className="font-semibold text-slate-900 dark:text-white">{activeRepo.name}</span>
                        </div>
                    </div>

                    <div className="hidden items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.18em] text-primary sm:inline-flex">
                        <span className="h-2 w-2 rounded-full bg-primary animate-pulse"></span>
                        {statusLabel}
                    </div>
                </div>
            </div>

            <div className="flex-1 p-6 md:p-10">
                <div className="mx-auto w-full max-w-6xl space-y-10">

                    <div className="space-y-6 py-8 text-center md:py-12">
                        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium tracking-wide text-emerald-600 dark:text-primary">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse"></span>
                            AI-POWERED EDIT PLANNING
                        </div>

                        <h1 className="text-5xl font-display font-bold tracking-tight text-slate-900 dark:text-white md:text-7xl">
                            How should we <span className="text-primary">edit this?</span>
                        </h1>
                        <p className="mx-auto max-w-2xl text-lg font-light leading-relaxed text-slate-500 dark:text-gray-400 md:text-xl">
                            Shape the edit in natural language, target the right repository, and decide whether Trem should plan with you or execute immediately.
                        </p>

                        <div className="flex flex-wrap justify-center gap-2 pt-2">
                            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 dark:border-border-dark dark:bg-surface-card dark:text-gray-300">
                                <span className="h-1.5 w-1.5 rounded-full bg-primary"></span>
                                {activeRepo.name}
                            </div>
                            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 dark:border-border-dark dark:bg-surface-card dark:text-gray-300">
                                <span className="h-1.5 w-1.5 rounded-full bg-primary"></span>
                                {activeMode.label}
                            </div>
                            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 dark:border-border-dark dark:bg-surface-card dark:text-gray-300">
                                <span className="h-1.5 w-1.5 rounded-full bg-primary"></span>
                                {selectedAssetIds.length} attached assets
                            </div>
                        </div>
                    </div>

                    <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white/75 shadow-xl dark:border-border-dark dark:bg-surface-card/85">
                        <div className="flex flex-col gap-5 border-b border-slate-200/70 bg-slate-50/70 px-5 py-5 dark:border-border-dark dark:bg-background-dark/50 md:px-6">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                                <div className="max-w-2xl">
                                    <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">Edit Command Center</h2>
                                    <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-gray-400">
                                        Keep the brief explicit, pick the right source repository, and decide whether you want a collaborative plan or a direct execution pass.
                                    </p>
                                </div>
                                <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.18em] text-slate-500 dark:border-border-dark dark:bg-surface-card dark:text-gray-400">
                                    {repos.length} repos available
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.18em] text-slate-500 dark:border-border-dark dark:bg-surface-card dark:text-gray-400">
                                    <span className="h-1.5 w-1.5 rounded-full bg-primary"></span>
                                    Repo: {activeRepo.name}
                                </div>
                                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.18em] text-slate-500 dark:border-border-dark dark:bg-surface-card dark:text-gray-400">
                                    <span className="h-1.5 w-1.5 rounded-full bg-primary"></span>
                                    Mode: {activeMode.label}
                                </div>
                                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.18em] text-slate-500 dark:border-border-dark dark:bg-surface-card dark:text-gray-400">
                                    <span className="h-1.5 w-1.5 rounded-full bg-primary"></span>
                                    Assets: {selectedAssetIds.length}
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-6 p-5 md:p-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                            <div className="space-y-6">

                    {/* Main Command Center Card */}
                    <div className="relative w-full">

                        <div className="relative flex min-h-[360px] flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm dark:border-border-dark dark:bg-background-dark/55">
                            <div className="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(217,248,95,0.12),transparent_68%)]"></div>

                            <div className="relative flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-border-dark md:px-6">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                                        <span className="material-icons-outlined text-lg">auto_fix_high</span>
                                    </div>
                                    <div>
                                        <div className="text-sm font-display font-bold tracking-tight text-slate-900 dark:text-white">Edit Brief</div>
                                        <div className="mt-1 text-xs text-slate-500 dark:text-gray-400">Describe the edit in the same way you would brief an editor.</div>
                                    </div>
                                </div>
                                <div className="hidden text-[11px] font-mono uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500 sm:block">
                                    Cmd/Ctrl + Enter
                                </div>
                            </div>

                            <div className="min-h-[220px] flex-1 px-5 py-5 md:px-6">
                                <textarea
                                    className="min-h-[180px] w-full resize-none border-none bg-transparent p-0 text-xl font-display leading-relaxed text-slate-800 caret-primary outline-none placeholder:text-slate-300 dark:text-white dark:placeholder:text-zinc-600"
                                    placeholder={displayedPlaceholder}
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    autoFocus
                                />

                                {selectedAssetIds.length > 0 && (
                                    <div className="mt-5 flex flex-wrap gap-2">
                                        {selectedAssetIds.slice(0, 3).map((id) => (
                                            <div
                                                key={id}
                                                className="flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-primary"
                                            >
                                                <span className="material-icons-outlined text-[12px]">video_library</span>
                                                <span className="max-w-[110px] truncate">Asset {id.slice(0, 4)}</span>
                                                <button
                                                    onClick={() => setSelectedAssetIds((prev) => prev.filter((entry) => entry !== id))}
                                                    className="ml-1 transition-colors hover:text-red-500 dark:hover:text-red-400"
                                                >
                                                    <span className="material-icons-outlined block text-[12px]">close</span>
                                                </button>
                                            </div>
                                        ))}
                                        {selectedAssetIds.length > 3 && (
                                            <div className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-500 dark:border-border-dark dark:bg-surface-card dark:text-gray-400">
                                                +{selectedAssetIds.length - 3} more
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Toolbar / Action Bar */}
                            <div className="flex flex-col gap-4 border-t border-slate-100 bg-slate-50/70 px-5 py-4 dark:border-border-dark dark:bg-surface-card/50 md:px-6">

                                {/* Tools */}
                                <div className="flex flex-wrap items-center gap-2">

                                    {/* Repo Dropdown */}
                                    <div className="relative" ref={repoDropdownRef}>
                                        <button
                                            onClick={() => setIsRepoDropdownOpen(!isRepoDropdownOpen)}
                                            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-all whitespace-nowrap ${isRepoDropdownOpen
                                                ? 'border-primary/30 bg-primary/10 text-emerald-700 dark:text-primary'
                                                : 'border-slate-200 bg-white text-slate-600 hover:border-primary/30 hover:text-slate-900 dark:border-border-dark dark:bg-background-dark dark:text-slate-300 dark:hover:text-white'
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
                                                                    ? 'bg-primary/10 text-emerald-700 dark:text-primary'
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

                                    {/* Mode Selector */}
                                    <div className="relative" ref={modeDropdownRef}>
                                        <button
                                            onClick={() => setIsModeDropdownOpen(!isModeDropdownOpen)}
                                            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-all whitespace-nowrap ${isModeDropdownOpen
                                                ? 'border-primary/30 bg-primary/10 text-emerald-700 dark:text-primary'
                                                : 'border-slate-200 bg-white text-slate-600 hover:border-primary/30 hover:text-slate-900 dark:border-border-dark dark:bg-background-dark dark:text-slate-300 dark:hover:text-white'
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
                                                                ? 'bg-primary/10 text-emerald-700 dark:text-primary'
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
                                    <button
                                        onClick={() => setShowAssetLibrary(true)}
                                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-all hover:border-primary/30 hover:text-slate-900 active:scale-95 dark:border-border-dark dark:bg-background-dark dark:text-slate-300 dark:hover:text-white"
                                    >
                                        <span className="material-icons-outlined text-lg">video_library</span>
                                        Assets
                                        {selectedAssetIds.length > 0 && (
                                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-mono text-primary">
                                                {selectedAssetIds.length}
                                            </span>
                                        )}
                                    </button>
                                </div>

                                {/* Generate Button */}
                                <button
                                    onClick={handleSubmit}
                                    disabled={isProcessing || !prompt.trim()}
                                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-display font-bold tracking-wide text-black transition-all duration-200 ease-out hover:bg-primary_hover active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-border-dark dark:disabled:text-gray-500 sm:w-auto"
                                >
                                    <div className="flex items-center gap-2 relative z-10">
                                        <span className={isProcessing ? "animate-pulse" : ""}>{isProcessing ? 'Processing' : primaryActionLabel}</span>
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
                            <div className="mt-4 animate-in fade-in slide-in-from-top-2">
                                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-white/10 border border-slate-200 dark:border-border-dark text-slate-900 dark:text-white text-xs font-medium">
                                    <span className="material-icons-outlined text-sm">check_circle</span>
                                    {feedback}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Quick Suggestions */}
                    <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5 dark:border-border-dark dark:bg-background-dark/45">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">Quick Prompts</h3>
                        <p className="mt-2 text-sm text-slate-500 dark:text-gray-400">
                            Start with a concrete move, then refine once the plan is on the page.
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                        {SUGGESTIONS.slice(0, 3).map((sugg, i) => (
                            <button
                                key={i}
                                onClick={() => setPrompt(sugg)}
                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-slate-900 dark:border-border-dark dark:bg-surface-card dark:text-slate-400 dark:hover:text-white"
                            >
                                {sugg}
                            </button>
                        ))}
                        </div>
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
