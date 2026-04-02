import re

with open('/app/src/dashboard/edit/EditPlanningView.tsx', 'r') as f:
    content = f.read()

# Add apiClient import
if "import { apiClient }" not in content:
    content = content.replace("import { RepoData } from '../../utils/db';", "import { RepoData } from '../../utils/db';\nimport { apiClient } from '../../api-client';")

# Replace mock constants
content = re.sub(
    r'const MOCK_NARRATIVE = \[.*?\];',
    '',
    content,
    flags=re.DOTALL
)

# Modify component state and useEffect
new_state_and_effects = """
    const [status, setStatus] = useState<'analyzing' | 'ready' | 'failed'>('analyzing');
    const [chatInput, setChatInput] = useState("");
    const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'agent', text: string, metadata?: string }[]>([
        { role: 'user', text: prompt }
    ]);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Backend State
    const [planData, setPlanData] = useState<any>(null);
    const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);

    // Initial Plan Generation
    useEffect(() => {
        let isSubscribed = true;
        let pollInterval: NodeJS.Timeout;

        const startPlanning = async () => {
            try {
                // 1. Trigger the workflow
                const response = await apiClient.generatePlan(repo.id, prompt);
                if (isSubscribed) {
                    setCurrentPlanId(response.planId);
                }

                // 2. Poll for status
                pollInterval = setInterval(async () => {
                    try {
                        const statusRes = await apiClient.getPlanStatus(repo.id, response.planId);

                        if (statusRes.status === 'ready' || statusRes.status === 'completed') {
                            clearInterval(pollInterval);
                            if (isSubscribed) {
                                setPlanData(statusRes);
                                setStatus('ready');
                                setChatMessages(prev => [
                                    ...prev,
                                    {
                                        role: 'agent',
                                        text: `I've analyzed the creative brief and raw media. Here is my proposed edit strategy for "${repo.name}".`,
                                        metadata: "Analysis complete • Workflow generated"
                                    }
                                ]);
                            }
                        } else if (statusRes.status === 'failed') {
                            clearInterval(pollInterval);
                            if (isSubscribed) {
                                setStatus('failed');
                                setChatMessages(prev => [
                                    ...prev,
                                    {
                                        role: 'agent',
                                        text: `Failed to generate a plan. Please try again.`,
                                        metadata: "Error during workflow execution"
                                    }
                                ]);
                            }
                        }
                    } catch (pollErr) {
                        console.error("Polling error", pollErr);
                    }
                }, 2000);

            } catch (err) {
                console.error("Failed to start planning workflow", err);
                if (isSubscribed) {
                    setStatus('failed');
                }
            }
        };

        startPlanning();

        return () => {
            isSubscribed = false;
            if (pollInterval) clearInterval(pollInterval);
        };
    }, [repo.id, prompt]);
"""

# Replace existing states and analyze useEffect
content = re.sub(
    r'const \[status, setStatus\].*?// Auto-scroll chat',
    new_state_and_effects + '\n    // Auto-scroll chat',
    content,
    flags=re.DOTALL
)

# Update handleSendMessage
new_handle_send = """
    const handleSendMessage = async () => {
        if (!chatInput.trim()) return;
        const newPrompt = chatInput;
        setChatMessages(prev => [...prev, { role: 'user', text: newPrompt }]);
        setChatInput("");
        setStatus('analyzing');

        try {
            const response = await apiClient.generatePlan(repo.id, newPrompt);
            setCurrentPlanId(response.planId);

            // Poll for the new plan
            const pollInterval = setInterval(async () => {
                try {
                    const statusRes = await apiClient.getPlanStatus(repo.id, response.planId);
                    if (statusRes.status === 'ready' || statusRes.status === 'completed') {
                        clearInterval(pollInterval);
                        setPlanData(statusRes);
                        setStatus('ready');
                        setChatMessages(prev => [
                            ...prev,
                            { role: 'agent', text: "Strategy updated based on your feedback." }
                        ]);
                    } else if (statusRes.status === 'failed') {
                        clearInterval(pollInterval);
                        setStatus('failed');
                        setChatMessages(prev => [
                            ...prev,
                            { role: 'agent', text: "Failed to update strategy." }
                        ]);
                    }
                } catch (e) {
                     console.error(e);
                }
            }, 2000);
        } catch (e) {
            console.error(e);
            setStatus('failed');
        }
    };
"""

