import { readJsonBody } from "@/lib/auth/admin-gate";
import { erpGate, erpHandle, erpJson } from "@/lib/erp/gate";
import { parseReceiptBody } from "@/lib/erp/lookups";
import { postReceipt } from "@/lib/erp/stock";

const MAX_BODY = 64 * 1024;

/**
 * POST /api/erp/stock/receipts body ReceiptInput
 *   -> 201 PostedDocResponse { id, docNo, movements }
 * Same idempotencyKey again -> 200 { ..., replayed: true } (nothing new).
 * รับของเข้าคลัง (store officer of body.storeId): one RECEIPT document;
 * stock + moving average updated in the same transaction.
 */
export async function POST(request: Request): Promise<Response> {
  const route = "api/erp/stock/receipts";
  const gate = await erpGate(request, route, { mutation: true });
  if (!gate.ok) return gate.response;
  return erpHandle(route, async () => {
    const input = parseReceiptBody(await readJsonBody(request, MAX_BODY));
    const res = await postReceipt(gate.actor, input);
    return erpJson(res, res.replayed ? 200 : 201);
  });
}
