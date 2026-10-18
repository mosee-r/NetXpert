import React, { useEffect, useRef, useState } from 'react';
import {
  Wifi,
  Radio,
  Globe,
  Network,
  Scale,
  Copy,
  Check,
  RefreshCw,
  ChevronDown,
  Play,
  XCircle,
  Activity,
} from 'lucide-react';
import { DeviceNetworkInfo, ThroughputSummary } from '../types/network';
import { OverallAssessmentReport } from '../types/scoring';
import { getAndroidFeatureState, getAndroidNativeBridge, isAndroidNativeApp } from '../engines/testEndpoints';
import { locateNearestMlabServer, measureMlabThroughput, MlabServerInfo } from '../services/mlabService';
import { maskIpAddress } from '../utils/privacy';
import {
  cacheAccessPointVendor,
  getAccessPointOui,
  getCachedAccessPointVendor,
} from '../services/accessPointVendorService';

interface NetworkTabProps {
  networkInfo: DeviceNetworkInfo | null;
  history: OverallAssessmentReport[];
  onRefreshNetworkInfo?: () => Promise<void> | void;
}

// Helper to get primary (last/largest) throughput from array
function getPrimaryThroughput(results: any[] | undefined) {
  if (!results || results.length === 0) return null;
  return results[results.length - 1] || results[0];
}

interface AccessPointVendorLookupEventDetail {
  oui: string;
  vendor: string | null;
  status: 'found' | 'not-found' | 'error' | 'offline' | 'invalid';
}

type MlabRunState = 'idle' | 'locating' | 'download' | 'upload' | 'complete' | 'error' | 'cancelled';

interface MlabRun {
  state: MlabRunState;
  server?: MlabServerInfo;
  download?: ThroughputSummary;
  upload?: ThroughputSummary;
  currentMbps?: number;
  currentRttMs?: number;
  error?: string;
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
  const [showSensitiveDetails, setShowSensitiveDetails] = useState(false);
  const [mlabRun, setMlabRun] = useState<MlabRun>({ state: 'idle' });
  const mlabAbortController = useRef<AbortController | null>(null);
  const isAndroidApp = isAndroidNativeApp();
  const nativeFeatureState = getAndroidFeatureState();
  const canRequestWifiAccess = nativeFeatureState.isNativeApp && nativeFeatureState.canRequestAccess;

  const isWifi = networkInfo?.networkType === 'wifi';
  const isCellular = networkInfo?.networkType === 'cellular';
  const accessPointOui = getAccessPointOui(networkInfo?.wifiBssid);
  const [accessPointVendor, setAccessPointVendor] = useState<{
    oui?: string;
    vendor?: string;
    status: 'unavailable' | 'offline' | 'loading' | 'found' | 'not-found' | 'error';
  }>({ status: 'unavailable' });
  const hasNetwork = Boolean(networkInfo && networkInfo.networkType !== 'unknown');
  const connectionName = !networkInfo
    ? 'Checking connection'
    : networkInfo.networkType === 'unknown'
    ? (isAndroidApp ? 'Connection unavailable' : 'Network type unavailable')
    : networkInfo.networkType === 'wifi'
    ? 'Wi-Fi'
    : networkInfo.networkType === 'cellular'
    ? 'Mobile data'
    : networkInfo.networkType === 'ethernet'
    ? 'Ethernet'
    : networkInfo.online
    ? 'Internet connection'
    : isAndroidApp ? 'No network connection' : 'Internet unavailable';
  const connectionStatus = !networkInfo
    ? 'Checking connection'
    : networkInfo.networkType === 'unknown'
    ? networkInfo.online ? 'Internet available' : 'Internet unavailable'
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

