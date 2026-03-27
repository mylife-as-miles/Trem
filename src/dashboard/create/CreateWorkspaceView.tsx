import React, { useState, useEffect, useRef } from 'react';
import { generateRemotionProject } from '../../services/gemini/create/index';
// Note: TopNavigation is now handled in the parent container
import { db, RepoData, AssetData } from '../../utils/db';
import { useRepos } from '../../hooks/useQueries';
import AssetLibrary from '../assets/AssetLibraryPage';

interface CreateWorkspaceViewProps {
    onNavigate: (view: 'timeline' | 'dashboard' | 'repo' | 'diff' | 'assets' | 'settings' | 'create-repo' | 'trem-create' | 'trem-edit') => void;
    onSelectRepo?: (repo: RepoData) => void;
    initialPrompt?: string;
    templateMode?: string;
    onBack?: () => void;
}

const SUGGESTIONS = [
    "Create a 30s product launch video for a new energy drink",
    "Generate a motion graphics intro with the brand logo",
    "Produce a parametrized social media ad set for A/B testing",
    "Make a kinetic typography explainer video",
    "Create a 15s teaser for an upcoming event",
    "Generate a software demo walkthrough with voiceover"
];

interface AgentOption {
    id: string;
    label: string;
    category: 'Persona' | 'Model' | 'Workflow';
    icon: string;
    description: string;
}

const AGENT_OPTIONS: AgentOption[] = [
    { id: 'creative-director', label: 'Creative Director', category: 'Persona', icon: 'auto_fix_high', description: 'Focuses on aesthetics, pacing, and brand alignment.' },
    { id: 'technical-editor', label: 'Technical Editor', category: 'Persona', icon: 'build', description: 'Optimizes for code quality, Remotion best practices, and performance.' },
    { id: 'social-manager', label: 'Social Media Manager', category: 'Persona', icon: 'share', description: 'Optimizes for engagement, vertical formats, and trends.' },
    { id: 'model-pro', label: 'Gemini 1.5 Pro', category: 'Model', icon: 'psychology', description: 'Highest fidelity reasoning for complex logic.' },
    { id: 'model-flash', label: 'Gemini Flash', category: 'Model', icon: 'bolt', description: 'Fastest generation speed for rapid prototyping.' },
    { id: 'workflow-remotion', label: 'Remotion Standard', category: 'Workflow', icon: 'movie', description: 'Standard 2D video composition workflow.' },
    { id: 'workflow-r3f', label: 'React Three Fiber', category: 'Workflow', icon: '3d_rotation', description: 'Advanced 3D scenes and WebGL integration.' },
    { id: 'workflow-experimental', label: 'Experimental Motion', category: 'Workflow', icon: 'science', description: 'Cutting-edge animation techniques (Beta).' },
];

