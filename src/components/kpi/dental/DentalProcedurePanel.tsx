import type {
  DentalCategoryKind,
  DentalCategoryRow,
  DentalFillingRatio,
  DentalItemRow,
} from "@/lib/kpi/dental-clinic-types";
import { ExcelDownloadButton, type ExcelExport } from "../overview/ExcelDownloadButton";
import {
  chipClass,
  subClass,
  tableClass,
  tdClass,
  tdRightClass,
  thClass,
  theadClass,
  thRightClass,
  trClass,
} from "../overview/table-styles";
import { formatBaht, formatNumber } from "../format";
import { StatTile } from "../clinic/StatTile";

const nowrapChipClass = `${chipClass} whitespace-nowrap`;

const KIND: Record<DentalCategoryKind, { label: string; tone: string }> = {
  EXAM: {
    label: "ตรวจ/วินิจฉัย",
    tone: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
  },
  PREVENTIVE: {
    label: "ส่งเสริมป้องกัน",
    tone: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  },
  TREATMENT: {
    label: "รักษา",
    tone: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-300",
  },
};

const NOTE =
  "หัตถการ = แถวใน dtmain (1 รายการต่อซี่ ต่อขากรรไกร หรือต่อช่องปาก) ซี่ = dtmain.tcount บาท = ราคาหัตถการที่ HOSxP คิด (dtmain.fee) ไม่รวมยา/วัสดุที่คิดแยก กลุ่มหัตถการตามกลุ่ม dttm ของ HOSxP คน/visit ของแต่ละกลุ่มนับไม่ซ้ำภายในกลุ่ม";

