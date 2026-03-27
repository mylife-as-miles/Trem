import React, { useState, useEffect, useMemo } from 'react';
import { useTremStore } from '../../store/useTremStore';

interface ActivityLogsViewProps {
    repoData?: any;
    onNavigate?: (view: string) => void;
    onSelectCommit?: (commit: any) => void;
}

interface CommitEntry {
    id: string;
    message: string;
    author: string;
    timestamp: string | number;
    hashtags?: string[];
    parent?: string | null;
    branch?: string;
    artifacts?: Record<string, any>;
}

const ActivityLogsView: React.FC<ActivityLogsViewProps> = (props) => {
    // Access global store
    const { repoData: storeRepoData, setCurrentView } = useTremStore();

    // Use props if provided (legacy/wrapper), otherwise fallback to store
    const repoData = props.repoData || storeRepoData;

    // Internal state
    const [commits, setCommits] = useState<CommitEntry[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedAuthor, setSelectedAuthor] = useState<string>('all');

    // Handle Back Navigation
    const handleBack = () => {
        // "Back" should return to the Repo Overview
        setCurrentView('repo');
    };

    // Compute derived state
    const { filteredCommits, stats, groupedCommits, authors } = useMemo(() => {
        let filtered = [...commits];

        // Search
        if (searchQuery.trim()) {
            filtered = filtered.filter(c =>
                (c.message || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                c.hashtags?.some(t => (t || '').toLowerCase().includes(searchQuery.toLowerCase()))
            );
        }

        // Author
        if (selectedAuthor !== 'all') {
            filtered = filtered.filter(c => c.author === selectedAuthor);
        }

        // Stats
        const total = commits.length;
        const aiCommits = commits.filter(c => (c.author || '').toLowerCase().includes('bot') || (c.author || '').toLowerCase().includes('ai') || c.hashtags?.includes('#ai-generated')).length;
        const authorsList = Array.from(new Set(commits.map(c => c.author)));

        // Grouping
        const groups: Record<string, CommitEntry[]> = {};
        filtered.forEach(commit => {
            // Safe timestamp handling
            const ts = commit.timestamp || Date.now();
            const date = new Date(ts);

            // Validate date
            const validDate = isNaN(date.getTime()) ? new Date() : date;

            const key = validDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
            if (!groups[key]) groups[key] = [];
            groups[key].push(commit);
        });

        return {
            filteredCommits: filtered,
            stats: { total, aiCommits, humanCommits: total - aiCommits },
            groupedCommits: groups,
            authors: authorsList
        };
    }, [commits, searchQuery, selectedAuthor]);

    // Load Data
    useEffect(() => {
        if (repoData?.fileSystem) {
            const commitsFolder = repoData.fileSystem.find((node: any) => node.name === 'commits');
            if (commitsFolder?.children) {
                const extracted: CommitEntry[] = commitsFolder.children
                    .map((f: any) => {
                        if (f.type === 'file' && f.content) {
                            try { return JSON.parse(f.content); } catch { return null; }
                        }
                        return null;
                    })
                    .filter((c: any) => c !== null)
                    .sort((a: any, b: any) => {
                        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
                        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
                        return timeB - timeA;
                    });
                setCommits(extracted);
            }
        }
    }, [repoData]);

    const formatTime = (ts: string | number) => {
        if (!ts) return "Just now";
        const date = new Date(ts);
        return isNaN(date.getTime())
            ? "Just now"
            : date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    };

    if (!repoData) {
        return <div className="p-8 text-center text-slate-500">Repository data not found.</div>;
    }

    return (
        <div className="h-full flex flex-col bg-slate-50 dark:bg-black p-6 lg:p-10 overflow-hidden">

            {/* Header & Stats Nav */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 flex-shrink-0 animate-fadeIn">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <button
                            onClick={handleBack}
                            className="p-1.5 -ml-2 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 text-slate-400 transition-colors"
                        >
                            <span className="material-icons-outlined">arrow_back</span>
                        </button>
                        <h1 className="text-3xl font-display font-bold text-slate-900 dark:text-white tracking-tight">
                            Activity Log
                        </h1>
                    </div>
                    <p className="text-slate-500 dark:text-slate-400 max-w-xl">
                        Track the evolution of <span className="text-slate-700 dark:text-white font-medium font-mono">{repoData?.name}</span> through AI generations and manual edits.
                    </p>
                </div>

                {/* Micro Stats Dashboard */}
                <div className="flex gap-4">
                    <div className="glass-panel px-5 py-3 rounded-2xl border border-slate-200 dark:border-white/10 bg-white/50 dark:bg-white/5">
                        <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Total Commits</div>
                        <div className="text-2xl font-bold text-slate-900 dark:text-white font-display">{stats.total}</div>
                    </div>
                    <div className="glass-panel px-5 py-3 rounded-2xl border border-slate-200 dark:border-white/10 bg-white/50 dark:bg-white/5 hidden sm:block">
                        <div className="text-xs text-emerald-600 dark:text-primary uppercase tracking-wider font-semibold mb-1">AI Generated</div>
                        <div className="text-2xl font-bold text-slate-900 dark:text-white font-display">{stats.aiCommits}</div>
                    </div>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="mb-8 flex-shrink-0 z-20">
                <div className="glass-panel p-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white/50 dark:bg-white/5 flex flex-col md:flex-row gap-2">
                    <div className="relative flex-1 group">
                        <span className="material-icons-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-600 dark:group-focus-within:text-primary transition-colors">search</span>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Filter by message, hash, or tag..."
                            className="w-full bg-transparent border-none outline-none pl-10 pr-4 py-2.5 text-slate-900 dark:text-white placeholder-slate-500"
                        />
                    </div>
                    <div className="h-px md:h-auto md:w-px bg-slate-200 dark:bg-white/10 mx-2" />
                    <div className="flex items-center gap-2 px-2">
                        <span className="text-sm text-slate-500 font-medium">Author:</span>
                        <select
                            value={selectedAuthor}
                            onChange={(e) => setSelectedAuthor(e.target.value)}
                            className="bg-transparent text-sm font-medium text-slate-700 dark:text-slate-200 outline-none cursor-pointer hover:text-emerald-600 dark:hover:text-primary transition-colors pr-8 py-2 border-none ring-0 focus:ring-0"
                        >
                            <option value="all">All Contributors</option>
                            {authors.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* Timeline Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-4 relative">
                {/* Vertical Timeline Line */}
                <div className="absolute left-8 top-4 bottom-0 w-px bg-gradient-to-b from-slate-300 via-slate-200 to-transparent dark:from-white/20 dark:via-white/5 dark:to-transparent" />

                <div className="space-y-8 pb-10">
                    {Object.entries(groupedCommits).map(([date, groupCommits]) => (
                        <div key={date} className="relative">
                            {/* Date Marker */}
                            <div className="sticky top-0 z-10 flex items-center gap-4 mb-6 pt-2 bg-slate-50/95 dark:bg-black/95 backdrop-blur-sm py-2">
                                <div className="w-16 flex justify-end">
                                    <span className="material-icons-outlined text-slate-300 dark:text-slate-600 text-sm">calendar_today</span>
                                </div>
                                <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                                    {date}
                                </h3>
                            </div>

                            <div className="space-y-4">
                                {groupCommits.map((commit, idx) => {
                                    const isAI = (commit.author || '').toLowerCase().includes('bot') || (commit.author || '').toLowerCase().includes('ai') || commit.hashtags?.includes('#ai-generated');

                                    return (
                                        <div
                                            key={commit.id}
                                            onClick={() => props.onSelectCommit?.(commit)}
                                            className="group relative flex items-start gap-6 cursor-pointer"
                                        >
                                            {/* Timeline Node */}
                                            <div className="absolute left-[31px] top-6 w-3 h-3 rounded-full bg-slate-200 dark:bg-zinc-800 border-2 border-slate-300 dark:border-white/20 group-hover:bg-primary group-hover:border-primary transition-all shadow-[0_0_0_4px_rgba(0,0,0,0)] group-hover:shadow-[0_0_0_4px_rgba(99,102,241,0.2)] z-10" />

                                            {/* Time Column */}
                                            <div className="w-16 pt-5 text-right flex-shrink-0">
                                                <span className="text-xs font-mono text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200 transition-colors">
                                                    {formatTime(commit.timestamp)}
                                                </span>
                                            </div>

                                            {/* Content Card */}
                                            <div className="flex-1 min-w-0">
                                                <div className="glass-panel p-5 rounded-2xl border border-slate-200 dark:border-white/5 bg-white dark:bg-zinc-900/50 hover:bg-white hover:shadow-lg dark:hover:bg-zinc-800 transition-all duration-200 group-hover:translate-x-1">
                                                    <div className="flex items-start justify-between gap-4">
                                                        <div className="flex items-start gap-4">
                                                            {/* Avatar */}
                                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${isAI
                                                                ? 'bg-gradient-to-br from-primary/20 to-emerald-500/20 text-primary'
                                                                : 'bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400'
                                                                }`}>
                                                                <span className="material-icons-outlined text-lg">
                                                                    {isAI ? 'auto_awesome' : 'person'}
                                                                </span>
                                                            </div>

                                                            <div>
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                                                                        {commit.author}
                                                                    </span>
                                                                    {isAI && (
                                                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-emerald-600 dark:text-primary border border-primary/20 uppercase tracking-wide">
                                                                            AI
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <h4 className="text-base font-medium text-slate-900 dark:text-white mb-2 leading-relaxed">
                                                                    {commit.message}
                                                                </h4>

                                                                {/* Hashtags */}
                                                                {commit.hashtags && commit.hashtags.length > 0 && (
                                                                    <div className="flex flex-wrap gap-2 mt-3">
                                                                        {commit.hashtags.map(t => (
                                                                            <span key={t} className="text-xs font-mono text-emerald-600 dark:text-primary bg-emerald-500/5 px-2 py-0.5 rounded hover:bg-emerald-500/10 transition-colors">
                                                                                {t}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Commit Hash */}
                                                        <div className="flex flex-col items-end gap-2">
                                                            <div className="font-mono text-xs text-slate-400 bg-slate-100 dark:bg-white/5 px-2 py-1 rounded border border-slate-200 dark:border-white/5 group-hover:border-primary/20 transition-colors">
                                                                {commit.id.substring(0, 7)}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Changed Files Footer (Collapsible-ish feel) */}
                                                    {commit.artifacts && Object.keys(commit.artifacts).length > 0 && (
                                                        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-white/5 flex items-center gap-4">
                                                            <div className="flex -space-x-2">
                                                                {Object.keys(commit.artifacts).slice(0, 4).map((type, i) => (
                                                                    <div
                                                                        key={i}
                                                                        className="w-6 h-6 rounded-full bg-slate-100 dark:bg-zinc-800 border border-white dark:border-zinc-700 flex items-center justify-center relative z-[1]"
                                                                        title={type}
                                                                    >
                                                                        <span className={`material-icons-outlined text-[10px] ${type === 'otio' ? 'text-primary' :
                                                                            type === 'dag' ? 'text-emerald-500' :
                                                                                type === 'scenes' ? 'text-emerald-400' :
                                                                                    'text-slate-400'
                                                                            }`}>
                                                                            {type === 'otio' ? 'videocam' : type === 'dag' ? 'account_tree' : type === 'scenes' ? 'movie' : 'description'}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                                {Object.keys(commit.artifacts).length > 4 && (
                                                                    <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-zinc-800 border border-white dark:border-zinc-700 flex items-center justify-center text-[8px] font-bold text-slate-500 z-[5]">
                                                                        +{Object.keys(commit.artifacts).length - 4}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <span className="text-xs text-slate-400">
                                                                {Object.values(commit.artifacts).flat().length} files changed
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}

                    {filteredCommits.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-20 opacity-50">
                            <span className="material-icons-outlined text-6xl mb-4">filter_list_off</span>
                            <h3 className="text-xl font-medium">No activity found</h3>
                            <p className="text-sm">Try adjusting your filters</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ActivityLogsView;