content = re.sub(
    r'const handleSendMessage = \(\) => \{.*?^\s*};\s*$',
    new_handle_send,
    content,
    flags=re.DOTALL | re.MULTILINE
)

# Replace MOCK_NARRATIVE usage
content = re.sub(
    r'\{MOCK_NARRATIVE\.map\(\(item, i\) => \(.*?\}\)\}',
    r"""{planData?.strategy ? planData.strategy.map((item: any, i: number) => (
                                        <li key={i} className="flex items-start gap-3">
                                            <span className="material-icons-outlined text-primary mt-0.5 text-sm">{item.icon || 'bolt'}</span>
                                            <div>
                                                <p className="text-slate-200 text-sm font-medium">{item.title}</p>
                                                <p className="text-slate-500 text-xs mt-1">{item.details}</p>
                                            </div>
                                        </li>
                                    )) : (
                                        <div className="flex items-center justify-center p-4">
                                            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                                        </div>
                                    )}""",
    content,
    flags=re.DOTALL
)

# Replace Agent Assignments mock
content = re.sub(
    r'\{\[\s*\{\s*icon:\s*\'memory\'.*?\].map\(\(agent, i\) => \(.*?\}\)\}',
    r"""{(planData?.agents || []).map((agent: any, i: number) => (
                                    <div key={i} className={`bg-white/[0.02] backdrop-blur-md border border-white/5 rounded-xl p-4 flex items-center gap-4 border-l-2 ${agent.color || 'border-primary'}`}>
                                        <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
                                            <span className="material-icons-outlined text-primary/70">{agent.icon || 'smart_toy'}</span>
                                        </div>
                                        <div>
                                            <h4 className="text-slate-200 text-sm font-bold font-display">{agent.name || agent.title}</h4>
                                            <p className="text-slate-500 text-xs font-mono">{agent.role || agent.id}</p>
                                        </div>
                                    </div>
                                ))}
                                {(!planData?.agents || planData.agents.length === 0) && (
                                    <div className="col-span-2 text-center p-4 text-slate-500 font-mono text-xs">
                                        {status === 'analyzing' ? 'Selecting agents...' : 'No agents selected.'}
                                    </div>
                                )}""",
    content,
    flags=re.DOTALL
)

# Replace OTIO JSON mock
content = re.sub(
    r'<pre><code>\{`\{.*?\"\}`\}<\/code><\/pre>',
    r'<pre><code>{planData?.otioDraft ? JSON.stringify(planData.otioDraft, null, 2) : "Generating OpenTimelineIO..."}</code></pre>',
    content,
    flags=re.DOTALL
)

# Update right panel status
content = content.replace(
    '<div className="px-3 py-1 rounded bg-primary/10 border border-primary/20 text-primary text-xs font-mono">\n                                Status: Ready for Review\n                            </div>',
    '<div className="px-3 py-1 rounded bg-primary/10 border border-primary/20 text-primary text-xs font-mono">\n                                Status: {status === \'ready\' ? \'Ready for Review\' : (status === \'failed\' ? \'Failed\' : \'Analyzing...\')}\n                            </div>'
)

# Finally update the Auto-Execute / Approve buttons to use the real plan data
content = content.replace(
    '<button className="px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg text-xs font-bold tracking-wider font-display flex items-center gap-2 transition-colors">',
    '<button disabled={status !== \'ready\'} className="px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg text-xs font-bold tracking-wider font-display flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">'
)

content = content.replace(
    '<button onClick={() => onApprove({})} className="px-4 py-2 bg-primary hover:bg-emerald-400 text-black rounded-lg text-xs font-bold tracking-wider font-display flex items-center gap-2 transition-colors shadow-[0_0_15px_rgba(34,197,94,0.3)]">',
    '<button disabled={status !== \'ready\'} onClick={() => onApprove(planData)} className="px-4 py-2 bg-primary hover:bg-emerald-400 text-black rounded-lg text-xs font-bold tracking-wider font-display flex items-center gap-2 transition-colors shadow-[0_0_15px_rgba(34,197,94,0.3)] disabled:opacity-50 disabled:cursor-not-allowed">'
)

with open('/app/src/dashboard/edit/EditPlanningView.tsx', 'w') as f:
    f.write(content)
