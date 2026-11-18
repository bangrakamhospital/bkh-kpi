import type { DentalAgeRow, DentalIndicator } from "@/lib/kpi/dental-clinic-types";
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

function targetText(i: DentalIndicator): string {
  if (i.target === null || i.targetOperator === null) return "ไม่มีเกณฑ์";
  return `${i.targetOperator === "<=" ? "≤" : "≥"} ${formatNumber(i.target)}%`;
}

const barColor = (pass: boolean | null) =>
  pass === null ? "bg-brand-500" : pass ? "bg-emerald-500" : "bg-red-500";

export function DentalQualityPanel({
  indicators,
  ages,
  fiscalYear,
}: {
  indicators: DentalIndicator[];
  ages: DentalAgeRow[];
  fiscalYear: number;
}) {
  const ageVisits = ages.reduce((s, a) => s + a.visits, 0);
  const excel: ExcelExport = {
    fileName: `dental-quality-fy${fiscalYear}`,
    title: `คลินิกทันตกรรม ตัวชี้วัดคุณภาพ ปีงบประมาณ ${fiscalYear}`,
    sheetName: "คุณภาพ",
    columns: [
      { header: "ตัวชี้วัด" },
      { header: "ตัวตั้ง", format: "int" },
      { header: "ตัวหาร", format: "int" },
      { header: "หน่วย" },
      { header: "ร้อยละ", format: "pct" },
      { header: "เกณฑ์" },
    ],
    rows: [
      ...indicators.map((i) => [
        i.name,
        i.numerator,
        i.denominator,
        i.unit,
        i.percent,
        targetText(i),
      ]),
      [],
      ["กลุ่มอายุ", "คน", "visit", "", "ร้อยละ visit", ""],
      ...ages.map((a) => [
        a.name,
        a.persons,
        a.visits,
        "",
        ageVisits > 0 ? Math.round((a.visits / ageVisits) * 1000) / 10 : null,
        "",
      ]),
    ],
    notes: indicators.map((i) => `${i.name}: ${i.definition}`),
  };

  return (
    <section
      aria-label="ตัวชี้วัดคุณภาพทันตกรรม"
      className="min-w-0 rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-base font-semibold">ตัวชี้วัดคุณภาพและกลุ่มผู้รับบริการ</h2>
        <ExcelDownloadButton data={excel} />
      </div>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
        ตัวชี้วัดชุดนี้ยังไม่มีเกณฑ์ทางการที่ยืนยันได้จาก HOSxP จึงแสดงเพื่อติดตามแนวโน้มเท่านั้น (ไม่ตัดสินผ่าน/ไม่ผ่าน)
      </p>
      <div className="mt-3 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="min-w-0 overflow-x-auto xl:col-span-2">
          <table className={`${tableClass} min-w-[40rem]`}>
            <thead className={theadClass}>
              <tr>
                <th scope="col" className={thClass}>ตัวชี้วัด</th>
                <th scope="col" className={thRightClass}>ตัวตั้ง</th>
                <th scope="col" className={thRightClass}>ตัวหาร</th>
                <th scope="col" className={thRightClass}>ร้อยละ</th>
                <th scope="col" className={thClass}>สัดส่วน</th>
              </tr>
            </thead>
            <tbody>
              {indicators.map((i) => (
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="min-w-0 overflow-x-auto">
          <table className={`${tableClass} min-w-[20rem]`}>
            <thead className={theadClass}>
              <tr>
                <th scope="col" className={thClass}>กลุ่มอายุ (ณ วันรับบริการ)</th>
                <th scope="col" className={thRightClass}>คน</th>
                <th scope="col" className={thRightClass}>visit</th>
              </tr>
            </thead>
            <tbody>
              {ages.map((a) => (
                <tr key={a.code} className={trClass}>
                  <th scope="row" className={`${tdClass} text-left font-medium`}>{a.name}</th>
                  <td className={tdRightClass}>{formatNumber(a.persons)}</td>
                  <td className={tdRightClass}>
                    {formatNumber(a.visits)}
                    <span className="block text-xs text-zinc-600 dark:text-zinc-400">
                      {ageVisits > 0 ? `${formatPercent((a.visits / ageVisits) * 100)}%` : "–"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
            คนที่มีวันเกิดระหว่างปีอาจอยู่ได้ 2 กลุ่ม ผลรวมคนจึงมากกว่าคนทั้งหมดเล็กน้อย
          </p>
        </div>
      </div>
    </section>
  );
}
