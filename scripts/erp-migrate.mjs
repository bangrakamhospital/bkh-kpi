#!/usr/bin/env node
// ERP database migrations (PostgreSQL, database bkh_erp, schema erp).
//
//   npm run erp:migrate               apply pending migrations
//   npm run erp:migrate -- --status   list applied / pending, change nothing
//
// Connection (first one set wins):
//   ERP_MIGRATE_DATABASE_URL   owner account (DDL), recommended
//   ERP_DATABASE_URL           app account (only if it may run DDL)
//   ERP_PG_HOST/PORT/USER/PASSWORD/DATABASE (+ ERP_MIGRATE_PG_USER/PASSWORD)
// The npm script loads .env / .env.local with --env-file-if-exists.
//
// Rules
//   * files: db/erp/migrations/NNN_name.sql, applied in NNN order
//   * one transaction per file (DDL is transactional in PostgreSQL): a
//     failing file leaves nothing behind and stops the run
//   * erp.schema_migrations keeps version + sha256; an applied file whose
//     content changed aborts the run (never edit applied migrations)
//   * pg_advisory_lock: two concurrent runs (e.g. two deploys) cannot race
// Never prints connection strings or passwords.

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const SCHEMA = "erp";
const LOCK_KEY = 72_517_001; // arbitrary constant for pg_advisory_lock
const FILE_RE = /^(\d{3})_[a-z0-9_]+\.sql$/;
const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(here, "..", "db", "erp", "migrations");

function connectionConfig() {
  const env = process.env;
  const url = env.ERP_MIGRATE_DATABASE_URL?.trim() || env.ERP_DATABASE_URL?.trim();
  if (url) return { connectionString: url };
  const host = env.ERP_PG_HOST?.trim();
  const database = env.ERP_PG_DATABASE?.trim();
  const user = env.ERP_MIGRATE_PG_USER?.trim() || env.ERP_PG_USER?.trim();
  const password = env.ERP_MIGRATE_PG_USER?.trim()
    ? env.ERP_MIGRATE_PG_PASSWORD
    : env.ERP_PG_PASSWORD;
  if (!host || !database || !user) return null;
  const port = Number(env.ERP_PG_PORT || 5432);
  return { host, port, database, user, password };
}

async function listFiles() {
  const names = (await readdir(MIGRATIONS_DIR)).filter((n) => n.endsWith(".sql")).sort();
  const files = [];
  const seen = new Set();
  for (const name of names) {
    const m = FILE_RE.exec(name);
    if (!m) throw new Error(`invalid migration file name: ${name} (expected NNN_name.sql)`);
    if (seen.has(m[1])) throw new Error(`duplicate migration number ${m[1]}`);
    seen.add(m[1]);
    // LF-normalised before hashing: a CRLF checkout (Windows, see
    // .gitattributes *.sql eol=lf) must not look like an edited migration.
    const sql = (await readFile(path.join(MIGRATIONS_DIR, name), "utf8")).replace(/\r\n/g, "\n");
    files.push({
      version: m[1],
      name,
      sql,
      checksum: createHash("sha256").update(sql).digest("hex"),
    });
  }
  return files;
}

async function main() {
  const statusOnly = process.argv.includes("--status");
  const config = connectionConfig();
  if (!config) {
    console.error(
      "ERP database is not configured: set ERP_MIGRATE_DATABASE_URL (or ERP_DATABASE_URL / ERP_PG_*).",
    );
    process.exit(2);
  }
  const files = await listFiles();
  const client = new pg.Client({ ...config, application_name: "bkh-erp-migrate" });
  await client.connect();
  try {
    await client.query("SET client_min_messages TO warning");
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
    await client.query(`SET search_path TO ${SCHEMA}`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    text PRIMARY KEY,
        name       text NOT NULL,
        checksum   text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
    const { rows } = await client.query(
      "SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version",
    );
    const applied = new Map(rows.map((r) => [r.version, r]));

    for (const f of files) {
      const a = applied.get(f.version);
      if (a && a.checksum !== f.checksum) {
        throw new Error(
          `migration ${f.name} was changed after it was applied (checksum mismatch). Add a new migration instead.`,
        );
      }
    }
    for (const version of applied.keys()) {
      if (!files.some((f) => f.version === version)) {
        console.warn(`warning: applied migration ${version} has no file in ${MIGRATIONS_DIR}`);
      }
    }

    const pending = files.filter((f) => !applied.has(f.version));
    if (statusOnly) {
      for (const f of files) {
        const a = applied.get(f.version);
        console.log(`${a ? "applied" : "pending"}  ${f.name}${a ? `  ${new Date(a.applied_at).toISOString()}` : ""}`);
      }
      return;
    }
    if (pending.length === 0) {
      console.log("ERP database is up to date.");
      return;
    }
    for (const f of pending) {
      process.stdout.write(`applying ${f.name} ... `);
      await client.query("BEGIN");
      try {
        await client.query(`SET LOCAL search_path TO ${SCHEMA}`);
        // Simple-query protocol: the whole file (many statements, $$ bodies) in one call.
        await client.query(f.sql);
        await client.query(
          "INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)",
          [f.version, f.name, f.checksum],
        );
        await client.query("COMMIT");
        console.log("ok");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        console.log("FAILED");
        throw err;
      }
    }
    console.log(`applied ${pending.length} migration(s).`);
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => {});
    await client.end();
  }
}

main().catch((err) => {
  // Message + SQLSTATE only (pg errors never contain the password).
  const code = err && typeof err === "object" && "code" in err ? ` [${err.code}]` : "";
  console.error(`erp-migrate: ${err instanceof Error ? err.message : String(err)}${code}`);
  process.exit(1);
});
