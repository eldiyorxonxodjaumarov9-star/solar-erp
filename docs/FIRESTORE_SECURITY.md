# Firestore authorization — Stage 3 audit and rollout plan

This report describes local code changes, not a deployed configuration. No production database, account, Firebase user, migration, deployment, commit or push was performed. Existing Stage 1–2 changes were preserved. Collection inventory is from source code, not a production data export.

## A. Previous security

`firestore.rules` gave known collections `request.auth != null` and repeated it in a recursive wildcard. Anonymous Firebase accounts therefore had broad access. The wildcard also bypassed narrower owner checks. Frontend filtering could not secure payroll, salary history or credentials.

`workers.password`, legacy `users.password` and `assistants.password` were used for login. Worker/assistant storage and edit forms previously retained these values. Old generic `/api/db` CRUD, import, sync, points and in-memory CRUD were unauthenticated. `server/firebaseServer.js` and `server/telegramMessageFirestore.js` used anonymous client SDK connections.

Other sensitive source fields: local admin credentials (`solar-erp-admin-credentials`, historical only after Stage 2), and equipment credentials at `projects.stages[handover].inverter.password/key` and photo/upload inverter payloads in `UstaLoyihalarPage.jsx`. Equipment credentials are not ERP account passwords; their separation is still required. Actual production field presence was not queried.

## B. New permission matrix

All Firestore client grants require a Firebase-verified token: provider `custom`, `role`, `accountId`, canonical UID `role:accountId`, and matching `workerId`/`assistantId` for those roles. Unauthenticated/anonymous clients and unknown collections are denied. No document role/workerId or browser storage can create authority.

| Collection | Admin | Usta | Asisten |
| --- | --- | --- | --- |
| workers | Credential-free read/write; all profiles through sanitized staff API | Own credential-free profile read only | Minimal worker directory through staff API, no salary/credentials |
| assistants | Credential-free read/write; staff API | Denied | Own credential-free profile read only |
| users, accountCredentials | Client denied; server Admin SDK only | Denied | Denied |
| expenses payroll | Full CRUD | Read where payrollWorkerId equals signed workerId; no write | Denied |
| expenses operational | Full CRUD | Own author read; narrow CRUD for assigned project and Materiallar/Transport/Ijara/Boshqa | Denied |
| projects | CRUD | Assigned projects read; restricted progress/status/stages update, no assignment changes | CRUD for existing project management flow |
| commercialOffers, heatPumpForms, supplyCalculations | CRUD | Denied | CRUD for existing business flow |
| brigades, instructions | Read/write | Read | Read |
| project_worker_days | CRUD | Denied | Denied |
| points | CRUD | Own read only | Denied |
| user_activity_logs | CRUD | Own read/create; only logout fields update | Own asst_ID read/create; logout fields update |
| attendance | CRUD | Own read/create/update | Own asst_ID read/create/update |
| stage_photos | CRUD | Own read/create/update/delete | Own asst_ID read/create/update/delete |
| work_logs | CRUD | Own read/create/update; no delete | Denied |
| projectSteps | CRUD | Own pending upload to assigned project; no approval | Read |
| project_stage_locks | CRUD | Assigned project document read; no write | Read |
| jalbalar | CRUD | Own read and status/timestamp update | Denied |
| complaints | CRUD | Own read | Denied |
| usta_yorijnoma | CRUD | Own signed instruction read/create/update, fixed doc ID/workerId | Denied |
| telegram_messages, telegram_events, telegramAttendanceLogs, dailyAttendanceReports | CRUD | Denied | Denied |
| All unknown collections/subcollections | Denied | Denied | Denied |

Operational expense writes are an explicit exception required by `UstaXarajatlarPage.jsx`: author is the signed worker, project must already be assigned, amount must be positive, fields/types are allowlisted, and payroll relation fields are forbidden. Labour/payroll writes remain admin-only. `ustaId` retains author semantics.

Firestore cannot hide individual fields on a permitted document read. Raw profiles containing known credential fields are denied even to admin clients. The server returns allowlisted fields, recursively removes credential fields, and scopes staff responses using its verified session. Admin CRUD on sanitized staff data uses Admin SDK; new or explicitly changed passwords are hashed into server-only `accountCredentials/{role}:{id}`. Existing plaintext profiles remain untouched until an approved migration.

## C. Files changed in Stage 3

