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

tmp=$(mktemp)
python3 - "$target" "$tmp" <<'PY'
import re
import sys

src, dst = sys.argv[1], sys.argv[2]
text = open(src, encoding="utf-8", errors="replace").read()

def loc_block(path):
    return (
        f"    location {path} {{\n"
        "        client_max_body_size 80m;\n"
        "        proxy_pass http://127.0.0.1:3000;\n"
        "        proxy_http_version 1.1;\n"
        "\n"
        "        proxy_set_header Host $host;\n"
        "        proxy_set_header X-Real-IP $remote_addr;\n"
        "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n"
        "        proxy_set_header X-Forwarded-Proto $scheme;\n"
        "\n"
        "        proxy_connect_timeout 30s;\n"
        "        proxy_read_timeout 180s;\n"
        "        proxy_send_timeout 180s;\n"
        "    }\n"
        "\n"
    )

# Exact location /api/ { — not /api/supply/ or /api/telegram/
pat_api = re.compile(r'(^[ \t]*location\s+/api/\s*\{)', re.M)
m = pat_api.search(text)
if not m:
    raise SystemExit("ERROR: location /api/ insert nuqtasi topilmadi")

# Do NOT modify location /api/ (Chorvoq :5000).
# Solar ERP photo/API prefixes must be longer and sit BEFORE /api/.
needed = [
    "/api/supply/",
    "/api/telegram/",
    "/api/upload/",
    "/api/db/",
    "/api/media/",
    "/api/reports/",
]

insert = []
for path in needed:
    if re.search(r'location\s+' + re.escape(path) + r'\s*\{', text):
        print(f"already present: location {path}")
    else:
        insert.append(loc_block(path))
        print(f"will insert: location {path}")

if insert:
    text = text[: m.start()] + "".join(insert) + text[m.start() :]

# Existing /api/supply/ may lack body size (nginx default 1m → rasm 413)
def ensure_body_size(src_text, path):
    loc_re = re.compile(
        r'(location\s+' + re.escape(path) + r'\s*\{)([^{}]*)\}',
        re.M,
    )
    match = loc_re.search(src_text)
    if not match:
        return src_text
    body = match.group(2)
    if "client_max_body_size" in body:
        if re.search(r'client_max_body_size\s+\d+[kKmMgG]?', body):
            body2 = re.sub(
                r'client_max_body_size\s+\d+[kKmMgG]?\s*;',
                "client_max_body_size 80m;",
                body,
                count=1,
            )
            return src_text[: match.start()] + match.group(1) + body2 + "}" + src_text[match.end() :]
        return src_text
    injected = match.group(1) + "\n        client_max_body_size 80m;" + body + "}"
    print(f"added client_max_body_size 80m to {path}")
    return src_text[: match.start()] + injected + src_text[match.end() :]

for path in needed:
    text = ensure_body_size(text, path)

open(dst, "w", encoding="utf-8", newline="\n").write(text)
print("nginx photo/supply proxy blocks ready (location /api/ unchanged)")
PY
cp "$tmp" "$target"
rm -f "$tmp"

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

echo "--- public telegram (Solar ERP 400, Chorvoq 404 emas) ---"
tg_code=$(curl -sS -o /tmp/solar-tg-test.json -w '%{http_code}' \
  -X POST http://127.0.0.1:3000/api/telegram/stage-photos \
  -H 'Content-Type: application/json' \
  -d '{}')
echo "local :3000 /api/telegram/stage-photos → $tg_code $(head -c 120 /tmp/solar-tg-test.json)"
pub_tg=$(curl -sS -o /tmp/solar-tg-pub.json -w '%{http_code}' \
  -X POST http://77.237.237.94/api/telegram/stage-photos \
  -H 'Content-Type: application/json' \
  -d '{}')
echo "public /api/telegram/stage-photos → $pub_tg $(head -c 160 /tmp/solar-tg-pub.json)"
pub_compat=$(curl -sS -o /tmp/solar-tg-compat.json -w '%{http_code}' \
  -X POST http://77.237.237.94/api/supply/compat/telegram/stage-photos \
  -H 'Content-Type: application/json' \
  -d '{}')
echo "public /api/supply/compat/telegram/stage-photos → $pub_compat $(head -c 160 /tmp/solar-tg-compat.json)"

status_line=$(echo "$public_headers" | head -n 1)
if echo "$status_line" | grep -qE 'HTTP/[0-9.]+[[:space:]]+200'; then
  echo "APK Ready: YES"
else
  echo "APK Ready: NO"
  echo "Public status: $status_line"
fi

echo "DONE config=$target backup=$backup"
