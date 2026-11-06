---
name: db-cli
description: Run read-only SQL against the hospital HIS (HOSxP MySQL/MariaDB) database configured in .env — explore schema (SHOW TABLES, DESCRIBE), check columns/codes, test KPI queries, verify counts and EXPLAIN plans. This is the ONLY allowed way to run SQL for research in this project (see CLAUDE.md). Use it whenever you need to know what tables/columns/values exist in HOSxP or to validate a query before putting it in src/lib/kpi/sql/.
---

# db-cli — read-only SQL for HOSxP

Run from the project root (D:\bkh-kpi). One statement per call.

```bash
node .claude/skills/db-cli/scripts/query.mjs "SHOW TABLES LIKE 'person%'"
node .claude/skills/db-cli/scripts/query.mjs "DESCRIBE person_dmht_risk_screen_head"
node .claude/skills/db-cli/scripts/query.mjs "SELECT COUNT(*) n FROM person WHERE house_regist_type_id IN ('1','3')"
node .claude/skills/db-cli/scripts/query.mjs --file scratch/q.sql --max-rows 100
node .claude/skills/db-cli/scripts/query.mjs "EXPLAIN SELECT ..." --json
```

Options: `--max-rows N` (default 50, max 500), `--json`, `--file path.sql`.

## Guarantees enforced by the script
- Only `SELECT`, `SHOW`, `DESCRIBE`/`DESC`, `EXPLAIN`, `WITH … SELECT`; one statement; write/DDL/`SET`/`INTO OUTFILE`/`SLEEP` keywords rejected.
- Session is `SET SESSION TRANSACTION READ ONLY`; 60 s execution limit.
- Credentials come from `.env` and are never printed.
- Columns that identify a person or hold secrets (cid, names, phone, address, passweb/password, …) are shown as `<masked>`.

## Rules for the caller
1. **Prefer schema and aggregates.** Use `DESCRIBE`, `SHOW COLUMNS`, `information_schema`, `COUNT(*)`, `GROUP BY`, `MIN/MAX`, `COUNT(DISTINCT …)`. Do not pull person-level rows unless you need to see value *formats* — then `LIMIT 5` and select only coded/technical columns (ids, codes, dates).
2. **Never** select password/hash columns' contents, even masked — check existence/format with `LENGTH(col)`, `col IS NULL`, `col REGEXP '^[0-9a-f]{32}$'` aggregates instead.
3. Do not copy patient-identifying values into files, docs, commits or reports.
4. Heavy queries: add a date range and check `EXPLAIN` first; the database is a live hospital system.
5. If the tool fails to connect, stop and report — do not connect to the database any other way.
