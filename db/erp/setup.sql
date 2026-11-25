-- One-time setup of the ERP database on the deploy server (PostgreSQL 14+).
--
-- Do NOT run this file by hand with passwords on the command line (they
-- would stay in shell history / ps). Use the wrapper, which generates the
-- passwords, feeds them to psql on stdin (psql variables owner_pw / app_pw)
-- and writes ERP_DATABASE_URL / ERP_MIGRATE_DATABASE_URL into .env (0600):
--
--   bash scripts/erp-db-setup.sh
--
-- Roles (least privilege):
--   bkh_erp_owner  owns database + schema erp; used ONLY by the migration
--                  script (DDL). Not used by the web app.
--   bkh_erp_app    the web app: CONNECT + SELECT/INSERT/UPDATE/DELETE on the
--                  tables of schema erp, nothing else (no DDL, no other DB).
--                  Append-only tables (stock_movement, document_event,
--                  audit_log) additionally refuse UPDATE/DELETE by trigger.
-- The HOSxP / HDC databases are NOT touched by anything here.

CREATE ROLE bkh_erp_owner LOGIN PASSWORD :'owner_pw'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 5;
CREATE ROLE bkh_erp_app LOGIN PASSWORD :'app_pw'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT CONNECTION LIMIT 30;

CREATE DATABASE bkh_erp OWNER bkh_erp_owner ENCODING 'UTF8' TEMPLATE template0;
REVOKE ALL ON DATABASE bkh_erp FROM PUBLIC;
GRANT CONNECT ON DATABASE bkh_erp TO bkh_erp_app;

\connect bkh_erp

-- Nobody but the owner creates objects; the app only uses schema erp.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE SCHEMA erp AUTHORIZATION bkh_erp_owner;
GRANT USAGE ON SCHEMA erp TO bkh_erp_app;

-- Tables / sequences the owner creates later (migrations) are usable by the app.
ALTER DEFAULT PRIVILEGES FOR ROLE bkh_erp_owner IN SCHEMA erp
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bkh_erp_app;
ALTER DEFAULT PRIVILEGES FOR ROLE bkh_erp_owner IN SCHEMA erp
  GRANT USAGE, SELECT ON SEQUENCES TO bkh_erp_app;

-- Defaults (the app also sends them at connect time).
ALTER ROLE bkh_erp_owner IN DATABASE bkh_erp SET search_path = erp;
ALTER ROLE bkh_erp_app IN DATABASE bkh_erp SET search_path = erp;
ALTER ROLE bkh_erp_app IN DATABASE bkh_erp SET timezone = 'Asia/Bangkok';
ALTER ROLE bkh_erp_app IN DATABASE bkh_erp SET statement_timeout = '30s';
