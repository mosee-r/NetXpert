/**
 * SpeedXpat — Loaded Latency & Bufferbloat Measurement Engine
 * Compliant with SPEEDXPAT_SPEC.md Section 5.5
 *
 * Measures baseline latency, latency under concurrent controlled network load,
 * and post-load latency to quantify bufferbloat and router queue congestion.
 */

import { LoadedLatencySummary, TestStatus } from '../types/network';
import { measureLatency } from './latencyEngine';

export interface LoadedLatencyOptions {
  pingTargetUrl: string;
  loadTargetUrl: string;
  signal?: AbortSignal;
  onPhaseUpdate?: (phase: 'baseline' | 'under_load' | 'post_load', currentMs: number) => void;
}

export async function measureLoadedLatency(
  options: LoadedLatencyOptions
): Promise<LoadedLatencySummary> {
  const { pingTargetUrl, loadTargetUrl, signal, onPhaseUpdate } = options;
  const limitations = [
    'Bufferbloat tested using HTTP-concurrent transfer load. Quantifies router queuing delay under active network traffic.',
  ];

  let status: TestStatus = 'success';

  try {
    // Phase 1: Measure baseline idle latency (3 samples)
    if (onPhaseUpdate) onPhaseUpdate('baseline', 0);
    const baseline = await measureLatency({
      targetUrl: pingTargetUrl,
      sampleCount: 3,
      timeoutMs: 3000,
      signal,
      onProgress: (_idx, ms) => {
        if (onPhaseUpdate) onPhaseUpdate('baseline', ms);
      },
    });

    if (signal?.aborted) {
      return createCancelledSummary(limitations);
    }

    const baselineMs = baseline.medianMs;

    // Phase 2: Start background load stream while measuring latency under load
    if (onPhaseUpdate) onPhaseUpdate('under_load', baselineMs || 0);

    const loadController = new AbortController();
    const abortListener = () => loadController.abort();
    if (signal) signal.addEventListener('abort', abortListener, { once: true });

    // Launch background controlled data stream
    const loadPromise = fetch(
      `${loadTargetUrl}${loadTargetUrl.includes('?') ? '&' : '?'}load=bufferbloat&size=5242880`,
      {
        cache: 'no-store',
        signal: loadController.signal,
      }
    ).catch(() => {
      // Stream load error or aborted
    });

    // Wait 250ms for transfer queues to saturate
    await new Promise((r) => setTimeout(r, 250));

    // Measure latency WHILE load is transferring (4 samples)
    const underLoad = await measureLatency({
      targetUrl: pingTargetUrl,
      sampleCount: 4,
      timeoutMs: 3000,
      signal,
      onProgress: (_idx, ms) => {
        if (onPhaseUpdate) onPhaseUpdate('under_load', ms);
      },
    });

    // Abort and terminate the load stream
    loadController.abort();
    if (signal) signal.removeEventListener('abort', abortListener);
    await loadPromise;

    if (signal?.aborted) {
      return createCancelledSummary(limitations);
    }

    const underLoadMs = underLoad.medianMs;

    // Phase 3: Post-load recovery latency (2 samples)
    await new Promise((r) => setTimeout(r, 200));
    if (onPhaseUpdate) onPhaseUpdate('post_load', underLoadMs || 0);

    const postLoad = await measureLatency({
      targetUrl: pingTargetUrl,
      sampleCount: 2,
      timeoutMs: 3000,
      signal,
      onProgress: (_idx, ms) => {
        if (onPhaseUpdate) onPhaseUpdate('post_load', ms);
      },
    });

    const postLoadMs = postLoad.medianMs;

    // Calculate loaded delta
    let loadedDeltaMs: number | null = null;
    if (baselineMs !== null && underLoadMs !== null) {
      loadedDeltaMs = Math.max(0, underLoadMs - baselineMs);
    }

    // Determine Bufferbloat Grade
    let bufferbloatGrade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F' | 'unknown' = 'unknown';
    let severityDescription = 'Loaded latency could not be conclusively determined.';

    if (loadedDeltaMs !== null) {
      if (loadedDeltaMs <= 10) {
        bufferbloatGrade = 'A+';
        severityDescription =
          'Outstanding queue management (+0 to +10 ms). Your network handles simultaneous transfers without ping spikes.';
      } else if (loadedDeltaMs <= 30) {
        bufferbloatGrade = 'A';
        severityDescription =
          'Minimal bufferbloat (+11 to +30 ms). Gaming and video calls remain smooth during household downloads.';
      } else if (loadedDeltaMs <= 60) {
        bufferbloatGrade = 'B';
        severityDescription =
          'Moderate bufferbloat (+31 to +60 ms). Interactive apps may notice minor stutter during heavy downloads.';
      } else if (loadedDeltaMs <= 120) {
        bufferbloatGrade = 'C';
        severityDescription =
          'Noticeable queue delay (+61 to +120 ms). Gaming responsiveness drops substantially when someone downloads files.';
      } else if (loadedDeltaMs <= 250) {
        bufferbloatGrade = 'D';
        severityDescription =
          'Severe bufferbloat (+121 to +250 ms). Router buffers packets excessively, inducing lag spikes and jitter.';
      } else {
        bufferbloatGrade = 'F';
        severityDescription =
          `Extreme bufferbloat (+${loadedDeltaMs} ms). Large transfers saturate the connection, causing voice calls to drop and gaming to desync.`;
      }
    }

    return {
      status,
      baselineLatencyMs: baselineMs,
      underLoadLatencyMs: underLoadMs,
      postLoadLatencyMs: postLoadMs,
      loadedDeltaMs,
      bufferbloatGrade,
      severityDescription,
      limitations,
    };
  } catch {
    return {
      status: signal?.aborted ? 'cancelled' : 'failed',
      baselineLatencyMs: null,
      underLoadLatencyMs: null,
      postLoadLatencyMs: null,
      loadedDeltaMs: null,
      bufferbloatGrade: 'unknown',
      severityDescription: 'Bufferbloat load test was interrupted or failed.',
      limitations,
    };
  }
}

function createCancelledSummary(limitations: string[]): LoadedLatencySummary {
  return {
    status: 'cancelled',
    baselineLatencyMs: null,
    underLoadLatencyMs: null,
    postLoadLatencyMs: null,
    loadedDeltaMs: null,
    bufferbloatGrade: 'unknown',
    severityDescription: 'Assessment was cancelled by user.',
    limitations,
  };
}
