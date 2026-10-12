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
} from 'lucide-react';
import { measureLatency } from '../engines/latencyEngine';
import { measureDnsTiming } from '../engines/dnsAndHttpEngine';
import { measureLoadedLatency } from '../engines/loadedLatencyEngine';
import { LoadedLatencySummary } from '../types/network';

export const DiagnosticToolsTab: React.FC = () => {
  // Tool 1: Continuous Ping & Jitter Monitor
  const [isMonitoringPing, setIsMonitoringPing] = useState(false);
  const [pingTarget, setPingTarget] = useState('/api/ping');
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

  // Tool 4: Local Gateway Ping (Router Distance Test)
  const [gatewayTarget, setGatewayTarget] = useState('/api/ping');
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

  // Continuous Ping Loop
  useEffect(() => {
    if (isMonitoringPing) {
      pingIntervalRef.current = setInterval(async () => {
        const start = performance.now();
        try {
          const res = await fetch(`${pingTarget}?_t=${Date.now()}`, {
            method: 'HEAD',
            cache: 'no-store',
          }).catch(async () => {
            return await fetch(`${pingTarget}?_t=${Date.now()}`, { cache: 'no-store' });
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
                  pingTargetUrl: '/api/ping',
                  loadTargetUrl: '/api/speedtest/download',
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

        {/* Tool 4: Local Gateway Ping (Router Distance Test) */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#0E1A2E] border border-white/10 space-y-3.5 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-indigo-400">
              <Radio className="w-4 h-4" />
              <h3 className="text-sm font-bold text-white">Local Gateway Ping (Wi-Fi Quality)</h3>
            </div>
            <button
              onClick={handleRunGatewayPing}
              disabled={isPingingGateway}
              className="px-3 py-1 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center space-x-1 disabled:opacity-50 cursor-pointer"
            >
              {isPingingGateway ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
              <span>Ping Gateway</span>
            </button>
          </div>
          <p className="text-xs text-slate-400">
            Isolates local wireless interference by measuring round-trip time directly to your router.
          </p>

          {gatewayResult ? (
            <div className="p-3 rounded-xl bg-slate-900 border border-white/5 font-mono text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Median Gateway RTT:</span>
                <span className="font-bold text-indigo-300">{gatewayResult.medianMs} ms</span>
              </div>
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>Min: {gatewayResult.minMs}ms • Max: {gatewayResult.maxMs}ms</span>
                <span>Jitter: {gatewayResult.jitterMs}ms</span>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-slate-900/40 border border-white/5 text-center text-xs text-slate-500">
              Run test to isolate Wi-Fi lag from ISP bottlenecks.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