  const handleMlabRun = async () => {
    if (!networkInfo?.online || mlabAbortController.current) return;
    const controller = new AbortController();
    mlabAbortController.current = controller;
    setMlabRun({ state: 'locating' });

    try {
      const server = await locateNearestMlabServer(controller.signal, { throwOnError: true });
      if (controller.signal.aborted) return;
      if (!server) {
        setMlabRun({
          state: 'error',
          error: 'M-Lab could not find an available test server. Try again later.',
        });
        return;
      }

      const results: Pick<MlabRun, 'download' | 'upload'> = {};
      setMlabRun({ state: 'download', server });
      results.download = await measureMlabThroughput({
        server,
        direction: 'download',
        durationTargetMs: 2500,
        signal: controller.signal,
        onProgress: (_bytes, currentMbps, _elapsedMs, currentRttMs) => {
          setMlabRun((current) => ({ ...current, currentMbps, currentRttMs }));
        },
      });
      if (controller.signal.aborted) return;

      setMlabRun({ state: 'upload', server, download: results.download });
      results.upload = await measureMlabThroughput({
        server,
        direction: 'upload',
        durationTargetMs: 2500,
        signal: controller.signal,
        onProgress: (_bytes, currentMbps, _elapsedMs, currentRttMs) => {
          setMlabRun((current) => ({ ...current, currentMbps, currentRttMs }));
        },
      });
      if (controller.signal.aborted) return;

      setMlabRun({ state: 'complete', server, ...results });
    } catch (error) {
      if (controller.signal.aborted) return;
      const errorMessage = error instanceof Error ? error.message : '';
      setMlabRun({
        state: 'error',
        error: errorMessage.includes('HTTP 429')
          ? 'M-Lab is temporarily rate-limiting server lookups (HTTP 429). Wait a few minutes before trying again. Your regular speed test is unaffected.'
          : errorMessage
          ? `M-Lab server lookup or test failed: ${errorMessage}`
          : 'M-Lab server lookup or test failed. Try again.',
      });
    } finally {
      if (mlabAbortController.current === controller) {
        mlabAbortController.current = null;
      }
    }
  };

  const cancelMlabRun = () => {
    mlabAbortController.current?.abort();
    mlabAbortController.current = null;
    setMlabRun((current) => ({ ...current, state: 'cancelled', currentMbps: undefined }));
  };

  useEffect(() => () => mlabAbortController.current?.abort(), []);

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

  useEffect(() => {
    if (!isAndroidApp || !isWifi || !accessPointOui) {
      setAccessPointVendor({ status: 'unavailable' });
      return;
    }

    const cachedVendor = getCachedAccessPointVendor(accessPointOui);
    setAccessPointVendor(
      cachedVendor
        ? { oui: accessPointOui, vendor: cachedVendor, status: 'found' }
        : { oui: accessPointOui, status: networkInfo?.online ? 'loading' : 'offline' }
    );

    if (cachedVendor) return;

    if (!networkInfo?.online) {
      setAccessPointVendor((current) => (
        current.vendor
          ? current
          : { oui: accessPointOui, status: 'offline' }
      ));
      return;
    }

    const bridge = getAndroidNativeBridge();
    if (!bridge?.lookupAccessPointVendor) {
      setAccessPointVendor((current) => (
        current.vendor
          ? current
          : { oui: accessPointOui, status: 'error' }
      ));
      return;
    }

    const handleVendorLookup = (event: Event) => {
      const detail = (event as CustomEvent<AccessPointVendorLookupEventDetail>).detail;
      if (detail.oui !== accessPointOui) return;
      if (detail.status === 'found' && detail.vendor) {
        cacheAccessPointVendor(accessPointOui, detail.vendor);
        setAccessPointVendor({ oui: accessPointOui, vendor: detail.vendor, status: 'found' });
        return;
      }
      setAccessPointVendor((current) => (
        current.vendor
          ? current
          : { oui: accessPointOui, status: detail.status === 'not-found' ? 'not-found' : 'error' }
      ));
    };

    window.addEventListener('speedxpat-access-point-vendor', handleVendorLookup);
    bridge.lookupAccessPointVendor(accessPointOui);
    return () => window.removeEventListener('speedxpat-access-point-vendor', handleVendorLookup);
  }, [accessPointOui, isAndroidApp, isWifi, networkInfo?.online]);

