import Link from "next/link";
import { connection } from "next/server";
import { CalendarDays, Clock, Info } from "lucide-react";
import { getDistrictCkd5, getDistrictScreening } from "@/lib/kpi/district";
import {
  DISTRICT_KPI_CODES,
  HDC_MIN_FISCAL_YEAR,
  isDistrictKpiCode,
} from "@/lib/kpi/district-areas";
import { fiscalYearOf, todayIsoDate } from "@/lib/kpi/fiscal-year";
import type {
  DistrictCkd5Result,
  DistrictKpiCode,
  DistrictScreeningResult,
} from "@/lib/kpi/types";
import { FiscalYearSelect } from "./FiscalYearSelect";
import { DistrictCkd5Table } from "./DistrictCkd5Table";
import { DistrictScreeningTable } from "./DistrictScreeningTable";
import { ACCENTS } from "./indicator-theme";
import {
  DISTRICT_ACCENT,
  DISTRICT_CODE_GROUPS,
  districtLabel,
  numeratorLabel,
} from "./district-codes";
import { formatThaiDate } from "./format";

type Param = string | string[] | undefined;

function districtHref(code: DistrictKpiCode, fy: number): string {
  return `/district?code=${code}&fy=${fy}`;
}

function parseCode(raw: Param): { code: DistrictKpiCode; error?: string } {
  if (raw === undefined) return { code: "DM" };
  if (isDistrictKpiCode(raw)) return { code: raw };
  return {
    code: "DM",
    error: `ตัวชี้วัดต้องเป็น ${DISTRICT_KPI_CODES.join(", ")} (ตัวอย่าง: ?code=DM)`,
  };
}

function parseFiscalYear(
  raw: Param,
  maxYear: number,
): { year: number; error?: string } {
  if (raw === undefined) return { year: maxYear };
  if (typeof raw !== "string" || !/^\d{4}$/.test(raw)) {
    return { year: maxYear, error: "รูปแบบปีงบประมาณไม่ถูกต้อง (ตัวอย่าง: ?fy=2569)" };
  }
  const year = Number(raw);
  if (year < HDC_MIN_FISCAL_YEAR || year > maxYear) {
    return {
      year: maxYear,
      error: `ปีงบประมาณต้องอยู่ในช่วง ${HDC_MIN_FISCAL_YEAR} ถึง ${maxYear}`,
    };
  }
  return { year };
}

function AlertBox({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
    >
      {message}
    </div>
  );
}

export async function DistrictScreening({
  searchParams,
}: {
  searchParams: Promise<{ code?: Param; fy?: Param }>;
}) {
  const params = await searchParams;
  await connection();
  const maxYear = fiscalYearOf(todayIsoDate());
  const parsedCode = parseCode(params.code);
  const parsedFy = parseFiscalYear(params.fy, maxYear);
  const paramError = parsedCode.error ?? parsedFy.error;
  const { code } = parsedCode;

  const selectors = (fy: number) => (
    <div className="flex w-full flex-col gap-3">
      <nav aria-label="เลือกตัวชี้วัด" className="flex flex-col gap-2">
        {DISTRICT_CODE_GROUPS.map((g) => (
          <div key={g.label} className="flex flex-wrap items-center gap-2">
            <span className="w-full text-xs font-semibold text-zinc-600 sm:w-40 dark:text-zinc-400">
              {g.label}
            </span>
            {g.codes.map((c) => (
              <Link
                key={c}
                href={districtHref(c, fy)}
                aria-current={c === code ? "page" : undefined}
                className={`rounded-full px-3 py-1.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
                  c === code
                    ? ACCENTS[DISTRICT_ACCENT[c]].pill
                    : "border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                }`}
              >
                {districtLabel(c)}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <FiscalYearSelect
        fiscalYear={fy}
        minYear={HDC_MIN_FISCAL_YEAR}
        maxYear={maxYear}
        buildHref={(y) => districtHref(code, y)}
      />
    </div>
  );

  if (paramError) {
    return (
      <div className="space-y-4">
        <AlertBox message={paramError} />
        {selectors(maxYear)}
      </div>
    );
  }

  const header = (name: string, fy: number, dataAsOf: string | null) => (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-surface p-3 shadow-sm dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <CalendarDays
            aria-hidden="true"
            className="h-4 w-4 text-brand-700 dark:text-brand-300"
          />
          {name} ปีงบประมาณ {fy}
        </span>
        {dataAsOf && (
          <span className="inline-flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
            <Clock
              aria-hidden="true"
              className="h-4 w-4 text-brand-700 dark:text-brand-300"
            />
            ข้อมูล ณ วันที่ {formatThaiDate(dataAsOf)}
          </span>
        )}
      </div>
      {selectors(fy)}
    </div>
  );

  let result: DistrictScreeningResult | DistrictCkd5Result;
  try {
    result =
      code === "CKD5"
        ? await getDistrictCkd5(parsedFy.year)
        : await getDistrictScreening(code, parsedFy.year);
  } catch {
    return (
      <div className="space-y-4">
        <AlertBox message="ไม่สามารถโหลดข้อมูลระดับอำเภอได้ในขณะนี้ กรุณาลองใหม่ภายหลัง" />
        {selectors(parsedFy.year)}
      </div>
    );
  }

  const noData =
    result.kind === "ratio"
      ? result.tambons.every((t) => !t.error && t.numerator === 0)
      : result.district.currentCases === 0;

  return (
    <div className="space-y-4">
      {header(result.name, result.fiscalYear, result.dataAsOf)}

      {noData && result.fiscalYear > HDC_MIN_FISCAL_YEAR && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
        >
          <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            ฐาน HDC ยังไม่มีข้อมูลผลงานของปีงบนี้ (ข้อมูลล่าช้า) ลองเลือกปีงบ{" "}
            <Link
              href={districtHref(code, HDC_MIN_FISCAL_YEAR)}
              className="font-semibold underline"
            >
              {HDC_MIN_FISCAL_YEAR}
            </Link>
          </p>
        </div>
      )}

      {result.kind === "ratio" ? (
        <DistrictScreeningTable result={result} />
      ) : (
        <DistrictCkd5Table result={result} />
      )}

      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        หมายเหตุ: {result.note}
        {result.kind === "ratio" && (
          <>
            {" "}
            (ดูคอลัมน์ &quot;ข้อมูลถึง&quot; และกดที่ชื่อตำบลเพื่อดูรายหมู่และความสดรายหน่วย)
            B = {result.population}, A = {numeratorLabel(code)}
          </>
        )}
      </p>
    </div>
  );
}
