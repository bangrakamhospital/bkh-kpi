import type { LucideIcon } from "lucide-react";
import { Banknote, CalendarCheck, Stethoscope, Users } from "lucide-react";
import type { NcdClinicSummary } from "@/lib/kpi/ncd-clinic-types";
import { formatBaht, formatDecimal, formatNumber, formatPercent } from "../format";

interface CardProps {
  title: string;
  value: string;
  sub: string;
  Icon: LucideIcon;
  tone: string;
}

/** Same card as DrugDeliveryStatCards (value at 16px, emphasis by weight). */
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

export function NcdStatCards({ data }: { data: NcdClinicSummary }) {
  const { workload } = data;
  const labPct = data.visits > 0 ? (data.labVisits / data.visits) * 100 : 0;
  return (
    <section
      aria-label="สรุปคลินิก NCD"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      <Card
        title="ผู้รับบริการ (คน)"
        value={formatNumber(data.persons)}
        sub={`${data.clinic.name} · คนไม่ซ้ำในปีงบฯ`}
        Icon={Users}
        tone="bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
      />
      <Card
        title="จำนวน visit"
        value={formatNumber(data.visits)}
        sub={`มี lab ${formatNumber(data.labVisits)} visit (${formatPercent(labPct)}%)`}
        Icon={Stethoscope}
        tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
      />
      <Card
        title="ค่าใช้จ่ายรวม (บาท)"
        value={formatBaht(data.money.baht)}
        sub={`เฉลี่ย ${formatBaht(data.bahtPerVisit)} บาท/visit · ยา ${formatBaht(data.money.drugBaht)} · lab ${formatBaht(data.money.labBaht)}`}
        Icon={Banknote}
        tone="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
      />
      <Card
        title="ภาระงานเฉลี่ย (visit/วัน)"
        value={formatDecimal(workload.avgVisitsPerDay)}
        sub={`เทียบเป้า ${formatNumber(workload.targetPerDay)} · เกินเป้า ${formatNumber(workload.daysOverTarget)} จาก ${formatNumber(workload.clinicDays)} วัน`}
        Icon={CalendarCheck}
        tone="bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
      />
    </section>
  );
}
