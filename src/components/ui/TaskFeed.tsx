import React from 'react';

const TaskFeed: React.FC = () => {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-display font-bold text-slate-800 dark:text-white">Agent Tasks</h2>
        <button className="text-xs text-blue-500 font-mono hover:text-white transition-colors hover:underline">VIEW ALL LOGS</button>
      </div>
      <div className="space-y-3">
        {/* Processing Task */}
        <div className="glass-panel rounded-lg p-4 flex items-center justify-between group hover:border-primary/40 transition-colors">
          <div className="flex items-center gap-4">
            <div className="p-2 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20">
              <span className="material-icons-outlined">auto_fix_high</span>
            </div>
            <div>
              <div className="text-sm font-bold text-slate-800 dark:text-white">Highlight Extraction</div>
              <div className="text-xs text-slate-500 dark:text-gray-400 font-mono mt-0.5">repo: interview-series-b • 12m ago</div>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="hidden md:flex flex-col items-end w-32">
              <div className="text-[10px] font-mono text-blue-500 mb-1 animate-pulse">PROCESSING</div>
              <div className="w-full h-1 bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-primary w-2/3 rounded-full shadow-[0_0_8px_rgba(168,85,247,0.8)]"></div>
              </div>
            </div>
            <button className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-white">
              <span className="material-icons-outlined">more_horiz</span>
            </button>
          </div>
        </div>

        {/* Completed Task */}
        <div className="glass-panel rounded-lg p-4 flex items-center justify-between group hover:border-primary/40 transition-colors">
          <div className="flex items-center gap-4">
            <div className="p-2 rounded bg-primary/10 text-primary border border-primary/20">
              <span className="material-icons-outlined">subtitles</span>
            </div>
            <div>
              <div className="text-sm font-bold text-slate-800 dark:text-white">Subtitle Generation (En)</div>
              <div className="text-xs text-slate-500 dark:text-gray-400 font-mono mt-0.5">repo: campaign-q1-raw • 45m ago</div>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="px-2 py-1 rounded bg-blue-500/10 border border-blue-500/20 text-blue-500 text-[10px] font-mono tracking-wide">
              COMPLETED
            </div>
            <button className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-white">
              <span className="material-icons-outlined">download</span>
            </button>
          </div>
        </div>

        {/* Failed Task */}
        <div className="glass-panel rounded-lg p-4 flex items-center justify-between group hover:border-primary/40 transition-colors">
          <div className="flex items-center gap-4">
            <div className="p-2 rounded bg-red-500/10 text-red-400 border border-red-500/20">
              <span className="material-icons-outlined">warning_amber</span>
            </div>
            <div>
              <div className="text-sm font-bold text-slate-800 dark:text-white">Metadata Analysis Error</div>
              <div className="text-xs text-slate-500 dark:text-gray-400 font-mono mt-0.5">repo: test-footage-alpha • 2h ago</div>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="px-2 py-1 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-mono tracking-wide shadow-[0_0_5px_rgba(248,113,113,0.2)]">
              FAILED
            </div>
            <button className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-white">
              <span className="material-icons-outlined">restart_alt</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskFeed;