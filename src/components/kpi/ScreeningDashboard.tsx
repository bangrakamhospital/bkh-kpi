import { connection } from "next/server";
import { CalendarDays, Clock } from "lucide-react";
import { getScreeningKpi } from "@/lib/kpi/screening";
import { fiscalYearOf, todayIsoDate } from "@/lib/kpi/fiscal-year";
import { FiscalYearSelect } from "./FiscalYearSelect";
import { IndicatorTable } from "./IndicatorTable";
import { formatThaiDate } from "./format";

const MIN_FISCAL_YEAR = 2560;

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

export async function ScreeningDashboard({
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
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {error}
        </div>
        <FiscalYearSelect
          fiscalYear={maxYear}
          minYear={MIN_FISCAL_YEAR}
          maxYear={maxYear}
        />
      </div>
    );
  }

  const result = await getScreeningKpi(year);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-surface p-3 shadow-sm dark:border-zinc-800">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <CalendarDays
              aria-hidden="true"
              className="h-4 w-4 text-brand-700 dark:text-brand-300"
            />
            ปีงบประมาณ {result.fiscalYear}
          </span>
          <span className="inline-flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
            <Clock
              aria-hidden="true"
              className="h-4 w-4 text-brand-700 dark:text-brand-300"
            />
            ข้อมูล ณ วันที่ {formatThaiDate(result.dataAsOf)}
          </span>
          {result.source === "mock" && (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-300">
              ข้อมูลตัวอย่าง
            </span>
          )}
        </div>
        <FiscalYearSelect
          fiscalYear={result.fiscalYear}
          minYear={MIN_FISCAL_YEAR}
          maxYear={maxYear}
        />
      </div>

      <IndicatorTable
        indicators={result.indicators}
        reduction={result.reduction}
        fiscalYear={result.fiscalYear}
      />
    </div>
  );
}
