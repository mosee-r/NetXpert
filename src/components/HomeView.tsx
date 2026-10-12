import React from 'react';
import { OverallAssessmentReport } from '../types/scoring';
import { DeviceNetworkInfo } from '../types/network';
import { ActivityCard } from './ActivityCard';
import { RawMetricsPanel } from './RawMetricsPanel';
import {
  Activity,
  AlertTriangle,
  Clock,
  Sparkles,
  Wifi,
  Radio,
  FileText,
  DownloadCloud,
} from 'lucide-react';
import { exportReportToCsv, downloadFile, downloadPdfReport } from '../services/storage';

interface HomeViewProps {
  report: OverallAssessmentReport | null;
  networkInfo: DeviceNetworkInfo | null;
  advancedMode: boolean;
  onAssessClick: () => void;
  isTesting: boolean;
}

export const HomeView: React.FC<HomeViewProps> = ({
  report,
  networkInfo,
  advancedMode,
  onAssessClick,
  isTesting,
}) => {
  const isOnline = networkInfo?.online ?? true;
  const netType = networkInfo?.networkType || 'unknown';

  const handleExportPdf = () => {
    if (!report) return;
    downloadPdfReport(report);
  };

  const handleExportCsv = () => {
    if (!report) return;
    const csv = exportReportToCsv(report);
    downloadFile(csv, `speedxpat-report-${Date.now()}.csv`, 'text/csv');
  };

  const handleExportJson = () => {
    if (!report) return;
    const json = JSON.stringify(report, null, 2);
    downloadFile(json, `speedxpat-report-${Date.now()}.json`, 'application/json');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Hero */}
      {!report ? (
        // State before test has run: "Not assessed yet"
        <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 shadow-2xl relative overflow-hidden">
          <div className="max-w-2xl">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-xs text-slate-300 mb-4">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span>Status: Connection detected ({netType})</span>
              <span className="text-slate-500">•</span>
              <span className="text-slate-400 font-medium">Not assessed yet</span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight mb-3">
              Does your internet actually handle what you need?
            </h1>
            <p className="text-sm sm:text-base text-slate-300 mb-6 leading-relaxed">
              SpeedXpat tests more than raw speed. Run a guided diagnostic to receive evidence-based verdicts for <strong>gaming</strong>, <strong>4K streaming</strong>, <strong>video calls</strong>, <strong>browsing</strong>, and <strong>remote work</strong>.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={onAssessClick}
                disabled={isTesting}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-semibold text-sm shadow-xl shadow-cyan-500/25 transition-all flex items-center space-x-2"
              >
                <Activity className="w-5 h-5" />
                <span>Assess My Network</span>
              </button>
              <span className="text-xs text-slate-400">
                Safe, bounded test (~12 MB data) • Zero fake numbers
              </span>
            </div>
          </div>
        </div>
      ) : (
        // State after test has run: Comprehensive Verdict
        <div className="p-6 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-850 to-slate-900 border border-slate-800 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center border border-cyan-500/30">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-lg font-bold text-white">Network Capability Verdict</h2>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold font-mono uppercase bg-cyan-950 text-cyan-300 border border-cyan-800">
                    {report.overallRating}
                  </span>
                </div>
                <div className="flex items-center space-x-2 text-xs text-slate-400 mt-0.5 font-mono">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Tested {new Date(report.timestamp).toLocaleTimeString()}</span>
                  <span>•</span>
                  <span>{report.dataTransferredMb} MB tested</span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handleExportPdf}
                className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-xs font-semibold text-white shadow-md flex items-center space-x-1.5 cursor-pointer"
                title="Download professional PDF report with ISP details"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Export PDF</span>
              </button>
              <button
                onClick={handleExportCsv}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 border border-slate-700 flex items-center space-x-1.5 cursor-pointer"
                title="Export complete report to CSV"
              >
                <DownloadCloud className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>
              <button
                onClick={handleExportJson}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 border border-slate-700 flex items-center space-x-1.5 cursor-pointer"
                title="Export complete report to JSON"
              >
                <span>JSON</span>
              </button>
              <button
                onClick={onAssessClick}
                disabled={isTesting}
                className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-md transition-all flex items-center space-x-1.5"
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Re-test</span>
              </button>
            </div>
          </div>

          <p className="text-sm sm:text-base text-slate-200 leading-relaxed font-medium">
            {report.headlineSummary}
          </p>
        </div>
      )}

      {/* Advanced Telemetry Panel (When toggled on) */}
      {advancedMode && report && (
        <RawMetricsPanel report={report} />
      )}

      {/* Activities Grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight">
              Activity Capabilities Breakdown
            </h3>
            <p className="text-xs text-slate-400">
              Evaluated using transparent requirement gates & measured telemetry
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500">
            6 Activities Analyzed
          </span>
        </div>

        {report ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {report.activities.map((act) => (
              <ActivityCard key={act.activityId} assessment={act} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { id: 'gaming', title: 'Online Gaming', cat: 'Real-time Interactive' },
              { id: 'streaming', title: 'Movies & Video Streaming', cat: 'High-Bandwidth Media' },
              { id: 'conferencing', title: 'Video Conferencing', cat: 'Bidirectional Audio/Video' },
              { id: 'browsing', title: 'Web Browsing & Cloud Apps', cat: 'Interactive Web' },
              { id: 'remote_work', title: 'Remote Work & VPN', cat: 'Productivity Systems' },
              { id: 'transfers', title: 'Downloads & File Transfers', cat: 'Bulk Data Transfers' },
            ].map((placeholder) => (
              <div
                key={placeholder.id}
                className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800/80 text-slate-500 space-y-3"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-semibold text-slate-400">{placeholder.title}</h4>
                    <p className="text-xs text-slate-600">{placeholder.cat}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800/80 text-slate-500">
                    NOT ASSESSED
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Tap "Assess My Network" above to measure your connection and unlock real-time capability verdicts.
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
