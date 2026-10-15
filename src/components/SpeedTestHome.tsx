import React from 'react';
import { FileText, Power, Share2, X } from 'lucide-react';
import { DeviceNetworkInfo, ThroughputChartPoint } from '../types/network';
import { ActivityRating, OverallAssessmentReport } from '../types/scoring';
import { AssessmentStage } from '../engines/orchestrator';
import { ModernSpeedGauge } from './ModernSpeedGauge';
import { KeyMetricsList } from './KeyMetricsMatrix';
import { ThroughputCardSample, TwinThroughputCards } from './TwinThroughputCards';
import { WorkloadSuitability } from './WorkloadSuitability';
import { DetailedTestBreakdown } from './DetailedTestBreakdown';
import { downloadPdfReport } from '../services/storage';
import { shareOrDownloadSnapshot } from '../services/shareImageGenerator';

const TEST_PHASES = [
  { key: 'setup', label: 'Setup' },
  { key: 'latency', label: 'Ping' },
  { key: 'speed', label: 'Speed' },
  { key: 'diagnostics', label: 'Checks' },
  { key: 'scoring', label: 'Score' },
] as const;

const PHASE_STAGE_INDEX: Partial<Record<AssessmentStage, number>> = {
  detecting_network: 0,
  measuring_dns: 0,
  measuring_latency: 1,
  measuring_download: 2,
  measuring_upload: 2,
  measuring_mlab: 3,
  measuring_loaded_latency: 3,
  evaluating_activities: 4,
  complete: 5,
};

const GAUGE_STAGE_LABELS: Partial<Record<AssessmentStage, string>> = {
  detecting_network: 'Network setup',
  measuring_dns: 'DNS check',
  measuring_latency: 'Latency test',
  measuring_download: 'Download test',
  measuring_upload: 'Upload test',
  measuring_mlab: 'M-Lab diagnostics',
  measuring_loaded_latency: 'Bufferbloat test',
  evaluating_activities: 'Scoring results',
};

