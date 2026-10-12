/**
 * SpeedXpat — Throughput Measurement Engine (Download & Upload)
 * Compliant with SPEEDXPAT_SPEC.md Section 5.3
 *
 * Measures actual transferred bytes over timed intervals.
 * Reports Mbps (megabits per second) and bytesTransferred accurately.
 */

import { ThroughputSummary, ThroughputSample, TestStatus } from '../types/network';
import { createDownloadTestUrl, createRequestTimeout } from './testEndpoints';

export interface ThroughputTestOptions {
  targetUrl: string;
  direction: 'download' | 'upload';
  maxBytes?: number; // Safe default ~8 MB
  durationTargetMs?: number; // ~4000 ms
  signal?: AbortSignal;
  onProgress?: (bytes: number, currentMbps: number, elapsedMs: number) => void;
}

export async function measureThroughput(
  options: ThroughputTestOptions
): Promise<ThroughputSummary> {
  const {
    targetUrl,
    direction,
    maxBytes = 8 * 1024 * 1024, // 8 MB default bound
    durationTargetMs = 4000,
    signal,
    onProgress,
  } = options;

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
      // Chunked streaming download
      const url = createDownloadTestUrl(targetUrl, maxBytes, { _t: String(Date.now()) });
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

        let lastSampleTime = startTime;
        let lastSampleBytes = 0;

        while (true) {
          if (signal?.aborted) {
            try {
              await reader.cancel();
            } catch {
              // ignore
            }
            status = 'cancelled';
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
                onProgress(bytesTransferred, overallMbps, Math.round(elapsedTotal));
              }
            }

            if (bytesTransferred >= maxBytes || elapsedTotal >= durationTargetMs) {
              try {
                await reader.cancel();
              } catch {
                // ignore
              }
              break;
            }
          }
        }
      } finally {
        requestTimedOut ||= requestTimeout.didTimeout();
        requestTimeout.dispose();
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

      while (bytesTransferred < maxBytes) {
        if (signal?.aborted) {
          status = 'cancelled';
          break;
        }

        const now = performance.now();
        if (now - startTime >= durationTargetMs) break;

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
            onProgress(bytesTransferred, overallMbps, Math.round(elapsedTotal));
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

  const durationMs = Math.max(1, Math.round(performance.now() - startTime));
  const elapsedSeconds = durationMs / 1000;

  // Calculate aggregate throughput in Mbps
  let mbps: number | null = null;
  if (bytesTransferred > 0 && elapsedSeconds > 0) {
    mbps = Number(((bytesTransferred * 8) / (elapsedSeconds * 1000000)).toFixed(2));
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
  };
}
