import "server-only";

import type { RowDataPacket } from "mysql2";
import { cacheLife, cacheTag, io } from "next/cache";

import { query } from "@/lib/db/his";
import type {
  DentalAgeRow,
  DentalCategoryCode,
  DentalCategoryRow,
  DentalClinicSummary,
  DentalIndicator,
  DentalItemRow,
  DentalMoney,
  DentalMonthRow,
  DentalPayGroupRow,
  DentalSchemeCode,
  DentalSchemeRow,
  DentalUnitCode,
  DentalUnitRow,
  DentalWorkload,
} from "@/lib/kpi/dental-clinic-types";
import { fiscalYearRange, todayIsoDate } from "@/lib/kpi/fiscal-year";
import { type Num, num } from "@/lib/kpi/ppfs-common";
import {
  DENTAL_AGE_GROUPS,
  DENTAL_CATEGORIES,
  DENTAL_COHORT_SQL,
  DENTAL_DAYS_SQL,
  DENTAL_DM_SQL,
  DENTAL_HOSPITAL_DEPCODE,
  DENTAL_OUTREACH_DEPCODE,
  DENTAL_PROCEDURES_SQL,
  DENTAL_VISITS_SQL,
  DENTAL_WAIT_SQL,
  dentalClinicParams,
} from "@/lib/kpi/sql/dental-clinic-hosxp";
import {
  CLINIC_SCHEME_INDEX,
  PAY_GROUPS,
  SCHEME_NAMES,
  isSchemeCode,
  payGroupOf,
} from "@/lib/kpi/sql/clinic-scheme-hosxp";

/**
 * "คลินิกทันตกรรม" (/clinic/dental) — the hospital's dental rooms (008 in
 * the hospital, 046 outreach; PCU excluded): people, procedures, charges
 * by scheme, workload and quality. HOSxP only (never HDC), aggregates
 * only. Definitions: docs/kpi/dental-clinic.md. SQL: ./sql/dental-clinic-hosxp.ts.
 */

export const DENTAL_CLINIC_CACHE_TAG = "kpi:dental-clinic";

const CLINIC_NAME = "กลุ่มงานทันตกรรม โรงพยาบาลบางระกำ";

const UNITS: readonly { code: DentalUnitCode; name: string; depcodes: readonly string[] }[] = [
  { code: "HOSPITAL", name: "ห้องตรวจทันตกรรม (ในโรงพยาบาล)", depcodes: [DENTAL_HOSPITAL_DEPCODE] },
  { code: "OUTREACH", name: "ห้องฟันออกหน่วย (โรงเรียน/ชุมชน)", depcodes: [DENTAL_OUTREACH_DEPCODE] },
];

/** Items shown in the "most frequent" list (exam / OHI / medication left out: free, on almost every visit). */
const TOP_ITEMS = 15;
const TOP_EXCLUDED: readonly DentalCategoryCode[] = ["EXAM", "OHI", "ORAL_MED"];

// --- rows -------------------------------------------------------------------

interface VisitRow extends RowDataPacket {
  ym: string;
  scheme_code: string;
  unit: DentalUnitCode | "PCU";
  src: "DENTAL" | "REFERRED";
  visits: Num;
  treat_visits: Num;
  procs: Num;
  baht: Num;
  dental_baht: Num;
  prosthesis_baht: Num;
  procedure_baht: Num;
  drug_baht: Num;
  xray_baht: Num;
  other_dep_baht: Num;
}

type OneRow = RowDataPacket & Record<string, Num>;

interface ProcRow extends RowDataPacket {
  cat: DentalCategoryCode | null;
  tmcode: string | null;
  op: string | null;
  item: string | null;
  n: Num;
  teeth: Num;
  visits: Num;
  persons: Num;
  fee: Num;
}

interface DayRow extends RowDataPacket {
  unit: DentalUnitCode | null;
  d: string | null;
  visits: Num;
  procs: Num;
  staff: Num;
  staff_visits: Num;
  appts: Num;
  appts_kept: Num;
}

// --- helpers ------------------------------------------------------------------

const numOrNull = (v: Num | undefined): number | null =>
  v === null || v === undefined ? null : num(v);
const round1 = (x: number) => Math.round(x * 10) / 10;
const round2 = (x: number) => Math.round(x * 100) / 100;
const pct = (n: number, d: number): number | null => (d > 0 ? round1((n / d) * 100) : null);
const per = (n: number, d: number): number => (d > 0 ? round2(n / d) : 0);

