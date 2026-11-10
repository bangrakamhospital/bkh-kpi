import { Suspense } from "react";
import Image from "next/image";
import { DistrictScreening } from "@/components/kpi/DistrictScreening";
import { DashboardSkeleton } from "@/components/kpi/DashboardSkeleton";
import { KpiTabs } from "@/components/kpi/KpiTabs";
import { HeaderAuth } from "@/components/auth/HeaderAuth";

export const metadata = {
  title: "ภาพรวมอำเภอบางระกำ | โรงพยาบาลบางระกำ KPI",
};

export default function DistrictPage(props: PageProps<"/district">) {
  return (
    <>
      <header className="bg-linear-to-r from-brand-700 via-brand-800 to-brand-900 pb-12 pt-5 text-white">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white p-1">
            <Image src="/logo.png" alt="โลโก้โรงพยาบาล" width={32} height={32} className="h-8 w-8 object-contain" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold tracking-wide text-brand-100">
              โรงพยาบาลบางระกำ KPI
            </p>
            <h1 className="mt-0.5 text-sm font-semibold leading-5">
              ตัวชี้วัดระดับอำเภอบางระกำ รายตำบล / รายหมู่
            </h1>
            <p className="text-xs text-brand-100">
              คัดกรองเบาหวาน / ความดันโลหิตสูง และการตรวจ HbA1c / LDL / Creatinine ผู้ป่วยเบาหวาน ทั้ง 11 ตำบล
            </p>
          </div>
          <HeaderAuth />
        </div>
        <div className="mx-auto mt-4 w-full max-w-6xl px-4 sm:px-6">
          <KpiTabs />
        </div>
      </header>
      <main className="mx-auto -mt-8 w-full max-w-6xl flex-1 px-4 pb-8 sm:px-6">
        <Suspense fallback={<DashboardSkeleton />}>
          <DistrictScreening searchParams={props.searchParams} />
        </Suspense>
      </main>
    </>
  );
}
