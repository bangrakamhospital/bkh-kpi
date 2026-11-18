import type { NcdIndicator } from "@/lib/kpi/ncd-clinic-types";
import { InfoPopover } from "../InfoPopover";
import { ProgressBar } from "../ProgressBar";
import { ExcelDownloadButton, type ExcelExport } from "../overview/ExcelDownloadButton";
import {
  tableClass,
  tdClass,
  tdRightClass,
  theadClass,
  thClass,
  thRightClass,
  trClass,
} from "../overview/table-styles";
import { formatNumber, formatPercent } from "../format";

const GROUPS: { code: NcdIndicator["group"]; label: string }[] = [
  { code: "DM", label: "เบาหวาน (DM)" },
  { code: "HT", label: "ความดันโลหิตสูง (HT)" },
  { code: "CKD", label: "โรคไต (CKD)" },
  { code: "LAB", label: "การตรวจ lab" },
];

const chipClass =
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold";

function targetText(i: NcdIndicator): string {
  if (i.target === null || i.targetOperator === null) return "ไม่มีเกณฑ์";
  const op = i.targetOperator === "<=" ? "≤" : i.targetOperator === ">=" ? "≥" : ">";
  return `${op} ${formatNumber(i.target)}%`;
}

function Result({ pass }: { pass: boolean | null }) {
  if (pass === null) return <span className="text-zinc-500">–</span>;
  return pass ? (
    <span className={`${chipClass} bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300`}>
      ผ่าน
    </span>
  ) : (
    <span className={`${chipClass} bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-300`}>
      ไม่ผ่าน
    </span>
  );
}

const barColor = (pass: boolean | null) =>
  pass === null ? "bg-zinc-400" : pass ? "bg-emerald-500" : "bg-red-500";

export function NcdIndicatorTable({
  indicators,
  fiscalYear,
}: {
  indicators: NcdIndicator[];
  fiscalYear: number;
}) {
  const sections = GROUPS.map((g) => ({
    ...g,
    rows: indicators.filter((i) => i.group === g.code),
  })).filter((s) => s.rows.length > 0);

  const excel: ExcelExport = {
    fileName: `ncd-indicators-fy${fiscalYear}`,
    title: `NCD Clinic ตัวชี้วัดคุณภาพ ปีงบประมาณ ${fiscalYear}`,
    sheetName: "ตัวชี้วัด",
    columns: [
      { header: "กลุ่ม" },
      { header: "ตัวชี้วัด" },
      { header: "ตัวตั้ง", format: "int" },
      { header: "ตัวหาร", format: "int" },
      { header: "หน่วย" },
      { header: "ร้อยละ", format: "pct" },
      { header: "เกณฑ์" },
      { header: "แหล่งเกณฑ์" },
      { header: "ผล" },
    ],
    rows: indicators.map((i) => [
      i.group,
      i.name,
      i.numerator,
      i.denominator,
      i.unit,
      i.percent,
      targetText(i),
      i.targetSource ?? "",
      i.pass === null ? "–" : i.pass ? "ผ่าน" : "ไม่ผ่าน",
    ]),
    notes: indicators.map((i) => `${i.name}: ${i.definition}`),
  };

  return (
    <section
      aria-label="ตัวชี้วัดคุณภาพ"
      className="min-w-0 rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-base font-semibold">ตัวชี้วัดคุณภาพ</h2>
        <ExcelDownloadButton data={excel} />
      </div>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
        ตัวหารของ DM/HT = ผู้ป่วยของคลินิกตามรหัสโรคในปีงบฯ (ไม่ได้ตรวจ = ไม่ผ่าน) เส้นดำบนแถบ = เกณฑ์ ตัวชี้วัดที่ไม่มีเกณฑ์ทางการแสดงเพื่อติดตามเท่านั้น
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className={`${tableClass} min-w-[50rem]`}>
          <thead className={theadClass}>
            <tr>
              <th scope="col" className={thClass}>ตัวชี้วัด</th>
              <th scope="col" className={thRightClass}>ตัวตั้ง</th>
              <th scope="col" className={thRightClass}>ตัวหาร</th>
              <th scope="col" className={thRightClass}>ร้อยละ</th>
              <th scope="col" className={thClass}>เทียบเกณฑ์</th>
              <th scope="col" className={thRightClass}>เกณฑ์</th>
              <th scope="col" className={thClass}>ผล</th>
            </tr>
          </thead>
          {sections.map((s) => (
            <tbody key={s.code}>
              <tr className="bg-zinc-50 dark:bg-zinc-900">
                <th
                  scope="colgroup"
                  colSpan={7}
                  className="px-3 py-1.5 text-left text-sm font-semibold"
                >
                  {s.label}
                </th>
              </tr>
              {s.rows.map((i) => (
                <tr key={i.code} className={trClass}>
                  <td className={tdClass}>
                    <div className="flex items-start gap-1.5">
                      <p className="font-medium">{i.name}</p>
                      <InfoPopover
                        label={`นิยามตัวชี้วัด ${i.name}`}
                        title={i.name}
                        items={[
                          { label: "นิยาม", value: i.definition },
                          { label: "หน่วยนับ", value: i.unit },
                          {
                            label: "เกณฑ์",
                            value:
                              i.target === null
                                ? "ไม่มีเกณฑ์ทางการ แสดงเพื่อติดตาม"
                                : `${targetText(i)} (${i.targetSource ?? "-"})`,
                          },
                        ]}
                      />
                    </div>
                  </td>
                  <td className={tdRightClass}>
                    {formatNumber(i.numerator)}
                    <span className="block text-xs text-zinc-600 dark:text-zinc-400">{i.unit}</span>
                  </td>
                  <td className={tdRightClass}>{formatNumber(i.denominator)}</td>
                  <td className={`${tdRightClass} font-semibold`}>
                    {i.percent === null ? "–" : `${formatPercent(i.percent)}%`}
                  </td>
                  <td className={tdClass}>
                    {i.percent !== null && (
                      <ProgressBar
                        percent={i.percent}
                        targetPercent={i.target}
                        barClass={barColor(i.pass)}
                        label={`${i.name} ${formatPercent(i.percent)}%`}
                      />
                    )}
                  </td>
                  <td className={`${tdRightClass} whitespace-nowrap`}>{targetText(i)}</td>
                  <td className={tdClass}>
                    <Result pass={i.pass} />
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </section>
  );
}
