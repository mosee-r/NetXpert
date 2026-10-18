/**
 * SpeedXpat — Assessment Orchestration Engine
 * Compliant with SPEEDXPAT_SPEC.md Section 9
 *
 * Coordinates guided sequential assessment with cancellation, timeouts,
 * progress updates, and deterministic activity capability scoring.
 * 
 * Now supports multi-size testing, packet loss measurement, and upload latency.
 */

import { detectNetworkInfo } from './networkInfoEngine';
import { measureDnsTiming } from './dnsAndHttpEngine';
import { measureLatency } from './latencyEngine';
import { measureMultiSizeThroughput, measureThroughput } from './throughputEngine';
import { measureLoadedLatency, measureUploadLatency } from './loadedLatencyEngine';
import { assessAllActivities } from '../scoring/assessActivities';
import { MlabDiagnosticsReport, OverallAssessmentReport } from '../types/scoring';
import { ThroughputChartPoint } from '../types/network';
import {
  getTestEndpointsForServer,
  resolveServerSelection,
} from './testEndpoints';
import {
  locateNearestMlabServer,
  measureMlabThroughput,
} from '../services/mlabService';
import { DEFAULT_DNS_DOMAIN, DEFAULT_SERVER_ID } from '../config/defaults';

const HIGH_BANDWIDTH_TEST_DURATION_MS = 8_000;
const HIGH_BANDWIDTH_TEST_MAX_BYTES = 1024 * 1024 * 1024;

export type AssessmentStage =
  | 'idle'
  | 'detecting_network'
  | 'measuring_dns'
  | 'measuring_latency'
  | 'measuring_download'
  | 'measuring_upload'
  | 'measuring_loaded_latency'
  | 'measuring_upload_latency'
  | 'measuring_mlab'
  | 'evaluating_activities'
  | 'complete'
  | 'cancelled'
  | 'failed';

export interface AssessmentProgress {
  stage: AssessmentStage;
  stageName: string;
  stagePercent: number; // 0 - 100
  overallPercent: number; // 0 - 100
  currentMetricLabel?: string;
  currentMetricValue?: string;
  throughputSample?: ThroughputChartPoint;
}

export interface AssessmentOptions {
  pingTarget?: string;
  dnsDomain?: string;
  maxDownloadBytes?: number;
  maxUploadBytes?: number;
  useMlab?: boolean;
  serverId?: string; // New: server selection
  onProgress?: (progress: AssessmentProgress) => void;
}

export class AssessmentOrchestrator {
  private abortController: AbortController | null = null;

