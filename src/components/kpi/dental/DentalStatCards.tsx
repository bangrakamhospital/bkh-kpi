import { Banknote, CalendarCheck, Smile, Users } from "lucide-react";
import type { DentalClinicSummary } from "@/lib/kpi/dental-clinic-types";
import { formatBaht, formatDecimal, formatNumber, formatPercent } from "../format";
import { STAT_TONES, StatCard } from "../clinic/StatCard";

export function DentalStatCards({ data }: { data: DentalClinicSummary }) {
  const treatPct = data.visits > 0 ? (data.treatmentVisits / data.visits) * 100 : 0;
  return (
    <section
      aria-label="สรุปคลินิกทันตกรรม"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      <StatCard
        title="ผู้รับบริการ (คน)"
        value={formatNumber(data.persons)}
        sub={`${data.clinic.name} · คนไม่ซ้ำในปีงบฯ · ได้รับการรักษา ${formatNumber(data.treatedPersons)} คน`}
        Icon={Users}
        tone={STAT_TONES.sky}
      />
      <StatCard
        title="จำนวน visit / หัตถการ"
        value={`${formatNumber(data.visits)} / ${formatNumber(data.procedures)}`}
        sub={`visit ที่มีการรักษา ${formatNumber(data.treatmentVisits)} (${formatPercent(treatPct)}%) · ที่เหลือตรวจ/ส่งเสริมป้องกันอย่างเดียว`}
        Icon={Smile}
        tone={STAT_TONES.emerald}
      />
      <StatCard
        title="ค่าบริการทันตกรรม (บาท)"
        value={formatBaht(data.money.baht)}
        sub={`เฉลี่ย ${formatBaht(data.bahtPerVisit)} บาท/visit · ทันตกรรม ${formatBaht(data.money.dentalFeeBaht)} · ฟันเทียม ${formatBaht(data.money.prosthesisBaht)}`}
        Icon={Banknote}
        tone={STAT_TONES.amber}
      />
      <StatCard
        title="ภาระงานห้องฟัน (visit/วัน)"
        value={formatDecimal(data.workload.avgVisitsPerDay)}
        sub={`${formatNumber(data.workload.clinicDays)} วันทำการ · ${formatDecimal(data.workload.visitsPerStaffDay)} visit ต่อทันตบุคลากร-วัน`}
        Icon={CalendarCheck}
        tone={STAT_TONES.violet}
      />
    </section>
  );
}
