import type { LucideIcon } from "lucide-react";
import { Coins, PiggyBank, TrendingDown } from "lucide-react";
import { formatBaht } from "../format";

export interface DistrictPpMoney {
  nhsoTarget: number;
  nhsoDone: number;
  refTarget: number;
  refDone: number;
}

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

const TONES = {
  target: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  done: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  gap: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
};

export function DistrictPpStatCards({
  money,
  hasReference,
}: {
  money: DistrictPpMoney;
  hasReference: boolean;
}) {
  return (
    <div className="space-y-3">
      <section
        aria-label="เงิน สปสช."
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        <Card
          title="เงิน สปสช. เป้าหมาย (บาท)"
          value={formatBaht(money.nhsoTarget)}
          sub="เฉพาะรายการอัตรา สปสช."
          Icon={Coins}
          tone={TONES.target}
        />
        <Card
          title="เงิน สปสช. ได้แล้ว (บาท)"
          value={formatBaht(money.nhsoDone)}
          sub="ประมาณการจากผลงาน × อัตรา"
          Icon={PiggyBank}
          tone={TONES.done}
        />
        <Card
          title="เงิน สปสช. ยังไม่ได้ (บาท)"
          value={formatBaht(money.nhsoTarget - money.nhsoDone)}
          sub="เป้าหมายที่ยังไม่ได้ดำเนินการ"
          Icon={TrendingDown}
          tone={TONES.gap}
        />
      </section>
      {hasReference && (
        <section
          aria-label="มูลค่าอ้างอิง (ไม่ใช่เงิน สปสช.)"
          className="space-y-2 rounded-xl border border-dashed border-amber-400 bg-amber-50/50 p-3 dark:border-amber-700 dark:bg-amber-950/30"
        >
          <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            มูลค่าอ้างอิง (ไม่ใช่เงิน สปสช.)
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card
              title="มูลค่าอ้างอิง เป้าหมาย (บาท)"
              value={formatBaht(money.refTarget)}
              sub="ไม่รวมในเงิน สปสช."
              Icon={Coins}
              tone={TONES.target}
            />
            <Card
              title="มูลค่าอ้างอิง ได้แล้ว (บาท)"
              value={formatBaht(money.refDone)}
              sub="ไม่รวมในเงิน สปสช."
              Icon={PiggyBank}
              tone={TONES.done}
            />
            <Card
              title="มูลค่าอ้างอิง ยังไม่ได้ (บาท)"
              value={formatBaht(money.refTarget - money.refDone)}
              sub="ไม่รวมในเงิน สปสช."
              Icon={TrendingDown}
              tone={TONES.gap}
            />
          </div>
        </section>
      )}
    </div>
  );
}
