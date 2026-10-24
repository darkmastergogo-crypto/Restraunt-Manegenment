# Release 47 design update

Current update: **`docs/RELEASE47-DESIGN-UPDATE.md`**. Full source, shared light/dark design, local browser validation, no cloud deployment or database migration. The earlier architecture documentation follows.

---

> **Automatic Appwrite Sites release:** start with [docs/APPWRITE-SITES-SETUP.md](docs/APPWRITE-SITES-SETUP.md). This adds name-only creation, separate Site URLs, unique UUID tenant IDs and protected provisioning. Existing instructions below describe the earlier shared-host deployment and must not override the new Sites guide. This package is not a live deployment.

# Shared Restaurant Platform — Appwrite migration beta

One deployed frontend, one Appwrite project, many restaurant URL spaces.

**Status: working source implementation with local tests, NOT a live deployment and NOT a complete production-certified Release 44 replacement.** Read `docs/FEATURE-PARITY.md` before switching a restaurant. The original feature audit is included separately; it describes the old application, not a promise that every detail has been ported.

## Appearance update: keep the original website layout

This revision uses your supplied Release 44 website as the visual reference, not the earlier Copper & Steam redesign. The main menu, kitchen/admin shell, Requests, checkout and waiter layouts reuse the original stylesheet stacks. New customization controls are under **Management**; the music button uses the existing customer-tools area. Existing header actions are kept in their original areas.

See `docs/APPEARANCE-RESTORATION.md` for the changes and scope. **Not every advanced screen or dialog is pixel-identical yet**; the parity limitations below still apply.

## Separate main-admin workspace

The platform owner now has a separate **`/admin`** workspace: list restaurants, create restaurants and copy their menu/admin URLs. Restaurant consoles no longer contain **Create restaurant**. Their **Owner controls** area manages only that restaurant's supplied features/settings permissions and links back to Main admin. A successful platform-owner password + authenticator sign-in from a restaurant console redirects to Main admin; ordinary staff remain in their authorized restaurant. `/` and `/login` also open Main admin.

## What is included

- Restaurant-specific menus, kitchen/admin screens and revocable waiter links.
- Server-side tenant membership checks, private database rows and owner-only feature entitlements.
- Admin customization of brand, images, main theme colors, typography, receipt fields, registered interface text, module visibility, timings, tax, contact details and staff permissions.
- Owner controls for which settings groups restaurant admins may change.
- **Request music** in the menu → restaurant kitchen **Requests** → Playing / Played / Rejected. Admin hide/show and owner entitlement controls are both enforced server-side.
- QR visits, customer order submission/history/cancellation, kitchen transitions, manual cash/online bills, receipt preview/printing, records and CSV, stock reservation/restoration, table QR generation/rotation, devices/blocking, basic tabular reports and notifications.
- Appwrite schema/provisioning script; public API and private scheduled maintenance function sources; deployment bundle; automated tests; desktop/mobile screenshots.

The app is a new multi-tenant implementation, not the old Supabase code with a changed endpoint. It does not silently fall back to demonstration data when Appwrite fails.

## Your supplied public configuration

| Setting | Value |
|---|---|
| Appwrite endpoint | `https://fra.cloud.appwrite.io/v1` |
| Project ID | `6ad97acd003c74f33ec9` |
| Public function ID | `restaurant-api` |
| Private maintenance function | `restaurant-maintenance` |
| Database / table | `restaurant_platform` / `entities` |

These public identifiers are configured in `public/config.js`. **There is no API key, password, service-role secret or live customer data in the frontend.** No changes were made to your hosted project while preparing this package.

## 1. Try it locally without Appwrite

Install Node.js 22+ and npm. Extract this ZIP, open a terminal in its folder:

```sh
npm ci
npm test
npm run dev
```

Open the **exact local demo URL printed by the terminal**. It includes a `?demo=1` flag and uses `127.0.0.1`, not `localhost`:

- Main admin (automatically privileged LOCAL demo): `http://127.0.0.1:8744/admin?demo=1`
- Staff: `http://127.0.0.1:8744/r/demo-cafe/admin?demo=1`
- Customer: use the printed QR URL (its secret changes when the server restarts).

The demo runs the same domain service with an in-memory test store, an explicitly privileged local demo identity and MFA disabled **only in the local test wrapper**. Data disappears on restart. A visible banner marks it as a demo. **Never deploy `scripts/dev.mjs`, expose it through a public tunnel, or use it as the production backend.**

