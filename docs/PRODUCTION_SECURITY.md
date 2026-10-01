# SolarERP 4-bosqich security report ? 2026-10-01

Production data, Firebase real users/accounts o'zgartirilmadi. Migration APPLY, deploy, commit va push bajarilmadi. Oldingi 1?3 bosqich working-tree o'zgarishlari saqlandi.

## A) API authorization matrix

[To'liq endpoint jadvali](API_AUTHORIZATION_MATRIX.md): 72 live method/path pattern; compatibility alias bir xil policy bilan normalizatsiya qilinadi. `server.js` live entrypoint, dormant Mongo routerlar live emas. Private `/api` endpointlari katta body parsingdan oldin Firebase ID bearer, custom-provider, canonical UID/claims, active account va session version bilan tekshiriladi. Faqat ikki POST login alias credentials tekshiradi; 16KB JSON, generic failure va rate limit. Preflight auth bermaydi.

| Scope | Admin | Usta | Asisten | Ownership |
| --- | --- | --- | --- | --- |
| Staff / reports / export / SQL generic CRUD | Ruxsat, raw credentials CRUD deny | Deny | Deny | Server account yoki admin |
| Master | Ruxsat | O'z hisobi | Deny | Verified worker identity |
| Telegram business / uploads | Ruxsat | O'z actor + assigned project | Ruxsat etilgan business scope | Body/chat ID authorization emas |
| Supply catalogs/history | Ruxsat | Deny | Business catalog + own history | `createdByUid` serverdan; legacy history admin |
| Private media | Ruxsat | Own owner + assigned project | Own owner + business project | Server metadata yoki private Storage path |
| Payroll | Ruxsat | Own read | Deny | Verified worker claim; write admin |

Public Telegram webhook yo'q: mavjud inbound polling va cron server-internal. Browser uchun umumiy bot-send yoki internal-secret bypass qo'shilmadi.

## B) IDOR va ownership fixlari

`server/operationAuthorization.js` worker/assistant identityni signed sessiondan oladi, forged workerId/ustaId/userId/ownerId/uid/role va foreign nested metadata'ni deny qiladi. Project assignment haqiqiy Firestore projectdan tekshiriladi. Event ID UID bo'yicha namespace qilinadi; foreign mavjud event overwrite deny. Usta/asisten payroll category yoki relation yaratolmaydi. Supply history ownership serverdan olinadi, boshqa/legacy history mutate deny. Media tashqi URL fetch olib tashlandi (SSRF); private reference va project scope tekshiriladi. Multipart MIME, magic signature va hajm tekshiriladi.

Bosqich tugallanishi Telegram rasmlari muvaffaqiyatli yuborilgach `server/confirmedStage.js` transaction orqali server identity bilan saqlanadi; client stage-lock write qayta ochilmadi. Takror bir bosqichni yana yozmaydi.

## C) Storage oldin/keyin

Oldingi permissive/public access va token URL rendering o'rniga default deny. `storage.rules`: custom claims + canonical UID + current security version; private owner/project path; assigned worker project; 10MB JPEG/PNG/WebP va extension/contentType checks. Anonymous, cross-user, executable/invalid type va legacy write deny. Admin legacy read mumkin. Server video MP4/MOV signature bilan 50MB; server-only media metadata.

Yangi frontend `getDownloadURL()` bermaydi: `private-storage:` reference + authenticated SDK blob yoki bearer `/api/media`. Blob URL cleanup bor. `/api/media` static public access olib tashlandi, export admin-only, private no-store. Server private bucket download uchun `FIREBASE_STORAGE_BUCKET` talab qiladi; yo'q bo'lsa fail-closed.

**Cheklov:** eski Firebase download tokens, public bucket IAM, old public URLs/CDN yoki VPS static alias real muhitda bekor qilinmadi. Storage Rules mavjud token URL'ni revoke qilmaydi. Yangi obyektlarda ham token metadata mavjud bo'lsa token URL bearer authorizationni chetlashi mumkin: production oldidan upload/token policy va authenticated delivery tekshirilib, public tokens olib tashlanishi kerak. Cross-service Storage?Firestore permission va bucket CORS stagingda tekshirilsin. Fieldlarni yashirishga tayanilmaydi.

## D) Session/revocation

`server/accountSecurity.js`: private `accountSecurity/{uid}` metadata, random sessionVersion; disabled/status/current profile checks. Password/login/security edits staff API atomic batch orqali versionni almashtiradi va refresh tokens revoke qiladi. Server ID verification revoked check qiladi; Firestore va Storage metadata versionni tekshiradi. Admin rotation internal-only helper yoki `ADMIN_SESSION_VERSION`; real rotation bajarilmadi. Direct client security-field edits deny.

AuthContext UI role'ni verified sessiondan oladi; localStorage privilege manbasi emas. Logout/private session failure biznes cache'larini tozalaydi. Token refresh, focus va 60 sekund interval server sessionni tekshiradi. UI intervalgacha eski ko'rinish qolishi mumkin; server/rules authorization version tekshiruvi bunga ishonmaydi.

## E) HTTPS / Android transport

Production API base HTTPS bo'lmasa frontend importda fail-fast; public hardcoded HTTP IP fallback olib tashlandi. Loopback dev/Electron istisnosi. Capacitor cleartext/mixedContent false; Android manifest cleartext false, backup false; network-security base cleartext false. Production proxy HTTPS, origin allowlist va portning tashqaridan yopilganini real muhitda hali tekshirish kerak.

Frontend bot/report secrets o'qishi va secret headers olib tashlandi; Telegram credentials serverda. Live route xato loglari exception/body/token o'rniga error code, response generic. Eski buildlarda oldin bundle qilingan bot/report secret bo'lsa alohida authorized rotation va eski artifacts cleanup zarur.

## F) Security testlar

| Suite | Natija | Muhit |
| --- | --- | --- |
| `npm run test:auth` | PASS | Mock accounts + generated RSA key; actual SDK signing; live server smoke isolated |
| `npm run test:security` | PASS | Account/password/session tests, no real data |
| `npm run test:hardening` | 62 assertions PASS + confirmed-stage / dry-run checks | Actual middleware/router, mock DB/tokens, local temp files |
| `npm run test:rules` | 84 PASS | Firestore emulator demo project |
| `npm run test:storage` | 20 PASS | Firestore + Storage emulators demo project |
| Payroll / attendance / monthly scripts | PASS | Synthetic fixtures; payment retry/idempotence, month/worker separation |
| Vite production-like build | PASS | Demo Firebase + HTTPS placeholder |
| Android release Gradle | PASS | Local unsigned APK; no install/deploy |

Deny tests: missing/invalid/expired/revoked/anonymous token, wrong role, forged identity, worker B resource with worker A token, assistant admin-only route, disabled/stale session, unauthorized report/export, forged Telegram/master, public/cross-user Storage. Allow: scoped roles, admin, own resource. Hash params pinned; tests never create/delete real Firebase users.

Dependencies: Axios/Multer/websocket-driver patched within compatible ranges; Playwright dev test dependency added. Latest production dependency audit: **14 vulnerabilities: 1 low, 9 moderate, 4 high, 0 critical**. Remaining dependency risks require separate review; no force-upgrade.

## G) Browser regressiya

Actual React frontend in installed Chrome/Playwright, demo Auth/Firestore/Storage emulators, external I/O blocked/mocked. Admin login/dashboard/workers/projects/expenses/payroll/settings/logout/cold-start PASS. Usta own profile/assigned projects/allowed expenses/own payroll, foreign worker/payroll denial, forged cache denial, logout/cold-start PASS. Asisten projects/taklif/activity, payroll/settings denial, logout/cold-start PASS. No uncaught JS errors. Mobile viewport usta payroll/persistence/logout PASS. Artifacts: `.security-artifacts/browser-results.json` and screenshots (ignored local files).

This verifies real frontend with emulator data, not live SQL/Telegram transmission or production credentials. Agent-browser Windows bridge timed out; actual Chrome verification completed through Playwright.

## H) Android regressiya

`npm run build`, `npx cap sync android`, Gradle `assembleRelease` PASS. Unsigned APK: `android/app/build/outputs/apk/release/app-release-unsigned.apk`. Build uses demo Firebase and `https://api.example.invalid`, so **production-configured deliverable emas**. Bundled Capacitor config cleartext/mixedContent false.

No connected Android device and no AVD. Native WebView login, token persistence, routing, logout/cold-start, actual HTTPS/private media NOT verified; browser mobile test uning o'rnini to'liq bosmaydi.

## I) Credential migration dry-run readiness

`scripts/credential-migration-dry-run.mjs --input OFFLINE_EXPORT.json`: offline JSON only, Firebase/network/write/APPLY yo'q. Secret values/login strings logga chiqarilmaydi; collection counts, duplicate canonical identities va invalid account diagnostics only. Synthetic safety tests PASS.

Read-only **local SQL copy** (`data/solar-erp.db`) inventory:

| Collection | Documents | Plaintext password documents |
| --- | --- | --- |
| workers | 13 | 13 |
| users | 0 | 0 |
| assistants | 1 | 1 |

Local copy: duplicate logins 0, invalid ID/login 0, alias login conflicts 0. **Bu production Firestore soni emas**; actual Firestore snapshot olinmadi, production totals UNKNOWN. Account IDs/passwords reportga chiqarmadik. Public `workers/users/assistants` sensitive documents all-client deny; own profile server sanitized endpoint orqali.

Hash: scrypt N=16384, r=8, p=1, 64-byte key, random 16-byte salt, maxmem=64MiB. Apply readiness PARTIAL; actual export reconciliation va APPLY tool hali tasdiqlanmagan.

Migration plan: authorized encrypted server-private snapshot backup ? offline dry-run identities/aliases/duplicate/password conflicts ? manual canonical mapping ? server-only `accountCredentials` salt/hash + canonical UID/role + security version ? test isolated login with preserved passwords ? authorized cutover ? public credential fields removal and cache cleanup ? revoke old sessions ? verify roles. Old credentials should not be silently guessed/merged. Rollback: protected backup and server-only compatibility lookup restore, safe rules unchanged; public credentials/permissive rules qayta tiklanmaydi. Real migration, backup or rollback qo'llanilmadi.

## J) Production blockerlar

1. Authoritative Firestore credential inventory/mapping va authorized migration/cutover tugallanmagan; plaintext public documents hozir fail-closed blocked.
2. Legacy/new Storage token metadata, public IAM/CDN/static aliases va private media CORS/rules IAM production/stagingda tekshirilmagan. Bucket server env explicit sozlanishi kerak.
3. Native Android end-to-end test uchun device/AVD va HTTPS staging kerak.
4. Old client-exposed Telegram/report secret rotation, production HTTPS/proxy/CORS and multi-instance rate limit configuration tasdiqlanmagan. In-memory limit shared/distributed emas.
5. Remaining high dependency advisories; release review kerak.
6. Salary integrity: client-attested own attendance identity authorization bilan chegaralangan, ammo haqiqiy attendance/date attestation server policy bilan hali isbotlanmagan. Client award/points direct writes closed; server-attested award flow kerak bo'lishi mumkin. Stage completion server flow tiklandi.
7. Admin security changes protected staff API/rotation procedure orqali bo'lishi kerak; AdminSDK yoki console changes uchun coordinated sessionVersion/revocation operational discipline zarur. Rules deploy bilan API/frontend/storage rollout mosligi tekshirilsin. Electron package extraFiles (`desktop-build.env`, `data`) alohida tekshirilib server Admin credentials/private credential backup hech qachon distributable ichiga kirmasin.

## K) GO / NO-GO

**NO-GO production rollout.** Local hardening/tests/build PASS, ammo yuqoridagi real-environment blockers qolgan. Stagingda credential cutover, private delivery, Android roles/cold-start va HTTPS/proxy audit tasdiqlanmaguncha deploy tavsiya qilinmaydi.

Changed Stage 4 areas: `server.js`; `server/accountSecurity.js`, `operationAuthorization.js`, `confirmedStage.js`, `fileSafety.js`; auth/helper/staff/supply/private-media routes; Firestore/Storage rules and emulator config; AuthContext/privateCache; private-media components/upload clients; API HTTPS/Telegram report callers; Capacitor/Android transport; test/audit/dry-run scripts; package files; docs. Working tree also contains earlier 1?3 stage work, so git status is not exclusively Stage 4.

Firebase references: [session revocation](https://firebase.google.com/docs/auth/admin/manage-sessions), [Storage rule conditions](https://firebase.google.com/docs/storage/security/rules-conditions).


Stage 5 current migration/private Storage/dependency results and release decision: [RELEASE_CANDIDATE.md](RELEASE_CANDIDATE.md). Stage 4 SDK Storage permission descriptions above are historical; Stage 5 uses server-only private delivery.
