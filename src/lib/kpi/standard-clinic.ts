import "server-only";

import type { RowDataPacket } from "mysql2";
import { cacheLife, cacheTag, io } from "next/cache";

import { query } from "@/lib/db/his";
import { DEPARTMENT_NAMES, clinicUnits, findStandardClinic } from "@/lib/kpi/clinic-registry";
import type { ClinicPayGroupCode, ClinicSchemeCode } from "@/lib/kpi/clinic-scheme-types";
import { fiscalYearRange, todayIsoDate } from "@/lib/kpi/fiscal-year";
import { type Num, num } from "@/lib/kpi/ppfs-common";
import {
  CLINIC_SCHEME_INDEX,
  PAY_GROUPS,
  SCHEME_NAMES,
  isSchemeCode,
  payGroupOf,
  schemesOf,
} from "@/lib/kpi/sql/clinic-scheme-hosxp";
import { standardClinicParams, standardClinicSql } from "@/lib/kpi/sql/standard-clinic-hosxp";
import type {
  StandardClinicSummary,
  StdCategoryRow,
  StdDepartmentRow,
  StdItemRow,
  StdMoney,
  StdMonthRow,
  StdPayGroupRow,
  StdUnitRow,
  StdWorkload,
} from "@/lib/kpi/standard-clinic-types";

/**
 * Standard clinic page (/clinic/[clinic]): people, charges by scheme,
 * sub-units, charge groups, items, diagnoses, workload and months of a
 * "standard" clinic of the registry (visits = ovst.main_dep IN depcodes).
 * HOSxP only (never HDC), aggregates only. Definitions:
 * docs/kpi/clinic-standard.md. SQL: ./sql/standard-clinic-hosxp.ts.
 */

export const STANDARD_CLINIC_CACHE_TAG = "kpi:standard-clinic";

// --- rows -------------------------------------------------------------------

interface VisitRow extends RowDataPacket {
  ym: string;
  dep: string;
  scheme_code: string;
  visits: Num;
  baht: Num;
  drug_baht: Num;
  lab_baht: Num;
  xray_baht: Num;
  procedure_baht: Num;
  dental_baht: Num;
  rehab_baht: Num;
  paid_baht: Num;
  no_pdx_visits: Num;
}

/** One row: persons, m0..m11, s0..s9, pay_full, pay_capitation, d<i>, u<i>. */
type CohortRow = RowDataPacket & Record<string, Num>;

interface DayRow extends RowDataPacket {
  d: string | null;
  visits: Num;
  physicians: Num;
  phys_visits: Num;
  providers: Num;
  appts: Num;
  appts_kept: Num;
}

interface ItemRowDb extends RowDataPacket {
  icode: string;
  qty: Num;
  visits: Num;
  baht: Num;
  nondrug_baht: Num;
  nondrug_items: Num;
  item_name: string | null;
  income_name: string | null;
}

interface PdxRowDb extends RowDataPacket {
  pdx: string;
  visits: Num;
  persons: Num;
  dx_name: string | null;
}

// --- helpers ------------------------------------------------------------------

const round1 = (x: number) => Math.round(x * 10) / 10;
const round2 = (x: number) => Math.round(x * 100) / 100;
const pct = (n: number, d: number): number | null => (d > 0 ? round1((n / d) * 100) : null);
const per = (n: number, d: number): number => (d > 0 ? round2(n / d) : 0);

interface Acc {
  visits: number;
  baht: number;
  drugBaht: number;
  labBaht: number;
  xrayBaht: number;
  procedureBaht: number;
  dentalBaht: number;
  rehabBaht: number;
  paidBaht: number;
}

const emptyAcc = (): Acc => ({
  visits: 0,
  baht: 0,
  drugBaht: 0,
  labBaht: 0,
  xrayBaht: 0,
  procedureBaht: 0,
  dentalBaht: 0,
  rehabBaht: 0,
  paidBaht: 0,
});

