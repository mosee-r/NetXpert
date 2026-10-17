import React, { useState, useEffect, useRef } from 'react';
import {
  Wrench,
  Activity,
  Gauge,
  Globe,
  Radio,
  Server,
  Play,
  Square,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Wifi,
} from 'lucide-react';
import { measureLatency } from '../engines/latencyEngine';
import { measureDnsTiming } from '../engines/dnsAndHttpEngine';
import { measureLoadedLatency } from '../engines/loadedLatencyEngine';
import { DeviceNetworkInfo, LoadedLatencySummary } from '../types/network';
import { getAndroidFeatureState, getAndroidNativeBridge, getDefaultTestEndpoints } from '../engines/testEndpoints';
import { WifiChannelGraph, type WifiChannelNetwork } from './WifiChannelGraph';

type WifiScanNetwork = WifiChannelNetwork;

interface WifiScanResponse {
  status: 'success' | 'stale' | 'error';
  scannedAt?: number;
  scanAgeMs?: number;
  networks?: WifiScanNetwork[];
  message?: string;
}

interface WifiSignalHistory {
  ssid: string;
  readings: { scannedAt: number; signalDbm: number }[];
}

type WifiAnalyzerView = 'access-points' | 'channel' | 'time' | 'rating';
type WifiSecurityFilter = 'All' | 'Open' | 'Enhanced Open' | 'WEP' | 'WPA' | 'WPA2' | 'WPA3';

const WIFI_SECURITY_FILTERS: WifiSecurityFilter[] = [
  'All',
  'Open',
  'Enhanced Open',
  'WEP',
  'WPA',
  'WPA2',
  'WPA3',
];

function isWifiSecurityFilter(value: string): value is WifiSecurityFilter {
  return WIFI_SECURITY_FILTERS.some((security) => security === value);
}

const WIFI_SCAN_INTERVAL_MS = 35_000;
function parseWifiScanResponse(value: string): WifiScanResponse | null {
  try {
    const response: unknown = JSON.parse(value);
    if (!response || typeof response !== 'object' || !('status' in response)) return null;
    const data = response as Record<string, unknown>;
    if (data.status === 'error' && typeof data.message === 'string') {
      return { status: 'error', message: data.message };
    }
    if (data.status !== 'success' && data.status !== 'stale') return null;
    if (!Array.isArray(data.networks) || typeof data.scannedAt !== 'number') return null;

    const networks = data.networks.filter(
      (network): network is WifiScanNetwork =>
        !!network &&
        typeof network === 'object' &&
        'ssid' in network &&
        typeof network.ssid === 'string' &&
        'bssid' in network &&
        typeof network.bssid === 'string' &&
        'hidden' in network &&
        typeof network.hidden === 'boolean' &&
        'frequencyMhz' in network &&
        typeof network.frequencyMhz === 'number' &&
        'band' in network &&
        typeof network.band === 'string' &&
        'channelWidthMhz' in network &&
        typeof network.channelWidthMhz === 'number' &&
        'signalDbm' in network &&
        typeof network.signalDbm === 'number' &&
        'security' in network &&
        typeof network.security === 'string' &&
        'wifiStandard' in network &&
        typeof network.wifiStandard === 'string' &&
        'channel' in network &&
        (typeof network.channel === 'number' || network.channel === null)
    );
    return {
      status: data.status,
      scannedAt: data.scannedAt,
      scanAgeMs: typeof data.scanAgeMs === 'number' ? data.scanAgeMs : undefined,
      networks,
    };
  } catch {
    return null;
  }
}

interface DiagnosticToolsTabProps {
  networkInfo: DeviceNetworkInfo | null;
}

