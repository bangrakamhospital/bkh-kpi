import { connection } from "next/server";
import { getPtClinicSummary } from "@/lib/kpi/pt-clinic";
import type { PtClinicSummary } from "@/lib/kpi/pt-clinic-types";
import { fiscalYearOf, todayIsoDate } from "@/lib/kpi/fiscal-year";
import {
  ClinicAlert,
  FiscalYearBar,
  FiscalYearError,
  type FyParam,
  parseFiscalYear,
} from "../clinic/FiscalYearBar";
import { PtItemsTable } from "./PtItemsTable";
import { PtMonthTable } from "./PtMonthTable";
import { PtPatientPanel } from "./PtPatientPanel";
import { PtPayGroupPanel } from "./PtPayGroupPanel";
import { PtQualityPanel } from "./PtQualityPanel";
import { PtStatCards } from "./PtStatCards";
import { PtWorkloadCard } from "./PtWorkloadCard";

/**
 * First fiscal year offered: the PT module in use (physic_list /
 * physic_plan) covers FY2568 on; the older physic_main stopped in Feb 2025.
 * Earlier years were not validated.
 */
const MIN_FISCAL_YEAR = 2568;
const BASE_PATH = "/clinic/pt";

export async function PtClinicDashboard({
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

  let data: PtClinicSummary | null = null;
  try {
    data = await getPtClinicSummary(year ?? maxYear);
  } catch {
    data = null;
  }

  if (!data) {
    return (
      <ClinicAlert>
        ไม่สามารถโหลดข้อมูลคลินิกกายภาพได้ในขณะนี้ กรุณาลองใหม่ภายหลัง
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

      <PtStatCards data={data} />
      <PtPayGroupPanel groups={data.payGroups} fiscalYear={data.fiscalYear} />
      <PtItemsTable items={data.items} fiscalYear={data.fiscalYear} />
      <PtPatientPanel
        diagnoses={data.diagnoses}
        bands={data.bands}
        persons={data.persons}
        newPersons={data.newPersons}
        elderlyPersons={data.elderlyPersons}
        fiscalYear={data.fiscalYear}
      />
      <PtQualityPanel
        indicators={data.indicators}
        imc={data.imc}
        followUpDays={data.imcFollowUpDays}
        fiscalYear={data.fiscalYear}
      />
      <PtWorkloadCard
        workload={data.workload}
        wait={data.wait}
        ipd={data.ipd}
        fiscalYear={data.fiscalYear}
      />
      <PtMonthTable data={data} />
    </div>
  );
}
