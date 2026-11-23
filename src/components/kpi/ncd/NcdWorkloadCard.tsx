import type { NcdWorkload } from "@/lib/kpi/ncd-clinic-types";
import { formatDecimal, formatNumber, formatPercent } from "../format";
import { StatTile } from "../clinic/StatTile";
import { ExcelDownloadButton, type ExcelExport } from "../overview/ExcelDownloadButton";
import { round2 } from "../overview/export-utils";

export function NcdWorkloadCard({
  workload: w,
  fiscalYear,
}: {
  workload: NcdWorkload;
  fiscalYear: number;
}) {
  const excel: ExcelExport = {
    fileName: `ncd-workload-fy${fiscalYear}`,
    title: `NCD Clinic ภาระงานคลินิก ปีงบประมาณ ${fiscalYear}`,
    subtitle: "แหล่งข้อมูล HOSxP",
    sheetName: "ภาระงาน",
    columns: [{ header: "รายการ" }, { header: "ค่า" }, { header: "หน่วย" }],
    rows: [
      ["เป้า visit/นัด ไม่เกิน", w.targetPerDay, "ราย/วัน"],
      ["วันคลินิก", w.clinicDays, "วัน"],
      ["visit ต่อวัน เฉลี่ย", round2(w.avgVisitsPerDay), "visit/วัน"],
      ["visit ต่อวัน สูงสุด", w.maxVisitsPerDay, "visit/วัน"],
      ["วันที่ visit เกินเป้า", w.daysOverTarget, "วัน"],
      ["นัดต่อวัน เฉลี่ย", round2(w.avgAppointmentsPerDay), "นัด/วัน"],
      ["นัดต่อวัน สูงสุด", w.maxAppointmentsPerDay, "นัด/วัน"],
      ["วันที่มีนัด", w.appointmentDays, "วัน"],
      ["วันที่นัดเกินเป้า", w.appointmentDaysOverTarget, "วัน"],
      ["นัดทั้งหมด", w.appointments, "ราย"],
      ["มาตามนัด", w.appointmentsKept, "ราย"],
      ["มาตามนัด", round2(w.appointmentsKeptPercent), "ร้อยละ"],
      ["แพทย์เฉลี่ยต่อวัน", round2(w.avgPhysiciansPerDay), "คน/วัน"],
      ["แพทย์ทั้งปี", w.physicians, "คน"],
      ["visit ต่อแพทย์-วัน", round2(w.visitsPerPhysicianDay), "visit"],
    ],
    notes: [
      `เป้า: ไม่เกิน ${formatNumber(w.targetPerDay)} ราย/วัน (visit และนัด) วันคลินิก = วันที่มี visit อย่างน้อย 1 ราย`,
    ],
  };

  return (
    <section
      aria-label="ภาระงานคลินิก"
      className="min-w-0 rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-base font-semibold">ภาระงานคลินิก</h2>
        <ExcelDownloadButton data={excel} />
      </div>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
        เป้า: ไม่เกิน {formatNumber(w.targetPerDay)} ราย/วัน (visit และนัด) วันคลินิก = วันที่มี visit อย่างน้อย 1 ราย
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="วันคลินิก" value={formatNumber(w.clinicDays)} sub="วัน" />
        <StatTile
          label="visit ต่อวัน (เฉลี่ย / สูงสุด)"
          value={`${formatDecimal(w.avgVisitsPerDay)} / ${formatNumber(w.maxVisitsPerDay)}`}
        />
        <StatTile
          label={`วันที่ visit เกิน ${formatNumber(w.targetPerDay)}`}
          value={formatNumber(w.daysOverTarget)}
          sub={`จาก ${formatNumber(w.clinicDays)} วัน`}
        />
        <StatTile
          label="นัดต่อวัน (เฉลี่ย / สูงสุด)"
          value={`${formatDecimal(w.avgAppointmentsPerDay)} / ${formatNumber(w.maxAppointmentsPerDay)}`}
          sub={`เกิน ${formatNumber(w.targetPerDay)}: ${formatNumber(w.appointmentDaysOverTarget)} จาก ${formatNumber(w.appointmentDays)} วัน`}
        />
        <StatTile
          label="นัดทั้งหมด"
          value={formatNumber(w.appointments)}
          sub="ราย"
        />
        <StatTile
          label="มาตามนัด"
          value={w.appointmentsKeptPercent === null ? "–" : `${formatPercent(w.appointmentsKeptPercent)}%`}
          sub={`${formatNumber(w.appointmentsKept)} จาก ${formatNumber(w.appointments)} ราย`}
        />
        <StatTile
          label="แพทย์เฉลี่ยต่อวัน"
          value={formatDecimal(w.avgPhysiciansPerDay)}
          sub={`ทั้งปี ${formatNumber(w.physicians)} คน`}
        />
        <StatTile
          label="visit ต่อแพทย์-วัน"
          value={formatDecimal(w.visitsPerPhysicianDay)}
          sub="visit ที่แพทย์ตรวจ ÷ แพทย์-วัน"
        />
      </div>
    </section>
  );
}
