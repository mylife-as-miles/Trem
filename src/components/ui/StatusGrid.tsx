import React from 'react';

const StatusGrid: React.FC = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* CPU Card */}
      <div className="bg-slate-50 dark:bg-black border border-slate-200 dark:border-white/10 rounded-xl p-4 flex flex-col justify-between h-32 relative overflow-hidden group hover:border-primary/40 transition-colors">
        <div className="absolute right-0 top-0 p-3 opacity-20 group-hover:opacity-40 transition-opacity">
          <span className="material-icons-outlined text-4xl text-blue-500">memory</span>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <div className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-widest text-blue-500 font-bold">cpu_ingest</span>
        </div>
        <div>
          <div className="text-2xl font-mono text-slate-800 dark:text-white font-bold">84<span className="text-sm text-slate-500 dark:text-gray-500 font-normal">%</span></div>
          <div className="text-xs text-slate-500 dark:text-gray-400 mt-1 font-mono">Process: FFMPEG_TRANSCODE</div>
        </div>
        <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-transparent opacity-50"></div>
      </div>

      {/* GPU Card */}
      <div className="bg-slate-50 dark:bg-black border border-slate-200 dark:border-white/10 rounded-xl p-4 flex flex-col justify-between h-32 relative overflow-hidden group hover:border-emerald-400/40 transition-colors">
        <div className="absolute right-0 top-0 p-3 opacity-20 group-hover:opacity-40 transition-opacity">
          <span className="material-icons-outlined text-4xl text-emerald-400">smart_toy</span>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <div className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-widest text-emerald-400 font-bold">gpu_edit_cluster</span>
        </div>
        <div>
          <div className="text-2xl font-mono text-slate-800 dark:text-white font-bold">92<span className="text-sm text-slate-500 dark:text-gray-500 font-normal">%</span></div>
          <div className="text-xs text-slate-500 dark:text-gray-400 mt-1 font-mono">Job: SCENE_DETECT_V3</div>
        </div>
        <div className="absolute bottom-0 left-0 w-3/4 h-1 bg-gradient-to-r from-emerald-400 to-transparent opacity-50"></div>
      </div>

      {/* Uplink Card */}
      <div className="bg-slate-50 dark:bg-black border border-slate-200 dark:border-white/10 rounded-xl p-4 flex flex-col justify-between h-32 relative overflow-hidden group">
        <div className="absolute right-0 top-0 p-3 opacity-20 group-hover:opacity-40 transition-opacity">
          <span className="material-icons-outlined text-4xl text-slate-500">cloud_upload</span>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <div className="h-2 w-2 rounded-full bg-slate-500 dark:bg-gray-600"></div>
          <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500 dark:text-gray-400 font-bold">cdn_uplink</span>
        </div>
        <div>
          <div className="text-2xl font-mono text-slate-800 dark:text-gray-300 font-normal">IDLE</div>
          <div className="text-xs text-slate-500 dark:text-gray-500 mt-1 font-mono">Waiting for queue...</div>
        </div>
      </div>
    </div>
  );
};

export default StatusGrid;