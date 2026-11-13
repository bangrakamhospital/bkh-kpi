import "server-only";

import type { RowDataPacket } from "mysql2";
import { cacheLife, cacheTag, io } from "next/cache";

import { HisQueryError, query } from "@/lib/db/his";
import { fiscalYearRange, todayIsoDate } from "@/lib/kpi/fiscal-year";
import { PPBASIC_RATES } from "@/lib/kpi/ppbasic-rates";
import type {
  PpBasicCode,
  PpBasicItem,
  PpBasicMoney,
  PpBasicSummary,
  PpBasicVillageRow,
} from "@/lib/kpi/ppbasic-types";
import type { PpBasicVillageSql } from "@/lib/kpi/sql/ppbasic-common";
import { PPBASIC_CHILD_SQL } from "@/lib/kpi/sql/ppbasic-child-hosxp";
import { PPBASIC_DENTAL_ELDERLY_SQL } from "@/lib/kpi/sql/ppbasic-dental-elderly-hosxp";
import type { ScreeningSqlContext } from "@/lib/kpi/sql/screening-common";

/**
 * "P&P Basic Services" (/pp/basic) — coverage (target vs done, persons) of
 * 6 NHSO basic P&P services in the catchment, HOSxP only, aggregates only.
 * Definitions: docs/kpi/pp-basic-services.md (index) ->
 * docs/kpi/pp-basic-child.md (items 1-3), docs/kpi/pp-basic-dental-elderly.md
 * (items 4-6). SQL: ./sql/ppbasic-*.ts.
 *
 * Date rule (one rule for all 6 items):
 *   periodStart = 1 Oct of the fiscal year (age reference)
 *   countFrom   = periodStart (services counted from 1 Oct)
 *   dataAsOf    = 30 Sep when the year is closed, otherwise today
 *                 (Asia/Bangkok), inclusive.
 * Effect for the running year:
 *   - CHILD_DEV / EPI targets are milestone cohorts (reaches 9/18/30/42/60
 *     months, or turns 1/2/3/5 years, in [periodStart, dataAsOf]), so they
 *     hold only the children already due so far. EPI ป.6 is a school-class
 *     birth window and is in the target from 1 Oct (dT given Feb–Mar).
 *   - CHILD_GROWTH target = age 0-12 on 1 Oct + born up to dataAsOf.
 *   - FLUORIDE / SEALANT / ELDERLY_DEPRESSION: age on 1 Oct, whole-year
 *     target; dataAsOf only ends the counted services.
 * PPFS (./ppfs.ts) instead passes dataAsOf = 30 Sep for every year (its
 * targets are whole-year baht targets).
 *
 * Money (item.money, summary.moneyTotals): rate table ./ppbasic-rates.ts
 * (basis "nhso" = real NHSO rate, "reference" = hospital reference value,
 * "unset" = no baht). Units = persons (target / done), except items with a
 * money query (sql.money; EPI: vaccine doses, toDoseUnits() below and
 * EPI_MONEY in ./sql/ppbasic-child-hosxp.ts). Totals are kept per basis
 * and never mixed.
 */

export const PPBASIC_CACHE_TAG = "kpi:ppbasic";

type PpBasicItemDef = Pick<
  PpBasicItem,
  "code" | "order" | "name" | "group" | "condition" | "unit" | "caveat"
> & {
  sql: PpBasicVillageSql;
  /** Thai unit of the money units when the SQL has a money query (sql.money). */
  moneyUnits?: string;
};

