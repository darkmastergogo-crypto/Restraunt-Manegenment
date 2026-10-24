# Release 47 — one design system across the restaurant platform

## What this package is

This is a source update built from your uploaded **Restaurant-Platform-Release46-Refined.zip** and **DESIGN.md**. It extends the Manus-inspired editorial design to the entire existing application, rather than replacing your working application with a mockup.

**Not deployed to Appwrite. No cloud data, accounts or settings were changed.** Browser demonstrations and regression workflows used the local in-memory demo, not your production restaurants.

## Design coverage

- Platform-owner overview, restaurant cards, URLs and owner sign-in components.
- Customer menu, categories, search, dietary filters, photos when configured, portions, quantity controls and floating cart.
- Checkout drawer, confirmation, tracking, history and receipt dialogs.
- Kitchen/admin navigation, orders, requests, billing, records, dashboard, tables/QR cards, customer devices, menu editor, stock, management and notifications.
- Waiter header, request/order navigation and request handling.
- Shared form controls, cards, spacing, statuses, dialog styling, focus indicators and reduced-motion behavior.

### Appearance choices

Use the **Appearance** dropdown in the header:

1. **Restaurant theme** — uses the restaurant's saved palette, including saved dark palettes; uses the new layout in either case.
2. **Light mode** — warm paper surfaces, dark ink and terracotta emphasis.
3. **Dark mode** — warm charcoal surfaces, light text and readable accent colors.
4. **Device theme** — follows the operating system's current light/dark preference, including changes while the page is open.

The dropdown respects the existing restaurant theme-switch feature permission. Owners can control the feature as before. The platform-owner console always has its own Appearance selector.

The preference is stored locally, scoped to the browser origin and restaurant slug. It is not a database-wide branding change or an account preference shared across devices. Owner preference is separate. Other open tabs for the same restaurant on the same origin receive changes. Different restaurant domains have separate browser storage. If browser storage is unavailable, the appearance change lasts for the current page session only.

Changing appearance does not rebuild the page, discard an active search or overwrite restaurant settings. Explicit modes keep a tenant accent only when readable against their surfaces, otherwise using the coordinated default. Choose Restaurant theme to see saved palette values exactly. Logo, dish image, font and radius customization remain available.

### Responsive behavior

- Desktop kitchen/admin: fixed-width navigation rail in a grid, normal-flow page content, sticky header.
- Tablet/phone kitchen/admin: horizontal scrollable navigation and stacked content. No fixed-height header offsets.
- Customer menu: desktop category sidebar/two-column dishes; compact horizontal categories and single-column menu on phones.
- Waiter: paired request/order workspaces on wide screens; select the active workspace with Requests/Pending Orders tabs on phones/tablets.
- Phone checkout: full-width drawer with scrollable body and place-order action. Desktop checkout: right-side drawer.
- Owner header no longer covers the title/content as in your screenshot.

This is a responsive web/PWA interface, not a new native Android/Windows application. Existing installation and Web Push components remain intact. Actual device delivery and installation still need the hosted checks below.

## Features/data preserved

All 13 supplied backend/shared-source files compare byte-for-byte unchanged, including API authorization, tenant isolation and shared schema. Public request paths, feature gates and table identifiers are retained. No migration, new permission scope or new secret is needed specifically for this visual update.

Existing functionality is retained: custom menu/photos/portions, QR access, editable table names, requests/music, order acceptance/tracking/cancellation, billing, records, stocks, staff access, owner feature controls, MFA, Sites provisioning, PWA and Web Push setup.

The existing pending-order rule remains **two unaccepted pending orders per device per restaurant**, not a two-order limit for the entire restaurant. Accepting one frees a slot; an existing stricter configured limit can still apply. This rule was not rewritten by the redesign.

Renaming preserves the stable table ID and QR token. Old order/request name snapshots stay historical. Reopen/rescan the same QR to refresh a customer's previously opened table label.

## Safest update steps for your existing Appwrite setup

1. **Back up** the repository commit and active Site deployments. Test on a staging Site first. Keep existing restaurant data and private variables.
2. Extract the ZIP. Copy the package contents into your existing source folder (previously `restaurant-live`), replacing supplied source files. Avoid creating an extra nested folder inside that source root. Do not delete unrelated files or private environment settings.
3. From the source folder run:

   ```bash
   npm ci
   npm test
   npm run check
   npm run build
   ```

4. Commit the tested source to the branches your Sites actually use: previously `main` for the central owner Site and `restaurant-live` for client Sites. Branch name and repository folder name are separate settings. Do not push to client production branches until staging passes.
5. Keep your existing Site root and build settings. For the existing setup these were:

   | Setting | Value |
   |---|---|
   | Root | `./restaurant-live` (or the source folder already configured in your repository) |
   | Install | `npm ci` |
   | Build | `node scripts/build-site.mjs` |
   | Output | `dist` |
   | SPA fallback | `index.html` |

