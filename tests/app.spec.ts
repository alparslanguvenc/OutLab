import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import type { SavedProject } from "../src/storage";

const narrative =
  "Sentetik test anlatısı: Bu bölümde yolu izlediğimi hatırlıyorum; duygumdan emin değilim.";
const hash = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex");
const csvFixture = () =>
  "time,EA,AX,AY,AZ,PacketNumber,DataLength\n" +
  Array.from({ length: 1_351 }, (_, i) => {
    const t = i / 15;
    return `${t.toFixed(6)},${(3 + 0.03 * Math.sin(t / 5) + 0.005 * Math.sin(t * 9)).toFixed(6)},${(0.2 + 0.02 * Math.sin(t * 3)).toFixed(6)},0.05,0.98,${i},1`;
  }).join("\n");
const gpxFixture = (timed = true) =>
  `<?xml version="1.0"?><gpx version="1.1" creator="OutLab synthetic test" xmlns="http://www.topografix.com/GPX/1/1/"><trk><name>Sentetik test</name><trkseg>${[0, 2, 4].map((t, i) => `<trkpt lat="${40 + i * 0.0001}" lon="${26 + i * 0.0001}"><ele>${5 + i}</ele>${timed ? `<time>2026-01-01T09:00:0${t}Z</time>` : ""}</trkpt>`).join("")}</trkseg></trk></gpx>`;

async function ready(page: Page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByRole("heading", { name: "Kıyı rotası (örnek çalışma)" }),
  ).toBeVisible();
}
async function saved(page: Page) {
  await expect(page.locator(".save-state")).toHaveText("Yerelde kaydedildi");
}
async function nav(page: Page, title: string) {
  await page
    .locator("nav")
    .getByRole("button", { name: new RegExp(`^${title}(?:\\s|$)`) })
    .click();
}
async function downloadProject(
  page: Page,
  info: TestInfo,
  fileName = "synthetic-project.outlab.json",
) {
  await page.getByRole("button", { name: "Dışa aktar", exact: true }).click();
  const awaited = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Taşınabilir proje paketi", exact: false })
    .click();
  const downloaded = await awaited,
    path = info.outputPath(fileName);
  await downloaded.saveAs(path);
  await page.getByRole("button", { name: "Dışa aktarmayı kapat" }).click();
  const text = await readFile(path, "utf8");
  const envelope = JSON.parse(text) as {
    format: string;
    sha256: string;
    payload: string;
  };
  expect(envelope.format).toBe("outlab-project");
  expect(hash(envelope.payload)).toBe(envelope.sha256);
  return {
    path,
    envelope,
    project: JSON.parse(envelope.payload) as SavedProject,
  };
}
async function setTimeline(page: Page, value: number) {
  await page
    .getByRole("slider", { name: "Ortak zaman çizgisi", exact: true })
    .evaluate((node, v) => {
      // Exercise the actual range control and its input event, not React or IndexedDB internals.
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(node, String(v));
      node.dispatchEvent(new Event("input", { bubbles: true }));
      node.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
}
async function syntheticVideo(page: Page) {
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext("2d")!;
    const stream = canvas.captureStream(20),
      recorder = new MediaRecorder(stream, {
        mimeType: "video/webm;codecs=vp8",
      });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    let frame = 0;
    const draw = setInterval(() => {
      context.fillStyle = "#24583e";
      context.fillRect(0, 0, 320, 180);
      context.fillStyle = "#fff";
      context.font = "22px sans-serif";
      context.fillText(`SENTETIK TEST ${frame++}`, 20, 95);
    }, 50);
    recorder.start();
    await new Promise((resolve) => setTimeout(resolve, 3_100));
    recorder.stop();
    await stopped;
    clearInterval(draw);
    stream.getTracks().forEach((track) => track.stop());
    return Array.from(
      new Uint8Array(
        await new Blob(chunks, { type: "video/webm" }).arrayBuffer(),
      ),
    );
  });
  return {
    name: "sentetik-video.webm",
    mimeType: "video/webm",
    buffer: Buffer.from(bytes),
  };
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  (page as Page & { appErrors: string[] }).appErrors = errors;
});
test.afterEach(async ({ page }) => {
  expect(
    (page as Page & { appErrors: string[] }).appErrors,
    "uncaught application errors",
  ).toEqual([]);
});

