import "server-only";

import { erpQuery } from "./db";
import type { AuditLogRow } from "./types";

export const AUDIT_LIMIT = 2000;

/** Audit rows of a date range (Bangkok dates, inclusive), newest first. */
export async function listAuditLog(f: {
  from: string;
  to: string;
  entity: string | null;
}): Promise<{ rows: AuditLogRow[]; truncated: boolean }> {
  const rows = await erpQuery<{
    id: number;
    occurred_at: string;
    actor_name: string;
    action: string;
    entity: string;
    entity_id: string | null;
    detail: string;
    ip: string | null;
  }>(
    `SELECT id, occurred_at, actor_name, action, entity, entity_id, detail::text AS detail, ip
       FROM audit_log
      WHERE occurred_at >= $1::date
        AND occurred_at < $2::date + 1
        AND ($3::text IS NULL OR entity = $3)
      ORDER BY occurred_at DESC, id DESC
      LIMIT ${AUDIT_LIMIT + 1}`,
    [f.from, f.to, f.entity],
  );
  return {
    truncated: rows.length > AUDIT_LIMIT,
    rows: rows.slice(0, AUDIT_LIMIT).map((r) => ({
      id: r.id,
      occurredAt: r.occurred_at,
      actorName: r.actor_name,
      action: r.action,
      entity: r.entity,
      entityId: r.entity_id,
      detail: r.detail,
      ip: r.ip,
    })),
  };
}
