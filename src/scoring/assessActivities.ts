/**
 * SpeedXpat — Activity Capability Assessment Engine
 * Compliant with SPEEDXPAT_SPEC.md Section 5.6, 5.7, 5.8, 5.9
 *
 * Deterministic scoring engine with requirement gates.
 * Never treats missing measurements as passing.
 */

import { THRESHOLDS, SCORING_RULE_VERSION } from '../config/thresholds';
import {
  LatencySummary,
  ThroughputSummary,
  LoadedLatencySummary,
  DnsTimingResult,
  DeviceNetworkInfo,
  PacketLossSummary,
} from '../types/network';
import {
  ActivityAssessment,
  ActivityRating,
  ConfidenceLevel,
  RequirementCheck,
  CheckStatus,
  OverallAssessmentReport,
} from '../types/scoring';

interface AssessmentInputs {
  latency: LatencySummary;
  download: ThroughputSummary[]; // Multi-size results
  upload: ThroughputSummary[]; // Multi-size results
  loadedLatency: LoadedLatencySummary;
  dns: DnsTimingResult;
  networkInfo: DeviceNetworkInfo;
  packetLoss?: PacketLossSummary;
  latencyDuringUpload?: LoadedLatencySummary; // Upload latency returns LoadedLatencySummary
}

/**
 * Helper to get primary throughput result from array (uses last/largest for backward compatibility)
 */
function getPrimaryThroughput(results: ThroughputSummary[]): ThroughputSummary | null {
  if (!results || results.length === 0) return null;
  return results[results.length - 1] || results[0];
}

/**
 * Helper to get average throughput from array
 */
function getAverageThroughput(results: ThroughputSummary[]): number | null {
  if (!results || results.length === 0) return null;
  const validResults = results.filter((r) => r.mbps !== null);
  if (validResults.length === 0) return null;
  const sum = validResults.reduce((acc, r) => acc + (r.mbps || 0), 0);
  return sum / validResults.length;
}

/**
 * 1. Online Gaming Assessment
 */
