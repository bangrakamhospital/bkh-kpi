import "server-only";

import {
  createPool,
  type Pool as CorePool,
  type PoolConnection as CorePoolConnection,
  type RowDataPacket,
} from "mysql2";
import type { Pool } from "mysql2/promise";

/**
 * Read-only connection pool to the HIS database (HOSxP, MySQL/MariaDB).
 *
 * - Credentials come from server-only env vars; values are never logged
 *   or included in error messages.
 * - Every new connection runs `SET SESSION TRANSACTION READ ONLY`; if that
 *   fails the connection is destroyed (fail closed). The DB account should
 *   still be granted SELECT only — this is a second line of defence.
 * - Use `query()` with named placeholders (`:name`) only. Never build SQL
 *   from user input.
 */

const REQUIRED_ENV = [
  "HIS_HOST",
  "HIS_PORT",
  "HIS_USER",
  "HIS_PASSWORD",
  "HIS_DATABASE",
] as const;

const QUERY_TIMEOUT_MS = 60_000;

export class HisConfigError extends Error {
  override name = "HisConfigError";
}

export class HisQueryError extends Error {
  override name = "HisQueryError";
  /** mysql2 error code only (e.g. "ECONNREFUSED"), never the raw message. */
  readonly code: string | undefined;
  constructor(message: string, code: string | undefined) {
    super(code ? `${message} (${code})` : message);
    this.code = code;
  }
}

function readConfig() {
  // Report missing variable *names* only, never values.
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new HisConfigError(
      `Missing HIS database environment variables: ${missing.join(", ")}`,
    );
  }
  const port = Number(process.env.HIS_PORT);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new HisConfigError("HIS_PORT is not a valid port number");
  }
  return {
    host: process.env.HIS_HOST as string,
    port,
    user: process.env.HIS_USER as string,
    password: process.env.HIS_PASSWORD as string,
    database: process.env.HIS_DATABASE as string,
  };
}

function createHisPool(): Pool {
  const core: CorePool = createPool({
    ...readConfig(),
    connectionLimit: 5,
    maxIdle: 2,
    idleTimeout: 60_000,
    waitForConnections: true,
    queueLimit: 50,
    connectTimeout: 10_000,
    charset: "utf8mb4_unicode_ci",
    // HOSxP stores local (Thai) date/time without zone.
    timezone: "+07:00",
    // Return DATE/DATETIME as strings — no implicit JS Date conversion.
    dateStrings: true,
    namedPlaceholders: true,
    multipleStatements: false,
    decimalNumbers: true,
  });

  core.on("connection", (conn: CorePoolConnection) => {
    // Queued before any query on this connection, so it always runs first.
    conn.query("SET SESSION TRANSACTION READ ONLY", (err) => {
      if (err) conn.destroy();
    });
  });

  return core.promise();
}

const globalForHis = globalThis as unknown as { __hisPool?: Pool };

/** Lazily created singleton (survives dev HMR via globalThis). */
function getPool(): Pool {
  if (!globalForHis.__hisPool) {
    globalForHis.__hisPool = createHisPool();
  }
  return globalForHis.__hisPool;
}

export type QueryParams = Record<string, string | number | null>;

/**
 * Run a parameterized SELECT against HIS and return rows.
 * Uses server-side prepared statements (`execute`).
 */
export async function query<T extends RowDataPacket>(
  sql: string,
  params: QueryParams = {},
): Promise<T[]> {
  const pool = getPool();
  try {
    const [rows] = await pool.execute<T[]>(
      { sql, timeout: QUERY_TIMEOUT_MS },
      params,
    );
    return rows;
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code: unknown }).code)
        : undefined;
    throw new HisQueryError("HIS query failed", code);
  }
}