/** Display texts from the SQL authors' docs, trimmed for a table cell. */
export const PPBASIC_ITEMS: readonly PpBasicItemDef[] = [
  {
    code: "CHILD_DEV",
    order: 1,
    name: "ตรวจพัฒนาการ (DSPM)",
    group: "เด็กอายุ 0-5 ปี",
    condition:
      "เป้าหมาย = เด็กที่อายุครบ 9, 18, 30, 42 หรือ 60 เดือนในปีงบฯ · ทำแล้ว = ได้ตรวจ DSPM ตอนอายุนั้น",
    unit: "คน",
    caveat: null,
    sql: PPBASIC_CHILD_SQL.CHILD_DEV,
  },
  {
    code: "CHILD_GROWTH",
    order: 2,
    name: "ชั่งน้ำหนัก วัดส่วนสูง",
    group: "เด็กอายุ 0-12 ปี",
    condition:
      "เป้าหมาย = เด็กอายุ 0-12 ปี ณ 1 ต.ค. รวมเด็กเกิดในปีงบฯ · ทำแล้ว = มีทั้งน้ำหนักและส่วนสูงอย่างน้อย 1 ครั้งในปีงบฯ",
    unit: "คน",
    caveat:
      "นับเฉพาะข้อมูลที่ส่งออกแฟ้ม NUTRITION (คลินิกเด็กดี, EPI, อนามัยโรงเรียน) ไม่นับน้ำหนัก/ส่วนสูงที่ลงใน OPD",
    sql: PPBASIC_CHILD_SQL.CHILD_GROWTH,
  },
  {
    code: "EPI",
    order: 3,
    name: "วัคซีนพื้นฐาน",
    group: "แรกเกิด - ป.6",
    condition:
      "เป้าหมาย = เด็กที่ครบ 1, 2, 3 หรือ 5 ปีในปีงบฯ และชั้น ป.6 · ทำแล้ว = ได้วัคซีนครบตามช่วงอายุ",
    unit: "คน",
    caveat:
      "ป.6 คิดจากช่วงวันเกิด (ไม่ใช่ชั้นเรียนจริง) และอยู่ในเป้าตั้งแต่ต้นปี แต่ฉีด dT ช่วง ก.พ.-มี.ค.",
    sql: PPBASIC_CHILD_SQL.EPI,
    moneyUnits: "เข็ม",
  },
  {
    code: "FLUORIDE",
    order: 4,
    name: "เคลือบฟลูออไรด์",
    group: "เด็กอายุ 4-12 ปี",
    condition:
      "เป้าหมาย = เด็กอายุ 4-12 ปี ณ 1 ต.ค. · ทำแล้ว = เคลือบ/ทาฟลูออไรด์อย่างน้อย 1 ครั้งในปีงบฯ",
    unit: "คน",
    caveat:
      "HOSxP ไม่มีข้อมูลกลุ่มเสี่ยงฟันผุ จึงใช้เด็กทุกคนเป็นเป้า (สปสช. จ่ายเฉพาะกลุ่มเสี่ยง)",
    sql: PPBASIC_DENTAL_ELDERLY_SQL.FLUORIDE,
  },
  {
    code: "SEALANT",
    order: 5,
    name: "เคลือบหลุมร่องฟัน",
    group: "เด็กอายุ 6-12 ปี",
    condition:
      "เป้าหมาย = เด็กอายุ 6-12 ปี ณ 1 ต.ค. · ทำแล้ว = เคลือบหลุมร่องฟันแท้อย่างน้อย 1 ซี่ในปีงบฯ",
    unit: "คน",
    caveat: "เป้าไม่ได้ตัดเด็กที่เคยเคลือบแล้วในปีก่อน ร้อยละรายปีจึงต่ำกว่าความครอบคลุมสะสม",
    sql: PPBASIC_DENTAL_ELDERLY_SQL.SEALANT,
  },
  {
    code: "ELDERLY_DEPRESSION",
    order: 6,
    name: "คัดกรองซึมเศร้า",
    group: "ผู้สูงอายุ 60 ปีขึ้นไป",
    condition:
      "เป้าหมาย = ผู้สูงอายุ 60 ปีขึ้นไป ณ 1 ต.ค. · ทำแล้ว = คัดกรอง 2Q/9Q อย่างน้อย 1 ครั้งในปีงบฯ",
    unit: "คน",
    caveat:
      "รวมแบบฟอร์ม 2Q/9Q ของ HOSxP ด้วย จึงสูงกว่าตัวเลข HDC ที่นับเฉพาะรหัส SPECIALPP",
    sql: PPBASIC_DENTAL_ELDERLY_SQL.ELDERLY_DEPRESSION,
  },
];

