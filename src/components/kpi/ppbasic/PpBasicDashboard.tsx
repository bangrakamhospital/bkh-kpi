import { connection } from "next/server";
import { CalendarDays } from "lucide-react";
import { getPpBasicSummary } from "@/lib/kpi/ppbasic";
import type { PpBasicSummary } from "@/lib/kpi/ppbasic-types";
import { fiscalYearOf, todayIsoDate } from "@/lib/kpi/fiscal-year";
import { formatThaiDate } from "../format";
import { FiscalYearSelect } from "../FiscalYearSelect";
import { PpBasicCards } from "./PpBasicCards";
import { PpBasicStatCards } from "./PpBasicStatCards";
import { PpBasicTable } from "./PpBasicTable";

// HOSxP data for these items verified from FY2568 (docs/kpi/pp-basic-services.md).
const MIN_FISCAL_YEAR = 2568;

type FyParam = string | string[] | undefined;

const buildHref = (fy: number) => `/pp/basic?fy=${fy}`;

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

export async function PpBasicDashboard({
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

  let data: PpBasicSummary | null = null;
  try {
    data = await getPpBasicSummary(year ?? maxYear);
  } catch {
    data = null;
  }

  if (!data) {
    return (
      <div role="alert" className={alertClass}>
        ไม่สามารถโหลดข้อมูลบริการพื้นฐาน P&amp;P ได้ในขณะนี้ กรุณาลองใหม่ภายหลัง
      </div>
    );
  }

  const items = [...data.items].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-surface p-3 shadow-sm dark:border-zinc-800">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <CalendarDays
            aria-hidden="true"
            className="h-4 w-4 text-brand-700 dark:text-brand-300"
          />
          ปีงบประมาณ {data.fiscalYear}
        </span>
        <div className="max-w-full overflow-x-auto">
          <FiscalYearSelect
            fiscalYear={data.fiscalYear}
            minYear={MIN_FISCAL_YEAR}
            maxYear={maxYear}
            buildHref={buildHref}
          />
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-surface p-6 text-center text-sm text-zinc-700 shadow-sm dark:border-zinc-800 dark:text-zinc-300">
          ไม่พบรายการบริการพื้นฐาน
        </div>
      ) : (
        <>
          {data.moneyTotals && <PpBasicStatCards totals={data.moneyTotals} />}
          <PpBasicCards items={items} />
          <p className="break-words text-xs text-zinc-600 dark:text-zinc-400">
            ข้อมูลจาก HOSxP ของโรงพยาบาลเท่านั้น
            {" "}
            {data.closed
              ? "ปีงบประมาณนี้ปิดแล้ว"
              : `ปีงบประมาณนี้ยังไม่สิ้นสุด นับข้อมูลถึง ${formatThaiDate(data.dataAsOf)} รายการตรวจพัฒนาการและวัคซีนนับเป้าหมายเฉพาะเด็กที่ถึงกำหนดแล้ว`}
          </p>
          <PpBasicTable items={items} fiscalYear={data.fiscalYear} />
        </>
      )}
    </div>
  );
}
