import { test, expect } from "@playwright/test";
import {
  decimateSegments,
  estimateGap,
  interpolateTrackAtTime,
  valueAt,
} from "../src/components/geometry";

test("pixel decimation preserves narrow positive and negative spikes in time order", () => {
  const samples = Array.from({ length: 10_000 }, (_, i) => ({
    t: i / 100,
    v: i === 5_023 ? 100 : i === 5_024 ? -50 : 0,
  }));
  const result = decimateSegments(samples, 0, 100, 120, 0.1).flat();
  expect(result.length).toBeLessThanOrEqual(480);
  expect(result.some((p) => p.v === 100)).toBe(true);
  expect(result.some((p) => p.v === -50)).toBe(true);
  expect(result.every((p, i) => !i || p.t > result[i - 1].t)).toBe(true);
});

test("nulls, timestamp gaps and invalid samples cannot create connecting paths or displayed values", () => {
  expect(
    decimateSegments(
      [
        { t: 0, v: 1 },
        { t: 1, v: null },
        { t: 2, v: 3 },
      ],
      0,
      2,
      120,
      5,
    ),
  ).toHaveLength(2);
  expect(
    decimateSegments(
      [
        { t: 0, v: 1 },
        { t: 10, v: 2 },
      ],
      0,
      10,
      120,
      2,
    ),
  ).toHaveLength(2);
  expect(
    decimateSegments(
      [
        { t: 0, v: 1 },
        { t: 1, v: Number.NaN },
        { t: 2, v: 2 },
      ],
      0,
      2,
      120,
      5,
    ),
  ).toHaveLength(2);
  expect(
    valueAt(
      [
        { t: 0, v: 1 },
        { t: 10, v: 2 },
      ],
      5,
      2,
    ),
  ).toBeNull();
  expect(
    valueAt(
      [
        { t: 0, v: 1 },
        { t: 1, v: 2 },
      ],
      -1,
      2,
    ),
  ).toBeNull();
  expect(valueAt([], 5, 2)).toBeNull();
  expect(
    estimateGap(
      [
        { t: 0, v: 1 },
        { t: 1 / 15, v: 2 },
      ],
      15,
    ),
  ).toBe(0.25);
});

test("GPS interpolates only inside continuous coverage and takes short arc over antimeridian", () => {
  const track = [
    { t: 0, lat: 40, lon: 26, segment: 0 },
    { t: 10, lat: 42, lon: 28, segment: 0 },
    { t: 40, lat: 45, lon: 30, segment: 0 },
    { t: 45, lat: 46, lon: 31, segment: 1 },
  ];
  for (const t of [-1, 46, 20, 43])
    expect(interpolateTrackAtTime(track, t)).toBeNull();
  expect(interpolateTrackAtTime(track, 5)).toMatchObject({
    t: 5,
    lat: 41,
    lon: 27,
    segment: 0,
  });
  expect(interpolateTrackAtTime(track, 10)).toEqual(track[1]);
  expect(
    Math.abs(
      interpolateTrackAtTime(
        [
          { t: 0, lat: 0, lon: 179, segment: 0 },
          { t: 10, lat: 0, lon: -179, segment: 0 },
        ],
        5,
      )!.lon,
    ),
  ).toBe(180);
});
