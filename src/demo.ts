import type { Dataset, Channel, Project } from "./types";
import type { SavedProject } from "./storage";
import { sha256 } from "./storage";
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
    participant: "K-01",
    title: "Yeni bisiklet oturumu",
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
    sync: {
      videoOffset: 0,
      videoRate: 1,
      gpsOffset: 0,
      verified: false,
      anchors: [],
      uncertainty: 1,
      reason: "",
    },
    events: [],
    sourceTexts: [],
    audit: [],
    isDemo: false,
  };
}
export async function demoProject(): Promise<SavedProject> {
  const p = blankProject();
  p.isDemo = true;
  p.title = "Kıyı rotası · örnek çalışma";
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
      "Deri iletkenliği",
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
      "Kalp atış hızı",
      "bpm",
      1,
      (t) => 98 + 12 * Math.sin(t / 180) + 8 * Math.sin(t / 55),
    ],
    [
      "AX",
      "İvme X",
      "g",
      25,
      (t) =>
        0.2 +
        0.035 * Math.sin(t * 7) +
        (t > 312 && t < 326 ? 0.35 * Math.sin(t * 15) : 0),
    ],
    ["AY", "İvme Y", "g", 25, (t) => 0.05 + 0.018 * Math.cos(t * 6)],
    ["AZ", "İvme Z", "g", 25, (t) => 0.98 + 0.028 * Math.cos(t * 8)],
    [
      "PI",
      "PPG kızılötesi",
      "ham birim",
      25,
      (t) => 100000 + 1300 * Math.sin(t * 10.7) + 180 * Math.sin(t * 21.4),
    ],
    ["T1", "Sıcaklık", "°C", 7.5, (t) => 31.2 + 0.4 * Math.sin(t / 270)],
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
      warnings: ["Yalnızca eğitim için matematiksel olarak üretilmiş veri."],
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
      "Bu oturumun sinyalleri, konumları ve sahne çizimi sentetiktir; araştırma bulgusu değildir.",
    ],
  };
  p.dataset = dataset;
  p.audit = [
    {
      at: new Date().toISOString(),
      action: "Demo oluşturuldu",
      detail: "Deterministik sentetik veri; gerçek katılımcı yok.",
    },
  ];
  return p;
}
