import "server-only";
import { createDecipheriv, createHash } from "node:crypto";

/**
 * HDC encrypts some PERSON columns (lname, cid_aes) with AES-256-GCM:
 *   hex( iv[12] | ciphertext | authTag[16] ), key = SHA-256(HDC_ENCRYPT_KEY).
 * The raw key lives only in .env (never in the repo, never logged).
 *
 * Decryption happens server-side only, for person lists shown to logged-in
 * staff. Only the surname is decrypted; cid_aes is never read.
 */

const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEX_RE = /^(?:[0-9a-f]{2})+$/i;

let cachedKey: Buffer | null | undefined;

function getKey(): Buffer | null {
  if (cachedKey !== undefined) return cachedKey;
  const raw = process.env.HDC_ENCRYPT_KEY;
  cachedKey = raw ? createHash("sha256").update(raw, "utf8").digest() : null;
  return cachedKey;
}

/** True when HDC_ENCRYPT_KEY is configured. */
export function hasHdcKey(): boolean {
  return getKey() !== null;
}

/**
 * Decrypts one HDC AES-256-GCM hex value. Returns null when the key is
 * missing, the value is empty / not in the expected format, or the auth tag
 * does not verify (never throws, never logs the value).
 */
export function decryptHdc(hex: string | null | undefined): string | null {
  const key = getKey();
  if (!key || !hex) return null;
  const value = hex.trim();
  if (!HEX_RE.test(value) || value.length < (IV_BYTES + TAG_BYTES) * 2) {
    return null;
  }
  try {
    const bin = Buffer.from(value, "hex");
    const iv = bin.subarray(0, IV_BYTES);
    const tag = bin.subarray(bin.length - TAG_BYTES);
    const data = bin.subarray(IV_BYTES, bin.length - TAG_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(data), decipher.final()]);
    return out.toString("utf8").trim();
  } catch {
    return null;
  }
}
