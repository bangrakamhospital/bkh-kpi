import type { DentalExcluded, DentalUnitRow } from "@/lib/kpi/dental-clinic-types";
import { ExcelDownloadButton, type ExcelExport } from "../overview/ExcelDownloadButton";
import {
  subClass,
  tableClass,
  tdClass,
  tdRightClass,
  thClass,
  theadClass,
  thRightClass,
  trClass,
} from "../overview/table-styles";
import { formatBaht, formatDecimal, formatNumber } from "../format";

export function DentalUnitTable({
  units,
  excluded,
  registeredOtherBaht,
  fiscalYear,
}: {
  units: DentalUnitRow[];
  excluded: DentalExcluded;
  registeredOtherBaht: number;
  fiscalYear: number;
}) {
  const note = `visit ทันตกรรม = visit ที่มีหัตถการ (dtmain) ของห้องฟัน 008 หรือ 046 ในปีงบฯ รวม visit ที่ลงทะเบียนคลินิกอื่นของ รพ. แล้วส่งมาทำฟัน (เช่น คลินิก NCD) ไม่นับงานทันตกรรมใน visit ของ PCU และห้องฟัน PCU (057/066): ${formatNumber(excluded.visits)} visit ค่าบริการ ${formatBaht(excluded.baht)} บาท`;
  const otherNote = `ค่าบริการ = รายการที่ห้องฟันคิด (opitemrece ของแผนก 008/046) เท่านั้น ไม่รวมค่าบริการของแผนกอื่นใน visit เดียวกัน (visit ที่ลงทะเบียนห้องฟันมีอีก ${formatBaht(registeredOtherBaht)} บาท เช่น ค่าบริการผู้ป่วยนอก)`;

  const excel: ExcelExport = {
    fileName: `dental-unit-fy${fiscalYear}`,
    title: `คลินิกทันตกรรม แยกหน่วยบริการ ปีงบประมาณ ${fiscalYear}`,
    sheetName: "หน่วยบริการ",
    columns: [
      { header: "หน่วยบริการ" },
      { header: "คน", format: "int" },
      { header: "visit", format: "int" },
      { header: "ส่งจากคลินิกอื่น (visit)", format: "int" },
      { header: "มีการรักษา (visit)", format: "int" },
      { header: "หัตถการ", format: "int" },
      { header: "วันให้บริการ", format: "int" },
      { header: "visit/วัน" },
      { header: "ค่าบริการ (บาท)", format: "int" },
      { header: "บาท/visit", format: "int" },
    ],
    rows: units.map((u) => [
      u.name,
      u.persons,
      u.visits,
      u.referredVisits,
      u.treatmentVisits,
      u.procedures,
      u.days,
      Math.round(u.visitsPerDay * 10) / 10,
      u.baht,
      u.bahtPerVisit,
    ]),
    notes: [note, otherNote, "คนของแต่ละหน่วยนับไม่ซ้ำภายในหน่วย คนหนึ่งอาจมาทั้งสองหน่วย"],
  };

  return (
    <section
      aria-label="แยกหน่วยบริการ"
      className="min-w-0 rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-base font-semibold">แยกหน่วยบริการ</h2>
        <ExcelDownloadButton data={excel} />
      </div>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{note}</p>
      <div className="mt-3 overflow-x-auto">
        <table className={`${tableClass} min-w-[48rem]`}>
          <thead className={theadClass}>
            <tr>
              <th scope="col" className={thClass}>หน่วยบริการ</th>
              <th scope="col" className={thRightClass}>คน</th>
              <th scope="col" className={thRightClass}>visit</th>
              <th scope="col" className={thRightClass}>มีการรักษา (visit)</th>
              <th scope="col" className={thRightClass}>หัตถการ</th>
              <th scope="col" className={thRightClass}>วันให้บริการ</th>
              <th scope="col" className={thRightClass}>visit/วัน</th>
              <th scope="col" className={thRightClass}>ค่าบริการ (บาท)</th>
              <th scope="col" className={thRightClass}>บาท/visit</th>
            </tr>
          </thead>
          <tbody>
            {units.map((u) => (
              <tr key={u.code} className={trClass}>
                <th scope="row" className={`${tdClass} text-left font-medium`}>
                  {u.name}
                  <span className={subClass}>
                    แผนก {u.depcodes.join(", ")} · ส่งจากคลินิกอื่น {formatNumber(u.referredVisits)} visit
                  </span>
                </th>
                <td className={tdRightClass}>{formatNumber(u.persons)}</td>
                <td className={tdRightClass}>{formatNumber(u.visits)}</td>
                <td className={tdRightClass}>{formatNumber(u.treatmentVisits)}</td>
                <td className={tdRightClass}>{formatNumber(u.procedures)}</td>
                <td className={tdRightClass}>{formatNumber(u.days)}</td>
                <td className={tdRightClass}>{formatDecimal(u.visitsPerDay)}</td>
                <td className={tdRightClass}>{formatBaht(u.baht)}</td>
                <td className={tdRightClass}>{formatBaht(u.bahtPerVisit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">{otherNote}</p>
    </section>
  );
}
