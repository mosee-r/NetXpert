import React from 'react';
import {
  HardDriveDownload,
  Upload,
  Activity,
  Gauge,
  Waves,
  ShieldAlert,
} from 'lucide-react';
import { OverallAssessmentReport } from '../types/scoring';

interface KeyMetricsMatrixProps {
  report: OverallAssessmentReport | null;
  activeMetrics?: {
    downloadMbps?: number | null;
    uploadMbps?: number | null;
    pingMs?: number | null;
    loadedPingMs?: number | null;
    jitterMs?: number | null;
  };
}

export const KeyMetricsMatrix: React.FC<KeyMetricsMatrixProps> = ({
  report,
  activeMetrics,
}) => {
  // Download Throughput
  const downloadVal =
    activeMetrics?.downloadMbps !== undefined && activeMetrics?.downloadMbps !== null
      ? `${activeMetrics.downloadMbps.toFixed(1)}`
      : report?.rawMeasurements.downloadThroughput.mbps !== null &&
        report?.rawMeasurements.downloadThroughput.mbps !== undefined
      ? `${report.rawMeasurements.downloadThroughput.mbps.toFixed(1)}`
      : '--';

  // Upload Throughput
  const uploadVal =
    activeMetrics?.uploadMbps !== undefined && activeMetrics?.uploadMbps !== null
      ? `${activeMetrics.uploadMbps.toFixed(1)}`
      : report?.rawMeasurements.uploadThroughput.mbps !== null &&
        report?.rawMeasurements.uploadThroughput.mbps !== undefined
      ? `${report.rawMeasurements.uploadThroughput.mbps.toFixed(1)}`
      : '--';

  // Idle Ping
  const pingVal =
    activeMetrics?.pingMs !== undefined && activeMetrics?.pingMs !== null
      ? `${activeMetrics.pingMs}`
      : report?.rawMeasurements.idleLatency.medianMs !== null &&
        report?.rawMeasurements.idleLatency.medianMs !== undefined
      ? `${report.rawMeasurements.idleLatency.medianMs}`
      : '--';

  // Loaded Ping (Bufferbloat under load)
  const loadedPingVal =
    activeMetrics?.loadedPingMs !== undefined && activeMetrics?.loadedPingMs !== null
      ? `${activeMetrics.loadedPingMs}`
      : report?.rawMeasurements.loadedLatency.underLoadLatencyMs !== null &&
        report?.rawMeasurements.loadedLatency.underLoadLatencyMs !== undefined
      ? `${report.rawMeasurements.loadedLatency.underLoadLatencyMs}`
      : '--';

  // Jitter
  const jitterVal =
    activeMetrics?.jitterMs !== undefined && activeMetrics?.jitterMs !== null
      ? `${activeMetrics.jitterMs}`
      : report?.rawMeasurements.idleLatency.jitterMs !== null &&
        report?.rawMeasurements.idleLatency.jitterMs !== undefined
      ? `${report.rawMeasurements.idleLatency.jitterMs}`
      : '--';

  // Packet Loss
  const packetLossVal =
    report?.rawMeasurements.idleLatency.packetLossPercent !== null &&
    report?.rawMeasurements.idleLatency.packetLossPercent !== undefined
      ? `${report.rawMeasurements.idleLatency.packetLossPercent}%`
      : '--';

  const metrics = [
    {
      id: 'download',
      label: 'DOWNLOAD',
      value: downloadVal,
      unit: 'Mbps',
      icon: HardDriveDownload,
      color: 'text-cyan-400',
    },
    {
      id: 'upload',
      label: 'UPLOAD',
      value: uploadVal,
      unit: 'Mbps',
      icon: Upload,
      color: 'text-indigo-400',
    },
    {
      id: 'ping',
      label: 'IDLE PING',
      value: pingVal,
      unit: 'ms',
      icon: Activity,
      color: 'text-purple-400',
    },
    {
      id: 'loaded_ping',
      label: 'LOADED PING',
      value: loadedPingVal,
      unit: 'ms',
      icon: Gauge,
      color: 'text-amber-400',
      badge:
        report?.rawMeasurements.loadedLatency.bufferbloatGrade &&
        report.rawMeasurements.loadedLatency.bufferbloatGrade !== 'unknown'
          ? `Grade ${report.rawMeasurements.loadedLatency.bufferbloatGrade}`
          : undefined,
    },
    {
      id: 'jitter',
      label: 'JITTER',
      value: jitterVal,
      unit: 'ms',
      icon: Waves,
      color: 'text-emerald-400',
    },
    {
      id: 'packet_loss',
      label: 'PACKET LOSS',
      value: packetLossVal,
      unit: '',
      icon: ShieldAlert,
      color: 'text-slate-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3 my-4">
      {metrics.map((m) => {
        const Icon = m.icon;
        const isNotMeasured = m.value === '--';
        return (
          <div
            key={m.id}
            className="p-3 sm:p-3.5 rounded-xl bg-[#0E1A2E] border border-white/10 hover:border-white/15 transition-all flex flex-col justify-between"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-mono tracking-wider font-semibold text-slate-400 flex items-center space-x-1.5">
                <Icon className={`w-3.5 h-3.5 ${m.color}`} />
                <span>{m.label}</span>
              </span>
              {m.badge && (
                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-950/80 border border-amber-800 text-amber-300 font-bold">
                  {m.badge}
                </span>
              )}
            </div>

            <div className="flex items-baseline space-x-1">
              <span
                className={`text-xl sm:text-2xl font-bold font-mono tabular-nums tracking-tight ${
                  isNotMeasured ? 'text-slate-600' : 'text-[#F4F8FC]'
                }`}
              >
                {m.value}
              </span>
              {m.unit && !isNotMeasured && (
                <span className="text-[11px] font-medium text-slate-400 font-mono">
                  {m.unit}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
