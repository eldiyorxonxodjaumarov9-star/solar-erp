# SolarERP — 6-bosqich final release gate

**FINAL: NO-GO.** Lokal tuzatishlar va regressiyalar PASS; production access/identity, secret rotation, Storage closure, credential migration, TLS va native Android tasdiqlanmagan. Deploy, commit/push, real user yaratish/o‘chirish yoki production APPLY bajarilmadi. Avvalgi bosqichlarning diff’lari saqlandi.

## A) Telegram secret rotation

**BLOCKED / HIGH.** BotFather boshqaruv huquqi tasdiqlanmagan; real Telegram API chaqirilmadi. Sanitized audit: 554 reachable Git blob, eski secret uchun 1 history location (`backend/config.js`) va 1 eski desktop bundle location. `.env`, `desktop-build.env`, `desktop-dist-new/win-unpacked/resources/app/backend/config.js` eski qiymatga ega; ularni distribution’dan chiqarish va credential’ni invalidatsiya qilish zarur. History rewrite bajarilmadi.

Bot cron raw error logging olib tashlandi; daily report provider error’ni log/Firestore/SQL/API’ga ko‘chirmaydi (fault-injection testi PASS). Faol 272 source faylda literal bot credential **0**. `backend/config.js` endi faqat server env’dan token/chat oladi; eski chat fallback olib tashlandi, reader joriy env’ni oladi. `server/telegramClient.js` provider description’ni error’ga ko‘chirmaydi; poller raw error yozmaydi. Faol bot/master jo‘natishlari `server.js`, `bot.js`/`telegramService.js`, `server/telegramInboundPoller.js`, `server/reports/dailyAttendanceTelegram.js`, `server/telegramClient.js` orqali server env’dan ishlaydi. Alohida master password/token topilmadi: master HTTP operatsiyalari verified Firebase session bilan himoyalangan. `src/telegram/clientTelegram.js` client bot fallback ishlatmaydi. To‘liq field/reference inventory `.security-artifacts/stage6-runtime-inventory.json`da; secret qiymati yozilmagan.

Operator tartibi:

1. Bot owner va production process/container/PM2/poller/cron ro‘yxatini tasdiqlash; jo‘natishlarni maintenance holatiga o‘tkazish.
2. BotFather’da aynan shu bot uchun eski tokenni revoke qilish va yangi token olish. Tokenni chat, issue, shell argv, log yoki Git’ga yozmaslik.
3. Server secret manager/env’dagi `TELEGRAM_BOT_TOKEN`ni yangilash; frontend `VITE_BOT_TOKEN`ni olib tashlash. Chat ID identity/auth emas.
4. Barcha server/cron/poller process’larini restart qilish: `server.js` bot config va poller tokeni startup’da capture qilinadi. Faqat bitta polling instance qolsin.
5. Secret-aware, URL’ni log qilmaydigan operator harness orqali eski token `getMe` **401/ok:false**, yangi token `getMe` **200/ok:true** ekanini tasdiqlash. Faqat status/boolean receipt saqlash. Bot identity va group permission’ni tekshirish; authorized smoke send faqat alohida tasdiq bilan.
6. Bot token’ni Firebase bearer sifatida API’ga uzatish **401** bo‘lishi kerak; yangi token ham client API credential emas. API uchun verified Firebase ID token talab qilinadi.
7. Eski artifact/build-env’larni quarantine qilish va qayta tarqatmaslik; barcha server consumers yangi secretni olganini tasdiqlash. Rotatsiyadan keyin sanitized audit qayta bajarish.

`test-stage6-release.mjs` actual Telegram send funksiyasini synthetic transport bilan tekshiradi: eski fixture **DENY**, yangi env fixture **PASS**, missing config **DENY**. Bu real provider revocation isboti emas.

## B) Production Storage closure

