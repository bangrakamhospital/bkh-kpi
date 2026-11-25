import "server-only";

import { ErpDbError, erpQuery } from "./db";
import { ErpError, type ErpActor } from "./gate";
import type { DocType } from "./types";

/**
 * Idempotent "create" (requisition / receipt / adjustment). The client
 * generates one UUID per form submission (crypto.randomUUID()) and sends
 * it as `idempotencyKey`; document.idempotency_key is UNIQUE (migration
 * 002). A retry / double click with the same key returns the document of
 * the first request instead of creating a second one. Two concurrent
 * requests with the same key: the loser hits the unique constraint
 * (its transaction rolls back) and then replays the winner's document.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseIdempotencyKey(value: unknown): string {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new ErpError(400, "idempotencyKey ไม่ถูกต้อง (ต้องเป็น UUID)");
  }
  return value.toLowerCase();
}

export interface KeyedDoc {
  id: number;
  doc_no: string | null;
  doc_type: string;
  created_by: string;
}

async function findByKey(key: string): Promise<KeyedDoc | null> {
  const [row] = await erpQuery<KeyedDoc>(
    `SELECT id, doc_no, doc_type, created_by FROM document WHERE idempotency_key = $1::uuid`,
    [key],
  );
  return row ?? null;
}

function checkOwner(a: ErpActor, row: KeyedDoc, docType: DocType) {
  // Same key from another user / for another kind of document: refuse
  // (never leak someone else's document).
  if (row.created_by !== a.sub || row.doc_type !== docType) {
    throw new ErpError(409, "idempotencyKey นี้ถูกใช้แล้ว กรุณาโหลดหน้าใหม่");
  }
}

export async function idempotentCreate<T>(
  a: ErpActor,
  key: string,
  docType: DocType,
  create: () => Promise<T>,
  replay: (row: KeyedDoc) => Promise<T>,
): Promise<T> {
  const existing = await findByKey(key);
  if (existing) {
    checkOwner(a, existing, docType);
    return replay(existing);
  }
  try {
    return await create();
  } catch (err) {
    if (err instanceof ErpDbError && err.code === "23505" && err.constraint === "document_idempotency_key_uniq") {
      const row = await findByKey(key);
      if (row) {
        checkOwner(a, row, docType);
        return replay(row);
      }
    }
    throw err;
  }
}
