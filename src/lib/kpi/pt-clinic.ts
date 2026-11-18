import "server-only";

import type { RowDataPacket } from "mysql2";
import { cacheLife, cacheTag, io } from "next/cache";

import { query } from "@/lib/db/his";
import { fiscalYearRange, todayIsoDate } from "@/lib/kpi/fiscal-year";
import { type Num, num } from "@/lib/kpi/ppfs-common";
import type {
  PtClinicSummary,
  PtDxRow,
  PtImcCode,
  PtImcRow,
  PtIndicator,
  PtItemRow,
  PtMoney,
  PtMonthRow,
  PtPayGroupCode,
  PtPayGroupRow,
  PtSchemeCode,
  PtSchemeRow,
} from "@/lib/kpi/pt-clinic-types";
import { NCD_SCHEME_INDEX, NCD_SCHEME_RULES } from "@/lib/kpi/sql/ncd-clinic-hosxp";
import {
  PT_COHORT_SQL,
  PT_DAYS_SQL,
  PT_DEPCODE,
  PT_GROUP_ORTHOTIC,
  PT_IMC_FOLLOWUP_DAYS,
  PT_IMC_SQL,
  PT_IPD_SQL,
  PT_ITEMS_SQL,
  PT_VISITS_SQL,
  PT_WAIT_SQL,
  ptClinicParams,
} from "@/lib/kpi/sql/pt-clinic-hosxp";

/**
 * "คลินิกกายภาพ" (/clinic/pt) — physiotherapy of the hospital: PT visits
 * (physic_list on any OPD visit, or PT-catalog charges at main_dep 027),
 * PT-catalog charges by scheme, items, diagnoses, workload, waiting time,
 * IMC follow-up and inpatient PT. HOSxP only (never HDC), aggregates only.
 * Definitions: docs/kpi/pt-clinic.md. SQL: ./sql/pt-clinic-hosxp.ts.
 */

export const PT_CLINIC_CACHE_TAG = "kpi:pt-clinic";

const CLINIC_NAME = "งานกายภาพบำบัด โรงพยาบาลบางระกำ";

