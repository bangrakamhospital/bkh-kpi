import "server-only";

import type { RowDataPacket } from "mysql2";
import { cacheLife, cacheTag, io } from "next/cache";

import { query } from "@/lib/db/his";
import { F43_FILES, type F43FileDef } from "@/lib/kpi/f43-registry";
import type {
  F43CheckResult,
  F43Counts,
  F43FileResult,
  F43FileStatus,
  F43Group,
  F43Range,
  F43Report,
  F43StaffRow,
  F43UnitOption,
  F43UnitRow,
} from "@/lib/kpi/f43-types";
import { todayIsoDate } from "@/lib/kpi/fiscal-year";
import { addDays } from "@/lib/kpi/overview-range";
import { type Num, num } from "@/lib/kpi/ppfs-common";
import { F43_QUERIES, F43_STAFF_SQL, F43_UNITS_SQL } from "@/lib/kpi/sql/f43-hosxp";

/**
 * "ตรวจ 43 แฟ้ม" (/f43) — HOSxP data checks before the HDC 43/52-file and
 * FDH OP exports, for a date range (at most F43_MAX_RANGE_DAYS) and a
 * service unit (ovst.main_dep). HOSxP only (never HDC).
 * Check definitions: ./f43-registry.ts; SQL: ./sql/f43-hosxp.ts.
 * Aggregates only; recorder names are staff (opduser / doctor), never
 * patients.
 *
 * District รพ.สต. use their own HOSxP PCU databases (their data reach this
 * project only through HDC): they are not in this HIS and not checked
 * here. The hospital's own PCU points are main_dep departments of HOSxP.
 */

export const F43_CACHE_TAG = "kpi:f43";

export const IPD_UNIT = "IPD";
export const ALL_UNITS = "*";

interface CheckRow extends RowDataPacket {
  dep: string | null;
  rec: string | null;
  total: Num;
  [col: string]: unknown;
}

interface RawRow {
  dep: string;
  rec: string;
  total: number;
  c: Record<string, number>;
}

interface F43Raw {
  rows: Record<string, RawRow[]>;
  unitNames: Record<string, string>;
  staffNames: Record<string, string>;
  updatedAt: string;
}

/**
 * Raw aggregate rows of a date range, cached per (from, to): "minutes"
 * when the range ends within the last 45 days (staff fix data and
 * re-check), "hours" for older ranges. All queries must succeed (a
 * failure throws; nothing partial is cached).
 */
async function getF43Raw(range: F43Range): Promise<F43Raw> {
  await io();
  const recent = range.to >= addDays(todayIsoDate(), -45);
  return loadF43Raw(range.from, range.to, recent);
}

async function loadF43Raw(from: string, to: string, recent: boolean): Promise<F43Raw> {
  "use cache";
  cacheTag(F43_CACHE_TAG);

  const params = { start: from, end: addDays(to, 1) };
  const [results, units, staff] = await Promise.all([
    Promise.all(F43_QUERIES.map((q) => query<CheckRow>(q.sql, params))),
    query<RowDataPacket & { code: string; name: string | null }>(F43_UNITS_SQL),
    query<RowDataPacket & { rec: string; name: string | null }>(F43_STAFF_SQL),
  ]);

  const rows: Record<string, RawRow[]> = {};
  const usedRecs = new Set<string>();
  F43_QUERIES.forEach((q, i) => {
    rows[q.key] = results[i].map((r) => {
      const c: Record<string, number> = {};
      for (const id of q.checkIds) c[id] = num(r[`c_${id}`] as Num);
      const rec = r.rec ?? "";
      if (rec) usedRecs.add(rec);
      return { dep: r.dep ?? "", rec, total: num(r.total), c };
    });
  });

  const unitNames: Record<string, string> = {};
  for (const u of units) if (u.code) unitNames[u.code] = u.name ?? u.code;
  const staffNames: Record<string, string> = {};
  for (const s of staff) {
    if (usedRecs.has(s.rec) && s.name && !(s.rec in staffNames)) staffNames[s.rec] = s.name;
  }

  if (recent) {
    cacheLife("minutes");
  } else {
    cacheLife("hours");
  }
  return { rows, unitNames, staffNames, updatedAt: new Date().toISOString() };
}

