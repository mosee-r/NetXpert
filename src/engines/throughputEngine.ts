/**
 * SpeedXpat — Throughput Measurement Engine (Download & Upload)
 * Compliant with SPEEDXPAT_SPEC.md Section 5.3
 *
 * Measures actual transferred bytes over timed intervals.
 * Reports Mbps (megabits per second) and bytesTransferred accurately.
 * Supports multi-size testing for detailed analysis.
 */

import { ThroughputSummary, ThroughputSample, TestStatus } from '../types/network';
import { createDownloadTestUrl, createRequestTimeout } from './testEndpoints';

export interface ThroughputTestOptions {
  targetUrl: string;
  direction: 'download' | 'upload';
  maxBytes?: number; // Safe default ~8 MB
  durationTargetMs?: number; // ~4000 ms
  signal?: AbortSignal;
  onProgress?: (
    bytes: number,
    currentMbps: number,
    elapsedMs: number,
    sample: ThroughputSample
  ) => void;
  testSizeBytes?: number; // For multi-size testing
}

/**
 * Calculate percentile from a sorted array of numbers
 */
function calculatePercentile(sortedValues: number[], percentile: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];
  
  const pos = (percentile / 100) * (sortedValues.length - 1);
  const base = Math.floor(pos);
  const rest = pos - base;
  
  return Number((sortedValues[base] + rest * (sortedValues[base + 1] - sortedValues[base])).toFixed(2));
}

