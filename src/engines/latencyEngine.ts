/**
 * SpeedXpat — Latency & Jitter Measurement Engine
 * Compliant with SPEEDXPAT_SPEC.md Section 5.4
 *
 * Measures multi-sample round-trip time, calculates min/median/avg/max and RFC 3550 jitter.
 * Never labels HTTPS timing as raw ICMP ping.
 */

import { LatencySummary, LatencySample, TestStatus } from '../types/network';

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

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const abortListener = () => controller.abort();
      if (signal) signal.addEventListener('abort', abortListener, { once: true });

      let response: Response;
      try {
        response = await fetch(probeUrl, {
          method: 'GET',
          headers: { Range: 'bytes=0-0' },
          cache: 'no-store',
          signal: controller.signal,
        }).catch(async () => {
          return await fetch(probeUrl, {
            method: 'HEAD',
            cache: 'no-store',
            signal: controller.signal,
          });
        });
      } finally {
        clearTimeout(timeoutId);
        if (signal) signal.removeEventListener('abort', abortListener);
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

    // Small inter-probe pacing interval (50ms)
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

  // RFC 3550 style jitter calculation
  let jitterMs: number | null = null;
  if (rawValues.length >= 2) {
    let sumDeltas = 0;
    for (let j = 1; j < rawValues.length; j++) {
      sumDeltas += Math.abs(rawValues[j] - rawValues[j - 1]);
    }
    jitterMs = Math.round(sumDeltas / (rawValues.length - 1));
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
