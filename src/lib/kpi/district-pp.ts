import "server-only";

import type { RowDataPacket } from "mysql2";
import { cacheLife, cacheTag, io } from "next/cache";

import { hdcQuery } from "@/lib/db/hdc";
import { HisQueryError } from "@/lib/db/read-only-pool";
import { DISTRICT_TAMBONS, HDC_UNIT_HOSPCODES } from "@/lib/kpi/district-areas";
import { DISTRICT_PP_ITEMS } from "@/lib/kpi/district-pp-items";
import type {
  DistrictPpCell,
  DistrictPpItemDef,
  DistrictPpSummary,
  DistrictPpUnitDataAsOf,
  DistrictPpUnitExtra,
  DistrictPpVillage,
} from "@/lib/kpi/district-pp-types";
import { fiscalYearRange, todayIsoDate } from "@/lib/kpi/fiscal-year";
import { hdcDateToIso, type HdcScreeningSqlContext } from "@/lib/kpi/sql/hdc-common";
import {
  DISTRICT_PP_UNIT_LAST_SERVICE_SQL,
  DISTRICT_PP_VILLAGES_SQL,
} from "@/lib/kpi/sql/district-pp-hdc";
import {
  DISTRICT_EPI_NONRESIDENT_SQL,
  DISTRICT_PPBASIC_SQL,
  type DistrictPpBasicCode,
} from "@/lib/kpi/sql/district-ppbasic-hdc";
import { DISTRICT_PPFS_QUERIES } from "@/lib/kpi/sql/district-ppfs-hdc";

/**
 * District PP revenue (/district/pp): PPFS + P&P Basic per village unit
 * (vid × responsible unit), HDC 43 files ONLY. Rules: docs/kpi/district-pp.md.
 *
 * Dates (= hospital pages):
 *   periodStart = countFrom = 1 Oct of the fiscal year
 *   P&P Basic dataAsOf = 30 Sep when closed, else today (Asia/Bangkok);
 *     milestone targets (DSPM, EPI schedule) hold only children due so far
 *   PPFS dataAsOf = 30 Sep always (whole-year baht targets, = ./ppfs.ts);
 *     services after today do not exist, so "done" is still up to today
 *
 * 17 queries (8 PPFS, 6 P&P Basic, EPI non-residents, unit last service,
 * village list), 0.01–4 s each and each rebuilding `residents` (~1.2 s),
 * run DB_CONCURRENCY at a time: the HDC pool has 5 connections
 * (read-only-pool.ts) shared with the other district pages.
 */

export const DISTRICT_PP_CACHE_TAG = "kpi:district-pp";

/**
 * Max parallel HDC queries of one load (pool connectionLimit is 5). The DB
 * server is the bottleneck: FY2569 cold load via db-cli (2026-11-13) took
 * 25 s at 1, 15 s at 2, 17 s at 3 and 5 in parallel.
 */
const DB_CONCURRENCY = 2;

const ITEM_ERROR = "ไม่สามารถดึงข้อมูลรายการนี้ได้";
const EXTRAS_ERROR_NOTE =
  "ดึงข้อมูลวัคซีนเด็กนอกเขตอำเภอไม่สำเร็จ ยอดรวมจึงยังไม่รวมเข็มเหล่านี้";

/**
 * Rendering contract (Cache Components), same as getPpBasicSummary:
 * `await io()` first so nothing runs during prerender; render the caller
 * inside <Suspense>. Cached per (fiscalYear, closed, dataAsOf): "days" once
 * the year has ended, "hours" for the running year, "minutes" when any
 * query failed. Invalidate with revalidateTag(DISTRICT_PP_CACHE_TAG).
 * Throws only when every item query failed.
 */
export async function getDistrictPpSummary(
  fiscalYear: number,
): Promise<DistrictPpSummary> {
  await io();
  const today = todayIsoDate();
  const range = fiscalYearRange(fiscalYear);
  const closed = today > range.end;
  return loadDistrictPpSummary(fiscalYear, closed, closed ? range.end : today);
}

// --- rows ---------------------------------------------------------------------

interface CellRow extends RowDataPacket {
  vid: string;
  hospcode: string;
  code?: string;
  target: number | string | null;
  done: number | string | null;
}

interface VillageRow extends RowDataPacket {
  vid: string;
  hospcode: string;
}

interface UnitDoneRow extends RowDataPacket {
  hospcode: string;
  done: number | string | null;
}

