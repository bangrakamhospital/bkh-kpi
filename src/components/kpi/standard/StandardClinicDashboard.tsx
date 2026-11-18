import { connection } from "next/server";
import { clinicHref } from "@/lib/kpi/clinic-registry";
import { fiscalYearOf, todayIsoDate } from "@/lib/kpi/fiscal-year";
import { getStandardClinicSummary } from "@/lib/kpi/standard-clinic";
import type { StandardClinicSummary } from "@/lib/kpi/standard-clinic-types";
import {
  ClinicAlert,
  FiscalYearBar,
  FiscalYearError,
  type FyParam,
  parseFiscalYear,
} from "../clinic/FiscalYearBar";
import { StandardChargePanel } from "./StandardChargePanel";
import { StandardMonthTable } from "./StandardMonthTable";
import { StandardPayGroupPanel } from "./StandardPayGroupPanel";
import { StandardPdxTable } from "./StandardPdxTable";
import { StandardStatCards } from "./StandardStatCards";
import { StandardUnitTable } from "./StandardUnitTable";
import { StandardWorkloadCard } from "./StandardWorkloadCard";

/** First fiscal year offered (same as /clinic/ncd; earlier years not validated). */
const MIN_FISCAL_YEAR = 2568;

/** Body of /clinic/[clinic] for a "standard" clinic of the registry. */
export async function StandardClinicDashboard({
  slug,
  searchParams,
}: {
  slug: string;
  searchParams: Promise<{ fy?: FyParam }>;
}) {
  const { fy } = await searchParams;
  await connection();
  const basePath = clinicHref(slug);
  const maxYear = fiscalYearOf(todayIsoDate());
  const { year, error } = parseFiscalYear(fy, MIN_FISCAL_YEAR, maxYear);

  if (error) {
    return (
      <FiscalYearError
        error={error}
        basePath={basePath}
        minYear={MIN_FISCAL_YEAR}
        maxYear={maxYear}
      />
    );
  }

  let data: StandardClinicSummary | null = null;
  try {
    data = await getStandardClinicSummary(slug, year ?? maxYear);
  } catch {
    data = null;
  }

  if (!data) {
    return <ClinicAlert>ไม่สามารถโหลดข้อมูลคลินิกได้ในขณะนี้ กรุณาลองใหม่ภายหลัง</ClinicAlert>;
  }

  return (
    <div className="space-y-4">
      <FiscalYearBar
        fiscalYear={data.fiscalYear}
        periodStart={data.periodStart}
        periodEnd={data.periodEnd}
        closed={data.closed}
        basePath={basePath}
        minYear={MIN_FISCAL_YEAR}
        maxYear={maxYear}
      />

      <StandardStatCards data={data} />
      <StandardUnitTable data={data} />
      <StandardPayGroupPanel
        slug={data.slug}
        label={data.label}
        groups={data.payGroups}
        fiscalYear={data.fiscalYear}
      />
      <StandardChargePanel data={data} />
      <StandardPdxTable data={data} />
      <StandardWorkloadCard workload={data.workload} />
      <StandardMonthTable data={data} />
    </div>
  );
}
