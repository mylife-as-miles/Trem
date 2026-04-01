import React, { useEffect, useMemo, useState } from 'react';
import CommitDetailsView from './components/CommitDetails';
import { useSwitchProjectBranch } from '../../hooks/useQueries';
import { useTremStore } from '../../store/useTremStore';

interface ActivityLogsViewProps {
    repoData?: any;
    onNavigate?: (view: string) => void;
}

interface CommitEntry {
    id: string;
    message: string;
    author: string;
    timestamp: string | number;
    hashtags?: string[];
    parent?: string | null;
    parents?: string[];
    branch?: string;
    artifacts?: Record<string, any>;
    state?: Record<string, any>;
}

const GRAPH_LANE_COLORS = ['#D7FF4A', '#38BDF8', '#FB7185', '#A78BFA', '#F59E0B', '#34D399'];

const buildRepoBranchUrl = (repoId: string | number, suffix = '', branchName?: string | null) => {
    const url = new URL(`/repo/${repoId}${suffix}`, window.location.origin);
    if (branchName) {
        url.searchParams.set('branch', branchName);
    }
    return `${url.pathname}${url.search}`;
};

const getCommitTimestamp = (timestamp: string | number | undefined) => {
    if (typeof timestamp === 'number') return timestamp;
    if (typeof timestamp === 'string') {
        const parsed = new Date(timestamp).getTime();
        return Number.isNaN(parsed) ? Date.now() : parsed;
    }
    return Date.now();
};

const getCommitParents = (commit: CommitEntry) => {
    if (Array.isArray(commit.parents) && commit.parents.length > 0) {
        return commit.parents.filter(Boolean);
    }
    return commit.parent ? [commit.parent] : [];
};

const collectCommitIdsForHead = (commits: CommitEntry[], headId: string | null | undefined) => {
    if (!headId) return new Set<string>();

    const commitMap = new Map(commits.map((commit) => [commit.id, commit]));
    const visited = new Set<string>();
    const stack = [headId];

    while (stack.length > 0) {
        const currentId = stack.pop();
        if (!currentId || visited.has(currentId)) continue;
        visited.add(currentId);

        const commit = commitMap.get(currentId);
        if (!commit) continue;

        for (const parentId of getCommitParents(commit)) {
            if (!visited.has(parentId)) {
                stack.push(parentId);
            }
        }
    }

    return visited;
};

const getRelativeTime = (timestamp: string | number) => {
    const diff = Math.floor((Date.now() - getCommitTimestamp(timestamp)) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
};

const formatClockTime = (timestamp: string | number) => {
    const date = new Date(getCommitTimestamp(timestamp));
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
};

const formatDateLabel = (timestamp: string | number) => {
    const date = new Date(getCommitTimestamp(timestamp));
    return date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });
};

const getFilesChangedCount = (commit: CommitEntry) => {
    const changedFiles = commit.artifacts || commit.state || {};
    return Object.values(changedFiles).flat().filter(Boolean).length;
};

