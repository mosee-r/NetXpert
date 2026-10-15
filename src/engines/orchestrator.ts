/**
 * SpeedXpat — Assessment Orchestration Engine
 * Compliant with SPEEDXPAT_SPEC.md Section 9
 *
 * Coordinates guided sequential assessment with cancellation, timeouts,
 * progress updates, and deterministic activity capability scoring.
 */

import { detectNetworkInfo } from './networkInfoEngine';
import { measureDnsTiming } from './dnsAndHttpEngine';
import { measureLatency } from './latencyEngine';
import { measureThroughput } from './throughputEngine';
import { measureLoadedLatency } from './loadedLatencyEngine';
import { assessAllActivities } from '../scoring/assessActivities';
import { MlabDiagnosticsReport, OverallAssessmentReport } from '../types/scoring';
import { ThroughputChartPoint } from '../types/network';
import { getDefaultTestEndpoints } from './testEndpoints';
import {
  locateNearestMlabServer,
  measureMlabThroughput,
} from '../services/mlabService';

export type AssessmentStage =
  | 'idle'
  | 'detecting_network'
  | 'measuring_dns'
  | 'measuring_latency'
  | 'measuring_download'
  | 'measuring_upload'
  | 'measuring_mlab'
  | 'measuring_loaded_latency'
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

    const defaultEndpoints = getDefaultTestEndpoints();
    const pingTarget = options.pingTarget || defaultEndpoints.ping;
    const downloadTarget = defaultEndpoints.download;
    const uploadTarget = defaultEndpoints.upload;
    const dnsDomain = options.dnsDomain || 'cloudflare.com';
    const useMlab = options.useMlab !== false;

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
        locateNearestMlabServer(signal),
      ]);
      if (signal.aborted) throw new Error('Cancelled by user');

      let mlabDiagnostics: MlabDiagnosticsReport = mlabServer
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
      notify('measuring_dns', 'Resolving DNS & testing domain setup...', 20, 25);
      const dnsResult = await measureDnsTiming(dnsDomain, signal);
      if (signal.aborted) throw new Error('Cancelled by user');

      // 3. Measure Baseline Latency & Jitter
      notify(
        'measuring_latency',
        'Measuring idle ping & round-trip jitter...',
        30,
        35,
        'Ping',
        '...'
      );
      const latencyResult = await measureLatency({
        targetUrl: pingTarget,
        sampleCount: 8,
        timeoutMs: 3000,
        signal,
        onProgress: (idx, ms) => {
          notify(
            'measuring_latency',
            `Pinging test target (sample ${idx}/8)...`,
            Math.round((idx / 8) * 100),
            35 + Math.round((idx / 8) * 15),
            'Ping',
            `${ms} ms`
          );
        },
      });
      if (signal.aborted) throw new Error('Cancelled by user');

      // 4. Measure the primary download on the configured endpoint (Cloudflare by default)
      notify(
        'measuring_download',
        'Measuring primary download throughput...',
        10,
        50,
        'Download',
        'Starting...'
      );

      const downloadResult = await measureThroughput({
        targetUrl: downloadTarget,
        direction: 'download',
        maxBytes: options.maxDownloadBytes,
        durationTargetMs: 3500,
        signal,
        onProgress: (bytes, mbps, elapsedMs, sample) => {
          const mb = (bytes / (1024 * 1024)).toFixed(1);
          notify(
            'measuring_download',
            'Measuring download speed',
            Math.min(100, Math.round((bytes / (8 * 1024 * 1024)) * 100)),
            50 + Math.min(20, Math.round((bytes / (8 * 1024 * 1024)) * 20)),
            'Download',
            `${mbps.toFixed(1)} Mbps`,
            { elapsedMs, mbps: sample.instantMbps }
          );
        },
      });
      if (signal.aborted) throw new Error('Cancelled by user');

      // 5. Measure the primary upload on the configured endpoint (Cloudflare by default)
      notify(
        'measuring_upload',
        'Measuring primary upload throughput...',
        10,
        70,
        'Upload',
        'Starting...'
      );

      const uploadResult = await measureThroughput({
        targetUrl: uploadTarget,
        direction: 'upload',
        maxBytes: options.maxUploadBytes,
        durationTargetMs: 3000,
        signal,
        onProgress: (bytes, mbps, elapsedMs, sample) => {
          const mb = (bytes / (1024 * 1024)).toFixed(1);
          notify(
            'measuring_upload',
            'Measuring upload speed',
            Math.min(100, Math.round((bytes / (4 * 1024 * 1024)) * 100)),
            70 + Math.min(15, Math.round((bytes / (4 * 1024 * 1024)) * 15)),
            'Upload',
            `${mbps.toFixed(1)} Mbps`,
            { elapsedMs, mbps: sample.instantMbps }
          );
        },
      });
      if (signal.aborted) throw new Error('Cancelled by user');

      // 6. Run optional M-Lab NDT7 diagnostics separately from primary throughput scoring
      if (useMlab && mlabServer) {
        notify('measuring_mlab', 'Running separate M-Lab TCP diagnostics...', 0, 82);
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
                82,
                'M-Lab TCP RTT',
                tcpRtt === undefined ? 'Collecting' : `${tcpRtt} ms`
              );
            },
          });
        } catch (error) {
          if (signal.aborted) throw new Error('Cancelled by user');
          console.warn('M-Lab download diagnostics unavailable:', error);
          mlabDiagnostics.download = {
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
                83,
                'M-Lab TCP RTT',
                tcpRtt === undefined ? 'Collecting' : `${tcpRtt} ms`
              );
            },
          });
        } catch (error) {
          if (signal.aborted) throw new Error('Cancelled by user');
          console.warn('M-Lab upload diagnostics unavailable:', error);
          mlabDiagnostics.upload = {
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

      // 7. Measure Loaded Latency (Bufferbloat)
      notify(
        'measuring_loaded_latency',
        'Testing bufferbloat & latency under load...',
        10,
        85,
        'Load Test',
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
              ? 'Transmitting load stream...'
              : 'Cooling down & recovering...';

          notify(
            'measuring_loaded_latency',
            `Bufferbloat: ${phaseLabel}`,
            phase === 'baseline' ? 25 : phase === 'under_load' ? 65 : 95,
            85 + (phase === 'baseline' ? 3 : phase === 'under_load' ? 7 : 10),
            'Ping Under Load',
            currentMs > 0 ? `${currentMs} ms` : 'Testing'
          );
        },
      });
      if (signal.aborted) throw new Error('Cancelled by user');

      // 8. Evaluating Activities
      notify(
        'evaluating_activities',
        'Scoring activity capabilities across 6 profiles...',
        50,
        98
      );

      const report = assessAllActivities({
        latency: latencyResult,
        download: downloadResult,
        upload: uploadResult,
        loadedLatency: loadedLatencyResult,
        dns: dnsResult,
        networkInfo,
      });
      report.mlabDiagnostics = mlabDiagnostics;
      const mlabBytes =
        (mlabDiagnostics.download?.bytesTransferred ?? 0) +
        (mlabDiagnostics.upload?.bytesTransferred ?? 0);
      report.dataTransferredMb = Number(
        (report.dataTransferredMb + mlabBytes / (1024 * 1024)).toFixed(2)
      );

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
