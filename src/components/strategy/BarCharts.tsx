/**
 * Dependency-free bar charts for the strategy dashboard, drawn with
 * Tailwind boxes. Inline styles are used only for data-driven sizes.
 * Colors: pass = emerald, fail = red, target line = amber.
 */
import type { Kpi } from "@/lib/kpi/strategy-types";
import { fmtTarget, parseNum, parseTargetLine } from "@/lib/kpi/strategy-format";
import { LegendItem } from "./ui";

const countFormat = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 });
const valueFormat = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 });

/** Round step (1, 2, 5 × 10^n) so the axis has about `count` intervals. */
function niceStep(span: number, count: number): number {
  const raw = span / count || 1;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / pow;
  const nice = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10;
  return nice * pow;
}

/** Axis ticks covering [min, max] (both inclusive of 0 by the caller). */
function niceTicks(min: number, max: number, count = 4, integer = false): number[] {
  let step = niceStep(max - min, count);
  if (integer) step = Math.max(1, Math.round(step));
  const lo = Math.floor(min / step) * step;
  const hi = Math.max(Math.ceil(max / step) * step, lo + step);
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toFixed(10)));
  return ticks;
}

const pctOf = (v: number, lo: number, hi: number) => ((v - lo) / (hi - lo)) * 100;

function YAxisGrid({ ticks, format }: { ticks: number[]; format: (v: number) => string }) {
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  return (
    <>
      {ticks.map((t) => (
        <div
          key={t}
          aria-hidden="true"
          className="absolute inset-x-0 border-t border-zinc-200 dark:border-zinc-700"
          style={{ bottom: `${pctOf(t, lo, hi)}%` }}
        >
          <span className="absolute -left-1 -translate-x-full -translate-y-1/2 text-xs tabular-nums text-zinc-500">
            {format(t)}
          </span>
        </div>
      ))}
    </>
  );
}

export interface StackedColumn {
  /** Lines of the x-axis label. */
  label: string[];
  pass: number;
  fail: number;
  /** Tooltip text. */
  title?: string;
}

