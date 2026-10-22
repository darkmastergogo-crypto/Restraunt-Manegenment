# Implementation handoff

## Delivered

A new shared multi-restaurant source project targeting the supplied Appwrite project. Frontend and server code, public project configuration, setup/deployment script, private maintenance job, local demo, tests and documentation are included.

Primary workflow implemented and locally exercised: restaurant URL → QR visit → customer order → same-restaurant kitchen, plus customer music request → Requests board. Admin text/theme/brand/receipt/visibility controls and owner feature/settings-group controls are included.

## Main-admin addition

Separate `/admin` owner login/workspace, global restaurant list/search, create restaurant and automatic copyable URLs. Open restaurant / Settings / Features & permissions target the selected tenant. Creation was removed from restaurant pages. Owner authorization and MFA remain server-side; the list is not public. See README for the chosen-account user-ID setup.

## Verified here

- Service tests and Appwrite-adapter/configuration contract tests: see `test-results.txt` for the exact count and individual cases.
- Main-admin service guards and local UI states: `main-admin-ui-results.txt`; simulated sign-in sequences in `main-admin-auth-ui-results.txt` (not real hosted sign-in).
- Syntax and synchronized schema-copy checks: `npm run check`.
- Local Chromium workflow smoke tests: see `ui-test-results.txt`.
- Desktop 1440 px and mobile 390 px screenshots reviewed. Customer/admin screens showed no page-level horizontal overflow at those tested widths.
- Browser SDK globals and supplied project-ID property checked in local Chromium.

- Original Release 44 stylesheet stacks restored for the main visual shell; see `APPEARANCE-RESTORATION.md`. Exact pixel parity of every advanced view is not claimed.
- Extra layout and theme-priority checks: `layout-test-results.txt` and `theme-test-results.txt`.

## Not verified or not complete

- No live Appwrite account access, schema installation, function deployment, production URL or data migration was performed.
- Hosted ACLs, concurrent Appwrite transactions, auth/MFA/cookie behavior, cron execution and real receipt printers are not certified.
- This is not complete Release 44 feature parity. Background push, original recorded/custom voice packs, destructive device/records resets and several rich original reporting/editor workflows remain unported or simplified. Read `FEATURE-PARITY.md`.
- “Customizable” means the shipped safe settings schema, text registry and presentation controls. It does not mean arbitrary code execution or literal customization of all native browser UI/old implementation details.

## Next action

Run the local demo first. Then configure your Appwrite owner account and temporary setup credentials in your own private shell, follow README, and execute the hosted acceptance checklist before onboarding real restaurants. Keep the old application unchanged until data migration and parity decisions are complete.
