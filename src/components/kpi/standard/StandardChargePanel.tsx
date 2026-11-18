import type {
  StandardClinicSummary,
  StdCategoryRow,
  StdItemRow,
} from "@/lib/kpi/standard-clinic-types";
import type { ExcelExport } from "../overview/ExcelDownloadButton";
import { mutedClass, subClass } from "../overview/table-styles";
import { ProgressBar } from "../ProgressBar";
import { ClinicPanel } from "../clinic/ClinicPanel";
import { type ClinicColumn, ClinicTable } from "../clinic/ClinicTable";
import { formatBaht, formatNumber, formatPercent } from "../format";
import { STANDARD_MONEY_NOTE } from "./StandardPayGroupPanel";

const CATEGORY_COLUMNS: ClinicColumn<StdCategoryRow>[] = [
  { header: "บาท", cell: (r) => formatBaht(r.baht) },
  { header: "ร้อยละ", cell: (r) => (r.percent === null ? "–" : `${formatPercent(r.percent)}%`) },
  {
    header: "สัดส่วน",
    cell: (r) => (
      <ProgressBar
        percent={r.percent ?? 0}
        targetPercent={null}
        barClass="bg-brand-600 dark:bg-brand-400"
        label={`${r.name} ${r.percent ?? 0}%`}
      />
    ),
  },
];

/** A line of the items table: an item or the drugs total. */
interface ItemLine {
  /** null = not meaningful (the "other items" line). */
  qty: number | null;
  visits: number | null;
  baht: number;
}

const count = (v: number | null) => (v === null ? "–" : formatNumber(v));

const ITEM_COLUMNS: ClinicColumn<ItemLine>[] = [
  { header: "visit ที่คิด", cell: (r) => count(r.visits) },
  { header: "จำนวน (หน่วย)", cell: (r) => count(r.qty) },
  { header: "บาท", cell: (r) => formatBaht(r.baht) },
];

const itemLabel = (r: StdItemRow) => (
  <>
    {r.name}
    <span className={subClass}>
      {r.icode} · {r.category}
    </span>
  </>
);

/** "หมวดค่าใช้จ่าย" and "รายการค่าบริการที่คิดบ่อย". */
export function StandardChargePanel({ data }: { data: StandardClinicSummary }) {
  const { items } = data;
  const topBaht = items.top.reduce((s, r) => s + r.baht, 0);
  const restBaht = Math.max(0, items.nondrugBaht - topBaht);

  const excel: ExcelExport = {
    fileName: `clinic-${data.slug}-charges-fy${data.fiscalYear}`,
    title: `${data.label} หมวดค่าใช้จ่ายและรายการค่าบริการ ปีงบประมาณ ${data.fiscalYear}`,
    sheetName: "ค่าใช้จ่าย",
    columns: [
      { header: "ส่วน" },
      { header: "รายการ" },
      { header: "รหัส" },
      { header: "หมวด" },
      { header: "visit", format: "int" },
      { header: "จำนวน", format: "int" },
      { header: "บาท", format: "int" },
      { header: "ร้อยละ", format: "pct" },
    ],
    rows: [
      ...data.categories.map((c) => ["หมวด", c.name, "", "", null, null, c.baht, c.percent]),
      ["รายการ", "ยาทั้งหมด (รวมทุกรายการ)", "", "ยา", items.drug.visits, items.drug.qty, items.drug.baht, null],
      ...items.top.map((r) => ["รายการ", r.name, r.icode, r.category, r.visits, r.qty, r.baht, null]),
      ["รายการ", `รายการอื่นที่ไม่ใช่ยา (${formatNumber(Math.max(0, items.nondrugItems - items.top.length))} รายการ)`, "", "", null, null, restBaht, null],
    ],
    notes: [STANDARD_MONEY_NOTE, "รายการเรียงตามจำนวน visit ที่คิดรายการนั้น ยาแสดงเป็นยอดรวม"],
  };

  return (
    <ClinicPanel
      title="หมวดค่าใช้จ่ายและรายการค่าบริการ"
      excel={excel}
      note={STANDARD_MONEY_NOTE}
    >
      <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">หมวดค่าใช้จ่าย (vn_stat)</h3>
          <div className="mt-2">
            <ClinicTable<StdCategoryRow>
              rowHeader="หมวด"
              columns={CATEGORY_COLUMNS}
              rows={data.categories.map((c) => ({ key: c.code, label: c.name, row: c }))}
              footer={[
                {
                  key: "total",
                  label: "รวม",
                  row: { code: "OTHER", name: "รวม", baht: data.money.baht, percent: 100 },
                },
              ]}
              minWidthClass="min-w-[28rem]"
            />
          </div>
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">
            รายการค่าบริการที่คิดบ่อย (ไม่ใช่ยา {formatNumber(items.top.length)} อันดับ)
          </h3>
          <p className={`mt-1 text-xs ${mutedClass}`}>
            เรียงตามจำนวน visit ที่คิดรายการ (opitemrece) ยาแสดงเป็นยอดรวมบรรทัดเดียว
          </p>
          <div className="mt-2">
            <ClinicTable<ItemLine>
              rowHeader="รายการ"
              columns={ITEM_COLUMNS}
              rows={[
                {
                  key: "DRUG",
                  label: (
                    <>
                      ยาทั้งหมด
                      <span className={subClass}>รวมทุกรายการยา (หมวดค่ายา)</span>
                    </>
                  ),
                  row: items.drug,
                },
                ...items.top.map((r) => ({ key: r.icode, label: itemLabel(r), row: r })),
              ]}
              footer={[
                {
                  key: "rest",
                  label: `รายการอื่นที่ไม่ใช่ยา (${formatNumber(Math.max(0, items.nondrugItems - items.top.length))} รายการ)`,
                  row: { visits: null, qty: null, baht: restBaht },
                },
              ]}
              minWidthClass="min-w-[28rem]"
            />
          </div>
        </div>
      </div>
    </ClinicPanel>
  );
}
