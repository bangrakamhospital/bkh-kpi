import type {
  DrugDeliveryCounts,
  DrugDeliverySchemeRow,
} from "@/lib/kpi/drug-delivery-types";
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

const chipClass =
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold";
const subClass = "block text-xs text-zinc-600 dark:text-zinc-400";
const footClass =
  "border-t-2 border-zinc-300 bg-zinc-50 font-semibold dark:border-zinc-700 dark:bg-zinc-900";

/** Visit count with the baht amount underneath. */
function VisitBaht({ visits, baht, approx }: { visits: number; baht: number; approx?: boolean }) {
  return (
    <>
      {formatNumber(visits)}
      <span className={subClass}>
        {approx ? "≈ " : ""}
        {formatBaht(baht)} บาท
      </span>
    </>
  );
}

function Cells({ r }: { r: DrugDeliveryCounts }) {
  return (
    <>
      <td className={tdRightClass}>{formatNumber(r.shipped)}</td>
      <td className={tdRightClass}>{formatNumber(r.shippedCharged)}</td>
      <td className={tdRightClass}>
        <VisitBaht visits={r.shippedUncharged} baht={r.shippedUnchargedBaht} approx />
      </td>
      <td className={tdRightClass}>
        <VisitBaht visits={r.postVisits} baht={r.postBaht} />
      </td>
      <td className={tdRightClass}>
        <VisitBaht visits={r.riderVisits} baht={r.riderBaht} />
      </td>
      <td className={tdRightClass}>{formatBaht(r.fundBaht)}</td>
      <td className={tdRightClass}>{formatBaht(r.patientBaht)}</td>
    </>
  );
}

const excelColumns: ExcelExport["columns"] = [
  { header: "กลุ่มสิทธิ" },
  { header: "ผู้จ่ายค่าส่ง" },
  { header: "ส่งไปรษณีย์ (visit มีเลขพัสดุ)", format: "int" },
  { header: "ส่งแล้วคิดค่าส่ง (visit)", format: "int" },
  { header: "ส่งแล้วยังไม่คิด (visit)", format: "int" },
  { header: "ส่งแล้วยังไม่คิด (บาท ประมาณ)", format: "int" },
  { header: "คิดค่าส่งไปรษณีย์ (visit)", format: "int" },
  { header: "คิดค่าส่งไปรษณีย์ (บาท)", format: "int" },
  { header: "Health Rider (visit)", format: "int" },
  { header: "Health Rider (บาท)", format: "int" },
  { header: "เรียกเก็บกองทุนของสิทธิ (บาท)", format: "int" },
  { header: "ผู้ป่วยชำระเอง (บาท)", format: "int" },
];

const excelValues = (r: DrugDeliveryCounts) => [
  r.shipped,
  r.shippedCharged,
  r.shippedUncharged,
  r.shippedUnchargedBaht,
  r.postVisits,
  r.postBaht,
  r.riderVisits,
  r.riderBaht,
  r.fundBaht,
  r.patientBaht,
];

export function DrugDeliverySchemeTable({
  schemes,
  total,
  fiscalYear,
  feeBaht,
}: {
  schemes: DrugDeliverySchemeRow[];
  total: DrugDeliveryCounts;
  fiscalYear: number;
  feeBaht: number;
}) {
  const excel: ExcelExport = {
    fileName: `drug-delivery-scheme-fy${fiscalYear}`,
    title: `ค่าส่งยาที่บ้าน แยกตามกลุ่มสิทธิ ปีงบประมาณ ${fiscalYear}`,
    sheetName: "ตามสิทธิ",
    columns: excelColumns,
    rows: schemes.map((s) => [s.name, s.payer, ...excelValues(s)]),
    footer: [["รวม", "", ...excelValues(total)]],
    notes: [
      `ยังไม่คิด (บาท) = visit × ${feeBaht} บาท เป็นค่าประมาณ ยอดคิดเงินอื่นๆ มาจาก opitemrece.sum_price`,
      "กลุ่มสิทธิ = สิทธิของรายการค่าส่ง (opitemrece.pttype) หรือสิทธิของ visit เมื่อยังไม่คิดค่าส่ง",
    ],
  };

  return (
    <section
      aria-label="ค่าส่งยาที่บ้าน แยกตามกลุ่มสิทธิ"
      className="min-w-0 rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-base font-semibold">แยกตามกลุ่มสิทธิ</h2>
        <ExcelDownloadButton data={excel} />
      </div>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
        สิทธิ UC เบิก สปสช. ได้ (ADP DRUGP {formatBaht(feeBaht)} บาท/ครั้ง) สิทธิอื่นเก็บจากผู้ป่วยหรือกองทุนของสิทธินั้น
        &quot;เรียกเก็บกองทุน&quot; = รายการที่ลงเป็นลูกหนี้สิทธิ &quot;ผู้ป่วยชำระเอง&quot; = ชำระเองเบิกได้/เบิกไม่ได้
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className={`${tableClass} min-w-[60rem]`}>
          <thead className={theadClass}>
            <tr>
              <th scope="col" className={thClass}>กลุ่มสิทธิ</th>
              <th scope="col" className={thRightClass}>ส่งไปรษณีย์ (visit)</th>
              <th scope="col" className={thRightClass}>คิดค่าส่งแล้ว</th>
              <th scope="col" className={thRightClass}>ยังไม่คิด</th>
              <th scope="col" className={thRightClass}>คิดค่าส่งไปรษณีย์</th>
              <th scope="col" className={thRightClass}>Health Rider</th>
              <th scope="col" className={thRightClass}>เรียกเก็บกองทุน (บาท)</th>
              <th scope="col" className={thRightClass}>ผู้ป่วยชำระเอง (บาท)</th>
            </tr>
          </thead>
          <tbody>
            {schemes.map((s) => (
              <tr key={s.code} className={trClass}>
                <th scope="row" className={`${tdClass} text-left font-medium`}>
                  {s.name}
                  <span className="mt-0.5 block">
                    <span
                      className={`${chipClass} ${
                        s.code === "UC"
                          ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300"
                      }`}
                    >
                      {s.payer}
                    </span>
                  </span>
                </th>
                <Cells r={s} />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className={footClass}>
              <th scope="row" className={`${tdClass} text-left`}>รวม</th>
              <Cells r={total} />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
