# Automatic restaurant websites — one-time installation

## What this release does

The owner's workflow becomes **Create restaurant → enter name → wait for Ready → copy menu/dashboard/kitchen links → customize in dashboard**.

- One Appwrite project; one private TablesDB database/table.
- One central owner Appwrite Site and one Appwrite Site per restaurant.
- New restaurants get a permanent UUID restaurant_id; their name is not their identifier.
- Every new restaurant's data is partitioned by that UUID. Existing restaurants retain their existing IDs and data; they are not renamed or merged.
- Each restaurant Site is a static build of the same trusted repository. It has only its own public identity/configuration, no administrative keys.
- Menu, dashboard, kitchen are separate URLs on that restaurant's Site. Dashboard and kitchen use authenticated staff access. These are not three separate deployments per restaurant.
- The system discovers the actual active HTTPS domain from Appwrite; it never invents a production URL.
- The generated domain is controlled by Appwrite and may not contain the restaurant name. The site title/branding and URL path use the restaurant name/slug. Exact branded domains require optional domain configuration.
- Progress and retries are persisted. A failed build does not delete its restaurant data. A repeat Create request uses the same request ID and cannot duplicate the restaurant.
- Links are withheld until the requested deployment is active and the Site hostname has been registered as an Appwrite Web platform for sign-in.

**This source package is not a live deployment. No real Sites have been created during development. API calls were checked against the installed SDK and official documentation, and exercised with mocks, not a connected production Appwrite account.** Run the staging acceptance checklist before client use. Appwrite plan limits and charges still apply; provisioning multiple Sites is not a way around those limits.

## 1. Back up and use a staging copy first

Export/backup the production database and keep the current active backend deployment. Put this source in a new working folder/branch, not blindly over an unrelated project. It includes the visual portion editor.

Do not rerun database setup if your `restaurant_platform` / `entities` table is already working. No destructive migration is required. Table permissions and row permissions must remain empty (server-only); rowSecurity must remain enabled.

Keep the existing API Function ID. A deployment ID is not a function ID. Your current known API Function ID is `6ada10d40012db44568d`; verify this in your own console before setting build variables.

## 2. Connect the shared repository once

Push this updated project to your private Git repository. Your project folder may be `Restraunt Control`; that is the repository root directory setting if the repo contains other folders.

Create a `restaurant-live` branch containing this release. Keep your owner site on `main` and restaurant Sites on `restaurant-live`:

- Owner UI changes: push only to main, redeploy owner once.
- Shared restaurant-code release: test, then merge/cherry-pick into restaurant-live. All restaurant Sites connected to that branch can redeploy automatically.
- Rollback: revert the release on restaurant-live, or activate a previous deployment in Appwrite.
- Database/settings/menu changes: no frontend deployment.

A Git push to restaurant-live affects all Sites following that branch; it is not a staged rollout UI. Test on a staging project or branch before releasing. No automatic schema migration is performed.

## 3. Create the central owner Appwrite Site once

In the same Appwrite project, create **one** Site connected to the repository:

| Setting | Value |
|---|---|
| Branch | main |
| Root directory | your project folder (for example Restraunt Control), or empty if repo root |
| Framework | Other |
| Adapter | Static |
| Build runtime | Node.js 22 |
| Install command | npm ci |
| Build command | node scripts/build-site.mjs |
| Output directory | dist |
| SPA fallback file | index.html |
| Site runtime/build API scopes | none |

Set these Site build variables (public, not secret):

```
SITE_MODE=owner
PUBLIC_APPWRITE_ENDPOINT=https://fra.cloud.appwrite.io/v1
PUBLIC_APPWRITE_PROJECT_ID=6ad97acd003c74f33ec9
PUBLIC_APPWRITE_FUNCTION_ID=YOUR_EXISTING_API_FUNCTION_ID
```

