import type { PtImcRow, PtIndicator } from "@/lib/kpi/pt-clinic-types";
import { InfoPopover } from "../InfoPopover";
import { ProgressBar } from "../ProgressBar";
import { ExcelDownloadButton, type ExcelExport } from "../overview/ExcelDownloadButton";
import {
  footClass,
  mutedClass,
  tableClass,
  tdClass,
  tdRightClass,
  thClass,
  theadClass,
  thRightClass,
  trClass,
} from "../overview/table-styles";
import { formatNumber, formatPercent } from "../format";

const pctText = (n: number, d: number) => (d > 0 ? `${formatPercent((n / d) * 100)}%` : "–");

function ImcCells({ r }: { r: Omit<PtImcRow, "code" | "name" | "icd10"> }) {
  return (
    <>
      <td className={tdRightClass}>{formatNumber(r.admissions)}</td>
      <td className={tdRightClass}>
        {formatNumber(r.ipdPt)}
        <span className={`block text-xs ${mutedClass}`}>{pctText(r.ipdPt, r.admissions)}</span>
      </td>
      <td className={tdRightClass}>
        {formatNumber(r.opdPt)}
        <span className={`block text-xs ${mutedClass}`}>{pctText(r.opdPt, r.admissions)}</span>
      </td>
      <td className={`${tdRightClass} font-semibold`}>
        {formatNumber(r.anyPt)}
        <span className={`block text-xs font-normal ${mutedClass}`}>{pctText(r.anyPt, r.admissions)}</span>
      </td>
      <td className={tdRightClass}>{formatNumber(r.openWindow)}</td>
    </>
  );
}

export function PtQualityPanel({
  indicators,
  imc,
  followUpDays,
  fiscalYear,
}: {
  indicators: PtIndicator[];
  imc: PtImcRow[];
  followUpDays: number;
  fiscalYear: number;
}) {
  const sum = (pick: (r: PtImcRow) => number) => imc.reduce((s, r) => s + pick(r), 0);
  const imcTotal = {
    admissions: sum((r) => r.admissions),
    persons: sum((r) => r.persons),
    ipdPt: sum((r) => r.ipdPt),
    opdPt: sum((r) => r.opdPt),
    anyPt: sum((r) => r.anyPt),
    openWindow: sum((r) => r.openWindow),
  };

  const excel: ExcelExport = {
    fileName: `pt-quality-fy${fiscalYear}`,
    title: `คลินิกกายภาพ ตัวชี้วัดติดตาม ปีงบประมาณ ${fiscalYear}`,
    sheetName: "ตัวชี้วัด",
    columns: [
      { header: "ตัวชี้วัด / กลุ่ม IMC" },
      { header: "ตัวตั้ง", format: "int" },
      { header: "ตัวหาร", format: "int" },
      { header: "หน่วย" },
      { header: "ร้อยละ", format: "pct" },
    ],
    rows: [
      ...indicators.map((i) => [i.name, i.numerator, i.denominator, i.unit, i.percent]),
      ...imc.map((r) => [
        `IMC ${r.name} (${r.icd10}) ได้รับกายภาพ`,
        r.anyPt,
        r.admissions,
        "admission",
        r.admissions > 0 ? Math.round((r.anyPt / r.admissions) * 1000) / 10 : null,
      ]),
    ],
    notes: indicators.map((i) => `${i.name}: ${i.definition}`),
  };

  return (
    <section
      aria-label="ตัวชี้วัดคุณภาพ"
      className="min-w-0 rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-base font-semibold">ตัวชี้วัดคุณภาพ (ติดตาม)</h2>
        <ExcelDownloadButton data={excel} />
      </div>
      <p className={`mt-1 text-xs ${mutedClass}`}>
        ยังไม่มีเกณฑ์ทางการที่ตรงกับนิยามจาก HOSxP แสดงเพื่อติดตามแนวโน้มเท่านั้น (ไม่มีเส้นเกณฑ์/ผ่าน-ไม่ผ่าน)
      </p>
      <div className="mt-3 overflow-x-auto">
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
                        { label: "เกณฑ์", value: "ไม่มีเกณฑ์ทางการ แสดงเพื่อติดตาม" },
                      ]}
                    />
                  </div>
                </td>
                <td className={tdRightClass}>
                  {formatNumber(i.numerator)}
                  <span className={`block text-xs ${mutedClass}`}>{i.unit}</span>
                </td>
                <td className={tdRightClass}>{formatNumber(i.denominator)}</td>
                <td className={`${tdRightClass} font-semibold`}>
                  {i.percent === null ? "–" : `${formatPercent(i.percent)}%`}
                </td>
                <td className={tdClass}>
                  {i.percent !== null && (
                    <ProgressBar
                      percent={i.percent}
                      targetPercent={null}
                      barClass="bg-brand-600"
                      label={`${i.name} ${formatPercent(i.percent)}%`}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mt-4 text-sm font-semibold">ผู้ป่วย IMC จำหน่ายกลับบ้าน กับการได้รับกายภาพ</h3>
      <p className={`mt-1 text-xs ${mutedClass}`}>
        admission ที่จำหน่ายในปีงบฯ แบบ With Approval ตาม pdx · ระหว่างนอน = มีบันทึกกายภาพผู้ป่วยใน · OPD = มา visit กายภาพภายใน {formatNumber(followUpDays)} วันหลังจำหน่าย · &quot;ยังติดตามไม่ครบ&quot; = จำหน่ายไม่ถึง {formatNumber(followUpDays)} วัน (ตัวเลข OPD ยังเพิ่มได้) ไม่มีข้อมูล Barthel Index ใน HOSxP
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className={`${tableClass} min-w-[44rem]`}>
          <thead className={theadClass}>
            <tr>
              <th scope="col" className={thClass}>กลุ่ม IMC</th>
              <th scope="col" className={thRightClass}>admission</th>
              <th scope="col" className={thRightClass}>กายภาพระหว่างนอน</th>
              <th scope="col" className={thRightClass}>OPD ภายใน {formatNumber(followUpDays)} วัน</th>
              <th scope="col" className={thRightClass}>ได้รับกายภาพ</th>
              <th scope="col" className={thRightClass}>ยังติดตามไม่ครบ</th>
            </tr>
          </thead>
          <tbody>
            {imc.map((r) => (
              <tr key={r.code} className={trClass}>
                <th scope="row" className={`${tdClass} text-left font-medium`}>
                  {r.name}
                  <span className={`block text-xs font-normal ${mutedClass}`}>{r.icd10}</span>
                </th>
                <ImcCells r={r} />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className={footClass}>
              <th scope="row" className={`${tdClass} text-left`}>รวม IMC</th>
              <ImcCells r={imcTotal} />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
