import React, { useState, useEffect, useRef } from 'react';
import TemplateCard3D from './TemplateCard3D';

interface TemplateCarouselProps {
    templates: any[];
    onSelect: (template: any) => void;
}

const TemplateCarousel: React.FC<TemplateCarouselProps> = ({ templates, onSelect }) => {
    const [activeIndex, setActiveIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);

    // Keyboard Navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight') {
                setActiveIndex(prev => (prev + 1) % templates.length);
            } else if (e.key === 'ArrowLeft') {
                setActiveIndex(prev => (prev - 1 + templates.length) % templates.length);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [templates.length]);

    // Calculate styles for 3D Carousel (Cover Flow)
    const getCardStyle = (index: number) => {
        const offset = index - activeIndex;
        const absOffset = Math.abs(offset);

        // Visibility range optimization
        if (absOffset > 3) return { display: 'none' };

        const isActive = offset === 0;

        // 3D Transform Logic
        let transform = '';
        let zIndex = 50 - absOffset;
        let opacity = 1 - (absOffset * 0.15); // Slight fade for distant items
        let filter = `blur(${absOffset * 2}px)`; // Blur distant items

        if (isActive) {
            transform = 'translateX(0) translateZ(0) rotateY(0) scale(1.1)';
            filter = 'none';
        } else {
            // Distribute items
            const spacing = 220; // Increased spacing for better separation
            const translationX = offset * spacing;

            // Rotation for "facing inward" effect
            const rotationY = offset > 0 ? -25 : 25;

            // Push back in Z space
            const translationZ = -200 - (absOffset * 50);

            // Add slight "stacking" illusion where they peek from behind
            // If offset is +1 (right), it moves right.
            // But we want a "Cover Flow" where they bunch up a bit?
            // Let's stick to simple distribution first.
            transform = `translateX(${translationX}px) translateZ(${translationZ}px) rotateY(${rotationY}deg) scale(0.9)`;
        }

        return {
            transform,
            zIndex,
            opacity,
            filter,
            transition: 'all 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
        };
    };

    return (
        <div className="relative w-full h-[600px] flex items-center justify-center overflow-visible perspective-1000" ref={containerRef}>

            {/* Background Ambience */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black pointer-events-none z-40"></div>

            {/* Spotlight Effect behind active card */}
            <div className={`absolute top-[5%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/20 blur-[100px] rounded-full transition-opacity duration-1000 z-0 ${activeIndex >= 0 ? 'opacity-100' : 'opacity-0'}`}></div>

            {/* Render Cards */}
            <div className="relative w-full h-full flex items-center justify-center transform-style-preserve-3d">
                {templates.map((template, index) => {
                    const style = getCardStyle(index);

                    if (style.display === 'none') return null;

                    return (
                        <div
                            key={template.id}
                            className="absolute top-[5%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-[450px]"
                            style={{
                                transform: style.transform,
                                zIndex: style.zIndex,
                                opacity: style.opacity,
                                filter: style.filter,
                                transition: style.transition,
                                transformOrigin: 'center center' // Important for rotation
                            }}
                            onClick={() => {
                                if (index === activeIndex) {
                                    onSelect(template);
                                } else {
                                    setActiveIndex(index);
                                }
                            }}
                        >
                            <TemplateCard3D
                                {...template}
                                isActive={index === activeIndex}
                                onClick={() => { }} // Handled by wrapper for simpler logic
                                rarity={index === activeIndex ? 'special' : 'gold'} // Active is special
                                rating={90 + (index % 5)} // Mock data variations
                                stats={[
                                    { label: 'SPD', value: 85 + (index % 10) },
                                    { label: 'VIS', value: 80 + (index % 15) },
                                    { label: 'CMP', value: 90 - (index % 5) }
                                ]}
                            />
                        </div>
                    );
                })}
            </div>

            {/* Navigation Controls */}
            <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-8 z-[60]">
                <button
                    onClick={() => setActiveIndex(prev => (prev - 1 + templates.length) % templates.length)}
                    className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md flex items-center justify-center text-white border border-white/10 transition-colors"
                >
                    <span className="material-icons-outlined">arrow_back</span>
                </button>
                <div className="flex items-center gap-2">
                    {templates.map((_, i) => (
                        <div
                            key={i}
                            className={`h-1 rounded-full transition-all duration-300 ${i === activeIndex ? 'w-8 bg-primary shadow-[0_0_10px_rgba(132,204,22,0.5)]' : 'w-2 bg-zinc-700'}`}
                        ></div>
                    ))}
                </div>
                <button
                    onClick={() => setActiveIndex(prev => (prev + 1) % templates.length)}
                    className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md flex items-center justify-center text-white border border-white/10 transition-colors"
                >
                    <span className="material-icons-outlined">arrow_forward</span>
                </button>
            </div>

            {/* Keyboard Hint */}
            <div className="absolute bottom-4 left-0 right-0 text-center text-[10px] text-zinc-500 font-mono uppercase tracking-widest opacity-50">
                Use Arrow Keys to Navigate • Click to Select
            </div>
        </div>
    );
};

export default TemplateCarousel;
