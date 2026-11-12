import type { LucideIcon } from "lucide-react";
import { BedDouble, Home, Siren, Stethoscope, UserPlus, Users } from "lucide-react";
import type { OverviewCards, OverviewRange } from "@/lib/kpi/overview-types";
import { formatNumber } from "../format";

interface CardProps {
  title: string;
  value: string;
  unit: string;
  sub: string;
  Icon: LucideIcon;
  tone: string;
}

const pctFormat = new Intl.NumberFormat("th-TH", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function Card({ title, value, unit, sub, Icon, tone }: CardProps) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{title}</p>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone}`}>
          <Icon aria-hidden="true" className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5">
        {/* Exception to the 3-size font rule: emphasised KPI number. */}
        <span className="text-3xl font-bold tabular-nums">{value}</span>
        <span className="text-xs text-zinc-600 dark:text-zinc-400">{unit}</span>
      </p>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{sub}</p>
    </div>
  );
}

export function StatCards({
  cards,
  range,
}: {
  cards: OverviewCards;
  range: OverviewRange;
}) {
  const prevLabel = range.preset === "today" ? "เมื่อวาน" : "ช่วงก่อนหน้า";
  const prev = (n: number) => `${prevLabel} ${formatNumber(n)}`;
  const occupancy = cards.bedTotal > 0 ? (cards.inpatientNow / cards.bedTotal) * 100 : 0;

  return (
    <section
      aria-label="สรุปจำนวนผู้รับบริการ"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
    >
      <Card
        title="ผู้รับบริการ"
        value={formatNumber(cards.patients.value)}
        unit="คน"
        sub={prev(cards.patients.prev)}
        Icon={Users}
        tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
      />
      <Card
        title="visit ผู้ป่วยนอก"
        value={formatNumber(cards.opdVisits.value)}
        unit="ครั้ง"
        sub={prev(cards.opdVisits.prev)}
        Icon={Stethoscope}
        tone="bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
      />
      <Card
        title="อุบัติเหตุ-ฉุกเฉิน"
        value={formatNumber(cards.er.value)}
        unit="ครั้ง"
        sub={`ฉุกเฉิน · ${prev(cards.er.prev)}`}
        Icon={Siren}
        tone="bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
      />
      <Card
        title="รับใหม่ผู้ป่วยใน"
        value={formatNumber(cards.admitNew.value)}
        unit="คน"
        sub={prev(cards.admitNew.prev)}
        Icon={UserPlus}
        tone="bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
      />
      <Card
        title="ผู้ป่วยในขณะนี้"
        value={`${formatNumber(cards.inpatientNow)} / ${formatNumber(cards.bedTotal)}`}
        unit="เตียง"
        sub={`ครองเตียง ${pctFormat.format(occupancy)}%`}
        Icon={BedDouble}
        tone="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
      />
      <Card
        title="Home ward"
        value={formatNumber(cards.homeWardNow)}
        unit="คน"
        sub="ไม่นับในอัตราครองเตียง"
        Icon={Home}
        tone="bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300"
      />
    </section>
  );
}
