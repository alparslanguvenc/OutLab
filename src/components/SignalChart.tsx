import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, ScanLine } from "lucide-react";
import type { Analysis, Candidate, Channel } from "../types";
import {
  decimateSegments,
  estimateGap,
  formatTime,
  valueAt,
  type PlotPoint,
} from "./geometry";
import { locale, t, useLang } from "../i18n";
import "./components.css";

export interface SignalChartProps {
  channels: Channel[];
  analysis?: Analysis | null;
  currentTime: number;
  duration: number;
  onSeek: (seconds: number) => void;
  events?: Candidate[];
  height?: number;
  /** shaded time ranges from optional methods: quality-invalid, motion windows, manual labels */
  bands?: ChartBand[];
}
export interface ChartBand {
  start: number;
  end: number;
  kind: "quality" | "motion" | "artifact" | "valid" | "unsure";
  label: string;
}
const BAND_FILL: Record<ChartBand["kind"], string> = {
  quality: "rgba(194, 59, 46, 0.12)",
  motion: "rgba(183, 121, 31, 0.13)",
  artifact: "rgba(91, 95, 168, 0.16)",
  valid: "rgba(63, 122, 74, 0.10)",
  unsure: "rgba(137, 149, 160, 0.14)",
};
interface Series {
  label: string;
  color: string;
  points: PlotPoint[];
  dashed?: boolean;
}
interface Row {
  id: string;
  label: string;
  unit: string;
  series: Series[];
  gap: number;
}
const palette = [
  "#1f5fa8",
  "#a8642a",
  "#5b5fa8",
  "#3f7a4a",
  "#a3476b",
  "#2d8496",
];
const numberText = (n: number) =>
  n.toLocaleString(locale(), {
    maximumFractionDigits: Math.abs(n) < 1 ? 3 : 2,
  });

export { SignalChart };