const CreateWorkspaceView: React.FC<CreateWorkspaceViewProps> = ({ onNavigate, onSelectRepo, initialPrompt = "", templateMode, onBack }) => {
    const [prompt, setPrompt] = useState(initialPrompt);
    const [isProcessing, setIsProcessing] = useState(false);
    const [feedback, setFeedback] = useState<string | null>(null);

    // Typewriter State
    const [suggestionIndex, setSuggestionIndex] = useState(0);
    const [charIndex, setCharIndex] = useState(0);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isPaused, setIsPaused] = useState(false);

    // Asset Library Modal State
    const [showAssetLibrary, setShowAssetLibrary] = useState(false);
    const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);

    // Agent Settings State
    const [selectedAgentId, setSelectedAgentId] = useState<string>("creative-director");
    const [isAgentDropdownOpen, setIsAgentDropdownOpen] = useState(false);
    const [agentSearch, setAgentSearch] = useState("");
    const agentDropdownRef = useRef<HTMLDivElement>(null);

    // Repos (Still needed for "Recent Projects" list, but not the dropdown)
    const { data: repos = [] } = useRepos();

    useEffect(() => {
        // Click outside listener
        const handleClickOutside = (event: MouseEvent) => {
            if (agentDropdownRef.current && !agentDropdownRef.current.contains(event.target as Node)) {
                setIsAgentDropdownOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

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
        setIsProcessing(true);
        setFeedback(null);

        try {
            // 1. Generate Files
            const generatedFiles = await generateRemotionProject(prompt);
            setFeedback("Project structure generated successfully.");

            // 2. Resolve Assets
            const resolvedAssets: AssetData[] = [];
            if (selectedAssetIds.length > 0) {
                const assets = await Promise.all(selectedAssetIds.map(id => db.getAsset(id)));
                assets.forEach(a => {
                    if (a) resolvedAssets.push(a);
                });
            }

            // 3. Create Repo in DB
            const newRepo: Omit<RepoData, 'id'> = {
                name: prompt.length > 40 ? prompt.substring(0, 40) + "..." : prompt,
                brief: prompt,
                assets: resolvedAssets,
                fileSystem: Object.entries(generatedFiles).map(([path, content]) => ({ path, content })),
                created: Date.now()
            };

            const newRepoId = await db.addRepo(newRepo);

            // 4. Select Repo & Navigate
            if (onSelectRepo) {
                onSelectRepo({ ...newRepo, id: newRepoId });
                // Navigation happens in onSelectRepo or implicit view switch
            } else {
                // Fallback if no select handler
                onNavigate('repo');
            }

        } catch (e) {
            console.error(e);
            setFeedback("Error generating project. Please try again.");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            handleSubmit();
        }
    }

    const filteredAgents = AGENT_OPTIONS.filter(agent =>
        agent.label.toLowerCase().includes(agentSearch.toLowerCase()) ||
        agent.description.toLowerCase().includes(agentSearch.toLowerCase())
    );

    const activeAgent = AGENT_OPTIONS.find(a => a.id === selectedAgentId) || AGENT_OPTIONS[0];

    // Grouping for display
    const groupedAgents = filteredAgents.reduce((acc, agent) => {
        if (!acc[agent.category]) acc[agent.category] = [];
        acc[agent.category].push(agent);
        return acc;
    }, {} as Record<string, AgentOption[]>);


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
                        <span className="text-slate-500 dark:text-gray-500">Trem Create</span>
                        <span className="text-slate-300 dark:text-gray-700">/</span>
                        <span className="font-semibold text-slate-900 dark:text-white">
                            {templateMode ? templateMode : "New Project"}
                        </span>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-12 w-full max-w-5xl mx-auto">
                <div className="w-full space-y-8">

                    {/* Hero Text */}
                    <div className="text-center space-y-3">
                        <h1 className="text-4xl md:text-5xl font-display font-bold text-slate-900 dark:text-white tracking-tight">
                            What are we building today?
                        </h1>
                        <p className="text-lg text-slate-500 dark:text-gray-400 max-w-2xl mx-auto">
                            Describe your vision, select your creative director, and let Trem AI handle the production.
                        </p>
                    </div>

                    {/* Main Command Center Card */}
                    <div className="relative group w-full max-w-3xl mx-auto">


                        <div className="relative bg-white dark:bg-surface-card border border-slate-200 dark:border-border-dark rounded-2xl shadow-xl overflow-hidden flex flex-col min-h-[320px]">

                            {/* Input Area */}
                            <div className="flex-1 p-6 relative">
                                <div className="absolute top-6 left-6 text-primary pointer-events-none">
                                    <span className="material-icons-outlined text-xl">auto_awesome</span>
                                </div>

                                <textarea
                                    className="w-full h-full bg-transparent border-none focus:ring-0 text-xl font-display text-slate-800 dark:text-white placeholder-slate-300 dark:placeholder-zinc-600 resize-none pl-10 p-0 leading-relaxed caret-primary outline-none"
                                    placeholder={displayedPlaceholder}
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    autoFocus
                                />

                                {/* Selected Assets Chips (Overlay) */}
                                {selectedAssetIds.length > 0 && (
                                    <div className="absolute bottom-6 left-16 right-6 flex flex-wrap gap-2 pointer-events-none">
                                        {selectedAssetIds.map(id => (
                                            <div key={id} className="pointer-events-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-white/10 border border-slate-200 dark:border-border-dark text-xs font-medium text-slate-700 dark:text-slate-200 shadow-sm animate-in fade-in zoom-in-95 duration-200">
                                                <span className="material-icons-outlined text-[10px] opacity-70">movie</span>
                                                <span className="max-w-[100px] truncate">Asset {id.slice(0, 4)}</span>
                                                <button
                                                    onClick={() => setSelectedAssetIds(prev => prev.filter(p => p !== id))}
                                                    className="ml-1 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                                                >
                                                    <span className="material-icons-outlined text-[12px] block">close</span>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Toolbar / Action Bar */}
                            <div className="px-6 py-4 bg-slate-50/50 dark:bg-white/[0.02] border-t border-slate-100 dark:border-border-dark flex flex-col sm:flex-row items-center justify-between gap-4">

                                {/* Tools */}
                                <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0 scrollbar-hide">

                                    {/* Asset Library Trigger */}
                                    <button
                                        onClick={() => setShowAssetLibrary(true)}
                                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white dark:hover:bg-white/10 border border-transparent hover:border-slate-200 dark:hover:border-border-dark transition-all text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm font-medium whitespace-nowrap"
                                        title="Add Assets"
                                    >
                                        <span className="material-icons-outlined text-lg">video_library</span>
                                        <span>Assets</span>
                                        {selectedAssetIds.length > 0 && (
                                            <span className="bg-primary text-black text-[10px] px-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full font-bold ml-0.5">{selectedAssetIds.length}</span>
                                        )}
                                    </button>

                                    <div className="w-px h-4 bg-slate-200 dark:bg-white/10 mx-1"></div>

                                    {/* Agent Selector */}
                                    <div className="relative" ref={agentDropdownRef}>
                                        <button
                                            onClick={() => setIsAgentDropdownOpen(!isAgentDropdownOpen)}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all whitespace-nowrap ${isAgentDropdownOpen
                                                ? 'bg-primary/20 dark:bg-primary/10 border-primary/30 dark:border-primary/20 text-emerald-700 dark:text-primary'
                                                : 'border-transparent hover:bg-white dark:hover:bg-white/10 hover:border-slate-200 dark:hover:border-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                                }`}
                                        >
                                            <span className="material-icons-outlined text-lg">{activeAgent.icon}</span>
                                            <span>{activeAgent.label}</span>
                                            <span className="material-icons-outlined text-xs opacity-50">expand_more</span>
                                        </button>

                                        {isAgentDropdownOpen && (
                                            <div className="absolute bottom-full left-0 mb-2 w-72 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-dark rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col origin-bottom-left animate-in fade-in zoom-in-95 duration-100">
                                                <div className="p-2 border-b border-slate-100 dark:border-border-dark">
                                                    <input
                                                        type="text"
                                                        placeholder="Search agents..."
                                                        className="w-full bg-slate-50 dark:bg-white/5 border-none rounded-lg px-3 py-1.5 text-xs focus:ring-1 focus:ring-primary text-slate-700 dark:text-gray-200 placeholder-slate-400"
                                                        value={agentSearch}
                                                        onChange={(e) => setAgentSearch(e.target.value)}
                                                        autoFocus
                                                    />
                                                </div>
                                                <div className="max-h-60 overflow-y-auto p-1 custom-scrollbar">
                                                    {Object.entries(groupedAgents).map(([category, agents]) => (
                                                        <div key={category} className="mb-1">
                                                            <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-600">{category}</div>
                                                            {agents.map(agent => (
                                                                <button
                                                                    key={agent.id}
                                                                    onClick={() => {
                                                                        setSelectedAgentId(agent.id);
                                                                        setIsAgentDropdownOpen(false);
                                                                        setAgentSearch("");
                                                                    }}
                                                                    className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors flex items-center gap-2 ${selectedAgentId === agent.id
                                                                        ? 'bg-primary/20 dark:bg-primary/10 text-emerald-700 dark:text-primary'
                                                                        : 'hover:bg-slate-50 dark:hover:bg-white/5 text-slate-600 dark:text-slate-300'
                                                                        }`}
                                                                >
                                                                    <span className="material-icons-outlined text-sm opacity-70">{agent.icon}</span>
                                                                    <span className="flex-1">{agent.label}</span>
                                                                    {selectedAgentId === agent.id && <span className="material-icons-outlined text-sm">check</span>}
                                                                </button>
                                                            ))}
                                                        </div>
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
                                        <span className={isProcessing ? "animate-pulse" : ""}>{isProcessing ? 'Processing' : 'Generate'}</span>
                                        <span className={`material-icons-outlined text-base ${isProcessing ? 'animate-spin' : ''}`}>
                                            {isProcessing ? 'sync' : 'auto_fix_high'}
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

export default CreateWorkspaceView;
