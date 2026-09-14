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
import "./components.css";

export interface SignalChartProps {
  channels: Channel[];
  analysis?: Analysis | null;
  currentTime: number;
  duration: number;
  onSeek: (seconds: number) => void;
  events?: Candidate[];
  height?: number;
}
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
  "#207765",
  "#bc7940",
  "#6374aa",
  "#859248",
  "#ad6478",
  "#477f96",
];
const numberText = (n: number) =>
  n.toLocaleString("tr-TR", { maximumFractionDigits: Math.abs(n) < 1 ? 3 : 2 });

export { SignalChart };

export default function SignalChart({
  channels,
  analysis,
  currentTime,
  duration,
  onSeek,
  events = [],
  height,
}: SignalChartProps) {
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
          label: isEda ? "Ham EDA" : channel.label,
          color: isEda ? "#b9c8c1" : palette[i % palette.length],
          points: channel.points,
        },
      ];
      if (isEda)
        series.push({
          label: "İşlenmiş EDA",
          color: "#207765",
          points: analysis!.points.map((p) => ({ t: p.t, v: p.clean })),
        });
      return {
        id: channel.id,
        label: `${channel.tag} · ${channel.label}`,
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
          label: "TONİK · Yavaş bileşen",
          unit: "µS",
          gap,
          series: [
            {
              label: "Tonik",
              color: "#667d64",
              points: analysis.points.map((p) => ({ t: p.t, v: p.tonic })),
            },
          ],
        },
        {
          id: "phasic",
          label: "FAZİK · Hızlı bileşen",
          unit: "µS",
          gap,
          series: [
            {
              label: "Fazik",
              color: "#bd8050",
              points: analysis.points.map((p) => ({ t: p.t, v: p.phasic })),
            },
          ],
        },
      );
    }
    return result;
  }, [channels, analysis]);
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
        <p>Grafikte göstermek istediğiniz kanalları seçin.</p>
      </div>
    );
  return (
    <div className="rl-signal" ref={host}>
      <div className="rl-chart-toolbar">
        <span>
          <ScanLine size={14} /> Ortak zaman ekseni{" "}
          <span className="rl-toolbar-muted">· grafiğe tıklayarak git</span>
        </span>
        <div className="rl-segmented" aria-label="Grafik zaman aralığı">
          {[
            [0, "Tümü"],
            [120, "2 dk"],
            [30, "30 sn"],
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
        aria-label="Biyometrik kanalların ortak zaman çizelgesi"
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
        {Array.from({ length: 6 }, (_, i) => {
          const t = start + (span * i) / 5;
          return (
            <g key={i}>
              <line
                x1={plotX(t)}
                x2={plotX(t)}
                y1={top}
                y2={svgHeight - 29}
                stroke="#e7eae5"
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
                <line x1={0} x2={width} y1={base} y2={base} stroke="#e9ebe5" />
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
                  ? "Veri yok"
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
                stroke="#ecede8"
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
                          fill={event.flagged ? "#b86347" : "#bd8050"}
                        />
                        <title>
                          {formatTime(event.t)} · İnceleme adayı
                          {event.flagged ? " · hareket işareti" : ""}
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
            stroke="#7f8d85"
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
              stroke="#235f4b"
              strokeWidth={1.5}
            />
            <circle
              cx={plotX(currentTime)}
              cy={svgHeight - 27}
              r={3.5}
              fill="#235f4b"
            />
          </g>
        )}
      </svg>
      <div className="rl-chart-footer">
        <span>
          {analysis?.points.length &&
          channels.some((channel) => channel.tag === "EA") ? (
            <>
              <i style={{ background: "#b9c8c1" }} /> Ham EDA{" "}
              <i style={{ background: "#207765" }} /> İşlenmiş EDA{" "}
              <i style={{ background: "#bd8050" }} /> Fazik aday
            </>
          ) : (
            "Ham kaynak serileri · kanal renkleri ayrı gösterilir"
          )}
        </span>
        <span>Boşluklar birleştirilmez · birimler ayrı ölçeklenir</span>
      </div>
    </div>
  );
}
