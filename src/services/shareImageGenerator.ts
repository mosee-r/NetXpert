import { getAndroidNativeBridge } from '../engines/testEndpoints';
import { ActivityRating } from '../types/scoring';

export interface CompletedTestSnapshot {
  testedAt: string;
  networkType: string;
  downloadMbps: number | null;
  uploadMbps: number | null;
  idleLatencyMs: number | null;
  jitterMs: number | null;
  overallRating: ActivityRating;
  downloadSamples: { timestamp: number; instantMbps: number }[];
}

const WIDTH = 1080;
const HEIGHT = 1350;
const COLORS = {
  background: '#0B0F17',
  surface: '#111925',
  raised: '#161F2D',
  grid: '#263140',
  divider: '#303A48',
  primary: '#F9FAFB',
  muted: '#9CA3AF',
  subdued: '#718096',
  accent: '#3B82F6',
  excellent: '#34D399',
  good: '#60A5FA',
  fair: '#FBBF24',
  poor: '#F87171',
};

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  fontSize: number,
  weight: number,
  family: string
): void {
  let size = fontSize;
  ctx.font = `${weight} ${size}px ${family}`;
  while (ctx.measureText(text).width > maxWidth && size > 20) {
    size -= 2;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  ctx.fillText(text, x, y, maxWidth);
}

function formatMetric(value: number | null, digits: number, unit: string): string {
  return value === null || !Number.isFinite(value)
    ? 'Not measured'
    : `${value.toFixed(digits)} ${unit}`;
}

function connectionLabel(networkType: string): string {
  switch (networkType.toLowerCase()) {
    case 'wifi': return 'WI-FI';
    case 'cellular': return 'CELLULAR';
    case 'ethernet': return 'ETHERNET';
    default: return 'NETWORK';
  }
}

function qualityInfo(rating: ActivityRating): { grade: string; label: string; color: string } {
  switch (rating) {
    case 'excellent': return { grade: 'A', label: 'Excellent', color: COLORS.excellent };
    case 'good': return { grade: 'B', label: 'Good', color: COLORS.good };
    case 'fair': return { grade: 'C', label: 'Fair', color: COLORS.fair };
    case 'poor': return { grade: 'D', label: 'Poor', color: COLORS.poor };
    default: return { grade: '—', label: 'Not rated', color: COLORS.muted };
  }
}

function loadBrandMark(): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = '/speedxpat-logo.png';
  });
}

