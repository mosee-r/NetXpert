import React, { useMemo } from 'react';

export interface LiveSparklineProps {
  /** Array of throughput numbers in Mbps */
  data?: number[];
  sparklineData?: number[];
  throughputData?: number[];
  width?: number | string;
  height?: number;
  strokeColor?: string;
  fillColor?: string;
  strokeWidth?: number;
  isTesting?: boolean;
  className?: string;
  showPeak?: boolean;
}

/**
 * Generate a smooth Monotone cubic Bezier curve for fluid waveforms
 */
function generateSmoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x},${points[0].y}`;
  if (points.length === 2) {
    return `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)} L ${points[1].x.toFixed(1)},${points[1].y.toFixed(1)}`;
  }

  let d = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;

    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }

  return d;
}

export const LiveSparkline: React.FC<LiveSparklineProps> = ({
  data,
  sparklineData,
  throughputData,
  width = '100%',
  height = 48,
  strokeColor = '#27D7F2',
  fillColor = '#27D7F2',
  strokeWidth = 2.5,
  isTesting = false,
  className = '',
  showPeak = false,
}) => {
  // Normalize dataset from any of the standard prop names
  const pointsData = useMemo(() => {
    return throughputData || sparklineData || data || [];
  }, [throughputData, sparklineData, data]);

  // Virtual coordinate box for responsive SVG scaling
  const viewBoxWidth = 300;
  const viewBoxHeight = height;

  const { linePath, areaPath, lastPoint, peakValue } = useMemo(() => {
    if (!pointsData || pointsData.length < 2) {
      return { linePath: '', areaPath: '', lastPoint: null, peakValue: 0 };
    }

    const padding = 6;
    const innerWidth = viewBoxWidth - padding * 2;
    const innerHeight = viewBoxHeight - padding * 2;

    const peak = Math.max(...pointsData, 10);
    const minVal = 0;
    const range = peak - minVal || 1;

    const coords = pointsData.map((val, idx) => {
      const x = padding + (idx / (pointsData.length - 1)) * innerWidth;
      const y = viewBoxHeight - padding - ((val - minVal) / range) * innerHeight;
      return { x, y, val };
    });

    const curve = generateSmoothPath(coords);
    const last = coords[coords.length - 1];
    const area = `${curve} L ${last.x.toFixed(1)},${viewBoxHeight} L ${coords[0].x.toFixed(1)},${viewBoxHeight} Z`;

    return {
      linePath: curve,
      areaPath: area,
      lastPoint: last,
      peakValue: peak,
    };
  }, [pointsData, viewBoxWidth, viewBoxHeight]);

  const gradientId = useMemo(
    () => `sparkline-grad-${Math.random().toString(36).substring(2, 8)}`,
    []
  );

  return (
    <div
      className={`relative flex flex-col justify-center overflow-hidden transition-all duration-300 ${className}`}
      style={{ width, height }}
    >
      {linePath ? (
        <svg
          viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
          className="w-full h-full overflow-visible select-none"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={fillColor} stopOpacity="0.32" />
              <stop offset="65%" stopColor={fillColor} stopOpacity="0.08" />
              <stop offset="100%" stopColor={fillColor} stopOpacity="0.0" />
            </linearGradient>
            <filter id={`${gradientId}-glow`} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor={strokeColor} floodOpacity="0.6" />
            </filter>
          </defs>

          {/* Shaded Area Under Throughput Curve */}
          <path
            d={areaPath}
            fill={`url(#${gradientId})`}
            className="transition-all duration-200 ease-out"
          />

          {/* Smooth Kinetic SVG Waveform Path */}
          <path
            d={linePath}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            filter={`url(#${gradientId}-glow)`}
            className="transition-all duration-200 ease-out"
          />

          {/* Animated Leading Edge Indicator */}
          {lastPoint && (isTesting || pointsData.length > 0) && (
            <g className={isTesting ? 'animate-pulse' : ''}>
              <circle
                cx={lastPoint.x}
                cy={lastPoint.y}
                r="4.5"
                fill={strokeColor}
                className="transition-all duration-200 ease-out"
              />
              {isTesting && (
                <circle
                  cx={lastPoint.x}
                  cy={lastPoint.y}
                  r="7.5"
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth="1.5"
                  opacity="0.45"
                />
              )}
            </g>
          )}
        </svg>
      ) : (
        /* Standby / Idle Subtle Waveform Baseline */
        <div className="w-full h-full flex items-center justify-center">
          <div className="w-3/4 h-[2px] bg-slate-800/80 rounded-full animate-pulse flex items-center justify-center">
            <div className="w-12 h-[2px] bg-cyan-400/30 rounded-full" />
          </div>
        </div>
      )}

      {/* Optional Peak Tag Overlay */}
      {showPeak && peakValue > 0 && (
        <div className="absolute top-1 right-2 text-[10px] font-mono text-cyan-300/80 bg-slate-900/60 px-1.5 py-0.5 rounded border border-white/5 pointer-events-none">
          Peak: {peakValue.toFixed(1)} Mbps
        </div>
      )}
    </div>
  );
};