Production uses the Appwrite store and function entrypoint, not this demo server.

## 2. Prepare the real Appwrite project

1. Open your Appwrite Console and select project `6ad97acd003c74f33ec9` in Frankfurt.
2. Add a Web platform for your deployed frontend hostname. **Hostname means only the domain**, e.g. `my-restaurant-platform.vercel.app`, without `https://`, `/admin` or `/r/...`. Vercel supplies the website address after frontend deployment; Appwrite does not create it. See the URL guide below. Use the actual domain, not an unrestricted wildcard; register a separate development hostname if needed.
3. Enable email/password authentication. Create your platform-owner account in Appwrite Auth and record its **Appwrite user ID**, not its email or project ID. Create restaurant staff accounts the same way for now; account invitations/self-service onboarding are not implemented here.
4. Create a **temporary server setup key** with the database/table/column/index/row read-write scopes needed by setup. If deploying the functions through the script, also grant function/deployment/variable management as exposed in the Console. Do not grant such a key to the browser or a restaurant admin.
5. Check your project's transaction support, Function runtime availability and account quotas. This code requires current **TablesDB transactions**. It intentionally has no non-transactional production fallback.

This design uses private application membership rows, **not one Appwrite Team per restaurant**. The screenshot's “100 teams” claim is not used as a capacity assumption. Storage, reads/writes, function execution and other quotas are still shared across the project; this does not mean unlimited restaurants.

## 3. Set up database (first restaurant optional)

Set these variables in your **local shell**, not `public/config.js` or a public `.env` file. A blank `.env.example` is included. The scripts read actual environment variables; they do **not** automatically load a `.env` file.

```sh
export APPWRITE_ENDPOINT='https://fra.cloud.appwrite.io/v1'
export APPWRITE_PROJECT_ID='6ad97acd003c74f33ec9'
export PLATFORM_OWNER_IDS='YOUR_EXISTING_APPWRITE_USER_ID'
# Leave blank to create the first restaurant later from Main admin.
export INITIAL_RESTAURANT_SLUG=''
export INITIAL_RESTAURANT_NAME=''
# Enter the real setup key privately, without putting it in shell history:
read -rsp 'Temporary Appwrite setup key: ' APPWRITE_API_KEY; echo
export APPWRITE_API_KEY
npm run setup
```

The script creates the private database/table, columns, indexes and platform lock; waits for schema readiness; then provisions the first restaurant if its slug is supplied. Existing IDs are reused rather than dropped. Unexpected table permissions cause setup to stop. There is no automatic import of your old database.

## 4. Deploy Appwrite Functions

The optional setup path packages and submits both function deployments:

```sh
export DEPLOY_FUNCTIONS=true
npm run setup
unset APPWRITE_API_KEY
```

Then check both deployment builds in the Console. A submitted deployment is **not** proof the build is ready. If the deployment script encounters an existing function with incompatible permissions/entrypoint, inspect it rather than bypassing the guard. Check the target project supports the requested `node-22` runtime.

Manual alternative: `npm run build` creates `build/restaurant-function.tar.gz`. Create the following two functions from that same bundle:

| Setting | Public API | Private maintenance |
|---|---|---|
| ID | `restaurant-api` | `restaurant-maintenance` |
| Entrypoint | `src/main.mjs` | `src/maintenance-main.mjs` |
| Build command | `npm install --omit=dev` | same |
| Runtime | Node.js 22 | Node.js 22 |
| Execution permissions | Any (guests need QR ordering) | **None** — never Any/Users |
| Schedule | none | `*/5 * * * *` |
| Dynamic-key scopes | `rows.read`, `rows.write` | `rows.read`, `rows.write` |
| Environment | `PLATFORM_OWNER_IDS`, `DATABASE_ID=restaurant_platform`, `REQUIRE_ADMIN_MFA=true` | `DATABASE_ID=restaurant_platform` |

The runtime must inject its short-lived `x-appwrite-key`. Authenticated API executions also use Appwrite's trusted `x-appwrite-user-jwt`. Invoke the API through Appwrite's execution API/SDK, as the frontend does. **Do not wrap this handler in an open HTTP server that trusts caller-supplied `x-appwrite-*` identity headers.**

