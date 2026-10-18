/**
 * SpeedXpat — Loaded Latency & Bufferbloat Measurement Engine
 * Compliant with SPEEDXPAT_SPEC.md Section 5.5
 *
 * Measures baseline latency, latency under concurrent controlled network load,
 * and post-load latency to quantify bufferbloat and router queue congestion.
 * 
 * Now includes latency during upload measurement.
 */

import { LoadedLatencySummary, TestStatus } from '../types/network';
import { measureLatency } from './latencyEngine';
import { createDownloadTestUrl, createRequestTimeout } from './testEndpoints';

export interface LoadedLatencyOptions {
  pingTargetUrl: string;
  loadTargetUrl: string;
  signal?: AbortSignal;
  onPhaseUpdate?: (phase: 'baseline' | 'under_load' | 'post_load', currentMs: number) => void;
}

export interface UploadLatencyOptions {
  pingTargetUrl: string;
  uploadTargetUrl: string;
  signal?: AbortSignal;
  onPhaseUpdate?: (phase: 'baseline' | 'under_upload' | 'post_upload', currentMs: number) => void;
}

/**
 * Create a cancelled loaded latency summary
 */
function createCancelledLoadedSummary(limitations: string[]): LoadedLatencySummary {
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

/**
 * Measure latency during upload (similar to loaded latency but for upload)
 */
export async function measureUploadLatency(
  options: UploadLatencyOptions
): Promise<LoadedLatencySummary> {
  const { pingTargetUrl, uploadTargetUrl, signal, onPhaseUpdate } = options;
  const limitations = [
    'Upload latency tested using HTTP-concurrent upload load. Quantifies router queuing delay under active upload traffic.',
  ];

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
      return createCancelledLoadedSummary(limitations);
    }

    const baselineMs = baseline.medianMs;

    // Phase 2: Start background upload stream while measuring latency
    if (onPhaseUpdate) onPhaseUpdate('under_upload', baselineMs || 0);

    const uploadController = new AbortController();
    const abortListener = () => uploadController.abort();
    if (signal) signal.addEventListener('abort', abortListener, { once: true });

    // Launch background controlled upload stream
    const chunkSize = 512 * 1024; // 512KB chunks
    const chunkData = new Uint8Array(chunkSize);
    for (let i = 0; i < chunkSize; i += 16) {
      chunkData[i] = (i * 37) % 256;
    }

    const uploadPromise = async () => {
      const uploadUrl = `${uploadTargetUrl}${uploadTargetUrl.includes('?') ? '&' : '?'}upload_latency_test=${Date.now()}`;
      
      // Send multiple chunks to maintain load
      for (let i = 0; i < 4; i++) {
        if (uploadController.signal.aborted) break;
        
        try {
          const requestTimeout = createRequestTimeout(uploadController.signal, 10_000);
          await fetch(uploadUrl, {
            method: 'POST',
            body: chunkData,
            headers: { 'Content-Type': 'application/octet-stream' },
            cache: 'no-store',
            signal: requestTimeout.signal,
          });
          requestTimeout.dispose();
        } catch {
          // Upload failed, but continue with latency measurement
        }
        
        // Small delay between chunks
        await new Promise(r => setTimeout(r, 50));
      }
    };

    // Start upload in background
    const uploadLoadPromise = uploadPromise().catch(() => {});

    // Wait 250ms for upload to start
    await new Promise((r) => setTimeout(r, 250));

    // Measure latency WHILE upload is in progress (4 samples)
    const underUpload = await measureLatency({
      targetUrl: pingTargetUrl,
      sampleCount: 4,
      timeoutMs: 3000,
      signal,
      onProgress: (_idx, ms) => {
        if (onPhaseUpdate) onPhaseUpdate('under_upload', ms);
      },
    });

    // Wait for upload to complete
    await uploadLoadPromise;
    uploadController.abort();
    if (signal) signal.removeEventListener('abort', abortListener);

    if (signal?.aborted) {
      return createCancelledLoadedSummary(limitations);
    }

    const underUploadMs = underUpload.medianMs;

    // Phase 3: Post-upload recovery latency (2 samples)
    await new Promise((r) => setTimeout(r, 200));
    if (onPhaseUpdate) onPhaseUpdate('post_upload', underUploadMs || 0);

    const postUpload = await measureLatency({
      targetUrl: pingTargetUrl,
      sampleCount: 2,
      timeoutMs: 3000,
      signal,
      onProgress: (_idx, ms) => {
        if (onPhaseUpdate) onPhaseUpdate('post_upload', ms);
      },
    });

    if (signal?.aborted || postUpload.status === 'cancelled') {
      return createCancelledLoadedSummary(limitations);
    }

    const postUploadMs = postUpload.medianMs;
    const phases = [
      { name: 'baseline', result: baseline },
      { name: 'under-upload', result: underUpload },
      { name: 'recovery', result: postUpload },
    ];
    const allPhasesComplete = phases.every(
      ({ result }) => result.status === 'success' && result.medianMs !== null
    );
    const hasFailedPhase = phases.some(
      ({ result }) => result.status === 'failed' || result.status === 'timed_out'
    );
    const status: TestStatus = allPhasesComplete
      ? 'success'
      : hasFailedPhase
      ? 'failed'
      : 'insufficient_data';
    if (!allPhasesComplete) {
      const incompletePhases = phases
        .filter(({ result }) => result.status !== 'success' || result.medianMs === null)
        .map(({ name, result }) => result.errorMessage ? `${name}: ${result.errorMessage}` : name);
      limitations.push(`Incomplete latency samples for ${incompletePhases.join(', ')}.`);
    }

    // Calculate loaded delta
    let loadedDeltaMs: number | null = null;
    if (baselineMs !== null && underUploadMs !== null) {
      loadedDeltaMs = Math.max(0, underUploadMs - baselineMs);
    }

    // Determine Bufferbloat Grade
    let bufferbloatGrade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F' | 'unknown' = 'unknown';
    let severityDescription = 'Upload latency impact could not be conclusively determined.';

    if (loadedDeltaMs !== null) {
      if (loadedDeltaMs <= 10) {
        bufferbloatGrade = 'A+';
        severityDescription =
          'Outstanding queue management (+0 to +10 ms). Your network handles uploads without ping spikes.';
      } else if (loadedDeltaMs <= 30) {
        bufferbloatGrade = 'A';
        severityDescription =
          'Minimal upload latency impact (+11 to +30 ms). Video calls remain smooth during uploads.';
      } else if (loadedDeltaMs <= 60) {
        bufferbloatGrade = 'B';
        severityDescription =
          'Moderate latency increase (+31 to +60 ms). Interactive apps may notice minor stutter during uploads.';
      } else if (loadedDeltaMs <= 120) {
        bufferbloatGrade = 'C';
        severityDescription =
          'Noticeable queue delay (+61 to +120 ms). Gaming responsiveness drops during uploads.';
      } else if (loadedDeltaMs <= 250) {
        bufferbloatGrade = 'D';
        severityDescription =
          'Severe latency impact (+121 to +250 ms). Uploads significantly affect other traffic.';
      } else {
        bufferbloatGrade = 'F';
        severityDescription =
          `Extreme latency impact (+${loadedDeltaMs} ms). Large uploads saturate the connection.`;
      }
    }

    return {
      status,
      baselineLatencyMs: baselineMs,
      underLoadLatencyMs: underUploadMs,
      postLoadLatencyMs: postUploadMs,
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
      severityDescription: 'Upload latency test was interrupted or failed.',
      limitations,
    };
  }
}

