/**
 * SpeedXpat — Measurement Lab (M-Lab) NDT7 Service
 * Powered by open M-Lab Locate API & NDT7 WebSocket Protocol
 * (https://github.com/m-lab/ndt7-client-go / https://github.com/m-lab/locate)
 */

import { ThroughputSummary, ThroughputSample, TestStatus } from '../types/network';
import { createRequestTimeout } from '../engines/testEndpoints';

export interface MlabServerInfo {
  machine: string;
  hostname: string;
  city: string;
  country: string;
  downloadUrl?: string;
  uploadUrl?: string;
  label: string;
}

export interface MlabLocateOptions {
  throwOnError?: boolean;
}

let cachedServer: MlabServerInfo | null = null;
let cachedTimestamp = 0;

/**
 * Query M-Lab Locate API v2 for nearest high-capacity measurement servers
 */
export async function locateNearestMlabServer(
  signal?: AbortSignal,
  options?: MlabLocateOptions
): Promise<MlabServerInfo | null> {
  // Use cached server if within last 5 minutes
  if (cachedServer && Date.now() - cachedTimestamp < 300000) {
    return cachedServer;
  }

  try {
    const requestTimeout = createRequestTimeout(signal, 8_000);
    let res: Response;
    try {
      res = await fetch('https://locate.measurementlab.net/v2/nearest/ndt/ndt7', {
        headers: { Accept: 'application/json' },
        signal: requestTimeout.signal,
      });
    } finally {
      requestTimeout.dispose();
    }

    if (!res.ok) {
      throw new Error(`M-Lab Locate API returned HTTP ${res.status}`);
    }

    const data = await res.json();
    const result = data?.results?.[0];

    if (!result) {
      throw new Error('No M-Lab servers returned from locate service.');
    }

    const downloadUrl = getSecureWebSocketUrl(result.urls?.['wss:///ndt/v7/download']);
    const uploadUrl = getSecureWebSocketUrl(result.urls?.['wss:///ndt/v7/upload']);

    const serverInfo: MlabServerInfo = {
      machine: result.machine || '',
      hostname: result.hostname || '',
      city: result.location?.city || 'Global Edge',
      country: result.location?.country || '',
      downloadUrl,
      uploadUrl,
      label: `M-Lab ${result.location?.city || 'Edge'}, ${result.location?.country || ''} (${result.hostname})`,
    };

    cachedServer = serverInfo;
    cachedTimestamp = Date.now();
    return serverInfo;
  } catch (err) {
    console.warn('M-Lab Locate failed, falling back to local diagnostic server:', err);
    if (options?.throwOnError) {
      throw err;
    }
    return null;
  }

  function getSecureWebSocketUrl(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    try {
      return new URL(value).protocol === 'wss:' ? value : undefined;
    } catch {
      return undefined;
    }
  }
}

export interface MlabTestOptions {
  server: MlabServerInfo;
  direction: 'download' | 'upload';
  durationTargetMs?: number; // ~3500 - 4500 ms
  signal?: AbortSignal;
  onProgress?: (bytes: number, currentMbps: number, elapsedMs: number, rttMs?: number) => void;
}

/**
 * Measure throughput using M-Lab ndt7 WebSocket protocol
 */
