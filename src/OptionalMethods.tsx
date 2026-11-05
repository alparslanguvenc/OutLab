import { useMemo, useState } from "react";
import { BookOpen, Check, Flag, Trash2 } from "lucide-react";
import { formatTime as time } from "./components/geometry";
import type { ChartBand } from "./components/SignalChart";
import { getLang, locale, t, useLang } from "./i18n";
import { Field, Info, Num } from "./ui";
import { agreement, autoBins, coderBins, kappaBand } from "./agreement";
import type {
  Analysis,
  AnalysisOptions,
  Annotation,
  AnnotationLabel,
  Candidate,
  Decomposition,
  PeakMethod,
  QualityReason,
} from "./types";

export type GuideSection =
  "core" | "quality" | "motion" | "annotation" | "robustness" | "ledalab";

const fmt = (v: number | null | undefined, digits = 2) =>
  v == null || !Number.isFinite(v)
    ? "—"
    : v.toLocaleString(locale(), { maximumFractionDigits: digits });
const pct = (v: number | null | undefined, digits = 1) =>
  v == null
    ? "—"
    : getLang() === "en"
      ? `${fmt(v, digits)}%`
      : `%${fmt(v, digits)}`;

const DECOMPOSITIONS: [Decomposition, string][] = [
  ["highpass", "Highpass 0,05 Hz"],
  ["smoothmedian", "Smooth median"],
  ["cvxEDA", "cvxEDA (Greco 2016)"],
];
const PEAK_METHODS: [PeakMethod, string][] = [
  ["neurokit", "NeuroKit2"],
  ["kim2004", "Kim 2004"],
  ["gamboa2008", "Gamboa 2008"],
  ["nabian2018", "Nabian 2018"],
  ["vanhalem2020", "van Halem 2020"],
];

export const reasonLabel = (reason: QualityReason | string) =>
  ({
    range: t("aralık dışı", "out of range"),
    slope: t("ani eğim", "steep slope"),
    temperature: t("sıcaklık", "temperature"),
    flat: t("düz çizgi", "flat line"),
    transition: t("geçiş payı", "transition margin"),
    acceleration: t("ivme değişkenliği", "acceleration variability"),
    gyroscope: t("jiroskop", "gyroscope"),
  })[reason] ?? reason;

const labelName = (label: AnnotationLabel) =>
  ({
    artifact: t("Artefakt", "Artifact"),
    valid: t("Geçerli", "Valid"),
    unsure: t("Emin değilim", "Unsure"),
  })[label];

export const ANNOTATION_REASONS = [
  ["bump", "Yol darbesi / çukur", "Road bump / pothole"],
  ["grip", "Tutuş değişimi", "Grip change"],
  ["touch", "Sensöre dokunma", "Touching the sensor"],
  ["arm", "Kol hareketi / işaret", "Arm movement / gesture"],
  ["contact", "Elektrot teması şüphesi", "Suspected electrode contact"],
  ["stop", "Duruş / iniş", "Stop / dismount"],
  ["other", "Diğer", "Other"],
] as const;
export const annotationReason = (key: string) => {
  const found = ANNOTATION_REASONS.find((r) => r[0] === key);
  return found ? t(found[1], found[2]) : key;
};

/* ------------------------------------------------------------------ settings form */

