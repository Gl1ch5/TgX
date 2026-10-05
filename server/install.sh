#!/usr/bin/env bash
# Installs the TeleX mod store API as a systemd service (+ nginx site with HTTPS when a domain is given).
#   sudo DOMAIN=api.telex-web.ru EMAIL=you@example.com bash install.sh
# Re-running updates the code and keeps the data and the admin token.
set -euo pipefail

DOMAIN="${DOMAIN:-}"       # own sub-domain for the API (nginx on :80 + certbot), optional
EMAIL="${EMAIL:-}"
TLS_HOST="${TLS_HOST:-}"   # alternative without new DNS records: reuse the certificate of an existing site, e.g. grzxk.ru
PUBLIC_PORT="${PUBLIC_PORT:-8443}"
PORT="${PORT:-8787}"
SRC="$(cd "$(dirname "$0")" && pwd)"
APP=/opt/telex-api
DATA=/var/lib/telex-api
ENVF=/etc/telex-api.env

[ "$(id -u)" = 0 ] || { echo "run as root (sudo)"; exit 1; }

# --- Node.js >= 18
need_node=1
if command -v node >/dev/null 2>&1; then [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ] && need_node=0; fi
if [ "$need_node" = 1 ]; then
  echo ">> installing Node.js"
  if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq && apt-get install -y -qq curl ca-certificates
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
    apt-get install -y -qq nodejs
  else
    echo "install Node.js 18+ manually and run again"; exit 1
  fi
fi

# --- user, code, data
id -u telex >/dev/null 2>&1 || useradd --system --home "$DATA" --shell /usr/sbin/nologin telex
mkdir -p "$APP" "$DATA"
cp "$SRC/index.js" "$SRC/package.json" "$APP/"
chown -R telex:telex "$DATA"

if [ ! -f "$ENVF" ]; then
  umask 077
  printf 'PORT=%s\nHOST=127.0.0.1\nDATA_DIR=%s\nADMIN_TOKEN=%s\n' "$PORT" "$DATA" "$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')" > "$ENVF"
fi

cat > /etc/systemd/system/telex-api.service <<UNIT
[Unit]
Description=TeleX mod store API
After=network.target

[Service]
User=telex
EnvironmentFile=$ENVF
ExecStart=$(command -v node) $APP/index.js
Restart=always
RestartSec=2
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=$DATA
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now telex-api >/dev/null
systemctl restart telex-api
sleep 1
curl -fsS "http://127.0.0.1:$PORT/api/health" && echo

# --- nginx (optional)
if [ -n "$DOMAIN" ] && command -v nginx >/dev/null 2>&1; then
  cat > /etc/nginx/conf.d/telex-api.conf <<NGX
server {
  listen 80;
  server_name $DOMAIN;
  client_max_body_size 2m;
  location / {
    proxy_pass http://127.0.0.1:$PORT;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$remote_addr;
    proxy_read_timeout 30s;
  }
}
NGX
  nginx -t && systemctl reload nginx
  if command -v certbot >/dev/null 2>&1 && [ -n "$EMAIL" ]; then
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect || echo "!! certbot failed: check that the DNS A record of $DOMAIN points to this server"
  else
    echo "!! HTTPS: install certbot and run: certbot --nginx -d $DOMAIN -m you@example.com --agree-tos --redirect"
  fi
fi

# --- HTTPS on an extra port with the certificate of an existing site (no DNS changes, existing nginx config untouched)
if [ -n "$TLS_HOST" ]; then
  command -v nginx >/dev/null 2>&1 || { echo "nginx is not installed: cannot expose the API over HTTPS"; exit 1; }
  CERT=""; KEY=""
  if [ -f "/etc/letsencrypt/live/$TLS_HOST/fullchain.pem" ]; then
    CERT="/etc/letsencrypt/live/$TLS_HOST/fullchain.pem"; KEY="/etc/letsencrypt/live/$TLS_HOST/privkey.pem"
  else
    CF="$(grep -rl "server_name[^;]*$TLS_HOST" /etc/nginx 2>/dev/null | head -n1 || true)"
    if [ -n "$CF" ]; then
      CERT="$(grep -m1 -oP 'ssl_certificate\s+\K[^;]+' "$CF" || true)"
      KEY="$(grep -m1 -oP 'ssl_certificate_key\s+\K[^;]+' "$CF" || true)"
    fi
  fi
  [ -n "$CERT" ] && [ -n "$KEY" ] || { echo "!! no TLS certificate found for $TLS_HOST"; exit 1; }
  cat > /etc/nginx/conf.d/telex-api-tls.conf <<NGX
server {
  listen $PUBLIC_PORT ssl;
  server_name $TLS_HOST;
  ssl_certificate $CERT;
  ssl_certificate_key $KEY;
  client_max_body_size 2m;
  location /api/ {
    proxy_pass http://127.0.0.1:$PORT;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$remote_addr;
    proxy_read_timeout 30s;
  }
  location / { return 404; }
}
NGX
  if ! nginx -t; then rm -f /etc/nginx/conf.d/telex-api-tls.conf; echo "!! nginx config test failed, the change was reverted"; exit 1; fi
  systemctl reload nginx
  if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then ufw allow "$PUBLIC_PORT/tcp" >/dev/null && echo ">> ufw: opened $PUBLIC_PORT/tcp"; fi
  curl -fsSk --resolve "$TLS_HOST:$PUBLIC_PORT:127.0.0.1" "https://$TLS_HOST:$PUBLIC_PORT/api/health" && echo && echo ">> HTTPS ok: https://$TLS_HOST:$PUBLIC_PORT/api"
fi

echo
echo "TeleX mod store API is running on 127.0.0.1:$PORT"
[ -n "$DOMAIN" ] && echo "Public address: https://$DOMAIN/api/health"
echo "Admin token (to remove a mod): $(grep ^ADMIN_TOKEN= "$ENVF" | cut -d= -f2)"
