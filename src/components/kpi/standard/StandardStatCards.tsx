import { Banknote, CalendarCheck, Stethoscope, Users } from "lucide-react";
import type { StandardClinicSummary } from "@/lib/kpi/standard-clinic-types";
import { STAT_TONES, StatCard } from "../clinic/StatCard";
import { formatBaht, formatDecimal, formatNumber } from "../format";

export function StandardStatCards({ data }: { data: StandardClinicSummary }) {
  const { workload: w } = data;
  return (
    <section
      aria-label={`สรุป${data.label}`}
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      <StatCard
        title="ผู้รับบริการ (คน)"
        value={formatNumber(data.persons)}
        sub={`คนไม่ซ้ำในปีงบฯ · แผนก ${data.depcodes.join(", ")}`}
        Icon={Users}
        tone={STAT_TONES.sky}
      />
      <StatCard
        title="จำนวน visit"
        value={formatNumber(data.visits)}
        sub={`เฉลี่ย ${formatDecimal(data.persons > 0 ? data.visits / data.persons : 0)} visit/คน`}
        Icon={Stethoscope}
        tone={STAT_TONES.emerald}
      />
      <StatCard
        title="ค่าใช้จ่ายรวม (บาท)"
        value={formatBaht(data.money.baht)}
        sub={`เฉลี่ย ${formatBaht(data.bahtPerVisit)} บาท/visit · ผู้ป่วยชำระเอง ${formatBaht(data.money.paidBaht)}`}
        Icon={Banknote}
        tone={STAT_TONES.amber}
      />
      <StatCard
        title="ภาระงานเฉลี่ย (visit/วัน)"
        value={formatDecimal(w.avgVisitsPerDay)}
        sub={`สูงสุด ${formatNumber(w.maxVisitsPerDay)} visit/วัน · เปิดบริการ ${formatNumber(w.clinicDays)} วัน`}
        Icon={CalendarCheck}
        tone={STAT_TONES.violet}
      />
    </section>
  );
}
