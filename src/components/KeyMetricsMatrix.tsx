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
  includeLatency?: boolean;
  additionalRows?: { label: string; value: string; status?: 'good' | 'warning' | 'poor' }[];
}

export const KeyMetricsList: React.FC<KeyMetricsListProps> = ({
  metrics,
  includeThroughput = true,
  includeLatency = true,
  additionalRows = [],
}) => {
  const latencyRows = [
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
  const throughputRows = [
    {
      label: 'Download',
      value: metrics.downloadMbps === null ? '\u2014' : `${metrics.downloadMbps.toFixed(1)} Mbps`,
    },
    {
      label: 'Upload',
      value: metrics.uploadMbps === null ? '\u2014' : `${metrics.uploadMbps.toFixed(1)} Mbps`,
    },
    ...latencyRows,
  ];
  const rows: { label: string; value: string; status?: 'good' | 'warning' | 'poor' }[] = [
    ...(includeThroughput ? throughputRows : []),
    ...(!includeThroughput && includeLatency ? latencyRows : []),
    ...additionalRows,
  ];
  return (
    <dl
      className="grid w-full grid-cols-2 gap-x-4 gap-y-0 sm:grid-cols-3 sm:gap-y-2"
      aria-label="Speed test metrics"
    >
      {rows.map((row) => (
        <div key={row.label} className="min-w-0 border-b border-app-divider/70 py-1 sm:py-2">
          <dt className="truncate text-[11px] text-app-muted">{row.label}</dt>
          <dd className="mt-0.5 flex min-w-0 items-center gap-1.5 font-mono text-sm font-semibold tabular-nums text-app-primary" title={row.value}>
            {row.status && (
              <span
                aria-label={row.status}
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  row.status === 'good' ? 'bg-emerald-400' : row.status === 'warning' ? 'bg-amber-400' : 'bg-rose-400'
                }`}
              />
            )}
            <span className="min-w-0 truncate">{row.value}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
};
