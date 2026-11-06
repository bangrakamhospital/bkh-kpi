import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import type { RowDataPacket } from "mysql2";

import { query } from "@/lib/db/his";
import type { AuthProvider, AuthUser } from "@/lib/auth/types";

/**
 * Authenticates against existing HOSxP staff accounts (table `opduser`).
 *
 * ASSUMPTIONS — must be verified with the `db-cli` skill before go-live
 * (see docs/auth.md):
 *  - `opduser.loginname`   : login name (unique).
 *  - `opduser.name`        : staff display name.
 *  - `opduser.passweb`     : web password stored as MD5 hex (32 chars);
 *                            compared case-insensitively.
 *  - `opduser.account_disable` : 'Y' = disabled; NULL / other = active.
 *
 * The stored hash never leaves this module: it is compared here with
 * `timingSafeEqual` and only { loginname, displayName } is returned.
 * Read-only, parameterized SELECT through the shared HIS helper.
 */

const SQL_FIND_USER = `
SELECT
  u.loginname        AS loginname,
  u.name             AS display_name,
  u.passweb          AS pass_hash,
  u.account_disable  AS account_disable
FROM opduser u
WHERE u.loginname = :loginname
LIMIT 1
`;

interface OpdUserRow extends RowDataPacket {
  loginname: string | null;
  display_name: string | null;
  pass_hash: string | null;
  account_disable: string | null;
}

const MD5_HEX = /^[0-9a-f]{32}$/;
/** Compared when the user does not exist, to keep timing uniform. */
const DUMMY_HASH = "0".repeat(32);

function md5Hex(value: string): string {
  return createHash("md5").update(value, "utf8").digest("hex");
}

function hashesEqual(expectedHex: string, actualHex: string): boolean {
  const a = Buffer.from(expectedHex, "utf8");
  const b = Buffer.from(actualHex, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function isDisabled(flag: string | null): boolean {
  return (flag ?? "").trim().toUpperCase() === "Y";
}

export const hosxpAuthProvider: AuthProvider = {
  name: "hosxp-opduser",
  async verify(username, password): Promise<AuthUser | null> {
    const rows = await query<OpdUserRow>(SQL_FIND_USER, {
      loginname: username,
    });
    const row = rows[0];

    const stored = (row?.pass_hash ?? "").trim().toLowerCase();
    const storedValid = MD5_HEX.test(stored);
    // Always hash + compare, even for unknown users / unusable hashes.
    const match = hashesEqual(storedValid ? stored : DUMMY_HASH, md5Hex(password));

    if (!row || !storedValid || !match || isDisabled(row.account_disable)) {
      return null;
    }
    const loginname = (row.loginname ?? username).trim();
    const displayName = (row.display_name ?? "").trim() || loginname;
    return { loginname, displayName };
  },
};
