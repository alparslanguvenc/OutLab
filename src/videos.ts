import type { Project, VideoTrack } from "./types";

/** A session can hold this many local videos (for example 4 × 60 min Full HD). */
export const MAX_VIDEOS = 4;
export const VIDEO_FILE = /\.(mp4|mov|webm|m4v|insv)$/i;
const EDGE = 0.04;

export const videoLabel = (index: number) => `Video ${index + 1}`;

/** Sensor-axis time at which the video ends, or null while its length is unknown. */
export function videoEnd(v: VideoTrack): number | null {
  return v.duration && v.duration > 0 ? v.offset + v.duration * v.rate : null;
}

/** Does this video contain footage for the given sensor-axis time? */
export function covers(v: VideoTrack, t: number): boolean {
  const end = videoEnd(v);
  return t >= v.offset - EDGE && (end === null || t <= end + EDGE);
}

export function videoSeconds(v: VideoTrack, t: number): number {
  return (t - v.offset) / v.rate;
}

export function allVideosVerified(p: Pick<Project, "videos">): boolean {
  return p.videos.length > 0 && p.videos.every((v) => v.verified);
}

export function newVideoTrack(file: {
  name: string;
  size: number;
  lastModified: number;
}): VideoTrack {
  return {
    id: crypto.randomUUID(),
    name: file.name,
    size: file.size,
    lastModified: file.lastModified,
    offset: 0,
    rate: 1,
    verified: false,
    anchors: [],
    uncertainty: 1,
    reason: "",
  };
}

const finite = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n);

export function validVideoTrack(v: unknown): v is VideoTrack {
  const x = v as VideoTrack;
  return (
    !!x &&
    typeof x.id === "string" &&
    typeof x.name === "string" &&
    finite(x.size) &&
    finite(x.lastModified) &&
    finite(x.offset) &&
    finite(x.rate) &&
    x.rate > 0 &&
    (x.duration === undefined || (finite(x.duration) && x.duration > 0)) &&
    typeof x.verified === "boolean" &&
    Array.isArray(x.anchors) &&
    x.anchors.every((a) => finite(a?.videoTime) && finite(a?.sensorTime)) &&
    finite(x.uncertainty) &&
    typeof x.reason === "string"
  );
}

/**
 * Projects saved before multi-video support stored one video in
 * `videoFile` and its mapping in `sync`. Move that into `videos[0]` so old
 * sessions and packages keep their verified mapping.
 */
export function normalizeProject<
  T extends Project & {
    videoFile?: { name: string; size: number; lastModified: number };
  },
>(p: T): T {
  if (Array.isArray(p.videos)) return p;
  const { videoFile, ...rest } = p;
  const s = p.sync;
  const videos: VideoTrack[] = videoFile
    ? [
        {
          ...newVideoTrack(videoFile),
          duration:
            finite(s.videoDuration) && s.videoDuration > 0
              ? s.videoDuration
              : undefined,
          offset: finite(s.videoOffset) ? s.videoOffset : 0,
          rate: finite(s.videoRate) && s.videoRate > 0 ? s.videoRate : 1,
          verified: !!s.verified,
          anchors: Array.isArray(s.anchors) ? s.anchors : [],
          uncertainty: finite(s.uncertainty) ? s.uncertainty : 1,
          reason: s.reason ?? "",
        },
      ]
    : [];
  const {
    videoOffset: _o,
    videoRate: _r,
    verified: _v,
    anchors: _a,
    uncertainty: _u,
    reason: _re,
    videoName: _n,
    videoDuration: _d,
    ...sync
  } = s;
  return { ...rest, sync, videos } as unknown as T;
}
