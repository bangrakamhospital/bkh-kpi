import type { NextRequest } from "next/server";

import { readSession } from "@/lib/auth/guard";
import { authJson } from "@/lib/auth/request";
import type { MeResponse } from "@/lib/auth/types";

/**
 * GET /api/auth/me -> { loggedIn, displayName } only (never loginname,
 * expiry or anything else from the session). Reads the request cookie,
 * so it always runs at request time; `private, no-store`.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const session = readSession(request);
  const body: MeResponse = session
    ? { loggedIn: true, displayName: session.displayName }
    : { loggedIn: false, displayName: null };
  return authJson(body);
}