  const accessPointVendorLabel = accessPointVendor.vendor
    ? `${accessPointVendor.vendor}${!networkInfo?.online ? ' (saved)' : ''}`
    : accessPointVendor.status === 'loading'
    ? 'Looking up…'
    : accessPointVendor.status === 'offline'
    ? 'Unavailable offline'
    : accessPointVendor.status === 'not-found'
    ? 'Manufacturer not found'
    : accessPointVendor.status === 'error'
    ? 'Lookup unavailable'
    : 'Not available';
  const connectionQualityMetricCount =
    Number(networkInfo?.downlinkMbps !== undefined) +
    Number(isAndroidApp && isWifi) * 3 +
    Number(isCellular && Boolean(networkInfo?.cellularGeneration)) +
    Number(isCellular && Boolean(networkInfo?.cellularCarrier)) +
    Number(Boolean(networkInfo?.ispName));

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-20">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center border border-cyan-500/30">
            <Wifi className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Connection overview</h2>
            <p className="text-xs text-slate-400">Status, quality, diagnostics, and technical details</p>
          </div>
        </div>

        {onRefreshNetworkInfo && (
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex min-h-11 items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-[#0E1A2E] hover:bg-[#15253D] border border-white/10 text-xs font-medium text-slate-300 hover:text-cyan-300 transition-all cursor-pointer disabled:opacity-50"
              title="Refresh connection and network information"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
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
          Browser privacy limits access to Wi‑Fi/cellular radio details, local IP, router, and DNS resolver data. Missing values are unavailable to this browser, not evidence of a network fault.
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
        {isAndroidApp && canRequestWifiAccess && networkInfo?.networkType === 'wifi' && !networkInfo.wifiSsid && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
            <p className="max-w-lg text-xs leading-relaxed text-slate-400">
              Allow Wi-Fi name access to identify this network. Android may require Location Services; SpeedXpat does not collect GPS location.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  const bridge = getAndroidNativeBridge();
                  if (!bridge) return;
                  if (!nativeFeatureState.hasPermission) {
                    bridge.requestWifiNameAccess();
                  } else if (!nativeFeatureState.locationEnabled) {
                    bridge.openLocationSettings();
                  }
                }}
                className="min-h-11 rounded-lg border border-cyan-300/20 bg-cyan-400/10 px-3 text-xs font-medium text-cyan-100 transition-colors hover:bg-cyan-400/20"
              >
                {!nativeFeatureState.hasPermission ? 'Allow Wi-Fi name' : 'Turn on Location'}
              </button>
            </div>
          </div>
        )}
      </section>

