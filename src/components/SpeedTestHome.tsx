import React from 'react';
import { FileText, Power, Share2, SlidersHorizontal, X } from 'lucide-react';
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
  sparklineData: ThroughputChartPoint[];
  activeMetrics: {
    downloadMbps?: number | null;
    uploadMbps?: number | null;
    pingMs?: number | null;
    loadedPingMs?: number | null;
    jitterMs?: number | null;
  };
  advancedMode: boolean;
  onToggleAdvancedMode: () => void;
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
  onToggleAdvancedMode,
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
        <section className="flex flex-1 items-center justify-center py-8" aria-label="Speed test ready">
          <div className="flex w-full flex-col items-center px-4 text-center">
            <p className="mb-8 text-sm text-app-secondary">{connectionStatus}</p>
            <div className="relative flex items-center justify-center">
              <span className="pointer-events-none absolute -inset-2 rounded-full border border-app-accent/20" aria-hidden="true" />
              <span className="pointer-events-none absolute -inset-3 rounded-full border border-app-accent/35 start-button-ring" aria-hidden="true" />
              <button
                onClick={onStartTest}
                className="relative inline-flex h-32 w-32 items-center justify-center rounded-full bg-app-accent text-[#071421] transition-transform duration-200 hover:scale-[1.03] active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-app-accent"
                aria-label="Start speed test"
              >
                <Power className="h-10 w-10" aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>
      ) : isTesting ? (
        <section className="grid flex-1 grid-cols-1 content-center gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,.9fr)] lg:items-center lg:gap-12" aria-label="Speed test in progress">
          <div className="min-w-0 lg:col-span-2">
            <PhaseHud stage={stage} />
          </div>
          <div className="lg:flex lg:flex-col lg:items-center">
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
        <section className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 pt-2 pb-24" aria-label="Speed test results">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-app-divider pb-4">
            <span className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase ${ratingTone}`}>
              {report.overallRating.replace(/_/g, ' ')} connection
            </span>
            <div className="flex items-center gap-3">
              <time className="font-mono text-[10px] text-app-muted" dateTime={report.timestamp}>
                {new Date(report.timestamp).toLocaleDateString()}
              </time>
              <button
                type="button"
                onClick={onToggleAdvancedMode}
                aria-pressed={advancedMode}
                aria-label={advancedMode ? 'Hide advanced details' : 'Show advanced details'}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors ${
                  advancedMode
                    ? 'border-app-accent/40 bg-app-accent/10 text-app-accent-text'
                    : 'border-app-divider text-app-secondary hover:bg-app-raised'
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                {advancedMode ? 'Advanced on' : 'Advanced details'}
              </button>
            </div>
            <p className="text-sm leading-6 text-app-secondary sm:w-full sm:order-3">{report.headlineSummary}</p>
          </div>

          <TwinThroughputCards
            downloadMbps={metrics.downloadMbps}
            uploadMbps={metrics.uploadMbps}
            downloadSamples={downloadSamples}
            uploadSamples={uploadSamples}
            activePhase="completed"
          />

          <div>
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
                  value: report.networkInfo.ipAddress || 'Not recorded',
                },
                { label: 'Country', value: report.networkInfo.locationCountry || 'Not available' },
                { label: 'City', value: report.networkInfo.locationCity || 'Not available' },
                { label: 'Network', value: report.networkInfo.networkType },
                { label: 'Provider', value: report.networkInfo.ispName || report.networkInfo.asnOrg || 'Not available' },
              ]}
            />
          </div>

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

          <div className="pt-2">
            <WorkloadSuitability activities={report.activities} />
            {advancedMode && <DetailedTestBreakdown report={report} />}
          </div>
        </section>
      ) : null}
    </div>
  );
};
