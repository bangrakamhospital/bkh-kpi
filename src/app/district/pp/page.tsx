import { FiscalYearSuspense } from "@/components/kpi/FiscalYearSuspense";
import Image from "next/image";
import { DistrictPpDashboard } from "@/components/kpi/district-pp/DistrictPpDashboard";
import { KpiTabs } from "@/components/kpi/KpiTabs";
import { DistrictSubNav } from "@/components/kpi/DistrictSubNav";
import { PageViewAudit } from "@/components/audit/PageViewAudit";
import { HeaderAuth } from "@/components/auth/HeaderAuth";
import { RequireLogin } from "@/components/auth/RequireLogin";

export const metadata = {
  title: "รายได้ PP ทั้งอำเภอ | โรงพยาบาลบางระกำ KPI",
};

export default function DistrictPpPage(props: PageProps<"/district/pp">) {
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
              รายได้ PP ทั้งอำเภอบางระกำ รายหน่วยบริการ / ตำบล / หมู่
            </h1>
            <p className="text-xs text-brand-100">
              PPFS และ P&amp;P Basic Services จากข้อมูล HDC เงินเป้าหมาย เทียบกับที่ได้แล้ว และส่วนที่ยังไม่ได้
            </p>
          </div>
          <HeaderAuth />
        </div>
        <div className="mx-auto mt-4 w-full max-w-6xl px-4 sm:px-6">
          <KpiTabs />
        </div>
        <div className="mx-auto mt-3 w-full max-w-6xl px-4 sm:px-6">
          <DistrictSubNav />
        </div>
      </header>
      <main className="mx-auto -mt-8 w-full max-w-6xl flex-1 px-4 pb-8 sm:px-6">
        <PageViewAudit path="/district/pp" searchParams={props.searchParams} />
        <FiscalYearSuspense searchParams={props.searchParams}>
          <RequireLogin path="/district/pp" searchParams={props.searchParams}>
            <DistrictPpDashboard searchParams={props.searchParams} />
          </RequireLogin>
        </FiscalYearSuspense>
      </main>
    </>
  );
}
