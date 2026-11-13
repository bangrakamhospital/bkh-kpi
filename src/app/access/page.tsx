import type { Metadata } from "next";
import Image from "next/image";
import { AccessLinkLogin } from "@/components/auth/AccessLinkLogin";

/**
 * /access#<code> — external-auditor sign-in link (public page, NOT in
 * LOGIN_REQUIRED_PAGES / the proxy matcher). The code lives only in the
 * URL fragment, handled client-side by <AccessLinkLogin>.
 * Referrer-Policy: no-referrer + Cache-Control: no-store are also sent as
 * HTTP headers (next.config.ts headers()).
 */
export const metadata: Metadata = {
  title: "เข้าสู่ระบบผู้ตรวจภายนอก | โรงพยาบาลบางระกำ KPI",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function AccessPage() {
  return (
    <>
      <header className="bg-linear-to-r from-brand-700 via-brand-800 to-brand-900 pb-12 pt-5 text-white">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white p-1">
            <Image src="/logo.png" alt="โลโก้โรงพยาบาล" width={32} height={32} className="h-8 w-8 object-contain" />
          </span>
          <div>
            <p className="text-base font-bold tracking-wide text-brand-100">
              โรงพยาบาลบางระกำ KPI
            </p>
            <h1 className="mt-0.5 text-sm font-semibold leading-5">
              เข้าสู่ระบบสำหรับผู้ตรวจภายนอก
            </h1>
          </div>
        </div>
      </header>
      <main className="mx-auto -mt-8 w-full max-w-md flex-1 px-4 pb-8">
        <div className="flex justify-center rounded-xl border border-zinc-200 bg-surface p-6 shadow-sm dark:border-zinc-800">
          <AccessLinkLogin />
        </div>
      </main>
    </>
  );
}
