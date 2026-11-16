/**
 * Shared UI building blocks for the strategy & HA dashboard (/strategy).
 * Every view (Executive, KPI, HA, Align) uses these — do not copy them
 * into a view file. Font sizes: text-base / text-sm / text-xs only.
 */
import type { ReactNode } from "react";
import { CheckCircle2, RotateCcw, Search, SearchX, XCircle } from "lucide-react";

export {
  tableClass,
  theadClass,
  thClass,
  thRightClass,
  tdClass,
  tdRightClass,
  trClass,
} from "@/components/kpi/overview/table-styles";

/** Centered header cell (status column). */
export const thCenterClass = "px-3 py-2 text-center text-xs font-semibold";
/** Clickable table row; add `selectedRowClass` when the row is selected. */
export const clickableRowClass =
  "cursor-pointer border-b border-zinc-100 hover:bg-brand-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600 dark:border-zinc-800 dark:hover:bg-brand-900/30";
export const selectedRowClass = "bg-brand-100/70 dark:bg-brand-900/50";
/** Secondary button (reset filters, etc.). */
export const buttonClass =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-zinc-300 bg-surface px-3 py-1.5 text-sm font-medium hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 dark:border-zinc-700 dark:hover:bg-brand-900/40";
/** Primary button (navigation actions). */
export const primaryButtonClass =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600";
const controlClass =
  "w-full rounded-lg border border-zinc-300 bg-surface px-2 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 dark:border-zinc-700";
const labelClass = "mb-1 block text-xs font-semibold text-zinc-700 dark:text-zinc-300";
/** Muted secondary text. */
export const mutedClass = "text-xs text-zinc-600 dark:text-zinc-400";

/** White section card with a title row and an optional action on the right. */
export function Card({
  title,
  subtitle,
  action,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800">
      <div className={`flex flex-wrap items-start justify-between gap-2 ${children ? "mb-3" : ""}`}>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-brand-800 dark:text-brand-200">{title}</h2>
          {subtitle && <p className={`mt-0.5 ${mutedClass}`}>{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

export type StatTone = "brand" | "pass" | "fail" | "info";

const STAT_TONES: Record<StatTone, { border: string; value: string }> = {
  brand: { border: "border-l-brand-600", value: "text-brand-800 dark:text-brand-200" },
  pass: { border: "border-l-emerald-600", value: "text-emerald-700 dark:text-emerald-300" },
  fail: { border: "border-l-red-600", value: "text-red-700 dark:text-red-300" },
  info: { border: "border-l-sky-600", value: "text-sky-700 dark:text-sky-300" },
};

/** Summary number card with a colored left accent. */
export function StatCard({
  label,
  value,
  unit,
  meta,
  tone = "brand",
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  meta?: ReactNode;
  tone?: StatTone;
}) {
  const t = STAT_TONES[tone];
  return (
    <div
      className={`min-w-0 rounded-xl border border-l-4 border-zinc-200 bg-surface p-3 shadow-sm dark:border-zinc-800 ${t.border}`}
    >
      <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{label}</p>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
        <span className={`text-base font-bold tabular-nums ${t.value}`}>{value}</span>
        {unit && <span className={mutedClass}>{unit}</span>}
      </p>
      {meta && <div className={`mt-1 space-y-0.5 ${mutedClass}`}>{meta}</div>}
    </div>
  );
}

/** Pass / fail badge (emerald / red). */
export function StatusBadge({ status }: { status: 0 | 1 }) {
  return status === 1 ? (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
      <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />
      ผ่าน
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-950 dark:text-red-300">
      <XCircle aria-hidden="true" className="h-3.5 w-3.5" />
      ไม่ผ่าน
    </span>
  );
}

/** Neutral / amber info pill, e.g. "แสดง 37 รายการ" or a target value. */
export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "target";
}) {
  const cls =
    tone === "target"
      ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
      : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {children}
    </span>
  );
}

/** Monospace code chip, e.g. "K12" or a data source label. */
export function CodeChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block whitespace-nowrap rounded-md bg-brand-50 px-1.5 py-0.5 font-mono text-xs font-semibold text-brand-800 ring-1 ring-brand-200 dark:bg-brand-900/40 dark:text-brand-200 dark:ring-brand-800">
      {children}
    </span>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

export function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
}) {
  return (
    <label className="block min-w-0">
      <span className={labelClass}>{label}</span>
      <select className={controlClass} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SearchField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className={labelClass}>{label}</span>
      <span className="relative block">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
        />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`${controlClass} pl-8`}
        />
      </span>
    </label>
  );
}

/** "ล้างตัวกรอง" button, aligned with the bottom of filter fields. */
export function ResetButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`${buttonClass} self-end`}>
      <RotateCcw aria-hidden="true" className="h-4 w-4" />
      ล้างตัวกรอง
    </button>
  );
}

/** Wrapper card for a row of filter fields (wraps on phones). */
export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-3 rounded-xl border border-zinc-200 bg-surface p-3 shadow-sm sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end [&>*]:lg:min-w-44 [&>*]:lg:flex-1">
      {children}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center gap-1 px-4 py-8 text-center">
      <SearchX aria-hidden="true" className="h-6 w-6 text-zinc-400" />
      <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{title}</p>
      <p className={mutedClass}>{hint}</p>
    </div>
  );
}

/**
 * Legend swatch + label used under/above charts.
 * `colorClass` is a `bg-*` class for a solid swatch, or a `border-*` class
 * when `dashed` (line series such as the amber target line).
 */
export function LegendItem({
  colorClass,
  label,
  dashed,
}: {
  colorClass: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300">
      <span
        aria-hidden="true"
        className={
          dashed
            ? `h-0 w-4 border-t-2 border-dashed ${colorClass}`
            : `h-2.5 w-2.5 rounded-sm ${colorClass}`
        }
      />
      {label}
    </span>
  );
}
