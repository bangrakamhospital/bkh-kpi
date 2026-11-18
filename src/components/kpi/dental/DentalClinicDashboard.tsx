import { connection } from "next/server";
import { CalendarDays } from "lucide-react";
import { getDentalClinicSummary } from "@/lib/kpi/dental-clinic";
import type { DentalClinicSummary } from "@/lib/kpi/dental-clinic-types";
import { fiscalYearOf, todayIsoDate } from "@/lib/kpi/fiscal-year";
import { FiscalYearSelect } from "../FiscalYearSelect";
import { formatThaiDate } from "../format";
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

export async function DentalClinicDashboard({
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

  let data: DentalClinicSummary | null = null;
  try {
    data = await getDentalClinicSummary(year ?? maxYear);
  } catch {
    data = null;
  }

  if (!data) {
    return (
      <div role="alert" className={alertClass}>
        ไม่สามารถโหลดข้อมูลคลินิกทันตกรรมได้ในขณะนี้ กรุณาลองใหม่ภายหลัง
      </div>
    );
  }

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
      <DentalWorkloadCard workload={data.workload} waiting={data.waiting} />
      <DentalMonthTable
        months={data.months}
        persons={data.persons}
        fiscalYear={data.fiscalYear}
      />
    </div>
  );
}