export function DentalProcedurePanel({
  categories,
  topItems,
  fillingRatio: f,
  fiscalYear,
}: {
  categories: DentalCategoryRow[];
  topItems: DentalItemRow[];
  fillingRatio: DentalFillingRatio;
  fiscalYear: number;
}) {
  const catName = new Map(categories.map((c) => [c.code, c.name]));
  const byKind = (k: DentalCategoryKind) =>
    categories.filter((c) => c.kind === k).reduce((s, c) => s + c.procedures, 0);
  const totalProcs = categories.reduce((s, c) => s + c.procedures, 0);
  const share = (n: number) => (totalProcs > 0 ? `${formatNumber(Math.round((n / totalProcs) * 1000) / 10)}%` : "–");

  const excel: ExcelExport = {
    fileName: `dental-procedures-fy${fiscalYear}`,
    title: `คลินิกทันตกรรม หัตถการ ปีงบประมาณ ${fiscalYear}`,
    sheetName: "หัตถการ",
    columns: [
      { header: "ประเภท" },
      { header: "กลุ่มหัตถการ" },
      { header: "หัตถการ (รายการ)", format: "int" },
      { header: "ซี่", format: "int" },
      { header: "visit", format: "int" },
      { header: "คน", format: "int" },
      { header: "ราคาหัตถการ (บาท)", format: "int" },
    ],
    rows: [
      ...categories.map((c) => [
        KIND[c.kind].label,
        c.name,
        c.procedures,
        c.teeth,
        c.visits,
        c.persons,
        c.feeBaht,
      ]),
      [],
      ["รายการยอดนิยม", "รหัส dttm / ICD-10-TM", "หัตถการ (รายการ)", "ซี่", "visit", "คน", "ราคาหัตถการ (บาท)"],
      ...topItems.map((t) => [
        t.name,
        `${t.tmcode} / ${t.icd10tm}`,
        t.procedures,
        t.teeth,
        t.visits,
        t.persons,
        t.feeBaht,
      ]),
    ],
    notes: [
      NOTE,
      `อุดฟันแท้ : ถอนฟันแท้ = ${formatNumber(f.fillingTeeth)} : ${formatNumber(f.extractionTeeth)} ซี่ (อุดถาวร ICD-10-TM 23871*, ไม่รวมอุดชั่วคราว)`,
    ],
  };

  return (
    <section
      aria-label="หัตถการทันตกรรม"
      className="min-w-0 rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-base font-semibold">หัตถการทันตกรรม</h2>
        <ExcelDownloadButton data={excel} />
      </div>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{NOTE}</p>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="ตรวจ/วินิจฉัย (รายการ)"
          value={formatNumber(byKind("EXAM"))}
          sub={`${share(byKind("EXAM"))} ของหัตถการทั้งหมด`}
        />
        <StatTile
          label="ส่งเสริมป้องกัน (รายการ)"
          value={formatNumber(byKind("PREVENTIVE"))}
          sub={`${share(byKind("PREVENTIVE"))} · OHI ฟลูออไรด์ sealant`}
        />
        <StatTile
          label="รักษา (รายการ)"
          value={formatNumber(byKind("TREATMENT"))}
          sub={`${share(byKind("TREATMENT"))} ของหัตถการทั้งหมด`}
        />
        <StatTile
          label="อุดฟันแท้ : ถอนฟันแท้ (ซี่)"
          value={f.ratio === null ? "–" : `${formatNumber(f.ratio)} : 1`}
          sub={`อุด ${formatNumber(f.fillingTeeth)} / ถอน ${formatNumber(f.extractionTeeth)} ซี่ · ฟันน้ำนม อุด ${formatNumber(f.primaryFillingTeeth)} / ถอน ${formatNumber(f.primaryExtractionTeeth)}`}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="min-w-0 overflow-x-auto">
          <h3 className="text-sm font-semibold">ตามกลุ่มหัตถการ</h3>
          <table className={`${tableClass} mt-2 min-w-[36rem]`}>
            <thead className={theadClass}>
              <tr>
                <th scope="col" className={thClass}>กลุ่ม</th>
                <th scope="col" className={thRightClass}>รายการ</th>
                <th scope="col" className={thRightClass}>ซี่</th>
                <th scope="col" className={thRightClass}>คน</th>
                <th scope="col" className={thRightClass}>บาท</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.code} className={trClass}>
                  <th scope="row" className={`${tdClass} text-left font-medium`}>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {c.name}
                      <span className={`${nowrapChipClass} ${KIND[c.kind].tone}`}>{KIND[c.kind].label}</span>
                    </span>
                  </th>
                  <td className={tdRightClass}>{formatNumber(c.procedures)}</td>
                  <td className={tdRightClass}>{formatNumber(c.teeth)}</td>
                  <td className={tdRightClass}>
                    {formatNumber(c.persons)}
                    <span className={subClass}>{formatNumber(c.visits)} visit</span>
                  </td>
                  <td className={tdRightClass}>{formatBaht(c.feeBaht)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="min-w-0 overflow-x-auto">
          <h3 className="text-sm font-semibold">
            หัตถการยอดนิยม {formatNumber(topItems.length)} อันดับ (ไม่รวมตรวจ ทันตสุขศึกษา และให้ยา)
          </h3>
          <table className={`${tableClass} mt-2 min-w-[36rem]`}>
            <thead className={theadClass}>
              <tr>
                <th scope="col" className={thClass}>รายการ</th>
                <th scope="col" className={thRightClass}>รายการ</th>
                <th scope="col" className={thRightClass}>คน</th>
                <th scope="col" className={thRightClass}>บาท</th>
              </tr>
            </thead>
            <tbody>
              {topItems.map((t) => (
                <tr key={t.tmcode} className={trClass}>
                  <th scope="row" className={`${tdClass} text-left font-medium`}>
                    {t.name}
                    <span className={subClass}>
                      {catName.get(t.category) ?? t.category} · ICD-10-TM {t.icd10tm || "-"}
                    </span>
                  </th>
                  <td className={tdRightClass}>{formatNumber(t.procedures)}</td>
                  <td className={tdRightClass}>{formatNumber(t.persons)}</td>
                  <td className={tdRightClass}>{formatBaht(t.feeBaht)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
