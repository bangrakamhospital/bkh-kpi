"use client";

import { useLinkStatus } from "next/link";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

/**
 * ไอคอนในลิงก์ปีงบ: เปลี่ยนเป็น spinner ระหว่างรอ navigation (ต้องอยู่ใต้ <Link>)
 * ตั้ง data-pending เพื่อให้ nav หรี่ลิงก์ปีอื่นด้วย CSS (group-has)
 */
export function FiscalYearLinkIcon({ direction }: { direction: "prev" | "next" }) {
  const { pending } = useLinkStatus();
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  return (
    <span
      data-pending={pending ? "true" : "false"}
      aria-busy={pending}
      className="inline-flex h-4 w-4 items-center justify-center"
    >
      {pending ? (
        <Loader2 aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" />
      ) : (
        <Icon aria-hidden="true" className="h-4 w-4" />
      )}
    </span>
  );
}
