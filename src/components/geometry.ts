import type { TrackPoint } from "../types";

export interface PlotPoint {
  t: number;
  v: number | null;
}

/** Every pixel keeps its first, last, minimum and maximum sample in source order.
 * Missing samples and time gaps always start a new path. No signal is interpolated. */
export function decimateSegments(
  points: PlotPoint[],
  start: number,
  end: number,
  width: number,
  gap: number,
): PlotPoint[][] {
  if (!(end > start) || width <= 0) return [];
  const paths: PlotPoint[][] = [];
  let path: PlotPoint[] = [];
  let bucket: Array<{ point: PlotPoint; index: number }> = [];
  let bucketId = -Infinity;
  let previousTime: number | null = null;
  function flushBucket() {
    if (!bucket.length) return;
    let min = bucket[0],
      max = bucket[0];
    for (const entry of bucket) {
      if (entry.point.v! < min.point.v!) min = entry;
      if (entry.point.v! > max.point.v!) max = entry;
    }
    const unique = new Map(
      [bucket[0], min, max, bucket[bucket.length - 1]].map((p) => [p.index, p]),
    );
    path.push(
      ...[...unique.values()]
        .sort((a, b) => a.index - b.index)
        .map((p) => p.point),
    );
    bucket = [];
  }
  function flushPath() {
    flushBucket();
    if (path.length) paths.push(path);
    path = [];
    bucketId = -Infinity;
  }
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    if (
      !Number.isFinite(point.t) ||
      point.v === null ||
      !Number.isFinite(point.v)
    ) {
      flushPath();
      previousTime = null;
      continue;
    }
    if (
      previousTime !== null &&
      (point.t - previousTime > gap || point.t <= previousTime)
    )
      flushPath();
    previousTime = point.t;
    if (point.t < start || point.t > end) {
      flushPath();
      continue;
    }
    const pixel = Math.floor(((point.t - start) / (end - start)) * width);
    if (pixel !== bucketId) {
      flushBucket();
      bucketId = pixel;
    }
    bucket.push({ point, index: i });
  }
  flushPath();
  return paths;
}

export function estimateGap(
  points: PlotPoint[],
  sampleRate?: number | null,
): number {
  if (sampleRate && sampleRate > 0) return Math.max(3 / sampleRate, 0.25);
  const intervals: number[] = [];
  for (let i = 1; i < Math.min(points.length, 5000); i++) {
    const dt = points[i].t - points[i - 1].t;
    if (Number.isFinite(dt) && dt > 0) intervals.push(dt);
  }
  intervals.sort((a, b) => a - b);
  return Math.max(0.25, 3 * (intervals[Math.floor(intervals.length / 2)] ?? 1));
}

export function valueAt(
  points: PlotPoint[],
  time: number,
  gap: number,
): number | null {
  if (
    !points.length ||
    time < points[0].t ||
    time > points[points.length - 1].t
  )
    return null;
  let lo = 0,
    hi = points.length - 1;
  while (lo < hi) {
    const m = (lo + hi) >>> 1;
    if (points[m].t < time) lo = m + 1;
    else hi = m;
  }
  if (points[lo].t === time) return points[lo].v;
  const a = points[Math.max(0, lo - 1)],
    b = points[lo];
  if (b.t - a.t > gap || a.v === null || b.v === null) return null;
  return time - a.t <= b.t - time ? a.v : b.v;
}

export function interpolateTrackAtTime(
  track: TrackPoint[],
  localTime: number,
): TrackPoint | null {
  if (
    !track.length ||
    !Number.isFinite(localTime) ||
    localTime < track[0].t ||
    localTime > track[track.length - 1].t
  )
    return null;
  let lo = 0,
    hi = track.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (track[mid].t < localTime) lo = mid + 1;
    else hi = mid;
  }
  if (track[lo].t === localTime) return track[lo];
  const a = track[Math.max(lo - 1, 0)],
    b = track[lo];
  if (a.segment !== b.segment || b.t - a.t > 15 || b.t <= a.t) return null;
  const fraction = (localTime - a.t) / (b.t - a.t);
  // Take the short arc at the antimeridian; a planar 359-degree jump is invalid.
  const lonDelta = ((b.lon - a.lon + 540) % 360) - 180;
  const lon = ((a.lon + fraction * lonDelta + 540) % 360) - 180;
  return {
    t: localTime,
    lat: a.lat + fraction * (b.lat - a.lat),
    lon,
    segment: a.segment,
    ...(a.ele !== undefined && b.ele !== undefined
      ? { ele: a.ele + fraction * (b.ele - a.ele) }
      : {}),
  };
}

export function formatTime(seconds: number): string {
  const sign = seconds < 0 ? "−" : "";
  const value = Math.max(0, Math.floor(Math.abs(seconds)));
  const hours = Math.floor(value / 3600),
    minutes = Math.floor(value / 60) % 60;
  return `${sign}${hours ? `${hours}:` : ""}${String(minutes).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
