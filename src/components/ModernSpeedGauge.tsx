import React, { useEffect, useId, useRef, useState } from 'react';

type SpeedTestPhase = 'idle' | 'latency' | 'download' | 'upload' | 'completed';

interface ModernSpeedGaugeProps {
  value: number | null;
  maxExpected?: number;
  phase: SpeedTestPhase;
  isRunning: boolean;
}

const PHASE_LABELS: Record<SpeedTestPhase, string> = {
  idle: 'Ready',
  latency: 'Testing latency',
  download: 'Testing download',
  upload: 'Testing upload',
  completed: 'Test complete',
};

const SCALE_TICKS = [0, 1, 5, 10, 20, 30, 40, 50, 60, 80, 100];
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

function valueToProgress(value: number, ticks: number[]): number {
  const boundedValue = Math.max(ticks[0], Math.min(value, ticks[ticks.length - 1]));
  for (let index = 0; index < ticks.length - 1; index++) {
    const lower = ticks[index];
    const upper = ticks[index + 1];
    if (boundedValue <= upper) {
      const segment = (boundedValue - lower) / Math.max(upper - lower, Number.EPSILON);
      return (index + segment) / (ticks.length - 1);
    }
  }
  return 1;
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
}) => {
  const instanceId = useId().replace(/:/g, '');
  const gradientId = `speed-arc-${instanceId}`;
  const glowId = `speed-glow-${instanceId}`;
  const initialMax = Number.isFinite(maxExpected) && maxExpected > 0 ? maxExpected : 1000;
  const [dialMax, setDialMax] = useState(initialMax);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const activeArcRef = useRef<SVGPathElement>(null);
  const needleRef = useRef<SVGLineElement>(null);
  const physicsRef = useRef({ angle: START_ANGLE, velocity: 0 });
  const safeValue = value !== null && Number.isFinite(value) ? Math.max(0, value) : null;

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
  const tickMultiplier = safeMax / SCALE_TICKS[SCALE_TICKS.length - 1];
  const ticks = SCALE_TICKS.map((tick) => tick * tickMultiplier);
  const progress = safeValue === null ? 0 : valueToProgress(safeValue, ticks);
  const targetAngle = START_ANGLE + progress * SWEEP_ANGLE;
  const start = polarToCartesian(RADIUS, START_ANGLE);
  const end = polarToCartesian(RADIUS, START_ANGLE + SWEEP_ANGLE);
  const arcPath = `M ${start.x} ${start.y} A ${RADIUS} ${RADIUS} 0 1 1 ${end.x} ${end.y}`;
  const speedLabel = formatSpeed(safeValue);
  const targetTip = polarToCartesian(RADIUS - 22, targetAngle);

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
    <div className="mx-auto my-1 w-full max-w-[300px] select-none [transform:translateZ(0)] lg:max-w-[360px]">
      <div className="relative">
        <svg
          viewBox="0 0 300 240"
          className="block h-auto w-full overflow-visible"
          role="img"
          aria-label={`${PHASE_LABELS[phase]}: ${speedLabel} Mbps, dial scale 0 to ${formatTick(safeMax)} Mbps`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--app-accent)" />
              <stop offset="60%" stopColor="var(--app-accent-text)" />
              <stop offset="100%" stopColor="var(--app-accent)" />
            </linearGradient>
            <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="var(--app-accent)" floodOpacity="0.32" />
            </filter>
          </defs>

          <path
            d={arcPath}
            fill="none"
            stroke="var(--app-raised)"
            strokeWidth="14"
            strokeLinecap="round"
          />
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
          />

          {ticks.map((tick, index) => {
            const angle = START_ANGLE + (index / (ticks.length - 1)) * SWEEP_ANGLE;
            const outer = polarToCartesian(RADIUS - 6, angle);
            const inner = polarToCartesian(RADIUS - 12, angle);
            const label = polarToCartesian(82, angle);
            const isMajor = index === 0 || index === ticks.length - 1 || index % 2 === 0;
            return (
              <g key={`tick-${index}`} aria-hidden="true">
                <line
                  x1={inner.x}
                  y1={inner.y}
                  x2={outer.x}
                  y2={outer.y}
                  stroke={isMajor ? 'var(--app-muted)' : 'var(--app-divider-strong)'}
                  strokeWidth={isMajor ? 1.5 : 1}
                  strokeLinecap="round"
                />
                <text
                  x={label.x}
                  y={label.y + 3}
                  fill="var(--app-muted)"
                  fontSize="9"
                  fontWeight="500"
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                  textAnchor="middle"
                >
                  {formatTick(tick)}
                </text>
              </g>
            );
          })}

          {isRunning && (
            <line
              ref={needleRef}
              x1={CENTER}
              y1={CENTER}
              x2={targetTip.x}
              y2={targetTip.y}
              stroke="var(--app-accent-text)"
              strokeWidth="2.5"
              strokeLinecap="round"
              filter={`url(#${glowId})`}
            />
          )}
          {isRunning && <circle cx={CENTER} cy={CENTER} r="5.5" fill="var(--app-accent-text)" />}
          {isRunning && <circle cx={CENTER} cy={CENTER} r="2.5" fill="var(--app-canvas)" />}

          <text
            x={CENTER}
            y="211"
            textAnchor="middle"
            fill="var(--app-primary)"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize="30"
            fontWeight="700"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {speedLabel}
          </text>
          <text
            x={CENTER}
            y="229"
            textAnchor="middle"
            fill="var(--app-muted)"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize="10"
            letterSpacing="1"
          >
            Mbps · {formatTick(safeMax)} MAX
          </text>
        </svg>
      </div>
    </div>
  );
};