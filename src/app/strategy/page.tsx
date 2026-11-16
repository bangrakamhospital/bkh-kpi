import Image from "next/image";
import { KpiTabs } from "@/components/kpi/KpiTabs";
import { Suspense } from "react";
import { DashboardSkeleton } from "@/components/kpi/DashboardSkeleton";
import { StrategyDashboard } from "@/components/strategy/StrategyDashboard";
import { PageViewAudit } from "@/components/audit/PageViewAudit";
import { HeaderAuth } from "@/components/auth/HeaderAuth";
import { RequireLogin } from "@/components/auth/RequireLogin";
import { getStrategyDashboard } from "@/lib/kpi/strategy";

export const metadata = {
  title: "ยุทธศาสตร์ & มาตรฐาน HA | โรงพยาบาลบางระกำ KPI",
};

/** Server data component: the UI receives the dataset via props only. */
async function StrategyContent() {
  const data = await getStrategyDashboard();
  return <StrategyDashboard data={data} />;
}

export default function StrategyPage(props: PageProps<"/strategy">) {
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
              ตัวชี้วัดยุทธศาสตร์และมาตรฐาน HA
            </h1>
            <p className="text-xs text-brand-100">
              KPI ยุทธศาสตร์ ปี 2568–2569 และเครื่องชี้วัดคุณภาพ HA Part I–IV ปี 2565–2569
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
        <PageViewAudit path="/strategy" searchParams={props.searchParams} />
        <Suspense fallback={<DashboardSkeleton />}>
          <RequireLogin path="/strategy" searchParams={props.searchParams}>
            <StrategyContent />
          </RequireLogin>
        </Suspense>
      </main>
    </>
  );
}
