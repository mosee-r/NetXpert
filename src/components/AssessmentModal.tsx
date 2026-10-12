import React from 'react';
import {
  ShieldAlert,
  Zap,
  Activity,
  Layers,
  HardDriveDownload,
  Upload,
  Gauge,
  X,
} from 'lucide-react';

interface AssessmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStart: () => void;
  networkType: string;
}

export const AssessmentModal: React.FC<AssessmentModalProps> = ({
  isOpen,
  onClose,
  onStart,
  networkType,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-lg w-full p-6 text-white shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center border border-cyan-500/30">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Start Network Assessment</h2>
            <p className="text-xs text-slate-400">
              Active Connection: <span className="text-cyan-300 font-medium capitalize">{networkType}</span>
            </p>
          </div>
        </div>

        {/* Data Usage & Safety Notice */}
        <div className="bg-amber-950/30 border border-amber-600/30 rounded-xl p-3.5 mb-5 text-xs text-amber-200/90 flex items-start space-x-3">
          <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-300 mb-0.5">Data Usage & Privacy Disclosure</p>
            <p className="leading-relaxed">
              This assessment will transfer approximately <strong>10 to 14 MB</strong> of test data across bounded download and upload streams. You can cancel at any moment. No personal identifiers or browsing history are accessed or stored remotely.
            </p>
          </div>
        </div>

        {/* Diagnostic Sequence Steps */}
        <div className="space-y-2 mb-6">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Sequential Diagnostic Routine
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div className="flex items-center space-x-2 p-2 rounded-lg bg-slate-800/60 border border-slate-700/40">
              <Zap className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>1. DNS Resolution Speed</span>
            </div>
            <div className="flex items-center space-x-2 p-2 rounded-lg bg-slate-800/60 border border-slate-700/40">
              <Activity className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>2. Multi-sample Ping & Jitter</span>
            </div>
            <div className="flex items-center space-x-2 p-2 rounded-lg bg-slate-800/60 border border-slate-700/40">
              <HardDriveDownload className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>3. Bounded Download Stream</span>
            </div>
            <div className="flex items-center space-x-2 p-2 rounded-lg bg-slate-800/60 border border-slate-700/40">
              <Upload className="w-4 h-4 text-blue-400 shrink-0" />
              <span>4. Bounded Upload Stream</span>
            </div>
            <div className="flex items-center space-x-2 p-2 rounded-lg bg-slate-800/60 border border-slate-700/40">
              <Gauge className="w-4 h-4 text-amber-400 shrink-0" />
              <span>5. Bufferbloat (Ping Under Load)</span>
            </div>
            <div className="flex items-center space-x-2 p-2 rounded-lg bg-slate-800/60 border border-slate-700/40">
              <Layers className="w-4 h-4 text-purple-400 shrink-0" />
              <span>6. Activity Capability Scoring</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end space-x-3 pt-2 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs sm:text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onClose();
              onStart();
            }}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-medium text-xs sm:text-sm shadow-lg shadow-cyan-500/20 transition-all flex items-center space-x-2"
          >
            <Activity className="w-4 h-4" />
            <span>Start Full Assessment</span>
          </button>
        </div>
      </div>
    </div>
  );
};
