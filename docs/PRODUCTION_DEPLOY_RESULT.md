# Authorized backend rollout — 2026-10-01

Decision: **PARTIAL**, not a functioning authenticated/native release yet.

## Applied, scoped changes

- Backend source release `4807c0e81d66849a9f9517d1b4cc59bfbd9173c3` pushed to origin/main and deployed by archive to `/root/solar-erp`. Runtime data and env files were excluded from extraction. Remote Git HEAD is historical; `.deployed-release` identifies the deployed source archive.
- Verified production npm ci --omit=dev --ignore-scripts completed (10 reported production dependency vulnerabilities: 9 moderate, 1 low). No new native-module build was needed for observed startup/health.
- Only solar-erp was restarted. PM2 online on loopback :3000; other apps retain their previous restart counts.
- Server-only .env mode 0600 sets real project/bucket, loopback bind, production mode, explicit frontend origins and disabled background tasks for initial smoke. Existing secret values were retained, not logged or committed. Firebase Admin credentials are absent; none were fabricated.
- Trusted Let's Encrypt IP-SAN certificate provisioned with isolated Certbot 5.8.0 under /opt/solarerp-certbot. Existing system Certbot 2.9.0 was not replaced. TLS certificate expires 2026-10-08 07:15:52 UTC; dedicated solarerp-cert-renew timer checks only this certificate every six hours. Renewal dry-run outcome must be reviewed separately.
- IP HTTPS nginx virtual host proxies /api and /status to loopback :3000. IP is the TLS default because IP clients omit SNI; existing hostname-specific Ballon TLS vhost remains selected by SNI. Existing shared HTTP /api -> :5000 is unchanged. Only an ACME challenge location was added to default HTTP; no business paths were replaced.
- Automatic approval review rejected a combined startup command because global pm2 save persists every application. It was not executed. A safer dedicated SolarERP-only certificate timer was separately accepted and installed. Existing pm2-root startup remains enabled; the new PM2 restart policy has not been persisted to the global dump.

## Preserved remote changes / rollback

Backup: `/root/solar-erp-release-backups/20261001T161134Z` (restricted directory): code/config archive, nginx archive, private PM2 snapshot, original modified package-lock.remote.json and SQLite online backup supply-database.db. Remote supply DB was not overwritten; all table row counts still match its pre-rollout backup. Production dependency lock was upgraded intentionally; previous custom lock remains available for review/rollback. No reset/clean or destructive migration occurred.

## Verification

- Public trusted HTTPS route preflight PASS: /status 200; /api/auth/session, /api/staff/workers, /api/private-storage 401.
- Generic invalid login 401; forged bearer session 401. These negative tests do not prove authorized login.
- Real server Admin initialization returns FIREBASE_ADMIN_CREDENTIALS_MISSING. Custom token, valid ID-token verification, authorized staff/private media and Firestore reads are BLOCKED.
- Expected real project count 65 is not verified. Worker counts/dashboard are likewise unknown; no substitute dataset or insecure access was used.
- Local auth/frontend/server tests PASS; account security PASS; hardening 62 PASS; payroll four suites PASS; fresh isolated demo Firestore 84 PASS, Storage 23 PASS, private media 19 PASS.
- Browser admin/usta/asisten plus mobile usta flows PASS in isolated demo emulator (production builds never use it): navigation/private media/refresh/logout/relogin/role isolation. Console contains intentionally blocked external fonts, expected 403 denial and forced SDK-signout subscription permission logs; zero uncaught page errors. Real production browser roles remain blocked by credentials.
- No production Firebase user/account creation, data migration apply, Firebase rules deployment or Storage ACL/token mutation.

## Remaining requirements

1. Provision actual service account for solar-erp-51870 via GOOGLE_APPLICATION_CREDENTIALS (restricted file) or FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON on VPS; no secrets in chat/Git/frontend. Review IAM/private bucket settings and current server account-security prerequisites.
2. Set server admin account/hash and migrate legacy credentials only after verified encrypted production backup and safe dry-run. Current migration tooling is intentionally demo-only; it was not bypassed or applied to production.
3. Run existing-user authorized smoke without implicitly creating a real Auth user. Verify actual 65 projects, workers/dashboard, session revocation and private media. Preserve business data.
4. Resolve historical Telegram credential exposure, production rules/Storage closure and desktop/toolchain vulnerability/signing risks recorded in FINAL_RELEASE_GATE.md. Background tasks remain disabled.
5. Only after authorized smoke PASS, write a non-secret, fresh production smoke receipt with projectId, apiOrigin, checkedAt, realAdminLoginVerified, productionDataVerified and privateMediaVerified. Pass its path via SOLARERP_AUTHORIZED_SMOKE_RECEIPT and HTTPS origin via SOLARERP_HTTPS_API_ORIGIN to build-real-platforms.mjs. Public 401 preflight alone no longer permits final client builds.

No new final APK, portable EXE or installer was produced while authenticated backend/data/media remained blocked. Previous artifacts remain diagnostic packages and are not this deployment's final builds.
