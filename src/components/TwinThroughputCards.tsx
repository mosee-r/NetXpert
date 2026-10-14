import React, { useId } from 'react';
import { ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';

export interface ThroughputCardSample {
  timestampMs: number;
  mbps: number;
}

interface TwinThroughputCardsProps {
  downloadMbps: number | null;
  uploadMbps: number | null;
  downloadSamples: ThroughputCardSample[];
  uploadSamples: ThroughputCardSample[];
  activePhase: 'idle' | 'download' | 'upload' | 'completed';
}

interface MiniSparklineProps {
  samples: ThroughputCardSample[];
  isActive: boolean;
  label: string;
}

const MiniSparkline: React.FC<MiniSparklineProps> = ({ samples, isActive, label }) => {
  const gradientId = `throughput-fill-${useId().replace(/:/g, '')}`;
  const width = 240;
  const height = 40;
  const validSamples = samples
    .filter((sample) =>
      Number.isFinite(sample.timestampMs) &&
      Number.isFinite(sample.mbps) &&
      sample.timestampMs >= 0 &&
      sample.mbps >= 0
    )
    .sort((left, right) => left.timestampMs - right.timestampMs);

  if (validSamples.length < 2) {
    const message = isActive
      ? 'Collecting samples...'
      : validSamples.length > 0
      ? `Not enough points to chart (${validSamples.length}/2)`
      : 'No samples';
    return (
      <div className="flex h-10 items-center font-mono text-[10px] text-app-muted" aria-live="polite">
        {message}
      </div>
    );
  }

  const firstTimestamp = validSamples[0].timestampMs;
  const lastTimestamp = validSamples[validSamples.length - 1].timestampMs;
  const timeRange = Math.max(1, lastTimestamp - firstTimestamp);
  const peakMbps = Math.max(0.1, ...validSamples.map((sample) => sample.mbps));
  const points = validSamples.map((sample) => ({
    x: ((sample.timestampMs - firstTimestamp) / timeRange) * width,
    y: height - 2 - (sample.mbps / peakMbps) * (height - 6),
  }));
  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const areaPath = `${linePath} L ${lastPoint.x.toFixed(2)} ${height} L ${firstPoint.x.toFixed(2)} ${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="block h-10 w-full overflow-hidden"
      preserveAspectRatio="none"
      role="img"
      aria-label={`${label} throughput samples across ${Math.round(lastTimestamp - firstTimestamp)} milliseconds`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--app-accent)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--app-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={linePath}
        fill="none"
        stroke="var(--app-accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {isActive && <circle cx={lastPoint.x} cy={lastPoint.y} r="3" fill="var(--app-primary)" />}
    </svg>
  );
};

export const TwinThroughputCards: React.FC<TwinThroughputCardsProps> = ({
  downloadMbps,
  uploadMbps,
  downloadSamples,
  uploadSamples,
  activePhase,
}) => {
  const cards = [
    {
      key: 'download' as const,
      label: 'Download',
      value: downloadMbps,
      samples: downloadSamples,
      Icon: ArrowDownToLine,
    },
    {
      key: 'upload' as const,
      label: 'Upload',
      value: uploadMbps,
      samples: uploadSamples,
      Icon: ArrowUpFromLine,
    },
  ];

  return (
    <div className="mx-auto my-4 grid w-full max-w-3xl grid-cols-2 gap-2.5 sm:gap-3">
      {cards.map(({ key, label, value, samples, Icon }) => {
        const isActive = activePhase === key;
        const hasValue = value !== null && Number.isFinite(value);
        return (
          <article
            key={key}
            className="min-w-0 rounded-md border border-app-divider bg-app-surface p-3 sm:p-4"
            aria-label={`${label} throughput`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-app-secondary">
                <Icon className="h-4 w-4 text-app-accent-text" aria-hidden="true" />
                <span>{label}</span>
              </div>
              <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase text-app-muted">
                {isActive && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-app-accent" />}
                {isActive ? 'Live' : hasValue ? 'Measured' : 'Waiting'}
              </span>
            </div>
            <div className="mt-3 mb-2 flex items-baseline gap-1.5">
              <span className="font-mono text-2xl font-semibold tabular-nums text-app-primary">
                {hasValue ? value.toFixed(1) : '\u2014'}
              </span>
              <span className="text-xs text-app-muted">Mbps</span>
            </div>
            <MiniSparkline samples={samples} isActive={isActive} label={label} />
          </article>
        );
      })}
    </div>
  );
};