import type {
  DrugDeliveryCounts,
  DrugDeliveryMonthRow,
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
import { formatBaht, formatNumber, formatThaiMonthShort } from "../format";

const footClass =
  "border-t-2 border-zinc-300 bg-zinc-50 font-semibold dark:border-zinc-700 dark:bg-zinc-900";
const zeroRiderClass =
  "font-semibold text-amber-800 dark:text-amber-300";

function Cells({ r, flagZeroRider }: { r: DrugDeliveryCounts; flagZeroRider: boolean }) {
  return (
    <>
      <td className={tdRightClass}>{formatNumber(r.shipped)}</td>
      <td className={tdRightClass}>{formatNumber(r.shippedCharged)}</td>
      <td className={tdRightClass}>{formatNumber(r.shippedUncharged)}</td>
      <td className={tdRightClass}>{formatNumber(r.postVisits)}</td>
      <td className={`${tdRightClass} ${flagZeroRider ? zeroRiderClass : ""}`}>
        {formatNumber(r.riderVisits)}
      </td>
      <td className={tdRightClass}>{formatBaht(r.postBaht + r.riderBaht)}</td>
    </>
  );
}

const excelValues = (r: DrugDeliveryCounts) => [
  r.shipped,
  r.shippedCharged,
  r.shippedUncharged,
  r.postVisits,
  r.postBaht,
  r.riderVisits,
  r.riderBaht,
];

export function DrugDeliveryMonthTable({
  months,
  total,
  fiscalYear,
  today,
}: {
  months: DrugDeliveryMonthRow[];
  total: DrugDeliveryCounts;
  fiscalYear: number;
  /** "YYYY-MM-DD": months after it are not highlighted (no data yet). */
  today: string;
}) {
  const thisMonth = today.slice(0, 7);
  // Highlight months without Health Rider charges only after the first
  // month with a rider charge this year (before it the service may not
  // have started yet).
  const firstRiderMonth = months.find((m) => m.riderVisits > 0)?.month ?? null;

  const excel: ExcelExport = {
    fileName: `drug-delivery-month-fy${fiscalYear}`,
    title: `ค่าส่งยาที่บ้าน รายเดือน ปีงบประมาณ ${fiscalYear}`,
    sheetName: "รายเดือน",
    columns: [
      { header: "เดือน" },
      { header: "ส่งไปรษณีย์ (visit มีเลขพัสดุ)", format: "int" },
      { header: "ส่งแล้วคิดค่าส่ง (visit)", format: "int" },
      { header: "ส่งแล้วยังไม่คิด (visit)", format: "int" },
      { header: "คิดค่าส่งไปรษณีย์ (visit)", format: "int" },
      { header: "คิดค่าส่งไปรษณีย์ (บาท)", format: "int" },
      { header: "Health Rider (visit)", format: "int" },
      { header: "Health Rider (บาท)", format: "int" },
    ],
    rows: months.map((m) => [formatThaiMonthShort(m.month), ...excelValues(m)]),
    footer: [["รวม", ...excelValues(total)]],
    notes: ["ทุกกลุ่มสิทธิ ตามเดือนของวันที่รับบริการ (ovst.vstdate)"],
  };

  return (
    <section
      aria-label="ค่าส่งยาที่บ้าน รายเดือน"
      className="min-w-0 rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-base font-semibold">รายเดือน (ทุกสิทธิ)</h2>
        <ExcelDownloadButton data={excel} />
      </div>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
        ตามเดือนของวันที่รับบริการ เดือนที่ Health Rider เป็น 0 หลังจากเดือนแรกที่มีการคิดในปีงบฯ นี้ แสดงเป็นสีส้ม ควรตรวจกับ PCU ว่าหยุดส่งหรือไม่ได้คิดค่าส่ง
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className={`${tableClass} min-w-[44rem]`}>
          <thead className={theadClass}>
            <tr>
              <th scope="col" className={thClass}>เดือน</th>
              <th scope="col" className={thRightClass}>ส่งไปรษณีย์ (visit)</th>
              <th scope="col" className={thRightClass}>คิดค่าส่งแล้ว</th>
              <th scope="col" className={thRightClass}>ยังไม่คิด</th>
              <th scope="col" className={thRightClass}>คิดค่าส่งไปรษณีย์ (visit)</th>
              <th scope="col" className={thRightClass}>Health Rider (visit)</th>
              <th scope="col" className={thRightClass}>ยอดคิดเงินรวม (บาท)</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month} className={trClass}>
                <th scope="row" className={`${tdClass} text-left font-medium`}>
                  {formatThaiMonthShort(m.month)}
                </th>
                <Cells
                  r={m}
                  flagZeroRider={
                    firstRiderMonth !== null &&
                    m.month > firstRiderMonth &&
                    m.riderVisits === 0 &&
                    m.month <= thisMonth
                  }
                />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className={footClass}>
              <th scope="row" className={`${tdClass} text-left`}>รวม</th>
              <Cells r={total} flagZeroRider={false} />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
