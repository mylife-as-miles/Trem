import React, { useState, useEffect } from 'react';
import { db, RepoData, PendingRepoData } from '../../utils/db';
import { useTremStore } from '../../store/useTremStore';
import { useRepos } from '../../hooks/useQueries';
import { useBackgroundIngestionStore } from '../../services/backgroundIngestion';

// Component to display active background ingestion jobs
const ActiveJobsList: React.FC<{ isCollapsed: boolean; onNavigate: any }> = ({ isCollapsed, onNavigate }) => {
  const activeJobIds = useBackgroundIngestionStore(state => state.activeJobs);
  const [jobs, setJobs] = useState<PendingRepoData[]>([]);

  useEffect(() => {
    const loadJobs = async () => {
      const all = await Promise.all(activeJobIds.map(id => db.getPendingRepo(id)));
      setJobs(all.filter(j => !!j) as PendingRepoData[]);
    };
    loadJobs();
    const interval = setInterval(loadJobs, 2000);
    return () => clearInterval(interval);
  }, [activeJobIds]);

  if (jobs.length === 0) return null;

  const handleDelete = async (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation(); // Prevent navigating to the job
    if (confirm('Delete this pending job? This cannot be undone.')) {
      await db.deletePendingRepo(jobId);
      // Jobs list will auto-update on next poll
    }
  };

  return (
    <ul className="space-y-1 mb-2">
      {jobs.map(job => (
        <li key={job.id}>
          <div
            className={`w-full flex items-center gap-2 px-2 py-2 text-sm rounded-md bg-primary/10 text-primary font-medium border border-primary/20 ${isCollapsed ? 'justify-center' : ''}`}
          >
            <button
              onClick={() => onNavigate(`create-repo/${job.id}`)}
              className="flex items-center gap-2 flex-1 min-w-0 text-left"
              title={isCollapsed ? `Ingesting: ${job.name}` : ''}
            >
              <span className="material-icons-outlined text-sm animate-spin">sync</span>
              {!isCollapsed && <span className="truncate">Ingesting: {job.name}</span>}
            </button>
            {!isCollapsed && (
              <button
                onClick={(e) => handleDelete(e, job.id)}
                className="material-icons-outlined text-sm text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded p-1 transition-colors"
                title="Delete job"
              >
                close
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
};

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: 'dashboard' | 'repo' | 'timeline' | 'diff' | 'assets' | 'settings' | 'create-repo' | 'trem-create' | 'trem-edit') => void;
  onSelectRepo?: (repo: RepoData) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, onNavigate, onSelectRepo }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const repoData = useTremStore((state) => state.repoData);
  const { data: repos = [] } = useRepos();

  const handleRepoClick = (repo: RepoData) => {
    if (onSelectRepo) {
      onSelectRepo(repo);
    }
    onNavigate('repo');
  };

  return (
    <>
      {/* Mobile Overlay is handled in App.tsx, but we ensure z-index here */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 flex-shrink-0 flex flex-col 
          border-r border-slate-200 dark:border-white/10 
          bg-surface-light dark:bg-surface-dark 
          transition-all duration-300 ease-in-out
          lg:translate-x-0 lg:static lg:inset-auto
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          ${isCollapsed ? 'w-20' : 'w-72'}
        `}
      >
        {/* Header */}
        <div className={`h-16 flex items-center justify-between border-b border-slate-100 dark:border-white/10 ${isCollapsed ? 'px-2 justify-center' : 'px-4'}`}>
          <div
            className={`flex items-center gap-2 ${isCollapsed ? 'justify-center' : ''}`}
          >
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white shadow-[0_0_15px_rgba(217,248,95,0.5)] flex-shrink-0">
              <span className="material-icons-outlined text-lg">auto_awesome_motion</span>
            </div>
            {!isCollapsed && (
              <span className="font-display font-bold text-xl tracking-tight dark:text-white text-slate-900 transition-opacity duration-200">Trem</span>
            )}
          </div>

          {/* Mobile Close Button */}
          <button
            onClick={onClose}
            className="lg:hidden p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
          >
            <span className="material-icons-outlined">close</span>
          </button>

          {/* Desktop Collapse Icon */}
          {!isCollapsed && (
            <button
              onClick={() => setIsCollapsed(true)}
              className="hidden lg:block p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
            >
              <span className="material-icons-outlined text-lg">first_page</span>
            </button>
          )}
        </div>

        {/* Search */}
        <div className={`p-4 ${isCollapsed ? 'hidden' : 'block'}`}>
          <div className="relative group">
            <span className="absolute left-3 top-2.5 text-slate-400 group-focus-within:text-emerald-500 transition-colors material-icons-outlined text-sm">search</span>
            <input
              className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm rounded-lg py-2 pl-9 pr-3 focus:ring-1 focus:ring-primary focus:border-primary placeholder-slate-500 text-slate-700 dark:text-gray-200 transition-all font-mono outline-none"
              placeholder="Search..."
              type="text"
            />
            <div className="hidden xl:block absolute right-3 top-2.5 text-[10px] text-slate-400 border border-slate-300 dark:border-white/10 rounded px-1">⌘K</div>
          </div>
        </div>

        {/* Navigation Links */}
        <div className={`flex-1 overflow-y-auto px-3 space-y-6 ${isCollapsed ? 'py-4 px-2 no-scrollbar' : ''}`}>



          {/* Active Processing */}
          <div>
            {!isCollapsed && (
              <h3 className="px-2 text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-gray-500 mb-2 mt-2 font-bold whitespace-nowrap overflow-hidden">Active Processing</h3>
            )}
            <ActiveJobsList isCollapsed={isCollapsed} onNavigate={onNavigate} />
            <ul className="space-y-1">
              <li>
                <button onClick={() => onNavigate('timeline')} className={`w-full text-left flex items-center gap-3 px-2 py-2 text-sm rounded-md text-slate-600 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-white/5 dark:hover:text-white transition-colors group ${isCollapsed ? 'justify-center' : ''}`} title={isCollapsed ? `Edit: ${repoData?.name || 'project'}` : ""}>
                  <span className="material-icons-outlined text-sm text-slate-400 group-hover:text-primary transition-colors">edit</span>
                  {!isCollapsed && <span className="truncate">Edit: {repoData?.name || 'project'}</span>}
                </button>
              </li>
            </ul>
          </div>

          {/* Video Repos */}
          <div>
            {!isCollapsed && (
              <h3 className="px-2 text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-gray-500 mb-2 font-bold whitespace-nowrap overflow-hidden">Video Repos</h3>
            )}
            <ul className="space-y-1">
              {repos.length === 0 && !isCollapsed && (
                <li className="px-2 py-2 text-xs text-slate-400 italic">No repositories yet.</li>
              )}
              {repos.map((repo) => (
                <li key={repo.id}>
                  <button
                    onClick={() => handleRepoClick(repo)}
                    className={`w-full text-left flex items-center gap-3 px-2 py-2 text-sm rounded-md text-slate-600 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-white/5 dark:hover:text-white transition-colors group ${isCollapsed ? 'justify-center' : ''}`} title={isCollapsed ? repo.name : ""}
                  >
                    <span className="material-icons-outlined text-sm text-emerald-400/70 group-hover:text-primary transition-colors">folder</span>
                    {!isCollapsed && <span className="truncate">{repo.name}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>

        </div>

        {/* Footer Action */}
        <div className={`p-4 border-t border-slate-200 dark:border-white/10 ${isCollapsed ? 'justify-center flex px-2' : ''}`}>
          <div className="flex flex-col gap-2 w-full">
            {isCollapsed && (
              <button
                onClick={() => setIsCollapsed(false)}
                className="p-2 mb-2 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors flex justify-center hover:bg-slate-100 dark:hover:bg-white/5"
              >
                <span className="material-icons-outlined text-lg">last_page</span>
              </button>
            )}

            <button
              onClick={() => onNavigate('create-repo')}
              className={`flex items-center gap-2 text-sm px-2 py-1.5 rounded-md text-slate-500 dark:text-gray-400 hover:text-primary transition-colors group ${isCollapsed ? 'justify-center' : 'w-full'}`} title={isCollapsed ? "New Video Repository" : ""}
            >
              <span className="material-icons-outlined text-lg group-hover:text-primary">add_circle_outline</span>
              {!isCollapsed && <span>New Repo</span>}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;