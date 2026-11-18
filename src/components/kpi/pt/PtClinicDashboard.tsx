import { connection } from "next/server";
import { CalendarDays } from "lucide-react";
import { getPtClinicSummary } from "@/lib/kpi/pt-clinic";
import type { PtClinicSummary } from "@/lib/kpi/pt-clinic-types";
import { fiscalYearOf, todayIsoDate } from "@/lib/kpi/fiscal-year";
import { FiscalYearSelect } from "../FiscalYearSelect";
import { formatThaiDate } from "../format";
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

export async function PtClinicDashboard({
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

  let data: PtClinicSummary | null = null;
  try {
    data = await getPtClinicSummary(year ?? maxYear);
  } catch {
    data = null;
  }

  if (!data) {
    return (
      <div role="alert" className={alertClass}>
        ไม่สามารถโหลดข้อมูลคลินิกกายภาพได้ในขณะนี้ กรุณาลองใหม่ภายหลัง
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

      <PtStatCards data={data} />
      <PtPayGroupPanel groups={data.payGroups} fiscalYear={data.fiscalYear} />
      <PtItemsTable items={data.items} fiscalYear={data.fiscalYear} />
      <PtPatientPanel
        diagnoses={data.diagnoses}
        bands={data.bands}
        persons={data.persons}
        newPersons={data.newPersons}
        elderlyPersons={data.elderlyPersons}
      />
      <PtQualityPanel
        indicators={data.indicators}
        imc={data.imc}
        followUpDays={data.imcFollowUpDays}
        fiscalYear={data.fiscalYear}
      />
      <PtWorkloadCard workload={data.workload} wait={data.wait} ipd={data.ipd} />
      <PtMonthTable data={data} />
    </div>
  );
}
