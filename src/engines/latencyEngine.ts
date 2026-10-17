/**
 * SpeedXpat — Latency & Jitter Measurement Engine
 * Compliant with SPEEDXPAT_SPEC.md Section 5.4
 *
 * Measures multi-sample round-trip time, calculates min/median/avg/max and RFC 3550 jitter.
 * Never labels HTTPS timing as raw ICMP ping.
 */

import { LatencySummary, LatencySample, TestStatus } from '../types/network';

export function calculateJitterMs(latenciesMs: number[]): number {
  if (!Array.isArray(latenciesMs) || latenciesMs.length < 2) {
    return 0;
  }

  const finiteValues = latenciesMs.filter((value) => Number.isFinite(value) && value >= 0);
  if (finiteValues.length < 2) {
    return 0;
  }

  const sorted = [...finiteValues].sort((a, b) => a - b);
  const median =
    sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];

  const absoluteDeviations = sorted.map((value) => Math.abs(value - median));
  const deviationMedian =
    absoluteDeviations.length % 2 === 0
      ? (absoluteDeviations[absoluteDeviations.length / 2 - 1] + absoluteDeviations[absoluteDeviations.length / 2]) / 2
      : absoluteDeviations[Math.floor(absoluteDeviations.length / 2)];

  return Math.round(deviationMedian);
}

export interface LatencyProbeOptions {
  targetUrl: string;
  sampleCount?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  onProgress?: (sampleIndex: number, currentMs: number) => void;
  onProbeProgress?: (completedProbeCount: number, successfulProbeCount: number, failedProbeCount: number) => void;
}

export async function measureLatency(
  options: LatencyProbeOptions
): Promise<LatencySummary> {
  const {
    targetUrl,
    sampleCount = 8,
    timeoutMs = 4000,
    signal,
    onProgress,
    onProbeProgress,
  } = options;

  const samples: LatencySample[] = [];
  let completedProbeCount = 0;
  let failedProbeCount = 0;
  const limitations: string[] = [
    'Measured using HTTPS fetch round-trip time in browser runtime (includes TLS/HTTP protocol overhead; not bare ICMP socket ping).',
    'HTTP probe failures are not IP-layer packet loss; packet loss was not measured.',
  ];

  let status: TestStatus = 'success';
  let errorMessage: string | undefined;

  for (let i = 0; i < sampleCount; i++) {
    if (signal?.aborted) {
      status = 'cancelled';
      break;
    }

    const start = performance.now();
    try {
      // Append cache buster to prevent cached responses
      const sep = targetUrl.includes('?') ? '&' : '?';
      const probeUrl = `${targetUrl}${sep}_t=${Date.now()}_${i}`;

      const fetchProbe = async (method: 'GET' | 'HEAD'): Promise<Response> => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        const abortListener = () => controller.abort();
        if (signal) signal.addEventListener('abort', abortListener, { once: true });

        try {
          return await fetch(probeUrl, {
            method,
            ...(method === 'GET' ? { headers: { Range: 'bytes=0-0' } } : {}),
            cache: 'no-store',
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
          if (signal) signal.removeEventListener('abort', abortListener);
        }
      };

      let response: Response;
      try {
        response = await fetchProbe('GET');
      } catch (error: unknown) {
        if (
          signal?.aborted ||
          (error instanceof DOMException && error.name === 'AbortError')
        ) {
          throw error;
        }
        response = await fetchProbe('HEAD');
      }

      const elapsed = Math.round(performance.now() - start);

      if (response && (response.ok || response.status === 206 || response.status === 304 || response.status === 204)) {
        completedProbeCount++;
        samples.push({ timestamp: Date.now(), latencyMs: Math.max(1, elapsed) });
        if (onProgress) onProgress(i + 1, Math.max(1, elapsed));
        onProbeProgress?.(completedProbeCount, samples.length, failedProbeCount);
      } else {
        completedProbeCount++;
        failedProbeCount++;
        errorMessage = `HTTP probe returned status ${response.status}.`;
        onProbeProgress?.(completedProbeCount, samples.length, failedProbeCount);
      }
    } catch (err: unknown) {
      if (signal?.aborted) {
        status = 'cancelled';
        break;
      }
      completedProbeCount++;
      failedProbeCount++;
      errorMessage = String(err);
      onProbeProgress?.(completedProbeCount, samples.length, failedProbeCount);
    }

    // Small inter-probe pacing interval.
    await new Promise((r) => setTimeout(r, 60));
  }

  if (samples.length === 0) {
    status = signal?.aborted ? 'cancelled' : 'failed';
    return {
      status,
      target: targetUrl,
      method: 'HTTPS Fetch Round-Trip',
      sampleCount: 0,
      completedProbeCount,
      failedProbeCount,
      minMs: null,
      medianMs: null,
      avgMs: null,
      maxMs: null,
      jitterMs: null,
      packetLossPercent: null,
      samples: [],
      limitations,
      errorMessage: errorMessage || 'No successful latency probe samples were received.',
    };
  }

  const rawValues = samples.map((s) => s.latencyMs);
  const sorted = [...rawValues].sort((a, b) => a - b);
  const minMs = sorted[0];
  const maxMs = sorted[sorted.length - 1];
  const avgMs = Math.round(rawValues.reduce((a, b) => a + b, 0) / rawValues.length);
  const medianMs =
    sorted.length % 2 === 1
      ? sorted[Math.floor(sorted.length / 2)]
      : Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2);

  // RFC 3550-style jitter should describe the normal spread of RTT measurements,
  // not the magnitude of a single transient spike. Median absolute deviation keeps
  // the value stable under short-lived outliers while preserving real network noise.
  let jitterMs: number | null = null;
  if (rawValues.length >= 2) {
    jitterMs = calculateJitterMs(rawValues);
  }

  return {
    status: status === 'cancelled'
      ? 'cancelled'
      : samples.length >= Math.ceil(sampleCount / 2) ? 'success' : 'insufficient_data',
    target: targetUrl,
    method: 'HTTPS Fetch Round-Trip',
    sampleCount: samples.length,
    completedProbeCount,
    failedProbeCount,
    minMs,
    medianMs,
    avgMs,
    maxMs,
    jitterMs,
    packetLossPercent: null,
    samples,
    limitations,
  };
}
