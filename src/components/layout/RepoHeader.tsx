import React from 'react';
import { useTremStore } from '../../store/useTremStore';

interface RepoHeaderProps {
  onMenuClick: () => void;
  onSettingsClick?: () => void;
}

const RepoHeader: React.FC<RepoHeaderProps> = ({ onMenuClick, onSettingsClick }) => {
  const repoData = useTremStore((state) => state.repoData);
  const repoName = repoData?.name || 'untitled-project';

  return (
    <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-slate-200 dark:border-white/10 bg-background-light/80 dark:bg-black/80 backdrop-blur-md sticky top-0 z-10">
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-1 -ml-1 text-slate-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-white transition-colors"
        >
          <span className="material-icons-outlined text-2xl">menu</span>
        </button>

        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
          <span className="material-icons-outlined text-lg">movie</span>
          <span className="text-sm font-mono hidden sm:inline">client /</span>
          <span className="text-slate-900 dark:text-white font-medium font-mono text-base tracking-tight truncate max-w-[150px] sm:max-w-none">{repoName}</span>
        </div>
        <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[10px] border border-slate-200 dark:border-white/10 text-slate-500 dark:text-gray-400 bg-slate-50 dark:bg-white/5 uppercase font-mono tracking-wider">Private</span>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden md:flex items-center gap-2">
          <div className="relative group">
            <button className="flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-md bg-white/50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm text-slate-600 dark:text-slate-300 hover:border-primary/50 transition-colors">
              <span className="material-icons-outlined text-sm text-blue-500">call_split</span>
              <span className="font-mono">main</span>
              <span className="material-icons-outlined text-sm text-slate-500">expand_more</span>
            </button>
          </div>
          <button className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary hover:bg-primary_hover text-white text-sm font-medium shadow-neon transition-all">
            <span className="material-icons-outlined text-sm">add</span>
            <span>New Branch</span>
          </button>
        </div>

        <div className="hidden sm:block h-4 w-px bg-slate-300 dark:bg-white/10 mx-2"></div>

        <div className="flex items-center -space-x-2">
          <img alt="User" className="w-8 h-8 rounded-full border-2 border-background-light dark:border-black" src="https://picsum.photos/100/100?random=3" />
          <img alt="User" className="w-8 h-8 rounded-full border-2 border-background-light dark:border-black" src="https://picsum.photos/100/100?random=4" />
        </div>

        <button
          onClick={onSettingsClick}
          className="text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors ml-2"
        >
          <span className="material-icons-outlined">settings</span>
        </button>
      </div>
    </header>
  );
};

export default RepoHeader;