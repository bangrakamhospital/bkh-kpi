import { FiscalYearSuspense } from "@/components/kpi/FiscalYearSuspense";
import Image from "next/image";
import { DrugDeliveryDashboard } from "@/components/kpi/delivery/DrugDeliveryDashboard";
import { KpiTabs } from "@/components/kpi/KpiTabs";
import { PageViewAudit } from "@/components/audit/PageViewAudit";
import { HeaderAuth } from "@/components/auth/HeaderAuth";
import { RequireLogin } from "@/components/auth/RequireLogin";

export const metadata = {
  title: "ค่าส่งยาที่บ้าน | โรงพยาบาลบางระกำ KPI",
};

export default function DeliveryPage(props: PageProps<"/delivery">) {
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
              ค่าส่งยาที่บ้าน — ไปรษณีย์ และ Health Rider (ทุกสิทธิ)
            </h1>
            <p className="text-xs text-brand-100">
              จำนวนครั้งที่ส่งยา การคิดค่าส่ง และส่วนที่ส่งแล้วยังไม่ได้คิด แยกตามกลุ่มสิทธิและรายเดือน
            </p>
          </div>
          <HeaderAuth />
        </div>
        <div className="mx-auto mt-4 w-full max-w-6xl px-4 sm:px-6">
          <KpiTabs />
        </div>
      </header>
      <main className="mx-auto -mt-8 w-full max-w-6xl flex-1 px-4 pb-8 sm:px-6">
        <PageViewAudit path="/delivery" searchParams={props.searchParams} />
        <FiscalYearSuspense searchParams={props.searchParams}>
          <RequireLogin path="/delivery" searchParams={props.searchParams}>
            <DrugDeliveryDashboard searchParams={props.searchParams} />
          </RequireLogin>
        </FiscalYearSuspense>
      </main>
    </>
  );
}
