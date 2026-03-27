import React from 'react';

interface TopNavigationProps {
    onNavigate?: (view: 'dashboard' | 'repo' | 'timeline' | 'diff' | 'assets' | 'settings' | 'create-repo' | 'repo-files' | 'trem-create' | 'trem-edit') => void;
    activeTab?: 'edit' | 'create' | 'assets' | 'diff' | 'timeline';
}

const TopNavigation: React.FC<TopNavigationProps> = ({ onNavigate, activeTab }) => {
    const [isVisible, setIsVisible] = React.useState(true);
    const lastScrollY = React.useRef(0);

    React.useEffect(() => {
        const scrollContainer = document.querySelector('main') || window;

        const handleScroll = () => {
            const currentScrollY = scrollContainer instanceof Window ? scrollContainer.scrollY : scrollContainer.scrollTop;

            // Show if scrolling up or at the top
            if (currentScrollY < lastScrollY.current || currentScrollY < 50) {
                setIsVisible(true);
            }
            // Hide if scrolling down and not at the top
            else if (currentScrollY > lastScrollY.current && currentScrollY > 50) {
                setIsVisible(false);
            }

            lastScrollY.current = currentScrollY;
        };

        scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
        return () => scrollContainer.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <header className={`h-24 flex items-center justify-between px-8 bg-transparent sticky top-0 z-50 pointer-events-none transition-transform duration-500 ease-in-out ${isVisible ? 'translate-y-0' : '-translate-y-full'}`}>
            {/* Left Spacer to balance layout if needed, or Logo */}
            <div className="flex items-center gap-2 pointer-events-auto">
                {/* Logo or Context could go here */}
            </div>

            {/* Centered Pill Navigation */}
            <div
                className="pointer-events-auto bg-white/80 dark:bg-surface-card/90 backdrop-blur-xl border border-white/20 dark:border-border-dark rounded-full p-2 flex items-center gap-1 mx-auto absolute left-1/2 -translate-x-1/2 shadow-xl dark:shadow-none"
            >
                <button
                    onClick={() => onNavigate?.('trem-edit')}
                    className={`
                        px-8 py-3 rounded-full text-sm font-bold transition-all duration-300 flex items-center gap-2
                        ${(activeTab === 'edit' || activeTab === 'diff' || activeTab === 'timeline')
                            ? 'bg-primary text-black font-extrabold shadow-sm'
                            : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
                        }
                    `}
                >
                    <span className="material-icons-outlined text-xl">auto_fix_normal</span>
                    Edit
                </button>

                <button
                    onClick={() => onNavigate?.('trem-create')}
                    className={`
                        px-8 py-3 rounded-full text-sm font-bold transition-all duration-300 flex items-center gap-2
                        ${activeTab === 'create'
                            ? 'bg-primary text-black font-extrabold shadow-sm'
                            : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
                        }
                    `}
                >
                    <span className="material-icons-outlined text-xl">auto_awesome</span>
                    Create
                </button>

                <div className="w-px h-6 bg-slate-200 dark:bg-border-dark mx-3"></div>

                <button
                    onClick={() => onNavigate?.('assets')}
                    className={`
                         px-8 py-3 rounded-full text-sm font-bold transition-all duration-300 flex items-center gap-2
                         text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5
                    `}
                >
                    <span className="material-icons-outlined text-xl">video_library</span>
                    Assets
                </button>
            </div>

            {/* Right Side Actions */}
            <div className="flex items-center gap-6 pointer-events-auto">
                <button className="w-12 h-12 rounded-full bg-white dark:bg-surface-card border border-slate-200 dark:border-border-dark flex items-center justify-center text-slate-600 dark:text-white hover:bg-slate-50 dark:hover:bg-white/5 transition-all hover:scale-105 shadow-sm group">
                    <span className="material-icons-outlined group-hover:rotate-12 transition-transform">notifications</span>
                    <span className="absolute top-3 right-3.5 w-2.5 h-2.5 bg-primary rounded-full ring-2 ring-white dark:ring-surface-card"></span>
                </button>

                <div className="flex items-center gap-4 pl-6 border-l border-slate-200 dark:border-border-dark">
                    <div className="flex flex-col items-end hidden md:flex">
                        <span className="text-sm font-bold text-slate-900 dark:text-white leading-none">Trem User</span>
                        <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-gray-500 tracking-wider mt-1.5">Pro Plan</span>
                    </div>
                    <button className="flex items-center justify-center w-12 h-12 rounded-full bg-primary text-black font-bold text-sm shadow-md border-4 border-white dark:border-background-dark ring-2 ring-slate-100 dark:ring-border-dark hover:scale-105 transition-transform">
                        TU
                    </button>
                </div>
            </div>
        </header>
    );
};

export default TopNavigation;