/**
 * Rendering contract (Cache Components), same as getPpfsSummary:
 * `await io()` first so nothing runs during prerender; render the caller
 * inside <Suspense>. Cached per fiscal year (+ dataAsOf, so the running
 * year gets a new entry each day): "hours" for the running year, "days"
 * once it has ended, "minutes" when an item failed. Invalidate with
 * revalidateTag(PPBASIC_CACHE_TAG). Throws when every item query failed.
 */
export async function getPpBasicSummary(
  fiscalYear: number,
): Promise<PpBasicSummary> {
  await io();
  const today = todayIsoDate();
  const range = fiscalYearRange(fiscalYear);
  const closed = today > range.end;
  return loadPpBasicSummary(fiscalYear, closed, closed ? range.end : today);
}

// --- rows -------------------------------------------------------------------

interface VillageRow extends RowDataPacket {
  village_id: number | string | null;
  village_moo: string | null;
  village_name: string | null;
  eligible: number | string;
  numerator: number | string;
}

/** One row of sql.money (see PpBasicMoneySql / EPI_MONEY). */
interface MoneyRow extends RowDataPacket {
  due_units: number | string | null;
  done_units: number | string | null;
  catchment_done_units: number | string | null;
  catchment_birth_units: number | string | null;
}

/** Dose units of an item with sql.money (EPI), see PpBasicMoney. */
type DoseUnits = Required<
  Pick<
    PpBasicMoney,
    | "targetUnits"
    | "doneUnits"
    | "catchmentDueUnits"
    | "catchmentDoneUnits"
    | "catchmentBirthUnits"
    | "outOfAreaUnits"
  >
>;

