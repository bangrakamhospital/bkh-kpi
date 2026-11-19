"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { F43UnitOption } from "@/lib/kpi/f43-types";

/** Service-unit picker of /f43: navigates to ?fy=&m=&u= (default "*" = all). */
export function F43UnitSelect({
  units,
  value,
  baseHref,
}: {
  units: readonly F43UnitOption[];
  value: string;
  /** "/f43?fy=2570&m=2026-11" (without u). */
  baseHref: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const pcu = units.filter((u) => u.isPcu);
  const others = units.filter((u) => !u.isPcu && u.code !== "*");

  return (
    <label className="flex min-w-0 items-center gap-2 text-sm">
      <span className="shrink-0 font-medium">หน่วยบริการ</span>
      <select
        value={value}
        aria-busy={pending}
        onChange={(e) => {
          const u = e.target.value;
          startTransition(() => {
            router.push(u === "*" ? baseHref : `${baseHref}&u=${encodeURIComponent(u)}`);
          });
        }}
        className={`min-w-0 max-w-full rounded-lg border border-brand-200 bg-surface px-2 py-1.5 text-xs focus-visible:outline-2 focus-visible:outline-brand-600 dark:border-brand-700 ${pending ? "opacity-50" : ""}`}
      >
        <option value="*">ทุกหน่วยบริการ</option>
        {pcu.length > 0 && (
          <optgroup label="PCU">
            {pcu.map((u) => (
              <option key={u.code} value={u.code}>
                {u.name}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label="แผนก / จุดบริการ">
          {others.map((u) => (
            <option key={u.code} value={u.code}>
              {u.name}
            </option>
          ))}
        </optgroup>
      </select>
    </label>
  );
}