export async function measureThroughput(
  options: ThroughputTestOptions
): Promise<ThroughputSummary> {
  const {
    targetUrl,
    direction,
    maxBytes,
    durationTargetMs = 6000, // Increased from 4000 to 6000 for more stable results
    signal,
    onProgress,
    testSizeBytes,
  } = options;

  const effectiveMaxBytes = typeof maxBytes === 'number'
    ? maxBytes
    : direction === 'download'
      ? 10 * 1024 * 1024 // Increased from 8MB to 10MB
      : 5 * 1024 * 1024; // Increased from 4MB to 5MB

  const hasExplicitCap = typeof maxBytes === 'number';
  const minimumStableWindowMs = Math.max(1200, durationTargetMs * 0.35);
  const samples: ThroughputSample[] = [];
  const startTime = performance.now();
  let bytesTransferred = 0;
  let status: TestStatus = 'success';
  let errorMessage: string | undefined;
  let requestTimedOut = false;

  const limitations = [
    'Throughput measured over HTTP stream with byte accounting. Subject to server endpoint capacity, route peering, and browser memory limits.',
  ];

  try {
    if (direction === 'download') {
      const requestSizeBytes = hasExplicitCap
        ? effectiveMaxBytes
        : 100 * 1024 * 1024; // Larger initial request for streaming
      let lastSampleTime = startTime;
      let lastSampleBytes = 0;
      let continueTesting = true;

      while (continueTesting) {
        const requestStartBytes = bytesTransferred;
        const url = createDownloadTestUrl(targetUrl, requestSizeBytes, { _t: String(Date.now()) });
        const requestTimeout = createRequestTimeout(signal, durationTargetMs + 15_000);
        try {
          const response = await fetch(url, {
            method: 'GET',
            cache: 'no-store',
            signal: requestTimeout.signal,
          });

          if (!response.ok && response.status !== 206) {
            throw new Error(`Download server returned HTTP ${response.status}`);
          }

          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error('Response body streaming is not supported by runtime.');
          }

          while (true) {
            if (signal?.aborted) {
              try {
                await reader.cancel();
              } catch {
                // ignore
              }
              status = 'cancelled';
              continueTesting = false;
              break;
            }

            const { done, value } = await reader.read();
            if (done) break;

            if (value) {
              bytesTransferred += value.byteLength;
              const now = performance.now();
              const elapsedTotal = now - startTime;

              if (now - lastSampleTime >= 250) {
                const chunkElapsed = (now - lastSampleTime) / 1000;
                const chunkBytes = bytesTransferred - lastSampleBytes;
                const instantMbps = (chunkBytes * 8) / (chunkElapsed * 1000000);

                samples.push({
                  timestamp: Date.now(),
                  bytes: bytesTransferred,
                  instantMbps: Number(instantMbps.toFixed(2)),
                });

                lastSampleTime = now;
                lastSampleBytes = bytesTransferred;

                if (onProgress) {
                  const overallMbps =
                    (bytesTransferred * 8) / ((elapsedTotal / 1000) * 1000000);
                  onProgress(bytesTransferred, overallMbps, Math.round(elapsedTotal), samples[samples.length - 1]);
                }
              }

              if (hasExplicitCap && bytesTransferred >= effectiveMaxBytes) {
                try {
                  await reader.cancel();
                } catch {
                  // ignore
                }
                continueTesting = false;
                break;
              }

              if (elapsedTotal >= durationTargetMs && elapsedTotal >= minimumStableWindowMs) {
                try {
                  await reader.cancel();
                } catch {
                  // ignore
                }
                continueTesting = false;
                break;
              }
            }
          }
        } finally {
          requestTimedOut ||= requestTimeout.didTimeout();
          requestTimeout.dispose();
        }

        if (bytesTransferred === requestStartBytes) {
          throw new Error('Download endpoint returned an empty response.');
        }

        const elapsedTotal = performance.now() - startTime;
        if (hasExplicitCap || signal?.aborted || elapsedTotal >= durationTargetMs) {
          continueTesting = false;
        }
      }
    } else {
      // Upload throughput test
      // Generate safe synthetic test chunks (e.g. 512KB chunks) and post to discard endpoint
      const chunkSize = 512 * 1024; // 512 KB
      const chunkData = new Uint8Array(chunkSize);
      // Fill with non-zero entropy data to minimize transparent compression skew
      for (let i = 0; i < chunkSize; i += 16) {
        chunkData[i] = (i * 37) % 256;
      }

      let lastSampleTime = startTime;
      let lastSampleBytes = 0;

      while (true) {
        if (signal?.aborted) {
          status = 'cancelled';
          break;
        }

        const now = performance.now();
        if (now - startTime >= durationTargetMs && now - startTime >= minimumStableWindowMs) break;
        if (hasExplicitCap && bytesTransferred >= effectiveMaxBytes) break;

        const uploadUrl = `${targetUrl}${targetUrl.includes('?') ? '&' : '?'}upload_t=${Date.now()}`;
        const chunkStart = performance.now();
        const requestTimeout = createRequestTimeout(signal, 15_000);
        let res: Response;
        try {
          res = await fetch(uploadUrl, {
            method: 'POST',
            body: chunkData,
            headers: {
              'Content-Type': 'application/octet-stream',
            },
            cache: 'no-store',
            signal: requestTimeout.signal,
          });
        } finally {
          requestTimedOut ||= requestTimeout.didTimeout();
          requestTimeout.dispose();
        }

        if (!res.ok) {
          throw new Error(`Upload endpoint returned HTTP ${res.status}`);
        }

        bytesTransferred += chunkSize;
        const chunkEnd = performance.now();
        const elapsedTotal = chunkEnd - startTime;

        if (chunkEnd - lastSampleTime >= 200) {
          const chunkElapsed = (chunkEnd - lastSampleTime) / 1000;
          const chunkBytes = bytesTransferred - lastSampleBytes;
          const instantMbps = (chunkBytes * 8) / (chunkElapsed * 1000000);

          samples.push({
            timestamp: Date.now(),
            bytes: bytesTransferred,
            instantMbps: Number(instantMbps.toFixed(2)),
          });

          lastSampleTime = chunkEnd;
          lastSampleBytes = bytesTransferred;

          if (onProgress) {
            const overallMbps =
              (bytesTransferred * 8) / ((elapsedTotal / 1000) * 1000000);
            onProgress(bytesTransferred, overallMbps, Math.round(elapsedTotal), samples[samples.length - 1]);
          }
        }
      }
    }
  } catch (err: unknown) {
    if (signal?.aborted) {
      status = 'cancelled';
    } else {
      status = 'failed';
      errorMessage = requestTimedOut
        ? 'The network request timed out. Check your connection and try again.'
        : String(err);
    }
  }

  if (bytesTransferred > 0 && samples.length < 2) {
    const elapsedMs = Math.max(1, performance.now() - startTime);
    const previousSample = samples[samples.length - 1];
    const finalTimestamp = Math.max(Date.now(), (previousSample?.timestamp ?? 0) + 1);
    const remainingBytes = bytesTransferred - (previousSample?.bytes ?? 0);
    const sampleDurationMs = previousSample && remainingBytes > 0
      ? Math.max(1, finalTimestamp - previousSample.timestamp)
      : elapsedMs;
    const sampleBytes = remainingBytes > 0 ? remainingBytes : bytesTransferred;
    samples.push({
      timestamp: finalTimestamp,
      bytes: bytesTransferred,
      instantMbps: Number(((sampleBytes * 8) / (sampleDurationMs * 1000)).toFixed(2)),
    });
  }

  const durationMs = Math.max(1, Math.round(performance.now() - startTime));
  const elapsedSeconds = durationMs / 1000;

  // Calculate aggregate throughput in Mbps
  let mbps: number | null = null;
  if (bytesTransferred > 0 && elapsedSeconds > 0) {
    mbps = Number(((bytesTransferred * 8) / (elapsedSeconds * 1000000)).toFixed(2));
  }

  // Calculate percentiles from instant Mbps samples
  let percentile90: number | null = null;
  let percentile95: number | null = null;
  if (samples.length >= 2) {
    const instantMbpsValues = samples.map((s) => s.instantMbps).filter(
      (v): v is number => v !== null && !isNaN(v)
    );
    if (instantMbpsValues.length >= 2) {
      const sorted = [...instantMbpsValues].sort((a, b) => a - b);
      percentile90 = calculatePercentile(sorted, 90);
      percentile95 = calculatePercentile(sorted, 95);
    }
  }

  if (status === 'success' && (mbps === null || bytesTransferred === 0)) {
    status = 'insufficient_data';
  }

  return {
    status,
    target: targetUrl,
    method: `HTTP/HTTPS ${direction.toUpperCase()} Stream`,
    direction,
    bytesTransferred,
    durationMs,
    mbps,
    samples,
    limitations,
    errorMessage,
    testSizeBytes,
    percentile90,
    percentile95,
  };
}

