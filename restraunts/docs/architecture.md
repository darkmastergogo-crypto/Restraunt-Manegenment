# Architecture, security and settings

## Request flow

One Vercel application serves a Vite shell. The shell uses Supabase Auth PKCE and the publishable key. The platform and restaurant surfaces have separate navigation. A slug resolves a route, while a successful RLS-scoped lookup establishes whether the current session can enter that workspace. The owner portal requires a live profile in the private owner roster and a current `aal2` session. The public branded sign-in, manifest and logo are separate public projections for active or trial restaurants.

| Data or operation | Control |
| --- | --- |
| Profiles | Own account, shared-tenant administrator lookup, or platform owner. Owner status updates are column-scoped and audited. The owner cannot suspend the signed-in owner account. |
| Restaurants | A live member can read assigned active or trial restaurants. Owner can create, list, activate and suspend restaurants. The slug is immutable through application grants. |
| Branding | Same membership read scope. Owner and tenant administrator can edit only their allowed restaurant. The profile save transaction updates name and branding together. |
| Memberships | Own row, authorized tenant administrator, or owner. Writes go through a guarded operation that locks the restaurant row. Tenant administrators can change manager and staff access. Admin-level role assignment is reserved to the owner. |
| Invitations | Column-scoped history excludes token hashes. Authorized issuance returns a newly generated link token to the calling administrator workflow. Only a SHA-256 digest is retained. Acceptance uses verified Auth email, expiry, restaurant state and a row lock. Restaurant locking serializes creation, replacement and acceptance against suspension. Issuance has tenant-level rate limits and a per-address cooldown. |
| Platform audit | Owner only. Restricted triggers and RPCs record access and administrative changes. Media actions still need their audit and retention policy. |
| R2 | Server credentials only. Authenticated asset mutations call a tenant-scoped authorization RPC with the caller’s bearer token. Object keys derive from the database restaurant UUID. A PUT already in flight may finish after access is revoked. Private operational files need a separate delivery policy. |
| PWA | Per-restaurant manifest and worker scope. The worker caches a single generic offline page and never handles API or private data caching. Public branding routes use no-store responses. The browser keeps a single Supabase Auth session for the deployment so one account can select multiple authorized restaurants. |

The migration makes private definer helpers callable only where required for public projections, invoker RPCs and RLS. It uses a locked search path and qualified references. The server calls Supabase with a publishable key and the caller’s bearer token for authenticated operations. The fixture tests distinguish SQL authorization from authentication provider behavior. Deployment must confirm Auth table fields, JWT/session behavior and PostgREST grants on the actual Supabase project.

## Settings catalogue

| Scope | Implemented | Pending for the full platform |
| --- | --- | --- |
| Platform | Restaurant states, owner provisioning and MFA, cross-tenant account suspension, invitation email sender and explicit link-display setting, asset-provider setup. | Client groups, plans and quotas, user/storage limits, billing, analytics, feature flags, policy UI, custom role templates, audit retention, email templates, support settings and platform branding controls. |
| Restaurant | Permanent slug, name, short app name, slogan, logo and monogram, app theme and background color, team roles, invitations and membership suspension. | Contact details, hours and holidays, currency/timezone/language, tax/service charges, receipts, menu/kitchen/QR/order controls, stock/supplier settings, notification controls and granular permission overrides. |
| Account | Verified email sign-in, password recovery flow, authenticator enrollment and challenge, local and global sign-out, explicit platform and membership suspension. | Supported account removal and verified phone-login migration for existing waiter users. |

## Operational migration rules

- Add `restaurant_id` to every operational relation and to composite uniqueness constraints, idempotency keys and foreign keys. Before moving any v21 public projection or definer function, audit its complete query graph. Use one transaction for authoritative pricing, receipt numbering, stock effects and queue publication.
- Preserve the v21 view and adapter contracts for the POS and operational shell. Move behaviors against isolated SQL fixtures first, then migrate UI. Keep imported order IDs, payment state, invoice sequence, stock history, access policy and receipts reproducible by tenant.
- Namespace device data by restaurant UUID and authorized device/user, including IndexedDB, Tauri SQLite, offline cache, cursors, and backups. Define an offline access lease and data-retention policy. Keep queued v21 bills recoverable through cutover. Pair old QR codes with an explicitly validated tenant/table route.
- Keep legacy Telegram behavior as a parity gate. Store credentials securely by tenant, deduplicate by order and recipient, validate provider success, and test retry and mixed success. Import history without re-sending old notifications.
- Before switching tenants to the shared application, run a staged migration with a separate project, reconcile counts and money by currency/tenant, exercise rollback, and test role revocation throughout the migration.
