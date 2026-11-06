"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

export default function Error({ reset }: { reset: () => void }) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center px-4 py-12 text-center">
      <AlertTriangle
        aria-hidden="true"
        className="h-8 w-8 text-amber-600 dark:text-amber-400"
      />
      <h1 className="mt-4 text-sm font-bold">ไม่สามารถดึงข้อมูลได้</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        เกิดข้อผิดพลาดขณะโหลดข้อมูล กรุณาลองใหม่อีกครั้ง
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand-700 px-5 py-2 text-sm font-medium text-white hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        <RotateCcw aria-hidden="true" className="h-4 w-4" />
        ลองใหม่
      </button>
    </div>
  );
}
