export interface Point {
  t: number;
  v: number;
}
export interface ChannelQuality {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicates: number;
  gaps: number;
  flat: boolean;
  warnings: string[];
}
export interface Channel {
  id: string;
  tag: string;
  label: string;
  unit: string;
  points: Point[];
  sampleRate: number | null;
  sourceId: string;
  quality: ChannelQuality;
}
export interface TrackPoint {
  t: number;
  lat: number;
  lon: number;
  ele?: number;
  segment: number;
}
export interface Source {
  name: string;
  sha256: string;
  rows: number;
  kind: string;
  warnings: string[];
}
export interface SourceText {
  name: string;
  text: string;
}
export interface Dataset {
  channels: Channel[];
  track: TrackPoint[];
  sources: Source[];
  sensorOriginEpoch: number | null;
  gpxOriginEpoch: number | null;
  duration: number;
  warnings: string[];
}
export type TimeUnit = "auto" | "s" | "ms" | "us" | "iso";
export interface InspectedFile {
  name: string;
  kind: "csv" | "raw" | "gpx" | "info" | "unsupported";
  columns: string[];
  preview: string[][];
  tag: string;
  timeColumn: string;
  valueColumn: string;
  timeUnit: TimeUnit;
  warnings: string[];
}
export interface FileMapping {
  name: string;
  tag: string;
  timeColumn: string;
  valueColumn: string;
  timeUnit: TimeUnit;
}
export interface AnalysisConfig {
  baselineStart: number;
  baselineEnd: number;
  zThreshold: number;
  minDistance: number;
  motionThreshold: number;
}
export interface AnalysisPoint {
  t: number;
  raw: number;
  clean: number | null;
  tonic: number | null;
  phasic: number | null;
  motion: number | null;
  flagged: boolean;
}
export interface Candidate {
  id: string;
  t: number;
  amplitude: number;
  score: number | null;
  reason: string;
  flagged: boolean;
}
export interface Analysis {
  method: string;
  version: string;
  parameters: Record<string, unknown>;
  points: AnalysisPoint[];
  events: Candidate[];
  warnings: string[];
  metrics: {
    sampleRate: number | null;
    edaSamples: number;
    flaggedPercent: number;
    baselineMedian: number | null;
    baselineMad: number | null;
  };
}
export interface SyncAnchor {
  videoTime: number;
  sensorTime: number;
}
export interface SyncConfig {
  videoOffset: number;
  videoRate: number;
  gpsOffset: number;
  verified: boolean;
  anchors: SyncAnchor[];
  uncertainty: number;
  reason: string;
  videoName?: string;
  videoDuration?: number;
  gpsVerified?: boolean;
  gpsReason?: string;
  gpsUncertainty?: number;
}
export interface InterviewEvent {
  id: string;
  t: number;
  title: string;
  pre: number;
  post: number;
  selected: boolean;
  narrative: string;
  valence: number | null;
  arousal: number | null;
  codes: string;
  recallDate: string;
  source: "candidate" | "manual";
  provenance?: {
    runId: string;
    at: string;
    config: AnalysisConfig;
    sourceHashes: { name: string; sha256: string }[];
    candidate: Candidate;
  };
}
export interface AuditEntry {
  at: string;
  action: string;
  detail: string;
}
export interface Project {
  schemaVersion: 1;
  participant: string;
  title: string;
  dataset: Dataset;
  analysis: Analysis | null;
  config: AnalysisConfig;
  sync: SyncConfig;
  analysisRuns?: {
    id: string;
    at: string;
    config: AnalysisConfig;
    method: string;
    version: string;
    parameters: Record<string, unknown>;
    candidates: Candidate[];
    warnings: string[];
  }[];
  events: InterviewEvent[];
  sourceTexts: SourceText[];
  audit: AuditEntry[];
  isDemo: boolean;
}
