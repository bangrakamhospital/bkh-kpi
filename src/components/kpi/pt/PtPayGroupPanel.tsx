import type { PtPayGroupRow } from "@/lib/kpi/pt-clinic-types";
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
import { formatBaht, formatNumber } from "../format";

const footClass =
  "border-t-2 border-zinc-300 bg-zinc-50 font-semibold dark:border-zinc-700 dark:bg-zinc-900";
const chipClass =
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold";
const subClass = "block text-xs font-normal text-zinc-600 dark:text-zinc-400";
const mutedClass = "text-zinc-600 dark:text-zinc-400";

const GROUP_TONE: Record<PtPayGroupRow["code"], string> = {
  FULL: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  CAPITATION: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-300",
};

const NOTE =
  "ค่ากายภาพ = รายการในทะเบียนกายภาพ (physic_items: หัตถการกายภาพและกายอุปกรณ์) ที่ HOSxP คิดใน visit กายภาพ ไม่ใช่รายรับจริง กลุ่มเหมาจ่ายได้รับเงินรายหัว ไม่ตรงกับยอดนี้ \"ค่าอื่นของ visit\" (ยา, lab, คลินิกอื่นใน vn เดียวกัน) เป็นข้อมูลประกอบเท่านั้น ซ้อนกับคลินิกอื่น (เช่น NCD) ห้ามนำไปรวมกัน คนหนึ่งอาจมีหลายสิทธิ";

interface Line {
  persons: number;
  visits: number;
  ptBaht: number;
  ptBahtPerVisit: number;
  otherBaht: number;
}

function Cells({ r }: { r: Line }) {
  return (
    <>
      <td className={tdRightClass}>{formatNumber(r.persons)}</td>
      <td className={tdRightClass}>{formatNumber(r.visits)}</td>
      <td className={`${tdRightClass} font-semibold`}>{formatBaht(r.ptBaht)}</td>
      <td className={tdRightClass}>{formatBaht(r.ptBahtPerVisit)}</td>
      <td className={`${tdRightClass} ${mutedClass}`}>{formatBaht(r.otherBaht)}</td>
    </>
  );
}

const excelValues = (r: Line) => [r.persons, r.visits, r.ptBaht, r.ptBahtPerVisit, r.otherBaht];

export function PtPayGroupPanel({
  groups,
  fiscalYear,
}: {
  groups: PtPayGroupRow[];
  fiscalYear: number;
}) {
  const excel: ExcelExport = {
    fileName: `pt-paygroup-fy${fiscalYear}`,
    title: `คลินิกกายภาพ ค่าบริการตามกลุ่มสิทธิ ปีงบประมาณ ${fiscalYear}`,
    sheetName: "ตามสิทธิ",
    columns: [
      { header: "กลุ่ม" },
      { header: "สิทธิ" },
      { header: "คน", format: "int" },
      { header: "visit", format: "int" },
      { header: "ค่ากายภาพ (บาท)", format: "int" },
      { header: "ค่ากายภาพ/visit (บาท)", format: "int" },
      { header: "ค่าอื่นของ visit (บาท, ข้อมูลประกอบ)", format: "int" },
    ],
    rows: groups.flatMap((g) => [
      [g.name, "รวมกลุ่ม", ...excelValues(g)],
      ...g.schemes.map((s) => [g.name, s.name, ...excelValues(s)]),
    ]),
    notes: [NOTE],
  };

  return (
    <section
      aria-label="ค่าบริการกายภาพตามกลุ่มสิทธิ"
      className="min-w-0 rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-base font-semibold">ค่าบริการกายภาพตามกลุ่มสิทธิ</h2>
        <ExcelDownloadButton data={excel} />
      </div>
      <p className={`mt-1 text-xs ${mutedClass}`}>{NOTE}</p>
      <div className="mt-3 space-y-4">
        {groups.map((g) => (
          <div key={g.code} className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`${chipClass} ${GROUP_TONE[g.code]}`}>{g.name}</span>
              <p className={`text-xs ${mutedClass}`}>{g.rule}</p>
            </div>
            <div className="mt-2 overflow-x-auto">
              <table className={`${tableClass} min-w-[40rem]`}>
                <thead className={theadClass}>
                  <tr>
                    <th scope="col" className={thClass}>สิทธิ</th>
                    <th scope="col" className={thRightClass}>คน</th>
                    <th scope="col" className={thRightClass}>visit</th>
                    <th scope="col" className={thRightClass}>ค่ากายภาพ (บาท)</th>
                    <th scope="col" className={thRightClass}>บาท/visit</th>
                    <th scope="col" className={thRightClass}>ค่าอื่นของ visit (บาท)</th>
                  </tr>
                </thead>
                <tbody>
                  {g.schemes.map((s) => (
                    <tr key={s.code} className={trClass}>
                      <th scope="row" className={`${tdClass} text-left font-medium`}>
                        {s.name}
                        {s.visits === 0 && <span className={subClass}>ไม่มี visit</span>}
                      </th>
                      <Cells r={s} />
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className={footClass}>
                    <th scope="row" className={`${tdClass} text-left`}>รวมกลุ่ม</th>
                    <Cells r={g} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
