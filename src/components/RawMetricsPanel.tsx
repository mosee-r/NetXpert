import React from 'react';
import {
  OverallAssessmentReport,
} from '../types/scoring';
import {
  Gauge,
  Activity,
  HardDriveDownload,
  Upload,
  Cpu,
  Clock,
  Layers,
  AlertCircle,
} from 'lucide-react';

interface RawMetricsPanelProps {
  report: OverallAssessmentReport;
}

export const RawMetricsPanel: React.FC<RawMetricsPanelProps> = ({ report }) => {
  const { rawMeasurements, networkInfo } = report;
  const { idleLatency, downloadThroughput, uploadThroughput, loadedLatency, dnsTiming } =
    rawMeasurements;

  return (
    <div className="bg-slate-900 border border-indigo-900/60 rounded-2xl p-6 text-white shadow-xl space-y-6">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-950 border border-indigo-700/60 text-indigo-400 flex items-center justify-center">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Advanced Telemetry & Diagnostics Inspector
            </h3>
            <p className="text-xs text-slate-400">
              Raw telemetry samples, protocol metrics, and queue response statistics
            </p>
          </div>
        </div>
        <div className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
          Engine: {report.scoringVersion}
        </div>
      </div>

      {/* Grid of Telemetry Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* 1. Throughput Telemetry */}
        <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
            <span className="flex items-center space-x-1.5 text-cyan-400">
              <HardDriveDownload className="w-4 h-4" />
              <span>Throughput</span>
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              {downloadThroughput.method}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase font-mono">Download</div>
              <div className="text-lg font-bold font-mono text-cyan-300">
                {downloadThroughput.mbps !== null ? `${downloadThroughput.mbps} Mbps` : 'N/A'}
              </div>
              <div className="text-[10px] text-slate-500 font-mono">
                {((downloadThroughput.bytesTransferred || 0) / (1024 * 1024)).toFixed(2)} MB
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase font-mono">Upload</div>
              <div className="text-lg font-bold font-mono text-indigo-300">
                {uploadThroughput.mbps !== null ? `${uploadThroughput.mbps} Mbps` : 'N/A'}
              </div>
              <div className="text-[10px] text-slate-500 font-mono">
                {((uploadThroughput.bytesTransferred || 0) / (1024 * 1024)).toFixed(2)} MB
              </div>
            </div>
          </div>
        </div>

        {/* 2. Latency & Jitter Statistics */}
        <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
            <span className="flex items-center space-x-1.5 text-indigo-400">
              <Activity className="w-4 h-4" />
              <span>Idle Latency & Jitter</span>
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              {idleLatency.sampleCount} samples
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1.5 text-center text-xs font-mono">
            <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
              <div className="text-[9px] text-slate-500">MIN</div>
              <div className="font-semibold text-slate-200">{idleLatency.minMs ?? '-'} ms</div>
            </div>
            <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
              <div className="text-[9px] text-slate-500">MEDIAN</div>
              <div className="font-semibold text-cyan-300">{idleLatency.medianMs ?? '-'} ms</div>
            </div>
            <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
              <div className="text-[9px] text-slate-500">AVG</div>
              <div className="font-semibold text-slate-200">{idleLatency.avgMs ?? '-'} ms</div>
            </div>
            <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
              <div className="text-[9px] text-slate-500">JITTER</div>
              <div className="font-semibold text-amber-300">{idleLatency.jitterMs ?? '-'} ms</div>
            </div>
          </div>
          <div className="text-[11px] text-slate-400 font-mono flex justify-between">
            <span>Probe: {idleLatency.method}</span>
            <span>Loss: {idleLatency.packetLossPercent ?? 0}%</span>
          </div>
        </div>

        {/* 3. Bufferbloat Queue Analysis */}
        <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
            <span className="flex items-center space-x-1.5 text-amber-400">
              <Gauge className="w-4 h-4" />
              <span>Bufferbloat (Queue Delay)</span>
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-950 border border-amber-800 text-amber-300">
              Grade {loadedLatency.bufferbloatGrade}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5 text-center text-xs font-mono">
            <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
              <div className="text-[9px] text-slate-500">BASELINE</div>
              <div className="font-semibold text-slate-300">{loadedLatency.baselineLatencyMs ?? '-'} ms</div>
            </div>
            <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
              <div className="text-[9px] text-slate-500">UNDER LOAD</div>
              <div className="font-semibold text-rose-300">{loadedLatency.underLoadLatencyMs ?? '-'} ms</div>
            </div>
            <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
              <div className="text-[9px] text-slate-500">QUEUE DELTA</div>
              <div className="font-semibold text-amber-300">+{loadedLatency.loadedDeltaMs ?? 0} ms</div>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 leading-snug">
            {loadedLatency.severityDescription}
          </p>
        </div>
      </div>

      {/* DNS & Network Stack Information */}
      <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 text-xs text-slate-300 space-y-2">
        <div className="font-semibold text-slate-200 uppercase tracking-wider text-[11px]">
          Network Adapter & Resolution Details
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-[11px]">
          <div>
            <span className="text-slate-500">Transport: </span>
            <span className="text-cyan-300 capitalize">{networkInfo.networkType}</span>
          </div>
          <div>
            <span className="text-slate-500">Effective Type: </span>
            <span className="text-slate-200">{networkInfo.effectiveType || 'N/A'}</span>
          </div>
          <div>
            <span className="text-slate-500">DNS Timing: </span>
            <span className="text-emerald-300">
              {dnsTiming.durationMs !== null ? `${dnsTiming.durationMs} ms` : 'N/A'}
            </span>
          </div>
          <div>
            <span className="text-slate-500">Public IP: </span>
            <span className="text-slate-200">{networkInfo.ipAddress || 'Not recorded'}</span>
          </div>
        </div>
      </div>

      {/* Limitations Disclaimer */}
      <div className="text-[11px] text-slate-500 border-t border-slate-800 pt-3 flex items-start space-x-2">
        <AlertCircle className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
        <p>
          Measurements were collected using HTTP stream accounting and high-resolution web timers. Android raw ICMP sockets and cellular modem register flags (RSRP/RSRQ) require native Android privileges not available in standard browser sandboxes.
        </p>
      </div>
    </div>
  );
};