function assessGaming(inputs: AssessmentInputs): ActivityAssessment {
  const { latency, loadedLatency, packetLoss, latencyDuringUpload } = inputs;
  const checks: RequirementCheck[] = [];
  const bottlenecks: string[] = [];
  const recommendations: string[] = [];
  const confidenceReasons: string[] = [];
  let confidence: ConfidenceLevel = 'high';

  // Check 0: Packet Loss (Critical for gaming)
  if (packetLoss && packetLoss.packetLossPercent !== null && packetLoss.status === 'success') {
    const lossPercent = packetLoss.packetLossPercent;
    let status: CheckStatus = 'fail';
    if (lossPercent < 0.1) {
      status = 'pass';
    } else if (lossPercent < 1) {
      status = 'borderline';
    }

    checks.push({
      metric: 'packet_loss',
      label: 'Packet Loss',
      status,
      measuredValue: lossPercent,
      unit: '%',
      thresholdDescription: '< 0.1% packet loss for stable gaming',
      explanation:
        status === 'pass'
          ? `Excellent packet delivery (${lossPercent}% loss). No dropped inputs or desyncs.`
          : status === 'borderline'
          ? `Minor packet loss (${lossPercent}%) may cause occasional missed hits or rubber-banding.`
          : `High packet loss (${lossPercent}%) will cause frequent desyncs, missed shots, and game disconnects.`,
    });

    if (status === 'fail') {
      bottlenecks.push(`High packet loss (${lossPercent}%)`);
      recommendations.push(
        'Check your connection stability. Packet loss above 1% severely impacts online gaming. Try a wired connection or contact your ISP.'
      );
    } else if (status === 'borderline') {
      recommendations.push(
        'Packet loss between 0.1-1% may cause occasional issues. Monitor during gameplay.'
      );
    }
  }

  // Check 1: Idle Latency
  if (latency.medianMs !== null && latency.status === 'success') {
    let status: CheckStatus = 'fail';
    if (latency.medianMs <= THRESHOLDS.gaming.latency.excellentMaxMs) {
      status = 'pass';
    } else if (latency.medianMs <= THRESHOLDS.gaming.latency.goodMaxMs) {
      status = 'pass';
    } else if (latency.medianMs <= THRESHOLDS.gaming.latency.fairMaxMs) {
      status = 'borderline';
    }

    checks.push({
      metric: 'latency',
      label: 'Ping / Idle Latency',
      status,
      measuredValue: latency.medianMs,
      unit: 'ms',
      thresholdDescription: `< ${THRESHOLDS.gaming.latency.goodMaxMs} ms for competitive games`,
      explanation:
        status === 'pass'
          ? `Low latency (${latency.medianMs} ms) provides rapid input responsiveness.`
          : status === 'borderline'
          ? `Moderate latency (${latency.medianMs} ms); playable for casual games but may feel sluggish in fast-paced shooters.`
          : `High latency (${latency.medianMs} ms) causes noticeable delay and desync in online gaming.`,
    });

    if (status === 'fail') {
      bottlenecks.push(`High base latency (${latency.medianMs} ms)`);
      recommendations.push(
        'Switch to a wired connection or move closer to your Wi-Fi router to reduce round-trip delay.'
      );
    }
  } else {
    checks.push({
      metric: 'latency',
      label: 'Ping / Idle Latency',
      status: 'unknown',
      thresholdDescription: `< ${THRESHOLDS.gaming.latency.goodMaxMs} ms`,
      explanation: 'Latency could not be measured.',
    });
    confidence = 'low';
    confidenceReasons.push('Base latency measurement was unavailable.');
  }

  // Check 2: Jitter / Latency Variation
  if (latency.jitterMs !== null && latency.status === 'success') {
    let status: CheckStatus = 'fail';
    if (latency.jitterMs <= THRESHOLDS.gaming.jitter.goodMaxMs) {
      status = 'pass';
    } else if (latency.jitterMs <= THRESHOLDS.gaming.jitter.fairMaxMs) {
      status = 'borderline';
    }

    checks.push({
      metric: 'jitter',
      label: 'Jitter (Latency Variance)',
      status,
      measuredValue: latency.jitterMs,
      unit: 'ms',
      thresholdDescription: `< ${THRESHOLDS.gaming.jitter.goodMaxMs} ms`,
      explanation:
        status === 'pass'
          ? `Stable connection with low jitter (${latency.jitterMs} ms).`
          : status === 'borderline'
          ? `Noticeable jitter (${latency.jitterMs} ms) may cause occasional micro-stutters.`
          : `High jitter (${latency.jitterMs} ms) will cause erratic rubber-banding and inconsistent game timing.`,
    });

    if (status === 'fail') {
      bottlenecks.push(`Jitter spike (${latency.jitterMs} ms)`);
      recommendations.push(
        'Check for local wireless interference or background uploads causing packet queue jitter.'
      );
    }
  } else {
    checks.push({
      metric: 'jitter',
      label: 'Jitter (Latency Variance)',
      status: 'unknown',
      thresholdDescription: `< ${THRESHOLDS.gaming.jitter.goodMaxMs} ms`,
      explanation: 'Jitter could not be calculated due to missing samples.',
    });
    confidenceReasons.push('Jitter sample count insufficient.');
    if (confidence === 'high') confidence = 'medium';
  }

  // Check 3: Latency under load (Bufferbloat)
  if (
    loadedLatency.loadedDeltaMs !== null &&
    loadedLatency.status === 'success'
  ) {
    let status: CheckStatus = 'fail';
    if (
      loadedLatency.loadedDeltaMs <=
      THRESHOLDS.gaming.loadedLatencyDelta.excellentMaxDeltaMs
    ) {
      status = 'pass';
    } else if (
      loadedLatency.loadedDeltaMs <=
      THRESHOLDS.gaming.loadedLatencyDelta.goodMaxDeltaMs
    ) {
      status = 'pass';
    } else if (
      loadedLatency.loadedDeltaMs <=
      THRESHOLDS.gaming.loadedLatencyDelta.fairMaxDeltaMs
    ) {
      status = 'borderline';
    }

    checks.push({
      metric: 'loaded_latency',
      label: 'Latency Under Load (Bufferbloat)',
      status,
      measuredValue: loadedLatency.loadedDeltaMs,
      unit: '+ms',
      thresholdDescription: `< +${THRESHOLDS.gaming.loadedLatencyDelta.goodMaxDeltaMs} ms under load`,
      explanation:
        status === 'pass'
          ? `Minimal latency increase (+${loadedLatency.loadedDeltaMs} ms) during data activity.`
          : `Latency surges by +${loadedLatency.loadedDeltaMs} ms when someone downloads or uploads in the house.`,
    });

    if (status === 'fail' || status === 'borderline') {
      bottlenecks.push(
        `Bufferbloat (+${loadedLatency.loadedDeltaMs} ms latency spike under load)`
      );
      recommendations.push(
        'Enable SQM (Smart Queue Management) or QoS on your router to stop ping spikes during background household traffic.'
      );
    }
  } else {
    checks.push({
      metric: 'loaded_latency',
      label: 'Latency Under Load (Bufferbloat)',
      status: 'unknown',
      thresholdDescription: `< +${THRESHOLDS.gaming.loadedLatencyDelta.goodMaxDeltaMs} ms`,
      explanation: 'Loaded latency test was omitted or inconclusive.',
    });
    confidenceReasons.push('Loaded latency not assessed.');
    if (confidence === 'high') confidence = 'medium';
  }

  // Check 4: Latency During Upload
  if (latencyDuringUpload && latencyDuringUpload.underLoadLatencyMs !== null && latencyDuringUpload.status === 'success') {
    const uploadLatencyMs = latencyDuringUpload.underLoadLatencyMs;
    let status: CheckStatus = 'fail';
    if (uploadLatencyMs <= THRESHOLDS.gaming.latency.excellentMaxMs) {
      status = 'pass';
    } else if (uploadLatencyMs <= THRESHOLDS.gaming.latency.goodMaxMs) {
      status = 'pass';
    } else if (uploadLatencyMs <= THRESHOLDS.gaming.latency.fairMaxMs) {
      status = 'borderline';
    }

    checks.push({
      metric: 'upload_latency',
      label: 'Latency During Upload',
      status,
      measuredValue: uploadLatencyMs,
      unit: 'ms',
      thresholdDescription: `< ${THRESHOLDS.gaming.latency.goodMaxMs} ms during upload`,
      explanation:
        status === 'pass'
          ? `Low latency (${uploadLatencyMs} ms) maintained during upload. Gaming unaffected by uploads.`
          : status === 'borderline'
          ? `Moderate latency (${uploadLatencyMs} ms) during upload; may cause minor stutter.`
          : `High latency (${uploadLatencyMs} ms) during upload will cause noticeable lag spikes.`,
    });

    if (status === 'fail') {
      bottlenecks.push(`High latency during upload (${uploadLatencyMs} ms)`);
    }
  }

  // Evaluate Rating using strict requirement gates
  let rating: ActivityRating = 'excellent';
  const hasFail = checks.some((c) => c.status === 'fail');
  const hasBorderline = checks.some((c) => c.status === 'borderline');
  const hasUnknown = checks.some((c) => c.status === 'unknown');

  if (hasFail) {
    rating = 'poor';
  } else if (hasBorderline) {
    rating = 'fair';
  } else if (hasUnknown) {
    rating = 'good';
  }

  if (checks.every((c) => c.status === 'unknown')) {
    rating = 'insufficient_data';
  }

  const summary =
    rating === 'excellent'
      ? 'Optimal responsiveness for fast-paced competitive and action games with minimal jitter.'
      : rating === 'good'
      ? 'Good connection for multiplayer gaming with acceptable latency under normal conditions.'
      : rating === 'fair'
      ? 'Playable for turn-based and casual games, but you may experience latency spikes or delay during intense gameplay.'
      : rating === 'poor'
      ? 'High ping, erratic jitter, or router bufferbloat will likely cause noticeable lag, delayed actions, or rubber-banding.'
      : 'Insufficient network metrics to evaluate gaming performance reliably.';

  return {
    activityId: 'gaming',
    displayName: 'Online Gaming',
    category: 'Real-time Interactive',
    rating,
    summary,
    explanationCodes: ['GAMING_LATENCY', 'GAMING_JITTER', 'GAMING_BUFFERBLOAT'],
    checks,
    bottlenecks,
    recommendations:
      recommendations.length > 0
        ? recommendations
        : ['Your network shows stable low latency ideal for gaming.'],
    confidence,
    confidenceReasons,
    scoringVersion: SCORING_RULE_VERSION,
  };
}

