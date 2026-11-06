import "server-only";

import { DataStoreError, jsonFile } from "../data/json-store";
import type {
  AdminUser,
  AdminUserPatch,
  UserDecision,
  UserRole,
  UserStatus,
} from "./types";

/**
 * Local user store (the HIS database is read-only): one JSON file
 *   ${KPI_DATA_DIR || <cwd>/data}/users.json   (dir 0700, file 0600)
 * on top of src/lib/data/json-store.ts (per-file mutex, atomic writes,
 * mtime cache).
 *
 *  - created on demand by the first SSO sign-in
 *  - a corrupt / unreadable file throws UserStoreError (= DataStoreError)
 *    and is NEVER overwritten (callers fail closed: no sign-in, no
 *    protected data)
 *
 * Only relative / node: imports so scripts can load it directly.
 */

export type UserRecord = AdminUser;

export interface SsoLoginInput {
  sub: string;
  name: string;
  orgCode: string;
  orgName: string;
  jobPosition: string;
}

export interface SsoLoginPolicy {
  /** sub is listed in AUTH_ADMIN_SUBS: always approved admin. */
  envAdmin: boolean;
  /**
   * fname matches AUTH_BOOTSTRAP_ADMIN_FNAMES (and the org allow-list is
   * not "*"). Promotes only while the store has NO approved admin.
   */
  bootstrapCandidate: boolean;
}

export type Promotion = "env" | "bootstrap" | null;

export interface SsoLoginResult {
  user: UserRecord;
  created: boolean;
  promoted: Promotion;
}

export type UpdateUserResult =
  | { ok: true; user: UserRecord; changed: boolean; before: UserRecord }
  | { ok: false; error: "not_found" | "self" | "env_admin" | "last_admin" };

/** Errors of the user store (corrupt / unreadable / unwritable file). */
export const UserStoreError = DataStoreError;

const FILE_VERSION = 1;
const MAX_USERS = 5000;
const MAX_FIELD = 200;
const MAX_SUB = 256;

/** decidedBy of automatic promotions. */
export const SYSTEM_DECIDER = "system";

// ----------------------------------------------------------- validation

const STATUS_SET: ReadonlySet<string> = new Set<UserStatus>([
  "pending",
  "approved",
  "rejected",
]);
const ROLE_SET: ReadonlySet<string> = new Set<UserRole>(["admin", "user"]);

/** Trim, strip control characters, cap length. */
export function cleanField(value: unknown, max = MAX_FIELD): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

const isStr = (v: unknown): v is string => typeof v === "string";
const isIso = (v: unknown): v is string =>
  isStr(v) && !Number.isNaN(Date.parse(v));

function parseDecision(v: unknown): UserDecision | null | undefined {
  if (v === null) return null;
  if (!v || typeof v !== "object") return undefined;
  const d = v as Record<string, unknown>;
  if (!isStr(d.sub) || !isStr(d.name)) return undefined;
  return { sub: d.sub, name: d.name };
}

function parseRecord(v: unknown): UserRecord | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const decidedBy = parseDecision(r.decidedBy ?? null);
  if (
    !isStr(r.sub) ||
    r.sub === "" ||
    r.sub.length > MAX_SUB ||
    !isStr(r.name) ||
    !isStr(r.orgCode) ||
    !isStr(r.orgName) ||
    !isStr(r.jobPosition) ||
    !isStr(r.status) ||
    !STATUS_SET.has(r.status) ||
    !isStr(r.role) ||
    !ROLE_SET.has(r.role) ||
    !isIso(r.createdAt) ||
    !isIso(r.lastLoginAt) ||
    typeof r.loginCount !== "number" ||
    !Number.isSafeInteger(r.loginCount) ||
    r.loginCount < 0 ||
    decidedBy === undefined ||
    !(r.decidedAt === null || r.decidedAt === undefined || isIso(r.decidedAt))
  ) {
    return null;
  }
  // Explicit field list: unknown keys in the file are dropped.
  return {
    sub: r.sub,
    name: r.name,
    orgCode: r.orgCode,
    orgName: r.orgName,
    jobPosition: r.jobPosition,
    status: r.status as UserStatus,
    role: r.role as UserRole,
    createdAt: r.createdAt,
    lastLoginAt: r.lastLoginAt,
    loginCount: r.loginCount,
    decidedBy,
    decidedAt: isStr(r.decidedAt) ? r.decidedAt : null,
  };
}

function parseFile(text: string): UserRecord[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new UserStoreError("users.json is not valid JSON");
  }
  const root = json as { version?: unknown; users?: unknown } | null;
  if (!root || root.version !== FILE_VERSION || !Array.isArray(root.users)) {
    throw new UserStoreError("users.json has an unknown format");
  }
  const seen = new Set<string>();
  return root.users.map((raw, i) => {
    const rec = parseRecord(raw);
    if (!rec) throw new UserStoreError(`users.json: invalid record #${i}`);
    if (seen.has(rec.sub)) {
      throw new UserStoreError(`users.json: duplicate record #${i}`);
    }
    seen.add(rec.sub);
    return rec;
  });
}

// ------------------------------------------------------------------ I/O

