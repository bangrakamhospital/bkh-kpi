import type { LucideIcon } from "lucide-react";
import { Coins, PiggyBank, TrendingDown } from "lucide-react";
import type { PpBasicSummary } from "@/lib/kpi/ppbasic-types";
import { formatBaht } from "../format";

type Totals = PpBasicSummary["moneyTotals"]["nhso"];

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
      <p className="mt-2 break-words text-base font-bold tabular-nums text-zinc-950 dark:text-zinc-50">
        {value}
      </p>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{sub}</p>
    </div>
  );
}

const TARGET_TONE = "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300";
const EARNED_TONE =
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
const GAP_TONE = "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300";

export function PpBasicStatCards({
  totals,
}: {
  totals: PpBasicSummary["moneyTotals"];
}) {
  const group = (t: Totals) => (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Card
        title="เป้าหมาย (บาท)"
        value={formatBaht(t.targetBaht)}
        sub="เฉพาะรายการที่มีอัตรา"
        Icon={Coins}
        tone={TARGET_TONE}
      />
      <Card
        title="ได้แล้ว (บาท)"
        value={formatBaht(t.earnedBaht)}
        sub="จากผลงานที่ทำแล้ว"
        Icon={PiggyBank}
        tone={EARNED_TONE}
      />
      <Card
        title="ยังไม่ได้ (บาท)"
        value={formatBaht(t.gapBaht)}
        sub="เป้าหมายที่ยังไม่ได้ดำเนินการ"
        Icon={TrendingDown}
        tone={GAP_TONE}
      />
    </div>
  );

  return (
    <section aria-label="สรุปมูลค่าบริการพื้นฐาน P&P" className="space-y-3">
      <div className="space-y-2">
        <h2 className="break-words text-sm font-semibold">
          เงิน สปสช. (วัคซีน นับเป็นเข็ม รวมเด็กนอกเขต)
        </h2>
        {group(totals.nhso)}
      </div>
      <div className="space-y-2 rounded-xl border border-dashed border-amber-400 bg-amber-50/50 p-3 dark:border-amber-700 dark:bg-amber-950/20">
        <h2 className="break-words text-sm font-semibold text-amber-900 dark:text-amber-200">
          มูลค่าอ้างอิง (ไม่ใช่เงิน สปสช.)
        </h2>
        {group(totals.reference)}
      </div>
    </section>
  );
}
