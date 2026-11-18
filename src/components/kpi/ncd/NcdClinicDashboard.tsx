import { connection } from "next/server";
import { CalendarDays } from "lucide-react";
import { getNcdClinicSummary } from "@/lib/kpi/ncd-clinic";
import type { NcdClinicSummary } from "@/lib/kpi/ncd-clinic-types";
import { fiscalYearOf, todayIsoDate } from "@/lib/kpi/fiscal-year";
import { FiscalYearSelect } from "../FiscalYearSelect";
import { formatThaiDate } from "../format";
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

type FyParam = string | string[] | undefined;

function parseFiscalYear(
  raw: FyParam,
  maxYear: number,
): { year?: number; error?: string } {
  if (raw === undefined) return {};
  if (typeof raw !== "string" || !/^\d{4}$/.test(raw)) {
    return { error: "รูปแบบปีงบประมาณไม่ถูกต้อง (ตัวอย่าง: ?fy=2569)" };
  }
  const year = Number(raw);
  if (year < MIN_FISCAL_YEAR || year > maxYear) {
    return {
      error: `ปีงบประมาณต้องอยู่ในช่วง ${MIN_FISCAL_YEAR} ถึง ${maxYear}`,
    };
  }
  return { year };
}

const alertClass =
  "rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200";

const buildHref = (fy: number) => `${BASE_PATH}?fy=${fy}`;

export async function NcdClinicDashboard({
  searchParams,
}: {
  searchParams: Promise<{ fy?: FyParam }>;
}) {
  const { fy } = await searchParams;
  await connection();
  const maxYear = fiscalYearOf(todayIsoDate());
  const { year, error } = parseFiscalYear(fy, maxYear);

  if (error) {
    return (
      <div className="space-y-4">
        <div role="alert" className={alertClass}>
          {error}
        </div>
        <FiscalYearSelect
          fiscalYear={maxYear}
          minYear={MIN_FISCAL_YEAR}
          maxYear={maxYear}
          buildHref={buildHref}
        />
      </div>
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
      <div role="alert" className={alertClass}>
        ไม่สามารถโหลดข้อมูล NCD Clinic ได้ในขณะนี้ กรุณาลองใหม่ภายหลัง
      </div>
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
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-surface p-3 shadow-sm dark:border-zinc-800">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <CalendarDays
              aria-hidden="true"
              className="h-4 w-4 text-brand-700 dark:text-brand-300"
            />
            ปีงบประมาณ {data.fiscalYear}
          </span>
          <span className="text-zinc-700 dark:text-zinc-300">
            {formatThaiDate(data.periodStart)} – {formatThaiDate(data.periodEnd)}
            {data.closed ? " (ปิดแล้ว)" : " (ยังไม่สิ้นสุด)"}
          </span>
        </div>
        <div className="max-w-full overflow-x-auto">
          <FiscalYearSelect
            fiscalYear={data.fiscalYear}
            minYear={MIN_FISCAL_YEAR}
            maxYear={maxYear}
            buildHref={buildHref}
          />
        </div>
      </div>

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
