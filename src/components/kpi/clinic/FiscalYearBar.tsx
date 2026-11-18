import type { ReactNode } from "react";
import { CalendarDays } from "lucide-react";
import { FiscalYearSelect } from "../FiscalYearSelect";
import { formatThaiDate } from "../format";

/** `?fy=` as received from searchParams. */
export type FyParam = string | string[] | undefined;

/** Validates `?fy=`: none -> {}, else a 4-digit year within [minYear, maxYear]. */
export function parseFiscalYear(
  raw: FyParam,
  minYear: number,
  maxYear: number,
): { year?: number; error?: string } {
  if (raw === undefined) return {};
  if (typeof raw !== "string" || !/^\d{4}$/.test(raw)) {
    return { error: "รูปแบบปีงบประมาณไม่ถูกต้อง (ตัวอย่าง: ?fy=2569)" };
  }
  const year = Number(raw);
  if (year < minYear || year > maxYear) {
    return { error: `ปีงบประมาณต้องอยู่ในช่วง ${minYear} ถึง ${maxYear}` };
  }
  return { year };
}

const alertClass =
  "rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200";

/** Red alert box (invalid ?fy=, data not available). */
export function ClinicAlert({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className={alertClass}>
      {children}
    </div>
  );
}

const hrefBuilder = (basePath: string) => (fy: number) => `${basePath}?fy=${fy}`;

/** Invalid ?fy=: the message and the year selector (current year). */
export function FiscalYearError({
  error,
  basePath,
  minYear,
  maxYear,
}: {
  error: string;
  basePath: string;
  minYear: number;
  maxYear: number;
}) {
  return (
    <div className="space-y-4">
      <ClinicAlert>{error}</ClinicAlert>
      <FiscalYearSelect
        fiscalYear={maxYear}
        minYear={minYear}
        maxYear={maxYear}
        buildHref={hrefBuilder(basePath)}
      />
    </div>
  );
}

/** Top bar of a /clinic/* page: fiscal year, its period and the year selector. */
export function FiscalYearBar({
  fiscalYear,
  periodStart,
  periodEnd,
  closed,
  basePath,
  minYear,
  maxYear,
}: {
  fiscalYear: number;
  periodStart: string;
  periodEnd: string;
  closed: boolean;
  basePath: string;
  minYear: number;
  maxYear: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-surface p-3 shadow-sm dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <CalendarDays aria-hidden="true" className="h-4 w-4 text-brand-700 dark:text-brand-300" />
          ปีงบประมาณ {fiscalYear}
        </span>
        <span className="text-zinc-700 dark:text-zinc-300">
          {formatThaiDate(periodStart)} – {formatThaiDate(periodEnd)}
          {closed ? " (ปิดแล้ว)" : " (ยังไม่สิ้นสุด)"}
        </span>
      </div>
      <div className="max-w-full overflow-x-auto">
        <FiscalYearSelect
          fiscalYear={fiscalYear}
          minYear={minYear}
          maxYear={maxYear}
          buildHref={hrefBuilder(basePath)}
        />
      </div>
    </div>
  );
}
