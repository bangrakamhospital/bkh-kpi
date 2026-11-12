import "server-only";

import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";

import { auth, sessionUser } from "@/auth";
import { auditPageView } from "@/lib/auth/audit";
import { requestMeta } from "@/lib/auth/request";
import { isAuthConfigured } from "@/lib/auth/settings";

/**
 * Page-view audit for logged-in users, called from <PageViewAudit> (a
 * dynamic hole inside <Suspense>) of /, /hospital, /district and /admin/*.
 *
 * Why there and not in proxy.ts: with Cache Components + Partial
 * Prefetching a <Link> prefetch only downloads the static App Shell, so a
 * request-time hole renders only on a real document load or navigation —
 * prefetches, static assets and _next/* never reach it. Proxy would see
 * every prefetch and Next.js strips the RSC / prefetch headers there.
 * Anonymous visitors are not logged (failed logins are, in src/auth.ts).
 *
 * Noise filter: the same user + path + query within DEDUPE_MS (refresh,
 * router.refresh, tab switching back) is recorded once.
 */

const DEDUPE_MS = 60_000;
const MAX_KEYS = 2000;

/** Query parameters worth keeping (non-identifying). Anything else is dropped. */
const QUERY_ALLOW: Record<string, RegExp> = {
  fy: /^\d{4}$/,
  code: /^[A-Za-z0-9_.:-]{1,40}$/,
  // "/" service overview range picker
  preset: /^[a-z0-9]{1,10}$/,
  from: /^\d{4}-\d{2}-\d{2}$/,
  to: /^\d{4}-\d{2}-\d{2}$/,
};

type SearchParams = Record<string, string | string[] | undefined>;

const globalPv = globalThis as unknown as { __kpiPageViews?: Map<string, number> };
const recent: Map<string, number> = (globalPv.__kpiPageViews ??= new Map());

export function allowedQuery(params: SearchParams | undefined): string {
  if (!params) return "";
  const q = new URLSearchParams();
  for (const [key, re] of Object.entries(QUERY_ALLOW)) {
    const raw = params[key];
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (typeof v === "string" && re.test(v)) q.set(key, v);
  }
  return q.toString();
}

function isDuplicate(key: string, now: number): boolean {
  if (recent.size > MAX_KEYS) {
    for (const [k, t] of recent) if (now - t >= DEDUPE_MS) recent.delete(k);
    if (recent.size > MAX_KEYS) recent.clear();
  }
  const last = recent.get(key);
  if (last !== undefined && now - last < DEDUPE_MS) return true;
  recent.set(key, now);
  return false;
}

export async function recordPageView(
  path: string,
  searchParams?: SearchParams,
): Promise<void> {
  try {
    if (!isAuthConfigured()) return;
    const h = await headers();
    const user = sessionUser(await auth());
    if (!user) return;
    const query = allowedQuery(searchParams);
    if (isDuplicate(`${user.username}\u0000${path}\u0000${query}`, Date.now())) {
      return;
    }
    auditPageView({
      actor: user.username,
      actorName: user.name,
      path,
      query,
      meta: requestMeta(h),
    });
  } catch (err) {
    // Next.js control-flow errors (dynamic / prerender bail-out) propagate.
    unstable_rethrow(err);
    console.error(
      `[audit] page view not recorded (${err instanceof Error ? err.name : "error"})`,
    );
  }
}