/**
 * 2. Movies & Video Streaming Assessment
 */
function assessStreaming(inputs: AssessmentInputs): ActivityAssessment {
  const { download, latency } = inputs;
  const primaryDownload = getPrimaryThroughput(download);
  const avgDownload = getAverageThroughput(download);
  const checks: RequirementCheck[] = [];
  const bottlenecks: string[] = [];
  const recommendations: string[] = [];
  const confidenceReasons: string[] = [];
  let confidence: ConfidenceLevel = 'high';

  const effectiveMbps = primaryDownload?.mbps ?? avgDownload;
  
  if (primaryDownload && primaryDownload.mbps !== null && primaryDownload.status === 'success') {
    const mbps = primaryDownload.mbps;

    // Check 1: 1080p HD Streaming
    const hdStatus: CheckStatus =
      mbps >= THRESHOLDS.streaming.hd1080pMinMbps
        ? 'pass'
        : mbps >= THRESHOLDS.streaming.sdMinMbps
        ? 'borderline'
        : 'fail';

    checks.push({
      metric: 'hd_streaming',
      label: 'HD (1080p) Streaming Capability',
      status: hdStatus,
      measuredValue: mbps,
      unit: 'Mbps',
      thresholdDescription: `>= ${THRESHOLDS.streaming.hd1080pMinMbps} Mbps`,
      explanation:
        hdStatus === 'pass'
          ? `Measured ${mbps.toFixed(1)} Mbps is well above the 10 Mbps recommended for smooth HD streaming.`
          : `Measured ${mbps.toFixed(1)} Mbps may struggle with 1080p without buffering.`,
    });

    // Check 2: 4K Ultra HD Streaming
    const uhdStatus: CheckStatus =
      mbps >= THRESHOLDS.streaming.ultraHd4kMinMbps
        ? 'pass'
        : mbps >= THRESHOLDS.streaming.hd1080pMinMbps
        ? 'borderline'
        : 'fail';

    // Include multi-size info if available
    const sizeInfo = download.length > 1 ? ` (100KB: ${download[0]?.mbps?.toFixed(1) || 'N/A'} Mbps, 1MB: ${download[1]?.mbps?.toFixed(1) || 'N/A'} Mbps, 10MB: ${download[2]?.mbps?.toFixed(1) || 'N/A'} Mbps)` : '';

    checks.push({
      metric: '4k_streaming',
      label: '4K Ultra HD Streaming Capability',
      status: uhdStatus,
      measuredValue: mbps,
      unit: 'Mbps',
      thresholdDescription: `>= ${THRESHOLDS.streaming.ultraHd4kMinMbps} Mbps`,
      explanation:
        uhdStatus === 'pass'
          ? `Bandwidth of ${mbps.toFixed(1)} Mbps provides reliable headroom for high-bitrate 4K HDR streams.${sizeInfo}`
          : uhdStatus === 'borderline'
          ? `Bandwidth is sufficient for HD, but 4K streams may experience initial buffering or quality drops if other devices are active.${sizeInfo}`
          : `Bandwidth (${mbps.toFixed(1)} Mbps) is below the 25 Mbps threshold for 4K streaming.${sizeInfo}`,
    });

    if (hdStatus === 'fail') {
      bottlenecks.push(`Low download throughput (${mbps.toFixed(1)} Mbps)`);
      recommendations.push(
        'Check if other background downloads or video streams are saturating your bandwidth.'
      );
    } else if (uhdStatus === 'fail') {
      recommendations.push(
        'For 4K HDR streaming without buffering, ensure your plan delivers at least 25-30 Mbps sustained throughput.'
      );
    }
  } else {
    checks.push({
      metric: 'streaming_throughput',
      label: 'Download Throughput',
      status: 'unknown',
      thresholdDescription: `>= ${THRESHOLDS.streaming.hd1080pMinMbps} Mbps`,
      explanation: 'Download speed measurement was not completed.',
    });
    confidence = 'low';
    confidenceReasons.push('Download throughput measurement was unavailable.');
  }

  // Check 3: Latency & Jitter Stability
  if (latency.jitterMs !== null) {
    const jitterStatus: CheckStatus =
      latency.jitterMs <= THRESHOLDS.streaming.jitterMaxMs ? 'pass' : 'fair' as unknown as CheckStatus;
    checks.push({
      metric: 'jitter_stability',
      label: 'Stream Delivery Stability',
      status: jitterStatus === 'pass' ? 'pass' : 'borderline',
      measuredValue: latency.jitterMs,
      unit: 'ms',
      thresholdDescription: `< ${THRESHOLDS.streaming.jitterMaxMs} ms jitter`,
      explanation: 'Video players buffer ahead, tolerating minor network jitter gracefully.',
    });
  }

  let rating: ActivityRating = 'excellent';
  const mbps = effectiveMbps || 0;
  if (primaryDownload?.status !== 'success' && !avgDownload) {
    rating = 'insufficient_data';
  } else if (mbps >= THRESHOLDS.streaming.ultraHd4kMinMbps) {
    rating = 'excellent';
  } else if (mbps >= THRESHOLDS.streaming.hd1080pMinMbps) {
    rating = 'good';
  } else if (mbps >= THRESHOLDS.streaming.sdMinMbps) {
    rating = 'fair';
  } else {
    rating = 'poor';
  }

  const summary =
    rating === 'excellent'
      ? `Likely capable of seamless 4K Ultra HD streaming with ample headroom for multiple household screens.`
      : rating === 'good'
      ? `Likely suitable for smooth 1080p HD streaming; 4K may work but concurrent household traffic could trigger buffering.`
      : rating === 'fair'
      ? `Suitable for Standard Definition (SD) video. HD video may occasionally pause to buffer.`
      : rating === 'poor'
      ? `Download throughput is insufficient for reliable video playback; frequent buffering expected.`
      : 'Incomplete throughput data to assess streaming capability.';

  return {
    activityId: 'streaming',
    displayName: 'Movies & Video Streaming',
    category: 'High-Bandwidth Media',
    rating,
    summary,
    explanationCodes: ['STREAMING_HD', 'STREAMING_4K'],
    checks,
    bottlenecks,
    recommendations:
      recommendations.length > 0
        ? recommendations
        : ['Sufficient bandwidth for multi-stream video entertainment.'],
    confidence,
    confidenceReasons,
    scoringVersion: SCORING_RULE_VERSION,
  };
}

