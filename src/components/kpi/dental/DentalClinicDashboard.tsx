import { connection } from "next/server";
import { getDentalClinicSummary } from "@/lib/kpi/dental-clinic";
import type { DentalClinicSummary } from "@/lib/kpi/dental-clinic-types";
import { fiscalYearOf, todayIsoDate } from "@/lib/kpi/fiscal-year";
import {
  ClinicAlert,
  FiscalYearBar,
  FiscalYearError,
  type FyParam,
  parseFiscalYear,
} from "../clinic/FiscalYearBar";
import { DentalMonthTable } from "./DentalMonthTable";
import { DentalPayGroupPanel } from "./DentalPayGroupPanel";
import { DentalProcedurePanel } from "./DentalProcedurePanel";
import { DentalQualityPanel } from "./DentalQualityPanel";
import { DentalStatCards } from "./DentalStatCards";
import { DentalUnitTable } from "./DentalUnitTable";
import { DentalWorkloadCard } from "./DentalWorkloadCard";

/**
 * First fiscal year offered: dtmain.depcode (which dental room keyed the
 * procedure) is empty before Feb 2025, so the room split and the PCU
 * exclusion only work from FY2569 (verified with db-cli).
 */
const MIN_FISCAL_YEAR = 2569;
const BASE_PATH = "/clinic/dental";

export async function DentalClinicDashboard({
  searchParams,
}: {
  searchParams: Promise<{ fy?: FyParam }>;
}) {
  const { fy } = await searchParams;
  await connection();
  const maxYear = fiscalYearOf(todayIsoDate());
  const { year, error } = parseFiscalYear(fy, MIN_FISCAL_YEAR, maxYear);

  if (error) {
    return (
      <FiscalYearError
        error={error}
        basePath={BASE_PATH}
        minYear={MIN_FISCAL_YEAR}
        maxYear={maxYear}
      />
    );
  }

  let data: DentalClinicSummary | null = null;
  try {
    data = await getDentalClinicSummary(year ?? maxYear);
  } catch {
    data = null;
  }

  if (!data) {
    return (
      <ClinicAlert>
        ไม่สามารถโหลดข้อมูลคลินิกทันตกรรมได้ในขณะนี้ กรุณาลองใหม่ภายหลัง
      </ClinicAlert>
    );
  }

  return (
    <div className="space-y-4">
      <FiscalYearBar
        fiscalYear={data.fiscalYear}
        periodStart={data.periodStart}
        periodEnd={data.periodEnd}
        closed={data.closed}
        basePath={BASE_PATH}
        minYear={MIN_FISCAL_YEAR}
        maxYear={maxYear}
      />

      <DentalStatCards data={data} />
      <DentalUnitTable
        units={data.units}
        excluded={data.excludedPcu}
        registeredOtherBaht={data.registeredOtherBaht}
        fiscalYear={data.fiscalYear}
      />
      <DentalPayGroupPanel groups={data.payGroups} fiscalYear={data.fiscalYear} />
      <DentalProcedurePanel
        categories={data.categories}
        topItems={data.topItems}
        fillingRatio={data.fillingRatio}
        fiscalYear={data.fiscalYear}
      />
      <DentalQualityPanel
        indicators={data.indicators}
        ages={data.ages}
        fiscalYear={data.fiscalYear}
      />
      <DentalWorkloadCard
        workload={data.workload}
        waiting={data.waiting}
        fiscalYear={data.fiscalYear}
      />
      <DentalMonthTable
        months={data.months}
        persons={data.persons}
        fiscalYear={data.fiscalYear}
      />
    </div>
  );
}
