# SolarERP — arxitektura handoff (ChatGPT / Cursor)

> Auth/security sections below describe the historical architecture. Current Stage 1?5 behavior, authorization matrix and rollout blockers: [SERVER_AUTH.md](SERVER_AUTH.md), [FIRESTORE_SECURITY.md](FIRESTORE_SECURITY.md), [PRODUCTION_SECURITY.md](PRODUCTION_SECURITY.md), [RELEASE_CANDIDATE.md](RELEASE_CANDIDATE.md), current Stage 6 final gate [FINAL_RELEASE_GATE.md](FINAL_RELEASE_GATE.md).


Bu fayl **manba haqiqati**. O‘zgartirishdan oldin o‘qib chiq. Oxirgi to‘liq audit: **2026-10-01**. Versiya: `package.json` → `1.0.81`.

## 1. Mahsulot nima

Quyosh (solar) o‘rnatishlar uchun ERP: admin, usta (master), asisten. Loyihalar, brigadalar, xarajatlar, bosqich rasmlari, keldi-ketdi, tijoriy taklif, taminot kalkulyatori, Telegram hisobotlar. UI: React 18 + Vite + Tailwind. Chiqishlar: brauzer, Electron (Windows), Capacitor Android APK, VPS (`pm2` + `server.js`).

**Ishga tushirish (yagona to‘g‘ri yo‘l):** `npm run dev` → Vite + **`server.js`**. `npm run backend` / `npm start` ham `server.js`. `server/index.js` (Mongo) **ishlatilmaydi**.

## 2. Qatlamlar — qayerga yozish

| Qatlam | Fayllar | Holat | Qachon ishlatiladi |
| --- | --- | --- | --- |
| **A. Firestore (asosiy live data)** | `src/firebase.js`, `src/firebase/firestoreCrud.js`, `src/hooks/use*.js` | **Ishlab chiqarishdagi asosiy CRUD** | Loyiha/usta/brigada/xarajat/rasm/asisten — `useProjects`, `useWorkers`, va h.k. Anonim Firebase Auth. |
| **B. localStorage (kesh + offline)** | `src/*/ *Storage.js`, `src/storage/migrateReadStorage.js` | **Zaxira + UI tezligi** | Firestore yiqilsa `canUseLocalFallback`. Admin parol ham shu yerda. |
| **C. SQLite yoki Postgres (document store)** | `server/db/store.js`, `server/routes/dbApi.js` → `/api/db` | **Server yozuvlari, sync, ba’zi fallback** | `DATABASE_URL` bo‘lsa Postgres, aks holda `data/solar-erp.db`. `useWorkers` ba’zan `/api/db/workers`. `syncLocalStorageToDb.js`. |
| **D. Taminot SQLite/CSV** | `server/supply/*`, `data/supply/` | **Alohida katalog** | `/api/supply/*`. Frontend `src/services/supplyCalculation/`. |
| **E. Disk upload** | `data/uploads`, `/api/media` | Fayllar | Stage video, work-log foto. |
| **F. server.js in-memory massivlar** | `server.js` ichida `workers`, `projects`, … | **O‘lik / tuzoq** | `/api/workers`, `/api/projects` va shu kabilar **xotirada**, Firestore bilan bog‘lanmagan. UI asosan Firestore ishlatadi. |
| **G. Mongo + Mongoose** | `server/index.js`, `server/app.js`, `server/models/*`, `server/routes/index.js` | **O‘lik kod** | `package.json` da `mongoose` yo‘q. `npm run backend` buni ishga tushirmaydi. **Yangi kod yozmang.** |

**Qoida:** yangi biznes ma’lumot → **Firestore hook + localStorage persist** (mavjud pattern). Server faqat Telegram, upload, report, taminot, `/api/db` sync. In-memory `/api/workers` ga UI ulamang.

## 3. Frontend xarita

- Kirish: `src/main.jsx` → Auth, Theme, Firebase anonymous, Telegram pending sync.
- Marshrutlar: `src/App.jsx`. Navigatsiya: `src/navConfig.js`.
- Rollar: `admin` (`/`), `usta` (`/usta-panel`), `asisten` (`/asisten-panel`). Guard: `src/components/RequireAuth.jsx` — faqat `session.role`, JWT yo‘q.
- Auth: `src/auth/AuthContext.jsx` + `authStorage.js`.
  - Admin: `src/auth/adminDefaults.js` — default `admin` / `admin123`, `localStorage` `solar-erp-admin-credentials`. **Server tekshiruvi yo‘q.**
  - Usta/asisten: Firestore (yoki local kesh) da **ochiq parol** solishtirish.
- HTTP: `src/api/http.js` + `src/api/apiBase.js`. Dev: Vite `/api` proxy. Android: `http://77.237.237.94` va yo‘l qayta yozish `/api/supply/compat/...` (nginx Chorvoq bilan to‘qnashuv).
- Domain papkalar: `src/pages/`, `src/commercialOffers/`, `src/heatPumpForms/`, `src/reports/monthly/`, `src/photos/`, `src/activity/`, `src/usta/`.