function addRow(a: Acc, r: VisitRow): void {
  a.visits += num(r.visits);
  a.baht += num(r.baht);
  a.drugBaht += num(r.drug_baht);
  a.labBaht += num(r.lab_baht);
  a.xrayBaht += num(r.xray_baht);
  a.procedureBaht += num(r.procedure_baht);
  a.dentalBaht += num(r.dental_baht);
  a.rehabBaht += num(r.rehab_baht);
  a.paidBaht += num(r.paid_baht);
}

function addAcc(a: Acc, x: Acc): void {
  for (const k of Object.keys(a) as (keyof Acc)[]) a[k] += x[k];
}

function money(a: Acc): StdMoney {
  const known =
    a.drugBaht + a.labBaht + a.xrayBaht + a.procedureBaht + a.dentalBaht + a.rehabBaht;
  return {
    baht: round2(a.baht),
    drugBaht: round2(a.drugBaht),
    labBaht: round2(a.labBaht),
    xrayBaht: round2(a.xrayBaht),
    procedureBaht: round2(a.procedureBaht),
    dentalBaht: round2(a.dentalBaht),
    rehabBaht: round2(a.rehabBaht),
    otherBaht: round2(Math.max(0, a.baht - known)),
    paidBaht: round2(a.paidBaht),
  };
}

const CATEGORIES: readonly { code: StdCategoryRow["code"]; name: string; key: keyof StdMoney }[] = [
  { code: "DRUG", name: "ยาและเวชภัณฑ์", key: "drugBaht" },
  { code: "LAB", name: "ตรวจทางห้องปฏิบัติการ (lab)", key: "labBaht" },
  { code: "XRAY", name: "รังสีวิทยา", key: "xrayBaht" },
  { code: "PROCEDURE", name: "หัตถการ / วิสัญญี", key: "procedureBaht" },
  { code: "DENTAL", name: "ทันตกรรม (ทำใน visit นี้)", key: "dentalBaht" },
  { code: "REHAB", name: "กายภาพ / เวชกรรมฟื้นฟู (ทำใน visit นี้)", key: "rehabBaht" },
  { code: "OTHER", name: "อื่นๆ (ค่าบริการ พยาบาล เวชภัณฑ์มิใช่ยา อุปกรณ์ ฯลฯ)", key: "otherBaht" },
];

// --- loader -------------------------------------------------------------------

/**
 * Rendering contract identical to getNcdClinicSummary: `await io()` first,
 * render the caller inside <Suspense>; cached per (clinic, fiscal year)
 * ("hours" running year, "days" closed year). Five queries in parallel; a
 * failure throws (the page shows an error, nothing is cached). Unknown /
 * special slug -> null. Invalidate with revalidateTag(STANDARD_CLINIC_CACHE_TAG).
 */
export async function getStandardClinicSummary(
  slug: string,
  fiscalYear: number,
): Promise<StandardClinicSummary | null> {
  await io();
  if (!findStandardClinic(slug)) return null;
  const closed = todayIsoDate() > fiscalYearRange(fiscalYear).end;
  return loadStandardClinicSummary(slug, fiscalYear, closed);
}

