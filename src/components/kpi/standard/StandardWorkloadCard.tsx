import type { StdWorkload } from "@/lib/kpi/standard-clinic-types";
import type { ExcelExport } from "../overview/ExcelDownloadButton";
import { round2 } from "../overview/export-utils";
import { ClinicPanel } from "../clinic/ClinicPanel";
import { StatTile } from "../clinic/StatTile";
import { formatDecimal, formatNumber, formatPercent } from "../format";

const percent = (v: number | null) => (v === null ? "–" : `${formatPercent(v)}%`);

const NOTE =
  "วันเปิดบริการ = วันที่มี visit อย่างน้อย 1 ราย · แพทย์ = ผู้ตรวจของ visit (ovst.doctor) ตำแหน่งแพทย์ · ผู้ให้บริการ = ผู้ตรวจทุกตำแหน่ง · นัด = oapp ของแผนกในคลินิกนี้ที่วันนัดอยู่ในปีงบฯ";

export function StandardWorkloadCard({
  workload: w,
  slug,
  label,
  fiscalYear,
}: {
  workload: StdWorkload;
  slug: string;
  label: string;
  fiscalYear: number;
}) {
  const excel: ExcelExport = {
    fileName: `clinic-${slug}-workload-fy${fiscalYear}`,
    title: `${label} ภาระงานและการมาตามนัด ปีงบประมาณ ${fiscalYear}`,
    subtitle: "แหล่งข้อมูล HOSxP",
    sheetName: "ภาระงาน",
    columns: [{ header: "รายการ" }, { header: "ค่า" }, { header: "หน่วย" }],
    rows: [
      ["วันเปิดบริการ", w.clinicDays, "วัน"],
      ["visit ต่อวัน เฉลี่ย", round2(w.avgVisitsPerDay), "visit/วัน"],
      ["visit ต่อวัน สูงสุด", w.maxVisitsPerDay, "visit/วัน"],
      ["แพทย์เฉลี่ยต่อวัน", round2(w.avgPhysiciansPerDay), "คน/วัน"],
      ["แพทย์ทั้งปี", w.physicians, "คน"],
      ["visit ที่แพทย์ตรวจ", round2(w.physicianVisitPercent), "ร้อยละของ visit"],
      ["visit ต่อแพทย์-วัน", round2(w.visitsPerPhysicianDay), "visit"],
      ["ผู้ให้บริการเฉลี่ยต่อวัน (ทุกตำแหน่ง)", round2(w.avgProvidersPerDay), "คน/วัน"],
      ["ผู้ให้บริการทั้งปี", w.providers, "คน"],
      ["นัดทั้งหมด", w.appointments, "ราย"],
      ["วันที่มีนัด", w.appointmentDays, "วัน"],
      ["มาตามนัด", w.appointmentsKept, "ราย"],
      ["มาตามนัด", round2(w.appointmentsKeptPercent), "ร้อยละ"],
    ],
    notes: [NOTE],
  };

  return (
    <ClinicPanel title="ภาระงานและการมาตามนัด" excel={excel} note={NOTE}>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="วันเปิดบริการ" value={formatNumber(w.clinicDays)} sub="วัน" />
        <StatTile
          label="visit ต่อวัน (เฉลี่ย / สูงสุด)"
          value={`${formatDecimal(w.avgVisitsPerDay)} / ${formatNumber(w.maxVisitsPerDay)}`}
        />
        <StatTile
          label="แพทย์เฉลี่ยต่อวัน"
          value={formatDecimal(w.avgPhysiciansPerDay)}
          sub={`ทั้งปี ${formatNumber(w.physicians)} คน · แพทย์ตรวจ ${percent(w.physicianVisitPercent)} ของ visit`}
        />
        <StatTile
          label="visit ต่อแพทย์-วัน"
          value={formatDecimal(w.visitsPerPhysicianDay)}
          sub="visit ที่แพทย์ตรวจ ÷ แพทย์-วัน"
        />
        <StatTile
          label="ผู้ให้บริการเฉลี่ยต่อวัน (ทุกตำแหน่ง)"
          value={formatDecimal(w.avgProvidersPerDay)}
          sub={`ทั้งปี ${formatNumber(w.providers)} คน`}
        />
        <StatTile label="นัดทั้งหมด" value={formatNumber(w.appointments)} sub={`${formatNumber(w.appointmentDays)} วันที่มีนัด`} />
        <StatTile
          label="มาตามนัด"
          value={percent(w.appointmentsKeptPercent)}
          sub={`${formatNumber(w.appointmentsKept)} จาก ${formatNumber(w.appointments)} ราย`}
        />
      </div>
    </ClinicPanel>
  );
}