export const DiagnosticToolsTab: React.FC<DiagnosticToolsTabProps> = ({ networkInfo }) => {
  const defaultTestEndpoints = getDefaultTestEndpoints();
  const nativeFeatureState = getAndroidFeatureState();
  const canUseWifiScan = nativeFeatureState.canShowWifiScanner;

  // Tool 1: Continuous Ping & Jitter Monitor
  const [isMonitoringPing, setIsMonitoringPing] = useState(false);
  const [pingTarget, setPingTarget] = useState(defaultTestEndpoints.ping);
  const [rollingPingSamples, setRollingPingSamples] = useState<number[]>([]);
  const pingControllerRef = useRef<AbortController | null>(null);

  // Tool 2: Standalone Bufferbloat Test
  const [isTestingBloat, setIsTestingBloat] = useState(false);
  const [bloatSummary, setBloatSummary] = useState<LoadedLatencySummary | null>(null);

  // Tool 3: DNS Benchmark Utility
  const [isBenchmarkingDns, setIsBenchmarkingDns] = useState(false);
  const [dnsRankings, setDnsRankings] = useState<
    { name: string; ip: string; durationMs: number | null }[]
  >([]);

  // Tool 4: Remote HTTP endpoint latency
  const [gatewayTarget, setGatewayTarget] = useState(defaultTestEndpoints.ping);
  const [isPingingGateway, setIsPingingGateway] = useState(false);
  const [gatewayResult, setGatewayResult] = useState<{
    minMs: number;
    medianMs: number;
    maxMs: number;
    jitterMs: number;
  } | null>(null);

  // Tool 5: Port & HTTPS Reachability Checker
  const [reachTarget, setReachTarget] = useState('https://1.1.1.1');
  const [isCheckingReach, setIsCheckingReach] = useState(false);
  const [reachResult, setReachResult] = useState<{
    status: number | string;
    durationMs: number;
    reachable: boolean;
  } | null>(null);

  const [isAnalyzingWifi, setIsAnalyzingWifi] = useState(false);
  const [wifiScanNetworks, setWifiScanNetworks] = useState<WifiScanNetwork[]>([]);
  const [wifiScanMessage, setWifiScanMessage] = useState<string | null>(null);
  const [wifiScanTime, setWifiScanTime] = useState<number | null>(null);
  const [wifiScanAgeMs, setWifiScanAgeMs] = useState<number | null>(null);
  const [isWifiLive, setIsWifiLive] = useState(false);
  const [wifiBandFilter, setWifiBandFilter] = useState<'All' | '2.4 GHz' | '5 GHz' | '6 GHz'>('All');
  const [wifiSignalThreshold, setWifiSignalThreshold] = useState(-100);
  const [wifiSecurityFilter, setWifiSecurityFilter] = useState<WifiSecurityFilter>('All');
  const [showHiddenWifi, setShowHiddenWifi] = useState(false);
  const [wifiAnalyzerView, setWifiAnalyzerView] = useState<WifiAnalyzerView>('access-points');
  const [selectedWifiKey, setSelectedWifiKey] = useState<string | null>(null);
  const [wifiSignalHistory, setWifiSignalHistory] = useState<Record<string, WifiSignalHistory>>({});
  const wifiScanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isWifiLiveRef = useRef(false);
  const isWifiScanInFlightRef = useRef(false);
  const requestWifiScanRef = useRef<() => void>(() => undefined);
  const wifiNetworkKey = (network: WifiScanNetwork) =>
    network.bssid || `${network.ssid}|${network.frequencyMhz}|${network.security}`;
  const filteredWifiNetworks = wifiScanNetworks.filter(
    (network) =>
      (wifiBandFilter === 'All' || network.band === wifiBandFilter) &&
      network.signalDbm >= wifiSignalThreshold &&
      (wifiSecurityFilter === 'All' || network.security === wifiSecurityFilter) &&
      (showHiddenWifi || !network.hidden)
  );
  const activeWifiNetwork = filteredWifiNetworks.find(
    (network) => wifiNetworkKey(network) === selectedWifiKey
  ) || filteredWifiNetworks[0];
  const connectedWifiSsid =
    networkInfo?.networkType === 'wifi' ? networkInfo.wifiSsid?.trim() : undefined;
  const activeWifiKey = activeWifiNetwork ? wifiNetworkKey(activeWifiNetwork) : null;
  const activeWifiHistory = activeWifiKey ? wifiSignalHistory[activeWifiKey] : undefined;
  const availableWifiBands = (['2.4 GHz', '5 GHz', '6 GHz'] as const).filter((band) =>
    wifiScanNetworks.some((network) => network.band === band)
  );
  const wifiBandOptions: ('All' | '2.4 GHz' | '5 GHz' | '6 GHz')[] = ['All', ...availableWifiBands];
  const channelCounts = filteredWifiNetworks.reduce<Record<string, number>>((counts, network) => {
    const key = `${network.band} · Ch ${network.channel ?? 'Unknown'}`;
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  const channelUsage = Object.entries(channelCounts).sort((a, b) => b[1] - a[1]);
  const channelRatings = (['2.4 GHz', '5 GHz', '6 GHz'] as const)
    .filter((band) => wifiBandFilter === 'All' || wifiBandFilter === band)
    .flatMap((band) => {
      const bandNetworks = filteredWifiNetworks.filter((network) => network.band === band);
      const observedChannels = bandNetworks.flatMap((network) =>
        network.channel === null ? [] : [network.channel]
      );
      const candidateChannels = band === '2.4 GHz'
        ? [1, 6, 11]
        : [...new Set([...observedChannels, ...(band === '5 GHz' ? [36, 40, 44, 48, 149, 153, 157, 161] : [])])];
      return candidateChannels.map((channel) => {
        const frequencyMhz = band === '2.4 GHz'
          ? channel === 14 ? 2484 : 2407 + channel * 5
          : band === '6 GHz' ? 5950 + channel * 5 : 5000 + channel * 5;
        const overlappingNetworks = bandNetworks.filter((network) => {
          const sharedWidth = (network.channelWidthMhz + 20) / 2;
          return Math.abs(network.frequencyMhz - frequencyMhz) < sharedWidth;
        });
        const congestion = overlappingNetworks.reduce((score, network) => {
          const overlapWidth = Math.max(
            0,
            (network.channelWidthMhz + 20) / 2 - Math.abs(network.frequencyMhz - frequencyMhz)
          );
          const overlapRatio = overlapWidth / Math.max(20, network.channelWidthMhz);
          return score + overlapRatio * Math.max(0, (network.signalDbm + 100) / 10);
        }, 0);
        return {
          band,
          channel,
          networks: overlappingNetworks.length,
          score: congestion,
          rating: congestion < 1 ? 'Clear' : congestion < 3 ? 'Fair' : 'Busy',
        };
      });
    })
    .sort((a, b) => a.score - b.score);

  requestWifiScanRef.current = () => {
    try {
      const bridge = getAndroidNativeBridge();
      if (!bridge) {
        isWifiLiveRef.current = false;
        setIsWifiLive(false);
        setWifiScanMessage('Nearby Wi-Fi scanning requires the Android app; browsers do not expose Wi-Fi scan results.');
        return;
      }
      if (isWifiScanInFlightRef.current) return;
      const accepted = bridge.scanWifiNetworks();
      if (accepted) {
        isWifiScanInFlightRef.current = true;
        setIsAnalyzingWifi(true);
        if (wifiScanTimeoutRef.current) clearTimeout(wifiScanTimeoutRef.current);
        wifiScanTimeoutRef.current = setTimeout(() => {
          isWifiScanInFlightRef.current = false;
          setIsAnalyzingWifi(false);
          setWifiScanMessage('The scan did not finish in time. Check Wi-Fi and Location settings, then try again.');
          if (isWifiLiveRef.current) {
            wifiScanTimeoutRef.current = setTimeout(
              () => requestWifiScanRef.current(),
              WIFI_SCAN_INTERVAL_MS
            );
          }
        }, 15_000);
      }
    } catch {
      isWifiLiveRef.current = false;
      setIsWifiLive(false);
      setIsAnalyzingWifi(false);
      setWifiScanMessage('The Android Wi-Fi scanner could not be reached. Restart the app and try again.');
    }
  };

  useEffect(() => {
    const handleWifiScan = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      const response = typeof detail === 'string' ? parseWifiScanResponse(detail) : null;
      if (!response) {
        setWifiScanMessage('The Wi-Fi scanner returned an invalid response. Please try again.');
      } else if (response.status === 'error') {
        setWifiScanMessage(response.message || 'The Wi-Fi scan could not be completed.');
      } else {
        const networks = response.networks || [];
        if (response.status === 'success') {
          const scannedAt = response.scannedAt || Date.now();
          setWifiScanNetworks(networks);
          setWifiScanTime(scannedAt);
          setWifiScanAgeMs(response.scanAgeMs || 0);
          setSelectedWifiKey((previous) =>
            previous && networks.some((network) => wifiNetworkKey(network) === previous)
              ? previous
              : networks[0] ? wifiNetworkKey(networks[0]) : null
          );
          setWifiSignalHistory((previous) => {
            const next = { ...previous };
            for (const network of networks) {
              const key = wifiNetworkKey(network);
              const history = next[key] || { ssid: network.ssid, readings: [] };
              const lastReading = history.readings[history.readings.length - 1];
              if (!lastReading || scannedAt > lastReading.scannedAt) {
                next[key] = {
                  ...history,
                  readings: [...history.readings, { scannedAt, signalDbm: network.signalDbm }].slice(-24),
                };
              }
            }
            return next;
          });
          setWifiScanMessage(
            isWifiLiveRef.current
              ? `Live scan updated · ${networks.length} visible networks · refreshes about every ${Math.round(WIFI_SCAN_INTERVAL_MS / 1000)} sec`
              : `Scan updated · ${networks.length} visible networks · results stay on this device`
          );
        } else {
          setWifiScanAgeMs(response.scanAgeMs ?? null);
          setWifiScanNetworks(networks);
          setWifiScanTime(response.scannedAt || null);
          setSelectedWifiKey((previous) =>
            previous && networks.some((network) => wifiNetworkKey(network) === previous)
              ? previous
              : networks[0] ? wifiNetworkKey(networks[0]) : null
          );
          setWifiScanMessage(
            `Android rate-limited this refresh. Showing cached scan results${response.scanAgeMs ? ` (${Math.max(1, Math.round(response.scanAgeMs / 1000))} sec old)` : ''}.`
          );
        }
      }
      isWifiScanInFlightRef.current = false;
      if (wifiScanTimeoutRef.current) clearTimeout(wifiScanTimeoutRef.current);
      setIsAnalyzingWifi(false);
      if (isWifiLiveRef.current) {
        wifiScanTimeoutRef.current = setTimeout(
          () => requestWifiScanRef.current(),
          WIFI_SCAN_INTERVAL_MS
        );
      } else {
        wifiScanTimeoutRef.current = null;
      }
    };

    window.addEventListener('speedxpat-wifi-scan', handleWifiScan);
    return () => {
      window.removeEventListener('speedxpat-wifi-scan', handleWifiScan);
      if (wifiScanTimeoutRef.current) clearTimeout(wifiScanTimeoutRef.current);
      isWifiLiveRef.current = false;
    };
  }, []);

  const handleRunWifiScan = () => {
    if (!canUseWifiScan) {
      setWifiScanMessage('Nearby Wi-Fi scanning requires the Android app; browsers do not expose Wi-Fi scan results.');
      return;
    }
    setWifiScanMessage(null);
    requestWifiScanRef.current();
  };

  const handleToggleLiveWifi = () => {
    if (!canUseWifiScan) {
      setWifiScanMessage('Nearby Wi-Fi scanning requires Android Location permission and active Location services.');
      return;
    }

    if (isWifiLiveRef.current) {
      isWifiLiveRef.current = false;
      setIsWifiLive(false);
      if (!isWifiScanInFlightRef.current && wifiScanTimeoutRef.current) {
        clearTimeout(wifiScanTimeoutRef.current);
        wifiScanTimeoutRef.current = null;
      }
      setWifiScanMessage('Live scanning paused. Existing scan and signal history are kept on this device.');
      return;
    }
    isWifiLiveRef.current = true;
    setIsWifiLive(true);
    setWifiSignalHistory({});
    requestWifiScanRef.current();
  };

  // Continuous Ping Loop
  useEffect(() => {
    if (!isMonitoringPing) return;

    let isCancelled = false;
    let nextProbeTimeout: ReturnType<typeof setTimeout> | null = null;

    const runProbe = async () => {
      const controller = new AbortController();
      pingControllerRef.current = controller;

      const result = await measureLatency({
        targetUrl: pingTarget,
        sampleCount: 1,
        timeoutMs: 1500,
        signal: controller.signal,
      });

      if (isCancelled || controller.signal.aborted) return;

      const latencyMs = result.samples[0]?.latencyMs;
      setRollingPingSamples((previous) => [...previous.slice(-24), latencyMs ?? 999]);
      nextProbeTimeout = setTimeout(() => void runProbe(), 700);
    };

    void runProbe();

    return () => {
      isCancelled = true;
      if (nextProbeTimeout) clearTimeout(nextProbeTimeout);
      pingControllerRef.current?.abort();
      pingControllerRef.current = null;
    };
  }, [isMonitoringPing, pingTarget]);

  // Handle DNS Benchmark across providers
  const handleRunDnsBenchmark = async () => {
    setIsBenchmarkingDns(true);
    setDnsRankings([]);
    const providers = [
      { name: 'Cloudflare', domain: 'cloudflare.com', ip: '1.1.1.1' },
      { name: 'Google Public DNS', domain: 'google.com', ip: '8.8.8.8' },
      { name: 'Quad9 DNS', domain: 'quad9.net', ip: '9.9.9.9' },
      { name: 'OpenDNS', domain: 'opendns.com', ip: '208.67.222.222' },
    ];

    const results = [];
    for (const p of providers) {
      try {
        const res = await measureDnsTiming(p.domain);
        results.push({
          name: p.name,
          ip: p.ip,
          durationMs: res.durationMs,
        });
      } catch {
        results.push({ name: p.name, ip: p.ip, durationMs: null });
      }
    }

    // Sort by fastest duration
    results.sort((a, b) => (a.durationMs || 999) - (b.durationMs || 999));
    setDnsRankings(results);
    setIsBenchmarkingDns(false);
  };

  // Run Router Distance Ping
  const handleRunGatewayPing = async () => {
    setIsPingingGateway(true);
    setGatewayResult(null);
    try {
      const res = await measureLatency({
        targetUrl: gatewayTarget,
        sampleCount: 8,
      });
      if (res.medianMs !== null) {
        setGatewayResult({
          minMs: res.minMs || 0,
          medianMs: res.medianMs || 0,
          maxMs: res.maxMs || 0,
          jitterMs: res.jitterMs || 0,
        });
      }
    } finally {
      setIsPingingGateway(false);
    }
  };

  // Run Reachability Check
  const handleCheckReach = async () => {
    setIsCheckingReach(true);
    setReachResult(null);
    const start = performance.now();
    try {
      const res = await fetch(reachTarget, { mode: 'no-cors', cache: 'no-store' });
      const durationMs = Math.round(performance.now() - start);
      setReachResult({ status: 'Connected', durationMs, reachable: true });
    } catch (err) {
      const durationMs = Math.round(performance.now() - start);
      setReachResult({ status: 'Failed/Timeout', durationMs, reachable: false });
    } finally {
      setIsCheckingReach(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      {/* Title */}
      <div className="flex items-center space-x-2.5">
        <div className="w-10 h-10 rounded-xl bg-violet-500/20 text-violet-400 flex items-center justify-center border border-violet-500/30">
          <Wrench className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">Diagnostic Tools & Probes</h2>
          <p className="text-xs text-slate-400">
            Targeted network diagnostics without running full speed test payloads
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {nativeFeatureState.isNativeApp && canUseWifiScan ? (
          <div className="p-4 sm:p-5 rounded-2xl bg-[#0E1A2E] border border-cyan-500/20 space-y-3.5 shadow-xl md:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center space-x-2 text-cyan-400">
                <Wifi className="w-4 h-4" />
                <div>
                  <h3 className="text-sm font-bold text-white">Available Wi-Fi</h3>
                  <p className="text-[10px] text-slate-500">Nearby access points · identifiers stay on this device</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleRunWifiScan}
                  disabled={isAnalyzingWifi}
                  className="px-3 py-1.5 rounded-xl border border-white/10 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {isAnalyzingWifi ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
                  <span>{isAnalyzingWifi ? 'Scanning...' : 'Scan once'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleToggleLiveWifi}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 cursor-pointer ${
                    isWifiLive
                      ? 'bg-rose-950/80 text-rose-300 border border-rose-800'
                      : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                  }`}
                >
                  {isWifiLive ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                  <span>{isWifiLive ? 'Pause live' : 'Start live'}</span>
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-400">
              Access-point list, channel spectrum, signal history, and channel ratings. Scan details, including BSSIDs, are shown locally
              only and are not saved or sent to a service. Android controls scan frequency and may return cached results.
            </p>

            {wifiScanMessage && (
              <div className="space-y-2">
                <div
                  role="status"
                  className={`rounded-xl border px-3 py-2 text-xs ${
                    wifiScanMessage.toLowerCase().includes('scan updated')
                      ? 'border-emerald-500/20 bg-emerald-950/20 text-emerald-200'
                      : 'border-amber-500/20 bg-amber-950/20 text-amber-200'
                  }`}
                >
                  {wifiScanMessage}
                </div>
                {(wifiScanMessage.includes('Location') || wifiScanMessage.includes('permission')) && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => getAndroidNativeBridge()?.openApplicationSettings()}
                      className="rounded-lg border border-white/10 bg-slate-800 px-3 py-1.5 text-[11px] text-slate-200"
                    >
                      App permissions
                    </button>
                    <button
                      type="button"
                      onClick={() => getAndroidNativeBridge()?.openLocationSettings()}
                      className="rounded-lg border border-white/10 bg-slate-800 px-3 py-1.5 text-[11px] text-slate-200"
                    >
                      Device Location settings
                    </button>
                  </div>
                )}
              </div>
            )}

            {wifiScanNetworks.length > 0 ? (
              <>
                {wifiScanTime && (
                  <p className="text-[10px] text-slate-500" role="status">
                    Last scan: {new Date(wifiScanTime).toLocaleTimeString()}
                    {wifiScanAgeMs !== null && wifiScanAgeMs > 0
                      ? ` · Android data about ${Math.max(1, Math.round(wifiScanAgeMs / 1000))} sec old`
                      : ' · fresh results'}
                    {isWifiLive ? ' · live refresh enabled' : ''}
                    {' · BSSIDs are not stored'}
                  </p>
                )}
                <div className="space-y-3 rounded-xl border border-white/5 bg-slate-900/40 p-3">
                  <div className="flex flex-wrap items-center gap-2" aria-label="Filter access points by Wi-Fi band">
                    <span className="text-[10px] uppercase tracking-wide text-slate-500">Band</span>
                    {wifiBandOptions.map((band) => (
                      <button
                        key={band}
                        type="button"
                        aria-pressed={wifiBandFilter === band}
                        onClick={() => setWifiBandFilter(band)}
                        className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                          wifiBandFilter === band
                            ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/30'
                            : 'bg-slate-800 text-slate-400 border border-white/5 hover:text-slate-200'
                        }`}
                      >
                        {band}
                      </button>
                    ))}
                    <span className="ml-auto text-[10px] text-slate-500">
                      {filteredWifiNetworks.length} / {wifiScanNetworks.length} networks
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="space-y-1 text-[10px] text-slate-400">
                      <span className="flex justify-between">
                        <span>Minimum signal</span>
                        <strong className="text-cyan-200">{wifiSignalThreshold} dBm</strong>
                      </span>
                      <input
                        type="range"
                        min="-100"
                        max="-30"
                        step="5"
                        value={wifiSignalThreshold}
                        onChange={(event) => setWifiSignalThreshold(Number(event.target.value))}
                        className="w-full accent-cyan-400"
                      />
                    </label>
                    <label className="space-y-1 text-[10px] text-slate-400">
                      <span className="block">Security</span>
                      <select
                        value={wifiSecurityFilter}
                        onChange={(event) => {
                          if (isWifiSecurityFilter(event.target.value)) {
                            setWifiSecurityFilter(event.target.value);
                          }
                        }}
                        className="w-full rounded-lg border border-white/10 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200"
                      >
                        {WIFI_SECURITY_FILTERS.map((security) => (
                          <option key={security} value={security}>{security}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="inline-flex items-center gap-2 text-[10px] text-slate-400">
                    <input
                      type="checkbox"
                      checked={showHiddenWifi}
                      onChange={(event) => setShowHiddenWifi(event.target.checked)}
                      className="accent-cyan-400"
                    />
                    Show hidden SSIDs
                  </label>
                </div>
                <div
                  role="tablist"
                  aria-label="Wi-Fi analyzer views"
                  className="grid grid-cols-2 gap-1 rounded-xl border border-white/5 bg-slate-900/70 p-1 sm:grid-cols-4"
                >
                  {([
                    ['access-points', 'AP list'],
                    ['channel', 'Channel graph'],
                    ['time', 'Time graph'],
                    ['rating', 'Channel rating'],
                  ] as const).map(([view, label]) => (
                    <button
                      key={view}
                      type="button"
                      role="tab"
                      aria-selected={wifiAnalyzerView === view}
                      onClick={() => setWifiAnalyzerView(view)}
                      className={`rounded-lg px-2 py-2 text-[11px] font-semibold ${
                        wifiAnalyzerView === view
                          ? 'bg-cyan-500/20 text-cyan-200'
                          : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {filteredWifiNetworks.length === 0 ? (
                  <p className="rounded-xl border border-white/5 bg-slate-900/40 p-4 text-center text-xs text-slate-500">
                    No networks match the selected filters.
                  </p>
                ) : wifiAnalyzerView === 'access-points' ? (
                  <div className="space-y-2">
                    {filteredWifiNetworks.map((network) => {
                      const signalPercent = Math.max(0, Math.min(100, 2 * (network.signalDbm + 100)));
                      const networkKey = wifiNetworkKey(network);
                      const signalQuality =
                        network.signalDbm >= -50 ? 'Excellent' :
                        network.signalDbm >= -60 ? 'Good' :
                        network.signalDbm >= -67 ? 'Fair' : 'Weak';
                      return (
                        <button
                          key={networkKey}
                          type="button"
                          aria-pressed={networkKey === selectedWifiKey}
                          onClick={() => setSelectedWifiKey(networkKey)}
                          className={`w-full rounded-xl border p-3 text-left transition-colors ${
                            networkKey === selectedWifiKey
                              ? 'border-cyan-500/40 bg-cyan-950/30'
                              : 'border-white/5 bg-slate-900/70 hover:border-white/15'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="min-w-0 break-words text-sm font-semibold text-slate-100">
                              {network.hidden ? 'Hidden network' : network.ssid}
                            </span>
                            <span className="flex shrink-0 items-center gap-1.5">
                              {connectedWifiSsid && network.ssid === connectedWifiSsid && (
                                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                                  Connected
                                </span>
                              )}
                              <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-cyan-200">
                                {network.security}
                              </span>
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-[10px] text-slate-400">
                            <span>{network.band} · Ch {network.channel ?? '—'} · {network.frequencyMhz} MHz</span>
                            <span>{network.wifiStandard}</span>
                          </div>
                          <p className="mt-1 break-all font-mono text-[10px] text-slate-500">
                            BSSID: {network.bssid || 'Unavailable'}
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-700">
                              <div
                                className={`h-full rounded-full ${
                                  network.signalDbm >= -60 ? 'bg-emerald-400' :
                                  network.signalDbm >= -70 ? 'bg-amber-400' : 'bg-rose-400'
                                }`}
                                style={{ width: `${signalPercent}%` }}
                              />
                            </div>
                            <span className="w-28 text-right text-[10px] text-slate-300">
                              {network.signalDbm} dBm · {signalQuality}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : wifiAnalyzerView === 'channel' || wifiAnalyzerView === 'time' ? (
                  <>
                    {wifiAnalyzerView === 'time' && (
                      <label className="block space-y-1 text-[10px] text-slate-400">
                        <span>Select access point</span>
                        <select
                          value={activeWifiKey || ''}
                          onChange={(event) => setSelectedWifiKey(event.target.value)}
                          className="w-full rounded-lg border border-white/10 bg-slate-800 px-2.5 py-2 text-xs text-slate-200"
                        >
                          {filteredWifiNetworks.map((network) => {
                            const key = wifiNetworkKey(network);
                            return (
                              <option key={key} value={key}>
                                {network.hidden ? 'Hidden network' : network.ssid} · Ch {network.channel ?? '—'} · {network.bssid}
                              </option>
                            );
                          })}
                        </select>
                      </label>
                    )}
                    <WifiChannelGraph
                      mode={wifiAnalyzerView}
                      networks={filteredWifiNetworks}
                      selectedKey={activeWifiKey}
                      onSelect={(network) => setSelectedWifiKey(wifiNetworkKey(network))}
                      selectedSsid={activeWifiNetwork?.hidden ? 'Hidden network' : activeWifiNetwork?.ssid}
                      signalHistory={activeWifiHistory?.readings}
                      lastScanAt={wifiScanTime}
                    />
                    {wifiAnalyzerView === 'channel' && channelUsage.length > 0 && (
                      <div className="rounded-xl border border-white/5 bg-slate-900/50 p-3">
                        <p className="mb-2 text-[10px] uppercase tracking-wide text-slate-400">
                          Access points per channel · {wifiBandFilter}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {channelUsage.map(([channel, count]) => (
                            <span key={channel} className="rounded-lg bg-slate-800 px-2.5 py-1 text-[10px] text-slate-300">
                              {channel}: <strong className="text-cyan-200">{count}</strong>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[10px] text-slate-500">
                      Estimated from visible networks, signal strength, and channel-width metadata; nearby hidden or non-Wi-Fi interference is not measured.
                    </p>
                    {channelRatings.map((entry) => (
                      <div
                        key={`${entry.band}-${entry.channel}`}
                        className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-slate-900/70 px-3 py-2.5"
                      >
                        <span className="text-xs text-slate-200">{entry.band} · Ch {entry.channel}</span>
                        <span className="text-[10px] text-slate-400">{entry.networks} overlapping APs</span>
                        <span className={`text-[10px] font-semibold ${
                          entry.rating === 'Clear' ? 'text-emerald-300' :
                          entry.rating === 'Fair' ? 'text-amber-300' : 'text-rose-300'
                        }`}>
                          {entry.rating}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : !wifiScanMessage && (
              <div className="rounded-xl border border-white/5 bg-slate-900/40 p-4 text-center text-xs text-slate-500">
                Nearby scans require the Android app, Wi-Fi enabled, Location permission granted, and Location services on.
              </div>
            )}
          </div>
        ) : null}

        {/* Tool 1: Continuous Ping & Jitter Monitor */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#0E1A2E] border border-white/10 space-y-3.5 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-cyan-400">
              <Activity className="w-4 h-4" />
              <h3 className="text-sm font-bold text-white">Continuous Ping Monitor</h3>
            </div>
            <button
              onClick={() => setIsMonitoringPing(!isMonitoringPing)}
              className={`px-3 py-1 rounded-xl text-xs font-semibold flex items-center space-x-1 cursor-pointer transition-all ${
                isMonitoringPing
                  ? 'bg-rose-950/80 text-rose-300 border border-rose-800'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-white'
              }`}
            >
              {isMonitoringPing ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
              <span>{isMonitoringPing ? 'Stop' : 'Start'}</span>
            </button>
          </div>
          <p className="text-xs text-slate-400">
            Real-time rolling RTT latency graph to inspect jitter anomalies and packet spikes.
          </p>

          <input
            type="text"
            value={pingTarget}
            onChange={(e) => setPingTarget(e.target.value)}
            className="w-full bg-slate-900 border border-white/10 rounded-lg p-2 text-xs font-mono text-slate-200"
          />

          {/* Rolling Graph Visualization */}
          <div className="h-24 bg-slate-900/90 rounded-xl border border-white/5 p-2 flex items-end justify-between gap-1 overflow-hidden">
            {rollingPingSamples.length === 0 ? (
              <span className="text-[11px] text-slate-600 m-auto font-mono">
                Tap Start to begin live latency stream
              </span>
            ) : (
              rollingPingSamples.map((ms, idx) => {
                const heightPct = Math.min(100, Math.max(10, (ms / 150) * 100));
                const isDropped = ms >= 999;
                return (
                  <div
                    key={idx}
                    className="flex-1 flex flex-col items-center justify-end h-full"
                    title={`${ms} ms`}
                  >
                    <div
                      style={{ height: `${heightPct}%` }}
                      className={`w-full rounded-t-sm transition-all ${
                        isDropped ? 'bg-rose-500' : ms > 80 ? 'bg-amber-400' : 'bg-cyan-400'
                      }`}
                    />
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Tool 2: Standalone Bufferbloat Diagnostic */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#0E1A2E] border border-white/10 space-y-3.5 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-amber-400">
              <Gauge className="w-4 h-4" />
              <h3 className="text-sm font-bold text-white">Bufferbloat Saturation Probe</h3>
            </div>
          </div>
          <p className="text-xs text-slate-400">
            Measures latency increase under simultaneous network load to grade router queuing delay.
          </p>

          <button
            onClick={async () => {
              setIsTestingBloat(true);
              setBloatSummary(null);
              try {
                const res = await measureLoadedLatency({
                  pingTargetUrl: defaultTestEndpoints.ping,
                  loadTargetUrl: defaultTestEndpoints.download,
                });
                setBloatSummary(res);
              } finally {
                setIsTestingBloat(false);
              }
            }}
            disabled={isTestingBloat}
            className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs transition-all flex items-center justify-center space-x-1.5 disabled:opacity-50 cursor-pointer"
          >
            {isTestingBloat ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            <span>{isTestingBloat ? 'Measuring Queue Delta...' : 'Test Bufferbloat Under Load'}</span>
          </button>

          {bloatSummary && (
            <div className="p-3 rounded-xl bg-slate-900 border border-white/5 space-y-2 text-xs font-mono">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Bufferbloat Grade:</span>
                <span className="text-sm font-bold text-amber-400 px-2 py-0.5 rounded bg-amber-950 border border-amber-800">
                  Grade {bloatSummary.bufferbloatGrade}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1 text-center text-[11px]">
                <div>Base: {bloatSummary.baselineLatencyMs}ms</div>
                <div className="text-rose-300">Under Load: {bloatSummary.underLoadLatencyMs}ms</div>
                <div className="text-amber-300">Delta: +{bloatSummary.loadedDeltaMs}ms</div>
              </div>
            </div>
          )}
        </div>

        {/* Tool 3: DNS Benchmark Utility */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#0E1A2E] border border-white/10 space-y-3.5 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-emerald-400">
              <Globe className="w-4 h-4" />
              <h3 className="text-sm font-bold text-white">DNS Resolver Benchmark</h3>
            </div>
            <button
              onClick={handleRunDnsBenchmark}
              disabled={isBenchmarkingDns}
              className="px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center space-x-1 disabled:opacity-50 cursor-pointer"
            >
              {isBenchmarkingDns ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
              <span>Benchmark</span>
            </button>
          </div>
          <p className="text-xs text-slate-400">
            Benchmark domain resolution time across major DNS resolvers to find the fastest response.
          </p>

          {dnsRankings.length > 0 ? (
            <div className="space-y-1.5 font-mono text-xs">
              {dnsRankings.map((r, idx) => (
                <div
                  key={r.name}
                  className="p-2 rounded-lg bg-slate-900/80 border border-white/5 flex items-center justify-between"
                >
                  <div className="flex items-center space-x-2">
                    <span className="text-cyan-400 font-bold">#{idx + 1}</span>
                    <span className="text-slate-200">{r.name} ({r.ip})</span>
                  </div>
                  <span className="font-bold text-emerald-400">
                    {r.durationMs !== null ? `${r.durationMs} ms` : 'Failed'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-slate-900/40 border border-white/5 text-center text-xs text-slate-500">
              Tap Benchmark to test Cloudflare, Google, and Quad9.
            </div>
          )}
        </div>

        {/* Tool 4: Remote HTTP endpoint latency */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#0E1A2E] border border-white/10 space-y-3.5 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-indigo-400">
              <Radio className="w-4 h-4" />
              <h3 className="text-sm font-bold text-white">Remote Endpoint Latency</h3>
            </div>
            <button
              onClick={handleRunGatewayPing}
              disabled={isPingingGateway}
              className="px-3 py-1 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center space-x-1 disabled:opacity-50 cursor-pointer"
            >
              {isPingingGateway ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
              <span>Probe Endpoint</span>
            </button>
          </div>
          <p className="text-xs text-slate-400">
            Measures HTTP round-trip time to the test endpoint; this is not a router or ICMP ping.
          </p>

          {gatewayResult ? (
            <div className="p-3 rounded-xl bg-slate-900 border border-white/5 font-mono text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Median Endpoint RTT:</span>
                <span className="font-bold text-indigo-300">{gatewayResult.medianMs} ms</span>
              </div>
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>Min: {gatewayResult.minMs}ms • Max: {gatewayResult.maxMs}ms</span>
                <span>Jitter: {gatewayResult.jitterMs}ms</span>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-slate-900/40 border border-white/5 text-center text-xs text-slate-500">
              Run a round-trip latency test against the configured HTTP endpoint.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
