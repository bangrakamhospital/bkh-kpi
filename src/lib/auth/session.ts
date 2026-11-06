import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";

import type { AuthUser } from "@/lib/auth/types";

/**
 * Stateless session in an encrypted + authenticated cookie (AES-256-GCM,
 * key derived from AUTH_SECRET with HKDF-SHA256). No dependency needed.
 *
 * Payload: loginname, displayName, issued-at, expiry — nothing else.
 * Format: "v1.<iv b64url>.<ciphertext||tag b64url>".
 *
 * AUTH_SECRET missing or shorter than 32 chars -> auth is DISABLED:
 * no session can be created or read (no default / fallback secret).
 */

export const SESSION_COOKIE = "bkh_kpi_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;
const MIN_SECRET_LENGTH = 32;
const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MAX_COOKIE_LENGTH = 4096;

export interface Session extends AuthUser {
  /** Issued at (epoch seconds). */
  iat: number;
  /** Expires at (epoch seconds). */
  exp: number;
}

interface CachedKey {
  secret: string;
  key: Buffer;
}
let cachedKey: CachedKey | null = null;

/** Derived key, or null when auth is not configured. */
function sessionKey(): Buffer | null {
  const secret = process.env.AUTH_SECRET ?? "";
  if (secret.length < MIN_SECRET_LENGTH) return null;
  if (cachedKey?.secret !== secret) {
    const key = Buffer.from(
      hkdfSync("sha256", secret, "bkh-kpi/session", VERSION, 32),
    );
    cachedKey = { secret, key };
  }
  return cachedKey.key;
}

export function isAuthConfigured(): boolean {
  return sessionKey() !== null;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

export function sealSession(user: AuthUser, now = new Date()): string {
  const key = sessionKey();
  if (!key) throw new Error("AUTH_SECRET is not configured");
  const iat = Math.floor(now.getTime() / 1000);
  const payload: Session = {
    loginname: user.loginname,
    displayName: user.displayName,
    iat,
    exp: iat + SESSION_TTL_SECONDS,
  };
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(VERSION));
  const ct = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return `${VERSION}.${b64url(iv)}.${b64url(ct)}`;
}

/** Returns the session when the cookie is authentic and not expired. */
export function unsealSession(
  value: string | undefined,
  now = new Date(),
): Session | null {
  const key = sessionKey();
  if (!key || !value || value.length > MAX_COOKIE_LENGTH) return null;
  const parts = value.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return null;
  try {
    const iv = Buffer.from(parts[1], "base64url");
    const data = Buffer.from(parts[2], "base64url");
    if (iv.length !== IV_BYTES || data.length <= TAG_BYTES) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(Buffer.from(VERSION));
    decipher.setAuthTag(data.subarray(data.length - TAG_BYTES));
    const plain = Buffer.concat([
      decipher.update(data.subarray(0, data.length - TAG_BYTES)),
      decipher.final(),
    ]).toString("utf8");
    const s = JSON.parse(plain) as Partial<Session>;
    const nowSec = Math.floor(now.getTime() / 1000);
    if (
      typeof s.loginname !== "string" ||
      s.loginname === "" ||
      typeof s.displayName !== "string" ||
      typeof s.iat !== "number" ||
      typeof s.exp !== "number" ||
      s.exp <= nowSec ||
      s.iat > nowSec + 60 ||
      s.exp - s.iat > SESSION_TTL_SECONDS
    ) {
      return null;
    }
    return {
      loginname: s.loginname,
      displayName: s.displayName,
      iat: s.iat,
      exp: s.exp,
    };
  } catch {
    // Tampered / foreign / old-key cookie.
    return null;
  }
}

/**
 * Secure in production. Set AUTH_COOKIE_INSECURE=true only when the
 * production server is reachable over plain HTTP on the intranet
 * (browsers drop Secure cookies on http://); prefer enabling HTTPS.
 */
function secureCookie(): boolean {
  if (process.env.AUTH_COOKIE_INSECURE?.trim().toLowerCase() === "true") {
    return false;
  }
  return process.env.NODE_ENV === "production";
}

export function sessionCookieOptions(maxAge = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