      {(networkInfo?.downlinkMbps !== undefined ||
        (isAndroidApp && isWifi) ||
        (isCellular && (networkInfo?.cellularGeneration || networkInfo?.cellularCarrier)) ||
        Boolean(networkInfo?.ispName)) && <section
        aria-label="Connection quality"
        className="rounded-2xl border border-white/10 bg-[#0E1A2E] p-4 shadow-xl"
      >
        <h3 className="text-sm font-bold text-white">Connection quality</h3>
        <p className="mt-1 text-xs text-slate-400">
          Device-reported radio details are not a speed test.
        </p>
        <div className={`mt-3 grid grid-cols-2 gap-2 ${
          connectionQualityMetricCount >= 4
            ? 'sm:grid-cols-4'
            : connectionQualityMetricCount === 3
            ? 'sm:grid-cols-3'
            : ''
        }`}>
          {networkInfo?.downlinkMbps !== undefined && (
            <div className="rounded-xl border border-white/5 bg-slate-900/80 p-3">
              <span className="block text-[10px] uppercase text-slate-400">Reported downlink</span>
              <span className="text-sm font-bold text-cyan-300">{formatMetric(networkInfo.downlinkMbps, 'Mbps')}</span>
            </div>
          )}
          {isAndroidApp && isWifi && (
            <>
              <div className="rounded-xl border border-white/5 bg-slate-900/80 p-3">
                <span className="block text-[10px] uppercase text-slate-400">Wi-Fi signal</span>
                <span className="text-sm font-bold text-emerald-300">{formatDeviceMetric(networkInfo?.wifiSignalDbm, 'dBm')}</span>
              </div>
              <div className="rounded-xl border border-white/5 bg-slate-900/80 p-3">
                <span className="block text-[10px] uppercase text-slate-400">Wi-Fi frequency</span>
                <span className="text-sm font-bold text-indigo-300">{formatDeviceMetric(networkInfo?.wifiFrequencyMhz, 'MHz')}</span>
              </div>
              <div className="rounded-xl border border-white/5 bg-slate-900/80 p-3">
                <span className="block text-[10px] uppercase text-slate-400">Router / access-point vendor</span>
                <span className="block truncate text-sm font-bold text-cyan-200" title={accessPointVendor.vendor}>
                  {accessPointVendorLabel}
                </span>
              </div>
            </>
          )}
          {isCellular && networkInfo?.cellularGeneration && (
            <div className="rounded-xl border border-white/5 bg-slate-900/80 p-3">
              <span className="block text-[10px] uppercase text-slate-400">Mobile generation</span>
              <span className="text-sm font-bold text-indigo-300">{networkInfo.cellularGeneration}</span>
            </div>
          )}
          {isCellular && networkInfo?.cellularCarrier && (
            <div className="rounded-xl border border-white/5 bg-slate-900/80 p-3">
              <span className="block text-[10px] uppercase text-slate-400">Mobile carrier</span>
              <span className="truncate text-sm font-bold text-indigo-300" title={networkInfo.cellularCarrier}>
                {networkInfo.cellularCarrier}
              </span>
            </div>
          )}
          {networkInfo?.ispName && (
            <div className="rounded-xl border border-white/5 bg-slate-900/80 p-3">
              <span className="block text-[10px] uppercase text-slate-400">Internet provider</span>
              <span className="truncate text-sm font-bold text-emerald-300" title={networkInfo.ispName}>
                {networkInfo.ispName}
              </span>
            </div>
          )}
        </div>
        {isAndroidApp && isWifi && (
          <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
            Vendor is estimated from the Wi-Fi hardware prefix, not the router model. When online, only that prefix is sent to macvendors.com; saved results remain available offline.
          </p>
        )}
      </section>}

