import "server-only";

import { redirect } from "next/navigation";

import { hasApprovedSession } from "@/lib/auth/guard";
import { loginRedirectPath } from "@/lib/auth/protected-paths";

type SearchParams = Record<string, string | string[] | undefined>;

function withQuery(path: string, params: SearchParams | undefined): string {
  if (!params) return path;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) qs.append(key, v);
  }
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

/**
 * Server gate for login-required pages (src/lib/auth/protected-paths.ts).
 * Renders `children` (the page's data component) only for an approved
 * session; otherwise redirects to /login?callbackUrl=<path?query>, so the
 * data component never runs and no KPI data is streamed.
 *
 * Defense in depth: src/proxy.ts already answers 307 before rendering.
 * Place it INSIDE the page's <Suspense> (it reads the request) and outside
 * any "use cache" scope; the cached data functions below stay cached.
 */
export async function RequireLogin({
  path,
  searchParams,
  children,
}: {
  path: string;
  searchParams?: Promise<SearchParams>;
  children: React.ReactNode;
}) {
  if (!(await hasApprovedSession())) {
    redirect(
      loginRedirectPath(
        withQuery(path, searchParams ? await searchParams : undefined),
      ),
    );
  }
  return <>{children}</>;
}
