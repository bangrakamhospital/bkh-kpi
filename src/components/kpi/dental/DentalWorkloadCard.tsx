import type { DentalWait, DentalWorkload } from "@/lib/kpi/dental-clinic-types";
import { formatDecimal, formatNumber, formatPercent } from "../format";
import { StatTile } from "../clinic/StatTile";
import { ExcelDownloadButton, type ExcelExport } from "../overview/ExcelDownloadButton";
import { round2 } from "../overview/export-utils";

const minutes = (v: number | null) => (v === null ? "–" : `${formatNumber(v)} นาที`);

export function DentalWorkloadCard({
  workload: w,
  waiting: t,
  fiscalYear,
}: {
  workload: DentalWorkload;
  waiting: DentalWait;
  fiscalYear: number;
}) {
  const excel: ExcelExport = {
    fileName: `dental-workload-fy${fiscalYear}`,
    title: `คลินิกทันตกรรม ภาระงานและระยะเวลารอคอย ปีงบประมาณ ${fiscalYear}`,
    subtitle: "ห้องตรวจทันตกรรมในโรงพยาบาล (008) · แหล่งข้อมูล HOSxP",
    sheetName: "ภาระงาน",
    columns: [{ header: "รายการ" }, { header: "ค่า" }, { header: "หน่วย" }],
    rows: [
      ["วันทำการ", w.clinicDays, "วัน"],
      ["visit ต่อวัน เฉลี่ย", round2(w.avgVisitsPerDay), "visit/วัน"],
      ["visit ต่อวัน สูงสุด", w.maxVisitsPerDay, "visit/วัน"],
      ["หัตถการเฉลี่ย", round2(w.avgProceduresPerDay), "รายการ/วัน"],
      ["ทันตบุคลากรต่อวัน เฉลี่ย", round2(w.avgStaffPerDay), "คน/วัน"],
      ["ทันตบุคลากรทั้งปี", w.staff, "คน"],
      ["visit ต่อทันตบุคลากร-วัน", round2(w.visitsPerStaffDay), "visit"],
      ["ออกหน่วย (วัน)", w.outreachDays, "วัน"],
      ["ออกหน่วย visit ต่อวัน", round2(w.outreachVisitsPerDay), "visit/วัน"],
      ["ทันตบุคลากรออกหน่วย", w.outreachStaff, "คน"],
      ["นัด (ถึงวันนัดแล้ว)", w.appointments, "นัด"],
      ["มาตามนัด", w.appointmentsKept, "นัด"],
      ["มาตามนัด", round2(w.appointmentsKeptPercent), "ร้อยละ"],
      ["รอคอย: visit ลงทะเบียนห้องฟัน", t.visits, "visit"],
      ["รอคอย: visit ที่วัดได้", t.measured, "visit"],
      ["รอคอย: มัธยฐาน", round2(t.medianMinutes), "นาที"],
      ["รอคอย: เฉลี่ย", round2(t.meanMinutes), "นาที"],
      ["รอคอย: P90", round2(t.p90Minutes), "นาที"],
      ["ได้รับบริการภายใน 60 นาที", round2(t.within60Percent), "ร้อยละ"],
    ],
    notes: [
      "วันทำการ = วันที่มี visit อย่างน้อย 1 ราย ทันตบุคลากร = ผู้บันทึกหัตถการ (dtmain.doctor ที่ไม่ซ้ำ)",
      "ระยะเวลารอคอยเป็นค่าประมาณ: นับจากเวลาลงทะเบียน (ovst) ถึงเวลาที่บันทึกหัตถการแรกของห้องฟัน เฉพาะ visit ที่ลงทะเบียนห้องฟัน 008 ไม่รวมวันนี้",
    ],
  };

  return (
    <section
      aria-label="ภาระงานและระยะเวลารอคอย"
      className="min-w-0 rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-base font-semibold">ภาระงานและระยะเวลารอคอย</h2>
        <ExcelDownloadButton data={excel} />
      </div>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
        ห้องตรวจทันตกรรมในโรงพยาบาล (008) วันทำการ = วันที่มี visit อย่างน้อย 1 ราย ทันตบุคลากร = ผู้บันทึกหัตถการ (dtmain.doctor ที่ไม่ซ้ำ)
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="วันทำการ" value={formatNumber(w.clinicDays)} sub="วัน" />
        <StatTile
          label="visit ต่อวัน (เฉลี่ย / สูงสุด)"
          value={`${formatDecimal(w.avgVisitsPerDay)} / ${formatNumber(w.maxVisitsPerDay)}`}
          sub={`หัตถการเฉลี่ย ${formatDecimal(w.avgProceduresPerDay)} รายการ/วัน`}
        />
        <StatTile
          label="ทันตบุคลากรต่อวัน (เฉลี่ย)"
          value={formatDecimal(w.avgStaffPerDay)}
          sub={`ทั้งปี ${formatNumber(w.staff)} คน`}
        />
        <StatTile
          label="visit ต่อทันตบุคลากร-วัน"
          value={formatDecimal(w.visitsPerStaffDay)}
          sub="คู่ (ผู้บันทึก, visit) ÷ บุคลากร-วัน"
        />
        <StatTile
          label="ออกหน่วย (วัน / visit ต่อวัน)"
          value={`${formatNumber(w.outreachDays)} / ${formatDecimal(w.outreachVisitsPerDay)}`}
          sub={`ทันตบุคลากรออกหน่วย ${formatNumber(w.outreachStaff)} คน`}
        />
        <StatTile
          label="มาตามนัด"
          value={w.appointmentsKeptPercent === null ? "–" : `${formatPercent(w.appointmentsKeptPercent)}%`}
          sub={`${formatNumber(w.appointmentsKept)} จาก ${formatNumber(w.appointments)} นัด (ถึงวันนัดแล้ว)`}
        />
        <StatTile
          label="ลงทะเบียน → บันทึกหัตถการแรก (มัธยฐาน)"
          value={minutes(t.medianMinutes)}
          sub={`เฉลี่ย ${minutes(t.meanMinutes)} · P90 ${minutes(t.p90Minutes)}`}
        />
        <StatTile
          label="ได้รับบริการภายใน 60 นาที"
          value={t.within60Percent === null ? "–" : `${formatPercent(t.within60Percent)}%`}
          sub={`วัดได้ ${formatNumber(t.measured)} จาก ${formatNumber(t.visits)} visit`}
        />
      </div>
      <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
        ระยะเวลารอคอยเป็นค่าประมาณ: นับจากเวลาลงทะเบียน (ovst) ถึงเวลาที่บันทึกหัตถการแรกของห้องฟัน (dtmain.begin_time) เฉพาะ visit ที่ลงทะเบียนห้องฟัน 008 ไม่รวมวันนี้ HOSxP ไม่มีจุดบันทึกเวลาเข้าห้องฟัน จึงรวมเวลาทำหัตถการบางส่วน
      </p>
    </section>
  );
}