/**
 * 3. Video Conferencing (Zoom, Teams, Meet)
 */
function assessConferencing(inputs: AssessmentInputs): ActivityAssessment {
  const { download, upload, latency, loadedLatency } = inputs;
  const primaryDownload = getPrimaryThroughput(download);
  const primaryUpload = getPrimaryThroughput(upload);
  const checks: RequirementCheck[] = [];
  const bottlenecks: string[] = [];
  const recommendations: string[] = [];
  const confidenceReasons: string[] = [];
  let confidence: ConfidenceLevel = 'high';

  // Check 1: Download Throughput
  if (primaryDownload && primaryDownload.mbps !== null && primaryDownload.status === 'success') {
    const pass = primaryDownload.mbps >= THRESHOLDS.conferencing.downloadMinMbps;
    checks.push({
      metric: 'download_capacity',
      label: 'Download Capacity (Receive Video)',
      status: pass ? 'pass' : 'fail',
      measuredValue: primaryDownload.mbps,
      unit: 'Mbps',
      thresholdDescription: `>= ${THRESHOLDS.conferencing.downloadMinMbps} Mbps`,
      explanation: pass
        ? `Comfortable download speed (${primaryDownload.mbps.toFixed(1)} Mbps) for incoming participant video.`
        : `Download throughput (${primaryDownload.mbps.toFixed(1)} Mbps) may degrade incoming video clarity.`,
    });
    if (!pass) bottlenecks.push('Low download bandwidth for conference video');
  } else {
    checks.push({
      metric: 'download_capacity',
      label: 'Download Capacity',
      status: 'unknown',
      thresholdDescription: `>= ${THRESHOLDS.conferencing.downloadMinMbps} Mbps`,
      explanation: 'Download speed unavailable.',
    });
    confidence = 'medium';
    confidenceReasons.push('Download speed unavailable.');
  }

  // Check 2: Upload Throughput (Bidirectional requirement)
  if (primaryUpload && primaryUpload.mbps !== null && primaryUpload.status === 'success') {
    const pass = primaryUpload.mbps >= THRESHOLDS.conferencing.uploadMinMbps;
    checks.push({
      metric: 'upload_capacity',
      label: 'Upload Capacity (Camera & Screen Share)',
      status: pass ? 'pass' : 'fail',
      measuredValue: primaryUpload.mbps,
      unit: 'Mbps',
      thresholdDescription: `>= ${THRESHOLDS.conferencing.uploadMinMbps} Mbps`,
      explanation: pass
        ? `Upload throughput (${primaryUpload.mbps.toFixed(1)} Mbps) is plenty for HD outgoing video & screen sharing.`
        : `Upload bandwidth (${primaryUpload.mbps.toFixed(1)} Mbps) is tight; outgoing camera feed may stutter or drop to low resolution.`,
    });
    if (!pass) {
      bottlenecks.push(`Constrained upload speed (${primaryUpload.mbps.toFixed(1)} Mbps)`);
      recommendations.push(
        'Turn off webcam or stop high-res screen sharing if meeting attendees report freezing.'
      );
    }
  } else {
    checks.push({
      metric: 'upload_capacity',
      label: 'Upload Capacity',
      status: 'unknown',
      thresholdDescription: `>= ${THRESHOLDS.conferencing.uploadMinMbps} Mbps`,
      explanation: 'Upload endpoint unavailable or skipped.',
    });
    confidence = 'medium';
    confidenceReasons.push('Upload throughput was not measured directly.');
  }

  // Check 3: Latency & Jitter
  if (latency.medianMs !== null && latency.status === 'success') {
    const latPass = latency.medianMs <= THRESHOLDS.conferencing.latencyMaxMs;
    const jitPass =
      latency.jitterMs === null ||
      latency.jitterMs <= THRESHOLDS.conferencing.jitterMaxMs;
    const status: CheckStatus = latPass && jitPass ? 'pass' : latPass ? 'borderline' : 'fail';

    checks.push({
      metric: 'voice_latency',
      label: 'Voice & Video Round-Trip Delay',
      status,
      measuredValue: latency.medianMs,
      unit: 'ms',
      thresholdDescription: `< ${THRESHOLDS.conferencing.latencyMaxMs} ms round-trip`,
      explanation:
        status === 'pass'
          ? `Natural conversational cadence without talking over one another (${latency.medianMs} ms).`
          : `Audio delay (${latency.medianMs} ms) may cause awkward pauses and participants speaking at the same time.`,
    });

    if (status === 'fail') {
      bottlenecks.push(`High call delay (${latency.medianMs} ms)`);
    }
  }

  // Check 4: Loaded Latency Impact
  if (
    loadedLatency.loadedDeltaMs !== null &&
    loadedLatency.status === 'success'
  ) {
    const bloatPass =
      loadedLatency.loadedDeltaMs <=
      THRESHOLDS.conferencing.loadedLatencyDeltaMaxMs;
    checks.push({
      metric: 'call_under_load',
      label: 'Call Stability During Transfers',
      status: bloatPass ? 'pass' : 'borderline',
      measuredValue: loadedLatency.loadedDeltaMs,
      unit: '+ms',
      thresholdDescription: `< +${THRESHOLDS.conferencing.loadedLatencyDeltaMaxMs} ms`,
      explanation: bloatPass
        ? 'Call quality remains crisp even if files are transferring in the background.'
        : `Background transfers cause a +${loadedLatency.loadedDeltaMs} ms ping surge, risking robot voice or call drops.`,
    });
  }

  // Check 5: Packet Loss (from inputs)
  const { packetLoss, latencyDuringUpload } = inputs;
  if (packetLoss && packetLoss.packetLossPercent !== null && packetLoss.status === 'success') {
    const lossPercent = packetLoss.packetLossPercent;
    const lossPass = lossPercent < 0.5;
    checks.push({
      metric: 'packet_loss',
      label: 'Call Packet Stability',
      status: lossPass ? 'pass' : 'fail',
      measuredValue: lossPercent,
      unit: '%',
      thresholdDescription: '< 0.5% packet loss for clear calls',
      explanation: lossPass
        ? `Excellent packet stability (${lossPercent}% loss). Clear audio without dropouts.`
        : `Packet loss (${lossPercent}%) may cause audio glitches, robotic voice, or call drops.`,
    });
    
    if (!lossPass) {
      bottlenecks.push(`High packet loss (${lossPercent}%)`);
      recommendations.push(
        'Packet loss above 0.5% causes audio artifacts. Use a wired connection or check network stability.'
      );
    }
  }

  // Check 6: Latency During Upload
  if (latencyDuringUpload && latencyDuringUpload.underLoadLatencyMs !== null && latencyDuringUpload.status === 'success') {
    const uploadLatencyMs = latencyDuringUpload.underLoadLatencyMs;
    const uploadLatencyPass = uploadLatencyMs <= THRESHOLDS.conferencing.latencyMaxMs * 2;
    checks.push({
      metric: 'upload_latency_impact',
      label: 'Latency During Upload',
      status: uploadLatencyPass ? 'pass' : 'borderline',
      measuredValue: uploadLatencyMs,
      unit: 'ms',
      thresholdDescription: `< ${THRESHOLDS.conferencing.latencyMaxMs * 2} ms during upload`,
      explanation: uploadLatencyPass
        ? `Acceptable latency (${uploadLatencyMs} ms) during upload. Video calls remain smooth.`
        : `Latency spikes to ${uploadLatencyMs} ms during upload, potentially causing call quality issues.`,
    });
  }

  // Determine overall rating
  let rating: ActivityRating = 'excellent';
  const hasFail = checks.some((c) => c.status === 'fail');
  const hasBorderline = checks.some((c) => c.status === 'borderline');
  const hasUnknown = checks.some((c) => c.status === 'unknown');

  if (hasFail) {
    rating = 'poor';
  } else if (hasBorderline) {
    rating = 'fair';
  } else if (hasUnknown) {
    rating = 'good';
  }

  const summary =
    rating === 'excellent'
      ? 'Optimal conditions for crystal-clear HD video conferences, webinars, and group screen-sharing.'
      : rating === 'good'
      ? 'Good support for standard video meetings. Adequate upload and download bandwidth.'
      : rating === 'fair'
      ? 'Adequate for 1-on-1 audio or standard video calls, but large group calls or screen sharing may experience lag.'
      : rating === 'poor'
      ? 'Likely to suffer from choppy audio, robotic voice artifacts, or camera freeze due to bandwidth or latency constraints.'
      : 'Insufficient metrics to complete conferencing evaluation.';

  return {
    activityId: 'conferencing',
    displayName: 'Video Conferencing & Classes',
    category: 'Bidirectional Audio/Video',
    rating,
    summary,
    explanationCodes: ['CONF_AUDIO', 'CONF_HD_VIDEO', 'CONF_SCREEN_SHARE'],
    checks,
    bottlenecks,
    recommendations:
      recommendations.length > 0
        ? recommendations
        : ['Connection meets all parameters for reliable remote video meetings.'],
    confidence,
    confidenceReasons,
    scoringVersion: SCORING_RULE_VERSION,
  };
}