const file = jsonFile<UserRecord[]>({
  fileName: "users.json",
  parse: parseFile,
  serialize: (users) => ({ version: FILE_VERSION, users }),
  initial: () => [],
});

export function userStorePath(): string {
  return file.path();
}

function mutate<T>(
  fn: (users: UserRecord[]) => { result: T; changed: boolean },
): Promise<T> {
  return file.mutate(fn);
}

// --------------------------------------------------------------- logic

export function isApprovedAdmin(u: Pick<UserRecord, "status" | "role">) {
  return u.status === "approved" && u.role === "admin";
}

export function countApprovedAdmins(users: readonly UserRecord[]): number {
  return users.filter(isApprovedAdmin).length;
}

/** Pending first, then most recent sign-in first. */
export function sortUsers(users: UserRecord[]): UserRecord[] {
  return users.sort((a, b) => {
    const pa = a.status === "pending" ? 0 : 1;
    const pb = b.status === "pending" ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return Date.parse(b.lastLoginAt) - Date.parse(a.lastLoginAt);
  });
}

export async function getUser(sub: string): Promise<UserRecord | null> {
  if (!sub || sub.length > MAX_SUB) return null;
  // read() waits for pending writes: a decision is visible immediately.
  const users = await file.read();
  return users.find((x) => x.sub === sub) ?? null;
}

export async function listUsers(): Promise<UserRecord[]> {
  return sortUsers(await file.read());
}

/**
 * SSO sign-in (after the org allow-list): create the user as pending/user
 * or refresh profile + login stats, then apply the admin policy.
 */
export function recordSsoLogin(
  input: SsoLoginInput,
  policy: SsoLoginPolicy,
  now: Date = new Date(),
): Promise<SsoLoginResult> {
  const sub = input.sub;
  if (!sub || sub.length > MAX_SUB) {
    return Promise.reject(new UserStoreError("invalid sub"));
  }
  const ts = now.toISOString();
  return mutate((users) => {
    let user = users.find((u) => u.sub === sub);
    const created = !user;
    if (!user) {
      if (users.length >= MAX_USERS) {
        throw new UserStoreError("user store is full");
      }
      user = {
        sub,
        name: "",
        orgCode: "",
        orgName: "",
        jobPosition: "",
        status: "pending",
        role: "user",
        createdAt: ts,
        lastLoginAt: ts,
        loginCount: 0,
        decidedBy: null,
        decidedAt: null,
      };
      users.push(user);
    }
    user.name = cleanField(input.name) || user.name || sub;
    user.orgCode = cleanField(input.orgCode, 32);
    user.orgName = cleanField(input.orgName);
    user.jobPosition = cleanField(input.jobPosition);
    user.lastLoginAt = ts;
    user.loginCount = Math.min(user.loginCount + 1, Number.MAX_SAFE_INTEGER);

    let promoted: Promotion = null;
    if (!isApprovedAdmin(user)) {
      if (policy.envAdmin) {
        promoted = "env";
      } else if (policy.bootstrapCandidate && countApprovedAdmins(users) === 0) {
        promoted = "bootstrap";
      }
    }
    if (promoted) {
      user.status = "approved";
      user.role = "admin";
      user.decidedBy = {
        sub: SYSTEM_DECIDER,
        name:
          promoted === "env"
            ? "AUTH_ADMIN_SUBS"
            : "AUTH_BOOTSTRAP_ADMIN_FNAMES",
      };
      user.decidedAt = ts;
    }
    return {
      result: { user: structuredClone(user), created, promoted },
      changed: true,
    };
  });
}

/**
 * Admin decision. Refuses: changing yourself, AUTH_ADMIN_SUBS accounts
 * (always admin, a stored change would have no effect), and any change
 * that leaves no approved admin in the store.
 */
export function updateUser(
  targetSub: string,
  patch: AdminUserPatch,
  actor: UserDecision,
  isEnvAdmin: (sub: string) => boolean,
  now: Date = new Date(),
): Promise<UpdateUserResult> {
  return mutate<UpdateUserResult>((users) => {
    const user = users.find((u) => u.sub === targetSub);
    if (!user) return { result: { ok: false, error: "not_found" }, changed: false };
    if (user.sub === actor.sub) {
      return { result: { ok: false, error: "self" }, changed: false };
    }
    if (isEnvAdmin(user.sub)) {
      return { result: { ok: false, error: "env_admin" }, changed: false };
    }
    const before = structuredClone(user);
    const status = patch.status ?? user.status;
    const role = patch.role ?? user.role;
    if (status === user.status && role === user.role) {
      return {
        result: { ok: true, user: before, changed: false, before },
        changed: false,
      };
    }
    if (
      isApprovedAdmin(user) &&
      !isApprovedAdmin({ status, role }) &&
      countApprovedAdmins(users) <= 1
    ) {
      return { result: { ok: false, error: "last_admin" }, changed: false };
    }
    user.status = status;
    user.role = role;
    user.decidedBy = {
      sub: cleanField(actor.sub, MAX_SUB),
      name: cleanField(actor.name),
    };
    user.decidedAt = now.toISOString();
    return {
      result: { ok: true, user: structuredClone(user), changed: true, before },
      changed: true,
    };
  });
}

/** Test helper: forget the cached file contents. */
export function resetUserStoreCache() {
  file.resetCache();
}