interface LastServiceRow extends RowDataPacket {
  hospcode: string;
  last_date: string | null;
}

const num = (v: number | string | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const villageKey = (vid: string, hospcode: string) => `${vid}:${hospcode}`;

const UNIT_NAME = new Map<string, string>(
  DISTRICT_TAMBONS.flatMap((t) => t.units.map((u) => [u.hospcode, u.name])),
);
const TAMBON_NAME = new Map<string, string>(
  DISTRICT_TAMBONS.map((t) => [t.code, t.name]),
);
const UNIT_SET = new Set(HDC_UNIT_HOSPCODES);

/** Runs `tasks` with at most `limit` in flight; results in input order. */
async function settleLimited<T>(
  tasks: readonly (() => Promise<T>)[],
  limit: number,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await tasks[i]() };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, worker),
  );
  return results;
}

function logError(part: string, err: unknown): void {
  const name = err instanceof Error ? err.name : "UnknownError";
  const driverCode = err instanceof HisQueryError ? (err.code ?? "") : "";
  console.error(
    `[kpi/district-pp] ${part} failed: ${name}${driverCode ? ` (${driverCode})` : ""}`,
  );
}

/** One unit of work: a query and the item codes it fills (none = helper). */
interface Job {
  label: string;
  codes: readonly string[];
  run: () => Promise<RowDataPacket[]>;
}

function toVillage(vid: string, hospcode: string): DistrictPpVillage | null {
  const tambon = vid.slice(0, 6);
  const tambonName = TAMBON_NAME.get(tambon);
  if (!tambonName || !/^\d{8}$/.test(vid)) return null;
  return {
    key: villageKey(vid, hospcode),
    vid,
    tambon,
    tambonName,
    hospcode,
    hospName: UNIT_NAME.get(hospcode) ?? hospcode,
    moo: String(Number(vid.slice(6, 8))),
    villageName: null,
  };
}