/**
 * 4. Web Browsing & Cloud Apps
 */
function assessBrowsing(inputs: AssessmentInputs): ActivityAssessment {
  const { dns, latency, download } = inputs;
  const primaryDownload = getPrimaryThroughput(download);
  const checks: RequirementCheck[] = [];
  const bottlenecks: string[] = [];
  const recommendations: string[] = [];
  const confidenceReasons: string[] = [];
  let confidence: ConfidenceLevel = 'high';

  // Check 1: DNS Lookup Time
  if (dns.durationMs !== null && dns.status === 'success') {
    const status: CheckStatus =
      dns.durationMs <= THRESHOLDS.browsing.dnsLookupMaxMs
        ? 'pass'
        : dns.durationMs <= THRESHOLDS.browsing.dnsLookupMaxMs * 2
        ? 'borderline'
        : 'fail';

    checks.push({
      metric: 'dns_speed',
      label: 'DNS Resolution Speed',
      status,
      measuredValue: dns.durationMs,
      unit: 'ms',
      thresholdDescription: `< ${THRESHOLDS.browsing.dnsLookupMaxMs} ms`,
      explanation:
        status === 'pass'
          ? `Fast domain lookup (${dns.durationMs} ms); web addresses resolve instantly.`
          : `Sluggish DNS lookup (${dns.durationMs} ms); websites may hesitate before starting to load.`,
    });

    if (status === 'fail' || status === 'borderline') {
      bottlenecks.push(`Slow DNS lookup (${dns.durationMs} ms)`);
      recommendations.push(
        'Configure your device or router to use fast DNS resolvers such as 1.1.1.1 (Cloudflare) or 8.8.8.8 (Google).'
      );
    }
  } else {
    checks.push({
      metric: 'dns_speed',
      label: 'DNS Resolution Speed',
      status: 'unknown',
      thresholdDescription: `< ${THRESHOLDS.browsing.dnsLookupMaxMs} ms`,
      explanation: 'DNS resolution timing was not measured directly.',
    });
    confidence = 'medium';
    confidenceReasons.push('DNS lookup not directly measured.');
  }

  // Check 2: Connection Responsiveness (Latency)
  if (latency.medianMs !== null && latency.status === 'success') {
    const pass = latency.medianMs <= THRESHOLDS.browsing.latencyMaxMs;
    checks.push({
      metric: 'page_response',
      label: 'Server Connection Setup',
      status: pass ? 'pass' : 'fail',
      measuredValue: latency.medianMs,
      unit: 'ms',
      thresholdDescription: `< ${THRESHOLDS.browsing.latencyMaxMs} ms`,
      explanation: pass
        ? `Prompt HTTP round-trip timing (${latency.medianMs} ms).`
        : `Elevated round-trip time (${latency.medianMs} ms); pages will take longer to begin rendering.`,
    });
  }

  // Check 3: Asset Download Capacity
  if (primaryDownload && primaryDownload.mbps !== null && primaryDownload.status === 'success') {
    const pass = primaryDownload.mbps >= THRESHOLDS.browsing.downloadMinMbps;
    checks.push({
      metric: 'asset_download',
      label: 'Web Asset & Image Download',
      status: pass ? 'pass' : 'borderline',
      measuredValue: primaryDownload.mbps,
      unit: 'Mbps',
      thresholdDescription: `>= ${THRESHOLDS.browsing.downloadMinMbps} Mbps`,
      explanation: pass
        ? `Ample throughput (${primaryDownload.mbps.toFixed(1)} Mbps) for loading media-rich websites and web apps.`
        : `Lower throughput (${primaryDownload.mbps.toFixed(1)} Mbps); heavy web pages with large media will load slowly.`,
    });
  }

  let rating: ActivityRating = 'excellent';
  const hasFail = checks.some((c) => c.status === 'fail');
  const hasBorderline = checks.some((c) => c.status === 'borderline');

  if (hasFail) {
    rating = 'poor';
  } else if (hasBorderline) {
    rating = 'fair';
  } else if (checks.every((c) => c.status === 'pass')) {
    rating = 'excellent';
  } else {
    rating = 'good';
  }

  const summary =
    rating === 'excellent'
      ? 'Websites and cloud applications will feel instantaneous and responsive with swift asset loading.'
      : rating === 'good'
      ? 'Reliable browsing experience for everyday cloud applications, news sites, and e-commerce.'
      : rating === 'fair'
      ? 'Browsing works, but you may notice hesitations on media-heavy pages or during DNS lookups.'
      : 'Browsing will feel noticeably sluggish, with delayed page initializations and slow asset delivery.';

  return {
    activityId: 'browsing',
    displayName: 'Web Browsing & Cloud Apps',
    category: 'Interactive Web',
    rating,
    summary,
    explanationCodes: ['BROWSING_DNS', 'BROWSING_PAGE_RESPONSIVENESS'],
    checks,
    bottlenecks,
    recommendations:
      recommendations.length > 0
        ? recommendations
        : ['Connection is well-optimized for responsive web navigation.'],
    confidence,
    confidenceReasons,
    scoringVersion: SCORING_RULE_VERSION,
  };
}

