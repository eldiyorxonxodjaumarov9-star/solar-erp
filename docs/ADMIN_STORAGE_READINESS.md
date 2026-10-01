# Admin and Storage readiness — 2026-10-01

## Completed production admin setup

- Firebase Console access to solar-erp-51870 was verified. The operator authorized key generation; downloaded JSON project/type was checked internally and never printed.
- Credential installed at /root/solar-erp-secrets/firebase-admin.json, root owned, directory 0700/file 0600; GOOGLE_APPLICATION_CREDENTIALS points there in private /root/solar-erp/.env. Temporary local JSON was removed after server initialization succeeded.
- Admin SDK initialization and custom-token signing PASS; invalid-token verification DENY.
- Only the explicitly approved admin:primary Firebase Auth account was created. Duplicate-safe lookup precedes creation; existing account/profile data was not overwritten. No worker/assistant credential migration or Firestore mutation was performed.
- Operator entered their admin credential into a short-lived loopback form. Only scrypt hash was transferred over trusted SSH and stored in server-only env; pre-change env backup was kept privately. Concurrent duplicate submission was rejected after first setup, preserving the first credential.
- Only solar-erp PM2 process was restarted. Global pm2 save was not used.

## Production client routing fix

Production desktop/localhost preview previously attempted relative /api first and got a local proxy 500. Native Android also retained the old /api/supply/compat rewrite, which was incompatible with the dedicated IP HTTPS vhost. Production clients now use explicit HTTPS origin only and preserve auth/session/staff/private media paths. Development relative proxy behavior remains. Actual-platform resolver regression and existing auth suites PASS; web build PASS.

## Real authenticated verification

Operator login through the actual frontend/Firebase signInWithCustomToken flow PASS. Browser UID matches admin:primary; server-verified session role is admin. Session 200, staff 200 with 13 sanitized workers, invalid bearer 401. Token values were used only internally for requests and never logged, reported or stored as test artifacts.

Real admin Dashboard, Projects, Workers, Expenses, Payroll and Settings render without uncaught page errors or observed 401/403/500 errors. Refresh retains verified session. Real Admin SDK count repeated: projects 65, workers 13. Dashboard using existing helpers and actual UI: in progress 6, completed 59, income 4,185,240,000 UZS; expense sum 3,923,500 UZS.

## Required human billing step

Google Cloud bucket listing for solar-erp-51870 returns no buckets. Configured legacy appspot bucket returns 404. Firebase Console Storage shows Upgrade project and requires Blaze billing. Operator was asked to complete financial/billing confirmation directly; no billing or payment data was entered by the agent.

The approved Storage creation/security work is blocked until this human step is completed. No bucket, public access or Storage release has been created. Existing storage.rules default-denies all direct client read/write; planned server-mediated private delivery additionally requires enforced public-access prevention and uniform bucket-level access. Do not substitute public uploads, tokenized URLs or an insecure bucket to pass a smoke test.

After billing: create/register the correct Firebase bucket with reviewed region, set private IAM/PAP/uniform access, deploy and verify all-client-deny Storage rules, update server/client bucket config, run isolated authorized upload/download and unauthenticated DENY checks, recheck counts. Preserve existing data; use uniquely named smoke object without changing business records.

Final native builds remain blocked until private-media verification PASS. No fresh production-smoke receipt was fabricated. Existing native diagnostic artifacts are not new final builds. Worker/assistant production logins also remain unmigrated (private accountCredentials count 0; legacy credential-bearing profiles untouched).

Decision: PARTIAL; admin authentication and real data now PASS, Storage/billing and native final builds pending.
