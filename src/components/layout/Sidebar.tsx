import React, { useState, useEffect } from 'react';
import { db, RepoData, PendingRepoData } from '../../utils/db';
import { useTremStore } from '../../store/useTremStore';
import { useRepos, useProjects, useDeleteRepo, useDeleteCFProject } from '../../hooks/useQueries';
import AlertDialog from '../ui/AlertDialog';

// Cloudflare Native Active Jobs
const ActiveJobsList: React.FC<{ 
  isCollapsed: boolean; 
  onNavigate: any; 
  projects: any[]; 
  onDeleteRequest: (id: string, name: string) => void 
}> = ({ isCollapsed, onNavigate, projects, onDeleteRequest }) => {
  // Filter for projects that have an active job or are not completed
  const activeProjects = projects.filter(p => p.status !== 'completed' && p.status !== 'failed');

  if (activeProjects.length === 0) return null;

  return (
    <ul className="space-y-1 mb-2">
      {activeProjects.map(project => (
        <li key={project.id} className="group px-1">
          <div
            className={`w-full flex items-center gap-1 px-2 py-2 text-sm rounded-md bg-primary/10 text-primary font-medium border border-primary/20 ${isCollapsed ? 'justify-center' : ''}`}
          >
            <button
              onClick={() => onNavigate(`create-repo/${project.id}`)}
              className="flex items-center gap-2 flex-1 min-w-0 text-left"
              title={isCollapsed ? `Processing: ${project.name}` : ''}
            >
              <span className="material-icons-outlined text-sm animate-spin">sync</span>
              {!isCollapsed && <span className="truncate whitespace-nowrap">Processing: {project.name}</span>}
            </button>
            {!isCollapsed && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteRequest(project.id, project.name);
                }}
                className="opacity-0 group-hover:opacity-100 p-1 text-primary/60 hover:text-red-500 transition-all flex-shrink-0"
                title="Delete/Cancel Process"
              >
                <span className="material-icons-outlined text-sm pointer-events-none">delete</span>
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
  
  // Deletion State
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    id: string | number | null;
    name: string;
    type: 'legacy' | 'cf';
  }>({
    isOpen: false,
    id: null,
    name: '',
    type: 'cf'
  });

  // Fetch both IndexedDB repos (legacy) and Cloudflare Projects
  const { data: legacyRepos = [] } = useRepos();
  const { data: cfProjects = [] } = useProjects();
  const deleteRepo = useDeleteRepo();
  const deleteCFProject = useDeleteCFProject();

  const handleRepoClick = (repo: any) => {
    if (onSelectRepo) {
      onSelectRepo(repo);
      return;
    }
    onNavigate('repo');
  };

  const confirmDelete = async () => {
    const { id, type } = deleteDialog;
    if (!id) return;

    try {
      if (type === 'legacy') {
        await deleteRepo.mutateAsync(id as number);
      } else {
        await deleteCFProject.mutateAsync(id as string);
      }

      // If we deleted the active project, move to high-level view
      if (repoData?.id && String(repoData.id) === String(id)) {
        onNavigate('trem-edit');
      } else if (type === 'cf' && window.location.pathname.includes(`/create-repo/${id}`)) {
        onNavigate('trem-edit');
      }
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setDeleteDialog(prev => ({ ...prev, isOpen: false }));
    }
  };

  return (
    <>
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
          <div className={`flex items-center gap-2 ${isCollapsed ? 'justify-center' : ''}`}>
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white shadow-[0_0_15px_rgba(217,248,95,0.5)] flex-shrink-0">
              <span className="material-icons-outlined text-lg">auto_awesome_motion</span>
            </div>
            {!isCollapsed && (
              <span className="font-display font-bold text-xl tracking-tight dark:text-white text-slate-900 transition-opacity duration-200">Trem</span>
            )}
          </div>

          <button onClick={onClose} className="lg:hidden p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
            <span className="material-icons-outlined">close</span>
          </button>

          {!isCollapsed && (
            <button onClick={() => setIsCollapsed(true)} className="hidden lg:block p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
              <span className="material-icons-outlined text-lg">first_page</span>
            </button>
          )}
        </div>

        {/* Search */}
        <div className={`p-4 ${isCollapsed ? 'hidden' : 'block'}`}>
          <div className="relative group/search">
            <span className="absolute left-3 top-2.5 text-slate-400 group-focus-within/search:text-emerald-500 transition-colors material-icons-outlined text-sm">search</span>
            <input
              className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm rounded-lg py-2 pl-9 pr-3 focus:ring-1 focus:ring-primary focus:border-primary placeholder-slate-500 text-slate-700 dark:text-gray-200 transition-all font-mono outline-none"
              placeholder="Search..."
              type="text"
            />
          </div>
        </div>

        {/* Navigation Links */}
        <div className={`flex-1 overflow-y-auto px-3 space-y-6 ${isCollapsed ? 'py-4 px-2 no-scrollbar' : ''}`}>
          
          {/* Active Processing section */}
          <div>
            {!isCollapsed && cfProjects.some((p: any) => p.status !== 'completed' && p.status !== 'failed') && (
              <h3 className="px-2 text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-gray-500 mb-2 mt-2 font-bold">Active Processing</h3>
            )}
            <ActiveJobsList 
              isCollapsed={isCollapsed} 
              onNavigate={onNavigate} 
              projects={cfProjects} 
              onDeleteRequest={(id, name) => setDeleteDialog({ isOpen: true, id, name, type: 'cf' })} 
            />
          </div>

          {/* Video Repos */}
          <div>
            {!isCollapsed && (
              <h3 className="px-2 text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-gray-500 mb-2 font-bold">Video Repos</h3>
            )}
            <ul className="space-y-1">
              {legacyRepos.length === 0 && cfProjects.filter((p: any) => p.status === 'completed' || p.status === 'failed').length === 0 && !isCollapsed && (
                <li className="px-2 py-2 text-xs text-slate-400 italic">No repositories yet.</li>
              )}
              
              {/* Cloudflare Projects */}
              {cfProjects.filter((p: any) => p.status === 'completed' || p.status === 'failed').map((project: any) => (
                <li key={`cf-${project.id}`} className="group px-1">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleRepoClick({ id: project.id, name: project.name, brief: project.brief, created: new Date(project.created_at).getTime() })}
                      className={`
                        flex-1 flex items-center gap-3 px-3 py-2 rounded-lg 
                        text-sm font-medium transition-colors
                        ${repoData?.id === project.id 
                          ? 'bg-primary/20 text-primary' 
                          : 'text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-zinc-800 hover:text-slate-900 dark:hover:text-white'}
                        ${isCollapsed ? 'justify-center' : ''}
                      `}
                      title={isCollapsed ? project.name : ''}
                    >
                      <span className="material-icons-outlined text-lg text-emerald-400/70">folder</span>
                      {!isCollapsed && <span className="truncate">{project.name}</span>}
                    </button>
                    {!isCollapsed && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteDialog({ isOpen: true, id: project.id, name: project.name, type: 'cf' });
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition-all flex-shrink-0"
                        title="Delete Project"
                      >
                        <span className="material-icons-outlined text-sm">delete</span>
                      </button>
                    )}
                  </div>
                </li>
              ))}
              
              {/* Legacy IndexedDB Repositories */}
              {legacyRepos.map((repo) => (
                <li key={repo.id} className="group px-1">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleRepoClick(repo)}
                      className={`
                        flex-1 flex items-center gap-3 px-3 py-2 rounded-lg 
                        text-sm font-medium transition-colors
                        ${repoData?.id === repo.id 
                          ? 'bg-primary/20 text-primary' 
                          : 'text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-zinc-800 hover:text-slate-900 dark:hover:text-white'}
                        ${isCollapsed ? 'justify-center' : ''}
                      `}
                      title={isCollapsed ? repo.name : ""}
                    >
                      <span className="material-icons-outlined text-lg text-emerald-400/70">folder</span>
                      {!isCollapsed && <span className="truncate">{repo.name}</span>}
                    </button>
                    {!isCollapsed && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteDialog({ isOpen: true, id: repo.id!, name: repo.name, type: 'legacy' });
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition-all flex-shrink-0"
                        title="Delete Repo"
                      >
                        <span className="material-icons-outlined text-sm">delete</span>
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Footer Action */}
        <div className={`p-4 border-t border-slate-200 dark:border-white/10 ${isCollapsed ? 'justify-center flex px-2' : ''}`}>
          <div className="flex flex-col gap-2 w-full">
            {isCollapsed && (
              <button onClick={() => setIsCollapsed(false)} className="p-2 mb-2 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors flex justify-center hover:bg-slate-100 dark:hover:bg-white/5">
                <span className="material-icons-outlined text-lg">last_page</span>
              </button>
            )}
            <button
              onClick={() => onNavigate('create-repo')}
              className={`flex items-center gap-2 text-sm px-2 py-1.5 rounded-md text-slate-500 dark:text-gray-400 hover:text-primary transition-colors group/add ${isCollapsed ? 'justify-center' : 'w-full'}`} title={isCollapsed ? "New Video Repository" : ""}
            >
              <span className="material-icons-outlined text-lg group-hover/add:text-primary">add_circle_outline</span>
              {!isCollapsed && <span>New Repo</span>}
            </button>
          </div>
        </div>
      </aside>

      <AlertDialog
        isOpen={deleteDialog.isOpen}
        title={deleteDialog.type === 'cf' ? "Delete Project?" : "Delete Repository?"}
        description={
          <>
            Are you sure you want to delete <span className="font-bold text-slate-900 dark:text-white">"{deleteDialog.name}"</span>? 
            This action cannot be undone and will remove all associated assets and processing jobs.
          </>
        }
        confirmText="Permanently Delete"
        cancelText="Cancel"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteDialog(prev => ({ ...prev, isOpen: false }))}
        type="danger"
      />
    </>
  );
};

export default Sidebar;
