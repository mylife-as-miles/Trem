import React from 'react';

interface CreateComingSoonGateProps {
    onNavigate: (view: 'timeline' | 'dashboard' | 'repo' | 'diff' | 'assets' | 'settings' | 'create-repo' | 'trem-create' | 'trem-edit') => void;
}

const MILESTONES = [
    {
        id: '01',
        title: 'Prompt-to-scene direction',
        body: 'We are rebuilding Create around stronger narrative scaffolds, cleaner motion defaults, and sharper first-pass compositions.',
    },
    {
        id: '02',
        title: 'Cloud-backed orchestration',
        body: 'The new flow is being tuned against the Worker pipeline so uploads, analysis, and generation move through one dependable path.',
    },
    {
        id: '03',
        title: 'Export-ready polish',
        body: 'Before we reopen the door, we are tightening pacing, template quality, and recovery states so the first launch feels deliberate.',
    },
];

const SIGNALS = [
    { label: 'Template fidelity', value: '86%' },
    { label: 'Agent direction', value: 'Calibrating' },
    { label: 'Render confidence', value: 'In review' },
];

const CreateComingSoonGate: React.FC<CreateComingSoonGateProps> = ({ onNavigate }) => {
    return (
        <div className="flex-1 px-6 pb-10 md:px-10">
            <section className="relative isolate mx-auto flex min-h-[calc(100vh-8rem)] max-w-6xl items-center overflow-hidden rounded-[36px] border border-slate-200/70 bg-white/80 px-6 py-8 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur-2xl dark:border-white/10 dark:bg-[#050816]/82 md:px-10 md:py-12 lg:px-14">
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 opacity-80 dark:opacity-100"
                    style={{
                        backgroundImage: [
                            'radial-gradient(circle at 18% 22%, rgba(16,185,129,0.20), transparent 24%)',
                            'radial-gradient(circle at 78% 18%, rgba(59,130,246,0.16), transparent 30%)',
                            'linear-gradient(rgba(15,23,42,0.06) 1px, transparent 1px)',
                            'linear-gradient(90deg, rgba(15,23,42,0.06) 1px, transparent 1px)',
                        ].join(','),
                        backgroundSize: 'auto, auto, 34px 34px, 34px 34px',
                        backgroundPosition: 'center, center, center, center',
                    }}
                />

                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-[10%] top-[-12%] h-56 rounded-full bg-emerald-400/20 blur-3xl dark:bg-emerald-300/10"
                />

                <div className="relative z-10 grid w-full gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)] lg:items-end">
                    <div className="max-w-2xl">
                        <div className="inline-flex items-center gap-3 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.32em] text-emerald-700 animate-in fade-in slide-in-from-bottom-4 duration-500 dark:text-emerald-300">
                            <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_16px_rgba(16,185,129,0.65)]" />
                            Trem Create
                            <span className="text-slate-500 dark:text-slate-400">Coming Soon</span>
                        </div>

                        <div className="mt-8 space-y-6">
                            <p className="text-xs font-semibold uppercase tracking-[0.42em] text-slate-400 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100 dark:text-slate-500">
                                Rebuilding the first pass
                            </p>
                            <h1 className="max-w-4xl text-5xl font-bold tracking-[-0.06em] text-slate-950 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-150 dark:text-white md:text-7xl">
                                Create is being re-cut for a stronger opening scene.
                            </h1>
                            <p className="max-w-xl text-base leading-7 text-slate-600 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200 dark:text-slate-300 md:text-lg">
                                We have gated this surface while we tune the new cloud-backed generation flow. The goal is simple: when Trem Create returns, it should feel decisive, cinematic, and stable on the first draft.
                            </p>
                        </div>

                        <div className="mt-10 grid gap-4 border-y border-slate-200/80 py-6 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300 dark:border-white/10">
                            {MILESTONES.map((milestone, index) => (
                                <div
                                    key={milestone.id}
                                    className="grid gap-2 py-3 animate-in fade-in slide-in-from-bottom-3 duration-700 md:grid-cols-[84px_minmax(0,1fr)]"
                                    style={{ animationDelay: `${index * 120}ms` }}
                                >
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">
                                        Signal {milestone.id}
                                    </div>
                                    <div className="space-y-1">
                                        <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-900 dark:text-white">
                                            {milestone.title}
                                        </h2>
                                        <p className="max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                                            {milestone.body}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
                            <button
                                onClick={() => onNavigate('dashboard')}
                                className="group inline-flex items-center justify-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:bg-slate-800 active:scale-[0.98] dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
                            >
                                Go to dashboard
                                <span className="material-icons-outlined text-base transition-transform duration-200 group-hover:translate-x-0.5">arrow_forward</span>
                            </button>
                            <button
                                onClick={() => onNavigate('trem-edit')}
                                className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-300/90 bg-white/70 px-5 py-3 text-sm font-semibold text-slate-700 transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:border-slate-400 hover:text-slate-950 active:scale-[0.98] dark:border-white/12 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:border-white/20 dark:hover:text-white"
                            >
                                Open Trem Edit
                                <span className="material-icons-outlined text-base">north_east</span>
                            </button>
                        </div>

                        <p className="mt-4 text-xs uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">
                            Until then, use Edit and Assets while this launch sequence stays behind the curtain.
                        </p>
                    </div>

                    <div className="relative h-[420px] animate-in fade-in slide-in-from-right-8 duration-700 delay-300 lg:h-[540px]">
                        <div
                            aria-hidden="true"
                            className="absolute inset-x-10 top-6 h-40 rounded-full bg-emerald-400/25 blur-3xl dark:bg-emerald-300/12"
                        />
                        <div className="absolute inset-0 rounded-[32px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(241,245,249,0.2))] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(11,16,32,0.9),rgba(7,10,21,0.55))]" />

                        <div className="absolute inset-x-8 top-8 flex items-center justify-between border-b border-slate-200/80 pb-4 dark:border-white/10">
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-400 dark:text-slate-500">
                                    Launch Surface
                                </p>
                                <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
                                    Create Orchestration
                                </p>
                            </div>
                            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-700 dark:text-emerald-300">
                                Locked
                            </div>
                        </div>

                        <div className="absolute inset-x-8 top-28">
                            <div className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-slate-950 px-6 py-7 text-white shadow-[0_28px_80px_rgba(15,23,42,0.26)] dark:border-white/10">
                                <div
                                    aria-hidden="true"
                                    className="absolute inset-0 opacity-80"
                                    style={{
                                        backgroundImage: 'radial-gradient(circle at top, rgba(16,185,129,0.22), transparent 34%), linear-gradient(135deg, rgba(255,255,255,0.06), transparent 45%)',
                                    }}
                                />
                                <p className="relative text-[11px] font-semibold uppercase tracking-[0.34em] text-emerald-300/80">
                                    Coming Soon
                                </p>
                                <p className="relative mt-4 max-w-xs text-3xl font-semibold tracking-[-0.05em]">
                                    The authoring room is under final color correction.
                                </p>
                                <div className="relative mt-10 space-y-4">
                                    {SIGNALS.map((signal, index) => (
                                        <div key={signal.label} className="space-y-2">
                                            <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.24em] text-slate-400">
                                                <span>{signal.label}</span>
                                                <span className="text-slate-200">{signal.value}</span>
                                            </div>
                                            <div className="h-px overflow-hidden bg-white/10">
                                                <div
                                                    className="h-full bg-gradient-to-r from-emerald-300 via-emerald-400 to-cyan-300"
                                                    style={{ width: `${72 + index * 10}%` }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="absolute inset-x-10 bottom-8 grid gap-3 text-sm text-slate-600 dark:text-slate-300">
                            <div className="flex items-center justify-between border-t border-slate-200/80 py-3 dark:border-white/10">
                                <span className="uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">Mode</span>
                                <span className="font-medium text-slate-900 dark:text-white">Private alpha tuning</span>
                            </div>
                            <div className="flex items-center justify-between border-t border-slate-200/80 py-3 dark:border-white/10">
                                <span className="uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">Focus</span>
                                <span className="font-medium text-slate-900 dark:text-white">Scene quality and reliability</span>
                            </div>
                            <div className="flex items-center justify-between border-t border-b border-slate-200/80 py-3 dark:border-white/10">
                                <span className="uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">Access</span>
                                <span className="font-medium text-slate-900 dark:text-white">Route reserved</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default CreateComingSoonGate;
