import React, { useState, useEffect, useRef } from 'react';
import { RepoData } from '../../utils/db';

interface EditPlanningViewProps {
    prompt: string;
    repo: RepoData;
    onApprove: (finalPlan: any) => void;
    onBack: () => void;
}

interface PlanItem {
    id: string;
    description: string;
    type: 'cut' | 'effect' | 'text' | 'audio';
    status: 'pending' | 'approved' | 'rejected';
}

const MOCK_NARRATIVE = [
    { icon: 'bolt', title: 'Establish pace with high-energy sprint', details: "Selection: Clips tagged 'running', 'sprinting' > 0.8" },
    { icon: 'graphic_eq', title: 'Sync brand reveal to audio drop at 00:15', details: 'Timing: Frame precise cut at beat index 42' },
    { icon: 'filter_vintage', title: "Apply 'Urban Night' color grade", details: 'Look: High contrast, cool shadows, neon highlights' },
];

const EditPlanningView: React.FC<EditPlanningViewProps> = ({ prompt, repo, onApprove, onBack }) => {
    const [status, setStatus] = useState<'analyzing' | 'ready'>('analyzing');
    const [chatInput, setChatInput] = useState("");
    const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'agent', text: string, metadata?: string }[]>([
        { role: 'user', text: prompt }
    ]);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Simulate Analysis Phase
    useEffect(() => {
        const analyze = async () => {
            await new Promise(r => setTimeout(r, 2000));
            setChatMessages(prev => [
                ...prev,
                {
                    role: 'agent',
                    text: `I've analyzed the creative brief and raw media. Here is my proposed edit strategy for "${repo.name}".`,
                    metadata: "Analyzing 24 clips • detecting BPM: 128 • Identifying high-motion segments..."
                }
            ]);
            setStatus('ready');
        };
        analyze();
    }, [repo.name]);

    // Auto-scroll chat
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages]);

    const handleSendMessage = () => {
        if (!chatInput.trim()) return;
        setChatMessages(prev => [...prev, { role: 'user', text: chatInput }]);
        setChatInput("");
        setTimeout(() => {
            setChatMessages(prev => [...prev, { role: 'agent', text: "Strategy updated based on your feedback." }]);
        }, 1000);
    };

    return (
        <div className="flex flex-col h-full bg-background-dark text-slate-200 font-sans overflow-hidden">

            {/* Header */}
            <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 border-b border-white/5 bg-background-dark/95 backdrop-blur-sm z-30">
                <div className="flex items-center gap-4">
                    <nav className="flex items-center gap-2 text-slate-400">
                        <span className="material-icons-outlined text-lg">movie</span>
                        <span className="text-sm font-mono hover:text-white cursor-pointer transition-colors">{repo.name}</span>
                        <span className="text-slate-600">/</span>
                        <span className="text-white font-medium font-mono text-base tracking-tight hover:underline cursor-pointer">Edit Planning</span>
                    </nav>
                    <div className="h-4 w-px bg-white/10 mx-2"></div>
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-slate-500">Session ID</span>
                        <span className="text-slate-300 font-mono text-xs">#TRM-{Math.floor(Math.random() * 10000)}</span>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => onApprove({ title: 'Auto-Edit V1', tasks: [] })}
                        className="px-4 py-2 rounded-md border border-primary/40 hover:border-primary/80 hover:bg-primary/5 text-primary transition-colors text-xs font-bold tracking-wide uppercase font-display flex items-center gap-2"
                    >
                        <span className="material-icons-outlined text-sm">smart_toy</span>
                        Auto-Execute
                    </button>
                    <button
                        onClick={() => onApprove({ title: 'Strategic Edit', tasks: MOCK_NARRATIVE })}
                        className="px-4 py-2 rounded-md bg-primary hover:bg-emerald-400 text-black text-xs font-bold shadow-[0_0_15px_rgba(34,197,94,0.4)] transition-all tracking-wide uppercase flex items-center gap-2 font-display"
                    >
                        <span className="material-icons-outlined text-sm">done_all</span>
                        Approve & Execute
                    </button>
                </div>
            </header>

            <div className="flex-1 flex min-h-0 overflow-hidden">

                {/* Left Panel: Chat */}
                <div className="w-1/2 flex flex-col border-r border-white/10 bg-black relative">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent opacity-30 pointer-events-none"></div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar pb-40">
                        {chatMessages.map((msg, idx) => (
                            <div key={idx} className={`flex gap-4 max-w-[90%] ${msg.role === 'user' ? 'ml-auto flex-row-reverse text-right' : ''}`}>
                                {msg.role === 'agent' && (
                                    <div className="flex-shrink-0">
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary to-emerald-900 flex items-center justify-center shadow-lg mt-1">
                                            <span className="material-icons-outlined text-black text-lg">smart_toy</span>
                                        </div>
                                    </div>
                                )}

                                <div className={`flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                    <div className={`px-6 py-4 rounded-2xl text-sm leading-relaxed font-light ${msg.role === 'agent'
                                        ? 'rounded-tl-sm bg-white/5 border border-white/10 text-slate-100'
                                        : 'rounded-tr-sm bg-white/10 border border-white/10 text-slate-200'
                                        }`}>
                                        <p className="mb-2">{msg.text}</p>
                                        {msg.metadata && (
                                            <p className="text-slate-400 text-xs font-mono mt-2 pt-2 border-t border-white/10">
                                                {msg.metadata}
                                            </p>
                                        )}
                                    </div>
                                    {msg.role === 'agent' && idx === chatMessages.length - 1 && (
                                        <div className="flex gap-2 mt-1">
                                            {['Make it faster', 'Focus on product shots'].map((chip) => (
                                                <button key={chip} onClick={() => setChatInput(chip)} className="px-3 py-1.5 rounded-full border border-white/10 hover:border-primary/50 bg-white/5 hover:bg-primary/10 text-xs text-slate-300 transition-colors">
                                                    {chip}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    <span className="text-[10px] font-mono text-slate-600">
                                        {msg.role === 'user' ? 'User' : 'Trem Agent'} • {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Area */}
                    <div className="absolute bottom-0 left-0 right-0 p-6 pt-10 bg-gradient-to-t from-black via-black to-transparent z-10 w-full">
                        <div className="relative group">
                            <div className="absolute inset-0 bg-primary/20 rounded-xl blur-sm group-focus-within:bg-primary/30 transition-all"></div>
                            <div className="relative bg-surface-card border border-white/10 rounded-xl overflow-hidden shadow-2xl flex flex-col">
                                <textarea
                                    className="w-full bg-transparent border-0 text-sm text-slate-200 placeholder-slate-500 focus:ring-0 resize-none p-4 h-24 font-mono leading-relaxed outline-none"
                                    placeholder="Refine the plan or give new instructions..."
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
                                />
                                <div className="flex justify-between items-center px-3 py-2 border-t border-white/5 bg-white/5">
                                    <div className="flex gap-2">
                                        <button className="p-1.5 text-slate-500 hover:text-white transition-colors rounded hover:bg-white/10">
                                            <span className="material-icons-outlined text-lg">attach_file</span>
                                        </button>
                                        <button className="p-1.5 text-slate-500 hover:text-white transition-colors rounded hover:bg-white/10">
                                            <span className="material-icons-outlined text-lg">mic</span>
                                        </button>
                                    </div>
                                    <button
                                        onClick={handleSendMessage}
                                        disabled={!chatInput.trim()}
                                        className="bg-primary hover:bg-emerald-400 text-black p-2 rounded-lg transition-colors shadow-lg"
                                    >
                                        <span className="material-icons-outlined text-lg">arrow_upward</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Panel: Strategy */}
                <div className="w-1/2 bg-surface-card/50 flex flex-col overflow-hidden relative">
                    <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>

                    <div className="p-6 h-full overflow-y-auto custom-scrollbar">
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h2 className="font-display font-bold text-2xl text-white tracking-tight flex items-center gap-3">
                                    <span className="material-icons-outlined text-primary text-3xl">psychology</span>
                                    Agent Strategy
                                </h2>
                                <p className="text-slate-500 text-sm mt-1 font-mono">Proposed workflow v1.0</p>
                            </div>
                            <div className="px-3 py-1 rounded bg-primary/10 border border-primary/20 text-primary text-xs font-mono">
                                Status: Ready for Review
                            </div>
                        </div>

                        {/* Core Narrative */}
                        <div className="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                            <h3 className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                                Core Narrative
                            </h3>
                            <div className="bg-white/[0.02] backdrop-blur-md border border-primary/10 rounded-xl p-6 relative group hover:border-primary/30 transition-all">
                                <ul className="space-y-4">
                                    {MOCK_NARRATIVE.map((item, i) => (
                                        <li key={i} className="flex items-start gap-3">
                                            <span className="material-icons-outlined text-primary mt-0.5 text-sm">{item.icon}</span>
                                            <div>
                                                <p className="text-slate-200 text-sm font-medium">{item.title}</p>
                                                <p className="text-slate-500 text-xs mt-1">{item.details}</p>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>

                        {/* Agent Assignments */}
                        <div className="mb-8">
                            <h3 className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                                Agent Assignments
                            </h3>
                            <div className="grid grid-cols-2 gap-4">
                                {[
                                    { icon: 'memory', title: 'Video Cutter', id: 'cpu_edit_worker_01', color: 'border-primary' },
                                    { icon: 'lightbulb', title: 'Creative Director', id: 'llm_light_v4', color: 'border-emerald-500/50' },
                                    { icon: 'palette', title: 'Colorist', id: 'gpu_grade_node', color: 'border-emerald-500/30' },
                                    { icon: 'volume_up', title: 'Audio Engineer', id: 'audio_sync_bot', color: 'border-emerald-500/30' }
                                ].map((agent, i) => (
                                    <div key={i} className={`bg-white/[0.02] backdrop-blur-md border border-white/5 rounded-xl p-4 flex items-center gap-4 border-l-2 ${agent.color}`}>
                                        <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
                                            <span className="material-icons-outlined text-primary/70">{agent.icon}</span>
                                        </div>
                                        <div>
                                            <h4 className="text-slate-200 text-sm font-bold font-display">{agent.title}</h4>
                                            <p className="text-slate-500 text-xs font-mono">{agent.id}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Code Preview */}
                        <div className="mb-4">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-xs font-mono text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                                    Instruction Preview (OTIO)
                                </h3>
                                <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded text-slate-400 font-mono">JSON</span>
                            </div>
                            <div className="bg-[#050505] border border-white/10 rounded-xl p-4 font-mono text-xs text-slate-400 overflow-x-auto">
                                <pre><code>{`{
  "OTIO_SCHEMA": "OpenTimelineIO.v1",
  "tracks": [
    {
      "name": "Video Track 1",
      "kind": "Video",
      "children": [
        {
          "name": "Clip_001_Run",
          "source_range": {
            "start_time": "00:00:04:12",
            "duration": "00:00:02:00"
          },
          "effects": ["SpeedRamp:2.0x"]
        },
        {
           `} <span className="text-primary">"// Sync point: Drop @ 15s"</span> {`
           "name": "Clip_042_Logo",
           "transition": "Flash_White" 
        }
      ]
    }
  ]
}`}</code></pre>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EditPlanningView;