async function loadDistrictPpSummary(
  fiscalYear: number,
  closed: boolean,
  dataAsOf: string,
): Promise<DistrictPpSummary> {
  "use cache";
  cacheTag(DISTRICT_PP_CACHE_TAG);

  const range = fiscalYearRange(fiscalYear);
  const basicCtx: HdcScreeningSqlContext = {
    periodStart: range.start,
    countFrom: range.start,
    dataAsOf,
  };
  const ppfsCtx: HdcScreeningSqlContext = { ...basicCtx, dataAsOf: range.end };

  const itemJobs: Job[] = [
    ...DISTRICT_PPFS_QUERIES.map(
      (q): Job => ({
        label: `ppfs ${q.codes.join("+")}`,
        codes: q.codes,
        run: () => hdcQuery<CellRow>(q.sql, q.buildParams(ppfsCtx)),
      }),
    ),
    ...(Object.keys(DISTRICT_PPBASIC_SQL) as DistrictPpBasicCode[]).map(
      (code): Job => {
        const q = DISTRICT_PPBASIC_SQL[code];
        return {
          label: `basic ${code}`,
          codes: [code],
          run: async () =>
            (await hdcQuery<CellRow>(q.sql, q.buildParams(basicCtx))).map(
              (r) => ({ ...r, code }) as CellRow,
            ),
        };
      },
    ),
  ];
  const villagesJob: Job = {
    label: "villages",
    codes: [],
    run: () => hdcQuery<VillageRow>(DISTRICT_PP_VILLAGES_SQL),
  };
  const extrasJob: Job = {
    label: "epi non-residents",
    codes: [],
    run: () =>
      hdcQuery<UnitDoneRow>(
        DISTRICT_EPI_NONRESIDENT_SQL.sql,
        DISTRICT_EPI_NONRESIDENT_SQL.buildParams(basicCtx),
      ),
  };
  const lastServiceJob: Job = {
    label: "unit last service",
    codes: [],
    run: () =>
      hdcQuery<LastServiceRow>(
        DISTRICT_PP_UNIT_LAST_SERVICE_SQL.sql,
        DISTRICT_PP_UNIT_LAST_SERVICE_SQL.buildParams(basicCtx),
      ),
  };

  const jobs = [villagesJob, ...itemJobs, extrasJob, lastServiceJob];
  const settled = await settleLimited(
    jobs.map((j) => j.run),
    DB_CONCURRENCY,
  );
  const resultOf = (job: Job): RowDataPacket[] | null => {
    const s = settled[jobs.indexOf(job)];
    if (s.status === "fulfilled") return s.value;
    logError(job.label, s.reason);
    return null;
  };

  // Items + cells (key -> code -> sum; merged in case a key repeats).
  const failedCodes = new Set<string>();
  const sums = new Map<string, { vid: string; hospcode: string; code: string; target: number; done: number }>();
  for (const job of itemJobs) {
    const rows = resultOf(job) as CellRow[] | null;
    if (!rows) {
      for (const c of job.codes) failedCodes.add(c);
      continue;
    }
    for (const r of rows) {
      const code = r.code ?? "";
      if (!job.codes.includes(code)) continue;
      const k = `${villageKey(r.vid, r.hospcode)}|${code}`;
      const s = sums.get(k);
      if (s) {
        s.target += num(r.target);
        s.done += num(r.done);
      } else {
        sums.set(k, {
          vid: r.vid,
          hospcode: r.hospcode,
          code,
          target: num(r.target),
          done: num(r.done),
        });
      }
    }
  }
  if (failedCodes.size === DISTRICT_PP_ITEMS.length) {
    throw new Error("all district PP item queries failed");
  }

  // Village units: VILLAGE file + any key found only in the cells.
  const villageMap = new Map<string, DistrictPpVillage>();
  const addVillage = (vid: string, hospcode: string) => {
    const k = villageKey(vid, hospcode);
    if (villageMap.has(k)) return;
    const v = toVillage(vid, hospcode);
    if (v) villageMap.set(k, v);
  };
  const villageRows = resultOf(villagesJob) as VillageRow[] | null;
  for (const r of villageRows ?? []) addVillage(r.vid, r.hospcode);
  for (const s of sums.values()) addVillage(s.vid, s.hospcode);
  const villages = [...villageMap.values()].sort(
    (a, b) => a.vid.localeCompare(b.vid) || a.hospcode.localeCompare(b.hospcode),
  );

  const cells: DistrictPpCell[] = [];
  for (const s of sums.values()) {
    const key = villageKey(s.vid, s.hospcode);
    if (!villageMap.has(key)) continue;
    if (s.target === 0 && s.done === 0) continue;
    cells.push({ key, code: s.code, target: s.target, done: s.done });
  }

  // EPI doses to non-resident children, per giving unit.
  const extraRows = failedCodes.has("EPI")
    ? []
    : (resultOf(extrasJob) as UnitDoneRow[] | null);
  const unitExtras: DistrictPpUnitExtra[] = (extraRows ?? [])
    .filter((r) => UNIT_SET.has(r.hospcode) && num(r.done) > 0)
    .map((r) => ({ hospcode: r.hospcode, code: "EPI", done: num(r.done) }));

  const items: DistrictPpItemDef[] = DISTRICT_PP_ITEMS.map((def) => {
    if (failedCodes.has(def.code)) return { ...def, error: ITEM_ERROR };
    if (def.code === "EPI" && extraRows === null) {
      return {
        ...def,
        caveat: def.caveat ? `${def.caveat} · ${EXTRAS_ERROR_NOTE}` : EXTRAS_ERROR_NOTE,
      };
    }
    return { ...def };
  });

  // Last service date per unit.
  const lastRows = resultOf(lastServiceJob) as LastServiceRow[] | null;
  let unitDataAsOf: DistrictPpUnitDataAsOf[] | null = null;
  if (lastRows) {
    const last = new Map(lastRows.map((r) => [r.hospcode, hdcDateToIso(r.last_date)]));
    unitDataAsOf = HDC_UNIT_HOSPCODES.map((hospcode) => ({
      hospcode,
      hospName: UNIT_NAME.get(hospcode) ?? hospcode,
      lastDate: last.get(hospcode) ?? null,
    }));
  }

  const anyFailed =
    failedCodes.size > 0 ||
    villageRows === null ||
    (extraRows === null && !failedCodes.has("EPI")) ||
    lastRows === null;
  // Exactly one cacheLife call per invocation (see cacheLife docs).
  if (anyFailed) {
    cacheLife("minutes");
  } else if (closed) {
    cacheLife("days");
  } else {
    cacheLife("hours");
  }

  return {
    fiscalYear,
    periodStart: range.start,
    periodEnd: range.end,
    dataAsOf,
    closed,
    items,
    villages,
    cells,
    unitExtras,
    unitDataAsOf,
    updatedAt: new Date().toISOString(),
  };
}
