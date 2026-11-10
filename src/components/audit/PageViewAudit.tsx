import { connection } from "next/server";
import { Suspense } from "react";

import { recordPageView } from "@/lib/audit/page-view";

type SearchParams = Record<string, string | string[] | undefined>;

async function Recorder({
  path,
  searchParams,
}: {
  path: string;
  searchParams?: Promise<SearchParams>;
}) {
  // Request time only: auth() / crypto must not run during prerender.
  await connection();
  await recordPageView(path, searchParams ? await searchParams : undefined);
  return null;
}

/**
 * Server-only page-view audit (renders nothing). A request-time hole in
 * its own <Suspense>: the static shell stays prerendered and prefetches
 * never run it. See src/lib/audit/page-view.ts.
 */
export function PageViewAudit(props: {
  path: string;
  searchParams?: Promise<SearchParams>;
}) {
  return (
    <Suspense fallback={null}>
      <Recorder {...props} />
    </Suspense>
  );
}
