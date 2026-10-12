import React from 'react';
import { Play, RotateCcw, XCircle, Activity, ChevronRight } from 'lucide-react';
import { AssessmentStage } from '../engines/orchestrator';
import { LiveSparkline } from './LiveSparkline';

interface SpeedGaugeProps {
  isTesting: boolean;
  stage: AssessmentStage;
  stageName: string;
  progressPercent: number; // 0 - 100
  heroValue: string; // e.g. "124.5" or "18"
  heroUnit: string; // "Mbps" or "ms"
  heroLabel: string; // "DOWNLOAD SPEED" or "IDLE PING"
  sparklineData: number[]; // stream throughput values for live waveform
  serverEndpoint?: string;
  onStartTest: () => void;
  onCancelTest: () => void;
  onViewDetails?: () => void;
  hasCompletedReport: boolean;
}

export const SpeedGauge: React.FC<SpeedGaugeProps> = ({
  isTesting,
  stage,
  stageName,
  progressPercent,
  heroValue,
  heroUnit,
  heroLabel,
  sparklineData,
  serverEndpoint = 'Automatic (Fastest Edge Server)',
  onStartTest,
  onCancelTest,
  onViewDetails,
  hasCompletedReport,
}) => {
  // SVG Radial dimensions
  const size = 300;
  const strokeWidth = 8;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  // Sweep arc covers 260 degrees (leaving an open gap at the bottom)
  const arcLength = circumference * 0.75;
  const offset = arcLength - (arcLength * Math.min(100, Math.max(0, progressPercent))) / 100;

  // Phase steps
  const phases = [
    { id: 'measuring_latency', label: '1. Ping' },
    { id: 'measuring_download', label: '2. Download' },
    { id: 'measuring_upload', label: '3. Upload' },
    { id: 'measuring_loaded_latency', label: '4. Bufferbloat' },
  ];

  const getPhaseIndex = () => {
    if (stage === 'detecting_network' || stage === 'measuring_dns') return 0;
    if (stage === 'measuring_latency') return 0;
    if (stage === 'measuring_download') return 1;
    if (stage === 'measuring_upload') return 2;
    if (stage === 'measuring_loaded_latency' || stage === 'evaluating_activities') return 3;
    return -1;
  };

  const activePhaseIdx = getPhaseIndex();

  return (
    <div className="flex flex-col items-center justify-center relative select-none my-2 sm:my-4">
      {/* Central Radial Ring Container */}
      <div className="relative w-[300px] h-[300px] flex items-center justify-center">
        {/* Ambient Halo Behind Gauge during Test */}
        <div
          className={`absolute inset-4 rounded-full transition-opacity duration-700 pointer-events-none ${
            isTesting
              ? 'opacity-60 bg-gradient-to-tr from-cyan-500/20 via-indigo-500/15 to-transparent blur-2xl'
              : 'opacity-10 bg-cyan-500/10 blur-xl'
          }`}
        />

        {/* SVG Arc Track & Sweep */}
        <svg
          width={size}
          height={size}
          className="transform -rotate-[135deg] overflow-visible"
        >
          <defs>
            <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#27D7F2" />
              <stop offset="50%" stopColor="#536DFE" />
              <stop offset="100%" stopColor="#8C52FF" />
            </linearGradient>
            <filter id="cyanGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#27D7F2" floodOpacity="0.6" />
            </filter>
          </defs>

          {/* Background Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke="rgba(255, 255, 255, 0.08)"
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeLinecap="round"
          />

          {/* Active Gradient Sweep Arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke="url(#gaugeGradient)"
            strokeWidth={isTesting ? strokeWidth + 2 : strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset={isTesting ? offset : hasCompletedReport ? 0 : arcLength}
            strokeLinecap="round"
            className="transition-all duration-150 ease-out"
            filter={isTesting ? 'url(#cyanGlow)' : undefined}
          />
        </svg>

        {/* Center Contents */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 pointer-events-auto">
          {!isTesting && !hasCompletedReport ? (
            /* Idle State: START TEST Glowing Button */
            <div className="flex flex-col items-center">
              <button
                onClick={onStartTest}
                className="w-36 h-36 rounded-full bg-gradient-to-tr from-cyan-500/20 via-indigo-600/30 to-slate-900 border border-cyan-400/40 hover:border-cyan-300 text-white font-bold text-base tracking-wider shadow-xl glow-cyan hover:scale-105 active:scale-95 transition-all flex flex-col items-center justify-center space-y-1.5 group cursor-pointer"
              >
                <div className="w-10 h-10 rounded-full bg-cyan-400/20 flex items-center justify-center text-cyan-300 group-hover:bg-cyan-400 group-hover:text-slate-950 transition-colors">
                  <Play className="w-5 h-5 ml-0.5 fill-current" />
                </div>
                <span className="text-sm font-extrabold uppercase tracking-widest text-slate-100">
                  START TEST
                </span>
              </button>
              <span className="text-[11px] text-slate-400 mt-4 max-w-[200px] truncate font-medium">
                {serverEndpoint}
              </span>
            </div>
          ) : isTesting ? (
            /* Active Test State: Hero Number + Live Waveform */
            <div className="flex flex-col items-center justify-center w-full">
              <span className="text-[11px] font-mono tracking-widest uppercase text-cyan-400 mb-1">
                {heroLabel}
              </span>

              {/* Real-time Hero Speed Counter (tabular-nums to prevent jitter) */}
              <div className="flex items-baseline justify-center space-x-1.5">
                <span className="text-5xl font-extrabold text-white tabular-nums tracking-tight">
                  {heroValue}
                </span>
                <span className="text-sm font-semibold text-slate-400 uppercase font-mono">
                  {heroUnit}
                </span>
              </div>

              {/* Real-time SVG Waveform Sparkline */}
              <div className="my-1 flex items-center justify-center">
                <LiveSparkline
                  sparklineData={sparklineData}
                  width={180}
                  height={36}
                  isTesting={isTesting}
                />
              </div>

              {/* Cancel Button */}
              <button
                onClick={onCancelTest}
                className="mt-1 px-3 py-1 rounded-full bg-rose-950/60 hover:bg-rose-900 border border-rose-800/80 text-rose-300 text-[11px] font-semibold flex items-center space-x-1 transition-all active:scale-95"
              >
                <XCircle className="w-3 h-3" />
                <span>Cancel</span>
              </button>
            </div>
          ) : (
            /* Completed State: Final Speed + Action Buttons */
            <div className="flex flex-col items-center justify-center">
              <span className="text-[11px] font-mono uppercase text-emerald-400 mb-0.5">
                TEST COMPLETE
              </span>
              <div className="flex items-baseline justify-center space-x-1.5">
                <span className="text-5xl font-extrabold text-white tabular-nums tracking-tight">
                  {heroValue}
                </span>
                <span className="text-sm font-semibold text-slate-400 uppercase font-mono">
                  {heroUnit}
                </span>
              </div>
              <span className="text-xs text-slate-400 mb-3">{heroLabel}</span>

              {/* Test Again Button */}
              <button
                onClick={onStartTest}
                className="px-4 py-2 rounded-full bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg glow-cyan-sm transition-all flex items-center space-x-1.5 active:scale-95 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>TEST AGAIN</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 4-Step Phase Segmented Bar below Gauge (Active or Completed) */}
      {isTesting && (
        <div className="w-full max-w-sm mt-3 px-2">
          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1 font-mono">
            <span className="text-cyan-300 font-semibold">{stageName}</span>
            <span>{progressPercent}%</span>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {phases.map((p, idx) => {
              const isPast = activePhaseIdx > idx;
              const isCurrent = activePhaseIdx === idx;
              return (
                <div
                  key={p.id}
                  className={`py-1 rounded-md text-center text-[10px] font-mono font-medium transition-all ${
                    isCurrent
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/50 glow-cyan-sm'
                      : isPast
                      ? 'bg-slate-800 text-emerald-400 border border-emerald-900/40'
                      : 'bg-slate-900/60 text-slate-600 border border-slate-800'
                  }`}
                >
                  {p.label}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
