# Live API authorization matrix вЂ” Stage 4

Generated from live route declarations. All `/api` requests except the two login URLs require a verified Firebase bearer before large body parsing. Role/record gates are additional. `/api/supply/compat/*` is normalized before authorization and has the same policy as its `/api/*` target. GET routes also cover implicit HEAD. CORS preflight grants no data permission.

| Method | Path | Auth required | Allowed roles | Ownership check | Risk | Fix status |
| --- | --- | --- | --- | --- | --- | --- |
| POST | /api/auth/login | No | Credential-verified login | Server account lookup | Brute force / account enumeration | Generic failure + 15/min + 16KB JSON |
| GET | /api/auth/session | Yes | admin/usta/asisten | Verified UID + current account + session version | Stale/disabled session | Fixed |
| GET | /api/brigades | Yes | admin | Admin-only; no caller ownership grant | Cross-role read/write | Fixed |
| POST | /api/brigades | Yes | admin | Admin-only; no caller ownership grant | Cross-role read/write | Fixed |
| DELETE | /api/brigades/:id | Yes | admin | Admin-only; no caller ownership grant | Cross-role read/write | Fixed |
| PUT | /api/brigades/:id | Yes | admin | Admin-only; no caller ownership grant | Cross-role read/write | Fixed |
| GET | /api/db/:collection | Yes | admin | Admin-only; no caller ownership grant | Unrestricted generic CRUD/import | Admin-only; raw worker/user/assistant/credential collections blocked |
| POST | /api/db/:collection | Yes | admin | Admin-only; no caller ownership grant | Unrestricted generic CRUD/import | Admin-only; raw worker/user/assistant/credential collections blocked |
| DELETE | /api/db/:collection/:id | Yes | admin | Admin-only; no caller ownership grant | Unrestricted generic CRUD/import | Admin-only; raw worker/user/assistant/credential collections blocked |
| GET | /api/db/:collection/:id | Yes | admin | Admin-only; no caller ownership grant | Unrestricted generic CRUD/import | Admin-only; raw worker/user/assistant/credential collections blocked |
| PUT | /api/db/:collection/:id | Yes | admin | Admin-only; no caller ownership grant | Unrestricted generic CRUD/import | Admin-only; raw worker/user/assistant/credential collections blocked |
| GET | /api/db/:collection/count | Yes | admin | Admin-only; no caller ownership grant | Unrestricted generic CRUD/import | Admin-only; raw worker/user/assistant/credential collections blocked |
| POST | /api/db/:collection/with-id/:id | Yes | admin | Admin-only; no caller ownership grant | Unrestricted generic CRUD/import | Admin-only; raw worker/user/assistant/credential collections blocked |
| POST | /api/db/import/:collection | Yes | admin | Admin-only; no caller ownership grant | Unrestricted generic CRUD/import | Admin-only; raw worker/user/assistant/credential collections blocked |
| POST | /api/db/project_stage_locks/:projectId/merge-stage | Yes | admin | Admin-only; no caller ownership grant | Unrestricted generic CRUD/import | Admin-only; raw worker/user/assistant/credential collections blocked |
| POST | /api/db/sync-all | Yes | admin | Admin-only; no caller ownership grant | Unrestricted generic CRUD/import | Denied for raw accounts/sync |
| POST | /api/db/upload/stage-video | Yes | admin | Admin-only; no caller ownership grant | Unrestricted generic CRUD/import | Admin-only; raw worker/user/assistant/credential collections blocked |
| PUT | /api/db/workers/:id/points | Yes | admin | Admin-only; no caller ownership grant | Unrestricted generic CRUD/import | Denied for raw accounts/sync |
| POST | /api/db/workers/:id/points/increment | Yes | admin | Admin-only; no caller ownership grant | Unrestricted generic CRUD/import | Denied for raw accounts/sync |
| GET | /api/expenses | Yes | admin | Admin-only; no caller ownership grant | Cross-role read/write | Fixed |
| POST | /api/expenses | Yes | admin | Admin-only; no caller ownership grant | Cross-role read/write | Fixed |
| DELETE | /api/expenses/:id | Yes | admin | Admin-only; no caller ownership grant | Cross-role read/write | Fixed |
| PUT | /api/expenses/:id | Yes | admin | Admin-only; no caller ownership grant | Cross-role read/write | Fixed |
| GET | /api/geo/approx | Yes | admin/usta/asisten | Only caller-requested coordinates/IP; no records | External proxy abuse | Authenticated + 60/min |
| GET | /api/geo/reverse | Yes | admin/usta/asisten | Only caller-requested coordinates/IP; no records | External proxy abuse | Authenticated + 60/min |
| POST | /api/login | No | Credential-verified login | Server account lookup | Brute force / account enumeration | Generic failure + 15/min + 16KB JSON |
| POST | /api/master/mark-login | Yes | admin/usta | Signed actor; submitted other owner IDs denied | Forged worker activity | Fixed |
| GET | /api/media/:name | Yes | admin/usta/asisten | Metadata owner + project access; admin legacy read | Predictable private URL | Bearer download + private no-store + nosniff |
| GET | /api/private-storage/ | Yes | admin/usta/asisten | Verified owner + assigned project; admin all | Public token URL / cross-user media | Authenticated server-only blob, no token URL |
| GET | /api/projects | Yes | admin | Admin-only; no caller ownership grant | Cross-role read/write | Fixed |
| POST | /api/projects | Yes | admin | Admin-only; no caller ownership grant | Cross-role read/write | Fixed |
| GET | /api/reports/daily-attendance | Yes | admin | Admin-only; no caller ownership grant | Cross-role read/write | Fixed |
| GET | /api/reports/monthly-attendance | Yes | admin | Admin-only; no caller ownership grant | Cross-role read/write | Fixed |
| GET | /api/reports/telegram-feed | Yes | admin | Admin-only; no caller ownership grant | Cross-role read/write | Fixed |
| GET | /api/session | Yes | admin/usta/asisten | Verified UID + current account + session version | Stale/disabled session | Fixed |
| GET | /api/staff/:collection | Yes | admin/usta/asisten | Admin all; usta own; asisten own + sanitized worker directory | Credential exposure / account takeover | Fixed |
| POST | /api/staff/:collection | Yes | admin | Admin; allowlisted data and private credentials | Credential exposure / account takeover | Fixed |
| DELETE | /api/staff/:collection/:id | Yes | admin | Admin; allowlisted data and private credentials | Credential exposure / account takeover | Fixed |
| PUT | /api/staff/:collection/:id | Yes | admin | Admin; allowlisted data and private credentials | Credential exposure / account takeover | Fixed |
| GET | /api/supply/accessories | Yes | admin/asisten | Role-scoped catalog/calculation | Open history CRUD / forged creator / credential-header bypass | Fixed; no legacy secret/password headers |
| GET | /api/supply/batteries | Yes | admin/asisten | Role-scoped catalog/calculation | Open history CRUD / forged creator / credential-header bypass | Fixed; no legacy secret/password headers |
| POST | /api/supply/calculate | Yes | admin/asisten | Role-scoped catalog/calculation | Open history CRUD / forged creator / credential-header bypass | Fixed; no legacy secret/password headers |
| GET | /api/supply/catalog | Yes | admin/asisten | Role-scoped catalog/calculation | Open history CRUD / forged creator / credential-header bypass | Fixed; no legacy secret/password headers |
| GET | /api/supply/catalog/admin | Yes | admin | Role-scoped catalog/calculation | Open history CRUD / forged creator / credential-header bypass | Fixed; no legacy secret/password headers |
| GET | /api/supply/health | Yes | admin/asisten | Role-scoped catalog/calculation | Open history CRUD / forged creator / credential-header bypass | Fixed; no legacy secret/password headers |
| GET | /api/supply/history | Yes | admin/asisten | Asisten own createdByUid only; admin all | Open history CRUD / forged creator / credential-header bypass | Fixed; no legacy secret/password headers |
| DELETE | /api/supply/history/:id | Yes | admin/asisten | Asisten own createdByUid only; admin all | Open history CRUD / forged creator / credential-header bypass | Fixed; no legacy secret/password headers |
| GET | /api/supply/inverters | Yes | admin/asisten | Role-scoped catalog/calculation | Open history CRUD / forged creator / credential-header bypass | Fixed; no legacy secret/password headers |
| GET | /api/supply/panels | Yes | admin/asisten | Role-scoped catalog/calculation | Open history CRUD / forged creator / credential-header bypass | Fixed; no legacy secret/password headers |
| POST | /api/supply/products | Yes | admin | Role-scoped catalog/calculation | Open history CRUD / forged creator / credential-header bypass | Fixed; no legacy secret/password headers |
| DELETE | /api/supply/products/:id | Yes | admin | Role-scoped catalog/calculation | Open history CRUD / forged creator / credential-header bypass | Fixed; no legacy secret/password headers |
| PUT | /api/supply/products/:id | Yes | admin | Role-scoped catalog/calculation | Open history CRUD / forged creator / credential-header bypass | Fixed; no legacy secret/password headers |
| POST | /api/supply/reload | Yes | admin | Role-scoped catalog/calculation | Open history CRUD / forged creator / credential-header bypass | Fixed; no legacy secret/password headers |
| POST | /api/supply/save | Yes | admin/asisten | Asisten own createdByUid only; admin all | Open history CRUD / forged creator / credential-header bypass | Fixed; no legacy secret/password headers |
| GET | /api/supply/settings | Yes | admin/asisten | Role-scoped catalog/calculation | Open history CRUD / forged creator / credential-header bypass | Fixed; no legacy secret/password headers |
| GET/HEAD | /api/telegram-export/* | Yes | admin | Admin export access only | Public private export | Fixed; no-store; dotfiles denied |
| GET | /api/telegram/daily-attendance-report | Yes | admin | Admin-only; no caller ownership grant | Cross-role read/write | Fixed |
| POST | /api/telegram/daily-attendance-report | Yes | admin | Admin-only; no caller ownership grant | Cross-role read/write | Fixed |
| POST | /api/telegram/expense-log | Yes | admin/usta/asisten | Signed actor; project assignment where required; scoped event namespace | IDOR / forged event / SSRF | Fixed + 60/min; no external media fetch |
| POST | /api/telegram/log-event | Yes | admin/usta/asisten | Signed actor; project assignment where required; scoped event namespace | IDOR / forged event / SSRF | Fixed + 60/min; no external media fetch |
| POST | /api/telegram/monthly-report | Yes | admin | Admin-only; no caller ownership grant | Cross-role read/write | Fixed |
| POST | /api/telegram/project-photos | Yes | admin/usta/asisten | Signed actor; project assignment where required; scoped event namespace | IDOR / forged event / SSRF | Fixed + 60/min; no external media fetch |
| POST | /api/telegram/stage-photos | Yes | admin/usta/asisten | Signed actor; project assignment where required; scoped event namespace | IDOR / forged event / SSRF | Fixed + 60/min; no external media fetch |
| POST | /api/telegram/work-log | Yes | admin/usta/asisten | Signed actor; project assignment where required; scoped event namespace | IDOR / forged event / SSRF | Fixed + 60/min; no external media fetch |
| POST | /api/telegram/work-log-photo | Yes | admin/usta/asisten | Signed actor; project assignment where required; scoped event namespace | IDOR / forged event / SSRF | Fixed + 60/min; no external media fetch |
| POST | /api/telegram/yorijnoma | Yes | admin/usta/asisten | Signed actor; project assignment where required; scoped event namespace | IDOR / forged event / SSRF | Fixed + 60/min; no external media fetch |
| POST | /api/upload/private-image | Yes | admin/usta/asisten | Signed actor; no persistent file | Executable / oversize / forged owner | Authenticated + 20/min + MIME/signature/size |
| POST | /api/upload/process-image | Yes | admin/usta/asisten | Signed actor; no persistent file | Executable / oversize / forged owner | Authenticated + 20/min + MIME/signature/size |
| POST | /api/upload/stage-video | Yes | admin/usta/asisten | Signed owner + assigned project; server metadata | Executable / oversize / forged owner | Authenticated + 20/min + MIME/signature/size |
| GET | /api/work_logs | Yes | admin | Admin-only; no caller ownership grant | Cross-role read/write | Fixed |
| POST | /api/work_logs | Yes | admin | Admin-only; no caller ownership grant | Cross-role read/write | Fixed |
| GET | /api/workers | Yes | None | Use protected staff API | Raw account disclosure | Denied (obsolete in-memory account route) |
| POST | /api/workers | Yes | None | Use protected staff API | Raw account disclosure | Denied (obsolete in-memory account route) |
| GET | /status | No | Public health | No private data | Low | Minimal public response |

No live Telegram webhook is exposed: inbound processing uses server polling. Cron/reminder functions are invoked internally, not through a public general CRUD webhook. `/api/master/mark-login` is a browser-used own-user operation, not an unauthenticated internal endpoint.

Dormant Express/Mongo stack (`server/index.js`, `server/app.js`, `server/routes/index.js`, `telegramWork.js`, `upload.js`) is not imported/mounted by live `server.js`. Its legacy login/CRUD routes were inventoried as inactive, not authorized production alternatives; do not start that stack without a separate security migration. SPA static assets contain no private business export.
