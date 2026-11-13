import type { LucideIcon } from "lucide-react";
import { Coins, PiggyBank, Percent, TrendingDown } from "lucide-react";
import type { PpfsTotals } from "@/lib/kpi/ppfs-types";
import { formatBaht, formatPercent } from "../format";

interface CardProps {
  title: string;
  value: string;
  sub: string;
  Icon: LucideIcon;
  tone: string;
}

function Card({ title, value, sub, Icon, tone }: CardProps) {
  return (
    <div className="min-w-0 rounded-xl border border-zinc-200 bg-surface p-4 shadow-sm dark:border-zinc-800">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">{title}</p>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone}`}>
          <Icon aria-hidden="true" className="h-5 w-5" />
        </span>
      </div>
      {/* Header size (16px) per user decision; emphasis comes from weight + colour, not size. */}
      <p className="mt-2 break-words text-base font-bold tabular-nums text-zinc-950 dark:text-zinc-50">
        {value}
      </p>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{sub}</p>
    </div>
  );
}

export function PpfsStatCards({ totals }: { totals: PpfsTotals }) {
  return (
    <section
      aria-label="สรุปรายได้คัดกรอง PPFS"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      <Card
        title="เงินเป้าหมายรวม (บาท)"
        value={formatBaht(totals.targetBaht)}
        sub="เฉพาะรายการที่มีเป้าหมาย"
        Icon={Coins}
        tone="bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
      />
      <Card
        title="ได้แล้ว (บาท, ประมาณการ)"
        value={formatBaht(totals.earnedBaht)}
        sub="รวมทุกรายการ"
        Icon={PiggyBank}
        tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
      />
      <Card
        title="ยังไม่ได้ (บาท)"
        value={formatBaht(totals.gapBaht)}
        sub="เป้าหมายที่ยังไม่ได้ดำเนินการ"
        Icon={TrendingDown}
        tone="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
      />
      <Card
        title="ความครอบคลุม"
        value={`${formatPercent(totals.coveragePercent)}%`}
        sub="ได้แล้ว ÷ เงินเป้าหมาย"
        Icon={Percent}
        tone="bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
      />
    </section>
  );
}