  public cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  public async runAssessment(
    options: AssessmentOptions = {}
  ): Promise<OverallAssessmentReport> {
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    // Get server info
    const serverId = options.serverId || DEFAULT_SERVER_ID;
    const server = resolveServerSelection(serverId);
    const testEndpoints = getTestEndpointsForServer(serverId);

    const pingTarget = options.pingTarget || testEndpoints.ping;
    const downloadTarget = testEndpoints.download;
    const uploadTarget = testEndpoints.upload;
    const dnsDomain = options.dnsDomain || DEFAULT_DNS_DOMAIN;
    const useMlab = options.useMlab === true;

    const notify = (
      stage: AssessmentStage,
      stageName: string,
      stagePercent: number,
      overallPercent: number,
      currentMetricLabel?: string,
      currentMetricValue?: string,
      throughputSample?: ThroughputChartPoint
    ) => {
      if (options.onProgress) {
        options.onProgress({
          stage,
          stageName,
          stagePercent,
          overallPercent,
          currentMetricLabel,
          currentMetricValue,
          throughputSample,
        });
      }
    };

    try {
      // 1. Detect network details and locate an independent M-Lab diagnostic server
      notify('detecting_network', 'Detecting network & locating diagnostic servers...', 10, 10);
      const [networkInfo, mlabServer] = await Promise.all([
        detectNetworkInfo(),
        useMlab ? locateNearestMlabServer(signal) : Promise.resolve(null),
      ]);
      if (signal.aborted) throw new Error('Cancelled by user');

      // Update network info with test server details
      const updatedNetworkInfo = {
        ...networkInfo,
        testServer: {
          id: server.id,
          hostname: server.hostname,
          name: server.name,
          country: server.country,
          city: server.city,
          latitude: server.latitude,
          longitude: server.longitude,
        },
      };

      let mlabDiagnostics: MlabDiagnosticsReport | undefined = !useMlab
        ? undefined
        : mlabServer
        ? {
            requested: useMlab,
            server: {
              hostname: mlabServer.hostname,
              city: mlabServer.city,
              country: mlabServer.country,
              label: mlabServer.label,
            },
          }
        : {
            requested: useMlab,
            server: null,
            lookupError: 'M-Lab Locate did not return a diagnostic server.',
          };

      // 2. Measure DNS Timing
      notify('measuring_dns', 'Resolving DNS & testing domain setup...', 20, 20);
      const dnsResult = await measureDnsTiming(dnsDomain, signal);
      if (signal.aborted) throw new Error('Cancelled by user');

      // 3. Measure Baseline Latency & Jitter
      notify(
        'measuring_latency',
        'Measuring idle ping & round-trip jitter...',
        30,
        25,
        'Ping',
        '...'
      );
      const latencyResult = await measureLatency({
        targetUrl: pingTarget,
        sampleCount: 10, // Increased from 8 for more accurate results
        timeoutMs: 3000,
        signal,
        onProgress: (idx, ms) => {
          notify(
            'measuring_latency',
            `Pinging test target (sample ${idx}/10)...`,
            Math.round((idx / 10) * 100),
            25 + Math.round((idx / 10) * 15),
            'Ping',
            `${ms} ms`
          );
        },
      });
      if (signal.aborted) throw new Error('Cancelled by user');

      // 4. Measure multi-size download throughput
      notify(
        'measuring_download',
        'Measuring download throughput (100KB, 1MB, 10MB)...',
        0,
        35,
        'Download',
        'Starting...'
      );

      const downloadResults = await measureMultiSizeThroughput({
        targetUrl: downloadTarget,
        direction: 'download',
        signal,
        onSizeComplete: (sizeLabel, result) => {
          const stagePercent = 
            sizeLabel === '100KB' ? 33 : 
            sizeLabel === '1MB' ? 66 : 100;
          
          notify(
            'measuring_download',
            `Download: ${sizeLabel} test`,
            stagePercent,
            35 + Math.round(stagePercent * 0.15),
            'Download',
            result.mbps ? `${result.mbps.toFixed(1)} Mbps` : 'Measuring...'
          );
        },
      });

      notify(
        'measuring_download',
        'Measuring sustained download speed (8-second test)...',
        0,
        50,
        'Download',
        'Starting...'
      );
      const timedDownloadResult = await measureThroughput({
        targetUrl: downloadTarget,
        direction: 'download',
        maxBytes: options.maxDownloadBytes ?? HIGH_BANDWIDTH_TEST_MAX_BYTES,
        durationTargetMs: HIGH_BANDWIDTH_TEST_DURATION_MS,
        signal,
        onProgress: (_bytes, currentMbps, elapsedMs, sample) => {
          const stagePercent = Math.min(99, Math.round((elapsedMs / HIGH_BANDWIDTH_TEST_DURATION_MS) * 100));
          notify(
            'measuring_download',
            'Measuring sustained download speed (8-second test)...',
            stagePercent,
            50 + Math.round(stagePercent * 0.02),
            'Download',
            `${currentMbps.toFixed(1)} Mbps`,
            { elapsedMs, mbps: sample.instantMbps }
          );
        },
      });
      if (timedDownloadResult.status === 'success') {
        downloadResults.push(timedDownloadResult);
      } else {
        const fallback = downloadResults[downloadResults.length - 1];
        const message = `The 8-second high-bandwidth download measurement failed; the fixed-size result is retained. ${timedDownloadResult.errorMessage ?? timedDownloadResult.status}`;
        fallback?.limitations.push(message);
        console.warn(message);
      }

      if (signal.aborted) throw new Error('Cancelled by user');

      // 5. Measure multi-size upload throughput
      notify(
        'measuring_upload',
        'Measuring upload throughput (100KB, 1MB, 10MB)...',
        0,
        52,
        'Upload',
        'Starting...'
      );

      const uploadSizes = [100 * 1024, 1 * 1024 * 1024, 10 * 1024 * 1024];
      const uploadResults = await measureMultiSizeThroughput({
        targetUrl: uploadTarget,
        direction: 'upload',
        sizes: uploadSizes,
        signal,
        onSizeComplete: (sizeLabel, result) => {
          const stagePercent = 
            sizeLabel === '100KB' ? 33 : 
            sizeLabel === '1MB' ? 66 : 100;
          
          notify(
            'measuring_upload',
            `Upload: ${sizeLabel} test`,
            stagePercent,
            52 + Math.round(stagePercent * 0.13),
            'Upload',
            result.mbps ? `${result.mbps.toFixed(1)} Mbps` : 'Measuring...'
          );
        },
      });

      notify(
        'measuring_upload',
        'Measuring sustained upload speed (8-second test)...',
        0,
        65,
        'Upload',
        'Starting...'
      );
      const timedUploadResult = await measureThroughput({
        targetUrl: uploadTarget,
        direction: 'upload',
        maxBytes: options.maxUploadBytes ?? HIGH_BANDWIDTH_TEST_MAX_BYTES,
        durationTargetMs: HIGH_BANDWIDTH_TEST_DURATION_MS,
        signal,
        onProgress: (_bytes, currentMbps, elapsedMs, sample) => {
          const stagePercent = Math.min(99, Math.round((elapsedMs / HIGH_BANDWIDTH_TEST_DURATION_MS) * 100));
          notify(
            'measuring_upload',
            'Measuring sustained upload speed (8-second test)...',
            stagePercent,
            65 + Math.round(stagePercent * 0.02),
            'Upload',
            `${currentMbps.toFixed(1)} Mbps`,
            { elapsedMs, mbps: sample.instantMbps }
          );
        },
      });
      if (timedUploadResult.status === 'success') {
        uploadResults.push(timedUploadResult);
      } else {
        const fallback = uploadResults[uploadResults.length - 1];
        const message = `The 8-second high-bandwidth upload measurement failed; the fixed-size result is retained. ${timedUploadResult.errorMessage ?? timedUploadResult.status}`;
        fallback?.limitations.push(message);
        console.warn(message);
      }

      if (signal.aborted) throw new Error('Cancelled by user');

      // 6. Run optional M-Lab NDT7 diagnostics separately from primary throughput scoring
      if (useMlab && mlabServer) {
        notify('measuring_mlab', 'Running separate M-Lab TCP diagnostics...', 0, 70);
        try {
          mlabDiagnostics!.download = await measureMlabThroughput({
            server: mlabServer,
            direction: 'download',
            durationTargetMs: 2500,
            signal,
            onProgress: (_bytes, _mbps, elapsed, tcpRtt) => {
              notify(
                'measuring_mlab',
                'Collecting M-Lab download TCP metadata...',
                20 + Math.min(30, Math.round((elapsed / 2500) * 30)),
                70,
                'M-Lab TCP RTT',
                tcpRtt === undefined ? 'Collecting' : `${tcpRtt} ms`
              );
            },
          });
        } catch (error) {
          if (signal.aborted) throw new Error('Cancelled by user');
          console.warn('M-Lab download diagnostics unavailable:', error);
          mlabDiagnostics!.download = {
            status: 'failed',
            target: mlabServer.label,
            method: 'M-Lab ndt7 WebSocket (DOWNLOAD)',
            direction: 'download',
            bytesTransferred: 0,
            durationMs: 0,
            mbps: null,
            samples: [],
            limitations: ['Optional M-Lab diagnostics failed; primary Cloudflare speed results are unaffected.'],
            errorMessage: String(error),
          };
        }
        if (signal.aborted) throw new Error('Cancelled by user');

        try {
          mlabDiagnostics!.upload = await measureMlabThroughput({
            server: mlabServer,
            direction: 'upload',
            durationTargetMs: 2500,
            signal,
            onProgress: (_bytes, _mbps, elapsed, tcpRtt) => {
              notify(
                'measuring_mlab',
                'Collecting M-Lab upload TCP metadata...',
                50 + Math.min(30, Math.round((elapsed / 2500) * 30)),
                70,
                'M-Lab TCP RTT',
                tcpRtt === undefined ? 'Collecting' : `${tcpRtt} ms`
              );
            },
          });
        } catch (error) {
          if (signal.aborted) throw new Error('Cancelled by user');
          console.warn('M-Lab upload diagnostics unavailable:', error);
          mlabDiagnostics!.upload = {
            status: 'failed',
            target: mlabServer.label,
            method: 'M-Lab ndt7 WebSocket (UPLOAD)',
            direction: 'upload',
            bytesTransferred: 0,
            durationMs: 0,
            mbps: null,
            samples: [],
            limitations: ['Optional M-Lab diagnostics failed; primary Cloudflare speed results are unaffected.'],
            errorMessage: String(error),
          };
        }
        if (signal.aborted) throw new Error('Cancelled by user');
      }

      // 7. Measure Loaded Latency (Bufferbloat) - Download
      notify(
        'measuring_loaded_latency',
        'Testing bufferbloat & latency under download load...',
        10,
        75,
        'Bufferbloat',
        'Starting...'
      );
      const loadedLatencyResult = await measureLoadedLatency({
        pingTargetUrl: pingTarget,
        loadTargetUrl: downloadTarget,
        signal,
        onPhaseUpdate: (phase, currentMs) => {
          const phaseLabel =
            phase === 'baseline'
              ? 'Measuring idle baseline...'
              : phase === 'under_load'
              ? 'Transmitting download load stream...'
              : 'Cooling down & recovering...';

          notify(
            'measuring_loaded_latency',
            `Bufferbloat: ${phaseLabel}`,
            phase === 'baseline' ? 25 : phase === 'under_load' ? 65 : 95,
            75 + (phase === 'baseline' ? 3 : phase === 'under_load' ? 7 : 8),
            'Ping Under Load',
            currentMs > 0 ? `${currentMs} ms` : 'Testing'
          );
        },
      });
      if (signal.aborted) throw new Error('Cancelled by user');

      // 7.5. Measure Upload Latency
      notify(
        'measuring_upload_latency',
        'Testing latency under upload load...',
        10,
        82,
        'Upload Latency',
        'Starting...'
      );
      const uploadLatencyResult = await measureUploadLatency({
        pingTargetUrl: pingTarget,
        uploadTargetUrl: uploadTarget,
        signal,
        onPhaseUpdate: (phase, currentMs) => {
          const phaseLabel =
            phase === 'baseline'
              ? 'Measuring idle baseline...'
              : phase === 'under_upload'
              ? 'Transmitting upload load stream...'
              : 'Cooling down & recovering...';

          notify(
            'measuring_upload_latency',
            `Upload Latency: ${phaseLabel}`,
            phase === 'baseline' ? 25 : phase === 'under_upload' ? 65 : 95,
            82 + (phase === 'baseline' ? 3 : phase === 'under_upload' ? 6 : 6),
            'Ping Under Upload',
            currentMs > 0 ? `${currentMs} ms` : 'Testing'
          );
        },
      });
      if (signal.aborted) throw new Error('Cancelled by user');

      // 8. Evaluating Activities
      notify(
        'evaluating_activities',
        'Scoring activity capabilities across 6 profiles...',
        52,
        95
      );

      const report = assessAllActivities({
        latency: latencyResult,
        download: downloadResults,
        upload: uploadResults,
        loadedLatency: loadedLatencyResult,
        dns: dnsResult,
        networkInfo: updatedNetworkInfo,
        latencyDuringUpload: uploadLatencyResult,
      });
      
      report.mlabDiagnostics = mlabDiagnostics;
      
      // Calculate total data transferred
      const downloadBytes = downloadResults.reduce((sum, r) => sum + (r.bytesTransferred || 0), 0);
      const uploadBytes = uploadResults.reduce((sum, r) => sum + (r.bytesTransferred || 0), 0);
      const mlabBytes =
        (mlabDiagnostics?.download?.bytesTransferred ?? 0) +
        (mlabDiagnostics?.upload?.bytesTransferred ?? 0);
      
      report.dataTransferredMb = Number(
        ((downloadBytes + uploadBytes + mlabBytes) / (1024 * 1024)).toFixed(2)
      );
      
      // Add server info to report
      report.server = {
        id: server.id,
        name: server.name,
        hostname: server.hostname,
        city: server.city,
        country: server.country,
      };

      notify('complete', 'Assessment complete!', 100, 100);
      return report;
    } catch (err: unknown) {
      if (signal.aborted || String(err).includes('Cancelled')) {
        notify('cancelled', 'Assessment cancelled.', 0, 0);
        throw new Error('Assessment cancelled');
      }
      notify('failed', 'Assessment failed: ' + String(err), 0, 0);
      throw err;
    } finally {
      this.abortController = null;
    }
  }
}
