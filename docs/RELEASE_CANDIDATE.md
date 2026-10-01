# SolarERP Stage 5 ? release candidate / migration readiness

2026-10-01. **NO-GO production release.** Local fixes, emulator migration, regression tests and demo builds were completed. No production migration/storage mutation/rotation/deploy, real Firebase user changes, commit or push. Local SQL was opened read-only; its original 1,976 records were not modified. Previous stages' working-tree changes remain intact.

Latest Stage 6 decision and operator closure checklist: [FINAL_RELEASE_GATE.md](FINAL_RELEASE_GATE.md). This Stage 5 report is historical.

## A) Credential migration dry-run

`npm run test:migration`: **45 assertions PASS** against a fresh demo Firestore emulator, using a read-only copy of the existing local **13 worker + 1 assistant account** documents.

| Check | Result |
| --- | --- |
| Accounts / public plaintext before | 14 / 14 |
| Private scrypt credentials after | 14 |
| Public plaintext after | 0 |
| Correct existing password verification | 14 PASS |
| Wrong password | 14 DENY |
| Second migration | No-op; complete snapshot unchanged |
| Safe rollback | 14 correct logins PASS; 0 public plaintext restored |
| Disabled account | DENY |
| Duplicate ID / login / conflicting alias | Safe failure before writes |
| Missing/wrong backup key | Safe failure before writes |

Login counts refer to the real server account verifier on emulator documents. The browser suite separately verifies Firebase custom-token exchange. Production Firestore identities/counts are **UNKNOWN**; the 14-account result is a local copy, not authoritative production inventory.

New `scripts/credential-migration.mjs` defaults to dry-run. `--create-backup`, `--apply`, `--rollback` are separate explicit actions. CLI requires a `demo-*` project and loopback Firestore emulator; production CLI access is intentionally unsupported. Apply cannot run without decrypting a verified, project-bound backup whose snapshot digest matches current data. Account updates are atomic, query/sidecar reads detect concurrent edits; no blind overwrite. Max reviewed batch: 100 canonical accounts. New accounts or nontrivial aliases require review.

Reports contain hashed account references, old/new state and migrate/no-op actions; no passwords, salts/hashes, logins or credential values. Public sensitive fields are recursively removed while retaining business fields/types. Existing valid private hashes take precedence and are preserved. Invalid or missing usable credentials block migration; PIN-only credentials are not guessed.

Hash implementation is shared with staff edits and login: **scrypt N=16384, r=8, p=1, 64-byte key, random 16-byte salt stored as hex, 64MiB maxmem**, timing-safe comparison. Salt is passed as its hex string to preserve compatibility with the established hash format. `ADMIN_PASSWORD_HASH` supports the same record format and takes precedence over legacy admin password.

## B) APPLY / rollback status

**APPLY ran only on emulator copies. Production APPLY NOT RUN.** No production credentials/access were available in the inspected local configuration.

Backup: AES-256-GCM, random 12-byte IV, authenticated ciphertext, random 32-byte key supplied through maintenance-only `CREDENTIAL_BACKUP_KEY_BASE64`; exclusive-create prevents overwriting a backup. Keep key in a separate protected store; restrict backup directory ACLs on Windows/server. Test keys are ephemeral and not logged/persisted. Backup decryption/digest is checked before mutations.

Rollback is an **authentication compatibility rollback**, not a full database rewind: restore the original valid credentials into server-only hash storage, keep public profiles clean and rotate sessionVersion. It refuses post-migration profile/password edits or concurrent changes; no later disable/edit is overwritten. It never reintroduces plaintext or permissive rules. Full encrypted snapshots retain original data for an authorized forensic/manual recovery; no full production restore was attempted.

Production defaults reject plaintext worker fallback. A temporary explicit `ALLOW_LEGACY_PLAINTEXT_LOGIN=true` can support a reviewed transition; release checks require `false`. Removal sequence: authoritative inventory ? validated backup/dry-run ? authorized production runner/review ? hash verification ? public-field cleanup ? `false` ? remove the fallback branch in a follow-up release. Do not deploy hash-only login before existing accounts are reconciled/migrated.

