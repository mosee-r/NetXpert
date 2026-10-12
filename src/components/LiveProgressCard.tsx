import React from 'react';
import { AssessmentProgress } from '../engines/orchestrator';
import { Loader2, XCircle, Gauge } from 'lucide-react';

interface LiveProgressCardProps {
  progress: AssessmentProgress;
  onCancel: () => void;
}

export const LiveProgressCard: React.FC<LiveProgressCardProps> = ({
  progress,
  onCancel,
}) => {
  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800/90 border border-cyan-500/40 rounded-2xl p-5 text-white shadow-2xl relative overflow-hidden mb-6">
      {/* Background glow accent */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

      <div className="flex items-center justify-between mb-3 relative z-10">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center border border-cyan-500/30 animate-pulse">
            <Loader2 className="w-5 h-5 animate-spin text-cyan-300" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center space-x-2">
              <span>Running Guided Diagnostic</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 font-mono">
                {progress.overallPercent}%
              </span>
            </h3>
            <p className="text-xs text-slate-300">{progress.stageName}</p>
          </div>
        </div>

        <button
          onClick={onCancel}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 border border-rose-800/80 text-rose-300 text-xs font-medium transition-all"
        >
          <XCircle className="w-3.5 h-3.5" />
          <span>Cancel Test</span>
        </button>
      </div>

      {/* Real-time Metric readout */}
      {progress.currentMetricLabel && progress.currentMetricValue && (
        <div className="flex items-baseline space-x-2 my-2 py-1.5 px-3 rounded-lg bg-slate-800/80 border border-slate-700/50 w-fit">
          <Gauge className="w-3.5 h-3.5 text-cyan-400 self-center" />
          <span className="text-xs text-slate-400 font-medium">
            {progress.currentMetricLabel}:
          </span>
          <span className="text-sm font-bold font-mono text-cyan-300">
            {progress.currentMetricValue}
          </span>
        </div>
      )}

      {/* Progress Bars */}
      <div className="mt-3 space-y-1.5 relative z-10">
        <div className="flex justify-between text-[11px] text-slate-400">
          <span>Overall Diagnostic Progress</span>
          <span className="font-mono">{progress.overallPercent}%</span>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden border border-slate-700/50">
          <div
            className="bg-gradient-to-r from-cyan-500 via-indigo-500 to-violet-500 h-full rounded-full transition-all duration-300"
            style={{ width: `${Math.max(4, progress.overallPercent)}%` }}
          />
        </div>
      </div>
    </div>
  );
};
