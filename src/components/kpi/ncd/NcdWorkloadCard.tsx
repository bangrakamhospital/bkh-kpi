import type { NcdWorkload } from "@/lib/kpi/ncd-clinic-types";
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

export function NcdWorkloadCard({ workload: w }: { workload: NcdWorkload }) {
  return (
    <section
      aria-label="ภาระงานคลินิก"
      className="min-w-0 rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800"
    >
      <h2 className="text-base font-semibold">ภาระงานคลินิก</h2>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
        เป้า: ไม่เกิน {formatNumber(w.targetPerDay)} ราย/วัน (visit และนัด) วันคลินิก = วันที่มี visit อย่างน้อย 1 ราย
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="วันคลินิก" value={formatNumber(w.clinicDays)} sub="วัน" />
        <Stat
          label="visit ต่อวัน (เฉลี่ย / สูงสุด)"
          value={`${formatDecimal(w.avgVisitsPerDay)} / ${formatNumber(w.maxVisitsPerDay)}`}
        />
        <Stat
          label={`วันที่ visit เกิน ${formatNumber(w.targetPerDay)}`}
          value={formatNumber(w.daysOverTarget)}
          sub={`จาก ${formatNumber(w.clinicDays)} วัน`}
        />
        <Stat
          label="นัดต่อวัน (เฉลี่ย / สูงสุด)"
          value={`${formatDecimal(w.avgAppointmentsPerDay)} / ${formatNumber(w.maxAppointmentsPerDay)}`}
          sub={`เกิน ${formatNumber(w.targetPerDay)}: ${formatNumber(w.appointmentDaysOverTarget)} จาก ${formatNumber(w.appointmentDays)} วัน`}
        />
        <Stat
          label="นัดทั้งหมด"
          value={formatNumber(w.appointments)}
          sub="ราย"
        />
        <Stat
          label="มาตามนัด"
          value={w.appointmentsKeptPercent === null ? "–" : `${formatPercent(w.appointmentsKeptPercent)}%`}
          sub={`${formatNumber(w.appointmentsKept)} จาก ${formatNumber(w.appointments)} ราย`}
        />
        <Stat
          label="แพทย์เฉลี่ยต่อวัน"
          value={formatDecimal(w.avgPhysiciansPerDay)}
          sub={`ทั้งปี ${formatNumber(w.physicians)} คน`}
        />
        <Stat
          label="visit ต่อแพทย์-วัน"
          value={formatDecimal(w.visitsPerPhysicianDay)}
          sub="visit ที่แพทย์ตรวจ ÷ แพทย์-วัน"
        />
      </div>
    </section>
  );
}
