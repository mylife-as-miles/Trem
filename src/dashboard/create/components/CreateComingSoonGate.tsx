import React from 'react';

interface CreateComingSoonGateProps {
    onNavigate: (view: 'timeline' | 'dashboard' | 'repo' | 'diff' | 'assets' | 'settings' | 'create-repo' | 'trem-create' | 'trem-edit') => void;
}

const CHECKPOINTS = [
    {
        title: 'Generation flow',
        body: 'Prompting, uploads, and orchestration are being retuned into one cleaner pass.',
    },
    {
        title: 'Template quality',
        body: 'We are tightening first-draft composition so Create opens with stronger defaults.',
    },
    {
        title: 'Reliability',
        body: 'The route stays gated until recovery states and cloud-backed jobs feel production-ready.',
    },
];

const STATUS_CARDS = [
    {
        eyebrow: 'Pipeline',
        title: 'Worker-backed generation',
        body: 'The next Create release is being aligned with the new Cloudflare ingestion architecture.',
    },
    {
        eyebrow: 'Direction',
        title: 'Sharper opening drafts',
        body: 'We are reducing noise in the first pass so outputs feel more decisive and editorial.',
    },
    {
        eyebrow: 'Access',
        title: 'Temporarily reserved',
        body: 'Edit and Assets remain live while Create stays behind the curtain for final tuning.',
    },
];