Deploy it. Copy its generated HTTPS domain and Site ID. Add that exact hostname as a **Web platform** in the project so owner sign-in is permitted. Do not allow every origin or use a shared wildcard. Sign in with your existing platform-owner Appwrite user and enroll TOTP MFA if needed.

This central owner Site also serves as the trusted Git connection template; it is NOT cloned with credentials. The server reads only its Git installation/repository/root-directory settings. Each restaurant gets its own public build variables and separate Site ID.

## 4. Update the existing backend API Function once

From this project folder run:

```
npm ci
npm test
npm run build
```

Upload **build/restaurant-function.tar.gz** to the **existing** API Function. Runtime Node.js 22; entrypoint `src/main.mjs`; install/build command `npm install --omit=dev` as in the existing deployment. Verify Appwrite's deployment configuration uses this entrypoint, not a stale repo-root src/main.mjs.

Retain the existing database/API execution scopes. Add only these provisioning scopes where supported by your Appwrite version:

- sites.read, sites.write
- rules.read
- platforms.read, platforms.write

The existing database adapter also requires rows.read, rows.write and the scopes required by your version's TablesDB transactions. No keys.write, unrestricted storage access, project-wide user listing, or site build scopes are needed for provisioning. If connecting/reading the Git provider requires vcs.read in your version, add that scope only after verifying the reported error. Do not select all scopes.

Keep `PLATFORM_OWNER_IDS` server-side. Configure:

```
DATABASE_ID=restaurant_platform
PLATFORM_OWNER_IDS=YOUR_EXISTING_OWNER_USER_ID
SITES_TEMPLATE_ID=THE_OWNER_SITE_ID
SITES_OWNER_URL=https://THE_ACTUAL_OWNER_SITE_DOMAIN
SITES_PUBLIC_FUNCTION_ID=YOUR_EXISTING_API_FUNCTION_ID
SITES_RESTAURANT_BRANCH=restaurant-live
```

The production API enforces owner/admin MFA; REQUIRE_ADMIN_MFA=false no longer bypasses it. Local tests/demo explicitly use a separate injected option. Do not use the local demo in production.

Use Appwrite's generated per-execution key with the configured scopes. A static server API key is an optional server-side fallback only. Never expose it in a Site, config.js, screenshot, client handoff, or repository. Rotate any previously exposed key.

API execute permissions must permit your public menu/customer functions as before, but platform actions remain owner+MFA protected in the backend. Anonymous execution permission is not anonymous staff access. Do not make the database browser-readable.

## 5. Deploy a separate private background worker once

Create another Function from the **same archive**:

| Setting | Value |
|---|---|
| Entrypoint | src/sites-worker-main.mjs |
| Runtime | Node.js 22 |
| Install/build command | npm install --omit=dev |
| Execute permissions | empty — no Any, Guests, Users, or client role |
| Schedule | every minute: * * * * * |
| Timeout | 120 seconds |

Give it the required database/provisioning scopes and the same server variables from step 4, including SITES_PUBLIC_FUNCTION_ID pointing to the API Function, **not the worker**.

The worker processes up to three jobs per invocation. Jobs use an expiring lease to prevent concurrent browser/worker provisioning calls. The owner dashboard also advances jobs while open; the private worker continues them after the browser closes. Appwrite builds independently after deployment starts.

There is no unauthenticated `worker` or `maintenance` action in the API.

## 6. Create and customize

1. Open the generated owner Site `/admin`, sign in, and complete authenticator verification.
2. Click Create restaurant. Enter the name only, e.g. Amirlal Cafe.
3. Wait: Queued → Creating website → Deploying → Configuring secure access → Ready.
4. Copy separate menu, dashboard and kitchen links from the restaurant card.
5. Open Customize restaurant to edit branding, menus, categories, prices, portions, stock, tables and supported settings. Data changes need no Site redeployment.
6. For existing restaurants, choose **Create separate Appwrite website** on their existing card. This does not recreate or merge restaurant data.

## Client sign-in and access

