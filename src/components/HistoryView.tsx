import React, { useState } from 'react';
import {
  OverallAssessmentReport,
} from '../types/scoring';
import {
  getAssessmentHistory,
  deleteAssessment,
  clearAllHistory,
  exportReportToCsv,
  downloadFile,
} from '../services/storage';
import {
  History,
  Trash2,
  DownloadCloud,
  FileText,
  Clock,
  Sparkles,
  ArrowRight,
  ChevronRight,
  Scale,
} from 'lucide-react';
import { ActivityCard } from './ActivityCard';
import { RawMetricsPanel } from './RawMetricsPanel';

interface HistoryViewProps {
  onSelectReportToView: (report: OverallAssessmentReport) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({ onSelectReportToView }) => {
  const [history, setHistory] = useState<OverallAssessmentReport[]>(() =>
    getAssessmentHistory()
  );
  const [selectedReport, setSelectedReport] = useState<OverallAssessmentReport | null>(null);

  // Compare mode
  const [compareMode, setCompareMode] = useState(false);
  const [compareIdA, setCompareIdA] = useState<string>('');
  const [compareIdB, setCompareIdB] = useState<string>('');

  const refreshHistory = () => {
    setHistory(getAssessmentHistory());
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteAssessment(id);
    refreshHistory();
    if (selectedReport?.id === id) setSelectedReport(null);
  };

  const handleClearAll = () => {
    if (confirm('Are you sure you want to clear all saved local diagnostic history?')) {
      clearAllHistory();
      refreshHistory();
      setSelectedReport(null);
    }
  };

  const reportA = history.find((h) => h.id === compareIdA);
  const reportB = history.find((h) => h.id === compareIdB);

  return (
    <div className="space-y-6 text-white max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center border border-cyan-500/30">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Diagnostic History & Reports</h2>
            <p className="text-xs text-slate-400">
              Compliant with Section 5.13: Local-first persistence, comparison & export
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {history.length >= 2 && (
            <button
              onClick={() => setCompareMode(!compareMode)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center space-x-1.5 transition-all ${
                compareMode
                  ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Scale className="w-3.5 h-3.5" />
              <span>{compareMode ? 'Exit Compare' : 'Compare Two Runs'}</span>
            </button>
          )}

          {history.length > 0 && (
            <button
              onClick={handleClearAll}
              className="px-3 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900 border border-rose-800/80 text-rose-300 text-xs font-medium flex items-center space-x-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear History</span>
            </button>
          )}
        </div>
      </div>

      {/* Compare Runs Box */}
      {compareMode && history.length >= 2 && (
        <div className="p-5 rounded-2xl bg-slate-900 border border-indigo-800/80 shadow-2xl space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
            <Scale className="w-4 h-4 text-indigo-400" />
            <span>Select Two Assessment Runs to Compare</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Baseline Run (A):</label>
              <select
                value={compareIdA}
                onChange={(e) => setCompareIdA(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-slate-200"
              >
                <option value="">Select Run A...</option>
                {history.map((h) => (
                  <option key={h.id} value={h.id}>
                    {new Date(h.timestamp).toLocaleString()} ({h.networkInfo.networkType} • {h.overallRating})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Comparative Run (B):</label>
              <select
                value={compareIdB}
                onChange={(e) => setCompareIdB(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-slate-200"
              >
                <option value="">Select Run B...</option>
                {history.map((h) => (
                  <option key={h.id} value={h.id}>
                    {new Date(h.timestamp).toLocaleString()} ({h.networkInfo.networkType} • {h.overallRating})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {reportA && reportB && (
            <div className="mt-4 pt-4 border-t border-slate-800 space-y-3 font-mono text-xs">
              <div className="grid grid-cols-3 gap-2 p-2 bg-slate-800/80 rounded-lg font-bold text-slate-300">
                <span>Metric</span>
                <span className="text-cyan-300">Run A ({new Date(reportA.timestamp).toLocaleTimeString()})</span>
                <span className="text-indigo-300">Run B ({new Date(reportB.timestamp).toLocaleTimeString()})</span>
              </div>
              <div className="grid grid-cols-3 gap-2 p-2 bg-slate-800/40 rounded-lg text-slate-400">
                <span>Connection Type</span>
                <span className="text-white capitalize">{reportA.networkInfo.networkType}</span>
                <span className="text-white capitalize">{reportB.networkInfo.networkType}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 p-2 bg-slate-800/40 rounded-lg text-slate-400">
                <span>Idle Latency</span>
                <span className="text-white">{reportA.rawMeasurements.idleLatency.medianMs} ms</span>
                <span className="text-white">{reportB.rawMeasurements.idleLatency.medianMs} ms</span>
              </div>
              <div className="grid grid-cols-3 gap-2 p-2 bg-slate-800/40 rounded-lg text-slate-400">
                <span>Jitter</span>
                <span className="text-white">{reportA.rawMeasurements.idleLatency.jitterMs} ms</span>
                <span className="text-white">{reportB.rawMeasurements.idleLatency.jitterMs} ms</span>
              </div>
              <div className="grid grid-cols-3 gap-2 p-2 bg-slate-800/40 rounded-lg text-slate-400">
                <span>Download Throughput</span>
                <span className="text-white">{reportA.rawMeasurements.downloadThroughput.mbps} Mbps</span>
                <span className="text-white">{reportB.rawMeasurements.downloadThroughput.mbps} Mbps</span>
              </div>
              <div className="grid grid-cols-3 gap-2 p-2 bg-slate-800/40 rounded-lg text-slate-400">
                <span>Upload Throughput</span>
                <span className="text-white">{reportA.rawMeasurements.uploadThroughput.mbps} Mbps</span>
                <span className="text-white">{reportB.rawMeasurements.uploadThroughput.mbps} Mbps</span>
              </div>
              <div className="grid grid-cols-3 gap-2 p-2 bg-slate-800/40 rounded-lg text-slate-400">
                <span>Bufferbloat Delta</span>
                <span className="text-white">+{reportA.rawMeasurements.loadedLatency.loadedDeltaMs} ms</span>
                <span className="text-white">+{reportB.rawMeasurements.loadedLatency.loadedDeltaMs} ms</span>
              </div>
              <div className="grid grid-cols-3 gap-2 p-2 bg-slate-800/40 rounded-lg text-slate-400">
                <span>Overall Verdict</span>
                <span className="text-cyan-400 uppercase font-bold">{reportA.overallRating}</span>
                <span className="text-indigo-400 uppercase font-bold">{reportB.overallRating}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* History List or Empty State */}
      {history.length === 0 ? (
        <div className="p-8 rounded-2xl bg-slate-900 border border-slate-800 text-center text-slate-400 space-y-3">
          <History className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-base font-semibold text-slate-300">No Assessment History Recorded</h3>
          <p className="text-xs max-w-sm mx-auto">
            Run an assessment from the Dashboard to record diagnostic telemetry and unlock capability history.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {history.map((item) => {
            const isSelected = selectedReport?.id === item.id;
            return (
              <div
                key={item.id}
                onClick={() => setSelectedReport(isSelected ? null : item)}
                className={`p-4 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-slate-850 border-cyan-500/60 shadow-lg'
                    : 'bg-slate-900/80 border-slate-800 hover:border-slate-700/80 hover:bg-slate-900'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center space-x-3">
                    <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-cyan-400 shrink-0">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-semibold text-white">
                          {new Date(item.timestamp).toLocaleString()}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-slate-800 text-cyan-300 border border-slate-700">
                          {item.networkInfo.networkType}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-cyan-950 text-cyan-300 border border-cyan-800 font-bold">
                          {item.overallRating}
                        </span>
                      </div>
                      <div className="flex items-center space-x-3 text-xs text-slate-400 mt-1 font-mono">
                        <span>Down: {item.rawMeasurements.downloadThroughput.mbps || 0} Mbps</span>
                        <span>•</span>
                        <span>Ping: {item.rawMeasurements.idleLatency.medianMs || 0} ms</span>
                        <span>•</span>
                        <span>Bloat: +{item.rawMeasurements.loadedLatency.loadedDeltaMs || 0} ms</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center space-x-2 self-end sm:self-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const csv = exportReportToCsv(item);
                        downloadFile(csv, `netxpert-${item.id}.csv`, 'text/csv');
                      }}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                      title="Export CSV"
                    >
                      <DownloadCloud className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const json = JSON.stringify(item, null, 2);
                        downloadFile(json, `netxpert-${item.id}.json`, 'application/json');
                      }}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                      title="Export JSON"
                    >
                      <FileText className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => handleDelete(item.id, e)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/80 text-rose-400 border border-slate-700 hover:border-rose-800"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Expanded Details inside History Item */}
                {isSelected && (
                  <div className="mt-4 pt-4 border-t border-slate-800 space-y-4 animate-in fade-in duration-150">
                    <p className="text-xs text-slate-300 leading-relaxed font-medium">
                      {item.headlineSummary}
                    </p>
                    <RawMetricsPanel report={item} />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {item.activities.map((act) => (
                        <ActivityCard key={act.activityId} assessment={act} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
