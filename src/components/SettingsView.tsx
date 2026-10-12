import React, { useState } from 'react';
import {
  Settings,
  Server,
  Layers,
  Save,
  RotateCcw,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { THRESHOLDS, SCORING_RULE_VERSION } from '../config/thresholds';

interface SettingsViewProps {
  pingTarget: string;
  setPingTarget: (val: string) => void;
  downloadTarget: string;
  setDownloadTarget: (val: string) => void;
  uploadTarget: string;
  setUploadTarget: (val: string) => void;
  dnsDomain: string;
  setDnsDomain: (val: string) => void;
  maxDownloadMb: number;
  setMaxDownloadMb: (val: number) => void;
  maxUploadMb: number;
  setMaxUploadMb: (val: number) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  pingTarget,
  setPingTarget,
  downloadTarget,
  setDownloadTarget,
  uploadTarget,
  setUploadTarget,
  dnsDomain,
  setDnsDomain,
  maxDownloadMb,
  setMaxDownloadMb,
  maxUploadMb,
  setMaxUploadMb,
}) => {
  const [isSaved, setIsSaved] = useState(false);

  const handleResetDefaults = () => {
    setPingTarget('/api/ping');
    setDownloadTarget('/api/speedtest/download');
    setUploadTarget('/api/speedtest/upload');
    setDnsDomain('cloudflare.com');
    setMaxDownloadMb(8);
    setMaxUploadMb(4);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleSave = () => {
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  return (
    <div className="space-y-6 text-white max-w-4xl mx-auto">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-xl bg-slate-800 text-slate-300 flex items-center justify-center border border-slate-700">
          <Settings className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Diagnostic & Target Settings</h2>
          <p className="text-xs text-slate-400">
            Compliant with Section 5.8 & 5.14: User-owned servers & scoring engine rules
          </p>
        </div>
      </div>

      {/* Target Server Configuration */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center space-x-2 text-cyan-400">
          <Server className="w-4 h-4" />
          <h3 className="font-semibold text-white text-sm">Diagnostic Test Endpoints</h3>
        </div>
        <p className="text-xs text-slate-400">
          Technicians may configure user-owned or regional servers to eliminate third-party CDN biases.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="text-slate-300 block mb-1 font-medium">Ping / Latency Probe Target:</label>
            <input
              type="text"
              value={pingTarget}
              onChange={(e) => setPingTarget(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 font-mono text-slate-200"
            />
          </div>
          <div>
            <label className="text-slate-300 block mb-1 font-medium">DNS Lookup Test Domain:</label>
            <input
              type="text"
              value={dnsDomain}
              onChange={(e) => setDnsDomain(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 font-mono text-slate-200"
            />
          </div>
          <div>
            <label className="text-slate-300 block mb-1 font-medium">Download Throughput Target:</label>
            <input
              type="text"
              value={downloadTarget}
              onChange={(e) => setDownloadTarget(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 font-mono text-slate-200"
            />
          </div>
          <div>
            <label className="text-slate-300 block mb-1 font-medium">Upload Discard Target:</label>
            <input
              type="text"
              value={uploadTarget}
              onChange={(e) => setUploadTarget(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 font-mono text-slate-200"
            />
          </div>
        </div>

        {/* Data Cap Settings */}
        <div className="pt-2 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="text-slate-300 block mb-1 font-medium">
              Max Download Payload Cap (MB):
            </label>
            <input
              type="number"
              min={1}
              max={30}
              value={maxDownloadMb}
              onChange={(e) => setMaxDownloadMb(Number(e.target.value))}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 font-mono text-slate-200"
            />
          </div>
          <div>
            <label className="text-slate-300 block mb-1 font-medium">
              Max Upload Payload Cap (MB):
            </label>
            <input
              type="number"
              min={1}
              max={20}
              value={maxUploadMb}
              onChange={(e) => setMaxUploadMb(Number(e.target.value))}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 font-mono text-slate-200"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <button
            onClick={handleResetDefaults}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 flex items-center space-x-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center space-x-1.5"
          >
            {isSaved ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            <span>{isSaved ? 'Settings Saved' : 'Save Changes'}</span>
          </button>
        </div>
      </div>

      {/* Scoring Engine Specifications */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div className="flex items-center space-x-2 text-indigo-400">
            <Layers className="w-4 h-4" />
            <h3 className="font-semibold text-white text-sm">Scoring Engine Reference</h3>
          </div>
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-indigo-950 border border-indigo-800 text-indigo-300">
            {SCORING_RULE_VERSION}
          </span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          SpeedXpat implements transparent requirement gates rather than opaque averages. For example, gaming ratings require both low base latency (≤ 65 ms) and low bufferbloat (≤ +70 ms under load); high download bandwidth never masks severe jitter or bufferbloat.
        </p>

        <div className="text-xs font-mono space-y-1.5 text-slate-400 bg-slate-800/40 p-3 rounded-xl border border-slate-800">
          <div>• Gaming: Latency ≤ {THRESHOLDS.gaming.latency.goodMaxMs} ms, Jitter ≤ {THRESHOLDS.gaming.jitter.goodMaxMs} ms, Bufferbloat ≤ +{THRESHOLDS.gaming.loadedLatencyDelta.goodMaxDeltaMs} ms</div>
          <div>• Streaming: HD ≥ {THRESHOLDS.streaming.hd1080pMinMbps} Mbps, 4K UHD ≥ {THRESHOLDS.streaming.ultraHd4kMinMbps} Mbps</div>
          <div>• Conferencing: Download ≥ {THRESHOLDS.conferencing.downloadMinMbps} Mbps, Upload ≥ {THRESHOLDS.conferencing.uploadMinMbps} Mbps, Latency ≤ {THRESHOLDS.conferencing.latencyMaxMs} ms</div>
          <div>• Browsing: DNS Lookup ≤ {THRESHOLDS.browsing.dnsLookupMaxMs} ms, Latency ≤ {THRESHOLDS.browsing.latencyMaxMs} ms</div>
          <div>• Remote Work / RDP: Latency ≤ {THRESHOLDS.remoteWork.latencyMaxMs} ms, Download ≥ {THRESHOLDS.remoteWork.downloadMinMbps} Mbps</div>
        </div>
      </div>
    </div>
  );
};
