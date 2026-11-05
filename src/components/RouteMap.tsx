import { useMemo } from "react";
import { MapPin, Navigation, Route, SignalZero } from "lucide-react";
import type { TrackPoint } from "../types";
import { formatTime, interpolateTrackAtTime } from "./geometry";
import { locale, t, useLang } from "../i18n";
import "./components.css";

export interface RouteMapProps {
  track: TrackPoint[];
  currentTime: number;
  gpsOffset: number;
  onSeek: (seconds: number) => void;
  isDemo?: boolean;
}
const W = 640,
  H = 365,
  PADDING = 50;
export { RouteMap };
function distance(a: TrackPoint, b: TrackPoint) {
  const rad = Math.PI / 180,
    dLat = (b.lat - a.lat) * rad,
    dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return (
    6371000 *
    2 *
    Math.atan2(Math.sqrt(Math.min(1, h)), Math.sqrt(Math.max(0, 1 - h)))
  );
}

export default function RouteMap({
  track,
  currentTime,
  gpsOffset,
  onSeek,
  isDemo = false,
}: RouteMapProps) {
  useLang();
  const map = useMemo(() => {
    const valid = track.filter(
      (p) =>
        Number.isFinite(p.lat) &&
        Number.isFinite(p.lon) &&
        Math.abs(p.lat) <= 90 &&
        Math.abs(p.lon) <= 180 &&
        Number.isFinite(p.t),
    );
    if (!valid.length) return null;
    const refLon = valid[0].lon,
      refLat = valid.reduce((sum, point) => sum + point.lat, 0) / valid.length;
    const lonDifference = (lon: number) => ((lon - refLon + 540) % 360) - 180;
    const cosLat = Math.max(0.0001, Math.cos((refLat * Math.PI) / 180));
    const projected = valid.map((p) => ({
      ...p,
      x: lonDifference(p.lon) * cosLat,
      y: -p.lat,
    }));
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const p of projected) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    const scale = Math.min(
      (W - PADDING * 2) / Math.max(maxX - minX, 0.0003),
      (H - PADDING * 2) / Math.max(maxY - minY, 0.0003),
    );
    const midX = (minX + maxX) / 2,
      midY = (minY + maxY) / 2;
    const project = (p: { lat: number; lon: number }) => ({
      x: W / 2 + (lonDifference(p.lon) * cosLat - midX) * scale,
      y: H / 2 + (-p.lat - midY) * scale,
    });
    let kilometers = 0,
      gaps = 0;
    const segments: TrackPoint[][] = [];
    let segment: TrackPoint[] = [];
    valid.forEach((point, i) => {
      if (i > 0) {
        const previous = valid[i - 1],
          dt = point.t - previous.t;
        if (previous.segment !== point.segment || dt > 15 || dt <= 0) {
          if (segment.length) segments.push(segment);
          segment = [];
          gaps++;
        } else kilometers += distance(previous, point) / 1000;
      }
      segment.push(point);
    });
    if (segment.length) segments.push(segment);
    return {
      valid,
      project,
      segments,
      kilometers,
      gaps,
      latAt: (y: number) => -((y - H / 2) / scale + midY),
      lonAt: (x: number) =>
        ((((x - W / 2) / scale + midX) / cosLat + refLon + 540) % 360) - 180,
    };
  }, [track]);
  const localTime = currentTime - gpsOffset;
  const position = map ? interpolateTrackAtTime(map.valid, localTime) : null;
  const point = position && map ? map.project(position) : null;
  let speed: number | null = null;
  if (map && position) {
    const index = map.valid.findIndex((p) => p.t >= localTime);
    const b = map.valid[index],
      a = map.valid[index - 1];
    if (a && b && b.segment === a.segment && b.t > a.t && b.t - a.t <= 15)
      speed = (distance(a, b) / (b.t - a.t)) * 3.6;
  }
  if (!map)
    return (
      <div className="rl-route-empty">
        <div className="rl-empty-orbit">
          <Route size={30} />
        </div>
        <strong>
          {t(
            "Rotayı da aynı ana bağlayın",
            "Link the route to the same moment",
          )}
        </strong>
        <p>
          {t(
            "Zaman damgalı bir GPX dosyası eklediğinizde konum burada görünür.",
            "Add a timestamped GPX file and the position appears here.",
          )}
        </p>
        <span>
          {t(
            "Harita servisine veri gönderilmez.",
            "No data is sent to a map service.",
          )}
        </span>
      </div>
    );
  return (
    <div className="rl-route">
      <div className="rl-route-canvas">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={t(
            `${isDemo ? "Sentetik örnek " : ""}GPX rota görünümü; konum ${position ? "mevcut" : "bu zaman için yok"}`,
            `${isDemo ? "Synthetic sample, " : ""}GPX route view; position ${position ? "available" : "not available at this time"}`,
          )}
          onClick={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect(),
              x = ((event.clientX - bounds.left) / bounds.width) * W,
              y = ((event.clientY - bounds.top) / bounds.height) * H;
            let nearest: TrackPoint | null = null,
              best = Infinity;
            for (const candidate of map.valid) {
              const p = map.project(candidate),
                d = (x - p.x) ** 2 + (y - p.y) ** 2;
              if (d < best) {
                nearest = candidate;
                best = d;
              }
            }
            if (nearest && best < 32 ** 2) onSeek(nearest.t + gpsOffset);
          }}
        >
          <rect width={W} height={H} fill="#eef3f1" />
          {Array.from({ length: 9 }, (_, i) => (
            <line
              key={`x-${i}`}
              x1={(i * W) / 8}
              x2={(i * W) / 8}
              y1={0}
              y2={H}
              stroke="#dce4e6"
              strokeWidth={i % 2 ? 0.5 : 1}
            />
          ))}
          {Array.from({ length: 7 }, (_, i) => (
            <line
              key={`y-${i}`}
              x1={0}
              x2={W}
              y1={(i * H) / 6}
              y2={(i * H) / 6}
              stroke="#dce4e6"
              strokeWidth={i % 2 ? 0.5 : 1}
            />
          ))}
          {[0.25, 0.5, 0.75].map((fraction) => (
            <text
              key={fraction}
              x={W * fraction}
              y={H - 11}
              textAnchor="middle"
              className="rl-map-grid-label"
            >
              {map.lonAt(W * fraction).toFixed(4)}°
            </text>
          ))}
          {[0.3, 0.6].map((fraction) => (
            <text
              key={fraction}
              x={10}
              y={H * fraction}
              className="rl-map-grid-label"
              transform={`rotate(-90,10,${H * fraction})`}
            >
              {map.latAt(H * fraction).toFixed(4)}°
            </text>
          ))}
          {map.segments.map((segment, i) => {
            const d = segment
              .map((p, j) => {
                const projected = map.project(p);
                return `${j ? "L" : "M"}${projected.x.toFixed(2)},${projected.y.toFixed(2)}`;
              })
              .join(" ");
            const solo = segment.length === 1 ? map.project(segment[0]) : null;
            return (
              <g key={i}>
                {solo ? (
                  <circle cx={solo.x} cy={solo.y} r={3} fill="#1f5fa8" />
                ) : (
                  <>
                    <path
                      d={d}
                      stroke="#ffffff"
                      strokeWidth={9}
                      fill="none"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                    <path
                      d={d}
                      stroke="#1f5fa8"
                      strokeWidth={3.5}
                      fill="none"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  </>
                )}
              </g>
            );
          })}
          {(() => {
            const start = map.project(map.valid[0]);
            return (
              <g>
                <circle
                  cx={start.x}
                  cy={start.y}
                  r={5}
                  fill="#ffffff"
                  stroke="#1f5fa8"
                  strokeWidth={2}
                />
                <text
                  x={start.x + 12}
                  y={start.y + 4}
                  className="rl-map-start-label"
                >
                  {t("Başlangıç", "Start")}
                </text>
              </g>
            );
          })()}
          {point && (
            <g>
              <circle
                cx={point.x}
                cy={point.y}
                r={19}
                fill="#1f5fa8"
                opacity={0.12}
              />
              <circle cx={point.x} cy={point.y} r={10} fill="#1d2f44" />
              <circle cx={point.x} cy={point.y} r={6.5} fill="#f4c20d" />
            </g>
          )}
          <g transform="translate(605 31)">
            <path d="M0,-12 L-5,6 L0,2 L5,6 Z" fill="#1d2f44" />
            <text
              x={0}
              y={22}
              textAnchor="middle"
              className="rl-map-grid-label"
            >
              {t("K", "N")}
            </text>
          </g>
        </svg>
        <div className="rl-map-chip">
          <Navigation size={12} />{" "}
          {isDemo
            ? t("Sentetik rota", "Synthetic route")
            : t("GPX (çevrimdışı)", "GPX (offline)")}
        </div>
        {!position && (
          <div className="rl-map-no-position">
            <SignalZero size={15} />{" "}
            {t("Bu anda GPS konumu yok", "No GPS position at this moment")}
          </div>
        )}
        <div className="rl-map-time">
          {formatTime(currentTime)}
          <span>{t("Ortak zaman", "Shared time")}</span>
        </div>
      </div>
      <div className="rl-map-metrics">
        <span>
          <MapPin size={14} />
          {position
            ? `${position.lat.toFixed(5)}, ${position.lon.toFixed(5)}`
            : t("Kapsama dışında / GPS boşluğu", "Outside coverage or GPS gap")}
        </span>
        <strong>
          {speed === null
            ? t("Hız —", "Speed —")
            : `≈ ${speed.toLocaleString(locale(), { maximumFractionDigits: 1 })} ${t("km/sa", "km/h")}`}
        </strong>
      </div>
      <div className="rl-map-note">
        {t(
          "Koordinat çizimi; arka plan haritası içermez.",
          "Coordinate plot only, with no background map.",
        )}{" "}
        {map.gaps > 0
          ? t(
              `${map.gaps} kesinti ayrı çizildi. `,
              `${map.gaps} ${map.gaps === 1 ? "gap" : "gaps"} drawn as separate segments. `,
            )
          : ""}
        {speed !== null && speed > 80
          ? t(
              "Yüksek GPS hızı: olası konum sıçramasını inceleyin. ",
              "High GPS speed: check for a possible position jump. ",
            )
          : ""}
        {t(
          "Rota üzerindeki bir noktaya tıklayarak gidin.",
          "Click a point on the route to jump there.",
        )}
      </div>
    </div>
  );
}
