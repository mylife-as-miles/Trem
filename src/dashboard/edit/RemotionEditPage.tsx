import React, { useState } from 'react';
import TopNavigation from '../../components/layout/TopNavigation';
import { RepoData } from '../../utils/db';
import EditLandingView from './EditLandingView';
import EditWorkspaceView from './EditWorkspaceView';
import EditPlanningView from './EditPlanningView';
import { useTremStore } from '../../store/useTremStore';

interface RemotionEditProps {
    onNavigate: (view: 'timeline' | 'dashboard' | 'repo' | 'diff' | 'assets' | 'settings' | 'create-repo' | 'trem-create' | 'trem-edit') => void;
    onSelectRepo?: (repo: RepoData) => void;
}

type EditViewMode = 'landing' | 'workspace' | 'planning';

const RemotionEditPage: React.FC<RemotionEditProps> = ({ onNavigate, onSelectRepo }) => {
    const [viewMode, setViewMode] = useState<EditViewMode>('landing');
    const [selectedRepo, setSelectedRepo] = useState<RepoData | undefined>(undefined);
    const [selectedTemplate, setSelectedTemplate] = useState<string | undefined>(undefined);
    const [currentPrompt, setCurrentPrompt] = useState("");
    const setEditPlan = useTremStore((state) => state.setEditPlan);

    const handleSelectRepo = (repo: RepoData) => {
        setSelectedRepo(repo);
        setSelectedTemplate(undefined);
        setViewMode('workspace');
        // Do not call parent onSelectRepo to avoid auto-navigation to standard repo view
    };

    const handleSelectTemplate = (template: string) => {
        setSelectedTemplate(template);
        setSelectedRepo(undefined);
        setViewMode('workspace');
    };

    const handleBackToLanding = () => {
        setViewMode('landing');
        setSelectedRepo(undefined);
        setSelectedTemplate(undefined);
    };

    const handleGoToPlanning = (prompt: string) => {
        setCurrentPrompt(prompt);
        setViewMode('planning');
    };

    const handleApprovePlan = (plan: any) => {
        setEditPlan(plan);
        // Execute the plan -> Navigate to timeline
        onNavigate('timeline');
    };

    return (
        <div className="flex flex-col min-h-full relative bg-slate-50 dark:bg-background-dark transition-colors duration-300">
            {/* Top Navigation Header - Only on Landing */}
            {viewMode === 'landing' && <TopNavigation onNavigate={onNavigate} activeTab="edit" />}

            {/* Repo Header for Workspace/Planning */}
            {viewMode !== 'landing' && selectedRepo && (
                <div className="h-14 flex-shrink-0 flex items-center justify-between px-6 border-b border-slate-200 dark:border-border-dark bg-white/95 dark:bg-background-dark z-20">
                    <div className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white shadow-[0_0_15px_rgba(34,197,94,0.5)]">
                            <span className="material-icons-outlined text-lg">folder_open</span>
                        </div>
                        <nav className="flex items-center text-sm font-mono tracking-tight">
                            <span
                                className="text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer transition-colors"
                                onClick={handleBackToLanding}
                            >
                                {selectedRepo.name}
                            </span>
                            <span className="mx-2 text-slate-400 dark:text-gray-700">/</span>
                            <span className="text-slate-900 dark:text-white font-bold bg-slate-100 dark:bg-white/5 px-2 py-1 rounded border border-slate-200 dark:border-white/10">
                                {viewMode}
                            </span>
                        </nav>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleBackToLanding}
                            className="px-3 py-1.5 rounded-md border border-slate-200 dark:border-border-dark text-slate-500 hover:text-slate-900 dark:hover:text-white text-xs font-medium hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                        >
                            Back to Projects
                        </button>
                    </div>
                </div>
            )}

            {/* Main Content Area */}
            {viewMode === 'landing' ? (
                <EditLandingView
                    onSelectRepo={handleSelectRepo}
                    onSelectTemplate={handleSelectTemplate}
                    onNavigate={onNavigate}
                />
            ) : viewMode === 'planning' && selectedRepo ? (
                <div className="flex-1 overflow-hidden">
                    <EditPlanningView
                        prompt={currentPrompt}
                        repo={selectedRepo}
                        onApprove={handleApprovePlan}
                        onBack={() => setViewMode('workspace')}
                    />
                </div>
            ) : (
                <div className="flex-1 overflow-hidden">
                    <EditWorkspaceView
                        onNavigate={onNavigate}
                        onSelectRepo={handleSelectRepo}
                        onBack={handleBackToLanding}
                        initialRepo={selectedRepo}
                        templateMode={selectedTemplate}
                        onPlan={handleGoToPlanning}
                    />
                </div>
            )}
        </div>
    );

};

export default RemotionEditPage;
