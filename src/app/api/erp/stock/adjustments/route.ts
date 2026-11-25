import { readJsonBody } from "@/lib/auth/admin-gate";
import { createAdjustment, listAdjustments, parseAdjustmentBody } from "@/lib/erp/adjustments";
import { erpGate, erpHandle, erpJson, parseId } from "@/lib/erp/gate";

const MAX_BODY = 4 * 1024;

/**
 * GET  /api/erp/stock/adjustments?status=submitted|all&storeId=
 *   -> 200 { rows: AdjustmentRow[], total } (store officers: their stores;
 *   finance / director / erp_admin: every store)
 * POST /api/erp/stock/adjustments body AdjustmentInput
 *   -> 201 PostedDocResponse (status submitted, NO stock change yet; posts
 *   when finance / director approves). Replay of the same idempotencyKey
 *   -> 200 { ..., replayed: true }.
 *   409 stale_count (system balance differs from expectedQty), count equal
 *   to the balance, decrease larger than the stock. Store officer only.
 */
export async function GET(request: Request): Promise<Response> {
  const route = "api/erp/stock/adjustments";
  const gate = await erpGate(request, route);
  if (!gate.ok) return gate.response;
  const q = new URL(request.url).searchParams;
  return erpHandle(route, async () =>
    erpJson(
      await listAdjustments(gate.actor, {
        status: q.get("status") === "all" ? null : "submitted",
        storeId: parseId(q.get("storeId")),
      }),
    ),
  );
}

export async function POST(request: Request): Promise<Response> {
  const route = "api/erp/stock/adjustments";
  const gate = await erpGate(request, route, { mutation: true });
  if (!gate.ok) return gate.response;
  return erpHandle(route, async () => {
    const input = parseAdjustmentBody(await readJsonBody(request, MAX_BODY));
    const res = await createAdjustment(gate.actor, input);
    return erpJson(res, res.replayed ? 200 : 201);
  });
}
