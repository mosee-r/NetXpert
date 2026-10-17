/**
 * SpeedXpat — Shared Network Data Contracts
 * Compliant with SPEEDXPAT_SPEC.md Section 8
 */

export type TestStatus =
  | 'success'
  | 'failed'
  | 'unsupported'
  | 'permission_required'
  | 'cancelled'
  | 'timed_out'
  | 'insufficient_data';

export type NetworkType = 'wifi' | 'cellular' | 'ethernet' | 'unknown';

export interface NetworkTestResult {
  id: string;
  assessmentId: string;
  testType: string;
  status: TestStatus;
  startedAt: string;
  completedAt?: string;
  durationMs: number;
  target?: string;
  networkType?: NetworkType;
  method?: string;
  measurements: Record<string, number | string | boolean | null>;
  units: Record<string, string>;
  errorCode?: string;
  errorMessage?: string;
  limitations: string[];
  metadata?: Record<string, string | number | boolean | null>;
}

export interface LatencySample {
  timestamp: number;
  latencyMs: number;
}

export interface LatencySummary {
  status: TestStatus;
  target: string;
  method: string; // e.g. "HTTPS Fetch TTFB" or "HTTP Round-Trip"
  sampleCount: number;
  completedProbeCount: number;
  failedProbeCount: number;
  minMs: number | null;
  medianMs: number | null;
  avgMs: number | null;
  maxMs: number | null;
  jitterMs: number | null; // RFC 3550 interarrival jitter calculation
  packetLossPercent: number | null;
  samples: LatencySample[];
  limitations: string[];
  errorMessage?: string;
}

export interface ThroughputSample {
  timestamp: number;
  bytes: number;
  instantMbps: number;
}

export interface ThroughputChartPoint {
  elapsedMs: number;
  mbps: number;
}

export interface SpeedTestServer {
  id: string;
  hostname: string;
  name: string;
  country: string;
  city: string;
  latitude: number;
  longitude: number;
  continent: string;
}

export interface ThroughputSummary {
  status: TestStatus;
  target: string;
  method: string;
  direction: 'download' | 'upload';
  bytesTransferred: number;
  durationMs: number;
  mbps: number | null;
  tcpRttMs?: number;
  samples: ThroughputSample[];
  limitations: string[];
  errorMessage?: string;
  testSizeBytes?: number; // For multi-size testing
  percentile90?: number | null; // 90th percentile throughput
  percentile95?: number | null; // 95th percentile throughput
}

export interface MultiSizeThroughputResult {
  sizeLabel: string;
  sizeBytes: number;
  result: ThroughputSummary;
}

export interface LoadedLatencySummary {
  status: TestStatus;
  baselineLatencyMs: number | null;
  underLoadLatencyMs: number | null;
  postLoadLatencyMs: number | null;
  loadedDeltaMs: number | null; // Latency increase under load (Bufferbloat)
  bufferbloatGrade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F' | 'unknown';
  severityDescription: string;
  limitations: string[];
}

export interface UploadLatencySummary {
  status: TestStatus;
  baselineLatencyMs: number | null;
  underUploadLatencyMs: number | null;
  postUploadLatencyMs: number | null;
  loadedDeltaMs: number | null; // Latency increase during upload
  bufferbloatGrade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F' | 'unknown';
  severityDescription: string;
  limitations: string[];
}

export interface DnsTimingResult {
  status: TestStatus;
  targetDomain: string;
  durationMs: number | null;
  resolvedIp?: string;
  method: string;
  limitations: string[];
  errorMessage?: string;
}

export interface HttpTimingResult {
  status: TestStatus;
  targetUrl: string;
  totalTimeMs: number | null;
  dnsTimeMs?: number | null;
  connectTimeMs?: number | null;
  tlsTimeMs?: number | null;
  ttfbMs?: number | null;
  downloadTimeMs?: number | null;
  statusCode?: number;
  method: string;
  limitations: string[];
}

export interface PacketLossSample {
  timestamp: number;
  success: boolean;
  latencyMs: number | null;
}

export interface PacketLossSummary {
  status: TestStatus;
  target: string;
  method: string;
  sent: number;
  received: number;
  packetLossPercent: number | null;
  samples: PacketLossSample[];
  limitations: string[];
  errorMessage?: string;
}

export interface NearestMeasurementServer {
  machine?: string;
  hostname?: string;
  city?: string;
  country?: string;
  label?: string;
}

export interface DeviceNetworkInfo {
  networkType: NetworkType;
  effectiveType?: string; // "slow-2g" | "2g" | "3g" | "4g"
  downlinkMbps?: number;
  rttMs?: number;
  saveData?: boolean;
  online: boolean;
  ipAddress?: string;
  ispName?: string;
  asn?: string;
  asnOrg?: string;
  locationCity?: string;
  locationRegion?: string;
  locationCountry?: string;
  nearestServer?: NearestMeasurementServer;
  testServer?: {
    id: string;
    hostname: string;
    name: string;
    country: string;
    city?: string;
    latitude?: number;
    longitude?: number;
  };
  wifiSsid?: string;
  wifiSignalDbm?: number;
  wifiFrequencyMhz?: number;
  cellularGeneration?: string; // "4G/LTE" | "5G"
  cellularCarrier?: string;
  limitations: string[];
}
