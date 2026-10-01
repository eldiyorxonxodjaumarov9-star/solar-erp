# Production backend audit and prepared HTTPS candidate

## Observed status (read-only)

**Updated 2026-10-01:** trusted read-only SSH is now available and the actual PM2/nginx routing was audited. The historical absence-of-SSH statements below are superseded by [VPS_RELEASE_AUDIT.md](VPS_RELEASE_AUDIT.md). SolarERP is :3000; default public /api and /status actually reach another ERP :5000. No remote changes were made.

Repository deployment example points to VPS `77.237.237.94`, path `/root/solar-erp`; Contabo ownership/actual process identity is not independently verified. `.env.deploy` and usable SSH credentials are absent. `.env.production` contains a public HTTP API origin, no confirmed domain, Firebase Admin credentials, admin hash or CORS allowlist. No SSH, PM2 restart, nginx change, database/user mutation or deployment occurred.

Public probes:

| Origin | /status | /api/auth/session | /api/staff/workers | /api/private-storage | /api/reports/monthly-attendance |
| --- | --- | --- | --- | --- | --- |
| HTTP IP :80 | 200 | 404 | 404 | 404 | 401 |
| HTTP IP :5000 | 200 | 404 | 404 | 404 | 401 |
| HTTP IP :3000 | unreachable | unreachable | unreachable | unreachable | unreachable |
| HTTPS IP | TLS/network failure | TLS/network failure | TLS/network failure | TLS/network failure | TLS/network failure |

Port 3000 may be loopback/firewalled; unreachable externally does not prove the process is down. HTTPS IP failure does not prove there is no certificate for an unknown hostname. Actual remote nginx/PM2 state cannot be claimed audited without trusted SSH access.

Original `SolarERP-last.apk` and `dist-apk/SolarERP.apk` match all six public Firebase fields of `solar-erp-51870`, using JS SDK fallback config; no google-services.json found. Existing package API config is HTTP IP. Local new APK explicitly uses the same real Firebase project, not a demo project. Client config does not authorize Firebase reads. Real unauthenticated aggregate queries for projects/workers/expenses return 403 permission-denied; 65 projects is not independently confirmed.

`scripts/vps-nginx-supply-proxy.sh` says shared `/api/` belongs to another ERP at :5000, while selected SolarERP prefixes go to :3000. It includes supply/telegram/upload/db/media/reports but omits auth/staff/private-storage/master/geo. Thus updating JS alone can still route new auth to the wrong service. Do not run that mutating legacy script as an audit or overwrite another ERP's shared API route.

## Prepared local candidate

No production domain is confirmed (operator response). A domain is **not technically mandatory**: Let's Encrypt IP certificates are generally available in 2026, valid for 160 hours. Certbot 5.4+ supports webroot IP issuance; automated renewal, expiry monitoring and nginx reload validation are essential. Official sources: [IP availability](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability), [Certbot IP support](https://letsencrypt.org/2026/03/11/shorter-certs-certbot).

Two explicit options, neither applied:

- Recommended operational hostname: `api.<operator-owned-domain>`; DNS A record to `77.237.237.94`, trusted hostname certificate. Do not register or use an unowned example domain. The domain template uses placeholders until ownership is confirmed.
- IP-only candidate: `https://77.237.237.94`, `ops/nginx-api-ip.conf.template`, trusted IP-SAN certificate. Existing HTTP ERP routes are preserved. Operator must add only the ACME challenge location to the existing :80 virtual host after config review, provision and validate the short-lived certificate and renewal automation, then review the new :443 upstream routing. No self-signed certificate or client TLS bypass is permitted.

Certificate issuance/install/reload are production changes requiring separate approval; no Certbot/nginx/PM2 commands were executed remotely. Public HTTPS readiness still fails.

