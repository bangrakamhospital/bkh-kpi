import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { PageViewAudit } from "@/components/audit/PageViewAudit";
import { HeaderAuth } from "@/components/auth/HeaderAuth";
import { RequireLogin } from "@/components/auth/RequireLogin";
import { ErpTabs } from "./ErpTabs";
import { LoadingCard } from "./ui";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Layout of every /erp page: header (title, ระบบ ERP tabs, login state),
 * page-view audit, and the login gate around the (client) content.
 * /erp is in LOGIN_REQUIRED_PAGES (proxy 307 first); RequireLogin is the
 * second server check. Data comes from /api/erp/*, which enforces the
 * ERP roles on every request.
 */
export function ErpPage({
  path,
  title,
  subtitle,
  searchParams,
  children,
}: {
  path: string;
  title: string;
  subtitle?: string;
  searchParams?: Promise<SearchParams>;
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="bg-linear-to-r from-brand-700 via-brand-800 to-brand-900 pb-12 pt-5 text-white">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white p-1">
            <Image src="/logo.png" alt="โลโก้โรงพยาบาล" width={32} height={32} className="h-8 w-8 object-contain" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold tracking-wide text-brand-100">โรงพยาบาลบางระกำ ERP</p>
            <h1 className="mt-0.5 text-sm font-semibold leading-5">{title}</h1>
            {subtitle && <p className="text-xs text-brand-100">{subtitle}</p>}
            <Link
              href="/"
              className="mt-1 inline-flex items-center gap-1 text-xs text-brand-100 hover:text-white hover:underline"
            >
              <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
              กลับแดชบอร์ด KPI
            </Link>
          </div>
          <HeaderAuth />
        </div>
        <div className="mx-auto mt-4 w-full max-w-6xl px-4 sm:px-6">
          <ErpTabs />
        </div>
      </header>
      <main className="mx-auto -mt-8 w-full max-w-6xl flex-1 px-4 pb-8 sm:px-6">
        <PageViewAudit path={path} searchParams={searchParams} />
        <Suspense fallback={<LoadingCard />}>
          <RequireLogin path={path} searchParams={searchParams}>
            {children}
          </RequireLogin>
        </Suspense>
      </main>
    </>
  );
}
