import React, { useState, useEffect } from 'react';

// --- Types ---
import TopNavigation from '../../components/layout/TopNavigation';
import SimpleMarkdown from '../../components/ui/SimpleMarkdown';
import CommitDetailsView from './components/CommitDetails';
import AlertDialog from '../../components/ui/AlertDialog';
import { db } from '../../utils/db';
import { apiClient } from '../../api-client';

export interface FileNode {
  id: string;
  name: string;
  type: 'folder' | 'file';
  children?: FileNode[];
  locked?: boolean;
  icon?: string;
  iconColor?: string;
  content?: string;
  path?: string;
  contentUrl?: string;
  readonly?: boolean;
}

import { RepoData } from '../../utils/db';



export type { RepoData };

interface VideoRepoOverviewProps {
  repoData?: RepoData | null;
  onNavigate?: (view: string) => void;
}

const defaultFileSystem: FileNode[] = [];

interface ActivityLogEntry {
  id?: string;
  agent: string;
  message: string;
  timestamp: number;
  hashtags?: string[];
  parent?: string | null;
  branch?: string;
  artifacts?: Record<string, any>;
}

const findFileByPath = (nodes: FileNode[], path: string): FileNode | null => {
  for (const node of nodes) {
    if (node.type === 'file' && node.path === path) {
      return node;
    }
    if (node.children) {
      const found = findFileByPath(node.children, path);
      if (found) return found;
    }
  }
  return null;
};

