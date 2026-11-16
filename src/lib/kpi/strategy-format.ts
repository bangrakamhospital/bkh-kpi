/**
 * Formatting / parsing helpers for the strategy & HA dataset.
 * Logic mirrors the original standalone dashboard.
 */
import type { Cell, HaItem } from "@/lib/kpi/strategy-types";

const NON_NUMERIC = new Set(["NA", "N/A", "-", "ผ่าน", "ไม่ผ่าน", "ไม่พบ"]);
const cellFormat = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 });

/** Typo in the source sheet ("ุ60%"). */
function cleanTarget(target: string): string {
  return target.replace("ุ60%", "60%");
}

/**
 * Numeric value of a cell for charting, or null. Ratios ("44/267"),
 * times ("1:30") and status words are not plotted; a leading number with
 * a note ("0.38 (8 ราย)") is.
 */
export function parseNum(v: Cell | null): number | null {
  if (typeof v === "number") return v;
  if (v === null) return null;
  const s = v.trim();
  if (!s || NON_NUMERIC.has(s)) return null;
  if (/^\d[\d,]*\s*\/\s*\d/.test(s) || s.includes(":")) return null;
  const m = s.replace(/,/g, "").match(/^-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

/** Display text of a cell: "—" for empty, numbers in th-TH (max 2 decimals). */
export function fmtCell(v: Cell | null): string {
  if (v === "" || v === null) return "—";
  if (typeof v === "number") return cellFormat.format(v);
  return String(v);
}

/**
 * Display text of a target. A decimal target such as "0.8" is shown as
 * "80% (0.8)" when the results are clearly percentages.
 */
export function fmtTarget(target: string, vals: (Cell | null)[]): string {
  if (!target || target === "-") return "—";
  const clean = cleanTarget(String(target)).trim();
  const num = Number(clean);
  if (!Number.isNaN(num) && num > 0 && num <= 1 && !clean.includes("%")) {
    const nums = vals.map(parseNum).filter((n): n is number => n !== null);
    const maxVal = Math.max(...nums, 0);
    if (maxVal > 1.5 && num < 1) return `${(num * 100).toFixed(0)}% (${clean})`;
  }
  return clean;
}

/**
 * Y value of the target line for a chart, or null when the target has no
 * number. Decimal targets are scaled ×100 when the series is in percent.
 */
export function parseTargetLine(target: string, series: (number | null)[]): number | null {
  if (!target) return null;
  const clean = cleanTarget(String(target)).replace(/,/g, "");
  const m = clean.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  let num = parseFloat(m[0]);
  const nums = series.filter((n): n is number => n !== null);
  const maxVal = nums.length ? Math.max(...nums) : 0;
  if (num > 0 && num <= 1 && !clean.includes("%") && maxVal > 2) num *= 100;
  return num;
}

/** True when an HA indicator has a reported 2569 result (not empty / NA). */
export function hasValue2569(item: HaItem): boolean {
  const v = item.years[4];
  return v !== "" && v !== "NA" && v !== "N/A";
}
