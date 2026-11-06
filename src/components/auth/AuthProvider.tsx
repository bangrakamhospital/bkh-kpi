"use client";

import { useCallback, useMemo } from "react";
import {
  SessionProvider,
  signIn,
  signOut,
  useSession,
} from "next-auth/react";
import { GENERIC_LOGIN_ERROR, loginErrorMessage } from "@/lib/auth/messages";

/**
 * Client-side login state from Auth.js (`SessionProvider` fetches
 * /api/auth/session after hydration, so pages stay in the static shell —
 * no cookies() during render). UI state only: every protected route
 * handler re-checks the session with `auth()`.
 *
 * `useAuth()` keeps the small API used by the dashboard components.
 */

export type AuthStatus = "loading" | "in" | "out";

export type LoginResult = { ok: true } | { ok: false; error: string };

interface AuthState {
  status: AuthStatus;
  displayName: string | null;
  login: (username: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  /** Call when a protected API answered 401 (session expired). */
  markLoggedOut: () => void;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider basePath="/api/auth" refetchOnWindowFocus>
      {children}
    </SessionProvider>
  );
}

export function useAuth(): AuthState {
  const { data, status } = useSession();
  const login = useCallback(
    async (username: string, password: string): Promise<LoginResult> => {
      try {
        const res = await signIn("credentials", {
          username,
          password,
          redirect: false,
        });
        if (!res) return { ok: false, error: GENERIC_LOGIN_ERROR };
        if (res.error) {
          return { ok: false, error: loginErrorMessage(res.error, res.code) };
        }
        return { ok: true };
      } catch {
        return { ok: false, error: GENERIC_LOGIN_ERROR };
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await signOut({ redirect: false });
    } catch {
      // Network error: the cookie may remain until it expires.
    }
  }, []);

  const markLoggedOut = useCallback(() => {
    // Clear the stale cookie; signOut also resyncs the shared session
    // state (SessionProvider) so every consumer switches to "out".
    void signOut({ redirect: false }).catch(() => {});
  }, []);

  const user = data?.user as { name?: unknown } | undefined;
  const mapped: AuthStatus =
    status === "loading" ? "loading" : status === "authenticated" ? "in" : "out";
  const displayName =
    mapped === "in" && typeof user?.name === "string" ? user.name : null;

  return useMemo(
    () => ({ status: mapped, displayName, login, logout, markLoggedOut }),
    [mapped, displayName, login, logout, markLoggedOut],
  );
}
