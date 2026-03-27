import React from 'react';

interface TemplateCard3DProps {
    id: string;
    title: string;
    description: string;
    icon: string;
    image?: string;
    isActive: boolean;
    onClick: () => void;
    rating?: number;
    stats?: { label: string; value: number }[];
    rarity?: 'gold' | 'silver' | 'bronze' | 'special';
}

const TemplateCard3D: React.FC<TemplateCard3DProps> = ({
    title,
    description,
    icon,
    image,
    isActive,
    onClick,
    rating = 90,
    stats = [
        { label: 'SPD', value: 85 },
        { label: 'VIS', value: 92 },
        { label: 'CMP', value: 88 }
    ],
    rarity = 'gold'
}) => {
    // Rarity styles
    const rarityStyles = {
        gold: {
            border: 'border-yellow-500',
            bg: 'bg-gradient-to-br from-yellow-100 via-yellow-300 to-yellow-500',
            text: 'text-yellow-900',
            accent: 'bg-yellow-600'
        },
        silver: {
            border: 'border-slate-400',
            bg: 'bg-gradient-to-br from-slate-100 via-slate-300 to-slate-500',
            text: 'text-slate-900',
            accent: 'bg-slate-600'
        },
        bronze: {
            border: 'border-orange-700',
            bg: 'bg-gradient-to-br from-orange-200 via-orange-400 to-orange-700',
            text: 'text-orange-900',
            accent: 'bg-orange-800'
        },
        special: {
            border: 'border-primary',
            bg: 'bg-gradient-to-br from-slate-900 via-zinc-800 to-black',
            text: 'text-white',
            accent: 'bg-primary'
        }
    };

    const style = rarityStyles[rarity];

    return (
        <div
            onClick={onClick}
            className={`
                relative w-72 h-[450px] rounded-t-3xl rounded-b-2xl cursor-pointer transition-all duration-500
                ${isActive ? 'shadow-[0_0_50px_rgba(217,248,95,0.3)] z-50 scale-100' : 'shadow-2xl scale-95 opacity-80 hover:opacity-100'}
                perspective-1000 group
            `}
            style={{
                transformStyle: 'preserve-3d',
            }}
        >
            {/* Card Frame (The "Physical" Card) */}
            <div className={`
                absolute inset-0 rounded-t-3xl rounded-b-2xl overflow-hidden
                bg-[#1a1a1a] border-[3px] ${isActive ? 'border-primary' : 'border-zinc-700'}
                transition-colors duration-500
            `}>
                {/* Holographic Layer */}
                <div className={`
                    absolute inset-0 z-10 pointer-events-none opacity-20 mix-blend-overlay
                    bg-gradient-to-tr from-transparent via-white to-transparent
                    w-[200%] h-[200%] animate-shine
                `}></div>

                {/* Top Section: Rating & Position */}
                <div className="absolute top-4 left-4 z-20 flex flex-col items-center">
                    <span className={`text-4xl font-display font-bold ${isActive ? 'text-primary' : 'text-zinc-500'}`}>
                        {rating}
                    </span>
                    <span className="text-xs font-mono uppercase tracking-widest text-zinc-400">TMP</span>
                    <div className="w-8 h-[1px] bg-zinc-700 my-1"></div>
                    <span className="material-icons-outlined text-2xl text-zinc-400">{icon}</span>
                </div>

                {/* Main Image / Icon Area */}
                <div className="absolute top-16 left-0 right-0 h-48 flex items-center justify-center z-10">
                    {image ? (
                        <div className="w-40 h-40 rounded-full border-4 border-zinc-800 overflow-hidden relative shadow-2xl group-hover:scale-105 transition-transform duration-500">
                            <img src={image} alt={title} className="w-full h-full object-cover" />
                            {/* Inner shadow */}
                            <div className="absolute inset-0 shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]"></div>
                        </div>
                    ) : (
                        <div className={`w-32 h-32 rounded-full ${isActive ? 'bg-primary text-black' : 'bg-zinc-800 text-zinc-600'} flex items-center justify-center shadow-[0_0_30px_rgba(0,0,0,0.5)]`}>
                            <span className="material-icons-outlined text-6xl">{icon}</span>
                        </div>
                    )}
                </div>

                {/* Bottom Section: Info & Stats */}
                <div className="absolute bottom-0 left-0 right-0 h-[200px] bg-gradient-to-t from-black via-zinc-900 to-transparent z-20 px-5 pb-6 flex flex-col justify-end">

                    {/* Name */}
                    <div className="text-center mb-4 border-b border-zinc-800 pb-2">
                        <h3 className={`font-display font-bold text-2xl uppercase tracking-tight ${isActive ? 'text-white' : 'text-zinc-400'} truncate`}>
                            {title}
                        </h3>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-3 gap-y-2 gap-x-1 mb-4">
                        {stats.map((stat, i) => (
                            <div key={i} className="flex items-center justify-center gap-1">
                                <span className={`font-bold text-sm ${isActive ? 'text-primary' : 'text-zinc-500'}`}>{stat.value}</span>
                                <span className="font-mono text-[10px] text-zinc-600 uppercase pt-0.5">{stat.label}</span>
                            </div>
                        ))}
                    </div>

                    {/* Description (Fades in on hover/active) */}
                    <div className={`text-center space-y-3 transition-all duration-300 ${isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                        <p className="text-[10px] text-zinc-500 line-clamp-2 leading-relaxed h-8">
                            {description}
                        </p>

                        {/* Call to Action */}
                        <div className="flex justify-center">
                            <button className="bg-primary hover:bg-primary_hover text-black text-xs font-bold uppercase tracking-wider px-6 py-2 rounded-full flex items-center gap-1 shadow-[0_0_20px_rgba(132,204,22,0.4)] hover:shadow-[0_0_30px_rgba(132,204,22,0.6)] transition-all transform hover:scale-105 active:scale-95">
                                Create Project
                                <span className="material-icons-outlined text-sm">arrow_forward</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Decorative Elements */}
                <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-zinc-800"></div>
                <div className="absolute top-2 right-5 w-2 h-2 rounded-full bg-zinc-800"></div>
                <div className="absolute bottom-2 left-2 w-2 h-2 rounded-full bg-zinc-800"></div>
                <div className="absolute bottom-2 right-2 w-2 h-2 rounded-full bg-zinc-800"></div>
            </div>

            {/* Reflection/Glow underneath */}
            {isActive && (
                <div className="absolute -bottom-4 left-4 right-4 h-4 bg-primary/20 blur-xl rounded-[100%]"></div>
            )}
        </div>
    );
};

export default TemplateCard3D;
