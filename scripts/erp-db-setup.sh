#!/usr/bin/env bash
# One-time creation of the ERP PostgreSQL database (bkh_erp) on the server.
# Run ON THE SERVER as the app user (bkhadmin), from the app directory:
#
#   cd /var/www/kpi && bash scripts/erp-db-setup.sh
#
# What it does
#   1. generates two random passwords (kept only in shell variables)
#   2. runs db/erp/setup.sql as the postgres superuser, passing the
#      passwords on psql's STDIN (never on a command line: not visible in
#      ps / shell history)
#   3. appends ERP_DATABASE_URL (app account) and ERP_MIGRATE_DATABASE_URL
#      (owner account) to .env (mode 0600) — refuses if they already exist
#   4. runs the migrations (npm run erp:migrate)
# Passwords are never printed. Afterwards: pm2 restart bkh-kpi --update-env
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$APP_DIR/.env"
cd "$APP_DIR"

[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE (run scripts/deploy-kpi.sh first)"; exit 1; }
if grep -Eq '^ERP_(MIGRATE_)?DATABASE_URL=.+' "$ENV_FILE"; then
  echo "ERP_DATABASE_URL is already set in $ENV_FILE - nothing to do."
  echo "(To start over: drop the database/roles by hand and remove the ERP_* lines.)"
  exit 1
fi
command -v psql >/dev/null || { echo "PostgreSQL client (psql) not found: sudo apt install postgresql"; exit 1; }
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname IN ('bkh_erp_owner','bkh_erp_app')" | grep -q 1; then
  echo "Roles bkh_erp_owner / bkh_erp_app already exist - refusing to change them."
  exit 1
fi

gen() { openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 40; }
OWNER_PW="$(gen)"
APP_PW="$(gen)"

echo "==> creating roles + database bkh_erp"
{
  printf '\\set ON_ERROR_STOP on\n'
  printf "\\\\set owner_pw '%s'\n" "$OWNER_PW"
  printf "\\\\set app_pw '%s'\n" "$APP_PW"
  cat db/erp/setup.sql
} | sudo -u postgres psql -q -X -d postgres

echo "==> writing ERP_* to $ENV_FILE"
umask 077
# drop the empty template lines (from .env.example) so the new values are the only ones
sed -i -E '/^ERP_(MIGRATE_)?DATABASE_URL=$/d' "$ENV_FILE"
{
  echo ""
  echo "# ERP database (written by scripts/erp-db-setup.sh)"
  echo "ERP_DATABASE_URL=postgres://bkh_erp_app:${APP_PW}@127.0.0.1:5432/bkh_erp"
  echo "ERP_MIGRATE_DATABASE_URL=postgres://bkh_erp_owner:${OWNER_PW}@127.0.0.1:5432/bkh_erp"
} >> "$ENV_FILE"
chmod 600 "$ENV_FILE"
unset OWNER_PW APP_PW

echo "==> migrations"
node --env-file="$ENV_FILE" scripts/erp-migrate.mjs

echo "==> done. Restart the app: pm2 restart bkh-kpi --update-env"
