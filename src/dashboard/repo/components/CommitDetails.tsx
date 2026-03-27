import React from 'react';

interface CommitDetailsViewProps {
    commit: {
        id: string;
        message: string;
        hashtags?: string[];
        author: string;
        timestamp: string | number;
        parent?: string | null;
        branch?: string;
        artifacts?: Record<string, any>;
    };
    repoName?: string;
    onClose: () => void;
}

const CommitDetailsView: React.FC<CommitDetailsViewProps> = ({ commit, repoName, onClose }) => {
    const formatTimestamp = (ts: string | number) => {
        const date = new Date(ts);
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getRelativeTime = (ts: string | number) => {
        const now = Date.now();
        const then = typeof ts === 'number' ? ts : new Date(ts).getTime();
        const diff = Math.floor((now - then) / 1000);

        if (diff < 60) return `${diff}s ago`;
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return `${Math.floor(diff / 86400)}d ago`;
    };

    const artifactFiles = commit.artifacts ? Object.entries(commit.artifacts).flatMap(([key, value]) => {
        if (Array.isArray(value)) {
            return value.map((file: string) => ({ name: file, type: key }));
        }
        return [{ name: value as string, type: key }];
    }) : [];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
            <div className="relative w-full max-w-4xl max-h-[90vh] bg-white dark:bg-surface-dark rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden flex flex-col">

                {/* Header */}
                <div className="flex items-center justify-between px-8 py-6 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5">
                    <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                            <span className="material-icons-outlined text-blue-500 text-2xl">commit</span>
                            <h2 className="text-2xl font-display font-bold text-slate-900 dark:text-white">Commit Details</h2>
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400 font-mono">
                            {repoName && <span className="text-slate-700 dark:text-gray-300">{repoName}</span>}
                            {repoName && <span className="mx-2">/</span>}
                            <span className="text-slate-600 dark:text-slate-300">{commit.id}</span>
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                    >
                        <span className="material-icons-outlined text-slate-600 dark:text-slate-400">close</span>
                    </button>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">

                    {/* Commit Message Card */}
                    <div className="glass-panel rounded-xl p-6 border border-slate-200 dark:border-white/10">
                        <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                <span className="material-icons-outlined text-blue-500">auto_awesome</span>
                            </div>
                            <div className="flex-1">
                                <h3 className="text-xl font-display font-bold text-slate-900 dark:text-white mb-2">
                                    {commit.message}
                                </h3>
                                <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
                                    <span className="flex items-center gap-1">
                                        <span className="material-icons-outlined text-xs">person</span>
                                        {commit.author}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <span className="material-icons-outlined text-xs">schedule</span>
                                        {getRelativeTime(commit.timestamp)}
                                    </span>
                                    {commit.branch && (
                                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono text-xs">
                                            {commit.branch}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Hashtags */}
                        {commit.hashtags && commit.hashtags.length > 0 && (
                            <div className="mt-4 flex flex-wrap gap-2 pt-4 border-t border-slate-200 dark:border-white/10">
                                {commit.hashtags.map((tag, idx) => (
                                    <span
                                        key={idx}
                                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-blue-500/10 text-blue-500 font-mono text-xs font-medium border border-blue-500/20 hover:bg-blue-500/20 transition-colors cursor-pointer"
                                    >
                                        <span className="material-icons-outlined text-xs">tag</span>
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <div className="glass-panel rounded-xl p-4 border border-slate-200 dark:border-white/10">
                            <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Commit ID</div>
                            <div className="font-mono text-sm text-slate-900 dark:text-white">{commit.id}</div>
                        </div>
                        <div className="glass-panel rounded-xl p-4 border border-slate-200 dark:border-white/10">
                            <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Parent</div>
                            <div className="font-mono text-sm text-slate-900 dark:text-white">{commit.parent || 'None (Initial)'}</div>
                        </div>
                        <div className="glass-panel rounded-xl p-4 border border-slate-200 dark:border-white/10">
                            <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Timestamp</div>
                            <div className="font-mono text-xs text-slate-900 dark:text-white">{formatTimestamp(commit.timestamp)}</div>
                        </div>
                    </div>

                    {/* Changed Files/Artifacts */}
                    {artifactFiles.length > 0 && (
                        <div className="glass-panel rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden">
                            <div className="px-6 py-4 bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-white/10">
                                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                                    Files Changed ({artifactFiles.length})
                                </h3>
                            </div>
                            <div className="divide-y divide-slate-200 dark:divide-white/5">
                                {artifactFiles.map((file, idx) => {
                                    const icon = file.type === 'otio' ? 'videocam' :
                                        file.type === 'dag' ? 'account_tree' :
                                            file.type === 'scenes' ? 'movie' :
                                                file.type === 'subtitles' ? 'subtitles' :
                                                    'description';
                                    const color = file.type === 'otio' ? 'text-blue-400' :
                                        file.type === 'dag' ? 'text-primary' :
                                            file.type === 'scenes' ? 'text-emerald-400' :
                                                file.type === 'subtitles' ? 'text-yellow-400' :
                                                    'text-slate-400';

                                    return (
                                        <div key={idx} className="px-6 py-3 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors flex items-center gap-3 group">
                                            <span className={`material-icons-outlined text-sm ${color}`}>{icon}</span>
                                            <span className="font-mono text-sm text-slate-700 dark:text-slate-300 flex-1">{file.name}</span>
                                            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                                                +added
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* AI Analysis Badge */}
                    <div className="flex items-center justify-center gap-2 py-4">
                        <span className="text-xs font-mono text-primary bg-primary/10 px-3 py-1.5 rounded-full border border-primary/20">
                            ✨ AI-GENERATED COMMIT
                        </span>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="flex items-center justify-between px-8 py-4 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5">
                    <button className="text-sm text-slate-600 dark:text-slate-400 hover:text-blue-500 transition-colors font-mono">
                        View Timeline
                    </button>
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-primary hover:bg-primary_hover text-white rounded-lg transition-all transform hover:scale-105 active:scale-95 font-medium"
                    >
                        Close
                    </button>
                </div>

            </div>
        </div>
    );
};

export default CommitDetailsView;