test("demo analysis, candidate selection, neutral interview, autosave and portable restore", async ({
  page,
}, info) => {
  await ready(page);
  await expect(page.getByText("Sentetik demo", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Adayları hesapla", exact: true })
    .click();
  await expect(page.locator(".moment")).not.toHaveCount(0);
  await expect(page.locator(".busy")).toHaveCount(0);
  await saved(page);
  await page.screenshot({
    path: info.outputPath("analyzed-workspace.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: /anını görüşmeye ekle/ })
    .first()
    .click();
  await nav(page, "Görüşme odası");
  await page
    .getByLabel("Katılımcının kendi sözleri", { exact: false })
    .fill(narrative);
  await page
    .getByLabel("Araştırmacı kodları / yorum notu")
    .fill("Belirsiz hatırlama; doğrudan duygu ataması yapılmadı.");
  await page.getByLabel("Görüşme tarihi").fill("2026-09-20T10:30");
  await saved(page);
  await page
    .getByRole("button", { name: "Katılımcı görünümü", exact: true })
    .click();
  await expect(page.locator(".sidebar")).toHaveCount(0);
  await expect(page.locator(".rl-signal")).toHaveCount(0);
  await expect(
    page.getByText(
      "Bu bölümde neler yaşadığınızı, düşündüğünüzü ve hissettiğinizi anlatır mısınız?",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByText(/Robust z/)).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("participant-mode.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Araştırmacı görünümüne dön" })
    .click();
  const backup = await downloadProject(page, info);
  expect(
    backup.project.events.some(
      (event) => event.selected && event.narrative === narrative,
    ),
  ).toBe(true);
  expect(backup.project.analysis?.events.length).toBeGreaterThan(0);
  for (const source of backup.project.sourceTexts)
    expect(hash(source.text)).toBe(
      backup.project.dataset.sources.find((item) => item.name === source.name)!
        .sha256,
    );
  // A later analysis may change candidates, but selected interview evidence must
  // retain the parameters, score and source hashes from the run that produced it.
  const originalEvent = backup.project.events.find(
    (event) => event.selected && event.narrative === narrative,
  )!;
  expect(originalEvent.provenance?.config.zThreshold).toBe(3);
  await nav(page, "Analiz ayarları");
  await page.getByLabel("Aday eşiği (robust z)", { exact: false }).fill("4");
  await page
    .getByRole("button", { name: "Analizi yeniden çalıştır", exact: true })
    .click();
  await expect(page.locator(".busy")).toHaveCount(0);
  const rerun = await downloadProject(page, info, "after-rerun.outlab.json");
  expect(rerun.project.analysisRuns).toHaveLength(2);
  expect(
    rerun.project.events.find((event) => event.id === originalEvent.id)
      ?.provenance,
  ).toEqual(originalEvent.provenance);
  expect(
    rerun.project.events.find((event) => event.id === originalEvent.id)
      ?.narrative,
  ).toBe(narrative);
  await saved(page);
  await page.reload();
  await page.waitForLoadState("networkidle");
  await nav(page, "Görüşme odası");
  await expect(
    page.getByLabel("Katılımcının kendi sözleri", { exact: false }),
  ).toHaveValue(narrative);
  await page.locator(".session-switch").click();
  await page.getByRole("button", { name: "Yeni oturum", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Yeni bisiklet oturumu" }),
  ).toBeVisible();
  await page.getByTestId("project-input").setInputFiles(backup.path);
  await expect(
    page.getByRole("heading", { name: "Kıyı rotası (örnek çalışma)" }),
  ).toBeVisible();
  await nav(page, "Görüşme odası");
  await expect(
    page.getByLabel("Katılımcının kendi sözleri", { exact: false }),
  ).toHaveValue(narrative);
});

test("all recognized CSV columns, explicit manual mapping, GPX and source hashes survive import", async ({
  page,
}, info) => {
  await ready(page);
  const wide = csvFixture(),
    manual = "clock,skin,PacketNumber\n0,90,0\n1,91,1\n2,92,2\n3,93,3";
  await page.getByTestId("data-input").setInputFiles([
    {
      name: "synthetic-wide.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(wide),
    },
    {
      name: "synthetic-custom.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(manual),
    },
    {
      name: "synthetic-route.gpx",
      mimeType: "application/gpx+xml",
      buffer: Buffer.from(gpxFixture()),
    },
  ]);
  const dialog = page.getByRole("dialog", {
    name: "Dosyalarınızı buraya bırakın",
  });
  await expect(dialog.locator(".mapping")).toHaveCount(3);
  const wideMapping = dialog.locator(".mapping").filter({
    has: page.locator("summary").filter({ hasText: "synthetic-wide.csv" }),
  });
  await wideMapping.getByLabel("Değer sütunu").selectOption("*");
  await wideMapping.getByLabel("Zaman sütunu").selectOption("time");
  await wideMapping.getByLabel("Zaman birimi").selectOption("s");
  const mapping = dialog.locator(".mapping").filter({
    has: page.locator("summary").filter({ hasText: "synthetic-custom.csv" }),
  });
  await mapping.getByLabel("Sensör türü").selectOption("HR");
  await mapping.getByLabel("Zaman sütunu").selectOption("clock");
  await mapping.getByLabel("Değer sütunu").selectOption("skin");
  await mapping.getByLabel("Zaman birimi").selectOption("s");
  await dialog
    .getByRole("button", {
      name: "Eşlemeleri onayla ve içe aktar",
      exact: false,
    })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("5 kanal", { exact: true })).toBeVisible();
  const backup = await downloadProject(page, info);
  expect(backup.project.isDemo).toBe(false);
  expect(backup.project.dataset.channels.map((c) => c.tag).sort()).toEqual([
    "AX",
    "AY",
    "AZ",
    "EA",
    "HR",
  ]);
  expect(
    backup.project.dataset.channels
      .find((c) => c.tag === "HR")
      ?.points.map((p) => p.v),
  ).toEqual([90, 91, 92, 93]);
  expect(backup.project.dataset.track).toHaveLength(3);
  expect(
    backup.project.dataset.sources.find(
      (source) => source.name === "synthetic-wide.csv",
    )?.sha256,
  ).toBe(hash(wide));
  expect(
    backup.project.dataset.sources.find(
      (source) => source.name === "synthetic-custom.csv",
    )?.sha256,
  ).toBe(hash(manual));
  expect(backup.project.analysis).toBeNull();
  expect(backup.project.videos.some((v) => v.verified)).toBe(false);
});

test("GPX without timestamps is visibly refused and does not replace the current session", async ({
  page,
}) => {
  await ready(page);
  await page.getByTestId("data-input").setInputFiles({
    name: "no-time-synthetic.gpx",
    mimeType: "application/gpx+xml",
    buffer: Buffer.from(gpxFixture(false)),
  });
  const dialog = page.getByRole("dialog", {
    name: "Dosyalarınızı buraya bırakın",
  });
  // Invalid GPX is rejected during inspection, before an import can be approved.
  await expect(dialog.locator(".mapping")).toHaveCount(0);
  await expect(
    dialog.getByRole("button", {
      name: "Eşlemeleri onayla ve içe aktar",
      exact: false,
    }),
  ).toBeDisabled();
  await expect(page.locator(".error")).toContainText(/zaman|time/i);
  await expect(dialog).toBeVisible();
  await page.getByRole("button", { name: "İçe aktarmayı kapat" }).click();
  await expect(
    page.getByRole("heading", { name: "Kıyı rotası (örnek çalışma)" }),
  ).toBeVisible();
});

test("analysis parameter changes remain stale after autosave and reload", async ({
  page,
}) => {
  await ready(page);
  await page
    .getByRole("button", { name: "Adayları hesapla", exact: true })
    .click();
  await expect(page.locator(".moment")).not.toHaveCount(0);
  await nav(page, "Analiz ayarları");
  await page.getByLabel("Aday eşiği (robust z)", { exact: false }).fill("4");
  await expect(
    page.getByText(
      "Ayarlar değişti; grafik ve adaylar önceki çalıştırmaya aittir.",
      { exact: true },
    ),
  ).toBeVisible();
  await saved(page);
  await page.reload();
  await page.waitForLoadState("networkidle");
  await nav(page, "Analiz ayarları");
  await expect(
    page.getByLabel("Aday eşiği (robust z)", { exact: false }),
  ).toHaveValue("4");
  await expect(
    page.getByText(
      "Ayarlar değişti; grafik ve adaylar önceki çalıştırmaya aittir.",
      { exact: true },
    ),
  ).toBeVisible();
});

test("tampered portable package fails the integrity check without changing the session", async ({
  page,
}, info) => {
  await ready(page);
  const backup = await downloadProject(page, info);
  const tampered = {
    ...backup.envelope,
    payload: backup.envelope.payload + " ",
  };
  await page.getByTestId("project-input").setInputFiles({
    name: "tampered.outlab.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(tampered)),
  });
  await expect(page.locator(".error")).toContainText(/SHA-256|bütünlük/);
  await expect(
    page.getByRole("heading", { name: "Kıyı rotası (örnek çalışma)" }),
  ).toBeVisible();
});

test("GPS verification is independent of video and invalidated when its offset changes", async ({
  page,
}, info) => {
  await ready(page);
  await page
    .getByTestId("video-input")
    .setInputFiles(await syntheticVideo(page));
  await nav(page, "Zaman eşleme");
  await page
    .getByLabel("Eşlemenin dayanağı", { exact: false })
    .fill("Sentetik video başlangıç işareti.");
  await page
    .getByRole("button", { name: "Eşlemeyi uygula ve kaydet", exact: true })
    .click();
  await expect(page.getByText("Eşleme kayıtlı", { exact: true })).toBeVisible();
  await expect(
    page.getByText("GPX zaman eşlemesi henüz doğrulanmadı.", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("GPX eşlemesinin dayanağı", { exact: true })
    .fill("Sentetik GPX başlangıcı bağımsız kontrol edildi.");
  await page
    .getByRole("button", { name: "GPX kontrolünü kaydet", exact: true })
    .click();
  await expect(
    page.getByText("GPX eşlemesi araştırmacı kontrolüyle kaydedildi.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel("GPX başlangıcının sensör eksenindeki zamanı (s)", {
      exact: false,
    })
    .fill("5");
  await expect(
    page.getByText("GPX zaman eşlemesi henüz doğrulanmadı.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Eşleme kayıtlı", { exact: true })).toBeVisible();
  const backup = await downloadProject(page, info);
  expect(backup.project.videos[0].verified).toBe(true);
  expect(backup.project.sync.gpsVerified).toBe(false);
  expect(backup.project.sync.gpsOffset).toBe(5);
  await saved(page);
  await page.reload();
  await page.waitForLoadState("networkidle");
  await nav(page, "Zaman eşleme");
  await expect(
    page.getByText("GPX zaman eşlemesi henüz doğrulanmadı.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Eşleme kayıtlı", { exact: true })).toBeVisible();
});

test("late analysis response cannot overwrite a newly imported dataset", async ({
  page,
}, info) => {
  await ready(page);
  let release!: () => void, fetched!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const received = new Promise<void>((resolve) => {
    fetched = resolve;
  });
  await page.route("**/api/analyze", async (route) => {
    const response = await route.fetch();
    fetched();
    await pending;
    await route.fulfill({ response });
  });
  await page
    .getByRole("button", { name: "Adayları hesapla", exact: true })
    .click();
  await received;
  await page.getByTestId("data-input").setInputFiles({
    name: "replacement-synthetic.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csvFixture()),
  });
  const dialog = page.getByRole("dialog", {
    name: "Dosyalarınızı buraya bırakın",
  });
  await expect(dialog.locator(".mapping")).toHaveCount(1);
  await dialog.getByLabel("Değer sütunu").selectOption("*");
  await dialog.getByLabel("Zaman birimi").selectOption("s");
  await dialog
    .getByRole("button", {
      name: "Eşlemeleri onayla ve içe aktar",
      exact: false,
    })
    .click();
  await expect(dialog).toHaveCount(0);
  const completed = page.waitForResponse("**/api/analyze");
  release();
  await completed;
  await expect(page.locator(".busy")).toHaveCount(0);
  const backup = await downloadProject(page, info);
  expect(backup.project.dataset.sources.map((source) => source.name)).toEqual([
    "replacement-synthetic.csv",
  ]);
  expect(backup.project.analysis).toBeNull();
  expect(backup.project.events).toHaveLength(0);
  expect(backup.project.isDemo).toBe(false);
});

test("real local video, two anchors, positive offset, synchronized seek and bounded interview clip", async ({
  page,
}, info) => {
  await ready(page);
  await page
    .getByTestId("video-input")
    .setInputFiles(await syntheticVideo(page));
  await expect(page.locator("video")).toHaveJSProperty("readyState", 4);
  await nav(page, "Zaman eşleme");
  await page.getByLabel("Videodaki olay zamanı (s)", { exact: true }).fill("0");
  await page
    .getByLabel("Sensör zamanındaki aynı olay (s)", { exact: true })
    .fill("20");
  await page
    .getByLabel("İkinci bir ortak olayla saat kaymasını da düzelt")
    .check();
  await page
    .getByLabel("İkinci olay: video zamanı (s)", { exact: true })
    .fill("2");
  await page
    .getByLabel("İkinci olay: sensör zamanı (s)", { exact: true })
    .fill("22.04");
  await page
    .getByLabel("Eşlemenin dayanağı", { exact: false })
    .fill("Sentetik video testi; başlangıç ve ikinci saniye işaretleri.");
  await page
    .getByRole("button", { name: "Eşlemeyi uygula ve kaydet", exact: true })
    .click();
  await expect(page.locator(".formula")).toContainText("1,02");
  await expect(page.locator(".formula")).toContainText("20");
  await nav(page, "Çalışma alanı");
  await expect(
    page.getByText("Bu anda video kaydı yok", { exact: true }),
  ).toBeVisible();
  await setTimeline(page, 20.2);
  await expect
    .poll(() =>
      page
        .locator("video")
        .evaluate((video) => (video as HTMLVideoElement).currentTime),
    )
    .toBeCloseTo(0.2 / 1.02, 1);
  await setTimeline(page, 20.1);
  await expect
    .poll(() =>
      page
        .locator("video")
        .evaluate((video) => (video as HTMLVideoElement).currentTime),
    )
    .toBeCloseTo(0.1 / 1.02, 1);
  await page
    .locator(".rl-video")
    .getByRole("button", { name: "Oynat", exact: true })
    .click();
  await expect
    .poll(async () =>
      Number(
        await page
          .getByRole("slider", { name: "Ortak zaman çizgisi", exact: true })
          .inputValue(),
      ),
    )
    .toBeGreaterThan(20.4);
  await page
    .locator(".rl-video")
    .getByRole("button", { name: "Duraklat", exact: true })
    .click();
  await setTimeline(page, 21);
  await page.getByRole("button", { name: "Anı işaretle", exact: true }).click();
  await nav(page, "Görüşme odası");
  await page.getByLabel("Öncesi (s)", { exact: true }).fill("0");
  await page.getByLabel("Sonrası (s)", { exact: true }).fill("1");
  await page
    .getByRole("button", { name: "Bu bölümü izle", exact: true })
    .click();
  await expect
    .poll(() =>
      page
        .locator("video")
        .evaluate((video) => (video as HTMLVideoElement).currentTime),
    )
    .toBeGreaterThan(1.8);
  await expect(page.locator("video")).toHaveJSProperty("paused", true);
  await expect
    .poll(() =>
      page
        .locator("video")
        .evaluate((video) => (video as HTMLVideoElement).currentTime),
    )
    .toBeCloseTo(2 / 1.02, 1);
  await page.getByRole("button", { name: "360°", exact: true }).click();
  await expect(page.locator(".rl-panorama canvas")).toHaveCount(1);
  await page.screenshot({
    path: info.outputPath("real-video-360.png"),
    fullPage: true,
  });
  const backup = await downloadProject(page, info);
  expect(backup.project.videos).toHaveLength(1);
  expect(backup.project.videos[0].offset).toBeCloseTo(20);
  expect(backup.project.videos[0].rate).toBeCloseTo(1.02);
  expect(backup.project.videos[0].anchors).toHaveLength(2);
  await saved(page);
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByText("Video yeniden bağlanmalı", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("video")).toHaveCount(0);
});

test("four videos: limit, per-video sync, playhead follows and chains videos, reconnect and legacy package migration", async ({
  page,
}, info) => {
  await ready(page);
  const clip = await syntheticVideo(page);
  const paths = [1, 2, 3, 4, 5].map((i) => info.outputPath(`part${i}.webm`));
  await Promise.all(paths.map((path) => writeFile(path, clip.buffer)));
  await page.getByTestId("video-input").setInputFiles(paths.slice(0, 4));
  const workspaceSlots = page.locator(".video-card .video-slot");
  await expect(workspaceSlots).toHaveCount(4);
  await expect(
    page.getByRole("button", { name: /Video ekle \(4\/4\)/ }),
  ).toBeDisabled();
  await page.getByTestId("video-input").setInputFiles(paths[4]);
  await expect(page.locator(".error")).toContainText("en fazla 4 video");
  await expect(workspaceSlots).toHaveCount(4);

  // Video 1 is on screen; read its real length to place Video 2 right after it.
  await workspaceSlots.nth(0).getByRole("tab").click();
  await expect(page.locator(".rl-video-file strong")).toHaveText(
    "Video 1: part1.webm",
  );
  await expect(page.locator("video")).toHaveJSProperty("readyState", 4);
  const first = await page
    .locator("video")
    .evaluate((video) => (video as HTMLVideoElement).duration);
  expect(first).toBeGreaterThan(2);
  const start2 = Math.floor(first * 100) / 100 - 0.02;

  await nav(page, "Zaman eşleme");
  await page.locator(".video-strip.sync").getByRole("tab").nth(1).click();
  await expect(page.locator(".page-grid h3").first()).toContainText("Video 2");
  await page.getByLabel("Videodaki olay zamanı (s)", { exact: true }).fill("0");
  await page
    .getByLabel("Sensör zamanındaki aynı olay (s)", { exact: true })
    .fill(String(start2));
  await page
    .getByLabel("Eşlemenin dayanağı", { exact: false })
    .fill("Sentetik ardışık parça; ilk parçanın bitişi.");
  await page
    .getByRole("button", { name: "Eşlemeyi uygula ve kaydet", exact: true })
    .click();
  await expect(page.getByText("Eşleme kayıtlı", { exact: true })).toBeVisible();
  await page.locator(".video-strip.sync").getByRole("tab").nth(0).click();
  await expect(page.getByText("Doğrulanmadı", { exact: true })).toBeVisible();

  await nav(page, "Çalışma alanı");
  await setTimeline(page, start2 + 1);
  await expect(page.locator(".rl-video-file strong")).toHaveText(
    "Video 2: part2.webm",
  );
  await setTimeline(page, 0.5);
  await expect(page.locator(".rl-video-file strong")).toHaveText(
    "Video 1: part1.webm",
  );
  // Playing past the end of Video 1 continues in Video 2.
  await setTimeline(page, first - 0.6);
  await page
    .locator(".rl-video")
    .getByRole("button", { name: "Oynat", exact: true })
    .click();
  await expect(page.locator(".rl-video-file strong")).toHaveText(
    "Video 2: part2.webm",
  );
  await expect
    .poll(async () =>
      Number(
        await page
          .getByRole("slider", { name: "Ortak zaman çizgisi", exact: true })
          .inputValue(),
      ),
    )
    .toBeGreaterThan(first + 0.3);
  await page
    .locator(".rl-video")
    .getByRole("button", { name: "Duraklat", exact: true })
    .click();

  await page
    .getByRole("button", { name: "Video 4 videosunu kaldır", exact: true })
    .click();
  await expect(workspaceSlots).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: /Video ekle \(3\/4\)/ }),
  ).toBeEnabled();
  await expect(page.locator(".notice.warning").first()).toContainText(
    "2/3 videonun eşlemesi doğrulanmadı.",
  );
  const backup = await downloadProject(page, info, "four-videos.outlab.json");
  expect(backup.project.videos.map((v) => v.name)).toEqual([
    "part1.webm",
    "part2.webm",
    "part3.webm",
  ]);
  expect(backup.project.videos[1].offset).toBeCloseTo(start2, 5);
  expect(backup.project.videos[1].verified).toBe(true);
  expect(backup.project.videos[0].verified).toBe(false);
  expect(backup.project.videos[0].duration).toBeCloseTo(first, 2);

  // After a reload the same file reconnects to its slot with its mapping kept.
  await saved(page);
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByText("3 video yeniden bağlanmalı", { exact: true }),
  ).toBeVisible();
  await page.getByTestId("video-input").setInputFiles(paths[1]);
  await expect(workspaceSlots).toHaveCount(3);
  await expect(
    page.getByText("2 video yeniden bağlanmalı", { exact: true }),
  ).toBeVisible();
  await expect(workspaceSlots.nth(1)).toContainText("eşlendi");
  await expect(workspaceSlots.nth(1)).not.toContainText(/yeniden bağlanmalı/i);

  // A package from the single-video RotaLab release keeps its verified mapping.
  const { videos: _dropped, ...legacy } = JSON.parse(
    backup.envelope.payload,
  ) as SavedProject;
  const v = backup.project.videos[1];
  legacy.id = "legacy-single-video";
  legacy.title = "Eski tek videolu oturum";
  legacy.videoFile = {
    name: v.name,
    size: v.size,
    lastModified: v.lastModified,
  };
  legacy.sync = {
    ...legacy.sync,
    videoOffset: 12.5,
    videoRate: 1.001,
    verified: true,
    anchors: [{ videoTime: 1, sensorTime: 13.501 }],
    uncertainty: 0.5,
    reason: "Eski sürüm eşlemesi",
  };
  const payload = JSON.stringify(legacy);
  await page.getByTestId("project-input").setInputFiles({
    name: "eski.rotalab.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        format: "rotalab-project",
        version: 1,
        sha256: hash(payload),
        payload,
      }),
    ),
  });
  await expect(
    page.getByRole("heading", { name: "Eski tek videolu oturum" }),
  ).toBeVisible();
  await expect(workspaceSlots).toHaveCount(1);
  await nav(page, "Zaman eşleme");
  await expect(page.locator(".formula")).toContainText("12,5");
  await expect(page.getByText("Eşleme kayıtlı", { exact: true })).toBeVisible();
  const migrated = await downloadProject(page, info, "migrated.outlab.json");
  expect(migrated.project.videos).toHaveLength(1);
  expect(migrated.project.videos[0].offset).toBe(12.5);
  expect(migrated.project.videos[0].verified).toBe(true);
  expect(migrated.project.sync.videoOffset).toBeUndefined();
});

