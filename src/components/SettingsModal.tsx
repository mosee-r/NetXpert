import React from 'react';
import {
  X,
  Settings,
  Server,
  Layers,
  ShieldCheck,
  RotateCcw,
  Gauge,
  Sliders,
} from 'lucide-react';
import { SCORING_RULE_VERSION } from '../config/thresholds';
import { getDefaultTestEndpoints } from '../engines/testEndpoints';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  pingTarget: string;
  setPingTarget: (val: string) => void;
  dnsDomain: string;
  setDnsDomain: (val: string) => void;
  maxDownloadMb: number;
  setMaxDownloadMb: (val: number) => void;
  maxUploadMb: number;
  setMaxUploadMb: (val: number) => void;
  concurrencyCount: number;
  setConcurrencyCount: (val: number) => void;
  dataSaverMode: boolean;
  setDataSaverMode: (val: boolean) => void;
  useMlab: boolean;
  setUseMlab: (val: boolean) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  pingTarget,
  setPingTarget,
  dnsDomain,
  setDnsDomain,
  maxDownloadMb,
  setMaxDownloadMb,
  maxUploadMb,
  setMaxUploadMb,
  concurrencyCount,
  setConcurrencyCount,
  dataSaverMode,
  setDataSaverMode,
  useMlab,
  setUseMlab,
}) => {
  if (!isOpen) return null;

  const handleReset = () => {
    const defaultEndpoints = getDefaultTestEndpoints();
    setPingTarget(defaultEndpoints.ping);
    setDnsDomain('cloudflare.com');
    setMaxDownloadMb(8);
    setMaxUploadMb(4);
    setConcurrencyCount(4);
    setDataSaverMode(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 animate-in fade-in duration-200">
      <div className="bg-[#0E1A2E] border border-white/10 rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 text-white relative scrollbar-none">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center border border-cyan-500/30">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Diagnostics & Test Settings</h2>
              <span className="text-[11px] text-slate-400 font-mono">SpeedXpat v1.0 • Engine {SCORING_RULE_VERSION}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Controls */}
        <div className="space-y-4 py-4 text-xs">
          {/* M-Lab diagnostics, data saver, and stream concurrency */}
          <div className="p-3.5 rounded-xl bg-[#15253D] border border-white/5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1 pr-3">
                <span className="font-semibold text-slate-200 block flex items-center space-x-1.5">
                  <span>M-Lab deep TCP diagnostics</span>
                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    Optional
                  </span>
                </span>
                <span className="text-[11px] text-slate-400">
                  Runs separately after the Cloudflare speed test; includes M-Lab server metadata and may use extra data.
                </span>
              </div>
              <button
                onClick={() => setUseMlab(!useMlab)}
                type="button"
                role="switch"
                aria-checked={useMlab}
                aria-label="Run M-Lab deep TCP diagnostics"
                className={`w-11 h-6 shrink-0 rounded-full transition-colors p-0.5 relative cursor-pointer ${
                  useMlab ? 'bg-cyan-500' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    useMlab ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="pt-2 border-t border-white/5 flex items-center justify-between">
              <div className="min-w-0 flex-1 pr-3">
                <span className="font-semibold text-slate-200 block">Data Saver Mode</span>
                <span className="text-[11px] text-slate-400">Limits test transfer to &lt; 5 MB on mobile connections</span>
              </div>
              <button
                type="button"
                onClick={() => setDataSaverMode(!dataSaverMode)}
                role="switch"
                aria-checked={dataSaverMode}
                aria-label="Enable data saver mode"
                className={`w-11 h-6 shrink-0 rounded-full transition-colors p-0.5 relative cursor-pointer ${
                  dataSaverMode ? 'bg-cyan-500' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    dataSaverMode ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="pt-2 border-t border-white/5 flex items-center justify-between">
              <div>
                <span className="font-semibold text-slate-200 block">Stream Concurrency</span>
                <span className="text-[11px] text-slate-400">Concurrent sockets (1–8 connections)</span>
              </div>
              <select
                value={concurrencyCount}
                onChange={(e) => setConcurrencyCount(Number(e.target.value))}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-cyan-300 font-mono"
              >
                <option value={1}>1 stream</option>
                <option value={2}>2 streams</option>
                <option value={4}>4 streams (Default)</option>
                <option value={8}>8 streams (Saturate)</option>
              </select>
            </div>
          </div>

          {/* Cloudflare primary throughput endpoints and optional ping target */}
          <div className="space-y-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
              <Server className="w-3.5 h-3.5 text-cyan-400" />
              <span>Speed Test Provider</span>
            </span>
            <p className="text-[11px] text-slate-400">
              Cloudflare always measures the primary download and upload results. M-Lab runs separately for optional TCP diagnostics.
            </p>

            <div className="space-y-2 font-mono text-[11px]">
              <div className="rounded-lg border border-white/5 bg-slate-900/70 p-2.5 text-slate-300">
                <span className="block text-slate-100">Cloudflare Speed Test edge (automatic)</span>
                <span className="mt-1 block break-all text-slate-500">
                  Download: {getDefaultTestEndpoints().download}
                </span>
                <span className="block break-all text-slate-500">
                  Upload: {getDefaultTestEndpoints().upload}
                </span>
              </div>
              <div>
                <label className="text-slate-300 block mb-0.5">Optional latency probe URL:</label>
                <input
                  type="text"
                  value={pingTarget}
                  onChange={(e) => setPingTarget(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-cyan-400"
                />
              </div>

            </div>
          </div>

          {/* Data Cap Bounds */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-slate-300 block mb-1">Max Download Cap (MB):</label>
              <input
                type="number"
                min={2}
                max={40}
                value={maxDownloadMb}
                onChange={(e) => setMaxDownloadMb(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 font-mono text-slate-200"
              />
            </div>
            <div>
              <label className="text-slate-300 block mb-1">Max Upload Cap (MB):</label>
              <input
                type="number"
                min={1}
                max={25}
                value={maxUploadMb}
                onChange={(e) => setMaxUploadMb(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 font-mono text-slate-200"
              />
            </div>
          </div>

          {/* Privacy & Zero-Telemetry Guarantee */}
          <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5 text-[11px] text-slate-400 flex items-start space-x-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>Zero-Telemetry Guarantee:</strong> SpeedXpat stores all assessment history locally on your device. No user tracking, no personal location logging, and no external advertising networks.
            </p>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-white/10">
          <button
            onClick={handleReset}
            className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 text-xs flex items-center space-x-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-app-accent hover:bg-app-accent-hover text-white font-semibold text-xs transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
