import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Expand,
  Film,
  Move,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react";
import * as THREE from "three";
import { formatTime } from "./geometry";
import "./components.css";

export { VideoPanel };

export interface VideoPanelProps {
  src?: string | null;
  fileName?: string;
  sessionTime: number;
  videoOffset: number;
  videoRate: number;
  onTimeChange: (sessionTime: number) => void;
  onDuration?: (videoDuration: number) => void;
  /** Fired after the video reaches its natural end (for chaining consecutive videos). */
  onEnded?: () => void;
  onError?: (message: string) => void;
  isDemo?: boolean;
  playing?: boolean;
  onPlayingChange?: (playing: boolean) => void;
  clip?: { start: number; end: number } | null;
}

function Panorama({
  video,
  onFailure,
}: {
  video: HTMLVideoElement;
  onFailure: (message: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const view = useRef({ lon: 0, lat: 0 });
  useEffect(() => {
    const target = container.current;
    if (!target) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      onFailure(
        "360° görünüm için WebGL açılamadı. Düz video oynatıcısını kullanabilirsiniz.",
      );
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    target.appendChild(renderer.domElement);
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    // A panorama can be enabled while the video is paused. In that case no new
    // requestVideoFrameCallback arrives, so explicitly upload the current frame.
    const refreshTexture = () => {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA)
        texture.needsUpdate = true;
    };
    refreshTexture();
    video.addEventListener("seeked", refreshTexture);
    video.addEventListener("loadeddata", refreshTexture);
    const geometry = new THREE.SphereGeometry(10, 64, 40);
    geometry.scale(-1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ map: texture });
    scene.add(new THREE.Mesh(geometry, material));
    const resize = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      renderer.setSize(Math.max(width, 1), Math.max(height, 1));
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    });
    resize.observe(target);
    let frame = 0;
    function render() {
      frame = requestAnimationFrame(render);
      const phi = THREE.MathUtils.degToRad(90 - view.current.lat),
        theta = THREE.MathUtils.degToRad(view.current.lon);
      camera.lookAt(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta),
      );
      renderer.render(scene, camera);
    }
    render();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      video.removeEventListener("seeked", refreshTexture);
      video.removeEventListener("loadeddata", refreshTexture);
      texture.dispose();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [video, onFailure]);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const move = (dx: number, dy: number) => {
    view.current.lon += dx;
    view.current.lat = Math.max(-80, Math.min(80, view.current.lat + dy));
  };
  return (
    <div className="rl-panorama">
      <div
        ref={container}
        className="rl-panorama-canvas"
        role="application"
        aria-label="360 derece bakış; sürükleyin ya da ok tuşlarını kullanın"
        tabIndex={0}
        onPointerDown={(event) => {
          drag.current = { x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (drag.current) {
            move(
              (drag.current.x - event.clientX) * 0.16,
              (event.clientY - drag.current.y) * 0.16,
            );
            drag.current = { x: event.clientX, y: event.clientY };
          }
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onKeyDown={(event) => {
          const directions: Record<string, [number, number]> = {
            ArrowLeft: [-8, 0],
            ArrowRight: [8, 0],
            ArrowUp: [0, 8],
            ArrowDown: [0, -8],
          };
          const direction = directions[event.key];
          if (direction) {
            event.preventDefault();
            move(...direction);
          }
        }}
      />
      <span className="rl-panorama-hint">
        <Move size={13} /> Bakış yönünü sürükleyin
      </span>
      <div className="rl-panorama-controls">
        <button onClick={() => move(-15, 0)} aria-label="Sola bak">
          <ArrowLeft size={14} />
        </button>
        <button onClick={() => move(0, 15)} aria-label="Yukarı bak">
          <ArrowUp size={14} />
        </button>
        <button
          onClick={() => {
            view.current = { lon: 0, lat: 0 };
          }}
          aria-label="Bakış yönünü sıfırla"
        >
          <RotateCcw size={13} />
        </button>
        <button onClick={() => move(0, -15)} aria-label="Aşağı bak">
          <ArrowDown size={14} />
        </button>
        <button onClick={() => move(15, 0)} aria-label="Sağa bak">
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

function SyntheticStoryboard({ time }: { time: number }) {
  const movement = (time % 8) / 8;
  return (
    <div
      className="rl-storyboard"
      aria-label="Sentetik örnek; gerçek saha videosu değildir"
    >
      <svg
        viewBox="0 0 800 440"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="rl-sky" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#bdcec7" />
            <stop offset="1" stopColor="#edf0d9" />
          </linearGradient>
          <linearGradient id="rl-ground" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#697b61" />
            <stop offset="1" stopColor="#283f35" />
          </linearGradient>
        </defs>
        <rect width="800" height="440" fill="url(#rl-sky)" />
        <circle cx="647" cy="91" r="37" fill="#fff4ce" opacity=".75" />
        <path
          d="M0 251L126 159L267 232L365 165L479 226L616 153L800 233V440H0Z"
          fill="#aab6a0"
        />
        <path
          d="M0 282L172 209L315 274L474 218L618 271L800 209V440H0Z"
          fill="#7f947d"
        />
        <path
          d="M0 302Q190 264 381 288Q585 263 800 292V440H0Z"
          fill="url(#rl-ground)"
        />
        <path d="M354 440H677L442 286L422 286Z" fill="#b5b8a5" />
        <path d="M348 440H356L424 286H420Z" fill="#ded9bb" opacity=".7" />
        <path d="M667 440H679L444 286H440Z" fill="#ded9bb" opacity=".7" />
        {[0, 1, 2, 3, 4].map((i) => {
          const depth = ((i / 5 + movement) % 1) ** 1.8;
          const y = 295 + depth * 180,
            x = 433 + depth * 78;
          return (
            <path
              key={i}
              d={`M${x} ${y}l${4 + depth * 11} ${8 + depth * 15}`}
              stroke="#eae7cc"
              strokeWidth={1 + depth * 4}
            />
          );
        })}
        {[
          { x: 74, y: 316, s: 1.3 },
          { x: 201, y: 283, s: 0.8 },
          { x: 651, y: 298, s: 1.05 },
          { x: 750, y: 334, s: 1.6 },
        ].map((tree, i) => (
          <g
            key={i}
            transform={`translate(${tree.x},${tree.y}) scale(${tree.s})`}
          >
            <path d="M0 45V-80" stroke="#42563e" strokeWidth="7" />
            <path
              d="M0 -134L-36 -45H-22L-48 -13H48L21 -45H36Z"
              fill={i % 2 ? "#415f49" : "#36553f"}
            />
            <path d="M0 -126V-14H40L16 -45H29Z" fill="#4d6b4e" opacity=".55" />
          </g>
        ))}
        <path
          d="M278 440L270 414Q270 403 283 407L345 425M586 440L594 414Q594 403 581 407L519 425"
          stroke="#23382e"
          strokeWidth="13"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M345 425Q431 407 519 425"
          stroke="#2d4036"
          strokeWidth="10"
          fill="none"
        />
        <rect x="406" y="405" width="48" height="27" rx="5" fill="#233b31" />
        <rect x="413" y="410" width="34" height="15" rx="2" fill="#aabfac" />
      </svg>
      <div className="rl-storyboard-label">
        <span>SENTETİK ÖRNEK</span>
        <strong>Birlikte aynı ana bakın.</strong>
        <p>Bu çizim arayüzü tanıtır; saha kaydı içermez.</p>
      </div>
      <span className="rl-scene-time">
        {formatTime(time)} <span>ÖRNEK ZAMAN</span>
      </span>
    </div>
  );
}

export default function VideoPanel({
  src,
  fileName,
  sessionTime,
  videoOffset,
  videoRate,
  onTimeChange,
  onDuration,
  onEnded,
  onError,
  isDemo = false,
  playing,
  onPlayingChange,
  clip,
}: VideoPanelProps) {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [duration, setDuration] = useState(0),
    [isPlaying, setIsPlaying] = useState(false),
    [muted, setMuted] = useState(true);
  const [panorama, setPanorama] = useState(false),
    [error, setError] = useState<string | null>(null);
  const shell = useRef<HTMLDivElement>(null);
  const lastEmittedTime = useRef<number | null>(null);
  const rate = Number.isFinite(videoRate) && videoRate > 0 ? videoRate : 1;
  const localTime = (sessionTime - videoOffset) / rate;
  const covered =
    localTime >= 0 && (duration === 0 || localTime <= duration + 0.04);
  const coverage = useRef(covered);
  coverage.current = covered;
  const failPanorama = useCallback((message: string) => {
    setError(message);
    setPanorama(false);
  }, []);
  useEffect(() => {
    setDuration(0);
    setError(null);
    setIsPlaying(false);
    setPanorama(false);
    lastEmittedTime.current = null;
  }, [src]);
  useEffect(() => {
    if (!video || !src || !video.readyState) return;
    if (!covered) {
      video.pause();
      return;
    }
    // A player's own emitted time is acknowledgement, not a new seek command.
    // External seeks are honored down to 10 ms, including small timeline adjustments.
    if (
      lastEmittedTime.current !== null &&
      Math.abs(sessionTime - lastEmittedTime.current) < 0.0001
    ) {
      lastEmittedTime.current = null;
      return;
    }
    if (Math.abs(video.currentTime - localTime) > 0.01)
      video.currentTime = Math.max(
        0,
        Math.min(duration || localTime, localTime),
      );
  }, [video, src, sessionTime, localTime, covered, duration, isPlaying]);
  useEffect(() => {
    if (!video || playing === undefined || !src) return;
    if (playing && covered) {
      void video.play().catch(() => {
        setIsPlaying(false);
        onPlayingChange?.(false);
      });
    } else video.pause();
  }, [playing, video, src, covered, onPlayingChange]);
  const emitTime = (time: number) => {
    lastEmittedTime.current = time;
    onTimeChange(time);
  };
  const handleTime = () => {
    // Browsers queue a final timeupdate after pause and programmatic seek. It must
    // not overwrite a newer researcher-selected timestamp in the parent timeline.
    if (!video || !coverage.current || video.paused) return;
    const session = video.currentTime * rate + videoOffset;
    if (clip && session >= clip.end) {
      video.pause();
      const end = Math.max(
        0,
        Math.min(duration, (clip.end - videoOffset) / rate),
      );
      if (Math.abs(video.currentTime - end) > 0.01) video.currentTime = end;
      emitTime(Math.min(clip.end, duration * rate + videoOffset));
      return;
    }
    emitTime(session);
  };
  const togglePlayback = () => {
    if (!video || !src) {
      onPlayingChange?.(!(playing ?? isPlaying));
      return;
    }
    if (!video.paused) {
      emitTime(video.currentTime * rate + videoOffset);
      video.pause();
      return;
    }
    let target = localTime;
    if (clip && (sessionTime < clip.start || sessionTime >= clip.end))
      target = Math.max(0, (clip.start - videoOffset) / rate);
    else if (!covered || localTime >= duration) target = 0;
    video.currentTime = Math.min(duration, Math.max(0, target));
    coverage.current = true;
    emitTime(video.currentTime * rate + videoOffset);
    void video.play().catch(() => {
      const message =
        "Video başlatılamadı. Tarayıcının desteklediği H.264 MP4 dışa aktarımını deneyin.";
      setError(message);
      onError?.(message);
    });
  };
  return (
    <div className="rl-video" ref={shell}>
      <div className="rl-video-screen">
        {src ? (
          <>
            <video
              ref={setVideo}
              src={src}
              className={
                panorama
                  ? "rl-video-element rl-video-hidden"
                  : "rl-video-element"
              }
              playsInline
              preload="metadata"
              muted={muted}
              onLoadedMetadata={(event) => {
                const player = event.currentTarget;
                if (!Number.isFinite(player.duration) || player.duration <= 0) {
                  const message =
                    "Video süresi okunamadı; sabit süreli bir MP4 dosyası kullanın.";
                  setError(message);
                  onError?.(message);
                  return;
                }
                setDuration(player.duration);
                onDuration?.(player.duration);
                if (localTime >= 0 && localTime <= player.duration)
                  player.currentTime = localTime;
              }}
              onTimeUpdate={handleTime}
              onPlay={() => {
                setIsPlaying(true);
                onPlayingChange?.(true);
              }}
              onPause={() => {
                setIsPlaying(false);
                onPlayingChange?.(false);
              }}
              onEnded={() => {
                setIsPlaying(false);
                onPlayingChange?.(false);
                if (coverage.current) emitTime(duration * rate + videoOffset);
                onEnded?.();
              }}
              onError={() => {
                const message =
                  "Video okunamadı. Insta360 Studio’dan H.264 MP4 dışa aktarın; .insv dosyaları doğrudan oynatılamaz.";
                setError(message);
                setIsPlaying(false);
                onPlayingChange?.(false);
                onError?.(message);
              }}
            />
            {panorama && video && (
              <Panorama video={video} onFailure={failPanorama} />
            )}
            {!covered && (
              <div className="rl-video-overlay">
                <Film size={25} />
                <strong>Bu anda video kaydı yok</strong>
                <span>
                  Kapsama: {formatTime(videoOffset)}–
                  {formatTime(duration * rate + videoOffset)}
                </span>
              </div>
            )}
            <span className="rl-video-badge">
              {panorama ? "360° BAKIŞ" : "YEREL VİDEO"}
            </span>
            <button
              className="rl-fullscreen"
              aria-label="Videoyu tam ekran göster"
              onClick={() => {
                if (shell.current)
                  void shell.current
                    .requestFullscreen()
                    .catch(() =>
                      setError("Tam ekran tarayıcı tarafından açılamadı."),
                    );
              }}
            >
              <Expand size={16} />
            </button>
          </>
        ) : isDemo ? (
          <SyntheticStoryboard time={sessionTime} />
        ) : (
          <div className="rl-video-empty">
            <Film size={32} />
            <strong>Saha kaydınız burada</strong>
            <p>
              MP4 veya WebM videolarınızı yükleme alanına bırakın (en fazla 4).
            </p>
            <span>Insta360 X3: Studio’dan MP4 dışa aktarın.</span>
          </div>
        )}
      </div>
      <div className="rl-video-controls">
        <button
          className="rl-video-play"
          aria-label={(playing ?? isPlaying) ? "Duraklat" : "Oynat"}
          onClick={togglePlayback}
          disabled={!src && !isDemo}
        >
          {(playing ?? isPlaying) ? (
            <Pause size={17} fill="currentColor" />
          ) : (
            <Play size={17} fill="currentColor" />
          )}
        </button>
        <div className="rl-video-file">
          <strong>
            {src
              ? fileName || "Yerel video"
              : isDemo
                ? "Arayüz tanıtımı"
                : "Video bekleniyor"}
          </strong>
          <span>
            {src
              ? `${formatTime(Math.max(0, Math.min(duration, localTime)))} / ${formatTime(duration)} · video zamanı`
              : "Ortak zaman çizelgesiyle birlikte ilerler"}
          </span>
        </div>
        {src && (
          <>
            <button
              className={`rl-view-toggle ${panorama ? "active" : ""}`}
              aria-pressed={panorama}
              title="Yalnızca 2:1 equirectangular dışa aktarılmış 360 videolar içindir"
              onClick={() => setPanorama(!panorama)}
            >
              360°
            </button>
            <button
              className="rl-audio-toggle"
              aria-label={muted ? "Sesi aç" : "Sesi kapat"}
              onClick={() => setMuted(!muted)}
            >
              {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
            </button>
          </>
        )}
      </div>
      {panorama && (
        <p className="rl-video-note">
          360° görünüm, 2:1 equirectangular MP4 içindir. Bakış yönü bir ölçüm
          değildir.
        </p>
      )}
      {error && (
        <p className="rl-video-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
