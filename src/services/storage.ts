/**
 * SpeedXpat — Local History & Report Export Service
 * Compliant with SPEEDXPAT_SPEC.md Section 5.13 & Section 12
 *
 * Stores test runs locally with zero cloud dependencies, supports comparison,
 * and generates clean JSON and CSV exports.
 */

import { OverallAssessmentReport } from '../types/scoring';

const STORAGE_KEY = 'speedxpat_assessment_history_v1';
const LEGACY_STORAGE_KEY = 'netxpert_assessment_history_v1';

export function saveAssessmentReport(report: OverallAssessmentReport): void {
  try {
    const existing = getAssessmentHistory();
    // Keep up to 50 most recent runs
    const updated = [report, ...existing.filter((r) => r.id !== report.id)].slice(0, 50);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to save assessment locally:', err);
  }
}

export function getAssessmentHistory(): OverallAssessmentReport[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    if (!localStorage.getItem(STORAGE_KEY)) {
      localStorage.setItem(STORAGE_KEY, raw);
    }
    return JSON.parse(raw) as OverallAssessmentReport[];
  } catch {
    return [];
  }
}

export function getAssessmentById(id: string): OverallAssessmentReport | undefined {
  const history = getAssessmentHistory();
  return history.find((h) => h.id === id);
}

export function deleteAssessment(id: string): void {
  try {
    const history = getAssessmentHistory();
    const filtered = history.filter((h) => h.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.error('Failed to delete assessment:', err);
  }
}

export function clearAllHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch (err) {
    console.error('Failed to clear history:', err);
  }
}

export { downloadPdfReport } from './pdfReportGenerator';

/**
 * Generate CSV representation of an assessment report
 */
export function exportReportToCsv(report: OverallAssessmentReport): string {
  const rows: string[][] = [
    ['SpeedXpat Network Diagnostic Report'],
    ['Report ID', report.id],
    ['Timestamp', report.timestamp],
    ['App Version', report.appVersion],
    ['Scoring Rules Version', report.scoringVersion],
    ['Overall Verdict', report.overallRating.toUpperCase()],
    ['Headline Summary', `"${report.headlineSummary.replace(/"/g, '""')}"`],
    ['Connection Type', report.networkInfo.networkType],
    ['ISP Provider', report.networkInfo.ispName || report.networkInfo.asnOrg || 'N/A'],
    ['Geography', `${report.networkInfo.locationCity || ''}, ${report.networkInfo.locationCountry || ''}`],
    ['Effective Transport', report.networkInfo.effectiveType || 'N/A'],
    ['Public IP', report.networkInfo.ipAddress || 'Not recorded'],
    [],
    ['Raw Performance Measurements'],
    ['Metric', 'Measured Value', 'Unit', 'Method', 'Status'],
    [
      'Idle Latency (Median)',
      String(report.rawMeasurements.idleLatency.medianMs ?? 'N/A'),
      'ms',
      report.rawMeasurements.idleLatency.method,
      report.rawMeasurements.idleLatency.status,
    ],
    [
      'Idle Latency (Min)',
      String(report.rawMeasurements.idleLatency.minMs ?? 'N/A'),
      'ms',
      report.rawMeasurements.idleLatency.method,
      report.rawMeasurements.idleLatency.status,
    ],
    [
      'Idle Latency (Max)',
      String(report.rawMeasurements.idleLatency.maxMs ?? 'N/A'),
      'ms',
      report.rawMeasurements.idleLatency.method,
      report.rawMeasurements.idleLatency.status,
    ],
    [
      'Jitter',
      String(report.rawMeasurements.idleLatency.jitterMs ?? 'N/A'),
      'ms',
      'RFC 3550 Interarrival Deviation',
      report.rawMeasurements.idleLatency.status,
    ],
    [
      'Download Throughput',
      String(report.rawMeasurements.downloadThroughput.mbps ?? 'N/A'),
      'Mbps',
      report.rawMeasurements.downloadThroughput.method,
      report.rawMeasurements.downloadThroughput.status,
    ],
    [
      'Upload Throughput',
      String(report.rawMeasurements.uploadThroughput.mbps ?? 'N/A'),
      'Mbps',
      report.rawMeasurements.uploadThroughput.method,
      report.rawMeasurements.uploadThroughput.status,
    ],
    [
      'Latency Under Load (Bufferbloat Delta)',
      String(report.rawMeasurements.loadedLatency.loadedDeltaMs ?? 'N/A'),
      '+ms',
      'Concurrent HTTP Load Stream',
      report.rawMeasurements.loadedLatency.status,
    ],
    [
      'Bufferbloat Grade',
      report.rawMeasurements.loadedLatency.bufferbloatGrade,
      'Grade',
      'Bufferbloat Severity Rating',
      report.rawMeasurements.loadedLatency.status,
    ],
    [
      'DNS Resolution Time',
      String(report.rawMeasurements.dnsTiming.durationMs ?? 'N/A'),
      'ms',
      report.rawMeasurements.dnsTiming.method,
      report.rawMeasurements.dnsTiming.status,
    ],
    [],
    ['Activity Capability Assessment Breakdown'],
    ['Activity', 'Rating', 'Confidence', 'Summary', 'Primary Bottlenecks'],
  ];

  for (const act of report.activities) {
    rows.push([
      act.displayName,
      act.rating.toUpperCase(),
      act.confidence.toUpperCase(),
      `"${act.summary.replace(/"/g, '""')}"`,
      `"${act.bottlenecks.join('; ').replace(/"/g, '""')}"`,
    ]);
  }

  return rows.map((r) => r.join(',')).join('\n');
}

/**
 * Trigger file download in browser
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
