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

import { db, RepoData } from './utils/db';
import { useTremStore, ViewType } from './store/useTremStore';
import { useRepo } from './hooks/useQueries';

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
    const [activeJobId, setActiveJobId] = useState<string | undefined>(undefined);
    const { data: fetchedRepo, isLoading: isRepoLoading } = useRepo(activeRepoId);

    // Sync Query Data to Store
    useEffect(() => {
        if (fetchedRepo) {
            setRepoData(fetchedRepo);
        } else if (activeRepoId && !isRepoLoading && !fetchedRepo) {
            // Repo not found
            // console.warn("Repo not found for ID:", activeRepoId);
            // window.history.replaceState({}, '', '/trem-edit');
            // setCurrentView('trem-edit');
        }
    }, [fetchedRepo, setRepoData, activeRepoId, isRepoLoading, setCurrentView]);

    // Initial Route Handling & PopState Listener
    useEffect(() => {
        const handleRoute = async () => {
            const path = window.location.pathname;

            if (path === '/timeline') setCurrentView('timeline');
            else if (path === '/diff') setCurrentView('diff');
            else if (path === '/assets') setCurrentView('assets');
            else if (path === '/create-repo') setCurrentView('create-repo');
            else if (path === '/trem-create') setCurrentView('trem-create');
            else if (path === '/trem-edit') setCurrentView('trem-edit');
            else if (path === '/repo-files' && repoData) setCurrentView('repo-files');
            else if (path.startsWith('/repo/')) {
                const parts = path.split('/');
                const id = parts[2] ? parseInt(parts[2]) : null;

                if (id && !isNaN(id)) {
                    setActiveRepoId(id);
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
                // Default to trem-edit for / or /orchestrator or unknown
                if (path !== '/' && path !== '/trem-edit' && path !== '/orchestrator') {
                    window.history.replaceState({}, '', '/trem-edit');
                }
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
            case 'create-repo': url = '/create-repo'; break;
            case 'trem-create': url = '/trem-create'; break;
            case 'trem-edit': url = '/trem-edit'; break;
            case 'settings': url = '/settings'; break;
            case 'dashboard': url = '/trem-edit'; break; // Dashboard maps to TremEdit
            case 'repo':
                if (repoData?.id) url = `/repo/${repoData.id}`;
                break;
            case 'repo-files':
                if (repoData?.id) url = `/repo/${repoData.id}/files`;
                break;
            default:
                // Handle dynamic routes like repo/:id/logs
                if (typeof view === 'string') {
                    if (view.startsWith('repo/')) {
                        url = `/${view}`;
                    } else if (view.startsWith('create-repo/')) {
                        url = `/${view}`;
                        const id = view.split('/')[1];
                        setActiveJobId(id);
                        setCurrentView('create-repo');
                        return; // Early return as we set view manually
                    }
                }
                break;
        }

        if (window.location.pathname !== url) {
            window.history.pushState({}, '', url);
        }

        // Determine the actual view to set
        if (typeof view === 'string' && view.includes('/logs')) {
            setCurrentView('repo-logs');
        } else if (view !== currentView) {
            setCurrentView(view as ViewType);
        }
        setIsSidebarOpen(false);
    };

    const handleCreateRepo = (data: RepoData) => {
        setRepoData(data);
        const url = data.id ? `/repo/${data.id}` : '/trem-edit';
        window.history.pushState({}, '', url);
        setCurrentView('repo');
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
                return <CreateRepoView onNavigate={handleNavigate} onCreateRepo={handleCreateRepo} initialJobId={activeJobId} />;
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
