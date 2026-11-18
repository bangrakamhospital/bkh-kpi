import "server-only";

import type { RowDataPacket } from "mysql2";
import { cacheLife, cacheTag, io } from "next/cache";

import { query } from "@/lib/db/his";
import { fiscalYearRange, todayIsoDate } from "@/lib/kpi/fiscal-year";
import type {
  NcdClinicSummary,
  NcdDayRow,
  NcdDiseaseRow,
  NcdHosxpStepCode,
  NcdHosxpStepRow,
  NcdHosxpSteps,
  NcdIndicator,
  NcdLabPanelRow,
  NcdMoney,
  NcdMonthRow,
  NcdPayGroupCode,
  NcdPayGroupRow,
  NcdSchemeCode,
  NcdSchemeRow,
  NcdWaitRow,
  NcdWaitStats,
  NcdWorkload,
} from "@/lib/kpi/ncd-clinic-types";
import { type Num, num } from "@/lib/kpi/ppfs-common";
import {
  NCD_COHORT_SQL,
  NCD_DAYS_SQL,
  NCD_DEPCODES,
  NCD_HBA1C_BILLABLE_PER_YEAR,
  NCD_HOSXP_STEPS,
  NCD_HOSXP_STEPS_SQL,
  NCD_SCHEME_INDEX,
  NCD_SCHEME_RULES,
  NCD_VISITS_SQL,
  NCD_WAIT_SQL,
  type NcdWaitMeasure,
  WAIT_BUCKET_MINUTES,
  ncdClinicParams,
} from "@/lib/kpi/sql/ncd-clinic-hosxp";

/**
 * "คลินิกโรคเรื้อรัง" (/clinic/ncd) — the hospital's chronic-disease clinic (ovst.main_dep
 * 062 / 047): people, quality indicators, waiting time, workload and
 * charges by scheme. HOSxP only (never HDC), aggregates only.
 * Definitions: docs/kpi/ncd-clinic.md. SQL: ./sql/ncd-clinic-hosxp.ts.
 */

export const NCD_CLINIC_CACHE_TAG = "kpi:ncd-clinic";

/** Ceiling of visits / appointments per clinic day (infographic: 100–120). */
const TARGET_PER_DAY = 120;
/** nondrugitems 3001142 "Hemoglobin A1C (HbA1C) รหัส 32401" price (FY2569). */
const HBA1C_PRICE_BAHT = 230;

const CLINIC_NAME = "คลินิกโรคไม่ติดต่อเรื้อรัง (NCD) โรงพยาบาลบางระกำ";

const SCHEME_NAMES: Readonly<Record<NcdSchemeCode, string>> = {
  UC_OWN: "UC / บัตรทอง ลงทะเบียน รพ.บางระกำ (เหมาจ่ายรายหัว)",
  SSS_OWN: "ประกันสังคม รพ.บางระกำเป็นสถานพยาบาลหลัก",
  NRH_OWN: "ต่างด้าวประกันสุขภาพ ขึ้นทะเบียน รพ.บางระกำ",
  OFC: "ข้าราชการ / เบิกกรมบัญชีกลาง",
  LGO: "อปท.",
  GOV: "หน่วยงานรัฐอื่น (กทม. พัทยา รฟท. ฯลฯ)",
  SSS_OTHER: "ประกันสังคมต่างพื้นที่",
  UC_OTHER: "UC / บัตรทอง ต่างพื้นที่",
  CSH: "ชำระเงินเอง",
  OTHER: "อื่นๆ (ต่างด้าวไม่มีประกัน, พ.ร.บ., ไม่ระบุ)",
};

const PAY_GROUPS: readonly { code: NcdPayGroupCode; name: string; rule: string }[] = [
  {
    code: "FULL",
    name: "สิทธิเกิดรายได้เต็มจำนวน",
    rule: "เรียกเก็บตามรายการบริการ: ข้าราชการ, อปท., หน่วยงานรัฐอื่น, ประกันสังคม/UC ต่างพื้นที่, ชำระเงินเอง, อื่นๆ (ต่างด้าวไม่มีประกัน, พ.ร.บ.)",
  },
  {
    code: "CAPITATION",
    name: "รายรับเรียกเก็บไม่เต็มจำนวน",
    rule: "รพ.บางระกำเป็นหน่วยบริการหลัก (hospmain 11252) ของกองทุนเหมาจ่าย: UC, ประกันสังคม, ต่างด้าวประกันสุขภาพ",
  },
];

