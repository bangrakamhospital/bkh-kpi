"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type {
  DistrictDspmResult,
  DistrictDspmTambonRow,
  DspmCounts,
} from "@/lib/kpi/types";
import { meetsTarget, targetOperatorSign } from "@/lib/kpi/screening-indicators";
import { ACCENTS } from "./indicator-theme";
import { DistrictUnitFreshness } from "./DistrictUnitFreshness";
import { ProgressBar } from "./ProgressBar";
import { dspmAgeExcel, dspmTambonExcel } from "./district-excel";
import { ExcelDownloadButton } from "./overview/ExcelDownloadButton";
import { formatNumber, formatPercent, formatThaiDate } from "./format";

const thClass = "px-3 py-2 font-semibold";
const tdClass = "px-3 py-2.5";
const num = `${tdClass} text-right tabular-nums`;
const accent = ACCENTS.dspm;

/** Percent text, red when below the given ">=" level. */
function Pct({ value, min }: { value: number; min?: number }) {
  const below = min !== undefined && !meetsTarget(value, min, ">=");
  return (
    <span className={below ? "text-red-700 dark:text-red-400" : undefined}>
      {formatPercent(value)}
    </span>
  );
}

/** Column headers shared by the age-group and sub-district tables. */
function CountHeaders({ result }: { result: DistrictDspmResult }) {
  return (
    <>
      <th scope="col" className={`${thClass} text-right`}>
        เป้าหมาย
      </th>
      <th scope="col" className={`${thClass} text-right`}>
        คัดกรอง
      </th>
      <th scope="col" className={`${thClass} text-right`}>
        % คัดกรอง (≥ {formatNumber(result.screenTargetPercent)})
      </th>
      <th scope="col" className={`${thClass} text-right`}>
        สงสัยล่าช้า
      </th>
      <th scope="col" className={`${thClass} text-right`}>
        % สงสัยล่าช้า (≥ {formatNumber(result.suspectTargetPercent)})
      </th>
      <th scope="col" className={`${thClass} text-right`}>
        ติดตามได้ / รอกระตุ้น
      </th>
      <th scope="col" className={`${thClass} text-right`}>
        % ติดตาม
      </th>
      <th scope="col" className={`${thClass} text-right`}>
        สมวัย
      </th>
      <th scope="col" className={thClass}>
        % สมวัย (เกณฑ์ {targetOperatorSign(result.targetOperator)}{" "}
        {formatNumber(result.targetPercent)}%)
      </th>
    </>
  );
}

/** The 9 count / percent cells of one row (same order as CountHeaders). */
function CountCells({
  c,
  result,
  label,
}: {
  c: DspmCounts;
  result: DistrictDspmResult;
  label: string;
}) {
  return (
    <>
      <td className={num}>{formatNumber(c.target)}</td>
      <td className={num}>{formatNumber(c.screened)}</td>
      <td className={num}>
        <Pct value={c.screenPercent} min={result.screenTargetPercent} />
      </td>
      <td className={num}>{formatNumber(c.suspectWait + c.suspectRefer)}</td>
      <td className={num}>
        <Pct value={c.suspectPercent} min={result.suspectTargetPercent} />
      </td>
      <td className={num}>
        {formatNumber(c.followed)} / {formatNumber(c.suspectWait)}
      </td>
      <td className={num}>
        <Pct value={c.followPercent} />
      </td>
      <td className={num}>{formatNumber(c.normalFirst + c.normalAfter)}</td>
      <td className={tdClass}>
        <div className="min-w-32">
          <span className="block text-right text-sm font-bold tabular-nums">
            {formatPercent(c.normalPercent)}
          </span>
          <div className="mt-1.5">
            <ProgressBar
              percent={c.normalPercent}
              targetPercent={result.targetPercent}
              barClass={accent.bar}
              label={label}
            />
          </div>
        </div>
      </td>
    </>
  );
}