## C) Storage public access

**A real emulator demonstration showed old token URL = public HTTP 200 despite deny rules.** Token rotation made the old URL DENY; deleting a backed-up synthetic object made its URL DENY. Emulator final-token deletion rotates to another token, so actual production token removal is **NOT verified**.

Private delivery architecture now avoids Firebase client metadata reads that can expose/mint a public URL:

| Operation | Authorization / result |
| --- | --- |
| Firebase client read/write/metadata/download-URL | DENY for all roles (`storage.rules`) |
| `POST /api/upload/private-image` | Verified custom session, current account/version, signed owner, assigned project/attendance, bounded validated JPEG/PNG/WebP |
| `GET /api/private-storage?path=...` | Verified session; own owner/project, admin authorized scope; bounded typed image, private/no-store |
| Disk media/video | Existing verified `/api/media` plus metadata ownership/project |
| Exports | Existing admin-only verified API |

Frontend upload client and `PrivateMedia` now use bearer server endpoints, not `getDownloadURL()`/SDK blob access. New Admin/GCS uploads create no public ACL/token; token metadata is explicitly empty and verified before returning the reference. Server rejects unsafe bucket configuration: **uniform bucket-level access + public access prevention enforced**. Emulator exception requires both demo app project and loopback storage emulator. Existing objects/ACL/IAM were not changed.

`npm run test:storage`: **23 deny assertions PASS**. `npm run test:private-storage`: **19 assertions PASS**, including old-token bypass/rotation, new token-free upload, unauthenticated read denial, signed own-project upload/read ALLOW and foreign owner/project DENY. Tests use synthetic media; the destructive delete follows encrypted metadata/content backup.

Offline source and local SQL audit: 1,976 local SQL documents scanned; **0 direct Firebase/GCS URLs found**. This does not prove live Storage is private. Production object list, ACL, bucket IAM, stored download tokens, signed links, CDN/VPS static aliases and expiry are **UNKNOWN**. `scripts/storage-access-audit.mjs --input OFFLINE_STORAGE_INVENTORY.json` provides value-free per-object hashed diagnostics; no APPLY/network support.

Required authorized Storage closure plan: encrypted backup of metadata/object versions and reference mapping ? offline per-object token/IAM/ACL dry-run ? review public bindings/PAP/uniform access impact ? map authorized `private-storage:` references without guessing ownership ? remove every legacy download token with metadata-generation preconditions or re-upload into token-free private objects ? verify old token/ACL/signed/public URLs denied and bytes retained ? purge public CDN caches and retire legacy aliases. Do not restore leaked old tokens during rollback; preserve private access and object versions. PAP protects public IAM/ACL, while Firebase token revocation is a separate task.

## D) Secret inventory / rotation

Read-only scan covered repo/config files, current web/Android JS assets, an existing unpacked desktop artifact, and **545 reachable git-history blobs**, with no large blob skipped. Secret values were never printed. Unreachable/deleted remote history, remote artifacts and secret stores were not inspected.

**HIGH: Telegram credential was found in `backend/config.js` git history and an old `desktop-dist-new/.../backend/config.js` artifact.** The source's hardcoded literals were removed; history and old artifacts were retained for safe review. `VITE_BOT_TOKEN` is still present in local `.env` / old `desktop-build.env`; those real/local secret files were not rewritten or rotated. The new build does not contain their values.

