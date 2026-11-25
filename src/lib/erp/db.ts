import "server-only";

import pg from "pg";

/**
 * ERP database (PostgreSQL `bkh_erp`, schema `erp`) — the ONLY database
 * this app writes to. HOSxP / HDC stay read-only (src/lib/db/*).
 *
 * Env (server-only, never NEXT_PUBLIC_):
 *   ERP_DATABASE_URL  postgres://bkh_erp_app:<password>@127.0.0.1:5432/bkh_erp
 *   or ERP_PG_HOST, ERP_PG_PORT (5432), ERP_PG_USER, ERP_PG_PASSWORD, ERP_PG_DATABASE
 * Not configured -> isErpConfigured() false, every ERP API answers 503
 * "ยังไม่ได้ตั้งค่าฐานข้อมูล ERP" (the rest of the site is unaffected).
 *
 * Every connection: search_path erp, time zone Asia/Bangkok, statement
 * timeout 30 s, lock timeout 5 s (a stuck row lock fails fast instead of
 * piling up requests), idle-in-transaction timeout 60 s.
 * Errors never carry connection details: only the SQLSTATE code.
 *
 * Type mapping: bigint / numeric -> number (ids and amounts stay far below
 * 2^53; exact money math is done in SQL or with BigInt units in stock.ts),
 * date -> "YYYY-MM-DD" string, timestamptz -> ISO 8601 string.
 */

export class ErpConfigError extends Error {
  override name = "ErpConfigError";
}

export class ErpDbError extends Error {
  override name = "ErpDbError";
  /** PostgreSQL SQLSTATE (e.g. "23505") or node error code; never the raw message. */
  readonly code: string | undefined;
  /** Constraint name of an integrity violation (schema identifier, safe to log). */
  readonly constraint: string | undefined;
  constructor(code: string | undefined, constraint: string | undefined) {
    super(code ? `ERP query failed (${code})` : "ERP query failed");
    this.code = code;
    this.constraint = constraint;
  }
}

function connectionConfig(): pg.PoolConfig | null {
  const env = process.env;
  const url = env.ERP_DATABASE_URL?.trim();
  if (url) return { connectionString: url };
  const host = env.ERP_PG_HOST?.trim();
  const user = env.ERP_PG_USER?.trim();
  const database = env.ERP_PG_DATABASE?.trim();
  if (!host || !user || !database) return null;
  const port = Number(env.ERP_PG_PORT?.trim() || 5432);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;
  return { host, port, user, database, password: env.ERP_PG_PASSWORD ?? "" };
}

export function isErpConfigured(): boolean {
  return connectionConfig() !== null;
}

const tsParser = pg.types.getTypeParser(pg.types.builtins.TIMESTAMPTZ);
const PARSERS: Record<number, (value: string) => unknown> = {
  [pg.types.builtins.INT8]: (v) => Number(v),
  [pg.types.builtins.NUMERIC]: (v) => Number(v),
  [pg.types.builtins.DATE]: (v) => v,
  [pg.types.builtins.TIMESTAMPTZ]: (v) => {
    const d = tsParser(v) as Date;
    return Number.isNaN(d.getTime()) ? v : d.toISOString();
  },
};

const customTypes = {
  getTypeParser: ((oid: number, format?: string) =>
    PARSERS[oid] ??
    pg.types.getTypeParser(oid, format as "text")) as typeof pg.types.getTypeParser,
};

// Startup parameters (sent in the connection handshake, so they apply
// before the first query and cannot be skipped).
const SESSION_OPTIONS =
  "-c search_path=erp -c TimeZone=Asia/Bangkok -c statement_timeout=30000 " +
  "-c lock_timeout=5000 -c idle_in_transaction_session_timeout=60000";

const store = globalThis as unknown as { __erpPool?: pg.Pool };

function getPool(): pg.Pool {
  if (store.__erpPool) return store.__erpPool;
  const config = connectionConfig();
  if (!config) throw new ErpConfigError("ERP database is not configured");
  const pool = new pg.Pool({
    ...config,
    application_name: "bkh-kpi",
    max: 10,
    idleTimeoutMillis: 60_000,
    connectionTimeoutMillis: 10_000,
    types: customTypes,
    options: SESSION_OPTIONS,
  });
  // Idle client errors (server restart) must not crash the process.
  pool.on("error", (err) => {
    console.error(`[erp-db] idle client error (${(err as { code?: string }).code ?? err.name})`);
  });
  store.__erpPool = pool;
  return pool;
}

function wrapError(err: unknown): never {
  if (err instanceof ErpConfigError) throw err;
  const e = err as { code?: unknown; constraint?: unknown } | null;
  const code = e && typeof e.code === "string" ? e.code : undefined;
  const constraint = e && typeof e.constraint === "string" ? e.constraint : undefined;
  throw new ErpDbError(code, constraint);
}

export type SqlParam = string | number | boolean | null | readonly (string | number)[];

/** Anything that can run a query: the pool or a transaction client. */
export interface Queryable {
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(
    sql: string,
    params?: readonly SqlParam[],
  ): Promise<R[]>;
}

function bind(run: (sql: string, params: unknown[]) => Promise<pg.QueryResult>): Queryable {
  return {
    async query<R extends pg.QueryResultRow>(sql: string, params: readonly SqlParam[] = []) {
      try {
        const res = await run(sql, params as unknown[]);
        return res.rows as R[];
      } catch (err) {
        wrapError(err);
      }
    },
  };
}

/** Parameterized query ($1, $2, ...) on the pool (autocommit). */
export async function erpQuery<R extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: readonly SqlParam[] = [],
): Promise<R[]> {
  return bind((s, p) => getPool().query(s, p)).query<R>(sql, params);
}

/**
 * Run `fn` in one READ COMMITTED transaction (BEGIN / COMMIT, ROLLBACK on
 * any throw). Use SELECT .. FOR UPDATE inside for row locks.
 */
export async function withErpTransaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
  let client: pg.PoolClient;
  try {
    client = await getPool().connect();
  } catch (err) {
    wrapError(err);
  }
  const tx = bind((s, p) => client.query(s, p));
  let broken = false;
  try {
    await tx.query("BEGIN");
    const result = await fn(tx);
    await tx.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      broken = true;
    }
    throw err;
  } finally {
    client.release(broken);
  }
}