/**
 * Run multi-size throughput tests (100KB, 1MB, 10MB)
 * Returns aggregate results for each size
 */
export async function measureMultiSizeThroughput(
  options: Omit<ThroughputTestOptions, 'maxBytes' | 'durationTargetMs'> & {
    sizes?: number[];
    onSizeComplete?: (sizeLabel: string, result: ThroughputSummary) => void;
  }
): Promise<ThroughputSummary[]> {
  const { sizes = [100 * 1024, 1 * 1024 * 1024, 10 * 1024 * 1024], onSizeComplete, ...baseOptions } = options;
  
  const results: ThroughputSummary[] = [];
  
  for (const sizeBytes of sizes) {
    if (baseOptions.signal?.aborted) {
      break;
    }
    
    const sizeLabel = sizeBytes === 100 * 1024 ? '100KB' :
                      sizeBytes === 1 * 1024 * 1024 ? '1MB' :
                      sizeBytes === 10 * 1024 * 1024 ? '10MB' :
                      `${Math.round(sizeBytes / (1024 * 1024) * 10) / 10}MB`;
    
    const result = await measureThroughput({
      ...baseOptions,
      maxBytes: sizeBytes,
      durationTargetMs: undefined, // Use size-based, not time-based for multi-size
      testSizeBytes: sizeBytes,
    });
    
    results.push(result);
    onSizeComplete?.(sizeLabel, result);
    
    // Small delay between tests
    if (baseOptions.signal?.aborted) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  
  return results;
}
