import React, { useState } from 'react';

interface SettingsViewProps {
    onNavigate?: (view: 'dashboard' | 'repo' | 'timeline' | 'diff' | 'assets' | 'settings') => void;
}

type SettingsTab = 'general' | 'workflow' | 'integrations' | 'api_keys';

const SettingsView: React.FC<SettingsViewProps> = ({ onNavigate }) => {
    const [activeTab, setActiveTab] = useState<SettingsTab>('general');
    const [notifications, setNotifications] = useState({
        email_updates: true,
        render_complete: true,
        ai_suggestions: true
    });

    const renderSidebarItem = (id: SettingsTab, label: string, icon: string, beta?: boolean) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`w-full text-left flex items-center gap-3 px-4 py-2.5 rounded-md transition-all duration-200 group ${activeTab === id
                ? 'bg-white/10 text-white font-medium'
                : 'text-slate-500 dark:text-gray-400 hover:bg-white/5 hover:text-white'
                }`}
        >
            <span className={`material-icons-outlined text-[20px] ${activeTab === id ? 'text-white' : 'text-slate-500 dark:text-gray-500 group-hover:text-gray-300'}`}>{icon}</span>
            <span className="text-sm tracking-wide">{label}</span>
            {beta && (
                <span className="ml-auto text-[10px] font-bold bg-primary/20 text-emerald-400 dark:text-primary px-1.5 py-0.5 rounded border border-primary/20 uppercase tracking-wider">Beta</span>
            )}
        </button>
    );

    return (
        <div className="flex flex-col h-full bg-background-dark text-slate-200 font-sans overflow-hidden">
            {/* Minimal Header */}
            <header className="h-14 flex-shrink-0 flex items-center px-6 border-b border-border-dark bg-background-dark">
                <button
                    onClick={() => onNavigate && onNavigate('dashboard')}
                    className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
                >
                    <span className="material-icons-outlined text-sm">arrow_back</span>
                    <span className="text-sm font-medium">Back to Studio</span>
                </button>
            </header>

            <div className="flex-1 flex overflow-hidden">
                {/* Minimal Dark Sidebar */}
                <aside className="w-64 flex-shrink-0 border-r border-border-dark bg-background-dark py-6 px-3 flex flex-col gap-1">
                    <div className="px-4 mb-6">
                        <span className="text-xs font-mono text-gray-500 uppercase tracking-widest">Settings</span>
                    </div>

                    {renderSidebarItem('general', 'General', 'tune')}
                    {renderSidebarItem('workflow', 'Workflow & AI', 'psychology')}
                    {renderSidebarItem('integrations', 'Integrations', 'hub', true)}
                    {renderSidebarItem('api_keys', 'API Keys', 'vpn_key')}

                    <div className="mt-auto px-4">
                        <div className="flex items-center gap-3 py-3 border-t border-border-dark">
                            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-black">
                                T
                            </div>
                            <div className="flex flex-col">
                                <span className="text-white text-sm font-medium">Trem Team</span>
                                <span className="text-gray-500 text-xs">Pro Workspace</span>
                            </div>
                        </div>
                    </div>
                </aside>

                {/* Main Content Area */}
                <main className="flex-1 overflow-y-auto bg-background-dark">
                    <div className="max-w-3xl mx-auto py-12 px-8">

                        {/* GENERAL TAB */}
                        {activeTab === 'general' && (
                            <div className="space-y-12 fade-in">
                                {/* Plan Banner */}
                                <section>
                                    <div className="flex items-start gap-4 mb-2">
                                        <span className="material-icons-outlined text-primary text-xl mt-0.5">verified</span>
                                        <h2 className="text-xl font-bold text-white">Plan: Trem Studio Pro</h2>
                                    </div>
                                    <div className="ml-9">
                                        <p className="text-gray-400 text-sm mb-4 leading-relaxed">
                                            You're on the Pro plan—built for high-throughput rendering and advanced AI context windows. Need even more GPU capacity? <a href="#" className="text-emerald-400 dark:text-primary hover:underline">Learn more about enterprise nodes.</a>
                                        </p>
                                        <div className="flex items-center gap-4">
                                            <button className="px-4 py-2 bg-primary hover:bg-primary_hover text-black text-sm font-bold rounded-md transition-all flex items-center gap-2">
                                                Upgrade Plan
                                                <span className="material-icons-outlined text-xs">arrow_forward</span>
                                            </button>
                                            <button className="text-sm text-gray-400 hover:text-white flex items-center gap-1 transition-colors">
                                                Manage subscription
                                                <span className="material-icons-outlined text-xs">open_in_new</span>
                                            </button>
                                        </div>
                                    </div>
                                </section>

                                {/* Video Cache Settings */}
                                <section>
                                    <div className="flex items-start gap-4 mb-2">
                                        <span className="material-icons-outlined text-gray-400 text-xl mt-0.5">cached</span>
                                        <h3 className="text-lg font-medium text-white">Cache & Proxies</h3>
                                    </div>
                                    <div className="ml-9 space-y-4">
                                        <p className="text-gray-400 text-sm">Manage how Trem handles local media caching and proxy generation.</p>

                                        <div className="p-4 rounded-lg border border-border-dark bg-surface-card flex items-center justify-between">
                                            <div>
                                                <div className="text-sm font-medium text-white">Auto-Generate Proxies</div>
                                                <div className="text-xs text-gray-500 mt-1">Automatically create 1080p ProRes proxies for ingest.</div>
                                            </div>
                                            <div className="relative inline-block w-10 h-6 align-middle select-none transition duration-200 ease-in">
                                                <input type="checkbox" name="toggle" id="proxy-toggle" className="toggle-checkbox absolute block w-4 h-4 rounded-full bg-white border-4 appearance-none cursor-pointer checked:right-0 checked:border-primary transition-all duration-200 right-4 top-1" defaultChecked />
                                                <label htmlFor="proxy-toggle" className="toggle-label block overflow-hidden h-6 rounded-full bg-gray-800 cursor-pointer border border-border-dark"></label>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                {/* Notifications */}
                                <section>
                                    <div className="flex items-start gap-4 mb-2">
                                        <span className="material-icons-outlined text-gray-400 text-xl mt-0.5">notifications_none</span>
                                        <h3 className="text-lg font-medium text-white">Notification settings</h3>
                                    </div>
                                    <div className="ml-9 space-y-3">
                                        <p className="text-gray-400 text-sm mb-2">Configure when you want to be alerted by the AI or system events.</p>

                                        {[
                                            { id: 'render', label: 'Notify me when a render completes', checked: notifications.render_complete },
                                            { id: 'ai', label: 'Notify me when AI has new edit suggestions', checked: notifications.ai_suggestions },
                                            { id: 'email', label: 'Receive weekly studio analytics digest', checked: notifications.email_updates },
                                        ].map((item) => (
                                            <label key={item.id} className="flex items-center gap-3 cursor-pointer group">
                                                <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${item.checked ? 'bg-primary border-primary' : 'border-gray-600 bg-transparent group-hover:border-gray-500'}`}>
                                                    {item.checked && <span className="material-icons-outlined text-white text-xs font-bold">check</span>}
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    className="hidden"
                                                    checked={item.checked}
                                                    onChange={() => setNotifications({ ...notifications, [item.id === 'render' ? 'render_complete' : item.id === 'ai' ? 'ai_suggestions' : 'email_updates']: !item.checked })}
                                                />
                                                <span className="text-sm text-gray-300 group-hover:text-white transition-colors">{item.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </section>
                            </div>
                        )}

                        {/* WORKFLOW TAB */}
                        {activeTab === 'workflow' && (
                            <div className="space-y-12 fade-in">
                                <section>
                                    <div className="flex items-start gap-4 mb-6">
                                        <span className="material-icons-outlined text-primary text-xl mt-0.5">psychology</span>
                                        <div>
                                            <h2 className="text-xl font-bold text-white">AI Model Settings</h2>
                                            <p className="text-gray-400 text-sm mt-1">Set your preferences for which model Trem should use for creative decisions.</p>
                                        </div>
                                    </div>

                                    <div className="ml-9">
                                        <div className="relative group max-w-sm">
                                            <select className="w-full bg-surface-card hover:bg-white/5 border border-border-dark rounded-lg px-4 py-2.5 text-sm text-white appearance-none cursor-pointer focus:ring-2 focus:ring-primary focus:border-transparent transition-colors">
                                                <option>Gemini 1.5 Pro (Multimodal) — Recommended</option>
                                                <option>GPT-4o (Reasoning)</option>
                                                <option>Claude 3.5 Sonnet (Creative)</option>
                                            </select>
                                            <span className="material-icons-outlined absolute right-3 top-2.5 text-gray-400 pointer-events-none">expand_more</span>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-2">Gemini 1.5 Pro allows for up to 2 million tokens, ideal for long format video analysis.</p>
                                    </div>
                                </section>

                                <section>
                                    <div className="flex items-start gap-4 mb-6">
                                        <span className="material-icons-outlined text-gray-400 text-xl mt-0.5">auto_fix_high</span>
                                        <div>
                                            <h2 className="text-xl font-bold text-white">Automated Post-Production</h2>
                                            <p className="text-gray-400 text-sm mt-1">Configure automated tasks that run after ingest.</p>
                                        </div>
                                    </div>

                                    <div className="ml-9 grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {[
                                            { title: 'Audio Cleanup', desc: 'Remove background noise & level voices', icon: 'mic' },
                                            { title: 'Color Match', desc: 'Match Log footage to Rec.709 target', icon: 'palette' },
                                            { title: 'Smart Cut', desc: 'Remove silence and bad takes', icon: 'content_cut' },
                                            { title: 'Captioning', desc: 'Generate subtitles automatically', icon: 'subtitles' },
                                        ].map((task, i) => (
                                            <div key={i} className="p-4 rounded-lg border border-border-dark bg-surface-card hover:bg-white/5 transition-colors cursor-pointer group">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="material-icons-outlined text-gray-400 group-hover:text-primary transition-colors">{task.icon}</span>
                                                    <div className="w-4 h-4 rounded border border-gray-600 group-hover:border-primary"></div>
                                                </div>
                                                <div className="font-medium text-white text-sm">{task.title}</div>
                                                <div className="text-xs text-gray-500 mt-1">{task.desc}</div>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            </div>
                        )}

                        {/* INTEGRATIONS TAB */}
                        {activeTab === 'integrations' && (
                            <div className="space-y-8 fade-in">
                                <div className="flex items-start gap-4">
                                    <span className="material-icons-outlined text-primary text-xl mt-0.5">hub</span>
                                    <div>
                                        <h2 className="text-xl font-bold text-white">Frame.io Integration</h2>
                                        <p className="text-gray-400 text-sm mt-1 leading-relaxed max-w-xl">
                                            Connect Frame.io to allow Trem to automatically pull comments and timestamped feedback directly into your timeline editor.
                                        </p>
                                    </div>
                                </div>

                                <div className="ml-9 space-y-6">
                                    <input
                                        type="password"
                                        placeholder="Paste your Frame.io Developer Token"
                                        className="w-full bg-surface-card border border-border-dark rounded-lg px-4 py-3 text-sm text-white placeholder-gray-600 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                                    />

                                    <div>
                                        <a href="#" className="text-sm text-emerald-400 dark:text-primary hover:text-emerald-300 dark:hover:text-primary_hover hover:underline mb-2 inline-block">Manage tokens in Frame.io Dashboard</a>

                                        <div className="bg-surface-card border border-border-dark rounded-lg p-5 mt-4">
                                            <h4 className="text-sm font-bold text-white mb-3">Quick Setup</h4>
                                            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-400">
                                                <li>Navigate to your <span className="text-white">Frame.io Developer Dashboard</span>.</li>
                                                <li>Create a new Token with <span className="font-mono text-xs bg-white/10 px-1 py-0.5 rounded">asset.read</span> and <span className="font-mono text-xs bg-white/10 px-1 py-0.5 rounded">comment.read</span> scopes.</li>
                                                <li>Copy the token string generated.</li>
                                                <li>Paste the token above and hit enter to validate.</li>
                                            </ol>
                                        </div>

                                        <div className="bg-primary/5 border border-primary/10 rounded-lg p-5 mt-4">
                                            <h4 className="text-sm font-bold text-amber-500 mb-2">Important</h4>
                                            <p className="text-sm text-gray-400">
                                                Ensure you have admin rights on the Frame.io project you wish to sync.
                                                Trem performs read-only operations by default unless 'Write Comments' is enabled.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* API KEYS TAB */}
                        {activeTab === 'api_keys' && (
                            <div className="space-y-8 fade-in">
                                <div className="flex items-center justify-between mb-8">
                                    <div className="flex items-start gap-4">
                                        <span className="material-icons-outlined text-primary text-xl mt-0.5">vpn_key</span>
                                        <div>
                                            <h2 className="text-xl font-bold text-white">API Keys</h2>
                                            <p className="text-gray-400 text-sm mt-1">Manage programmatic access to your Trem workspace.</p>
                                        </div>
                                    </div>
                                    <button className="px-4 py-2 bg-white text-black hover:bg-gray-200 text-sm font-bold rounded-md transition-colors shadow-lg">
                                        Create key
                                    </button>
                                </div>

                                <div className="ml-9">
                                    <div className="bg-primary/5 border border-primary/10 rounded-lg p-4 flex items-start gap-3 mb-8">
                                        <span className="material-icons-outlined text-primary text-lg mt-0.5">gpp_good</span>
                                        <div>
                                            <h4 className="text-sm font-bold text-white">Abuse auto-detection on</h4>
                                            <p className="text-xs text-gray-400 mt-1">
                                                For your protection, we automatically disable any API keys found to be publicly exposed in git repositories.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="border border-border-dark rounded-lg overflow-hidden">
                                        <table className="w-full text-left text-sm">
                                            <thead className="bg-white/5 text-gray-400 font-medium">
                                                <tr>
                                                    <th className="px-6 py-3 font-medium">Reference Name</th>
                                                    <th className="px-6 py-3 font-medium">Scopes</th>
                                                    <th className="px-6 py-3 font-medium">Last Used</th>
                                                    <th className="px-6 py-3 font-medium text-right">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border-dark bg-surface-card">
                                                <tr className="group hover:bg-white/[0.02] transition-colors">
                                                    <td className="px-6 py-4 text-white font-mono">render-node-01</td>
                                                    <td className="px-6 py-4">
                                                        <span className="px-2 py-0.5 rounded-full bg-primary/10 text-emerald-400 dark:text-emerald-300 text-xs border border-primary/20">pipelines.read</span>
                                                    </td>
                                                    <td className="px-6 py-4 text-gray-500">2 mins ago</td>
                                                    <td className="px-6 py-4 text-right">
                                                        <button className="text-gray-500 hover:text-white transition-colors">Revoke</button>
                                                    </td>
                                                </tr>
                                                <tr className="group hover:bg-white/[0.02] transition-colors">
                                                    <td className="px-6 py-4 text-white font-mono">dev-laptop-local</td>
                                                    <td className="px-6 py-4">
                                                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs border border-emerald-500/20">full_access</span>
                                                    </td>
                                                    <td className="px-6 py-4 text-gray-500">5 days ago</td>
                                                    <td className="px-6 py-4 text-right">
                                                        <button className="text-gray-500 hover:text-white transition-colors">Revoke</button>
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                        <div className="px-6 py-4 bg-white/[0.02] border-t border-border-dark text-center text-xs text-gray-500">
                                            No more keys to display
                                        </div>
                                    </div>

                                    <p className="text-xs text-gray-500 mt-4">
                                        Remember to use your API keys securely. Don't share or embed them in public code.
                                        <a href="#" className="text-emerald-400 dark:text-primary hover:underline ml-1">Read best practices</a>.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </main>
            </div>

            <style>{`
                .toggle-checkbox:checked {
                    right: 0;
                    border-color: #a855f7;
                }
                .toggle-checkbox:checked + .toggle-label {
                    background-color: #a855f7;
                }
                .toggle-checkbox {
                    right: 0;
                    z-index: 10;
                }
                .toggle-label {
                    width: 2.5rem;
                }
                .fade-in {
                    animation: fadeIn 0.3s ease-out forwards;
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(5px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
};

export default SettingsView;
