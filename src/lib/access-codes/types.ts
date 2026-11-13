/**
 * Access codes ("รหัสลับ") for EXTERNAL AUDITORS. Pure module (types +
 * constants), safe on client and server.
 *
 * An admin issues one code per auditor at /admin/access-codes. The
 * plaintext is shown ONCE at creation; only an HMAC of it is stored
 * (data/access-codes.json, src/lib/access-codes/store.ts). A signed-in
 * auditor has the same access as an approved staff user (role "user",
 * never admin) until the code expires or is revoked.
 *
 * Contract:
 *   GET    /api/admin/access-codes        -> 200 AccessCodesResponse
 *   POST   /api/admin/access-codes        -> 201 AccessCodeCreateResponse
 *   DELETE /api/admin/access-codes/{id}   -> 200 AccessCodeResponse (revoked,
 *                                            record kept for the audit trail)
 *   errors                                -> { error: "<thai>" }
 */

/** Auth.js provider id of the access-code Credentials provider. */
export const ACCESS_CODE_PROVIDER_ID = "access-code";

/** Session username = `${ACCESS_CODE_USERNAME_PREFIX}${record id}`. */
export const ACCESS_CODE_USERNAME_PREFIX = "access-code:";

export const ACCESS_CODE_DEFAULT_DAYS = 7;
export const ACCESS_CODE_MAX_DAYS = 90;
export const ACCESS_CODE_NAME_MAX = 100;
export const ACCESS_CODE_ORG_MAX = 120;

/** Characters of a code as typed (16 base32 symbols + 3 dashes, spaces allowed). */
export const ACCESS_CODE_INPUT_MAX = 40;

export type AccessCodeStatus = "active" | "expired" | "revoked";

export interface AccessCodeActor {
  sub: string;
  name: string;
}

/** API / UI shape of a code record (never the hash or the plaintext). */
export interface AccessCodeView {
  id: string;
  /** Auditor's name. */
  name: string;
  /** Auditor's organisation. */
  org: string;
  createdAt: string;
  createdBy: AccessCodeActor;
  /** ISO 8601: end of the chosen expiry day (Asia/Bangkok). */
  expiresAt: string;
  lastUsedAt: string | null;
  useCount: number;
  revokedAt: string | null;
  revokedBy: AccessCodeActor | null;
  /** Computed at response time. */
  status: AccessCodeStatus;
}

export interface AccessCodesResponse {
  /** Newest first. */
  codes: AccessCodeView[];
}

export interface AccessCodeCreate {
  name: string;
  org: string;
  /** YYYY-MM-DD (Asia/Bangkok), today .. today + ACCESS_CODE_MAX_DAYS. */
  expiresOn: string;
}

export interface AccessCodeCreateResponse {
  code: AccessCodeView;
  /** Plaintext code, e.g. "7K3M-QX9P-2HDT-WV8R". Returned only here, once. */
  plaintext: string;
}

export interface AccessCodeResponse {
  code: AccessCodeView;
}

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Today's date (YYYY-MM-DD) in Asia/Bangkok (UTC+7, no DST). */
export function bangkokToday(now: Date = new Date()): string {
  return new Date(now.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

/** `ymd` + `days` (YYYY-MM-DD, calendar arithmetic). */
export function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Expiry of a code chosen for Bangkok day `ymd`: the end of that day, but
 * never more than ACCESS_CODE_MAX_DAYS x 24 h from `now` (so picking the
 * last allowed day ends at the current time of day, not at midnight).
 * Used by the server (authoritative) and the admin form (preview).
 */
export function accessCodeExpiry(ymd: string, now: Date = new Date()): string {
  const cap = now.getTime() + ACCESS_CODE_MAX_DAYS * 24 * 60 * 60 * 1000;
  const end = Date.parse(endOfBangkokDay(ymd));
  return new Date(Math.min(end, cap)).toISOString();
}

/** Last millisecond of a Bangkok calendar day, as ISO 8601 UTC. */
export function endOfBangkokDay(ymd: string): string {
  return new Date(
    Date.parse(`${ymd}T23:59:59.999Z`) - BANGKOK_OFFSET_MS,
  ).toISOString();
}