export async function measureLoadedLatency(
  options: LoadedLatencyOptions
): Promise<LoadedLatencySummary> {
  const { pingTargetUrl, loadTargetUrl, signal, onPhaseUpdate } = options;
  const limitations = [
    'Bufferbloat tested using HTTP-concurrent transfer load. Quantifies router queuing delay under active network traffic.',
  ];

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
      return createCancelledLoadedSummary(limitations);
    }

    const baselineMs = baseline.medianMs;

    // Phase 2: Start background load stream while measuring latency under load
    if (onPhaseUpdate) onPhaseUpdate('under_load', baselineMs || 0);

    const loadController = new AbortController();
    const abortListener = () => loadController.abort();
    if (signal) signal.addEventListener('abort', abortListener, { once: true });

    // Launch background controlled data stream
    const loadPromise = fetch(
      createDownloadTestUrl(loadTargetUrl, 5 * 1024 * 1024, { load: 'bufferbloat' }),
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
      return createCancelledLoadedSummary(limitations);
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

    if (signal?.aborted || postLoad.status === 'cancelled') {
      return createCancelledLoadedSummary(limitations);
    }

    const postLoadMs = postLoad.medianMs;
    const phases = [
      { name: 'baseline', result: baseline },
      { name: 'under-load', result: underLoad },
      { name: 'recovery', result: postLoad },
    ];
    const allPhasesComplete = phases.every(
      ({ result }) => result.status === 'success' && result.medianMs !== null
    );
    const hasFailedPhase = phases.some(
      ({ result }) => result.status === 'failed' || result.status === 'timed_out'
    );
    const status: TestStatus = allPhasesComplete
      ? 'success'
      : hasFailedPhase
      ? 'failed'
      : 'insufficient_data';
    if (!allPhasesComplete) {
      const incompletePhases = phases
        .filter(({ result }) => result.status !== 'success' || result.medianMs === null)
        .map(({ name, result }) => result.errorMessage ? `${name}: ${result.errorMessage}` : name);
      limitations.push(`Incomplete latency samples for ${incompletePhases.join(', ')}.`);
    }

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
