# Release 46 validation

## Passed locally

- `npm test`: 81 tests, 81 passed, zero failures.
- `npm run build`: syntax checked 41 JS files, shared schema copies match, 497 text entries, 73 capability catalog entries; Function tarball generated.
- Restaurant static build: role-specific manifest IDs/start URLs, configured restaurant display name and public configuration allowlist. Dummy settings only; no live deployment.
- Owner static build: owner manifest starts at /admin.
- Local Chromium: existing QR after table rename, customer Call waiter visible in kitchen Requests, counter call visible, checkout confirmation, order tracking and acceptance transition.
- Kitchen page width checks: 390, 768, 1440 pixels; no document-level horizontal overflow. Navigation itself can scroll horizontally on narrow screens.
- Waiter private-link demo: Requests tab at 390 pixels; no document-level horizontal overflow.
- Install help, service worker registration/control and manifest parsing.
- Normal-profile Chromium `Page.getInstallabilityErrors`: empty list. Private browser contexts correctly reported in-incognito; that is not evidence of installability on real devices.
- Offline navigation served a 503 connection-required explanation. No cached restaurant data or offline order queue.

## Not performed

- No Git push or Appwrite deployment/account changes.
- No real Android or Windows OS installation.
- No real locked-phone/tab-closed push delivery. Earlier push browser tests used mocked browser permission/PushManager/transport; those are not real-device delivery tests.
- No hosted Appwrite transaction, authentication, domain or Git integration acceptance for Release 46.
- No assertion that all possible bugs, network conditions or device/browser variations have been covered.

The local preview runs sample in-memory data, not client Appwrite records. Follow RELEASE46-UPDATE-GUIDE.md before client rollout.