Keep platform owner IDs correct and keep `REQUIRE_ADMIN_MFA=true` in production. Never supply the setup key to `public/`; the function uses its runtime dynamic key. Revoke the temporary setup key after installation. Test maintenance manually from an authorized Console context and confirm its schedule executes.

## 5. Deploy the frontend once

```sh
npm run build
```

Deploy **only the `dist/` folder** to Vercel or another static host. Its included `vercel.json` rewrites `/r/*` URLs to the app and supplies basic response headers. With another host, provide the same SPA fallback and HTTPS. Do not upload the repository root, demo server, test data or `.env` files as publicly served files.

Example URLs after deployment:

```text
https://your-domain.com/r/my-first-restaurant/menu
https://your-domain.com/r/my-first-restaurant/admin
https://your-domain.com/r/another-restaurant/menu
https://your-domain.com/r/another-restaurant/admin
```

`/r/SLUG/kitchen.html` is an alias for the admin/kitchen screen. `/r/SLUG/waiter.html` is also recognized; generated waiter links use `/r/SLUG/waiter#key=SECRET`.

Subdomains, custom restaurant domains, payment-gateway integration and recurring SaaS billing are not implemented.

## 6. First owner login and restaurant setup

1. Create your intended owner account in Appwrite Auth with your chosen email/password. Copy its **user ID** into the API function's `PLATFORM_OWNER_IDS` environment variable (comma-separated IDs for multiple owners). Do not put an email, password or API key in frontend code. A matching email alone does not grant ownership.
2. Visit **`https://YOUR-WEBSITE-HOSTNAME/admin`**, not a restaurant URL, and sign in with that account. Owner/admin access requires authenticator verification. Use **Authenticator options** after the password session is established to enroll TOTP, enter its generated code and then verify the session. Keep a secure backup of the authenticator secret. Existing TOTP users are challenged on sign-in. This hosted MFA flow still needs acceptance testing against your project.
3. In **All restaurants**, choose **Create restaurant**, enter its name and unique lowercase URL slug (3–48 letters/digits/hyphens), and save. A dialog and restaurant card show its copyable customer menu and admin URLs. Choose **Open restaurant**, **Settings**, or **Features & permissions** to manage that restaurant. Owner controls inside the restaurant link back to Main admin. Backend authorization denies global listing/creation to restaurant staff. The owner can access every active restaurant without a separate membership row.
4. In **Management → Staff**, add an existing Appwrite user's ID as Admin or Manager. Membership is local to that restaurant. Staff accounts must already exist. Only configured platform-owner IDs can provision restaurants or change supplied features.
5. In **Menu Editor**, add dishes. Add portions using JSON entries such as `[{"id":"regular","label":"Regular","price":120}]`. Preserve an existing portion ID when changing its price so its stock mapping stays valid. The beta uses a JSON portion editor, not the original polished multi-size dialog.
6. In **Tables**, add T1, T2, etc. Copy/download the generated QR. A generic menu link allows browsing; a valid table QR visit is required to order or send requests.
7. In **Stocks**, turn on tracking where wanted and set counts. Optional loops replace the count every 24 hours from their start, not at local midnight.
8. In **Management**, set brand/logo/theme/texts/receipt/tax/visibility, then **Save changes**. Settings changes apply only to the current restaurant. Conflicting revisions require reloading instead of overwriting another admin.

## Website hostname and restaurant URLs

For example, deploy the frontend once to Vercel and receive:

`https://my-restaurant-platform.vercel.app`

In Appwrite, register a **Web platform** with hostname **`my-restaurant-platform.vercel.app`**. This allows the hosted app to use the project from that website; it is not tenant authorization. Backend owner/membership checks still apply.

| Purpose | Example URL |
|---|---|
| Main admin (you) | `https://my-restaurant-platform.vercel.app/admin` |
| Restaurant A customer menu | `https://my-restaurant-platform.vercel.app/r/alpha-cafe/menu` |
| Restaurant A staff/admin | `https://my-restaurant-platform.vercel.app/r/alpha-cafe/admin` |
| Restaurant B customer menu | `https://my-restaurant-platform.vercel.app/r/bravo-cafe/menu` |
| Restaurant B staff/admin | `https://my-restaurant-platform.vercel.app/r/bravo-cafe/admin` |