export default function SignalChart({
  channels,
  analysis,
  currentTime,
  duration,
  onSeek,
  events = [],
  height,
  bands = [],
}: SignalChartProps) {
  const lang = useLang();
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(780);
  const [windowSeconds, setWindowSeconds] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.max(300, entries[0].contentRect.width)),
    );
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  const rows = useMemo<Row[]>(() => {
    const result: Row[] = channels.map((channel, i) => {
      const isEda = channel.tag === "EA" && !!analysis?.points.length;
      const series: Series[] = [
        {
          label: isEda ? t("Ham EDA", "Raw EDA") : channel.label,
          color: isEda ? "#b9c4cb" : palette[i % palette.length],
          points: channel.points,
        },
      ];
      if (isEda)
        series.push({
          label: t("İşlenmiş EDA", "Processed EDA"),
          color: "#1f5fa8",
          points: analysis!.points.map((p) => ({ t: p.t, v: p.clean })),
        });
      return {
        id: channel.id,
        label: `${channel.label} (${channel.tag})`,
        unit: channel.unit,
        series,
        gap: estimateGap(channel.points, channel.sampleRate),
      };
    });
    if (analysis?.points.length && channels.some((c) => c.tag === "EA")) {
      const gap = estimateGap(
        analysis.points.map((p) => ({ t: p.t, v: p.raw })),
        analysis.metrics.sampleRate,
      );
      result.splice(
        1,
        0,
        {
          id: "tonic",
          label: t("Tonik (yavaş bileşen)", "Tonic (slow component)"),
          unit: "µS",
          gap,
          series: [
            {
              label: t("Tonik", "Tonic"),
              color: "#56677a",
              points: analysis.points.map((p) => ({ t: p.t, v: p.tonic })),
            },
          ],
        },
        {
          id: "phasic",
          label: t("Fazik (hızlı bileşen)", "Phasic (fast component)"),
          unit: "µS",
          gap,
          series: [
            {
              label: t("Fazik", "Phasic"),
              color: "#a8642a",
              points: analysis.points.map((p) => ({ t: p.t, v: p.phasic })),
            },
          ],
        },
      );
    }
    return result;
    // lang: labels above are translated, so a language switch rebuilds the rows.
  }, [channels, analysis, lang]);
  const total = Math.max(duration, 1);
  const span = windowSeconds > 0 ? Math.min(total, windowSeconds) : total;
  // In a detail view the active time remains in the center until a boundary is reached.
  const start = Math.max(0, Math.min(total - span, currentTime - span / 2));
  const end = start + span;
  const left = width < 500 ? 46 : 58,
    right = 20,
    top = 18,
    plotWidth = width - left - right;
  const rowHeight = Math.max(
    104,
    height ? (height - 42) / Math.max(1, rows.length) : 118,
  );
  const svgHeight = rows.length * rowHeight + 42;
  const plotX = (t: number) => left + ((t - start) / span) * plotWidth;
  const timeFromPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = ((event.clientX - rect.left) * width) / rect.width;
    return Math.max(
      start,
      Math.min(end, start + ((relativeX - left) / plotWidth) * span),
    );
  };
  const renderedRows = useMemo(
    () =>
      rows.map((row) => {
        let min = Infinity,
          max = -Infinity;
        for (const series of row.series)
          for (const p of series.points)
            if (
              p.t >= start &&
              p.t <= end &&
              p.v !== null &&
              Number.isFinite(p.v)
            ) {
              min = Math.min(min, p.v);
              max = Math.max(max, p.v);
            }
        if (!Number.isFinite(min)) {
          min = 0;
          max = 1;
        }
        const margin =
          max === min
            ? Math.max(Math.abs(min) * 0.03, 0.05)
            : (max - min) * 0.14;
        return {
          ...row,
          min: min - margin,
          max: max + margin,
          paths: row.series.map((series) =>
            decimateSegments(series.points, start, end, plotWidth, row.gap),
          ),
        };
      }),
    [rows, start, end, plotWidth],
  );
  if (!rows.length)
    return (
      <div className="rl-chart-empty">
        <Activity size={24} />
        <p>
          {t(
            "Grafikte göstermek istediğiniz kanalları seçin.",
            "Select the channels you want to show on the chart.",
          )}
        </p>
      </div>
    );
  return (
    <div className="rl-signal" ref={host}>
      <div className="rl-chart-toolbar">
        <span>
          <ScanLine size={14} /> {t("Ortak zaman ekseni", "Shared time axis")}{" "}
          <span className="rl-toolbar-muted">
            {t("(grafiğe tıklayarak git)", "(click the chart to jump)")}
          </span>
        </span>
        <div
          className="rl-segmented"
          aria-label={t("Grafik zaman aralığı", "Chart time range")}
        >
          {[
            [0, t("Tümü", "All")],
            [120, t("2 dk", "2 min")],
            [30, t("30 sn", "30 s")],
          ].map(([seconds, label]) => (
            <button
              key={seconds}
              className={windowSeconds === seconds ? "active" : ""}
              onClick={() => setWindowSeconds(Number(seconds))}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <svg
        className="rl-signal-svg"
        width="100%"
        viewBox={`0 0 ${width} ${svgHeight}`}
        role="slider"
        tabIndex={0}
        aria-label={t(
          "Biyometrik kanalların ortak zaman çizelgesi",
          "Shared timeline of biometric channels",
        )}
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={currentTime}
        aria-valuetext={formatTime(currentTime)}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            onSeek(
              Math.max(
                0,
                Math.min(
                  duration,
                  currentTime + (event.key === "ArrowRight" ? 1 : -1),
                ),
              ),
            );
          }
        }}
        onPointerMove={(event) => setHover(timeFromPointer(event))}
        onPointerLeave={() => setHover(null)}
        onPointerDown={(event) => onSeek(timeFromPointer(event))}
      >
        {bands
          .filter((band) => band.end > start && band.start < end)
          .map((band, i) => {
            const x0 = plotX(Math.max(start, band.start));
            const x1 = plotX(Math.min(end, band.end));
            return (
              <rect
                key={`${band.kind}-${i}`}
                className={`rl-band rl-band-${band.kind}`}
                x={x0}
                y={8}
                width={Math.max(1, x1 - x0)}
                height={svgHeight - 36}
                fill={BAND_FILL[band.kind]}
                pointerEvents="none"
              >
                <title>{band.label}</title>
              </rect>
            );
          })}
        {Array.from({ length: 6 }, (_, i) => {
          const t = start + (span * i) / 5;
          return (
            <g key={i}>
              <line
                x1={plotX(t)}
                x2={plotX(t)}
                y1={top}
                y2={svgHeight - 29}
                stroke="#e3e8eb"
                strokeDasharray="3 5"
              />
              <text
                x={plotX(t)}
                y={svgHeight - 9}
                textAnchor="middle"
                className="rl-axis-text"
              >
                {formatTime(t)}
              </text>
            </g>
          );
        })}
        {renderedRows.map((row, index) => {
          const base = index * rowHeight,
            chartTop = base + 37,
            chartBottom = base + rowHeight - 12;
          const y = (value: number) =>
            chartBottom -
            ((value - row.min) / (row.max - row.min)) *
              (chartBottom - chartTop);
          const readTime = hover ?? currentTime;
          const sampled = valueAt(
            row.series[row.series.length - 1].points,
            readTime,
            row.gap,
          );
          return (
            <g key={row.id}>
              {index > 0 && (
                <line x1={0} x2={width} y1={base} y2={base} stroke="#e3e8eb" />
              )}
              <text x={left} y={base + 21} className="rl-channel-title">
                {row.label}
              </text>
              <text
                x={width - right}
                y={base + 21}
                textAnchor="end"
                className="rl-channel-value"
              >
                {sampled === null
                  ? t("Veri yok", "No data")
                  : `${numberText(sampled)} ${row.unit}`}
              </text>
              <text
                x={left - 9}
                y={chartTop + 4}
                textAnchor="end"
                className="rl-axis-text"
              >
                {numberText(row.max)}
              </text>
              <text
                x={left - 9}
                y={chartBottom + 3}
                textAnchor="end"
                className="rl-axis-text"
              >
                {numberText(row.min)}
              </text>
              <line
                x1={left}
                x2={width - right}
                y1={chartBottom}
                y2={chartBottom}
                stroke="#eceff1"
              />
              {row.paths.map((segments, seriesIndex) => (
                <g key={seriesIndex}>
                  {segments.map((segment, pathIndex) =>
                    segment.length === 1 ? (
                      <circle
                        key={pathIndex}
                        cx={plotX(segment[0].t)}
                        cy={y(segment[0].v!)}
                        r={1.5}
                        fill={row.series[seriesIndex].color}
                      />
                    ) : (
                      <path
                        key={pathIndex}
                        d={segment
                          .map(
                            (p, i) =>
                              `${i ? "L" : "M"}${plotX(p.t).toFixed(2)},${y(p.v!).toFixed(2)}`,
                          )
                          .join(" ")}
                        fill="none"
                        stroke={row.series[seriesIndex].color}
                        strokeWidth={
                          seriesIndex === 0 && row.series.length > 1 ? 1 : 1.65
                        }
                        strokeLinejoin="round"
                      />
                    ),
                  )}
                </g>
              ))}
              {row.id === "phasic" &&
                events
                  .filter((event) => event.t >= start && event.t <= end)
                  .map((event) => {
                    const x = plotX(event.t),
                      v = valueAt(row.series[0].points, event.t, row.gap);
                    return v !== null ? (
                      <g key={event.id}>
                        <path
                          d={`M${x},${y(v) - 4}l-3.5,-6h7Z`}
                          fill={event.flagged ? "#c23b2e" : "#a8642a"}
                        />
                        <title>
                          {t(
                            `${formatTime(event.t)}: inceleme adayı${event.flagged ? " (hareket işareti)" : ""}`,
                            `${formatTime(event.t)}: candidate for review${event.flagged ? " (motion flag)" : ""}`,
                          )}
                        </title>
                      </g>
                    ) : null;
                  })}
            </g>
          );
        })}
        {hover !== null && (
          <line
            x1={plotX(hover)}
            x2={plotX(hover)}
            y1={12}
            y2={svgHeight - 28}
            stroke="#8995a0"
            strokeDasharray="3 4"
            pointerEvents="none"
          />
        )}
        {currentTime >= start && currentTime <= end && (
          <g pointerEvents="none">
            <line
              x1={plotX(currentTime)}
              x2={plotX(currentTime)}
              y1={10}
              y2={svgHeight - 27}
              stroke="#1d2f44"
              strokeWidth={1.5}
            />
            {/* shared-moment marker: trail-blaze yellow, as in the map and timeline */}
            <circle
              cx={plotX(currentTime)}
              cy={svgHeight - 27}
              r={5}
              fill="#f4c20d"
              stroke="#1d2f44"
              strokeWidth={1.5}
            />
            <rect
              x={plotX(currentTime) - 4}
              y={8}
              width={8}
              height={5}
              fill="#f4c20d"
              stroke="#1d2f44"
              strokeWidth={1}
            />
          </g>
        )}
      </svg>
      <div className="rl-chart-footer">
        <span>
          {analysis?.points.length &&
          channels.some((channel) => channel.tag === "EA") ? (
            <>
              <i style={{ background: "#b9c4cb" }} /> {t("Ham EDA", "Raw EDA")}{" "}
              <i style={{ background: "#1f5fa8" }} />{" "}
              {t("İşlenmiş EDA", "Processed EDA")}{" "}
              <i style={{ background: "#a8642a" }} />{" "}
              {t("Fazik aday", "Phasic candidate")}
            </>
          ) : (
            t(
              "Ham kaynak serileri; kanal renkleri ayrı gösterilir",
              "Raw source series, each channel in its own color",
            )
          )}
        </span>
        <span>
          {t(
            "Boşluklar birleştirilmez; birimler ayrı ölçeklenir",
            "Gaps are not joined; each unit has its own scale",
          )}
        </span>
      </div>
    </div>
  );
}
