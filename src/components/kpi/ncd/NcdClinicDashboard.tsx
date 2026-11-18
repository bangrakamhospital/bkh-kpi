import { connection } from "next/server";
import { getNcdClinicSummary } from "@/lib/kpi/ncd-clinic";
import type { NcdClinicSummary } from "@/lib/kpi/ncd-clinic-types";
import { fiscalYearOf, todayIsoDate } from "@/lib/kpi/fiscal-year";
import {
  ClinicAlert,
  FiscalYearBar,
  FiscalYearError,
  type FyParam,
  parseFiscalYear,
} from "../clinic/FiscalYearBar";
import { NcdDiseaseCards } from "./NcdDiseaseCards";
import { NcdIndicatorTable } from "./NcdIndicatorTable";
import { NcdLabPanel } from "./NcdLabPanel";
import { NcdMonthTable, type NcdMonthTotal } from "./NcdMonthTable";
import { NcdPayGroupPanel } from "./NcdPayGroupPanel";
import { NcdStatCards } from "./NcdStatCards";
import { NcdWaitingCard } from "./NcdWaitingCard";
import { NcdWorkloadCard } from "./NcdWorkloadCard";

/**
 * First fiscal year offered: the quality indicators and their targets
 * (KPI Template 2569) are defined for FY2569; FY2568 is kept for a
 * year-on-year comparison. Earlier years were not validated.
 */
const MIN_FISCAL_YEAR = 2568;
const BASE_PATH = "/clinic/ncd";

export async function NcdClinicDashboard({
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

  let data: NcdClinicSummary | null = null;
  try {
    data = await getNcdClinicSummary(year ?? maxYear);
  } catch {
    data = null;
  }

  if (!data) {
    return (
      <ClinicAlert>
        ไม่สามารถโหลดข้อมูล NCD Clinic ได้ในขณะนี้ กรุณาลองใหม่ภายหลัง
      </ClinicAlert>
    );
  }

  const months = data.months;
  const sum = (pick: (m: NcdClinicSummary["months"][number]) => number) =>
    months.reduce((acc, m) => acc + pick(m), 0);
  const monthTotal: NcdMonthTotal = {
    persons: data.persons,
    visits: data.visits,
    fullVisits: sum((m) => m.fullVisits),
    fullBaht: sum((m) => m.fullBaht),
    capitationVisits: sum((m) => m.capitationVisits),
    capitationBaht: sum((m) => m.capitationBaht),
    clinicDays: data.workload.clinicDays,
    visitsPerDay: data.workload.avgVisitsPerDay,
    maxVisitsPerDay: data.workload.maxVisitsPerDay,
  };

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

      <NcdStatCards data={data} />
      <NcdPayGroupPanel groups={data.payGroups} fiscalYear={data.fiscalYear} />
      <NcdDiseaseCards diseases={data.diseases} dmHtPersons={data.dmHtPersons} />
      <NcdIndicatorTable indicators={data.indicators} fiscalYear={data.fiscalYear} />
      <NcdLabPanel
        panel={data.dmLabPanel}
        hba1c={data.hba1cUse}
        glucose={data.glucoseTests}
      />
      <NcdWaitingCard waiting={data.waiting} hosxpSteps={data.hosxpSteps} />
      <NcdWorkloadCard workload={data.workload} />
      <NcdMonthTable
        months={months}
        total={monthTotal}
        fiscalYear={data.fiscalYear}
        targetPerDay={data.workload.targetPerDay}
      />
    </div>
  );
}
