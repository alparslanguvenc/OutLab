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
    : v.toLocaleString("tr-TR", { maximumFractionDigits: d });
async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch("/api/" + path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({
    detail:
      "Analiz motoruna erişilemiyor. OutLab_Baslat.command dosyasını açın.",
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
    title: "İncelenecek an",
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
  const [project, setProject] = useState<SavedProject>(blankProject);
  const [tab, setTab] = useState<Tab>("workspace");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [saved, setSaved] = useState("Hazırlanıyor");
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
            "Tarayıcı yerel kaydı açılamadı. Proje dosyasını indirerek yedekleyin.",
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
    setSaved("Kaydediliyor…");
    const timer = setTimeout(
      () =>
        saveProject(project)
          .then(() => {
            setSaved("Yerelde kaydedildi");
            setSaveError("");
          })
          .catch(() => {
            setSaved("Kayıt başarısız");
            setSaveError(
              "Yerel depolama dolu veya kapalı. Proje paketini hemen indirin.",
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
    setBusy("EDA işleniyor ve aday anlar hesaplanıyor…");
    setError("");
    try {
      const result = await api<Analysis>("analyze", {
        dataset: datasetSnapshot,
        config: configSnapshot,
      });
      if (activeProjectRef.current !== id) return;
      if (liveProjectRef.current.dataset !== datasetSnapshot) {
        setToast("Veri değişti; önceki analiz sonucu uygulanmadı.");
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
          "Analiz çalıştırıldı",
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
        `${result.events.length} aday an hesaplandı. Bilimsel yorum için bağlamı inceleyin.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  function videoFileError(file: File) {
    if (/\.insv$/i.test(file.name))
      return "INSV doğrudan tarayıcıda açılamaz. Insta360 Studio’da videoyu H.264 MP4 olarak dışa aktarın. 360° görünüm için 2:1 equirectangular MP4 kullanın.";
    if (!/\.(mp4|mov|webm|m4v)$/i.test(file.name))
      return "MP4, MOV veya WebM video seçin. En geniş destek için H.264 MP4 kullanın.";
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
            `Bir oturumda en fazla ${MAX_VIDEOS} video olabilir. Önce bir videoyu kaldırın veya “Değiştir” ile yerine yenisini bağlayın.`,
          );
          return;
        }
        videos.push(newVideoTrack(file));
        index = videos.length - 1;
        notes.push(
          `${videoLabel(index)} eklendi: ${file.name} · ${file.size} bayt.`,
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
          `${videoLabel(index)} bağlandı: ${file.name} · ${file.size} bayt. ${same ? "Dosya özellikleri öncekiyle aynı; içerik hash doğrulaması yapılmadı." : "Farklı dosya; zaman eşlemesi yeniden doğrulanmalı."}`,
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
    mutate((p) => audit({ ...p, videos }, "Video bağlandı", notes.join(" ")));
    setToast(
      files.length > 1
        ? `${files.length} video bilgisayarınızdan bağlandı. Her videonun zaman eşlemesini kontrol edin.`
        : "Video bilgisayarınızdan bağlandı. Zaman eşlemesini kontrol edin.",
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
        "Video kaldırıldı",
        `${videoLabel(index)}: ${v.name}. Kaldırılan eşleme: ${JSON.stringify({ offset: v.offset, rate: v.rate, verified: v.verified, anchors: v.anchors, uncertainty: v.uncertainty, reason: v.reason })}`,
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
        "Bu sürümde metin dosyası sınırı dosya başına 60 MB, toplam 100 MB. Uzun kaydı oturum bölümlerine ayırın.",
      );
      return;
    }
    setImportOpen(true);
    setBusy("Dosya başlıkları ve saatler inceleniyor…");
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
                ": Dosya UTF-8 olarak okunamadı. CSV/GPX dosyasını UTF-8 kodlamasıyla yeniden dışa aktarın; özgün baytları sessizce değiştirmiyoruz.",
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
    setBusy("Veriler ortak sensör zamanına yerleştiriliyor…");
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
            title: p.isDemo ? "Bisiklet turu · çalışma oturumu" : p.title,
            participant: p.isDemo ? "K-01" : p.participant,
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
          "Veri içe aktarıldı",
          `${dataset.sources.length} dosya; ${dataset.channels.length} kanal. Önceki analiz ve an seçimi sıfırlandı. Kaynak SHA-256 kayıtları eklendi.`,
        ),
      );
      setImportOpen(false);
      setTab("data");
      setToast("Veriler alındı. Önce kaliteyi ve saat eşlemesini inceleyin.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  function applySync() {
    const target = chosenVideo;
    if (!target) {
      setError("Önce eşlenecek videoyu bağlayın.");
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
        "Ortak olayın açıklamasını yazın. İkinci işaret ilkinden sonra olmalı; saat oranı 0,8–1,2 aralığında olmalı.",
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
        "Zaman eşlemesi uygulandı",
        JSON.stringify({
          video: `${videoLabel(index)} · ${target.name}`,
          offset,
          rate,
          uncertainty,
          reason,
          anchors,
        }),
      ),
    );
    setToast("Eşleme kaydedildi. Ayrı bir olayda kalan hatayı kontrol edin.");
    setError("");
  }
  function addManual() {
    const e = {
      ...eventFrom({
        id: crypto.randomUUID(),
        t: currentTime,
        amplitude: 0,
        score: null,
        reason: "Araştırmacı seçimi",
        flagged: false,
      }),
      selected: true,
      title: "Araştırmacı seçimi",
      source: "manual" as const,
    };
    mutate((p) =>
      audit(
        { ...p, events: [...p.events, e] },
        "Elle an seçildi",
        `${time(currentTime)} · video/bağlam incelemesi`,
      ),
    );
    setActiveEvent(e.id);
    setToast("An görüşme listesine eklendi.");
  }
  function updateEvent(id: string, changes: Partial<InterviewEvent>) {
    mutate((p) =>
      audit(
        {
          ...p,
          events: p.events.map((e) => (e.id === id ? { ...e, ...changes } : e)),
        },
        "Görüşme kaydı güncellendi",
        `${id}: ${Object.keys(changes).join(", ")}`,
      ),
    );
  }
  function playEvent(e: InterviewEvent) {
    if (!connectedVideos.length) {
      setError("Bu anı izletmek için oturum videosunu bağlayın.");
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
        "Bu an bağlı videoların zaman kapsamı dışında. Eşlemeyi veya video dosyalarını kontrol edin.",
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
    setToast("Proje paketi indirildi. Video dosyalarını ayrıca saklayın.");
  }
  async function restoreProject(file: File) {
    setBusy("Proje bütünlüğü doğrulanıyor…");
    try {
      if (file.size > 200 * 1024 * 1024)
        throw Error("Proje paketi 200 MB sınırını aşıyor.");
      const envelope = JSON.parse(await file.text());
      if (
        // Packages exported before the OutLab rename remain valid.
        !["outlab-project", "rotalab-project"].includes(envelope.format) ||
        typeof envelope.payload !== "string" ||
        (await sha256(envelope.payload)) !== envelope.sha256
      )
        throw Error("Proje biçimi veya SHA-256 bütünlük kontrolü geçersiz.");
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
        throw Error("Proje video eşleme kaydı eksik veya geçersiz.");
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
        throw Error("Proje şeması eksik veya geçersiz.");
      for (const s of p.sourceTexts) {
        const source = p.dataset.sources.find((x) => x.name === s.name);
        if (source && (await sha256(s.text)) !== source.sha256)
          throw Error(`Kaynak dosyası bütünlük hatası: ${s.name}`);
      }
      await changeProject(
        audit(
          p,
          "Proje geri yüklendi",
          "Paket ve mevcut kaynak SHA-256 değerleri doğrulandı; bu kimlik doğrulaması değildir.",
        ),
      );
      setToast("Proje açıldı. Videoları yeniden bağlayın.");
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
  const videoStatus = (v: VideoTrack) =>
    `${videoUrls[v.id] ? "" : "Yeniden bağlanmalı · "}${v.verified ? "eşlendi" : "eşleme bekliyor"}`;
  const videoCoverage = (v: VideoTrack) => {
    const end = videoEnd(v);
    return end == null
      ? `${time(v.offset)}'dan itibaren`
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
        aria-label="Oturum videoları"
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
                    {videoCoverage(v)} · {videoStatus(v)}
                  </small>
                </>
              )}
            </button>
            {mode === "manage" && (
              <span className="video-slot-actions">
                <button className="text-button" onClick={() => pickVideo(v.id)}>
                  {videoUrls[v.id] ? "Değiştir" : "Yeniden bağla"}
                </button>
                <button
                  className="icon-button small"
                  aria-label={`${videoLabel(i)} videosunu kaldır`}
                  title="Videoyu ve eşlemesini oturumdan kaldır"
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
    ["workspace", "Çalışma alanı", Compass],
    ["data", "Veri & kalite", Layers3],
    ["sync", "Zaman eşleme", Clock3],
    ["analysis", "Analiz ayarları", SlidersHorizontal],
    ["interview", "Görüşme odası", MessageSquare],
    ["science", "Bilimsel rehber", BookOpen],
  ];
  if (!ready)
    return (
      <div className="loading-screen">
        <Bike size={42} />
        <h1>OutLab</h1>
        <p>Araştırma alanınız hazırlanıyor…</p>
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
              OutLab<small>DIŞ MEKÂN ARAŞTIRMA ALANI</small>
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
              <small>AKTİF OTURUM</small>
              <b>{project.participant} · Bisiklet turu</b>
            </span>
            <ChevronRight size={16} />
          </button>
          <div className="nav-label">ARAŞTIRMA AKIŞI</div>
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
          <div className="sidebar-guide">
            <div className="mini-orbit">
              <Bike size={24} />
            </div>
            <b>Veriden deneyime.</b>
            <p>Ölçümü, bağlamı ve katılımcının anlatısını birlikte okuyun.</p>
            <button onClick={() => setTab("science")}>
              Nasıl çalışır? <ArrowRight size={14} />
            </button>
          </div>
          <div className="sidebar-bottom">
            <LockKeyhole size={16} />
            <span>
              Veriler bu bilgisayarda<small>Bulut aktarımı yok</small>
            </span>
            <i />
          </div>
        </aside>
      )}
      <main className="main">
        {!participantMode ? (
          <header className="topbar">
            <div className="breadcrumb">
              Araştırmalar <ChevronRight size={14} />
              <span>{project.participant}</span>
            </div>
            <div className="topbar-actions">
              <span className="save-state">
                <span />
                {saved}
              </span>
              <button
                className="icon-button"
                aria-label="Proje dosyası aç"
                onClick={() => projectRef.current?.click()}
              >
                <FolderOpen size={18} />
              </button>
              <button
                className="button small"
                onClick={() => setExportsOpen(true)}
              >
                <Download size={16} />
                Dışa aktar
              </button>
              <div className="avatar">AG</div>
            </div>
          </header>
        ) : (
          <header className="participant-header">
            <span>
              <Video size={18} /> Görüşme · {project.participant}
            </span>
            <button
              className="button"
              onClick={() => {
                setParticipantMode(false);
                setPlaying(false);
              }}
            >
              Araştırmacı görünümüne dön
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
                aria-label="Hata mesajını kapat"
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
                  <div className="eyebrow">
                    BİYOMETRİK DENEYİM ARAŞTIRMASI{" "}
                    {project.isDemo && (
                      <span className="demo-badge">SENTETİK DEMO</span>
                    )}
                  </div>
                  <h1>
                    {tab === "workspace"
                      ? project.title
                      : nav.find((n) => n[0] === tab)?.[1]}
                  </h1>
                  <p>
                    {tab === "workspace"
                      ? "Videoyu, rotayı ve fizyolojik değişimleri aynı anda inceleyin."
                      : tab === "data"
                        ? "Her dosyanın kaynağını, saatini ve ölçüm kalitesini görün."
                        : tab === "sync"
                          ? "Üç kayıt, tek referans zaman. Eşlemenin kanıtını da saklayın."
                          : tab === "analysis"
                            ? "Her adımın ne yaptığını bilin; her sonucu yeniden üretebilin."
                            : tab === "interview"
                              ? "Seçtiğiniz anları bağlamıyla izletin; katılımcının kendi sözcüklerini kaydedin."
                              : "Bir sinyalin ne söylediği kadar, ne söyleyemediğini de bilin."}
                  </p>
                </div>
                <button
                  className="button primary"
                  onClick={() => {
                    setImportOpen(true);
                  }}
                >
                  <Plus size={17} />
                  Veri ekle
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
                  Veriyi doğrula
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
                  </span>
                  Zamanı eşle
                </button>
                <ChevronRight size={14} />
                <button onClick={() => setTab("analysis")}>
                  <span className={project.analysis ? "done" : ""}>
                    {project.analysis ? <Check size={12} /> : "3"}
                  </span>
                  Anları incele
                </button>
                <ChevronRight size={14} />
                <button onClick={() => setTab("interview")}>
                  <span>4</span>Deneyimi dinle
                </button>
                <div className="local-label">
                  <ShieldCheck size={15} />
                  Yerel çalışma
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
                    <small>OTURUM SÜRESİ</small>
                    <b>
                      {time(duration)}
                      <em>dk : sn</em>
                    </b>
                  </div>
                </div>
                <div>
                  <span className="metric-icon lilac">
                    <Activity size={19} />
                  </span>
                  <div>
                    <small>SENSÖR KANALLARI</small>
                    <b>
                      {project.dataset.channels.length}
                      <em>eş zaman çizgisi</em>
                    </b>
                  </div>
                </div>
                <div>
                  <span className="metric-icon peach">
                    <MapPin size={19} />
                  </span>
                  <div>
                    <small>ROTA KAYDI</small>
                    <b>
                      {number(project.dataset.track.length, 0)}
                      <em>konum noktası</em>
                    </b>
                  </div>
                </div>
                <div>
                  <span className="metric-icon blue">
                    <MessageSquare size={19} />
                  </span>
                  <div>
                    <small>GÖRÜŞME LİSTESİ</small>
                    <b>
                      {selected.length}
                      <em>seçilen an</em>
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
                          Tur videoları
                        </h2>
                        <button
                          className="text-button"
                          disabled={project.videos.length >= MAX_VIDEOS}
                          title={`Bir oturumda en fazla ${MAX_VIDEOS} video`}
                          onClick={() => pickVideo()}
                        >
                          {project.videos.length ? "Video ekle" : "Video bağla"}{" "}
                          ({project.videos.length}/{MAX_VIDEOS})
                          <Plus size={14} />
                        </button>
                      </div>
                      <VideoPanel
                        key={videoKey}
                        {...videoPanelProps}
                        fileName={
                          shownVideo
                            ? `${videoLabel(shownIndex)} · ${shownVideo.name}`
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
                            ? `MP4 · Insta360 X3 · en fazla ${MAX_VIDEOS} video`
                            : disconnectedCount
                              ? project.videos.length === 1
                                ? "Video yeniden bağlanmalı"
                                : `${disconnectedCount} video yeniden bağlanmalı`
                              : project.videos.length === 1
                                ? "Yerel video bağlı"
                                : `${project.videos.length} yerel video bağlı`}
                        </span>
                        <span>
                          {videosVerified
                            ? "İşaretlerle eşlendi"
                            : "Eşleme bekliyor"}
                        </span>
                      </div>
                    </section>
                    <section className="card map-card">
                      <div className="card-heading">
                        <h2>
                          <MapPin size={17} />
                          Rota & konum
                        </h2>
                        <span className="tag">
                          {project.isDemo ? "ÖRNEK ROTA" : "GPX"}
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
                        Senkron sinyaller{" "}
                        <span className="live-pill">TEK ZAMAN EKSENİ</span>
                      </h2>
                      <button
                        className="text-button"
                        onClick={() => setTab("analysis")}
                      >
                        <Settings2 size={15} />
                        Analiz ayarları
                      </button>
                    </div>
                    <div className="timeline-controls">
                      <button
                        className="play-button"
                        aria-label={playing ? "Duraklat" : "Oynat"}
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
                        aria-label="Ortak zaman çizgisi"
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
                        Anı işaretle
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
                        "Henüz sinyal yok",
                        "EmotiBit CSV dosyalarını Veri ekle alanına sürükleyin.",
                      )
                    )}
                    <div className="chart-foot">
                      <span>
                        Grafiğe tıklayın; video ve konum aynı ana gelsin.
                      </span>
                      <span>
                        Ham veri korunur <ShieldCheck size={13} />
                      </span>
                    </div>
                  </section>
                  {(!videosVerified ||
                    (!!project.dataset.track.length &&
                      !project.sync.gpsVerified)) && (
                    <Info tone="warning">
                      {!videosVerified
                        ? project.videos.length > 1
                          ? `${project.videos.filter((v) => !v.verified).length}/${project.videos.length} videonun eşlemesi doğrulanmadı. `
                          : "Video eşlemesi doğrulanmadı. "
                        : ""}
                      {project.dataset.track.length && !project.sync.gpsVerified
                        ? "GPX eşlemesi doğrulanmadı. "
                        : ""}{" "}
                      Yan yana görünmek, zamanların doğru eşleştiği anlamına
                      gelmez.{" "}
                      <button
                        className="inline-link"
                        onClick={() => setTab("sync")}
                      >
                        Zamanı eşle →
                      </button>
                    </Info>
                  )}
                </section>
                <aside className="context-pane">
                  <section className="card moments">
                    <div className="card-heading">
                      <h2>İncelenecek anlar</h2>
                      <span className="count">{project.events.length}</span>
                    </div>
                    <p className="card-description">
                      Fizyolojik değişimi, bulunduğu bağlamla birlikte
                      değerlendirin.
                    </p>
                    {!project.analysis && (
                      <div className="candidate-empty">
                        <div className="soft-icon">
                          <Sparkles size={24} />
                        </div>
                        <b>İlk aday anları bulun</b>
                        <p>
                          EDA değişimleri için açıklanabilir bir ön tarama
                          çalıştırın.
                        </p>
                        <button
                          className="button primary"
                          disabled={runDisabled}
                          onClick={runAnalysis}
                        >
                          <Activity size={15} />
                          Adayları hesapla
                        </button>
                      </div>
                    )}
                    {outdated && (
                      <Info tone="warning">
                        Ayarlar değişti. Yeniden hesaplayın.
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
                                        ? "Elle seçim"
                                        : "EDA adayı"}
                                    </small>
                                  </b>
                                  <small>
                                    {candidate?.flagged
                                      ? "Hareketle birlikte · dikkat"
                                      : candidate?.score != null
                                        ? `Robust z ${number(candidate.score, 1)} · gözden geçirin`
                                        : "Bağlamı inceleyin"}
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
                                    ? `${time(e.t)} anını listeden çıkar`
                                    : `${time(e.t)} anını görüşmeye ekle`
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
                        Bu ayarlarda aday bulunmadı. Bu, fizyolojik tepki
                        olmadığı anlamına gelmez.
                      </p>
                    )}
                    <button
                      className="full-link"
                      onClick={() => setTab("interview")}
                    >
                      Görüşme listesini aç <ArrowRight size={15} />
                    </button>
                  </section>
                  <section className="why-card">
                    <div>
                      <BookOpen size={19} />
                      <span>NEDEN BÖYLE?</span>
                    </div>
                    <h3>Bir pik, tek başına bir duygu değildir.</h3>
                    <p>
                      EDA değişimine efor, sıcaklık, temas ve uyarılma katkıda
                      bulunabilir. Anlamını video ve katılımcının anlatısıyla
                      araştırın.
                    </p>
                    <button onClick={() => setTab("science")}>
                      Bilimsel dayanağı gör <ArrowRight size={14} />
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
                  <h2>Oturum bilgisi</h2>
                  <div className="form-grid">
                    <Field
                      label="Katılımcı kodu"
                      help="Ad yerine araştırma kodu kullanın."
                    >
                      <input
                        value={project.participant}
                        onChange={(e) =>
                          mutate((p) => ({ ...p, participant: e.target.value }))
                        }
                      />
                    </Field>
                    <Field label="Oturum başlığı">
                      <input
                        value={project.title}
                        onChange={(e) =>
                          mutate((p) => ({ ...p, title: e.target.value }))
                        }
                      />
                    </Field>
                    <Field
                      label="Tur başlangıç tarihi"
                      help="Görüşmeye kadar geçen zamanı raporlamak için; bu alan sinyallerin saatini değiştirmez."
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
                    <h2>Kanal kalite dökümü</h2>
                    <span className="tag">
                      {project.dataset.channels.length} KANAL
                    </span>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Kanal</th>
                          <th>Örnekleme</th>
                          <th>Geçerli satır</th>
                          <th>Atlanan</th>
                          <th>Tekrar</th>
                          <th>Boşluk</th>
                        </tr>
                      </thead>
                      <tbody>
                        {project.dataset.channels.map((c) => (
                          <tr key={c.id}>
                            <td>
                              <b>{c.tag}</b>
                              <small>
                                {c.label} · {c.unit}
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
                                  Sabit sinyal
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
                      "Dosyalarınızı ekleyin",
                      "Önce sütun eşlemeleri gösterilir; veriler onayınızdan sonra alınır.",
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
                  <h2>Kaynak dosyalar & bütünlük</h2>
                  {project.dataset.sources.map((s) => (
                    <details className="source-detail" key={s.name}>
                      <summary>
                        <FileCheck2 size={17} />
                        <b>{s.name}</b>
                        <span>{number(s.rows, 0)} satır</span>
                      </summary>
                      <p>
                        SHA-256 · Dosyanın değişip değişmediğini kontrol etmek
                        için.
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
                  <div>
                    <ShieldCheck size={20} />
                    <span>HAM VERİ ÖNCELİKLİ</span>
                  </div>
                  <h3>Ölçmediğimiz yeri doldurmuyoruz.</h3>
                  <p>
                    Zaman boşlukları, bozuk satırlar ve tekrarlar görünür
                    raporlanır. İşlenmiş seri, ham serinin yanında tutulur.
                  </p>
                </section>
                <section className="card padded">
                  <h3>Dosya hazırlığı</h3>
                  <ol className="guide-list">
                    <li>
                      EmotiBit DataParser ile sensör CSV’lerini dışa aktarın.
                    </li>
                    <li>
                      <code>_info.json</code> dosyasını da ekleyin; birim ve
                      donanım bilgileri korunur.
                    </li>
                    <li>GPX dosyasında her konumun zaman damgası olmalı.</li>
                    <li>
                      Insta360 Studio’dan H.264 MP4 dışa aktarın. INSV önce
                      birleştirilmelidir.
                    </li>
                  </ol>
                  <button
                    className="button"
                    onClick={() => setImportOpen(true)}
                  >
                    <Upload size={16} />
                    Dosyaları seç
                  </button>
                </section>
                <Info>
                  Bu sürüm ham EmotiBit paket dosyasını doğrudan analiz etmez.
                  Kesin örnek zamanları için resmî DataParser çıktısı gerekir.
                </Info>
              </aside>
            </div>
          )}

          {tab === "sync" && !participantMode && (
            <div className="page-grid">
              <section>
                <section className="card padded">
                  <div className="section-title">
                    <h2>1. Video ile sensörü ortak olayda buluşturun</h2>
                    <span
                      className={`tag ${chosenVideo?.verified ? "good" : ""}`}
                    >
                      {chosenVideo?.verified
                        ? "EŞLEME KAYITLI"
                        : "DOĞRULANMADI"}
                    </span>
                  </div>
                  <p>
                    Videoda görülen, sensörde de ayırt edilen aynı olayı
                    işaretleyin. Tur başında ve sonunda yapılan belirgin bir
                    senkron işareti saat kaymasını değerlendirmeyi
                    kolaylaştırır. Her video kendi saatine sahiptir; birden
                    fazla video varsa her birini ayrı eşleyin.
                  </p>
                  {project.videos.length ? (
                    (videoStrip("sync") ?? (
                      <p className="small-note">
                        Eşlenen video: <b>{videoLabel(0)}</b> ·{" "}
                        {project.videos[0].name}
                      </p>
                    ))
                  ) : (
                    <Info tone="warning">
                      Önce en az bir video bağlayın (en fazla {MAX_VIDEOS}).{" "}
                      <button
                        className="inline-link"
                        onClick={() => pickVideo()}
                      >
                        Video bağla →
                      </button>
                    </Info>
                  )}
                  <div className="form-grid">
                    <Field label="Videodaki olay zamanı (s)">
                      <Num
                        value={anchors.v1}
                        min={0}
                        step={0.01}
                        onChange={(n) => setAnchors((a) => ({ ...a, v1: n }))}
                      />
                    </Field>
                    <Field label="Sensör zamanındaki aynı olay (s)">
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
                    İkinci bir ortak olayla saat kaymasını da düzelt
                  </label>
                  {anchors.two && (
                    <div className="form-grid">
                      <Field label="İkinci olay: video zamanı (s)">
                        <Num
                          value={anchors.v2}
                          min={0}
                          step={0.01}
                          onChange={(n) => setAnchors((a) => ({ ...a, v2: n }))}
                        />
                      </Field>
                      <Field label="İkinci olay: sensör zamanı (s)">
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
                    label="Eşlemenin dayanağı"
                    help="Örnek: Tur başında videoda görülen üç cihaz dokunuşu, ivmede aynı örüntü."
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
                    label="Tahmini zaman belirsizliği (± saniye)"
                    help="Elle gözlem ve cihaz saatlerine dayalı araştırmacı tahmini; ölçülmüş güven aralığı değildir."
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
                    Eşlemeyi uygula ve kaydet
                  </button>
                </section>
                <section className="card padded">
                  <h2>2. GPX saatini referans eksenine yerleştirin</h2>
                  <Info tone={project.sync.gpsVerified ? "success" : "warning"}>
                    {project.sync.gpsVerified
                      ? "GPX eşlemesi araştırmacı kontrolüyle kaydedildi."
                      : "GPX zaman eşlemesi henüz doğrulanmadı."}
                  </Info>
                  <p>
                    İki kaynakta da geçerli mutlak zaman varsa başlangıç farkı
                    otomatik alınır. Cihazın yalnızca açılıştan itibaren saydığı
                    saat varsa GPX konumunu ortak bir olayla elle doğrulayın.
                  </p>
                  <div className="form-grid">
                    <Field
                      label="GPX başlangıcının sensör eksenindeki zamanı (s)"
                      help="Pozitif değer rotayı daha ileriye, negatif değer geriye taşır."
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
                              "GPX kaydırması değişti",
                              `${n} saniye; elle doğrulanmalı.`,
                            ),
                          )
                        }
                      />
                    </Field>
                    <div className="clock-readout">
                      <small>Sensör mutlak başlangıç</small>
                      <b>
                        {project.dataset.sensorOriginEpoch
                          ? new Date(
                              project.dataset.sensorOriginEpoch * 1000,
                            ).toLocaleString("tr-TR")
                          : "Mutlak saat yok"}
                      </b>
                      <small>GPX mutlak başlangıç</small>
                      <b>
                        {project.dataset.gpxOriginEpoch
                          ? new Date(
                              project.dataset.gpxOriginEpoch * 1000,
                            ).toLocaleString("tr-TR")
                          : "Mutlak saat yok"}
                      </b>
                    </div>
                  </div>
                  <Field label="GPX eşlemesinin dayanağı">
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
                      placeholder="Örneğin videodaki durma anı ile GPX konumlarının aynı zaman aralığı…"
                    />
                  </Field>
                  <Field label="GPX zaman belirsizliği (± saniye)">
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
                          "GPX eşlemesi doğrulandı",
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
                    GPX kontrolünü kaydet
                  </button>
                </section>
              </section>
              <aside>
                <section className="card padded">
                  <h3>
                    Uygulanan dönüşüm
                    {chosenVideo &&
                      ` · ${videoLabel(project.videos.indexOf(chosenVideo))}`}
                  </h3>
                  <div className="formula">
                    t<sub>sensör</sub> = {number(chosenVideo?.rate ?? 1, 6)} × t
                    <sub>video</sub>{" "}
                    {(chosenVideo?.offset ?? 0) >= 0 ? "+" : "−"}{" "}
                    {number(Math.abs(chosenVideo?.offset ?? 0), 3)}
                  </div>
                  <p>
                    Ofset: <b>{number(chosenVideo?.offset ?? 0, 3)} s</b>
                    <br />
                    Saat kayması:{" "}
                    <b>{number(((chosenVideo?.rate ?? 1) - 1) * 1e6, 1)} ppm</b>
                    <br />
                    Beyan edilen belirsizlik:{" "}
                    <b>±{chosenVideo?.uncertainty ?? 1} s</b>
                    {chosenVideo && (
                      <>
                        <br />
                        Sensör ekseninde kapsam:{" "}
                        <b>{videoCoverage(chosenVideo)}</b>
                      </>
                    )}
                  </p>
                  <p>
                    {chosenVideo?.reason || "Henüz ortak olay belirtilmedi."}
                  </p>
                </section>
                <Info tone="warning">
                  İki noktaya tam uyum tek başına doğruluk kanıtı değildir.
                  Aradaki üçüncü bir olayda kalan zaman hatasını kontrol edip
                  aşağıya kaydedin.
                </Info>
                <Field label="Bağımsız eşleme kontrolü / kalan hata">
                  <textarea
                    rows={4}
                    placeholder="Kontrol olayı, video/sensör saati ve gözlenen fark…"
                    defaultValue={
                      project.audit
                        .filter((a) => a.action === "Bağımsız eşleme kontrolü")
                        .at(-1)?.detail ?? ""
                    }
                    onBlur={(e) => {
                      if (e.target.value)
                        mutate((p) =>
                          audit(p, "Bağımsız eşleme kontrolü", e.target.value),
                        );
                    }}
                  />
                </Field>
                <section className="why-card">
                  <div>
                    <Clock3 size={20} />
                    <span>GECİKMEYİ KORUYUN</span>
                  </div>
                  <h3>EDA tepesini görüntüye zorla hizalamayın.</h3>
                  <p>
                    Fizyolojik yanıtın uyaran sonrası gecikmesi vardır. Saat
                    eşlemesi için duygusal tepki tahmini yerine fiziksel ortak
                    işaret kullanın.
                  </p>
                </section>
              </aside>
            </div>
          )}

          {tab === "analysis" && !participantMode && (
            <div className="page-grid">
              <section>
                <section className="card padded">
                  <h2>1. Karşılaştırma aralığı</h2>
                  <p>
                    Ön tarama, fazik bileşenin bu aralıktaki medyan ve MAD
                    değerlerine göre hesaplanır. Aynı oturumdan, kaliteli ve
                    bağlamı bilinen bir bölüm seçin. Aralık otomatik olarak
                    “dinlenim” sayılmaz.
                  </p>
                  <div className="form-grid">
                    {(["baselineStart", "baselineEnd"] as const).map(
                      (key, i) => (
                        <Field
                          key={key}
                          label={i ? "Bitiş (s)" : "Başlangıç (s)"}
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
                  <h2>2. Açıklanabilir aday taraması</h2>
                  <div className="form-grid">
                    <Field
                      label="Aday eşiği (robust z)"
                      help="Keşif amaçlı hassasiyet ayarıdır; klinik veya duygu eşiği değildir."
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
                      label="Adaylar arası en az süre (s)"
                      help="Görüşmede birbirine çok yakın anların tekrar seçilmesini azaltır."
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
                      label="İvme değişimi eşiği (g/s)"
                      help="İvme bileşkesi türevinin mutlak değeri. m/s² kaydı varsa g birimine dönüştürülür; Bir bölümün artefakt olduğunu kanıtlamaz."
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
                    Ham veri yerinde tutulur. Boşluklar boyunca filtreleme
                    yapılmaz; hareketle eşleşen örnekler işaretlenir. Ham
                    PPG’den otomatik nabız/HRV veya duygu sınıfı üretilmez.
                  </Info>
                  <button
                    className="button primary"
                    disabled={runDisabled}
                    onClick={runAnalysis}
                  >
                    <Activity size={17} />
                    {project.analysis
                      ? "Analizi yeniden çalıştır"
                      : "Analizi çalıştır"}
                  </button>
                  {outdated && (
                    <p className="warn-text">
                      Ayarlar değişti; grafik ve adaylar önceki çalıştırmaya
                      aittir.
                    </p>
                  )}
                </section>
                {project.analysis && (
                  <section className="card padded">
                    <h2>Çalıştırma kaydı</h2>
                    <dl className="details-grid">
                      <dt>Yöntem</dt>
                      <dd>{project.analysis.method}</dd>
                      <dt>Sürüm</dt>
                      <dd>{project.analysis.version}</dd>
                      <dt>EDA örneği</dt>
                      <dd>{number(project.analysis.metrics.edaSamples, 0)}</dd>
                      <dt>Hareket işaretli</dt>
                      <dd>
                        %{number(project.analysis.metrics.flaggedPercent, 1)}
                      </dd>
                      <dt>Karşılaştırma medyanı</dt>
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
                      <summary>Tüm işlem parametreleri</summary>
                      <pre>
                        {JSON.stringify(project.analysis.parameters, null, 2)}
                      </pre>
                    </details>
                    <button className="button" onClick={exportSignals}>
                      <Download size={16} />
                      İşlenmiş EDA’yı indir
                    </button>
                  </section>
                )}
              </section>
              <aside>
                <section className="why-card">
                  <div>
                    <BookOpen size={20} />
                    <span>YÖNTEMİ ANLAYIN</span>
                  </div>
                  <h3>Tonic ve phasic ne demek?</h3>
                  <p>
                    <b>Tonic:</b> Sinyalin yavaş değişen bileşeni.
                    <br />
                    <b>Phasic:</b> Daha hızlı değişen bileşeni.
                  </p>
                  <p>
                    Bu ayrım, kullanılan filtre ve parametrelere bağlı bir
                    tahmindir. Tonic “stres seviyesi”, phasic “duygu türü”
                    olarak adlandırılmaz.
                  </p>
                </section>
                <section className="card padded">
                  <h3>Seçim yanlılığını azaltın</h3>
                  <p>
                    Yalnızca yüksek pikleri görüşmeye taşımayın. Aynı turdan
                    değişimin az olduğu karşılaştırma anlarını da elle ekleyin;
                    seçim gerekçenizi kaydedin.
                  </p>
                  <button
                    className="text-button"
                    onClick={() => setTab("workspace")}
                  >
                    Çalışma alanına dön <ArrowRight size={14} />
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
                    <h2>Görüşme akışı</h2>
                    <span className="count">{selected.length}</span>
                  </div>
                  {selected.length === 0
                    ? emptyState(
                        "Henüz an seçilmedi",
                        "Çalışma alanından adayları ekleyin veya bir anı elle işaretleyin.",
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
                              {time(e.t)} · −{e.pre} / +{e.post} saniye
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
                      Görüşmeleri indir
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
                        ? "Birlikte hatırlayalım"
                        : "Görüşme videosu"}
                    </h2>
                    {!participantMode && (
                      <button
                        className="text-button"
                        disabled={project.videos.length >= MAX_VIDEOS}
                        onClick={() => pickVideo()}
                      >
                        Video bağla ({project.videos.length}/{MAX_VIDEOS})
                      </button>
                    )}
                  </div>
                  <VideoPanel
                    key={videoKey}
                    {...videoPanelProps}
                    fileName={
                      participantMode || !shownVideo
                        ? undefined
                        : `${videoLabel(shownIndex)} · ${shownVideo.name}`
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
                      Bu bölümü izle
                    </button>
                    <button
                      className="button"
                      onClick={() => setPlaying(false)}
                    >
                      <Pause size={16} />
                      Duraklat
                    </button>
                    {!participantMode && (
                      <button
                        className="button"
                        disabled={!currentEvent}
                        onClick={() => setParticipantMode(true)}
                      >
                        <Video size={16} />
                        Katılımcı görünümü
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
                        Sonraki bölüm <ArrowRight size={15} />
                      </button>
                    )}
                  </div>
                </section>
                <div className="neutral-prompt">
                  <MessageSquare size={22} />
                  <div>
                    <small>YÖNLENDİRMEYEN AÇIK UÇLU SORU</small>
                    <h2>
                      Bu bölümde neler yaşadığınızı, düşündüğünüzü ve
                      hissettiğinizi anlatır mısınız?
                    </h2>
                    <p>Hatırlamadığınız noktaları belirtmeniz de değerli.</p>
                  </div>
                </div>
                {currentEvent && (
                  <section className="card padded">
                    <h2>
                      {participantMode
                        ? "Anlatı notları"
                        : "Katılımcının anlatısı"}
                    </h2>
                    <Field
                      label="Katılımcının kendi sözleri"
                      help="Yorumunuzu doğrudan alıntıdan ayırın. Alanlar otomatik yerel kaydedilir."
                    >
                      <textarea
                        rows={participantMode ? 5 : 7}
                        value={currentEvent.narrative}
                        onChange={(e) =>
                          updateEvent(currentEvent.id, {
                            narrative: e.target.value,
                          })
                        }
                        placeholder="Katılımcının anlatısını buraya yazın…"
                      />
                    </Field>
                    {!participantMode && (
                      <>
                        <div className="form-grid">
                          <Field label="An başlığı / seçim gerekçesi">
                            <input
                              value={currentEvent.title}
                              onChange={(e) =>
                                updateEvent(currentEvent.id, {
                                  title: e.target.value,
                                })
                              }
                            />
                          </Field>
                          <Field label="Görüşme tarihi">
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
                          <Field label="Öncesi (s)">
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
                          <Field label="Sonrası (s)">
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
                        <Field label="Araştırmacı kodları / yorum notu">
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
                            İsteğe bağlı öz değerlendirme alanları
                          </summary>
                          <p>
                            Bu iki sayı standartlaştırılmış/valide bir ölçek
                            uygulaması değildir. Önceden onayladığınız görüşme
                            protokolünde varsa kullanın; eksik yanıt sıfıra
                            çevrilmez.
                          </p>
                          <div className="form-grid">
                            {(["valence", "arousal"] as const).map((key, i) => (
                              <Field
                                key={key}
                                label={
                                  i
                                    ? "Uyarılma · 1 sakin, 9 yoğun"
                                    : "Hoşluk · 1 olumsuz, 9 olumlu"
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
                                    Yanıt yok / uygulanmadı
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
                            Tur ile görüşme arasında yaklaşık{" "}
                            {number(
                              (new Date(currentEvent.recallDate).getTime() -
                                new Date(project.recordedAt).getTime()) /
                                86400000,
                              1,
                            )}{" "}
                            gün var. Bu süre rapora yazılır; bir hafta
                            geçerlilik eşiği değildir.
                          </Info>
                        )}
                      </>
                    )}
                  </section>
                )}
                {!participantMode && (
                  <Info>
                    Katılımcı görünümü grafik ve aday nedenlerini gizler. Ses
                    kaydı otomatik yapılmaz. Video içindeki yüzler, sesler ve
                    konum bilgileri oturum dosyalarınızın bir parçasıdır.
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
          OutLab <span>v1.1 · Dış mekân araştırması</span>
          <span>Ölçüm → bağlam → anlatı</span>
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
                <span className="eyebrow">ADIM 1 · VERİYİ DOĞRULA</span>
                <h2 id="import-title">Dosyalarınızı buraya bırakın</h2>
              </div>
              <button
                className="icon-button"
                aria-label="İçe aktarmayı kapat"
                onClick={() => setImportOpen(false)}
              >
                <X />
              </button>
            </div>
            <div
              className="dropzone"
              role="button"
              tabIndex={0}
              aria-label="Dosya seç veya sürükle bırak"
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
              <b>EmotiBit + video + rota</b>
              <p>
                Dosyaları birlikte sürükleyin veya bilgisayardan seçin · en
                fazla {MAX_VIDEOS} video
              </p>
              <div>
                <span>CSV / INFO.JSON</span>
                <span>MP4 / MOV</span>
                <span>GPX</span>
              </div>
            </div>
            <p className="small-note">
              Videolar bilgisayarınızdan oynatılır; yüklenmez veya kopyalanmaz.
              Bir oturumda en fazla {MAX_VIDEOS} video (ör. 4 × 60 dk Full HD)
              olabilir. CSV/GPX verisi yalnızca yerel analiz motoruna
              gönderilir. Mevcut bir oturuma veri eklemek, o oturumun analizini
              ve an seçimini sıfırlar; önce proje paketini indirin.
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
                      ? "ÖNCE AYRIŞTIRIN"
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
                            "Sensör türü",
                            "Zaman sütunu",
                            "Değer sütunu",
                            "Zaman birimi",
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
                                ? "Tüm tanınan sensör sütunları"
                                : opt === "auto"
                                  ? "Otomatik (kontrol edin)"
                                  : opt || "Otomatik"}
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
              <span>{inspected.length} dosya incelendi</span>
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
                Eşlemeleri onayla ve içe aktar <ArrowRight size={15} />
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
            aria-label="Oturumlar"
          >
            <div className="modal-heading">
              <h2>Yerel oturumlar</h2>
              <button
                className="icon-button"
                aria-label="Oturumları kapat"
                onClick={() => setLibraryOpen(false)}
              >
                <X />
              </button>
            </div>
            <p>
              Her oturum tarayıcınızın yerel deposunda tutulur. Kalıcı yedek
              için proje paketini indirin.
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
                    {p.participant} · {p.dataset.channels.length} kanal ·{" "}
                    {p.isDemo
                      ? "Sentetik demo"
                      : new Date(p.updatedAt).toLocaleDateString("tr-TR")}
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
                Yeni demo aç
              </button>
              <button
                className="button primary"
                onClick={() => void changeProject(blankProject())}
              >
                <Plus size={16} />
                Yeni oturum
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
            aria-label="Dışa aktarma"
          >
            <div className="modal-heading">
              <h2>Araştırma çıktıları</h2>
              <button
                className="icon-button"
                aria-label="Dışa aktarmayı kapat"
                onClick={() => setExportsOpen(false)}
              >
                <X />
              </button>
            </div>
            <p>
              Çıktılar bilgisayarınıza indirilir. Katılımcı verileri GitHub
              deposuna gönderilmez.
            </p>
            <button className="export-option" onClick={exportProject}>
              <Save />
              <span>
                <b>Taşınabilir proje paketi</b>
                <small>
                  Ham kaynak metinleri, analiz, eşleme, görüşmeler ve işlem
                  günlüğü · JSON
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
                <b>İşlenmiş EDA serileri</b>
                <small>
                  Ham, filtrelenmiş, tonic, phasic ve kalite işaretleri · CSV
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
                <b>Görüşme kayıtları</b>
                <small>
                  Seçilen anlar, anlatılar, kodlar ve video zamanları · CSV
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
                <b>Yöntem ve doğrulama raporu</b>
                <small>
                  Parametreler, kaynak hash değerleri, sınırlar ve işlem geçmişi
                  · HTML / yazdırılabilir
                </small>
              </span>
              <Download size={18} />
            </button>
            <Info tone="warning">
              Proje paketi video dosyasını içermez ve şifreli değildir. Videoyu
              ayrıca saklayın; yeniden açtığınızda aynı dosyayı bağlayın.
              Tarayıcı verilerini silmek yerel oturumları kaldırır.
            </Info>
          </section>
        </div>
      )}
    </div>
  );
}

function Science({
  project,
  onExportReport,
}: {
  project: SavedProject;
  onExportReport: () => void;
}) {
  const principles = [
    [
      "01",
      "Veri kalitesi önce gelir",
      "Örnekleme hızı dosyadaki zaman farklarından tahmin edilir. Geçersiz satırlar, tekrarlar, sabit sinyaller ve zaman boşlukları ayrı raporlanır. Sayısal bir sayaç sensör değeri olarak seçilmez.",
    ],
    [
      "02",
      "Hareket, kesin artefakt değildir",
      "İvme değişimi olası hareket etkisini işaretler. Hareket fizyolojik değişimle aynı anda olabilir; işaretlenen veri otomatik silinmez veya “onarılmış gerçek” olarak sunulmaz.",
    ],
    [
      "03",
      "Filtre, bir varsayım içerir",
      "NeuroKit2 ile uygulanan temizleme ve highpass bileşen ayrıştırması sinyalin matematiksel tahminlerini üretir. Kesim frekansları, yöntem ve kütüphane sürümü işlem kaydındadır.",
    ],
    [
      "04",
      "Pik seçimi keşif amaçlıdır",
      "Robust z = 0,67449 × (fazik değer − referans medyanı) / MAD. Yetersiz veya sabit karşılaştırma aralığında güvenilir skor üretilemez. Aday sayısı valide SCR sıklığı değildir.",
    ],
    [
      "05",
      "Görüşme, yeni bir veri katmanıdır",
      "Önce nötr video ve açık uçlu anlatı, sonra araştırmacı yorumu. Bir hafta pratik planınızdır; belleğin doğruluğunu garantileyen bilimsel eşik değildir. Görüşmeye kadar geçen süreyi kaydedin.",
    ],
    [
      "06",
      "Tek bir sinyalden duygu çıkmaz",
      "EDA genel sempatik etkinlikle ilişkilidir; duygunun adı veya hoşluk yönü tek başına belirlenemez. Bisiklet sürerken efor, ısı, elektrot teması ve hareket ayrıca değerlendirilmelidir.",
    ],
  ];
  return (
    <>
      <div className="science-intro">
        <div>
          <span className="eyebrow">AÇIK YÖNTEM · İZLENEBİLİR KARAR</span>
          <h2>
            Sonuçtan önce,
            <br />
            <em>sonucun nasıl oluştuğunu görün.</em>
          </h2>
          <p>
            OutLab bir araştırma yardımcısıdır. Yazılımın çalışması, saha
            ölçümlerinin veya seçilen eşiklerin bilimsel olarak valide edildiği
            anlamına gelmez.
          </p>
        </div>
        <BookOpen size={100} strokeWidth={0.8} />
      </div>
      <div className="principle-grid">
        {principles.map(([n, title, body]) => (
          <section className="card padded" key={n}>
            <span className="principle-number">{n}</span>
            <h3>{title}</h3>
            <p>{body}</p>
          </section>
        ))}
      </div>
      <div className="page-grid">
        <section className="card padded">
          <h2>Kaynaklara doğrudan ulaşın</h2>
          <div className="source-links">
            {scienceSources.sources.map((source) => (
              <details key={source.id}>
                <summary>
                  <b>{source.id}</b> · {source.title}
                </summary>
                <p>
                  <b>Dayanak:</b> {source.claim}
                </p>
                <p>
                  <b>Uygulama kararı:</b> {source.application}
                </p>
                <p>
                  <b>Kanıtlamadığı:</b> {source.doesNotEstablish}
                </p>
                <a href={source.url} target="_blank" rel="noreferrer">
                  Birincil kaynağı aç <ArrowRight size={15} />
                </a>
              </details>
            ))}
          </div>
          <p className="small-note">
            Kaynakların kapsamı, uygulama karşılığı ve pilot kontrol listesi
            uygulama klasöründeki docs/SCIENTIFIC_BASIS.md belgesinde
            ayrıntılıdır.
          </p>
        </section>
        <section className="card padded">
          <h2>Sahaya çıkmadan önce</h2>
          <ol className="guide-list">
            <li>
              Tüm kayıtları aynı fiziksel işaretle başlatın ve sonda ikinci
              işaret oluşturun.
            </li>
            <li>
              Elektrot yerleşimi, cihaz/firmware, hava, efor ve molaları not
              edin.
            </li>
            <li>
              Kısa bir pilot turda video, GPX ve sensör eşlemesini kontrol edin.
            </li>
            <li>
              Kaliteli karşılaştırma aralığı ile aday seçme kuralını önceden
              belirleyin.
            </li>
            <li>
              Katılımcıya nötr video gösterin; alıntı ile araştırmacı yorumunu
              ayırın.
            </li>
          </ol>
        </section>
      </div>
      <section className="card padded">
        <div className="section-title">
          <h2>Bu oturumun işlem günlüğü</h2>
          <button className="button" onClick={onExportReport}>
            <Download size={16} />
            Yöntem raporu
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
                  <small>{new Date(a.at).toLocaleString("tr-TR")}</small>
                  <p>{a.detail}</p>
                </span>
              </div>
            ))}
        </div>
        <p className="small-note">
          En son 100 işlem gösterilir. Proje paketi ve rapor tüm işlem geçmişini
          içerir.
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
    `<!doctype html><html lang="tr"><meta charset="utf-8"><title>OutLab yöntem raporu</title><style>body{font:15px/1.6 Georgia,serif;max-width:1000px;margin:40px auto;color:#22342c;padding:20px}h1,h2{font-family:system-ui}table{border-collapse:collapse;width:100%;font:12px/1.5 system-ui}td,th{border:1px solid #ccd6ce;padding:8px;text-align:left;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f0f4ef;padding:18px}small{color:#607066}@media print{body{margin:0}h2{break-after:avoid}tr{break-inside:avoid}}</style><h1>OutLab · Yöntem ve doğrulama raporu</h1><p>${esc(p.title)} · ${esc(p.participant)} · ${esc(now())}</p><p><b>${p.isDemo ? "SENTETİK DEMO — araştırma bulgusu değildir." : "Araştırma oturumu — saha geçerliği ayrıca değerlendirilmelidir."}</b></p><h2>Kapsam ve yorum sınırı</h2><p>EDA adayları keşif amaçlı fizyolojik değişimlerdir. Duygu, stres veya nedensellik etiketi üretilmemiştir. Hareket işaretleri kesin artefakt değildir; otomatik onarım yapılmaz. HR/BI varsa kaynakta türetilmiş değerlerdir; ham PPG’den HRV üretilmez. Video dosyaları bu rapora dahil değildir. Bu rapor otomatik bir yöntem kaydıdır; bilimsel yöntem bölümünüzün yerine geçmez.</p><h2>Veri kalitesi</h2>${table(
      [
        "Kanal",
        "Birim",
        "Hz",
        "Geçerli",
        "Geçersiz",
        "Tekrar",
        "Boşluk",
        "Uyarılar",
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
    )}<p>${p.dataset.warnings.map(esc).join("<br>")}</p><h2>Uygulanan analiz</h2><p>${esc(p.analysis?.method ?? "Analiz çalıştırılmadı")} · ${esc(p.analysis?.version ?? "")}</p><pre>${esc(JSON.stringify(p.analysis?.parameters ?? {}, null, 2))}</pre><h3>Arayüzdeki güncel ayarlar</h3><pre>${esc(JSON.stringify(p.config, null, 2))}</pre><p>Son analizdeki parametrelerle güncel ayarlar farklıysa grafikler önceki çalıştırmayı gösterir.</p><p>${p.analysis?.warnings.map(esc).join("<br>") ?? ""}</p><h2>Zaman eşleme</h2>${table(
      [
        "Video",
        "Dosya",
        "Süre (s)",
        "Ofset (s)",
        "Oran",
        "Doğrulandı",
        "Belirsizlik (± s)",
        "Dayanak",
      ],
      p.videos.map((v, i) => [
        videoLabel(i),
        v.name,
        v.duration ?? "—",
        v.offset,
        v.rate,
        v.verified ? "evet" : "hayır",
        v.uncertainty,
        v.reason,
      ]),
    )}<pre>${esc(JSON.stringify({ gps: p.sync, videos: p.videos }, null, 2))}</pre><p>İşaretlerle yapılan eşleme araştırmacı tarafından bağımsız bir olayda kontrol edilmelidir. Belirsizlik bir araştırmacı tahminidir. Tur başlangıç beyanı: ${esc(p.recordedAt)}</p><h2>Görüşme kayıtları</h2>${table(
      [
        "Zaman (s)",
        "Önce/sonra",
        "Seçim",
        "Anlatı",
        "Araştırmacı kodları",
        "Görüşme zamanı",
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
    )}<p>Görüşmeye kadar geçen süre bellek sınırlılıklarıyla birlikte raporlanmalıdır. Bir hafta geçerlik garantisi değildir.</p><h2>Aday seçimi ve çalıştırma geçmişi</h2><pre>${esc(JSON.stringify({ runs: p.analysisRuns ?? [], events: p.events.filter((e) => e.selected).map((e) => ({ id: e.id, provenance: e.provenance })) }, null, 2))}</pre><h2>Kaynak bütünlüğü</h2>${table(
      ["Dosya", "SHA-256", "Satır"],
      p.dataset.sources.map((s) => [s.name, s.sha256, s.rows]),
    )}<h2>İşlem geçmişi</h2>${table(
      ["Zaman", "İşlem", "Ayrıntı"],
      p.audit.map((a) => [a.at, a.action, a.detail]),
    )}<h2>Bilimsel kaynaklar</h2><p>Boucsein et al. (2012). Recommendations for electrodermal measurements. <a href="https://doi.org/10.1111/j.1469-8986.2012.01384.x">DOI</a><br>Lyle (2003). Stimulated recall: a report on its use in naturalistic research. <a href="https://doi.org/10.1080/0141192032000137349">DOI</a><br><a href="https://neuropsychology.github.io/NeuroKit/functions/eda.html">NeuroKit2 EDA documentation</a><br><a href="https://github.com/EmotiBit/EmotiBit_Docs/blob/master/Working_with_emotibit_data.md">EmotiBit data documentation</a></p><small>OutLab 1.1 · Dış mekân ölçümleri için yerel araştırma aracı. Kaynak doğrulama notları docs/SCIENTIFIC_BASIS.md içinde.</small></html>`,
    "text/html;charset=utf-8",
  );
}
