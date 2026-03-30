// Mocked JobMonitor using DO WebSockets
import React, { useEffect, useState } from 'react';
import { apiClient } from '../../api-client';

export const JobMonitor = ({ projectId }: { projectId: string }) => {
    const [progress, setProgress] = useState(0);
    const [logs, setLogs] = useState<string[]>([]);

    useEffect(() => {
        const ws = apiClient.connectWebSocket(projectId, (msg) => {
            if (msg.type === 'progress') {
                setProgress(msg.progress);
                if (msg.message) {
                    setLogs(prev => [...prev, msg.message]);
                }
            } else if (msg.type === 'job_completed') {
                setProgress(100);
                setLogs(prev => [...prev, 'Job Completed!']);
            }
        });

        return () => ws.close();
    }, [projectId]);

    return (
        <div style={{ background: '#000', color: '#0f0', padding: 20, fontFamily: 'monospace' }}>
            <h3>Pipeline Monitor: {progress}%</h3>
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {logs.map((l, i) => <div key={i}>{l}</div>)}
            </div>
        </div>
    );
};
