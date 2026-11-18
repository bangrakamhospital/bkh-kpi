import type { DentalPayGroupRow } from "@/lib/kpi/dental-clinic-types";
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

const GROUP_TONE: Record<DentalPayGroupRow["code"], string> = {
  FULL: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  CAPITATION: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-300",
};

const NOTE =
  "บาท = ค่าบริการที่ห้องฟันคิดใน HOSxP ไม่ใช่รายรับจริง กลุ่มเหมาจ่ายได้รับเงินรายหัว (และค่าบริการทันตกรรมบางรายการจ่ายแยกตามรายการ) ซึ่งไม่ตรงกับยอดนี้ สิทธิใช้กติกาเดียวกับคลินิกโรคเรื้อรัง คนหนึ่งอาจมีหลายสิทธิ จำนวนคนรวมกันจึงมากกว่าคนทั้งหมด";

interface Line {
  persons: number;
  visits: number;
  baht: number;
  bahtPerVisit: number;
  dentalFeeBaht: number;
  prosthesisBaht: number;
  procedureBaht: number;
  drugBaht: number;
  xrayBaht: number;
  otherBaht: number;
}

/** Drugs + x-ray + other (small amounts) in one column. */
const restOf = (r: Line) => r.drugBaht + r.xrayBaht + r.otherBaht;

function Cells({ r }: { r: Line }) {
  return (
    <>
      <td className={tdRightClass}>{formatNumber(r.persons)}</td>
      <td className={tdRightClass}>{formatNumber(r.visits)}</td>
      <td className={tdRightClass}>{formatBaht(r.baht)}</td>
      <td className={tdRightClass}>{formatBaht(r.bahtPerVisit)}</td>
      <td className={tdRightClass}>{formatBaht(r.dentalFeeBaht)}</td>
      <td className={tdRightClass}>{formatBaht(r.prosthesisBaht)}</td>
      <td className={tdRightClass}>{formatBaht(r.procedureBaht)}</td>
      <td className={tdRightClass}>{formatBaht(restOf(r))}</td>
    </>
  );
}

const excelColumns: ExcelExport["columns"] = [
  { header: "กลุ่ม" },
  { header: "สิทธิ" },
  { header: "คน", format: "int" },
  { header: "visit", format: "int" },
  { header: "ค่าบริการ (บาท)", format: "int" },
  { header: "บาท/visit", format: "int" },
  { header: "ค่าทันตกรรม (บาท)", format: "int" },
  { header: "ฟันเทียม/อวัยวะเทียม (บาท)", format: "int" },
  { header: "หัตถการ (บาท)", format: "int" },
  { header: "ยา (บาท)", format: "int" },
  { header: "รังสี (บาท)", format: "int" },
  { header: "อื่นๆ (บาท)", format: "int" },
];

const excelValues = (r: Line) => [
  r.persons,
  r.visits,
  r.baht,
  r.bahtPerVisit,
  r.dentalFeeBaht,
  r.prosthesisBaht,
  r.procedureBaht,
  r.drugBaht,
  r.xrayBaht,
  r.otherBaht,
];

export function DentalPayGroupPanel({
  groups,
  fiscalYear,
}: {
  groups: DentalPayGroupRow[];
  fiscalYear: number;
}) {
  const excel: ExcelExport = {
    fileName: `dental-paygroup-fy${fiscalYear}`,
    title: `คลินิกทันตกรรม ค่าบริการตามกลุ่มสิทธิ ปีงบประมาณ ${fiscalYear}`,
    sheetName: "ตามสิทธิ",
    columns: excelColumns,
    rows: groups.flatMap((g) => [
      [g.name, "รวมกลุ่ม", ...excelValues(g)],
      ...g.schemes.map((s) => [g.name, s.name, ...excelValues(s)]),
    ]),
    notes: [NOTE],
  };

  return (
    <section
      aria-label="ค่าบริการตามกลุ่มสิทธิ"
      className="min-w-0 rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-base font-semibold">ค่าบริการตามกลุ่มสิทธิ</h2>
        <ExcelDownloadButton data={excel} />
      </div>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{NOTE}</p>
      <div className="mt-3 space-y-4">
        {groups.map((g) => (
          <div key={g.code} className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`${chipClass} ${GROUP_TONE[g.code]}`}>{g.name}</span>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">{g.rule}</p>
            </div>
            <div className="mt-2 overflow-x-auto">
              <table className={`${tableClass} min-w-[50rem]`}>
                <thead className={theadClass}>
                  <tr>
                    <th scope="col" className={thClass}>สิทธิ</th>
                    <th scope="col" className={thRightClass}>คน</th>
                    <th scope="col" className={thRightClass}>visit</th>
                    <th scope="col" className={thRightClass}>ค่าบริการ (บาท)</th>
                    <th scope="col" className={thRightClass}>บาท/visit</th>
                    <th scope="col" className={thRightClass}>ทันตกรรม (บาท)</th>
                    <th scope="col" className={thRightClass}>ฟันเทียม (บาท)</th>
                    <th scope="col" className={thRightClass}>หัตถการ (บาท)</th>
                    <th scope="col" className={thRightClass}>ยา/รังสี/อื่นๆ (บาท)</th>
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
