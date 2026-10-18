import React, { useState, useEffect, useRef } from 'react';
import {
  Wrench,
  Activity,
  ChevronDown,
  Gauge,
  Globe,
  Radio,
  Server,
  Play,
  Square,
  Loader2,
  Wifi,
} from 'lucide-react';
import { measureLatency } from '../engines/latencyEngine';
import { DNS_BENCHMARK_RESOLVERS, measureDnsResolverTiming } from '../engines/dnsAndHttpEngine';
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

interface NativePingResult {
  requestId: string;
  host: string;
  count: number;
  payloadSize: number;
  status: 'success' | 'partial' | 'failed';
  sent: number;
  received: number;
  lossPercent: number;
  samples: number[];
  minMs: number | null;
  avgMs: number | null;
  maxMs: number | null;
  message: string;
}

interface NativePingProgress {
  requestId: string;
  host: string;
  count: number;
  payloadSize: number;
  sent: number;
  received: number;
  line: string;
}

type NativePingEvent =
  | { type: 'progress'; progress: NativePingProgress }
  | { type: 'complete'; result: NativePingResult };

function parseNativePingResult(value: string): NativePingResult | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return null;
    const result = parsed as Partial<NativePingResult>;
    if (
      typeof result.requestId !== 'string' ||
      typeof result.host !== 'string' ||
      typeof result.count !== 'number' ||
      typeof result.payloadSize !== 'number' ||
      !['success', 'partial', 'failed'].includes(result.status || '') ||
      typeof result.sent !== 'number' ||
      typeof result.received !== 'number' ||
      typeof result.lossPercent !== 'number' ||
      !Array.isArray(result.samples) ||
      typeof result.message !== 'string'
    ) return null;

    return {
      ...result,
      status: result.status as NativePingResult['status'],
      minMs: typeof result.minMs === 'number' ? result.minMs : null,
      avgMs: typeof result.avgMs === 'number' ? result.avgMs : null,
      maxMs: typeof result.maxMs === 'number' ? result.maxMs : null,
      samples: result.samples.filter((sample): sample is number => typeof sample === 'number' && Number.isFinite(sample)),
    } as NativePingResult;
  } catch {
    return null;
  }
}

