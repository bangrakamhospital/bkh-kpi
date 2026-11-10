"use client";

import { Fragment, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import type {
  DistrictScreeningResult,
  DistrictTambonRow,
} from "@/lib/kpi/types";
import { targetOperatorSign } from "@/lib/kpi/screening-indicators";
import { ACCENTS } from "./indicator-theme";
import { DISTRICT_ACCENT, isLabIndicator } from "./district-codes";
import { DistrictPersonsButton } from "./DistrictPersonsDialog";
import { ProgressBar } from "./ProgressBar";
import { formatNumber, formatPercent, formatThaiDate } from "./format";

const thClass = "px-3 py-2 font-semibold";
const tdClass = "px-3 py-2.5";

function PercentCell({
  percent,
  targetPercent,
  barClass,
  label,
}: {
  percent: number;
  targetPercent: number;
  barClass: string;
  label: string;
}) {
  return (
    <div className="min-w-40">
      <span className="block text-right text-sm font-bold tabular-nums">
        {formatPercent(percent)}
      </span>
      <div className="mt-1.5">
        <ProgressBar
          percent={percent}
          targetPercent={targetPercent}
          barClass={barClass}
          label={label}
        />
      </div>
    </div>
  );
}

function TambonDetail({
  row,
  accentThead,
  result,
}: {
  row: DistrictTambonRow;
  accentThead: string;
  result: DistrictScreeningResult;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
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
              <thead className={accentThead}>
                <tr>
                  <th scope="col" className={thClass}>
                    หมู่
                  </th>
                  <th scope="col" className={thClass}>
                    ชื่อหมู่บ้าน
                  </th>
                  <th scope="col" className={`${thClass} text-right`}>
                    B
                  </th>
                  <th scope="col" className={`${thClass} text-right`}>
                    A
                  </th>
                  <th scope="col" className={`${thClass} text-right`}>
                    %
                  </th>
                  <th scope="col" className={`${thClass} text-center`}>
                    รายชื่อ
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {row.villages.map((v) => (
                  <tr key={v.key}>
                    <td className="px-3 py-2 tabular-nums">{v.moo}</td>
                    <td className="px-3 py-2">
                      {v.villageName ?? `หมู่ ${v.moo}`}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatNumber(v.denominator)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatNumber(v.numerator)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatPercent(v.percent)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <DistrictPersonsButton
                        code={result.code}
                        fiscalYear={result.fiscalYear}
                        scope={{ kind: "village", vid: v.key }}
                        areaLabel={`ต.${row.tambonName} หมู่ ${v.moo}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-1.5 text-sm font-semibold">
          ความสดของข้อมูลรายหน่วยบริการ
        </h3>
        <ul className="space-y-1.5 text-xs">
          {row.units.map((u) => (
            <li
              key={u.hospcode}
              className="rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"
            >
              <span className="block font-medium">{u.name}</span>
              <span className="block text-zinc-600 dark:text-zinc-400">
                ส่งข้อมูลบริการล่าสุด:{" "}
                {u.lastServiceDate ? formatThaiDate(u.lastServiceDate) : "—"}
              </span>
              {u.lastScreenDate !== undefined && (
                <span className="block text-zinc-600 dark:text-zinc-400">
                  ส่งผลคัดกรองล่าสุด:{" "}
                  {u.lastScreenDate ? formatThaiDate(u.lastScreenDate) : "—"}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function DistrictScreeningTable({
  result,
}: {
  result: DistrictScreeningResult;
}) {
  const accent = ACCENTS[DISTRICT_ACCENT[result.code]];
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  function toggle(code: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  if (result.tambons.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-surface p-6 text-center text-sm text-zinc-700 shadow-sm dark:border-zinc-800 dark:text-zinc-300">
        ไม่พบข้อมูลรายตำบล
      </div>
    );
  }

  const { district } = result;

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-surface shadow-sm dark:border-zinc-800">
      <table className="w-full min-w-176 text-left text-sm">
        <caption className="sr-only">
          {isLabIndicator(result.code) ? "ผลการตรวจ" : "ผลคัดกรอง"} {result.name} รายตำบล อำเภอบางระกำ ปีงบประมาณ{" "}
          {result.fiscalYear}
        </caption>
        <thead className={`text-xs ${accent.thead}`}>
          <tr>
            <th scope="col" className={thClass}>
              ตำบล
            </th>
            <th scope="col" className={`${thClass} text-right`}>
              B
            </th>
            <th scope="col" className={`${thClass} text-right`}>
              A
            </th>
            <th scope="col" className={thClass}>
              ร้อยละ (เกณฑ์ {targetOperatorSign(result.targetOperator)}{" "}
              {formatNumber(result.targetPercent)}%)
            </th>
            <th scope="col" className={thClass}>
              ข้อมูลถึง
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {result.tambons.map((row) => {
            const isOpen = open.has(row.tambonCode);
            const panelId = `district-detail-${row.tambonCode}`;
            return (
              <Fragment key={row.tambonCode}>
                <tr className={accent.rowHover}>
                  <td className={tdClass}>
                    <div className="flex items-center justify-between gap-3">
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
                      <span className="ml-auto shrink-0">
                        <DistrictPersonsButton
                          code={result.code}
                          fiscalYear={result.fiscalYear}
                          scope={{ kind: "tambon", tambonCode: row.tambonCode }}
                          areaLabel={`ต.${row.tambonName} (ทั้งตำบล)`}
                          buttonLabel="รายชื่อทั้งตำบล"
                        />
                      </span>
                    </div>
                  </td>
                  {row.error ? (
                    <td
                      colSpan={3}
                      className={`${tdClass} text-xs text-red-800 dark:text-red-300`}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <AlertTriangle
                          aria-hidden="true"
                          className="h-4 w-4 shrink-0"
                        />
                        {row.error}
                      </span>
                    </td>
                  ) : (
                    <>
                      <td className={`${tdClass} text-right tabular-nums`}>
                        {formatNumber(row.denominator)}
                      </td>
                      <td className={`${tdClass} text-right tabular-nums`}>
                        {formatNumber(row.numerator)}
                      </td>
                      <td className={tdClass}>
                        <PercentCell
                          percent={row.percent}
                          targetPercent={result.targetPercent}
                          barClass={accent.bar}
                          label={`ร้อยละ ต.${row.tambonName}`}
                        />
                      </td>
                    </>
                  )}
                  <td className={`${tdClass} text-xs`}>
                    {row.dataAsOf ? formatThaiDate(row.dataAsOf) : "—"}
                  </td>
                </tr>
                {isOpen && (
                  <tr id={panelId} className={accent.soft}>
                    <td colSpan={5} className="px-3 py-3">
                      <TambonDetail
                        row={row}
                        accentThead={accent.thead}
                        result={result}
                      />
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
            <td className={`${tdClass} text-right tabular-nums`}>
              {formatNumber(district.denominator)}
            </td>
            <td className={`${tdClass} text-right tabular-nums`}>
              {formatNumber(district.numerator)}
            </td>
            <td className={tdClass}>
              <PercentCell
                percent={district.percent}
                targetPercent={result.targetPercent}
                barClass={accent.bar}
                label="ร้อยละรวมอำเภอ"
              />
            </td>
            <td className={`${tdClass} text-xs`}>
              {formatThaiDate(result.dataAsOf)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
