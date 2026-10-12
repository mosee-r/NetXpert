import React from 'react';
import { DeviceNetworkInfo } from '../types/network';
import {
  Wifi,
  Signal,
  CheckCircle2,
  AlertTriangle,
  Info,
  Radio,
  Layers,
} from 'lucide-react';

interface WifiViewProps {
  networkInfo: DeviceNetworkInfo | null;
  onAssessClick: () => void;
}

export const WifiView: React.FC<WifiViewProps> = ({ networkInfo, onAssessClick }) => {
  const isWifi = networkInfo?.networkType === 'wifi' || networkInfo?.networkType === 'unknown';

  return (
    <div className="space-y-6 text-white max-w-4xl mx-auto">
      {/* Title */}
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center border border-cyan-500/30">
          <Wifi className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Wi-Fi Diagnostics & Interface Details</h2>
          <p className="text-xs text-slate-400">
            Compliant with Section 5.10: Genuine interface telemetry & hardware constraints
          </p>
        </div>
      </div>

      {/* Connection State Card */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <span className="text-sm font-semibold text-slate-200">
            Local Link Telemetry
          </span>
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">
            {isWifi ? 'Wi-Fi Interface Active' : 'Non-Wi-Fi Active'}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
            <div className="text-[10px] text-slate-400 uppercase font-mono">Link Speed (Downlink)</div>
            <div className="text-lg font-bold font-mono text-cyan-300 mt-1">
              {networkInfo?.downlinkMbps ? `${networkInfo.downlinkMbps} Mbps` : 'Exposed via Test'}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
            <div className="text-[10px] text-slate-400 uppercase font-mono">Link Round-Trip (RTT)</div>
            <div className="text-lg font-bold font-mono text-indigo-300 mt-1">
              {networkInfo?.rttMs ? `~${networkInfo.rttMs} ms` : 'Measured via Ping'}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
            <div className="text-[10px] text-slate-400 uppercase font-mono">Data Saver Mode</div>
            <div className="text-lg font-bold font-mono text-slate-300 mt-1">
              {networkInfo?.saveData ? 'Enabled' : 'Disabled'}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
            <div className="text-[10px] text-slate-400 uppercase font-mono">Public IPv4/IPv6</div>
            <div className="text-sm font-bold font-mono text-emerald-300 mt-1 truncate">
              {networkInfo?.ipAddress || 'Active'}
            </div>
          </div>
        </div>
      </div>

      {/* Honest Limitations Box (Spec Rule: Truth over appearance) */}
      <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 text-xs space-y-2">
        <div className="flex items-center space-x-2 text-slate-300 font-semibold">
          <Info className="w-4 h-4 text-cyan-400" />
          <span>Android & Browser Platform Telemetry Transparency</span>
        </div>
        <p className="text-slate-400 leading-relaxed">
          Standard Web sandboxes do not have direct access to native Android <code>WifiManager.getScanResults()</code> or hardware BSSID registers, which require <code>ACCESS_FINE_LOCATION</code> and native OS privileges. NetXpert never fabricates fake RSSI dBm signal graphs. For exact link speeds and loaded latency, run the guided network assessment.
        </p>
      </div>

      {/* Wi-Fi Troubleshooting Checklist */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">
          Wi-Fi Optimization & Troubleshooting Guide
        </h3>
        <div className="space-y-3 text-xs text-slate-300">
          <div className="flex items-start space-x-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/40">
            <Radio className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-white">2.4 GHz vs 5 GHz Band:</strong> 5 GHz delivers dramatically higher speeds and lower jitter with less interference, but has shorter range. Connect to 5 GHz for gaming and 4K streaming.
            </div>
          </div>
          <div className="flex items-start space-x-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/40">
            <Signal className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-white">Access Point Placement:</strong> Position your router in an elevated, central location. Avoid placing it behind thick walls, metal cabinets, or near microwaves.
            </div>
          </div>
          <div className="flex items-start space-x-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/40">
            <Layers className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-white">Router Queue Management (Bufferbloat):</strong> If your ping rises by more than 50 ms under load, enable Smart Queue Management (SQM) like Cake or FQ-CoDel on your router.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