interface Acc {
  visits: number;
  treatVisits: number;
  procs: number;
  baht: number;
  dentalFeeBaht: number;
  prosthesisBaht: number;
  procedureBaht: number;
  drugBaht: number;
  xrayBaht: number;
}

const emptyAcc = (): Acc => ({
  visits: 0,
  treatVisits: 0,
  procs: 0,
  baht: 0,
  dentalFeeBaht: 0,
  prosthesisBaht: 0,
  procedureBaht: 0,
  drugBaht: 0,
  xrayBaht: 0,
});

function addRow(a: Acc, r: VisitRow): void {
  a.visits += num(r.visits);
  a.treatVisits += num(r.treat_visits);
  a.procs += num(r.procs);
  a.baht += num(r.baht);
  a.dentalFeeBaht += num(r.dental_baht);
  a.prosthesisBaht += num(r.prosthesis_baht);
  a.procedureBaht += num(r.procedure_baht);
  a.drugBaht += num(r.drug_baht);
  a.xrayBaht += num(r.xray_baht);
}

function addAcc(a: Acc, x: Acc): void {
  for (const k of Object.keys(a) as (keyof Acc)[]) a[k] += x[k];
}

function money(a: Acc): DentalMoney {
  const known = a.dentalFeeBaht + a.prosthesisBaht + a.procedureBaht + a.drugBaht + a.xrayBaht;
  return {
    baht: round2(a.baht),
    dentalFeeBaht: round2(a.dentalFeeBaht),
    prosthesisBaht: round2(a.prosthesisBaht),
    procedureBaht: round2(a.procedureBaht),
    drugBaht: round2(a.drugBaht),
    xrayBaht: round2(a.xrayBaht),
    otherBaht: round2(Math.max(0, a.baht - known)),
  };
}

function indicator(
  d: Omit<DentalIndicator, "percent" | "pass">,
): DentalIndicator {
  const percent = pct(d.numerator, d.denominator);
  let pass: boolean | null = null;
  if (percent !== null && d.target !== null && d.targetOperator !== null) {
    pass = d.targetOperator === ">=" ? percent >= d.target : percent <= d.target;
  }
  return { ...d, percent, pass };
}

/** ICD-10-TM: 3rd character 8 = permanent tooth, 7 = primary tooth. */
const toothSet = (op: string): "PERMANENT" | "PRIMARY" | null =>
  op.charAt(2) === "8" ? "PERMANENT" : op.charAt(2) === "7" ? "PRIMARY" : null;
/** Definitive restorations (23x71*): excludes temporary filling 2387211 and pulp capping 2387210. */
const isDefinitiveFilling = (op: string) => /^23[78]71/.test(op);

// --- loader -------------------------------------------------------------------

/**
 * Rendering contract identical to getNcdClinicSummary: `await io()` first,
 * render the caller inside <Suspense>; cached per fiscal year ("hours"
 * running year, "days" closed year). Six queries in parallel; a failure
 * throws (the page shows an error, nothing is cached). Invalidate with
 * revalidateTag(DENTAL_CLINIC_CACHE_TAG).
 */
export async function getDentalClinicSummary(fiscalYear: number): Promise<DentalClinicSummary> {
  await io();
  const closed = todayIsoDate() > fiscalYearRange(fiscalYear).end;
  return loadDentalClinicSummary(fiscalYear, closed);
}