/** Vertical stacked pass/fail columns (count of indicators per group). */
export function StackedColumnChart({
  columns,
  yTitle,
  ariaLabel,
}: {
  columns: StackedColumn[];
  yTitle: string;
  ariaLabel: string;
}) {
  const maxTotal = Math.max(1, ...columns.map((c) => c.pass + c.fail));
  const ticks = niceTicks(0, maxTotal, 4, true);
  const hi = ticks[ticks.length - 1];

  return (
    <figure role="img" aria-label={ariaLabel} className="space-y-2">
      <div className="flex flex-wrap gap-3">
        <LegendItem colorClass="bg-emerald-600" label="ผ่านเกณฑ์ (ข้อ)" />
        <LegendItem colorClass="bg-red-600" label="ไม่ผ่านเกณฑ์ (ข้อ)" />
      </div>
      <p className="text-xs text-zinc-500">{yTitle}</p>
      <div className="relative ml-7 h-52">
        <YAxisGrid ticks={ticks} format={(v) => countFormat.format(v)} />
        <div className="absolute inset-0 flex items-end justify-around gap-2 px-1">
          {columns.map((c) => (
            <div
              key={c.label.join(" ")}
              title={c.title}
              className="flex h-full w-full max-w-16 flex-col justify-end"
            >
              {c.fail > 0 && (
                <div
                  className="flex items-start justify-center rounded-t-md bg-red-600 text-xs font-semibold text-white"
                  style={{ height: `${(c.fail / hi) * 100}%` }}
                >
                  {c.fail}
                </div>
              )}
              {c.pass > 0 && (
                <div
                  className={`flex items-start justify-center bg-emerald-600 text-xs font-semibold text-white ${c.fail > 0 ? "" : "rounded-t-md"}`}
                  style={{ height: `${(c.pass / hi) * 100}%` }}
                >
                  {c.pass}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="ml-7 flex justify-around gap-2 px-1">
        {columns.map((c) => (
          <p key={c.label.join(" ")} className="w-full max-w-24 text-center text-xs leading-4 text-zinc-700 dark:text-zinc-300">
            {c.label.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </p>
        ))}
      </div>
    </figure>
  );
}

export interface StackedRow {
  label: string;
  /** Full label for the tooltip when `label` is truncated. */
  fullLabel?: string;
  pass: number;
  fail: number;
}

/** Horizontal stacked pass/fail bars (e.g. per owner). */
export function StackedBarList({ rows, ariaLabel }: { rows: StackedRow[]; ariaLabel: string }) {
  const max = Math.max(1, ...rows.map((r) => r.pass + r.fail));
  return (
    <figure role="img" aria-label={ariaLabel} className="space-y-2">
      <div className="flex flex-wrap gap-3">
        <LegendItem colorClass="bg-emerald-600" label="ผ่าน" />
        <LegendItem colorClass="bg-red-600" label="ไม่ผ่าน" />
      </div>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li
            key={r.fullLabel ?? r.label}
            title={`${r.fullLabel ?? r.label}: ผ่าน ${r.pass} / ไม่ผ่าน ${r.fail}`}
            className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-2 sm:grid-cols-[minmax(0,12rem)_1fr]"
          >
            <span className="truncate text-xs text-zinc-700 dark:text-zinc-300">{r.label}</span>
            <span className="flex h-5 items-center gap-1.5">
              <span className="flex h-full overflow-hidden rounded" style={{ width: `${((r.pass + r.fail) / max) * 85}%` }}>
                {r.pass > 0 && (
                  <span className="h-full bg-emerald-600" style={{ width: `${(r.pass / (r.pass + r.fail)) * 100}%` }} />
                )}
                {r.fail > 0 && <span className="h-full flex-1 bg-red-600" />}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
                <span className="text-emerald-700 dark:text-emerald-300">{r.pass}</span>
                {" / "}
                <span className="text-red-700 dark:text-red-300">{r.fail}</span>
              </span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/**
 * Vertical value columns with an optional dashed amber target line.
 * Null values render as an empty slot ("—"); negatives grow downward.
 */
export function ColumnChart({
  labels,
  values,
  barClass,
  seriesLabel,
  target,
  targetLabel,
  ariaLabel,
}: {
  labels: string[];
  values: (number | null)[];
  barClass: string;
  seriesLabel: string;
  target?: number | null;
  targetLabel?: string;
  ariaLabel: string;
}) {
  const nums = values.filter((v): v is number => v !== null);
  const hasTarget = target !== null && target !== undefined;
  const all = hasTarget ? [...nums, target] : nums;
  const ticks = niceTicks(Math.min(0, ...all), Math.max(0, ...all, nums.length ? 0 : 1));
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const zero = pctOf(0, lo, hi);
  const tickFormat = (v: number) => valueFormat.format(v);

  return (
    <figure role="img" aria-label={ariaLabel} className="space-y-2">
      <div className="flex flex-wrap gap-3">
        <LegendItem colorClass={barClass} label={seriesLabel} />
        {hasTarget && targetLabel && (
          <LegendItem colorClass="border-amber-600" label={targetLabel} dashed />
        )}
      </div>
      <div className="relative ml-10 h-52">
        <YAxisGrid ticks={ticks} format={tickFormat} />
        <div className="absolute inset-0 flex justify-around gap-2 px-1">
          {values.map((v, i) => (
            <div key={labels[i]} className="relative h-full w-full max-w-16">
              {v === null ? (
                <span className="absolute inset-x-0 text-center text-xs text-zinc-400" style={{ bottom: `${zero}%` }}>
                  —
                </span>
              ) : (
                <div
                  className={`absolute inset-x-0 ${barClass} ${v >= 0 ? "rounded-t-md" : "rounded-b-md"}`}
                  style={
                    v >= 0
                      ? { bottom: `${zero}%`, height: `${pctOf(v, lo, hi) - zero}%` }
                      : { top: `${100 - zero}%`, height: `${zero - pctOf(v, lo, hi)}%` }
                  }
                >
                  <span
                    className={`absolute inset-x-0 text-center text-xs font-semibold tabular-nums text-zinc-800 dark:text-zinc-200 ${v >= 0 ? "-top-4" : "-bottom-4"}`}
                  >
                    {tickFormat(v)}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
        {hasTarget && (
          <div
            aria-hidden="true"
            className="absolute inset-x-0 border-t-2 border-dashed border-amber-600"
            style={{ bottom: `${pctOf(target, lo, hi)}%` }}
          />
        )}
      </div>
      <div className="ml-10 flex justify-around gap-2 px-1">
        {labels.map((l) => (
          <p key={l} className="w-full max-w-20 text-center text-xs leading-4 text-zinc-700 dark:text-zinc-300">
            {l}
          </p>
        ))}
      </div>
    </figure>
  );
}

const QUARTER_AXIS_LABELS = ["ไตรมาส 1 (Q1)", "ไตรมาส 2 (Q2)", "ไตรมาส 3 (Q3)", "ไตรมาส 4 (Q4)"];

/** Q1–Q4 results of one KPI (emerald = pass, red = fail) with its target line. */
export function KpiQuarterChart({ kpi, year }: { kpi: Kpi; year: string }) {
  const series = kpi.q.map(parseNum);
  const target = parseTargetLine(kpi.target, series);
  return (
    <ColumnChart
      labels={QUARTER_AXIS_LABELS}
      values={series}
      barClass={kpi.status === 1 ? "bg-emerald-600/80" : "bg-red-600/80"}
      seriesLabel={`ผลงานรายไตรมาส (ปี ${year})`}
      target={target}
      targetLabel={`ค่าเป้าหมาย (${fmtTarget(kpi.target, kpi.q)})`}
      ariaLabel={`กราฟผลงานรายไตรมาสของ ${kpi.code}`}
    />
  );
}
