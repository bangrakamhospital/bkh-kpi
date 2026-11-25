import "server-only";

import type { Queryable } from "./db";
import type { ErpActor } from "./gate";

/**
 * ERP audit trail: one row in erp.audit_log (append-only, written in the
 * SAME transaction as the change, so a change without its audit row
 * cannot commit). No stdout line: it would be printed
 * before COMMIT and could describe a change that was rolled back.
 * `detail` holds ids / codes / quantities only — no personal data beyond
 * the staff identity already stored on the row.
 */
export async function erpAudit(
  tx: Queryable,
  actor: ErpActor,
  action: string,
  entity: string,
  entityId: number | string | null,
  detail: Record<string, unknown> = {},
): Promise<void> {
  await tx.query(
    `INSERT INTO audit_log (actor_sub, actor_name, action, entity, entity_id, detail, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
    [
      actor.sub,
      actor.name.slice(0, 200),
      action,
      entity,
      entityId === null ? null : String(entityId),
      JSON.stringify(detail),
      actor.meta.ip === "unknown" ? null : actor.meta.ip,
      actor.meta.userAgent || null,
    ],
  );
}
