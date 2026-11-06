"use client";

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { MeResponse } from "@/lib/auth/types";

/**
 * Client-side login state, loaded from GET /api/auth/me after hydration so
 * that pages stay in the static shell (no cookies() during render).
 * This is UI state only — every protected route handler re-checks the
 * session itself.
 */

export type AuthStatus = "loading" | "in" | "out";

export type LoginResult = { ok: true } | { ok: false; error: string };

interface AuthContextValue {
  status: AuthStatus;
  displayName: string | null;
  login: (username: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  /** Call when a protected API answered 401 (session expired). */
  markLoggedOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const GENERIC_ERROR = "ไม่สามารถเข้าสู่ระบบได้ กรุณาลองใหม่";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/me", { cache: "no-store", signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<MeResponse>) : null))
      .then((me) => {
        setStatus(me?.loggedIn ? "in" : "out");
        setDisplayName(me?.loggedIn ? me.displayName : null);
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("out");
      });
    return () => controller.abort();
  }, []);

  const login = useCallback(
    async (username: string, password: string): Promise<LoginResult> => {
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as
          | (Partial<MeResponse> & { error?: string })
          | null;
        if (res.ok && json?.loggedIn) {
          setStatus("in");
          setDisplayName(json.displayName ?? null);
          return { ok: true };
        }
        return { ok: false, error: json?.error ?? GENERIC_ERROR };
      } catch {
        return { ok: false, error: GENERIC_ERROR };
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", cache: "no-store" });
    } finally {
      setStatus("out");
      setDisplayName(null);
    }
  }, []);

  const markLoggedOut = useCallback(() => {
    setStatus("out");
    setDisplayName(null);
  }, []);

  const value = useMemo(
    () => ({ status, displayName, login, logout, markLoggedOut }),
    [status, displayName, login, logout, markLoggedOut],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const ctx = use(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