**O‘chirilgan (placeholder) menyu:** Vazifalar, Sifat nazorati, Monitoring — `SectionPage` + `isDisabled`.

## 4. Backend (`server.js`) — haqiqiy API

Mount:

- `/api/db` — generic collection CRUD, **auth yo‘q** (`sync-all`, import, delete).
- `/api/reports`, `/api/supply`, `/api/media`
- `/api/login` → `handleSqlLogin` (SQL/Firestore worker paroli). Frontend login asosan client-side.
- Telegram: `/api/telegram/*` (work-log, rasmlar, yorijnoma, oylik hisobot, attendance).
- `/api/master/mark-login`, `/api/geo/*`, `/status`
- In-memory CRUD: `/api/workers|projects|brigades|expenses|work_logs` — **ishonmang**.
- Production: `SERVE_STATIC=true` → `dist/` SPA.

Bot: `bot.js` (cron: ertalab, usta eslatma, oylik, attendance). Telegram: `telegramService.js`.

## 5. Xavfsizlik (o‘zgartirishda buzmang, lekin qarz bor)

1. Firestore rules: `request.auth != null` yetarli — **har qanday anonim foydalanuvchi barcha kolleksiyalarni o‘qib/yozadi**.
2. `/api/db` ochiq CRUD + `sync-all`.
3. Parollar ochiq matn (workers, assistants, admin localStorage).
4. Supply admin: headerda login/parol yoki `SUPPLY_ADMIN_TOKEN`; default env parol `admin123`.
5. `backend/config.js` ichida Telegram token **placeholder sifatida commit** qilingan — env bo‘lmasa yoki placeholder bo‘lsa bot o‘chadi; tokenni gitdan olib tashlang va **rotate** qiling.
6. JSON body limiti 80MB (rasm/base64).
7. CORS: localhost, Capacitor, hardcode IP `77.237.237.94`, `CORS_ORIGINS`.

## 6. Taminot

Server: `SupplyCalculator`, `catalogStore`, `SupplyRepository`. Admin mahsulot: `X-Solar-Role` + login/parol yoki token. Frontend kalkulyator `src/services/supplyCalculation/` (client ham hisoblaydi). Ikkala tomonni sinxron tuting.

## 7. Platformalar

- Electron: `electron/main.cjs`, `npm run desktop` / `desktop:exe`.
- Android: Capacitor `webDir: dist`, `cleartext: true`. `CapacitorHttp` configda `enabled: false`, lekin `http.js` native so‘rov ishlatadi.
- Deploy: `scripts/deploy-vps.mjs`, `ecosystem.config.cjs` → faqat `server.js`.

## 8. ChatGPT uchun o‘zgartirish qoidalari

1. **Mongo / `server/index.js` / `server/models` ga tegmang** — ishlamaydi.
2. Yangi sahifa: `App.jsx` + `navConfig.js` + mos layout (`AppLayout` / `UstaLayout` / `AsistenLayout`).
3. Yangi entity: `firestoreCrud` + hook (`useProjects` pattern) + `server/db/store.js` `COLLECTIONS` agar SQL sync kerak bo‘lsa.
4. Telegram xabar: `shared/telegramMessageTypes.js`, `shared/buildTelegramMessage.js`, server endpoint `server.js`.
5. API yo‘l Android’da `/api/supply/compat` orqali keladi — yangi endpoint `server.js` da `/api/...` bo‘lsin, prefix middleware bor.
6. Secretlarni kodga yozmang; `.env` (`TELEGRAM_*`, `VITE_FIREBASE_*`, `DATABASE_URL`, `SUPPLY_ADMIN_TOKEN`).
7. In-memory `workers[]` ga yangi maydon qo‘shmang — UI ko‘rmaydi.
8. `App.jsx` da ko‘p bo‘sh qatorlar bor — formatni ommaviy reformat qilmang.

## 9. Tavsiya etilgan keyingi ish (tartib)

1. Yagona source of truth: Firestore **yoki** SQL — ikkalasini parallel yozishni to‘xtatish.
2. `/api/db` ni auth + role.
3. Admin loginni serverga ko‘chirish; default parolni o‘chirish.
4. O‘lik Mongo papkani arxiv/o‘chirish.
5. In-memory REST ni o‘chirish yoki Firestore/SQL ga proxy.
6. Firestore rules: role custom claims, usta faqat o‘z loyihalari.
7. Parollarni hash.

## 10. Tez fayl indeksi

| Maqsad | Fayl |
| --- | --- |
| SPA routes | `src/App.jsx` |
| Nav | `src/navConfig.js` |
| Auth | `src/auth/AuthContext.jsx` |
| Firestore CRUD | `src/firebase/firestoreCrud.js` |
| Schema/rollar | `src/services/schema.js` |
| HTTP | `src/api/http.js`, `src/api/apiBase.js` |
| SQL store | `server/db/store.js` |
| Live API | `server.js` |
| Dead Mongo API | `server/app.js` |
| Supply | `server/routes/supplyApi.js` |
| Bot | `bot.js` |
| Dev | `scripts/dev.mjs` |
| Vite proxy | `vite.config.js` |

O‘zgarish kiritgach shu faylning «audit sanasi» ni yangilang.