- `firestore.rules`, `firebase.json`, `package.json`, `package-lock.json`: claims, deny-by-default policies, local emulator/dependency/scripts.
- `server/authMiddleware.js`, `server/routes/staffApi.js`, `server/authAccounts.js`: bearer verification, sanitized staff API, private scrypt password hash precedence with legacy compatibility.
- `server.js`, `server/routes/dbApi.js`: authenticated REST gates, admin CRUD/report routes, raw credential CRUD/sync blocked, unused legacy SQL/anonymous login removed.
- `server/firebaseServer.js`, `server/telegramMessageFirestore.js`: existing lazy Admin SDK reused; no anonymous server connection.
- `src/firebase/firestoreCrud.js`, `src/firebase/queryAccess.js`: scoped list/live queries; staff calls use protected server; profiles poll every 15 seconds.
- `src/api/http.js`, `src/api/secureTransport.js`, `src/api/localFallback.js`: bearer headers, production HTTPS check, no permission-error fallback.
- `src/hooks/useWorkers.js`, `src/hooks/useAssistants.js`, `src/hooks/useExpenses.js`, `src/hooks/useSalaryReportData.js`: safe profile adapter, no ghost profile writes/cached account restores, no expense cache merge across accounts.
- `src/workers/workerStorage.js`, `src/assistants/assistantStorage.js`, `src/pages/UstalarPage.jsx`, `src/pages/AsistenlarPage.jsx`: no cached account passwords; empty edit password means keep server credential.
- `scripts/test-firestore-rules.mjs`, `scripts/test-account-security.mjs`, mock compatibility updates in `test-auth-login.mjs`, `test-payroll-payment.mjs`.
- `docs/FIRESTORE_SECURITY.md`, `docs/ARCHITECTURE.md`: current security report and historical architecture notice.

Other working-tree changes belong to earlier salary/auth stages and were not discarded.

## D. Local security results

`npm run test:rules`: **80 assertions passed**, using only localhost Firestore Emulator, explicit project `demo-solar-authorization`. Script refuses to run without a loopback emulator. Requires Firebase CLI and Java (verified locally with CLI 15.19 and Java 21); no real project configuration is used. Includes admin worker read/write, own profile/payroll, assistant project/offer/own activity, unauthenticated and anonymous rejection (anonymous token even uses canonical admin UID), cross-worker denial, rate/role/password mutation denial, payroll mutation denial, forged document identity, forged localStorage, private credential denial, operational expenses, signed instructions, actual scoped OR queries and deny-by-default.

`npm run test:security`: passed mocked server middleware/staff API/scrypt/scoped-query/fallback/HTTPS checks. No real Firebase users or service requests. `npm run test:auth`: passed Stage 1–2 server/frontend tests. Attendance, monthly salary, payment retry and monthly payment tests passed. Payment scripts using VM modules require `node --experimental-vm-modules`.

`npm run build`: passed. Existing warnings: Browserslist data age and large Vite chunks. Server files passed `node --check`. Frontend verification here covers build, auth hook mocks and report/payment tests, not a live production browser or Android device.

## E. Query changes and intentional restrictions

- Previously unrestricted projects queries now constrain ustaId/assignedWorkerId/assignedWorkerIds; expense queries constrain payroll recipient or operational author; personal activity/photo/work-log queries constrain signed identity.
- Raw `workers`/`users`/`assistants` snapshots cannot safely serve legacy credentials. Staff reads/edits now use `/api/staff`, backed by the same Firestore data; no parallel payroll SQL calculation was added. Safe profiles refresh every 15 seconds rather than raw credential snapshots.
- Salary report own rate/history uses sanitized profile adapter; activity/payment snapshots remain scoped Firestore. Payment loading errors still remain errors, not zero.
- Permission/auth failures cannot fall through to SQL/localStorage. No automatic legacy payroll linking or ghost worker restoration.
- Worker/assistant generic `/api/db` operations, sync/import, points writes and stage-lock writes are blocked; these flows need dedicated server operations with project ownership and allowed transition checks. Server-signed-instruction workflow and narrowly scoped ordinary expense CRUD remain available.
- Shared crew-photo visibility is now restricted to own photos; assistant cannot read all worker attendance/payroll or use admin attendance REST reports. If business needs broader visibility, implement explicitly scoped approved views; do not relax payroll rules.
- Public plaintext Android API fallback is intentionally rejected in production until HTTPS is configured. Admin browser cannot read legacy passwords; password field is blank when editing.

## F. Remaining risks and REST/transport audit

Protected now: `/api/staff` with verified owner/role; `/api/db` admin-only (raw account/credential CRUD, imports and sync blocked); in-memory projects/brigades/expenses/work_logs admin-only; obsolete `/api/workers` denied; `/api/reports` and Telegram monthly/daily attendance reports admin-only. Telegram, upload and master route groups require verified nonanonymous sessions. Existing supply write/price controls use verified admin bearer.