| Credential / env | Usage / storage | Status / rotation | Verification after authorized rotation |
| --- | --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | Server Telegram client/cron; historically exposed in source/artifact | HIGH; rotate required, NOT rotated | Update server secret store, invalidate old token, verify authorized send/polling and deny forged requests |
| `VITE_BOT_TOKEN` | Obsolete forbidden browser alias | Remove from build env; same historical bot credential | New/old distributables scan and old-token denial |
| `FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON` / `GOOGLE_APPLICATION_CREDENTIALS` | Server signing/AdminSDK | Local missing; production unknown | IAM least privilege, project match, custom token verification, session/API/storage smoke; old key deletion only after validation |
| `ADMIN_PASSWORD_HASH` / `ADMIN_PASSWORD` | Server admin login | Missing locally; hash preferred; production unknown | Correct/wrong login and admin session rotation; no browser field/bundle value |
| `CREDENTIAL_BACKUP_KEY_BASE64` | Offline maintenance backup encryption | Missing locally; provision separately before real migration | Verified encrypted backup restore drill; protect key and backup separately |
| `MONTHLY_REPORT_FETCH_SECRET` | Optional server external-report fetch | Not configured locally | External upstream authorization test |
| Legacy monthly/daily report / supply secrets | Obsolete route bypass credentials | No active bearer bypass; remove obsolete configuration after review | Authenticated role tests; no frontend secret |
| SMTP / third-party API / separate JWT signing secret | No configured secret found in scanned env | Production unknown; Firebase Admin key signs current auth tokens | Inventory actual production stores before release |

Desktop prepare now writes an allowlist of public HTTPS/Firebase config, sets `ELECTRON_SKIP_EMBEDDED_SERVER=1`, and excludes private `data` from distributables. It no longer copies server `.env` values. Production server rejects all Firebase emulator host variables; release checks also reject emulator config. Frontend Firebase resolver reads explicit public env fields; broad `import.meta.env` object expansion was removed. Existing artifacts were not destroyed; authorized quarantine/cleanup and rotation remain required. Firebase client API key is public configuration and is not an Admin private credential.

## E) Dependency audit

Compatible updates were applied in the lockfile. Scoped `@firebase/firestore` gRPC override uses **1.14.5** to replace the pinned vulnerable 1.9.16; security/emulator regressions were rerun. No `npm audit fix --force` or unreviewed ecosystem major upgrade.

| Scope | Critical | High | Moderate | Low | Total |
| --- | --- | --- | --- | --- | --- |
| Initial full | 3 | 27 | 11 | 3 | 44 |
| Final full | 1 | 16 | 10 | 3 | 30 |
| Initial production | 0 | 4 | 9 | 1 | 14 |
| Final production | 0 | 1 | 9 | 1 | 11 |

The full audit matters: Electron is a devDependency in npm but is a shipped desktop runtime. Advisory counts include transitive propagation, not distinct exploits. Current audit snapshots are ignored `.security-artifacts/audit-{full,prod}.json`.

| Remaining critical/high packages | Exploit surface / runtime impact | Upgrade / breaking risk |
| --- | --- | --- |
| `tar` (critical) | Build/archive extraction: traversal/hardlink/symlink/file overwrite/DoS, build-host risk; not live Express route | Current 6.x chain cannot safely patch in-range; requires reviewed ecosystem updates, no 6?7 override forced |
| `@capacitor/cli` | Build-only inherited tar risk | 6?8 major; Capacitor ecosystem/Android review required |
| `@electron/rebuild`, `node-gyp`, `make-fetch-happen`, `cacache` | Native build/archive tooling inherited risk | Electron-builder/native ABI/build-tool migration |
| `electron-builder`, `app-builder-lib`, `builder-util`, `builder-util-runtime`, `dmg-builder`, `electron-builder-squirrel-windows`, `electron-publish` | Packaging/update/archive chain; build host and generated desktop artifacts | 25?26 ecosystem review; existing transitive pins prevent compatible complete fix |
| `extract-zip` | Electron/build download archive symlink traversal | Parent/runtime major or reviewed replacement; no compatible safe fix selected |
| `electron` | Shipped desktop Chromium/process isolation/navigation/sandbox risks | 33?maintained patched major; ABI, preload/navigation and packaged-app regression needed |
| `vite` | Development-server file denial/path traversal/Windows UNC disclosure | Project 5?patched major; keep dev server loopback, do not expose as production server |
| `xlsx` | Frontend Excel export paths; known parsing prototype pollution/ReDoS | npm reports no fix; vendor-supported update/replacement and export regressions needed |

