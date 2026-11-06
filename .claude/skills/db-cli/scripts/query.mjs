#!/usr/bin/env node
// db-cli: run ONE read-only SQL statement against the HIS (HOSxP) database.
// Usage:
//   node .claude/skills/db-cli/scripts/query.mjs "SELECT ..." [--max-rows 50] [--json]
//   node .claude/skills/db-cli/scripts/query.mjs --file path/to/query.sql
// Connection: HIS_HOST / HIS_PORT / HIS_USER / HIS_PASSWORD / HIS_DATABASE from .env
// Safety: only SELECT / SHOW / DESCRIBE / DESC / EXPLAIN / WITH ... SELECT,
//         single statement, READ ONLY session, row cap, PII + secret columns masked.
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import mysql from "mysql2/promise";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const has = (name) => {
  const i = args.indexOf(name);
  if (i === -1) return false;
  args.splice(i, 1);
  return true;
};

const asJson = has("--json");
const maxRows = Math.min(Number(flag("--max-rows") ?? 50) || 50, 500);
const file = flag("--file");
let sql = file ? readFileSync(file, "utf8") : args.join(" ");
sql = sql.trim().replace(/;\s*$/, "");

function fail(msg) {
  console.error(`db-cli: ${msg}`);
  process.exit(1);
}

if (!sql) fail('no SQL given. Example: node query.mjs "SHOW TABLES LIKE \'person%\'"');

// --- read-only guard -------------------------------------------------------
const stripped = sql
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(--|#)[^\n]*/g, " ")
  .replace(/'(?:[^'\\]|\\.)*'/g, "''")
  .replace(/"(?:[^"\\]|\\.)*"/g, '""')
  .replace(/`[^`]*`/g, "``");
if (stripped.includes(";")) fail("only one statement is allowed");
const first = stripped.trim().split(/\s+/)[0]?.toUpperCase();
const allowed = ["SELECT", "SHOW", "DESCRIBE", "DESC", "EXPLAIN", "WITH"];
if (!allowed.includes(first)) fail(`statement must start with ${allowed.join("/")}`);
const forbidden =
  /\b(INSERT|UPDATE|DELETE|REPLACE|MERGE|CREATE|ALTER|DROP|TRUNCATE|RENAME|GRANT|REVOKE|LOCK|UNLOCK|CALL|DO|HANDLER|LOAD|SET|COMMIT|ROLLBACK|KILL|SHUTDOWN)\b|\bINTO\s+(OUTFILE|DUMPFILE)\b|\bFOR\s+UPDATE\b|\bSLEEP\s*\(|\bBENCHMARK\s*\(|\bLOAD_FILE\s*\(/i;
if (forbidden.test(stripped)) fail("statement contains a forbidden keyword (read-only tool)");

// --- env -------------------------------------------------------------------
const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) process.loadEnvFile(envPath);
for (const k of ["HIS_HOST", "HIS_USER", "HIS_PASSWORD", "HIS_DATABASE"]) {
  if (!process.env[k]) fail(`missing ${k} in .env (value is never printed)`);
}

// --- masking ---------------------------------------------------------------
// Column names that identify a person or hold secrets: values are replaced.
const MASK =
  /^(cid|pid|card_?id|passport.*|p?name|fname|lname|mname|f?name_?eng|l?name_?eng|full_?name|patient_?name|.*_name_?th|tel.*|phone.*|mobile.*|.*telephone|addr.*|address.*|road|house_?no|moopart|email|line_?id|passweb|password.*|passwd|.*_pass|token.*|secret.*|hn_?name|father.*|mother.*|couple.*|spouse.*|informname|informaddr|informtel|contact.*)$/i;
const isMasked = (col) => MASK.test(col) && !/^(.*_id|.*_code|.*_type.*)$/i.test(col);

const conn = await mysql.createConnection({
  host: process.env.HIS_HOST,
  port: Number(process.env.HIS_PORT || 3306),
  user: process.env.HIS_USER,
  password: process.env.HIS_PASSWORD,
  database: process.env.HIS_DATABASE,
  charset: "utf8mb4_unicode_ci",
  timezone: "+07:00",
  dateStrings: true,
  connectTimeout: 10000,
  multipleStatements: false,
});

try {
  await conn.query("SET SESSION TRANSACTION READ ONLY");
  // MySQL uses max_execution_time (ms), MariaDB uses max_statement_time (s).
  await conn.query("SET SESSION max_execution_time = 60000").catch(() => {});
  await conn.query("SET SESSION max_statement_time = 60").catch(() => {});
  const t0 = Date.now();
  const [rows, fields] = await conn.query({ sql, rowsAsArray: false, timeout: 60000 });
  const ms = Date.now() - t0;
  const list = Array.isArray(rows) ? rows : [rows];
  const cols = (fields ?? []).map((f) => f.name);
  const masked = cols.filter(isMasked);
  const shown = list.slice(0, maxRows).map((r) => {
    const o = {};
    for (const [k, v] of Object.entries(r)) o[k] = isMasked(k) && v != null && v !== "" ? "<masked>" : v;
    return o;
  });
  if (asJson) {
    console.log(JSON.stringify({ rows: shown, total: list.length, maxRows, masked, ms }, null, 2));
  } else {
    if (shown.length) console.table(shown);
    else console.log("(no rows)");
    console.log(
      `${list.length} row(s)${list.length > maxRows ? `, showing first ${maxRows}` : ""} in ${ms} ms` +
        (masked.length ? ` — masked columns: ${masked.join(", ")}` : ""),
    );
  }
} catch (e) {
  // Never echo connection details; driver messages for SQL errors are safe to show.
  fail(`${e.code ?? "ERROR"}: ${String(e.sqlMessage ?? e.message).replace(process.env.HIS_HOST ?? "\0", "<host>")}`);
} finally {
  await conn.end().catch(() => {});
}
