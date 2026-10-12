import React from 'react';
import { OverallAssessmentReport } from '../types/scoring';
import {
  Gauge,
  Activity,
  Layers,
  Cpu,
  ShieldAlert,
  Server,
  Clock,
  HardDriveDownload,
  Upload,
} from 'lucide-react';

interface DetailedTestBreakdownProps {
  report: OverallAssessmentReport;
}

export const DetailedTestBreakdown: React.FC<DetailedTestBreakdownProps> = ({
  report,
}) => {
  const { rawMeasurements, networkInfo, dataTransferredMb } = report;
  const { idleLatency, downloadThroughput, uploadThroughput, loadedLatency, dnsTiming } =
    rawMeasurements;

  const baseMs = loadedLatency.baselineLatencyMs ?? idleLatency.medianMs ?? 0;
  const loadedMs = loadedLatency.underLoadLatencyMs ?? (baseMs + (loadedLatency.loadedDeltaMs ?? 0));
  const deltaMs = loadedLatency.loadedDeltaMs ?? Math.max(0, loadedMs - baseMs);

  // Grade color
  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'A+':
      case 'A':
        return 'text-emerald-400 bg-emerald-950/60 border-emerald-500/40';
      case 'B':
        return 'text-cyan-400 bg-cyan-950/60 border-cyan-500/40';
      case 'C':
        return 'text-amber-400 bg-amber-950/60 border-amber-500/40';
      case 'D':
      case 'F':
        return 'text-rose-400 bg-rose-950/60 border-rose-500/40';
      default:
        return 'text-slate-400 bg-slate-800 border-slate-700';
    }
  };

  return (
    <div className="space-y-4 my-6">
      <div className="flex items-center space-x-2 text-cyan-400">
        <Cpu className="w-5 h-5" />
        <h3 className="text-sm sm:text-base font-bold text-white uppercase tracking-wider">
          Diagnostic Telemetry & Bufferbloat Histogram
        </h3>
      </div>

      {/* 1. Bufferbloat & Loaded Latency Delta Card */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#0E1A2E] border border-white/10 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-amber-400">
            <Gauge className="w-4 h-4" />
            <h4 className="text-xs sm:text-sm font-semibold text-white">
              Bufferbloat & Router Queue Health
            </h4>
          </div>
          <span
            className={`text-xs font-mono font-bold px-2.5 py-1 rounded-full border ${getGradeColor(
              loadedLatency.bufferbloatGrade
            )}`}
          >
            Grade {loadedLatency.bufferbloatGrade}
          </span>
        </div>

        {/* Latency Comparison Histogram Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-mono">
            <span className="text-slate-400">Idle Ping: <strong className="text-white">{baseMs} ms</strong></span>
            <span className="text-amber-400">Ping Under Load: <strong className="text-white">{loadedMs} ms</strong> (+{deltaMs} ms)</span>
          </div>

          <div className="h-4 bg-slate-900 rounded-full overflow-hidden flex border border-white/5">
            {/* Baseline portion */}
            <div
              style={{ width: `${Math.min(100, Math.max(15, (baseMs / (loadedMs || 1)) * 100))}%` }}
              className="bg-indigo-500 h-full flex items-center justify-center text-[9px] font-mono text-white"
            >
              Idle
            </div>
            {/* Loaded delta portion */}
            <div
              style={{ width: `${Math.max(5, 100 - (baseMs / (loadedMs || 1)) * 100)}%` }}
              className={`h-full flex items-center justify-center text-[9px] font-mono font-bold text-white ${
                deltaMs > 60 ? 'bg-rose-500' : deltaMs > 25 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
            >
              +{deltaMs}ms
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed font-medium">
          {loadedLatency.severityDescription}
        </p>
      </div>

      {/* 2. TCP & Connection Stage Waterfall Timings */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#0E1A2E] border border-white/10 space-y-3 shadow-xl">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
          <span className="flex items-center space-x-1.5 text-cyan-400">
            <Clock className="w-4 h-4" />
            <span>TCP & Connection Stage Timings</span>
          </span>
          <span className="text-[10px] font-mono text-slate-400">
            W3C Resource Timing
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-white/5">
            <span className="text-[10px] text-slate-400 block">DNS RESOLUTION</span>
            <span className="text-base font-bold text-emerald-300">
              {dnsTiming.durationMs !== null ? `${dnsTiming.durationMs} ms` : 'Cached'}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-white/5">
            <span className="text-[10px] text-slate-400 block">IDLE RTT DELAY</span>
            <span className="text-base font-bold text-cyan-300">
              {idleLatency.medianMs ?? 'N/A'} ms
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-white/5">
            <span className="text-[10px] text-slate-400 block">JITTER VARIATION</span>
            <span className="text-base font-bold text-purple-300">
              {idleLatency.jitterMs ?? 'N/A'} ms
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-white/5">
            <span className="text-[10px] text-slate-400 block">DATA CONSUMED</span>
            <span className="text-base font-bold text-slate-200">
              {dataTransferredMb} MB
            </span>
          </div>
        </div>
      </div>

      {/* 3. Endpoint & Network Route Metadata */}
      <div className="p-4 rounded-xl bg-[#15253D] border border-white/10 text-xs text-slate-300 space-y-1.5 font-mono">
        <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider mb-1 flex items-center space-x-1.5">
          <Server className="w-3.5 h-3.5 text-cyan-400" />
          <span>Active Test Target Details</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
          <div>Target Server: <span className="text-slate-200">{downloadThroughput.target}</span></div>
          <div>Probe Method: <span className="text-slate-200">{idleLatency.method}</span></div>
          <div>ISP Provider: <span className="text-emerald-300">{networkInfo.ispName || networkInfo.asnOrg || 'Detected ISP'}</span></div>
          <div>Region: <span className="text-slate-200">{[networkInfo.locationCity, networkInfo.locationCountry].filter(Boolean).join(', ') || 'Global Region'}</span></div>
          <div>Public IP: <span className="text-cyan-300">{networkInfo.ipAddress || 'Not recorded'}</span></div>
          <div>Link Profile: <span className="text-slate-200 capitalize">{networkInfo.networkType}</span></div>
        </div>
      </div>
    </div>
  );
};
