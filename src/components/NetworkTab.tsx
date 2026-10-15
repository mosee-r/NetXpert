import React, { useState } from 'react';
import {
  Wifi,
  Radio,
  Signal,
  ShieldAlert,
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
import { getAndroidNativeBridge, isAndroidNativeApp } from '../engines/testEndpoints';

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
  const [clipboardError, setClipboardError] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const isAndroidApp = isAndroidNativeApp();

  const isWifi = networkInfo?.networkType === 'wifi' || networkInfo?.networkType === 'unknown';
  const isCellular = networkInfo?.networkType === 'cellular';
  const hasNetwork = Boolean(networkInfo && networkInfo.networkType !== 'unknown');
  const connectionName = !networkInfo
    ? 'Checking connection'
    : networkInfo.networkType === 'wifi'
    ? networkInfo.wifiSsid || (isAndroidApp ? 'Wi-Fi name unavailable' : 'Wi-Fi network')
    : networkInfo.networkType === 'cellular'
    ? 'Mobile data'
    : networkInfo.networkType === 'ethernet'
    ? 'Ethernet'
    : networkInfo.online
    ? 'Internet connection'
    : isAndroidApp ? 'No network connection' : 'Internet unavailable';
  const connectionStatus = !networkInfo
    ? 'Checking connection'
    : hasNetwork
    ? networkInfo.online ? 'Internet available' : 'Connected · No internet'
    : networkInfo.online ? 'Internet available' : isAndroidApp ? 'Not connected' : 'Internet unavailable';

  const copyToClipboard = async (key: string, val: string) => {
    try {
      await navigator.clipboard.writeText(val);
      setClipboardError(false);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      setClipboardError(true);
    }
  };

  const handleRefresh = async () => {
    if (onRefreshNetworkInfo) {
      setIsRefreshing(true);
      try {
        await onRefreshNetworkInfo();
        setRefreshError(false);
      } catch {
        setRefreshError(true);
      } finally {
        setTimeout(() => setIsRefreshing(false), 500);
      }
    }
  };

  // Find recent Wi-Fi and Cellular runs from history for side-by-side comparison
  const recentWifiRun = history.find((h) => h.networkInfo.networkType === 'wifi');
  const recentCellularRun = history.find((h) => h.networkInfo.networkType === 'cellular');
  const unavailable = 'Not available';
  const notExposedInBrowser = 'Not exposed by browser';
  const formatMetric = (value: number | null | undefined, unit: string) =>
    value === null || value === undefined || !Number.isFinite(value)
      ? 'Not available'
      : `${value} ${unit}`;
  const formatDeviceMetric = (value: number | null | undefined, unit: string) =>
    value === null || value === undefined || !Number.isFinite(value)
      ? isAndroidApp ? unavailable : notExposedInBrowser
      : `${value} ${unit}`;

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
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex min-h-11 items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-[#0E1A2E] hover:bg-[#15253D] border border-white/10 text-xs font-medium text-slate-300 hover:text-cyan-300 transition-all cursor-pointer disabled:opacity-50"
              title="Refresh network information and perform live ipinfo.io lookup"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
              <span>{isRefreshing ? 'Resolving...' : 'Refresh Network'}</span>
            </button>
            {refreshError && (
              <span role="alert" className="text-[10px] text-rose-300">
                Network details could not be refreshed.
              </span>
            )}
          </div>
        )}
      </div>

      {!isAndroidApp && (
        <p role="note" className="rounded-lg border border-app-divider bg-app-surface px-3 py-2 text-xs leading-5 text-app-secondary">
          Browser privacy limits access to Wi-Fi/cellular radio details, local IP, router, and DNS resolver data. Missing values are unavailable to this browser, not evidence of a network fault.
        </p>
      )}

      <section
        aria-label="Current connection"
        className="overflow-hidden rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-950/60 via-[#0E1A2E] to-[#0B1424] p-5 shadow-xl sm:p-6"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-200">
              {networkInfo?.networkType === 'cellular'
                ? <Radio className="h-5 w-5" />
                : <Wifi className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200/70">
                Current connection
              </p>
              <h3 className="mt-1 break-words text-xl font-semibold tracking-tight text-white sm:text-2xl">
                {connectionName}
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                {networkInfo?.networkType === 'wifi'
                  ? 'Wi-Fi'
                  : networkInfo?.networkType === 'cellular'
                  ? 'Mobile network'
                  : networkInfo?.networkType === 'ethernet'
                  ? 'Wired network'
                  : 'Connection details'}
              </p>
            </div>
          </div>
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border px-2.5 py-1 text-[10px] font-semibold sm:self-auto ${
              networkInfo?.online
                ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
                : networkInfo && hasNetwork
                ? 'border-amber-400/20 bg-amber-400/10 text-amber-200'
                : 'border-slate-500/20 bg-slate-500/10 text-slate-300'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${
              networkInfo?.online
                ? 'bg-emerald-400'
                : networkInfo && hasNetwork
                ? 'bg-amber-400'
                : 'bg-slate-400'
            }`} aria-hidden="true" />
            {connectionStatus}
          </span>
        </div>
        {isAndroidApp && networkInfo?.networkType === 'wifi' && !networkInfo.wifiSsid && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
            <p className="max-w-lg text-xs leading-relaxed text-slate-400">
              Enable Location Services and grant location permission to show the Wi-Fi name. SpeedXpat does not access GPS location.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => getAndroidNativeBridge()?.openLocationSettings()}
                className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-medium text-slate-300 transition-colors hover:bg-white/10"
              >
                Location settings
              </button>
              <button
                type="button"
                onClick={() => getAndroidNativeBridge()?.openApplicationSettings()}
                className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-medium text-slate-300 transition-colors hover:bg-white/10"
              >
                App permissions
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 1. ISP identity from a separate public IP-to-ASN lookup */}
      <div className="p-5 rounded-2xl bg-[#0E1A2E] border border-cyan-500/30 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <div className="flex items-center space-x-2 text-cyan-400">
            <Globe className="w-4 h-4" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              IP-to-ASN ISP Identification
            </h3>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800">
            Source: ipinfo.io API
          </span>
        </div>
        <p className="text-xs text-slate-400">
          Identifies the network announcing your public IP. This is separate from the server used for a speed test.
        </p>

        {/* IP-to-ASN and geolocation telemetry */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono">
          <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5 space-y-1">
            <span className="text-[10px] text-slate-400 block uppercase">ISP Provider</span>
            <span className="text-sm font-bold text-emerald-400 truncate block" title={networkInfo?.ispName}>
              {networkInfo?.ispName || unavailable}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5 space-y-1">
            <span className="text-[10px] text-slate-400 block uppercase">Autonomous System</span>
            <span className="text-sm font-bold text-cyan-300 truncate block" title={networkInfo?.asn}>
              {networkInfo?.asn || unavailable}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5 space-y-1">
            <span className="text-[10px] text-slate-400 block uppercase">Public IP</span>
            <span className="text-sm font-bold text-indigo-300 truncate block" title={networkInfo?.ipAddress}>
              {networkInfo?.ipAddress || unavailable}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5 space-y-1">
            <span className="text-[10px] text-slate-400 block uppercase">City & Region</span>
            <span
              className="text-sm font-bold text-slate-200 truncate block"
              title={`${networkInfo?.locationCity || ''}, ${networkInfo?.locationCountry || ''}`}
            >
              {[networkInfo?.locationCity, networkInfo?.locationCountry].filter(Boolean).join(', ') || unavailable}
            </span>
          </div>

        </div>

        {/* Detailed ASN & Geolocation Attributes with Copy */}
        <div className="space-y-2 pt-2 border-t border-white/5 text-xs">
          {[
            {
              key: 'isp_full',
              label: 'Internet Service Provider (ISP)',
              val: networkInfo?.ispName,
            },
            {
              key: 'asn_full',
              label: 'Autonomous System Number (ASN)',
              val: networkInfo?.asn,
            },
            {
              key: 'asn_org_full',
              label: 'ASN Organization / Routing Registry',
              val: networkInfo?.asnOrg,
            },
            {
              key: 'geo_location',
              label: 'Geographic Region & Country',
              val:
                [networkInfo?.locationCity, networkInfo?.locationRegion, networkInfo?.locationCountry]
                  .filter(Boolean)
                  .join(', ') || undefined,
            },
            {
              key: 'nearest_mlab_server',
              label: 'Nearest M-Lab Test Server',
              val:
                networkInfo?.nearestServer?.label ||
                [
                  networkInfo?.nearestServer?.city,
                  networkInfo?.nearestServer?.country,
                  networkInfo?.nearestServer?.hostname,
                ]
                  .filter(Boolean)
                  .join(', ') ||
                undefined,
            },
          ].map((row) => (
            <div
              key={row.key}
              className="p-2.5 rounded-xl bg-slate-900/50 border border-white/5 flex items-center justify-between"
            >
              <div>
                <span className="text-slate-400 block text-[11px]">{row.label}</span>
                <span className="font-mono text-slate-200 font-semibold">{row.val || unavailable}</span>
              </div>
              <button
                onClick={() => row.val && copyToClipboard(row.key, row.val)}
                disabled={!row.val}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
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
          {clipboardError && (
            <p role="alert" className="text-xs text-rose-300">
              Clipboard access is unavailable. You can select and copy the value instead.
            </p>
          )}
        </div>
      </div>

      {/* 2. Android Permission Context Notice */}
      {isAndroidApp && <div className="p-3.5 rounded-2xl bg-[#0E1A2E] border border-amber-500/30 text-xs text-amber-200/90 flex items-start space-x-3">
        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-amber-300 block mb-0.5">Android Location (GPS) Telemetry Notice</span>
          <p className="leading-relaxed text-slate-300">
            On Android 10+ (API 29+), system Location Services must be toggled on for applications to read raw Wi-Fi SSIDs and BSSID hardware MAC addresses. SpeedXpat never collects GPS coordinates or tracks user location.
          </p>
        </div>
      </div>}

      {/* 3. Active Link Telemetry (Wi-Fi or Cellular) */}
      <div className="p-5 rounded-2xl bg-[#0E1A2E] border border-white/10 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <div className="flex items-center space-x-2">
            {isWifi ? <Wifi className="w-4 h-4 text-cyan-400" /> : <Radio className="w-4 h-4 text-indigo-400" />}
            <h3 className="text-sm font-bold text-white">
              {!isAndroidApp && networkInfo?.networkType === 'unknown'
                ? 'Link quality'
                : isWifi ? 'Wi-Fi link quality' : isCellular ? 'Mobile link quality' : 'Link quality'}
            </h3>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
          <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5">
            <span className="text-[10px] text-slate-400 block uppercase">Reported Downlink</span>
            <span className="text-base font-bold text-cyan-300">
              {formatDeviceMetric(networkInfo?.downlinkMbps, 'Mbps')}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5">
            <span className="text-[10px] text-slate-400 block uppercase">Wi-Fi Frequency</span>
            <span className="text-base font-bold text-indigo-300">
              {formatDeviceMetric(networkInfo?.wifiFrequencyMhz, 'MHz')}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5">
            <span className="text-[10px] text-slate-400 block uppercase">Wi-Fi Signal (RSSI)</span>
            <span className="text-base font-bold text-emerald-400">
              {formatDeviceMetric(networkInfo?.wifiSignalDbm, 'dBm')}
            </span>
          </div>

        </div>

        {/* IP Addresses & Gateway Rows with copy */}
        <div className="space-y-2 pt-2 border-t border-white/5 text-xs">
          {[
            { key: 'internal_ip', label: 'Local Device IP', val: isAndroidApp ? unavailable : notExposedInBrowser },
            { key: 'gateway_ip', label: 'Default Router Gateway', val: isAndroidApp ? unavailable : notExposedInBrowser },
            { key: 'public_ip', label: 'Public IP', val: networkInfo?.ipAddress || unavailable },
            { key: 'dns_resolvers', label: 'DNS Resolvers', val: isAndroidApp ? unavailable : notExposedInBrowser },
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
                onClick={() => row.val !== unavailable && row.val !== notExposedInBrowser && row.val !== 'Checking...' && copyToClipboard(row.key, row.val)}
                disabled={row.val === unavailable || row.val === notExposedInBrowser || row.val === 'Checking...'}
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
                {formatMetric(recentWifiRun?.rawMeasurements.downloadThroughput.mbps, 'Mbps')}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block">IDLE PING</span>
              <span className="text-sm font-semibold text-emerald-400">
                {formatMetric(recentWifiRun?.rawMeasurements.idleLatency.medianMs, 'ms')}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block">BUFFERBLOAT</span>
              <span className="text-xs text-amber-300">
                {formatMetric(recentWifiRun?.rawMeasurements.loadedLatency.loadedDeltaMs, 'ms')}
              </span>
            </div>
          </div>

          {/* Cellular Column */}
          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-indigo-500/30 space-y-2">
            <div className="flex items-center space-x-1.5 text-indigo-300 font-bold border-b border-white/5 pb-1">
              <Radio className="w-3.5 h-3.5" />
              <span>Cellular Connection</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block">DOWNLOAD</span>
              <span className="text-lg font-bold text-white">
                {formatMetric(recentCellularRun?.rawMeasurements.downloadThroughput.mbps, 'Mbps')}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block">IDLE PING</span>
              <span className="text-sm font-semibold text-purple-400">
                {formatMetric(recentCellularRun?.rawMeasurements.idleLatency.medianMs, 'ms')}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block">BUFFERBLOAT</span>
              <span className="text-xs text-amber-300">
                {formatMetric(recentCellularRun?.rawMeasurements.loadedLatency.loadedDeltaMs, 'ms')}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
