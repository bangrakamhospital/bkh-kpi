import { connection } from "next/server";

import { listDepartments } from "@/lib/departments/store";
import type { DepartmentsResponse } from "@/lib/departments/types";
import { logStoreError } from "@/lib/users/policy";

/**
 * GET /api/departments (public, no login) -> 200 DepartmentsResponse
 *   { departments: [{ id, name, color, codes }] } in display order.
 * View filter for the home page only (no permission effect, no patient
 * data). Read per request (one stat() thanks to the store cache) and sent
 * with `no-store` so admin edits show up immediately; the home page loads
 * it client-side, so its static shell / PPR is unaffected.
 * 503 { error } when departments.json is unreadable (UI shows no chips).
 */
export async function GET(): Promise<Response> {
  // Never prerendered at build time (Cache Components).
  await connection();
  try {
    const body: DepartmentsResponse = { departments: await listDepartments() };
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logStoreError(err);
    return Response.json(
      { error: "ไม่สามารถโหลดรายการแผนกได้ในขณะนี้" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
