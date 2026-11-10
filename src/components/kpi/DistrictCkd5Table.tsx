import type { DistrictCkd5Result } from "@/lib/kpi/types";
import { targetOperatorSign } from "@/lib/kpi/screening-indicators";
import { ACCENTS } from "./indicator-theme";
import { formatNumber, formatPercent, formatThaiDate } from "./format";

const thClass = "px-3 py-2 font-semibold";
const tdClass = "px-3 py-2.5";

const NOT_COMPARABLE = "ข้อมูลปีก่อนไม่พอ";

/**
 * KPI 10 CKD5 by sub-district: new cases this FY vs previous FY. No
 * percentage per sub-district (numbers are tiny); the reduction percent is
 * shown for the district only, or "ข้อมูลปีก่อนไม่พอ" when the previous FY
 * is not in HDC.
 */
export function DistrictCkd5Table({ result }: { result: DistrictCkd5Result }) {
  const accent = ACCENTS.ckd5;
  const { district, previousYearComparable: comparable } = result;
  const prevFy = result.fiscalYear - 1;

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-surface shadow-sm dark:border-zinc-800">
      <table className="w-full min-w-160 text-left text-sm">
        <caption className="sr-only">
          ผู้ป่วยไตเรื้อรัง stage 5 รายใหม่ รายตำบล อำเภอบางระกำ ปีงบประมาณ{" "}
          {result.fiscalYear}
        </caption>
        <thead className={`text-xs ${accent.thead}`}>
          <tr>
            <th scope="col" className={thClass}>
              ตำบล
            </th>
            <th scope="col" className={`${thClass} text-right`}>
              รายใหม่ ปีงบ {result.fiscalYear}
            </th>
            <th scope="col" className={`${thClass} text-right`}>
              รายใหม่ ปีงบ {prevFy}
            </th>
            <th scope="col" className={`${thClass} text-right`}>
              ปีงบ {prevFy} ช่วงเดียวกัน
            </th>
            <th scope="col" className={thClass}>
              ข้อมูลถึง
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {result.tambons.map((t) => (
            <tr key={t.tambonCode} className={accent.rowHover}>
              <th scope="row" className={`${tdClass} text-left font-medium`}>
                ต.{t.tambonName}
                {t.villages.length > 0 && (
                  <span className="block text-xs font-normal text-zinc-600 dark:text-zinc-400">
                    {t.villages
                      .map(
                        (v) =>
                          `ม.${v.moo}: ${v.currentCases}${comparable ? `/${v.previousCases}` : ""}`,
                      )
                      .join(", ")}
                  </span>
                )}
              </th>
              <td className={`${tdClass} text-right tabular-nums`}>
                {formatNumber(t.currentCases)}
              </td>
              <td className={`${tdClass} text-right tabular-nums`}>
                {comparable ? (
                  formatNumber(t.previousCases)
                ) : (
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">
                    {NOT_COMPARABLE}
                  </span>
                )}
              </td>
              <td className={`${tdClass} text-right tabular-nums`}>
                {comparable ? formatNumber(t.previousSamePeriod) : "—"}
              </td>
              <td className={`${tdClass} text-xs`}>
                {t.dataAsOf ? formatThaiDate(t.dataAsOf) : "ยังไม่มีข้อมูล"}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className={`font-semibold ${accent.footer}`}>
          <tr>
            <th scope="row" className={`${tdClass} text-left`}>
              ยอดรวมอำเภอ{district.name}
            </th>
            <td className={`${tdClass} text-right tabular-nums`}>
              {formatNumber(district.currentCases)}
            </td>
            <td className={`${tdClass} text-right tabular-nums`}>
              {comparable ? formatNumber(district.previousCases) : NOT_COMPARABLE}
            </td>
            <td className={`${tdClass} text-right tabular-nums`}>
              {comparable ? formatNumber(district.previousSamePeriod) : "—"}
            </td>
            <td className={`${tdClass} text-xs`}>
              ลดลง{" "}
              {district.reductionPercent === null
                ? NOT_COMPARABLE
                : formatPercent(district.reductionPercent)}{" "}
              (เกณฑ์ {targetOperatorSign(result.targetOperator)}{" "}
              {formatNumber(result.targetPercent)}%)
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