const ActivityLogsView: React.FC<ActivityLogsViewProps> = ({ repoData: propRepoData, onNavigate }) => {
    const { repoData: storeRepoData, setCurrentView } = useTremStore();
    const repoData = propRepoData || storeRepoData;
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedAuthor, setSelectedAuthor] = useState('all');
    const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>('all');
    const [selectedCommit, setSelectedCommit] = useState<CommitEntry | null>(null);

    const switchBranchMutation = useSwitchProjectBranch();
    const backendProjectId = typeof repoData?.id === 'string' ? repoData.id : null;
    const availableBranches = repoData?.branches || [];
    const selectedBranch = repoData?.selectedBranch || repoData?.activeBranch || 'main';
    const branchHeads = repoData?.branchHeads || {};

    useEffect(() => {
        setSelectedBranchFilter(selectedBranch || 'all');
    }, [selectedBranch]);

    const commits = useMemo<CommitEntry[]>(() => {
        const payloadCommits = Array.isArray(repoData?.commits) ? repoData.commits : [];
        return payloadCommits
            .map((commit: any) => ({
                ...commit,
                author: commit.author || 'Trem-AI',
                branch: commit.branch || 'main',
                timestamp: getCommitTimestamp(commit.timestamp),
                hashtags: Array.isArray(commit.hashtags) ? commit.hashtags : [],
                parents: Array.isArray(commit.parents) ? commit.parents : undefined,
            }))
            .sort((a, b) => getCommitTimestamp(b.timestamp) - getCommitTimestamp(a.timestamp));
    }, [repoData]);

    const authors = useMemo(
        () => Array.from(new Set(commits.map((commit) => commit.author).filter(Boolean))),
        [commits],
    );

    const filteredCommits = useMemo(() => {
        let branchScopedCommits = commits;

        if (selectedBranchFilter !== 'all') {
            const headId =
                branchHeads[selectedBranchFilter] ||
                availableBranches.find((branch: any) => branch.name === selectedBranchFilter)?.headCommitId ||
                null;
            const visibleCommitIds = collectCommitIdsForHead(commits, headId);
            branchScopedCommits = commits.filter((commit) => visibleCommitIds.has(commit.id));
        }

        let filtered = branchScopedCommits;

        if (searchQuery.trim()) {
            const search = searchQuery.toLowerCase();
            filtered = filtered.filter((commit) =>
                commit.message.toLowerCase().includes(search) ||
                commit.id.toLowerCase().includes(search) ||
                commit.branch?.toLowerCase().includes(search) ||
                commit.hashtags?.some((tag) => tag.toLowerCase().includes(search)),
            );
        }

        if (selectedAuthor !== 'all') {
            filtered = filtered.filter((commit) => commit.author === selectedAuthor);
        }

        return filtered;
    }, [availableBranches, branchHeads, commits, searchQuery, selectedAuthor, selectedBranchFilter]);

    const groupedCommits = useMemo(() => {
        return filteredCommits.reduce<Record<string, CommitEntry[]>>((groups, commit) => {
            const key = formatDateLabel(commit.timestamp);
            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(commit);
            return groups;
        }, {});
    }, [filteredCommits]);

    const stats = useMemo(() => {
        const total = commits.length;
        const aiCommits = commits.filter((commit) =>
            (commit.author || '').toLowerCase().includes('ai') ||
            (commit.author || '').toLowerCase().includes('bot'),
        ).length;

        return {
            total,
            aiCommits,
            branches: availableBranches.length,
            heads: Object.values(branchHeads).filter(Boolean).length,
        };
    }, [availableBranches.length, branchHeads, commits]);

    const visibleBranches = useMemo(() => {
        const ordered = availableBranches.map((branch: any) => branch.name);
        const commitBranches = filteredCommits.map((commit) => commit.branch || 'main');
        return Array.from(new Set([...ordered, ...commitBranches]));
    }, [availableBranches, filteredCommits]);

    const laneMap = useMemo(() => {
        return visibleBranches.reduce<Record<string, number>>((map, branchName, index) => {
            map[branchName] = index;
            return map;
        }, {});
    }, [visibleBranches]);

    const commitMap = useMemo(() => new Map(commits.map((commit) => [commit.id, commit])), [commits]);

    const handleBack = () => {
        if (repoData?.id && onNavigate) {
            onNavigate(buildRepoBranchUrl(repoData.id, '', selectedBranch).slice(1));
            return;
        }
        setCurrentView('repo');
    };

    const handleBranchSwitch = async (branchName: string) => {
        if (!backendProjectId || !onNavigate || branchName === selectedBranch) return;
        await switchBranchMutation.mutateAsync({ projectId: backendProjectId, branchName });
        onNavigate(buildRepoBranchUrl(backendProjectId, '/logs', branchName).slice(1));
    };

    if (!repoData) {
        return <div className="p-8 text-center text-slate-500">Repository data not found.</div>;
    }

    return (
        <div className="flex h-full flex-col overflow-hidden bg-slate-50 p-6 text-slate-900 dark:bg-black dark:text-white lg:p-10">
            <div className="mb-8 flex flex-col gap-6 animate-fadeIn xl:flex-row xl:items-end xl:justify-between">
                <div>
                    <div className="mb-2 flex items-center gap-2">
                        <button
                            onClick={handleBack}
                            className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-900 dark:hover:bg-white/10 dark:hover:text-white"
                        >
                            <span className="material-icons-outlined">arrow_back</span>
                        </button>
                        <h1 className="text-3xl font-display font-bold tracking-tight text-slate-900 dark:text-white">
                            Activity Log
                        </h1>
                    </div>
                    <p className="max-w-2xl text-slate-500 dark:text-slate-400">
                        Track the evolution of{' '}
                        <span className="font-mono font-medium text-slate-800 dark:text-white">{repoData?.name}</span>{' '}
                        across branches, merges, AI generations, and manual edits.
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div className="rounded-2xl border border-slate-200 bg-white/60 px-5 py-4 dark:border-white/10 dark:bg-white/5">
                        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Total Commits</div>
                        <div className="text-3xl font-display font-bold text-slate-900 dark:text-white">{stats.total}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white/60 px-5 py-4 dark:border-white/10 dark:bg-white/5">
                        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-primary">AI Generated</div>
                        <div className="text-3xl font-display font-bold text-slate-900 dark:text-white">{stats.aiCommits}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white/60 px-5 py-4 dark:border-white/10 dark:bg-white/5">
                        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Branches</div>
                        <div className="text-3xl font-display font-bold text-slate-900 dark:text-white">{stats.branches}</div>
                    </div>
                    <div className="rounded-2xl border border-primary/20 bg-primary/10 px-5 py-4">
                        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-primary">Active Head</div>
                        <div className="text-base font-mono font-bold text-slate-900 dark:text-white">
                            {branchHeads[selectedBranch] || 'none'}
                        </div>
                    </div>
                </div>
            </div>

            <div className="mb-8 space-y-4">
                <div className="rounded-xl border border-slate-200 bg-white/50 p-2 dark:border-white/10 dark:bg-white/5">
                    <div className="flex flex-col gap-2 xl:flex-row">
                        <div className="group relative flex-1">
                            <span className="material-icons-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-primary">
                                search
                            </span>
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                placeholder="Filter by message, hash, branch, or tag..."
                                className="w-full border-none bg-transparent py-2.5 pl-10 pr-4 text-slate-900 outline-none placeholder:text-slate-500 dark:text-white"
                            />
                        </div>

                        <div className="h-px bg-slate-200 dark:bg-white/10 xl:h-auto xl:w-px" />

                        {backendProjectId && (
                            <div className="flex items-center gap-2 px-2">
                                <span className="text-sm text-slate-500">Workspace:</span>
                                <select
                                    value={selectedBranch}
                                    onChange={(event) => void handleBranchSwitch(event.target.value)}
                                    className="bg-transparent py-2 text-sm font-medium text-slate-700 outline-none transition-colors hover:text-primary dark:text-slate-200"
                                >
                                    {availableBranches.map((branch: any) => (
                                        <option key={branch.name} value={branch.name}>
                                            {branch.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className="h-px bg-slate-200 dark:bg-white/10 xl:h-auto xl:w-px" />

                        <div className="flex items-center gap-2 px-2">
                            <span className="text-sm text-slate-500">Branch:</span>
                            <select
                                value={selectedBranchFilter}
                                onChange={(event) => setSelectedBranchFilter(event.target.value)}
                                className="bg-transparent py-2 text-sm font-medium text-slate-700 outline-none transition-colors hover:text-primary dark:text-slate-200"
                            >
                                <option value="all">All Branches</option>
                                {availableBranches.map((branch: any) => (
                                    <option key={branch.name} value={branch.name}>
                                        {branch.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="h-px bg-slate-200 dark:bg-white/10 xl:h-auto xl:w-px" />

                        <div className="flex items-center gap-2 px-2">
                            <span className="text-sm text-slate-500">Author:</span>
                            <select
                                value={selectedAuthor}
                                onChange={(event) => setSelectedAuthor(event.target.value)}
                                className="bg-transparent py-2 text-sm font-medium text-slate-700 outline-none transition-colors hover:text-primary dark:text-slate-200"
                            >
                                <option value="all">All Contributors</option>
                                {authors.map((author) => (
                                    <option key={author} value={author}>
                                        {author}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {availableBranches.length > 0 && (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        {availableBranches.map((branch: any, index: number) => {
                            const isSelectedScope = selectedBranchFilter === branch.name;
                            const isWorkspace = selectedBranch === branch.name;
                            return (
                                <button
                                    key={branch.name}
                                    type="button"
                                    onClick={() => setSelectedBranchFilter(branch.name)}
                                    className={`rounded-2xl border px-4 py-4 text-left transition ${
                                        isSelectedScope
                                            ? 'border-primary/20 bg-primary/10'
                                            : 'border-slate-200 bg-white/60 hover:border-primary/20 hover:bg-primary/5 dark:border-white/10 dark:bg-white/5'
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2">
                                            <span
                                                className="h-2.5 w-2.5 rounded-full"
                                                style={{ backgroundColor: GRAPH_LANE_COLORS[index % GRAPH_LANE_COLORS.length] }}
                                            />
                                            <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white">
                                                {branch.name}
                                            </span>
                                        </div>
                                        {isWorkspace && (
                                            <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.18em] text-primary">
                                                Active
                                            </span>
                                        )}
                                    </div>
                                    <div className="mt-3 text-[11px] font-mono uppercase tracking-[0.18em] text-slate-400 dark:text-zinc-500">
                                        Head
                                    </div>
                                    <div className="mt-1 font-mono text-xs text-slate-600 dark:text-slate-300">
                                        {branch.headCommitId || 'No commits yet'}
                                    </div>
                                    <div className="mt-3 text-[11px] font-mono uppercase tracking-[0.18em] text-slate-400 dark:text-zinc-500">
                                        Source
                                    </div>
                                    <div className="mt-1 font-mono text-xs text-slate-500 dark:text-zinc-400">
                                        {branch.sourceBranch || 'root'}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                <div className="space-y-8 pb-10">
                    {Object.entries(groupedCommits).map(([date, commitsForDate]) => (
                        <div key={date}>
                            <div className="sticky top-0 z-10 mb-5 flex items-center gap-4 bg-slate-50/95 py-2 backdrop-blur-sm dark:bg-black/95">
                                <div className="w-20 text-right">
                                    <span className="material-icons-outlined text-sm text-slate-300 dark:text-zinc-600">
                                        calendar_today
                                    </span>
                                </div>
                                <h3 className="text-sm font-bold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                                    {date}
                                </h3>
                            </div>

                            <div className="space-y-4">
                                {commitsForDate.map((commit) => {
                                    const laneIndex = laneMap[commit.branch || 'main'] ?? 0;
                                    const laneCount = Math.max(visibleBranches.length, 1);
                                    const laneSpacing = 18;
                                    const laneOffset = 18;
                                    const commitX = laneOffset + (laneIndex * laneSpacing);
                                    const parentBranches = getCommitParents(commit)
                                        .map((parentId) => commitMap.get(parentId)?.branch)
                                        .filter((branchName): branchName is string => Boolean(branchName));
                                    const mergeTargets = Array.from(
                                        new Set(parentBranches.filter((branchName) => branchName !== (commit.branch || 'main'))),
                                    );
                                    const isMergeCommit = getCommitParents(commit).length > 1;
                                    const isAiCommit =
                                        (commit.author || '').toLowerCase().includes('ai') ||
                                        (commit.author || '').toLowerCase().includes('bot');
                                    const isBranchHead = branchHeads[commit.branch || 'main'] === commit.id;

                                    return (
                                        <button
                                            key={commit.id}
                                            type="button"
                                            onClick={() => setSelectedCommit(commit)}
                                            className="group grid w-full grid-cols-[88px_minmax(0,1fr)] gap-5 text-left"
                                        >
                                            <div className="relative min-h-[116px]">
                                                {Array.from({ length: laneCount }).map((_, index) => (
                                                    <div
                                                        key={`lane-${commit.id}-${index}`}
                                                        className="absolute bottom-0 top-0 w-px opacity-60"
                                                        style={{
                                                            left: `${laneOffset + (index * laneSpacing)}px`,
                                                            backgroundColor: `${GRAPH_LANE_COLORS[index % GRAPH_LANE_COLORS.length]}33`,
                                                        }}
                                                    />
                                                ))}

                                                {mergeTargets.map((branchName) => {
                                                    const parentLaneIndex = laneMap[branchName] ?? 0;
                                                    const parentX = laneOffset + (parentLaneIndex * laneSpacing);
                                                    return (
                                                        <div
                                                            key={`${commit.id}-${branchName}`}
                                                            className="absolute h-px"
                                                            style={{
                                                                top: '28px',
                                                                left: `${Math.min(commitX, parentX)}px`,
                                                                width: `${Math.abs(parentX - commitX)}px`,
                                                                backgroundColor:
                                                                    GRAPH_LANE_COLORS[parentLaneIndex % GRAPH_LANE_COLORS.length],
                                                            }}
                                                        />
                                                    );
                                                })}

                                                <div
                                                    className="absolute h-3.5 w-3.5 rounded-full border-2 border-black shadow-[0_0_0_4px_rgba(215,255,74,0.12)] dark:border-black"
                                                    style={{
                                                        top: '22px',
                                                        left: `${commitX - 6}px`,
                                                        backgroundColor: GRAPH_LANE_COLORS[laneIndex % GRAPH_LANE_COLORS.length],
                                                    }}
                                                />

                                                <div className="absolute left-0 top-4 w-16 text-right">
                                                    <div className="text-xs font-mono text-slate-400 transition-colors group-hover:text-slate-600 dark:group-hover:text-slate-200">
                                                        {formatClockTime(commit.timestamp)}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="min-w-0">
                                                <div className="rounded-2xl border border-slate-200 bg-white px-5 py-5 transition-all duration-200 group-hover:border-primary/20 group-hover:bg-white group-hover:shadow-lg group-hover:shadow-primary/5 dark:border-white/5 dark:bg-zinc-900/60 dark:group-hover:bg-zinc-900">
                                                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                                                                    {commit.author}
                                                                </span>
                                                                {isAiCommit && (
                                                                    <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.18em] text-primary">
                                                                        AI
                                                                    </span>
                                                                )}
                                                                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.18em] text-slate-400 dark:text-zinc-500">
                                                                    {commit.branch || 'main'}
                                                                </span>
                                                                {isBranchHead && (
                                                                    <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.18em] text-sky-400">
                                                                        Head
                                                                    </span>
                                                                )}
                                                                {isMergeCommit && (
                                                                    <span className="rounded-full border border-fuchsia-500/20 bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.18em] text-fuchsia-400">
                                                                        Merge
                                                                    </span>
                                                                )}
                                                            </div>

                                                            <h4 className="mt-3 text-base font-medium leading-relaxed text-slate-900 dark:text-white">
                                                                {commit.message}
                                                            </h4>

                                                            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-400 dark:text-zinc-500">
                                                                <span className="font-mono">{commit.id}</span>
                                                                <span>{getRelativeTime(commit.timestamp)}</span>
                                                                <span>{getFilesChangedCount(commit)} files changed</span>
                                                                {isMergeCommit && mergeTargets.length > 0 && (
                                                                    <span className="font-mono text-fuchsia-400">
                                                                        joins {mergeTargets.join(', ')}
                                                                    </span>
                                                                )}
                                                            </div>

                                                            {commit.hashtags && commit.hashtags.length > 0 && (
                                                                <div className="mt-4 flex flex-wrap gap-2">
                                                                    {commit.hashtags.map((tag) => (
                                                                        <span
                                                                            key={tag}
                                                                            className="rounded-full bg-emerald-500/5 px-2 py-0.5 text-xs font-mono text-emerald-600 transition-colors hover:bg-emerald-500/10 dark:text-primary"
                                                                        >
                                                                            {tag}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="flex flex-col items-start gap-3 xl:items-end">
                                                            <div className="rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 font-mono text-xs text-slate-500 transition-colors group-hover:border-primary/20 group-hover:text-slate-700 dark:border-white/5 dark:bg-white/5 dark:text-zinc-500">
                                                                {commit.id.substring(0, 7)}
                                                            </div>
                                                            <span className="material-icons-outlined text-sm text-slate-300 opacity-0 transition-opacity group-hover:opacity-100 dark:text-zinc-600">
                                                                open_in_new
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}

                    {filteredCommits.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-20 opacity-60">
                            <span className="material-icons-outlined mb-4 text-6xl">filter_list_off</span>
                            <h3 className="text-xl font-medium">No activity found</h3>
                            <p className="text-sm">Try adjusting your filters</p>
                        </div>
                    )}
                </div>
            </div>

            {selectedCommit && (
                <CommitDetailsView
                    commit={selectedCommit}
                    repoName={repoData?.name}
                    onClose={() => setSelectedCommit(null)}
                />
            )}
        </div>
    );
};

export default ActivityLogsView;
