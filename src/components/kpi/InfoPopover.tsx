"use client";

import { useId, useState } from "react";
import { Info } from "lucide-react";

export interface InfoItem {
  icon?: React.ReactNode;
  label: string;
  value: string;
}

interface Props {
  /** aria-label ของปุ่ม เช่น "รายละเอียดเพิ่มเติม ข้อ 3" */
  label: string;
  /** หัว popover (14px) */
  title: string;
  items: InfoItem[];
}

/**
 * ปุ่มไอคอน Info + popover แบบ native (HTML Popover API, top layer จึงไม่ถูก
 * overflow ตัด): คลิกเพื่อเปิด/ปิด, Esc และคลิกข้างนอกจะปิดเอง
 */
export function InfoPopover({ label, title, items }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        popoverTarget={id}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={label}
        className="-m-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-brand-700 hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600 dark:text-brand-300 dark:hover:bg-brand-900"
      >
        <Info aria-hidden="true" size={14} />
      </button>
      <div
        id={id}
        popover="auto"
        role="dialog"
        aria-label={title}
        onToggle={(e) =>
          setOpen((e.nativeEvent as ToggleEvent).newState === "open")
        }
        className="m-auto w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-zinc-200 bg-surface p-3 text-left text-foreground shadow-lg backdrop:bg-black/20 dark:border-zinc-700"
      >
        <p className="text-sm font-bold">{title}</p>
        <dl className="mt-2 space-y-2 text-xs">
          {items.map((item) => (
            <div key={item.label} className="flex gap-2">
              {item.icon && (
                <span
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-brand-700 dark:text-brand-300"
                >
                  {item.icon}
                </span>
              )}
              <div>
                <dt className="font-semibold">{item.label}</dt>
                <dd className="text-zinc-700 dark:text-zinc-300">{item.value}</dd>
              </div>
            </div>
          ))}
        </dl>
      </div>
    </>
  );
}
