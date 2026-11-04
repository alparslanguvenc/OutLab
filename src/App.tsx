import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Clock3,
  Download,
  FileCheck2,
  FileText,
  FolderOpen,
  Gauge,
  Layers3,
  LockKeyhole,
  MapPin,
  MessageSquare,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Upload,
  Video,
  X,
  AlertTriangle,
  Bike,
  Compass,
} from "lucide-react";
import { SignalChart } from "./components/SignalChart";
import { RouteMap } from "./components/RouteMap";
import { VideoPanel } from "./components/VideoPanel";
import { formatTime as time } from "./components/geometry";
import type {
  Analysis,
  AnalysisConfig,
  Candidate,
  Dataset,
  InspectedFile,
  InterviewEvent,
  SourceText,
  VideoTrack,
} from "./types";
import {
  MAX_VIDEOS,
  VIDEO_FILE,
  allVideosVerified,
  covers,
  newVideoTrack,
  normalizeProject,
  validVideoTrack,
  videoEnd,
  videoLabel,
  videoSeconds,
} from "./videos";
import { blankProject, demoProject } from "./demo";
import scienceSources from "../docs/SOURCES.json";
import { getLang, locale, setLang, t, useLang, type Lang } from "./i18n";
import {
  csv,
  download,
  listProjects,
  saveProject,
  sha256,
  type SavedProject,
} from "./storage";

type Tab = "workspace" | "data" | "sync" | "analysis" | "interview" | "science";
const TAGS = [
  "EA",
  "EL",
  "ER",
  "SA",
  "SR",
  "SF",
  "PI",
  "PR",
  "PG",
  "HR",
  "BI",
  "AX",
  "AY",
  "AZ",
  "GX",
  "GY",
  "GZ",
  "MX",
  "MY",
  "MZ",
  "T0",
  "T1",
  "TH",
  "H0",
];
const CONFIG_KEYS: (keyof AnalysisConfig)[] = [
  "baselineStart",
  "baselineEnd",
  "zThreshold",
  "minDistance",
  "motionThreshold",
];
function analysisStale(p: SavedProject) {
  return (
    !!p.analysis &&
    CONFIG_KEYS.some((key) => p.analysis!.parameters[key] !== p.config[key])
  );
}
const now = () => new Date().toISOString();
const number = (v: number | null | undefined, d = 2) =>
  v == null || !Number.isFinite(v)
    ? "—"
    : v.toLocaleString(locale(), { maximumFractionDigits: d });
