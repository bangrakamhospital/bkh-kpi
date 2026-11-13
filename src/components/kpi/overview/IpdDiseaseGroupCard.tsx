"use client";

import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { DiseaseGroupRanking } from "@/lib/kpi/overview-types";
import { DiseaseGroupCard } from "./DiseaseGroupCard";

type IpdView = "admit" | "discharge";

const OPTIONS: { value: IpdView; label: string }[] = [
  { value: "admit", label: "รับใหม่ (แรกรับ)" },
  { value: "discharge", label: "จำหน่าย (รง.505)" },
];

const VIEW_CONFIG: Record<
  IpdView,
  { source: string; uncodedLabel: string; uncodedHint?: string }
> = {
  admit: {
    source:
      "กลุ่มโรค รง.505 ตามวินิจฉัยแรกรับ (วันที่ admit) · วินิจฉัยเบื้องต้น อาจเปลี่ยนเมื่อลงรหัสจำหน่าย",
    uncodedLabel: "ไม่มีวินิจฉัยแรกรับ",
  },
  discharge: {
    source: "กลุ่มโรค รง.505 ตามวินิจฉัยหลัก (วันที่จำหน่าย)",
    uncodedLabel: "รอลงรหัสวินิจฉัย",
    uncodedHint: "จำหน่ายแล้วแต่ยังไม่ลงวินิจฉัยหลัก",
  },
};

/** IPD top-10 card with a toggle between new admissions and discharges. */
export function IpdDiseaseGroupCard({
  admit,
  discharge,
}: {
  admit: DiseaseGroupRanking;
  discharge: DiseaseGroupRanking;
}) {
  const [view, setView] = useState<IpdView>("admit");
  const cfg = VIEW_CONFIG[view];
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  // WAI-ARIA radio group: arrows move + select, Home/End jump; one tab stop.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const cur = OPTIONS.findIndex((o) => o.value === view);
    let next: number;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = (cur + 1) % OPTIONS.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = (cur - 1 + OPTIONS.length) % OPTIONS.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = OPTIONS.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    setView(OPTIONS[next].value);
    buttons.current[next]?.focus();
  };

  const controls = (
    <div
      role="radiogroup"
      aria-label="มุมมองผู้ป่วยใน"
      onKeyDown={onKeyDown}
      className="inline-flex rounded-lg border border-zinc-300 p-0.5 dark:border-zinc-700"
    >
      {OPTIONS.map((o, i) => {
        const active = view === o.value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => setView(o.value)}
            className={`rounded-md px-3 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-brand-600 ${
              active
                ? "bg-brand-50 font-semibold text-brand-800 dark:bg-brand-900 dark:text-brand-100"
                : "hover:bg-brand-50 dark:hover:bg-brand-900/40"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <DiseaseGroupCard
      title="10 อันดับกลุ่มโรค ผู้ป่วยใน"
      source={cfg.source}
      unit="ครั้ง"
      ranking={view === "admit" ? admit : discharge}
      unclassifiedNote="รหัส Z, มะเร็งอวัยวะอื่น ฯลฯ"
      uncodedLabel={cfg.uncodedLabel}
      uncodedHint={cfg.uncodedHint}
      controls={controls}
    />
  );
}