These are examples; replace the hostname with your real deployed address. Creating a restaurant does **not** deploy a separate site or register a domain. Links are generated automatically from the current website origin plus its unique slug. Copy them from Main admin. For ordering/requests, generate table QR links in the restaurant's **Tables** screen; the plain menu URL is browsing-only until a valid table visit is opened. Existing table QR links must be regenerated/reprinted if the public domain changes. Per-restaurant custom domains/subdomains are not implemented.

For this update, rebuild/redeploy **both the frontend and `restaurant-api`**. Do not replace an existing configured database or overwrite tenant data to update the UI. Maintain the private scheduled function as documented. Main-admin route rewrites are included in `vercel.json` and copied into `dist/`.

## 7. Music request controls

- **Management → Visibility → Request music** hides or shows the menu button and denies new requests on the server when hidden.
- **Music queue in Requests** controls the queue feature. Requests and music must both be enabled.
- The owner can additionally deny either capability in **Owner controls**; the restaurant cannot override that denial.
- **Management → Texts** changes the button/title/form labels. **Behavior** changes cooldown and maximum pending requests per saved browser.
- Customers enter a song title, optional artist and optional HTTPS YouTube/Spotify link. The server rejects unsupported hosts and script URLs. Staff see the same request in that restaurant's Requests board.
- Requests do not autoplay tracks, download audio, integrate Spotify playback, or grant music/public-performance rights.

## 8. Safety and production readiness

Do not move active restaurants until completing `docs/HOSTED-ACCEPTANCE.md`. Important limitations:

- Backend tests use a serializing rollback-capable in-memory store. They test service logic, **not Appwrite's hosted ACLs or transaction behavior**. Cross-user hosted testing is mandatory.
- Updates poll every 10 seconds while idle, not Appwrite realtime. Foreground alerts require a user gesture and an open tab. Background push and the original recorded voice packs are **not migrated**.
- The main-admin list reads the registry and each restaurant's current display name/status. It is not paginated yet; add pagination and load tests before large restaurant counts.
- Small/medium data-volume beta: reports read tenant rows and aggregate in-browser, with an explicit 20,000-row guard. This is not a high-volume reporting system. Add server-side date filtering/aggregates, paging, retention and load testing before larger deployments.
- The scheduled maintenance function expires old Pending orders, restores same-generation reservations, applies due stock loops and removes visits expired for over a day. Old orders/requests/notices are not generally purged; budget storage and implement an approved retention policy. A 900-second timeout does not guarantee a large maintenance run will finish.
- Browser blocking is only saved-browser blocking. Clearing browser storage/new devices can bypass it. QR links are bearer capabilities that can be copied, not proof of being physically present.
- UI labels, forms and safe image URLs are configurable. Arbitrary JavaScript/HTML, tenant isolation, auth rules, the protected Save/customization escape controls, and browser-native dialogs cannot be made tenant-editable. Some error/status text and the alternate light preset remain source-level. See the parity matrix; this is broad schema-based customization, **not literally every pixel or every old behavior**.
- CSV exports may contain customer information. Establish privacy notices, staff account lifecycle, data retention, backups and legal/tax review. Online is a recorded payment label, not verified payment processing.

## Files and commands

- `public/` / `dist/`: frontend source / built frontend.
- `functions/restaurant-api/src/`: production handler, private scheduler, tenant service, validation and Appwrite adapter.
- `shared/schema.mjs`: central feature/settings schema. `npm run build` synchronizes the browser/function copies.
- `scripts/setup-appwrite.mjs`: server-only provisioning/deployment.
- `scripts/dev.mjs`, `scripts/memory-store.mjs`: local-only demo and test harness.
- `npm test`: service tests, no live project needed.
- `scripts/owner-ui-smoke.mjs`: optional local main-admin workflow checks with Playwright/Chromium. Does not test hosted email/password or MFA.
- `npm run check`: syntax and schema-copy checks.
- `scripts/layout-audit.mjs` and `scripts/theme-audit.mjs`: optional local position and theme-override checks, requiring the same browser tools and demo server.
- `scripts/ui-smoke.mjs`: optional local Playwright smoke test, requires Playwright + system Chromium and the demo server. Run with `node scripts/ui-smoke.mjs` on a **fresh** demo session. Set `CHROMIUM_BIN` if needed. Playwright is intentionally not a production dependency.
- `docs/`: original audit, feature parity, customization catalog, security design, hosted acceptance checklist, test logs and local screenshots.

No API keys are required to review or run the local demo. Enter private credentials only into your own protected environment when you are ready to configure the hosted project.
