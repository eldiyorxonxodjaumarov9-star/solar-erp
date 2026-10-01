# Android native staging sign-off ? BLOCKED (no device/AVD)

Use isolated staging/emulator data and an HTTPS staging API. Never use production accounts for this checklist. Demo unsigned release artifact cannot be installed as a trusted production app; build/sign a staging debug APK when a device/AVD is available. Record device/Android/WebView versions and artifact SHA256. Do not silently accept self-signed TLS or enable cleartext.

1. Fresh install or controlled test-profile reset; verify no cached `currentSession` grants access.
2. Admin login ? dashboard, workers, assigned/all projects, expenses, payroll, settings ? logout. Confirm wrong password generic failure.
3. Usta login ? own profile, assigned projects, own payroll and expenses. Worker B profile/payroll/project/media requests DENY; forged localStorage/body IDs DENY.
4. Asisten login ? projects, quote/supply, own activity. Payroll/settings/staff edits DENY.
5. Force-stop/cold-start each role; Firebase persistence restores only the verified role. Clear application test data/fresh install ? login required.
6. Exercise ID token refresh and server sessionVersion rotation. Old/stale token fails; new verified login works. Disable the emulator/staging account via protected admin API ? active and refreshed sessions DENY, login DENY. Do not change real users.
7. Logout ? private route/content/cache cleared; back-navigation and cold-start cannot restore privileges. Wrong/expired/revoked/anonymous token DENY.
8. Validate certificate chain/hostname over HTTPS; public HTTP API fail-fast and Android cleartext refused; no mixed content or fallback public HTTP host.
9. Upload JPEG/PNG/WebP via signed server API; own authorized blob renders. Other owner/project, executable MIME/signature and oversize DENY. Network failure shows an error, never success/zero payroll.
10. Old leaked token URL must DENY after authorized token migration; direct Firebase read/metadata/upload/URL mint DENY. Private server read accepts verified owner/admin and current account version only. Repeat after logout/disable.
11. Staging payment save/retry idempotence and report month/worker separation; verify incomplete-rate/loading/error indicators. No production payment writes.
12. Capture sanitized results/screenshots and network status codes without tokens/passwords; explicitly sign off all cases. Any untested/failed case keeps release NO-GO.

Current automated evidence: static transport/backup/packaging checks, browser mobile persistence/role smoke, private API emulator tests, and local release APK build. These do not replace this native checklist.
