"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { safeNextPath } from "@/lib/auth/redirect";
import { useAuth } from "./AuthProvider";
import { LoginForm } from "./LoginForm";

const linkClass =
  "inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-surface px-3 py-1.5 text-sm font-medium hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 dark:border-zinc-700 dark:hover:bg-brand-900/40";

export function LoginPageClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { status, displayName } = useAuth();
  const next = safeNextPath(searchParams.get("next"));

  if (status === "in") {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <CheckCircle2
          aria-hidden="true"
          className="h-8 w-8 text-green-700 dark:text-green-400"
        />
        <p className="text-sm font-semibold">
          เข้าสู่ระบบแล้วในชื่อ {displayName}
        </p>
        <Link href={next} className={linkClass}>
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          กลับไปหน้าเดิม
        </Link>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <LoginForm
        description="ใช้ชื่อผู้ใช้และรหัสผ่านเดียวกับ HOSxP เพื่อดูรายชื่อและดาวน์โหลด Excel"
        onSuccess={() => router.replace(next)}
      />
      <Link href={next} className="text-xs text-brand-700 underline-offset-2 hover:underline dark:text-brand-300">
        กลับไปหน้าเดิมโดยไม่เข้าสู่ระบบ
      </Link>
    </div>
  );
}
