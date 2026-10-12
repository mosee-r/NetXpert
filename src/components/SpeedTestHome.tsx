import React from 'react';
import { FileText, Download } from 'lucide-react';
import { DeviceNetworkInfo } from '../types/network';
import { OverallAssessmentReport } from '../types/scoring';
import { AssessmentStage } from '../engines/orchestrator';
import { ConnectionContextChip } from './ConnectionContextChip';
import { SpeedGauge } from './SpeedGauge';
import { KeyMetricsMatrix } from './KeyMetricsMatrix';
import { LiveSparkline } from './LiveSparkline';
import { WorkloadSuitability } from './WorkloadSuitability';
import { DetailedTestBreakdown } from './DetailedTestBreakdown';
import { downloadPdfReport } from '../services/storage';

interface SpeedTestHomeProps {
  networkInfo: DeviceNetworkInfo | null;
  report: OverallAssessmentReport | null;
  isTesting: boolean;
  stage: AssessmentStage;
  stageName: string;
  progressPercent: number;
  heroValue: string;
  heroUnit: string;
  heroLabel: string;
  sparklineData: number[];
  activeMetrics: {
    downloadMbps?: number | null;
    uploadMbps?: number | null;
    pingMs?: number | null;
    loadedPingMs?: number | null;
    jitterMs?: number | null;
  };
  advancedMode: boolean;
  useMlab?: boolean;
  onStartTest: () => void;
  onCancelTest: () => void;
  onExportError: (message: string) => void;
}

export const SpeedTestHome: React.FC<SpeedTestHomeProps> = ({
  networkInfo,
  report,
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
  useMlab = true,
  onStartTest,
  onCancelTest,
  onExportError,
}) => {
  return (
    <div className="max-w-2xl mx-auto pb-20">
      {/* 1. Connection Context Chip */}
      <ConnectionContextChip networkInfo={networkInfo} />

      {/* 2. Modern Radial Speed Gauge & Waveform */}
      <SpeedGauge
        isTesting={isTesting}
        stage={stage}
        stageName={stageName}
        progressPercent={progressPercent}
        heroValue={heroValue}
        heroUnit={heroUnit}
        heroLabel={heroLabel}
        sparklineData={sparklineData}
        serverEndpoint={
          report?.rawMeasurements.downloadThroughput.target ||
          (useMlab
            ? 'Measurement Lab (M-Lab ndt7 Global Network)'
            : 'Automatic (Fastest Edge Server)')
        }
        onStartTest={onStartTest}
        onCancelTest={onCancelTest}
        hasCompletedReport={!!report && !isTesting}
      />

      {/* 3. 3x2 Key Metrics Matrix */}
      <KeyMetricsMatrix report={report} activeMetrics={activeMetrics} />

      {/* PDF Export Quick Action Bar (when test report is available and not actively testing) */}
      {report && !isTesting && (
        <div className="flex items-center justify-between p-3 rounded-2xl bg-[#0E1A2E] border border-cyan-500/20 my-3 text-xs">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-slate-300 font-medium">Diagnostic Report Ready</span>
            <span className="text-slate-500 hidden sm:inline">•</span>
            <span className="text-cyan-300 font-mono hidden sm:inline uppercase">
              {report.overallRating} VERDICT
            </span>
          </div>
          <button
            onClick={() => {
              try {
                downloadPdfReport(report);
              } catch {
                onExportError('The PDF could not be exported. Check available storage and try again.');
              }
            }}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-semibold shadow-md active:scale-95 transition-all cursor-pointer"
            title="Download formatted PDF report with all metrics and activity scores"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Download PDF Report</span>
          </button>
        </div>
      )}

      {/* 4. Live Throughput Waveform Card (Rendered during test or when sparkline data is available) */}
      {(isTesting || sparklineData.length > 0) && (
        <div className="p-3.5 sm:p-4 rounded-2xl bg-[#0E1A2E] border border-white/10 shadow-lg space-y-2 my-3">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-400 font-semibold flex items-center space-x-1.5">
              <span className={`w-2 h-2 rounded-full ${isTesting ? 'bg-cyan-400 animate-pulse' : 'bg-emerald-400'}`} />
              <span>LIVE THROUGHPUT WAVEFORM</span>
            </span>
            <span className="text-cyan-300 font-bold tabular-nums">
              {activeMetrics.downloadMbps
                ? `${activeMetrics.downloadMbps.toFixed(1)} Mbps`
                : activeMetrics.uploadMbps
                ? `${activeMetrics.uploadMbps.toFixed(1)} Mbps`
                : heroValue !== '0'
                ? `${heroValue} ${heroUnit}`
                : 'Packet Stream'}
            </span>
          </div>

          <LiveSparkline
            sparklineData={sparklineData}
            width="100%"
            height={52}
            isTesting={isTesting}
            showPeak={true}
          />
        </div>
      )}

      {/* 5. Real-World Connection Workload Suitability */}
      <WorkloadSuitability activities={report?.activities} />

      {/* 5. Bufferbloat & Advanced Telemetry Breakdown */}
      {report && advancedMode && (
        <DetailedTestBreakdown report={report} />
      )}
    </div>
  );
};
