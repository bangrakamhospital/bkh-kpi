import type { StandardClinicSummary, StdPdxRow } from "@/lib/kpi/standard-clinic-types";
import type { ExcelExport } from "../overview/ExcelDownloadButton";
import { subClass } from "../overview/table-styles";
import { ClinicPanel } from "../clinic/ClinicPanel";
import { type ClinicColumn, ClinicTable } from "../clinic/ClinicTable";
import { formatNumber, formatPercent } from "../format";

/** "ICD-10 หลักที่พบบ่อย": vn_stat.pdx top 10 by visits. */
export function StandardPdxTable({ data }: { data: StandardClinicSummary }) {
  const share = (n: number) => (data.visits > 0 ? (n / data.visits) * 100 : 0);
  const columns: ClinicColumn<StdPdxRow>[] = [
    { header: "visit", cell: (r) => formatNumber(r.visits) },
    { header: "ร้อยละของ visit", cell: (r) => `${formatPercent(share(r.visits))}%` },
    { header: "คน", cell: (r) => formatNumber(r.persons) },
  ];
  const note = `วินิจฉัยหลัก (pdx) ของ visit เรียงตามจำนวน visit คนนับไม่ซ้ำภายในรหัส visit ที่ไม่มีรหัสวินิจฉัย ${formatNumber(data.noPdxVisits)} visit`;

  const excel: ExcelExport = {
    fileName: `clinic-${data.slug}-pdx-fy${data.fiscalYear}`,
    title: `${data.label} ICD-10 วินิจฉัยหลักที่พบบ่อย ปีงบประมาณ ${data.fiscalYear}`,
    sheetName: "ICD-10",
    columns: [
      { header: "ICD-10" },
      { header: "ชื่อโรค" },
      { header: "visit", format: "int" },
      { header: "ร้อยละของ visit", format: "pct" },
      { header: "คน", format: "int" },
    ],
    rows: data.pdx.map((r) => [
      r.code,
      r.name,
      r.visits,
      Math.round(share(r.visits) * 10) / 10,
      r.persons,
    ]),
    notes: [note],
  };

  return (
    <ClinicPanel title={`ICD-10 วินิจฉัยหลักที่พบบ่อย (${formatNumber(data.pdx.length)} อันดับ)`} excel={excel} note={note}>
      <div className="mt-3">
        <ClinicTable<StdPdxRow>
          rowHeader="ICD-10"
          columns={columns}
          rows={data.pdx.map((r) => ({
            key: r.code,
            label: (
              <>
                {r.code}
                {r.name && <span className={subClass}>{r.name}</span>}
              </>
            ),
            row: r,
          }))}
          minWidthClass="min-w-[32rem]"
        />
      </div>
    </ClinicPanel>
  );
}