/**
 * 5. Remote Work, VPN, and Remote Desktop (RDP / Citrix)
 */
function assessRemoteWork(inputs: AssessmentInputs): ActivityAssessment {
  const { download, upload, latency, loadedLatency } = inputs;
  const primaryDownload = getPrimaryThroughput(download);
  const checks: RequirementCheck[] = [];
  const bottlenecks: string[] = [];
  const recommendations: string[] = [];
  const confidenceReasons: string[] = [];
  let confidence: ConfidenceLevel = 'high';

  // Check 1: RDP / Remote Desktop Responsiveness
  if (latency.medianMs !== null && latency.status === 'success') {
    const pass = latency.medianMs <= THRESHOLDS.remoteWork.latencyMaxMs;
    const borderline = latency.medianMs <= 140;
    const status: CheckStatus = pass ? 'pass' : borderline ? 'borderline' : 'fail';

    checks.push({
      metric: 'rdp_latency',
      label: 'Remote Desktop & Mouse Cursor Latency',
      status,
      measuredValue: latency.medianMs,
      unit: 'ms',
      thresholdDescription: `< ${THRESHOLDS.remoteWork.latencyMaxMs} ms for lag-free cursor tracking`,
      explanation:
        status === 'pass'
          ? `Low latency (${latency.medianMs} ms) enables smooth mouse movement and typing over RDP/SSH/VDI.`
          : status === 'borderline'
          ? `Noticeable cursor delay (${latency.medianMs} ms); typing and dragging windows may feel sluggish.`
          : `High latency (${latency.medianMs} ms) will make remote desktop sessions feel unresponsive and laggy.`,
    });

    if (status === 'fail') bottlenecks.push(`High RDP/VPN latency (${latency.medianMs} ms)`);
  } else {
    confidence = 'medium';
    confidenceReasons.push('Round-trip latency could not be verified.');
  }

  // Check 2: VPN Tunnel Bandwidth
  if (primaryDownload && primaryDownload.mbps !== null && primaryDownload.status === 'success') {
    const pass = primaryDownload.mbps >= THRESHOLDS.remoteWork.downloadMinMbps;
    checks.push({
      metric: 'vpn_bandwidth',
      label: 'VPN Tunnel Throughput',
      status: pass ? 'pass' : 'borderline',
      measuredValue: primaryDownload.mbps,
      unit: 'Mbps',
      thresholdDescription: `>= ${THRESHOLDS.remoteWork.downloadMinMbps} Mbps`,
      explanation: pass
        ? `Good download bandwidth (${primaryDownload.mbps.toFixed(1)} Mbps) to handle VPN encryption overhead.`
        : `Marginal bandwidth (${primaryDownload.mbps.toFixed(1)} Mbps) for company VPN data tunnels.`,
    });
  }

  // Check 3: Bufferbloat under work transfers
  if (
    loadedLatency.loadedDeltaMs !== null &&
    loadedLatency.status === 'success'
  ) {
    const pass =
      loadedLatency.loadedDeltaMs <=
      THRESHOLDS.remoteWork.loadedLatencyDeltaMaxMs;
    checks.push({
      metric: 'remote_stability',
      label: 'VPN Session Stability Under Load',
      status: pass ? 'pass' : 'borderline',
      measuredValue: loadedLatency.loadedDeltaMs,
      unit: '+ms',
      thresholdDescription: `< +${THRESHOLDS.remoteWork.loadedLatencyDeltaMaxMs} ms`,
      explanation: pass
        ? 'Stable connection preserves VPN tunnel integrity even during file syncs.'
        : `Large file syncs may cause packet congestion (+${loadedLatency.loadedDeltaMs} ms), threatening VPN dropouts.`,
    });
  }

  let rating: ActivityRating = 'excellent';
  const hasFail = checks.some((c) => c.status === 'fail');
  const hasBorderline = checks.some((c) => c.status === 'borderline');

  if (hasFail) {
    rating = 'poor';
  } else if (hasBorderline) {
    rating = 'fair';
  } else if (checks.every((c) => c.status === 'pass')) {
    rating = 'excellent';
  } else {
    rating = 'good';
  }

  const summary =
    rating === 'excellent'
      ? 'Ideal for demanding remote work: smooth Remote Desktop/Citrix sessions, stable corporate VPNs, and cloud sync.'
      : rating === 'good'
      ? 'Sufficient for most remote work tasks including document collaboration, cloud suites, and typical VPN use.'
      : rating === 'fair'
      ? 'Adequate for web-based work, but Remote Desktop or Virtual Desktop Infrastructure (VDI) may exhibit noticeable cursor lag.'
      : 'Challenging for remote work; expect delayed keyboard input in remote desktops and possible VPN disconnections.';

  recommendations.push(
    'Note: This assesses general connection capability. Corporate firewall policies, split-tunneling, or company VPN gateway congestion may independently impact your workplace tools.'
  );

  return {
    activityId: 'remote_work',
    displayName: 'Remote Work & VPN',
    category: 'Productivity & Remote Systems',
    rating,
    summary,
    explanationCodes: ['REMOTE_RDP', 'REMOTE_VPN_TUNNEL'],
    checks,
    bottlenecks,
    recommendations,
    confidence,
    confidenceReasons,
    scoringVersion: SCORING_RULE_VERSION,
  };
}

