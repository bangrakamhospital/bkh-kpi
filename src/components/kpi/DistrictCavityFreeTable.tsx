"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type {
  CavityFreeCounts,
  DistrictCavityFreeResult,
  DistrictCavityFreeTambonRow,
} from "@/lib/kpi/types";
import { meetsTarget, targetOperatorSign } from "@/lib/kpi/screening-indicators";
import { ACCENTS } from "./indicator-theme";
import { DistrictUnitFreshness } from "./DistrictUnitFreshness";
import { ProgressBar } from "./ProgressBar";
import { formatNumber, formatPercent, formatThaiDate } from "./format";

const thClass = "px-3 py-2 font-semibold";
const tdClass = "px-3 py-2.5";
const num = `${tdClass} text-right tabular-nums`;
const accent = ACCENTS.cavityFree;

function CountHeaders({ result }: { result: DistrictCavityFreeResult }) {
  return (
    <>
      <th scope="col" className={`${thClass} text-right`}>
        เด็กทั้งหมด (C)
      </th>
      <th scope="col" className={`${thClass} text-right`}>
        ตรวจช่องปาก (B)
      </th>
      <th scope="col" className={`${thClass} text-right`}>
        % ตรวจ (B/C)
      </th>
      <th scope="col" className={`${thClass} text-right`}>
        ฟันดีไม่มีผุ (A)
      </th>
      <th scope="col" className={thClass}>
        % ฟันดีไม่มีผุ A/B (เกณฑ์ {targetOperatorSign(result.targetOperator)}{" "}
        {formatNumber(result.targetPercent)}%)
      </th>
    </>
  );
}

function CountCells({
  c,
  result,
  label,
}: {
  c: CavityFreeCounts;
  result: DistrictCavityFreeResult;
  label: string;
}) {
  return (
    <>
      <td className={num}>{formatNumber(c.target)}</td>
      <td className={num}>{formatNumber(c.examined)}</td>
      <td className={num}>{formatPercent(c.examPercent)}</td>
      <td className={num}>{formatNumber(c.cavityFree)}</td>
      <td className={tdClass}>
        <div className="min-w-32">
          <span className="block text-right text-sm font-bold tabular-nums">
            {formatPercent(c.percent)}
          </span>
          <div className="mt-1.5">
            <ProgressBar
              percent={c.percent}
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
  row: DistrictCavityFreeTambonRow;
  result: DistrictCavityFreeResult;
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
                    C
                  </th>
                  <th scope="col" className={`${thClass} text-right`}>
                    B
                  </th>
                  <th scope="col" className={`${thClass} text-right`}>
                    A
                  </th>
                  <th scope="col" className={`${thClass} text-right`}>
                    % A/B
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {row.villages.map((v) => {
                  const below =
                    v.examined > 0 &&
                    !meetsTarget(v.percent, result.targetPercent, result.targetOperator);
                  return (
                    <tr key={v.key}>
                      <td className="px-3 py-2">หมู่ {v.moo}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatNumber(v.target)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatNumber(v.examined)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatNumber(v.cavityFree)}
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${below ? "text-red-700 dark:text-red-400" : ""}`}
                      >
                        {formatPercent(v.percent)}
                      </td>
                    </tr>
                  );
                })}
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
 * HDC Cavity Free 0–5: district totals per age, then per sub-district
 * (expand for villages + unit freshness). Aggregates only.
 */
export function DistrictCavityFreeTable({
  result,
}: {
  result: DistrictCavityFreeResult;
}) {
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
        <table className="w-full min-w-176 text-left text-sm">
          <caption className="px-3 py-2 text-left text-sm font-semibold">
            ภาพรวมอำเภอ{district.name} แยกอายุ (ปีเต็ม ณ 1 ม.ค.)
          </caption>
          <thead className={`text-xs ${accent.thead}`}>
            <tr>
              <th scope="col" className={thClass}>
                อายุ
              </th>
              <CountHeaders result={result} />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {result.ageGroups.map((g) => (
              <tr key={g.ageYears} className={accent.rowHover}>
                <th scope="row" className={`${tdClass} text-left font-medium`}>
                  {g.ageYears} ปี
                </th>
                <CountCells
                  c={g}
                  result={result}
                  label={`ร้อยละฟันดีไม่มีผุ อายุ ${g.ageYears} ปี`}
                />
              </tr>
            ))}
          </tbody>
          <tfoot className={`font-semibold ${accent.footer}`}>
            <tr>
              <th scope="row" className={`${tdClass} text-left`}>
                รวม 0–5 ปี
              </th>
              <CountCells
                c={district}
                result={result}
                label="ร้อยละฟันดีไม่มีผุรวมอำเภอ"
              />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-surface shadow-sm dark:border-zinc-800">
        <table className="w-full min-w-192 text-left text-sm">
          <caption className="px-3 py-2 text-left text-sm font-semibold">
            รายตำบล (กดชื่อตำบลเพื่อดูรายหมู่)
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
              const panelId = `cavity-free-detail-${row.tambonCode}`;
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
                      label={`ร้อยละฟันดีไม่มีผุ ต.${row.tambonName}`}
                    />
                    <td className={`${tdClass} text-xs`}>
                      {row.dataAsOf ? formatThaiDate(row.dataAsOf) : "—"}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr id={panelId} className={accent.soft}>
                      <td colSpan={7} className="px-3 py-3">
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
              <CountCells
                c={district}
                result={result}
                label="ร้อยละฟันดีไม่มีผุรวมอำเภอ"
              />
              <td className={`${tdClass} text-xs`}>
                {formatThaiDate(result.dataAsOf)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
