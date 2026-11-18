import type { NcdPayGroupRow } from "@/lib/kpi/ncd-clinic-types";
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

const GROUP_TONE: Record<NcdPayGroupRow["code"], string> = {
  FULL: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  CAPITATION: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-300",
};

const NOTE =
  "บาท = ค่าใช้จ่ายที่ HOSxP คิดของ visit (ทุกรายการใน vn เดียวกัน) ไม่ใช่รายรับจริง กลุ่มเหมาจ่ายได้รับเงินรายหัวซึ่งไม่ตรงกับยอดนี้ คนหนึ่งอาจมีหลายสิทธิ จำนวนคนของแต่ละสิทธิจึงรวมกันได้มากกว่าจำนวนคนทั้งหมด";

interface Line {
  persons: number;
  visits: number;
  baht: number;
  bahtPerVisit: number;
  drugBaht: number;
  labBaht: number;
  otherBaht: number;
}

function Cells({ r }: { r: Line }) {
  return (
    <>
      <td className={tdRightClass}>{formatNumber(r.persons)}</td>
      <td className={tdRightClass}>{formatNumber(r.visits)}</td>
      <td className={tdRightClass}>{formatBaht(r.baht)}</td>
      <td className={tdRightClass}>{formatBaht(r.bahtPerVisit)}</td>
      <td className={tdRightClass}>{formatBaht(r.drugBaht)}</td>
      <td className={tdRightClass}>{formatBaht(r.labBaht)}</td>
      <td className={tdRightClass}>{formatBaht(r.otherBaht)}</td>
    </>
  );
}

const excelColumns: ExcelExport["columns"] = [
  { header: "กลุ่ม" },
  { header: "สิทธิ" },
  { header: "คน", format: "int" },
  { header: "visit", format: "int" },
  { header: "ค่าใช้จ่าย (บาท)", format: "int" },
  { header: "บาท/visit", format: "int" },
  { header: "ยา (บาท)", format: "int" },
  { header: "lab (บาท)", format: "int" },
  { header: "อื่นๆ (บาท)", format: "int" },
];

const excelValues = (r: Line) => [
  r.persons,
  r.visits,
  r.baht,
  r.bahtPerVisit,
  r.drugBaht,
  r.labBaht,
  r.otherBaht,
];

export function NcdPayGroupPanel({
  groups,
  fiscalYear,
}: {
  groups: NcdPayGroupRow[];
  fiscalYear: number;
}) {
  const excel: ExcelExport = {
    fileName: `ncd-paygroup-fy${fiscalYear}`,
    title: `NCD Clinic ค่าใช้จ่ายตามกลุ่มสิทธิ ปีงบประมาณ ${fiscalYear}`,
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
      aria-label="ค่าใช้จ่ายตามกลุ่มสิทธิ"
      className="min-w-0 rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-base font-semibold">ค่าใช้จ่ายตามกลุ่มสิทธิ</h2>
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
              <table className={`${tableClass} min-w-[44rem]`}>
                <thead className={theadClass}>
                  <tr>
                    <th scope="col" className={thClass}>สิทธิ</th>
                    <th scope="col" className={thRightClass}>คน</th>
                    <th scope="col" className={thRightClass}>visit</th>
                    <th scope="col" className={thRightClass}>ค่าใช้จ่าย (บาท)</th>
                    <th scope="col" className={thRightClass}>บาท/visit</th>
                    <th scope="col" className={thRightClass}>ยา (บาท)</th>
                    <th scope="col" className={thRightClass}>lab (บาท)</th>
                    <th scope="col" className={thRightClass}>อื่นๆ (บาท)</th>
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
