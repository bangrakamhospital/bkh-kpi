import "server-only";

import {
  createPool,
  type Pool as CorePool,
  type PoolConnection as CorePoolConnection,
  type RowDataPacket,
} from "mysql2";
import type { Pool } from "mysql2/promise";

/**
 * Shared factory for read-only MySQL/MariaDB pools (HOSxP, district HDC).
 *
 * - Credentials come from server-only env vars `HIS_HOST{suffix}`,
 *   `HIS_PORT{suffix}`, ... ; values are never logged or included in error
 *   messages (only variable NAMES and mysql2 error codes).
 * - Every new connection runs `SET SESSION TRANSACTION READ ONLY`; if that
 *   fails the connection is destroyed (fail closed). The DB account should
 *   still be granted SELECT only — this is a second line of defence.
 * - Use `query()` with named placeholders (`:name`) only. Never build SQL
 *   from user input.
 */

const ENV_KEYS = [
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

export type QueryParams = Record<string, string | number | null>;

export type QueryFn = <T extends RowDataPacket>(
  sql: string,
  params?: QueryParams,
) => Promise<T[]>;

export interface ReadOnlyDbOptions {
  /** "" = HIS_* (HOSxP), "2" = HIS_*2 (district HDC). */
  envSuffix: "" | "2";
  /** Short label used in error messages, e.g. "HIS" / "HDC". */
  label: string;
  /** globalThis key so the pool survives dev HMR. */
  globalKey: string;
}

function readConfig({ envSuffix, label }: ReadOnlyDbOptions) {
  const env = (key: (typeof ENV_KEYS)[number]) =>
    process.env[`${key}${envSuffix}`];
  // Report missing variable *names* only, never values.
  const missing = ENV_KEYS.filter((key) => !env(key)).map(
    (key) => `${key}${envSuffix}`,
  );
  if (missing.length > 0) {
    throw new HisConfigError(
      `Missing ${label} database environment variables: ${missing.join(", ")}`,
    );
  }
  const port = Number(env("HIS_PORT"));
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new HisConfigError(`HIS_PORT${envSuffix} is not a valid port number`);
  }
  return {
    host: env("HIS_HOST") as string,
    port,
    user: env("HIS_USER") as string,
    password: env("HIS_PASSWORD") as string,
    database: env("HIS_DATABASE") as string,
  };
}

function createReadOnlyPool(options: ReadOnlyDbOptions): Pool {
  const core: CorePool = createPool({
    ...readConfig(options),
    connectionLimit: 5,
    maxIdle: 2,
    idleTimeout: 60_000,
    waitForConnections: true,
    queueLimit: 50,
    connectTimeout: 10_000,
    charset: "utf8mb4_unicode_ci",
    // HOSxP / HDC store local (Thai) date/time without zone.
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

/**
 * Returns a `query()` bound to a lazily created singleton pool.
 * Uses server-side prepared statements (`execute`).
 */
export function createReadOnlyQuery(options: ReadOnlyDbOptions): QueryFn {
  const store = globalThis as unknown as Record<string, Pool | undefined>;
  const getPool = (): Pool => {
    let pool = store[options.globalKey];
    if (!pool) {
      pool = createReadOnlyPool(options);
      store[options.globalKey] = pool;
    }
    return pool;
  };

  return async function query<T extends RowDataPacket>(
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
      throw new HisQueryError(`${options.label} query failed`, code);
    }
  };
}
