import React, { useState } from 'react';
import {
  Gamepad2,
  Video,
  Tv,
  CloudUpload,
  Globe,
  Briefcase,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Sparkles,
} from 'lucide-react';
import { ActivityAssessment, ActivityRating } from '../types/scoring';

interface WorkloadSuitabilityProps {
  activities?: ActivityAssessment[];
}

export const WorkloadSuitability: React.FC<WorkloadSuitabilityProps> = ({
  activities,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Default placeholder workloads if no test has completed yet
  const placeholders = [
    {
      id: 'gaming',
      title: 'Online Gaming',
      category: 'Real-time Interactive',
      icon: Gamepad2,
      desc: 'Requires low idle ping, low jitter, and minimal bufferbloat during traffic.',
    },
    {
      id: 'conferencing',
      title: 'Video Conferencing',
      category: 'Bidirectional Audio/Video',
      icon: Video,
      desc: 'Requires balanced upload/download bandwidth and jitter < 25 ms.',
    },
    {
      id: 'streaming',
      title: '4K / HD Video Streaming',
      category: 'High-Bandwidth Media',
      icon: Tv,
      desc: 'Requires sustained download throughput (10 Mbps for HD, 25 Mbps for 4K).',
    },
    {
      id: 'transfers',
      title: 'Cloud Backup / Large Files',
      category: 'Bulk Data Transfers',
      icon: CloudUpload,
      desc: 'Requires high upstream bandwidth and stable packet delivery.',
    },
  ];

  const getRatingBadge = (rating: ActivityRating) => {
    switch (rating) {
      case 'excellent':
        return {
          label: 'Great',
          style: 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300',
          dot: 'bg-emerald-400',
        };
      case 'good':
        return {
          label: 'Good',
          style: 'bg-cyan-950/50 border-cyan-500/40 text-cyan-300',
          dot: 'bg-cyan-400',
        };
      case 'fair':
        return {
          label: 'Fair',
          style: 'bg-amber-950/50 border-amber-500/40 text-amber-300',
          dot: 'bg-amber-400',
        };
      case 'poor':
        return {
          label: 'Poor',
          style: 'bg-rose-950/50 border-rose-500/40 text-rose-300',
          dot: 'bg-rose-400',
        };
      default:
        return {
          label: 'Not Tested',
          style: 'bg-slate-800 border-slate-700 text-slate-400',
          dot: 'bg-slate-500',
        };
    }
  };

  const getActivityIcon = (id: string) => {
    switch (id) {
      case 'gaming':
        return Gamepad2;
      case 'conferencing':
        return Video;
      case 'streaming':
        return Tv;
      case 'transfers':
        return CloudUpload;
      case 'browsing':
        return Globe;
      case 'remote_work':
        return Briefcase;
      default:
        return Sparkles;
    }
  };

  return (
    <div className="my-6 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-white tracking-tight flex items-center space-x-2">
            <span>Connection Workload Suitability</span>
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800">
              Evidence-Based
            </span>
          </h3>
          <p className="text-xs text-slate-400">
            Translates raw metrics into practical online experience verdicts
          </p>
        </div>
      </div>

      {!activities || activities.length === 0 ? (
        /* Empty / Pre-test State */
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {placeholders.map((p) => {
            const Icon = p.icon;
            return (
              <div
                key={p.id}
                className="p-4 rounded-2xl bg-[#0E1A2E] border border-white/10 opacity-70 flex items-start space-x-3.5"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-800 text-slate-400 flex items-center justify-center shrink-0 border border-slate-700/60">
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-slate-300">{p.title}</h4>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                      Run Test
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 leading-snug">{p.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Completed Test: Interactive Activity Cards */
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {activities.map((act) => {
            const Icon = getActivityIcon(act.activityId);
            const badge = getRatingBadge(act.rating);
            const isExpanded = expandedId === act.activityId;

            // Highlight primary limiting factor if any
            const primaryBottleneck =
              act.bottlenecks && act.bottlenecks.length > 0 ? act.bottlenecks[0] : null;

            return (
              <div
                key={act.activityId}
                className="p-4 rounded-2xl bg-[#0E1A2E] border border-white/10 hover:border-cyan-500/30 transition-all flex flex-col justify-between shadow-lg"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-800/80 text-cyan-400 flex items-center justify-center shrink-0 border border-cyan-500/20">
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-white">{act.displayName}</h4>
                        <span className="text-[11px] text-slate-400">{act.category}</span>
                      </div>
                    </div>

                    {/* Rating Pill */}
                    <div
                      className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full border text-xs font-bold font-mono ${badge.style}`}
                    >
                      <span className={`w-2 h-2 rounded-full ${badge.dot}`} />
                      <span>{badge.label}</span>
                    </div>
                  </div>

                  {/* Summary & Bottleneck Tag */}
                  <p className="text-xs text-slate-300 my-2.5 leading-relaxed">
                    {act.summary}
                  </p>

                  {primaryBottleneck && (
                    <div className="p-2 rounded-xl bg-amber-950/30 border border-amber-800/40 text-[11px] text-amber-200/90 flex items-start space-x-1.5 my-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <span>
                        <strong className="text-amber-300">Bottleneck:</strong>{' '}
                        {primaryBottleneck}
                      </span>
                    </div>
                  )}
                </div>

                {/* Tap-expansion trigger */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : act.activityId)}
                  className="w-full mt-2 pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-400 hover:text-cyan-400 transition-colors cursor-pointer"
                >
                  <span>{isExpanded ? 'Hide Criteria & Gates' : 'View Threshold Checks'}</span>
                  {isExpanded ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>

                {/* Expanded Threshold Breakdown */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-white/5 space-y-2 animate-in fade-in duration-150">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                      Requirement Gates
                    </span>
                    <div className="space-y-1.5">
                      {act.checks.map((chk, i) => (
                        <div
                          key={i}
                          className="p-2 rounded-lg bg-slate-900/60 border border-white/5 text-[11px] flex items-center justify-between"
                        >
                          <div>
                            <span className="font-medium text-slate-300 block">{chk.label}</span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              Measured: {chk.measuredValue ?? 'N/A'} {chk.unit || ''} • Target: {chk.thresholdDescription}
                            </span>
                          </div>
                          <div>
                            {chk.status === 'pass' ? (
                              <span className="text-emerald-400 font-mono font-bold text-[10px] flex items-center space-x-0.5">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>PASS</span>
                              </span>
                            ) : chk.status === 'borderline' ? (
                              <span className="text-amber-400 font-mono font-bold text-[10px] flex items-center space-x-0.5">
                                <AlertTriangle className="w-3 h-3" />
                                <span>FAIR</span>
                              </span>
                            ) : chk.status === 'fail' ? (
                              <span className="text-rose-400 font-mono font-bold text-[10px] flex items-center space-x-0.5">
                                <XCircle className="w-3 h-3" />
                                <span>FAIL</span>
                              </span>
                            ) : (
                              <span className="text-slate-400 font-mono text-[10px]">
                                UNKNOWN
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {act.recommendations && act.recommendations.length > 0 && (
                      <div className="mt-2 text-[11px] text-slate-300">
                        <strong className="text-cyan-300">Recommendation:</strong>{' '}
                        {act.recommendations[0]}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
