"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2, LogIn, LogOut, Settings, UserCircle2 } from "lucide-react";
import { useAuth } from "./AuthProvider";

const pillClass =
  "inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-60";
const iconCls = "h-4 w-4 shrink-0";

/** Login state in the page header (client-only; keeps the page static). */
export function HeaderAuth() {
  const { status, displayName, logout } = useAuth();
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin =
    (session?.user as { role?: unknown } | undefined)?.role === "admin";
  const [busy, setBusy] = useState(false);

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
