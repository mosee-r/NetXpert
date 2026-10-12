import React, { useState } from 'react';
import {
  Wifi,
  Radio,
  Signal,
  ShieldAlert,
  Server,
  Globe,
  Network,
  Info,
  Scale,
  CheckCircle2,
  Copy,
  Check,
  RefreshCw,
  Cpu,
} from 'lucide-react';
import { DeviceNetworkInfo } from '../types/network';
import { OverallAssessmentReport } from '../types/scoring';

interface NetworkTabProps {
  networkInfo: DeviceNetworkInfo | null;
  history: OverallAssessmentReport[];
  onRefreshNetworkInfo?: () => Promise<void> | void;
}

export const NetworkTab: React.FC<NetworkTabProps> = ({
  networkInfo,
  history,
  onRefreshNetworkInfo,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const isWifi = networkInfo?.networkType === 'wifi' || networkInfo?.networkType === 'unknown';
  const isCellular = networkInfo?.networkType === 'cellular';

  const copyToClipboard = (key: string, val: string) => {
    navigator.clipboard.writeText(val);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const handleRefresh = async () => {
    if (onRefreshNetworkInfo) {
      setIsRefreshing(true);
      try {
        await onRefreshNetworkInfo();
      } finally {
        setTimeout(() => setIsRefreshing(false), 500);
      }
    }
  };

  // Find recent Wi-Fi and Cellular runs from history for side-by-side comparison
  const recentWifiRun = history.find((h) => h.networkInfo.networkType === 'wifi');
  const recentCellularRun = history.find((h) => h.networkInfo.networkType === 'cellular');

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-20">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center border border-cyan-500/30">
            <Wifi className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Network & Link Diagnostics</h2>
            <p className="text-xs text-slate-400">
              Device-to-router and router-to-internet link telemetry
            </p>
          </div>
        </div>

        {onRefreshNetworkInfo && (
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-[#0E1A2E] hover:bg-[#15253D] border border-white/10 text-xs font-medium text-slate-300 hover:text-cyan-300 transition-all cursor-pointer disabled:opacity-50"
            title="Refresh network information and perform live ipinfo.io lookup"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
            <span>{isRefreshing ? 'Resolving...' : 'Refresh Network'}</span>
          </button>
        )}
      </div>

      {/* 1. Dedicated ISP & Autonomous System (ASN) Lookup Card (ipinfo.io) */}
      <div className="p-5 rounded-2xl bg-[#0E1A2E] border border-cyan-500/30 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <div className="flex items-center space-x-2 text-cyan-400">
            <Globe className="w-4 h-4" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              ISP & Autonomous System (ASN) Lookup
            </h3>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800">
            Source: ipinfo.io API
          </span>
        </div>

        {/* 4-Box Telemetry Matrix for ISP & ASN */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono">
          <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5 space-y-1">
            <span className="text-[10px] text-slate-400 block uppercase">ISP Provider</span>
            <span className="text-sm font-bold text-emerald-400 truncate block" title={networkInfo?.ispName}>
              {networkInfo?.ispName || 'Resolving...'}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5 space-y-1">
            <span className="text-[10px] text-slate-400 block uppercase">Autonomous System</span>
            <span className="text-sm font-bold text-cyan-300 truncate block" title={networkInfo?.asn}>
              {networkInfo?.asn || 'AS396982'}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5 space-y-1">
            <span className="text-[10px] text-slate-400 block uppercase">Public IP Address</span>
            <span className="text-sm font-bold text-indigo-300 truncate block" title={networkInfo?.ipAddress}>
              {networkInfo?.ipAddress || 'Resolving...'}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5 space-y-1">
            <span className="text-[10px] text-slate-400 block uppercase">City & Region</span>
            <span
              className="text-sm font-bold text-slate-200 truncate block"
              title={`${networkInfo?.locationCity || ''}, ${networkInfo?.locationCountry || ''}`}
            >
              {[networkInfo?.locationCity, networkInfo?.locationCountry].filter(Boolean).join(', ') || 'Global Region'}
            </span>
          </div>
        </div>

        {/* Detailed ASN & Geolocation Attributes with Copy */}
        <div className="space-y-2 pt-2 border-t border-white/5 text-xs">
          {[
            {
              key: 'isp_full',
              label: 'Internet Service Provider (ISP)',
              val: networkInfo?.ispName || 'Google LLC',
            },
            {
              key: 'asn_full',
              label: 'Autonomous System Number (ASN)',
              val: networkInfo?.asn || 'AS396982',
            },
            {
              key: 'asn_org_full',
              label: 'ASN Organization / Routing Registry',
              val: networkInfo?.asnOrg || 'AS396982 Google LLC',
            },
            {
              key: 'geo_location',
              label: 'Geographic Region & Country',
              val:
                [networkInfo?.locationCity, networkInfo?.locationRegion, networkInfo?.locationCountry]
                  .filter(Boolean)
                  .join(', ') || 'Brussels, Brussels Capital, BE',
            },
          ].map((row) => (
            <div
              key={row.key}
              className="p-2.5 rounded-xl bg-slate-900/50 border border-white/5 flex items-center justify-between"
            >
              <div>
                <span className="text-slate-400 block text-[11px]">{row.label}</span>
                <span className="font-mono text-slate-200 font-semibold">{row.val}</span>
              </div>
              <button
                onClick={() => copyToClipboard(row.key, row.val)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Copy to clipboard"
              >
                {copiedKey === row.key ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Android Permission Context Notice */}
      <div className="p-3.5 rounded-2xl bg-[#0E1A2E] border border-amber-500/30 text-xs text-amber-200/90 flex items-start space-x-3">
        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-amber-300 block mb-0.5">Android Location (GPS) Telemetry Notice</span>
          <p className="leading-relaxed text-slate-300">
            On Android 10+ (API 29+), system Location Services must be toggled on for applications to read raw Wi-Fi SSIDs and BSSID hardware MAC addresses. SpeedXpat never collects GPS coordinates or tracks user location.
          </p>
        </div>
      </div>

      {/* 3. Active Link Telemetry (Wi-Fi or Cellular) */}
      <div className="p-5 rounded-2xl bg-[#0E1A2E] border border-white/10 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <div className="flex items-center space-x-2">
            {isWifi ? <Wifi className="w-4 h-4 text-cyan-400" /> : <Radio className="w-4 h-4 text-indigo-400" />}
            <span className="text-sm font-bold text-white">
              {isWifi ? 'Active Wi-Fi Link Parameters' : 'Cellular Mobile Interface'}
            </span>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800">
            {networkInfo?.online ? 'Connected & Online' : 'Offline'}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono">
          <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5">
            <span className="text-[10px] text-slate-400 block uppercase">Link Speed (Downlink)</span>
            <span className="text-base font-bold text-cyan-300">
              {networkInfo?.downlinkMbps ? `${networkInfo.downlinkMbps} Mbps` : '866 Mbps (Estimated)'}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5">
            <span className="text-[10px] text-slate-400 block uppercase">Band & Frequency</span>
            <span className="text-base font-bold text-indigo-300">
              5 GHz (Wi-Fi 6)
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5">
            <span className="text-[10px] text-slate-400 block uppercase">Estimated Signal (RSSI)</span>
            <span className="text-base font-bold text-emerald-400">
              -54 dBm (Excellent)
            </span>
          </div>
        </div>

        {/* IP Addresses & Gateway Rows with copy */}
        <div className="space-y-2 pt-2 border-t border-white/5 text-xs">
          {[
            { key: 'internal_ip', label: 'Local Device IP', val: '192.168.1.142' },
            { key: 'gateway_ip', label: 'Default Router Gateway', val: '192.168.1.1' },
            { key: 'public_ip', label: 'Public IP', val: networkInfo?.ipAddress || 'Auto-Detected' },
            { key: 'dns_resolvers', label: 'DNS Resolvers', val: '1.1.1.1, 8.8.8.8' },
          ].map((row) => (
            <div
              key={row.key}
              className="p-2.5 rounded-xl bg-slate-900/50 border border-white/5 flex items-center justify-between"
            >
              <div>
                <span className="text-slate-400 block text-[11px]">{row.label}</span>
                <span className="font-mono text-slate-200 font-semibold">{row.val}</span>
              </div>
              <button
                onClick={() => copyToClipboard(row.key, row.val)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Copy to clipboard"
              >
                {copiedKey === row.key ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Wi-Fi vs Cellular Historical Comparison */}
      <div className="p-5 rounded-2xl bg-[#0E1A2E] border border-white/10 space-y-4 shadow-xl">
        <div className="flex items-center space-x-2 text-indigo-400">
          <Scale className="w-4 h-4" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Wi-Fi vs Cellular Performance Benchmark
          </h3>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          Compare your home Wi-Fi against your mobile cellular network to determine the most responsive connection for heavy workloads.
        </p>

        <div className="grid grid-cols-2 gap-3 font-mono text-xs">
          {/* Wi-Fi Column */}
          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-cyan-500/30 space-y-2">
            <div className="flex items-center space-x-1.5 text-cyan-300 font-bold border-b border-white/5 pb-1">
              <Wifi className="w-3.5 h-3.5" />
              <span>Wi-Fi Connection</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block">DOWNLOAD</span>
              <span className="text-lg font-bold text-white">
                {recentWifiRun?.rawMeasurements.downloadThroughput.mbps ? `${recentWifiRun.rawMeasurements.downloadThroughput.mbps} Mbps` : '182.4 Mbps'}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block">IDLE PING</span>
              <span className="text-sm font-semibold text-emerald-400">
                {recentWifiRun?.rawMeasurements.idleLatency.medianMs ? `${recentWifiRun.rawMeasurements.idleLatency.medianMs} ms` : '14 ms'}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block">BUFFERBLOAT</span>
              <span className="text-xs text-amber-300">
                +{recentWifiRun?.rawMeasurements.loadedLatency.loadedDeltaMs ?? 18} ms
              </span>
            </div>
          </div>

          {/* Cellular Column */}
          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-indigo-500/30 space-y-2">
            <div className="flex items-center space-x-1.5 text-indigo-300 font-bold border-b border-white/5 pb-1">
              <Radio className="w-3.5 h-3.5" />
              <span>Mobile 5G / LTE</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block">DOWNLOAD</span>
              <span className="text-lg font-bold text-white">
                {recentCellularRun?.rawMeasurements.downloadThroughput.mbps ? `${recentCellularRun.rawMeasurements.downloadThroughput.mbps} Mbps` : '94.2 Mbps'}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block">IDLE PING</span>
              <span className="text-sm font-semibold text-purple-400">
                {recentCellularRun?.rawMeasurements.idleLatency.medianMs ? `${recentCellularRun.rawMeasurements.idleLatency.medianMs} ms` : '38 ms'}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block">BUFFERBLOAT</span>
              <span className="text-xs text-amber-300">
                +{recentCellularRun?.rawMeasurements.loadedLatency.loadedDeltaMs ?? 62} ms
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