- `server.js` is the live entry, not `server/index.js`; `BIND_HOST` now allows private loopback binding. Existing default binding remains compatible.
- `ops/ecosystem.https.cjs`: candidate process `/root/solar-erp/server.js`, :3000 loopback, real project `solar-erp-51870`. Port/process/cwd must be operator-confirmed before use; this is not a live PM2 state dump.
- `ops/nginx-api.conf.template`: dedicated confirmed API hostname, TLS 1.2/1.3, existing Let's Encrypt certificate paths, HTTP redirect, preserved `/api/...` URI and bearer headers, all API namespaces forwarded to this SolarERP process. Public static uploads/media are refused. No certificate is provisioned by the template; hostname placeholders must never enter client builds.
- Firebase Admin rejects a credential or already initialized app from a different explicitly configured `FIREBASE_PROJECT_ID`. Credentials stay server-only.
- `scripts/check-https-api.mjs`: public TLS/route preflight, expects /status 200 and protected session/staff/private-storage 401 JSON, fails on missing route/TLS/redirect/insecure origin. This is not proof of authenticated admin/business correctness.
- `scripts/build-real-platforms.mjs`: refuses HTTP or a failing real HTTPS endpoint preflight, uses one explicit real HTTPS origin for Android and Desktop, blank loopback/test fallbacks, emulator false. Android code increments from original APK; Windows candidate version increments without mutating package.json. Authenticated data sign-off is still required before calling artifacts functional.

## Required protected endpoint matrix

| Endpoint | Purpose | Authorization |
| --- | --- | --- |
| POST /api/auth/login (compat /api/login) | server account verification + custom token | generic failure, rate limited |
| GET /api/auth/session | Firebase ID token + account/session version verification | verified custom claims and active account |
| /api/staff/workers, /api/staff/assistants | sanitized profiles/account administration | own/minimal role reads, admin writes |
| POST /api/upload/private-image, /api/upload/stage-video | private upload | signed actor/project and type/size validation |
| GET /api/private-storage, /api/media/* | private delivery | verified owner/project/admin; no public tokens |
| /api/reports/*, /api/db/* | reports/legacy CRUD | admin; sensitive raw collections denied |
| /api/supply/* | supply business flow | admin/asisten; catalog edits admin |
| /api/master/*, /api/telegram/*, /api/geo/* | work notifications/location | canonical role/actor, rate limits |

Frontend uses `/api/auth/login`, not an unprefixed `/auth/login`. Adding an unauthenticated shortcut that bypasses the existing guard is not necessary. Full 74-pattern inventory: API_AUTHORIZATION_MATRIX.md. Business data remains Firestore-based; no parallel payroll computation introduced.

## Operator audit / deployment prerequisites (not executed)

1. Confirm VPS ownership, SSH host key, API hostname/DNS and which process handles :3000/:5000. Keep remote secrets/env files out of terminal/chat output.
2. Read `pm2 list`, process cwd/ports, nginx configuration and certificate inventory into access-restricted files. Sanitize before reporting; PM2 env/nginx may contain secrets. Check existing ERP routing before planning a dedicated virtual host.
3. Confirm project `solar-erp-51870`, server-only Admin credential IAM, admin login/hash, CORS HTTPS origins, bucket identity, session/revocation sidecars and disabled accounts. Do not copy the local demo admin hash into production.
4. Review prior NO-GO blockers: leaked Telegram credential rotation, authoritative credential inventory/migration prerequisites, Storage IAM/ACL/token closure, backup/rollback, Electron/toolchain security. This task authorizes no migration or rotation.
5. Produce a verified encrypted backup and read-only expected-count inventory before any approved destructive operation. If private credentials are not provisioned, credential migration remains a separate approved stage; do not enable permissive rules/plaintext client reads.
6. Prepare a reviewed server/client/rules-compatible rollout and rollback plan. Starting server.js can start bot/cron tasks; initial verification must explicitly control background tasks to avoid unintended production writes.
7. Obtain separate production deploy approval. Only then may the reviewed hostname/certificate/proxy/server candidate be applied. No command here is an instruction to auto-deploy.
8. Run `node scripts/check-https-api.mjs https://CONFIRMED_API_HOST`; then existing admin login/session verification without creating a real user, read-only dashboard/project/worker/expense/payroll checks, compare the real 65-project baseline and totals.
9. Set `SOLARERP_HTTPS_API_ORIGIN` to that verified hostname and run `node scripts/build-real-platforms.mjs` only after backend identity/auth/data sign-off. Do not substitute a fake hostname or permit HTTP credentials.
10. Verify real Android device and isolated Windows profile flows. No production writes during smoke tests. Native/desktop login and data flows are not PASS until observed.

## Current decision

**BLOCKED / NO-GO.** Existing HTTP server responds, but new auth/staff/private-storage routing and HTTPS are not available at the audited origin. Local candidate modules and auth/hardening unit checks are ready. No upgraded functioning APK/EXE is produced while backend readiness is false. Previous artifact paths in PLATFORM_BUILDS.md remain diagnostic packages with blocked real login, not newly working releases.
