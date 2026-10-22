# Start here — Automatic Restaurant Websites

**Implemented in source; not installed on your live account yet.**

After the one-time setup:

**Create restaurant → enter name → wait until Ready → copy menu/dashboard/kitchen links → customize it like now.**

## Included

- Separate Appwrite Site per restaurant, from one shared codebase.
- Automatic HTTPS addresses; no custom domain needed.
- Permanent unique restaurant IDs; tenant-scoped data and staff permissions.
- Sign-in-protected dashboards and kitchens; owner/admin MFA.
- Deployment progress, Retry, and a private background worker.
- Client branding/menu/price/portion edits without redeployment.
- Existing restaurants can get their own Site without rebuilding their data.
- The visual portion editor is included.

## What you need to do once

Follow **docs/APPWRITE-SITES-SETUP.md**, in order:

1. Back up and test in staging. Put this source in the shared private repository.
2. Create the `restaurant-live` branch; keep owner releases on `main`.
3. Connect one central owner Appwrite Site to the repository. Build command: `node scripts/build-site.mjs`; output `dist`; SPA fallback `index.html`. Use the public build variables from the guide.
4. Update your existing API Function with `build/restaurant-function.tar.gz`, keeping its Function ID. Add the documented provisioning scopes and server settings.
5. Deploy the separate private scheduled worker from the same archive, entrypoint `src/sites-worker-main.mjs`.
6. Verify the staging acceptance checklist, then switch to the new owner Site.

**Do not just upload the public/ folder, change only config.js, or upload this whole ZIP as a Function.** This is an architecture upgrade, not the earlier three-file frontend patch. The nested Function archive is the backend upload. Appwrite Sites builds the source through Git.

Do not put an API key in the frontend. Do not make the database public. Do not share your owner account with clients. Clients need their own Auth accounts and restaurant-specific membership before their dashboard links work.

Automatic site provisioning consumes Appwrite resources and is subject to your plan's quotas/billing. Exact custom domain names and domain registration are not included.

## What is verified

60 automated tests; syntax/build checks; local browser workflow with simulated deployments, including name-only creation, progress, separate links, customization, isolation and mobile layout. Real Appwrite domain/auth/Git integration still requires staging acceptance on your account.
