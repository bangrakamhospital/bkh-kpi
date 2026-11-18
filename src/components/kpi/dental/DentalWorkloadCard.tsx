import type { DentalWait, DentalWorkload } from "@/lib/kpi/dental-clinic-types";
import { formatDecimal, formatNumber, formatPercent } from "../format";

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="text-xs text-zinc-600 dark:text-zinc-400">{label}</p>
      <p className="mt-0.5 break-words text-base font-bold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-zinc-600 dark:text-zinc-400">{sub}</p>}
    </div>
  );
}

const minutes = (v: number | null) => (v === null ? "–" : `${formatNumber(v)} นาที`);

export function DentalWorkloadCard({
  workload: w,
  waiting: t,
}: {
  workload: DentalWorkload;
  waiting: DentalWait;
}) {
  return (
    <section
      aria-label="ภาระงานและระยะเวลารอคอย"
      className="min-w-0 rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800"
    >
      <h2 className="text-base font-semibold">ภาระงานและระยะเวลารอคอย</h2>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
        ห้องตรวจทันตกรรมในโรงพยาบาล (008) วันทำการ = วันที่มี visit อย่างน้อย 1 ราย ทันตบุคลากร = ผู้บันทึกหัตถการ (dtmain.doctor ที่ไม่ซ้ำ)
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="วันทำการ" value={formatNumber(w.clinicDays)} sub="วัน" />
        <Stat
          label="visit ต่อวัน (เฉลี่ย / สูงสุด)"
          value={`${formatDecimal(w.avgVisitsPerDay)} / ${formatNumber(w.maxVisitsPerDay)}`}
          sub={`หัตถการเฉลี่ย ${formatDecimal(w.avgProceduresPerDay)} รายการ/วัน`}
        />
        <Stat
          label="ทันตบุคลากรต่อวัน (เฉลี่ย)"
          value={formatDecimal(w.avgStaffPerDay)}
          sub={`ทั้งปี ${formatNumber(w.staff)} คน`}
        />
        <Stat
          label="visit ต่อทันตบุคลากร-วัน"
          value={formatDecimal(w.visitsPerStaffDay)}
          sub="คู่ (ผู้บันทึก, visit) ÷ บุคลากร-วัน"
        />
        <Stat
          label="ออกหน่วย (วัน / visit ต่อวัน)"
          value={`${formatNumber(w.outreachDays)} / ${formatDecimal(w.outreachVisitsPerDay)}`}
          sub={`ทันตบุคลากรออกหน่วย ${formatNumber(w.outreachStaff)} คน`}
        />
        <Stat
          label="มาตามนัด"
          value={w.appointmentsKeptPercent === null ? "–" : `${formatPercent(w.appointmentsKeptPercent)}%`}
          sub={`${formatNumber(w.appointmentsKept)} จาก ${formatNumber(w.appointments)} นัด (ถึงวันนัดแล้ว)`}
        />
        <Stat
          label="ลงทะเบียน → บันทึกหัตถการแรก (มัธยฐาน)"
          value={minutes(t.medianMinutes)}
          sub={`เฉลี่ย ${minutes(t.meanMinutes)} · P90 ${minutes(t.p90Minutes)}`}
        />
        <Stat
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
