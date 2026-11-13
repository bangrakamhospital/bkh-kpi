import { connection } from "next/server";
import { getDistrictPpSummary } from "@/lib/kpi/district-pp";
import type { DistrictPpSummary } from "@/lib/kpi/district-pp-types";
import { HDC_MIN_FISCAL_YEAR } from "@/lib/kpi/district-areas";
import { fiscalYearOf, todayIsoDate } from "@/lib/kpi/fiscal-year";
import { DistrictPpView } from "./DistrictPpView";

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
  if (year < HDC_MIN_FISCAL_YEAR || year > maxYear) {
    return {
      error: `ปีงบประมาณต้องอยู่ในช่วง ${HDC_MIN_FISCAL_YEAR} ถึง ${maxYear}`,
    };
  }
  return { year };
}

const alertClass =
  "rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200";

export async function DistrictPpDashboard({
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
      <div role="alert" className={alertClass}>
        {error}
      </div>
    );
  }

  let data: DistrictPpSummary | null = null;
  try {
    data = await getDistrictPpSummary(year ?? maxYear);
  } catch {
    data = null;
  }

  if (!data) {
    return (
      <div role="alert" className={alertClass}>
        ไม่สามารถโหลดข้อมูลรายได้ PP ระดับอำเภอได้ในขณะนี้ กรุณาลองใหม่ภายหลัง
      </div>
    );
  }

  return (
    <DistrictPpView
      summary={data}
      minYear={HDC_MIN_FISCAL_YEAR}
      maxYear={maxYear}
    />
  );
}