const CreateComingSoonGate: React.FC<CreateComingSoonGateProps> = ({ onNavigate }) => {
    return (
        <div className="flex-1 p-4 sm:p-6 md:p-10 fade-in bg-slate-50/50 dark:bg-background-dark min-h-full font-sans">
            <div className="max-w-6xl mx-auto space-y-12 md:space-y-16">
                <div className="text-center space-y-5 sm:space-y-6 py-6 sm:py-8 md:py-12">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-emerald-600 dark:text-primary text-xs font-medium tracking-wide animate-in fade-in slide-in-from-bottom-3 duration-500">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                        TREM CREATE / COMING SOON
                    </div>

                    <h1 className="text-4xl sm:text-5xl md:text-6xl xl:text-7xl font-display font-bold text-slate-900 dark:text-white tracking-tight leading-[0.95] animate-in fade-in slide-in-from-bottom-4 duration-700">
                        Create with <span className="text-primary">Trem AI</span>
                    </h1>

                    <p className="text-base sm:text-lg md:text-xl text-slate-500 dark:text-gray-400 max-w-2xl mx-auto font-light leading-relaxed animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
                        We are rebuilding the creation flow to match the new pipeline. The route is gated until it feels as sharp and dependable as the rest of the workspace.
                    </p>
                </div>

                <div className="relative overflow-hidden rounded-[24px] sm:rounded-[28px] border border-slate-200 dark:border-border-dark bg-white/80 dark:bg-surface-card shadow-xl dark:shadow-[0_24px_80px_rgba(0,0,0,0.45)] fade-in-up">
                    <div
                        aria-hidden="true"
                        className="absolute inset-0 opacity-60 dark:opacity-100"
                        style={{
                            backgroundImage: [
                                'radial-gradient(circle at 12% 18%, rgba(217,248,95,0.18), transparent 24%)',
                                'radial-gradient(circle at 82% 18%, rgba(217,248,95,0.10), transparent 26%)',
                                'linear-gradient(to bottom, rgba(255,255,255,0.06), rgba(255,255,255,0))',
                            ].join(','),
                        }}
                    />

                    <div className="relative grid xl:grid-cols-[minmax(0,1.04fr)_390px]">
                        <div className="p-5 sm:p-7 md:p-8 lg:p-10 xl:p-12">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 dark:bg-background-dark border border-slate-200 dark:border-border-dark text-[11px] font-mono uppercase tracking-[0.22em] text-slate-500 dark:text-gray-400">
                                <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_16px_rgba(217,248,95,0.45)]"></span>
                                Private Alpha Tuning
                            </div>

                            <div className="mt-6 sm:mt-8 space-y-4 sm:space-y-5">
                                <h2 className="text-2xl sm:text-3xl lg:text-4xl xl:text-5xl font-display font-bold tracking-tight text-slate-900 dark:text-white max-w-2xl">
                                    The authoring room is under reconstruction, not abandoned.
                                </h2>
                                <p className="max-w-xl text-sm md:text-base leading-6 md:leading-7 text-slate-600 dark:text-gray-400">
                                    The old Create path is temporarily paused while we rebuild it around better prompts, stronger templates, and the worker-backed backend you just set up. When it comes back, it should feel like Trem instead of a side experiment.
                                </p>
                            </div>

                            <div className="mt-8 sm:mt-10 space-y-3 sm:space-y-4">
                                {CHECKPOINTS.map((item, index) => (
                                    <div
                                        key={item.title}
                                        className="group flex items-start gap-3 sm:gap-4 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-50/80 dark:bg-background-dark/40 px-3.5 sm:px-4 py-3.5 sm:py-4 animate-in fade-in slide-in-from-bottom-3 duration-700"
                                        style={{ animationDelay: `${120 + index * 90}ms` }}
                                    >
                                        <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary border border-primary/20 flex-shrink-0">
                                            <span className="material-icons-outlined text-sm">done</span>
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">
                                                {item.title}
                                            </div>
                                            <p className="mt-1 text-sm leading-5 sm:leading-6 text-slate-500 dark:text-gray-400">
                                                {item.body}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row gap-3">
                                <button
                                    onClick={() => onNavigate('trem-edit')}
                                    className="w-full sm:w-auto bg-primary hover:bg-primary_hover text-black px-6 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 transform hover:scale-[1.02] active:scale-95 shadow-[0_0_25px_rgba(217,248,95,0.22)]"
                                >
                                    <span className="material-icons-outlined text-base">auto_fix_normal</span>
                                    Open Trem Edit
                                </button>
                                <button
                                    onClick={() => onNavigate('dashboard')}
                                    className="w-full sm:w-auto px-6 py-3 rounded-xl border border-slate-200 dark:border-border-dark text-slate-700 dark:text-gray-200 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-white/20 hover:bg-white dark:hover:bg-white/5 transition-all flex items-center justify-center gap-2 transform active:scale-95"
                                >
                                    <span className="material-icons-outlined text-base">dashboard</span>
                                    Back to Dashboard
                                </button>
                            </div>
                        </div>

                        <div className="border-t xl:border-t-0 xl:border-l border-slate-200 dark:border-border-dark bg-slate-50/70 dark:bg-background-dark/60 p-4 sm:p-6 md:p-8">
                            <div className="relative rounded-2xl border border-slate-200 dark:border-border-dark bg-white dark:bg-surface-card shadow-xl overflow-hidden">
                                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-border-dark bg-slate-50/80 dark:bg-background-dark/80">
                                    <div className="flex items-center gap-2 text-[11px] sm:text-xs min-w-0">
                                        <span className="text-slate-500 dark:text-gray-500">Trem Create</span>
                                        <span className="text-slate-300 dark:text-gray-700">/</span>
                                        <span className="font-semibold text-slate-900 dark:text-white truncate">New Project</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[10px] font-medium text-emerald-600 dark:text-primary">
                                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                                        LOCKED
                                    </div>
                                </div>

                                <div className="relative p-4 sm:p-5 min-h-[280px] sm:min-h-[320px] bg-white dark:bg-surface-card">
                                    <div className="space-y-4 opacity-45 blur-[0.2px] select-none">
                                        <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                                            <span className="material-icons-outlined">auto_awesome</span>
                                        </div>

                                        <div className="space-y-3">
                                            <div className="h-4 w-48 rounded-full bg-slate-200 dark:bg-white/10"></div>
                                            <div className="h-4 w-full rounded-full bg-slate-200 dark:bg-white/10"></div>
                                            <div className="h-4 w-5/6 rounded-full bg-slate-200 dark:bg-white/10"></div>
                                            <div className="h-4 w-3/4 rounded-full bg-slate-200 dark:bg-white/10"></div>
                                        </div>

                                        <div className="flex flex-wrap gap-2 pt-4 sm:pt-6">
                                            <div className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-background-dark border border-slate-200 dark:border-border-dark text-xs text-slate-500 dark:text-gray-400">
                                                Assets
                                            </div>
                                            <div className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-background-dark border border-slate-200 dark:border-border-dark text-xs text-slate-500 dark:text-gray-400">
                                                Creative Director
                                            </div>
                                            <div className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-background-dark border border-slate-200 dark:border-border-dark text-xs text-slate-500 dark:text-gray-400">
                                                Remotion Standard
                                            </div>
                                        </div>
                                    </div>

                                    <div className="absolute inset-0 bg-white/68 dark:bg-background-dark/72 backdrop-blur-[2px] flex items-center justify-center p-4 sm:p-6">
                                        <div className="w-full max-w-[18rem] sm:max-w-xs rounded-2xl border border-slate-200 dark:border-border-dark bg-white/95 dark:bg-surface-card/95 shadow-2xl px-4 sm:px-5 py-4 sm:py-5 text-center">
                                            <div className="mx-auto w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-4">
                                                <span className="material-icons-outlined text-xl">lock</span>
                                            </div>
                                            <h3 className="text-lg font-display font-bold text-slate-900 dark:text-white tracking-tight">
                                                Coming soon
                                            </h3>
                                            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-gray-400">
                                                We are rebuilding the Create workspace so the next unlock feels native to Trem, not patched into it.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="px-4 py-3 border-t border-slate-100 dark:border-border-dark bg-slate-50/70 dark:bg-white/[0.02] flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-gray-400">
                                        <span className="material-icons-outlined text-sm">bolt</span>
                                        Generation flow in review
                                    </div>
                                    <div className="h-2 w-full sm:w-24 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                                        <div className="h-full w-2/3 bg-primary"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-5 sm:space-y-6">
                    <div className="flex items-center justify-between mb-6 px-2">
                        <h2 className="text-sm font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">Launch Sequence</h2>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                        {STATUS_CARDS.map((card, index) => (
                            <div
                                key={card.title}
                                className="group relative bg-white dark:bg-surface-card border border-slate-200 dark:border-border-dark rounded-xl p-5 transition-all duration-300 hover:-translate-y-1 hover:border-primary overflow-hidden animate-in fade-in slide-in-from-bottom-3"
                                style={{ animationDelay: `${220 + index * 90}ms` }}
                            >
                                <div className="absolute top-0 left-0 w-1 h-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                <div className="flex items-start gap-4 relative z-10">
                                    <div className="w-12 h-12 rounded-lg bg-slate-50 dark:bg-background-dark border border-slate-100 dark:border-border-dark flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10 transition-colors">
                                        <span className="material-icons-outlined text-slate-400 dark:text-gray-400 group-hover:text-primary transition-colors">
                                            {index === 0 ? 'hub' : index === 1 ? 'movie_filter' : 'lock_clock'}
                                        </span>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400 dark:text-gray-500 font-bold">
                                            {card.eyebrow}
                                        </p>
                                        <h3 className="font-bold text-slate-900 dark:text-white mt-1 tracking-tight text-base">
                                            {card.title}
                                        </h3>
                                        <p className="text-xs text-slate-500 dark:text-gray-400 mt-2 leading-6">
                                            {card.body}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CreateComingSoonGate;
