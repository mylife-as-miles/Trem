import React, { useState, useEffect } from 'react';
import { db, RepoData } from '../../utils/db';
import TemplateCarousel from '../create/components/TemplateCarousel';

interface EditLandingViewProps {
    onSelectRepo: (repo: RepoData) => void;
    onSelectTemplate: (template: string) => void;
    onNavigate: (view: any) => void;
}

const EDIT_TEMPLATES = [
    {
        id: 'auto-zoom',
        title: 'Auto Zoom Keyframe',
        description: 'Automatically apply smooth keyframe zooms and pans to keep subjects dynamic.',
        image: 'https://images.unsplash.com/photo-1542204165-65bf26472b9b?auto=format&fit=crop&q=80&w=400',
        icon: 'zoom_in'
    },
    {
        id: 'text-behind',
        title: 'Text Behind Subject',
        description: 'Place text behind a person using AI segmentation and depth layering.',
        image: 'https://images.unsplash.com/photo-1531384441138-2736e62e0919?auto=format&fit=crop&q=80&w=400',
        icon: 'layers'
    },
    {
        id: 'motion-tracking',
        title: 'Motion Tracking Text',
        description: 'Text that follows a moving subject across the frame automatically.',
        image: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&q=80&w=400',
        icon: 'ads_click'
    },
    {
        id: 'kinetic-typography',
        title: 'Auto Captions / Kinetic',
        description: 'Word-by-word animated transcriptions with pop, bounce, and flash styles.',
        image: 'https://images.unsplash.com/photo-1555421689-491a97ff2040?auto=format&fit=crop&q=80&w=400',
        icon: 'subtitles'
    },
    {
        id: 'invisible-jump',
        title: 'Invisible Jump Cuts',
        description: 'Instant zoom in/out at cuts to add impact and retention.',
        image: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&q=80&w=400',
        icon: 'content_cut'
    },
    {
        id: 'remove-silence',
        title: 'Remove Awkward Silences',
        description: 'Automatically detect and cut silence to keep the flow tight.',
        image: 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&q=80&w=400',
        icon: 'graphic_eq'
    },
    {
        id: 'beat-sync',
        title: 'Beat-Synced Transitions',
        description: 'Align cuts, flashes, and effects to the audio rhythm automatically.',
        image: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&q=80&w=400',
        icon: 'music_note'
    },
    {
        id: 'speed-ramping',
        title: 'Smooth Speed Ramping',
        description: 'Accelerate and decelerate clip speed for dramatic effect.',
        image: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&q=80&w=400',
        icon: 'speed'
    },
    {
        id: '3d-parallax',
        title: '3D Zoom / Parallax',
        description: 'Layered channel camera effects for depth and lens movement.',
        image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=400',
        icon: '3d_rotation'
    },
    {
        id: 'text-motion',
        title: 'Text Motion Effects',
        description: 'Slides, bounces, wiggles, and shakes triggered by word timing.',
        image: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&q=80&w=400',
        icon: 'animation'
    },
    {
        id: 'visual-timers',
        title: 'Progress Bar / Timers',
        description: 'Animated bars indicating video progress for viewer retention.',
        image: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&q=80&w=400',
        icon: 'hourglass_bottom'
    },
    {
        id: 'bg-replace',
        title: 'AI Background Replace',
        description: 'Remove background without greenscreen and replace with dynamic imagery.',
        image: 'https://images.unsplash.com/photo-1508614999368-9260051292e5?auto=format&fit=crop&q=80&w=400',
        icon: 'wallpaper'
    },
    {
        id: 'scratch',
        title: 'Edit From Scratch',
        description: 'Start with a blank workspace and your own creative direction.',
        image: '',
        icon: 'add_circle'
    }
];