`xlsx` is currently used for writing exports in two frontend services; no workbook import/read call was found in live code. This reduces the specific parsing exploit exposure by code inspection, but does not certify the dependency safe. High/critical closure criterion is **NOT satisfied**. New breaking updates were reported rather than forced.

## F) Android regression / manual checklist

Production-like demo HTTPS Vite build, Capacitor sync and offline Gradle `assembleRelease` PASS. Unsigned artifact: `android/app/build/outputs/apk/release/app-release-unsigned.apk`; uses demo Firebase and `https://api.example.invalid`, not a production-ready install. Cleartext/mixed-content/backup disabled, verified by `test:release`. No connected device and no AVD; no native install was attempted.

Native staging sign-off remains BLOCKED. [Manual checklist](ANDROID_RELEASE_CHECKLIST.md) covers all three roles, fresh install/cold-start, token refresh/logout/disabled account, valid TLS, new private upload/download and IDOR. Mobile Chrome smoke is supplementary, not Android WebView proof.

## G) Production env readiness

Observed local env configuration only; **every production status remains unverified**. Firebase public defaults exist in shared config even where explicit client env variables are missing; production project/bucket must be explicitly reconciled. Presence does not imply validity, HTTPS reachability, correct IAM or rotation.

| Env | Local | Scope | Requirement | Production |
| --- | --- | --- | --- | --- |
| VITE_FIREBASE_API_KEY | missing | frontend | required | unverified |
| VITE_FIREBASE_PROJECT_ID | missing | frontend | required | unverified |
| VITE_FIREBASE_AUTH_DOMAIN | missing | frontend | required | unverified |
| VITE_FIREBASE_STORAGE_BUCKET | missing | frontend | required | unverified |
| VITE_FIREBASE_APP_ID | missing | frontend | required | unverified |
| VITE_API_BASE | present | frontend | required HTTPS | unverified |
| VITE_ANDROID_API_BASE | present | frontend | required Android HTTPS | unverified |
| FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON | missing | server | required OR credential file | unverified |
| GOOGLE_APPLICATION_CREDENTIALS | missing | server | required OR JSON | unverified |
| FIREBASE_STORAGE_BUCKET | missing | server | required | unverified |
| ADMIN_LOGIN | missing | server | required | unverified |
| ADMIN_PASSWORD_HASH | missing | server | recommended; OR ADMIN_PASSWORD transition | unverified |
| ADMIN_PASSWORD | missing | server | transition-only | unverified |
| ALLOW_LEGACY_PLAINTEXT_LOGIN | missing | server | false after migration | unverified |
| ADMIN_SESSION_VERSION | missing | server | optional rotation epoch | unverified |
| TELEGRAM_BOT_TOKEN | present | server | required Telegram | unverified |
| TELEGRAM_GROUP_ID | present | server | required Telegram | unverified |
| CORS_ORIGINS | missing | server | required browser production allowlist | unverified |
| CREDENTIAL_BACKUP_KEY_BASE64 | missing | server/maintenance | required migration backup | unverified |
| DATABASE_URL | missing | server | optional; SQLite fallback | unverified |
| MONTHLY_REPORT_FETCH_SECRET | missing | server | optional external report source | unverified |
| SUPPLY_ADMIN_TOKEN | missing | obsolete | unused; remove | unverified |
| VITE_BOT_TOKEN | present | frontend forbidden | must remove/rotate | unverified |
| VITE_MONTHLY_REPORT_SECRET | missing | frontend forbidden | must remove/rotate | unverified |

`release-config.mjs` checks HTTPS bases, explicit Firebase config, matching server bucket, admin hash, server credential source, client-secret absence, hash-only flag, Telegram/CORS/backup config without network/SDK initialization or value output. Live TLS, credential readability/project/IAM, rotation and device sign-off are separate gates. It does not infer GO from local variable presence.

