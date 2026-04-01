import React, { useEffect, useState } from 'react';
import Sidebar from './components/layout/Sidebar';
import RemotionEditPage from './dashboard/edit/RemotionEditPage';
import TremCreate from './dashboard/create/RemotionCreatePage';
import TimelineEditor from './dashboard/edit/TimelineEditorPage';
import VideoRepoOverview from './dashboard/repo/RepoOverviewPage';
import CompareDiffView from './dashboard/edit/CompareDiffPage';
import AssetLibrary from './dashboard/assets/AssetLibraryPage';
import CreateRepoView from './dashboard/create/RepoIngestionPage';
import RepoFilesView from './dashboard/repo/RepoFilesPage';
import ActivityLogsView from './dashboard/repo/ActivityLogsPage';
import SettingsView from './dashboard/settings/SettingsPage';

import { RepoData } from './utils/db';
import { useTremStore, ViewType } from './store/useTremStore';
import { useRepo, useProjectPayload } from './hooks/useQueries';

const App: React.FC = () => {
    // Global State
    const {
        currentView,
        repoData,
        isSidebarOpen,
        setCurrentView,
        setRepoData,
        setIsSidebarOpen
    } = useTremStore();

    // Local State for Query
    const [activeRepoId, setActiveRepoId] = useState<number | undefined>(undefined);
    const [activeProjectId, setActiveProjectId] = useState<string | undefined>(undefined);
    
    // Fetchers
    const { data: fetchedRepo, isLoading: isRepoLoading } = useRepo(activeRepoId);
    const { data: projectPayload, isLoading: isProjectLoading } = useProjectPayload(activeProjectId);

    // Sync Query Data (Local) to Store
    useEffect(() => {
        if (fetchedRepo) {
            setRepoData(fetchedRepo);
        }
    }, [fetchedRepo, setRepoData]);

    useEffect(() => {
        if (projectPayload && activeProjectId) {
            try {
                // Construct a file system tree from artifacts and assets
                const assetFiles = projectPayload.assets?.map((a: any) => ({
                    id: a.id,
                    name: a.name || `${a.id}.mp4`,
                    type: 'file' as const,
                    icon: 'movie',
                    iconColor: 'text-primary'
                })) || [];

                const artifactFiles = projectPayload.artifacts?.map((a: any) => ({
                    id: a.name,
                    name: a.name,
                    type: 'file' as const,
                    icon: 'description',
                    iconColor: 'text-emerald-400'
                })) || [];

                const fs: any[] = [
                    {
                        id: 'media',
                        name: 'media',
                        type: 'folder',
                        locked: true,
                        children: [
                            { id: 'raw_footage', name: 'raw_footage', type: 'folder', children: assetFiles },
                            { id: 'proxies', name: 'proxies', type: 'folder', children: [] }
                        ]
                    },
                    {
                        id: 'artifacts',
                        name: 'artifacts',
                        type: 'folder',
                        children: artifactFiles
                    }
                ];

                const transformedRepo: RepoData = {
                    id: projectPayload.project.id,
                    name: projectPayload.project.name,
                    brief: projectPayload.project.brief || '',
                    assets: projectPayload.assets || [],
                    fileSystem: fs,
                    commits: projectPayload.logs?.map((l: any) => ({
                        agent: l.actor || 'Trem-AI',
                        message: l.message,
                        timestamp: l.created_at * 1000
                    })) || [],
                    status: projectPayload.activeJob?.status || 'idle',
                    created: projectPayload.project.created_at ? (projectPayload.project.created_at * 1000) : Date.now()
                };
                setRepoData(transformedRepo);
            } catch (e) {
                console.error("Failed to sync backend project payload", e);
            }
        }
    }, [projectPayload, activeProjectId, setRepoData]);

    // Initial Route Handling & PopState Listener
    useEffect(() => {
        const handleRoute = async () => {
            const path = window.location.pathname;

            if (path === '/') {
                setActiveProjectId(undefined);
                window.history.replaceState({}, '', '/trem-edit');
                setCurrentView('trem-edit');
            }
            else if (path === '/timeline') {
                setActiveProjectId(undefined);
                setCurrentView('timeline');
            }
            else if (path === '/diff') {
                setActiveProjectId(undefined);
                setCurrentView('diff');
            }
            else if (path === '/assets') {
                setActiveProjectId(undefined);
                setCurrentView('assets');
            }
            else if (path === '/create-repo') {
                setActiveProjectId(undefined);
                setCurrentView('create-repo');
            }
            else if (path.startsWith('/create-repo/')) {
                const projectId = path.split('/')[2];
                setActiveProjectId(projectId || undefined);
                setCurrentView('create-repo');
            }
            else if (path === '/trem-create') {
                setActiveProjectId(undefined);
                setCurrentView('trem-create');
            }
            else if (path === '/trem-edit') {
                setActiveProjectId(undefined);
                setCurrentView('trem-edit');
            }
            else if (path === '/repo-files' && repoData) {
                setActiveProjectId(undefined);
                setCurrentView('repo-files');
            }
            else if (path.startsWith('/repo/')) {
                const parts = path.split('/');
                const idStr = parts[2];

                if (idStr) {
                    const idNum = parseInt(idStr);
                    if (!isNaN(idNum) && idStr.length < 10) {
                        setActiveRepoId(idNum);
                        setActiveProjectId(undefined);
                    } else {
                        setActiveRepoId(undefined);
                        setActiveProjectId(idStr);
                    }
                    // View logic
                    if (path.endsWith('/files')) {
                        setCurrentView('repo-files');
                    } else if (path.endsWith('/logs')) {
                        setCurrentView('repo-logs');
                    } else {
                        setCurrentView('repo');
                    }
                }
            } else {
                // Default to Trem Edit for unknown routes, but keep the old orchestrator alias.
                if (path === '/orchestrator') {
                    setActiveProjectId(undefined);
                    window.history.replaceState({}, '', '/trem-edit');
                    setCurrentView('trem-edit');
                    return;
                }
                setActiveProjectId(undefined);
                window.history.replaceState({}, '', '/trem-edit');
                setCurrentView('trem-edit');
            }
        };

        handleRoute();

        const onPopState = () => handleRoute();
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, []); // Run once on mount

    const handleNavigate = (view: ViewType | string) => {
        let url = '/trem-edit';

        switch (view) {
            case 'timeline': url = '/timeline'; break;
            case 'diff': url = '/diff'; break;
            case 'assets': url = '/assets'; break;
            case 'create-repo':
                setActiveProjectId(undefined);
                url = '/create-repo';
                break;
            case 'trem-create': url = '/trem-create'; break;
            case 'trem-edit': url = '/trem-edit'; break;
            case 'settings': url = '/settings'; break;
            case 'dashboard': url = '/trem-edit'; break; // Dashboard maps to TremEdit
            case 'repo':
                if (repoData?.id) {
                    url = `/repo/${repoData.id}`;
                } else if (typeof view === 'string' && view.startsWith('repo/')) {
                    url = `/${view}`;
                }

                break;
            case 'repo-files':
                if (repoData?.id) {
                    url = `/repo/${repoData.id}/files`;
                } else if (typeof view === 'string' && view.startsWith('repo/files/')) {
                    url = `/${view}`;
                }

                break;
            default:
                // Handle dynamic routes like repo/:id/logs
                if (typeof view === 'string') {
                    if (view.startsWith('repo/')) {
                        url = `/${view}`;
                    } else if (view.startsWith('create-repo/')) {
                        url = `/${view}`;
                    }
                }
                break;
        }

        if (!(typeof view === 'string' && view.startsWith('create-repo/')) && view !== 'create-repo') {
            setActiveProjectId(undefined);
        }

        if (window.location.pathname !== url) {
            window.history.pushState({}, '', url);
        }

        // Determine the actual view to set
        if (typeof view === 'string' && view.startsWith('create-repo/')) {
            const projectId = view.split('/')[1];
            if (projectId) {
                setActiveProjectId(projectId);
                setCurrentView('create-repo');
            }
        } else if (typeof view === 'string' && view.includes('/logs')) {
            setCurrentView('repo-logs');
        } else if (view !== currentView) {
            setCurrentView(view as ViewType);
        }
        setIsSidebarOpen(false);
    };

    const handleSelectRepo = (data: RepoData) => {
        setRepoData(data);
        const url = data.id ? `/repo/${data.id}` : '/trem-edit';
        window.history.pushState({}, '', url);
        setCurrentView('repo');
    };

    const renderView = () => {
        switch (currentView) {
            case 'dashboard':
            case 'trem-edit':
                return <RemotionEditPage onNavigate={handleNavigate} onSelectRepo={handleSelectRepo} />;
            case 'trem-create':
                return <TremCreate onNavigate={handleNavigate} onSelectRepo={handleSelectRepo} />;
            case 'timeline':
                return <TimelineEditor onNavigate={handleNavigate} />;
            case 'repo':
                return <VideoRepoOverview repoData={repoData} onNavigate={handleNavigate} />;
            case 'diff':
                return <CompareDiffView onNavigate={handleNavigate} />;
            case 'assets':
                return <AssetLibrary onNavigate={handleNavigate} />;
            case 'create-repo':
                return <CreateRepoView onNavigate={handleNavigate} initialProjectId={activeProjectId} />;
            case 'repo-files':
                return <RepoFilesView onNavigate={handleNavigate} repoData={repoData} />;
            case 'repo-logs':
                return <ActivityLogsView />; // No props needed, uses store
            case 'settings':
                return <SettingsView onNavigate={handleNavigate} />;
            default:
                return <RemotionEditPage onNavigate={handleNavigate} />;
        }
    };

    return (
        <div className="flex h-screen bg-slate-50 dark:bg-background-dark text-slate-900 dark:text-white overflow-hidden selection:bg-primary selection:text-white font-sans">
            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                onNavigate={handleNavigate}
                onSelectRepo={handleSelectRepo}
            />

            <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
                {/* Mobile Header Button for Sidebar */}
                <div className="lg:hidden absolute top-4 left-4 z-50">
                    <button
                        onClick={() => setIsSidebarOpen(true)}
                        className="p-2 rounded-md bg-white dark:bg-zinc-800 shadow-md border border-slate-200 dark:border-white/10 text-slate-600 dark:text-white"
                    >
                        <span className="material-icons-outlined">menu</span>
                    </button>
                </div>

                <main className="flex-1 overflow-auto">
                    {renderView()}
                </main>
            </div>

            {/* Mobile Overlay */}
            {isSidebarOpen && (
                <div
                    className="lg:hidden fixed inset-0 bg-black/50 z-30 backdrop-blur-sm"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}
        </div>
    );
};

export default App;
