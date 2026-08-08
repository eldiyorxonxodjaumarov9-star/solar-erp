#!/usr/bin/env bash
# VPS (root): bash scripts/vps-nginx-supply-proxy.sh
# Adds location /api/supply/ -> 127.0.0.1:3000 BEFORE existing location /api/
# Does NOT modify location /api/ (ChorvoqViewERP -> :5000).
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: root kerak. Ishga tushiring: sudo bash scripts/vps-nginx-supply-proxy.sh" >&2
  exit 1
fi

ts=$(date +%Y%m%d-%H%M%S)

echo "== Find nginx config containing location /api/ =="
mapfile -t candidates < <(
  {
    ls -1 /etc/nginx/sites-enabled/* 2>/dev/null || true
    ls -1 /etc/nginx/conf.d/*.conf 2>/dev/null || true
    ls -1 /etc/nginx/sites-available/* 2>/dev/null || true
    nginx -T 2>/dev/null | awk '/# configuration file/{gsub(/:$/,"",$NF); print $NF}' || true
  } | awk 'NF' | sort -u
)

target=""
for f in "${candidates[@]}"; do
  [ -e "$f" ] || continue
  real_try=$(readlink -f "$f" 2>/dev/null || echo "$f")
  [ -f "$real_try" ] || continue
  if grep -qE 'location[[:space:]]+/api/[[:space:]]*\{' "$real_try" 2>/dev/null; then
    # Prefer file that proxies /api/ to :5000 (Chorvoq)
    if grep -A20 -E 'location[[:space:]]+/api/[[:space:]]*\{' "$real_try" | grep -q '127.0.0.1:5000'; then
      target="$real_try"
      break
    fi
    [ -z "$target" ] && target="$real_try"
  fi
done

if [ -z "$target" ]; then
  echo "ERROR: location /api/ topilmadi. nginx -T chiqishini tekshiring." >&2
  nginx -T 2>&1 | grep -nE 'location[[:space:]]+/api|proxy_pass|configuration file' | head -n 80 || true
  exit 1
fi

echo "Target config: $target"

backup="${target}.backup-${ts}"
cp -a "$target" "$backup"
echo "Backup: $backup"

if grep -qE 'location[[:space:]]+/api/supply/[[:space:]]*\{' "$target"; then
  echo "location /api/supply/ allaqachon bor — duplicate qo'shilmadi."
else
  tmp=$(mktemp)
  python3 - "$target" "$tmp" <<'PY'
import re
import sys

src, dst = sys.argv[1], sys.argv[2]
text = open(src, encoding="utf-8", errors="replace").read()

block = """    location /api/supply/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 30s;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

"""

# Exact location /api/ { — not /api/supply/ or /api/something
pat = re.compile(r'(^[ \t]*location\s+/api/\s*\{)', re.M)
m = pat.search(text)
if not m:
    raise SystemExit("ERROR: location /api/ insert nuqtasi topilmadi")

text = text[: m.start()] + block + text[m.start() :]
open(dst, "w", encoding="utf-8", newline="\n").write(text)
print("Inserted location /api/supply/ before location /api/")
PY
  cp "$tmp" "$target"
  rm -f "$tmp"
fi

echo "== nginx -t =="
if ! nginx -t; then
  echo "nginx -t FAIL — rollback, reload QILINMAYDI"
  cp -a "$backup" "$target"
  echo "Restored: $backup -> $target"
  nginx -t || true
  exit 1
fi

echo "== systemctl reload nginx =="
systemctl reload nginx

echo "== tests =="
echo "--- local :3000 health ---"
curl -sS -i http://127.0.0.1:3000/api/supply/health | head -n 40
echo
echo "--- public health ---"
public_headers=$(curl -sS -i http://77.237.237.94/api/supply/health)
echo "$public_headers" | head -n 40
echo
echo "--- public catalog (first 300 bytes) ---"
curl -sS http://77.237.237.94/api/supply/catalog | head -c 300
echo

status_line=$(echo "$public_headers" | head -n 1)
if echo "$status_line" | grep -qE 'HTTP/[0-9.]+[[:space:]]+200'; then
  echo "APK Ready: YES"
else
  echo "APK Ready: NO"
  echo "Public status: $status_line"
fi

echo "DONE config=$target backup=$backup"