**BLOCKED / NOT VERIFIED.** Tasdiqlangan production project/bucket/Admin credential yo‘q. Production IAM, ACL, Rules release, eski tokenlar yoki objectlar o‘zgartirilmadi. Lokal all-client-deny Rules va bearer media delivery bor; old-token URL Rules’ni chetlab o‘tishi emulator’da isbotlangan.

Quyidagi read-only buyruqlarni operator tasdiqlangan project va access-restricted, encrypted disk’da bajaradi. `PROJECT_ID`, `BUCKET`, `PROTECTED_DIR` non-secret operator env; katalog ACL’i oldindan tekshirilsin. JSON metadata token saqlashi mumkin: terminalga chiqarilmasin, Git/upload/report’ga kiritilmasin. Exit code/pagination/errors tekshirilsin; partial listing GO emas.

```powershell
gcloud projects describe $env:PROJECT_ID --format=json > "$env:PROTECTED_DIR/project.json"
gcloud storage buckets describe "gs://$env:BUCKET" --project=$env:PROJECT_ID --format=json > "$env:PROTECTED_DIR/bucket.json"
gcloud storage buckets get-iam-policy "gs://$env:BUCKET" --project=$env:PROJECT_ID --format=json > "$env:PROTECTED_DIR/bucket-iam.json"
gcloud projects get-iam-policy $env:PROJECT_ID --format=json > "$env:PROTECTED_DIR/project-iam.json"
gcloud storage ls "gs://$env:BUCKET/**" --recursive --all-versions --exhaustive --json --project=$env:PROJECT_ID > "$env:PROTECTED_DIR/objects.json"
```

Rules uchun authenticated Firebase Rules REST read-only GET: `https://firebaserules.googleapis.com/v1/projects/PROJECT_ID/releases/firebase.storage/BUCKET`; olingan ruleset name bilan `GET https://firebaserules.googleapis.com/v1/projects/PROJECT_ID/rulesets/RULESET_ID`. Bearer server/operator memory’da, URL/log’da emas. Response protected storage’da. Rules source candidate `storage.rules` bilan aynan solishtirilsin; Console ham mumkin.

Gcloud JSON wrapper/snake-case formatini `storage-access-audit.mjs` kutadigan `{iam, iamConfiguration, objects}` shakliga operator adapter bilan normalize qiladi; raw output’ni to‘g‘ridan-to‘g‘ri uzatib empty count’ni PASS demaslik. Har object metadata/ACL to‘liq emas bo‘lsa object `describe --format=json` bilan protected file’ga to‘ldirish. `node scripts/storage-access-audit.mjs --input NORMALIZED_PROTECTED_INVENTORY.json` faqat sanitized count/ref qaytaradi, APPLY qilmaydi.

GO uchun: project/bucket match; project+bucket IAM’da `allUsers/allAuthenticatedUsers` yo‘q; uniform bucket access **enabled**, public access prevention **enforced**; private live va old-version object’larda public ACL/token **0**; old private references/CDN/proxy caches inventarizatsiyasi; Rules active candidate bilan mos; unauthenticated download/upload **DENY**; worker own authorized API read **PASS**, foreign owner/project **DENY**; barcha ilgari leaked token URL’lari **DENY**. Listing permission failure/unknown ACL/token count **BLOCKED**, 0 emas. Object cutover/token invalidation destructive bosqichiga verified backup, generation/metageneration preconditions, dry-run va explicit operator ruxsati talab qilinadi.

