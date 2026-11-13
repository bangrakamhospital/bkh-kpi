"use client";

import { useRef, useState } from "react";
import { MapPin, X } from "lucide-react";
import type { PpBasicVillageRow } from "@/lib/kpi/ppbasic-types";
import { formatNumber, formatPercent } from "../format";
import {
  tableClass,
  tdClass,
  tdRightClass,
  theadClass,
  thClass,
  thRightClass,
  trClass,
} from "../overview/table-styles";

interface Props {
  code: string;
  name: string;
  /** Count unit, e.g. "คน". */
  unit: string;
  fiscalYear: number;
  villages: PpBasicVillageRow[];
}

const NONE = "—";

function villageName(v: PpBasicVillageRow): string {
  if (v.villageId === 0) return "ไม่ทราบหมู่บ้าน";
  return v.villageName ?? NONE;
}

/**
 * Per-village aggregates of one P&P basic service in a modal dialog.
 * Rows arrive with the page (already aggregated); no person-level data.
 * Same <dialog> pattern as PpfsVillageButton.
 */
export function PpBasicVillageButton({
  code,
  name,
  unit,
  fiscalYear,
  villages,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const titleId = `ppbasic-dlg-title-${code}`;

  const total = villages.reduce(
    (acc, v) => ({ target: acc.target + v.target, done: acc.done + v.done }),
    { target: 0, done: 0 },
  );

  function openDialog() {
    setOpen(true);
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
  }

  const pct = (target: number, done: number) =>
    target > 0 ? `${formatPercent((done / target) * 100)}%` : NONE;

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        aria-label={`ดูรายหมู่บ้าน ${name}`}
        title="ดูรายหมู่บ้าน"
        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-700 text-white shadow-sm transition hover:scale-105 hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 dark:bg-brand-500 dark:text-brand-900 dark:hover:bg-brand-400"
      >
        <MapPin aria-hidden="true" size={16} />
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        className="m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden bg-surface p-0 text-left text-foreground backdrop:bg-black/50 backdrop:backdrop-blur-sm open:flex sm:m-auto sm:h-auto sm:max-h-[85vh] sm:w-full sm:max-w-2xl sm:rounded-xl"
      >
        {open && (
          <div className="flex min-h-0 w-full flex-col">
            <div className="flex items-start justify-between gap-3 border-b border-zinc-200 p-4 dark:border-zinc-800">
              <div className="min-w-0">
                <h2 id={titleId} className="text-base font-semibold">
                  {name}
                </h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  รายหมู่บ้าน ปีงบประมาณ {fiscalYear} · ยอดรวมเท่านั้น
                </p>
              </div>
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                aria-label="ปิด"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 dark:hover:bg-zinc-800"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              {villages.length === 0 ? (
                <p className="text-sm text-zinc-700 dark:text-zinc-300">
                  ไม่พบข้อมูล
                </p>
              ) : (
                <table className={`${tableClass} min-w-[30rem]`}>
                  <thead className={`${theadClass} sticky top-0`}>
                    <tr>
                      <th scope="col" className={thClass}>หมู่</th>
                      <th scope="col" className={thClass}>ชื่อหมู่บ้าน</th>
                      <th scope="col" className={thRightClass}>เป้าหมาย ({unit})</th>
                      <th scope="col" className={thRightClass}>ทำแล้ว ({unit})</th>
                      <th scope="col" className={thRightClass}>ร้อยละ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {villages.map((v) => (
                      <tr key={v.villageId} className={trClass}>
                        <td className={tdClass}>{v.moo ?? NONE}</td>
                        <td className={tdClass}>{villageName(v)}</td>
                        <td className={tdRightClass}>{formatNumber(v.target)}</td>
                        <td className={tdRightClass}>{formatNumber(v.done)}</td>
                        <td className={tdRightClass}>{pct(v.target, v.done)}</td>
                      </tr>
                    ))}
                    <tr className={`${trClass} font-semibold`}>
                      <td className={tdClass} colSpan={2}>รวม</td>
                      <td className={tdRightClass}>{formatNumber(total.target)}</td>
                      <td className={tdRightClass}>{formatNumber(total.done)}</td>
                      <td className={tdRightClass}>{pct(total.target, total.done)}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
