import { Activity, Banknote, CalendarCheck, Users } from "lucide-react";
import type { PtClinicSummary } from "@/lib/kpi/pt-clinic-types";
import { formatBaht, formatDecimal, formatNumber, formatPercent } from "../format";
import { STAT_TONES, StatCard } from "../clinic/StatCard";

export function PtStatCards({ data }: { data: PtClinicSummary }) {
  const otherDep = data.visits - data.depVisits;
  const otherPct = data.visits > 0 ? (otherDep / data.visits) * 100 : 0;
  return (
    <section
      aria-label="สรุปคลินิกกายภาพ"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      <StatCard
        title="ผู้รับบริการ (คน)"
        value={formatNumber(data.persons)}
        sub={`คนไม่ซ้ำในปีงบฯ · รายใหม่ ${formatNumber(data.newPersons)} คน`}
        Icon={Users}
        tone={STAT_TONES.sky}
      />
      <StatCard
        title="visit กายภาพ"
        value={formatNumber(data.visits)}
        sub={`ลงทะเบียนห้องกายภาพ ${formatNumber(data.depVisits)} · ทำใน visit แผนกอื่น ${formatNumber(otherDep)} (${formatPercent(otherPct)}%)`}
        Icon={Activity}
        tone={STAT_TONES.emerald}
      />
      <StatCard
        title="ค่าบริการกายภาพ (บาท)"
        value={formatBaht(data.money.ptBaht)}
        sub={`เฉลี่ย ${formatBaht(data.ptBahtPerVisit)} บาท/visit · ${formatNumber(data.itemQty)} หน่วยบริการ`}
        Icon={Banknote}
        tone={STAT_TONES.amber}
      />
      <StatCard
        title="ภาระงานเฉลี่ย (visit/วัน)"
        value={formatDecimal(data.workload.avgVisitsPerDay)}
        sub={`${formatNumber(data.workload.serviceDays)} วันให้บริการ · ${formatDecimal(data.workload.visitsPerTherapistDay)} visit ต่อนักกายภาพ-วัน`}
        Icon={CalendarCheck}
        tone={STAT_TONES.violet}
      />
    </section>
  );
}
