import type React from "react";
import { AlertTriangle, CheckCircle2, CircleHelp } from "lucide-react";

export function Info({
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
export function Field({
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
export function Num({
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
