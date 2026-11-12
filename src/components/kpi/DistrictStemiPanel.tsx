"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import type { DistrictStemiResult } from "@/lib/kpi/types";
import { targetOperatorSign } from "@/lib/kpi/screening-indicators";
import { ACCENTS } from "./indicator-theme";
import { formatNumber, formatPercent } from "./format";

type State =
  | { kind: "loading" }
  | { kind: "login" }
  | { kind: "error"; message: string }
  | { kind: "ok"; data: DistrictStemiResult };

/**
 * KPI 11 STEMI, district total only. Loaded client-side from the
 * login-only API (small numbers): 401 -> login link, never cached.
 */
export function DistrictStemiPanel({ fiscalYear }: { fiscalYear: number }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const accent = ACCENTS.stemi;

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/kpi/district/screening?code=STEMI&fy=${fiscalYear}`, {
      cache: "no-store",
      signal: ctrl.signal,
    })
      .then(async (res) => {
        if (res.status === 401) return setState({ kind: "login" });
        const body: unknown = await res.json().catch(() => null);
        if (!res.ok) {
          const message =
            body && typeof body === "object" && "error" in body
              ? String((body as { error: unknown }).error)
              : "ไม่สามารถดึงข้อมูลได้";
          return setState({ kind: "error", message });
        }
        setState({ kind: "ok", data: body as DistrictStemiResult });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState({ kind: "error", message: "ไม่สามารถดึงข้อมูลได้" });
      });
    return () => ctrl.abort();
  }, [fiscalYear]);

  const box =
    "rounded-xl border border-zinc-200 bg-surface p-4 text-sm shadow-sm dark:border-zinc-800";

  if (state.kind === "loading") {
    return (
      <div className={box} aria-busy="true">
        กำลังโหลดข้อมูล…
      </div>
    );
  }
  if (state.kind === "login") {
    const callbackUrl = encodeURIComponent(
      `/district?code=STEMI&fy=${fiscalYear}`,
    );
    return (
      <div className={`${box} flex flex-wrap items-center gap-3`}>
        <Lock aria-hidden="true" className="h-4 w-4 shrink-0" />
        <p className="flex-1">
          ตัวชี้วัดนี้มีจำนวนน้อย อาจระบุตัวผู้ป่วยได้ ต้องเข้าสู่ระบบก่อนจึงจะดูได้
        </p>
        <Link
          href={`/login?callbackUrl=${callbackUrl}`}
          className={`rounded-full px-3 py-1.5 text-sm font-medium ${accent.pill}`}
        >
          เข้าสู่ระบบ
        </Link>
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div
        role="alert"
        className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
      >
        {state.message}
      </div>
    );
  }

  const { data } = state;
  const d = data.district;
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-surface shadow-sm dark:border-zinc-800">
        <table className="w-full min-w-120 text-left text-sm">
          <caption className="sr-only">
            อัตราตายผู้ป่วย STEMI ระดับอำเภอ{d.name} ปีงบประมาณ {data.fiscalYear}
          </caption>
          <thead className={`text-xs ${accent.thead}`}>
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">
                พื้นที่
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                B (ครั้งการเจ็บป่วย)
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                A (เสียชีวิต)
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                อัตราตาย (เกณฑ์ {targetOperatorSign(data.targetOperator)}{" "}
                {formatNumber(data.targetPercent)}%)
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className={`font-semibold ${accent.footer}`}>
              <th scope="row" className="px-3 py-2.5 text-left">
                ยอดรวมอำเภอ{d.name}
              </th>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {formatNumber(d.episodes)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {formatNumber(d.deaths)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {formatPercent(d.percent)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        หมายเหตุ: {data.note}
      </p>
    </div>
  );
}
