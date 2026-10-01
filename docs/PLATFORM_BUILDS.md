# Android / Windows local packages

Builds use real public Firebase config `solar-erp-51870` from the original APKs; all six client fields match. No emulator, seed, production migration/write/deploy/commit/push occurred. No server credentials or local SQL documents are packaged.

- Android: `release-artifacts/android/SolarERP-1.0.104-debug.apk`, versionCode 104 (original APK 103). Debug signing certificate matches the original APK; apksigner verification PASS. Release keystore was not found; no signed release AAB produced. Native device/AVD verification unavailable.
- Windows portable: `release-artifacts/windows-client/SolarERP-1.0.81-portable.exe`.
- Windows installer: `release-artifacts/windows-client/SolarERP-1.0.81-setup.exe`. Both unsigned. Actual packaged Electron login window launch PASS with an isolated verification profile.

`scripts/build-real-platforms.mjs` builds web, syncs Capacitor, builds debug APK with a non-downgrade version and invokes `scripts/package-desktop-client.mjs`. Desktop uses an isolated package with UI/Electron and 65 static-server dependencies, excluding backend/data/env. The packaged static server has no privileged CRUD/auth/bot service. Secret scan: zero private server/data/env files and zero known Telegram secret matches in packaged UI.

Responsive changes cover shrinking content, wrapping headings/body labels, 44px controls, scrollable tables and bounded scrolling modal panels. Login at 320/360/390/430px: zero viewport overflow and tap-size checks PASS. Android native system-bar/cutout insets were added; Java mixed-content override changed from ALWAYS_ALLOW to NEVER_ALLOW. Authenticated dashboards/tables/modals cannot be claimed verified without real authenticated access.

**NOT READY FOR PRODUCTION USE:** repository API is public HTTP; HTTPS endpoint and verified real server login are unavailable. Production transport continues to reject sending credentials over HTTP. The app now renders a configuration message instead of crashing during module import, and keeps login disabled for invalid production API config. Real Firestore unauthenticated reads return permission-denied. Dashboard/projects/workers/expenses/payroll/logout flows are BLOCKED, not PASS. No anonymous user or browser role fallback was added. Electron 33 desktop dependency security blockers from FINAL_RELEASE_GATE.md remain.

Local checks: frontend build, Android debug build, portable/NSIS installer packaging, actual Electron window, auth suite, release/static checks, APK certificate/config and secret scan PASS. Missing real-auth/native-device evidence means comprehensive responsive/functionality sign-off remains FAIL/BLOCKED.