export function OptionalMethodsForm({
  options,
  onChange,
  temperatureTags,
  hasGyro,
  hasTrack,
  onGuide,
}: {
  options: AnalysisOptions;
  onChange: (next: AnalysisOptions) => void;
  temperatureTags: string[];
  hasGyro: boolean;
  hasTrack: boolean;
  onGuide: (section: GuideSection) => void;
}) {
  useLang();
  const q = options.quality,
    m = options.motionWindows,
    r = options.robustness;
  const set = <K extends keyof AnalysisOptions>(
    key: K,
    patch: Partial<AnalysisOptions[K]>,
  ) => onChange({ ...options, [key]: { ...options[key], ...patch } });
  const combos =
    r.peakMethods.filter((p) => p !== "vanhalem2020").length *
      r.decompositions.length +
    (r.peakMethods.includes("vanhalem2020") ? 1 : 0);
  const toggle = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
  const guide = (section: GuideSection) => (
    <button
      type="button"
      className="text-button guide-link"
      onClick={() => onGuide(section)}
    >
      <BookOpen size={14} /> {t("Yöntemi oku", "Read about the method")}
    </button>
  );
  return (
    <section className="card padded optional-methods">
      <h2>
        {t(
          "3. Ek artefakt ve güvenirlik yöntemleri",
          "3. Additional artifact and reliability methods",
        )}
      </h2>
      <p>
        {t(
          "Hepsi isteğe bağlıdır ve temel analize ek olarak çalışır. Kapalıyken sonuçlar bugünküyle aynıdır. Açtığınız yöntemler ham veriyi değiştirmez; yalnızca “dışla” seçeneği aday aramasını etkiler.",
          "All of these are optional and run in addition to the core analysis. While they are off, results are exactly as before. Enabled methods never change raw data; only the “exclude” choice affects the candidate search.",
        )}
      </p>

      <fieldset className={`method-option ${q.enabled ? "on" : ""}`}>
        <legend>
          <label className="check-row">
            <input
              type="checkbox"
              checked={q.enabled}
              onChange={(e) => set("quality", { enabled: e.target.checked })}
            />
            {t("Kalite kuralları", "Quality rules")}
          </label>
          {guide("quality")}
        </legend>
        <p>
          {t(
            "EDA'yı şeffaf eşiklerle tarar: fizyolojik aralık, ani eğim, deri sıcaklığı, düz çizgi ve bunların çevresindeki geçiş payı. Her örnek neden koduyla işaretlenir; oturumun kullanılabilir veri yüzdesi raporlanır.",
            "Screens EDA with transparent thresholds: physiological range, steep slope, skin temperature, flat line, and a transition margin around them. Every sample gets reason codes, and the session's usable-data percentage is reported.",
          )}
        </p>
        {q.enabled && (
          <>
            <div className="form-grid three">
              <Field label={t("En düşük EDA (µS)", "Minimum EDA (µS)")}>
                <Num
                  value={q.minUs}
                  min={0}
                  step={0.01}
                  onChange={(n) => set("quality", { minUs: n })}
                />
              </Field>
              <Field label={t("En yüksek EDA (µS)", "Maximum EDA (µS)")}>
                <Num
                  value={q.maxUs}
                  min={1}
                  step={1}
                  onChange={(n) => set("quality", { maxUs: n })}
                />
              </Field>
              <Field label={t("En büyük eğim (µS/s)", "Maximum slope (µS/s)")}>
                <Num
                  value={q.maxSlope}
                  min={0.1}
                  step={0.5}
                  onChange={(n) => set("quality", { maxSlope: n })}
                />
              </Field>
              <Field
                label={t("Sıcaklık kanalı", "Temperature channel")}
                help={
                  temperatureTags.length
                    ? t(
                        "EmotiBit T1, PPG sensörünün sıcaklığıdır; deri sıcaklığı değildir. Eşikleri kendi cihazınızla doğrulayın.",
                        "EmotiBit T1 is the PPG sensor's temperature, not skin temperature. Check the limits against your own device.",
                      )
                    : t(
                        "°C birimli T0/T1/TH kanalı yok; sıcaklık kuralı atlanır.",
                        "No T0/T1/TH channel in °C; the temperature rule is skipped.",
                      )
                }
              >
                <select
                  value={q.temperatureTag ?? ""}
                  onChange={(e) =>
                    set("quality", {
                      temperatureTag: (e.target.value ||
                        null) as AnalysisOptions["quality"]["temperatureTag"],
                    })
                  }
                >
                  <option value="">{t("Kullanma", "Don't use")}</option>
                  {temperatureTags.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label={t("En düşük sıcaklık (°C)", "Minimum temperature (°C)")}
              >
                <Num
                  value={q.tempMin}
                  step={0.5}
                  onChange={(n) => set("quality", { tempMin: n })}
                />
              </Field>
              <Field
                label={t("En yüksek sıcaklık (°C)", "Maximum temperature (°C)")}
              >
                <Num
                  value={q.tempMax}
                  step={0.5}
                  onChange={(n) => set("quality", { tempMax: n })}
                />
              </Field>
              <Field
                label={t("Ön filtre (s)", "Pre-filter (s)")}
                help={t(
                  "EDAQA'nın sıfır fazlı hareketli ortalaması; 0 kapatır. Kısa sıçramaları yumuşatır.",
                  "EDAQA's zero-phase moving average; 0 turns it off. Smooths brief spikes.",
                )}
              >
                <Num
                  value={q.prefilterSeconds}
                  min={0}
                  max={30}
                  step={0.5}
                  onChange={(n) => set("quality", { prefilterSeconds: n })}
                />
              </Field>
              <Field label={t("Geçiş payı (s)", "Transition margin (s)")}>
                <Num
                  value={q.transitionSeconds}
                  min={0}
                  step={0.5}
                  onChange={(n) => set("quality", { transitionSeconds: n })}
                />
              </Field>
              <Field
                label={t("Düz çizgi süresi (s)", "Flat-line duration (s)")}
                help={t("0 kuralı kapatır.", "0 turns the rule off.")}
              >
                <Num
                  value={q.flatSeconds}
                  min={0}
                  step={1}
                  onChange={(n) => set("quality", { flatSeconds: n })}
                />
              </Field>
              <Field
                label={t("Düz çizgi aralığı (µS)", "Flat-line range (µS)")}
              >
                <Num
                  value={q.flatRangeUs}
                  min={0}
                  step={0.001}
                  onChange={(n) => set("quality", { flatRangeUs: n })}
                />
              </Field>
            </div>
            <div
              className="choice-row"
              role="radiogroup"
              aria-label={t("Geçersiz veri", "Invalid data")}
            >
              <label>
                <input
                  type="radio"
                  name="quality-action"
                  checked={q.action === "flag"}
                  onChange={() => set("quality", { action: "flag" })}
                />
                {t("Yalnızca işaretle", "Flag only")}
              </label>
              <label>
                <input
                  type="radio"
                  name="quality-action"
                  checked={q.action === "exclude"}
                  onChange={() => set("quality", { action: "exclude" })}
                />
                {t(
                  "Karşılaştırma aralığından ve aday aramasından dışla",
                  "Exclude from the reference interval and candidate search",
                )}
              </label>
            </div>
          </>
        )}
      </fieldset>

      <fieldset className={`method-option ${m.enabled ? "on" : ""}`}>
        <legend>
          <label className="check-row">
            <input
              type="checkbox"
              checked={m.enabled}
              onChange={(e) =>
                set("motionWindows", { enabled: e.target.checked })
              }
            />
            {t("Pencere tabanlı hareket", "Window-based motion")}
          </label>
          {guide("motion")}
        </legend>
        <p>
          {t(
            "Kısa pencerelerde ivme büyüklüğünün değişkenliğini ve jiroskop hızını ölçer. Eşik bu sürüşün kendi dağılımından gelir (medyan + k × MAD); pedal ve yol titreşimi kendiliğinden hesaba katılır. GPX hızı yalnızca bağlam olarak gösterilir.",
            "Measures acceleration-magnitude variability and gyroscope speed in short windows. The threshold comes from this ride's own distribution (median + k × MAD), so pedalling and road vibration are taken into account. GPX speed is shown as context only.",
          )}
        </p>
        {m.enabled && (
          <div className="form-grid three">
            <Field label={t("Pencere (s)", "Window (s)")}>
              <Num
                value={m.windowSeconds}
                min={0.5}
                max={30}
                step={0.5}
                onChange={(n) => set("motionWindows", { windowSeconds: n })}
              />
            </Field>
            <Field
              label={t("Hassasiyet k", "Sensitivity k")}
              help={t(
                "Küçük k daha çok pencere işaretler.",
                "A smaller k flags more windows.",
              )}
            >
              <Num
                value={m.k}
                min={0.5}
                max={20}
                step={0.5}
                onChange={(n) => set("motionWindows", { k: n })}
              />
            </Field>
            <div className="field">
              <span>{t("Ek kaynaklar", "Extra sources")}</span>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={m.useGyro && hasGyro}
                  disabled={!hasGyro}
                  onChange={(e) =>
                    set("motionWindows", { useGyro: e.target.checked })
                  }
                />
                {t("Jiroskop (GX/GY/GZ)", "Gyroscope (GX/GY/GZ)")}
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={m.useSpeed && hasTrack}
                  disabled={!hasTrack}
                  onChange={(e) =>
                    set("motionWindows", { useSpeed: e.target.checked })
                  }
                />
                {t("GPX hız bağlamı", "GPX speed context")}
              </label>
            </div>
          </div>
        )}
      </fieldset>

      <fieldset className={`method-option ${r.enabled ? "on" : ""}`}>
        <legend>
          <label className="check-row">
            <input
              type="checkbox"
              checked={r.enabled}
              onChange={(e) => set("robustness", { enabled: e.target.checked })}
            />
            {t("Çoklu yöntem sağlamlığı", "Multi-method robustness")}
          </label>
          {guide("robustness")}
        </legend>
        <p>
          {t(
            "Tonik/fazik ayrımını ve SCR tepe tespitini farklı yayımlanmış yöntemlerle yeniden yapar. Her aday için kaç yöntem birleşiminin aynı anda bir SCR bulduğunu gösterir. Tek bir ayara bağlı adaylar zayıf kabul edilir.",
            "Repeats the tonic/phasic split and SCR peak detection with different published methods. For each candidate it shows how many method combinations find an SCR at the same moment. Candidates that depend on a single setting count as weak.",
          )}
        </p>
        {r.enabled && (
          <>
            <div className="field">
              <span>
                {t("Tonik/fazik ayrımı", "Tonic/phasic decomposition")}
              </span>
              <div className="choice-row">
                {DECOMPOSITIONS.map(([id, label]) => (
                  <label key={id}>
                    <input
                      type="checkbox"
                      checked={r.decompositions.includes(id)}
                      onChange={() =>
                        set("robustness", {
                          decompositions: toggle(r.decompositions, id),
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div className="field">
              <span>{t("SCR tepe yöntemi", "SCR peak method")}</span>
              <div className="choice-row">
                {PEAK_METHODS.map(([id, label]) => (
                  <label key={id}>
                    <input
                      type="checkbox"
                      checked={r.peakMethods.includes(id)}
                      onChange={() =>
                        set("robustness", {
                          peakMethods: toggle(r.peakMethods, id),
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div className="form-grid three">
              <Field
                label={t(
                  "En küçük SCR genliği (µS)",
                  "Minimum SCR amplitude (µS)",
                )}
              >
                <Num
                  value={r.minAmplitudeUs}
                  min={0}
                  step={0.01}
                  onChange={(n) => set("robustness", { minAmplitudeUs: n })}
                />
              </Field>
              <Field label={t("Zaman toleransı (± s)", "Time tolerance (± s)")}>
                <Num
                  value={r.toleranceSeconds}
                  min={0.5}
                  max={30}
                  step={0.5}
                  onChange={(n) => set("robustness", { toleranceSeconds: n })}
                />
              </Field>
              <div className="field">
                <span>{t("Birleşim sayısı", "Combinations")}</span>
                <b className="combo-count">{combos}</b>
              </div>
            </div>
          </>
        )}
      </fieldset>

      <div className="method-option method-note">
        <b>{t("Videoyla elle etiketleme", "Manual labelling with video")}</b>
        <p>
          {t(
            "Çalışma alanında videoyu izlerken aralıkları artefakt, geçerli veya emin değilim olarak etiketleyebilirsiniz. İki kodlayıcının uyumu (Cohen's kappa) ve otomatik yöntemlerin bu etiketlere göre isabeti Veri & kalite sekmesinde hesaplanır. Analizi değiştirmez.",
            "In the workspace you can label ranges as artifact, valid or unsure while watching the video. Agreement between two coders (Cohen's kappa) and how well each automatic method matches these labels are computed on the Data & quality tab. It does not change the analysis.",
          )}
        </p>
        {guide("annotation")}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ results */

export function OptionalResults({
  analysis,
  onGuide,
}: {
  analysis: Analysis;
  onGuide: (section: GuideSection) => void;
}) {
  useLang();
  const x = analysis.extras;
  if (!x || !Object.keys(x).length) return null;
  const support = x.robustness ? Object.values(x.robustness.support) : [];
  const strong = support.filter(
    (s) => s.total && s.count / s.total >= 0.5,
  ).length;
  return (
    <section className="card padded optional-results">
      <h2>{t("Ek yöntem sonuçları", "Additional method results")}</h2>
      {x.quality && (
        <div className="result-block">
          <h3>
            {t("Kalite kuralları", "Quality rules")}{" "}
            <button className="text-button" onClick={() => onGuide("quality")}>
              <BookOpen size={14} />
            </button>
          </h3>
          <dl className="details-grid">
            <dt>{t("Kullanılabilir veri", "Usable data")}</dt>
            <dd>
              <b>{pct(x.quality.usablePercent)}</b>
            </dd>
            <dt>{t("Geçersiz örnek", "Invalid samples")}</dt>
            <dd>{fmt(x.quality.invalidSamples, 0)}</dd>
            <dt>{t("Nedenler (örnek)", "Reasons (samples)")}</dt>
            <dd>
              {Object.entries(x.quality.reasonCounts)
                .filter(([, count]) => count)
                .map(
                  ([reason, count]) =>
                    `${reasonLabel(reason)} ${fmt(count, 0)}`,
                )
                .join(", ") || "—"}
            </dd>
            <dt>{t("Uygulama", "Action")}</dt>
            <dd>
              {x.quality.action === "exclude"
                ? t(
                    "Aday aramasından dışlandı",
                    "Excluded from candidate search",
                  )
                : t("Yalnızca işaretlendi", "Flagged only")}
            </dd>
          </dl>
        </div>
      )}
      {x.motionWindows && (
        <div className="result-block">
          <h3>
            {t("Pencere tabanlı hareket", "Window-based motion")}{" "}
            <button className="text-button" onClick={() => onGuide("motion")}>
              <BookOpen size={14} />
            </button>
          </h3>
          <dl className="details-grid">
            <dt>{t("İşaretli pencere", "Flagged windows")}</dt>
            <dd>
              <b>{pct(x.motionWindows.flaggedPercent)}</b>
            </dd>
            <dt>{t("İvme eşiği (SD, g)", "Acceleration threshold (SD, g)")}</dt>
            <dd>{fmt(x.motionWindows.accThreshold, 4)}</dd>
            <dt>{t("Jiroskop eşiği (°/s)", "Gyroscope threshold (°/s)")}</dt>
            <dd>
              {x.motionWindows.gyroUsed
                ? fmt(x.motionWindows.gyroThreshold, 1)
                : t("kullanılmadı", "not used")}
            </dd>
            <dt>{t("GPX bağlamı", "GPX context")}</dt>
            <dd>
              {t(
                `${x.motionWindows.contextWindows.riding} sürüş, ${x.motionWindows.contextWindows.stationary} duruş penceresi`,
                `${x.motionWindows.contextWindows.riding} riding, ${x.motionWindows.contextWindows.stationary} stationary windows`,
              )}
            </dd>
          </dl>
        </div>
      )}
      {x.robustness && (
        <div className="result-block">
          <h3>
            {t("Çoklu yöntem sağlamlığı", "Multi-method robustness")}{" "}
            <button
              className="text-button"
              onClick={() => onGuide("robustness")}
            >
              <BookOpen size={14} />
            </button>
          </h3>
          <p>
            {t(
              `${support.length} adayın ${strong} tanesi birleşimlerin en az yarısında destekleniyor (±${fmt(x.robustness.toleranceSeconds, 1)} s, en az ${fmt(x.robustness.minAmplitudeUs, 3)} µS).`,
              `${strong} of ${support.length} candidates are supported by at least half of the combinations (±${fmt(x.robustness.toleranceSeconds, 1)} s, at least ${fmt(x.robustness.minAmplitudeUs, 3)} µS).`,
            )}
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("Birleşim", "Combination")}</th>
                  <th>{t("Bulunan SCR", "SCRs found")}</th>
                </tr>
              </thead>
              <tbody>
                {x.robustness.configs.map((c) => (
                  <tr key={c.id}>
                    <td>
                      {c.decomposition ?? t("düzey sinyali", "level signal")} +{" "}
                      {c.peakMethod}
                    </td>
                    <td>{c.scrCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ candidate badges */

export function CandidateBadges({
  candidate,
  annotations,
  t: at,
}: {
  candidate?: Candidate;
  annotations: Annotation[];
  t: number;
}) {
  useLang();
  const checks = candidate?.checks;
  const labelled = annotations.filter((a) => a.start <= at && a.end >= at);
  const artifact = labelled.some((a) => a.label === "artifact");
  if (!checks && !labelled.length) return null;
  const support = checks?.support;
  return (
    <span className="badges">
      {checks?.qualityInvalid && (
        <span className="badge warn">
          {t("Kalite: geçersiz", "Quality: invalid")}
        </span>
      )}
      {checks?.motionWindow && (
        <span className="badge warn">
          {t("Hareket penceresi", "Motion window")}
        </span>
      )}
      {support && (
        <span
          className={`badge ${support.count / support.total >= 0.5 ? "good" : "warn"}`}
        >
          {t(
            `Destek ${support.count}/${support.total}`,
            `Support ${support.count}/${support.total}`,
          )}
        </span>
      )}
      {artifact && (
        <span className="badge label">
          {t("Elle: artefakt", "Manual: artifact")}
        </span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ chart bands */

export function chartBands(
  analysis: Analysis | null,
  annotations: Annotation[],
): ChartBand[] {
  const bands: ChartBand[] = [];
  const merge = (
    items: { start: number; end: number; on: boolean }[],
    kind: ChartBand["kind"],
    label: string,
  ) => {
    let open: { start: number; end: number } | null = null;
    for (const item of items) {
      if (item.on) {
        if (open && item.start - open.end < 0.01) open.end = item.end;
        else {
          if (open) bands.push({ ...open, kind, label });
          open = { start: item.start, end: item.end };
        }
      }
    }
    if (open) bands.push({ ...open, kind, label });
  };
  const q = analysis?.extras?.quality;
  if (q)
    merge(
      q.windows.map((w) => ({ start: w.start, end: w.end, on: !w.valid })),
      "quality",
      t("Kalite kuralı: geçersiz veri", "Quality rule: invalid data"),
    );
  const m = analysis?.extras?.motionWindows;
  if (m)
    merge(
      m.windows.map((w) => ({ start: w.start, end: w.end, on: w.flagged })),
      "motion",
      t("Yüksek hareket penceresi", "High-motion window"),
    );
  for (const a of annotations)
    bands.push({
      start: a.start,
      end: a.end,
      kind: a.label,
      label: `${a.coder}: ${labelName(a.label)}${a.reason ? ` (${annotationReason(a.reason)})` : ""}`,
    });
  return bands;
}

/* ------------------------------------------------------------------ annotation entry */

const CODER_KEY = "outlab-coder";
const savedCoder = () => {
  try {
    return localStorage.getItem(CODER_KEY) ?? "";
  } catch {
    return "";
  }
};

export function AnnotationBar({
  currentTime,
  onAdd,
}: {
  currentTime: number;
  onAdd: (a: Omit<Annotation, "id" | "at">) => void;
}) {
  useLang();
  const [open, setOpen] = useState(false);
  const [coder, setCoder] = useState(savedCoder() || "K1");
  const [start, setStart] = useState<number | null>(null);
  const [end, setEnd] = useState<number | null>(null);
  const [label, setLabel] = useState<AnnotationLabel>("artifact");
  const [reason, setReason] = useState("bump");
  const [note, setNote] = useState("");
  if (!open)
    return (
      <button
        className="button small annotate-toggle"
        onClick={() => setOpen(true)}
      >
        <Flag size={14} /> {t("Aralık etiketle", "Label a range")}
      </button>
    );
  const valid = start !== null && end !== null && end > start && coder.trim();
  return (
    <div
      className="annotation-bar"
      role="group"
      aria-label={t("Elle etiketleme", "Manual labelling")}
    >
      <Field label={t("Kodlayıcı", "Coder")}>
        <input
          value={coder}
          maxLength={20}
          onChange={(e) => {
            setCoder(e.target.value);
            try {
              localStorage.setItem(CODER_KEY, e.target.value);
            } catch {
              /* ignore */
            }
          }}
        />
      </Field>
      <div className="field">
        <span>{t("Aralık", "Range")}</span>
        <div className="range-buttons">
          <button
            className="button small"
            onClick={() => setStart(currentTime)}
          >
            {t("Başlangıç", "Start")}: {start === null ? "—" : time(start)}
          </button>
          <button className="button small" onClick={() => setEnd(currentTime)}>
            {t("Bitiş", "End")}: {end === null ? "—" : time(end)}
          </button>
        </div>
      </div>
      <Field label={t("Etiket", "Label")}>
        <select
          value={label}
          onChange={(e) => setLabel(e.target.value as AnnotationLabel)}
        >
          <option value="artifact">{labelName("artifact")}</option>
          <option value="valid">{labelName("valid")}</option>
          <option value="unsure">{labelName("unsure")}</option>
        </select>
      </Field>
      <Field label={t("Neden", "Reason")}>
        <select value={reason} onChange={(e) => setReason(e.target.value)}>
          {ANNOTATION_REASONS.map(([key, tr, en]) => (
            <option key={key} value={key}>
              {t(tr, en)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t("Not", "Note")}>
        <input
          value={note}
          maxLength={200}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <div className="annotation-actions">
        <button
          className="button primary small"
          disabled={!valid}
          onClick={() => {
            onAdd({
              coder: coder.trim(),
              start: start!,
              end: end!,
              label,
              reason,
              note,
            });
            setStart(null);
            setEnd(null);
            setNote("");
          }}
        >
          <Check size={14} /> {t("Etiketi kaydet", "Save label")}
        </button>
        <button className="button small" onClick={() => setOpen(false)}>
          {t("Kapat", "Close")}
        </button>
      </div>
      {start !== null && end !== null && end <= start && (
        <small className="warn-text">
          {t(
            "Bitiş başlangıçtan sonra olmalı.",
            "The end must come after the start.",
          )}
        </small>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ annotation list + agreement */

export function AnnotationPanel({
  annotations,
  analysis,
  duration,
  onDelete,
  onSeek,
  onGuide,
}: {
  annotations: Annotation[];
  analysis: Analysis | null;
  duration: number;
  onDelete: (id: string) => void;
  onSeek: (t: number) => void;
  onGuide: (section: GuideSection) => void;
}) {
  const lang = useLang();
  const coders = useMemo(
    () => Array.from(new Set(annotations.map((a) => a.coder))).sort(),
    [annotations],
  );
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const coderA = coders.includes(a) ? a : (coders[0] ?? "");
  const coderB = coders.includes(b)
    ? b
    : (coders.find((c) => c !== coderA) ?? "");
  const binsA = useMemo(
    () => coderBins(annotations, coderA, duration),
    [annotations, coderA, duration],
  );
  const inter = useMemo(
    () =>
      coderB
        ? agreement(binsA, coderBins(annotations, coderB, duration))
        : null,
    [annotations, binsA, coderB, duration],
  );
  const autos = useMemo(() => {
    if (!analysis || !coderA) return [];
    const methods: ["flagged" | "qualityInvalid" | "motionWindow", string][] = [
      [
        "flagged",
        t("Temel hareket eşiği (g/s)", "Core motion threshold (g/s)"),
      ],
      ["qualityInvalid", t("Kalite kuralları", "Quality rules")],
      ["motionWindow", t("Pencere tabanlı hareket", "Window-based motion")],
    ];
    return methods
      .filter(([key]) => analysis.points.some((p) => p[key] !== undefined))
      .map(([key, name]) => ({
        name,
        result: agreement(binsA, autoBins(analysis.points, key, duration)),
      }));
    // lang is a dependency so method names re-translate
  }, [analysis, binsA, coderA, duration, lang]);
  return (
    <section className="card padded annotation-panel">
      <div className="section-title">
        <h2>
          {t(
            "Elle artefakt etiketleri ve uyum",
            "Manual artifact labels and agreement",
          )}
        </h2>
        <button className="text-button" onClick={() => onGuide("annotation")}>
          <BookOpen size={14} /> {t("Yöntemi oku", "Read about the method")}
        </button>
      </div>
      {!annotations.length ? (
        <p>
          {t(
            "Henüz etiket yok. Çalışma alanında “Aralık etiketle” ile videoyu izlerken başlangıç ve bitişi işaretleyin.",
            "No labels yet. In the workspace, use “Label a range” to mark start and end while watching the video.",
          )}
        </p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("Kodlayıcı", "Coder")}</th>
                <th>{t("Aralık", "Range")}</th>
                <th>{t("Etiket", "Label")}</th>
                <th>{t("Neden", "Reason")}</th>
                <th>{t("Not", "Note")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {annotations
                .slice()
                .sort((x, y) => x.start - y.start)
                .map((item) => (
                  <tr key={item.id}>
                    <td>{item.coder}</td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => onSeek(item.start)}
                      >
                        {time(item.start)}–{time(item.end)}
                      </button>
                    </td>
                    <td>{labelName(item.label)}</td>
                    <td>{annotationReason(item.reason)}</td>
                    <td>{item.note}</td>
                    <td>
                      <button
                        className="icon-button small"
                        aria-label={t(
                          `${time(item.start)} etiketini sil`,
                          `Delete label at ${time(item.start)}`,
                        )}
                        onClick={() => onDelete(item.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      {coders.length > 0 && (
        <>
          <h3>{t("Kodlayıcılar arası uyum", "Inter-coder agreement")}</h3>
          <div className="form-grid">
            <Field label={t("Kodlayıcı A (referans)", "Coder A (reference)")}>
              <select value={coderA} onChange={(e) => setA(e.target.value)}>
                {coders.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label={t("Kodlayıcı B", "Coder B")}>
              <select
                value={coderB}
                onChange={(e) => setB(e.target.value)}
                disabled={coders.length < 2}
              >
                {coders
                  .filter((c) => c !== coderA)
                  .map((c) => (
                    <option key={c}>{c}</option>
                  ))}
              </select>
            </Field>
          </div>
          {inter ? (
            <dl className="details-grid agreement-result">
              <dt>Cohen's kappa</dt>
              <dd>
                <b>{fmt(inter.kappa, 3)}</b> ({kappaBand(inter.kappa, lang)})
              </dd>
              <dt>{t("Gözlenen uyum", "Observed agreement")}</dt>
              <dd>
                {pct(inter.observed === null ? null : inter.observed * 100)}
              </dd>
              <dt>{t("Ortak etiketli saniye", "Seconds labelled by both")}</dt>
              <dd>{inter.n}</dd>
            </dl>
          ) : (
            <Info>
              {t(
                "Kappa için ikinci bir kodlayıcının aynı oturumu bağımsız etiketlemesi gerekir.",
                "Kappa needs a second coder to label the same session independently.",
              )}
            </Info>
          )}
          {autos.length > 0 && (
            <>
              <h3>
                {t(
                  `Otomatik yöntemler ve ${coderA} etiketleri`,
                  `Automatic methods against ${coderA}'s labels`,
                )}
              </h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t("Yöntem", "Method")}</th>
                      <th>{t("Duyarlılık", "Sensitivity")}</th>
                      <th>{t("Özgüllük", "Specificity")}</th>
                      <th>kappa</th>
                      <th>n</th>
                    </tr>
                  </thead>
                  <tbody>
                    {autos.map(({ name, result }) => (
                      <tr key={name}>
                        <td>{name}</td>
                        <td>
                          {pct(
                            result.sensitivity === null
                              ? null
                              : result.sensitivity * 100,
                          )}
                        </td>
                        <td>
                          {pct(
                            result.specificity === null
                              ? null
                              : result.specificity * 100,
                          )}
                        </td>
                        <td>{fmt(result.kappa, 3)}</td>
                        <td>{result.n}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <small>
                {t(
                  "1 saniyelik dilimler; yalnızca kodlayıcının artefakt/geçerli dediği dilimler sayılır, “emin değilim” dışarıda kalır.",
                  "1-second bins; only bins the coder marked artifact or valid are counted, “unsure” is left out.",
                )}
              </small>
            </>
          )}
        </>
      )}
    </section>
  );
}