async function loadDentalClinicSummary(
  fiscalYear: number,
  closed: boolean,
): Promise<DentalClinicSummary> {
  "use cache";
  cacheTag(DENTAL_CLINIC_CACHE_TAG);

  const range = fiscalYearRange(fiscalYear);
  const params = dentalClinicParams(range.start, range.end);
  const [visitRows, cohortRows, procRows, dayRows, waitRows, dmRows] = await Promise.all([
    query<VisitRow>(DENTAL_VISITS_SQL, params),
    query<OneRow>(DENTAL_COHORT_SQL, params),
    query<ProcRow>(DENTAL_PROCEDURES_SQL, params),
    query<DayRow>(DENTAL_DAYS_SQL, params),
    query<OneRow>(DENTAL_WAIT_SQL, params),
    query<OneRow>(DENTAL_DM_SQL, params),
  ]);
  const c: Record<string, Num> = cohortRows[0] ?? {};
  const cn = (col: string) => num(c[col]);

  // --- visits and money by scheme / month / unit
  const byScheme = new Map<DentalSchemeCode, Acc>(CLINIC_SCHEME_INDEX.map((s) => [s, emptyAcc()]));
  const byMonth = new Map<string, { FULL: Acc; CAPITATION: Acc; HOSPITAL: number; OUTREACH: number }>(
    range.months.map((m) => [m, { FULL: emptyAcc(), CAPITATION: emptyAcc(), HOSPITAL: 0, OUTREACH: 0 }]),
  );
  const byUnit = new Map<DentalUnitCode, Acc & { referred: number }>(
    UNITS.map((u) => [u.code, { ...emptyAcc(), referred: 0 }]),
  );
  const total = emptyAcc();
  const pcu = emptyAcc();
  let registeredOtherBaht = 0;
  for (const r of visitRows) {
    if (r.unit === "PCU") {
      addRow(pcu, r);
      continue;
    }
    const code: DentalSchemeCode = isSchemeCode(r.scheme_code) ? r.scheme_code : "OTHER";
    addRow(byScheme.get(code)!, r);
    const m = byMonth.get(r.ym);
    if (m) {
      addRow(m[payGroupOf(code)], r);
      m[r.unit] += num(r.visits);
    }
    const u = byUnit.get(r.unit);
    if (u) {
      addRow(u, r);
      if (r.src === "REFERRED") u.referred += num(r.visits);
    }
    addRow(total, r);
    if (r.src === "DENTAL") registeredOtherBaht += num(r.other_dep_baht);
  }

  const schemeRow = (code: DentalSchemeCode): DentalSchemeRow => {
    const a = byScheme.get(code)!;
    return {
      code,
      name: SCHEME_NAMES[code],
      payGroup: payGroupOf(code),
      persons: cn(`s${CLINIC_SCHEME_INDEX.indexOf(code)}`),
      visits: a.visits,
      bahtPerVisit: per(a.baht, a.visits),
      ...money(a),
    };
  };

  const payGroups: DentalPayGroupRow[] = PAY_GROUPS.map((g) => {
    const codes = CLINIC_SCHEME_INDEX.filter((s) => payGroupOf(s) === g.code);
    const a = emptyAcc();
    for (const s of codes) addAcc(a, byScheme.get(s)!);
    return {
      ...g,
      persons: cn(g.code === "FULL" ? "pay_full" : "pay_capitation"),
      visits: a.visits,
      bahtPerVisit: per(a.baht, a.visits),
      ...money(a),
      schemes: codes.map(schemeRow),
    };
  });

  // --- days / workload
  const unitYear = new Map<string, DayRow>();
  const days = { HOSPITAL: [] as DayRow[], OUTREACH: [] as DayRow[] };
  let appointments = 0;
  let appointmentsKept = 0;
  for (const r of dayRows) {
    if (r.d === null) {
      if (r.unit !== null) unitYear.set(r.unit, r);
      continue;
    }
    appointments += num(r.appts);
    appointmentsKept += num(r.appts_kept);
    if (r.unit && num(r.visits) > 0) days[r.unit].push(r);
  }
  const hDays = days.HOSPITAL;
  const oDays = days.OUTREACH;
  const sumOf = (rows: DayRow[], k: "visits" | "procs" | "staff" | "staff_visits") =>
    rows.reduce((s, r) => s + num(r[k]), 0);
  const hVisits = sumOf(hDays, "visits");
  const staffDays = sumOf(hDays, "staff");
  const workload: DentalWorkload = {
    clinicDays: hDays.length,
    avgVisitsPerDay: per(hVisits, hDays.length),
    maxVisitsPerDay: Math.max(0, ...hDays.map((r) => num(r.visits))),
    avgProceduresPerDay: per(sumOf(hDays, "procs"), hDays.length),
    staff: num(unitYear.get("HOSPITAL")?.staff),
    avgStaffPerDay: per(staffDays, hDays.length),
    visitsPerStaffDay: per(sumOf(hDays, "staff_visits"), staffDays),
    outreachDays: oDays.length,
    outreachVisitsPerDay: per(sumOf(oDays, "visits"), oDays.length),
    outreachStaff: num(unitYear.get("OUTREACH")?.staff),
    appointments,
    appointmentsKept,
    appointmentsKeptPercent: pct(appointmentsKept, appointments),
  };

  const units: DentalUnitRow[] = UNITS.map((u) => {
    const a = byUnit.get(u.code)!;
    const nDays = days[u.code].length;
    return {
      code: u.code,
      name: u.name,
      depcodes: u.depcodes,
      persons: cn(u.code === "HOSPITAL" ? "hospital" : "outreach"),
      visits: a.visits,
      referredVisits: a.referred,
      treatmentVisits: a.treatVisits,
      procedures: a.procs,
      days: nDays,
      visitsPerDay: per(a.visits, nDays),
      baht: round2(a.baht),
      bahtPerVisit: per(a.baht, a.visits),
    };
  });

  const months: DentalMonthRow[] = range.months.map((month, i) => {
    const g = byMonth.get(month)!;
    const a = emptyAcc();
    addAcc(a, g.FULL);
    addAcc(a, g.CAPITATION);
    return {
      month,
      persons: cn(`m${i}`),
      visits: a.visits,
      hospitalVisits: g.HOSPITAL,
      outreachVisits: g.OUTREACH,
      procedures: a.procs,
      baht: round2(a.baht),
      fullVisits: g.FULL.visits,
      fullBaht: round2(g.FULL.baht),
      capitationVisits: g.CAPITATION.visits,
      capitationBaht: round2(g.CAPITATION.baht),
    };
  });

  // --- procedures
  const catRows = new Map<string, ProcRow>();
  const itemRows: ProcRow[] = [];
  let procTotal: ProcRow | undefined;
  for (const r of procRows) {
    if (r.cat === null) procTotal = r;
    else if (r.tmcode === null) catRows.set(r.cat, r);
    else itemRows.push(r);
  }
  const categories: DentalCategoryRow[] = DENTAL_CATEGORIES.map((cat) => {
    const r = catRows.get(cat.code);
    return {
      code: cat.code,
      name: cat.name,
      kind: cat.kind,
      procedures: num(r?.n),
      teeth: num(r?.teeth),
      visits: num(r?.visits),
      persons: num(r?.persons),
      feeBaht: round2(num(r?.fee)),
    };
  });
  const topItems: DentalItemRow[] = itemRows
    .filter((r) => !TOP_EXCLUDED.includes(r.cat ?? "OTHER"))
    .map((r) => ({
      tmcode: r.tmcode ?? "",
      name: r.item ?? r.tmcode ?? "",
      icd10tm: r.op ?? "",
      category: r.cat ?? "OTHER",
      procedures: num(r.n),
      teeth: num(r.teeth),
      visits: num(r.visits),
      persons: num(r.persons),
      feeBaht: round2(num(r.fee)),
    }))
    .sort((a, b) => b.procedures - a.procedures || b.feeBaht - a.feeBaht)
    .slice(0, TOP_ITEMS);

  const teethOf = (cat: DentalCategoryCode, set: "PERMANENT" | "PRIMARY", definitive: boolean) =>
    itemRows
      .filter(
        (r) =>
          r.cat === cat &&
          toothSet(r.op ?? "") === set &&
          (!definitive || isDefinitiveFilling(r.op ?? "")),
      )
      .reduce((s, r) => s + num(r.teeth), 0);
  const fillingTeeth = teethOf("FILLING", "PERMANENT", true);
  const extractionTeeth = teethOf("EXTRACTION", "PERMANENT", false);

  // --- ages
  const ages: DentalAgeRow[] = DENTAL_AGE_GROUPS.map((g, i) => ({
    code: g.code,
    name: g.name,
    persons: cn(`a${i}`),
    visits: cn(`a${i}_visits`),
  }));

  // --- quality
  const persons = cn("persons");
  const elders = cn(`a${DENTAL_AGE_GROUPS.length - 1}`);
  const dm: Record<string, Num> = dmRows[0] ?? {};
  const indicators: DentalIndicator[] = [
    indicator({
      code: "DM_ORAL_CARE",
      name: "ผู้ป่วยเบาหวานคลินิก NCD ได้รับบริการทันตกรรม/ตรวจช่องปากในปีงบฯ",
      numerator: num(dm.dm_dental),
      denominator: num(dm.dm),
      target: null,
      targetOperator: null,
      targetSource: null,
      unit: "คน",
      definition:
        "ผู้ป่วย DM ของคลินิก NCD (ICD-10 E10–E14 ใน visit คลินิก 062/047 นิยามเดียวกับหน้าคลินิกโรคเรื้อรัง) ที่มีหัตถการทันตกรรม (dtmain) อย่างน้อย 1 รายการในปีงบฯ ทุกห้องฟันรวม PCU ÷ ผู้ป่วย DM ของคลินิก NCD",
    }),
    indicator({
      code: "TREATED_PERSONS",
      name: "ผู้รับบริการที่ได้รับการรักษา (นอกเหนือจากตรวจ/ส่งเสริมป้องกัน)",
      numerator: cn("treated"),
      denominator: persons,
      target: null,
      targetOperator: null,
      targetSource: null,
      unit: "คน",
      definition:
        "คนที่มีหัตถการกลุ่มรักษา (อุด ถอน ขูดหินน้ำลาย รักษาราก ฟันเทียม ศัลยกรรม ให้ยา) อย่างน้อย 1 รายการ ÷ ผู้รับบริการทันตกรรมทั้งหมด",
    }),
    indicator({
      code: "TREATMENT_VISITS",
      name: "visit ที่มีการรักษา",
      numerator: total.treatVisits,
      denominator: total.visits,
      target: null,
      targetOperator: null,
      targetSource: null,
      unit: "ครั้ง",
      definition:
        "visit ที่มีหัตถการกลุ่มรักษาอย่างน้อย 1 รายการ ÷ visit ทันตกรรมทั้งหมด ที่เหลือคือ visit ตรวจ/คัดกรอง/ทันตสุขศึกษา/ฟลูออไรด์/sealant อย่างเดียว (ส่วนใหญ่เป็นงานออกหน่วยและการคัดกรองผู้ป่วย NCD)",
    }),
    indicator({
      code: "ELDER_DENTURE",
      name: "ผู้สูงอายุ (60+) ที่มารับบริการ ได้รับฟันเทียมถอดได้",
      numerator: cn("elder_denture"),
      denominator: elders,
      target: null,
      targetOperator: null,
      targetSource: null,
      unit: "คน",
      definition:
        "ผู้รับบริการอายุ 60 ปีขึ้นไป (ณ วันรับบริการ) ที่มีรายการฟันเทียมถอดได้บางส่วน/ทั้งปาก (กลุ่ม dttm 950–970) ในปีงบฯ ÷ ผู้รับบริการอายุ 60 ปีขึ้นไป",
    }),
    indicator({
      code: "APPOINTMENT_KEPT",
      name: "มาตามนัดห้องทันตกรรม",
      numerator: appointmentsKept,
      denominator: appointments,
      target: null,
      targetOperator: null,
      targetSource: null,
      unit: "ครั้ง",
      definition:
        "นัดของห้องตรวจทันตกรรม (oapp depcode 008) ที่ถึงวันนัดแล้วในปีงบฯ และมี visit ตามนัด (visit_vn) ÷ นัดทั้งหมดที่ถึงวันนัด",
    }),
  ];

  const w: Record<string, Num> = waitRows[0] ?? {};
  const measured = num(w.measured);

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
    clinic: { name: CLINIC_NAME },
    persons,
    visits: total.visits,
    procedures: num(procTotal?.n),
    treatmentVisits: total.treatVisits,
    nonTreatmentVisits: total.visits - total.treatVisits,
    treatedPersons: cn("treated"),
    money: money(total),
    bahtPerVisit: per(total.baht, total.visits),
    registeredOtherBaht: round2(registeredOtherBaht),
    units,
    excludedPcu: { visits: pcu.visits, baht: round2(pcu.baht) },
    payGroups,
    months,
    categories,
    topItems,
    ages,
    fillingRatio: {
      fillingTeeth,
      extractionTeeth,
      ratio: extractionTeeth > 0 ? round2(fillingTeeth / extractionTeeth) : null,
      primaryFillingTeeth: teethOf("FILLING", "PRIMARY", true),
      primaryExtractionTeeth: teethOf("EXTRACTION", "PRIMARY", false),
    },
    indicators,
    workload,
    waiting: {
      visits: num(w.visits),
      measured,
      medianMinutes: numOrNull(w.median_min),
      meanMinutes: numOrNull(w.mean_min),
      p90Minutes: numOrNull(w.p90_min),
      within60Percent: pct(num(w.within60), measured),
    },
    updatedAt: new Date().toISOString(),
  };
}