async function loadStandardClinicSummary(
  slug: string,
  fiscalYear: number,
  closed: boolean,
): Promise<StandardClinicSummary> {
  "use cache";
  cacheTag(STANDARD_CLINIC_CACHE_TAG, `${STANDARD_CLINIC_CACHE_TAG}:${slug}`);

  const clinic = findStandardClinic(slug);
  if (!clinic) throw new Error(`unknown standard clinic: ${slug}`);
  const sql = standardClinicSql(clinic);
  const range = fiscalYearRange(fiscalYear);
  const params = standardClinicParams(range.start, range.end);
  const [visitRows, cohortRows, dayRows, itemRows, pdxRows] = await Promise.all([
    query<VisitRow>(sql.visits, params),
    query<CohortRow>(sql.cohort, params),
    query<DayRow>(sql.days, params),
    query<ItemRowDb>(sql.items, params),
    query<PdxRowDb>(sql.pdx, params),
  ]);
  const c: Record<string, Num> = cohortRows[0] ?? {};
  const cn = (col: string) => num(c[col]);

  // --- visits and money by scheme / month / department
  const total = emptyAcc();
  const byScheme = new Map<ClinicSchemeCode, Acc>(CLINIC_SCHEME_INDEX.map((s) => [s, emptyAcc()]));
  const byMonth = new Map<string, Record<ClinicPayGroupCode, Acc>>(
    range.months.map((m) => [m, { FULL: emptyAcc(), CAPITATION: emptyAcc() }]),
  );
  const byDep = new Map<string, Acc>(clinic.depcodes.map((d) => [d, emptyAcc()]));
  let noPdxVisits = 0;
  for (const r of visitRows) {
    const code: ClinicSchemeCode = isSchemeCode(r.scheme_code) ? r.scheme_code : "OTHER";
    addRow(total, r);
    addRow(byScheme.get(code)!, r);
    const m = byMonth.get(r.ym);
    if (m) addRow(m[payGroupOf(code)], r);
    const d = byDep.get(r.dep);
    if (d) addRow(d, r);
    noPdxVisits += num(r.no_pdx_visits);
  }

  const payGroups: StdPayGroupRow[] = PAY_GROUPS.map((g) => {
    const codes = schemesOf(g.code);
    const a = emptyAcc();
    for (const s of codes) addAcc(a, byScheme.get(s)!);
    return {
      ...g,
      persons: cn(g.code === "FULL" ? "pay_full" : "pay_capitation"),
      visits: a.visits,
      bahtPerVisit: per(a.baht, a.visits),
      ...money(a),
      schemes: codes.map((code) => {
        const s = byScheme.get(code)!;
        return {
          code,
          name: SCHEME_NAMES[code],
          payGroup: g.code,
          persons: cn(`s${CLINIC_SCHEME_INDEX.indexOf(code)}`),
          visits: s.visits,
          bahtPerVisit: per(s.baht, s.visits),
          ...money(s),
        };
      }),
    };
  });

  // --- sub-units / departments
  const department = (depcode: string): StdDepartmentRow => {
    const a = byDep.get(depcode)!;
    return {
      depcode,
      name: DEPARTMENT_NAMES[depcode] ?? depcode,
      persons: cn(`d${clinic.depcodes.indexOf(depcode)}`),
      visits: a.visits,
      baht: round2(a.baht),
      bahtPerVisit: per(a.baht, a.visits),
    };
  };
  const units: StdUnitRow[] = clinicUnits(clinic).map((u, i) => {
    const a = emptyAcc();
    for (const d of u.depcodes) addAcc(a, byDep.get(d)!);
    return {
      name: u.name,
      persons: cn(`u${i}`),
      visits: a.visits,
      baht: round2(a.baht),
      bahtPerVisit: per(a.baht, a.visits),
      departments: u.depcodes.length > 1 ? u.depcodes.map(department) : [],
    };
  });

  // --- charge groups
  const totalMoney = money(total);
  const categories: StdCategoryRow[] = CATEGORIES.map((g) => ({
    code: g.code,
    name: g.name,
    baht: totalMoney[g.key],
    percent: pct(totalMoney[g.key], totalMoney.baht),
  }));

  // --- items
  const drugRow = itemRows.find((r) => r.icode === "DRUG");
  const top: StdItemRow[] = itemRows
    .filter((r) => r.icode !== "DRUG")
    .map((r) => ({
      icode: r.icode,
      name: r.item_name ?? r.icode,
      category: (r.income_name ?? "").replace(/^\S*\d+\s*/, ""),
      qty: num(r.qty),
      visits: num(r.visits),
      baht: round2(num(r.baht)),
    }));
  const anyItem = itemRows[0];

  // --- days: workload and appointments
  let yearPhysicians = 0;
  let yearProviders = 0;
  let physicianDays = 0;
  let providerDays = 0;
  let physVisits = 0;
  let appointments = 0;
  let appointmentsKept = 0;
  let appointmentDays = 0;
  let clinicDays = 0;
  let maxVisitsPerDay = 0;
  const dayStats = new Map<string, { days: number; max: number; appts: number; kept: number }>(
    range.months.map((m) => [m, { days: 0, max: 0, appts: 0, kept: 0 }]),
  );
  for (const r of dayRows) {
    if (r.d === null) {
      yearPhysicians = num(r.physicians); // WITH ROLLUP row
      yearProviders = num(r.providers);
      continue;
    }
    const visits = num(r.visits);
    const appts = num(r.appts);
    const ms = dayStats.get(r.d.slice(0, 7));
    physicianDays += num(r.physicians);
    providerDays += num(r.providers);
    physVisits += num(r.phys_visits);
    appointments += appts;
    appointmentsKept += num(r.appts_kept);
    if (appts > 0) appointmentDays += 1;
    if (ms) {
      ms.appts += appts;
      ms.kept += num(r.appts_kept);
    }
    if (visits > 0) {
      clinicDays += 1;
      maxVisitsPerDay = Math.max(maxVisitsPerDay, visits);
      if (ms) {
        ms.days += 1;
        ms.max = Math.max(ms.max, visits);
      }
    }
  }
  const workload: StdWorkload = {
    clinicDays,
    avgVisitsPerDay: per(total.visits, clinicDays),
    maxVisitsPerDay,
    physicians: yearPhysicians,
    avgPhysiciansPerDay: per(physicianDays, clinicDays),
    visitsPerPhysicianDay: per(physVisits, physicianDays),
    physicianVisitPercent: pct(physVisits, total.visits),
    providers: yearProviders,
    avgProvidersPerDay: per(providerDays, clinicDays),
    appointments,
    appointmentsKept,
    appointmentsKeptPercent: pct(appointmentsKept, appointments),
    appointmentDays,
  };

  const months: StdMonthRow[] = range.months.map((month, i) => {
    const g = byMonth.get(month)!;
    const ds = dayStats.get(month)!;
    const visits = g.FULL.visits + g.CAPITATION.visits;
    return {
      month,
      persons: cn(`m${i}`),
      visits,
      baht: round2(g.FULL.baht + g.CAPITATION.baht),
      fullVisits: g.FULL.visits,
      fullBaht: round2(g.FULL.baht),
      capitationVisits: g.CAPITATION.visits,
      capitationBaht: round2(g.CAPITATION.baht),
      clinicDays: ds.days,
      visitsPerDay: per(visits, ds.days),
      maxVisitsPerDay: ds.max,
      appointments: ds.appts,
      appointmentsKept: ds.kept,
    };
  });

  // Exactly one cacheLife call per invocation (see cacheLife docs).
  if (closed) {
    cacheLife("days");
  } else {
    cacheLife("hours");
  }

  return {
    slug: clinic.slug,
    label: clinic.label,
    note: clinic.note,
    depcodes: clinic.depcodes,
    fiscalYear,
    periodStart: range.start,
    periodEnd: range.end,
    closed,
    persons: cn("persons"),
    visits: total.visits,
    money: totalMoney,
    bahtPerVisit: per(total.baht, total.visits),
    noPdxVisits,
    payGroups,
    units,
    categories,
    items: {
      drug: {
        qty: num(drugRow?.qty),
        visits: num(drugRow?.visits),
        baht: round2(num(drugRow?.baht)),
      },
      top,
      nondrugBaht: round2(num(anyItem?.nondrug_baht)),
      nondrugItems: num(anyItem?.nondrug_items),
    },
    pdx: pdxRows.map((r) => ({
      code: r.pdx,
      name: r.dx_name ?? "",
      visits: num(r.visits),
      persons: num(r.persons),
    })),
    workload,
    months,
    updatedAt: new Date().toISOString(),
  };
}
