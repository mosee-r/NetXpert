import React from 'react';

export interface SpeedMetrics {
  downloadMbps: number | null;
  uploadMbps: number | null;
  idleLatencyMs: number | null;
  loadedLatencyMs: number | null;
  jitterMs: number | null;
}

interface KeyMetricsListProps {
  metrics: SpeedMetrics;
  includeThroughput?: boolean;
  additionalRows?: { label: string; value: string }[];
}

export const KeyMetricsList: React.FC<KeyMetricsListProps> = ({
  metrics,
  includeThroughput = true,
  additionalRows = [],
}) => {
  const throughputRows = [
    {
      label: 'Download',
      value: metrics.downloadMbps === null ? '\u2014' : `${metrics.downloadMbps.toFixed(1)} Mbps`,
    },
    {
      label: 'Upload',
      value: metrics.uploadMbps === null ? '\u2014' : `${metrics.uploadMbps.toFixed(1)} Mbps`,
    },
    {
      label: 'Idle Latency',
      value: metrics.idleLatencyMs === null ? '\u2014' : `${metrics.idleLatencyMs.toFixed(0)} ms`,
    },
    {
      label: 'Loaded Latency',
      value: metrics.loadedLatencyMs === null ? 'Not measured' : `${metrics.loadedLatencyMs.toFixed(0)} ms`,
    },
    {
      label: 'Jitter',
      value: metrics.jitterMs === null ? '\u2014' : `${metrics.jitterMs.toFixed(1)} ms`,
    },
  ];
  const rows = [
    ...(includeThroughput ? throughputRows : []),
    {
      label: 'Idle Latency',
      value: metrics.idleLatencyMs === null ? '\u2014' : `${metrics.idleLatencyMs.toFixed(0)} ms`,
    },
    {
      label: 'Loaded Latency',
      value: metrics.loadedLatencyMs === null ? 'Not measured' : `${metrics.loadedLatencyMs.toFixed(0)} ms`,
    },
    {
      label: 'Jitter',
      value: metrics.jitterMs === null ? '\u2014' : `${metrics.jitterMs.toFixed(1)} ms`,
    },
    ...additionalRows,
  ];
  return (
    <div
      className="my-6 w-full divide-y divide-app-divider border-y border-app-divider"
      aria-label="Speed test metrics"
    >
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-4 px-1 py-3">
          <span className="text-sm font-normal text-app-muted">{row.label}</span>
          <span className="text-right font-mono text-sm font-semibold tabular-nums text-app-primary">
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
};
