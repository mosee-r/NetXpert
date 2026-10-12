import React from 'react';
import { DeviceNetworkInfo } from '../types/network';
import {
  Radio,
  Signal,
  Smartphone,
  ShieldAlert,
  Info,
  Scale,
  CheckCircle2,
} from 'lucide-react';

interface CellularViewProps {
  networkInfo: DeviceNetworkInfo | null;
  onAssessClick: () => void;
}

export const CellularView: React.FC<CellularViewProps> = ({ networkInfo, onAssessClick }) => {
  const isCellular = networkInfo?.networkType === 'cellular';

  return (
    <div className="space-y-6 text-white max-w-4xl mx-auto">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
          <Radio className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Cellular & Mobile Diagnostics</h2>
          <p className="text-xs text-slate-400">
            Compliant with Section 5.11: Cellular technology, signal limitations & comparative diagnostics
          </p>
        </div>
      </div>

      {/* Cellular State Card */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <span className="text-sm font-semibold text-slate-200">
            Mobile Transport State
          </span>
          <span className={`text-xs font-mono px-2 py-0.5 rounded border ${
            isCellular
              ? 'bg-indigo-950 text-indigo-300 border-indigo-700'
              : 'bg-slate-800 text-slate-400 border-slate-700'
          }`}>
            {isCellular ? 'Cellular Data Connected' : 'Wi-Fi / Other Active'}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-center">
          <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
            <div className="text-[10px] text-slate-400 uppercase font-mono">Cellular Profile</div>
            <div className="text-base font-bold font-mono text-indigo-300 mt-1">
              {networkInfo?.effectiveType?.toUpperCase() || '4G/LTE/5G'}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
            <div className="text-[10px] text-slate-400 uppercase font-mono">Mobile Downlink Cap</div>
            <div className="text-base font-bold font-mono text-cyan-300 mt-1">
              {networkInfo?.downlinkMbps ? `${networkInfo.downlinkMbps} Mbps` : 'Direct Test Needed'}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
            <div className="text-[10px] text-slate-400 uppercase font-mono">Modem RTT Delay</div>
            <div className="text-base font-bold font-mono text-amber-300 mt-1">
              {networkInfo?.rttMs ? `~${networkInfo.rttMs} ms` : 'Active Test Needed'}
            </div>
          </div>
        </div>
      </div>

      {/* Hardware Telemetry Constraint Notice */}
      <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 text-xs space-y-2">
        <div className="flex items-center space-x-2 text-slate-300 font-semibold">
          <ShieldAlert className="w-4 h-4 text-amber-400" />
          <span>Cellular Hardware Metrics (RSRP, RSRQ, SINR, Cell ID)</span>
        </div>
        <p className="text-slate-400 leading-relaxed">
          Detailed cellular radio metrics such as Reference Signal Received Power (RSRP), Reference Signal Received Quality (RSRQ), Signal-to-Interference-plus-Noise Ratio (SINR), and physical Cell ID require native Android <code>TelephonyManager.getAllCellInfo()</code> calls with <code>READ_PHONE_STATE</code> permission. NetXpert strictly adheres to our core principle: <em>Never invent or silently substitute fake radio metrics.</em>
        </p>
      </div>

      {/* Wi-Fi vs Cellular Comparison Guide */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center space-x-2">
          <Scale className="w-5 h-5 text-cyan-400" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Wi-Fi vs Cellular Comparison Guide
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-300">
          <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 space-y-2">
            <h4 className="font-semibold text-cyan-300 text-sm">When Wi-Fi is Superior</h4>
            <ul className="space-y-1.5 list-disc list-inside text-slate-300">
              <li>Low base latency for competitive esports gaming.</li>
              <li>Uncapped data transfers for multi-gigabyte downloads.</li>
              <li>Multiple simultaneous 4K streams on high-speed fiber.</li>
            </ul>
          </div>
          <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 space-y-2">
            <h4 className="font-semibold text-indigo-300 text-sm">When Cellular is Superior</h4>
            <ul className="space-y-1.5 list-disc list-inside text-slate-300">
              <li>Public or crowded Wi-Fi networks suffering from packet collisions.</li>
              <li>Homes with severe router bufferbloat causing lag spikes.</li>
              <li>Fast 5G carrier coverage offering higher upload than ADSL.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
