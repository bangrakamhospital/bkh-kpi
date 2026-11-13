import { Suspense } from "react";

import { DashboardSkeleton } from "./DashboardSkeleton";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Suspense ที่ key ด้วย ?fy= เท่านั้น: เปลี่ยนปีงบแล้ว boundary ถูก mount ใหม่
 * จึงแสดง skeleton แทนตัวเลขปีเก่า (ตัวกรองอื่นๆ เช่น ?tambon= ไม่เปลี่ยน key)
 *
 * การอ่าน searchParams ต้องอยู่ใน Suspense ชั้นนอก เพื่อไม่ให้ static shell
 * ของหน้า (PPR) กลายเป็น dynamic
 */
async function KeyedByFiscalYear({
  searchParams,
  children,
}: {
  searchParams: Promise<SearchParams>;
  children: React.ReactNode;
}) {
  const raw = (await searchParams).fy;
  const fy = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  const label = /^\d{4}$/.test(fy) ? fy : undefined;
  return (
    <Suspense
      key={fy}
      fallback={<DashboardSkeleton fiscalYear={label} />}
    >
      {children}
    </Suspense>
  );
}

export function FiscalYearSuspense({
  searchParams,
  children,
}: {
  searchParams: Promise<SearchParams>;
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <KeyedByFiscalYear searchParams={searchParams}>{children}</KeyedByFiscalYear>
    </Suspense>
  );
}
