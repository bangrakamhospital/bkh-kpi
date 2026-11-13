import "server-only";

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

/**
 * Access-code generation + hashing.
 *
 *  - Code: 16 symbols of Crockford base32 (no I, L, O, U) = 80 bits from
 *    the CSPRNG, shown as 4 groups: "7K3M-QX9P-2HDT-WV8R".
 *  - Input is normalised before hashing: upper-case, spaces / dashes
 *    removed, I/L -> 1, O -> 0 (common typing mistakes).
 *  - Stored value: HMAC-SHA256(key, normalised code), hex. The key is
 *    derived from AUTH_ACCESS_CODE_SECRET (optional, >= 32 chars) or
 *    AUTH_SECRET, so a leaked access-codes.json alone cannot be brute
 *    forced offline. Rotating that secret invalidates every issued code.
 *  - Comparison: timingSafeEqual over every stored hash (no early exit).
 */

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 16;
const GROUP = 4;
const MIN_SECRET = 32;
const KEY_LABEL = "bkh-kpi/access-code/v1";

export function generateAccessCode(): string {
  let raw = "";
  for (let i = 0; i < CODE_LENGTH; i++) raw += ALPHABET[randomInt(ALPHABET.length)];
  return formatCode(raw);
}

function formatCode(raw: string): string {
  const groups: string[] = [];
  for (let i = 0; i < raw.length; i += GROUP) groups.push(raw.slice(i, i + GROUP));
  return groups.join("-");
}

/** Canonical 16-symbol form, or null when the input cannot be a code. */
export function normalizeAccessCode(input: string): string | null {
  const s = input
    .toUpperCase()
    .replace(/[\s-]+/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0");
  if (s.length !== CODE_LENGTH) return null;
  for (const ch of s) if (!ALPHABET.includes(ch)) return null;
  return s;
}

let warnedShortSecret = false;

function hashKey(): Buffer | null {
  const own = process.env.AUTH_ACCESS_CODE_SECRET ?? "";
  if (own.length > 0 && own.length < MIN_SECRET && !warnedShortSecret) {
    warnedShortSecret = true;
    // Never log the value itself.
    console.warn(
      "[auth] AUTH_ACCESS_CODE_SECRET ignored: shorter than 32 characters; using AUTH_SECRET",
    );
  }
  const secret = own.length >= MIN_SECRET ? own : (process.env.AUTH_SECRET ?? "");
  if (secret.length < MIN_SECRET) return null;
  return createHmac("sha256", secret).update(KEY_LABEL).digest();
}

/** True when codes can be hashed (a secret of >= 32 chars is set). */
export function accessCodeHashingReady(): boolean {
  return hashKey() !== null;
}

/** HMAC (hex) of a NORMALISED code; throws when no secret is configured. */
export function hashAccessCode(normalized: string): string {
  const key = hashKey();
  if (!key) throw new Error("access code secret not configured");
  return createHmac("sha256", key).update(normalized).digest("hex");
}

/** Constant-time comparison of two hex HMACs. */
export function hashesEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length !== 32 || bb.length !== 32) return false;
  return timingSafeEqual(ba, bb);
}
