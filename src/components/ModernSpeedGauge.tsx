import React, { useEffect, useId, useRef, useState } from 'react';

type SpeedTestPhase = 'idle' | 'latency' | 'download' | 'upload' | 'completed';

interface ModernSpeedGaugeProps {
  value: number | null;
  maxExpected?: number;
  phase: SpeedTestPhase;
  isRunning: boolean;
  statusLabel?: string;
}

const PHASE_LABELS: Record<SpeedTestPhase, string> = {
  idle: 'Ready',
  latency: 'Testing Latency...',
  download: 'Testing Download...',
  upload: 'Testing Upload...',
  completed: 'Test Complete',
};

const PHASE_COLORS: Record<SpeedTestPhase, { primary: string; text: string; glow: string }> = {
  idle: { primary: '#06b6d4', text: '#38bdf8', glow: 'rgba(6, 182, 212, 0.4)' },
  latency: { primary: '#38bdf8', text: '#7dd3fc', glow: 'rgba(56, 189, 248, 0.38)' },
  download: { primary: '#06b6d4', text: '#38bdf8', glow: 'rgba(6, 182, 212, 0.45)' },
  upload: { primary: '#3b82f6', text: '#60a5fa', glow: 'rgba(59, 130, 246, 0.4)' },
  completed: { primary: '#10b981', text: '#34d399', glow: 'rgba(16, 185, 129, 0.4)' },
};

const CENTER = 150;
const RADIUS = 116;
const START_ANGLE = 250;
const SWEEP_ANGLE = 220;
const NEEDLE_TENSION = 170;
const NEEDLE_CRITICAL_DAMPING = 2 * Math.sqrt(NEEDLE_TENSION);
const MIN_DIAL_MAX = 0.1;
const MAX_DIAL_MAX = 1_000_000_000_000;
const NICE_SCALE_FACTORS = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 8, 10];

function polarToCartesian(radius: number, angle: number) {
  const radians = (angle * Math.PI) / 180;
  return {
    x: CENTER + radius * Math.sin(radians),
    y: CENTER - radius * Math.cos(radians),
  };
}

function formatTick(value: number): string {
  if (value >= 1000) return `${(value / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}k`;
  return new Intl.NumberFormat('en-US', { maximumSignificantDigits: 3 }).format(value);
}

function adaptiveDialMax(value: number): number {
  const paddedValue = Math.max(value * 2, MIN_DIAL_MAX);
  const magnitude = 10 ** Math.floor(Math.log10(paddedValue));
  const normalizedValue = paddedValue / magnitude;
  const scaleFactor = NICE_SCALE_FACTORS.find((factor) => factor >= normalizedValue) ?? 10;
  return Math.min(MAX_DIAL_MAX, Math.max(MIN_DIAL_MAX, magnitude * scaleFactor));
}

function formatSpeed(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '\u2014';
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: value > 0 && value < 10 ? 2 : 1,
    minimumFractionDigits: value > 0 && value < 10 ? 2 : 1,
  }).format(value);
}