function parseNativePingEvent(value: string): NativePingEvent | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) return null;
    const event = parsed as Record<string, unknown>;
    if (event.type === 'complete') {
      const result = parseNativePingResult(value);
      return result ? { type: 'complete', result } : null;
    }
    if (
      event.type !== 'progress' ||
      typeof event.requestId !== 'string' ||
      typeof event.host !== 'string' ||
      typeof event.count !== 'number' ||
      typeof event.payloadSize !== 'number' ||
      typeof event.sent !== 'number' ||
      typeof event.received !== 'number' ||
      typeof event.line !== 'string'
    ) return null;

    return {
      type: 'progress',
      progress: {
        requestId: event.requestId,
        host: event.host,
        count: event.count,
        payloadSize: event.payloadSize,
        sent: event.sent,
        received: event.received,
        line: event.line,
      },
    };
  } catch {
    return null;
  }
}

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
const formatToolLatency = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? 'Unavailable'
    : `${Math.round(value)} ms`;

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
  const canUseNativePing = nativeFeatureState.canRunNativePing;

  const [nativePingHost, setNativePingHost] = useState('1.1.1.1');
  const [nativePingCount, setNativePingCount] = useState('5');
  const [nativePingPayloadSize, setNativePingPayloadSize] = useState('56');
  const [isNativePinging, setIsNativePinging] = useState(false);
  const [nativePingProgress, setNativePingProgress] = useState<NativePingProgress | null>(null);
  const [nativePingLiveReplies, setNativePingLiveReplies] = useState<NativePingProgress[]>([]);
  const [nativePingResult, setNativePingResult] = useState<NativePingResult | null>(null);
  const [nativePingError, setNativePingError] = useState<string | null>(null);
  const nativePingRequestRef = useRef<string | null>(null);
  const nativePingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tool 1: Continuous Ping & Jitter Monitor
  const [isMonitoringPing, setIsMonitoringPing] = useState(false);
  const [pingTarget, setPingTarget] = useState(defaultTestEndpoints.ping);
  const [rollingPingSamples, setRollingPingSamples] = useState<Array<number | null>>([]);
  const pingControllerRef = useRef<AbortController | null>(null);

  // Tool 2: Standalone Bufferbloat Test
  const [isTestingBloat, setIsTestingBloat] = useState(false);
  const [bloatSummary, setBloatSummary] = useState<LoadedLatencySummary | null>(null);

  // Tool 3: DNS Benchmark Utility
  const [isBenchmarkingDns, setIsBenchmarkingDns] = useState(false);
  const [dnsRankings, setDnsRankings] = useState<
    { name: string; durationMs: number | null; resolvedIp: string | null; errorMessage?: string }[]
  >([]);

  // Tool 4: Remote HTTP endpoint latency
  const [isPingingGateway, setIsPingingGateway] = useState(false);
  const [gatewayResult, setGatewayResult] = useState<{
    minMs: number | null;
    medianMs: number | null;
    maxMs: number | null;
    jitterMs: number | null;
  } | null>(null);
  const [gatewayError, setGatewayError] = useState<string | null>(null);

  // Tool 5: Port & HTTPS Reachability Checker
  const [reachTarget, setReachTarget] = useState('https://1.1.1.1');
  const [isCheckingReach, setIsCheckingReach] = useState(false);
  const [reachResult, setReachResult] = useState<{
    status: string;
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

  useEffect(() => {
    const handleNativePingResult = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      const pingEvent = typeof detail === 'string' ? parseNativePingEvent(detail) : null;
      if (!pingEvent) return;

      const requestId = pingEvent.type === 'progress'
        ? pingEvent.progress.requestId
        : pingEvent.result.requestId;
      if (requestId !== nativePingRequestRef.current) return;

      if (pingEvent.type === 'progress') {
        setNativePingProgress(pingEvent.progress);
        setNativePingLiveReplies((previous) => [...previous, pingEvent.progress].slice(-10));
        return;
      }

      if (nativePingTimeoutRef.current) clearTimeout(nativePingTimeoutRef.current);
      nativePingTimeoutRef.current = null;
      nativePingRequestRef.current = null;
      setNativePingProgress(null);
      setNativePingLiveReplies([]);
      setNativePingResult(pingEvent.result);
      setNativePingError(null);
      setIsNativePinging(false);
    };

    window.addEventListener('speedxpat-native-ping', handleNativePingResult);
    return () => {
      window.removeEventListener('speedxpat-native-ping', handleNativePingResult);
      if (nativePingTimeoutRef.current) clearTimeout(nativePingTimeoutRef.current);
    };
  }, []);

  const handleRunNativePing = () => {
    const bridge = getAndroidNativeBridge();
    const host = nativePingHost.trim();
    const count = Number(nativePingCount);
    const payloadSize = Number(nativePingPayloadSize);
    if (!bridge?.runNativePing || !canUseNativePing) {
      setNativePingError('Native ping is not available in this app build.');
      return;
    }
    if (!host || !Number.isInteger(count) || count < 1 || count > 10) {
      setNativePingError('Enter a host and a whole-number count from 1 to 10.');
      return;
    }
    if (!Number.isInteger(payloadSize) || payloadSize < 8 || payloadSize > 1400) {
      setNativePingError('Payload size must be a whole number from 8 to 1,400 bytes.');
      return;
    }

    if (nativePingTimeoutRef.current) clearTimeout(nativePingTimeoutRef.current);
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    nativePingRequestRef.current = requestId;
    setIsNativePinging(true);
    setNativePingProgress(null);
    setNativePingLiveReplies([]);
    setNativePingResult(null);
    setNativePingError(null);
    nativePingTimeoutRef.current = setTimeout(() => {
      if (nativePingRequestRef.current !== requestId) return;
      nativePingRequestRef.current = null;
      nativePingTimeoutRef.current = null;
      setIsNativePinging(false);
      setNativePingProgress(null);
      setNativePingError('No result arrived before the native ping timeout. Native ICMP may be unavailable on this device.');
    }, 17_000);

    try {
      const accepted = bridge.runNativePing(host, count, payloadSize, requestId);
      if (!accepted) {
        if (nativePingTimeoutRef.current) clearTimeout(nativePingTimeoutRef.current);
        nativePingTimeoutRef.current = null;
        nativePingRequestRef.current = null;
        setIsNativePinging(false);
        setNativePingProgress(null);
        setNativePingError('Android rejected the ping request. Check the host, count, and payload size.');
      }
    } catch {
      if (nativePingTimeoutRef.current) clearTimeout(nativePingTimeoutRef.current);
      nativePingTimeoutRef.current = null;
      nativePingRequestRef.current = null;
      setIsNativePinging(false);
      setNativePingProgress(null);
      setNativePingError('The Android ping bridge could not be reached. Restart the app and try again.');
    }
  };

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
      let latencyMs: number | null = null;
      try {
        const result = await measureLatency({
          targetUrl: pingTarget,
          sampleCount: 1,
          timeoutMs: 1500,
          signal: controller.signal,
        });
        latencyMs = result.samples[0]?.latencyMs ?? null;
      } catch {
        latencyMs = null;
      }

      if (isCancelled || controller.signal.aborted) return;

      setRollingPingSamples((previous) => [...previous.slice(-23), latencyMs]);
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
    try {
      const results = await Promise.all(
        DNS_BENCHMARK_RESOLVERS.map(async (resolver) => ({
          name: resolver.name,
          ...await measureDnsResolverTiming(resolver, 'example.com'),
        }))
      );
      results.sort((a, b) => (a.durationMs ?? Number.POSITIVE_INFINITY) - (b.durationMs ?? Number.POSITIVE_INFINITY));
      setDnsRankings(results);
    } finally {
      setIsBenchmarkingDns(false);
    }
  };

  // Run Router Distance Ping
  const handleRunGatewayPing = async () => {
    setIsPingingGateway(true);
    setGatewayResult(null);
    setGatewayError(null);
    try {
      const res = await measureLatency({
        targetUrl: defaultTestEndpoints.ping,
        sampleCount: 8,
      });
      if (res.medianMs !== null) {
        setGatewayResult({
          minMs: res.minMs,
          medianMs: res.medianMs,
          maxMs: res.maxMs,
          jitterMs: res.jitterMs,
        });
      } else {
        setGatewayError(res.errorMessage || 'No successful endpoint probes were received.');
      }
    } catch {
      setGatewayError('The endpoint probe failed. Check the configured URL and try again.');
    } finally {
      setIsPingingGateway(false);
    }
  };

  // Run Reachability Check
  const handleCheckReach = async () => {
    let target: URL;
    try {
      target = new URL(reachTarget.trim());
    } catch {
      setReachResult({ status: 'Enter a valid HTTP or HTTPS URL.', durationMs: 0, reachable: false });
      return;
    }
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) {
      setReachResult({ status: 'Use an HTTP or HTTPS URL without embedded credentials.', durationMs: 0, reachable: false });
      return;
    }

    setIsCheckingReach(true);
    setReachResult(null);
    const start = performance.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8_000);
    try {
      const res = await fetch(target.toString(), {
        mode: 'no-cors',
        cache: 'no-store',
        credentials: 'omit',
        signal: controller.signal,
      });
      const durationMs = Math.round(performance.now() - start);
      setReachResult({
        status: res.type === 'opaque' ? 'Request completed; HTTP status hidden by browser' : `HTTP ${res.status}`,
        durationMs,
        reachable: true,
      });
    } catch {
      const durationMs = Math.round(performance.now() - start);
      setReachResult({
        status: controller.signal.aborted
          ? 'Request timed out; browser cannot expose the underlying network error.'
          : 'No response; browser cannot distinguish DNS, TLS, or network failures.',
        durationMs,
        reachable: false,
      });
    } finally {
      clearTimeout(timeoutId);
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

        {canUseNativePing && (
          <section className="md:col-span-2 space-y-3.5 rounded-2xl border border-cyan-500/20 bg-[#0E1A2E] p-4 shadow-xl sm:p-5" aria-labelledby="native-ping-heading">
            <div className="flex items-center gap-2 text-cyan-300">
              <Activity className="h-4 w-4" aria-hidden="true" />
              <h3 id="native-ping-heading" className="text-sm font-bold text-white">Native ICMP Ping</h3>
            </div>
            <p className="text-xs leading-relaxed text-slate-400">
              Sends real ICMP echo requests from Android. Payload size is ICMP data only, excluding network headers. Limits: 1–10 probes and 8–1,400 bytes.
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_9rem_auto] sm:items-end">
              <label htmlFor="native-ping-host" className="block min-w-0 space-y-1 text-[10px] text-slate-400">
                <span>Host or IP address</span>
                <input
                  id="native-ping-host"
                  type="text"
                  value={nativePingHost}
                  onChange={(event) => setNativePingHost(event.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="min-h-11 w-full rounded-lg border border-white/10 bg-slate-900 px-3 text-xs font-mono text-slate-200"
                />
              </label>
              <label htmlFor="native-ping-count" className="block space-y-1 text-[10px] text-slate-400">
                <span>Probe count</span>
                <input
                  id="native-ping-count"
                  type="number"
                  min={1}
                  max={10}
                  step={1}
                  value={nativePingCount}
                  onChange={(event) => setNativePingCount(event.target.value)}
                  className="min-h-11 w-full rounded-lg border border-white/10 bg-slate-900 px-3 text-xs text-slate-200"
                />
              </label>
              <label htmlFor="native-ping-size" className="block space-y-1 text-[10px] text-slate-400">
                <span>Payload bytes</span>
                <input
                  id="native-ping-size"
                  type="number"
                  min={8}
                  max={1400}
                  step={1}
                  value={nativePingPayloadSize}
                  onChange={(event) => setNativePingPayloadSize(event.target.value)}
                  className="min-h-11 w-full rounded-lg border border-white/10 bg-slate-900 px-3 text-xs text-slate-200"
                />
              </label>
              <button
                type="button"
                onClick={handleRunNativePing}
                disabled={isNativePinging}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-cyan-500 disabled:cursor-wait disabled:opacity-60"
              >
                {isNativePinging && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {isNativePinging ? 'Pinging…' : 'Run ping'}
              </button>
            </div>

            {isNativePinging && nativePingProgress && (
              <div className="space-y-2 rounded-xl border border-cyan-500/20 bg-cyan-950/20 p-3" role="status" aria-live="polite">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <span className="font-semibold text-cyan-100">Pinging {nativePingProgress.host}</span>
                  <span className="text-slate-300">
                    {nativePingProgress.sent}/{nativePingProgress.count} sent · {nativePingProgress.received} replies
                  </span>
                </div>
                <div className="max-h-36 space-y-1 overflow-y-auto font-mono text-[10px] text-slate-300">
                  {nativePingLiveReplies.map((progress) => (
                    <p key={progress.sent} className="break-all">
                      {progress.line}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {nativePingError && (
              <p className="rounded-xl border border-rose-500/20 bg-rose-950/20 p-3 text-xs text-rose-200" role="alert">
                {nativePingError}
              </p>
            )}
            {nativePingResult && (
              <details
                className={`group overflow-hidden rounded-xl border ${
                  nativePingResult.status === 'success'
                    ? 'border-emerald-500/20 bg-emerald-950/20'
                    : nativePingResult.status === 'partial'
                    ? 'border-amber-500/20 bg-amber-950/20'
                    : 'border-rose-500/20 bg-rose-950/20'
                }`}
                aria-label={`Ping results for ${nativePingResult.host}`}
              >
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 outline-none transition-colors hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0">
                    <span
                      className={`block text-xs font-semibold ${
                        nativePingResult.status === 'success'
                          ? 'text-emerald-200'
                          : nativePingResult.status === 'partial'
                          ? 'text-amber-200'
                          : 'text-rose-200'
                      }`}
                      role="status"
                      aria-live="polite"
                    >
                      {nativePingResult.status === 'success'
                        ? 'Ping results'
                        : nativePingResult.status === 'partial'
                        ? 'Partial ping results'
                        : 'Ping failed'}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-slate-300">
                      {nativePingResult.host} · {nativePingResult.received}/{nativePingResult.sent} replies · {nativePingResult.lossPercent.toFixed(0)}% loss
                    </span>
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-cyan-300 transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <div className="space-y-3 border-t border-white/10 p-3" role={nativePingResult.status === 'failed' ? 'alert' : 'status'} aria-live="polite">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-100">{nativePingResult.message}</p>
                    <span className="text-[10px] text-slate-400">{nativePingResult.payloadSize}-byte payload</span>
                  </div>
                  <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {[
                      ['Replies', `${nativePingResult.received}/${nativePingResult.sent}`],
                      ['Loss', `${nativePingResult.lossPercent.toFixed(0)}%`],
                      ['Min', formatToolLatency(nativePingResult.minMs)],
                      ['Average', formatToolLatency(nativePingResult.avgMs)],
                      ['Max', formatToolLatency(nativePingResult.maxMs)],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-lg border border-white/5 bg-slate-950/40 p-2">
                        <dt className="text-[10px] text-slate-400">{label}</dt>
                        <dd className="mt-0.5 font-mono text-xs font-semibold text-slate-100">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  {nativePingResult.samples.length > 0 && (
                    <p className="break-words font-mono text-[10px] text-slate-400">
                      Reply times: {nativePingResult.samples.map((sample) => `${sample.toFixed(1)} ms`).join(' · ')}
                    </p>
                  )}
                </div>
              </details>
            )}
          </section>
        )}

        {/* Tool 1: Continuous Ping & Jitter Monitor */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#0E1A2E] border border-white/10 space-y-3.5 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-cyan-400">
              <Activity className="w-4 h-4" />
              <h3 className="text-sm font-bold text-white">Continuous HTTPS RTT Monitor</h3>
            </div>
            <button
              type="button"
              onClick={() => setIsMonitoringPing(!isMonitoringPing)}
              aria-pressed={isMonitoringPing}
              className={`inline-flex min-h-11 items-center space-x-1 rounded-xl px-3 text-xs font-semibold cursor-pointer transition-all ${
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
            Rolling HTTPS request round-trip time, not ICMP ping. Red markers indicate failed probes.
          </p>

          <label htmlFor="continuous-ping-target" className="block space-y-1 text-[10px] text-slate-400">
            <span>HTTPS probe target</span>
            <input
              id="continuous-ping-target"
              type="url"
              value={pingTarget}
              onChange={(e) => setPingTarget(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-slate-900 p-2 text-xs font-mono text-slate-200"
            />
          </label>

          {/* Rolling Graph Visualization */}
          <div
            role="img"
            aria-label="Recent HTTPS round-trip samples; red markers indicate failed probes"
            className="h-24 bg-slate-900/90 rounded-xl border border-white/5 p-2 flex items-end justify-between gap-1 overflow-hidden"
          >
            {rollingPingSamples.length === 0 ? (
              <span className="text-[11px] text-slate-600 m-auto font-mono">
                Tap Start to begin live latency stream
              </span>
            ) : (
              rollingPingSamples.map((ms, idx) => {
                const isDropped = ms === null;
                const heightPct = isDropped ? 6 : Math.min(100, Math.max(10, (ms / 150) * 100));
                return (
                  <div
                    key={idx}
                    className="flex-1 flex flex-col items-center justify-end h-full"
                    title={isDropped ? 'Probe failed' : `${ms} ms`}
                  >
                    <div
                      style={{ height: `${heightPct}%` }}
                      className={`w-full rounded-t-sm transition-all ${
                        isDropped ? 'bg-rose-500' : ms !== null && ms > 80 ? 'bg-amber-400' : 'bg-cyan-400'
                      }`}
                    />
                  </div>
                );
              })
            )}
          </div>
          {rollingPingSamples.length > 0 && (
            <p className="text-[10px] text-slate-400" role="status">
              Latest probe: {rollingPingSamples[rollingPingSamples.length - 1] === null
                ? 'failed'
                : formatToolLatency(rollingPingSamples[rollingPingSamples.length - 1])}
            </p>
          )}
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
            Measures latency under a controlled download load of up to 5 MiB. This can briefly affect other devices on your network.
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
              } catch {
                setBloatSummary({
                  status: 'failed',
                  baselineLatencyMs: null,
                  underLoadLatencyMs: null,
                  postLoadLatencyMs: null,
                  loadedDeltaMs: null,
                  bufferbloatGrade: 'unknown',
                  severityDescription: 'The Bufferbloat probe failed before usable measurements were returned.',
                  limitations: [],
                });
              } finally {
                setIsTestingBloat(false);
              }
            }}
            disabled={isTestingBloat}
            className="min-h-11 w-full rounded-xl bg-amber-600 py-2.5 text-xs font-semibold text-white transition-all hover:bg-amber-500 flex items-center justify-center space-x-1.5 disabled:opacity-50 cursor-pointer"
          >
            {isTestingBloat ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            <span>{isTestingBloat ? 'Measuring Queue Delta...' : 'Test Bufferbloat Under Load'}</span>
          </button>

          {bloatSummary && (
            <div
              className="p-3 rounded-xl bg-slate-900 border border-white/5 space-y-2 text-xs"
              role={bloatSummary.status === 'success' ? 'status' : 'alert'}
            >
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Bufferbloat result:</span>
                <span className={`text-sm font-bold px-2 py-0.5 rounded border ${
                  bloatSummary.status === 'success'
                    ? 'text-amber-400 bg-amber-950 border-amber-800'
                    : 'text-rose-300 bg-rose-950 border-rose-800'
                }`}>
                  {bloatSummary.status === 'success' && bloatSummary.bufferbloatGrade !== 'unknown'
                    ? `Grade ${bloatSummary.bufferbloatGrade}`
                    : 'Inconclusive'}
                </span>
              </div>
              <p className="text-slate-300">{bloatSummary.severityDescription}</p>
              <div className="grid grid-cols-1 gap-1 text-[11px] sm:grid-cols-3 sm:text-center">
                <div>Base: {formatToolLatency(bloatSummary.baselineLatencyMs)}</div>
                <div className="text-rose-300">Under load: {formatToolLatency(bloatSummary.underLoadLatencyMs)}</div>
                <div className="text-amber-300">Delta: {formatToolLatency(bloatSummary.loadedDeltaMs)}</div>
              </div>
              {bloatSummary.status !== 'success' && bloatSummary.limitations.length > 0 && (
                <p className="text-amber-200">{bloatSummary.limitations.join(' ')}</p>
              )}
            </div>
          )}
        </div>

        {/* Tool 3: DNS Benchmark Utility */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#0E1A2E] border border-white/10 space-y-3.5 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-emerald-400">
              <Globe className="w-4 h-4" />
              <h3 className="text-sm font-bold text-white">DoH Resolver Comparison</h3>
            </div>
            <button
              onClick={handleRunDnsBenchmark}
              disabled={isBenchmarkingDns}
              className="inline-flex min-h-11 items-center space-x-1 rounded-xl bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 cursor-pointer"
            >
              {isBenchmarkingDns ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
              <span>Benchmark</span>
            </button>
          </div>
          <p className="text-xs text-slate-400">
            Sends the same example.com A query to Cloudflare and Google Public DNS. DoH RTT includes HTTPS and network overhead, not just resolver processing.
          </p>

          {dnsRankings.length > 0 ? (
            <div className="space-y-1.5 font-mono text-xs">
              {dnsRankings.map((r, idx) => (
                <div
                  key={r.name}
                  className="space-y-1 p-2 rounded-lg bg-slate-900/80 border border-white/5"
                >
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="text-cyan-400 font-bold">{r.durationMs === null ? '—' : `#${idx + 1}`}</span>
                      <span className="truncate text-slate-200">{r.name}</span>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className={`font-bold ${r.durationMs !== null ? 'text-emerald-400' : 'text-rose-300'}`}>
                        {r.durationMs !== null ? `${r.durationMs} ms DoH RTT` : 'Failed'}
                      </span>
                      {r.resolvedIp && <span className="block text-[10px] text-slate-500">A {r.resolvedIp}</span>}
                    </div>
                  </div>
                  {r.errorMessage && <p className="text-[10px] text-rose-300">{r.errorMessage}</p>}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-slate-900/40 border border-white/5 text-center text-xs text-slate-500">
              Run the same DNS-over-HTTPS query against both providers.
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
              type="button"
              onClick={handleRunGatewayPing}
              disabled={isPingingGateway}
              className="inline-flex min-h-11 items-center space-x-1 rounded-xl bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 cursor-pointer"
            >
              {isPingingGateway ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
              <span>Probe Endpoint</span>
            </button>
          </div>
          <p className="text-xs text-slate-400">
            Measures HTTPS request round-trip time to the configured test endpoint; it is not a router or ICMP ping.
          </p>

          {gatewayResult ? (
            <div className="p-3 rounded-xl bg-slate-900 border border-white/5 font-mono text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Median Endpoint RTT:</span>
                <span className="font-bold text-indigo-300">{formatToolLatency(gatewayResult.medianMs)}</span>
              </div>
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>Min: {formatToolLatency(gatewayResult.minMs)} · Max: {formatToolLatency(gatewayResult.maxMs)}</span>
                <span>Jitter: {formatToolLatency(gatewayResult.jitterMs)}</span>
              </div>
            </div>
          ) : gatewayError ? (
            <p className="rounded-xl border border-rose-500/20 bg-rose-950/20 p-3 text-xs text-rose-200" role="alert">
              {gatewayError}
            </p>
          ) : (
            <div className="p-4 rounded-xl bg-slate-900/40 border border-white/5 text-center text-xs text-slate-500">
              Run a round-trip latency test against the configured HTTP endpoint.
            </div>
          )}
        </div>

        <div className="md:col-span-2 p-4 sm:p-5 rounded-2xl bg-[#0E1A2E] border border-white/10 space-y-3.5 shadow-xl">
          <div className="flex items-center gap-2 text-cyan-300">
            <Server className="h-4 w-4" aria-hidden="true" />
            <h3 className="text-sm font-bold text-white">Web Endpoint Reachability</h3>
          </div>
          <p className="text-xs text-slate-400">
            Checks an HTTP(S) request only; cross-origin status is hidden, and this does not scan ports.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label htmlFor="reachability-target" className="block space-y-1 text-[10px] text-slate-400">
              <span>HTTP(S) target URL</span>
              <input
                id="reachability-target"
                type="url"
                value={reachTarget}
                onChange={(event) => setReachTarget(event.target.value)}
                className="w-full rounded-lg border border-white/10 bg-slate-900 p-2 text-xs font-mono text-slate-200"
              />
            </label>
            <button
              type="button"
              onClick={handleCheckReach}
              disabled={isCheckingReach}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-cyan-500 disabled:opacity-50"
            >
              {isCheckingReach && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {isCheckingReach ? 'Checking…' : 'Check endpoint'}
            </button>
          </div>
          {reachResult && (
            <p
              className={`rounded-xl border p-3 text-xs ${
                reachResult.reachable
                  ? 'border-emerald-500/20 bg-emerald-950/20 text-emerald-200'
                  : 'border-rose-500/20 bg-rose-950/20 text-rose-200'
              }`}
              role={reachResult.reachable ? 'status' : 'alert'}
            >
              {reachResult.status}
              {reachResult.durationMs > 0 && ` · ${reachResult.durationMs} ms`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