test("language switcher translates the interface, persists across reloads and switches back", async ({
  page,
}) => {
  await ready(page);
  const switcher = page.getByRole("group", { name: "Arayüz dili" });
  await expect(
    switcher.getByRole("button", { name: "Türkçe", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await switcher.getByRole("button", { name: "English", exact: true }).click();
  const nav = page.locator("nav");
  await expect(nav.getByRole("button", { name: /^Workspace/ })).toBeVisible();
  await expect(nav.getByRole("button", { name: /^Time sync/ })).toBeVisible();
  await expect(nav.getByRole("button", { name: /^Zaman eşleme/ })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Compute candidates", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");
  await expect(page.locator(".save-state")).toHaveText("Saved locally");

  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(nav.getByRole("button", { name: /^Time sync/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");
  const englishSwitcher = page.getByRole("group", {
    name: "Interface language",
  });
  await expect(
    englishSwitcher.getByRole("button", { name: "English", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  // The switcher stays reachable in participant mode, where the top bar is hidden.
  await page.getByRole("button", { name: "Mark moment", exact: true }).click();
  await nav.getByRole("button", { name: /^Interview room/ }).click();
  await page
    .getByRole("button", { name: "Participant view", exact: true })
    .click();
  await expect(page.locator(".sidebar")).toHaveCount(0);
  await englishSwitcher
    .getByRole("button", { name: "Türkçe", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Araştırmacı görünümüne dön", exact: true })
    .click();
  await expect(
    nav.getByRole("button", { name: /^Zaman eşleme/ }),
  ).toBeVisible();
  await expect(nav.getByRole("button", { name: /^Time sync/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.lang)).toBe("tr");
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByRole("heading", { name: "Kıyı rotası (örnek çalışma)" }),
  ).toBeVisible();
  await expect(
    nav.getByRole("button", { name: /^Çalışma alanı/ }),
  ).toBeVisible();
});

test("optional artifact methods run in addition to the core analysis and manual labels give agreement", async ({
  page,
}, info) => {
  await ready(page);
  await nav(page, "Analiz ayarları");
  // Core-only run first: no extras, no badges.
  await page
    .getByRole("button", { name: "Analizi çalıştır", exact: true })
    .click();
  await expect(
    page.getByText("Çalıştırma kaydı", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".optional-results")).toHaveCount(0);
  const core = await downloadProject(page, info, "core.outlab.json");
  const coreTimes = core.project.analysis!.events.map((e) => e.t);
  expect(core.project.analysis!.extras).toEqual({});

  await page.getByLabel("Kalite kuralları", { exact: true }).check();
  await page.getByLabel("Çoklu yöntem sağlamlığı", { exact: true }).check();
  await expect(page.getByText(/Ayarlar değişti/)).toBeVisible();
  await page
    .getByRole("button", {
      name: "Analizi ek yöntemlerle çalıştır",
      exact: true,
    })
    .click();
  await expect(page.locator(".optional-results")).toContainText(
    "Kullanılabilir veri",
  );
  await expect(page.locator(".optional-results")).toContainText(
    "highpass + neurokit",
  );
  await expect(page.getByText(/Ayarlar değişti/)).toHaveCount(0);

  const extended = await downloadProject(page, info, "extended.outlab.json");
  const analysis = extended.project.analysis!;
  // Purely additive in flag mode: same candidates, plus per-candidate checks.
  expect(analysis.events.map((e) => e.t)).toEqual(coreTimes);
  expect(Object.keys(analysis.extras!).sort()).toEqual([
    "quality",
    "robustness",
  ]);
  expect(analysis.events.every((e) => e.checks?.support?.total)).toBe(true);
  expect(extended.project.options!.quality.enabled).toBe(true);

  await nav(page, "Çalışma alanı");
  await expect(page.locator(".moment .badge").first()).toContainText(
    /Destek \d+\/\d+/,
  );

  // Two coders label overlapping ranges while watching; agreement appears on the data tab.
  const labelRange = async (
    coder: string,
    from: number,
    to: number,
    kind: string,
  ) => {
    if (
      await page
        .getByRole("button", { name: "Aralık etiketle", exact: true })
        .isVisible()
    )
      await page
        .getByRole("button", { name: "Aralık etiketle", exact: true })
        .click();
    await page
      .locator(".annotation-bar")
      .getByLabel("Kodlayıcı", { exact: true })
      .fill(coder);
    await setTimeline(page, from);
    await page
      .locator(".annotation-bar")
      .getByRole("button", { name: /^Başlangıç/ })
      .click();
    await setTimeline(page, to);
    await page
      .locator(".annotation-bar")
      .getByRole("button", { name: /^Bitiş/ })
      .click();
    await page.locator(".annotation-bar select").first().selectOption(kind);
    await page
      .getByRole("button", { name: "Etiketi kaydet", exact: true })
      .click();
  };
  await labelRange("K1", 100, 140, "artifact");
  await labelRange("K1", 140, 200, "valid");
  await labelRange("K2", 110, 150, "artifact");
  await labelRange("K2", 150, 200, "valid");
  await expect(page.locator(".rl-band-artifact")).not.toHaveCount(0);

  await nav(page, "Veri & kalite");
  const panel = page.locator(".annotation-panel");
  await expect(panel.locator("tbody tr").first()).toContainText("K1");
  await expect(panel.locator(".agreement-result")).toContainText(
    "Cohen's kappa",
  );
  // Only bins both coders labelled count (100–110 s is K1-only). Over 90 s: 30 shared artifact,
  // 50 shared valid, 10 disagreeing → po = 0.889, pe = 0.519, kappa = 0.769.
  const kappa = Number(
    (await panel.locator(".agreement-result dd b").first().innerText()).replace(
      ",",
      ".",
    ),
  );
  expect(kappa).toBeGreaterThan(0.75);
  expect(kappa).toBeLessThan(0.79);
  await expect(panel).toContainText("Kalite kuralları");
  await page.screenshot({
    path: info.outputPath("agreement.png"),
    fullPage: true,
  });

  // Labels persist, travel in the package, and the methods guide opens from the panel.
  const backup = await downloadProject(page, info, "labels.outlab.json");
  expect(backup.project.annotations).toHaveLength(4);
  await panel.getByRole("button", { name: "Yöntemi oku", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Yöntem rehberi" }),
  ).toBeVisible();
});

test("desktop and mobile layouts remain usable without horizontal overflow", async ({
  page,
}, info) => {
  await ready(page);
  await saved(page);
  await page.screenshot({
    path: info.outputPath("desktop-workspace.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 2,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  const overlap = await page.evaluate(() => {
    const paragraph = document
      .querySelector(".rl-storyboard-label p")!
      .getBoundingClientRect();
    const clock = document
      .querySelector(".rl-scene-time")!
      .getBoundingClientRect();
    return paragraph.bottom > clock.top;
  });
  expect(overlap, "synthetic scene explanation and timestamp overlap").toBe(
    false,
  );
  await expect(page.locator(".rl-chart-footer")).toContainText(
    "Ham kaynak serileri",
  );
  await expect(page.locator(".rl-chart-footer")).not.toContainText("İşlenmiş");
  await page.screenshot({
    path: info.outputPath("mobile-workspace.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 2,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Veri ekle", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Dosyalarınızı buraya bırakın" }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("mobile-import.png"),
    fullPage: true,
  });
});
