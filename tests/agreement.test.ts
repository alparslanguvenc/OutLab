import { test, expect } from "@playwright/test";
import {
  agreement,
  autoBins,
  coderBins,
  kappaBand,
  withDefaults,
} from "../src/agreement";
import type { Annotation, AnalysisPoint } from "../src/types";

const label = (
  coder: string,
  start: number,
  end: number,
  kind: Annotation["label"],
): Annotation => ({
  id: `${coder}${start}`,
  coder,
  start,
  end,
  label: kind,
  reason: "bump",
  note: "",
  at: "",
});

test("coder bins: artifact wins over valid, unsure is excluded, ranges are clipped", () => {
  const bins = coderBins(
    [
      label("A", 0, 4, "valid"),
      label("A", 2, 3, "artifact"),
      label("A", 5, 7, "unsure"),
      label("A", 8, 99, "artifact"),
      label("B", 0, 10, "artifact"),
    ],
    "A",
    10,
  );
  expect(bins).toEqual([0, 0, 1, 0, null, null, null, null, 1, 1]);
});

test("Cohen's kappa matches a hand-computed example and handles degenerate cases", () => {
  // 10 bins: tp=3, fp=1, fn=2, tn=4 → po=0.7, pe=0.5*0.4+0.5*0.6=0.5, kappa=0.4
  const a = [1, 1, 1, 1, 1, 0, 0, 0, 0, 0] as const;
  const b = [1, 1, 1, 0, 0, 1, 0, 0, 0, 0] as const;
  const r = agreement([...a], [...b]);
  expect([r.tp, r.fp, r.fn, r.tn]).toEqual([3, 1, 2, 4]);
  expect(r.observed).toBeCloseTo(0.7);
  expect(r.kappa).toBeCloseTo(0.4);
  expect(r.sensitivity).toBeCloseTo(0.6);
  expect(r.specificity).toBeCloseTo(0.8);
  expect(kappaBand(r.kappa, "en")).toBe("fair");
  expect(agreement([null, null], [1, 0]).kappa).toBeNull();
  // both raters say "valid" everywhere: pe = 1, kappa undefined rather than invented
  expect(agreement([0, 0, 0], [0, 0, 0]).kappa).toBeNull();
  expect(agreement([1, 0], [1, 0]).kappa).toBeCloseTo(1);
});

test("automatic flags become 1-second bins only where the method produced output", () => {
  const points = [
    { t: 0.2, qualityInvalid: false },
    { t: 0.7, qualityInvalid: true },
    { t: 1.5, qualityInvalid: false },
    { t: 3.1 },
  ] as AnalysisPoint[];
  expect(autoBins(points, "qualityInvalid", 4)).toEqual([1, 0, null, null]);
});

test("missing option fields fall back to defaults for older projects", () => {
  const o = withDefaults({ quality: { enabled: true } as never });
  expect(o.quality.enabled).toBe(true);
  expect(o.quality.maxSlope).toBe(10);
  expect(o.robustness.enabled).toBe(false);
  expect(o.motionWindows.windowSeconds).toBe(2);
});