/** Same labels as /clinic/ncd (ncd-clinic.ts keeps its own copy, not exported). */
const SCHEME_NAMES: Readonly<Record<PtSchemeCode, string>> = {
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

const PAY_GROUPS: readonly { code: PtPayGroupCode; name: string; rule: string }[] = [
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

const DIAGNOSES: readonly { code: PtDxRow["code"]; name: string; icd10: string; col: string }[] = [
  { code: "STROKE", name: "โรคหลอดเลือดสมอง / ผลตามหลัง", icd10: "I60–I69", col: "stroke" },
  { code: "NEURO", name: "ระบบประสาท (อัมพาตครึ่งซีก, พาร์กินสัน ฯลฯ)", icd10: "G00–G99", col: "neuro" },
  { code: "MSK", name: "กระดูก กล้ามเนื้อ และข้อ", icd10: "M00–M99", col: "msk" },
  { code: "INJURY", name: "การบาดเจ็บ", icd10: "S00–T98", col: "injury" },
  { code: "OTHER", name: "อื่นๆ (ไม่มีรหัส 4 กลุ่มนี้ เช่น visit คลินิก NCD)", icd10: "", col: "dx_other" },
];

const IMC_GROUPS: readonly { code: PtImcCode; name: string; icd10: string }[] = [
  { code: "STROKE", name: "โรคหลอดเลือดสมอง", icd10: "I60–I64" },
  { code: "TBI", name: "บาดเจ็บสมอง (ไม่รวมสมองกระทบกระเทือน S06.0)", icd10: "S06.1–S06.9" },
  { code: "SCI", name: "บาดเจ็บไขสันหลัง", icd10: "S14.0–1, S24.0–1, S34.0–1" },
  { code: "HIP", name: "กระดูกสะโพกหัก", icd10: "S72.0–S72.2" },
];

// --- rows -------------------------------------------------------------------

interface VisitRow extends RowDataPacket {
  ym: string;
  scheme_code: string;
  visits: Num;
  dep_visits: Num;
  pt_baht: Num;
  visit_baht: Num;
  drug_baht: Num;
  lab_baht: Num;
  xray_baht: Num;
  paid_baht: Num;
}

type OneRow = RowDataPacket & Record<string, Num>;

interface ItemRowDb extends RowDataPacket {
  icode: string;
  item_name: string | null;
  grp: Num;
  qty: Num;
  visits: Num;
  persons: Num;
  baht: Num;
}

interface DayRow extends RowDataPacket {
  d: string | null;
  visits: Num;
  therapists: Num;
  therapist_visits: Num;
  appts: Num;
  appts_kept: Num;
}

interface ImcRowDb extends RowDataPacket {
  grp: string | null;
  admissions: Num;
  persons: Num;
  ipd_pt: Num;
  opd_pt: Num;
  any_pt: Num;
  open_window: Num;
}

// --- helpers ------------------------------------------------------------------

const numOrNull = (v: Num | undefined): number | null =>
  v === null || v === undefined ? null : num(v);
const round1 = (x: number) => Math.round(x * 10) / 10;
const round2 = (x: number) => Math.round(x * 100) / 100;
const pct = (n: number, d: number): number | null => (d > 0 ? round1((n / d) * 100) : null);
const per = (n: number, d: number): number => (d > 0 ? round2(n / d) : 0);

interface MoneyAcc {
  visits: number;
  depVisits: number;
  ptBaht: number;
  visitBaht: number;
  drugBaht: number;
  paidBaht: number;
}

const emptyMoney = (): MoneyAcc => ({
  visits: 0,
  depVisits: 0,
  ptBaht: 0,
  visitBaht: 0,
  drugBaht: 0,
  paidBaht: 0,
});

function addVisitRow(acc: MoneyAcc, r: VisitRow): void {
  acc.visits += num(r.visits);
  acc.depVisits += num(r.dep_visits);
  acc.ptBaht += num(r.pt_baht);
  acc.visitBaht += num(r.visit_baht);
  acc.drugBaht += num(r.drug_baht);
  acc.paidBaht += num(r.paid_baht);
}

function addAcc(acc: MoneyAcc, x: MoneyAcc): void {
  acc.visits += x.visits;
  acc.depVisits += x.depVisits;
  acc.ptBaht += x.ptBaht;
  acc.visitBaht += x.visitBaht;
  acc.drugBaht += x.drugBaht;
  acc.paidBaht += x.paidBaht;
}

function money(a: MoneyAcc): PtMoney {
  return {
    ptBaht: round2(a.ptBaht),
    visitBaht: round2(a.visitBaht),
    otherBaht: round2(Math.max(0, a.visitBaht - a.ptBaht)),
    drugBaht: round2(a.drugBaht),
    paidBaht: round2(a.paidBaht),
  };
}

const payGroupOf = (code: PtSchemeCode): PtPayGroupCode =>
  NCD_SCHEME_RULES.find((r) => r.code === code)?.payGroup ?? "FULL";

function isSchemeCode(code: string): code is PtSchemeCode {
  return (NCD_SCHEME_INDEX as readonly string[]).includes(code);
}

interface IndicatorDef {
  code: string;
  name: string;
  numerator: number;
  denominator: number;
  unit: PtIndicator["unit"];
  definition: string;
}

/** Follow-up indicators: no official target for these definitions. */
function indicator(d: IndicatorDef): PtIndicator {
  return {
    ...d,
    percent: pct(d.numerator, d.denominator),
    target: null,
    targetOperator: null,
    targetSource: null,
    pass: null,
  };
}

// --- loader -------------------------------------------------------------------

/**
 * Same rendering contract as getNcdClinicSummary: `await io()` first,
 * render the caller inside <Suspense>; cached per fiscal year ("hours"
 * running year, "days" closed year). Seven queries in parallel; a failure
 * throws (the page shows an error, nothing is cached). Invalidate with
 * revalidateTag(PT_CLINIC_CACHE_TAG).
 */
export async function getPtClinicSummary(fiscalYear: number): Promise<PtClinicSummary> {
  await io();
  const closed = todayIsoDate() > fiscalYearRange(fiscalYear).end;
  return loadPtClinicSummary(fiscalYear, closed);
}

async function loadPtClinicSummary(
  fiscalYear: number,
  closed: boolean,
): Promise<PtClinicSummary> {
  "use cache";
  cacheTag(PT_CLINIC_CACHE_TAG);

  const range = fiscalYearRange(fiscalYear);
  const params = ptClinicParams(range.start, range.end);
  const [visitRows, cohortRows, itemRows, dayRows, waitRows, ipdRows, imcRows] =
    await Promise.all([
      query<VisitRow>(PT_VISITS_SQL, params),
      query<OneRow>(PT_COHORT_SQL, params),
      query<ItemRowDb>(PT_ITEMS_SQL, params),
      query<DayRow>(PT_DAYS_SQL, params),
      query<OneRow>(PT_WAIT_SQL, params),
      query<OneRow>(PT_IPD_SQL, params),
      query<ImcRowDb>(PT_IMC_SQL, params),
    ]);
  const c: Record<string, Num> = cohortRows[0] ?? {};
  const cn = (col: string) => num(c[col]);

  // --- visits and money by scheme / month
  const byScheme = new Map<PtSchemeCode, MoneyAcc>(NCD_SCHEME_INDEX.map((s) => [s, emptyMoney()]));
  const byMonth = new Map<string, Record<PtPayGroupCode, MoneyAcc>>(
    range.months.map((m) => [m, { FULL: emptyMoney(), CAPITATION: emptyMoney() }]),
  );
  const total = emptyMoney();
  for (const r of visitRows) {
    const code: PtSchemeCode = isSchemeCode(r.scheme_code) ? r.scheme_code : "OTHER";
    addVisitRow(byScheme.get(code)!, r);
    const m = byMonth.get(r.ym);
    if (m) addVisitRow(m[payGroupOf(code)], r);
    addVisitRow(total, r);
  }

  const schemeRow = (code: PtSchemeCode): PtSchemeRow => {
    const a = byScheme.get(code)!;
    const i = NCD_SCHEME_INDEX.indexOf(code);
    return {
      code,
      name: SCHEME_NAMES[code],
      payGroup: payGroupOf(code),
      persons: cn(`s${i}`),
      visits: a.visits,
      ptBahtPerVisit: per(a.ptBaht, a.visits),
      ...money(a),
    };
  };

  const payGroups: PtPayGroupRow[] = PAY_GROUPS.map((g) => {
    const codes = NCD_SCHEME_INDEX.filter((s) => payGroupOf(s) === g.code);
    const acc = emptyMoney();
    for (const s of codes) addAcc(acc, byScheme.get(s)!);
    return {
      ...g,
      persons: cn(g.code === "FULL" ? "pay_full" : "pay_capitation"),
      visits: acc.visits,
      ptBahtPerVisit: per(acc.ptBaht, acc.visits),
      ...money(acc),
      schemes: codes.map(schemeRow),
    };
  });

  // --- days (ROLLUP row d = NULL holds the year's distinct therapists)
  interface DayAcc {
    days: number;
    visits: number;
    max: number;
    therapists: number;
    therapistVisits: number;
    appts: number;
    kept: number;
  }
  const emptyDay = (): DayAcc => ({
    days: 0,
    visits: 0,
    max: 0,
    therapists: 0,
    therapistVisits: 0,
    appts: 0,
    kept: 0,
  });
  const dayByMonth = new Map<string, DayAcc>(range.months.map((m) => [m, emptyDay()]));
  const year = emptyDay();
  let yearTherapists = 0;
  for (const r of dayRows) {
    if (r.d === null) {
      yearTherapists = num(r.therapists);
      continue;
    }
    const v = num(r.visits);
    for (const acc of [dayByMonth.get(r.d.slice(0, 7)), year]) {
      if (!acc) continue;
      if (v > 0) {
        acc.days += 1;
        acc.visits += v;
        acc.max = Math.max(acc.max, v);
        acc.therapists += num(r.therapists);
        acc.therapistVisits += num(r.therapist_visits);
      }
      acc.appts += num(r.appts);
      acc.kept += num(r.appts_kept);
    }
  }

  const months: PtMonthRow[] = range.months.map((m, i) => {
    const g = byMonth.get(m)!;
    const d = dayByMonth.get(m)!;
    const visits = g.FULL.visits + g.CAPITATION.visits;
    return {
      month: m,
      persons: cn(`m${i}`),
      visits,
      depVisits: g.FULL.depVisits + g.CAPITATION.depVisits,
      ptBaht: round2(g.FULL.ptBaht + g.CAPITATION.ptBaht),
      fullVisits: g.FULL.visits,
      fullPtBaht: round2(g.FULL.ptBaht),
      capitationVisits: g.CAPITATION.visits,
      capitationPtBaht: round2(g.CAPITATION.ptBaht),
      serviceDays: d.days,
      visitsPerDay: per(visits, d.days),
      appointments: d.appts,
      appointmentsKept: d.kept,
    };
  });

  // --- items
  const items: PtItemRow[] = itemRows.map((r) => ({
    icode: r.icode,
    name: r.item_name ?? r.icode,
    group: num(r.grp) === PT_GROUP_ORTHOTIC ? "ORTHOTIC" : "PT",
    qty: num(r.qty),
    visits: num(r.visits),
    persons: num(r.persons),
    baht: round2(num(r.baht)),
  }));
  const itemQty = items.reduce((s, r) => s + r.qty, 0);

  const diagnoses: PtDxRow[] = DIAGNOSES.map((d) => ({
    code: d.code,
    name: d.name,
    icd10: d.icd10,
    persons: cn(d.col),
    visits: cn(`${d.col}_visits`),
  }));

  const bands = [
    { label: "1 ครั้ง", persons: cn("band_1") },
    { label: "2–5 ครั้ง", persons: cn("band_2_5") },
    { label: "6–10 ครั้ง", persons: cn("band_6_10") },
    { label: "มากกว่า 10 ครั้ง", persons: cn("band_11") },
  ];

  // --- IMC
  const imcByCode = new Map(imcRows.filter((r) => r.grp !== null).map((r) => [r.grp!, r]));
  const imc: PtImcRow[] = IMC_GROUPS.map((g) => {
    const r = imcByCode.get(g.code);
    return {
      ...g,
      admissions: num(r?.admissions ?? 0),
      persons: num(r?.persons ?? 0),
      ipdPt: num(r?.ipd_pt ?? 0),
      opdPt: num(r?.opd_pt ?? 0),
      anyPt: num(r?.any_pt ?? 0),
      openWindow: num(r?.open_window ?? 0),
    };
  });
  const imcSum = (pick: (r: PtImcRow) => number) => imc.reduce((s, r) => s + pick(r), 0);
  const stroke = imc.find((r) => r.code === "STROKE")!;

  // --- wait
  const w: Record<string, Num> = waitRows[0] ?? {};
  const wait = {
    visits: num(w.visits),
    measured: num(w.measured),
    meanMinutes: numOrNull(w.mean_min),
    medianMinutes: numOrNull(w.median_min),
    p90Minutes: numOrNull(w.p90_min),
    within30: num(w.within_30),
    within60: num(w.within_60),
  };

  const persons = cn("persons");
  const indicators: PtIndicator[] = [
    indicator({
      code: "IMC_ANY",
      name: "ผู้ป่วย IMC จำหน่ายกลับบ้าน ได้รับกายภาพบำบัด",
      numerator: imcSum((r) => r.anyPt),
      denominator: imcSum((r) => r.admissions),
      unit: "admission",
      definition: `admission ที่จำหน่ายในปีงบฯ แบบ With Approval (ipt.dchtype 01) pdx กลุ่ม IMC (stroke I60–I64, TBI S06.1–S06.9, SCI, สะโพกหัก S72.0–S72.2) ที่ได้รับกายภาพระหว่างนอน (physic_plan_detail) หรือมา OPD กายภาพภายใน ${PT_IMC_FOLLOWUP_DAYS} วันหลังจำหน่าย ไม่ใช่ตัวชี้วัด IMC ทางการ (ต้องติดตามครบ 6 เดือน/Barthel ซึ่ง HOSxP ไม่มีข้อมูล) แสดงเพื่อติดตาม`,
    }),
    indicator({
      code: "STROKE_IPD",
      name: "ผู้ป่วยโรคหลอดเลือดสมอง ได้รับกายภาพระหว่างนอน รพ.",
      numerator: stroke.ipdPt,
      denominator: stroke.admissions,
      unit: "admission",
      definition:
        "admission pdx I60–I64 จำหน่ายกลับบ้าน (dchtype 01) ในปีงบฯ ที่มีบันทึกกายภาพผู้ป่วยใน (physic_plan_detail.an) อย่างน้อย 1 ครั้ง",
    }),
    indicator({
      code: "FOLLOW_2",
      name: "ผู้รับบริการกายภาพต่อเนื่อง (≥ 2 ครั้งในปีงบฯ)",
      numerator: persons - cn("band_1"),
      denominator: persons,
      unit: "คน",
      definition:
        "คนที่มี visit กายภาพตั้งแต่ 2 ครั้งในปีงบฯ ÷ คนทั้งหมด (รวมผู้ที่มาครั้งเดียวเพื่อประเมิน/สอน/ตรวจเท้าที่คลินิก NCD)",
    }),
    indicator({
      code: "APPT_KEPT",
      name: "มาตามนัดกายภาพ",
      numerator: year.kept,
      denominator: year.appts,
      unit: "ครั้ง",
      definition:
        "นัดของแผนกกายภาพ (oapp.depcode 027) ที่วันนัดอยู่ในปีงบฯ และมี visit ตามนัด (oapp.visit_vn) ÷ นัดทั้งหมด",
    }),
    indicator({
      code: "WAIT_30",
      name: "เริ่มทำกายภาพภายใน 30 นาทีหลังลงทะเบียน",
      numerator: wait.within30,
      denominator: wait.measured,
      unit: "ครั้ง",
      definition:
        "visit ที่ลงทะเบียนที่ห้องกายภาพ (main_dep 027) เวลาจาก ovst.vsttime ถึงรายการกายภาพแรก (physic_list.begin_datetime) ≤ 30 นาที ÷ visit ที่วัดได้ (0–480 นาที ไม่รวมวันนี้)",
    }),
  ];

  // Exactly one cacheLife call per invocation (see cacheLife docs).
  if (closed) {
    cacheLife("days");
  } else {
    cacheLife("hours");
  }

  const ipd: Record<string, Num> = ipdRows[0] ?? {};

  return {
    fiscalYear,
    periodStart: range.start,
    periodEnd: range.end,
    closed,
    clinic: { depcode: PT_DEPCODE, name: CLINIC_NAME },
    persons,
    visits: total.visits,
    depVisits: total.depVisits,
    newPersons: cn("new_persons"),
    elderlyPersons: cn("elderly"),
    money: money(total),
    ptBahtPerVisit: per(total.ptBaht, total.visits),
    itemQty,
    payGroups,
    months,
    items,
    diagnoses,
    bands,
    indicators,
    imc,
    imcFollowUpDays: PT_IMC_FOLLOWUP_DAYS,
    wait,
    workload: {
      serviceDays: year.days,
      avgVisitsPerDay: per(year.visits, year.days),
      maxVisitsPerDay: year.max,
      therapists: yearTherapists,
      avgTherapistsPerDay: per(year.therapists, year.days),
      visitsPerTherapistDay: per(year.therapistVisits, year.therapists),
      appointments: year.appts,
      appointmentsKept: year.kept,
      appointmentsKeptPercent: pct(year.kept, year.appts),
    },
    ipd: {
      admissions: num(ipd.admissions),
      persons: num(ipd.persons),
      sessions: num(ipd.sessions),
      items: num(ipd.items),
      baht: round2(num(ipd.baht)),
    },
    updatedAt: new Date().toISOString(),
  };
}