const DISEASES: readonly { code: NcdDiseaseRow["code"]; name: string; icd10: string; col: string }[] = [
  { code: "DM", name: "เบาหวาน (DM)", icd10: "E10–E14", col: "dm" },
  { code: "HT", name: "ความดันโลหิตสูง (HT)", icd10: "I10–I15", col: "ht" },
  { code: "DLP", name: "ไขมันในเลือดผิดปกติ (DLP)", icd10: "E78", col: "dlp" },
  { code: "ASTHMA", name: "หอบหืด / COPD", icd10: "J44–J46", col: "asthma" },
  { code: "OTHER", name: "อื่นๆ (ไม่มีรหัส 4 กลุ่มนี้)", icd10: "", col: "dx_other" },
];

// --- rows -------------------------------------------------------------------

interface VisitRow extends RowDataPacket {
  ym: string;
  scheme_code: string;
  visits: Num;
  lab_visits: Num;
  fbs_visits: Num;
  dtx_visits: Num;
  baht: Num;
  drug_baht: Num;
  lab_baht: Num;
  xray_baht: Num;
  paid_baht: Num;
}

/** One row; columns m0..m11, s0..s9 and the named counts of NCD_COHORT_SQL. */
type CohortRow = RowDataPacket & Record<string, Num>;

interface DayRow extends RowDataPacket {
  d: string | null;
  visits: Num;
  physicians: Num;
  phys_visits: Num;
  appts: Num;
  appts_kept: Num;
}

interface WaitRowDb extends RowDataPacket {
  measure: NcdWaitMeasure;
  has_lab: Num;
  bucket: Num;
  n: Num;
}

/** One row: visits / persons / ok_visits / ok_persons and <step>_avg|_min|_max|_med. */
type HosxpStepsRowDb = RowDataPacket & Record<string, Num>;

/** Labels of the HOSxP report steps (keys = NCD_HOSXP_STEPS). */
const HOSXP_STEP_LABELS: Readonly<Record<NcdHosxpStepCode, { label: string; span: string }>> = {
  WAIT_SCREEN: { label: "1. รอซักประวัติ", span: "ห้องบัตร → เริ่มซักประวัติ" },
  SCREEN: { label: "2. ซักประวัติ", span: "เริ่ม → เสร็จซักประวัติ" },
  WAIT_DOCTOR: { label: "3. รอตรวจ", span: "เสร็จซักประวัติ → เริ่มตรวจ" },
  DOCTOR: { label: "4. ตรวจ", span: "เริ่ม → เสร็จตรวจ" },
  WAIT_RX: { label: "5. รอรับยา", span: "เสร็จตรวจ → จ่ายยาเสร็จ" },
  TOTAL: { label: "รวม (ขั้น 2–5)", span: "เริ่มซักประวัติ → จ่ายยาเสร็จ" },
  NEW_TO_RX: { label: "ห้องบัตร → รับยา (ขั้น 1–5)", span: "ห้องบัตร → จ่ายยาเสร็จ" },
};

// --- helpers ------------------------------------------------------------------

const numOrNull = (v: Num | undefined): number | null =>
  v === null || v === undefined ? null : num(v);
const round1 = (x: number) => Math.round(x * 10) / 10;
const round2 = (x: number) => Math.round(x * 100) / 100;
const pct = (n: number, d: number): number | null => (d > 0 ? round1((n / d) * 100) : null);
const per = (n: number, d: number): number => (d > 0 ? round2(n / d) : 0);

interface MoneyAcc {
  visits: number;
  baht: number;
  drugBaht: number;
  labBaht: number;
  xrayBaht: number;
  paidBaht: number;
}

const emptyMoney = (): MoneyAcc => ({
  visits: 0,
  baht: 0,
  drugBaht: 0,
  labBaht: 0,
  xrayBaht: 0,
  paidBaht: 0,
});

function addVisitRow(acc: MoneyAcc, r: VisitRow): void {
  acc.visits += num(r.visits);
  acc.baht += num(r.baht);
  acc.drugBaht += num(r.drug_baht);
  acc.labBaht += num(r.lab_baht);
  acc.xrayBaht += num(r.xray_baht);
  acc.paidBaht += num(r.paid_baht);
}