async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch("/api/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      "X-OutLab-Lang": getLang(),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({
    detail: t(
      "Analiz motoruna erişilemiyor. OutLab_Baslat.command dosyasını açın.",
      "The analysis engine is not reachable. Open OutLab_Baslat.command.",
    ),
  }));
  if (!res.ok)
    throw new Error(
      typeof json.detail === "string"
        ? json.detail
        : JSON.stringify(json.detail),
    );
  return json as T;
}
function audit(p: SavedProject, action: string, detail: string): SavedProject {
  return {
    ...p,
    updatedAt: now(),
    audit: [...p.audit, { at: now(), action, detail }],
  };
}
function eventFrom(
  c: Candidate,
  provenance?: InterviewEvent["provenance"],
): InterviewEvent {
  return {
    provenance,
    id: provenance ? provenance.runId + ":" + c.id : c.id,
    t: c.t,
    title: t("İncelenecek an", "Moment to review"),
    pre: 15,
    post: 20,
    selected: false,
    narrative: "",
    valence: null,
    arousal: null,
    codes: "",
    recallDate: "",
    source: "candidate",
  };
}
const INDEPENDENT_CHECK = [
  "Bağımsız eşleme kontrolü",
  "Independent mapping check",
];
function LangSwitch({ lang }: { lang: Lang }) {
  return (
    <div
      className="lang-switch"
      role="group"
      aria-label={t("Arayüz dili", "Interface language")}
    >
      <button
        type="button"
        lang="tr"
        aria-pressed={lang === "tr"}
        onClick={() => setLang("tr")}
      >
        Türkçe
      </button>
      <button
        type="button"
        lang="en"
        aria-pressed={lang === "en"}
        onClick={() => setLang("en")}
      >
        English
      </button>
    </div>
  );
}
function Info({
  children,
  tone = "info",
}: {
  children: React.ReactNode;
  tone?: "info" | "warning" | "success";
}) {
  return (
    <div className={`notice ${tone}`}>
      {tone === "warning" ? (
        <AlertTriangle size={17} />
      ) : tone === "success" ? (
        <CheckCircle2 size={17} />
      ) : (
        <CircleHelp size={17} />
      )}
      <div>{children}</div>
    </div>
  );
}
function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {help && <small>{help}</small>}
    </label>
  );
}
function Num({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
}) {
  return (
    <input
      aria-label={label}
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const n = e.target.valueAsNumber;
        if (Number.isFinite(n)) onChange(n);
      }}
    />
  );
}
function emptyState(title: string, description: string) {
  return (
    <div className="empty">
      <Layers3 size={32} />
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

function anchorsFrom(v?: VideoTrack) {
  return {
    v1: v?.anchors[0]?.videoTime ?? 0,
    s1: v?.anchors[0]?.sensorTime ?? 0,
    v2: v?.anchors[1]?.videoTime ?? 300,
    s2: v?.anchors[1]?.sensorTime ?? 300,
    two: (v?.anchors.length ?? 0) > 1,
    reason: v?.reason ?? "",
    uncertainty: v?.uncertainty ?? 1,
  };
}
const sameFile = (
  v: VideoTrack,
  f: { name: string; size: number; lastModified: number },
) =>
  v.name === f.name && v.size === f.size && v.lastModified === f.lastModified;

export default function App() {
  const lang = useLang();
  const [project, setProject] = useState<SavedProject>(blankProject);
  const [tab, setTab] = useState<Tab>("workspace");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [saved, setSaved] = useState<
    "preparing" | "saving" | "saved" | "failed"
  >("preparing");
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  // Object URLs of locally connected videos, keyed by VideoTrack.id. Files are
  // streamed from disk by the browser; nothing is uploaded or copied.
  const [videoUrls, setVideoUrls] = useState<Record<string, string>>({});
  const [activeVideoId, setActiveVideoId] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [sources, setSources] = useState<SourceText[]>([]);
  const [inspected, setInspected] = useState<InspectedFile[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [library, setLibrary] = useState<SavedProject[]>([]);
  const [exportsOpen, setExportsOpen] = useState(false);
  const [activeEvent, setActiveEvent] = useState("");
  const [participantMode, setParticipantMode] = useState(false);
  const [clip, setClip] = useState<{ start: number; end: number } | null>(null);
  const [visibleTags, setVisibleTags] = useState(["EA", "HR", "AX", "T1"]);
  const [saveError, setSaveError] = useState("");
  const [anchors, setAnchors] = useState(() => anchorsFrom());
  const fileRef = useRef<HTMLInputElement>(null);
  const projectRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const videoTargetRef = useRef<string | null>(null);
  const videoUrlsRef = useRef(videoUrls);
  videoUrlsRef.current = videoUrls;
  const activeProjectRef = useRef(project.id);
  const liveProjectRef = useRef(project);
  liveProjectRef.current = project;
  const liveTimeRef = useRef(currentTime);
  liveTimeRef.current = currentTime;
  const connectedVideos = project.videos.filter((v) => videoUrls[v.id]);
  const chosenVideo =
    project.videos.find((v) => v.id === activeVideoId) ?? project.videos[0];
  // Keep the researcher's chosen video while it has footage for the current
  // moment; otherwise follow the playhead to a connected video that does.
  const shownVideo =
    chosenVideo && videoUrls[chosenVideo.id] && covers(chosenVideo, currentTime)
      ? chosenVideo
      : (connectedVideos.find((v) => covers(v, currentTime)) ?? chosenVideo);
  const shownUrl = shownVideo ? (videoUrls[shownVideo.id] ?? null) : null;
  const videosVerified = allVideosVerified(project);
  const duration = Math.max(
    project.dataset.duration,
    ...connectedVideos.map((v) => videoEnd(v) ?? 0),
    project.dataset.track.length
      ? project.dataset.track.at(-1)!.t + project.sync.gpsOffset
      : 0,
    1,
  );
  const selected = project.events.filter((e) => e.selected);
  const currentEvent =
    project.events.find((e) => e.id === activeEvent) ?? selected[0];
  const displayedChannels = useMemo(
    () => project.dataset.channels.filter((c) => visibleTags.includes(c.tag)),
    [project.dataset.channels, visibleTags],
  );
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await listProjects();
        const active = all.find(
          (p) => p.id === localStorage.getItem("rotalab-active"),
        );
        const p = active ?? (await demoProject());
        if (!cancelled) {
          setProject(p);
          setReady(true);
        }
      } catch (e) {
        if (!cancelled) {
          setProject(await demoProject());
          setSaveError(
            t(
              "Tarayıcı yerel kaydı açılamadı. Proje dosyasını indirerek yedekleyin.",
              "Local browser storage could not be opened. Download the project file as a backup.",
            ),
          );
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    activeProjectRef.current = project.id;
  }, [project.id]);
  useEffect(() => {
    if (!ready) return;
    setSaved("saving");
    const timer = setTimeout(
      () =>
        saveProject(project)
          .then(() => {
            setSaved("saved");
            setSaveError("");
          })
          .catch(() => {
            setSaved("failed");
            setSaveError(
              t(
                "Yerel depolama dolu veya kapalı. Proje paketini hemen indirin.",
                "Local storage is full or disabled. Download the project package now.",
              ),
            );
          }),
      700,
    );
    return () => clearTimeout(timer);
  }, [project, ready]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(
    () => () => {
      Object.values(videoUrlsRef.current).forEach((u) =>
        URL.revokeObjectURL(u),
      );
    },
    [],
  );
  useEffect(() => {
    if (!playing || shownUrl) return;
    let previous = performance.now();
    const id = setInterval(() => {
      const stamp = performance.now();
      const t = liveTimeRef.current + (stamp - previous) / 1000;
      previous = stamp;
      const end = clip?.end ?? duration;
      if (t >= end) {
        setCurrentTime(end);
        setPlaying(false);
      } else setCurrentTime(t);
    }, 80);
    return () => clearInterval(id);
  }, [playing, shownUrl, clip, duration]);
  const seek = (t: number) => {
    setCurrentTime(Math.max(0, Math.min(duration, t)));
  };
  const mutate = (fn: (p: SavedProject) => SavedProject) =>
    setProject((p) => ({ ...fn(p), updatedAt: now() }));
  async function runAnalysis() {
    const datasetSnapshot = project.dataset,
      configSnapshot = { ...project.config },
      id = project.id,
      runId = crypto.randomUUID(),
      at = now();
    setBusy(
      t(
        "EDA işleniyor ve aday anlar hesaplanıyor…",
        "Processing EDA and computing candidate moments…",
      ),
    );
    setError("");
    try {
      const result = await api<Analysis>("analyze", {
        dataset: datasetSnapshot,
        config: configSnapshot,
      });
      if (activeProjectRef.current !== id) return;
      if (liveProjectRef.current.dataset !== datasetSnapshot) {
        setToast(
          t(
            "Veri değişti; önceki analiz sonucu uygulanmadı.",
            "The data changed, so the earlier analysis result was not applied.",
          ),
        );
        return;
      }
      const sourceHashes = datasetSnapshot.sources.map(({ name, sha256 }) => ({
        name,
        sha256,
      }));
      setProject((p) => {
        if (p.id !== id || p.dataset !== datasetSnapshot) return p;
        const retained = p.events.filter(
          (e) => e.source === "manual" || e.selected || e.narrative,
        );
        return audit(
          {
            ...p,
            analysis: result,
            analysisRuns: [
              ...(p.analysisRuns ?? []),
              {
                id: runId,
                at,
                config: configSnapshot,
                method: result.method,
                version: result.version,
                parameters: result.parameters,
                candidates: result.events,
                warnings: result.warnings,
              },
            ],
            events: [
              ...retained,
              ...result.events
                .filter((c) => !retained.some((e) => Math.abs(e.t - c.t) < 2))
                .map((c) =>
                  eventFrom(c, {
                    runId,
                    at,
                    config: configSnapshot,
                    sourceHashes,
                    candidate: { ...c },
                  }),
                ),
            ],
          },
          t("Analiz çalıştırıldı", "Analysis run"),
          JSON.stringify({
            runId,
            method: result.method,
            version: result.version,
            config: configSnapshot,
            sourceHashes,
            warnings: result.warnings,
          }),
        );
      });
      setToast(
        t(
          `${result.events.length} aday an hesaplandı. Bilimsel yorum için bağlamı inceleyin.`,
          `${result.events.length} candidate moments found. Review the context before interpreting them.`,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  function videoFileError(file: File) {
    if (/\.insv$/i.test(file.name))
      return t(
        "INSV doğrudan tarayıcıda açılamaz. Insta360 Studio’da videoyu H.264 MP4 olarak dışa aktarın. 360° görünüm için 2:1 equirectangular MP4 kullanın.",
        "INSV files cannot be opened in the browser. Export the video from Insta360 Studio as H.264 MP4. For a 360° view, use a 2:1 equirectangular MP4.",
      );
    if (!/\.(mp4|mov|webm|m4v)$/i.test(file.name))
      return t(
        "MP4, MOV veya WebM video seçin. En geniş destek için H.264 MP4 kullanın.",
        "Choose an MP4, MOV or WebM video. H.264 MP4 has the widest support.",
      );
    return "";
  }
  /**
   * Connect up to MAX_VIDEOS local videos. A file identical (name, size, date)
   * to a saved but disconnected video reconnects it with its mapping intact.
   * `targetId` replaces one specific video slot.
   */
  function attachVideos(files: File[], targetId?: string | null) {
    const invalid = files.map(videoFileError).find(Boolean);
    if (invalid) {
      setError(invalid);
      return;
    }
    const videos = project.videos.map((v) => ({ ...v }));
    const urls: Record<string, string> = {};
    const released: string[] = [];
    const notes: string[] = [];
    let focus = "";
    for (const file of files) {
      let index = targetId
        ? videos.findIndex((v) => v.id === targetId)
        : videos.findIndex((v) => sameFile(v, file) && !urls[v.id]);
      if (index < 0 && !targetId) {
        if (videos.length >= MAX_VIDEOS) {
          Object.values(urls).forEach((u) => URL.revokeObjectURL(u));
          setError(
            t(
              `Bir oturumda en fazla ${MAX_VIDEOS} video olabilir. Önce bir videoyu kaldırın veya “Değiştir” ile yerine yenisini bağlayın.`,
              `A session can hold at most ${MAX_VIDEOS} videos. Remove one first, or use “Replace” to swap in a new file.`,
            ),
          );
          return;
        }
        videos.push(newVideoTrack(file));
        index = videos.length - 1;
        notes.push(
          t(
            `${videoLabel(index)} eklendi: ${file.name} (${file.size} bayt).`,
            `${videoLabel(index)} added: ${file.name} (${file.size} bytes).`,
          ),
        );
      } else if (index >= 0) {
        const old = videos[index];
        const same = sameFile(old, file);
        videos[index] = {
          ...old,
          name: file.name,
          size: file.size,
          lastModified: file.lastModified,
          duration: same ? old.duration : undefined,
          verified: same ? old.verified : false,
        };
        notes.push(
          t(
            `${videoLabel(index)} bağlandı: ${file.name} (${file.size} bayt). ${same ? "Dosya özellikleri öncekiyle aynı; içerik hash doğrulaması yapılmadı." : "Farklı dosya; zaman eşlemesi yeniden doğrulanmalı."}`,
            `${videoLabel(index)} connected: ${file.name} (${file.size} bytes). ${same ? "File properties match the previous file; the content hash was not checked." : "Different file; the time mapping must be verified again."}`,
          ),
        );
      } else continue;
      const id = videos[index].id;
      if (videoUrlsRef.current[id]) released.push(videoUrlsRef.current[id]);
      urls[id] = URL.createObjectURL(file);
      focus = id;
      targetId = null;
    }
    if (!focus) return;
    released.forEach((u) => URL.revokeObjectURL(u));
    setVideoUrls((current) => ({ ...current, ...urls }));
    setActiveVideoId(focus);
    setAnchors(anchorsFrom(videos.find((v) => v.id === focus)));
    setPlaying(false);
    setClip(null);
    mutate((p) =>
      audit(
        { ...p, videos },
        t("Video bağlandı", "Video connected"),
        notes.join(" "),
      ),
    );
    setToast(
      files.length > 1
        ? t(
            `${files.length} video bilgisayarınızdan bağlandı. Her videonun zaman eşlemesini kontrol edin.`,
            `${files.length} videos connected from your computer. Check the time mapping of each one.`,
          )
        : t(
            "Video bilgisayarınızdan bağlandı. Zaman eşlemesini kontrol edin.",
            "Video connected from your computer. Check its time mapping.",
          ),
    );
  }
  function removeVideo(id: string) {
    const index = project.videos.findIndex((v) => v.id === id);
    if (index < 0) return;
    const v = project.videos[index];
    if (videoUrls[id]) URL.revokeObjectURL(videoUrls[id]);
    setVideoUrls(({ [id]: _, ...rest }) => rest);
    setPlaying(false);
    setClip(null);
    mutate((p) =>
      audit(
        { ...p, videos: p.videos.filter((x) => x.id !== id) },
        t("Video kaldırıldı", "Video removed"),
        `${videoLabel(index)}: ${v.name}. ${t("Kaldırılan eşleme", "Removed mapping")}: ${JSON.stringify({ offset: v.offset, rate: v.rate, verified: v.verified, anchors: v.anchors, uncertainty: v.uncertainty, reason: v.reason })}`,
      ),
    );
  }
  function pickVideo(target?: string) {
    videoTargetRef.current = target ?? null;
    videoRef.current?.click();
  }
  function selectVideo(v: VideoTrack) {
    setActiveVideoId(v.id);
    setAnchors(anchorsFrom(v));
    if (!covers(v, currentTime)) {
      setPlaying(false);
      setClip(null);
      seek(v.offset);
    }
  }
  async function inspectFiles(files: File[]) {
    setError("");
    const videos = files.filter((f) => VIDEO_FILE.test(f.name));
    if (videos.length) attachVideos(videos);
    const data = files.filter((f) => !videos.includes(f));
    if (!data.length) return;
    if (
      data.some((f) => f.size > 60 * 1024 * 1024) ||
      data.reduce((v, f) => v + f.size, 0) > 100 * 1024 * 1024
    ) {
      setError(
        t(
          "Bu sürümde metin dosyası sınırı dosya başına 60 MB, toplam 100 MB. Uzun kaydı oturum bölümlerine ayırın.",
          "This version accepts text files up to 60 MB each and 100 MB in total. Split long recordings into session parts.",
        ),
      );
      return;
    }
    setImportOpen(true);
    setBusy(
      t(
        "Dosya başlıkları ve saatler inceleniyor…",
        "Reading file headers and clocks…",
      ),
    );
    try {
      const next = await Promise.all(
        data.map(async (f) => {
          try {
            return {
              name: f.name,
              text: new TextDecoder("utf-8", {
                fatal: true,
                ignoreBOM: true,
              }).decode(await f.arrayBuffer()),
            };
          } catch {
            throw new Error(
              f.name +
                t(
                  ": Dosya UTF-8 olarak okunamadı. CSV/GPX dosyasını UTF-8 kodlamasıyla yeniden dışa aktarın; özgün baytları sessizce değiştirmiyoruz.",
                  ": The file could not be read as UTF-8. Export the CSV/GPX file again with UTF-8 encoding; OutLab does not silently alter the original bytes.",
                ),
            );
          }
        }),
      );
      const previous = project.isDemo ? [] : project.sourceTexts;
      const combined = [
        ...previous.filter((s) => !next.some((n) => n.name === s.name)),
        ...next,
      ];
      const result = await api<{ files: InspectedFile[] }>("inspect", {
        sources: combined,
      });
      setSources(combined);
      setInspected(result.files);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function confirmImport() {
    setBusy(
      t(
        "Veriler ortak sensör zamanına yerleştiriliyor…",
        "Placing the data on the shared sensor timeline…",
      ),
    );
    setError("");
    try {
      const dataset = await api<Dataset>("import", {
        sources,
        mappings: inspected
          .filter((f) => f.kind === "csv")
          .map((f) => ({
            name: f.name,
            tag: f.tag,
            timeColumn: f.timeColumn,
            valueColumn: f.valueColumn,
            timeUnit: f.timeUnit,
          })),
      });
      setPlaying(false);
      setCurrentTime(0);
      setClip(null);
      mutate((p) =>
        audit(
          {
            ...p,
            isDemo: false,
            title: p.isDemo
              ? t(
                  "Bisiklet turu (çalışma oturumu)",
                  "Cycling tour (working session)",
                )
              : p.title,
            participant: p.isDemo ? t("K-01", "P-01") : p.participant,
            dataset,
            analysis: null,
            events: [],
            sourceTexts: sources,
            videos: p.videos.map((v) => ({ ...v, verified: false })),
            sync: {
              ...p.sync,
              gpsVerified: false,
              gpsReason: "",
              gpsOffset:
                dataset.sensorOriginEpoch != null &&
                dataset.gpxOriginEpoch != null
                  ? dataset.gpxOriginEpoch - dataset.sensorOriginEpoch
                  : 0,
            },
          },
          t("Veri içe aktarıldı", "Data imported"),
          t(
            `${dataset.sources.length} dosya; ${dataset.channels.length} kanal. Önceki analiz ve an seçimi sıfırlandı. Kaynak SHA-256 kayıtları eklendi.`,
            `${dataset.sources.length} files; ${dataset.channels.length} channels. The previous analysis and moment selection were reset. Source SHA-256 records were added.`,
          ),
        ),
      );
      setImportOpen(false);
      setTab("data");
      setToast(
        t(
          "Veriler alındı. Önce kaliteyi ve saat eşlemesini inceleyin.",
          "Data imported. Check quality and clock mapping first.",
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  function applySync() {
    const target = chosenVideo;
    if (!target) {
      setError(
        t(
          "Önce eşlenecek videoyu bağlayın.",
          "Connect the video you want to map first.",
        ),
      );
      return;
    }
    const { v1, s1, v2, s2, two, reason, uncertainty } = anchors;
    const rate = two ? (s2 - s1) / (v2 - v1) : 1;
    const offset = s1 - rate * v1;
    if (
      !reason.trim() ||
      uncertainty < 0 ||
      ![v1, s1, v2, s2, rate, offset].every(Number.isFinite) ||
      v1 < 0 ||
      s1 < 0 ||
      (two && (v2 <= v1 || s2 <= s1)) ||
      rate < 0.8 ||
      rate > 1.2
    ) {
      setError(
        t(
          "Ortak olayın açıklamasını yazın. İkinci işaret ilkinden sonra olmalı; saat oranı 0,8–1,2 aralığında olmalı.",
          "Describe the shared event. The second marker must come after the first, and the clock ratio must be between 0.8 and 1.2.",
        ),
      );
      return;
    }
    const index = project.videos.indexOf(target);
    mutate((p) =>
      audit(
        {
          ...p,
          videos: p.videos.map((v) =>
            v.id === target.id
              ? {
                  ...v,
                  offset,
                  rate,
                  verified: true,
                  anchors: [
                    { videoTime: v1, sensorTime: s1 },
                    ...(two ? [{ videoTime: v2, sensorTime: s2 }] : []),
                  ],
                  uncertainty,
                  reason,
                }
              : v,
          ),
        },
        t("Zaman eşlemesi uygulandı", "Time mapping applied"),
        JSON.stringify({
          video: `${videoLabel(index)}: ${target.name}`,
          offset,
          rate,
          uncertainty,
          reason,
          anchors,
        }),
      ),
    );
    setToast(
      t(
        "Eşleme kaydedildi. Ayrı bir olayda kalan hatayı kontrol edin.",
        "Mapping saved. Check the remaining error against a separate event.",
      ),
    );
    setError("");
  }
  function addManual() {
    const e = {
      ...eventFrom({
        id: crypto.randomUUID(),
        t: currentTime,
        amplitude: 0,
        score: null,
        reason: t("Araştırmacı seçimi", "Selected by researcher"),
        flagged: false,
      }),
      selected: true,
      title: t("Araştırmacı seçimi", "Selected by researcher"),
      source: "manual" as const,
    };
    mutate((p) =>
      audit(
        { ...p, events: [...p.events, e] },
        t("Elle an seçildi", "Moment selected manually"),
        t(
          `${time(currentTime)}, video/bağlam incelemesi`,
          `${time(currentTime)}, video/context review`,
        ),
      ),
    );
    setActiveEvent(e.id);
    setToast(
      t("An görüşme listesine eklendi.", "Moment added to the interview list."),
    );
  }
  function updateEvent(id: string, changes: Partial<InterviewEvent>) {
    mutate((p) =>
      audit(
        {
          ...p,
          events: p.events.map((e) => (e.id === id ? { ...e, ...changes } : e)),
        },
        t("Görüşme kaydı güncellendi", "Interview record updated"),
        `${id}: ${Object.keys(changes).join(", ")}`,
      ),
    );
  }
  function playEvent(e: InterviewEvent) {
    if (!connectedVideos.length) {
      setError(
        t(
          "Bu anı izletmek için oturum videosunu bağlayın.",
          "Connect the session video to play this moment.",
        ),
      );
      return;
    }
    // Prefer the video already on screen when it contains the moment.
    const video =
      [shownVideo, ...connectedVideos].find(
        (v) => v && videoUrls[v.id] && covers(v, e.t),
      ) ?? null;
    const start = video ? Math.max(0, e.t - e.pre, video.offset) : 0;
    const end = video
      ? Math.min(duration, e.t + e.post, videoEnd(video) ?? Infinity)
      : 0;
    if (!video || start >= end) {
      setError(
        t(
          "Bu an bağlı videoların zaman kapsamı dışında. Eşlemeyi veya video dosyalarını kontrol edin.",
          "This moment is outside the time range of the connected videos. Check the mapping or the video files.",
        ),
      );
      return;
    }
    setActiveVideoId(video.id);
    setActiveEvent(e.id);
    setCurrentTime(start);
    setClip({ start, end });
    setPlaying(true);
  }
  async function changeProject(p: SavedProject) {
    await saveProject(project).catch(() => {});
    setProject(p);
    Object.values(videoUrlsRef.current).forEach((u) => URL.revokeObjectURL(u));
    setVideoUrls({});
    setActiveVideoId(p.videos[0]?.id ?? "");
    setCurrentTime(0);
    setPlaying(false);
    setClip(null);
    setParticipantMode(false);
    setLibraryOpen(false);
    setActiveEvent("");
    setTab("workspace");
    setError("");
    setSources([]);
    setInspected([]);
    setAnchors(anchorsFrom(p.videos[0]));
  }
  async function exportProject() {
    const payload = JSON.stringify(project);
    download(
      `${project.participant.replace(/[^\p{L}\p{N}_-]/gu, "_")}.outlab.json`,
      JSON.stringify({
        format: "outlab-project",
        version: 1,
        sha256: await sha256(payload),
        payload,
      }),
    );
    setToast(
      t(
        "Proje paketi indirildi. Video dosyalarını ayrıca saklayın.",
        "Project package downloaded. Keep the video files separately.",
      ),
    );
  }
  async function restoreProject(file: File) {
    setBusy(t("Proje bütünlüğü doğrulanıyor…", "Checking project integrity…"));
    try {
      if (file.size > 200 * 1024 * 1024)
        throw Error(
          t(
            "Proje paketi 200 MB sınırını aşıyor.",
            "The project package exceeds the 200 MB limit.",
          ),
        );
      const envelope = JSON.parse(await file.text());
      if (
        // Packages exported before the OutLab rename remain valid.
        !["outlab-project", "rotalab-project"].includes(envelope.format) ||
        typeof envelope.payload !== "string" ||
        (await sha256(envelope.payload)) !== envelope.sha256
      )
        throw Error(
          t(
            "Proje biçimi veya SHA-256 bütünlük kontrolü geçersiz.",
            "Invalid project format or failed SHA-256 integrity check.",
          ),
        );
      const raw = JSON.parse(envelope.payload) as SavedProject;
      const legacy = !Array.isArray(raw.videos);
      if (
        raw?.sync &&
        (legacy
          ? !Number.isFinite(raw.sync.videoRate ?? 1) ||
            (raw.sync.videoRate ?? 1) <= 0 ||
            !Number.isFinite(raw.sync.videoOffset ?? 0)
          : raw.videos.length > MAX_VIDEOS ||
            !raw.videos.every(validVideoTrack))
      )
        throw Error(
          t(
            "Proje video eşleme kaydı eksik veya geçersiz.",
            "The project's video mapping record is missing or invalid.",
          ),
        );
      const p = raw?.sync ? normalizeProject(raw) : raw;
      if (
        p.schemaVersion !== 1 ||
        typeof p.id !== "string" ||
        typeof p.title !== "string" ||
        typeof p.participant !== "string" ||
        !Array.isArray(p.dataset?.channels) ||
        !Array.isArray(p.dataset.track) ||
        !Array.isArray(p.events) ||
        !Array.isArray(p.audit) ||
        !Array.isArray(p.sourceTexts) ||
        !p.config ||
        !p.sync ||
        !Number.isFinite(p.dataset.duration) ||
        !Number.isFinite(p.sync.gpsOffset) ||
        p.dataset.channels.some(
          (c) =>
            !Array.isArray(c.points) ||
            !c.quality ||
            c.points.some(
              (pt) => !Number.isFinite(pt.t) || !Number.isFinite(pt.v),
            ),
        ) ||
        p.dataset.track.some(
          (pt) =>
            !Number.isFinite(pt.t) ||
            !Number.isFinite(pt.lat) ||
            !Number.isFinite(pt.lon),
        ) ||
        p.events.some(
          (e) => !Number.isFinite(e.t) || typeof e.narrative !== "string",
        )
      )
        throw Error(
          t(
            "Proje şeması eksik veya geçersiz.",
            "The project schema is missing or invalid.",
          ),
        );
      for (const s of p.sourceTexts) {
        const source = p.dataset.sources.find((x) => x.name === s.name);
        if (source && (await sha256(s.text)) !== source.sha256)
          throw Error(
            t(
              `Kaynak dosyası bütünlük hatası: ${s.name}`,
              `Source file integrity error: ${s.name}`,
            ),
          );
      }
      await changeProject(
        audit(
          p,
          t("Proje geri yüklendi", "Project restored"),
          t(
            "Paket ve mevcut kaynak SHA-256 değerleri doğrulandı; bu kimlik doğrulaması değildir.",
            "Package and available source SHA-256 values verified; this is not authentication.",
          ),
        ),
      );
      setToast(
        t(
          "Proje açıldı. Videoları yeniden bağlayın.",
          "Project opened. Reconnect the videos.",
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  function exportSignals() {
    if (!project.analysis) return;
    download(
      "islenmis_EDA.csv",
      csv([
        [
          "session_seconds",
          "raw_uS",
          "clean_uS",
          "tonic_uS",
          "phasic_uS",
          "motion_heuristic",
          "flagged",
        ],
        ...project.analysis.points.map((p) => [
          p.t,
          p.raw,
          p.clean,
          p.tonic,
          p.phasic,
          p.motion,
          p.flagged,
        ]),
      ]),
      "text/csv;charset=utf-8",
    );
  }
  function exportInterviews() {
    download(
      "gorusme_kayitlari.csv",
      csv([
        [
          "participant",
          "event_id",
          "session_seconds",
          "video",
          "video_file",
          "video_seconds",
          "pre_seconds",
          "post_seconds",
          "title",
          "narrative",
          "valence_optional",
          "arousal_optional",
          "codes",
          "recall_date",
          "source",
          "video_sync_verified",
          "sync_uncertainty_seconds",
          "gps_sync_verified",
          "candidate_provenance",
        ],
        ...selected.map((e) => {
          const video = project.videos.find((v) => covers(v, e.t));
          const index = video ? project.videos.indexOf(video) : -1;
          return [
            project.participant,
            e.id,
            e.t,
            video ? videoLabel(index) : "",
            video?.name ?? "",
            video ? videoSeconds(video, e.t) : "",
            e.pre,
            e.post,
            e.title,
            e.narrative,
            e.valence,
            e.arousal,
            e.codes,
            e.recallDate,
            e.source,
            video?.verified ?? false,
            video?.uncertainty ?? "",
            project.sync.gpsVerified ?? false,
            e.provenance ? JSON.stringify(e.provenance) : "",
          ];
        }),
      ]),
      "text/csv;charset=utf-8",
    );
  }
  function recordDuration(id: string, seconds: number) {
    const v = project.videos.find((x) => x.id === id);
    if (!v || (v.duration && Math.abs(v.duration - seconds) < 0.001)) return;
    mutate((p) => ({
      ...p,
      videos: p.videos.map((x) =>
        x.id === id ? { ...x, duration: seconds } : x,
      ),
    }));
  }
  /** When one video ends, keep playing in the next connected video that covers the moment. */
  function continueAfter(id: string) {
    const v = project.videos.find((x) => x.id === id);
    const end = v ? videoEnd(v) : null;
    if (end == null || (clip && end >= clip.end - 0.05)) return;
    const next = connectedVideos.find(
      (x) => x.id !== id && covers(x, end + 0.05),
    );
    if (!next) return;
    setActiveVideoId(next.id);
    setCurrentTime(Math.max(end, next.offset));
    setPlaying(true);
  }
  const videoStatus = (v: VideoTrack) => {
    const mapping = v.verified
      ? t("eşlendi", "mapped")
      : t("eşleme bekliyor", "mapping pending");
    return videoUrls[v.id]
      ? mapping
      : `${t("yeniden bağlanmalı", "reconnect needed")}, ${mapping}`;
  };
  const videoCoverage = (v: VideoTrack) => {
    const end = videoEnd(v);
    return end == null
      ? t(`${time(v.offset)}'dan itibaren`, `from ${time(v.offset)}`)
      : `${time(v.offset)}–${time(end)}`;
  };
  // manage: workspace list with actions · sync: choose the video to calibrate
  // interview/participant: switch the visible video (names hidden for participants)
  function videoStrip(mode: "manage" | "sync" | "interview" | "participant") {
    if (
      !project.videos.length ||
      (mode !== "manage" && project.videos.length < 2)
    )
      return null;
    const current = mode === "sync" ? chosenVideo : shownVideo;
    return (
      <div
        className={`video-strip ${mode}`}
        role="tablist"
        aria-label={t("Oturum videoları", "Session videos")}
      >
        {project.videos.map((v, i) => (
          <div
            key={v.id}
            className={`video-slot ${current?.id === v.id ? "active" : ""}`}
          >
            <button
              role="tab"
              aria-selected={current?.id === v.id}
              className="video-slot-main"
              onClick={() =>
                mode === "sync"
                  ? (setActiveVideoId(v.id), setAnchors(anchorsFrom(v)))
                  : selectVideo(v)
              }
            >
              <b>
                <i
                  className={`dot ${videoUrls[v.id] ? (v.verified ? "green" : "amber") : ""}`}
                />
                {videoLabel(i)}
              </b>
              {mode !== "participant" && (
                <>
                  <span title={v.name}>{v.name}</span>
                  <small>
                    {videoCoverage(v)} ({videoStatus(v)})
                  </small>
                </>
              )}
            </button>
            {mode === "manage" && (
              <span className="video-slot-actions">
                <button className="text-button" onClick={() => pickVideo(v.id)}>
                  {videoUrls[v.id]
                    ? t("Değiştir", "Replace")
                    : t("Yeniden bağla", "Reconnect")}
                </button>
                <button
                  className="icon-button small"
                  aria-label={t(
                    `${videoLabel(i)} videosunu kaldır`,
                    `Remove ${videoLabel(i)}`,
                  )}
                  title={t(
                    "Videoyu ve eşlemesini oturumdan kaldır",
                    "Remove the video and its mapping from the session",
                  )}
                  onClick={() => removeVideo(v.id)}
                >
                  <X size={14} />
                </button>
              </span>
            )}
          </div>
        ))}
      </div>
    );
  }
  const shownIndex = shownVideo ? project.videos.indexOf(shownVideo) : -1;
  const videoKey = shownVideo?.id ?? "none";
  const videoPanelProps = {
    src: shownUrl,
    sessionTime: currentTime,
    videoOffset: shownVideo?.offset ?? 0,
    videoRate: shownVideo?.rate ?? 1,
    onTimeChange: seek,
    onDuration: (d: number) => shownVideo && recordDuration(shownVideo.id, d),
    onEnded: () => shownVideo && continueAfter(shownVideo.id),
    onError: setError,
    isDemo: project.isDemo,
    playing,
    onPlayingChange: setPlaying,
  };
  const disconnectedCount = project.videos.length - connectedVideos.length;
  const outdated = analysisStale(project);
  const runDisabled =
    !!busy || !project.dataset.channels.some((c) => c.tag === "EA");
  const nav: [Tab, string, typeof Activity][] = [
    ["workspace", t("Çalışma alanı", "Workspace"), Compass],
    ["data", t("Veri & kalite", "Data & quality"), Layers3],
    ["sync", t("Zaman eşleme", "Time sync"), Clock3],
    ["analysis", t("Analiz ayarları", "Analysis settings"), SlidersHorizontal],
    ["interview", t("Görüşme odası", "Interview room"), MessageSquare],
    ["science", t("Bilimsel rehber", "Science guide"), BookOpen],
  ];
  const savedLabel = {
    preparing: t("Hazırlanıyor", "Preparing"),
    saving: t("Kaydediliyor…", "Saving…"),
    saved: t("Yerelde kaydedildi", "Saved locally"),
    failed: t("Kayıt başarısız", "Save failed"),
  }[saved];
  if (!ready)
    return (
      <div className="loading-screen">
        <Bike size={42} />
        <h1>OutLab</h1>
        <p>
          {t(
            "Araştırma alanınız hazırlanıyor…",
            "Preparing your research workspace…",
          )}
        </p>
      </div>
    );
  return (
    <div className={`app ${participantMode ? "participant-mode" : ""}`}>
      <input
        ref={fileRef}
        data-testid="data-input"
        type="file"
        hidden
        multiple
        accept=".csv,.gpx,.json,.mp4,.mov,.webm,.m4v,.insv"
        onChange={(e) => {
          void inspectFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <input
        ref={videoRef}
        data-testid="video-input"
        type="file"
        hidden
        multiple
        accept=".mp4,.mov,.webm,.m4v,.insv"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) attachVideos(files, videoTargetRef.current);
          videoTargetRef.current = null;
          e.target.value = "";
        }}
      />
      <input
        ref={projectRef}
        data-testid="project-input"
        type="file"
        hidden
        accept=".json"
        onChange={(e) => {
          if (e.target.files?.[0]) void restoreProject(e.target.files[0]);
          e.target.value = "";
        }}
      />
      {!participantMode && (
        <aside className="sidebar">
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setTab("workspace");
            }}
          >
            <span className="brand-mark">
              <Activity size={24} />
            </span>
            <span>
              OutLab
              <small>
                {t("Dış mekân araştırma alanı", "Outdoor research workspace")}
              </small>
            </span>
          </a>
          <button
            className="session-switch"
            onClick={async () => {
              setLibrary(await listProjects());
              setLibraryOpen(true);
            }}
          >
            <span className="session-icon">
              <FolderOpen size={18} />
            </span>
            <span>
              <small>{t("Aktif oturum", "Active session")}</small>
              <b>
                {project.participant} ({t("bisiklet turu", "cycling tour")})
              </b>
            </span>
            <ChevronRight size={16} />
          </button>
          <div className="nav-label">
            {t("Araştırma akışı", "Research workflow")}
          </div>
          <nav>
            {nav.map(([id, label, Icon]) => (
              <button
                key={id}
                className={tab === id ? "active" : ""}
                onClick={() => {
                  setTab(id);
                  setClip(null);
                  setPlaying(false);
                }}
              >
                <Icon size={19} />
                <span>{label}</span>
                {id === "interview" && selected.length > 0 && (
                  <b className="count">{selected.length}</b>
                )}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <LockKeyhole size={16} />
            <span>
              {t("Veriler bu bilgisayarda", "Data stays on this computer")}
              <small>{t("Bulut aktarımı yok", "No cloud upload")}</small>
            </span>
            <i />
          </div>
        </aside>
      )}
      <main className="main">
        {!participantMode ? (
          <header className="topbar">
            <div className="breadcrumb">
              {t("Araştırmalar", "Studies")} <ChevronRight size={14} />
              <span>{project.participant}</span>
            </div>
            <div className="topbar-actions">
              <LangSwitch lang={lang} />
              <span className="save-state">
                <span />
                {savedLabel}
              </span>
              <button
                className="icon-button"
                aria-label={t("Proje dosyası aç", "Open project file")}
                onClick={() => projectRef.current?.click()}
              >
                <FolderOpen size={18} />
              </button>
              <button
                className="button small"
                onClick={() => setExportsOpen(true)}
              >
                <Download size={16} /> {t("Dışa aktar", "Export")}
              </button>
            </div>
          </header>
        ) : (
          <header className="participant-header">
            <span>
              <Video size={18} /> {t("Görüşme", "Interview")}:{" "}
              {project.participant}
            </span>
            <LangSwitch lang={lang} />
            <button
              className="button"
              onClick={() => {
                setParticipantMode(false);
                setPlaying(false);
              }}
            >
              {t("Araştırmacı görünümüne dön", "Back to researcher view")}
            </button>
          </header>
        )}
        <div className="content">
          {busy && (
            <div className="busy" role="status">
              <span className="spinner" />
              {busy}
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              <AlertTriangle size={18} />
              <span>{error}</span>
              <button
                aria-label={t("Hata mesajını kapat", "Dismiss error")}
                onClick={() => setError("")}
              >
                <X size={17} />
              </button>
            </div>
          )}
          {saveError && <Info tone="warning">{saveError}</Info>}
          {!participantMode && (
            <>
              <div className="page-heading">
                <div>
                  {project.isDemo && (
                    <div className="eyebrow">
                      <span className="demo-badge">
                        {t("Sentetik demo", "Synthetic demo")}
                      </span>
                    </div>
                  )}
                  <h1>
                    {tab === "workspace"
                      ? project.title
                      : nav.find((n) => n[0] === tab)?.[1]}
                  </h1>
                  <p>
                    {tab === "workspace"
                      ? t(
                          "Videoyu, rotayı ve fizyolojik değişimleri aynı anda inceleyin.",
                          "Review the video, the route and physiological changes at the same time.",
                        )
                      : tab === "data"
                        ? t(
                            "Her dosyanın kaynağını, saatini ve ölçüm kalitesini görün.",
                            "See the source, clock and measurement quality of every file.",
                          )
                        : tab === "sync"
                          ? t(
                              "Üç kayıt, tek referans zaman. Eşlemenin kanıtını da saklayın.",
                              "Three recordings, one reference clock. Keep the evidence for the mapping as well.",
                            )
                          : tab === "analysis"
                            ? t(
                                "Her adımın ne yaptığını bilin; her sonucu yeniden üretebilin.",
                                "Know what each step does, and be able to reproduce every result.",
                              )
                            : tab === "interview"
                              ? t(
                                  "Seçtiğiniz anları bağlamıyla izletin; katılımcının kendi sözcüklerini kaydedin.",
                                  "Play the moments you selected in context, and record the participant's own words.",
                                )
                              : t(
                                  "Bir sinyalin ne söylediği kadar, ne söyleyemediğini de bilin.",
                                  "Know what a signal cannot tell you as well as what it can.",
                                )}
                  </p>
                </div>
                <button
                  className="button primary"
                  onClick={() => {
                    setImportOpen(true);
                  }}
                >
                  <Plus size={17} /> {t("Veri ekle", "Add data")}
                </button>
              </div>
              <div className="workflow-strip">
                <button onClick={() => setTab("data")}>
                  <span
                    className={project.dataset.channels.length ? "done" : ""}
                  >
                    {project.dataset.channels.length ? (
                      <Check size={12} />
                    ) : (
                      "1"
                    )}
                  </span>
                  {t("Veriyi doğrula", "Check data")}{" "}
                </button>
                <ChevronRight size={14} />
                <button onClick={() => setTab("sync")}>
                  <span
                    className={
                      videosVerified &&
                      (!project.dataset.track.length ||
                        project.sync.gpsVerified)
                        ? "done"
                        : ""
                    }
                  >
                    {videosVerified &&
                    (!project.dataset.track.length ||
                      project.sync.gpsVerified) ? (
                      <Check size={12} />
                    ) : (
                      "2"
                    )}
                  </span>{" "}
                  {t("Zamanı eşle", "Sync time")}
                </button>
                <ChevronRight size={14} />
                <button onClick={() => setTab("analysis")}>
                  <span className={project.analysis ? "done" : ""}>
                    {project.analysis ? <Check size={12} /> : "3"}
                  </span>{" "}
                  {t("Anları incele", "Review moments")}
                </button>
                <ChevronRight size={14} />
                <button onClick={() => setTab("interview")}>
                  <span>4</span>
                  {t("Deneyimi dinle", "Hear the experience")}
                </button>
                <div className="local-label">
                  <ShieldCheck size={15} />
                  {t("Yerel çalışma", "Working locally")}
                </div>
              </div>
            </>
          )}

          {tab === "workspace" && !participantMode && (
            <>
              <div className="metrics">
                <div>
                  <span className="metric-icon sage">
                    <Clock3 size={19} />
                  </span>
                  <div>
                    <small>{t("Oturum süresi", "Session length")}</small>
                    <b>
                      {time(duration)}
                      <em>{t("dk : sn", "min : s")}</em>
                    </b>
                  </div>
                </div>
                <div>
                  <span className="metric-icon lilac">
                    <Activity size={19} />
                  </span>
                  <div>
                    <small>{t("Sensör kanalları", "Sensor channels")}</small>
                    <b>
                      {project.dataset.channels.length}
                      <em>{t("eş zaman çizgisi", "synchronized series")}</em>
                    </b>
                  </div>
                </div>
                <div>
                  <span className="metric-icon peach">
                    <MapPin size={19} />
                  </span>
                  <div>
                    <small>{t("Rota kaydı", "Route record")}</small>
                    <b>
                      {number(project.dataset.track.length, 0)}
                      <em>{t("konum noktası", "location points")}</em>
                    </b>
                  </div>
                </div>
                <div>
                  <span className="metric-icon blue">
                    <MessageSquare size={19} />
                  </span>
                  <div>
                    <small>{t("Görüşme listesi", "Interview list")}</small>
                    <b>
                      {selected.length}
                      <em>{t("seçilen an", "selected moments")}</em>
                    </b>
                  </div>
                </div>
              </div>
              <div className="workspace-grid">
                <section className="main-pane">
                  <div className="media-grid">
                    <section className="card video-card">
                      <div className="card-heading">
                        <h2>
                          <Video size={17} />
                          {t("Tur videoları", "Ride videos")}
                        </h2>
                        <button
                          className="text-button"
                          disabled={project.videos.length >= MAX_VIDEOS}
                          title={t(
                            `Bir oturumda en fazla ${MAX_VIDEOS} video`,
                            `Up to ${MAX_VIDEOS} videos per session`,
                          )}
                          onClick={() => pickVideo()}
                        >
                          {project.videos.length
                            ? t("Video ekle", "Add video")
                            : t("Video bağla", "Connect video")}{" "}
                          ({project.videos.length}/{MAX_VIDEOS})
                          <Plus size={14} />
                        </button>
                      </div>
                      <VideoPanel
                        key={videoKey}
                        {...videoPanelProps}
                        fileName={
                          shownVideo
                            ? `${videoLabel(shownIndex)}: ${shownVideo.name}`
                            : undefined
                        }
                      />
                      {videoStrip("manage")}
                      <div className="media-foot">
                        <span>
                          <i
                            className={
                              connectedVideos.length && !disconnectedCount
                                ? "dot green"
                                : "dot"
                            }
                          />
                          {!project.videos.length
                            ? t(
                                `MP4, Insta360 X3; en fazla ${MAX_VIDEOS} video`,
                                `MP4, Insta360 X3; up to ${MAX_VIDEOS} videos`,
                              )
                            : disconnectedCount
                              ? project.videos.length === 1
                                ? t(
                                    "Video yeniden bağlanmalı",
                                    "Video needs to be reconnected",
                                  )
                                : t(
                                    `${disconnectedCount} video yeniden bağlanmalı`,
                                    `${disconnectedCount} videos need to be reconnected`,
                                  )
                              : project.videos.length === 1
                                ? t(
                                    "Yerel video bağlı",
                                    "Local video connected",
                                  )
                                : t(
                                    `${project.videos.length} yerel video bağlı`,
                                    `${project.videos.length} local videos connected`,
                                  )}
                        </span>
                        <span>
                          {videosVerified
                            ? t("İşaretlerle eşlendi", "Mapped with markers")
                            : t("Eşleme bekliyor", "Mapping pending")}
                        </span>
                      </div>
                    </section>
                    <section className="card map-card">
                      <div className="card-heading">
                        <h2>
                          <MapPin size={17} />
                          {t("Rota & konum", "Route & location")}
                        </h2>
                        <span className="tag">
                          {project.isDemo
                            ? t("Örnek rota", "Sample route")
                            : "GPX"}
                        </span>
                      </div>
                      <RouteMap
                        track={project.dataset.track}
                        currentTime={currentTime}
                        gpsOffset={project.sync.gpsOffset}
                        onSeek={seek}
                        isDemo={project.isDemo}
                      />
                    </section>
                  </div>
                  <section className="card timeline-card">
                    <div className="card-heading">
                      <h2>
                        <Activity size={17} />
                        {t("Senkron sinyaller", "Synchronized signals")}{" "}
                        <span className="live-pill">
                          {t("Tek zaman ekseni", "Shared time axis")}
                        </span>
                      </h2>
                      <button
                        className="text-button"
                        onClick={() => setTab("analysis")}
                      >
                        <Settings2 size={15} />{" "}
                        {t("Analiz ayarları", "Analysis settings")}
                      </button>
                    </div>
                    <div className="timeline-controls">
                      <button
                        className="play-button"
                        aria-label={
                          playing ? t("Duraklat", "Pause") : t("Oynat", "Play")
                        }
                        onClick={() => {
                          setClip(null);
                          setPlaying(!playing);
                        }}
                      >
                        {playing ? <Pause size={18} /> : <Play size={18} />}
                      </button>
                      <b className="timecode">
                        {time(currentTime)}
                        <small> / {time(duration)}</small>
                      </b>
                      <input
                        aria-label={t("Ortak zaman çizgisi", "Shared timeline")}
                        type="range"
                        min={0}
                        max={duration}
                        step={0.05}
                        value={currentTime}
                        onChange={(e) => {
                          setClip(null);
                          seek(+e.target.value);
                        }}
                      />
                      <button className="button small" onClick={addManual}>
                        <Plus size={14} />
                        {t("Anı işaretle", "Mark moment")}
                      </button>
                    </div>
                    <div className="channel-toggles">
                      {project.dataset.channels.map((c) => (
                        <label key={c.id}>
                          <input
                            type="checkbox"
                            checked={visibleTags.includes(c.tag)}
                            onChange={(e) =>
                              setVisibleTags(
                                e.target.checked
                                  ? [...visibleTags, c.tag]
                                  : visibleTags.filter((t) => t !== c.tag),
                              )
                            }
                          />
                          {c.tag}
                          <span>{c.label}</span>
                        </label>
                      ))}
                    </div>
                    {project.dataset.channels.length ? (
                      <SignalChart
                        channels={displayedChannels}
                        analysis={project.analysis}
                        currentTime={currentTime}
                        duration={duration}
                        onSeek={seek}
                        events={project.analysis?.events}
                      />
                    ) : (
                      emptyState(
                        t("Henüz sinyal yok", "No signals yet"),
                        t(
                          "EmotiBit CSV dosyalarını Veri ekle alanına sürükleyin.",
                          "Drag EmotiBit CSV files into Add data.",
                        ),
                      )
                    )}
                    <div className="chart-foot">
                      <span>
                        {t(
                          "Grafiğe tıklayın; video ve konum aynı ana gelsin.",
                          "Click the chart to move the video and map to the same moment.",
                        )}
                      </span>
                      <span>
                        {t("Ham veri korunur", "Raw data is preserved")}{" "}
                        <ShieldCheck size={13} />
                      </span>
                    </div>
                  </section>
                  {(!videosVerified ||
                    (!!project.dataset.track.length &&
                      !project.sync.gpsVerified)) && (
                    <Info tone="warning">
                      {!videosVerified
                        ? project.videos.length > 1
                          ? t(
                              `${project.videos.filter((v) => !v.verified).length}/${project.videos.length} videonun eşlemesi doğrulanmadı. `,
                              `${project.videos.filter((v) => !v.verified).length}/${project.videos.length} video mappings not verified. `,
                            )
                          : t(
                              "Video eşlemesi doğrulanmadı. ",
                              "Video mapping not verified. ",
                            )
                        : ""}
                      {project.dataset.track.length && !project.sync.gpsVerified
                        ? t(
                            "GPX eşlemesi doğrulanmadı. ",
                            "GPX mapping not verified. ",
                          )
                        : ""}{" "}
                      {t(
                        "Yan yana görünmek, zamanların doğru eşleştiği anlamına gelmez.",
                        "Appearing side by side does not mean the times are correctly aligned.",
                      )}{" "}
                      <button
                        className="inline-link"
                        onClick={() => setTab("sync")}
                      >
                        {t("Zamanı eşle", "Sync time")}
                      </button>
                    </Info>
                  )}
                </section>
                <aside className="context-pane">
                  <section className="card moments">
                    <div className="card-heading">
                      <h2>{t("İncelenecek anlar", "Moments to review")}</h2>
                      <span className="count">{project.events.length}</span>
                    </div>
                    <p className="card-description">
                      {t(
                        "Fizyolojik değişimi, bulunduğu bağlamla birlikte değerlendirin.",
                        "Assess each physiological change together with its context.",
                      )}
                    </p>
                    {!project.analysis && (
                      <div className="candidate-empty">
                        <b>
                          {t(
                            "İlk aday anları bulun",
                            "Find the first candidate moments",
                          )}
                        </b>
                        <p>
                          {t(
                            "EDA değişimleri için açıklanabilir bir ön tarama çalıştırın.",
                            "Run an explainable screening pass for EDA changes.",
                          )}
                        </p>
                        <button
                          className="button primary"
                          disabled={runDisabled}
                          onClick={runAnalysis}
                        >
                          <Activity size={15} />
                          {t("Adayları hesapla", "Compute candidates")}
                        </button>
                      </div>
                    )}
                    {outdated && (
                      <Info tone="warning">
                        {t(
                          "Ayarlar değişti. Yeniden hesaplayın.",
                          "Settings changed. Recompute.",
                        )}
                      </Info>
                    )}
                    <div className="moment-list">
                      {project.events
                        .slice()
                        .sort((a, b) => a.t - b.t)
                        .map((e, i) => {
                          const candidate =
                            e.provenance?.candidate ??
                            project.analysis?.events.find((c) => c.id === e.id);
                          return (
                            <div
                              key={e.id}
                              className={`moment ${Math.abs(currentTime - e.t) < 5 ? "highlight" : ""}`}
                            >
                              <button
                                className="moment-select"
                                onClick={() => {
                                  seek(e.t);
                                  setActiveEvent(e.id);
                                }}
                              >
                                <span className="moment-number">
                                  {String(i + 1).padStart(2, "0")}
                                </span>
                                <span>
                                  <b>
                                    {time(e.t)}{" "}
                                    <small>
                                      {e.source === "manual"
                                        ? t("Elle seçim", "Manual pick")
                                        : t("EDA adayı", "EDA candidate")}
                                    </small>
                                  </b>
                                  <small>
                                    {candidate?.flagged
                                      ? t(
                                          "Hareketle birlikte, dikkat",
                                          "Coincides with motion, use caution",
                                        )
                                      : candidate?.score != null
                                        ? t(
                                            `Robust z ${number(candidate.score, 1)}, gözden geçirin`,
                                            `Robust z ${number(candidate.score, 1)}, review`,
                                          )
                                        : t(
                                            "Bağlamı inceleyin",
                                            "Review the context",
                                          )}
                                  </small>
                                </span>
                              </button>
                              <button
                                className={
                                  e.selected
                                    ? "select-event selected"
                                    : "select-event"
                                }
                                aria-label={
                                  e.selected
                                    ? t(
                                        `${time(e.t)} anını listeden çıkar`,
                                        `Remove ${time(e.t)} from the interview list`,
                                      )
                                    : t(
                                        `${time(e.t)} anını görüşmeye ekle`,
                                        `Add ${time(e.t)} to the interview`,
                                      )
                                }
                                onClick={() =>
                                  updateEvent(e.id, { selected: !e.selected })
                                }
                              >
                                {e.selected ? (
                                  <Check size={15} />
                                ) : (
                                  <Plus size={15} />
                                )}
                              </button>
                            </div>
                          );
                        })}
                    </div>
                    {project.analysis && project.events.length === 0 && (
                      <p className="card-description">
                        {t(
                          "Bu ayarlarda aday bulunmadı. Bu, fizyolojik tepki olmadığı anlamına gelmez.",
                          "No candidates with these settings. This does not mean there was no physiological response.",
                        )}
                      </p>
                    )}
                    <button
                      className="full-link"
                      onClick={() => setTab("interview")}
                    >
                      {t("Görüşme listesini aç", "Open interview list")}
                    </button>
                  </section>
                  <section className="why-card">
                    <h3>
                      {t(
                        "Bir pik, tek başına bir duygu değildir.",
                        "A peak on its own is not an emotion.",
                      )}
                    </h3>
                    <p>
                      {t(
                        "EDA değişimine efor, sıcaklık, temas ve uyarılma katkıda bulunabilir. Anlamını video ve katılımcının anlatısıyla araştırın.",
                        "Effort, temperature, electrode contact and arousal can all contribute to an EDA change. Investigate its meaning with the video and the participant's account.",
                      )}
                    </p>
                    <button onClick={() => setTab("science")}>
                      {t("Bilimsel dayanağı gör", "See the scientific basis")}
                    </button>
                  </section>
                </aside>
              </div>
            </>
          )}

          {tab === "data" && !participantMode && (
            <div className="page-grid">
              <section>
                <section className="card padded">
                  <h2>{t("Oturum bilgisi", "Session details")}</h2>
                  <div className="form-grid">
                    <Field
                      label={t("Katılımcı kodu", "Participant code")}
                      help={t(
                        "Ad yerine araştırma kodu kullanın.",
                        "Use a study code, not a name.",
                      )}
                    >
                      <input
                        value={project.participant}
                        onChange={(e) =>
                          mutate((p) => ({ ...p, participant: e.target.value }))
                        }
                      />
                    </Field>
                    <Field label={t("Oturum başlığı", "Session title")}>
                      <input
                        value={project.title}
                        onChange={(e) =>
                          mutate((p) => ({ ...p, title: e.target.value }))
                        }
                      />
                    </Field>
                    <Field
                      label={t("Tur başlangıç tarihi", "Ride start date")}
                      help={t(
                        "Görüşmeye kadar geçen zamanı raporlamak için; bu alan sinyallerin saatini değiştirmez.",
                        "Used to report the time elapsed before the interview; it does not change the signal clock.",
                      )}
                    >
                      <input
                        type="datetime-local"
                        value={project.recordedAt}
                        onChange={(e) =>
                          mutate((p) => ({ ...p, recordedAt: e.target.value }))
                        }
                      />
                    </Field>
                  </div>
                </section>
                <section className="card padded">
                  <div className="section-title">
                    <h2>
                      {t("Kanal kalite dökümü", "Channel quality report")}
                    </h2>
                    <span className="tag">
                      {t(
                        `${project.dataset.channels.length} kanal`,
                        `${project.dataset.channels.length} channels`,
                      )}
                    </span>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>{t("Kanal", "Channel")}</th>
                          <th>{t("Örnekleme", "Sampling")}</th>
                          <th>{t("Geçerli satır", "Valid rows")}</th>
                          <th>{t("Atlanan", "Skipped")}</th>
                          <th>{t("Tekrar", "Duplicates")}</th>
                          <th>{t("Boşluk", "Gaps")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {project.dataset.channels.map((c) => (
                          <tr key={c.id}>
                            <td>
                              <b>{c.tag}</b>
                              <small>
                                {c.label} ({c.unit})
                              </small>
                            </td>
                            <td>{number(c.sampleRate)} Hz</td>
                            <td>{number(c.quality.validRows, 0)}</td>
                            <td
                              className={
                                c.quality.invalidRows ? "warn-text" : ""
                              }
                            >
                              {c.quality.invalidRows}
                            </td>
                            <td>{c.quality.duplicates}</td>
                            <td>
                              {c.quality.gaps}
                              {c.quality.flat && (
                                <small className="warn-text">
                                  {t("Sabit sinyal", "Flat signal")}
                                </small>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!project.dataset.channels.length &&
                    emptyState(
                      t("Dosyalarınızı ekleyin", "Add your files"),
                      t(
                        "Önce sütun eşlemeleri gösterilir; veriler onayınızdan sonra alınır.",
                        "Column mappings are shown first; data is imported only after you confirm.",
                      ),
                    )}
                  {project.dataset.channels.flatMap((c) =>
                    c.quality.warnings.map((w, i) => (
                      <Info key={c.id + i} tone="warning">
                        {c.tag}: {w}
                      </Info>
                    )),
                  )}
                </section>
                <section className="card padded">
                  <h2>
                    {t(
                      "Kaynak dosyalar & bütünlük",
                      "Source files & integrity",
                    )}
                  </h2>
                  {project.dataset.sources.map((s) => (
                    <details className="source-detail" key={s.name}>
                      <summary>
                        <FileCheck2 size={17} />
                        <b>{s.name}</b>
                        <span>
                          {number(s.rows, 0)} {t("satır", "rows")}
                        </span>
                      </summary>
                      <p>
                        {t(
                          "SHA-256: dosyanın değişip değişmediğini kontrol etmek için.",
                          "SHA-256: used to check whether the file has changed.",
                        )}
                      </p>
                      <code className="hash">{s.sha256}</code>
                      {s.warnings.map((w, i) => (
                        <p key={i}>{w}</p>
                      ))}
                    </details>
                  ))}
                  {project.dataset.warnings.map((w, i) => (
                    <Info key={i} tone="warning">
                      {w}
                    </Info>
                  ))}
                </section>
              </section>
              <aside>
                <section className="why-card">
                  <h3>
                    {t(
                      "Ölçmediğimiz yeri doldurmuyoruz.",
                      "We do not fill in what was not measured.",
                    )}
                  </h3>
                  <p>
                    {t(
                      "Zaman boşlukları, bozuk satırlar ve tekrarlar görünür raporlanır. İşlenmiş seri, ham serinin yanında tutulur.",
                      "Time gaps, corrupt rows and duplicates are reported openly. The processed series is kept next to the raw series.",
                    )}
                  </p>
                </section>
                <section className="card padded">
                  <h3>{t("Dosya hazırlığı", "Preparing files")}</h3>
                  <ol className="guide-list">
                    <li>
                      {t(
                        "EmotiBit DataParser ile sensör CSV’lerini dışa aktarın.",
                        "Export sensor CSVs with the EmotiBit DataParser.",
                      )}
                    </li>
                    <li>
                      {t("", "Also include ")}
                      <code>_info.json</code>
                      {t(
                        " dosyasını da ekleyin; birim ve donanım bilgileri korunur.",
                        " so unit and hardware details are kept.",
                      )}
                    </li>
                    <li>
                      {t(
                        "GPX dosyasında her konumun zaman damgası olmalı.",
                        "Every GPX point needs a timestamp.",
                      )}
                    </li>
                    <li>
                      {t(
                        "Insta360 Studio’dan H.264 MP4 dışa aktarın. INSV önce birleştirilmelidir.",
                        "Export H.264 MP4 from Insta360 Studio. INSV files must be stitched first.",
                      )}
                    </li>
                  </ol>
                  <button
                    className="button"
                    onClick={() => setImportOpen(true)}
                  >
                    <Upload size={16} />
                    {t("Dosyaları seç", "Choose files")}
                  </button>
                </section>
                <Info>
                  {t(
                    "Bu sürüm ham EmotiBit paket dosyasını doğrudan analiz etmez. Kesin örnek zamanları için resmî DataParser çıktısı gerekir.",
                    "This version does not analyze raw EmotiBit packet files directly. Exact sample times require the official DataParser output.",
                  )}
                </Info>
              </aside>
            </div>
          )}

          {tab === "sync" && !participantMode && (
            <div className="page-grid">
              <section>
                <section className="card padded">
                  <div className="section-title">
                    <h2>
                      {t(
                        "1. Video ile sensörü ortak olayda buluşturun",
                        "1. Align video and sensor on a shared event",
                      )}
                    </h2>
                    <span
                      className={`tag ${chosenVideo?.verified ? "good" : ""}`}
                    >
                      {chosenVideo?.verified
                        ? t("Eşleme kayıtlı", "Mapping saved")
                        : t("Doğrulanmadı", "Not verified")}
                    </span>
                  </div>
                  <p>
                    {t(
                      "Videoda görülen, sensörde de ayırt edilen aynı olayı işaretleyin. Tur başında ve sonunda yapılan belirgin bir senkron işareti saat kaymasını değerlendirmeyi kolaylaştırır. Her video kendi saatine sahiptir; birden fazla video varsa her birini ayrı eşleyin.",
                      "Mark one event that is visible in the video and distinguishable in the sensor data. A clear sync marker at the start and end of the ride makes clock drift easier to assess. Each video has its own clock; if there are several videos, map each one separately.",
                    )}
                  </p>
                  {project.videos.length ? (
                    (videoStrip("sync") ?? (
                      <p className="small-note">
                        {t("Eşlenen video", "Mapped video")}:{" "}
                        <b>{videoLabel(0)}</b> ({project.videos[0].name})
                      </p>
                    ))
                  ) : (
                    <Info tone="warning">
                      {t(
                        `Önce en az bir video bağlayın (en fazla ${MAX_VIDEOS}).`,
                        `Connect at least one video first (up to ${MAX_VIDEOS}).`,
                      )}{" "}
                      <button
                        className="inline-link"
                        onClick={() => pickVideo()}
                      >
                        {t("Video bağla", "Connect video")}
                      </button>
                    </Info>
                  )}
                  <div className="form-grid">
                    <Field
                      label={t(
                        "Videodaki olay zamanı (s)",
                        "Event time in video (s)",
                      )}
                    >
                      <Num
                        value={anchors.v1}
                        min={0}
                        step={0.01}
                        onChange={(n) => setAnchors((a) => ({ ...a, v1: n }))}
                      />
                    </Field>
                    <Field
                      label={t(
                        "Sensör zamanındaki aynı olay (s)",
                        "Same event in sensor time (s)",
                      )}
                    >
                      <Num
                        value={anchors.s1}
                        min={0}
                        step={0.01}
                        onChange={(n) => setAnchors((a) => ({ ...a, s1: n }))}
                      />
                    </Field>
                  </div>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={anchors.two}
                      onChange={(e) =>
                        setAnchors((a) => ({ ...a, two: e.target.checked }))
                      }
                    />
                    {t(
                      "İkinci bir ortak olayla saat kaymasını da düzelt",
                      "Also correct clock drift with a second shared event",
                    )}
                  </label>
                  {anchors.two && (
                    <div className="form-grid">
                      <Field
                        label={t(
                          "İkinci olay: video zamanı (s)",
                          "Second event: video time (s)",
                        )}
                      >
                        <Num
                          value={anchors.v2}
                          min={0}
                          step={0.01}
                          onChange={(n) => setAnchors((a) => ({ ...a, v2: n }))}
                        />
                      </Field>
                      <Field
                        label={t(
                          "İkinci olay: sensör zamanı (s)",
                          "Second event: sensor time (s)",
                        )}
                      >
                        <Num
                          value={anchors.s2}
                          min={0}
                          step={0.01}
                          onChange={(n) => setAnchors((a) => ({ ...a, s2: n }))}
                        />
                      </Field>
                    </div>
                  )}
                  <Field
                    label={t("Eşlemenin dayanağı", "Basis for the mapping")}
                    help={t(
                      "Örnek: Tur başında videoda görülen üç cihaz dokunuşu, ivmede aynı örüntü.",
                      "Example: three taps on the device, visible in the video at the start of the ride, with the same pattern in acceleration.",
                    )}
                  >
                    <textarea
                      rows={2}
                      value={anchors.reason}
                      onChange={(e) =>
                        setAnchors((a) => ({ ...a, reason: e.target.value }))
                      }
                    />
                  </Field>
                  <Field
                    label={t(
                      "Tahmini zaman belirsizliği (± saniye)",
                      "Estimated time uncertainty (± seconds)",
                    )}
                    help={t(
                      "Elle gözlem ve cihaz saatlerine dayalı araştırmacı tahmini; ölçülmüş güven aralığı değildir.",
                      "A researcher estimate based on manual observation and device clocks; not a measured confidence interval.",
                    )}
                  >
                    <Num
                      value={anchors.uncertainty}
                      min={0}
                      step={0.1}
                      onChange={(n) =>
                        setAnchors((a) => ({ ...a, uncertainty: n }))
                      }
                    />
                  </Field>
                  <button
                    className="button primary"
                    disabled={!chosenVideo}
                    onClick={applySync}
                  >
                    <Check size={16} />
                    {t("Eşlemeyi uygula ve kaydet", "Apply and save mapping")}
                  </button>
                </section>
                <section className="card padded">
                  <h2>
                    {t(
                      "2. GPX saatini referans eksenine yerleştirin",
                      "2. Place the GPX clock on the reference axis",
                    )}
                  </h2>
                  <Info tone={project.sync.gpsVerified ? "success" : "warning"}>
                    {project.sync.gpsVerified
                      ? t(
                          "GPX eşlemesi araştırmacı kontrolüyle kaydedildi.",
                          "GPX mapping saved after a researcher check.",
                        )
                      : t(
                          "GPX zaman eşlemesi henüz doğrulanmadı.",
                          "GPX time mapping not verified yet.",
                        )}
                  </Info>
                  <p>
                    {t(
                      "İki kaynakta da geçerli mutlak zaman varsa başlangıç farkı otomatik alınır. Cihazın yalnızca açılıştan itibaren saydığı saat varsa GPX konumunu ortak bir olayla elle doğrulayın.",
                      "If both sources carry valid absolute time, the start offset is taken automatically. If the device only counts time since power-on, verify the GPX position manually against a shared event.",
                    )}
                  </p>
                  <div className="form-grid">
                    <Field
                      label={t(
                        "GPX başlangıcının sensör eksenindeki zamanı (s)",
                        "GPX start on the sensor axis (s)",
                      )}
                      help={t(
                        "Pozitif değer rotayı daha ileriye, negatif değer geriye taşır.",
                        "A positive value moves the route later, a negative value earlier.",
                      )}
                    >
                      <Num
                        value={project.sync.gpsOffset}
                        step={0.1}
                        onChange={(n) =>
                          mutate((p) =>
                            audit(
                              {
                                ...p,
                                sync: {
                                  ...p.sync,
                                  gpsOffset: n,
                                  gpsVerified: false,
                                },
                              },
                              t("GPX kaydırması değişti", "GPX offset changed"),
                              t(
                                `${n} saniye; elle doğrulanmalı.`,
                                `${n} seconds; must be verified manually.`,
                              ),
                            ),
                          )
                        }
                      />
                    </Field>
                    <div className="clock-readout">
                      <small>
                        {t("Sensör mutlak başlangıç", "Sensor absolute start")}
                      </small>
                      <b>
                        {project.dataset.sensorOriginEpoch
                          ? new Date(
                              project.dataset.sensorOriginEpoch * 1000,
                            ).toLocaleString(locale())
                          : t("Mutlak saat yok", "No absolute time")}
                      </b>
                      <small>
                        {t("GPX mutlak başlangıç", "GPX absolute start")}
                      </small>
                      <b>
                        {project.dataset.gpxOriginEpoch
                          ? new Date(
                              project.dataset.gpxOriginEpoch * 1000,
                            ).toLocaleString(locale())
                          : t("Mutlak saat yok", "No absolute time")}
                      </b>
                    </div>
                  </div>
                  <Field
                    label={t(
                      "GPX eşlemesinin dayanağı",
                      "Basis for the GPX mapping",
                    )}
                  >
                    <textarea
                      rows={2}
                      value={project.sync.gpsReason ?? ""}
                      onChange={(e) =>
                        mutate((p) => ({
                          ...p,
                          sync: {
                            ...p.sync,
                            gpsReason: e.target.value,
                            gpsVerified: false,
                          },
                        }))
                      }
                      placeholder={t(
                        "Örneğin videodaki durma anı ile GPX konumlarının aynı zaman aralığı…",
                        "For example, a stop visible in the video and the matching span of GPX points…",
                      )}
                    />
                  </Field>
                  <Field
                    label={t(
                      "GPX zaman belirsizliği (± saniye)",
                      "GPX time uncertainty (± seconds)",
                    )}
                  >
                    <Num
                      value={project.sync.gpsUncertainty ?? 1}
                      min={0}
                      step={0.1}
                      onChange={(n) =>
                        mutate((p) => ({
                          ...p,
                          sync: {
                            ...p.sync,
                            gpsUncertainty: Math.max(0, n),
                            gpsVerified: false,
                          },
                        }))
                      }
                    />
                  </Field>
                  <button
                    className="button primary"
                    disabled={
                      !project.dataset.track.length ||
                      !project.sync.gpsReason?.trim()
                    }
                    onClick={() =>
                      mutate((p) =>
                        audit(
                          { ...p, sync: { ...p.sync, gpsVerified: true } },
                          t("GPX eşlemesi doğrulandı", "GPX mapping verified"),
                          JSON.stringify({
                            offset: p.sync.gpsOffset,
                            reason: p.sync.gpsReason,
                            uncertainty: p.sync.gpsUncertainty ?? 1,
                          }),
                        ),
                      )
                    }
                  >
                    <Check size={16} />
                    {t("GPX kontrolünü kaydet", "Save GPX check")}
                  </button>
                </section>
              </section>
              <aside>
                <section className="card padded">
                  <h3>
                    {t("Uygulanan dönüşüm", "Applied transform")}
                    {chosenVideo &&
                      ` (${videoLabel(project.videos.indexOf(chosenVideo))})`}
                  </h3>
                  <div className="formula">
                    t<sub>{t("sensör", "sensor")}</sub> ={" "}
                    {number(chosenVideo?.rate ?? 1, 6)} × t<sub>video</sub>{" "}
                    {(chosenVideo?.offset ?? 0) >= 0 ? "+" : "−"}{" "}
                    {number(Math.abs(chosenVideo?.offset ?? 0), 3)}
                  </div>
                  <p>
                    {t("Ofset:", "Offset:")}{" "}
                    <b>{number(chosenVideo?.offset ?? 0, 3)} s</b>
                    <br />
                    {t("Saat kayması:", "Clock drift:")}{" "}
                    <b>{number(((chosenVideo?.rate ?? 1) - 1) * 1e6, 1)} ppm</b>
                    <br />
                    {t(
                      "Beyan edilen belirsizlik:",
                      "Declared uncertainty:",
                    )}{" "}
                    <b>±{chosenVideo?.uncertainty ?? 1} s</b>
                    {chosenVideo && (
                      <>
                        <br />
                        {t(
                          "Sensör ekseninde kapsam:",
                          "Coverage on sensor axis:",
                        )}{" "}
                        <b>{videoCoverage(chosenVideo)}</b>
                      </>
                    )}
                  </p>
                  <p>
                    {chosenVideo?.reason ||
                      t(
                        "Henüz ortak olay belirtilmedi.",
                        "No shared event specified yet.",
                      )}
                  </p>
                </section>
                <Info tone="warning">
                  {t(
                    "İki noktaya tam uyum tek başına doğruluk kanıtı değildir. Aradaki üçüncü bir olayda kalan zaman hatasını kontrol edip aşağıya kaydedin.",
                    "A perfect fit to two points is not proof of accuracy on its own. Check the remaining time error at a third event in between and record it below.",
                  )}
                </Info>
                <Field
                  label={t(
                    "Bağımsız eşleme kontrolü / kalan hata",
                    "Independent mapping check / remaining error",
                  )}
                >
                  <textarea
                    rows={4}
                    placeholder={t(
                      "Kontrol olayı, video/sensör saati ve gözlenen fark…",
                      "Check event, video/sensor time and observed difference…",
                    )}
                    defaultValue={
                      project.audit
                        .filter((a) => INDEPENDENT_CHECK.includes(a.action))
                        .at(-1)?.detail ?? ""
                    }
                    onBlur={(e) => {
                      if (e.target.value)
                        mutate((p) =>
                          audit(
                            p,
                            t(INDEPENDENT_CHECK[0], INDEPENDENT_CHECK[1]),
                            e.target.value,
                          ),
                        );
                    }}
                  />
                </Field>
                <section className="why-card">
                  <h3>
                    {t(
                      "EDA tepesini görüntüye zorla hizalamayın.",
                      "Do not force an EDA peak to line up with the footage.",
                    )}
                  </h3>
                  <p>
                    {t(
                      "Fizyolojik yanıtın uyaran sonrası gecikmesi vardır. Saat eşlemesi için duygusal tepki tahmini yerine fiziksel ortak işaret kullanın.",
                      "Physiological responses lag behind the stimulus. Use a physical shared marker for clock mapping, not a guess about an emotional reaction.",
                    )}
                  </p>
                </section>
              </aside>
            </div>
          )}

          {tab === "analysis" && !participantMode && (
            <div className="page-grid">
              <section>
                <section className="card padded">
                  <h2>
                    {t("1. Karşılaştırma aralığı", "1. Reference interval")}
                  </h2>
                  <p>
                    {t(
                      "Ön tarama, fazik bileşenin bu aralıktaki medyan ve MAD değerlerine göre hesaplanır. Aynı oturumdan, kaliteli ve bağlamı bilinen bir bölüm seçin. Aralık otomatik olarak “dinlenim” sayılmaz.",
                      "Screening scores are computed against the median and MAD of the phasic component in this interval. Choose a good-quality section of the same session whose context you know. The interval is not automatically treated as “rest”.",
                    )}
                  </p>
                  <div className="form-grid">
                    {(["baselineStart", "baselineEnd"] as const).map(
                      (key, i) => (
                        <Field
                          key={key}
                          label={
                            i
                              ? t("Bitiş (s)", "End (s)")
                              : t("Başlangıç (s)", "Start (s)")
                          }
                        >
                          <Num
                            value={project.config[key]}
                            min={0}
                            max={duration}
                            onChange={(n) =>
                              mutate((p) => ({
                                ...p,
                                config: { ...p.config, [key]: n },
                              }))
                            }
                          />
                        </Field>
                      ),
                    )}
                  </div>
                </section>
                <section className="card padded">
                  <h2>
                    {t(
                      "2. Açıklanabilir aday taraması",
                      "2. Explainable candidate screening",
                    )}
                  </h2>
                  <div className="form-grid">
                    <Field
                      label={t(
                        "Aday eşiği (robust z)",
                        "Candidate threshold (robust z)",
                      )}
                      help={t(
                        "Keşif amaçlı hassasiyet ayarıdır; klinik veya duygu eşiği değildir.",
                        "An exploratory sensitivity setting; not a clinical or emotion threshold.",
                      )}
                    >
                      <Num
                        value={project.config.zThreshold}
                        min={1}
                        max={20}
                        step={0.5}
                        onChange={(n) =>
                          mutate((p) => ({
                            ...p,
                            config: { ...p.config, zThreshold: n },
                          }))
                        }
                      />
                    </Field>
                    <Field
                      label={t(
                        "Adaylar arası en az süre (s)",
                        "Minimum time between candidates (s)",
                      )}
                      help={t(
                        "Görüşmede birbirine çok yakın anların tekrar seçilmesini azaltır.",
                        "Reduces repeated picks of moments that lie very close together.",
                      )}
                    >
                      <Num
                        value={project.config.minDistance}
                        min={1}
                        max={300}
                        onChange={(n) =>
                          mutate((p) => ({
                            ...p,
                            config: { ...p.config, minDistance: n },
                          }))
                        }
                      />
                    </Field>
                    <Field
                      label={t(
                        "İvme değişimi eşiği (g/s)",
                        "Acceleration change threshold (g/s)",
                      )}
                      help={t(
                        "İvme bileşkesi türevinin mutlak değeri. m/s² kaydı varsa g birimine dönüştürülür; Bir bölümün artefakt olduğunu kanıtlamaz.",
                        "Absolute value of the derivative of acceleration magnitude. Recordings in m/s² are converted to g. Crossing it does not prove that a section is an artifact.",
                      )}
                    >
                      <Num
                        value={project.config.motionThreshold}
                        min={1}
                        max={20}
                        step={0.5}
                        onChange={(n) =>
                          mutate((p) => ({
                            ...p,
                            config: { ...p.config, motionThreshold: n },
                          }))
                        }
                      />
                    </Field>
                  </div>
                  <Info>
                    {t(
                      "Ham veri yerinde tutulur. Boşluklar boyunca filtreleme yapılmaz; hareketle eşleşen örnekler işaretlenir. Ham PPG’den otomatik nabız/HRV veya duygu sınıfı üretilmez.",
                      "Raw data is kept as recorded. Filtering does not run across gaps; samples that coincide with motion are flagged. No heart rate, HRV or emotion class is derived automatically from raw PPG.",
                    )}
                  </Info>
                  <button
                    className="button primary"
                    disabled={runDisabled}
                    onClick={runAnalysis}
                  >
                    <Activity size={17} />
                    {project.analysis
                      ? t("Analizi yeniden çalıştır", "Run analysis again")
                      : t("Analizi çalıştır", "Run analysis")}
                  </button>
                  {outdated && (
                    <p className="warn-text">
                      {t(
                        "Ayarlar değişti; grafik ve adaylar önceki çalıştırmaya aittir.",
                        "Settings changed; the chart and candidates belong to the previous run.",
                      )}
                    </p>
                  )}
                </section>
                {project.analysis && (
                  <section className="card padded">
                    <h2>{t("Çalıştırma kaydı", "Run record")}</h2>
                    <dl className="details-grid">
                      <dt>{t("Yöntem", "Method")}</dt>
                      <dd>{project.analysis.method}</dd>
                      <dt>{t("Sürüm", "Version")}</dt>
                      <dd>{project.analysis.version}</dd>
                      <dt>{t("EDA örneği", "EDA samples")}</dt>
                      <dd>{number(project.analysis.metrics.edaSamples, 0)}</dd>
                      <dt>{t("Hareket işaretli", "Motion-flagged")}</dt>
                      <dd>
                        {t(
                          `%${number(project.analysis.metrics.flaggedPercent, 1)}`,
                          `${number(project.analysis.metrics.flaggedPercent, 1)}%`,
                        )}
                      </dd>
                      <dt>{t("Karşılaştırma medyanı", "Reference median")}</dt>
                      <dd>
                        {number(project.analysis.metrics.baselineMedian, 5)}
                      </dd>
                      <dt>MAD</dt>
                      <dd>{number(project.analysis.metrics.baselineMad, 5)}</dd>
                    </dl>
                    {project.analysis.warnings.map((w, i) => (
                      <Info key={i} tone="warning">
                        {w}
                      </Info>
                    ))}
                    <details>
                      <summary>
                        {t(
                          "Tüm işlem parametreleri",
                          "All processing parameters",
                        )}
                      </summary>
                      <pre>
                        {JSON.stringify(project.analysis.parameters, null, 2)}
                      </pre>
                    </details>
                    <button className="button" onClick={exportSignals}>
                      <Download size={16} />
                      {t("İşlenmiş EDA’yı indir", "Download processed EDA")}
                    </button>
                  </section>
                )}
              </section>
              <aside>
                <section className="why-card">
                  <h3>
                    {t(
                      "Tonic ve phasic ne demek?",
                      "What do tonic and phasic mean?",
                    )}
                  </h3>
                  <p>
                    <b>Tonic:</b>{" "}
                    {t(
                      "Sinyalin yavaş değişen bileşeni.",
                      "The slowly changing component of the signal.",
                    )}
                    <br />
                    <b>Phasic:</b>{" "}
                    {t(
                      "Daha hızlı değişen bileşeni.",
                      "The faster changing component.",
                    )}
                  </p>
                  <p>
                    {t(
                      "Bu ayrım, kullanılan filtre ve parametrelere bağlı bir tahmindir. Tonic “stres seviyesi”, phasic “duygu türü” olarak adlandırılmaz.",
                      "This split is an estimate that depends on the filter and parameters used. Tonic is not a “stress level”, and phasic is not an “emotion type”.",
                    )}
                  </p>
                </section>
                <section className="card padded">
                  <h3>
                    {t("Seçim yanlılığını azaltın", "Reduce selection bias")}
                  </h3>
                  <p>
                    {t(
                      "Yalnızca yüksek pikleri görüşmeye taşımayın. Aynı turdan değişimin az olduğu karşılaştırma anlarını da elle ekleyin; seçim gerekçenizi kaydedin.",
                      "Do not bring only the highest peaks to the interview. Also add comparison moments from the same ride where little changed, and record why you chose each one.",
                    )}
                  </p>
                  <button
                    className="text-button"
                    onClick={() => setTab("workspace")}
                  >
                    {t("Çalışma alanına dön", "Back to workspace")}
                  </button>
                </section>
              </aside>
            </div>
          )}

          {tab === "interview" && (
            <div
              className={`interview-grid ${participantMode ? "neutral" : ""}`}
            >
              {!participantMode && (
                <aside className="card interview-list">
                  <div className="card-heading">
                    <h2>{t("Görüşme akışı", "Interview sequence")}</h2>
                    <span className="count">{selected.length}</span>
                  </div>
                  {selected.length === 0
                    ? emptyState(
                        t("Henüz an seçilmedi", "No moments selected yet"),
                        t(
                          "Çalışma alanından adayları ekleyin veya bir anı elle işaretleyin.",
                          "Add candidates from the workspace or mark a moment manually.",
                        ),
                      )
                    : selected.map((e, i) => (
                        <button
                          key={e.id}
                          className={
                            currentEvent?.id === e.id
                              ? "interview-item active"
                              : "interview-item"
                          }
                          onClick={() => {
                            setActiveEvent(e.id);
                            seek(e.t);
                            setPlaying(false);
                            setClip(null);
                          }}
                        >
                          <span>{String(i + 1).padStart(2, "0")}</span>
                          <div>
                            <b>{e.title}</b>
                            <small>
                              {time(e.t)}, −{e.pre} / +{e.post}{" "}
                              {t("saniye", "seconds")}
                            </small>
                          </div>
                          {e.narrative ? (
                            <CheckCircle2 size={15} />
                          ) : (
                            <ChevronRight size={15} />
                          )}
                        </button>
                      ))}
                  <div className="padded">
                    <button
                      className="button"
                      disabled={!selected.length}
                      onClick={exportInterviews}
                    >
                      <Download size={15} />
                      {t("Görüşmeleri indir", "Download interviews")}
                    </button>
                  </div>
                </aside>
              )}
              <section className="interview-main">
                <section className="card">
                  <div className="card-heading">
                    <h2>
                      <Video size={18} />
                      {participantMode
                        ? t("Birlikte hatırlayalım", "Let's recall together")
                        : t("Görüşme videosu", "Interview video")}
                    </h2>
                    {!participantMode && (
                      <button
                        className="text-button"
                        disabled={project.videos.length >= MAX_VIDEOS}
                        onClick={() => pickVideo()}
                      >
                        {t("Video bağla", "Connect video")} (
                        {project.videos.length}/{MAX_VIDEOS})
                      </button>
                    )}
                  </div>
                  <VideoPanel
                    key={videoKey}
                    {...videoPanelProps}
                    fileName={
                      participantMode || !shownVideo
                        ? undefined
                        : `${videoLabel(shownIndex)}: ${shownVideo.name}`
                    }
                    clip={clip}
                  />
                  {videoStrip(participantMode ? "participant" : "interview")}
                  <div className="interview-player-actions">
                    <button
                      className="button primary"
                      disabled={!currentEvent || !connectedVideos.length}
                      onClick={() => currentEvent && playEvent(currentEvent)}
                    >
                      <Play size={16} />
                      {t("Bu bölümü izle", "Watch this section")}
                    </button>
                    <button
                      className="button"
                      onClick={() => setPlaying(false)}
                    >
                      <Pause size={16} /> {t("Duraklat", "Pause")}
                    </button>
                    {!participantMode && (
                      <button
                        className="button"
                        disabled={!currentEvent}
                        onClick={() => setParticipantMode(true)}
                      >
                        <Video size={16} />{" "}
                        {t("Katılımcı görünümü", "Participant view")}
                      </button>
                    )}
                    {participantMode && (
                      <button
                        className="button"
                        disabled={
                          !currentEvent ||
                          selected.indexOf(currentEvent) >= selected.length - 1
                        }
                        onClick={() => {
                          const next =
                            selected[selected.indexOf(currentEvent!) + 1];
                          if (next) {
                            setActiveEvent(next.id);
                            setPlaying(false);
                            setClip(null);
                            seek(next.t);
                          }
                        }}
                      >
                        {t("Sonraki bölüm", "Next section")}{" "}
                        <ArrowRight size={15} />
                      </button>
                    )}
                  </div>
                </section>
                <div className="neutral-prompt">
                  <MessageSquare size={22} />
                  <div>
                    <small>
                      {t(
                        "Yönlendirmeyen açık uçlu soru",
                        "Non-leading open question",
                      )}
                    </small>
                    <h2>
                      {t(
                        "Bu bölümde neler yaşadığınızı, düşündüğünüzü ve hissettiğinizi anlatır mısınız?",
                        "Could you tell me what you experienced, thought and felt during this section?",
                      )}
                    </h2>
                    <p>
                      {t(
                        "Hatırlamadığınız noktaları belirtmeniz de değerli.",
                        "It is also useful to say what you don't remember.",
                      )}
                    </p>
                  </div>
                </div>
                {currentEvent && (
                  <section className="card padded">
                    <h2>
                      {participantMode
                        ? t("Anlatı notları", "Narrative notes")
                        : t("Katılımcının anlatısı", "Participant's account")}
                    </h2>
                    <Field
                      label={t(
                        "Katılımcının kendi sözleri",
                        "Participant's own words",
                      )}
                      help={t(
                        "Yorumunuzu doğrudan alıntıdan ayırın. Alanlar otomatik yerel kaydedilir.",
                        "Keep your interpretation separate from direct quotes. Fields are saved locally as you type.",
                      )}
                    >
                      <textarea
                        rows={participantMode ? 5 : 7}
                        value={currentEvent.narrative}
                        onChange={(e) =>
                          updateEvent(currentEvent.id, {
                            narrative: e.target.value,
                          })
                        }
                        placeholder={t(
                          "Katılımcının anlatısını buraya yazın…",
                          "Write the participant's account here…",
                        )}
                      />
                    </Field>
                    {!participantMode && (
                      <>
                        <div className="form-grid">
                          <Field
                            label={t(
                              "An başlığı / seçim gerekçesi",
                              "Moment title / reason for selection",
                            )}
                          >
                            <input
                              value={currentEvent.title}
                              onChange={(e) =>
                                updateEvent(currentEvent.id, {
                                  title: e.target.value,
                                })
                              }
                            />
                          </Field>
                          <Field label={t("Görüşme tarihi", "Interview date")}>
                            <input
                              type="datetime-local"
                              value={currentEvent.recallDate}
                              onChange={(e) =>
                                updateEvent(currentEvent.id, {
                                  recallDate: e.target.value,
                                })
                              }
                            />
                          </Field>
                          <Field label={t("Öncesi (s)", "Before (s)")}>
                            <Num
                              value={currentEvent.pre}
                              min={0}
                              max={180}
                              onChange={(n) =>
                                updateEvent(currentEvent.id, {
                                  pre: Math.max(0, Math.min(180, n)),
                                })
                              }
                            />
                          </Field>
                          <Field label={t("Sonrası (s)", "After (s)")}>
                            <Num
                              value={currentEvent.post}
                              min={0}
                              max={180}
                              onChange={(n) =>
                                updateEvent(currentEvent.id, {
                                  post: Math.max(0, Math.min(180, n)),
                                })
                              }
                            />
                          </Field>
                        </div>
                        <Field
                          label={t(
                            "Araştırmacı kodları / yorum notu",
                            "Researcher codes / interpretation note",
                          )}
                        >
                          <textarea
                            rows={2}
                            value={currentEvent.codes}
                            onChange={(e) =>
                              updateEvent(currentEvent.id, {
                                codes: e.target.value,
                              })
                            }
                          />
                        </Field>
                        <details className="optional-scales">
                          <summary>
                            {t(
                              "İsteğe bağlı öz değerlendirme alanları",
                              "Optional self-rating fields",
                            )}
                          </summary>
                          <p>
                            {t(
                              "Bu iki sayı standartlaştırılmış/valide bir ölçek uygulaması değildir. Önceden onayladığınız görüşme protokolünde varsa kullanın; eksik yanıt sıfıra çevrilmez.",
                              "These two numbers are not an administration of a standardized or validated scale. Use them only if your approved interview protocol includes them; a missing answer is not converted to zero.",
                            )}
                          </p>
                          <div className="form-grid">
                            {(["valence", "arousal"] as const).map((key, i) => (
                              <Field
                                key={key}
                                label={
                                  i
                                    ? t(
                                        "Uyarılma (1 sakin, 9 yoğun)",
                                        "Arousal (1 calm, 9 intense)",
                                      )
                                    : t(
                                        "Hoşluk (1 olumsuz, 9 olumlu)",
                                        "Valence (1 negative, 9 positive)",
                                      )
                                }
                              >
                                <select
                                  value={currentEvent[key] ?? ""}
                                  onChange={(e) =>
                                    updateEvent(currentEvent.id, {
                                      [key]: e.target.value
                                        ? +e.target.value
                                        : null,
                                    })
                                  }
                                >
                                  <option value="">
                                    {t(
                                      "Yanıt yok / uygulanmadı",
                                      "No answer / not administered",
                                    )}
                                  </option>
                                  {Array.from({ length: 9 }, (_, i) => (
                                    <option key={i} value={i + 1}>
                                      {i + 1}
                                    </option>
                                  ))}
                                </select>
                              </Field>
                            ))}
                          </div>
                        </details>
                        {currentEvent.recallDate && project.recordedAt && (
                          <Info>
                            {t("Tur ile görüşme arasında yaklaşık", "About")}{" "}
                            {number(
                              (new Date(currentEvent.recallDate).getTime() -
                                new Date(project.recordedAt).getTime()) /
                                86400000,
                              1,
                            )}{" "}
                            {t(
                              "gün var. Bu süre rapora yazılır; bir hafta geçerlilik eşiği değildir.",
                              "days passed between the ride and the interview. This interval is written to the report; one week is not a validity threshold.",
                            )}
                          </Info>
                        )}
                      </>
                    )}
                  </section>
                )}
                {!participantMode && (
                  <Info>
                    {t(
                      "Katılımcı görünümü grafik ve aday nedenlerini gizler. Ses kaydı otomatik yapılmaz. Video içindeki yüzler, sesler ve konum bilgileri oturum dosyalarınızın bir parçasıdır.",
                      "Participant view hides the chart and the candidate reasons. Audio is not recorded automatically. Faces, voices and location information in the videos are part of your session files.",
                    )}
                  </Info>
                )}
              </section>
            </div>
          )}

          {tab === "science" && !participantMode && (
            <Science
              project={project}
              onExportReport={() => exportReport(project)}
            />
          )}
        </div>
        <footer className="footer">
          OutLab{" "}
          <span>
            {t("v1.2, dış mekân araştırması", "v1.2, outdoor research")}
          </span>
          <span>
            {t("Ölçüm, bağlam, anlatı", "Measurement, context, narrative")}
          </span>
        </footer>
      </main>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
      {importOpen && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setImportOpen(false);
          }}
        >
          <section
            className="modal import-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">
                  {t("Adım 1: veriyi doğrula", "Step 1: check the data")}
                </span>
                <h2 id="import-title">
                  {t("Dosyalarınızı buraya bırakın", "Drop your files here")}
                </h2>
              </div>
              <button
                className="icon-button"
                aria-label={t("İçe aktarmayı kapat", "Close import")}
                onClick={() => setImportOpen(false)}
              >
                <X />
              </button>
            </div>
            <div
              className="dropzone"
              role="button"
              tabIndex={0}
              aria-label={t(
                "Dosya seç veya sürükle bırak",
                "Choose files or drag and drop",
              )}
              onClick={() => fileRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ")
                  fileRef.current?.click();
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void inspectFiles(Array.from(e.dataTransfer.files));
              }}
            >
              <div className="upload-symbol">
                <Upload size={28} />
              </div>
              <b>{t("EmotiBit + video + rota", "EmotiBit + video + route")}</b>
              <p>
                {t(
                  `Dosyaları birlikte sürükleyin veya bilgisayardan seçin (en fazla ${MAX_VIDEOS} video).`,
                  `Drag the files in together or choose them from your computer (up to ${MAX_VIDEOS} videos).`,
                )}
              </p>
              <div>
                <span>CSV / _info.json</span>
                <span>MP4 / MOV</span>
                <span>GPX</span>
              </div>
            </div>
            <p className="small-note">
              {t(
                `Videolar bilgisayarınızdan oynatılır; yüklenmez veya kopyalanmaz. Bir oturumda en fazla ${MAX_VIDEOS} video (ör. 4 × 60 dk Full HD) olabilir. CSV/GPX verisi yalnızca yerel analiz motoruna gönderilir. Mevcut bir oturuma veri eklemek, o oturumun analizini ve an seçimini sıfırlar; önce proje paketini indirin.`,
                `Videos play from your computer; they are not uploaded or copied. A session can hold up to ${MAX_VIDEOS} videos (e.g. 4 × 60 min Full HD). CSV/GPX data is sent only to the local analysis engine. Adding data to an existing session resets its analysis and moment selection, so download the project package first.`,
              )}
            </p>
            {busy && <p className="busy-text">{busy}</p>}
            {error && <Info tone="warning">{error}</Info>}
            {inspected.map((f, i) => (
              <details
                className="mapping"
                key={f.name}
                open={inspected.length < 4}
              >
                <summary>
                  <FileText size={16} />
                  <b>{f.name}</b>
                  <span className="tag">
                    {f.kind === "raw"
                      ? t("Önce ayrıştırın", "Parse first")
                      : f.kind === "unsupported"
                        ? t("Desteklenmiyor", "Not supported")
                        : f.kind === "info"
                          ? "_info.json"
                          : f.kind.toUpperCase()}
                  </span>
                </summary>
                {f.preview.length > 0 && (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          {f.columns.map((c, j) => (
                            <th key={j}>{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {f.preview.slice(0, 2).map((r, j) => (
                          <tr key={j}>
                            {r.map((v, k) => (
                              <td key={k}>{v}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {f.kind === "csv" && (
                  <div className="mapping-fields">
                    {(
                      ["tag", "timeColumn", "valueColumn", "timeUnit"] as const
                    ).map((key, j) => (
                      <Field
                        key={key}
                        label={
                          [
                            t("Sensör türü", "Sensor type"),
                            t("Zaman sütunu", "Time column"),
                            t("Değer sütunu", "Value column"),
                            t("Zaman birimi", "Time unit"),
                          ][j]
                        }
                      >
                        <select
                          value={f[key]}
                          onChange={(e) =>
                            setInspected((prev) =>
                              prev.map((x, k) =>
                                k === i ? { ...x, [key]: e.target.value } : x,
                              ),
                            )
                          }
                        >
                          {(key === "tag"
                            ? ["", ...TAGS]
                            : key === "timeUnit"
                              ? ["auto", "s", "ms", "us", "iso"]
                              : key === "valueColumn"
                                ? ["*", ...f.columns]
                                : f.columns
                          ).map((opt) => (
                            <option key={opt} value={opt}>
                              {opt === "*"
                                ? t(
                                    "Tüm tanınan sensör sütunları",
                                    "All recognized sensor columns",
                                  )
                                : opt === "auto"
                                  ? t(
                                      "Otomatik (kontrol edin)",
                                      "Automatic (check it)",
                                    )
                                  : opt || t("Otomatik", "Automatic")}
                            </option>
                          ))}
                        </select>
                      </Field>
                    ))}
                  </div>
                )}
                {f.warnings.map((w, j) => (
                  <Info key={j} tone="warning">
                    {w}
                  </Info>
                ))}
              </details>
            ))}
            <div className="modal-footer">
              <span>
                {t(
                  `${inspected.length} dosya incelendi`,
                  `${inspected.length} files inspected`,
                )}
              </span>
              <button
                className="button primary"
                disabled={
                  !inspected.length ||
                  !!busy ||
                  inspected.some(
                    (f) => f.kind === "raw" || f.kind === "unsupported",
                  )
                }
                onClick={confirmImport}
              >
                {t(
                  "Eşlemeleri onayla ve içe aktar",
                  "Confirm mappings and import",
                )}
              </button>
            </div>
          </section>
        </div>
      )}
      {libraryOpen && (
        <div className="modal-overlay">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={t("Oturumlar", "Sessions")}
          >
            <div className="modal-heading">
              <h2>{t("Yerel oturumlar", "Local sessions")}</h2>
              <button
                className="icon-button"
                aria-label={t("Oturumları kapat", "Close sessions")}
                onClick={() => setLibraryOpen(false)}
              >
                <X />
              </button>
            </div>
            <p>
              {t(
                "Her oturum tarayıcınızın yerel deposunda tutulur. Kalıcı yedek için proje paketini indirin.",
                "Each session is kept in your browser's local storage. Download the project package for a lasting backup.",
              )}
            </p>
            {library.map((p) => (
              <button
                className="library-item"
                key={p.id}
                onClick={() => void changeProject(p)}
              >
                <FolderOpen size={22} />
                <span>
                  <b>{p.title}</b>
                  <small>
                    {p.participant},{" "}
                    {t(
                      `${p.dataset.channels.length} kanal`,
                      `${p.dataset.channels.length} channels`,
                    )}
                    ,{" "}
                    {p.isDemo
                      ? t("sentetik demo", "synthetic demo")
                      : new Date(p.updatedAt).toLocaleDateString(locale())}
                  </small>
                </span>
                <ChevronRight size={17} />
              </button>
            ))}
            <div className="modal-footer">
              <button
                className="button"
                onClick={async () => void changeProject(await demoProject())}
              >
                <RotateCcw size={16} />
                {t("Yeni demo aç", "Open new demo")}
              </button>
              <button
                className="button primary"
                onClick={() => void changeProject(blankProject())}
              >
                <Plus size={16} /> {t("Yeni oturum", "New session")}
              </button>
            </div>
          </section>
        </div>
      )}
      {exportsOpen && (
        <div className="modal-overlay">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={t("Dışa aktarma", "Export")}
          >
            <div className="modal-heading">
              <h2>{t("Araştırma çıktıları", "Research outputs")}</h2>
              <button
                className="icon-button"
                aria-label={t("Dışa aktarmayı kapat", "Close export")}
                onClick={() => setExportsOpen(false)}
              >
                <X />
              </button>
            </div>
            <p>
              {t(
                "Çıktılar bilgisayarınıza indirilir. Katılımcı verileri GitHub deposuna gönderilmez.",
                "Outputs are downloaded to your computer. Participant data is not sent to the GitHub repository.",
              )}
            </p>
            <button className="export-option" onClick={exportProject}>
              <Save />
              <span>
                <b>
                  {t("Taşınabilir proje paketi", "Portable project package")}
                </b>
                <small>
                  {t(
                    "Ham kaynak metinleri, analiz, eşleme, görüşmeler ve işlem günlüğü (JSON)",
                    "Raw source texts, analysis, mappings, interviews and processing log (JSON)",
                  )}
                </small>
              </span>
              <Download size={18} />
            </button>
            <button
              className="export-option"
              disabled={!project.analysis}
              onClick={exportSignals}
            >
              <Activity />
              <span>
                <b>{t("İşlenmiş EDA serileri", "Processed EDA series")}</b>
                <small>
                  {t(
                    "Ham, filtrelenmiş, tonic, phasic ve kalite işaretleri (CSV)",
                    "Raw, filtered, tonic, phasic and quality flags (CSV)",
                  )}
                </small>
              </span>
              <Download size={18} />
            </button>
            <button
              className="export-option"
              disabled={!selected.length}
              onClick={exportInterviews}
            >
              <MessageSquare />
              <span>
                <b>{t("Görüşme kayıtları", "Interview records")}</b>
                <small>
                  {t(
                    "Seçilen anlar, anlatılar, kodlar ve video zamanları (CSV)",
                    "Selected moments, accounts, codes and video times (CSV)",
                  )}
                </small>
              </span>
              <Download size={18} />
            </button>
            <button
              className="export-option"
              onClick={() => exportReport(project)}
            >
              <FileText />
              <span>
                <b>
                  {t(
                    "Yöntem ve doğrulama raporu",
                    "Method and verification report",
                  )}
                </b>
                <small>
                  {t(
                    "Parametreler, kaynak hash değerleri, sınırlar ve işlem geçmişi (yazdırılabilir HTML)",
                    "Parameters, source hashes, limitations and processing history (printable HTML)",
                  )}
                </small>
              </span>
              <Download size={18} />
            </button>
            <Info tone="warning">
              {t(
                "Proje paketi video dosyasını içermez ve şifreli değildir. Videoyu ayrıca saklayın; yeniden açtığınızda aynı dosyayı bağlayın. Tarayıcı verilerini silmek yerel oturumları kaldırır.",
                "The project package does not contain the video file and is not encrypted. Keep the video separately and connect the same file when you reopen the project. Clearing browser data removes local sessions.",
              )}
            </Info>
          </section>
        </div>
      )}
    </div>
  );
}

type SourceCopy = {
  verification?: string;
  claim: string;
  application: string;
  doesNotEstablish: string;
};
type ScienceSource = SourceCopy & {
  id: string;
  title: string;
  url: string;
  en?: Partial<SourceCopy>;
};
// The English copy ("en") is optional per source; fall back to Turkish.
const sourceList = (scienceSources as unknown as { sources: ScienceSource[] })
  .sources;
function Science({
  project,
  onExportReport,
}: {
  project: SavedProject;
  onExportReport: () => void;
}) {
  const lang = useLang();
  const copy = (s: ScienceSource, key: keyof SourceCopy) =>
    (lang === "en" ? s.en?.[key] : undefined) ?? s[key];
  const principles = [
    [
      "01",
      t("Veri kalitesi önce gelir", "Data quality comes first"),
      t(
        "Örnekleme hızı dosyadaki zaman farklarından tahmin edilir. Geçersiz satırlar, tekrarlar, sabit sinyaller ve zaman boşlukları ayrı raporlanır. Sayısal bir sayaç sensör değeri olarak seçilmez.",
        "Sampling rate is estimated from the time differences in the file. Invalid rows, duplicates, flat signals and time gaps are reported separately. A numeric counter is never picked as a sensor value.",
      ),
    ],
    [
      "02",
      t(
        "Hareket, kesin artefakt değildir",
        "Motion is not proof of an artifact",
      ),
      t(
        "İvme değişimi olası hareket etkisini işaretler. Hareket fizyolojik değişimle aynı anda olabilir; işaretlenen veri otomatik silinmez veya “onarılmış gerçek” olarak sunulmaz.",
        "Acceleration change flags a possible motion effect. Motion can coincide with a real physiological change, so flagged data is never deleted automatically or presented as a “repaired truth”.",
      ),
    ],
    [
      "03",
      t("Filtre, bir varsayım içerir", "A filter carries an assumption"),
      t(
        "NeuroKit2 ile uygulanan temizleme ve highpass bileşen ayrıştırması sinyalin matematiksel tahminlerini üretir. Kesim frekansları, yöntem ve kütüphane sürümü işlem kaydındadır.",
        "The cleaning and high-pass decomposition applied with NeuroKit2 produce mathematical estimates of the signal. Cutoff frequencies, method and library version are recorded in the processing log.",
      ),
    ],
    [
      "04",
      t("Pik seçimi keşif amaçlıdır", "Peak selection is exploratory"),
      t(
        "Robust z = 0,67449 × (fazik değer − referans medyanı) / MAD. Yetersiz veya sabit karşılaştırma aralığında güvenilir skor üretilemez. Aday sayısı valide SCR sıklığı değildir.",
        "Robust z = 0.67449 × (phasic value − reference median) / MAD. A too short or flat reference interval cannot give a reliable score. The number of candidates is not a validated SCR frequency.",
      ),
    ],
    [
      "05",
      t(
        "Görüşme, yeni bir veri katmanıdır",
        "The interview is a new data layer",
      ),
      t(
        "Önce nötr video ve açık uçlu anlatı, sonra araştırmacı yorumu. Bir hafta pratik planınızdır; belleğin doğruluğunu garantileyen bilimsel eşik değildir. Görüşmeye kadar geçen süreyi kaydedin.",
        "Neutral video and an open-ended account come first, researcher interpretation after. One week is a practical plan, not a scientific threshold that guarantees accurate memory. Record the time elapsed before the interview.",
      ),
    ],
    [
      "06",
      t(
        "Tek bir sinyalden duygu çıkmaz",
        "One signal does not reveal an emotion",
      ),
      t(
        "EDA genel sempatik etkinlikle ilişkilidir; duygunun adı veya hoşluk yönü tek başına belirlenemez. Bisiklet sürerken efor, ısı, elektrot teması ve hareket ayrıca değerlendirilmelidir.",
        "EDA relates to general sympathetic activity; on its own it cannot identify an emotion or its valence. During cycling, effort, heat, electrode contact and motion must be assessed separately.",
      ),
    ],
  ];
  return (
    <>
      <div className="science-intro">
        <div>
          <h2>
            {t("Sonuçtan önce,", "Before the result,")}
            <br />
            <em>
              {t("sonucun nasıl oluştuğunu görün.", "see how it was produced.")}
            </em>
          </h2>
          <p>
            {t(
              "OutLab bir araştırma yardımcısıdır. Yazılımın çalışması, saha ölçümlerinin veya seçilen eşiklerin bilimsel olarak valide edildiği anlamına gelmez.",
              "OutLab is a research aid. The fact that the software runs does not mean that the field measurements or the chosen thresholds have been scientifically validated.",
            )}
          </p>
        </div>
      </div>
      <div className="principle-grid">
        {principles.map(([n, title, body]) => (
          <section className="card padded" key={n}>
            <h3>{title}</h3>
            <p>{body}</p>
          </section>
        ))}
      </div>
      <div className="page-grid">
        <section className="card padded">
          <h2>
            {t("Kaynaklara doğrudan ulaşın", "Go straight to the sources")}
          </h2>
          <div className="source-links">
            {sourceList.map((source) => (
              <details key={source.id}>
                <summary>
                  <b>{source.id}</b> {source.title}
                </summary>
                <p>
                  <b>{t("Dayanak:", "Basis:")}</b> {copy(source, "claim")}
                </p>
                <p>
                  <b>{t("Uygulama kararı:", "Design decision:")}</b>{" "}
                  {copy(source, "application")}
                </p>
                <p>
                  <b>{t("Kanıtlamadığı:", "Does not establish:")}</b>{" "}
                  {copy(source, "doesNotEstablish")}
                </p>
                <a href={source.url} target="_blank" rel="noreferrer">
                  {t("Birincil kaynağı aç", "Open primary source")}
                </a>
              </details>
            ))}
          </div>
          <p className="small-note">
            {t(
              "Kaynakların kapsamı, uygulama karşılığı ve pilot kontrol listesi uygulama klasöründeki docs/SCIENTIFIC_BASIS.md belgesinde ayrıntılıdır.",
              "The scope of each source, how it maps to the app, and the pilot checklist are detailed in docs/SCIENTIFIC_BASIS.md in the app folder.",
            )}
          </p>
        </section>
        <section className="card padded">
          <h2>{t("Sahaya çıkmadan önce", "Before going into the field")}</h2>
          <ol className="guide-list">
            <li>
              {t(
                "Tüm kayıtları aynı fiziksel işaretle başlatın ve sonda ikinci işaret oluşturun.",
                "Start all recordings with the same physical marker, and make a second marker at the end.",
              )}
            </li>
            <li>
              {t(
                "Elektrot yerleşimi, cihaz/firmware, hava, efor ve molaları not edin.",
                "Note electrode placement, device and firmware, weather, effort and breaks.",
              )}
            </li>
            <li>
              {t(
                "Kısa bir pilot turda video, GPX ve sensör eşlemesini kontrol edin.",
                "Check the video, GPX and sensor mapping on a short pilot ride.",
              )}
            </li>
            <li>
              {t(
                "Kaliteli karşılaştırma aralığı ile aday seçme kuralını önceden belirleyin.",
                "Decide on a good-quality reference interval and the candidate selection rule in advance.",
              )}
            </li>
            <li>
              {t(
                "Katılımcıya nötr video gösterin; alıntı ile araştırmacı yorumunu ayırın.",
                "Show the participant neutral video, and keep quotes separate from researcher interpretation.",
              )}
            </li>
          </ol>
        </section>
      </div>
      <section className="card padded">
        <div className="section-title">
          <h2>
            {t("Bu oturumun işlem günlüğü", "Processing log for this session")}
          </h2>
          <button className="button" onClick={onExportReport}>
            <Download size={16} />
            {t("Yöntem raporu", "Method report")}
          </button>
        </div>
        <div className="audit-list">
          {project.audit
            .slice()
            .reverse()
            .slice(0, 100)
            .map((a, i) => (
              <div key={i}>
                <Clock3 size={15} />
                <span>
                  <b>{a.action}</b>
                  <small>{new Date(a.at).toLocaleString(locale())}</small>
                  <p>{a.detail}</p>
                </span>
              </div>
            ))}
        </div>
        <p className="small-note">
          {t(
            "En son 100 işlem gösterilir. Proje paketi ve rapor tüm işlem geçmişini içerir.",
            "The latest 100 entries are shown. The project package and the report contain the full history.",
          )}
        </p>
      </section>
    </>
  );
}
function exportReport(p: SavedProject) {
  const esc = (v: unknown) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c]!,
    );
  const table = (headers: string[], rows: unknown[][]) =>
    `<table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  download(
    "OutLab_yontem_raporu.html",
    `<!doctype html><html lang="${getLang()}"><meta charset="utf-8"><title>${t("OutLab yöntem raporu", "OutLab method report")}</title><style>body{font:15px/1.6 Overpass,"Segoe UI",system-ui,sans-serif;max-width:1000px;margin:40px auto;color:#1d2f44;padding:20px}h1,h2{letter-spacing:-.01em}h1{border-bottom:4px solid #1f5fa8;padding-bottom:10px}table{border-collapse:collapse;width:100%;font-size:12px;line-height:1.5}td,th{border:1px solid #d9e0e4;padding:8px;text-align:left;overflow-wrap:anywhere}th{background:#eaeff1}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#eaeff1;padding:18px}small{color:#56677a}@media print{body{margin:0}h2{break-after:avoid}tr{break-inside:avoid}}</style><h1>${t("OutLab yöntem ve doğrulama raporu", "OutLab method and verification report")}</h1><p>${esc(p.title)}, ${esc(p.participant)}, ${esc(now())}</p><p><b>${p.isDemo ? t("Sentetik demo: araştırma bulgusu değildir.", "Synthetic demo: not a research finding.") : t("Araştırma oturumu: saha geçerliği ayrıca değerlendirilmelidir.", "Research session: field validity must be assessed separately.")}</b></p><h2>${t("Kapsam ve yorum sınırı", "Scope and limits of interpretation")}</h2><p>${t("EDA adayları keşif amaçlı fizyolojik değişimlerdir. Duygu, stres veya nedensellik etiketi üretilmemiştir. Hareket işaretleri kesin artefakt değildir; otomatik onarım yapılmaz. HR/BI varsa kaynakta türetilmiş değerlerdir; ham PPG’den HRV üretilmez. Video dosyaları bu rapora dahil değildir. Bu rapor otomatik bir yöntem kaydıdır; bilimsel yöntem bölümünüzün yerine geçmez.", "EDA candidates are exploratory physiological changes. No emotion, stress or causal labels are produced. Motion flags are not proof of artifact, and nothing is repaired automatically. HR/BI values, if present, were derived by the source device; no HRV is computed from raw PPG. Video files are not included in this report. This report is an automatic method record; it does not replace the methods section of your study.")}</p><h2>${t("Veri kalitesi", "Data quality")}</h2>${table(
      [
        t("Kanal", "Channel"),
        t("Birim", "Unit"),
        "Hz",
        t("Geçerli", "Valid"),
        t("Geçersiz", "Invalid"),
        t("Tekrar", "Duplicates"),
        t("Boşluk", "Gaps"),
        t("Uyarılar", "Warnings"),
      ],
      p.dataset.channels.map((c) => [
        c.tag,
        c.unit,
        c.sampleRate,
        c.quality.validRows,
        c.quality.invalidRows,
        c.quality.duplicates,
        c.quality.gaps,
        c.quality.warnings.join("; "),
      ]),
    )}<p>${p.dataset.warnings.map(esc).join("<br>")}</p><h2>${t("Uygulanan analiz", "Analysis applied")}</h2><p>${p.analysis ? `${esc(p.analysis.method)} (${esc(p.analysis.version)})` : t("Analiz çalıştırılmadı", "No analysis run")}</p><pre>${esc(JSON.stringify(p.analysis?.parameters ?? {}, null, 2))}</pre><h3>${t("Arayüzdeki güncel ayarlar", "Current settings in the interface")}</h3><pre>${esc(JSON.stringify(p.config, null, 2))}</pre><p>${t("Son analizdeki parametrelerle güncel ayarlar farklıysa grafikler önceki çalıştırmayı gösterir.", "If the current settings differ from the parameters of the last analysis, the charts show the earlier run.")}</p><p>${p.analysis?.warnings.map(esc).join("<br>") ?? ""}</p><h2>${t("Zaman eşleme", "Time sync")}</h2>${table(
      [
        "Video",
        t("Dosya", "File"),
        t("Süre (s)", "Duration (s)"),
        t("Ofset (s)", "Offset (s)"),
        t("Oran", "Rate"),
        t("Doğrulandı", "Verified"),
        t("Belirsizlik (± s)", "Uncertainty (± s)"),
        t("Dayanak", "Basis"),
      ],
      p.videos.map((v, i) => [
        videoLabel(i),
        v.name,
        v.duration ?? "—",
        v.offset,
        v.rate,
        v.verified ? t("evet", "yes") : t("hayır", "no"),
        v.uncertainty,
        v.reason,
      ]),
    )}<pre>${esc(JSON.stringify({ gps: p.sync, videos: p.videos }, null, 2))}</pre><p>${t("İşaretlerle yapılan eşleme araştırmacı tarafından bağımsız bir olayda kontrol edilmelidir. Belirsizlik bir araştırmacı tahminidir. Tur başlangıç beyanı:", "A marker-based mapping must be checked by the researcher against an independent event. The uncertainty is a researcher estimate. Declared ride start:")} ${esc(p.recordedAt)}</p><h2>${t("Görüşme kayıtları", "Interview records")}</h2>${table(
      [
        t("Zaman (s)", "Time (s)"),
        t("Önce/sonra", "Before/after"),
        t("Seçim", "Selection"),
        t("Anlatı", "Account"),
        t("Araştırmacı kodları", "Researcher codes"),
        t("Görüşme zamanı", "Interview time"),
      ],
      p.events
        .filter((e) => e.selected)
        .map((e) => [
          e.t,
          `${e.pre}/${e.post}`,
          e.title,
          e.narrative,
          e.codes,
          e.recallDate,
        ]),
    )}<p>${t("Görüşmeye kadar geçen süre bellek sınırlılıklarıyla birlikte raporlanmalıdır. Bir hafta geçerlik garantisi değildir.", "Report the time elapsed before the interview together with the limits of memory. One week does not guarantee validity.")}</p><h2>${t("Aday seçimi ve çalıştırma geçmişi", "Candidate selection and run history")}</h2><pre>${esc(JSON.stringify({ runs: p.analysisRuns ?? [], events: p.events.filter((e) => e.selected).map((e) => ({ id: e.id, provenance: e.provenance })) }, null, 2))}</pre><h2>${t("Kaynak bütünlüğü", "Source integrity")}</h2>${table(
      [t("Dosya", "File"), "SHA-256", t("Satır", "Rows")],
      p.dataset.sources.map((s) => [s.name, s.sha256, s.rows]),
    )}<h2>${t("İşlem geçmişi", "Processing history")}</h2>${table(
      [t("Zaman", "Time"), t("İşlem", "Action"), t("Ayrıntı", "Detail")],
      p.audit.map((a) => [a.at, a.action, a.detail]),
    )}<h2>${t("Bilimsel kaynaklar", "Scientific sources")}</h2><p>Boucsein et al. (2012). Recommendations for electrodermal measurements. <a href="https://doi.org/10.1111/j.1469-8986.2012.01384.x">DOI</a><br>Lyle (2003). Stimulated recall: a report on its use in naturalistic research. <a href="https://doi.org/10.1080/0141192032000137349">DOI</a><br><a href="https://neuropsychology.github.io/NeuroKit/functions/eda.html">NeuroKit2 EDA documentation</a><br><a href="https://github.com/EmotiBit/EmotiBit_Docs/blob/master/Working_with_emotibit_data.md">EmotiBit data documentation</a></p><small>${t("OutLab 1.2: dış mekân ölçümleri için yerel araştırma aracı. Kaynak doğrulama notları docs/SCIENTIFIC_BASIS.md içinde.", "OutLab 1.2: a local research tool for outdoor measurements. Source verification notes are in docs/SCIENTIFIC_BASIS.md.")}</small></html>`,
    "text/html;charset=utf-8",
  );
}