function drawThroughputChart(
  ctx: CanvasRenderingContext2D,
  samples: CompletedTestSnapshot['downloadSamples'],
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const left = x + 34;
  const right = x + width - 8;
  const top = y + 8;
  const bottom = y + height - 26;
  ctx.lineWidth = 1;
  ctx.strokeStyle = COLORS.grid;
  for (let line = 0; line < 4; line++) {
    const gridY = top + ((bottom - top) * line) / 3;
    ctx.beginPath();
    ctx.moveTo(left, gridY);
    ctx.lineTo(right, gridY);
    ctx.stroke();
  }

  const validSamples = samples.filter(
    (sample) => Number.isFinite(sample.timestamp) && Number.isFinite(sample.instantMbps) && sample.instantMbps >= 0
  );
  if (validSamples.length < 2) {
    ctx.fillStyle = COLORS.subdued;
    ctx.font = '400 20px sans-serif';
    ctx.fillText('Throughput samples unavailable', left, top + (bottom - top) / 2);
    return;
  }

  const firstTimestamp = validSamples[0].timestamp;
  const lastTimestamp = validSamples[validSamples.length - 1].timestamp;
  const elapsedRange = lastTimestamp - firstTimestamp;
  const maxMbps = Math.max(1, ...validSamples.map((sample) => sample.instantMbps));
  const points = validSamples.map((sample, index) => {
    const elapsedRatio = elapsedRange > 0
      ? (sample.timestamp - firstTimestamp) / elapsedRange
      : index / (validSamples.length - 1);
    return {
      x: left + elapsedRatio * (right - left),
      y: bottom - (sample.instantMbps / maxMbps) * (bottom - top),
    };
  });

  ctx.strokeStyle = COLORS.accent;
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index++) {
    ctx.lineTo(points[index].x, points[index].y);
  }
  ctx.stroke();

  for (const point of [points[0], points[points.length - 1]]) {
    ctx.fillStyle = COLORS.background;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  ctx.fillStyle = COLORS.subdued;
  ctx.font = '400 16px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('0 ms', left, y + height - 2);
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.max(0, elapsedRange)} ms`, right, y + height - 2);
  ctx.textAlign = 'left';
  ctx.fillText(`${maxMbps.toFixed(1)} Mbps peak`, x + 2, top + 5);
  ctx.textAlign = 'left';
}

export async function generateShareSnapshot(metrics: CompletedTestSnapshot): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  const brandMark = await loadBrandMark();

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = COLORS.accent;
  ctx.fillRect(0, 0, 8, HEIGHT);

  ctx.fillStyle = COLORS.surface;
  ctx.fillRect(8, 0, WIDTH - 8, 180);
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  for (let x = 40; x < WIDTH; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 180);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(17, 25, 37, 0.88)';
  ctx.fillRect(8, 0, WIDTH - 8, 180);

  roundedRect(ctx, 68, 48, 78, 78, 14);
  ctx.fillStyle = COLORS.raised;
  ctx.fill();
  if (brandMark) {
    ctx.save();
    roundedRect(ctx, 68, 48, 78, 78, 14);
    ctx.clip();
    ctx.drawImage(brandMark, 68, 48, 78, 78);
    ctx.restore();
  }

  ctx.fillStyle = COLORS.primary;
  ctx.font = '700 27px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('SPEEDXPAT', 166, 80);
  ctx.fillStyle = COLORS.muted;
  ctx.font = '400 16px sans-serif';
  ctx.fillText('NETWORK PERFORMANCE REPORT', 166, 108);
  ctx.textAlign = 'right';
  ctx.fillStyle = COLORS.subdued;
  ctx.font = '500 16px monospace';
  ctx.fillText('CONNECTION TEST', 1010, 66);
  ctx.fillStyle = COLORS.primary;
  ctx.font = '500 19px sans-serif';
  ctx.fillText(new Date(metrics.testedAt).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  }), 1010, 98);
  ctx.textAlign = 'left';

  roundedRect(ctx, 72, 204, 230, 42, 21);
  ctx.fillStyle = COLORS.raised;
  ctx.fill();
  ctx.fillStyle = COLORS.accent;
  ctx.beginPath();
  ctx.arc(96, 225, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.primary;
  ctx.font = '600 16px sans-serif';
  ctx.fillText(connectionLabel(metrics.networkType), 112, 231);
  ctx.fillStyle = COLORS.subdued;
  ctx.font = '400 15px monospace';
  ctx.fillText(new Date(metrics.testedAt).toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  }), 322, 231);

  roundedRect(ctx, 72, 274, 936, 384, 18);
  ctx.fillStyle = COLORS.surface;
  ctx.fill();
  ctx.fillStyle = COLORS.accent;
  ctx.fillRect(108, 274, 58, 4);
  ctx.fillStyle = COLORS.muted;
  ctx.font = '600 16px sans-serif';
  ctx.fillText('DOWNLOAD', 108, 320);
  ctx.fillStyle = COLORS.subdued;
  ctx.font = '400 14px monospace';
  ctx.fillText('MEASURED THROUGHPUT', 108, 347);

  const downloadText = metrics.downloadMbps === null || !Number.isFinite(metrics.downloadMbps)
    ? 'Not measured'
    : metrics.downloadMbps.toFixed(1);
  ctx.fillStyle = COLORS.primary;
  fitText(ctx, downloadText, 104, 443, 690, 126, 700, 'monospace');
  if (metrics.downloadMbps !== null && Number.isFinite(metrics.downloadMbps)) {
    ctx.font = '700 126px monospace';
    const numberWidth = Math.min(ctx.measureText(downloadText).width, 690);
    ctx.fillStyle = COLORS.accent;
    ctx.font = '600 30px sans-serif';
    ctx.fillText('Mbps', 110 + numberWidth, 441);
  }

  ctx.fillStyle = COLORS.subdued;
  ctx.font = '400 14px monospace';
  ctx.textAlign = 'right';
  ctx.fillText('LIVE SAMPLE TRACE', 968, 320);
  ctx.textAlign = 'left';
  drawThroughputChart(ctx, metrics.downloadSamples, 108, 483, 860, 140);

  ctx.fillStyle = COLORS.muted;
  ctx.font = '600 15px sans-serif';
  ctx.fillText('CONNECTION RESPONSE', 72, 710);
  ctx.fillStyle = COLORS.subdued;
  ctx.font = '400 14px monospace';
  ctx.textAlign = 'right';
  ctx.fillText('LATENCY  /  VARIATION', 1008, 710);
  ctx.textAlign = 'left';

  roundedRect(ctx, 72, 734, 936, 152, 14);
  ctx.fillStyle = COLORS.surface;
  ctx.fill();
  const responseMetrics = [
    { label: 'UPLOAD', value: formatMetric(metrics.uploadMbps, 1, 'Mbps') },
    { label: 'IDLE PING', value: formatMetric(metrics.idleLatencyMs, 0, 'ms') },
    { label: 'JITTER', value: formatMetric(metrics.jitterMs, 1, 'ms') },
  ];
  responseMetrics.forEach((metric, index) => {
    const columnX = 108 + index * 300;
    if (index > 0) {
      ctx.fillStyle = COLORS.divider;
      ctx.fillRect(columnX - 28, 768, 1, 86);
    }
    ctx.fillStyle = COLORS.subdued;
    ctx.font = '600 14px sans-serif';
    ctx.fillText(metric.label, columnX, 778);
    ctx.fillStyle = COLORS.primary;
    fitText(ctx, metric.value, columnX, 835, 258, 29, 600, 'monospace');
  });

  roundedRect(ctx, 72, 922, 936, 190, 14);
  ctx.fillStyle = COLORS.surface;
  ctx.fill();
  ctx.fillStyle = COLORS.subdued;
  ctx.font = '600 15px sans-serif';
  ctx.fillText('OVERALL QUALITY', 108, 964);
  const quality = qualityInfo(metrics.overallRating);
  roundedRect(ctx, 108, 986, 92, 92, 12);
  ctx.fillStyle = COLORS.raised;
  ctx.fill();
  ctx.strokeStyle = quality.color;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = quality.color;
  ctx.font = '700 48px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(quality.grade, 154, 1048);
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.primary;
  ctx.font = '600 34px sans-serif';
  ctx.fillText(quality.label, 232, 1022);
  ctx.fillStyle = COLORS.muted;
  ctx.font = '400 18px sans-serif';
  ctx.fillText('Based on this test’s measured connection performance', 232, 1060);
  ctx.fillStyle = quality.color;
  ctx.fillRect(232, 1080, 118, 3);

  ctx.fillStyle = COLORS.divider;
  ctx.fillRect(72, 1204, 936, 1);
  ctx.fillStyle = COLORS.primary;
  ctx.font = '600 18px sans-serif';
  ctx.fillText('Tested with SpeedXpat', 72, 1248);
  ctx.fillStyle = COLORS.subdued;
  ctx.font = '400 14px monospace';
  ctx.textAlign = 'right';
  ctx.fillText('SPEEDXPAT.APP', 1008, 1248);
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.subdued;
  ctx.font = '400 13px sans-serif';
  ctx.fillText('Private by design · No IP address or device identifiers included', 72, 1282);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('PNG image encoding failed.'));
    }, 'image/png');
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = String(reader.result || '').split(',', 2)[1];
      if (base64) resolve(base64);
      else reject(new Error('PNG data could not be encoded for Android.'));
    };
    reader.onerror = () => reject(new Error('PNG data could not be read.'));
    reader.readAsDataURL(blob);
  });
}

export async function shareOrDownloadSnapshot(metrics: CompletedTestSnapshot): Promise<void> {
  const blob = await generateShareSnapshot(metrics);
  const filename = 'SpeedXpat-Test-Results.png';
  const androidNative = getAndroidNativeBridge();
  if (androidNative) {
    const content = await blobToBase64(blob);
    const shared = androidNative.shareFile
      ? androidNative.shareFile(filename, 'image/png', content, true)
      : androidNative.saveFile(filename, 'image/png', content, true);
    if (!shared) throw new Error('Android could not start the PNG export.');
    return;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}