6. Preserve existing `SITE_MODE`, `PUBLIC_APPWRITE_ENDPOINT`, `PUBLIC_APPWRITE_PROJECT_ID`, `PUBLIC_APPWRITE_FUNCTION_ID`, and restaurant-specific `RESTAURANT_SLUG`, `RESTAURANT_ID`, `OWNER_APP_URL`/optional `RESTAURANT_NAME` values. Never copy another client's identity into an existing client Site. Do not put API keys or VAPID private keys in frontend build variables.
7. Trigger/review a successful deployment for the owner Site **and each client Site that should receive this design**. Updating only the owner Site does not restyle a separately deployed restaurant Site. Existing Sites may rebuild automatically if connected to the updated branch; inspect their deployment status rather than assuming they updated.
8. Reopen/reload old tabs and installed PWA windows. Choose Light mode or Dark mode in the header to preview each coordinated palette. Restaurant theme deliberately preserves any saved restaurant palette.
9. Run the hosted acceptance checklist before sharing the update with clients.

### Do I need to redeploy the Functions?

**Not for this design-only update if your existing backend already matches the supplied Release46 Refined source.** Backend source and schema are unchanged. The package includes a freshly generated `build/restaurant-function.tar.gz` for completeness, not because a new API deployment is required by these UI changes. Its archive bytes can differ because archive timestamps change.

If your cloud backend is older or incomplete, follow `docs/RELEASE46-UPDATE-GUIDE.md` and the Sites/push setup guides, preserving Function IDs, variables, scopes, worker schedule and private execution settings. Never upload this entire source ZIP as an Appwrite Function. Only the nested Function archive is a backend upload.

## Local preview

```bash
npm ci
npm run dev
```

Open the printed owner/demo links. The default server port is 8744; `PORT` and `HOST` can override it. The console prints a valid table QR URL for customer ordering. This server seeds sample data in memory, bypasses real sign-in and resets on restart. **Do not deploy this demo server or share its demo links as production client access.** The "LOCAL DEMO" banner is expected; it is not proof of a live cloud connection.

## Hosted acceptance checklist

- Owner: title below header; restaurant search, customization/dashboard links and provisioning permissions work.
- Customer: configured photos/prices/portions remain; filters reset; cart quantities, notes and order submission work.
- Requests: customer and counter calls appear in the correct restaurant's Requests; waiter marks On the way/Handled.
- Tables: save a custom display name, then scan a previously printed QR. Stable QR access and history remain.
- Orders: accept an order and verify customer tracking; check the existing pending-order limit, cancellation and receipts.
- Roles: owner/admin/manager/waiter permissions still match your intended access. Do not disable MFA or make databases public to bypass sign-in issues.
- Appearance: check Restaurant/Light/Dark/Device modes on menu, kitchen and waiter; reload and verify the local preference. Verify your own custom colors and font in Restaurant theme.
- Layout: test Android phone, tablet and Windows at normal and enlarged text/zoom. Check long names and your actual food photos, not just sample content.
- PWA: install/open the client's HTTPS Site on Android/Windows. This remains a PWA, not an APK or EXE/MSI.
- Notifications: with server Web Push configured, test a real order/request while the staff phone is locked and the browser tab closed. OS permissions, force-stop, network and battery settings can affect delivery. Installation is not push activation.

## Validation and limits

See `docs/RELEASE47-VALIDATION.md` and the included result logs. Local checks are not a guarantee that every possible bug is removed. Production Appwrite authentication, hosting/deployment, actual OS installation, locked-phone push, device-specific browser behavior and a full accessibility audit are not established by local layout tests.

## Rollback

Restore your backed-up source commit and redeploy the affected Sites. Keep restaurant data and identities intact. A saved `rp:appearance:v1:` browser preference can be ignored by older code; it does not modify the server. No database rollback is necessary for this visual update.

### Optional reproducible browser test (developers)

`tests/browser-release47.cjs` is an optional Playwright script, separate from `npm test`. It only permits localhost/127.0.0.1 targets because it creates sample requests/orders and renames the demo table. Start a fresh `npm run dev` server first. Use a Node environment with the `playwright` package and its Chromium available, then run:

```bash
DEMO_BASE_URL=http://127.0.0.1:8744 node tests/browser-release47.cjs
```

`PLAYWRIGHT_MODULE` and `CHROMIUM_EXECUTABLE` can point to an existing Playwright installation/browser; `BROWSER_OUTPUT` changes the screenshot/result directory. Without them, standard Playwright module/browser resolution is used. This extra test dependency is not added to your production dependencies. The script outputs its workflow assertions and layout results. It does not sign into or test hosted Appwrite.