export const ModernSpeedGauge: React.FC<ModernSpeedGaugeProps> = ({
  value,
  maxExpected = 100,
  phase,
  isRunning,
  statusLabel,
}) => {
  const instanceId = useId().replace(/:/g, '');
  const gradientId = `speed-arc-${instanceId}`;
  const glowId = `speed-glow-${instanceId}`;
  const initialMax = Number.isFinite(maxExpected) && maxExpected > 0 ? maxExpected : 1000;
  const [dialMax, setDialMax] = useState(initialMax);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const activeArcRef = useRef<SVGPathElement>(null);
  const needleRef = useRef<SVGLineElement>(null);
  const needleTipRef = useRef<SVGCircleElement>(null);
  const physicsRef = useRef({ angle: START_ANGLE, velocity: 0 });
  const safeValue = value !== null && Number.isFinite(value) ? Math.max(0, value) : null;
  const theme = PHASE_COLORS[phase];

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener('change', updatePreference);
    return () => mediaQuery.removeEventListener('change', updatePreference);
  }, []);

  useEffect(() => {
    if (safeValue === null) return;
    const targetMax = adaptiveDialMax(safeValue);
    setDialMax((currentMax) => {
      if (targetMax > currentMax && safeValue >= currentMax * 0.55) return targetMax;
      if (targetMax < currentMax && safeValue <= currentMax * 0.35) return targetMax;
      return currentMax;
    });
  }, [safeValue]);

  const safeMax = Math.min(MAX_DIAL_MAX, Math.max(MIN_DIAL_MAX, dialMax));
  const progress = safeValue === null ? 0 : Math.max(0, Math.min(safeValue / safeMax, 1));
  const targetAngle = START_ANGLE + progress * SWEEP_ANGLE;
  const start = polarToCartesian(RADIUS, START_ANGLE);
  const end = polarToCartesian(RADIUS, START_ANGLE + SWEEP_ANGLE);
  const arcPath = `M ${start.x} ${start.y} A ${RADIUS} ${RADIUS} 0 1 1 ${end.x} ${end.y}`;
  const speedLabel = formatSpeed(safeValue);
  const phaseLabel = statusLabel || PHASE_LABELS[phase];

  useEffect(() => {
    const physics = physicsRef.current;
    let frameId = 0;
    let previousTime: number | null = null;
    const target = targetAngle;

    const render = (angle: number) => {
      const currentProgress = Math.max(0, Math.min((angle - START_ANGLE) / SWEEP_ANGLE, 1));
      const tip = polarToCartesian(RADIUS - 22, angle);
      needleRef.current?.setAttribute('x2', tip.x.toFixed(2));
      needleRef.current?.setAttribute('y2', tip.y.toFixed(2));
      needleTipRef.current?.setAttribute('cx', tip.x.toFixed(2));
      needleTipRef.current?.setAttribute('cy', tip.y.toFixed(2));
      activeArcRef.current?.style.setProperty('stroke-dashoffset', String(100 * (1 - currentProgress)));
    };

    if (prefersReducedMotion) {
      physics.angle = target;
      physics.velocity = 0;
      render(target);
      return;
    }

    const animate = (now: number) => {
      const deltaSeconds = previousTime === null ? 0 : Math.min((now - previousTime) / 1000, 0.032);
      previousTime = now;
      const displacement = target - physics.angle;
      const acceleration = NEEDLE_TENSION * displacement - NEEDLE_CRITICAL_DAMPING * physics.velocity;
      physics.velocity += acceleration * deltaSeconds;
      physics.angle += physics.velocity * deltaSeconds;

      if (Math.abs(target - physics.angle) < 0.08 && Math.abs(physics.velocity) < 0.08) {
        physics.angle = target;
        physics.velocity = 0;
        render(target);
        return;
      }

      render(physics.angle);
      frameId = window.requestAnimationFrame(animate);
    };

    frameId = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frameId);
  }, [targetAngle, prefersReducedMotion]);

  return (
    <div className="speed-gauge mx-auto my-2 select-none pt-10">
      <div className="relative flex items-center justify-center">
        <div
          className={`gauge-halo pointer-events-none absolute inset-[12%] rounded-full blur-2xl ${isRunning ? 'gauge-halo-running' : ''}`}
          style={{ background: `radial-gradient(circle, ${theme.glow} 0%, transparent 72%)` }}
          aria-hidden="true"
        />
        <svg
          viewBox="0 0 300 240"
          className="relative block h-auto w-full overflow-visible"
          role="img"
          aria-label={`${phaseLabel}: ${speedLabel} Mbps`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#00d6ca" />
              <stop offset="52%" stopColor={theme.primary} />
              <stop offset="100%" stopColor="#3478d4" />
            </linearGradient>
            <filter id={glowId} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Background Arc Track */}
          <path
            d={arcPath}
            fill="none"
            stroke="var(--app-divider-strong)"
            strokeWidth="14"
            strokeLinecap="round"
          />

          {/* Gradient Active Speed Arc */}
          <path
            ref={activeArcRef}
            d={arcPath}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth="14"
            strokeLinecap="round"
            pathLength="100"
            strokeDasharray="100 100"
            strokeDashoffset={100 * (1 - progress)}
            filter={`url(#${glowId})`}
            className={isRunning ? 'gauge-active-arc transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none' : undefined}
          />

          {/* Fine tick marks with only three numeric labels. */}
          {Array.from({ length: 11 }, (_, index) => index / 10).map((fraction) => {
            const angle = START_ANGLE + fraction * SWEEP_ANGLE;
            const outer = polarToCartesian(RADIUS - 8, angle);
            const inner = polarToCartesian(RADIUS - (fraction === 0 || fraction === 0.5 || fraction === 1 ? 18 : 14), angle);
            const showLabel = fraction === 0 || fraction === 0.5 || fraction === 1;
            const label = polarToCartesian(82, angle);
            const tickValue = safeMax * fraction;
            return (
              <g key={`tick-${fraction}`} aria-hidden="true">
                <line
                  x1={inner.x}
                  y1={inner.y}
                  x2={outer.x}
                  y2={outer.y}
                  stroke="var(--app-muted)"
                  strokeWidth={showLabel ? 2 : 1}
                  strokeLinecap="round"
                />
                {showLabel && (
                  <text
                    x={label.x}
                    y={label.y + 3}
                    fill="var(--app-secondary)"
                    fontSize="11"
                    fontWeight="700"
                    fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                    textAnchor="middle"
                  >
                    {formatTick(tickValue)}
                  </text>
                )}
              </g>
            );
          })}

          {isRunning && (
            <>
              <line
                ref={needleRef}
                x1={CENTER}
                y1={CENTER}
                x2={CENTER}
                y2={CENTER - RADIUS + 22}
                stroke={theme.text}
                strokeWidth="3"
                strokeLinecap="round"
                filter={`url(#${glowId})`}
              />
              <circle
                ref={needleTipRef}
                cx={CENTER}
                cy={CENTER - RADIUS + 22}
                r="4"
                fill="var(--app-primary)"
                stroke={theme.text}
                strokeWidth="1.5"
              />
              <circle cx={CENTER} cy={CENTER} r="7" fill="var(--app-canvas)" stroke={theme.text} strokeWidth="2" />
              <circle cx={CENTER} cy={CENTER} r="2.5" fill={theme.text} />
            </>
          )}

          {/* Live Digital Display Readout */}
          <text
            x={CENTER}
            y="208"
            textAnchor="middle"
            fill="#f8fafc"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize="34"
            fontWeight="800"
            style={{
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {speedLabel}
          </text>
          <text
            x={CENTER}
            y="228"
            textAnchor="middle"
            fill="#94a3b8"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize="10"
            fontWeight="600"
            letterSpacing="1.2"
          >
            Mbps
          </text>
        </svg>

        {/* Floating Active Phase Badge */}
        {isRunning && (
          <div className="absolute -top-5 left-1/2 z-10 -translate-x-1/2 flex items-center gap-2 rounded-full border border-cyan-500/30 bg-slate-900/90 px-3 py-1 backdrop-blur-md shadow-lg shadow-cyan-950/50">
            <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping motion-reduce:animate-none" />
            <span className="text-[11px] font-semibold text-cyan-300 uppercase tracking-wider">
              {phaseLabel}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};