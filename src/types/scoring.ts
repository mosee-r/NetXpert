/**
 * SpeedXpat — Activity Scoring & Capability Assessment Contracts
 * Compliant with SPEEDXPAT_SPEC.md Section 5.6 and Section 8.4
 */

import {
  LatencySummary,
  ThroughputSummary,
  LoadedLatencySummary,
  DnsTimingResult,
  DeviceNetworkInfo,
} from './network';

export type ActivityRating =
  | 'excellent'
  | 'good'
  | 'fair'
  | 'poor'
  | 'insufficient_data'
  | 'not_assessed';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type CheckStatus = 'pass' | 'borderline' | 'fail' | 'unknown';

export interface RequirementCheck {
  metric: string;
  label: string;
  status: CheckStatus;
  measuredValue?: number | null;
  unit?: string;
  thresholdDescription: string;
  explanation: string;
}

export interface ActivityAssessment {
  activityId:
    | 'gaming'
    | 'streaming'
    | 'conferencing'
    | 'browsing'
    | 'remote_work'
    | 'transfers';
  displayName: string;
  category: string;
  rating: ActivityRating;
  summary: string;
  explanationCodes: string[];
  checks: RequirementCheck[];
  bottlenecks: string[];
  recommendations: string[];
  confidence: ConfidenceLevel;
  confidenceReasons: string[];
  scoringVersion: string;
}

export interface OverallAssessmentReport {
  id: string;
  timestamp: string;
  appVersion: string;
  scoringVersion: string;
  networkInfo: DeviceNetworkInfo;
  headlineSummary: string;
  activities: ActivityAssessment[];
  rawMeasurements: {
    idleLatency: LatencySummary;
    downloadThroughput: ThroughputSummary;
    uploadThroughput: ThroughputSummary;
    loadedLatency: LoadedLatencySummary;
    dnsTiming: DnsTimingResult;
  };
  dataTransferredMb: number;
  overallRating: ActivityRating;
  testedDurationSec: number;
}