function TambonDetail({
  row,
  result,
}: {
  row: DistrictDspmTambonRow;
  result: DistrictDspmResult;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <h3 className="mb-1.5 text-sm font-semibold">
          รายหมู่ ({formatNumber(row.villages.length)} หมู่)
        </h3>
        {row.villages.length === 0 ? (
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            ไม่มีข้อมูลรายหมู่
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-xs">
              <thead className={accent.thead}>
                <tr>
                  <th scope="col" className={thClass}>
                    หมู่
                  </th>
                  <th scope="col" className={`${thClass} text-right`}>
                    เป้าหมาย
                  </th>
                  <th scope="col" className={`${thClass} text-right`}>
                    คัดกรอง
                  </th>
                  <th scope="col" className={`${thClass} text-right`}>
                    สงสัยล่าช้า
                  </th>
                  <th scope="col" className={`${thClass} text-right`}>
                    ติดตามได้
                  </th>
                  <th scope="col" className={`${thClass} text-right`}>
                    สมวัย
                  </th>
                  <th scope="col" className={`${thClass} text-right`}>
                    % สมวัย
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {row.villages.map((v) => (
                  <tr key={v.key}>
                    <td className="px-3 py-2">หมู่ {v.moo}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatNumber(v.target)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatNumber(v.screened)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatNumber(v.suspectWait + v.suspectRefer)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatNumber(v.followed)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatNumber(v.normalFirst + v.normalAfter)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <Pct value={v.normalPercent} min={result.targetPercent} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DistrictUnitFreshness units={row.units} />
    </div>
  );
}

/**
 * HDC DSPM report: district totals per age group, then per sub-district
 * (expand for villages + unit freshness). Aggregates only.
 */
export function DistrictDspmTable({ result }: { result: DistrictDspmResult }) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const { district } = result;

  function toggle(code: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-surface shadow-sm dark:border-zinc-800">
        <table className="w-full min-w-208 text-left text-sm">
          <caption className="px-3 py-2 text-left text-sm font-semibold">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span>ภาพรวมอำเภอ{district.name} แยกกลุ่มอายุ</span>
              <ExcelDownloadButton data={dspmAgeExcel(result)} />
            </span>
          </caption>
          <thead className={`text-xs ${accent.thead}`}>
            <tr>
              <th scope="col" className={thClass}>
                กลุ่มอายุ
              </th>
              <CountHeaders result={result} />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {result.ageGroups.map((g) => (
              <tr key={g.ageMonths} className={accent.rowHover}>
                <th scope="row" className={`${tdClass} text-left font-medium`}>
                  {g.ageMonths} เดือน
                </th>
                <CountCells
                  c={g}
                  result={result}
                  label={`ร้อยละสมวัย อายุ ${g.ageMonths} เดือน`}
                />
              </tr>
            ))}
          </tbody>
          <tfoot className={`font-semibold ${accent.footer}`}>
            <tr>
              <th scope="row" className={`${tdClass} text-left`}>
                รวม 5 กลุ่มอายุ
              </th>
              <CountCells c={district} result={result} label="ร้อยละสมวัยรวมอำเภอ" />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-surface shadow-sm dark:border-zinc-800">
        <table className="w-full min-w-224 text-left text-sm">
          <caption className="px-3 py-2 text-left text-sm font-semibold">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span>รายตำบล (กดชื่อตำบลเพื่อดูรายหมู่)</span>
              <ExcelDownloadButton data={dspmTambonExcel(result)} />
            </span>
          </caption>
          <thead className={`text-xs ${accent.thead}`}>
            <tr>
              <th scope="col" className={thClass}>
                ตำบล
              </th>
              <CountHeaders result={result} />
              <th scope="col" className={thClass}>
                ข้อมูลถึง
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {result.tambons.map((row) => {
              const isOpen = open.has(row.tambonCode);
              const panelId = `dspm-detail-${row.tambonCode}`;
              return (
                <Fragment key={row.tambonCode}>
                  <tr className={accent.rowHover}>
                    <td className={tdClass}>
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-controls={panelId}
                        onClick={() => toggle(row.tambonCode)}
                        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded text-left font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                      >
                        {isOpen ? (
                          <ChevronDown aria-hidden="true" className="h-4 w-4" />
                        ) : (
                          <ChevronRight aria-hidden="true" className="h-4 w-4" />
                        )}
                        ต.{row.tambonName}
                      </button>
                    </td>
                    <CountCells
                      c={row}
                      result={result}
                      label={`ร้อยละสมวัย ต.${row.tambonName}`}
                    />
                    <td className={`${tdClass} text-xs`}>
                      {row.dataAsOf ? formatThaiDate(row.dataAsOf) : "—"}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr id={panelId} className={accent.soft}>
                      <td colSpan={11} className="px-3 py-3">
                        <TambonDetail row={row} result={result} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot className={`font-semibold ${accent.footer}`}>
            <tr>
              <th scope="row" className={`${tdClass} text-left`}>
                ยอดรวมอำเภอ{district.name}
              </th>
              <CountCells c={district} result={result} label="ร้อยละสมวัยรวมอำเภอ" />
              <td className={`${tdClass} text-xs`}>
                {formatThaiDate(result.dataAsOf)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        สงสัยล่าช้า = รอกระตุ้น 30 วัน (1B261){" "}
        {formatNumber(district.suspectWait)} + ส่งต่อทันที (1B262){" "}
        {formatNumber(district.suspectRefer)} / หลังกระตุ้น: สมวัย{" "}
        {formatNumber(district.normalAfter)}, ล่าช้าส่งต่อ{" "}
        {formatNumber(district.delayedAfter)}, รอติดตาม{" "}
        {formatNumber(district.waiting)}, ติดตามไม่ได้ใน 30 วัน{" "}
        {formatNumber(district.lost)} / ตัวเลขสีแดง = ต่ำกว่าเกณฑ์
      </p>
    </div>
  );
}