Rasmiy buyruq manbalari: [Storage ls](https://docs.cloud.google.com/sdk/gcloud/reference/storage/ls), [bucket IAM read](https://docs.cloud.google.com/sdk/gcloud/reference/storage/buckets/get-iam-policy).

## C) Credential migration

**BLOCKED, APPLY qilinmadi.** Verified production encrypted backup, project identity, expected production counts va explicit operator APPLY mavjud emas. Hozirgi `credential-migration.mjs` CLI ataylab demo emulator bilan cheklangan; production flag/bypass berilmadi.

Operator/ko‘rib chiqilgan production runner uchun ketma-ketlik: project+database+service-account scope tasdiq → workers/users/assistants/accountCredentials/accountSecurity authoritative read-only snapshot → duplicate/login/alias checks va expected account count sign-off → AES-GCM encrypted snapshot’ni decrypt/digest/project/restore verify, key alohida saqlash → concurrent-change fingerprint bilan production dry-run → operatorning aynan snapshot/hash/project/count’ga explicit APPLY → transaction cutover → har rol login, wrong password/disabled/old session DENY → recursive public plaintext credential **0** → rollback package integrity va access verify. Rollback public plaintext’ni qaytarmaydi; newer password/profile/disable o‘zgarishlarini bosib ketmaydi. Backup fayl borligi verified backup degani emas.

Lokal read-only SQL copy/emulator: **14 account, 45 assertions PASS**, old passwords saqlangan; 14 successful + 14 wrong-password DENY; second run no-op; rollback login PASS/public plaintext qaytmadi. Lokal 1,976 document production inventory o‘rnini bosmaydi.

## D) Dependency HIGH closure

Production `xlsx` **0.18.5 → 0.20.3**. Old advisories: prototype pollution `GHSA-4r6h-8v6p-xvw6` (<0.19.3), ReDoS `GHSA-5pgg-2g8v-p4x9` (<0.20.2). Affected live paths `src/expenses/expenseReportExport.js`, `src/reports/monthly/reportExcelService.js`: export-only, untrusted workbook import/read live path topilmadi; parsing exposure kamroq, old version xavfsiz deb belgilanmadi.

Rasmiy [SheetJS installation](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/) tavsiya qilgan HTTPS tarball to‘g‘ridan-to‘g‘ri exact dependency sifatida qo‘yildi; lockfile integrity saqlandi. API diff yo‘q. Actual ikkala export service’ning in-memory round-trip testi summa, sheetlar, project ID va formula-like text cell’ni tekshirdi. Tarball yangilanganda integrity qayta review qilinsin; audit 0 barcha noma’lum zaiflik yo‘qligi isboti emas.

Yangilangan npm audit:

| Scope | Critical | High | Moderate | Low |
| --- | ---: | ---: | ---: | ---: |
| `--omit=dev` server/web dependency graph | 0 | 0 | 9 | 1 |
| Full toolchain/desktop graph | 1 | 15 | 10 | 3 |

Full graph `tar@6.2.1` Critical va Capacitor/electron-builder/node-gyp transitive HIGH’lari qolgan. Vite 5.4.21 development server Windows/path issues; production dist Vite server’ni ship qilmaydi. **Electron 33.4.11 devDependency bo‘lsa ham desktop’da real runtime**, HIGH’ni dev-only deb chiqarib tashlash mumkin emas. Audit suggested electron 44.5.1 / electron-builder 26.15.3 / Vite 8.3.2 major upgrades: alohida toolchain/desktop regression talab qiladi; global tar override va `audit fix --force` qo‘llanmadi. Desktop release uchun supported patched Electron + packaging sign-off hanuz blocker. Audits `.security-artifacts/stage6-audit-{prod,full}.json`da.

## E) Production env matrix

Quyidagi statuslar lokal root env auditidan; **barcha production status NOT VERIFIED**. Real config olingani da’vo qilinmaydi. Secret values chiqarilmagan.

| Config | Local | Production |
| --- | --- | --- |
| VITE_FIREBASE_PROJECT_ID/API_KEY/AUTH_DOMAIN/STORAGE_BUCKET/APP_ID | MISSING | NOT VERIFIED |
| Firebase Admin JSON yoki credential file | MISSING | NOT VERIFIED |
| FIREBASE_STORAGE_BUCKET | MISSING | NOT VERIFIED |
| VITE_API_BASE, VITE_ANDROID_API_BASE | INVALID (HTTP) | NOT VERIFIED |
| CORS_ORIGINS | MISSING | NOT VERIFIED |
| ADMIN_LOGIN, ADMIN_PASSWORD_HASH | MISSING | NOT VERIFIED |
| ADMIN_PASSWORD transitional fallback | MISSING | NOT VERIFIED; production’da hash tavsiya |
| TELEGRAM_BOT_TOKEN, TELEGRAM_GROUP_ID | PRESENT, old token rotation pending | NOT VERIFIED |
| ALLOW_LEGACY_PLAINTEXT_LOGIN | MISSING | NOT VERIFIED; release’da false majburiy |
| ADMIN_SESSION_VERSION | MISSING, optional bootstrap | NOT VERIFIED |
| accountSecurity sidecar sessionVersion / disabled state | code mavjud | NOT VERIFIED |
| CREDENTIAL_BACKUP_KEY_BASE64 | MISSING | NOT VERIFIED |
| ERP_API_URL | PRESENT | NOT VERIFIED; HTTPS/caller scope sign-off kerak |
| MONTHLY_REPORT_FETCH_SECRET | MISSING, optional | NOT VERIFIED; enabled integration bo‘lsa required |
| DATABASE_URL / SQLite path, SMTP/other enabled integration env | optional deployment-specific | NOT VERIFIED |
| Emulator env flags | release’da forbidden | NOT VERIFIED |
| VITE_BOT_TOKEN | forbidden locally present | NOT VERIFIED; remove/rotate |

`audit:runtime` sanitized location/status inventory beradi. `test:release` HTTPS/hash-only/client-secret absence/bucket match checks qiladi. Presence project IAM/TLS/credential validity’ni isbotlamaydi. Local `.env`ni real deployment env deb ishlatmaslik.

## F) HTTPS/TLS

Active source hardcoded production `http://` refs **0**; XML/SVG namespaces va loopback development/Electron local transport alohida. `server.js`dagi old public-IP auto-CORS exception olib tashlandi: kerakli **HTTPS** origin `CORS_ORIGINS`ga aniq kiritilishi kerak. Mavjud server TLS reverse proxy orqali bo‘lishi mumkin, lekin remote config ko‘rilmagan.

**Live TLS BLOCKED:** tasdiqlangan hostname/certificate/proxy yo‘q. Operator tasdiqlangan non-secret HTTPS URL bilan `curl.exe --proto '=https' --tlsv1.2 --fail --silent --show-error --output NUL "$env:PRODUCTION_API/status"` va `curl.exe --proto '=https' --tlsv1.2 --silent --show-error --output NUL --write-out '%{http_code}' "$env:PRODUCTION_API/api/auth/session"` bajaradi: certificate+hostname validation PASS, status endpoint 200, no-bearer session 401 kutiladi. `-k` ishlatilmaydi; cross-origin/HTTP redirect zanjiri taqiqlanadi. TLS chain/expiry va edge/proxy auth preservation tekshirilsin. Production browser DevTools network mixed-content 0; Android cleartext/mixed-content false va native HTTPS smoke PASS kerak.

## G) Android native gate

**BLOCKED.** `adb devices` bo‘sh, AVD ro‘yxati bo‘sh. Demo HTTPS config bilan unsigned `assembleRelease --offline` **PASS**, lekin production URL/config/signature yo‘q; bu native sign-off emas. Fresh install, barcha 3 rol login/logout, cold start, token refresh, private upload/read, foreign resource DENY, disabled account DENY checklist [`ANDROID_RELEASE_CHECKLIST.md`](ANDROID_RELEASE_CHECKLIST.md) bo‘yicha real device/AVD’da bajarilmaguncha PASS yozilmaydi.

## H) Full regression

| Suite | 6-bosqich natija |
| --- | --- |
| Server/frontend auth + isolated actual live server startup | PASS; minimal server change’dan keyin qayta PASS |
| Account security | PASS |
| Firestore rules | **84 PASS** |
| Storage rules | **23 PASS** |
| Private storage/media | **19 PASS** |
| API hardening/session/cache | **62 PASS**, oxirgi server diff’dan keyin qayta PASS |
| Credential migration | **45 PASS / 14 account**, emulator only |
| Release configuration/static Android | PASS |
| Final gate/config/Excel shapes | **99 PASS**, synthetic Telegram only |
| Actual expense + monthly Excel exports | PASS, in-memory XLSX 0.20.3 round-trip |
| Payroll save/retry/idempotence/balance/date/history/month isolation | barcha 4 script PASS |
| Supply calculation | PASS |
| Actual Chrome UI all roles + mobile usta | **4 cases PASS**, cold start/logout/private upload/blob render, 0 uncaught errors |
| Web production-mode build | PASS, demo config; large chunk warning |
| Capacitor sync + Android unsigned release build | PASS, offline; Gradle deprecation warning |
| Server JS syntax / git diff whitespace | PASS |
| Real Telegram, production Storage/migration/TLS, native runtime | **BLOCKED / NOT RUN** |

Local logs/receipts ignored `.security-artifacts/stage6-*`da. Browser and emulator tests production network/data ishlatmaydi. Backup/migration tests temporary encrypted fixtures bilan.

## I) Qolgan blockerlar

1. Leaked Telegram secret rotatsiyasi va eski artifact distribution closure tasdiqlanmagan (**HIGH**).
2. Production Storage IAM/ACL/token/Rules/caches/private reference closure noma’lum.
3. Production encrypted backup, snapshot identity/counts, reviewed runner/operator APPLY va plaintext=0 yo‘q.
4. Production env/TLS/proxy/cross-origin sign-off yo‘q; root env production-ready emas.
5. Native Android device/AVD regression va production-signed configured candidate yo‘q.
6. Desktop Electron/toolchain Critical/High upgrade/sign-off qolgan; audit production graph 0 HIGH desktop runtime’ni qoplamaydi.
7. Old business integrity caveat: attendance client-attested, identity claims physical attendance isboti emas. Rollout server/client/Rules birga review qilinishi kerak.

## J) FINAL GO / NO-GO

**NO-GO.** `scripts/release-gate.mjs` 10 mandatory gate uchun missing/unknown/demo/stale (>24h)/future/wrong-project/wrong-candidate receipt’ni BLOCKED qiladi. Har operator receipt `{status:'PASS', projectId, candidateSha256, checkedAt, source:'operator-verified', reference}` talab qiladi. Root `projectId` va `candidateSha256` aynan review qilinayotgan candidate uchun; reference protected operator evidence joyi. Receipt secret/token/URL qiymati bo‘lmasin. Evidence format self-asserted: mustaqil review kerak, JSON kriptografik production proof emas. GO chiqishi ham deploy authorization bermaydi.

`npm run release:gate -- --evidence PROTECTED_SANITIZED_EVIDENCE.json` — offline gate; missing evidence non-zero/NO-GO. Hozirgi sanitized `.security-artifacts/stage6-release-evidence.json` **NO-GO**, production checks taxmin bilan PASS qilinmagan.

## K) Deploy oldi checklist

GO yo‘qligi sabab deploy checklist tasdiqlanmadi va hech qanday release bajarishga ruxsat berilmadi. Barcha 10 gate review qilingan production receipts bilan yopilib, yangi GO qarori olingandan keyingina alohida 10-qadam deploy/rollback tartibi tasdiqlanadi.

6-bosqich changed files: `package.json`, `package-lock.json`, `backend/config.js`, `server.js`, `bot.js`, `server/reports/dailyAttendanceTelegram.js`, `server/telegramClient.js`, `server/telegramInboundPoller.js`; yangi `scripts/audit-stage6-runtime.mjs`, `scripts/release-gate.mjs`, `scripts/test-stage6-release.mjs`, `scripts/test-stage6-exports.mjs`, ushbu report. `docs/ARCHITECTURE.md` va `docs/RELEASE_CANDIDATE.md`ga final report link qo‘shildi. Old stages files preserved. `docs/API_AUTHORIZATION_MATRIX.md` qayta generated (74 patterns).
