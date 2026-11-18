import { Banknote, CalendarCheck, Stethoscope, Users } from "lucide-react";
import type { NcdClinicSummary } from "@/lib/kpi/ncd-clinic-types";
import { formatBaht, formatDecimal, formatNumber, formatPercent } from "../format";
import { STAT_TONES, StatCard } from "../clinic/StatCard";

export function NcdStatCards({ data }: { data: NcdClinicSummary }) {
  const { workload } = data;
  const labPct = data.visits > 0 ? (data.labVisits / data.visits) * 100 : 0;
  return (
    <section
      aria-label="สรุปคลินิก NCD"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      <StatCard
        title="ผู้รับบริการ (คน)"
        value={formatNumber(data.persons)}
        sub={`${data.clinic.name} · คนไม่ซ้ำในปีงบฯ`}
        Icon={Users}
        tone={STAT_TONES.sky}
      />
      <StatCard
        title="จำนวน visit"
        value={formatNumber(data.visits)}
        sub={`มี lab ${formatNumber(data.labVisits)} visit (${formatPercent(labPct)}%)`}
        Icon={Stethoscope}
        tone={STAT_TONES.emerald}
      />
      <StatCard
        title="ค่าใช้จ่ายรวม (บาท)"
        value={formatBaht(data.money.baht)}
        sub={`เฉลี่ย ${formatBaht(data.bahtPerVisit)} บาท/visit · ยา ${formatBaht(data.money.drugBaht)} · lab ${formatBaht(data.money.labBaht)}`}
        Icon={Banknote}
        tone={STAT_TONES.amber}
      />
      <StatCard
        title="ภาระงานเฉลี่ย (visit/วัน)"
        value={formatDecimal(workload.avgVisitsPerDay)}
        sub={`เทียบเป้า ${formatNumber(workload.targetPerDay)} · เกินเป้า ${formatNumber(workload.daysOverTarget)} จาก ${formatNumber(workload.clinicDays)} วัน`}
        Icon={CalendarCheck}
        tone={STAT_TONES.violet}
      />
    </section>
  );
}