export async function measureMlabThroughput(
  options: MlabTestOptions
): Promise<ThroughputSummary> {
  const {
    server,
    direction,
    durationTargetMs = 4000,
    signal,
    onProgress,
  } = options;

  const url = direction === 'download' ? server.downloadUrl : server.uploadUrl;
  const samples: ThroughputSample[] = [];
  const limitations = [
    `Conducted via Measurement Lab (M-Lab) ndt7 research infrastructure at ${server.city}, ${server.country}.`,
  ];

  if (!url) {
    throw new Error(`M-Lab ${direction} URL unavailable.`);
  }

  return new Promise<ThroughputSummary>((resolve) => {
    let ws: WebSocket | null = null;
    let bytesTransferred = 0;
    const startTime = performance.now();
    let lastSampleTime = startTime;
    let lastSampleBytes = 0;
    let status: TestStatus = 'success';
    let errorMessage: string | undefined;
    let latestTcpRttMs: number | undefined;

    const cleanupAndResolve = () => {
      if (ws) {
        try {
          ws.close();
        } catch {
          // ignore
        }
        ws = null;
      }

      const durationMs = Math.max(1, Math.round(performance.now() - startTime));
      const elapsedSec = durationMs / 1000;
      let mbps: number | null = null;
      if (bytesTransferred > 0 && elapsedSec > 0) {
        mbps = Number(((bytesTransferred * 8) / (elapsedSec * 1000000)).toFixed(2));
      }

      if (status === 'success' && (mbps === null || bytesTransferred === 0)) {
        status = 'insufficient_data';
      }

      resolve({
        status,
        target: `${server.label}`,
        method: `M-Lab ndt7 WebSocket (${direction.toUpperCase()})`,
        direction,
        bytesTransferred,
        durationMs,
        mbps,
        tcpRttMs: latestTcpRttMs,
        samples,
        limitations,
        errorMessage,
      });
    };

    // Handle external abort signal
    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          status = 'cancelled';
          cleanupAndResolve();
        },
        { once: true }
      );
    }

    try {
      ws = new WebSocket(url, 'net.measurementlab.ndt.v7');
      ws.binaryType = 'arraybuffer';

      // Duration timeout timer
      const timeoutId = setTimeout(() => {
        cleanupAndResolve();
      }, durationTargetMs);

      if (direction === 'download') {
        // DOWNLOAD: Receive streamed binary chunks from M-Lab
        ws.onmessage = (event) => {
          if (signal?.aborted) {
            clearTimeout(timeoutId);
            status = 'cancelled';
            cleanupAndResolve();
            return;
          }

          if (typeof event.data === 'string') {
            // M-Lab JSON TCPInfo / AppInfo update
            try {
              const msg = JSON.parse(event.data);
              if (msg.TCPInfo?.RTT) {
                latestTcpRttMs = Math.round(msg.TCPInfo.RTT / 1000);
              }
            } catch {
              // ignore
            }
          } else if (event.data instanceof ArrayBuffer) {
            bytesTransferred += event.data.byteLength;
          } else if (typeof Blob !== 'undefined' && event.data instanceof Blob) {
            bytesTransferred += event.data.size;
          }

          const now = performance.now();
          if (now - lastSampleTime >= 150) {
            const chunkElapsed = (now - lastSampleTime) / 1000;
            const chunkBytes = bytesTransferred - lastSampleBytes;
            const instantMbps = (chunkBytes * 8) / (chunkElapsed * 1000000);
            const totalElapsed = now - startTime;

            samples.push({
              timestamp: Date.now(),
              bytes: bytesTransferred,
              instantMbps: Number(instantMbps.toFixed(2)),
            });

            lastSampleTime = now;
            lastSampleBytes = bytesTransferred;

            if (onProgress) {
              const overallMbps =
                (bytesTransferred * 8) / ((totalElapsed / 1000) * 1000000);
              onProgress(
                bytesTransferred,
                overallMbps,
                Math.round(totalElapsed),
                latestTcpRttMs
              );
            }
          }
        };

        ws.onerror = (e) => {
          console.warn('M-Lab download WS error:', e);
          clearTimeout(timeoutId);
          if (bytesTransferred === 0) {
            status = 'failed';
            errorMessage = 'WebSocket connection to M-Lab failed.';
          }
          cleanupAndResolve();
        };

        ws.onclose = () => {
          clearTimeout(timeoutId);
          cleanupAndResolve();
        };
      } else {
        // UPLOAD: Pump binary frames to M-Lab
        const chunkSize = 65536; // 64 KB chunks
        const chunk = new Uint8Array(chunkSize);
        // Fill with randomized bits to avoid transparent compression skew
        for (let i = 0; i < chunkSize; i += 16) {
          chunk[i] = (i * 47) % 256;
        }

        let isPumping = true;

        const pumpData = () => {
          if (!ws || ws.readyState !== WebSocket.OPEN || !isPumping) return;
          if (signal?.aborted) {
            status = 'cancelled';
            cleanupAndResolve();
            return;
          }

          const now = performance.now();
          if (now - startTime >= durationTargetMs) {
            isPumping = false;
            cleanupAndResolve();
            return;
          }

          // Maintain up to 1 MB buffered in socket buffer
          while (ws.bufferedAmount < 1000000 && isPumping) {
            ws.send(chunk);
            bytesTransferred += chunkSize;
          }

          const totalElapsed = now - startTime;
          if (now - lastSampleTime >= 150) {
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
                (bytesTransferred * 8) / ((totalElapsed / 1000) * 1000000);
              onProgress(
                bytesTransferred,
                overallMbps,
                Math.round(totalElapsed),
                latestTcpRttMs
              );
            }
          }

          if (isPumping) {
            setTimeout(pumpData, 15);
          }
        };

        ws.onopen = () => {
          pumpData();
        };

        ws.onmessage = (event) => {
          if (typeof event.data === 'string') {
            try {
              const msg = JSON.parse(event.data);
              if (msg.TCPInfo?.RTT) {
                latestTcpRttMs = Math.round(msg.TCPInfo.RTT / 1000);
              }
            } catch {
              // ignore
            }
          }
        };

        ws.onerror = (e) => {
          console.warn('M-Lab upload WS error:', e);
          clearTimeout(timeoutId);
          if (bytesTransferred === 0) {
            status = 'failed';
            errorMessage = 'WebSocket upload connection to M-Lab failed.';
          }
          cleanupAndResolve();
        };

        ws.onclose = () => {
          isPumping = false;
          clearTimeout(timeoutId);
          cleanupAndResolve();
        };
      }
    } catch (err) {
      status = 'failed';
      errorMessage = String(err);
      cleanupAndResolve();
    }
  });
}
