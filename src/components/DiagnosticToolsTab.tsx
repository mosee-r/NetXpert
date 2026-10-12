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
import { LoadedLatencySummary } from '../types/network';
import { getAndroidNativeBridge, getDefaultTestEndpoints } from '../engines/testEndpoints';

interface WifiScanNetwork {
  ssid: string;
  frequencyMhz: number;
  channel: number | null;
  band: string;
  signalDbm: number;
  security: string;
}

interface WifiScanResponse {
  status: 'success' | 'stale' | 'error';
  scannedAt?: number;
  networks?: WifiScanNetwork[];
  message?: string;
}

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
        'frequencyMhz' in network &&
        typeof network.frequencyMhz === 'number' &&
        'band' in network &&
        typeof network.band === 'string' &&
        'signalDbm' in network &&
        typeof network.signalDbm === 'number' &&
        'security' in network &&
        typeof network.security === 'string' &&
        'channel' in network &&
        (typeof network.channel === 'number' || network.channel === null)
    );
    return { status: data.status, scannedAt: data.scannedAt, networks };
  } catch {
    return null;
  }
}

export const DiagnosticToolsTab: React.FC = () => {
  const defaultTestEndpoints = getDefaultTestEndpoints();

  // Tool 1: Continuous Ping & Jitter Monitor
  const [isMonitoringPing, setIsMonitoringPing] = useState(false);
  const [pingTarget, setPingTarget] = useState(defaultTestEndpoints.ping);
  const [rollingPingSamples, setRollingPingSamples] = useState<number[]>([]);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
  const [reachTarget, setReachTarget] = useState('https://cloudflare.com');
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
  const wifiScanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelCounts = wifiScanNetworks.reduce<Record<string, number>>((counts, network) => {
    const key = `${network.band} · Ch ${network.channel ?? 'Unknown'}`;
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  const channelUsage = Object.entries(channelCounts).sort((a, b) => b[1] - a[1]);

  useEffect(() => {
    const handleWifiScan = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      const response = typeof detail === 'string' ? parseWifiScanResponse(detail) : null;
      if (!response) {
        setWifiScanMessage('The Wi-Fi scanner returned an invalid response. Please try again.');
      } else if (response.status === 'error') {
        setWifiScanMessage(response.message || 'The Wi-Fi scan could not be completed.');
      } else {
        setWifiScanNetworks(response.networks || []);
        setWifiScanTime(response.scannedAt || null);
        setWifiScanMessage(
          response.status === 'stale'
            ? 'Android could not refresh the scan; showing its last available results.'
            : `Scan complete. ${response.networks?.length || 0} visible networks found. Results stay on this device.`
        );
      }
      if (wifiScanTimeoutRef.current) clearTimeout(wifiScanTimeoutRef.current);
      wifiScanTimeoutRef.current = null;
      setIsAnalyzingWifi(false);
    };

    window.addEventListener('speedxpat-wifi-scan', handleWifiScan);
    return () => {
      window.removeEventListener('speedxpat-wifi-scan', handleWifiScan);
      if (wifiScanTimeoutRef.current) clearTimeout(wifiScanTimeoutRef.current);
    };
  }, []);

  const handleRunWifiScan = () => {
    const nativeBridge = getAndroidNativeBridge();
    if (!nativeBridge) {
      setWifiScanMessage('Nearby Wi-Fi scanning requires the Android app; browsers do not expose Wi-Fi scan results.');
      return;
    }

    setWifiScanMessage(null);
    setIsAnalyzingWifi(true);
    try {
      const accepted = nativeBridge.scanWifiNetworks();
      if (!accepted) {
        setIsAnalyzingWifi(false);
        return;
      }
      wifiScanTimeoutRef.current = setTimeout(() => {
        setIsAnalyzingWifi(false);
        setWifiScanMessage('The scan did not finish in time. Check Wi-Fi and Location settings, then try again.');
      }, 15_000);
    } catch {
      setIsAnalyzingWifi(false);
      setWifiScanMessage('The Android Wi-Fi scanner could not be reached. Restart the app and try again.');
    }
  };

  // Continuous Ping Loop
  useEffect(() => {
    if (isMonitoringPing) {
      pingIntervalRef.current = setInterval(async () => {
        const start = performance.now();
        try {
          const separator = pingTarget.includes('?') ? '&' : '?';
          const probeUrl = `${pingTarget}${separator}_t=${Date.now()}`;
          const res = await fetch(probeUrl, {
            method: 'HEAD',
            cache: 'no-store',
          }).catch(async () => {
            return await fetch(probeUrl, { cache: 'no-store' });
          });
          const elapsed = Math.round(performance.now() - start);
          setRollingPingSamples((prev) => [...prev.slice(-24), elapsed]);
        } catch {
          setRollingPingSamples((prev) => [...prev.slice(-24), 999]); // drop marker
        }
      }, 700);
    } else {
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    }

    return () => {
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
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
        <div className="p-4 sm:p-5 rounded-2xl bg-[#0E1A2E] border border-cyan-500/20 space-y-3.5 shadow-xl md:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center space-x-2 text-cyan-400">
              <Wifi className="w-4 h-4" />
              <h3 className="text-sm font-bold text-white">Native Wi-Fi Analyzer</h3>
            </div>
            <button
              type="button"
              onClick={handleRunWifiScan}
              disabled={isAnalyzingWifi}
              className="shrink-0 px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
            >
              {isAnalyzingWifi ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
              <span>{isAnalyzingWifi ? 'Scanning...' : 'Scan nearby Wi-Fi'}</span>
            </button>
          </div>
          <p className="text-xs text-slate-400">
            Reads Android scan results to show visible access points, band, channel, signal strength, and security.
            Network names and scan results are processed locally; BSSIDs are not displayed or stored.
          </p>

          {wifiScanMessage && (
            <div className="space-y-2">
              <div
                role="status"
                className={`rounded-xl border px-3 py-2 text-xs ${
                  wifiScanMessage.includes('Scan complete')
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
                <p className="text-[10px] text-slate-500">
                  Last scan: {new Date(wifiScanTime).toLocaleTimeString()}
                </p>
              )}
              {channelUsage.length > 0 && (
                <div className="rounded-xl border border-white/5 bg-slate-900/50 p-3">
                  <p className="mb-2 text-[10px] uppercase tracking-wide text-slate-400">
                    Visible access points per channel
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {channelUsage.map(([channel, count]) => (
                      <span
                        key={channel}
                        className="rounded-lg bg-slate-800 px-2.5 py-1 text-[10px] text-slate-300"
                      >
                        {channel}: <strong className="text-cyan-200">{count}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                {wifiScanNetworks.map((network, index) => {
                  const signalPercent = Math.max(0, Math.min(100, 2 * (network.signalDbm + 100)));
                  const signalQuality =
                    network.signalDbm >= -50 ? 'Excellent' :
                    network.signalDbm >= -60 ? 'Good' :
                    network.signalDbm >= -67 ? 'Fair' : 'Weak';
                  return (
                    <div
                      key={`${network.ssid}-${network.frequencyMhz}-${network.security}-${index}`}
                      className="rounded-xl border border-white/5 bg-slate-900/70 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 break-words text-sm font-semibold text-slate-100">{network.ssid}</span>
                        <span className="shrink-0 rounded bg-slate-800 px-2 py-0.5 text-[10px] text-cyan-200">
                          {network.security}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                        <span>{network.band} · Ch {network.channel ?? '—'}</span>
                        <span>{network.frequencyMhz} MHz</span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-700">
                          <div
                            className={`h-full rounded-full ${
                              network.signalDbm >= -60
                                ? 'bg-emerald-400'
                                : network.signalDbm >= -70
                                ? 'bg-amber-400'
                                : 'bg-rose-400'
                            }`}
                            style={{ width: `${signalPercent}%` }}
                          />
                        </div>
                        <span className="w-20 text-right text-[10px] text-slate-300">
                          {network.signalDbm} dBm · {signalQuality}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : !wifiScanMessage && (
            <div className="rounded-xl border border-white/5 bg-slate-900/40 p-4 text-center text-xs text-slate-500">
              Nearby scans require the Android app, Wi-Fi enabled, Location permission granted, and Location services on.
            </div>
          )}
        </div>

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
