import React, { useState } from 'react';
import {
  Wrench,
  Activity,
  Globe,
  Gauge,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Play,
  RotateCcw,
} from 'lucide-react';
import { measureLatency } from '../engines/latencyEngine';
import { measureDnsTiming, measureHttpTiming } from '../engines/dnsAndHttpEngine';
import { measureLoadedLatency } from '../engines/loadedLatencyEngine';
import { LatencySummary, DnsTimingResult, HttpTimingResult, LoadedLatencySummary } from '../types/network';

export const ToolsView: React.FC = () => {
  // Tool 1: Latency Ping Probe State
  const [pingTarget, setPingTarget] = useState('/api/ping');
  const [pingSamples, setPingSamples] = useState(8);
  const [isPinging, setIsPinging] = useState(false);
  const [pingResult, setPingResult] = useState<LatencySummary | null>(null);

  // Tool 2: DNS Resolution Probe State
  const [dnsDomain, setDnsDomain] = useState('cloudflare.com');
  const [isResolvingDns, setIsResolvingDns] = useState(false);
  const [dnsResult, setDnsResult] = useState<DnsTimingResult | null>(null);

  // Tool 3: HTTP Waterfall Timing State
  const [httpTarget, setHttpTarget] = useState('/api/ping');
  const [isTestingHttp, setIsTestingHttp] = useState(false);
  const [httpResult, setHttpResult] = useState<HttpTimingResult | null>(null);

  // Tool 4: Standalone Bufferbloat Test
  const [isTestingBloat, setIsTestingBloat] = useState(false);
  const [bloatResult, setBloatResult] = useState<LoadedLatencySummary | null>(null);

  const handleRunPing = async () => {
    setIsPinging(true);
    setPingResult(null);
    try {
      const res = await measureLatency({
        targetUrl: pingTarget,
        sampleCount: pingSamples,
      });
      setPingResult(res);
    } catch {
      // handled in engine
    } finally {
      setIsPinging(false);
    }
  };

  const handleRunDns = async () => {
    setIsResolvingDns(true);
    setDnsResult(null);
    try {
      const res = await measureDnsTiming(dnsDomain);
      setDnsResult(res);
    } catch {
      // handled
    } finally {
      setIsResolvingDns(false);
    }
  };

  const handleRunHttp = async () => {
    setIsTestingHttp(true);
    setHttpResult(null);
    try {
      const res = await measureHttpTiming(httpTarget);
      setHttpResult(res);
    } catch {
      // handled
    } finally {
      setIsTestingHttp(false);
    }
  };

  const handleRunBufferbloat = async () => {
    setIsTestingBloat(true);
    setBloatResult(null);
    try {
      const res = await measureLoadedLatency({
        pingTargetUrl: '/api/ping',
        loadTargetUrl: '/api/speedtest/download',
      });
      setBloatResult(res);
    } catch {
      // handled
    } finally {
      setIsTestingBloat(false);
    }
  };

  return (
    <div className="space-y-6 text-white max-w-5xl mx-auto">
      {/* Title */}
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-xl bg-violet-500/20 text-violet-400 flex items-center justify-center border border-violet-500/30">
          <Wrench className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Technician Diagnostics & Custom Tools</h2>
          <p className="text-xs text-slate-400">
            Compliant with Section 5.14: Granular ping, DNS, HTTP waterfall & queue telemetry
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tool 1: Latency & Jitter Probe */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center space-x-2 text-cyan-400">
            <Activity className="w-5 h-5" />
            <h3 className="font-semibold text-white text-sm">Latency & Jitter Probe</h3>
          </div>
          <p className="text-xs text-slate-400">
            Send sequential round-trip requests to calculate minimum, median, maximum, and RFC 3550 jitter.
          </p>

          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={pingTarget}
                onChange={(e) => setPingTarget(e.target.value)}
                placeholder="/api/ping or https://example.com"
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
              />
              <select
                value={pingSamples}
                onChange={(e) => setPingSamples(Number(e.target.value))}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-300"
              >
                <option value={4}>4 probes</option>
                <option value={8}>8 probes</option>
                <option value={16}>16 probes</option>
              </select>
              <button
                onClick={handleRunPing}
                disabled={isPinging}
                className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center space-x-1 disabled:opacity-50"
              >
                {isPinging ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                <span>Ping</span>
              </button>
            </div>
          </div>

          {pingResult && (
            <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2 text-xs">
              <div className="grid grid-cols-4 gap-2 text-center font-mono">
                <div className="p-1.5 rounded bg-slate-900">
                  <div className="text-[9px] text-slate-400">MIN</div>
                  <div className="font-bold text-slate-200">{pingResult.minMs} ms</div>
                </div>
                <div className="p-1.5 rounded bg-slate-900">
                  <div className="text-[9px] text-slate-400">MEDIAN</div>
                  <div className="font-bold text-cyan-300">{pingResult.medianMs} ms</div>
                </div>
                <div className="p-1.5 rounded bg-slate-900">
                  <div className="text-[9px] text-slate-400">MAX</div>
                  <div className="font-bold text-slate-200">{pingResult.maxMs} ms</div>
                </div>
                <div className="p-1.5 rounded bg-slate-900">
                  <div className="text-[9px] text-slate-400">JITTER</div>
                  <div className="font-bold text-amber-300">{pingResult.jitterMs} ms</div>
                </div>
              </div>
              <div className="text-[10px] text-slate-400 font-mono">
                Method: {pingResult.method} • Loss: {pingResult.packetLossPercent}%
              </div>
            </div>
          )}
        </div>

        {/* Tool 2: DNS Resolution Timing */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center space-x-2 text-emerald-400">
            <Globe className="w-5 h-5" />
            <h3 className="font-semibold text-white text-sm">DNS Resolution Timing Probe</h3>
          </div>
          <p className="text-xs text-slate-400">
            Benchmark domain resolution time via backend system resolver or DNS-over-HTTPS.
          </p>

          <div className="flex gap-2">
            <input
              type="text"
              value={dnsDomain}
              onChange={(e) => setDnsDomain(e.target.value)}
              placeholder="e.g. cloudflare.com or google.com"
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
            />
            <button
              onClick={handleRunDns}
              disabled={isResolvingDns}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center space-x-1 disabled:opacity-50"
            >
              {isResolvingDns ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              <span>Resolve</span>
            </button>
          </div>

          {dnsResult && (
            <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-1.5 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400">Resolution Timing:</span>
                <span className="font-bold text-emerald-300">{dnsResult.durationMs} ms</span>
              </div>
              {dnsResult.resolvedIp && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Resolved Address:</span>
                  <span className="text-slate-200">{dnsResult.resolvedIp}</span>
                </div>
              )}
              <div className="text-[10px] text-slate-500">Method: {dnsResult.method}</div>
            </div>
          )}
        </div>

        {/* Tool 3: HTTP Connection Waterfall Breakdown */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center space-x-2 text-indigo-400">
            <Activity className="w-5 h-5" />
            <h3 className="font-semibold text-white text-sm">HTTP Waterfall Timing Inspector</h3>
          </div>
          <p className="text-xs text-slate-400">
            Extracts connection phases (DNS lookup, TCP connect, TLS handshake, TTFB) via Resource Timing API.
          </p>

          <div className="flex gap-2">
            <input
              type="text"
              value={httpTarget}
              onChange={(e) => setHttpTarget(e.target.value)}
              placeholder="/api/ping"
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={handleRunHttp}
              disabled={isTestingHttp}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center space-x-1 disabled:opacity-50"
            >
              {isTestingHttp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              <span>Inspect</span>
            </button>
          </div>

          {httpResult && (
            <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2 text-xs font-mono">
              <div className="flex justify-between font-bold text-slate-200 border-b border-slate-700 pb-1">
                <span>Total Elapsed Duration:</span>
                <span className="text-indigo-300">{httpResult.totalTimeMs} ms</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                <div>DNS Lookup: {httpResult.dnsTimeMs !== null ? `${httpResult.dnsTimeMs} ms` : 'Cached'}</div>
                <div>TCP Connect: {httpResult.connectTimeMs !== null ? `${httpResult.connectTimeMs} ms` : 'Pooled'}</div>
                <div>TLS Handshake: {httpResult.tlsTimeMs !== null ? `${httpResult.tlsTimeMs} ms` : 'Reused'}</div>
                <div>Time To First Byte: {httpResult.ttfbMs} ms</div>
              </div>
            </div>
          )}
        </div>

        {/* Tool 4: Standalone Bufferbloat Test */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center space-x-2 text-amber-400">
            <Gauge className="w-5 h-5" />
            <h3 className="font-semibold text-white text-sm">Standalone Bufferbloat Diagnostic</h3>
          </div>
          <p className="text-xs text-slate-400">
            Measures latency before, during, and after an active data transfer to diagnose router queue saturation.
          </p>

          <button
            onClick={handleRunBufferbloat}
            disabled={isTestingBloat}
            className="w-full py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold flex items-center justify-center space-x-1.5 disabled:opacity-50"
          >
            {isTestingBloat ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            <span>{isTestingBloat ? 'Running Load Test...' : 'Test Bufferbloat Congestion'}</span>
          </button>

          {bloatResult && (
            <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2 text-xs">
              <div className="flex justify-between items-center font-mono">
                <span className="text-slate-300">Grade:</span>
                <span className="font-bold text-sm px-2 py-0.5 rounded bg-amber-950 border border-amber-800 text-amber-300">
                  Grade {bloatResult.bufferbloatGrade}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1 text-center font-mono text-[11px]">
                <div className="p-1 rounded bg-slate-900">
                  <div className="text-[9px] text-slate-500">BASE</div>
                  <div>{bloatResult.baselineLatencyMs} ms</div>
                </div>
                <div className="p-1 rounded bg-slate-900">
                  <div className="text-[9px] text-slate-500">LOADED</div>
                  <div className="text-rose-300">{bloatResult.underLoadLatencyMs} ms</div>
                </div>
                <div className="p-1 rounded bg-slate-900">
                  <div className="text-[9px] text-slate-500">DELTA</div>
                  <div className="text-amber-300">+{bloatResult.loadedDeltaMs} ms</div>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">{bloatResult.severityDescription}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
