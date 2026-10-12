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
import { OverallAssessmentReport } from '../types/scoring';
import {
  locateNearestMlabServer,
  measureMlabThroughput,
  MlabServerInfo,
} from '../services/mlabService';

export type AssessmentStage =
  | 'idle'
  | 'detecting_network'
  | 'measuring_dns'
  | 'measuring_latency'
  | 'measuring_download'
  | 'measuring_upload'
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
}

export interface AssessmentOptions {
  pingTarget?: string;
  downloadTarget?: string;
  uploadTarget?: string;
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

    const pingTarget = options.pingTarget || '/api/ping';
    const downloadTarget = options.downloadTarget || '/api/speedtest/download';
    const uploadTarget = options.uploadTarget || '/api/speedtest/upload';
    const dnsDomain = options.dnsDomain || 'cloudflare.com';
    const useMlab = options.useMlab !== false;

    const notify = (
      stage: AssessmentStage,
      stageName: string,
      stagePercent: number,
      overallPercent: number,
      currentMetricLabel?: string,
      currentMetricValue?: string
    ) => {
      if (options.onProgress) {
        options.onProgress({
          stage,
          stageName,
          stagePercent,
          overallPercent,
          currentMetricLabel,
          currentMetricValue,
        });
      }
    };

    try {
      // 1. Detect Network Transport & Query M-Lab Locate API
      notify('detecting_network', 'Detecting network & querying M-Lab Locate API...', 10, 10);
      const networkInfo = await detectNetworkInfo();
      if (signal.aborted) throw new Error('Cancelled by user');

      let mlabServer: MlabServerInfo | null = null;
      if (useMlab) {
        mlabServer = await locateNearestMlabServer(signal);
        if (mlabServer) {
          notify(
            'detecting_network',
            `Connected to nearest ${mlabServer.label}`,
            15,
            15,
            'M-Lab Server',
            `${mlabServer.city}, ${mlabServer.country}`
          );
        }
      }

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

      // 4. Measure Download Throughput (M-Lab ndt7 or fallback)
      notify(
        'measuring_download',
        mlabServer
          ? `Measuring download via M-Lab (${mlabServer.city})...`
          : 'Measuring sustained download bandwidth...',
        10,
        50,
        'Download',
        'Starting...'
      );

      let downloadResult;
      if (mlabServer && mlabServer.downloadUrl) {
        try {
          downloadResult = await measureMlabThroughput({
            server: mlabServer,
            direction: 'download',
            durationTargetMs: 3500,
            signal,
            onProgress: (bytes, mbps, elapsed, tcpRtt) => {
              const mb = (bytes / (1024 * 1024)).toFixed(1);
              notify(
                'measuring_download',
                `M-Lab ndt7: ${mb} MB (${mlabServer?.city})...`,
                Math.min(100, Math.round((elapsed / 3500) * 100)),
                50 + Math.min(20, Math.round((elapsed / 3500) * 20)),
                'Download',
                `${mbps.toFixed(1)} Mbps`
              );
            },
          });
        } catch {
          mlabServer = null; // fallback on error
        }
      }

      if (!downloadResult || downloadResult.status === 'failed') {
        downloadResult = await measureThroughput({
          targetUrl: downloadTarget,
          direction: 'download',
          maxBytes: options.maxDownloadBytes || 8 * 1024 * 1024,
          durationTargetMs: 3500,
          signal,
          onProgress: (bytes, mbps, _elapsed) => {
            const mb = (bytes / (1024 * 1024)).toFixed(1);
            notify(
              'measuring_download',
              `Downloading test payload (${mb} MB)...`,
              Math.min(100, Math.round((bytes / (8 * 1024 * 1024)) * 100)),
              50 + Math.min(20, Math.round((bytes / (8 * 1024 * 1024)) * 20)),
              'Download',
              `${mbps.toFixed(1)} Mbps`
            );
          },
        });
      }
      if (signal.aborted) throw new Error('Cancelled by user');

      // 5. Measure Upload Throughput (M-Lab ndt7 or fallback)
      notify(
        'measuring_upload',
        mlabServer
          ? `Measuring upload via M-Lab (${mlabServer.city})...`
          : 'Measuring sustained upload bandwidth...',
        10,
        70,
        'Upload',
        'Starting...'
      );

      let uploadResult;
      if (mlabServer && mlabServer.uploadUrl) {
        try {
          uploadResult = await measureMlabThroughput({
            server: mlabServer,
            direction: 'upload',
            durationTargetMs: 3000,
            signal,
            onProgress: (bytes, mbps, elapsed) => {
              const mb = (bytes / (1024 * 1024)).toFixed(1);
              notify(
                'measuring_upload',
                `M-Lab ndt7 Upload: ${mb} MB...`,
                Math.min(100, Math.round((elapsed / 3000) * 100)),
                70 + Math.min(15, Math.round((elapsed / 3000) * 15)),
                'Upload',
                `${mbps.toFixed(1)} Mbps`
              );
            },
          });
        } catch {
          // fallback
        }
      }

      if (!uploadResult || uploadResult.status === 'failed') {
        uploadResult = await measureThroughput({
          targetUrl: uploadTarget,
          direction: 'upload',
          maxBytes: options.maxUploadBytes || 4 * 1024 * 1024,
          durationTargetMs: 3000,
          signal,
          onProgress: (bytes, mbps, _elapsed) => {
            const mb = (bytes / (1024 * 1024)).toFixed(1);
            notify(
              'measuring_upload',
              `Uploading test payload (${mb} MB)...`,
              Math.min(100, Math.round((bytes / (4 * 1024 * 1024)) * 100)),
              70 + Math.min(15, Math.round((bytes / (4 * 1024 * 1024)) * 15)),
              'Upload',
              `${mbps.toFixed(1)} Mbps`
            );
          },
        });
      }
      if (signal.aborted) throw new Error('Cancelled by user');

      // 6. Measure Loaded Latency (Bufferbloat)
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

      // 7. Evaluating Activities
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
