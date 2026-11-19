import type { DistrictUnitStatus } from "@/lib/kpi/types";
import { formatThaiDate } from "./format";

/** "ความสดของข้อมูลรายหน่วยบริการ" list of a sub-district's units. */
export function DistrictUnitFreshness({
  units,
}: {
  units: readonly DistrictUnitStatus[];
}) {
  return (
    <div>
      <h3 className="mb-1.5 text-sm font-semibold">
        ความสดของข้อมูลรายหน่วยบริการ
      </h3>
      <ul className="space-y-1.5 text-xs">
        {units.map((u) => (
          <li
            key={u.hospcode}
            className="rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"
          >
            <span className="block font-medium">{u.name}</span>
            <span className="block text-zinc-600 dark:text-zinc-400">
              ส่งข้อมูลบริการล่าสุด:{" "}
              {u.lastServiceDate ? formatThaiDate(u.lastServiceDate) : "—"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
