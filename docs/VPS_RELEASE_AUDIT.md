# VPS release audit — 2026-10-01

Read-only SSH using the existing key and StrictHostKeyChecking succeeded. No remote files, services, accounts, credentials or production data were changed.

## Verified deployment

- SolarERP PM2 `solar-erp`: online, `/root/solar-erp/server.js`, cwd `/root/solar-erp`, Node 22.23.1, zero recorded restarts, listens publicly on :3000.
- Deployed commit `973243d8ed600053c4c16c41af4fd510434b4fff`, package 1.0.81, two dirty working-tree entries. Preserve and review before any replacement; do not reset the remote checkout.
- `/root/solar-erp/.env` exists. Neither it nor inspected process env configures `FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON` or `GOOGLE_APPLICATION_CREDENTIALS`; no usable Admin credential has been established. Admin login/hash, explicit Firebase project and CORS allowlist are absent in process env. No credential content was reported.
- New firebaseAdminAuth/authApi/staffApi/privateStorageApi modules are absent remotely. Direct loopback SolarERP /status = 200, /api/auth/session = 404.
- PM2 startup unit `pm2-root` is enabled. Other online applications include ChorVoq on :5000 and Ballon on :3100; never restart all processes or replace their routes.
- nginx -t passes. Default HTTP `/api/` and `/status` go to ChorVoq :5000; only `/api/supply/` goes to SolarERP :3000. Therefore prior public /status is not SolarERP health evidence.
- :443 is already used by `ballon.77-237-237-94.sslip.io` for another application. This does not provide valid SolarERP/IP HTTPS. Certbot is 2.9.0.

## Prepared candidate, not applied

`ops/ecosystem.https.cjs` targets only solar-erp, loopback :3000, bounded exponential restart policy, logs and timeout. server.js loads cwd/.env; secrets must be provisioned there or in a server-only credential file with restricted access. Background Telegram jobs are disabled during initial smoke via SOLARERP_DISABLE_BACKGROUND_TASKS=true. Do not silently resume them before separate operational review. Existing PM2 systemd startup is retained; pm2 save follows an approved, successful rollout only.

Nginx templates preserve full /api URI and bearer headers, enforce TLS, body limit 80m, connect/send/read timeouts and API no-store/security headers. No WebSocket dependency was found in backend routes; upgrade forwarding is unnecessary. Dedicated hostname routing preserves shared HTTP and Ballon TLS configuration. Nginx candidate syntax with real certificate paths has not been validated remotely because no candidate was installed.

Recommended host: api.<operator-owned-domain>, DNS A 77.237.237.94. Current Certbot is too old for IP webroot issuance; trusted IP certificates are possible with Certbot >=5.4 but short lifetime requires reliable renewal and reload monitoring. No certificate issuance attempted. Domain ownership/DNS must be confirmed first.

After explicit approval and domain confirmation, certificate plan (NOT executed): add dedicated HTTP ACME virtual host rooted at /var/www/letsencrypt; validate nginx; obtain cert using `certbot certonly --webroot -w /var/www/letsencrypt -d CONFIRMED_HOST`; install reviewed HTTPS template; nginx -t before reload. Validate renewal timer, `certbot renew --dry-run` and deploy hook `nginx -t && systemctl reload nginx`. Do not use standalone mode or stop nginx on this shared server.

Auth regression fix moves credential-project validation after account parsing (previous placement referenced an undefined variable when FIREBASE_PROJECT_ID was set). New configured-project missing-credential and mismatched-project tests pass. Existing isolated live server/token tests PASS; HTTPS preflight 10 assertions PASS. No emulator or live user was created.

## Approval scope and blockers

Proposed production change: back up code/config without printing secrets; preserve two remote edits; deploy reviewed backend files/dependencies; provision correct server-only Admin credentials, admin hash, CORS and account-security prerequisites; restart only solar-erp using reviewed PM2 config; add a dedicated API DNS/TLS virtual host; test nginx then reload; retain rollback and other ERP routes. No rules change, account migration, database mutation, token rotation or frontend/native release is included. Credential migration remains separate explicit approval; never enable plaintext fallback to make login work.

Read-only smoke after rollout: correct SolarERP health; generic invalid auth rejection; unauthorized session/staff/private media =401/403; existing authorized admin session without creating a real Firebase user; verified custom claims/current-account checks; Firestore project/worker counts, dashboard totals and private media authorized read. Real account login could create an Auth user if UID absent, so first establish existing UID and obtain appropriate approval rather than silently creating one. No upload or account write for smoke.

Projects count 65 is expected but unverified. Current public client reads are denied, and server Admin access is not configured; do not invent counts, substitute SQL counts or weaken rules. Workers/dashboard are likewise BLOCKED. Functional APK/EXE builds remain blocked until authenticated/backend/data smoke PASS.

Decision: NO-GO. No deploy, certificate issuance, migration apply, commit, push or new final platform build occurred.

## Operator scope and hold — 2026-10-01

Operator approved scope limited to solar-erp backend/dependencies/env and a dedicated HTTPS nginx virtual host. Other ERP routing must remain untouched. Operator explicitly says not to start deployment before domain readiness and to provide a final pre-deploy checklist once both domain and Firebase Admin credentials are ready.

Requested host: api.solarerp.uz -> 77.237.237.94. Current DNS checks return NXDOMAIN for the requested subdomain and apex solarerp.uz; this is DNS absence, not a domain-registration availability check. Credential configuration remains absent in remote process/cwd .env. Remote dirty count remains two. No auth smoke, certificate issuance or remote writes were performed.

Pre-deploy checklist (all required before rollout):

- Operator owns/controls solarerp.uz; public api.solarerp.uz A resolves to 77.237.237.94; any AAAA record must route correctly or be removed by the DNS operator.
- Server-only service account is configured via GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON, parses correctly and targets solar-erp-51870; restricted file permissions and required IAM are reviewed without exposing secrets.
- Existing account/security state and server admin hash are provisioned and verified; no automatic migration, real Auth user creation or plaintext fallback.
- Two remote working-tree changes are reviewed and preserved; code/env/nginx backup and rollback are reviewed before replacement.
- Dedicated api.solarerp.uz HTTP ACME/HTTPS blocks proxy only to 127.0.0.1:3000; shared /api and Ballon virtual hosts are unchanged.
- Certificate issuance/renewal plan, nginx syntax test, PM2 targeted restart and startup persistence are reviewed; background tasks disabled for initial read-only smoke.
- Release/dependency/security blockers in FINAL_RELEASE_GATE.md are reviewed; authenticated read-only smoke and expected 65-project comparison are specified, with no production mutations.

Final pre-deploy checklist must be presented again with observed readiness results after domain and credentials are provisioned. Current hold remains NO-GO.
