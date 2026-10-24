# Release 47 validation

## Completed locally

- **90 automated tests passed, 0 failed**: 81 supplied platform/push/Sites/Release46 tests plus nine appearance tests. Theme tests cover modes, palette preservation, malformed colors, device preference, text/accent contrast on base palettes, storage failure and tenant-scoped preference keys. This is not a full accessibility audit or a guarantee for arbitrary client-selected colors.
- `npm run check`: passed; 43 JS/MJS files syntax checked and shared schema copies matched. The optional CJS browser script was separately syntax checked.
- `npm run build`: passed; static source output and nested Function archive generated. 504 interface/settings/feature texts registered and customization catalogs generated for the existing 73 capabilities.
- Owner and restaurant `scripts/build-site.mjs` builds both passed with placeholder public settings. New appearance assets were present and restaurant manifest identities used the expected restaurant path. No cloud API was contacted by these builds.
- **24 role/layout combinations**: owner, kitchen, menu and waiter × Light/Dark × 390/768/1440 px. No document-level horizontal overflow and no uncaught page JavaScript errors in the recorded runs.
- **72 staff view/layout combinations**: all 12 navigation sections × Light/Dark × 360/768/1440 px. No document-level horizontal overflow in the recorded runs. Sections: orders, billing, records, dashboard/analytics, requests, tables, devices, menu editor, stocks, management, notifications and owner controls.
- Six owner overlap checks across both modes and 360/768/1440 px confirmed the main content was not underneath the header.
- Real local browser workflow assertions: appearance reload persistence; live system-theme change; customer waiter call visible in kitchen Requests; waiter receives call and marks On the way; table display name saves with identical QR token; search survives appearance changes; empty-search reset; cart/notes → confirmation; kitchen acceptance → Cooking; tenant/owner preference isolation.
- The optional packaged browser test was run successfully against a fresh in-memory demo, in addition to the initial local workflow run. It records 12 workflow assertions and 72 staff layout checks.
- Direct phone viewport check: checkout drawer occupied y=0..844 in a 390×844 viewport, with native modal backdrop and scrollable contents. Phone screenshot captures use viewport screenshots for dialogs, since full-page Chromium captures can composite fixed elements misleadingly.
- Visual inspection included desktop owner/menu, phone kitchen/menu/waiter, requests in dark mode, management in light mode and checkout.
- All **13 backend/shared source files** from the uploaded source remained byte-identical. Existing source files were retained. The regenerated tar archive differs in archive bytes/timestamps, not backend source.

## Included evidence

- `release47-test-results.txt`, `release47-check-results.txt`
- `release47-layout-results.json`, `release47-browser-results.json`
- `release47-static-build-results.txt`, `release47-source-comparison.json`
- `release47-previews/` — selected local demo screenshots, not production restaurants
- `tests/appearance47.test.mjs`, optional `tests/browser-release47.cjs`

The archived earlier Release46 reports describe prior milestones, not additional tests performed for Release47.

## Not established by these checks

No production deployment, hosted Appwrite authentication/MFA round trip, live tenant data exercise, actual Android/Windows OS installation, real locked-phone push delivery, full accessibility audit, every browser version, every restaurant's custom palette/image/text configuration, or an exhaustive absence of bugs. Test your own staged Site and actual devices before rolling out to clients. No native APK/EXE was created.
