import { FiscalYearSuspense } from "@/components/kpi/FiscalYearSuspense";
import Image from "next/image";
import { PtClinicDashboard } from "@/components/kpi/pt/PtClinicDashboard";
import { ClinicSubNav } from "@/components/kpi/ClinicSubNav";
import { KpiTabs } from "@/components/kpi/KpiTabs";
import { PageViewAudit } from "@/components/audit/PageViewAudit";
import { HeaderAuth } from "@/components/auth/HeaderAuth";
import { RequireLogin } from "@/components/auth/RequireLogin";

export const metadata = {
  title: "คลินิกกายภาพ | ประมาณการรายได้แยกคลินิก | โรงพยาบาลบางระกำ KPI",
};

export default function ClinicPtPage(props: PageProps<"/clinic/pt">) {
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
              ประมาณการรายได้แยกคลินิก — คลินิกกายภาพ
            </h1>
            <p className="text-xs text-brand-100">
              ผู้รับบริการ ค่าบริการกายภาพแยกสิทธิ รายการหัตถการ ภาระงาน เวลารอคอย และการฟื้นฟูผู้ป่วย IMC
            </p>
          </div>
          <HeaderAuth />
        </div>
        <div className="mx-auto mt-4 w-full max-w-6xl px-4 sm:px-6">
          <KpiTabs />
        </div>
        <div className="mx-auto mt-3 w-full max-w-6xl px-4 sm:px-6">
          <ClinicSubNav />
        </div>
      </header>
      <main className="mx-auto -mt-8 w-full max-w-6xl flex-1 px-4 pb-8 sm:px-6">
        <PageViewAudit path="/clinic/pt" searchParams={props.searchParams} />
        <FiscalYearSuspense searchParams={props.searchParams}>
          <RequireLogin path="/clinic/pt" searchParams={props.searchParams}>
            <PtClinicDashboard searchParams={props.searchParams} />
          </RequireLogin>
        </FiscalYearSuspense>
      </main>
    </>
  );
}
