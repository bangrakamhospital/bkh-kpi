import "server-only";

import type { RowDataPacket } from "mysql2";
import { cacheLife, cacheTag, io } from "next/cache";

import { query } from "@/lib/db/his";
import type {
  DrugDeliveryCounts,
  DrugDeliveryMonthRow,
  DrugDeliverySchemeCode,
  DrugDeliverySchemeRow,
  DrugDeliverySummary,
} from "@/lib/kpi/drug-delivery-types";
import { fiscalYearRange, todayIsoDate } from "@/lib/kpi/fiscal-year";
import { PTTYPE_GROUPS } from "@/lib/kpi/overview";
import { type Num, num } from "@/lib/kpi/ppfs-common";
import { DRUG_DELIVERY_SQL, drugDeliveryParams } from "@/lib/kpi/sql/drug-delivery-hosxp";

/**
 * "ค่าส่งยาที่บ้าน" (/delivery) — home drug delivery (postal parcel and
 * Health Rider), every insurance scheme, HOSxP only, aggregates only.
 * Definitions: docs/kpi/drug-delivery.md. SQL: ./sql/drug-delivery-hosxp.ts.
 * Independent of the UC-only /pp/other items (./nhso-other.ts).
 */

export const DRUG_DELIVERY_CACHE_TAG = "kpi:drug-delivery";

/** Price of both delivery items in HOSxP (nondrugitems.price, every scheme). */
const DELIVERY_FEE_BAHT = 50;

/**
 * Scheme groups: pttype.hipdata_code membership from PTTYPE_GROUPS
 * (overview.ts) for UC / SSS (incl. SSI) / OFC / LGO / CSH; every other
 * code (NRD/NRH, INS, BKK/BMT/SRT/PTY/PVT/STP/A2, blank) is "อื่นๆ".
 */
const SCHEMES: readonly {
  code: DrugDeliverySchemeCode;
  name: string;
  payer: string;
}[] = [
  { code: "UC", name: "UC / บัตรทอง", payer: "เบิก สปสช. (ADP DRUGP)" },
  { code: "SSS", name: "ประกันสังคม", payer: "ผู้ป่วย / กองทุนของสิทธิ" },
  { code: "OFC", name: "ข้าราชการ", payer: "ผู้ป่วย / กองทุนของสิทธิ" },
  { code: "LGO", name: "อปท.", payer: "ผู้ป่วย / กองทุนของสิทธิ" },
  { code: "CSH", name: "จ่ายเอง (ชำระเงิน)", payer: "ผู้ป่วย" },
  { code: "OTHER", name: "อื่นๆ", payer: "ผู้ป่วย / กองทุนของสิทธิ" },
];

function hipdataOf(code: DrugDeliverySchemeCode): readonly string[] {
  if (code === "OTHER") {
    const named = new Set(
      SCHEMES.flatMap((s) =>
        s.code === "OTHER" ? [] : (PTTYPE_GROUPS.find((g) => g.code === s.code)?.hipdata ?? []),
      ),
    );
    return PTTYPE_GROUPS.flatMap((g) => g.hipdata).filter((h) => !named.has(h));
  }
  return PTTYPE_GROUPS.find((g) => g.code === code)?.hipdata ?? [];
}

function schemeOf(hipdata: string): DrugDeliverySchemeCode {
  for (const s of SCHEMES) {
    if (s.code !== "OTHER" && hipdataOf(s.code).includes(hipdata)) return s.code;
  }
  return "OTHER";
}

interface DeliveryRow extends RowDataPacket {
  ym: string;
  hipdata_code: string;
  shipped: Num;
  shipped_charged: Num;
  post_visits: Num;
  post_baht: Num;
  post_patient_baht: Num;
  post_fund_baht: Num;
  rider_visits: Num;
  rider_baht: Num;
  rider_patient_baht: Num;
  rider_fund_baht: Num;
}

/** Raw sums before the derived fields. */
interface Acc {
  shipped: number;
  shippedCharged: number;
  postVisits: number;
  postBaht: number;
  riderVisits: number;
  riderBaht: number;
  fundBaht: number;
  patientBaht: number;
}

const emptyAcc = (): Acc => ({
  shipped: 0,
  shippedCharged: 0,
  postVisits: 0,
  postBaht: 0,
  riderVisits: 0,
  riderBaht: 0,
  fundBaht: 0,
  patientBaht: 0,
});

function add(acc: Acc, r: DeliveryRow): void {
  acc.shipped += num(r.shipped);
  acc.shippedCharged += num(r.shipped_charged);
  acc.postVisits += num(r.post_visits);
  acc.postBaht += num(r.post_baht);
  acc.riderVisits += num(r.rider_visits);
  acc.riderBaht += num(r.rider_baht);
  acc.fundBaht += num(r.post_fund_baht) + num(r.rider_fund_baht);
  acc.patientBaht += num(r.post_patient_baht) + num(r.rider_patient_baht);
}

function finish(a: Acc): DrugDeliveryCounts {
  const shippedUncharged = Math.max(0, a.shipped - a.shippedCharged);
  return {
    ...a,
    shippedUncharged,
    shippedUnchargedBaht: shippedUncharged * DELIVERY_FEE_BAHT,
    otherPaidBaht: Math.max(0, a.postBaht + a.riderBaht - a.fundBaht - a.patientBaht),
  };
}

/**
 * Rendering contract identical to getPpfsSummary: `await io()` first,
 * render the caller inside <Suspense>; cached per fiscal year ("hours"
 * running year, "days" closed year). One query: a failure throws (the
 * page shows an error, nothing is cached). Invalidate with
 * revalidateTag(DRUG_DELIVERY_CACHE_TAG).
 */
export async function getDrugDeliverySummary(
  fiscalYear: number,
): Promise<DrugDeliverySummary> {
  await io();
  const closed = todayIsoDate() > fiscalYearRange(fiscalYear).end;
  return loadDrugDeliverySummary(fiscalYear, closed);
}

async function loadDrugDeliverySummary(
  fiscalYear: number,
  closed: boolean,
): Promise<DrugDeliverySummary> {
  "use cache";
  cacheTag(DRUG_DELIVERY_CACHE_TAG);

  const range = fiscalYearRange(fiscalYear);
  const rows = await query<DeliveryRow>(
    DRUG_DELIVERY_SQL,
    drugDeliveryParams({
      periodStart: range.start,
      countFrom: range.start,
      dataAsOf: range.end,
    }),
  );

  const byScheme = new Map<DrugDeliverySchemeCode, Acc>(
    SCHEMES.map((s) => [s.code, emptyAcc()]),
  );
  const byMonth = new Map<string, Acc>(range.months.map((m) => [m, emptyAcc()]));
  const total = emptyAcc();
  for (const r of rows) {
    add(byScheme.get(schemeOf(r.hipdata_code ?? ""))!, r);
    const m = byMonth.get(r.ym);
    if (m) add(m, r);
    add(total, r);
  }

  const schemes: DrugDeliverySchemeRow[] = SCHEMES.map((s) => ({
    code: s.code,
    name: s.name,
    payer: s.payer,
    hipdata: hipdataOf(s.code),
    ...finish(byScheme.get(s.code)!),
  }));
  const months: DrugDeliveryMonthRow[] = range.months.map((month) => ({
    month,
    ...finish(byMonth.get(month)!),
  }));

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
    feeBaht: DELIVERY_FEE_BAHT,
    schemes,
    months,
    total: finish(total),
    updatedAt: new Date().toISOString(),
  };
}