      <section
        aria-label="Extended diagnostics"
        className="rounded-2xl border border-white/10 bg-[#0E1A2E] p-5 shadow-xl"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-cyan-300" aria-hidden="true" />
              <h3 className="text-sm font-bold text-white">M-Lab diagnostics</h3>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Run an independent NDT7 download and upload test without repeating the main speed test. M-Lab selects a nearby server using your public IP; test data usage varies with connection speed.
            </p>
          </div>
          {mlabRun.state === 'locating' || mlabRun.state === 'download' || mlabRun.state === 'upload' ? (
            <button
              type="button"
              onClick={cancelMlabRun}
              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs font-semibold text-slate-200 transition-colors hover:bg-white/5"
            >
              <XCircle className="h-4 w-4" aria-hidden="true" />
              Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleMlabRun()}
              disabled={!networkInfo?.online}
              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg bg-cyan-400 px-3 text-xs font-bold text-slate-950 transition-colors hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              {mlabRun.state === 'complete' || mlabRun.state === 'error' || mlabRun.state === 'cancelled'
                ? 'Run again'
                : 'Run M-Lab test'}
            </button>
          )}
        </div>
        {!networkInfo?.online && (
          <p className="mt-2 text-xs text-amber-200" role="status">
            Connect to the internet to run the M-Lab test.
          </p>
        )}
        {(mlabRun.state === 'locating' || mlabRun.state === 'download' || mlabRun.state === 'upload') && (
          <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/40 p-3" role="status" aria-live="polite">
            <p className="text-xs font-semibold text-cyan-200">
              {mlabRun.state === 'locating'
                ? 'Finding a nearby M-Lab server…'
                : mlabRun.state === 'download'
                ? 'Measuring M-Lab download…'
                : 'Measuring M-Lab upload…'}
            </p>
            {mlabRun.server && (
              <p className="mt-1 break-all text-[11px] text-slate-400">{mlabRun.server.label}</p>
            )}
            {mlabRun.currentMbps !== undefined && (
              <p className="mt-2 text-xs text-slate-300">
                Current: {mlabRun.currentMbps.toFixed(1)} Mbps
                {mlabRun.currentRttMs !== undefined && ` · TCP RTT ${mlabRun.currentRttMs} ms`}
              </p>
            )}
          </div>
        )}
        {mlabRun.state === 'error' && (
          <p className="mt-3 text-xs text-rose-300" role="alert">{mlabRun.error}</p>
        )}
        {mlabRun.state === 'cancelled' && (
          <p className="mt-3 text-xs text-slate-400" role="status">M-Lab test cancelled.</p>
        )}
        {mlabRun.state === 'complete' && mlabRun.server && (
          <div className="mt-4 space-y-3" aria-live="polite">
            <p className="break-all text-[11px] text-slate-400">{mlabRun.server.label}</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[
                { label: 'M-Lab download', result: mlabRun.download },
                { label: 'M-Lab upload', result: mlabRun.upload },
              ].map(({ label, result }) => (
                <div key={label} className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
                  <span className="block text-[10px] uppercase tracking-wide text-slate-400">{label}</span>
                  <span className="mt-1 block text-lg font-bold text-white">
                    {result?.mbps === null || result?.mbps === undefined ? 'Unavailable' : `${result.mbps.toFixed(1)} Mbps`}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    TCP RTT {result?.tcpRttMs === undefined ? 'not reported' : `${result.tcpRttMs} ms`}
                  </span>
                  {result?.errorMessage && (
                    <span className="mt-1 block text-[11px] text-amber-200">{result.errorMessage}</span>
                  )}
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-400">
              Transferred {((
                (mlabRun.download?.bytesTransferred ?? 0) +
                (mlabRun.upload?.bytesTransferred ?? 0)
              ) / (1024 * 1024)).toFixed(1)} MB total. This is an independent diagnostic and does not change your saved speed-test report.
            </p>
          </div>
        )}
      </section>

      <details className="group overflow-hidden rounded-2xl border border-white/10 bg-[#0E1A2E] shadow-xl">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-white outline-none transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400 [&::-webkit-details-marker]:hidden">
          <span>Technical details</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-cyan-300 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="space-y-4 border-t border-white/10 p-4">
      {/* ISP identity comes from a separate public IP-to-ASN lookup. */}
      <div className="space-y-4 border-b border-white/10 pb-4">
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <div className="flex items-center space-x-2 text-cyan-400">
            <Globe className="w-4 h-4" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Network identity</h3>
          </div>
        </div>
        <p className="text-xs text-slate-400">
          Provider and location are estimates based on your public IP, not GPS location.
        </p>

        {/* IP-to-ASN and geolocation telemetry */}
        <div className="grid grid-cols-2 gap-2.5 text-xs font-mono">
          <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5 space-y-1">
            <span className="text-[10px] text-slate-400 block uppercase">Autonomous System</span>
            <span className="text-sm font-bold text-cyan-300 truncate block" title={networkInfo?.asn}>
              {networkInfo?.asn || unavailable}
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
              key: 'asn_org_full',
              label: 'ASN Organization / Routing Registry',
              val: networkInfo?.asnOrg,
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
                className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-300 transition-colors hover:bg-slate-700 hover:text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
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

      {/* Device-level addresses and access point details */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <div className="flex items-center space-x-2">
            <Network className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white">Device and routing details</h3>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-400">Private network identifiers are hidden until revealed.</p>
          <button
            type="button"
            onClick={() => setShowSensitiveDetails((visible) => !visible)}
            aria-pressed={showSensitiveDetails}
            className="min-h-11 rounded-lg border border-white/10 px-3 text-xs font-medium text-cyan-200 transition-colors hover:bg-white/5"
          >
            {showSensitiveDetails ? 'Hide sensitive details' : 'Reveal sensitive details'}
          </button>
        </div>

        <div className="space-y-2 pt-2 border-t border-white/5 text-xs">
          {[
            ...(isAndroidApp ? [
              { key: 'wifi_ssid', label: 'Wi-Fi network name (SSID)', val: networkInfo?.wifiSsid || unavailable, sensitive: true },
              { key: 'internal_ip', label: 'Local device IP', val: networkInfo?.localIpAddress || unavailable, sensitive: true },
              { key: 'gateway_ip', label: 'Router gateway', val: networkInfo?.gatewayIpAddress || unavailable, sensitive: true },
              { key: 'wifi_bssid', label: 'Wi-Fi access point (BSSID)', val: networkInfo?.wifiBssid || unavailable, sensitive: true },
            ] : []),
            { key: 'public_ip', label: 'Public IP', val: networkInfo?.ipAddress || unavailable, sensitive: true },
          ].map((row) => (
            <div
              key={row.key}
              className="p-2.5 rounded-xl bg-slate-900/50 border border-white/5 flex items-center justify-between"
            >
              <div>
                <span className="text-slate-400 block text-[11px]">{row.label}</span>
                <span className="font-mono text-slate-200 font-semibold">
                  {row.sensitive && !showSensitiveDetails
                    ? (row.key === 'wifi_bssid' || row.key === 'wifi_ssid') && row.val !== unavailable
                      ? 'Hidden for privacy'
                      : maskIpAddress(row.val === unavailable ? undefined : row.val)
                    : row.val}
                </span>
              </div>
              <button
                onClick={() => row.val !== unavailable && showSensitiveDetails && copyToClipboard(row.key, row.val)}
                disabled={row.val === unavailable || !showSensitiveDetails}
                className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-300 transition-colors hover:bg-slate-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                title="Copy to clipboard"
                aria-label={`Copy ${row.label}`}
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
        </div>
      </details>

      {/* Wi-Fi vs cellular comparison */}
      {(recentWifiRun && recentCellularRun) && <div className="p-5 rounded-2xl bg-[#0E1A2E] border border-white/10 space-y-4 shadow-xl">
        <div className="flex items-center space-x-2 text-indigo-400">
          <Scale className="w-4 h-4" />
          <h3 className="text-sm font-bold text-white">Wi-Fi vs mobile results</h3>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          These are separate past tests, not simultaneous measurements.
        </p>

        <div className="grid grid-cols-2 gap-3 font-mono text-xs">
          {/* Wi-Fi Column */}
          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-cyan-500/30 space-y-2">
            <div className="flex items-center space-x-1.5 text-cyan-300 font-bold border-b border-white/5 pb-1">
              <Wifi className="w-3.5 h-3.5" />
              <span>Wi-Fi Connection</span>
            </div>
            <p className="text-[10px] text-slate-400">
              Tested {Number.isNaN(new Date(recentWifiRun.timestamp).getTime()) ? 'at unknown time' : new Date(recentWifiRun.timestamp).toLocaleString()}
            </p>
            <div>
              <span className="text-[10px] text-slate-400 block">DOWNLOAD</span>
              <span className="text-lg font-bold text-white">
                {formatMetric(getPrimaryThroughput(recentWifiRun?.rawMeasurements.downloadThroughput)?.mbps, 'Mbps')}
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
              <span>Mobile connection</span>
            </div>
            <p className="text-[10px] text-slate-400">
              Tested {Number.isNaN(new Date(recentCellularRun.timestamp).getTime()) ? 'at unknown time' : new Date(recentCellularRun.timestamp).toLocaleString()}
            </p>
            <div>
              <span className="text-[10px] text-slate-400 block">DOWNLOAD</span>
              <span className="text-lg font-bold text-white">
                {formatMetric(getPrimaryThroughput(recentCellularRun?.rawMeasurements.downloadThroughput)?.mbps, 'Mbps')}
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
      </div>}
    </div>
  );
};