const EditLandingView: React.FC<EditLandingViewProps> = ({ onSelectRepo, onSelectTemplate, onNavigate }) => {
    const [repos, setRepos] = useState<RepoData[]>([]);

    useEffect(() => {
        const loadRepos = async () => {
            try {
                const data = await db.getAllRepos();
                setRepos(data);
            } catch (error) {
                console.error("Failed to load repos:", error);
            }
        };
        loadRepos();
    }, []);

    const handleCarouselSelect = (item: any) => {
        onSelectTemplate(item.title);
    };

    return (
        <div className="flex-1 p-6 md:p-10 fade-in bg-slate-50/50 dark:bg-background-dark min-h-full font-sans">
            <div className="max-w-6xl mx-auto space-y-16">

                {/* Hero Section */}
                <div className="text-center space-y-6 py-8 md:py-12">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-emerald-600 dark:text-primary text-xs font-medium tracking-wide">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                        AI-POWERED VIDEO EDITING
                    </div>

                    <h1 className="text-5xl md:text-7xl font-display font-bold text-slate-900 dark:text-white tracking-tight leading-tight">
                        Edit with <span className="text-primary">Trem AI</span>
                    </h1>

                    <p className="text-xl text-slate-500 dark:text-gray-400 max-w-2xl mx-auto font-light leading-relaxed">
                        Select an editing technique or a recent project to get started.
                    </p>
                </div>

                {/* Carousel Section */}
                <div>
                    <div className="flex items-center justify-between mb-6 px-2">
                        <h2 className="text-sm font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">Start Editing</h2>
                    </div>

                    {/* 3D Carousel Selection */}
                    <div className="relative -mx-10 md:-mx-20 lg:-mx-32 fade-in-up">
                        <TemplateCarousel
                            templates={EDIT_TEMPLATES}
                            onSelect={(item) => handleCarouselSelect(item)}
                        />
                    </div>
                </div>

                {/* Projects Section (Grid) */}
                <div className="space-y-6">
                    <div className="flex items-center justify-between px-2 pt-8 border-t border-slate-200/60 dark:border-border-dark">
                        <h2 className="text-sm font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">Recent Projects</h2>
                        {repos.length > 0 && (
                            <button className="text-xs text-emerald-600 dark:text-primary hover:text-emerald-700 dark:hover:text-primary_hover font-medium transition-colors">
                                View all
                            </button>
                        )}
                    </div>

                    {repos.length === 0 ? (
                        <div className="h-48 flex flex-col items-center justify-center bg-white/50 dark:bg-surface-card rounded-2xl border border-dashed border-slate-200 dark:border-border-dark hover:border-slate-300 dark:hover:border-white/20 transition-colors">
                            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-3 text-slate-400 dark:text-gray-500">
                                <span className="material-icons-outlined text-xl">folder_open</span>
                            </div>
                            <h3 className="text-sm font-medium text-slate-900 dark:text-white mb-1">No projects yet</h3>
                            <p className="text-xs text-slate-500 dark:text-gray-500 cursor-pointer hover:text-primary" onClick={() => onNavigate('trem-create')}>
                                Create your first project now
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {repos.map((repo) => (
                                <button
                                    key={repo.id}
                                    onClick={() => onSelectRepo && onSelectRepo(repo)}
                                    className="group relative bg-white dark:bg-surface-card border border-slate-200 dark:border-border-dark rounded-xl p-5 text-left transition-all duration-300 hover:shadow-md hover:-translate-y-1 hover:border-primary overflow-hidden"
                                >
                                    <div className="absolute top-0 left-0 w-1 h-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                    <div className="flex items-start gap-4 relative z-10">
                                        <div className="w-12 h-12 rounded-lg bg-slate-50 dark:bg-background-dark border border-slate-100 dark:border-border-dark flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10 transition-colors">
                                            <span className="material-icons-outlined text-slate-400 dark:text-gray-400 group-hover:text-primary transition-colors">
                                                movie_edit
                                            </span>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <h4 className="font-bold text-slate-900 dark:text-white truncate group-hover:text-emerald-600 dark:group-hover:text-primary transition-colors text-base">
                                                {repo.name}
                                            </h4>
                                            <p className="text-xs text-slate-500 dark:text-gray-400 mt-1 line-clamp-1">
                                                {repo.brief || 'No description provided'}
                                            </p>
                                            <div className="flex items-center gap-3 mt-3">
                                                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/5 text-[10px] font-medium text-slate-600 dark:text-gray-300">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                                                    Editable
                                                </div>
                                                <div className="text-[10px] text-slate-400 dark:text-gray-500 font-mono">
                                                    {new Date(repo.created).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default EditLandingView;
