"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { loginErrorMessage } from "@/lib/auth/messages";
import { isLoginRequiredPath } from "@/lib/auth/protected-paths";
import { safeCallbackPath } from "@/lib/auth/redirect";
import { useAuth } from "./AuthProvider";
import { SsoLogin } from "./SsoLogin";

const linkClass =
  "inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-surface px-3 py-1.5 text-sm font-medium hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 dark:border-zinc-700 dark:hover:bg-brand-900/40";

export function LoginPageClient() {
  const searchParams = useSearchParams();
  const { status, displayName } = useAuth();
  const rawCallback = searchParams.get("callbackUrl");
  // Render-safe (path only); absolute same-origin URLs are resolved on submit.
  const next = safeCallbackPath(rawCallback);
  // Login-required target (/hospital, /pp): "back without login" would only
  // bounce back here, so offer the public home page instead.
  const nextRequiresLogin = isLoginRequiredPath(next.split(/[?#]/)[0]);
  const authError = searchParams.get("error");
  const initialError = authError
    ? loginErrorMessage(authError, searchParams.get("code"))
    : null;

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
      <SsoLogin
        callbackUrl={next}
        description={
          nextRequiresLogin
            ? "หน้านี้สำหรับเจ้าหน้าที่ กรุณาเข้าสู่ระบบด้วย Provider ID"
            : "เข้าสู่ระบบด้วย Provider ID เพื่อดูรายชื่อและดาวน์โหลด Excel"
        }
        error={initialError}
      />
      <Link
        href={nextRequiresLogin ? "/" : next}
        className="text-xs text-brand-700 underline-offset-2 hover:underline dark:text-brand-300"
      >
        {nextRequiresLogin
          ? "กลับหน้าแรกโดยไม่เข้าสู่ระบบ"
          : "กลับไปหน้าเดิมโดยไม่เข้าสู่ระบบ"}
      </Link>
    </div>
  );
}
