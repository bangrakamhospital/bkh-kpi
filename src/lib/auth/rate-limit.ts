import "server-only";

/**
 * Simple in-memory brute-force limiter for login (per process; resets on
 * restart; not shared between instances — sufficient for a single
 * on-premise server).
 *
 *  - per IP + username : 5 failed attempts / 5 minutes
 *  - per IP (any user) : 20 failed attempts / 5 minutes (username spraying)
 *
 * Only failures are counted; a successful login clears the IP+username key.
 */

const WINDOW_MS = 5 * 60 * 1000;
const MAX_PER_USER = 5;
const MAX_PER_IP = 20;
const MAX_KEYS = 10_000;

interface Bucket {
  count: number;
  resetAt: number;
}

const globalForLimiter = globalThis as unknown as {
  __authLimiter?: Map<string, Bucket>;
};
const buckets: Map<string, Bucket> = (globalForLimiter.__authLimiter ??=
  new Map());

function prune(now: number) {
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
  // Still too many (attack): drop oldest entries (Map keeps insertion order).
  while (buckets.size > MAX_KEYS) {
    const first = buckets.keys().next().value;
    if (first === undefined) break;
    buckets.delete(first);
  }
}

function keys(ip: string, username: string) {
  return {
    user: `u|${ip}|${username.trim().toLowerCase()}`,
    ip: `i|${ip}`,
  };
}

function active(key: string, now: number): Bucket | undefined {
  const b = buckets.get(key);
  if (b && b.resetAt <= now) {
    buckets.delete(key);
    return undefined;
  }
  return b;
}

/** Seconds until retry is allowed, or 0 when the attempt may proceed. */
export function loginRetryAfter(
  ip: string,
  username: string,
  now = Date.now(),
): number {
  const k = keys(ip, username);
  const u = active(k.user, now);
  const i = active(k.ip, now);
  let until = 0;
  if (u && u.count >= MAX_PER_USER) until = Math.max(until, u.resetAt);
  if (i && i.count >= MAX_PER_IP) until = Math.max(until, i.resetAt);
  return until > now ? Math.ceil((until - now) / 1000) : 0;
}

function bump(key: string, now: number) {
  const b = active(key, now);
  if (b) b.count += 1;
  else buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
}

export function recordLoginFailure(
  ip: string,
  username: string,
  now = Date.now(),
) {
  if (buckets.size > MAX_KEYS) prune(now);
  const k = keys(ip, username);
  bump(k.user, now);
  bump(k.ip, now);
}

export function recordLoginSuccess(ip: string, username: string) {
  buckets.delete(keys(ip, username).user);
}

// --- external-auditor access codes ----------------------------------------
// Same limits (5 per IP / 5 min, plus the shared 20 per IP), but in their
// own key namespace ("c|") so no password username can ever share or
// reset this bucket.

function accessCodeKey(ip: string): string {
  return `c|${ip}`;
}

export function accessCodeRetryAfter(ip: string, now = Date.now()): number {
  const c = active(accessCodeKey(ip), now);
  const i = active(keys(ip, "").ip, now);
  let until = 0;
  if (c && c.count >= MAX_PER_USER) until = Math.max(until, c.resetAt);
  if (i && i.count >= MAX_PER_IP) until = Math.max(until, i.resetAt);
  return until > now ? Math.ceil((until - now) / 1000) : 0;
}

export function recordAccessCodeFailure(ip: string, now = Date.now()) {
  if (buckets.size > MAX_KEYS) prune(now);
  bump(accessCodeKey(ip), now);
  bump(keys(ip, "").ip, now);
}

export function recordAccessCodeSuccess(ip: string) {
  buckets.delete(accessCodeKey(ip));
}
