import type { AnalysisOptions, AnalysisPoint, Annotation } from "./types";

/** Defaults for the optional methods. Every method starts switched off. */
export const defaultOptions = (): AnalysisOptions => ({
  quality: {
    enabled: false,
    minUs: 0.05,
    maxUs: 60,
    maxSlope: 10,
    temperatureTag: null,
    tempMin: 30,
    tempMax: 40,
    transitionSeconds: 5,
    flatSeconds: 10,
    flatRangeUs: 0.001,
    windowSeconds: 5,
    prefilterSeconds: 2,
    action: "flag",
  },
  motionWindows: {
    enabled: false,
    windowSeconds: 2,
    k: 3,
    useGyro: true,
    useSpeed: true,
  },
  robustness: {
    enabled: false,
    decompositions: ["highpass", "smoothmedian", "cvxEDA"],
    peakMethods: [
      "neurokit",
      "kim2004",
      "gamboa2008",
      "nabian2018",
      "vanhalem2020",
    ],
    minAmplitudeUs: 0.05,
    toleranceSeconds: 2,
  },
});

/** Fill missing fields so projects saved before a setting existed keep working. */
export function withDefaults(
  options?: Partial<AnalysisOptions>,
): AnalysisOptions {
  const d = defaultOptions();
  return {
    quality: { ...d.quality, ...options?.quality },
    motionWindows: { ...d.motionWindows, ...options?.motionWindows },
    robustness: { ...d.robustness, ...options?.robustness },
  };
}

export const anyOptionEnabled = (o?: AnalysisOptions) =>
  !!o && (o.quality.enabled || o.motionWindows.enabled || o.robustness.enabled);

type Binary = 0 | 1;

/**
 * Label of each 1-second bin for one coder: 1 = artifact, 0 = valid,
 * null = not labelled or marked "unsure" (excluded from agreement).
 * When one coder's ranges overlap with different labels, "artifact" wins.
 */
export function coderBins(
  annotations: Annotation[],
  coder: string,
  duration: number,
  bin = 1,
): (Binary | null)[] {
  const count = Math.max(0, Math.ceil(duration / bin));
  const bins: (Binary | null)[] = Array(count).fill(null);
  const unsure: boolean[] = Array(count).fill(false);
  for (const a of annotations) {
    if (a.coder !== coder) continue;
    const from = Math.max(0, Math.floor(a.start / bin));
    const to = Math.min(count - 1, Math.ceil(a.end / bin) - 1);
    for (let i = from; i <= to; i++) {
      if (a.label === "unsure") unsure[i] = true;
      else if (a.label === "artifact") bins[i] = 1;
      else if (bins[i] === null) bins[i] = 0;
    }
  }
  return bins.map((v, i) => (unsure[i] ? null : v));
}

/** Bins flagged by an automatic per-sample flag (1 if any sample in the bin is flagged). */
export function autoBins(
  points: AnalysisPoint[],
  key: "flagged" | "qualityInvalid" | "motionWindow",
  duration: number,
  bin = 1,
): (Binary | null)[] {
  const count = Math.max(0, Math.ceil(duration / bin));
  const bins: (Binary | null)[] = Array(count).fill(null);
  for (const p of points) {
    const value = p[key];
    if (value === undefined) continue;
    const i = Math.floor(p.t / bin);
    if (i < 0 || i >= count) continue;
    bins[i] = value || bins[i] === 1 ? 1 : 0;
  }
  return bins;
}

export interface Agreement {
  n: number;
  observed: number | null;
  kappa: number | null;
  /** counts with A as reference: tp = both artifact */
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  sensitivity: number | null;
  specificity: number | null;
}

/**
 * Cohen's kappa for two binary raters over bins both labelled.
 * kappa = (po - pe) / (1 - pe). Returns null when undefined (no bins, or pe = 1).
 * Sensitivity/specificity treat `reference` as the truth (e.g. a human coder).
 */
export function agreement(
  reference: (Binary | null)[],
  other: (Binary | null)[],
): Agreement {
  let tp = 0,
    fp = 0,
    fn = 0,
    tn = 0;
  const length = Math.min(reference.length, other.length);
  for (let i = 0; i < length; i++) {
    const r = reference[i],
      o = other[i];
    if (r === null || o === null) continue;
    if (r === 1 && o === 1) tp++;
    else if (r === 0 && o === 1) fp++;
    else if (r === 1 && o === 0) fn++;
    else tn++;
  }
  const n = tp + fp + fn + tn;
  if (!n)
    return {
      n,
      observed: null,
      kappa: null,
      tp,
      fp,
      fn,
      tn,
      sensitivity: null,
      specificity: null,
    };
  const po = (tp + tn) / n;
  const pYes = ((tp + fn) / n) * ((tp + fp) / n);
  const pNo = ((fp + tn) / n) * ((fn + tn) / n);
  const pe = pYes + pNo;
  return {
    n,
    observed: po,
    kappa: pe >= 1 ? null : (po - pe) / (1 - pe),
    tp,
    fp,
    fn,
    tn,
    sensitivity: tp + fn ? tp / (tp + fn) : null,
    specificity: tn + fp ? tn / (tn + fp) : null,
  };
}

/** Landis & Koch (1977) verbal bands, used only as a descriptive guide. */
export function kappaBand(kappa: number | null, lang: "tr" | "en"): string {
  if (kappa === null) return lang === "en" ? "not defined" : "tanımsız";
  const bands: [number, string, string][] = [
    [0, "uyum yok (şans altı)", "poor (below chance)"],
    [0.2, "çok zayıf", "slight"],
    [0.4, "zayıf", "fair"],
    [0.6, "orta", "moderate"],
    [0.8, "önemli", "substantial"],
    [1.0001, "neredeyse tam", "almost perfect"],
  ];
  if (kappa < 0) return lang === "en" ? bands[0][2] : bands[0][1];
  for (const [limit, tr, en] of bands.slice(1))
    if (kappa <= limit) return lang === "en" ? en : tr;
  return lang === "en" ? "almost perfect" : "neredeyse tam";
}