function addAcc(acc: MoneyAcc, x: MoneyAcc): void {
  acc.visits += x.visits;
  acc.baht += x.baht;
  acc.drugBaht += x.drugBaht;
  acc.labBaht += x.labBaht;
  acc.xrayBaht += x.xrayBaht;
  acc.paidBaht += x.paidBaht;
}

function money(a: MoneyAcc): NcdMoney {
  return {
    baht: round2(a.baht),
    drugBaht: round2(a.drugBaht),
    labBaht: round2(a.labBaht),
    xrayBaht: round2(a.xrayBaht),
    otherBaht: round2(Math.max(0, a.baht - a.drugBaht - a.labBaht - a.xrayBaht)),
    paidBaht: round2(a.paidBaht),
  };
}

const payGroupOf = (code: NcdSchemeCode): NcdPayGroupCode =>
  NCD_SCHEME_RULES.find((r) => r.code === code)?.payGroup ?? "FULL";

function isSchemeCode(code: string): code is NcdSchemeCode {
  return (NCD_SCHEME_INDEX as readonly string[]).includes(code);
}

/**
 * Median / p90 / mean from 10-minute buckets. Quantiles are linear inside
 * the bucket that holds them; the mean uses bucket mid-points.
 */
function waitStats(buckets: ReadonlyMap<number, number>): NcdWaitStats {
  const sorted = [...buckets.entries()].sort((a, b) => a[0] - b[0]);
  const measured = sorted.reduce((s, [, n]) => s + n, 0);
  if (measured === 0) {
    return { measured: 0, medianMinutes: null, meanMinutes: null, p90Minutes: null };
  }
  const quantile = (q: number): number => {
    const target = q * measured;
    let cum = 0;
    for (const [b, n] of sorted) {
      if (cum + n >= target) {
        return Math.round((b + (target - cum) / n) * WAIT_BUCKET_MINUTES);
      }
      cum += n;
    }
    const last = sorted[sorted.length - 1][0];
    return (last + 1) * WAIT_BUCKET_MINUTES;
  };
  const mean =
    sorted.reduce((s, [b, n]) => s + (b + 0.5) * WAIT_BUCKET_MINUTES * n, 0) / measured;
  return {
    measured,
    medianMinutes: quantile(0.5),
    meanMinutes: Math.round(mean),
    p90Minutes: quantile(0.9),
  };
}

interface IndicatorDef {
  code: string;
  group: NcdIndicator["group"];
  name: string;
  numerator: number;
  denominator: number;
  target: number | null;
  targetOperator: NcdIndicator["targetOperator"];
  targetSource: string | null;
  unit: NcdIndicator["unit"];
  definition: string;
}

function indicator(d: IndicatorDef): NcdIndicator {
  const percent = pct(d.numerator, d.denominator);
  let pass: boolean | null = null;
  if (percent !== null && d.target !== null && d.targetOperator !== null) {
    pass =
      d.targetOperator === ">"
        ? percent > d.target
        : d.targetOperator === ">="
          ? percent >= d.target
          : percent <= d.target;
  }
  return { ...d, percent, pass };
}

/** KPI Template 2569 ข้อ 30.x (RLU): > 70% FY2569, > 80% from FY2570. */
const rluTarget = (fy: number) => (fy >= 2570 ? 80 : 70);
/** KPI Template 30.2 HbA1c ซ้ำภายใน 90 วัน: ≤ 5% FY2569, ≤ 4% from FY2570. */
const repeatTarget = (fy: number) => (fy >= 2570 ? 4 : 5);

// --- loader -------------------------------------------------------------------

/**
 * Rendering contract identical to getDrugDeliverySummary: `await io()`
 * first, render the caller inside <Suspense>; cached per fiscal year
 * ("hours" running year, "days" closed year). Five queries in parallel; a
 * failure throws (the page shows an error, nothing is cached). Invalidate
 * with revalidateTag(NCD_CLINIC_CACHE_TAG).
 */
export async function getNcdClinicSummary(fiscalYear: number): Promise<NcdClinicSummary> {
  await io();
  const closed = todayIsoDate() > fiscalYearRange(fiscalYear).end;
  return loadNcdClinicSummary(fiscalYear, closed);
}