## H) Full test summary

| Suite | Result |
| --- | --- |
| Auth server/frontend + live server isolated smoke | PASS |
| Account security | PASS |
| Firestore authorization | 84 PASS |
| Firebase Storage direct-client denial | 23 PASS |
| New private Storage API/token tests | 19 PASS |
| API/session/media/cache hardening | 62 PASS |
| Migration | 45 PASS; 14 accounts preserved |
| Release config / desktop / Android static | PASS |
| Payment retry/idempotence, balance/month-worker separation, attendance/history/month salary | PASS |
| Supply calculation/catalog regression | PASS |
| Actual Chrome role + cold-start + private upload/render | PASS: admin/usta/asisten + mobile usta, hash-only login, private upload/blob rendering, cold-start/logout, 0 uncaught JS errors |
| Frontend production-like build | PASS (large-chunk warning remains) |
| Android release build | PASS (Gradle deprecation warning remains) |
| Real Android / production HTTPS | NOT RUN / UNKNOWN |

Browser tests use actual UI, hash-only emulator accounts and actual protected upload/blob routes; no production SQL/Telegram sends. Emulator-only generated signing keys avoid real credential/metadata discovery. Initial test failures (BOM encoding and test-only React CJS import) were corrected; final status below refers to corrected reruns.

## I) Remaining blockers

1. Authoritative production Firestore credential/alias/duplicate inventory, protected backup and separately reviewed/authorized production runner/cutover have not happened. CLI remains demo-only.
2. Production object tokens, IAM/ACL/PAP/uniform access, URL/reference ownership migration and CDN/static-link revocation remain unknown. Emulator cannot prove real token removal.
3. Historically exposed Telegram secret has not been rotated; old `.env`/artifact exposure must be removed from distribution and old credentials invalidated. Production Admin/admin-hash/bucket/CORS/backup configuration unknown/missing locally.
4. Critical/high toolchain/desktop/Excel dependencies remain. Runtime/build exploitability review and tested supported upgrades are required.
5. Real native Android/staging role, refresh, upload/download and cold-start tests unavailable. Actual production HTTPS/TLS/proxy authorization not confirmed.
6. Earlier business-integrity blockers remain: own attendance is client-attested, not physical/date attestation; server-attested points/award flow may be needed. Identity authorization does not prove attendance validity.
7. Coordinated server/frontend/Storage-rules rollout is required: new client uses server media endpoints and fully closed Storage client rules. Remote-only desktop change requires staging smoke. Do not deploy one layer independently.

## J) GO / NO-GO

**NO-GO.** The local migration, private-delivery design, safe dependency updates, tests and demo candidate build are ready for review. Production release conditions remain unproven or blocked as above. No production permission is inferred from this result.

## K) Release order

There is no approved GO release sequence to execute now. After blockers are explicitly closed: review/sign off dependency fixes ? provision/rotate protected production secrets ? verify authoritative snapshots and recovery ? reviewed production dry-run ? obtain explicit migration approval ? apply credential/private-object cutover under controlled access ? verify old credentials/URLs fail and account/business data retained ? stage coordinated API/client/rules candidate ? complete real Android/browser/TLS sign-off ? issue a separate GO decision and authorized deployment plan. This report authorizes no deploy or APPLY.

Changed Stage 5 files: new migration/passwordHash/privateStorage/privateStorageApi modules; auth verifier/staff hashing and production emulator guard; operation scopes and private media upload router; frontend private upload/render and explicit public Firebase config; Storage rules; desktop env/packaging guard; migration/storage/release/browser/audit scripts; package/lock/env example; `backend/config.js` hardcoded-secret removal; documentation. Prior stages' diffs are preserved.

References: [Firebase Admin Storage download URL errors](https://firebase.google.com/docs/reference/admin/node/firebase-admin.storage), [GCS public access prevention](https://docs.cloud.google.com/storage/docs/public-access-prevention), [GCS access control](https://docs.cloud.google.com/storage/docs/access-control).
