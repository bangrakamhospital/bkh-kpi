#!/usr/bin/env bash
# Deploy bkh-kpi (main branch) to /var/www/kpi, run with pm2 on 127.0.0.1:3082,
# and expose it on port 82 through nginx.
#
# Run ON THE SERVER as bkhadmin (sudo will ask for the password):
#   curl -fsSL https://raw.githubusercontent.com/bangrakamhospital/bkh-kpi/main/scripts/deploy-kpi.sh | bash
# or, after the first deploy:
#   bash /var/www/kpi/scripts/deploy-kpi.sh
#
# First run only: the script stops after creating /var/www/kpi/.env from
# .env.example — fill in HIS_* there, then run the script again.
# No secrets live in this file (the repository is public).
set -euo pipefail

REPO="https://github.com/bangrakamhospital/bkh-kpi.git"
BRANCH="main"            # rule: only deploy main
APP_DIR="/var/www/kpi"
APP_NAME="bkh-kpi"
APP_PORT=3082            # internal, bound to 127.0.0.1
PUBLIC_PORT=82           # nginx

echo "==> 1/6 directory"
if [ ! -d "$APP_DIR" ]; then
  sudo mkdir -p "$APP_DIR"
  sudo chown "$USER:$USER" "$APP_DIR"
fi

echo "==> 2/6 code ($BRANCH)"
cd "$APP_DIR"
if [ ! -d .git ]; then
  git clone -q -b "$BRANCH" "$REPO" .
fi
git fetch -q origin "$BRANCH"
git checkout -q "$BRANCH"
git reset -q --hard "origin/$BRANCH"
git log --oneline -1

echo "==> 3/6 .env"
if [ ! -f .env ]; then
  umask 077
  # Production is served over HTTPS, so AUTH_COOKIE_INSECURE stays empty
  # (Secure cookies). An existing .env is never rewritten by this script.
  sed -e "s|^AUTH_SECRET=.*|AUTH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")|" \
      .env.example > .env
  chmod 600 .env
  echo "Created $APP_DIR/.env (AUTH_SECRET generated)."
  echo "Fill in HIS_* and AUTH_PLKHEALTH_* (SSO), then run this script again:"
  echo "  nano $APP_DIR/.env"
  exit 0
fi
for k in HIS_HOST HIS_USER HIS_PASSWORD HIS_DATABASE AUTH_SECRET; do
  if ! grep -Eq "^$k=.+" .env; then echo "Missing $k in $APP_DIR/.env"; exit 1; fi
done
# District tab (/district) needs the HDC database (HIS_*2). Warn only:
# the hospital page works without it.
if ! grep -Eq "^HIS_HOST2=.+" .env; then
  echo "WARNING: HIS_HOST2 is empty in $APP_DIR/.env - the district tab (/district) will not load data."
fi

# Local user store (data/users.json: approved users / admins). It is an
# ignored untracked dir, so `git reset --hard` above keeps it. NEVER run
# `git clean -x` here. Owned by $USER (the pm2 user), mode 0700.
# (If KPI_DATA_DIR is set in .env, create that directory the same way.)
mkdir -p "$APP_DIR/data"
chmod 700 "$APP_DIR/data"

echo "==> 4/6 install + build"
npm ci --no-audit --no-fund
npm run build

echo "==> 5/6 pm2"
if ! command -v pm2 >/dev/null 2>&1; then
  sudo npm install -g pm2
fi
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 restart "$APP_NAME" --update-env
else
  pm2 start npm --name "$APP_NAME" --cwd "$APP_DIR" -- start -- -H 127.0.0.1 -p "$APP_PORT"
fi
pm2 save
# Start pm2 on boot (prints and runs the systemd setup once).
if [ ! -f "/etc/systemd/system/pm2-$USER.service" ]; then
  sudo env PATH="$PATH" pm2 startup systemd -u "$USER" --hp "$HOME"
fi

echo "==> 6/6 nginx :$PUBLIC_PORT"
NGINX_SITE="/etc/nginx/sites-available/$APP_NAME"
# Written only when missing: an existing site (HTTPS on :$PUBLIC_PORT with
# X-Forwarded-Proto https) is left untouched. This fallback block is plain
# HTTP; SSO and Secure cookies need HTTPS (or AUTH_COOKIE_INSECURE=true).
if [ ! -f "$NGINX_SITE" ]; then
  sudo tee "$NGINX_SITE" >/dev/null <<NGINX
server {
    listen $PUBLIC_PORT;
    listen [::]:$PUBLIC_PORT;
    server_name _;
    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        # \$http_host keeps ":$PUBLIC_PORT" so the app's Origin check matches.
        proxy_set_header Host \$http_host;
        proxy_set_header X-Forwarded-Host \$http_host;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
    }
}
NGINX
  sudo ln -sf "$NGINX_SITE" "/etc/nginx/sites-enabled/$APP_NAME"
fi
sudo nginx -t
sudo systemctl reload nginx

sleep 2
code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PUBLIC_PORT/" || true)
echo "==> done: http://$(hostname -I | awk '{print $1}'):$PUBLIC_PORT/  (local check HTTP $code)"
pm2 ls
