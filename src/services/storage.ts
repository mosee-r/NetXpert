/**
 * SpeedXpat — Local History & Report Export Service
 * Compliant with SPEEDXPAT_SPEC.md Section 5.13 & Section 12
 *
 * Stores test runs locally with zero cloud dependencies, supports comparison,
 * and generates clean JSON and CSV exports.
 */

import { OverallAssessmentReport } from '../types/scoring';
import { getAndroidNativeBridge } from '../engines/testEndpoints';

const STORAGE_KEY = 'speedxpat_assessment_history_v1';
const LEGACY_STORAGE_KEY = 'netxpert_assessment_history_v1';

export function saveAssessmentReport(report: OverallAssessmentReport): boolean {
  try {
    const existing = getAssessmentHistory();
    // Keep up to 50 most recent runs
    const updated = [report, ...existing.filter((r) => r.id !== report.id)].slice(0, 50);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return true;
  } catch (err) {
    console.error('Failed to save assessment locally:', err);
    return false;
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
 * Trigger file download in browser
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const androidNative = getAndroidNativeBridge();
  if (androidNative) {
    if (!androidNative.saveFile(filename, mimeType, content, false)) {
      throw new Error('Android could not start the report export.');
    }
    return;
  }

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
