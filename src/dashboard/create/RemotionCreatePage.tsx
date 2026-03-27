import React, { useState } from 'react';
import TopNavigation from '../../components/layout/TopNavigation';
import { RepoData } from '../../utils/db';
import CreateLandingView from './CreateLandingView';
import CreateWorkspaceView from './CreateWorkspaceView';

interface TremCreateProps {
    onNavigate: (view: 'timeline' | 'dashboard' | 'repo' | 'diff' | 'assets' | 'settings' | 'create-repo' | 'trem-create' | 'trem-edit') => void;
    onSelectRepo?: (repo: RepoData) => void;
}

type CreateViewMode = 'landing' | 'workspace';

const TremCreate: React.FC<TremCreateProps> = ({ onNavigate, onSelectRepo }) => {
    const [viewMode, setViewMode] = useState<CreateViewMode>('landing');
    const [selectedTemplate, setSelectedTemplate] = useState<string | undefined>(undefined);

    const handleSelectTemplate = (template: string) => {
        setSelectedTemplate(template);
        setViewMode('workspace');
    };

    const handleBackToLanding = () => {
        setViewMode('landing');
        setSelectedTemplate(undefined);
    };

    return (
        <div className="flex flex-col min-h-full relative bg-slate-50 dark:bg-background-dark transition-colors duration-300">
            {/* Top Navigation Header */}
            <TopNavigation onNavigate={onNavigate} activeTab="create" />

            {/* Main Content Area */}
            {viewMode === 'landing' ? (
                <CreateLandingView
                    onSelectTemplate={handleSelectTemplate}
                    onSelectRepo={(repo) => {
                        if (onSelectRepo) {
                            onSelectRepo(repo);
                        } else {
                            // Fallback behavior if no handler is provided, maybe navigate to repo view
                            onNavigate('repo');
                        }
                    }}
                />
            ) : (
                <div className="flex-1 p-6 md:p-10">
                    <CreateWorkspaceView
                        onNavigate={onNavigate}
                        onSelectRepo={onSelectRepo}
                        templateMode={selectedTemplate}
                        onBack={handleBackToLanding}
                        initialPrompt={selectedTemplate && selectedTemplate !== 'From scratch' ? `Create a ${selectedTemplate.toLowerCase()} video...` : ""}
                    />
                </div>
            )}
        </div>
    );
};

export default TremCreate;
