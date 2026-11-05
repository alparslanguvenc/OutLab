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
  /** present only when the optional quality rules ran */
  qualityInvalid?: boolean;
  /** present only when optional window-based motion ran */
  motionWindow?: boolean;
}
export interface Candidate {
  id: string;
  t: number;
  amplitude: number;
  score: number | null;
  reason: string;
  flagged: boolean;
  /** results of optional methods for this candidate */
  checks?: {
    qualityInvalid?: boolean;
    motionWindow?: boolean;
    support?: { count: number; total: number; configs: string[] } | null;
  };
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
  extras?: AnalysisExtras;
}

/* ---- optional artifact and robustness methods (all off by default) ---- */
export type QualityReason =
  "range" | "slope" | "temperature" | "flat" | "transition";
export interface QualityOptions {
  enabled: boolean;
  minUs: number;
  maxUs: number;
  maxSlope: number;
  temperatureTag: "T0" | "T1" | "TH" | null;
  tempMin: number;
  tempMax: number;
  transitionSeconds: number;
  flatSeconds: number;
  flatRangeUs: number;
  windowSeconds: number;
  /** EDAQA despiking pre-filter: zero-phase moving average in seconds, 0 = off */
  prefilterSeconds: number;
  action: "flag" | "exclude";
}
export interface MotionWindowOptions {
  enabled: boolean;
  windowSeconds: number;
  k: number;
  useGyro: boolean;
  useSpeed: boolean;
}
export type Decomposition = "highpass" | "smoothmedian" | "cvxEDA";
export type PeakMethod =
  "neurokit" | "kim2004" | "gamboa2008" | "nabian2018" | "vanhalem2020";
export interface RobustnessOptions {
  enabled: boolean;
  decompositions: Decomposition[];
  peakMethods: PeakMethod[];
  minAmplitudeUs: number;
  toleranceSeconds: number;
}
export interface AnalysisOptions {
  quality: QualityOptions;
  motionWindows: MotionWindowOptions;
  robustness: RobustnessOptions;
}
export interface AnalysisExtras {
  quality?: {
    usablePercent: number;
    invalidSamples: number;
    reasonCounts: Partial<Record<QualityReason, number>>;
    windows: {
      start: number;
      end: number;
      invalidShare: number;
      valid: boolean;
      reasons: QualityReason[];
    }[];
    temperatureTag: string | null;
    action: "flag" | "exclude";
  };
  motionWindows?: {
    windows: {
      start: number;
      end: number;
      accSd: number | null;
      gyroMean: number | null;
      speedKmh: number | null;
      context: "stationary" | "riding" | null;
      flagged: boolean;
      reasons: ("acceleration" | "gyroscope")[];
    }[];
    accThreshold: number | null;
    gyroThreshold: number | null;
    flaggedPercent: number;
    gyroUsed: boolean;
    contextWindows: { stationary: number; riding: number };
  };
  robustness?: {
    configs: {
      id: string;
      decomposition: Decomposition | null;
      peakMethod: PeakMethod;
      scrCount: number;
    }[];
    support: Record<
      string,
      { count: number; total: number; configs: string[] }
    >;
    toleranceSeconds: number;
    minAmplitudeUs: number;
    cvxEDAAvailable: boolean;
  };
}
/** A researcher's manual label for a time range, made while watching the video. */
export type AnnotationLabel = "artifact" | "valid" | "unsure";
export interface Annotation {
  id: string;
  coder: string;
  start: number;
  end: number;
  label: AnnotationLabel;
  reason: string;
  note: string;
  at: string;
}
export interface SyncAnchor {
  videoTime: number;
  sensorTime: number;
}
/**
 * One locally played video. Each video has its own clock mapping onto the
 * sensor axis: t_sensor = rate * t_video + offset. Videos may be consecutive
 * parts of a ride or simultaneous cameras; coverage decides which one plays.
 */
export interface VideoTrack {
  id: string;
  name: string;
  size: number;
  lastModified: number;
  duration?: number;
  offset: number;
  rate: number;
  verified: boolean;
  anchors: SyncAnchor[];
  uncertainty: number;
  reason: string;
}
export interface SyncConfig {
  gpsOffset: number;
  gpsVerified?: boolean;
  gpsReason?: string;
  gpsUncertainty?: number;
  /** @deprecated single-video v1 field; migrated into Project.videos */
  videoOffset?: number;
  /** @deprecated single-video v1 field; migrated into Project.videos */
  videoRate?: number;
  /** @deprecated single-video v1 field; migrated into Project.videos */
  verified?: boolean;
  /** @deprecated single-video v1 field; migrated into Project.videos */
  anchors?: SyncAnchor[];
  /** @deprecated single-video v1 field; migrated into Project.videos */
  uncertainty?: number;
  /** @deprecated single-video v1 field; migrated into Project.videos */
  reason?: string;
  /** @deprecated single-video v1 field; migrated into Project.videos */
  videoName?: string;
  /** @deprecated single-video v1 field; migrated into Project.videos */
  videoDuration?: number;
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
  videos: VideoTrack[];
  /** optional artifact methods; absent in projects saved before they existed */
  options?: AnalysisOptions;
  /** JSON of the optional-method payload used for the current analysis */
  analysisOptionsKey?: string;
  annotations?: Annotation[];
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