Links do not grant access and contain no credentials. Before handoff, the client must have an Appwrite Auth account; add that user's ID to **Management** for the correct restaurant as admin or manager, using the existing staff management workflow. They sign in with their own credentials. Admins enroll TOTP MFA. A kitchen manager uses the kitchen link and the existing manager feature restrictions; this release does not add a new kitchen-only role.

The owner-only global workspace is inaccessible to restaurant staff. Being an admin of Restaurant A does not authorize Restaurant B. A platform owner intentionally has audited-by-policy access to all restaurants; this release does not introduce a full audit-log/compliance system.

Do not share your platform-owner account or API key. Set feature/customization permissions per client from the owner controls. Configure menus/tables first and then generate table QR codes in that restaurant; ordering still requires a valid table visit where configured.

## What changes require deployment?

- Menus/prices/portions/branding/settings supported by dashboard: database update only.
- Owner website layout/features: update main and redeploy the owner Site.
- Restaurant application code: release restaurant-live; connected restaurant Sites redeploy from the shared codebase.
- New backend capability: deploy API Function once, keeping its Function ID stable.
- New database structure: separately designed, backed-up migration; never silently duplicate or merge tenant data.

## Troubleshooting

- Setup not configured: complete Sites server variables; no restaurant is created on this preflight failure.
- Needs attention / permission denied: fix the provisioning scopes, plan quota or Git connection, then use Retry website setup. Do not click Create again for the same restaurant.
- Build failed: inspect that Site's build log; verify the restaurant-live branch contains scripts/build-site.mjs and public/portion-editor.mjs. Retry starts a fresh deployment.
- Waiting for secure access: check actual active Site domain verification/TLS and platforms.write. No client links appear until the authentication hostname registration succeeds.
- No background progress: check worker schedule, private execution configuration, scopes and logs. Jobs resume after a lease expires if an invocation was interrupted.
- Wrong entrypoint: Appwrite Root directory is relative to the repo, while src/main.mjs is relative to the uploaded Function archive.
- Existing Vercel address: it cannot be transferred to Appwrite. Share the newly generated Appwrite URLs once accepted; leave the old site active during validation and switch client links deliberately.

## Staging acceptance checklist — required before production

- [ ] Owner sign-in + TOTP works on the new owner domain.
- [ ] Create two restaurants with the same name: different UUIDs, different Sites, different links.
- [ ] Refresh/retry creation using the same request ID: only one record and one Site.
- [ ] Close the owner page during provisioning; worker completes it; reopen and see Ready.
- [ ] Inspect Site vars and static dist/: no API key, owner ID allowlist or server credential.
- [ ] Test menus anonymously; dashboard/kitchen must reject anonymous staff access.
- [ ] Sign in as A's admin: cannot read, change or assign staff in B, including tampered HTTP bodies and IDs.
- [ ] Same dish ID in A/B, different prices: editing A leaves B unchanged.
- [ ] Test isolated orders, stock, tables, devices, customer visits and staff permissions.
- [ ] Failed deployment exposes no ready link; retry uses same Site and retains data.
- [ ] Edit restaurant menu/branding/portions: public menu updates without deployment.
- [ ] Push an owner-only main change: restaurant-live Sites do not redeploy.
- [ ] Test a release and rollback on a staging restaurant Site.

## Local verification

```
npm test
SITES_DEMO=1 npm run dev
```

For Windows PowerShell use `$env:SITES_DEMO="1"; npm run dev`. Open http://127.0.0.1:8744/admin?demo=1. The demo is explicitly local-only, uses in-memory data and simulated `.example.invalid` Site addresses. It does not create real Sites or prove production domain/auth integration. Never hand simulated links to clients.

## API references

Appwrite documents generated HTTPS domains and active-deployment domain rules here.[^https://appwrite.io/docs/products/sites/domains] The implementation uses the Sites API for Git-connected site creation, variables and deployment status.[^https://appwrite.io/docs/references/cloud/server-nodejs/sites]
