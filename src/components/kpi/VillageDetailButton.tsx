"use client";

import { useRef, useState } from "react";
import { Search } from "lucide-react";
import type { ScreeningCode } from "@/lib/kpi/types";
import type { AccentKey } from "./indicator-theme";
import { VillageDialogContent } from "./VillageDialogContent";

interface Props {
  no: number;
  code: ScreeningCode;
  accent: AccentKey;
  title: string;
  fiscalYear: number;
  targetPercent: number;
  periodLabel: string;
  denominatorFactor: number;
  statusLabels: { screened: string; notScreened: string };
}

export function VillageDetailButton({
  no,
  code,
  accent,
  title,
  fiscalYear,
  targetPercent,
  periodLabel,
  denominatorFactor,
  statusLabels,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const titleId = `dlg-title-${code}`;

  function openDialog() {
    setOpen(true);
    dialogRef.current?.showModal();
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        aria-label={`ดูรายละเอียดรายหมู่บ้าน ข้อ ${no}`}
        title="ดูรายละเอียดรายหมู่บ้าน"
        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-700 text-white shadow-sm transition hover:scale-105 hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 dark:bg-brand-500 dark:text-brand-900 dark:hover:bg-brand-400"
      >
        <Search aria-hidden="true" size={16} />
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        className="m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden bg-surface p-0 text-left text-foreground backdrop:bg-black/50 backdrop:backdrop-blur-sm open:flex sm:m-auto sm:h-[85vh] sm:w-full sm:max-w-4xl sm:rounded-xl"
      >
        {open && (
          <VillageDialogContent
            code={code}
            accent={accent}
            title={title}
            fiscalYear={fiscalYear}
            targetPercent={targetPercent}
            periodLabel={periodLabel}
            denominatorFactor={denominatorFactor}
            statusLabels={statusLabels}
            titleId={titleId}
            onClose={() => dialogRef.current?.close()}
          />
        )}
      </dialog>
    </>
  );
}
