import type { LucideIcon } from "lucide-react";
import { Bike, PackageCheck, PackageX, Truck } from "lucide-react";
import type { DrugDeliveryCounts } from "@/lib/kpi/drug-delivery-types";
import { formatBaht, formatNumber, formatPercent } from "../format";

interface CardProps {
  title: string;
  value: string;
  sub: string;
  Icon: LucideIcon;
  tone: string;
}

/** Same card as PpfsStatCards (value at 16px, emphasis by weight). */
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

export function DrugDeliveryStatCards({
  total,
  feeBaht,
}: {
  total: DrugDeliveryCounts;
  feeBaht: number;
}) {
  const chargedPct =
    total.shipped > 0 ? (total.shippedCharged / total.shipped) * 100 : 0;
  return (
    <section
      aria-label="สรุปค่าส่งยาที่บ้าน"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      <Card
        title="ส่งยาทางไปรษณีย์ (visit)"
        value={formatNumber(total.shipped)}
        sub={`มีเลขพัสดุ · คิดค่าส่งแล้ว ${formatNumber(total.shippedCharged)} visit (${formatPercent(chargedPct)}%)`}
        Icon={Truck}
        tone="bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
      />
      <Card
        title="คิดค่าส่งไปรษณีย์แล้ว (บาท)"
        value={formatBaht(total.postBaht)}
        sub={`${formatNumber(total.postVisits)} visit · รวม visit ที่ไม่มีบันทึกส่ง/เลขพัสดุ`}
        Icon={PackageCheck}
        tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
      />
      <Card
        title="ส่งแล้วยังไม่คิดค่าส่ง (บาท, ประมาณ)"
        value={formatBaht(total.shippedUnchargedBaht)}
        sub={`${formatNumber(total.shippedUncharged)} visit × ${formatBaht(feeBaht)} บาท`}
        Icon={PackageX}
        tone="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
      />
      <Card
        title="Health Rider คิดแล้ว (บาท)"
        value={formatBaht(total.riderBaht)}
        sub={`${formatNumber(total.riderVisits)} visit · ไม่มีบันทึกการส่งใน HOSxP`}
        Icon={Bike}
        tone="bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
      />
    </section>
  );
}
