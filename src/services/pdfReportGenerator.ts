/**
 * NetXpert — Professional PDF Report Generator
 * Compliant with NETXPERT_SPEC.md Section 5.13 using jsPDF
 * Includes comprehensive ISP details, performance metrics, and activity suitability scores.
 */

import { jsPDF } from 'jspdf';
import { OverallAssessmentReport } from '../types/scoring';

export function generatePdfReport(report: OverallAssessmentReport): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  let y = 14;

  // --- 1. Top Header Banner ---
  doc.setFillColor(7, 15, 30); // Deep Obsidian-Navy #070F1E
  doc.rect(margin, y, contentWidth, 24, 'F');

  // Title
  doc.setTextColor(39, 215, 242); // Cyan #27D7F2
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('NetXpert Network Diagnostic Report', margin + 6, y + 9);

  // Subtitle / Date
  doc.setTextColor(142, 158, 175); // Slate #8E9EAF
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const formattedDate = new Date(report.timestamp).toLocaleString();
  doc.text(`Generated: ${formattedDate}  |  Report ID: ${report.id.substring(0, 18)}`, margin + 6, y + 17);

  // Engine Pill on top right
  doc.setFillColor(21, 37, 61);
  doc.roundedRect(pageWidth - margin - 38, y + 6, 32, 7, 2, 2, 'F');
  doc.setTextColor(39, 215, 242);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(report.scoringVersion, pageWidth - margin - 22, y + 10.5, { align: 'center' });

  y += 28;

  // --- 2. Executive Summary & Verdict Box ---
  const verdict = report.overallRating.toUpperCase();
  let verdictColor: [number, number, number] = [0, 230, 118]; // green
  if (verdict === 'GOOD') verdictColor = [39, 215, 242]; // cyan
  else if (verdict === 'FAIR') verdictColor = [255, 179, 0]; // amber
  else if (verdict === 'POOR') verdictColor = [255, 82, 82]; // red

  doc.setFillColor(14, 26, 46); // Surface #0E1A2E
  doc.setDrawColor(255, 255, 255);
  doc.setDrawColor(30, 45, 68);
  doc.roundedRect(margin, y, contentWidth, 24, 3, 3, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(142, 158, 175);
  doc.text('OVERALL CONNECTION VERDICT:', margin + 6, y + 7);

  // Verdict badge
  doc.setFillColor(verdictColor[0], verdictColor[1], verdictColor[2]);
  doc.roundedRect(margin + 68, y + 3, 28, 6, 1.5, 1.5, 'F');
  doc.setTextColor(7, 15, 30);
  doc.setFontSize(8.5);
  doc.text(verdict, margin + 82, y + 7, { align: 'center' });

  // Headline text
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(244, 248, 252);
  const splitHeadline = doc.splitTextToSize(report.headlineSummary, contentWidth - 12);
  doc.text(splitHeadline, margin + 6, y + 14);

  y += 28;

  // --- 3. ISP & Connection Profile ---
  doc.setFillColor(21, 37, 61); // Elevated Surface
  doc.roundedRect(margin, y, contentWidth, 24, 3, 3, 'F');

  doc.setTextColor(39, 215, 242);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('ISP & Network Provider Information', margin + 6, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(142, 158, 175);

  const netInfo = report.networkInfo;
  const colW = contentWidth / 3;

  // Column 1: ISP & Org
  doc.text('Internet Service Provider (ISP):', margin + 6, y + 12);
  doc.setTextColor(244, 248, 252);
  doc.setFont('helvetica', 'bold');
  doc.text(netInfo.ispName || netInfo.asnOrg || 'Google Cloud / Local ISP', margin + 6, y + 17);

  // Column 2: IP & Geo Location
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(142, 158, 175);
  doc.text('Public IP & Geography:', margin + colW + 4, y + 12);
  doc.setTextColor(244, 248, 252);
  doc.setFont('helvetica', 'bold');
  const locStr = [netInfo.locationCity, netInfo.locationCountry].filter(Boolean).join(', ') || 'Auto-Detected Region';
  doc.text(`${netInfo.ipAddress || 'Not Recorded'} (${locStr})`, margin + colW + 4, y + 17);

  // Column 3: Interface & Link
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(142, 158, 175);
  doc.text('Active Link Interface:', margin + colW * 2 + 2, y + 12);
  doc.setTextColor(244, 248, 252);
  doc.setFont('helvetica', 'bold');
  doc.text(`${(netInfo.networkType || 'Wi-Fi').toUpperCase()} (Status: ${netInfo.online ? 'Online' : 'Offline'})`, margin + colW * 2 + 2, y + 17);

  y += 28;

  // --- 4. Performance Telemetry Matrix ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(39, 215, 242);
  doc.text('Measured Performance Metrics', margin, y);
  y += 4;

  const raw = report.rawMeasurements;
  const metricsData = [
    {
      label: 'Download Speed',
      val: raw.downloadThroughput.mbps !== null ? `${raw.downloadThroughput.mbps.toFixed(1)} Mbps` : '--',
      detail: `Transferred: ${((raw.downloadThroughput.bytesTransferred || 0) / (1024 * 1024)).toFixed(1)} MB`,
      method: raw.downloadThroughput.method,
    },
    {
      label: 'Upload Speed',
      val: raw.uploadThroughput.mbps !== null ? `${raw.uploadThroughput.mbps.toFixed(1)} Mbps` : '--',
      detail: `Transferred: ${((raw.uploadThroughput.bytesTransferred || 0) / (1024 * 1024)).toFixed(1)} MB`,
      method: raw.uploadThroughput.method,
    },
    {
      label: 'Idle Ping (RTT)',
      val: raw.idleLatency.medianMs !== null ? `${raw.idleLatency.medianMs} ms` : '--',
      detail: `Min: ${raw.idleLatency.minMs ?? '-'}ms  Max: ${raw.idleLatency.maxMs ?? '-'}ms`,
      method: raw.idleLatency.method,
    },
    {
      label: 'Bufferbloat (Load)',
      val: raw.loadedLatency.loadedDeltaMs !== null ? `+${raw.loadedLatency.loadedDeltaMs} ms` : '--',
      detail: `Grade: ${raw.loadedLatency.bufferbloatGrade || 'N/A'} (Under Load)`,
      method: 'Concurrent Load Stream',
    },
    {
      label: 'Jitter (Variance)',
      val: raw.idleLatency.jitterMs !== null ? `${raw.idleLatency.jitterMs} ms` : '--',
      detail: 'RFC 3550 Mean Deviation',
      method: 'Interarrival Delta',
    },
    {
      label: 'DNS Resolution',
      val: raw.dnsTiming.durationMs !== null ? `${raw.dnsTiming.durationMs} ms` : '--',
      detail: raw.dnsTiming.targetDomain || 'cloudflare.com',
      method: raw.dnsTiming.method,
    },
  ];

  // Draw 2x3 Metric Grid
  const cardW = (contentWidth - 8) / 3;
  const cardH = 20;

  metricsData.forEach((m, idx) => {
    const col = idx % 3;
    const row = Math.floor(idx / 3);
    const cx = margin + col * (cardW + 4);
    const cy = y + row * (cardH + 3);

    doc.setFillColor(14, 26, 46);
    doc.setDrawColor(30, 45, 68);
    doc.roundedRect(cx, cy, cardW, cardH, 2, 2, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(142, 158, 175);
    doc.text(m.label.toUpperCase(), cx + 4, cy + 5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(244, 248, 252);
    doc.text(m.val, cx + 4, cy + 11.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(142, 158, 175);
    doc.text(m.detail, cx + 4, cy + 16.5);
  });

  y += cardH * 2 + 10;

  // --- 5. Activity Capability & Workload Suitability Scores ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(39, 215, 242);
  doc.text('Workload & Activity Suitability Analysis', margin, y);
  y += 4;

  // Table Header
  doc.setFillColor(21, 37, 61);
  doc.rect(margin, y, contentWidth, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(142, 158, 175);
  doc.text('ACTIVITY / WORKLOAD', margin + 4, y + 4.5);
  doc.text('SUITABILITY', margin + 50, y + 4.5);
  doc.text('CONFIDENCE', margin + 74, y + 4.5);
  doc.text('PRIMARY BOTTLENECK / EVALUATION EVIDENCE', margin + 102, y + 4.5);

  y += 7;

  // Activity Rows
  report.activities.forEach((act, idx) => {
    const rowH = 12;
    const isEven = idx % 2 === 0;
    doc.setFillColor(isEven ? 14 : 9, isEven ? 26 : 19, isEven ? 46 : 38);
    doc.rect(margin, y, contentWidth, rowH, 'F');

    // Activity Name
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(244, 248, 252);
    doc.text(act.displayName, margin + 4, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(142, 158, 175);
    doc.text(act.category, margin + 4, y + 9);

    // Rating
    const rUpper = act.rating.toUpperCase();
    if (rUpper === 'EXCELLENT' || rUpper === 'GREAT') doc.setTextColor(0, 230, 118);
    else if (rUpper === 'GOOD') doc.setTextColor(39, 215, 242);
    else if (rUpper === 'FAIR') doc.setTextColor(255, 179, 0);
    else doc.setTextColor(255, 82, 82);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(rUpper, margin + 50, y + 7);

    // Confidence
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(142, 158, 175);
    doc.text(`${act.confidence.toUpperCase()}`, margin + 74, y + 7);

    // Bottleneck / Summary text
    const bottleneckText = act.bottlenecks.length > 0 ? `Bottleneck: ${act.bottlenecks[0]}` : act.summary;
    const splitText = doc.splitTextToSize(bottleneckText, contentWidth - 106);
    doc.setTextColor(200, 214, 229);
    doc.setFontSize(6.8);
    doc.text(splitText, margin + 102, y + 4.5);

    y += rowH;
  });

  y += 5;

  // --- 6. Footer & Methodology Disclaimer ---
  const footerY = pageHeight - 12;
  doc.setDrawColor(30, 45, 68);
  doc.line(margin, footerY - 3, pageWidth - margin, footerY - 3);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(142, 158, 175);
  doc.text(
    'NetXpert Network Diagnostics Engine • Research-grade open measurement via Measurement Lab ndt7 and local diagnostic probes. Data stored strictly on local device.',
    margin,
    footerY
  );
  doc.text(
    `Page 1 of 1  |  ${report.id}`,
    pageWidth - margin,
    footerY,
    { align: 'right' }
  );

  return doc;
}

/**
 * Trigger browser download of PDF report
 */
export function downloadPdfReport(report: OverallAssessmentReport): void {
  const doc = generatePdfReport(report);
  const cleanId = report.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`NetXpert-Report-${cleanId}.pdf`);
}
