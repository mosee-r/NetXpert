import React, { useState } from 'react';
import { OverallAssessmentReport } from '../types/scoring';
import {
  TrendingUp,
  DownloadCloud,
  FileText,
  Trash2,
  Filter,
  Wifi,
  Radio,
  Clock,
  ChevronRight,
  Gauge,
  Sparkles,
} from 'lucide-react';
import { exportReportToCsv, downloadFile, downloadPdfReport } from '../services/storage';

interface TrendsTabProps {
  history: OverallAssessmentReport[];
  onDeleteReport: (id: string) => void;
  onClearAllHistory: () => void;
  onInspectReport: (report: OverallAssessmentReport) => void;
}

export const TrendsTab: React.FC<TrendsTabProps> = ({
  history,
  onDeleteReport,
  onClearAllHistory,
  onInspectReport,
}) => {
  const [filterType, setFilterType] = useState<'all' | 'wifi' | 'cellular'>('all');

  const filteredHistory = history.filter((item) => {
    if (filterType === 'all') return true;
    return item.networkInfo.networkType === filterType;
  });

  const handleExportCsv = () => {
    if (history.length === 0) return;
    const csvRows = [
      'ID,Timestamp,Type,DownloadMbps,UploadMbps,PingMs,JitterMs,BufferbloatDelta,Verdict',
      ...history.map(
        (h) =>
          `${h.id},${h.timestamp},${h.networkInfo.networkType},${
            h.rawMeasurements.downloadThroughput.mbps ?? ''
          },${h.rawMeasurements.uploadThroughput.mbps ?? ''},${
            h.rawMeasurements.idleLatency.medianMs ?? ''
          },${h.rawMeasurements.idleLatency.jitterMs ?? ''},${
            h.rawMeasurements.loadedLatency.loadedDeltaMs ?? ''
          },${h.overallRating}`
      ),
    ];
    downloadFile(csvRows.join('\n'), `netxpert-history-${Date.now()}.csv`, 'text/csv');
  };

  const handleExportJson = () => {
    if (history.length === 0) return;
    const json = JSON.stringify(history, null, 2);
    downloadFile(json, `netxpert-history-${Date.now()}.json`, 'application/json');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-20">
      {/* Title & Global Export Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-2.5">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center border border-cyan-500/30">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Trends & Diagnostics History</h2>
            <p className="text-xs text-slate-400">
              Historical performance records stored securely on local storage
            </p>
          </div>
        </div>

        {history.length > 0 && (
          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                if (history.length > 0) downloadPdfReport(history[0]);
              }}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-xs font-semibold text-white shadow-md flex items-center space-x-1.5 cursor-pointer"
              title="Download PDF report of latest run"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Latest PDF</span>
            </button>
            <button
              onClick={handleExportCsv}
              className="px-3 py-1.5 rounded-xl bg-[#0E1A2E] hover:bg-[#15253D] border border-white/10 text-xs font-medium text-slate-300 flex items-center space-x-1.5 cursor-pointer"
            >
              <DownloadCloud className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
            <button
              onClick={handleExportJson}
              className="px-3 py-1.5 rounded-xl bg-[#0E1A2E] hover:bg-[#15253D] border border-white/10 text-xs font-medium text-slate-300 flex items-center space-x-1.5 cursor-pointer"
            >
              <span>JSON</span>
            </button>
            <button
              onClick={onClearAllHistory}
              className="p-1.5 rounded-xl bg-rose-950/40 hover:bg-rose-900 border border-rose-800 text-rose-300 transition-colors cursor-pointer"
              title="Clear Database"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Filter Chips */}
      <div className="flex items-center space-x-2">
        <button
          onClick={() => setFilterType('all')}
          className={`px-3 py-1 rounded-xl text-xs font-mono font-medium transition-all cursor-pointer ${
            filterType === 'all'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'bg-[#0E1A2E] text-slate-400 border border-white/5'
          }`}
        >
          All Runs ({history.length})
        </button>
        <button
          onClick={() => setFilterType('wifi')}
          className={`px-3 py-1 rounded-xl text-xs font-mono font-medium transition-all cursor-pointer ${
            filterType === 'wifi'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'bg-[#0E1A2E] text-slate-400 border border-white/5'
          }`}
        >
          Wi-Fi Only
        </button>
        <button
          onClick={() => setFilterType('cellular')}
          className={`px-3 py-1 rounded-xl text-xs font-mono font-medium transition-all cursor-pointer ${
            filterType === 'cellular'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'bg-[#0E1A2E] text-slate-400 border border-white/5'
          }`}
        >
          Cellular Only
        </button>
      </div>

      {/* History List */}
      {filteredHistory.length === 0 ? (
        <div className="p-8 rounded-2xl bg-[#0E1A2E] border border-white/10 text-center text-slate-400 space-y-2">
          <Clock className="w-8 h-8 text-slate-600 mx-auto" />
          <h3 className="text-sm font-semibold text-slate-300">No Assessment Records Found</h3>
          <p className="text-xs text-slate-500">
            Run a test from the Speed Test tab to build your historical diagnostic profile.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredHistory.map((item) => {
            const isWifi = item.networkInfo.networkType === 'wifi';
            const dl = item.rawMeasurements.downloadThroughput.mbps;
            const ul = item.rawMeasurements.uploadThroughput.mbps;
            const ping = item.rawMeasurements.idleLatency.medianMs;
            const bloatGrade = item.rawMeasurements.loadedLatency.bufferbloatGrade;

            return (
              <div
                key={item.id}
                onClick={() => onInspectReport(item)}
                className="p-3.5 sm:p-4 rounded-2xl bg-[#0E1A2E] border border-white/10 hover:border-cyan-500/40 transition-all flex items-center justify-between shadow-md cursor-pointer group"
              >
                <div className="flex items-center space-x-3.5">
                  <div className="w-10 h-10 rounded-xl bg-slate-900 border border-white/5 flex items-center justify-center text-cyan-400 shrink-0">
                    {isWifi ? <Wifi className="w-5 h-5" /> : <Radio className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-white">
                        {new Date(item.timestamp).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                        })}{' '}
                        • {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-cyan-950 text-cyan-300 border border-cyan-800">
                        {item.overallRating}
                      </span>
                    </div>

                    {/* Compact Metric Readouts */}
                    <div className="flex items-center space-x-3 text-xs text-slate-400 mt-1 font-mono">
                      <span>Down: <strong className="text-slate-200 tabular-nums">{dl !== null ? `${dl.toFixed(1)} Mbps` : '--'}</strong></span>
                      <span>•</span>
                      <span>Up: <strong className="text-slate-200 tabular-nums">{ul !== null ? `${ul.toFixed(1)} Mbps` : '--'}</strong></span>
                      <span>•</span>
                      <span>Ping: <strong className="text-slate-200 tabular-nums">{ping !== null ? `${ping}ms` : '--'}</strong></span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2.5">
                  {bloatGrade && bloatGrade !== 'unknown' && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/80 border border-amber-800 text-amber-300 font-bold hidden sm:inline">
                      Grade {bloatGrade}
                    </span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadPdfReport(item);
                    }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-slate-800 transition-colors"
                    title="Export PDF Report"
                  >
                    <FileText className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteReport(item.id);
                    }}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition-colors" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
