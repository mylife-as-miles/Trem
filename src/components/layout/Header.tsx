import React from 'react';

interface HeaderProps {
  onMenuClick: () => void;
  onSettingsClick?: () => void;
}

const Header: React.FC<HeaderProps> = ({ onMenuClick, onSettingsClick }) => {
  return (
    <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-slate-200 dark:border-white/10 bg-background-light/80 dark:bg-black/80 backdrop-blur-md sticky top-0 z-10">
      <div className="flex items-center gap-3">
        {/* Mobile Menu Button */}
        <button
          onClick={onMenuClick}
          className="lg:hidden p-1 -ml-1 text-slate-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-white transition-colors"
        >
          <span className="material-icons-outlined text-2xl">menu</span>
        </button>

        <div className="px-3 py-1 rounded-full bg-slate-200 dark:bg-white/5 text-xs font-mono text-slate-600 dark:text-gray-300 border border-slate-300 dark:border-white/10 flex items-center gap-2 shadow-sm max-w-[200px] sm:max-w-none">
          <span className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_5px_rgba(168,85,247,0.8)] flex-shrink-0"></span>
          <span className="truncate">trem-video-pipeline / production</span>
          <span className="material-icons-outlined text-[10px] flex-shrink-0">expand_more</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden sm:flex items-center -space-x-2">
          <img alt="User" className="w-8 h-8 rounded-full border-2 border-background-light dark:border-black" src="https://picsum.photos/100/100?random=1" />
          <img alt="User" className="w-8 h-8 rounded-full border-2 border-background-light dark:border-black" src="https://picsum.photos/100/100?random=2" />
          <div className="w-8 h-8 rounded-full border-2 border-background-light dark:border-black bg-slate-200 dark:bg-zinc-800 flex items-center justify-center text-[10px] text-slate-500 dark:text-white font-medium">+2</div>
        </div>
        <div className="hidden sm:block h-4 w-px bg-slate-300 dark:bg-white/10 mx-2"></div>
        <button
          onClick={onSettingsClick}
          className="hidden sm:block text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          <span className="material-icons-outlined">settings</span>
        </button>
        <button className="text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors relative">
          <span className="material-icons-outlined">notifications</span>
          <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full border-2 border-background-light dark:border-black"></span>
        </button>
      </div>
    </header>
  );
};

export default Header;