const PhaseHud: React.FC<{ stage: AssessmentStage }> = ({ stage }) => {
  const activeIndex = PHASE_STAGE_INDEX[stage] ?? -1;

  return (
    <ol aria-label="Test phases" className="grid grid-cols-5 gap-2">
      {TEST_PHASES.map((phase, index) => {
        const state = index < activeIndex
          ? 'done'
          : index === activeIndex
          ? 'active'
          : 'pending';
        const stateLabel = state === 'done'
          ? 'complete'
          : state === 'active'
          ? 'in progress'
          : state;

        return (
          <li
            key={phase.key}
            aria-current={state === 'active' ? 'step' : undefined}
            aria-label={`${phase.label}: ${stateLabel}`}
            title={`${phase.label}: ${stateLabel}`}
            className="min-w-0 text-center"
          >
            <span
              aria-hidden="true"
              className={`mb-1.5 block h-1.5 rounded-full transition-colors motion-reduce:transition-none ${
              state === 'done'
                ? 'bg-app-success'
                : state === 'active'
                ? 'bg-app-accent shadow-[0_0_10px_var(--app-accent-soft)]'
                : 'bg-app-divider-strong'
            }`}
              />
            <span className={`block truncate font-mono text-[9px] uppercase sm:text-[10px] ${
              state === 'active' ? 'font-semibold text-app-primary' : 'text-app-muted'
            }`}>
              {phase.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
};

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
  downloadSparklineData: ThroughputChartPoint[];
  uploadSparklineData: ThroughputChartPoint[];
  activeMetrics: {
    downloadMbps?: number | null;
    uploadMbps?: number | null;
    pingMs?: number | null;
    loadedPingMs?: number | null;
    jitterMs?: number | null;
  };
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
  downloadSparklineData,
  uploadSparklineData,
  activeMetrics,
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
  const liveDownloadSamples: ThroughputCardSample[] = downloadSparklineData.map((point) => ({
    timestampMs: point.elapsedMs,
    mbps: point.mbps,
  }));
  const liveUploadSamples: ThroughputCardSample[] = uploadSparklineData.map((point) => ({
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
    ? liveDownloadSamples
    : reportDownloadSamples;
  const uploadSamples = isTesting
    ? liveUploadSamples
    : reportUploadSamples;
  const conciseSummaries: Record<ActivityRating, string> = {
    excellent: 'Excellent for gaming, calls, 4K streaming, and large transfers.',
    good: 'Reliable for HD streaming, calls, and everyday work.',
    fair: 'Browsing and streaming are fine; gaming or large transfers may add lag.',
    poor: 'High latency or limited bandwidth may disrupt calls, streaming, and gaming.',
    insufficient_data: 'The test was incomplete; run diagnostics again for a full result.',
    not_assessed: 'No capability rating is available for this test.',
  };
  const resultSummary = report
    ? `${conciseSummaries[report.overallRating]}${
        report.rawMeasurements.loadedLatency.loadedDeltaMs !== null &&
        report.rawMeasurements.loadedLatency.loadedDeltaMs > 75
          ? ` Ping rises ${Math.round(report.rawMeasurements.loadedLatency.loadedDeltaMs)} ms under load.`
          : ''
      }`
    : '';
  const connectionStatus = networkInfo?.online === undefined
    ? 'Tap Start to check your internet speed'
    : networkInfo.online
    ? 'Tap Start to check your internet speed'
    : 'Offline · reconnect to test';
  const ratingTone = report?.overallRating === 'excellent' || report?.overallRating === 'good'
    ? 'border-app-success/25 bg-app-success-soft text-app-success'
    : report?.overallRating === 'fair'
    ? 'border-app-warning/25 bg-app-warning-soft text-app-warning'
    : report?.overallRating === 'poor'
    ? 'border-app-danger/25 bg-app-danger-soft text-app-danger'
    : 'border-app-divider bg-app-raised text-app-secondary';

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-9rem)] w-full max-w-6xl flex-col px-1 pb-24 lg:px-6">
      {!isTesting && !report ? (
        <section key="ready" className="test-state-enter flex flex-1 items-center justify-center py-8" aria-label="Speed test ready">
          <div className="flex w-full flex-col items-center px-4 text-center">
            <p className="mb-8 text-sm text-app-secondary">{connectionStatus}</p>
            <div className="relative flex items-center justify-center">
              <span className="pointer-events-none absolute -inset-2 rounded-full border border-app-accent/25" aria-hidden="true" />
              <span className="pointer-events-none absolute -inset-3 rounded-full border border-app-accent/40 start-button-ring" aria-hidden="true" />
              <span className="pointer-events-none absolute -inset-5 rounded-full border border-app-accent/20 start-button-ring-delayed" aria-hidden="true" />
              <button
                onClick={onStartTest}
                disabled={isTesting}
                aria-label="Start speed test"
                aria-busy={isTesting}
                className="start-button-glow group relative inline-flex h-32 w-32 items-center justify-center rounded-full bg-app-accent text-[#071421] transition-all duration-200 hover:scale-[1.04] active:scale-95 disabled:cursor-not-allowed disabled:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-app-accent"
              >
                <span className="absolute inset-0 flex items-center justify-center">
                  <Power className="h-10 w-10 transition-transform duration-300 group-hover:rotate-12" aria-hidden="true" />
                </span>
                <span className="absolute inset-x-0 bottom-4 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-[#071421]">
                  START
                </span>
              </button>
            </div>
            <p className="mt-6 text-[10px] font-mono uppercase tracking-[0.28em] text-app-muted">
              {isTesting ? 'Starting probe…' : 'Diagnostic Probe Ready'}
            </p>
          </div>
        </section>
      ) : isTesting ? (
        <section key="testing" className="test-state-enter grid flex-1 grid-cols-1 content-center gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,.9fr)] lg:items-center lg:gap-8" aria-label="Speed test in progress">
          <div className="min-w-0 lg:col-span-2">
            <PhaseHud stage={stage} />
          </div>
          <div className="min-w-0 lg:flex lg:flex-col lg:items-center">
            <ModernSpeedGauge
              value={currentSpeedMbps}
              phase={phase}
              isRunning
              statusLabel={GAUGE_STAGE_LABELS[stage] || 'Preparing test'}
            />

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

          <div className="min-w-0 flex flex-col justify-center">
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
        <section key="results" className="test-state-enter mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 pt-2 pb-24" aria-label="Speed test results">
          <div className="space-y-3 border-b border-app-divider pb-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl font-semibold capitalize text-app-primary">
                {report.overallRating.replace(/_/g, ' ')} connection
              </h2>
              <time className="font-mono text-xs text-app-muted" dateTime={report.timestamp}>
                {new Date(report.timestamp).toLocaleDateString()}
              </time>
            </div>
            <p className="max-w-2xl text-xs leading-5 text-app-secondary">{resultSummary}</p>
          </div>

          <TwinThroughputCards
            downloadMbps={metrics.downloadMbps}
            uploadMbps={metrics.uploadMbps}
            downloadSamples={downloadSamples}
            uploadSamples={uploadSamples}
            activePhase="completed"
            compact
          />

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
              { label: 'Public IP', value: report.networkInfo.ipAddress || 'Not recorded' },
              { label: 'Country', value: report.networkInfo.locationCountry || 'Not available' },
              { label: 'City', value: report.networkInfo.locationCity || 'Not available' },
              { label: 'Network', value: report.networkInfo.networkType },
              { label: 'Provider', value: report.networkInfo.ispName || report.networkInfo.asnOrg || 'Not available' },
            ]}
          />

          <details className="group border-b border-app-divider py-3">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-app-secondary outline-none marker:hidden hover:text-app-primary focus-visible:ring-2 focus-visible:ring-app-accent [&::-webkit-details-marker]:hidden">
              <span>Advanced details</span>
              <span aria-hidden="true" className="text-lg text-app-accent transition-transform group-open:rotate-45">+</span>
            </summary>
            <div className="space-y-5 pt-4">
              <WorkloadSuitability activities={report.activities} />
              <DetailedTestBreakdown report={report} />
            </div>
          </details>

          <div className="flex flex-wrap justify-center gap-2.5">
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
              className="min-h-12 w-full rounded-lg bg-app-accent px-5 text-sm font-semibold text-[#071421] transition-colors hover:bg-app-accent-hover"
          >
            {canDiscardResult ? 'Save and close' : 'Close results'}
          </button>

        </section>
      ) : null}
    </div>
  );
};
