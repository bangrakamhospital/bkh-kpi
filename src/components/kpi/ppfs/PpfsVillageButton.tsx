"use client";

import { useRef, useState } from "react";
import { MapPin, X } from "lucide-react";
import type { PpfsVillageRow } from "@/lib/kpi/ppfs-types";
import { formatBaht, formatNumber, formatPercent } from "../format";
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
  rate: number;
  /** Count unit, e.g. "คน". */
  countUnit: string;
  fiscalYear: number;
  hasBilled: boolean;
  villages: PpfsVillageRow[];
}

const NONE = "—";

function villageLabel(v: PpfsVillageRow): string {
  if (v.villageId === 0) return "ไม่ทราบหมู่บ้าน";
  const moo = v.moo ? `หมู่ ${v.moo}` : "";
  return [moo, v.villageName ?? ""].filter(Boolean).join(" ") || NONE;
}

/**
 * Per-village aggregates of one catchment PPFS item in a modal dialog.
 * The rows arrive with the page (already aggregated on the server); no
 * person-level data and no extra request. Same <dialog> pattern as
 * VillageDetailButton.
 */
export function PpfsVillageButton({
  code,
  name,
  rate,
  countUnit,
  fiscalYear,
  hasBilled,
  villages,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const titleId = `ppfs-dlg-title-${code}`;

  const total = villages.reduce(
    (acc, v) => ({
      target: acc.target + v.target,
      done: acc.done + v.done,
      billed: acc.billed + (v.billed ?? 0),
    }),
    { target: 0, done: 0, billed: 0 },
  );

  function openDialog() {
    setOpen(true);
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
  }

  const row = (
    key: string,
    label: string,
    target: number,
    done: number,
    billed: number | null,
    strong = false,
  ) => {
    const targetBaht = target * rate;
    const earnedBaht = done * rate;
    return (
      <tr key={key} className={`${trClass}${strong ? " font-semibold" : ""}`}>
        <td className={tdClass}>{label}</td>
        <td className={tdRightClass}>{formatNumber(target)}</td>
        <td className={tdRightClass}>{formatNumber(done)}</td>
        {hasBilled && (
          <td className={tdRightClass}>
            {billed === null ? NONE : formatNumber(billed)}
          </td>
        )}
        <td className={tdRightClass}>
          {target > 0 ? `${formatPercent((done / target) * 100)}%` : NONE}
        </td>
        <td className={tdRightClass}>{formatBaht(targetBaht)}</td>
        <td className={tdRightClass}>{formatBaht(earnedBaht)}</td>
        <td className={tdRightClass}>
          {formatBaht(Math.max(0, targetBaht - earnedBaht))}
        </td>
      </tr>
    );
  };

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
        className="m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden bg-surface p-0 text-left text-foreground backdrop:bg-black/50 backdrop:backdrop-blur-sm open:flex sm:m-auto sm:h-auto sm:max-h-[85vh] sm:w-full sm:max-w-4xl sm:rounded-xl"
      >
        {open && (
          <div className="flex min-h-0 w-full flex-col">
            <div className="flex items-start justify-between gap-3 border-b border-zinc-200 p-4 dark:border-zinc-800">
              <div className="min-w-0">
                <h2 id={titleId} className="text-base font-semibold">
                  {name}
                </h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  รายหมู่บ้าน ปีงบประมาณ {fiscalYear} · อัตรา {formatBaht(rate)} บาท{" "}
                  ต่อ{countUnit} · ยอดรวมเท่านั้น
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
                <table className={`${tableClass} min-w-[44rem]`}>
                  <thead className={`${theadClass} sticky top-0`}>
                    <tr>
                      <th scope="col" className={thClass}>หมู่บ้าน</th>
                      <th scope="col" className={thRightClass}>เป้าหมาย ({countUnit})</th>
                      <th scope="col" className={thRightClass}>ทำแล้ว ({countUnit})</th>
                      {hasBilled && (
                        <th scope="col" className={thRightClass}>คิดเงินแล้ว (ครั้ง)</th>
                      )}
                      <th scope="col" className={thRightClass}>ร้อยละ</th>
                      <th scope="col" className={thRightClass}>เป้าหมาย (บาท)</th>
                      <th scope="col" className={thRightClass}>ได้แล้ว (บาท)</th>
                      <th scope="col" className={thRightClass}>ยังไม่ได้ (บาท)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {villages.map((v) =>
                      row(
                        String(v.villageId),
                        villageLabel(v),
                        v.target,
                        v.done,
                        v.billed,
                      ),
                    )}
                    {row(
                      "total",
                      "รวม",
                      total.target,
                      total.done,
                      hasBilled ? total.billed : null,
                      true,
                    )}
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
