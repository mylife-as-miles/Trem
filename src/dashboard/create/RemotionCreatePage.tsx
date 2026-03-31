import React from 'react';
import TopNavigation from '../../components/layout/TopNavigation';
import CreateComingSoonGate from './components/CreateComingSoonGate';

interface TremCreateProps {
    onNavigate: (view: 'timeline' | 'dashboard' | 'repo' | 'diff' | 'assets' | 'settings' | 'create-repo' | 'trem-create' | 'trem-edit') => void;
    onSelectRepo?: unknown;
}

const TremCreate: React.FC<TremCreateProps> = ({ onNavigate }) => {
    return (
        <div className="flex flex-col min-h-full relative bg-slate-50 dark:bg-background-dark transition-colors duration-300">
            {/* Top Navigation Header */}
            <TopNavigation onNavigate={onNavigate} activeTab="create" />

            <CreateComingSoonGate onNavigate={onNavigate} />
        </div>
    );
};

export default TremCreate;
