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
  compact?: boolean;
}

interface MiniSparklineProps {
  samples: ThroughputCardSample[];
  isActive: boolean;
  isWaiting?: boolean;
  label: string;
  accentColor: string;
  compact?: boolean;
}

function generateLinePath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return '';
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');
}

const MiniSparkline: React.FC<MiniSparklineProps> = ({ samples, isActive, isWaiting = false, label, accentColor, compact = false }) => {
  const instanceId = useId().replace(/:/g, '');
  const gradientId = `throughput-fill-${instanceId}`;
  const glowId = `throughput-glow-${instanceId}`;
  const width = 240;
  const height = compact ? 32 : 48;

  const validSamples = samples
    .filter((sample) =>
      Number.isFinite(sample.timestampMs) &&
      Number.isFinite(sample.mbps) &&
      sample.timestampMs >= 0 &&
      sample.mbps >= 0
    )
    .sort((left, right) => left.timestampMs - right.timestampMs);

  if (validSamples.length < 2 && isActive) {
    return (
      <div className={`flex items-center justify-center rounded-lg border border-white/5 bg-slate-950/40 font-mono text-[11px] text-slate-400 ${compact ? 'h-8' : 'h-12'}`}>
        <span className="mr-2 h-2 w-2 animate-ping rounded-full" style={{ backgroundColor: accentColor }} />
        Collecting live data...
      </div>
    );
  }

  if (validSamples.length === 0) {
    if (isWaiting) {
      return (
        <div className={`flex items-center justify-center font-mono text-[11px] text-app-muted ${compact ? 'h-8' : 'h-12'}`}>
          <span className="mr-2 h-1.5 w-1.5 rounded-full bg-app-divider-strong" aria-hidden="true" />
          Waiting
        </div>
      );
    }
    return <div className={compact ? 'h-8' : 'h-12'} aria-hidden="true" />;
  }

  if (validSamples.length === 1) {
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={`block w-full overflow-hidden ${compact ? 'h-8' : 'h-12'}`}
        role="img"
        aria-label={`${label} throughput: one sample at ${validSamples[0].mbps.toFixed(2)} Mbps`}
      >
        <circle cx={width / 2} cy={height / 2} r="3.5" fill={accentColor} />
      </svg>
    );
  }

  const firstTimestamp = validSamples[0].timestampMs;
  const lastTimestamp = validSamples[validSamples.length - 1].timestampMs;
  const timeRange = Math.max(1, lastTimestamp - firstTimestamp);
  const peakMbps = Math.max(0.1, ...validSamples.map((sample) => sample.mbps));
  const points = validSamples.map((sample) => ({
    x: ((sample.timestampMs - firstTimestamp) / timeRange) * width,
    y: height - 4 - (sample.mbps / peakMbps) * (height - 10),
  }));

  const curvePath = generateLinePath(points);
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const areaPath = `${curvePath} L ${lastPoint.x.toFixed(2)} ${height} L ${firstPoint.x.toFixed(2)} ${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={`block w-full overflow-hidden ${compact ? 'h-8' : 'h-12'}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${label} throughput samples`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accentColor} stopOpacity="0.4" />
          <stop offset="100%" stopColor={accentColor} stopOpacity="0.01" />
        </linearGradient>
        <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={curvePath}
        fill="none"
        stroke={accentColor}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#${glowId})`}
      />
      {isActive && (
        <>
          <circle cx={lastPoint.x} cy={lastPoint.y} r="5" fill="#ffffff" filter={`url(#${glowId})`} />
          <circle cx={lastPoint.x} cy={lastPoint.y} r="2.5" fill={accentColor} />
        </>
      )}
    </svg>
  );
};

export const TwinThroughputCards: React.FC<TwinThroughputCardsProps> = ({
  downloadMbps,
  uploadMbps,
  downloadSamples,
  uploadSamples,
  activePhase,
  compact = false,
}) => {
  const cards = [
    {
      key: 'download' as const,
      label: 'Download',
      value: downloadMbps,
      samples: downloadSamples,
      Icon: ArrowDownToLine,
      accentColor: '#06b6d4',
    },
    {
      key: 'upload' as const,
      label: 'Upload',
      value: uploadMbps,
      samples: uploadSamples,
      Icon: ArrowUpFromLine,
      accentColor: '#3b82f6',
    },
  ];

  return (
    <div className={`mx-auto grid w-full max-w-3xl grid-cols-2 gap-2 sm:gap-4 ${compact ? 'my-1' : 'my-4'}`}>
      {cards.map(({ key, label, value, samples, Icon, accentColor }) => {
        const isActive = activePhase === key;
        const isWaiting = activePhase === 'idle'
          || ((activePhase === 'download' || activePhase === 'upload') && !isActive && value === null);
        const hasValue = value !== null && Number.isFinite(value);
        return (
          <article
            key={key}
            className={`min-w-0 rounded-xl transition-all duration-300 glass-card glass-card-hover ${compact ? 'p-2.5 sm:p-3' : 'p-3.5 sm:p-4'} ${
              isActive
                ? 'bg-app-raised shadow-md'
                : 'border-app-divider bg-app-surface/60'
            }`}
            aria-label={`${label} throughput`}
            style={{ borderColor: isActive ? `${accentColor}CC` : undefined }}
          >
            <div className="flex items-center">
              <div className="flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-800/80 border border-white/10"
                  style={{ color: accentColor }}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <span className="whitespace-nowrap">{label}</span>
              </div>
            </div>

            <div className={`${compact ? 'mt-1.5' : 'mt-3'} mb-1 flex items-baseline gap-1.5`}>
              <span
                className={`font-mono font-extrabold tabular-nums tracking-tight text-white ${compact ? 'text-2xl' : 'text-3xl'}`}
                style={{ textShadow: hasValue ? `0 0 16px ${accentColor}40` : 'none' }}
              >
                {hasValue ? value.toFixed(1) : '\u2014'}
              </span>
              <span className="font-mono text-xs font-medium text-slate-400">Mbps</span>
            </div>

            <MiniSparkline samples={samples} isActive={isActive} isWaiting={isWaiting} label={label} accentColor={accentColor} compact={compact} />
          </article>
        );
      })}
    </div>
  );
};