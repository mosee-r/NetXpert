import React from 'react';
import { FileText, Power, RotateCcw, Share2, X } from 'lucide-react';
import { DeviceNetworkInfo, ThroughputChartPoint } from '../types/network';
import { OverallAssessmentReport } from '../types/scoring';
import { AssessmentStage } from '../engines/orchestrator';
import { ModernSpeedGauge } from './ModernSpeedGauge';
import { KeyMetricsList } from './KeyMetricsMatrix';
import { ThroughputCardSample, TwinThroughputCards } from './TwinThroughputCards';
import { WorkloadSuitability } from './WorkloadSuitability';
import { DetailedTestBreakdown } from './DetailedTestBreakdown';
import { downloadPdfReport } from '../services/storage';
import { shareOrDownloadSnapshot } from '../services/shareImageGenerator';

function maskPublicIp(ipAddress?: string): string {
  if (!ipAddress) return 'Not available';
  const ipv4 = ipAddress.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) return `${ipv4[1]}.${ipv4[2]}.${ipv4[3]}.***`;
  if (ipAddress.includes(':')) return `${ipAddress.split(':').slice(0, 4).join(':')}:****`;
  return 'Masked for privacy';
}

interface SpeedTestHomeProps {
  networkInfo: DeviceNetworkInfo | null;
  report: OverallAssessmentReport | null;
  canDiscardResult: boolean;
  isTesting: boolean;
  stage: AssessmentStage;
  stageName: string;
  progressPercent: number;
  heroValue: string;
  heroUnit: string;
  heroLabel: string;
  sparklineData: ThroughputChartPoint[];
  activeMetrics: {
    downloadMbps?: number | null;
    uploadMbps?: number | null;
    pingMs?: number | null;
    loadedPingMs?: number | null;
    jitterMs?: number | null;
  };
  advancedMode: boolean;
  onStartTest: () => void;
  onCancelTest: () => void;
  onSaveAndClose: () => void;
  onDiscardResults: () => void;
  onExportError: (message: string) => void;
}