async function loadNcdClinicSummary(
  fiscalYear: number,
  closed: boolean,
): Promise<NcdClinicSummary> {
  "use cache";
  cacheTag(NCD_CLINIC_CACHE_TAG);

  const range = fiscalYearRange(fiscalYear);
  const params = ncdClinicParams(range.start, range.end);
  const [visitRows, cohortRows, dayRows, waitRows, stepRows] = await Promise.all([
    query<VisitRow>(NCD_VISITS_SQL, params),
    query<CohortRow>(NCD_COHORT_SQL, params),
    query<DayRow>(NCD_DAYS_SQL, params),
    query<WaitRowDb>(NCD_WAIT_SQL, params),
    query<HosxpStepsRowDb>(NCD_HOSXP_STEPS_SQL, params),
  ]);
  const c: Record<string, Num> = cohortRows[0] ?? {};
  const cn = (col: string) => num(c[col]);

  // --- visits and money by scheme / month
  const byScheme = new Map<NcdSchemeCode, MoneyAcc>(NCD_SCHEME_INDEX.map((s) => [s, emptyMoney()]));
  const byMonth = new Map<string, Record<NcdPayGroupCode, MoneyAcc>>(
    range.months.map((m) => [m, { FULL: emptyMoney(), CAPITATION: emptyMoney() }]),
  );
  const total = emptyMoney();
  let labVisits = 0;
  let fbsVisits = 0;
  let dtxVisits = 0;
  for (const r of visitRows) {
    const code: NcdSchemeCode = isSchemeCode(r.scheme_code) ? r.scheme_code : "OTHER";
    addVisitRow(byScheme.get(code)!, r);
    const m = byMonth.get(r.ym);
    if (m) addVisitRow(m[payGroupOf(code)], r);
    addVisitRow(total, r);
    labVisits += num(r.lab_visits);
    fbsVisits += num(r.fbs_visits);
    dtxVisits += num(r.dtx_visits);
  }

  const schemeRow = (code: NcdSchemeCode): NcdSchemeRow => {
    const rule = NCD_SCHEME_RULES.find((r) => r.code === code);
    const a = byScheme.get(code)!;
    return {
      code,
      name: SCHEME_NAMES[code],
      payGroup: payGroupOf(code),
      hipdata: rule?.hipdata ?? [],
      hospmain: rule?.hospmain ?? "any",
      persons: cn(`s${NCD_SCHEME_INDEX.indexOf(code)}`),
      visits: a.visits,
      bahtPerVisit: per(a.baht, a.visits),
      ...money(a),
    };
  };

  const payGroups: NcdPayGroupRow[] = PAY_GROUPS.map((g) => {
    const schemes = NCD_SCHEME_INDEX.filter((s) => payGroupOf(s) === g.code).map(schemeRow);
    const a = emptyMoney();
    for (const s of NCD_SCHEME_INDEX) if (payGroupOf(s) === g.code) addAcc(a, byScheme.get(s)!);
    return {
      ...g,
      persons: cn(g.code === "FULL" ? "pay_full" : "pay_capitation"),
      visits: a.visits,
      bahtPerVisit: per(a.baht, a.visits),
      ...money(a),
      schemes,
    };
  });

  // --- clinic days
  const days: NcdDayRow[] = [];
  let yearPhysicians = 0;
  let physicianDays = 0;
  let physVisits = 0;
  const dayStats = new Map<string, { days: number; max: number }>(
    range.months.map((m) => [m, { days: 0, max: 0 }]),
  );
  for (const r of dayRows) {
    if (r.d === null) {
      yearPhysicians = num(r.physicians); // WITH ROLLUP row
      continue;
    }
    const visits = num(r.visits);
    days.push({
      date: r.d,
      visits,
      appointments: num(r.appts),
      physicians: num(r.physicians),
    });
    physicianDays += num(r.physicians);
    physVisits += num(r.phys_visits);
    const ms = dayStats.get(r.d.slice(0, 7));
    if (ms && visits > 0) {
      ms.days += 1;
      ms.max = Math.max(ms.max, visits);
    }
  }
  const visitDays = days.filter((d) => d.visits > 0);
  const apptDays = days.filter((d) => d.appointments > 0);
  const appointments = apptDays.reduce((s, d) => s + d.appointments, 0);
  const appointmentsKept = dayRows.reduce((s, r) => s + (r.d === null ? 0 : num(r.appts_kept)), 0);
  const workload: NcdWorkload = {
    targetPerDay: TARGET_PER_DAY,
    clinicDays: visitDays.length,
    avgVisitsPerDay: per(total.visits, visitDays.length),
    maxVisitsPerDay: Math.max(0, ...visitDays.map((d) => d.visits)),
    daysOverTarget: visitDays.filter((d) => d.visits > TARGET_PER_DAY).length,
    appointments,
    appointmentsKept,
    appointmentsKeptPercent: pct(appointmentsKept, appointments),
    appointmentDays: apptDays.length,
    avgAppointmentsPerDay: per(appointments, apptDays.length),
    maxAppointmentsPerDay: Math.max(0, ...apptDays.map((d) => d.appointments)),
    appointmentDaysOverTarget: apptDays.filter((d) => d.appointments > TARGET_PER_DAY).length,
    physicians: yearPhysicians,
    avgPhysiciansPerDay: per(physicianDays, visitDays.length),
    visitsPerPhysicianDay: per(physVisits, physicianDays),
    days,
  };

  const months: NcdMonthRow[] = range.months.map((month, i) => {
    const g = byMonth.get(month)!;
    const a = emptyMoney();
    addAcc(a, g.FULL);
    addAcc(a, g.CAPITATION);
    const ds = dayStats.get(month)!;
    return {
      month,
      persons: cn(`m${i}`),
      visits: a.visits,
      fullVisits: g.FULL.visits,
      capitationVisits: g.CAPITATION.visits,
      fullBaht: round2(g.FULL.baht),
      capitationBaht: round2(g.CAPITATION.baht),
      clinicDays: ds.days,
      visitsPerDay: per(a.visits, ds.days),
      maxVisitsPerDay: ds.max,
      ...money(a),
    };
  });

  // --- diseases
  const diseases: NcdDiseaseRow[] = DISEASES.map((d) => ({
    code: d.code,
    name: d.name,
    icd10: d.icd10,
    persons: cn(d.col),
    visits: cn(`${d.col}_visits`),
  }));

  // --- quality
  const dm = cn("dm");
  const ht = cn("ht");
  const indicators: NcdIndicator[] = [
    indicator({
      code: "DM_HBA1C_CONTROL",
      group: "DM",
      name: "ผู้ป่วยเบาหวานควบคุมระดับน้ำตาลได้ดี (HbA1c ล่าสุด < 7%)",
      numerator: cn("dm_a1c_lt7"),
      denominator: dm,
      target: 40,
      targetOperator: ">=",
      targetSource: "HDC / Service Plan NCD",
      unit: "คน",
      definition: "ผู้ป่วย DM ของคลินิกที่ผล HbA1c ครั้งล่าสุดในปีงบฯ < 7 ÷ ผู้ป่วย DM ทั้งหมดของคลินิก (ไม่ได้ตรวจ = ไม่ผ่าน)",
    }),
    indicator({
      code: "DM_HBA1C_TESTED",
      group: "DM",
      name: "ผู้ป่วยเบาหวานได้ตรวจ HbA1c อย่างน้อยปีละ 1 ครั้ง",
      numerator: cn("dm_a1c"),
      denominator: dm,
      target: rluTarget(fiscalYear),
      targetOperator: ">",
      targetSource: "KPI Template 2569 ข้อ 30.3 (RLU)",
      unit: "คน",
      definition: "ผู้ป่วย DM ที่มีผล HbA1c ในปีงบฯ (ทุก visit) ÷ ผู้ป่วย DM ของคลินิก",
    }),
    indicator({
      code: "DM_HBA1C_REPEAT_90D",
      group: "DM",
      name: "HbA1c ซ้ำภายใน 90 วัน (ยิ่งน้อยยิ่งดี)",
      numerator: cn("dm_a1c_rep90_tests"),
      denominator: cn("dm_a1c_tests"),
      target: repeatTarget(fiscalYear),
      targetOperator: "<=",
      targetSource: "KPI Template 2569 ข้อ 30.2 (RLU)",
      unit: "ครั้ง",
      definition: "ครั้งตรวจ HbA1c ที่ห่างจากครั้งก่อนของคนเดียวกัน < 90 วัน ÷ ครั้งตรวจ HbA1c ทั้งหมดของผู้ป่วย DM ในปีงบฯ",
    }),
    indicator({
      code: "DM_LDL_TESTED",
      group: "DM",
      name: "ผู้ป่วยเบาหวานได้ตรวจ LDL อย่างน้อยปีละ 1 ครั้ง",
      numerator: cn("dm_ldl"),
      denominator: dm,
      target: rluTarget(fiscalYear),
      targetOperator: ">",
      targetSource: "KPI Template 2569 ข้อ 30.5 (RLU)",
      unit: "คน",
      definition: "ผู้ป่วย DM ที่มีผล LDL (calculated หรือ direct) ในปีงบฯ ÷ ผู้ป่วย DM ของคลินิก",
    }),
    indicator({
      code: "DM_LDL_CONTROL",
      group: "DM",
      name: "ผู้ป่วยเบาหวาน LDL ล่าสุด < 100 mg/dL",
      numerator: cn("dm_ldl_lt100"),
      denominator: dm,
      target: null,
      targetOperator: null,
      targetSource: null,
      unit: "คน",
      definition: "ผู้ป่วย DM ที่ LDL ครั้งล่าสุดในปีงบฯ < 100 ÷ ผู้ป่วย DM ของคลินิก (ไม่มีเกณฑ์ทางการ แสดงเพื่อติดตาม)",
    }),
    indicator({
      code: "DM_CR_TESTED",
      group: "DM",
      name: "ผู้ป่วยเบาหวานได้ตรวจ Creatinine อย่างน้อยปีละ 1 ครั้ง",
      numerator: cn("dm_cr"),
      denominator: dm,
      target: rluTarget(fiscalYear),
      targetOperator: ">",
      targetSource: "KPI Template 2569 ข้อ 30.6 (RLU)",
      unit: "คน",
      definition: "ผู้ป่วย DM ที่มีผล serum creatinine ในปีงบฯ ÷ ผู้ป่วย DM ของคลินิก",
    }),
    indicator({
      code: "DM_EYE_SCREEN",
      group: "DM",
      name: "ผู้ป่วยเบาหวานได้ตรวจจอประสาทตา",
      numerator: cn("dm_eye"),
      denominator: dm,
      target: 60,
      targetOperator: ">=",
      targetSource: "HDC / Service Plan NCD",
      unit: "คน",
      definition: "ผู้ป่วย DM ที่มีบันทึกคัดกรองภาวะแทรกซ้อน (cm_dm_cmbty_screen) ตรวจตาในปีงบฯ ÷ ผู้ป่วย DM ของคลินิก",
    }),
    indicator({
      code: "DM_FOOT_SCREEN",
      group: "DM",
      name: "ผู้ป่วยเบาหวานได้ตรวจเท้า",
      numerator: cn("dm_foot"),
      denominator: dm,
      target: 60,
      targetOperator: ">=",
      targetSource: "HDC / Service Plan NCD",
      unit: "คน",
      definition: "ผู้ป่วย DM ที่มีบันทึกคัดกรองภาวะแทรกซ้อนตรวจเท้าในปีงบฯ ÷ ผู้ป่วย DM ของคลินิก",
    }),
    indicator({
      code: "HT_BP_CONTROL",
      group: "HT",
      name: "ผู้ป่วยความดันโลหิตสูงควบคุมความดันได้ดี (< 140/90 ครั้งล่าสุด)",
      numerator: cn("ht_bp_ctrl"),
      denominator: ht,
      target: 60,
      targetOperator: ">=",
      targetSource: "HDC / Service Plan NCD",
      unit: "คน",
      definition: "ผู้ป่วย HT ที่ BP ครั้งล่าสุดที่คลินิก (opdscreen) < 140/90 ÷ ผู้ป่วย HT ของคลินิก (HDC ใช้ 2 ครั้งล่าสุด)",
    }),
    indicator({
      code: "DMHT_CKD_SCREEN",
      group: "CKD",
      name: "ผู้ป่วย DM/HT ได้คัดกรองโรคไต (eGFR และ UACR)",
      numerator: cn("dmht_ckd_screen"),
      denominator: cn("dmht_any"),
      target: 80,
      targetOperator: ">=",
      targetSource: "Service Plan CKD",
      unit: "คน",
      definition: "ผู้ป่วย DM หรือ HT ที่มีทั้ง eGFR และ urine microalbumin / UACR ในปีงบฯ ÷ ผู้ป่วย DM หรือ HT ของคลินิก",
    }),
  ];

  const panel = (code: NcdLabPanelRow["code"], name: string, col: string): NcdLabPanelRow => ({
    code,
    name,
    persons: cn(col),
    denominator: dm,
    percent: pct(cn(col), dm),
  });
  const dmLabPanel: NcdLabPanelRow[] = [
    panel("HBA1C", "HbA1c", "dm_a1c"),
    panel("LDL", "LDL-C", "dm_ldl"),
    panel("CHOL", "Cholesterol", "dm_chol"),
    panel("CR", "Creatinine", "dm_cr"),
    panel("K", "Potassium (K)", "dm_k"),
    panel("FBS", "FBS (lab)", "dm_fbs"),
    panel("UACR", "Urine microalbumin / UACR", "dm_uacr"),
    panel("PANEL", "ครบ 5 รายการ (HbA1c, LDL, Cr, K, FBS)", "dm_panel"),
  ];

  // --- waiting time
  const waitBuckets = new Map<string, Map<number, number>>();
  const waitVisits = new Map<number, number>();
  for (const r of waitRows) {
    const lab = num(r.has_lab) ? 1 : 0;
    const key = `${r.measure}|${lab}`;
    // every visit appears once per measure: count visits from one of them
    if (r.measure === "DOCTOR") waitVisits.set(lab, (waitVisits.get(lab) ?? 0) + num(r.n));
    if (r.bucket === null) continue;
    const m = waitBuckets.get(key) ?? new Map<number, number>();
    m.set(num(r.bucket), (m.get(num(r.bucket)) ?? 0) + num(r.n));
    waitBuckets.set(key, m);
  }
  const stats = (measure: NcdWaitMeasure, lab: 0 | 1) =>
    waitStats(waitBuckets.get(`${measure}|${lab}`) ?? new Map());
  const waiting: NcdWaitRow[] = ([0, 1] as const).map((lab) => ({
    withLab: lab === 1,
    visits: waitVisits.get(lab) ?? 0,
    toDoctor: stats("DOCTOR", lab),
    toPharmacy: stats("PHARMACY", lab),
    screenToDoctor: stats("SCREEN_TO_DOCTOR", lab),
  }));

  // --- waiting time, HOSxP report definition
  const h: Record<string, Num> = stepRows[0] ?? {};
  const hosxpSteps: NcdHosxpSteps = {
    visits: num(h.visits),
    persons: num(h.persons),
    qualifyingVisits: num(h.ok_visits),
    qualifyingPersons: num(h.ok_persons),
    steps: (Object.keys(NCD_HOSXP_STEPS) as NcdHosxpStepCode[]).map((code): NcdHosxpStepRow => {
      const c = code.toLowerCase();
      return {
        code,
        ...HOSXP_STEP_LABELS[code],
        meanMinutes: numOrNull(h[`${c}_avg`]),
        medianMinutes: numOrNull(h[`${c}_med`]),
        minMinutes: numOrNull(h[`${c}_min`]),
        maxMinutes: numOrNull(h[`${c}_max`]),
      };
    }),
  };

  const excessTests = cn("dm_a1c_excess_tests");

  // Exactly one cacheLife call per invocation (see cacheLife docs).
  if (closed) {
    cacheLife("days");
  } else {
    cacheLife("hours");
  }

  return {
    fiscalYear,
    periodStart: range.start,
    periodEnd: range.end,
    closed,
    clinic: { depcodes: NCD_DEPCODES, name: CLINIC_NAME },
    persons: cn("persons"),
    visits: total.visits,
    labVisits,
    money: money(total),
    bahtPerVisit: per(total.baht, total.visits),
    payGroups,
    months,
    diseases,
    dmHtPersons: cn("dmht"),
    indicators,
    dmLabPanel,
    hba1cUse: {
      billableLimit: NCD_HBA1C_BILLABLE_PER_YEAR,
      priceBaht: HBA1C_PRICE_BAHT,
      personsOverLimit: cn("dm_a1c_gt2"),
      excessTests,
      excessBaht: excessTests * HBA1C_PRICE_BAHT,
      tests: cn("dm_a1c_tests"),
    },
    glucoseTests: {
      fbsVisits,
      dtxVisits,
      fbsPercent: pct(fbsVisits, fbsVisits + dtxVisits),
    },
    waiting,
    hosxpSteps,
    workload,
    updatedAt: new Date().toISOString(),
  };
}
