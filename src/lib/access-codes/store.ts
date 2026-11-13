import "server-only";

import { randomBytes } from "node:crypto";

import { DataStoreError, jsonFile } from "../data/json-store";
import {
  generateAccessCode,
  hashAccessCode,
  hashesEqual,
  normalizeAccessCode,
} from "./code";
import type { AccessCodeActor, AccessCodeStatus } from "./types";

/**
 * Access-code store: ${KPI_DATA_DIR || <cwd>/data}/access-codes.json on
 * top of src/lib/data/json-store.ts (same as users.json: mutex, atomic
 * writes, 0600, corrupt file -> DataStoreError, never overwritten; the
 * HIS database is read-only).
 *
 * Records are never deleted: a revoked / expired code stays for the audit
 * trail. Holds only an HMAC of the code (src/lib/access-codes/code.ts).
 */

export { DataStoreError as AccessCodeStoreError };

export interface AccessCodeRecord {
  id: string;
  name: string;
  org: string;
  /** HMAC-SHA256 hex of the normalised code. */
  hash: string;
  createdAt: string;
  createdBy: AccessCodeActor;
  expiresAt: string;
  lastUsedAt: string | null;
  useCount: number;
  revokedAt: string | null;
  revokedBy: AccessCodeActor | null;
}

const FILE_VERSION = 1;
const MAX_RECORDS = 1000;
const ID_RE = /^ac-[A-Za-z0-9_-]{12}$/;
const HASH_RE = /^[0-9a-f]{64}$/;

export function isValidAccessCodeId(id: string): boolean {
  return ID_RE.test(id);
}

export function accessCodeStatus(
  r: Pick<AccessCodeRecord, "expiresAt" | "revokedAt">,
  now: number = Date.now(),
): AccessCodeStatus {
  if (r.revokedAt) return "revoked";
  if (Date.parse(r.expiresAt) <= now) return "expired";
  return "active";
}

// ------------------------------------------------------------- file I/O

const isStr = (v: unknown): v is string => typeof v === "string";
const isIso = (v: unknown): v is string =>
  isStr(v) && !Number.isNaN(Date.parse(v));

function parseActor(v: unknown): AccessCodeActor | null | undefined {
  if (v === null || v === undefined) return null;
  if (typeof v !== "object") return undefined;
  const a = v as Record<string, unknown>;
  if (!isStr(a.sub) || !isStr(a.name)) return undefined;
  return { sub: a.sub, name: a.name };
}

function parseRecord(v: unknown): AccessCodeRecord | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const createdBy = parseActor(r.createdBy);
  const revokedBy = parseActor(r.revokedBy);
  if (
    !isStr(r.id) ||
    !ID_RE.test(r.id) ||
    !isStr(r.name) ||
    !isStr(r.org) ||
    !isStr(r.hash) ||
    !HASH_RE.test(r.hash) ||
    !isIso(r.createdAt) ||
    !createdBy ||
    !isIso(r.expiresAt) ||
    !(r.lastUsedAt === null || isIso(r.lastUsedAt)) ||
    typeof r.useCount !== "number" ||
    !Number.isSafeInteger(r.useCount) ||
    r.useCount < 0 ||
    !(r.revokedAt === null || isIso(r.revokedAt)) ||
    revokedBy === undefined
  ) {
    return null;
  }
  return {
    id: r.id,
    name: r.name,
    org: r.org,
    hash: r.hash,
    createdAt: r.createdAt,
    createdBy,
    expiresAt: r.expiresAt,
    lastUsedAt: r.lastUsedAt,
    useCount: r.useCount,
    revokedAt: r.revokedAt,
    revokedBy,
  };
}

function parseFile(text: string): AccessCodeRecord[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new DataStoreError("access-codes.json is not valid JSON");
  }
  const root = json as { version?: unknown; codes?: unknown } | null;
  if (!root || root.version !== FILE_VERSION || !Array.isArray(root.codes)) {
    throw new DataStoreError("access-codes.json has an unknown format");
  }
  const seen = new Set<string>();
  return root.codes.map((raw, i) => {
    const rec = parseRecord(raw);
    if (!rec) throw new DataStoreError(`access-codes.json: invalid record #${i}`);
    if (seen.has(rec.id)) {
      throw new DataStoreError(`access-codes.json: duplicate id #${i}`);
    }
    seen.add(rec.id);
    return rec;
  });
}

