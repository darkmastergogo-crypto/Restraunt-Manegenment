# Restaurant Operations foundation

Vercel deployments use `restraunts` as the project root directory.

This source package implements the first shared-tenant release slice. It covers platform portfolio management, verified account access, restaurant membership and invitations, branding, R2 logo handling, audit activity, and installable tenant identities. POS, kitchen, QR ordering, inventory, records, offline tills and Telegram still need their v21 contracts ported to the shared project. Use a separate staging project for this package. The supplied v21 archive is the operational baseline for the rest of the migration.

## Run the local checks

With Node.js 24 and Chrome installed:

```sh
npm ci
npm test
npm run test:browser
npm run build
```

`PLAYWRIGHT_CHANNEL=msedge` selects Edge in an environment that has it installed. `QA_SCREENSHOTS_DIR` enables screenshots. The harness starts an isolated loopback server with disposable PostgreSQL data. It substitutes Supabase Auth and PostgREST transport, and uses an in-process R2 transport for storage assertions. The migrations, PostgreSQL roles and RLS policies, production browser bundle and API handlers execute in the tests. Neither the browser test account nor its data is bundled into the deployed site.

## Supabase and Main Owner setup

1. Create an empty Supabase staging project and select a region near your Vercel functions. Use the migration under `supabase/migrations/`. For a tracked deployment, use the Supabase CLI migration workflow against the explicitly linked staging project. For an isolated evaluation, run the migration in the SQL Editor. Apply the migration twice to a disposable project if validating rerun behavior. The migration uses the `pgcrypto` extension in `extensions` and explicit Data API grants. Keep `platform_private` out of the project's exposed schemas.
2. In Supabase Auth, set the site URL to the Vercel app origin and allow the exact root and `/account` redirect URLs for each environment. Enable email confirmation, set a minimum password length of 12, and configure SMTP for account confirmation and password recovery. Enable authenticator-app MFA and configure Auth rate limits before opening staging access to external users.
3. Create your verified Supabase Auth user. Copy its user UUID from the intended staging project's Authentication section and run the following SQL as project administrator. Substitute that UUID and your display name.

```sql
do $$
declare
  owner_id uuid := 'REPLACE_WITH_VERIFIED_AUTH_USER_UUID';
begin
  if not exists (select 1 from auth.users where id=owner_id and email_confirmed_at is not null) then
    raise exception 'The account must exist with a verified email';
  end if;
  insert into public.profiles(id,display_name) values (owner_id,'Your display name') on conflict (id) do nothing;
  insert into platform_private.owners(user_id) values (owner_id) on conflict do nothing;
end;
$$;
```

4. Sign in at `/owner`. If prompted, enroll an authenticator, scan its setup code and enter the six-digit code. Owner access requires Supabase assurance level `aal2`. Keep owner provisioning restricted to project administrators. Access recovery for the platform owner follows your Supabase administrative MFA recovery procedure.

[Supabase Auth setup](https://supabase.com/docs/guides/auth), [Supabase authenticator MFA](https://supabase.com/docs/guides/auth/auth-mfa), [Supabase CLI migrations](https://supabase.com/docs/guides/deployment/database-migrations)

## Cloudflare R2 setup

1. Create a private R2 bucket for the foundation. Generate a bucket-scoped S3 API token with Object Read & Write and place its credentials in Vercel environment variables. Leave public bucket access and CORS disabled. This upload flow goes through the application server.
2. The image endpoint accepts still PNG, JPEG and WebP files up to 2 MB. It checks the decoded format and pixel count, strips input metadata by re-encoding, and writes a normalized PNG to `restaurants/{restaurant-id}/branding/icon.png`. The browser receives progress and server-confirmed results. Replacements use an atomic single-object PUT. “Use monogram” deletes the stored image and restores the generated identity.
3. The logo is public-facing by design. App routes deliver the approved PNG derivatives at 192 and 512 pixels for an active or trial restaurant. The R2 object itself remains private. Keep receipts, uploads containing customer information, and staff-only files out of this prefix. Those domains still require private metadata and read authorization before use.

[R2 S3 API](https://developers.cloudflare.com/r2/api/s3/api/), [R2 API tokens](https://developers.cloudflare.com/r2/api/tokens/)

## Vercel staging setup

1. Import this source root as a Vite project on Node.js 24. `vercel.json` defines the output directory, API and deep-link rewrites, and security headers. Give staging its own Supabase project and R2 credentials. Use the template `.env.example` for the runtime variables. Store the R2 access key, R2 secret and email API key as Vercel secrets.
2. Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `APP_ORIGIN`. The browser configuration endpoint returns only the project URL and publishable key. For the enforced CSP, use the normal `*.supabase.co` project URL. If you use a custom Supabase domain, add only that trusted domain to `connect-src` before deploying. Keep preview configuration separate from production.
3. For invitation email, set `RESEND_API_KEY` and `INVITATION_FROM` using a verified sender. This is separate from Supabase Auth SMTP. The application distinguishes provider submission from unconfirmed email. The `ALLOW_INVITATION_LINKS=true` option displays a private one-time link to the authorized inviter. Default it to `false` when using email delivery in production. Keep link tracking disabled for security-sensitive mail and verify the message preserves the invitation fragment.
4. Deploy a staging preview and run the checks in `docs/acceptance.md` with throwaway data. Keep the staging preview isolated from real restaurant users until the v21 workflow migration and acceptance checklist are complete.

[Vercel project configuration](https://vercel.com/docs/project-configuration), [Vercel environment variables](https://vercel.com/docs/environment-variables), [Resend send email API](https://resend.com/docs/api-reference/emails/send-email)

## Client onboarding and sign-in

1. As Main Owner, open **Restaurants → Add restaurant**. Pick a stable lowercase slug and enter the public display name. The app creates a trial restaurant and initializes its brand in the same transaction. Use the directory to activate, suspend or resume the restaurant.
2. Open its team page and invite its administrator. An administrator can invite managers and staff. The platform owner can invite administrators and change their access. The link expires in 48 hours, must be accepted with the invited verified email address, and becomes invalid when used, cancelled or replaced. Resend after the one-minute cooldown.
3. The recipient opens the invitation. An existing user signs in. A new user creates an account, confirms their email and reopens the invitation. They enter their name to accept. `/` routes a signed-in user with one active membership to that restaurant or displays a selector for multiple memberships. `/r/{slug}/` gives the restaurant-branded sign-in. **Account** offers an authenticator app, local sign-out, and sign-out across devices.
4. In **Restaurant profile**, save the public display name, short name, slogan and PWA colors, then upload a logo if R2 is configured. One administrator can suspend or restore that restaurant’s managers and staff. Platform **Users** can suspend an account across restaurants.

## Install the restaurant PWA

Open the authorized restaurant’s root path in a supported browser. Use **Install** or **Add to Home Screen**. The manifest ID, start URL and scope all use that restaurant’s canonical path. The worker caches only an offline information page in its own scope. The app requires connectivity for identity and authorization. Native OS installation and OS icon refresh remain part of the staging checklist.

See [architecture and settings](docs/architecture.md) and [acceptance gates](docs/acceptance.md) for the current scope and remaining work.