/**
 * 6. Bulk File Transfers (Downloads & Uploads)
 */
function assessTransfers(inputs: AssessmentInputs): ActivityAssessment {
  const { download, upload } = inputs;
  const primaryDownload = getPrimaryThroughput(download);
  const primaryUpload = getPrimaryThroughput(upload);
  const checks: RequirementCheck[] = [];
  const bottlenecks: string[] = [];
  const recommendations: string[] = [];
  const confidenceReasons: string[] = [];
  let confidence: ConfidenceLevel = 'high';

  const dlMbps = primaryDownload?.mbps || 0;
  const ulMbps = primaryUpload?.mbps || 0;

  // Convert to Megabytes per second (MB/s) -> 1 MB/s = 8 Mbps
  const dlMBps = dlMbps / 8;
  const ulMBps = ulMbps / 8;

  // Estimate time to download a 1 GB file (1024 MB)
  const estDl1GbSec = dlMBps > 0 ? Math.round(1024 / dlMBps) : null;
  const estUl1GbSec = ulMBps > 0 ? Math.round(1024 / ulMBps) : null;

  function formatDuration(sec: number | null): string {
    if (sec === null) return 'N/A';
    if (sec < 60) return `${sec}s`;
    const mins = Math.floor(sec / 60);
    const remainingSec = sec % 60;
    return `${mins}m ${remainingSec}s`;
  }

  // Check 1: Download Throughput
  if (primaryDownload?.status === 'success' && primaryDownload.mbps !== null) {
    const status: CheckStatus =
      dlMbps >= THRESHOLDS.transfers.fastDownloadMbps
        ? 'pass'
        : dlMbps >= THRESHOLDS.transfers.standardDownloadMbps
        ? 'pass'
        : 'borderline';

    checks.push({
      metric: 'download_throughput',
      label: 'Sustained Download Rate',
      status,
      measuredValue: dlMbps,
      unit: 'Mbps',
      thresholdDescription: `>= ${THRESHOLDS.transfers.standardDownloadMbps} Mbps`,
      explanation: `Measured ${dlMbps.toFixed(1)} Mbps (${dlMBps.toFixed(1)} MB/s). Estimated 1 GB download time: ~${formatDuration(estDl1GbSec)}.`,
    });

    if (status === 'borderline') {
      bottlenecks.push(`Slower download rate (${dlMbps.toFixed(1)} Mbps)`);
      recommendations.push(
        'Large software updates, OS patches, or game downloads will take considerable time.'
      );
    }
  } else {
    checks.push({
      metric: 'download_throughput',
      label: 'Download Rate',
      status: 'unknown',
      thresholdDescription: `>= ${THRESHOLDS.transfers.standardDownloadMbps} Mbps`,
      explanation: 'Download speed unavailable.',
    });
    confidence = 'low';
    confidenceReasons.push('Download throughput unavailable.');
  }

  // Check 2: Upload Throughput
  if (primaryUpload?.status === 'success' && primaryUpload.mbps !== null) {
    const status: CheckStatus =
      ulMbps >= THRESHOLDS.transfers.fastUploadMbps
        ? 'pass'
        : ulMbps >= THRESHOLDS.transfers.standardUploadMbps
        ? 'pass'
        : 'borderline';

    checks.push({
      metric: 'upload_throughput',
      label: 'Sustained Upload Rate',
      status,
      measuredValue: ulMbps,
      unit: 'Mbps',
      thresholdDescription: `>= ${THRESHOLDS.transfers.standardUploadMbps} Mbps`,
      explanation: `Measured ${ulMbps.toFixed(1)} Mbps (${ulMBps.toFixed(1)} MB/s). Estimated 1 GB upload time: ~${formatDuration(estUl1GbSec)}.`,
    });

    if (status === 'borderline') {
      bottlenecks.push(`Limited upload bandwidth (${ulMbps.toFixed(1)} Mbps)`);
      recommendations.push(
        'Backing up large video libraries or photo albums will be slow. Consider scheduling heavy uploads overnight.'
      );
    }
  } else {
    checks.push({
      metric: 'upload_throughput',
      label: 'Upload Rate',
      status: 'unknown',
      thresholdDescription: `>= ${THRESHOLDS.transfers.standardUploadMbps} Mbps`,
      explanation: 'Upload throughput test was skipped or not supported by endpoint.',
    });
    confidence = 'medium';
    confidenceReasons.push('Upload throughput not measured.');
  }

  let rating: ActivityRating = 'excellent';
  if (dlMbps >= 100 && ulMbps >= 20) {
    rating = 'excellent';
  } else if (dlMbps >= 25) {
    rating = 'good';
  } else if (dlMbps >= 10) {
    rating = 'fair';
  } else if (primaryDownload?.status === 'success') {
    rating = 'poor';
  } else {
    rating = 'insufficient_data';
  }

  const summary =
    rating === 'excellent'
      ? `Blazing transfer capacity. A 1 GB file takes approximately ${formatDuration(estDl1GbSec)} to download and ${formatDuration(estUl1GbSec)} to upload.`
      : rating === 'good'
      ? `Solid transfer speed. Everyday file downloads, app installs, and cloud backups complete in reasonable time.`
      : rating === 'fair'
      ? `Adequate for modest files, but multi-gigabyte game patches or large video uploads will be noticeably sluggish.`
      : rating === 'poor'
      ? `Constrained transfer rates. Large downloads and uploads will require significant patience.`
      : 'Incomplete throughput data to estimate file transfer metrics.';

  return {
    activityId: 'transfers',
    displayName: 'Downloads & File Transfers',
    category: 'Bulk Data Transfers',
    rating,
    summary,
    explanationCodes: ['TRANSFER_DOWNLOAD', 'TRANSFER_UPLOAD'],
    checks,
    bottlenecks,
    recommendations:
      recommendations.length > 0
        ? recommendations
        : ['Fast throughput allows quick cloud backups and rapid multi-gigabyte downloads.'],
    confidence,
    confidenceReasons,
    scoringVersion: SCORING_RULE_VERSION,
  };
}