const file = jsonFile<AccessCodeRecord[]>({
  fileName: "access-codes.json",
  parse: parseFile,
  serialize: (codes) => ({ version: FILE_VERSION, codes }),
  initial: () => [],
  maxBytes: 2 * 1024 * 1024,
});

export function accessCodeStorePath(): string {
  return file.path();
}

export function resetAccessCodeStoreCache() {
  file.resetCache();
}

// ----------------------------------------------------------- operations

/** Newest first. */
export async function listAccessCodes(): Promise<AccessCodeRecord[]> {
  const codes = await file.read();
  return codes.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function getAccessCode(id: string): Promise<AccessCodeRecord | null> {
  if (!ID_RE.test(id)) return null;
  const codes = await file.read();
  return codes.find((c) => c.id === id) ?? null;
}

export type CreateAccessCodeResult =
  | { ok: true; record: AccessCodeRecord; plaintext: string }
  | { ok: false; error: "too_many" };

export function createAccessCode(
  input: { name: string; org: string; expiresAt: string },
  actor: AccessCodeActor,
  now: Date = new Date(),
): Promise<CreateAccessCodeResult> {
  return file.mutate<CreateAccessCodeResult>((codes) => {
    if (codes.length >= MAX_RECORDS) {
      return { result: { ok: false, error: "too_many" }, changed: false };
    }
    let plaintext = "";
    let hash = "";
    // 80-bit codes: a collision is practically impossible, but never reuse.
    do {
      plaintext = generateAccessCode();
      hash = hashAccessCode(normalizeAccessCode(plaintext) ?? "");
    } while (codes.some((c) => c.hash === hash));
    let id = "";
    do {
      id = `ac-${randomBytes(9).toString("base64url")}`;
    } while (codes.some((c) => c.id === id));
    const record: AccessCodeRecord = {
      id,
      name: input.name,
      org: input.org,
      hash,
      createdAt: now.toISOString(),
      createdBy: { sub: actor.sub, name: actor.name },
      expiresAt: input.expiresAt,
      lastUsedAt: null,
      useCount: 0,
      revokedAt: null,
      revokedBy: null,
    };
    codes.push(record);
    return {
      result: { ok: true, record: structuredClone(record), plaintext },
      changed: true,
    };
  });
}

export type RevokeAccessCodeResult =
  | { ok: true; record: AccessCodeRecord; changed: boolean }
  | { ok: false; error: "not_found" };

export function revokeAccessCode(
  id: string,
  actor: AccessCodeActor,
  now: Date = new Date(),
): Promise<RevokeAccessCodeResult> {
  return file.mutate<RevokeAccessCodeResult>((codes) => {
    const rec = codes.find((c) => c.id === id);
    if (!rec) return { result: { ok: false, error: "not_found" }, changed: false };
    if (rec.revokedAt) {
      return {
        result: { ok: true, record: structuredClone(rec), changed: false },
        changed: false,
      };
    }
    rec.revokedAt = now.toISOString();
    rec.revokedBy = { sub: actor.sub, name: actor.name };
    return {
      result: { ok: true, record: structuredClone(rec), changed: true },
      changed: true,
    };
  });
}

export type VerifyAccessCodeResult =
  | { ok: true; record: AccessCodeRecord }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "expired" | "revoked"; record: AccessCodeRecord };

/**
 * Login check: normalise + HMAC the typed code, compare with EVERY stored
 * hash in constant time, then check revoked / expired. A successful login
 * updates lastUsedAt / useCount (file written only then).
 */
export function verifyAccessCode(
  input: string,
  now: Date = new Date(),
): Promise<VerifyAccessCodeResult> {
  const normalized = normalizeAccessCode(input);
  // Hash anyway so malformed input costs the same as a wrong code.
  const hash = hashAccessCode(normalized ?? "0".repeat(16));
  return file.mutate<VerifyAccessCodeResult>((codes) => {
    let match: AccessCodeRecord | undefined;
    for (const c of codes) {
      if (hashesEqual(c.hash, hash) && normalized !== null) match = c;
    }
    if (!match) return { result: { ok: false, reason: "invalid" }, changed: false };
    const status = accessCodeStatus(match, now.getTime());
    if (status !== "active") {
      return {
        result: { ok: false, reason: status, record: structuredClone(match) },
        changed: false,
      };
    }
    match.lastUsedAt = now.toISOString();
    match.useCount = Math.min(match.useCount + 1, Number.MAX_SAFE_INTEGER);
    return { result: { ok: true, record: structuredClone(match) }, changed: true };
  });
}
