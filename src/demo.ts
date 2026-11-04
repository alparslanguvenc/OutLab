import type { Dataset, Channel, Project } from "./types";
import type { SavedProject } from "./storage";
import { sha256 } from "./storage";
import { t } from "./i18n";
export const defaults = {
  baselineStart: 10,
  baselineEnd: 70,
  zThreshold: 3,
  minDistance: 20,
  motionThreshold: 3,
};
export function blankProject(): SavedProject {
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
    recordedAt: "",
    participant: t("K-01", "P-01"),
    title: t("Yeni bisiklet oturumu", "New cycling session"),
    dataset: {
      channels: [],
      track: [],
      sources: [],
      sensorOriginEpoch: null,
      gpxOriginEpoch: null,
      duration: 0,
      warnings: [],
    },
    analysis: null,
    config: { ...defaults },
    sync: { gpsOffset: 0 },
    videos: [],
    events: [],
    sourceTexts: [],
    audit: [],
    isDemo: false,
  };
}
export async function demoProject(): Promise<SavedProject> {
  const p = blankProject();
  p.isDemo = true;
  p.title = t("Kıyı rotası (örnek çalışma)", "Coastal route (sample study)");
  p.participant = "DEMO";
  p.recordedAt = "2026-09-14T09:00";
  const response = (t: number) =>
    [124, 219, 318, 438, 521].reduce((v, onset, i) => {
      const d = t - onset;
      return (
        v +
        (d > 0 ? (0.7 + i * 0.08) * (Math.exp(-d / 9) - Math.exp(-d / 1.1)) : 0)
      );
    }, 0);
  const specs: [string, string, string, number, (t: number) => number][] = [
    [
      "EA",
      t("Deri iletkenliği", "Skin conductance"),
      "µS",
      15,
      (t) =>
        3.5 +
        0.001 * t +
        0.06 * Math.sin(t / 13) +
        0.008 * Math.sin(t * 9) +
        response(t),
    ],
    [
      "HR",
      t("Kalp atış hızı", "Heart rate"),
      "bpm",
      1,
      (t) => 98 + 12 * Math.sin(t / 180) + 8 * Math.sin(t / 55),
    ],
    [
      "AX",
      t("İvme X", "Acceleration X"),
      "g",
      25,
      (t) =>
        0.2 +
        0.035 * Math.sin(t * 7) +
        (t > 312 && t < 326 ? 0.35 * Math.sin(t * 15) : 0),
    ],
    [
      "AY",
      t("İvme Y", "Acceleration Y"),
      "g",
      25,
      (t) => 0.05 + 0.018 * Math.cos(t * 6),
    ],
    [
      "AZ",
      t("İvme Z", "Acceleration Z"),
      "g",
      25,
      (t) => 0.98 + 0.028 * Math.cos(t * 8),
    ],
    [
      "PI",
      t("PPG kızılötesi", "PPG infrared"),
      t("ham birim", "raw units"),
      25,
      (t) => 100000 + 1300 * Math.sin(t * 10.7) + 180 * Math.sin(t * 21.4),
    ],
    [
      "T1",
      t("Sıcaklık", "Temperature"),
      "°C",
      7.5,
      (t) => 31.2 + 0.4 * Math.sin(t / 270),
    ],
  ];
  const channels: Channel[] = specs.map(([tag, label, unit, hz, fn]) => {
    const points = Array.from({ length: 600 * hz + 1 }, (_, i) => ({
      t: i / hz,
      v: Number(fn(i / hz).toFixed(6)),
    }));
    return {
      id: "demo-" + tag,
      tag,
      label,
      unit,
      points,
      sampleRate: hz,
      sourceId: "sentetik_" + tag + ".csv",
      quality: {
        totalRows: points.length,
        validRows: points.length,
        invalidRows: 0,
        duplicates: 0,
        gaps: 0,
        flat: false,
        warnings: [],
      },
    };
  });
  p.sourceTexts = channels.map((c) => ({
    name: c.sourceId,
    text:
      "EmotiBitTimestamp," +
      c.tag +
      "\n" +
      c.points.map((pt) => (pt.t * 1000).toFixed(3) + "," + pt.v).join("\n"),
  }));
  const sources = await Promise.all(
    p.sourceTexts.map(async (s, i) => ({
      name: s.name,
      sha256: await sha256(s.text),
      rows: channels[i].points.length,
      kind: "synthetic",
      warnings: [
        t(
          "Yalnızca eğitim için matematiksel olarak üretilmiş veri.",
          "Mathematically generated data, for training only.",
        ),
      ],
    })),
  );
  const dataset: Dataset = {
    channels,
    sources,
    track: Array.from({ length: 301 }, (_, i) => {
      const q = i / 300;
      return {
        t: i * 2,
        lat: 40.143 + q * 0.018 + 0.002 * Math.sin(q * 8),
        lon: 26.404 + 0.011 * Math.sin(q * 2.8) + q * 0.006,
        ele: 5 + 10 * Math.sin(q * 3),
        segment: 0,
      };
    }),
    sensorOriginEpoch: null,
    gpxOriginEpoch: null,
    duration: 600,
    warnings: [
      t(
        "Bu oturumun sinyalleri, konumları ve sahne çizimi sentetiktir; araştırma bulgusu değildir.",
        "The signals, locations and scene drawing in this session are synthetic; they are not research findings.",
      ),
    ],
  };
  p.dataset = dataset;
  p.audit = [
    {
      at: new Date().toISOString(),
      action: t("Demo oluşturuldu", "Demo created"),
      detail: t(
        "Deterministik sentetik veri; gerçek katılımcı yok.",
        "Deterministic synthetic data; no real participant.",
      ),
    },
  ];
  return p;
}