/**
 * Assess all activities and compute overall verdict
 */
export function assessAllActivities(
  inputs: AssessmentInputs,
  id = `assessment-${Date.now()}`
): OverallAssessmentReport {
  const gaming = assessGaming(inputs);
  const streaming = assessStreaming(inputs);
  const conferencing = assessConferencing(inputs);
  const browsing = assessBrowsing(inputs);
  const remoteWork = assessRemoteWork(inputs);
  const transfers = assessTransfers(inputs);

  const activities = [
    gaming,
    streaming,
    conferencing,
    browsing,
    remoteWork,
    transfers,
  ];

  // Overall Headline summary based on evidence
  let overallRating: ActivityRating = 'good';
  const ratingWeights: Record<ActivityRating, number> = {
    excellent: 4,
    good: 3,
    fair: 2,
    poor: 1,
    insufficient_data: 0,
    not_assessed: 0,
  };

  const scoredActivities = activities.filter(
    (a) => a.rating !== 'insufficient_data' && a.rating !== 'not_assessed'
  );

  if (scoredActivities.length > 0) {
    const avgScore =
      scoredActivities.reduce((acc, a) => acc + ratingWeights[a.rating], 0) /
      scoredActivities.length;

    if (avgScore >= 3.5) overallRating = 'excellent';
    else if (avgScore >= 2.5) overallRating = 'good';
    else if (avgScore >= 1.7) overallRating = 'fair';
    else overallRating = 'poor';
  } else {
    overallRating = 'insufficient_data';
  }

  // Construct headline narrative
  let headlineSummary = '';
  if (overallRating === 'excellent') {
    headlineSummary =
      'Your network performs excellently across both low-latency activities (gaming, calls) and high-throughput demands (4K streaming, file transfers).';
  } else if (overallRating === 'good') {
    headlineSummary =
      'Your connection is capable and reliable for HD streaming, ordinary video calls, and web work, with minor latency or speed trade-offs.';
  } else if (overallRating === 'fair') {
    headlineSummary =
      'Your connection handles basic browsing and standard streaming, but you may experience latency spikes during gaming or when large files are downloading.';
  } else if (overallRating === 'poor') {
    headlineSummary =
      'Your network exhibits noticeable bottlenecks (elevated latency, jitter, or restricted bandwidth) that impact real-time calls, video playback, and gaming.';
  } else {
    headlineSummary =
      'Network assessment is incomplete. Run a full diagnostic check to generate evidence-based capability verdicts.';
  }

  // Bufferbloat note if detected
  if (
    inputs.loadedLatency.loadedDeltaMs &&
    inputs.loadedLatency.loadedDeltaMs > 75
  ) {
    headlineSummary += ` ⚠️ Note: Ping rises by +${inputs.loadedLatency.loadedDeltaMs} ms under load (Bufferbloat). Avoid large file transfers while gaming or on video calls.`;
  }

  // Calculate total bytes from all download/upload results
  const dlBytes = inputs.download.reduce((sum, r) => sum + (r.bytesTransferred || 0), 0);
  const ulBytes = inputs.upload.reduce((sum, r) => sum + (r.bytesTransferred || 0), 0);
  const dataTransferredMb = Number(
    ((dlBytes + ulBytes) / (1024 * 1024)).toFixed(2)
  );

  // Calculate total duration from all tests
  const totalDownloadDuration = inputs.download.reduce((sum, r) => sum + (r.durationMs || 0), 0);
  const totalUploadDuration = inputs.upload.reduce((sum, r) => sum + (r.durationMs || 0), 0);

  return {
    id,
    timestamp: new Date().toISOString(),
    appVersion: '1.0.0',
    scoringVersion: SCORING_RULE_VERSION,
    networkInfo: inputs.networkInfo,
    headlineSummary,
    activities,
    rawMeasurements: {
      idleLatency: inputs.latency,
      downloadThroughput: inputs.download,
      uploadThroughput: inputs.upload,
      loadedLatency: inputs.loadedLatency,
      dnsTiming: inputs.dns,
      packetLoss: inputs.packetLoss,
      latencyDuringUpload: inputs.latencyDuringUpload,
    },
    dataTransferredMb,
    overallRating,
    testedDurationSec: Math.round(
      (totalDownloadDuration + totalUploadDuration + inputs.latency.sampleCount * 50) /
        1000
    ),
  };
}
