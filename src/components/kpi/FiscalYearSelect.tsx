import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  fiscalYear: number;
  minYear: number;
  maxYear: number;
}

const linkClass =
  "inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-800 hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 dark:border-brand-700 dark:bg-brand-900 dark:text-brand-100 dark:hover:bg-brand-800";
const disabledClass =
  "inline-flex items-center gap-1 rounded-full border border-zinc-200 px-3 py-1.5 text-sm text-zinc-500 dark:border-zinc-800";

export function FiscalYearSelect({ fiscalYear, minYear, maxYear }: Props) {
  const hasPrev = fiscalYear > minYear;
  const hasNext = fiscalYear < maxYear;

  return (
    <nav aria-label="เลือกปีงบประมาณ" className="flex items-center gap-2">
      {hasPrev ? (
        <Link href={`/?fy=${fiscalYear - 1}`} className={linkClass}>
          <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          ปีงบฯ {fiscalYear - 1}
        </Link>
      ) : (
        <span className={disabledClass}>
          <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          ปีก่อนหน้า
        </span>
      )}
      <span
        className="rounded-full bg-brand-700 px-3 py-1.5 text-sm font-semibold text-white"
        aria-current="page"
      >
        ปีงบฯ {fiscalYear}
      </span>
      {hasNext ? (
        <Link href={`/?fy=${fiscalYear + 1}`} className={linkClass}>
          ปีงบฯ {fiscalYear + 1}
          <ChevronRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      ) : (
        <span className={disabledClass}>
          ปีถัดไป
          <ChevronRight aria-hidden="true" className="h-4 w-4" />
        </span>
      )}
    </nav>
  );
}
