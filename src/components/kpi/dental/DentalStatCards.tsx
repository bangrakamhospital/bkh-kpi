import type { LucideIcon } from "lucide-react";
import { Banknote, CalendarCheck, Smile, Users } from "lucide-react";
import type { DentalClinicSummary } from "@/lib/kpi/dental-clinic-types";
import { formatBaht, formatDecimal, formatNumber, formatPercent } from "../format";

interface CardProps {
  title: string;
  value: string;
  sub: string;
  Icon: LucideIcon;
  tone: string;
}

/** Same card as NcdStatCards (value at 16px, emphasis by weight). */
function Card({ title, value, sub, Icon, tone }: CardProps) {
  return (
    <div className="min-w-0 rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">{title}</p>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone}`}>
          <Icon aria-hidden="true" className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-2 break-words text-base font-bold tabular-nums text-zinc-950 dark:text-zinc-50">
        {value}
      </p>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{sub}</p>
    </div>
  );
}

export function DentalStatCards({ data }: { data: DentalClinicSummary }) {
  const treatPct = data.visits > 0 ? (data.treatmentVisits / data.visits) * 100 : 0;
  return (
    <section
      aria-label="สรุปคลินิกทันตกรรม"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      <Card
        title="ผู้รับบริการ (คน)"
        value={formatNumber(data.persons)}
        sub={`${data.clinic.name} · คนไม่ซ้ำในปีงบฯ · ได้รับการรักษา ${formatNumber(data.treatedPersons)} คน`}
        Icon={Users}
        tone="bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
      />
      <Card
        title="จำนวน visit / หัตถการ"
        value={`${formatNumber(data.visits)} / ${formatNumber(data.procedures)}`}
        sub={`visit ที่มีการรักษา ${formatNumber(data.treatmentVisits)} (${formatPercent(treatPct)}%) · ที่เหลือตรวจ/ส่งเสริมป้องกันอย่างเดียว`}
        Icon={Smile}
        tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
      />
      <Card
        title="ค่าบริการทันตกรรม (บาท)"
        value={formatBaht(data.money.baht)}
        sub={`เฉลี่ย ${formatBaht(data.bahtPerVisit)} บาท/visit · ทันตกรรม ${formatBaht(data.money.dentalFeeBaht)} · ฟันเทียม ${formatBaht(data.money.prosthesisBaht)}`}
        Icon={Banknote}
        tone="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
      />
      <Card
        title="ภาระงานห้องฟัน (visit/วัน)"
        value={formatDecimal(data.workload.avgVisitsPerDay)}
        sub={`${formatNumber(data.workload.clinicDays)} วันทำการ · ${formatDecimal(data.workload.visitsPerStaffDay)} visit ต่อทันตบุคลากร-วัน`}
        Icon={CalendarCheck}
        tone="bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
      />
    </section>
  );
}
