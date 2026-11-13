"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  BadgeCheck,
  Loader2,
  LogIn,
  LogOut,
  Settings,
  UserCircle2,
} from "lucide-react";
import {
  isLoginRequiredPath,
  loginRedirectPath,
} from "@/lib/auth/protected-paths";
import { useAuth } from "./AuthProvider";

const pillClass =
  "inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-60";
const iconCls = "h-4 w-4 shrink-0";

const expiryFmt = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** Access-code expiry (end of day, Bangkok) as a Thai date. */
function formatExpiry(iso: string): string | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : expiryFmt.format(d);
}

/** Login state in the page header (client-only; keeps the page static). */
export function HeaderAuth() {
  const { status, displayName, logout } = useAuth();
  const router = useRouter();
  const { data: session } = useSession();
  const sessionUser = session?.user as
    | { role?: unknown; provider?: unknown; auditorExpiresAt?: unknown }
    | undefined;
  const isAuditor = sessionUser?.provider === "access-code";
  const isAdmin = !isAuditor && sessionUser?.role === "admin";
  const auditorExpiry =
    isAuditor && typeof sessionUser?.auditorExpiresAt === "string"
      ? formatExpiry(sessionUser.auditorExpiresAt)
      : null;
  const [busy, setBusy] = useState(false);
  const pathname = usePathname();

  // Login-required page (/hospital, /pp) and the session ended in this tab
  // (logout, expiry, revoked approval): leave the page instead of keeping
  // the already-rendered KPI data on screen. The server gates (proxy.ts,
  // RequireLogin) decide access; this is UI only.
  useEffect(() => {
    if (status !== "out" || !isLoginRequiredPath(pathname)) return;
    router.replace(
      loginRedirectPath(`${window.location.pathname}${window.location.search}`),
    );
  }, [status, pathname, router]);

  if (status === "loading") {
    return (
      <span
        aria-hidden="true"
        className="h-8 w-28 animate-pulse rounded-full bg-white/15"
      />
    );
  }

  if (status === "out") {
    return (
      <button
        type="button"
        className={pillClass}
        onClick={() => {
          const callbackUrl = `${window.location.pathname}${window.location.search}`;
          router.push(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
        }}
      >
        <LogIn aria-hidden="true" className={iconCls} />
        เข้าสู่ระบบ
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <span className="inline-flex max-w-56 items-center gap-1.5 text-sm text-brand-50">
        <UserCircle2 aria-hidden="true" className={iconCls} />
        <span className="truncate" title={displayName ?? undefined}>
          {displayName}
        </span>
      </span>
      {isAuditor && (
        <span
          className="inline-flex items-center gap-1.5 rounded-full bg-amber-300 px-3 py-1 text-xs font-semibold text-amber-950"
          title="เข้าสู่ระบบด้วยลิงก์สำหรับผู้ตรวจภายนอก"
        >
          <BadgeCheck aria-hidden="true" className={iconCls} />
          ผู้ตรวจภายนอก
          {auditorExpiry && ` · ใช้ได้ถึง ${auditorExpiry}`}
        </span>
      )}
      {isAdmin && (
        <Link href="/admin/users" className={pillClass}>
          <Settings aria-hidden="true" className={iconCls} />
          จัดการระบบ
        </Link>
      )}
      <button
        type="button"
        disabled={busy}
        className={pillClass}
        onClick={async () => {
          setBusy(true);
          await logout();
          setBusy(false);
        }}
      >
        {busy ? (
          <Loader2 aria-hidden="true" className={`${iconCls} animate-spin`} />
        ) : (
          <LogOut aria-hidden="true" className={iconCls} />
        )}
        ออกจากระบบ
      </button>
    </div>
  );
}
