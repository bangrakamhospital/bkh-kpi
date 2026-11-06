import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { HeaderAuth } from "@/components/auth/HeaderAuth";
import { AdminUsersClient } from "@/components/admin/AdminUsersClient";

export const metadata: Metadata = {
  title: "จัดการผู้ใช้งาน | โรงพยาบาลบางระกำ KPI",
  robots: { index: false, follow: false },
};

export default function AdminUsersPage() {
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
              จัดการผู้ใช้งาน
            </h1>
            <Link
              href="/"
              className="mt-1 inline-flex items-center gap-1 text-xs text-brand-100 hover:text-white hover:underline"
            >
              <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
              กลับแดชบอร์ด
            </Link>
          </div>
          <HeaderAuth />
        </div>
      </header>
      <main className="mx-auto -mt-8 w-full max-w-6xl flex-1 px-4 pb-8 sm:px-6">
        <AdminTabs active="users" />
        <AdminUsersClient />
      </main>
    </>
  );
}