**Do not equate authentication of Telegram routes with full record authorization.** `/api/telegram/log-event`, work-log/photo, expense-log, stage/project photos, yorijnoma and `/api/master/mark-login` still consume client identity/project/document/date payloads. They need operation-specific actor binding, assignment validation, immutable IDs and allowed transitions before Admin SDK writes/Telegram sends. These writes bypass Firestore rules. Implement a dedicated authorized service rather than broadly accepting caller IDs; this larger redesign was reported rather than silently changing business semantics.

Public routes still include `/status`, `/api/geo/approx`, `/api/geo/reverse`, static `/api/media` and optional `/api/telegram-export`. Supply public catalog may remain public by design, but writes/prices require admin. Private photos/export files require authenticated, scoped download URLs and cleanup of old public links. Geo/upload/Telegram routes also need abuse limits and upload-content validation.

`storage.rules` remains `request.auth != null` for stage-videos, including anonymous accounts. It was audited as a remaining risk, not changed as part of the requested Firestore rules. Client direct Telegram fallbacks also need a separate audit/removal of any frontend bot credentials.

Existing tokens can retain old claims after account disable/password/role changes. Plan server account-state checks plus session revocation/forced refresh; ID-token revocation on server is already checked, but Firestore rules do not automatically observe account disable in profile fields. Client-controlled own attendance/activity creates still require server attestation/date validation for payroll integrity; owner rules alone do not prove attendance occurred.

Legacy browser caches may already contain historical credentials or other users' personal data. New profile/expense readers do not grant permission from them; purge old caches on approved rollout and replace remaining global offline caches with session-keyed sanitized storage. Account password hashing does not erase old profile plaintext by itself.

HTTP findings: `src/api/apiBase.js` hardcodes `http://77.237.237.94`; `.env.example` has the same VITE API examples; `capacitor.config.json` enables cleartext/mixed content. `src/api/secureTransport.js` rejects public HTTP in production before sending login credentials/ID tokens. Loopback HTTP remains for local desktop/dev; nonlocal HTTP is allowed only in development. Actual VPS certificate/proxy and production environment were not remotely inspected. Configure a valid HTTPS API hostname; remove cleartext/mixed-content allowances for release builds after testing. Do not assume the existing IP has a working certificate.

## G. Credential migration plan — NOT executed

1. With explicit production migration authorization, take encrypted server-only backups of workers/users/assistants and SQL/local legacy sources. Produce a dry-run manifest with IDs, duplicate logins, statuses and missing credentials; never print passwords.
2. Confirm canonical document IDs, login aliases and roles. Keep uid `usta:workerId` / `asisten:assistantId`; keep payrollWorkerId unchanged. Resolve duplicate identities manually. No Firebase user creation/deletion is needed for this data separation.
3. Hash each existing password with unique random salt and scrypt into `accountCredentials/{role}:{id}` via Admin SDK, using idempotent per-account transactions/checkpoints. Preserve password text accepted by login. Server reads private credentials first; existing legacy fallback is temporary and disabled when a private record exists, including invalid private records.
4. Verify old credentials against migrated hashes in isolated tests/dry-run; verify disabled state, account mapping and all role login paths. Roll out sanitized staff API before denying raw profile reads.
5. Only after verification, transactionally remove password/pin/credential/hash/salt/security fields from public profile documents and legacy aliases. Do not copy credentials into salaryHistory, public documents, browser caches or logs. Move equipment secrets to separate server-only project secret documents with scoped retrieval if needed.
6. Purge legacy browser/offline caches, backups and exports according to retention policy. Remove plaintext fallback once every account has a verified private hash; revoke old sessions and remove obsolete client anonymous sign-in provider access.
7. Rollback restores server-private credentials from protected backups; never reopen client rules to restore credential visibility. Migration approval and operations are separate from this local code change.

## H. Before production deployment

- Review/approve matrix and intentional business restrictions; resolve Telegram actor/record authorization and private media/Storage risks above.
- Verify server-only Admin credentials/project/IAM, ADMIN_LOGIN/ADMIN_PASSWORD, rate-limit/proxy settings and environment separation. No service-account JSON/private key in VITE variables or bundle.
- Set real HTTPS API URL; validate certificate, proxy, browser/native CORS and signed downloads; remove release cleartext allowances.
- Authorize, dry-run and verify credential migration/backup/cache purge; keep raw legacy documents denied until sanitized.
- Repeat demo-emulator rules tests and all auth/security/payroll tests; verify browser/Android flows for each role and multi-worker project, denied operations, logout/account switching and revoked sessions.
- Confirm Firestore query indexes if production prompts for scoped queries; scope queries further instead of weakening rules.
- Coordinate server/frontend/rules rollout and rollback; monitor 401/403/permission-denied without credential logging. No deployment was done here.


Stage 4 API, Storage, session hardening and current rollout blockers: [PRODUCTION_SECURITY.md](PRODUCTION_SECURITY.md). Earlier remaining-risk notes are historical.
