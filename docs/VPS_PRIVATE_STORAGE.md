# VPS private media — 2026-10-02

Firebase Storage/Blaze is not used in production. Server env selects PRIVATE_STORAGE_ADAPTER=vps and PRIVATE_MEDIA_DIR=/root/solar-erp-private-media. Root directory is outside the app/static tree, root-owned and 0700; object and immutable metadata sidecars are 0600. Existing env values and server credential were preserved; pre-change private env backup is retained on VPS. Only solar-erp was restarted; shared ERP routing and PM2 global persistence were not changed.

## Access model

Existing /api/upload/private-image and /api/private-storage endpoints remain unchanged, protected by verified Firebase ID token, account/session state, role/actor ownership and project scope. Server assigns random UUID filenames and owner IDs. The client never receives a disk path or public download token; private-storage references are fetched with bearer authentication and rendered as local blob URLs. Images remain limited to JPEG/PNG/WebP and 10 MiB, video 50 MiB. MIME magic, executable names, traversal, symlinks and size are checked; malformed/oversized multipart errors have generic 400/413 responses. Public /uploads and /media URLs stay denied by nginx.

VPS image metadata is recorded in mediaAssets using UUID filename, server owner, project, MIME, size, private reference, adapter and timestamp. No credential/private key/password/public-token data is stored there. Existing business records are unchanged. Backend document/report media readers use the same selected adapter. Firebase bucket mode remains an explicit optional adapter; there is no automatic insecure cloud/public fallback.

## Verification

- Local actual-router suite: 19 assertions PASS; Linux production host suite additionally tests symlink rejection.
- Production existing-admin upload 200, download 200 and byte identity PASS; tokens absent read/write 401; direct public URL 404; traversal 403.
- A uniquely named tiny synthetic PNG smoke object and its metadata remain for audit; no existing object or business record was overwritten/deleted.
- Real projects count rechecked 65, workers 13. Server media root mode confirmed 0700 and active adapter vps.
- Auth and dedicated production-platform routing suites and hardening PASS. This does not claim real worker/assistant credential migration or device testing.

## Operations

Back up the private media directory plus corresponding mediaAssets metadata to restricted/encrypted storage; coordinate restore so references and objects agree. Existing code backup excludes this external directory. Preserve legacy video directory data/uploads separately. Monitor filesystem space, rate/size limits, TLS renewal and backup restores. Metadata-save failures can leave inaccessible orphan objects; investigate before cleanup and never delete business objects automatically.

Native build gate still requires real HTTPS/admin/data/media smoke evidence; VPS media now satisfies it without a Firebase bucket. Builds use solar-erp-51870 and https://77.237.237.94 with emulators disabled. Android debug signing and unsigned Windows packages are permitted for this delivery; release signing/device validation and prior security release risks remain separately documented.
