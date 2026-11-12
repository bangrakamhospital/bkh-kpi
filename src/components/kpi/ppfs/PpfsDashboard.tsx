import { connection } from "next/server";
import { CalendarDays } from "lucide-react";
import { getPpfsSummary } from "@/lib/kpi/ppfs";
import type { PpfsSummary } from "@/lib/kpi/ppfs-types";
import { fiscalYearOf, todayIsoDate } from "@/lib/kpi/fiscal-year";
import { FiscalYearSelect } from "../FiscalYearSelect";
import { PpfsStatCards } from "./PpfsStatCards";
import { PpfsTable } from "./PpfsTable";

/** PPFS rate table starts at FY2569. */
const MIN_FISCAL_YEAR = 2569;

type FyParam = string | string[] | undefined;

const buildHref = (fy: number) => `/pp?fy=${fy}`;

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

export async function PpfsDashboard({
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

  let data: PpfsSummary | null = null;
  try {
    data = await getPpfsSummary(year ?? maxYear);
  } catch {
    data = null;
  }

  if (!data) {
    return (
      <div role="alert" className={alertClass}>
        ไม่สามารถโหลดข้อมูลรายได้คัดกรองได้ในขณะนี้ กรุณาลองใหม่ภายหลัง
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
            อัตรา PPFS ปี {data.rateYear}
          </span>
          {data.source === "stub" && (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-300">
              ข้อมูลตัวอย่าง
            </span>
          )}
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

      <PpfsStatCards totals={data.totals} />

      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        ยอดเงินเป็นค่าประมาณจากข้อมูล HOSxP × อัตรา PPFS ปี {data.rateYear} ไม่ใช่ยอดโอนจริงจาก สปสช.
        {" "}รายการคัดกรองนับเฉพาะคนไทยในเขตรับผิดชอบ (คนนอกเขตที่มารับบริการทำให้รายได้จริงสูงกว่านี้) ส่วน ANC นับจากผู้มาฝากครรภ์ที่ รพ. ทั้งหมด และนับเฉพาะครั้งที่ 1–8 ต่อครรภ์ (ครั้งที่ 9+ ต้องส่งหลักฐาน แยกแสดงในแถว ANC ไม่รวมในยอดรวม)
        {" "}{data.closed ? "ปีงบประมาณนี้ปิดแล้ว" : "ปีงบประมาณนี้ยังไม่สิ้นสุด เป้าหมายเป็นยอดทั้งปี"}
      </p>

      {data.items.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-surface p-6 text-center text-sm text-zinc-700 shadow-sm dark:border-zinc-800 dark:text-zinc-300">
          ไม่พบรายการ PPFS
        </div>
      ) : (
        <PpfsTable items={data.items} fiscalYear={data.fiscalYear} />
      )}
    </div>
  );
}
