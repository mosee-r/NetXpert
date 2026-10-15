import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, HelpCircle, RotateCcw, Save, Share2, Trash2, X, XCircle } from 'lucide-react';
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
import { maskIpAddress } from '../utils/privacy';

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
    <ol aria-label="Test phases" className="grid grid-cols-5 gap-1 sm:gap-2">
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
            <span className={`block truncate text-[11px] font-medium uppercase ${
              state === 'active' ? 'font-semibold text-app-primary' : 'text-app-secondary'
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
  isOnline: boolean | null;
  report: OverallAssessmentReport | null;
  lastReport: OverallAssessmentReport | null;
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
  isOnline,
  report,
  lastReport,
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
  const lastTestSummary = lastReport
    ? (() => {
        const elapsedMs = Math.max(0, Date.now() - new Date(lastReport.timestamp).getTime());
        const elapsedMinutes = Math.floor(elapsedMs / 60_000);
        const elapsedHours = Math.floor(elapsedMinutes / 60);
        const elapsedDays = Math.floor(elapsedHours / 24);
        const age = elapsedMinutes < 1
          ? 'just now'
          : elapsedMinutes < 60
          ? `${elapsedMinutes} min ago`
          : elapsedHours < 24
          ? `${elapsedHours} h ago`
          : `${elapsedDays} d ago`;
        const download = lastReport.rawMeasurements.downloadThroughput.mbps;
        const upload = lastReport.rawMeasurements.uploadThroughput.mbps;
        return `Last test · ${download === null ? '--' : `${download.toFixed(1)} Mbps`} down / ${upload === null ? '--' : `${upload.toFixed(1)} Mbps`} up · ${age}`;
      })()
    : null;
  const transportLabel = networkInfo?.networkType === 'wifi'
    ? 'Wi-Fi'
    : networkInfo?.networkType === 'cellular'
    ? 'Mobile data'
    : networkInfo?.networkType === 'ethernet'
    ? 'Ethernet'
    : '';
  const connectionStatus = isOnline === null
    ? 'Checking internet access'
    : isOnline
    ? 'Internet available'
    : 'No internet access';
  const connectionDetail = transportLabel
    ? `${transportLabel} · ${connectionStatus}`
    : connectionStatus;
  const connectionTone = isOnline === null
    ? 'border-white/10 bg-white/5 text-app-secondary'
    : isOnline
    ? 'border-emerald-400/20 bg-emerald-400/[0.05] text-emerald-200'
    : 'border-rose-400/25 bg-rose-500/[0.05] text-rose-200';
  const ratingTone = report?.overallRating === 'excellent' || report?.overallRating === 'good'
    ? 'border-app-success/25 bg-app-success-soft text-app-success'
    : report?.overallRating === 'fair'
    ? 'border-app-warning/25 bg-app-warning-soft text-app-warning'
    : report?.overallRating === 'poor'
    ? 'border-app-danger/25 bg-app-danger-soft text-app-danger'
    : 'border-app-divider bg-app-raised text-app-secondary';
  const RatingIcon = report?.overallRating === 'excellent' || report?.overallRating === 'good'
    ? CheckCircle2
    : report?.overallRating === 'fair'
    ? AlertTriangle
    : report?.overallRating === 'poor'
    ? XCircle
    : HelpCircle;
  const [showPublicIp, setShowPublicIp] = useState(false);
  const idleLatency = report?.rawMeasurements.loadedLatency.baselineLatencyMs
    ?? report?.rawMeasurements.idleLatency.medianMs
    ?? null;
  const loadedLatency = report?.rawMeasurements.loadedLatency.underLoadLatencyMs ?? null;
  const latencyDelta = report?.rawMeasurements.loadedLatency.loadedDeltaMs ?? null;
  const latencyScale = Math.max(idleLatency ?? 0, loadedLatency ?? 0, 1);
  const latencyTone = (value: number) => value < 50
    ? 'good'
    : value <= 100
    ? 'warning'
    : 'poor';
  const deltaTone = (value: number) => value > 100
    ? 'poor'
    : value > 30
    ? 'warning'
    : 'good';
  const toneClasses = {
    good: 'bg-emerald-400 text-emerald-300',
    warning: 'bg-amber-400 text-amber-300',
    poor: 'bg-rose-400 text-rose-300',
  };
  const ratingTextTone = report?.overallRating === 'excellent' || report?.overallRating === 'good'
    ? 'text-app-success'
    : report?.overallRating === 'fair'
    ? 'text-app-warning'
    : report?.overallRating === 'poor'
    ? 'text-app-danger'
    : 'text-app-secondary';

  return (
    <div className={`speed-test-home mx-auto flex min-h-[calc(100dvh-9rem)] w-full max-w-6xl flex-col px-1 lg:px-6 ${!isTesting && !report ? 'speed-test-home-ready' : ''}`}>
      {!isTesting && !report ? (
        <section key="ready" className="test-state-enter grid flex-1 grid-rows-[minmax(0,1fr)_auto_minmax(0,1fr)] justify-items-center py-4" aria-label="Speed test ready">
          <div className="flex w-full max-w-xl flex-col items-center justify-end px-4 pb-11 text-center">
            <div role="status" aria-live="polite" className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.2em] ${connectionTone}`}>
              <span className={`h-2 w-2 rounded-full ${isOnline === null ? 'bg-app-muted' : isOnline ? 'bg-emerald-400' : 'bg-rose-400'}`} aria-hidden="true" />
              <span>{connectionDetail}</span>
            </div>
            {lastTestSummary && (
              <p className="mt-3 max-w-md text-sm text-app-muted">{lastTestSummary}</p>
            )}
          </div>

          <div className="relative flex items-center justify-center">
            <span className="start-button-halo pointer-events-none absolute -inset-12 rounded-full bg-cyan-400/25 blur-3xl" aria-hidden="true" />
            <span className="pointer-events-none absolute -inset-5 rounded-full border border-cyan-400/30 bg-cyan-500/5" aria-hidden="true" />
            <span className="pointer-events-none absolute -inset-6 rounded-full border border-cyan-400/40 start-button-ring" aria-hidden="true" />
            <span className="pointer-events-none absolute -inset-9 rounded-full border border-cyan-400/20 start-button-ring-delayed" aria-hidden="true" />
            <button
              onClick={onStartTest}
              disabled={isTesting}
              aria-label="Start speed test"
              aria-busy={isTesting}
              className="start-cta group relative inline-flex items-center justify-center rounded-full border border-white/25 bg-[linear-gradient(180deg,rgba(186,230,253,0.96),rgba(103,232,249,0.96)_30%,rgba(14,165,233,0.97)_100%)] text-[#071421] shadow-[0_24px_80px_-24px_rgba(34,211,238,0.95)] ring-1 ring-cyan-100/30 transition-all duration-250 hover:scale-[1.06] hover:shadow-[0_28px_90px_-22px_rgba(34,211,238,1)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-app-accent"
            >
              <span className="absolute inset-[1px] rounded-full bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.75),rgba(255,255,255,0.08)_34%,transparent_56%)]" aria-hidden="true" />
              <span className="relative text-[2rem] font-black uppercase tracking-[0.08em] text-[#071421] sm:text-[2.4rem]">
                Start
              </span>
            </button>
          </div>

          <div className="flex w-full max-w-xl items-start justify-center px-4 pt-3 text-center" aria-hidden="true" />
        </section>
      ) : isTesting ? (
        <section key="testing" className="test-state-enter grid flex-1 grid-cols-1 content-center gap-2 sm:gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,.9fr)] lg:items-center lg:gap-8" aria-label="Speed test in progress">
          <div className="min-w-0 lg:col-span-2">
            <PhaseHud stage={stage} />
          </div>
          <div className="min-w-0 flex flex-col items-center gap-2 sm:gap-4 lg:flex lg:flex-col lg:items-center lg:gap-5">
            <ModernSpeedGauge
              value={currentSpeedMbps}
              phase={phase}
              isRunning
              statusLabel={GAUGE_STAGE_LABELS[stage] || 'Preparing test'}
            />

            <div className="mx-auto w-full max-w-xl space-y-2">
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
            <div className="mx-auto mb-2 grid w-full max-w-3xl grid-cols-3 divide-x divide-app-divider border-y border-app-divider py-2 text-center sm:mb-4 sm:py-3">
              {[
                ['Ping', metrics.idleLatencyMs === null ? '\u2014' : `${metrics.idleLatencyMs.toFixed(0)} ms`],
                ['Loaded ping', metrics.loadedLatencyMs === null ? '\u2014' : `${metrics.loadedLatencyMs.toFixed(0)} ms`],
                ['Jitter', metrics.jitterMs === null ? '\u2014' : `${metrics.jitterMs.toFixed(1)} ms`],
              ].map(([label, value]) => (
                <div key={label} className="px-2">
                  <span className="block text-[9px] text-app-muted sm:text-[11px]">{label}</span>
                  <span className="mt-0.5 block font-mono text-xs font-semibold tabular-nums text-app-primary sm:mt-1 sm:text-sm">{value}</span>
                </div>
              ))}
            </div>

            <TwinThroughputCards
              downloadMbps={metrics.downloadMbps}
              uploadMbps={metrics.uploadMbps}
              downloadSamples={downloadSamples}
              uploadSamples={uploadSamples}
              activePhase={activePhase}
              compact
            />

            <button
              type="button"
              onClick={onCancelTest}
              aria-label="Cancel speed test"
              className="mx-auto mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-rose-400/25 bg-rose-500/[0.04] px-4 text-sm font-semibold text-rose-200/90 transition-all hover:border-rose-400/45 hover:bg-rose-500/10 hover:text-rose-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400 active:bg-rose-500/15"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              <span>Cancel test</span>
            </button>
          </div>
        </section>
      ) : report ? (
        <section key="results" className="test-state-enter mx-auto flex w-full max-w-6xl flex-1 flex-col gap-3 pt-2 pb-24 sm:gap-5" aria-label="Speed test results">
          <div className="space-y-2 border-b border-app-divider pb-3 sm:space-y-3 sm:pb-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className={`inline-flex items-center gap-2 text-xl font-semibold capitalize ${ratingTextTone}`}>
                <RatingIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span>{report.overallRating.replace(/_/g, ' ')} connection</span>
              </h2>
              <button
                type="button"
                onClick={() => {
                  if (canDiscardResult && !window.confirm('Discard this unsaved result and start a new test?')) return;
                  onStartTest();
                }}
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-cyan-200/30 bg-gradient-to-b from-cyan-300 to-cyan-500 px-4 text-sm font-bold text-slate-950 shadow-[0_8px_24px_-12px_rgba(34,211,238,0.75)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-12px_rgba(34,211,238,0.9)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 active:translate-y-0"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                <span>Test again</span>
              </button>
            </div>
            <p className="max-w-2xl text-xs leading-5 text-app-secondary">{resultSummary}</p>
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-8">
            <div className="min-w-0">
              <TwinThroughputCards
                downloadMbps={metrics.downloadMbps}
                uploadMbps={metrics.uploadMbps}
                downloadSamples={downloadSamples}
                uploadSamples={uploadSamples}
                activePhase="completed"
                compact
              />

              <section className="border-y border-app-divider py-3" aria-label="Latency comparison under load">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-app-primary">Latency under load</h3>
                  {latencyDelta !== null && (
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${toneClasses[deltaTone(latencyDelta)].split(' ')[1]}`}>
                      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${toneClasses[deltaTone(latencyDelta)].split(' ')[0]}`} />
                      +{Math.round(latencyDelta)} ms
                    </span>
                  )}
                </div>
                {[
                  { label: 'Idle', value: idleLatency },
                  { label: 'Loaded', value: loadedLatency },
                ].map((row) => {
                  const tone = row.value === null ? 'warning' : latencyTone(row.value);
                  return (
                    <div key={row.label} className="mb-2 last:mb-0">
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="text-app-secondary">{row.label}</span>
                        <span className={`font-mono font-semibold ${toneClasses[tone].split(' ')[1]}`}>
                          {row.value === null ? 'Not measured' : `${Math.round(row.value)} ms`}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-app-divider" aria-hidden="true">
                        <div
                          className={`h-full rounded-full ${toneClasses[tone].split(' ')[0]}`}
                          style={{ width: row.value === null ? '0%' : `${Math.max(4, (row.value / latencyScale) * 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </section>
            </div>

            <div className="min-w-0">
              <h3 className="mb-2 text-sm font-semibold text-app-primary">Activity suitability</h3>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3 sm:gap-y-2 lg:grid-cols-2 lg:gap-x-4" aria-label="Activity suitability summary">
                {report.activities.map((activity) => {
                  const activityRating = activity.rating;
                  const activityTone = activityRating === 'excellent' || activityRating === 'good'
                    ? 'text-emerald-300'
                    : activityRating === 'fair'
                    ? 'text-amber-300'
                    : activityRating === 'poor'
                    ? 'text-rose-300'
                    : 'text-app-muted';
                  const activityDot = activityRating === 'excellent' || activityRating === 'good'
                    ? 'bg-emerald-400'
                    : activityRating === 'fair'
                    ? 'bg-amber-400'
                    : activityRating === 'poor'
                    ? 'bg-rose-400'
                    : 'bg-slate-500';
                  const activityLabel = activityRating === 'excellent'
                    ? 'Great'
                    : activityRating === 'good'
                    ? 'OK'
                    : activityRating === 'fair'
                    ? 'Fair'
                    : activityRating === 'poor'
                    ? 'Risky'
                    : 'Not tested';
                  const shortActivityName: Record<string, string> = {
                    gaming: 'Gaming',
                    streaming: 'Streaming',
                    conferencing: 'Video calls',
                    browsing: 'Browsing',
                    remote_work: 'Remote work',
                    transfers: 'Transfers',
                  };
                  return (
                    <div key={activity.activityId} className="min-w-0 border-b border-app-divider py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[11px] font-semibold text-app-primary sm:text-xs" title={activity.displayName}>
                          {shortActivityName[activity.activityId] || activity.displayName}
                        </span>
                        <span className={`inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold ${activityTone}`}>
                          <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${activityDot}`} />
                          {activityLabel}
                        </span>
                      </div>
                      <p className="mt-1 hidden text-[11px] leading-4 text-app-muted sm:line-clamp-2 sm:block" title={activity.summary}>
                        {activity.summary}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <h3 className="text-sm font-semibold text-app-primary">Connection details</h3>
          <KeyMetricsList
            metrics={metrics}
            includeThroughput={false}
            includeLatency={false}
            additionalRows={[
              {
                label: 'Jitter',
                value: metrics.jitterMs === null ? 'Not measured' : `${metrics.jitterMs.toFixed(1)} ms`,
                status: metrics.jitterMs === null ? undefined : metrics.jitterMs > 30 ? 'poor' : 'good',
              },
              {
                label: 'DNS resolution',
                value: report.rawMeasurements.dnsTiming.durationMs === null
                  ? 'Not measured'
                  : `${report.rawMeasurements.dnsTiming.durationMs} ms`,
              },
              {
                label: 'Public IP',
                value: report.networkInfo.ipAddress
                  ? showPublicIp ? report.networkInfo.ipAddress : maskIpAddress(report.networkInfo.ipAddress)
                  : 'Not recorded',
              },
              { label: 'City', value: report.networkInfo.locationCity || 'Not available' },
              ...(report.networkInfo.networkType !== 'unknown'
                ? [{ label: 'Network', value: report.networkInfo.networkType }]
                : []),
              { label: 'Provider', value: report.networkInfo.ispName || report.networkInfo.asnOrg || 'Not available' },
            ]}
          />
          {report.networkInfo.ipAddress && (
            <button
              type="button"
              onClick={() => setShowPublicIp((visible) => !visible)}
              className="-mt-3 min-h-11 self-start text-xs font-medium text-app-accent-text hover:text-app-primary"
              aria-pressed={showPublicIp}
            >
              {showPublicIp ? 'Hide public IP' : 'Reveal public IP'}
            </button>
          )}

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

          <div className="flex flex-wrap justify-center gap-2.5 pt-1">
            <button
              onClick={onSaveAndClose}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-cyan-200/30 bg-gradient-to-b from-cyan-300 to-cyan-500 px-3.5 text-xs font-bold text-slate-950 shadow-[0_8px_24px_-12px_rgba(34,211,238,0.75)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-12px_rgba(34,211,238,0.9)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 active:translate-y-0 sm:px-4 sm:text-sm"
            >
              {canDiscardResult ? <Save className="h-4 w-4" aria-hidden="true" /> : <X className="h-4 w-4" aria-hidden="true" />}
              <span>{canDiscardResult ? 'Save and close' : 'Close results'}</span>
            </button>
            {canDiscardResult && (
              <button
                onClick={onDiscardResults}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-rose-400/25 bg-rose-500/[0.04] px-3.5 text-xs font-semibold text-rose-200/90 transition-all hover:border-rose-400/45 hover:bg-rose-500/10 hover:text-rose-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400 active:bg-rose-500/15 sm:px-4 sm:text-sm"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                <span>Discard result</span>
              </button>
            )}
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

        </section>
      ) : null}
    </div>
  );
};