const num = (v: number | string | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const emptyToNull = (s: string | null): string | null =>
  s === null || s.trim() === "" ? null : s.trim();

const toDisplay = (def: PpBasicItemDef) => ({
  code: def.code,
  order: def.order,
  name: def.name,
  group: def.group,
  condition: def.condition,
  unit: def.unit,
  caveat: def.caveat,
});

/**
 * EPI dose units. done = every UC EPI dose given here (all areas). The gap
 * compares the catchment with itself on the same schedule: doses due vs
 * scheduled doses given (catchment done minus birth doses); out-of-area
 * and birth doses have no schedule here, so they are their own target.
 * target = done + gap, so target >= done and the gap is never negative.
 */
function toDoseUnits(row: MoneyRow | undefined): DoseUnits {
  const due = num(row?.due_units);
  const done = num(row?.done_units);
  const catchmentAll = Math.min(num(row?.catchment_done_units), done);
  const birth = Math.min(num(row?.catchment_birth_units), catchmentAll);
  const scheduledDone = catchmentAll - birth;
  return {
    targetUnits: done + Math.max(0, due - scheduledDone),
    doneUnits: done,
    catchmentDueUnits: due,
    catchmentDoneUnits: scheduledDone,
    catchmentBirthUnits: birth,
    outOfAreaUnits: done - catchmentAll,
  };
}

async function loadItem(
  def: PpBasicItemDef,
  ctx: ScreeningSqlContext,
): Promise<PpBasicItem> {
  const money = def.sql.money;
  const [rows, moneyRows] = await Promise.all([
    query<VillageRow>(def.sql.village, def.sql.buildParams(ctx)),
    money ? query<MoneyRow>(money.sql, money.buildParams(ctx)) : null,
  ]);
  const villages: PpBasicVillageRow[] = rows.map((r) => ({
    villageId: num(r.village_id),
    moo: emptyToNull(r.village_moo),
    villageName: emptyToNull(r.village_name),
    target: num(r.eligible),
    done: num(r.numerator),
  }));
  villages.sort(
    (a, b) =>
      (Number(a.moo) || Number.MAX_SAFE_INTEGER) -
        (Number(b.moo) || Number.MAX_SAFE_INTEGER) || a.villageId - b.villageId,
  );
  let target = 0;
  let done = 0;
  for (const v of villages) {
    target += v.target;
    done += v.done;
  }
  const units: DoseUnits | { targetUnits: number; doneUnits: number } = moneyRows
    ? toDoseUnits(moneyRows[0])
    : { targetUnits: target, doneUnits: done };
  return {
    ...toDisplay(def),
    target,
    done,
    percent: target > 0 ? (done / target) * 100 : 0,
    villages,
    money: buildMoney(def, units),
  };
}

function buildMoney(
  def: PpBasicItemDef,
  units: DoseUnits | { targetUnits: number; doneUnits: number },
): PpBasicMoney {
  const r = PPBASIC_RATES[def.code];
  const base = {
    basis: r.basis,
    rate: r.rate,
    rateUnit: r.rateUnit,
    rateNote: r.rateNote,
    ...units,
    units: def.sql.money ? (def.moneyUnits ?? def.unit) : def.unit,
  };
  if (r.basis === "unset") {
    return { ...base, targetBaht: null, earnedBaht: null, gapBaht: null };
  }
  const targetBaht = units.targetUnits * r.rate;
  const earnedBaht = units.doneUnits * r.rate;
  return {
    ...base,
    targetBaht,
    earnedBaht,
    gapBaht: Math.max(0, targetBaht - earnedBaht),
  };
}

function moneyTotals(items: readonly PpBasicItem[]): PpBasicSummary["moneyTotals"] {
  const totals: PpBasicSummary["moneyTotals"] = {
    nhso: { targetBaht: 0, earnedBaht: 0, gapBaht: 0 },
    reference: { targetBaht: 0, earnedBaht: 0, gapBaht: 0 },
  };
  for (const it of items) {
    const m = it.money;
    if (it.error !== undefined || m === null || m.basis === "unset") continue;
    const t = totals[m.basis];
    t.targetBaht += m.targetBaht ?? 0;
    t.earnedBaht += m.earnedBaht ?? 0;
    t.gapBaht += m.gapBaht ?? 0;
  }
  return totals;
}

function failedItem(def: PpBasicItemDef): PpBasicItem {
  return {
    ...toDisplay(def),
    target: 0,
    done: 0,
    percent: 0,
    villages: [],
    money: null,
    error: "ไม่สามารถดึงข้อมูลรายการนี้ได้",
  };
}

function logItemError(code: PpBasicCode, err: unknown): void {
  const name = err instanceof Error ? err.name : "UnknownError";
  const driverCode = err instanceof HisQueryError ? (err.code ?? "") : "";
  console.error(
    `[kpi/ppbasic] item ${code} failed: ${name}${driverCode ? ` (${driverCode})` : ""}`,
  );
}

async function loadPpBasicSummary(
  fiscalYear: number,
  closed: boolean,
  dataAsOf: string,
): Promise<PpBasicSummary> {
  "use cache";
  cacheTag(PPBASIC_CACHE_TAG);

  const range = fiscalYearRange(fiscalYear);
  const ctx: ScreeningSqlContext = {
    periodStart: range.start,
    countFrom: range.start,
    dataAsOf,
  };

  // ELDERLY_DEPRESSION ~2 s dominates; the rest (EPI included) < 0.6 s.
  const settled = await Promise.allSettled(
    PPBASIC_ITEMS.map((def) => loadItem(def, ctx)),
  );
  const items = PPBASIC_ITEMS.map((def, i) => {
    const s = settled[i];
    if (s.status === "fulfilled") return s.value;
    logItemError(def.code, s.reason);
    return failedItem(def);
  });

  const failed = items.filter((it) => it.error !== undefined).length;
  if (failed === items.length) {
    throw new Error("all P&P basic item queries failed");
  }

  // Exactly one cacheLife call per invocation (see cacheLife docs).
  if (failed > 0) {
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
    moneyTotals: moneyTotals(items),
    updatedAt: new Date().toISOString(),
  };
}
