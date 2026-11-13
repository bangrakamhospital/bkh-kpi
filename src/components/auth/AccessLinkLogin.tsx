"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  ACCESS_CODE_INPUT_MAX,
  ACCESS_CODE_PROVIDER_ID,
} from "@/lib/access-codes/types";
import { loginErrorMessage } from "@/lib/auth/messages";
import { safeNextPath } from "@/lib/auth/redirect";

const iconCls = "h-4 w-4 shrink-0";
const DEFAULT_TARGET = "/hospital";
const CONTACT_ADMIN = "กรุณาติดต่อผู้ดูแลระบบเพื่อขอลิงก์ใหม่";
const INVALID_LINK = "ลิงก์ไม่ถูกต้องหรือไม่ครบ";

type State = { kind: "working" } | { kind: "error"; message: string };

/**
 * External-auditor sign-in from the link issued at /admin/access-codes:
 *   ${origin}/access#<code>
 * The code is in the URL FRAGMENT (never sent to the server, proxy logs or
 * Referer). It is read once, stripped from the address bar / history
 * immediately, then posted to the Auth.js "access-code" Credentials
 * provider (CSRF token flow of next-auth/react signIn). No input field.
 */
export function AccessLinkLogin() {
  const router = useRouter();
  const started = useRef(false);
  const [state, setState] = useState<State>({ kind: "working" });

  useEffect(() => {
    // Once per page load (StrictMode re-runs effects; the hash is gone then).
    if (started.current) return;
    started.current = true;

    const raw = window.location.hash.slice(1);
    // Strip the fragment before anything else (history entry included).
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
    const target = safeNextPath(
      new URLSearchParams(window.location.search).get("callbackUrl") ??
        DEFAULT_TARGET,
    );

    let code = "";
    try {
      code = decodeURIComponent(raw).trim();
    } catch {
      code = "";
    }
    if (!code || code.length > ACCESS_CODE_INPUT_MAX) {
      // setState in a callback (not synchronously in the effect body).
      queueMicrotask(() => setState({ kind: "error", message: INVALID_LINK }));
      return;
    }

    signIn(ACCESS_CODE_PROVIDER_ID, {
      code,
      redirect: false,
      redirectTo: target,
    })
      .then((res) => {
        if (!res || res.error || !res.ok) {
          setState({
            kind: "error",
            message: loginErrorMessage(res?.error ?? "CredentialsSignin", res?.code),
          });
          return;
        }
        router.replace(target === "/" ? DEFAULT_TARGET : target);
      })
      .catch(() => {
        setState({
          kind: "error",
          message: loginErrorMessage("CredentialsSignin", "provider_unavailable"),
        });
      });
  }, [router]);

  if (state.kind === "working") {
    return (
      <p role="status" className="flex items-center gap-2 text-sm">
        <Loader2 aria-hidden="true" className={`${iconCls} animate-spin`} />
        กำลังตรวจสอบลิงก์สำหรับผู้ตรวจภายนอก...
      </p>
    );
  }

  return (
    <div className="w-full max-w-sm space-y-3">
      <p
        role="alert"
        className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
      >
        <AlertTriangle aria-hidden="true" className={`${iconCls} mt-0.5`} />
        <span>
          {state.message}
          <br />
          {CONTACT_ADMIN}
        </span>
      </p>
      <Link
        href="/"
        className="text-xs text-brand-700 underline-offset-2 hover:underline dark:text-brand-300"
      >
        กลับหน้าแรก
      </Link>
    </div>
  );
}