const VideoRepoOverview: React.FC<VideoRepoOverviewProps> = ({ repoData, onNavigate }) => {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set(['media']));
  const [selectedId, setSelectedId] = useState<string>('');
  const [fileSystem, setFileSystem] = useState<FileNode[]>(defaultFileSystem);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [selectedCommit, setSelectedCommit] = useState<any | null>(null);
  const [isEditingBrief, setIsEditingBrief] = useState(false);
  const [editedBrief, setEditedBrief] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Update filesystem to match the Repo data - checks for existing structure first
  useEffect(() => {
    if (repoData) {
      if (repoData.fileSystem && repoData.fileSystem.length > 0) {
        setFileSystem(repoData.fileSystem);
        setExpandedIds(new Set(
          repoData.fileSystem
            .filter((node: FileNode) => node.type === 'folder')
            .map((node: FileNode) => node.id)
        ));
        setSelectedId((prev) => prev || repoData.fileSystem[0]?.id || '');

        // If repoData has commits property (from backend payload), use it directly
        if (repoData.commits && repoData.commits.length > 0) {
          setActivityLog(repoData.commits);
        } else {
          // Extract activity log from commits folder (Legacy/Local format)
          const commitsFolder = repoData.fileSystem.find((node: FileNode) => node.name === 'commits');
          if (commitsFolder && commitsFolder.children) {
            const activities: ActivityLogEntry[] = commitsFolder.children
              .map((commitFile: FileNode) => {
                if (commitFile.type === 'file' && commitFile.content) {
                  try {
                    const commitData = JSON.parse(commitFile.content);
                    return {
                      agent: commitData.author || 'Trem-AI',
                      message: commitData.message || 'Repository update',
                      timestamp: commitData.timestamp || Date.now()
                    };
                  } catch (e) {
                    return null;
                  }
                }
                return null;
              })
              .filter((entry): entry is ActivityLogEntry => entry !== null)
              .sort((a, b) => b.timestamp - a.timestamp); // Most recent first

            setActivityLog(activities);
          }
        }
      } else {
        setFileSystem([]);
      }
    }
  }, [repoData]);

  // Handler functions
  const handleEditBrief = () => {
    setEditedBrief(briefContent || '');
    setIsEditingBrief(true);
  };

  const handleSaveBrief = async () => {
    if (repoData?.id) {
      try {
        if (typeof repoData.id === 'string') {
          // Backend Project
          await apiClient.updateProject(repoData.id, { brief: editedBrief });
        } else {
          // Local Project
          await db.updateRepo(repoData.id, { brief: editedBrief });
        }
        // Force parent to reload repo data
        window.location.reload();
      } catch (error) {
        console.error('Failed to update brief:', error);
      }
    }
    setIsEditingBrief(false);
  };

  const handleDelete = async () => {
    if (repoData?.id) {
      try {
        if (typeof repoData.id === 'string') {
          // Backend Project
          await apiClient.deleteProject(repoData.id);
        } else {
          // Local Project
          await db.deleteRepo(repoData.id as number);
        }
        
        // Navigate back to dashboard
        if (onNavigate) {
          onNavigate('dashboard');
        }
      } catch (error) {
        console.error('Failed to delete repository:', error);
      }
    }
    setShowDeleteDialog(false);
  };

  const handleCommitClick = (commit: any) => {
    if (commit) {
      setSelectedCommit(commit);
    }
  };

  const handleViewFullLogs = () => {
    // Navigate to activity logs page
    if (repoData?.id && onNavigate) {
      onNavigate(`repo/${repoData.id}/logs`);
    }
  };

  // Helper to find path to selected item for breadcrumbs
  const findPath = (nodes: FileNode[], targetId: string, currentPath: FileNode[] = []): FileNode[] | null => {
    for (const node of nodes) {
      if (node.id === targetId) {
        return [...currentPath, node];
      }
      if (node.children) {
        const path = findPath(node.children, targetId, [...currentPath, node]);
        if (path) return path;
      }
    }
    return null;
  };

  const selectedPath = findPath(fileSystem, selectedId) || [];

  const toggleFolder = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const next = new Set(expandedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedIds(next);
  };

  const handleSelect = (id: string, type: 'folder' | 'file') => {
    setSelectedId(id);
    // Auto-expand folder on select if closed
    if (type === 'folder' && !expandedIds.has(id)) {
      const next = new Set(expandedIds);
      next.add(id);
      setExpandedIds(next);
    }
  };

  // Calculate file counts for folder
  const getFileCount = (node: FileNode): number => {
    if (node.type === 'file') return 0;
    return node.children?.length || 0;
  };

  const renderTree = (nodes: FileNode[], level: number = 0) => {
    return nodes.map((node, index) => {
      const isExpanded = expandedIds.has(node.id);
      const isSelected = selectedId === node.id;
      const fileCount = getFileCount(node);

      const paddingLeft = `${level * 1.5 + 1}rem`;

      return (
        <div key={node.id} className="relative">
          {/* Vertical line for children */}
          {level > 0 && (
            <div
              className="absolute left-0 top-0 bottom-0 w-px bg-slate-200 dark:bg-white/5"
              style={{ left: `${(level * 1.5) - 0.75}rem` }}
            />
          )}

          <div
            className={`
              group flex items-center justify-between py-2.5 pr-4 rounded-lg cursor-pointer font-mono text-sm transition-all duration-200
              ${isSelected ? 'bg-slate-100 dark:bg-white/5' : 'hover:bg-slate-50 dark:hover:bg-white/[0.02]'}
              ${node.locked ? 'opacity-50' : ''}
            `}
            style={{ paddingLeft }}
            onClick={() => !node.locked && handleSelect(node.id, node.type)}
          >
            <div className="flex items-center gap-3">
              {/* Icon Wrapper */}
              <div
                onClick={(e) => {
                  if (node.type === 'folder') {
                    e.stopPropagation();
                    toggleFolder(e, node.id);
                  }
                }}
                className={`w-5 h-5 flex items-center justify-center transition-colors ${node.type === 'folder' ? 'text-primary' : 'text-slate-400 dark:text-slate-500'}`}
              >
                {node.type === 'folder' ? (
                  <span className="material-icons-outlined text-base transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                    chevron_right
                  </span>
                ) : (
                  <span className="material-icons-outlined text-lg">
                    {node.icon || 'description'}
                  </span>
                )}
              </div>

              {node.type === 'folder' && (
                <span className="material-icons-outlined text-lg text-primary">
                  {isExpanded ? 'folder_open' : 'folder'}
                </span>
              )}

              {/* Name */}
              <span className={`transition-colors ${isSelected ? 'text-slate-900 dark:text-white font-medium' : 'text-slate-600 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white'}`}>
                {node.name}
              </span>
            </div>

            {/* Right Side: File Count */}
            <div className="flex items-center gap-4 text-xs text-slate-400 dark:text-slate-600 font-mono">
              {node.type === 'folder' && (
                <span>{fileCount} {fileCount === 1 ? 'file' : 'files'}</span>
              )}
            </div>
          </div>

          {/* Children */}
          {node.type === 'folder' && isExpanded && node.children && (
            <div className="relative">
              {renderTree(node.children, level + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  const briefContent = React.useMemo(() => {
    if (!repoData?.fileSystem) return repoData?.brief;
    const videoMd = findFileByPath(repoData.fileSystem, 'metadata/video.md');
    return videoMd?.content || repoData.brief;
  }, [repoData]);

  const latestTags = React.useMemo(() => {
    const latestCommit = repoData?.commits?.[0];
    return Array.isArray(latestCommit?.hashtags) ? latestCommit.hashtags : [];
  }, [repoData, activityLog]);

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-background-dark">
      <TopNavigation onNavigate={onNavigate} />

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 md:p-10">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-auto lg:h-[500px]">

            {/* Creative Brief Card */}
            <div className="lg:col-span-2 glass-panel rounded-xl p-8 flex flex-col relative overflow-hidden group min-h-[300px] border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5">
              <div className="absolute top-0 right-0 p-8 opacity-10 dark:opacity-20 pointer-events-none">
                <span className="material-icons-outlined text-9xl text-slate-400 dark:text-zinc-500">description</span>
              </div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xs font-mono uppercase tracking-[0.2em] text-slate-600 dark:text-zinc-400 font-semibold">{repoData?.name ? `Brief: ${repoData.name}` : 'Creative Brief'}</h2>
                <div className="flex items-center gap-2">
                  {!isEditingBrief ? (
                    <>
                      <button
                        onClick={handleEditBrief}
                        className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                        title="Edit Brief"
                      >
                        <span className="material-icons-outlined text-lg">edit</span>
                      </button>
                      <button
                        onClick={() => setShowDeleteDialog(true)}
                        className="p-2 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-600 transition-colors"
                        title="Delete Repository"
                      >
                        <span className="material-icons-outlined text-lg">delete</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={handleSaveBrief}
                        className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary_hover text-white text-sm font-medium transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setIsEditingBrief(false)}
                        className="px-4 py-1.5 rounded-lg bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20 text-slate-700 dark:text-white text-sm font-medium transition-colors"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="flex-1 flex flex-col relative z-10 overflow-y-auto pr-2 custom-scrollbar">
                {isEditingBrief ? (
                  <textarea
                    className="flex-1 w-full p-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white font-mono text-sm resize-none focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                    value={editedBrief}
                    onChange={(e) => setEditedBrief(e.target.value)}
                    placeholder="Enter creative brief in markdown format..."
                  />
                ) : (
                  <SimpleMarkdown className="text-slate-900 dark:text-white leading-relaxed">
                    {briefContent || (
                      `# High-Energy 30s Spot

**Client:** Nike  
**Campaign:** Urban Flow Q3  
**Tone:** Energetic, Raw, Authentic

## Objectives
*   Highlight the **red shoes** in every scene.
*   Use the \`Urban_LUT_v2\` for color grading.
*   Sync cuts to the beat of *Tech_House_01.mp3*.

## Required Shots
1.  Close-up of laces tying
2.  Wide shot running through subway
3.  Slow-motion jump (120fps)

> "Motion is the key emotion here. Keep it moving." - *Creative Director*`
                    )}
                  </SimpleMarkdown>
                )}
              </div>
              <div className="mt-8 flex flex-wrap gap-3">
                {latestTags.map(tag => (
                  <div key={tag} className="px-3 py-1 rounded-full border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-background-dark/40 text-xs text-slate-500 dark:text-slate-400 font-mono">
                    {tag}
                  </div>
                ))}
              </div>
            </div>

            {/* Repository Files - Mac Style Widget */}
            <div className="flex flex-col bg-white dark:bg-background-dark rounded-xl overflow-hidden border border-slate-200 dark:border-white/10">
              {/* Widget Header */}
              <div className="h-10 flex items-center justify-between px-4 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-background-dark shrink-0">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F56]"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-[#27C93F]"></div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500 dark:text-zinc-500 font-mono">~/files/</span>
                  <button
                    onClick={() => onNavigate && onNavigate('repo-files')}
                    className="text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-white transition-colors"
                    title="Maximize / Open File Manager"
                  >
                    <span className="material-icons-outlined text-sm">open_in_full</span>
                  </button>
                </div>
              </div>

              {/* Widget Content */}
              <div className="flex-1 p-3 overflow-y-auto bg-white dark:bg-[#111]">
                {renderTree(fileSystem)}
              </div>
            </div>
          </div>

          {/* Activity Log */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-display font-medium text-slate-900 dark:text-white">Latest Activity</h2>
              <button
                onClick={handleViewFullLogs}
                className="text-xs text-slate-600 dark:text-zinc-400 font-mono hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                VIEW FULL LOG
              </button>
            </div>
            <div className="glass-panel rounded-xl overflow-hidden overflow-x-auto border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5">
              <table className="w-full text-left text-sm font-mono min-w-[600px]">
                <thead className="bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider border-b border-slate-200 dark:border-white/5">
                  <tr>
                    <th className="px-6 py-3 font-medium w-1/4">Agent / Worker</th>
                    <th className="px-6 py-3 font-medium w-1/2">Commit Message</th>
                    <th className="px-6 py-3 font-medium text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-white/5 text-slate-700 dark:text-slate-300">
                  {activityLog.length > 0 ? (
                    activityLog.slice(0, 5).map((entry, idx) => {
                      const timeAgo = Math.floor((Date.now() - entry.timestamp) / 1000);
                      let timeStr = 'just now';
                      if (timeAgo < 60) timeStr = `${timeAgo}s ago`;
                      else if (timeAgo < 3600) timeStr = `${Math.floor(timeAgo / 60)}m ago`;
                      else if (timeAgo < 86400) timeStr = `${Math.floor(timeAgo / 3600)}h ago`;
                      else timeStr = `${Math.floor(timeAgo / 86400)}d ago`;

                      return (
                        <tr
                          key={idx}
                          onClick={() => handleCommitClick(repoData?.commits?.[idx] || entry)}
                          className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group cursor-pointer"
                        >
                          <td className="px-6 py-4 flex items-center gap-3">
                            <span className="w-2 h-2 rounded-full bg-primary"></span>
                            <span className="text-slate-700 dark:text-white font-bold">{entry.agent}</span>
                          </td>
                          <td className="px-6 py-4 text-slate-500 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                            {entry.message}
                          </td>
                          <td className="px-6 py-4 text-right text-slate-500">{timeStr}</td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={3} className="px-6 py-8 text-center text-slate-400 dark:text-slate-500 italic">
                        No activity yet. Commits will appear here.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Dialogs logic remains same */}
      {showDeleteDialog && (
        <AlertDialog
          isOpen={showDeleteDialog}
          title="Delete Repository?"
          description={`Are you sure you want to permanently delete "${repoData?.name}"?`}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteDialog(false)}
          confirmText="Delete"
          cancelText="Cancel"
          type="danger"
        />
      )}
    </div>
  );
};

export default VideoRepoOverview;