export const SpeedTestHome: React.FC<SpeedTestHomeProps> = ({
  networkInfo,
  report,
  canDiscardResult,
  isTesting,
  stage,
  stageName,
  progressPercent,
  heroValue,
  heroUnit,
  heroLabel,
  sparklineData,
  activeMetrics,
  advancedMode,
  onStartTest,
  onCancelTest,
  onSaveAndClose,
  onDiscardResults,
  onExportError,
}) => {
  const phase = !isTesting
    ? report ? 'completed' : 'idle'
    : stage === 'measuring_download'
    ? 'download'
    : stage === 'measuring_upload'
    ? 'upload'
    : 'latency';
  const currentSpeedMbps = phase === 'download'
    ? activeMetrics.downloadMbps ?? null
    : phase === 'upload'
    ? activeMetrics.uploadMbps ?? null
    : null;
  const metrics = isTesting
    ? {
        downloadMbps: activeMetrics.downloadMbps ?? null,
        uploadMbps: activeMetrics.uploadMbps ?? null,
        idleLatencyMs: activeMetrics.pingMs ?? null,
        loadedLatencyMs: activeMetrics.loadedPingMs ?? null,
        jitterMs: activeMetrics.jitterMs ?? null,
      }
    : {
        downloadMbps: report?.rawMeasurements.downloadThroughput.mbps ?? null,
        uploadMbps: report?.rawMeasurements.uploadThroughput.mbps ?? null,
        idleLatencyMs: report?.rawMeasurements.idleLatency.medianMs ?? null,
        loadedLatencyMs: report?.rawMeasurements.loadedLatency.underLoadLatencyMs ?? null,
        jitterMs: report?.rawMeasurements.idleLatency.jitterMs ?? null,
      };
  const activeSamples: ThroughputCardSample[] = sparklineData.map((point) => ({
    timestampMs: point.elapsedMs,
    mbps: point.mbps,
  }));
  const reportDownloadSamples: ThroughputCardSample[] = (report?.rawMeasurements.downloadThroughput.samples ?? []).map(
    ({ timestamp, instantMbps }) => ({ timestampMs: timestamp, mbps: instantMbps })
  );
  const reportUploadSamples: ThroughputCardSample[] = (report?.rawMeasurements.uploadThroughput.samples ?? []).map(
    ({ timestamp, instantMbps }) => ({ timestampMs: timestamp, mbps: instantMbps })
  );
  const activePhase = isTesting
    ? stage === 'measuring_download'
      ? 'download'
      : stage === 'measuring_upload'
      ? 'upload'
      : 'idle'
    : report ? 'completed' : 'idle';
  const downloadSamples = isTesting
    ? stage === 'measuring_download' ? activeSamples : []
    : reportDownloadSamples;
  const uploadSamples = isTesting
    ? stage === 'measuring_upload' ? activeSamples : []
    : reportUploadSamples;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-9rem)] w-full max-w-6xl flex-col px-1 pb-24 lg:px-6">
      {!isTesting && !report ? (
        <section className="grid flex-1 grid-cols-1 items-center lg:grid-cols-2 lg:gap-16" aria-label="Speed test ready">
          <div className="flex flex-col items-center justify-center px-4 text-center">
            <p className="mb-14 text-xs text-app-muted">Connection test</p>
            <button
              onClick={onStartTest}
              className="flex h-24 w-24 items-center justify-center rounded-full bg-app-accent text-white transition-transform active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-app-accent"
              aria-label="Start speed test"
            >
              <Power className="h-10 w-10" aria-hidden="true" />
            </button>
            <span className="mt-5 text-xs font-semibold uppercase tracking-wide text-app-accent-text">Start test</span>
          </div>
          <aside className="mx-auto hidden w-full max-w-md border-l border-app-divider pl-10 lg:block">
            <p className="mb-2 font-mono text-xs uppercase tracking-widest text-app-muted">Current connection</p>
            <h2 className="mb-6 text-xl font-semibold capitalize text-app-primary">
              {networkInfo?.networkType || 'Network'}
            </h2>
            <dl className="divide-y divide-app-divider border-y border-app-divider">
              <div className="flex justify-between gap-4 py-3 text-sm">
                <dt className="text-app-muted">Network type</dt>
                <dd className="m-0 capitalize text-app-primary">{networkInfo?.effectiveType || networkInfo?.networkType || 'Not available'}</dd>
              </div>
              <div className="flex justify-between gap-4 py-3 text-sm">
                <dt className="text-app-muted">Browser downlink estimate</dt>
                <dd className="m-0 font-mono tabular-nums text-app-primary">
                  {networkInfo?.downlinkMbps === undefined ? 'Not available' : `${networkInfo.downlinkMbps} Mbps`}
                </dd>
              </div>
              <div className="flex justify-between gap-4 py-3 text-sm">
                <dt className="text-app-muted">Internet status</dt>
                <dd className="m-0 text-app-primary">{networkInfo?.online ? 'Online' : 'Offline'}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs leading-5 text-app-muted">
              The downlink figure is a browser estimate. The test below measures throughput directly.
            </p>
          </aside>
        </section>
      ) : isTesting ? (
        <section className="grid flex-1 grid-cols-1 content-center gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,.9fr)] lg:items-center lg:gap-12" aria-label="Speed test in progress">
          <div className="lg:flex lg:flex-col lg:items-center">
            <ModernSpeedGauge value={currentSpeedMbps} phase={phase} isRunning />

            <div className="mx-auto mt-2 w-full max-w-xl space-y-2">
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-app-secondary">{stageName}</span>
                <span className="shrink-0 font-mono tabular-nums text-app-muted">{progressPercent}%</span>
              </div>
              <div
                className="h-1 overflow-hidden rounded-full bg-app-divider"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progressPercent}
                aria-label="Test progress"
              >
                <div className="h-full bg-app-accent transition-[width] duration-300" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-center">
            <TwinThroughputCards
              downloadMbps={metrics.downloadMbps}
              uploadMbps={metrics.uploadMbps}
              downloadSamples={downloadSamples}
              uploadSamples={uploadSamples}
              activePhase={activePhase}
            />

            <div className="mx-auto grid w-full max-w-3xl grid-cols-3 divide-x divide-app-divider border-y border-app-divider py-3 text-center">
              {[
                ['Ping', metrics.idleLatencyMs === null ? '\u2014' : `${metrics.idleLatencyMs.toFixed(0)} ms`],
                ['Loaded ping', metrics.loadedLatencyMs === null ? '\u2014' : `${metrics.loadedLatencyMs.toFixed(0)} ms`],
                ['Jitter', metrics.jitterMs === null ? '\u2014' : `${metrics.jitterMs.toFixed(1)} ms`],
              ].map(([label, value]) => (
                <div key={label} className="px-2">
                  <span className="block text-[11px] text-app-muted">{label}</span>
                  <span className="mt-1 block font-mono text-sm font-semibold tabular-nums text-app-primary">{value}</span>
                </div>
              ))}
            </div>

            <button
              onClick={onCancelTest}
              className="mx-auto mt-4 flex items-center gap-2 rounded-md px-3 py-2 text-sm text-app-muted transition-colors hover:bg-app-raised hover:text-app-primary"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              <span>Cancel test</span>
            </button>
          </div>
        </section>
      ) : report ? (
        <section className="grid flex-1 grid-cols-1 content-start gap-x-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,.9fr)]" aria-label="Speed test results">
          <div className="mb-2 flex justify-between gap-3 pt-2 text-[10px] text-app-muted lg:col-span-2">
            <span>{report.overallRating.replace(/_/g, ' ').toUpperCase()} CONNECTION</span>
            <time dateTime={report.timestamp}>{new Date(report.timestamp).toLocaleDateString()}</time>
          </div>

          <p className="mb-2 text-sm leading-6 text-app-secondary lg:col-span-2">{report.headlineSummary}</p>

          <div className="lg:col-start-1">
            <TwinThroughputCards
              downloadMbps={metrics.downloadMbps}
              uploadMbps={metrics.uploadMbps}
              downloadSamples={downloadSamples}
              uploadSamples={uploadSamples}
              activePhase="completed"
            />
          </div>

          <div className="lg:col-start-2">
            <KeyMetricsList
              metrics={metrics}
              includeThroughput={false}
              additionalRows={[
                {
                  label: 'DNS resolution',
                  value: report.rawMeasurements.dnsTiming.durationMs === null
                    ? 'Not measured'
                    : `${report.rawMeasurements.dnsTiming.durationMs} ms`,
                },
                {
                  label: 'Public IP',
                  value: maskPublicIp(report.networkInfo.ipAddress),
                },
                { label: 'Country', value: report.networkInfo.locationCountry || 'Not available' },
                { label: 'City', value: report.networkInfo.locationCity || 'Not available' },
                { label: 'Network', value: report.networkInfo.networkType },
                { label: 'Provider', value: report.networkInfo.ispName || report.networkInfo.asnOrg || 'Not available' },
              ]}
            />
          </div>

          <div className="mb-5 flex flex-wrap justify-center gap-2.5 lg:col-start-1">
            <button
              onClick={onStartTest}
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-app-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-app-accent-hover"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              <span>Retest</span>
            </button>
            <button
              onClick={() => {
                try {
                  downloadPdfReport(report);
                } catch {
                  onExportError('The PDF could not be exported. Check available storage and try again.');
                }
              }}
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-app-divider px-4 text-sm font-semibold text-app-primary transition-colors hover:bg-app-raised"
            >
              <FileText className="h-4 w-4" aria-hidden="true" />
              <span>Export PDF</span>
            </button>
            <button
              onClick={() => {
                void shareOrDownloadSnapshot({
                  testedAt: report.timestamp,
                  networkType: report.networkInfo.networkType,
                  downloadMbps: metrics.downloadMbps,
                  uploadMbps: metrics.uploadMbps,
                  idleLatencyMs: metrics.idleLatencyMs,
                  jitterMs: metrics.jitterMs,
                  overallRating: report.overallRating,
                  downloadSamples: report.rawMeasurements.downloadThroughput.samples.map(
                    ({ timestamp, instantMbps }) => ({ timestamp, instantMbps })
                  ),
                }).catch(() => onExportError('The PNG could not be shared or exported. Try again.'));
              }}
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-app-divider px-4 text-sm font-semibold text-app-primary transition-colors hover:bg-app-raised"
            >
              <Share2 className="h-4 w-4" aria-hidden="true" />
              <span>Share PNG</span>
            </button>
          </div>

          <button
            onClick={onSaveAndClose}
            className="mb-5 min-h-12 w-full rounded-full bg-app-accent px-5 text-sm font-semibold text-white transition-colors hover:bg-app-accent-hover lg:col-start-1"
          >
            {canDiscardResult ? 'Save and close' : 'Close results'}
          </button>

          <div className="lg:col-span-2">
            <WorkloadSuitability activities={report.activities} />
            {advancedMode && <DetailedTestBreakdown report={report} />}
          </div>
        </section>
      ) : null}
    </div>
  );
};
