"use client";

import { useCallback, useMemo } from "react";
import { SessionProvider, signOut, useSession } from "next-auth/react";

/**
 * Client-side login state from Auth.js (`SessionProvider` fetches
 * /api/auth/session after hydration, so pages stay in the static shell —
 * no cookies() during render). UI state only: every protected route
 * handler re-checks the session with `auth()`.
 *
 * `useAuth()` keeps the small API used by the dashboard components.
 * Sign-in itself is a full-page SSO redirect (components/auth/SsoLogin.tsx).
 */

export type AuthStatus = "loading" | "in" | "out";

interface AuthState {
  status: AuthStatus;
  displayName: string | null;
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
    () => ({ status: mapped, displayName, logout, markLoggedOut }),
    [mapped, displayName, logout, markLoggedOut],
  );
}
