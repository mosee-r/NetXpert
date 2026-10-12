import React, { useState } from 'react';
import {
  Gamepad2,
  Film,
  Video,
  Globe,
  Briefcase,
  DownloadCloud,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  XCircle,
  Lightbulb,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import { ActivityAssessment, ActivityRating, ConfidenceLevel } from '../types/scoring';

interface ActivityCardProps {
  assessment: ActivityAssessment;
  defaultExpanded?: boolean;
}

export const ActivityCard: React.FC<ActivityCardProps> = ({
  assessment,
  defaultExpanded = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // Icon mapping
  const getIcon = () => {
    switch (assessment.activityId) {
      case 'gaming':
        return Gamepad2;
      case 'streaming':
        return Film;
      case 'conferencing':
        return Video;
      case 'browsing':
        return Globe;
      case 'remote_work':
        return Briefcase;
      case 'transfers':
        return DownloadCloud;
      default:
        return Globe;
    }
  };

  const Icon = getIcon();

  // Rating badge styling
  const getRatingStyle = (rating: ActivityRating) => {
    switch (rating) {
      case 'excellent':
        return {
          bg: 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300',
          indicator: 'bg-emerald-400',
          label: 'EXCELLENT',
        };
      case 'good':
        return {
          bg: 'bg-cyan-950/50 border-cyan-500/40 text-cyan-300',
          indicator: 'bg-cyan-400',
          label: 'GOOD',
        };
      case 'fair':
        return {
          bg: 'bg-amber-950/50 border-amber-500/40 text-amber-300',
          indicator: 'bg-amber-400',
          label: 'FAIR',
        };
      case 'poor':
        return {
          bg: 'bg-rose-950/50 border-rose-500/40 text-rose-300',
          indicator: 'bg-rose-400',
          label: 'POOR',
        };
      case 'insufficient_data':
      default:
        return {
          bg: 'bg-slate-800 border-slate-700 text-slate-400',
          indicator: 'bg-slate-500',
          label: 'INSUFFICIENT DATA',
        };
    }
  };

  const ratingStyle = getRatingStyle(assessment.rating);

  // Confidence styling
  const getConfidenceStyle = (conf: ConfidenceLevel) => {
    switch (conf) {
      case 'high':
        return 'text-emerald-400 border-emerald-800/60 bg-emerald-950/30';
      case 'medium':
        return 'text-amber-300 border-amber-800/60 bg-amber-950/30';
      case 'low':
        return 'text-rose-400 border-rose-800/60 bg-rose-950/30';
    }
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-5 text-white shadow-lg transition-all">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700/80 text-cyan-400 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-base text-white">{assessment.displayName}</h3>
            <p className="text-xs text-slate-400">{assessment.category}</p>
          </div>
        </div>

        {/* Rating & Confidence Badges */}
        <div className="flex flex-col items-end space-y-1">
          <div
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold font-mono tracking-wider ${ratingStyle.bg}`}
          >
            <span className={`w-2 h-2 rounded-full ${ratingStyle.indicator}`} />
            <span>{ratingStyle.label}</span>
          </div>
          <div
            className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded-full border ${getConfidenceStyle(
              assessment.confidence
            )}`}
            title={
              assessment.confidenceReasons.length > 0
                ? assessment.confidenceReasons.join('; ')
                : 'High sample confidence'
            }
          >
            {assessment.confidence} Confidence
          </div>
        </div>
      </div>

      {/* Plain Language Summary */}
      <p className="text-sm text-slate-300 my-3 leading-relaxed">
        {assessment.summary}
      </p>

      {/* Primary Bottleneck Alert (if any) */}
      {assessment.bottlenecks.length > 0 && (
        <div className="mb-3 p-2.5 rounded-xl bg-amber-950/30 border border-amber-700/40 text-xs text-amber-200/90 flex items-start space-x-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-amber-300">Identified Limiting Factor: </span>
            <span>{assessment.bottlenecks.join('; ')}</span>
          </div>
        </div>
      )}

      {/* Expand / Collapse Details Trigger */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 hover:text-cyan-400 transition-colors"
      >
        <span>{isExpanded ? 'Hide Evidence & Checks' : 'View Measurements & Checks'}</span>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
      </button>

      {/* Expanded Details Section */}
      {isExpanded && (
        <div className="mt-4 pt-3 border-t border-slate-800 space-y-4 animate-in fade-in duration-150">
          {/* Requirement Checks Table */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Requirement Gates
            </h4>
            <div className="space-y-2">
              {assessment.checks.map((chk, i) => {
                const getStatusBadge = () => {
                  switch (chk.status) {
                    case 'pass':
                      return (
                        <span className="flex items-center space-x-1 text-emerald-400 bg-emerald-950/40 border border-emerald-800/60 px-2 py-0.5 rounded text-[11px] font-mono">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>PASS</span>
                        </span>
                      );
                    case 'borderline':
                      return (
                        <span className="flex items-center space-x-1 text-amber-300 bg-amber-950/40 border border-amber-800/60 px-2 py-0.5 rounded text-[11px] font-mono">
                          <AlertTriangle className="w-3 h-3" />
                          <span>BORDERLINE</span>
                        </span>
                      );
                    case 'fail':
                      return (
                        <span className="flex items-center space-x-1 text-rose-400 bg-rose-950/40 border border-rose-800/60 px-2 py-0.5 rounded text-[11px] font-mono">
                          <XCircle className="w-3 h-3" />
                          <span>FAIL</span>
                        </span>
                      );
                    case 'unknown':
                    default:
                      return (
                        <span className="flex items-center space-x-1 text-slate-400 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded text-[11px] font-mono">
                          <HelpCircle className="w-3 h-3" />
                          <span>UNKNOWN</span>
                        </span>
                      );
                  }
                };

                return (
                  <div
                    key={i}
                    className="p-2.5 rounded-xl bg-slate-800/50 border border-slate-800 text-xs flex flex-col space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-200">{chk.label}</span>
                      {getStatusBadge()}
                    </div>
                    <div className="flex items-baseline space-x-2 text-[11px] text-slate-400 font-mono">
                      <span>Measured: {chk.measuredValue !== undefined && chk.measuredValue !== null ? `${chk.measuredValue} ${chk.unit || ''}` : 'N/A'}</span>
                      <span className="text-slate-600">|</span>
                      <span>Target: {chk.thresholdDescription}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">{chk.explanation}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Actionable Recommendations */}
          {assessment.recommendations.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center space-x-1.5">
                <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                <span>Recommendations</span>
              </h4>
              <ul className="space-y-1.5 text-xs text-slate-300">
                {assessment.recommendations.map((rec, idx) => (
                  <li key={idx} className="flex items-start space-x-2">
                    <span className="text-cyan-400 mt-0.5 font-bold">•</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Confidence Breakdown Notes */}
          {assessment.confidenceReasons.length > 0 && (
            <div className="text-[11px] text-slate-400 bg-slate-800/40 p-2 rounded-lg border border-slate-700/40">
              <span className="font-semibold text-slate-300">Confidence factors: </span>
              {assessment.confidenceReasons.join(', ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
