import { Suspense } from "react";
import Image from "next/image";
import { ScreeningDashboard } from "@/components/kpi/ScreeningDashboard";
import { DashboardSkeleton } from "@/components/kpi/DashboardSkeleton";
import { KpiTabs } from "@/components/kpi/KpiTabs";
import { PageViewAudit } from "@/components/audit/PageViewAudit";
import { HeaderAuth } from "@/components/auth/HeaderAuth";

export const metadata = {
  title: "ตัวชี้วัดในโรงพยาบาล | โรงพยาบาลบางระกำ KPI",
};

export default function HospitalPage(props: PageProps<"/hospital">) {
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
              แดชบอร์ดตัวชี้วัดการคัดกรองสุขภาพ
            </h1>
            <p className="text-xs text-brand-100">
              ตัวชี้วัดการคัดกรองเบาหวาน ความดันโลหิตสูง และมะเร็ง
            </p>
          </div>
          {/* Client-side (Auth.js useSession): keeps the page a Partial Prerender. */}
          <HeaderAuth />
        </div>
        <div className="mx-auto mt-4 w-full max-w-6xl px-4 sm:px-6">
          <KpiTabs />
        </div>
      </header>
      <main className="mx-auto -mt-8 w-full max-w-6xl flex-1 px-4 pb-8 sm:px-6">
        <PageViewAudit path="/hospital" searchParams={props.searchParams} />
        <Suspense fallback={<DashboardSkeleton />}>
          <ScreeningDashboard searchParams={props.searchParams} />
        </Suspense>
      </main>
    </>
  );
}
