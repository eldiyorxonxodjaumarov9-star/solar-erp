# Server authentication foundation

Live entry: `server.js`. Internal factory: `app.locals.createServerTokenIssuer` from
`server/firebaseAdminAuth.js`. No token API route is registered.

Firebase Admin credentials are server-only: set `GOOGLE_APPLICATION_CREDENTIALS`
to an external service-account JSON file, or set `FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON`
in the server environment. Never use a `VITE_` variable or put private keys in `src/`,
`public/`, or the repository. Existing Admin apps are reused; the existing anonymous
client Firebase module is not an Admin app and remains unchanged.

Initialization is lazy. Missing credentials raise `FIREBASE_ADMIN_CREDENTIALS_MISSING`
on token issuance, without preventing server startup. Invalid credentials/signing
failures return sanitized errors without credential contents.

The next login stage must supply a server credential verifier returning a persisted
account `{ id, role, firebaseUid? }`. Client-supplied roles/worker IDs are not read by
the issuer. `id` is the worker document ID for usta or assistant document ID for asisten;
admin uses a server account ID. Stable default UID: `role:id`. Claims are `{ role,
workerId }`; only usta receives its account ID as workerId. Admin/asisten receive an
empty workerId. The verifier must reject disabled/invalid accounts. The factory alone
does not implement credential verification and must never be exposed as an endpoint.

No frontend login migration, Firestore rules change, or real account migration occurs
in this stage.

## Stage 2: authenticated login (not deployed)

Previous login compared admin credentials stored in browser localStorage and worker/
assistant plaintext passwords fetched into the client. `currentSession` and the local
admin-return snapshot granted roles, including an impersonation bypass.

New flow: POST `/api/auth/login` (legacy `/api/login` uses the same router) verifies
credentials on the server, signs a custom token through the stage-1 issuer, and
returns only that token. Frontend calls `signInWithCustomToken`, then calls GET
`/api/auth/session` with its Firebase ID token. The server verifies the ID token with
revocation checking and returns a sanitized role/identity; browser storage never
provides permissions. `onIdTokenChanged` revalidates restoration/refresh. Anonymous
users have no application session, and frontend anonymous fallback is removed.
Local impersonation/admin-return and local admin credential editing are disabled.

**Migration identified before implementation:** provision the existing admin login/
password as server-only `ADMIN_LOGIN` / `ADMIN_PASSWORD`, together with stage-1 Admin
credentials. No default admin password and no automatic localStorage import exists.
Worker passwords are preserved in Firestore `workers`/legacy `users`; assistant/
manager passwords are preserved in `assistants`. Browser-only/offline account records
cannot authenticate until explicitly migrated to the server-owned source. No account,
password, Firebase user, or production data is migrated by this change.

Canonical roles: admin, usta, asisten. Worker/master and assistant/manager aliases select
these account types, not arbitrary privileges. UID is `role:documentId`; admin UID is
`admin:primary`. Signed claims include role, accountId, login/name, workerId (usta only),
and assistantId (asisten only). Client-supplied workerId/uid/claims are ignored.

Supply frontend sends bearer ID tokens instead of browser-stored admin passwords;
server verifies admin identity. Existing server-provisioned supply integration token/
credential access remains, without hardcoded credential defaults. Public requests
cannot request private pricing merely by setting includePrices.

Limitations pending stage 3: current Firestore wildcard grants authenticated users
unrestricted access, including legacy plaintext passwords and edits to account records.
Thus this stage prevents localStorage role spoofing, but does not make the database
secure. Other open REST CRUD endpoints and HTTP production transport also require
protection. Password hashing, indexed login lookup, distributed rate limits, session
revocation on password/role changes, and privileged impersonation should be subsequent
server work. The current rate limit is per-process/per-IP (15 attempts/minute).

Stage 3: remove the permissive recursive wildcard; require non-anonymous signed role
claims; constrain usta reads to signed workerId and asisten to signed assistantId;
permit payroll/stavka/expenses writes only to admin; keep payroll reads scoped to
payrollWorkerId; move password fields to server-only account documents because Firestore
cannot hide individual fields on a readable document; protect workers/users/assistants
writes from clients and migrate admin account mutations to authenticated server APIs.
Test allow/deny rules in the emulator before a separately authorized migration/deploy.

Verification: `npm run test:auth` uses generated test keys and mocked Firebase SDK/
account data. Server login routes are exercised over loopback HTTP; AuthProvider and
Firebase frontend adapter are evaluated with mock SDK/network calls. These tests do
not create/delete real Firebase users. `npm run build` must pass; verify no Admin key,
credential environment name, or default admin password enters generated frontend assets.
