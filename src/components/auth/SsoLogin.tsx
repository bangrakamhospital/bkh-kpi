"use client";

import { useEffect, useId, useState } from "react";
import Image from "next/image";
import { getProviders, signIn } from "next-auth/react";
import { AlertTriangle, Loader2, LogIn } from "lucide-react";
import { AUTH_DISABLED_MESSAGE } from "@/lib/auth/messages";
import { SSO_PROVIDER_ID as SSO_ID } from "@/lib/auth/sso-id";

// Shared across mounts: /api/auth/providers is fetched once per page load.
let providersPromise: Promise<boolean> | null = null;
function ssoAvailable(): Promise<boolean> {
  providersPromise ??= getProviders()
    .then((p) => Boolean(p && SSO_ID in p))
    .catch(() => {
      providersPromise = null; // allow a retry on the next mount
      return false;
    });
  return providersPromise;
}

const iconCls = "h-4 w-4 shrink-0";

/**
 * Login with Provider ID (PLK Health ID SSO) — the only sign-in method.
 * Full-page redirect to the IdP; afterwards the browser returns to
 * `callbackUrl` (default: the current page).
 */
export function SsoLogin({
  callbackUrl,
  description,
  error = null,
  onBeforeRedirect,
}: {
  callbackUrl?: string;
  description?: string;
  /** E.g. from /login?error=&code= after an Auth.js redirect. */
  error?: string | null;
  /** Runs right before the full-page redirect (e.g. remember a pending action). */
  onBeforeRedirect?: () => void;
}) {
  const id = useId();
  const [state, setState] = useState<"loading" | "ready" | "off">("loading");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let alive = true;
    void ssoAvailable().then((ok) => alive && setState(ok ? "ready" : "off"));
    return () => {
      alive = false;
    };
  }, []);

  const message = state === "off" ? AUTH_DISABLED_MESSAGE : error;

  return (
    <div
      className="w-full max-w-sm space-y-3"
      aria-describedby={description ? `${id}-desc` : undefined}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-800 dark:bg-brand-900 dark:text-brand-200">
          <LogIn aria-hidden="true" className={iconCls} />
        </span>
        <h2 className="text-base font-bold">เข้าสู่ระบบ</h2>
      </div>
      {description && (
        <p id={`${id}-desc`} className="text-xs text-zinc-700 dark:text-zinc-300">
          {description}
        </p>
      )}
      {message && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          <AlertTriangle aria-hidden="true" className={`${iconCls} mt-0.5`} />
          {message}
        </p>
      )}
      <button
        type="button"
        disabled={state !== "ready" || pending}
        aria-busy={state === "loading" || pending}
        onClick={() => {
          setPending(true);
          onBeforeRedirect?.();
          void signIn(SSO_ID, {
            redirectTo: callbackUrl ?? window.location.href,
          }).catch(() => setPending(false));
        }}
        className="flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-zinc-300 bg-white text-sm font-semibold text-zinc-800 shadow-sm hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state === "loading" ? (
          <Loader2 aria-hidden="true" className={`${iconCls} animate-spin`} />
        ) : (
          <Image
            src="/provider-id.png"
            alt=""
            width={80}
            height={32}
            className={`h-8 w-20 object-contain ${pending ? "animate-pulse" : ""}`}
          />
        )}
        {pending ? "กำลังไปที่ Provider ID..." : "เข้าสู่ระบบด้วย Provider ID"}
      </button>
    </div>
  );
}
