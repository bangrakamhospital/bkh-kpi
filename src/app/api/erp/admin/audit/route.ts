import { todayIsoDate } from "@/lib/kpi/fiscal-year";
import { ErpError, erpAdminGate, erpHandle, erpJson } from "@/lib/erp/gate";
import { listAuditLog } from "@/lib/erp/audit-view";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function validDate(v: string | null): string | null {
  if (!v || !DATE_RE.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v;
}

/**
 * GET /api/erp/admin/audit?from=&to=&entity=
 *   -> 200 { rows: AuditLogRow[], truncated, from, to } (newest first, LIMIT 2000)
 * Default range: last 7 days; at most 366 days. erp_admin / web-app admin only.
 */
export async function GET(request: Request): Promise<Response> {
  const route = "api/erp/admin/audit";
  const gate = await erpAdminGate(request, route);
  if (!gate.ok) return gate.response;
  const q = new URL(request.url).searchParams;
  return erpHandle(route, async () => {
    const to = validDate(q.get("to")) ?? todayIsoDate();
    const from =
      validDate(q.get("from")) ??
      new Date(Date.parse(`${to}T00:00:00Z`) - 7 * DAY_MS).toISOString().slice(0, 10);
    const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS;
    if (span < 0) throw new ErpError(400, "วันที่เริ่มต้องไม่หลังวันที่สิ้นสุด");
    if (span > 366) throw new ErpError(400, "เลือกช่วงวันที่ได้ไม่เกิน 1 ปี");
    const entityRaw = (q.get("entity") ?? "").trim();
    if (entityRaw.length > 50) throw new ErpError(400, "ชนิดข้อมูลไม่ถูกต้อง");
    return erpJson({ ...(await listAuditLog({ from, to, entity: entityRaw || null })), from, to });
  });
}