const isChecked = (def: F43FileDef): def is F43FileDef & { query: string; checks: NonNullable<F43FileDef["checks"]> } =>
  Boolean(def.query && def.checks);

/** Rows of a file that count for `unit`; null = file not applicable to that unit. */
function rowsFor(def: F43FileDef, raw: F43Raw, unit: string): RawRow[] | null {
  const rows = def.query ? (raw.rows[def.query] ?? []) : [];
  switch (def.scope) {
    case "unit":
      return unit === ALL_UNITS ? rows : rows.filter((r) => r.dep === unit);
    case "unit-distinct":
      return rows.filter((r) => (unit === ALL_UNITS ? r.dep === ALL_UNITS : r.dep === unit));
    case "ipd":
      return unit === ALL_UNITS || unit === IPD_UNIT ? rows : null;
    case "hospital":
      return unit === ALL_UNITS ? rows : null;
    default:
      return null;
  }
}

const col = (c: { id: string; sqlId?: string }) => c.sqlId ?? c.id;

/** Error/warn sums of one (file, row). */
function rowFails(def: F43FileDef, r: RawRow): F43Counts {
  let errorFailed = 0;
  let warnFailed = 0;
  for (const c of def.checks ?? []) {
    const n = r.c[col(c)] ?? 0;
    if (c.severity === "error") errorFailed += n;
    else warnFailed += n;
  }
  return { errorFailed, warnFailed };
}

function fileResult(def: F43FileDef, raw: F43Raw, unit: string): F43FileResult {
  const base = {
    code: def.code,
    label: def.label ?? def.code,
    group: def.group,
    name: def.name,
    note: def.note,
    scope: def.scope,
    unitLabel: def.unitLabel,
  };
  if (!isChecked(def)) {
    return { ...base, status: "unsupported", total: null, errorFailed: 0, warnFailed: 0, checks: [] };
  }
  const rows = rowsFor(def, raw, unit);
  const total = rows ? rows.reduce((s, r) => s + r.total, 0) : null;
  const checks: F43CheckResult[] = def.checks.map((c) => ({
    id: c.id,
    label: c.label,
    severity: c.severity,
    what: c.what,
    fix: c.fix,
    failed: rows ? rows.reduce((s, r) => s + (r.c[col(c)] ?? 0), 0) : 0,
  }));
  const rank = (c: F43CheckResult) => (c.failed === 0 ? 2 : c.severity === "error" ? 0 : 1);
  checks.sort((a, b) => rank(a) - rank(b) || b.failed - a.failed);
  const errorFailed = checks.filter((c) => c.severity === "error").reduce((s, c) => s + c.failed, 0);
  const warnFailed = checks.filter((c) => c.severity === "warn").reduce((s, c) => s + c.failed, 0);
  const status: F43FileStatus =
    total === null ? "na" : total === 0 ? "empty" : errorFailed > 0 ? "error" : warnFailed > 0 ? "warn" : "pass";
  return { ...base, status, total, errorFailed, warnFailed, checks };
}

function unitName(raw: F43Raw, code: string): string {
  if (code === ALL_UNITS) return "ทุกหน่วยบริการ";
  if (code === IPD_UNIT) return "ผู้ป่วยใน (IPD ทุกหอ)";
  if (code === "") return "ไม่ระบุหน่วยบริการ";
  return raw.unitNames[code] ?? `หน่วย ${code}`;
}

const isPcuName = (name: string) => /PCU|รพ\.?สต|ศสม/i.test(name);

const zero = (): F43Counts => ({ errorFailed: 0, warnFailed: 0 });

/** Unit comparison over `defs` (each def adds to its group's counts). */
function unitRows(raw: F43Raw, defs: readonly F43FileDef[]): F43UnitRow[] {
  const acc = new Map<string, Record<F43Group, F43Counts>>();
  for (const def of defs) {
    if (!isChecked(def)) continue;
    if (def.scope === "hospital") continue;
    for (const r of raw.rows[def.query] ?? []) {
      if (r.dep === ALL_UNITS) continue;
      const dep = def.scope === "ipd" ? IPD_UNIT : r.dep;
      let a = acc.get(dep);
      if (!a) {
        a = { hdc: zero(), fdh: zero() };
        acc.set(dep, a);
      }
      const f = rowFails(def, r);
      a[def.group].errorFailed += f.errorFailed;
      a[def.group].warnFailed += f.warnFailed;
    }
  }
  return [...acc.entries()]
    .map(([code, a]) => {
      const name = unitName(raw, code);
      return { code, name, isPcu: isPcuName(name), hdc: a.hdc, fdh: a.fdh };
    })
    .sort(
      (x, y) =>
        y.hdc.errorFailed + y.fdh.errorFailed - (x.hdc.errorFailed + x.fdh.errorFailed) ||
        y.hdc.warnFailed + y.fdh.warnFailed - (x.hdc.warnFailed + x.fdh.warnFailed) ||
        x.code.localeCompare(y.code),
    );
}

