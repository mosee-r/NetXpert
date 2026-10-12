/**
 * SpeedXpat — Configurable Activity Thresholds & Heuristics
 * Version: v1.0.0-2026
 *
 * NOTE: These threshold values are configurable product heuristics based on industry
 * standards (ITU-T G.1010, IETF RFCs for jitter, Netflix/YouTube ISP recommendations,
 * and Zoom/Teams network specs). They must be validated and updated against current
 * provider guidance as network standards evolve.
 */

export const SCORING_RULE_VERSION = 'v1.0.0-2026';

export const THRESHOLDS = {
  // 1. Online Gaming (highly sensitive to latency, jitter, packet loss, and bufferbloat under load)
  gaming: {
    latency: {
      excellentMaxMs: 35,
      goodMaxMs: 65,
      fairMaxMs: 110,
    },
    jitter: {
      excellentMaxMs: 6,
      goodMaxMs: 15,
      fairMaxMs: 30,
    },
    packetLossPercent: {
      excellentMax: 0.2,
      goodMax: 1.0,
      fairMax: 3.0,
    },
    loadedLatencyDelta: {
      // Bufferbloat: increase under load
      excellentMaxDeltaMs: 25,
      goodMaxDeltaMs: 70,
      fairMaxDeltaMs: 150,
    },
    downloadMinMbps: 5, // Bandwidth needed once latency is satisfied
  },

  // 2. Video Streaming (Movies, TV, YouTube)
  streaming: {
    sdMinMbps: 3,
    hd1080pMinMbps: 10,
    ultraHd4kMinMbps: 25,
    jitterMaxMs: 60,
  },

  // 3. Video Conferencing (Zoom, Teams, Google Meet, Classes)
  conferencing: {
    downloadMinMbps: 3.5,
    uploadMinMbps: 3.0,
    latencyMaxMs: 120,
    jitterMaxMs: 25,
    packetLossPercentMax: 2.0,
    loadedLatencyDeltaMaxMs: 100,
  },

  // 4. Browsing & Ordinary Cloud Apps
  browsing: {
    dnsLookupMaxMs: 80,
    downloadMinMbps: 5,
    latencyMaxMs: 150,
  },

  // 5. Remote Work, VPN, and Remote Desktop (RDP / Citrix / SSH)
  remoteWork: {
    downloadMinMbps: 15,
    uploadMinMbps: 5,
    latencyMaxMs: 80,
    jitterMaxMs: 20,
    loadedLatencyDeltaMaxMs: 120,
  },

  // 6. Bulk File Transfers (Downloads & Uploads)
  transfers: {
    fastDownloadMbps: 100,
    standardDownloadMbps: 25,
    fastUploadMbps: 25,
    standardUploadMbps: 10,
  },
};
