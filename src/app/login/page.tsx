import { Suspense } from "react";
import type { Metadata } from "next";
import { HeartPulse } from "lucide-react";
import { LoginPageClient } from "@/components/auth/LoginPageClient";

export const metadata: Metadata = {
  title: "เข้าสู่ระบบ | BKH KPI",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <>
      <header className="bg-linear-to-r from-brand-700 via-brand-800 to-brand-900 pb-12 pt-5 text-white">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/15">
            <HeartPulse aria-hidden="true" className="h-5 w-5" />
          </span>
          <div>
            <p className="text-base font-bold tracking-wide text-brand-100">
              BKH KPI
            </p>
            <h1 className="mt-0.5 text-sm font-semibold leading-5">
              เข้าสู่ระบบสำหรับเจ้าหน้าที่
            </h1>
          </div>
        </div>
      </header>
      <main className="mx-auto -mt-8 w-full max-w-md flex-1 px-4 pb-8">
        <div className="flex justify-center rounded-xl border border-zinc-200 bg-surface p-6 shadow-sm dark:border-zinc-800">
          {/* useSearchParams (?next=) is request data -> behind Suspense. */}
          <Suspense
            fallback={
              <div
                aria-hidden="true"
                className="h-64 w-full max-w-sm animate-pulse rounded-lg bg-brand-50 dark:bg-brand-900/30"
              />
            }
          >
            <LoginPageClient />
          </Suspense>
        </div>
      </main>
    </>
  );
}