const MAX_STAFF_ROWS = 30;

function staffRows(raw: F43Raw, unit: string, defs: readonly F43FileDef[]): F43StaffRow[] {
  const acc = new Map<string, F43Counts & { files: Map<string, number> }>();
  for (const def of defs) {
    if (!isChecked(def)) continue;
    for (const r of rowsFor(def, raw, unit) ?? []) {
      if (!r.rec) continue;
      const f = rowFails(def, r);
      if (f.errorFailed + f.warnFailed === 0) continue;
      let a = acc.get(r.rec);
      if (!a) {
        a = { ...zero(), files: new Map() };
        acc.set(r.rec, a);
      }
      a.errorFailed += f.errorFailed;
      a.warnFailed += f.warnFailed;
      const label = def.label ?? def.code;
      a.files.set(label, (a.files.get(label) ?? 0) + f.errorFailed + f.warnFailed);
    }
  }
  return [...acc.entries()]
    .map(([rec, a]) => {
      const login = rec.slice(2);
      return {
        name: raw.staffNames[rec] ?? (login || "ไม่ระบุผู้บันทึก"),
        role: rec.startsWith("d:") ? "ผู้ให้บริการ" : "ผู้ใช้ HOSxP",
        errorFailed: a.errorFailed,
        warnFailed: a.warnFailed,
        top: [...a.files.entries()]
          .sort((x, y) => y[1] - x[1])
          .slice(0, 3)
          .map(([code, n]) => `${code} ${n.toLocaleString("th-TH")}`),
      };
    })
    .sort((x, y) => y.errorFailed - x.errorFailed || y.warnFailed - x.warnFailed)
    .slice(0, MAX_STAFF_ROWS);
}

function groupTotals(files: readonly F43FileResult[], group: F43Group) {
  const g = files.filter((f) => f.group === group);
  const errorFailed = g.reduce((s, f) => s + f.errorFailed, 0);
  const warnFailed = g.reduce((s, f) => s + f.warnFailed, 0);
  return { errorFailed, warnFailed, ready: errorFailed === 0 };
}

/**
 * Report of a validated range (./f43-range.ts), one unit ("*" = all;
 * unknown codes fall back to "*") and one file (unknown / absent =
 * overview). Rendering contract like the other loaders: call inside
 * <Suspense>.
 */
export async function getF43Report(
  range: F43Range,
  unitParam: string,
  fileParam: string | null,
): Promise<F43Report> {
  const raw = await getF43Raw(range);
  const allUnits = unitRows(raw, F43_FILES);
  const unit = allUnits.some((u) => u.code === unitParam) ? unitParam : ALL_UNITS;
  const fileDef = F43_FILES.find((f) => f.code === fileParam) ?? null;

  const files = F43_FILES.map((def) => fileResult(def, raw, unit));
  const hdcDefs = F43_FILES.filter((f) => f.group === "hdc");

  const units: F43UnitOption[] = [
    { code: ALL_UNITS, name: unitName(raw, ALL_UNITS), isPcu: false },
    ...allUnits
      .map(({ code, name, isPcu }) => ({ code, name, isPcu }))
      .sort((a, b) => Number(b.isPcu) - Number(a.isPcu) || a.name.localeCompare(b.name, "th")),
  ];

  return {
    range,
    unit,
    unitName: unitName(raw, unit),
    units,
    file: fileDef?.code ?? null,
    files,
    hdc: groupTotals(files, "hdc"),
    fdh: groupTotals(files, "fdh"),
    unitRows: fileDef ? unitRows(raw, [fileDef]) : allUnits,
    staffRows: staffRows(raw, unit, fileDef ? [fileDef] : hdcDefs),
    updatedAt: raw.updatedAt,
  };
}
