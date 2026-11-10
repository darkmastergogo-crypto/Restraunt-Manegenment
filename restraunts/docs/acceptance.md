# Acceptance gates

## Local suites

| Command | Coverage |
| --- | --- |
| `npm test` | Migration rerun, PostgreSQL role/RLS checks, ten independent restaurant memberships, cross-tenant reads and writes, invitation identity/replay/expiry/cancellation, role escalation, session and account revocation, API manifest/icon results, guarded image writes and truthful email behavior. |
| `npm run test:browser` | Production build and Chrome fixture flow. The owner creates a restaurant, issues an invite, and updates branding. The client accepts on a mobile viewport, tests forbidden URLs, selects between two authorized restaurants, and reloads offline. |
| `npm run build` | Vite production bundling. Vercel deployment and hosted rewrite verification are separate checks. |

Test infrastructure runs PGlite PostgreSQL with a disposable Auth schema fixture. It uses the production API handlers behind a local HTTP server with a PostgREST-like test adapter. R2 and hosted Auth transport are substituted. Test data and fake credentials remain in the test directory and local processes. An actual hosted database and R2 preview are required to confirm provider-specific behavior.

## Staging checklist for the foundation

1. Apply the migration to an empty Supabase staging project. Confirm each grant, private schema exposure, row policy and index through Supabase Advisors and direct Data API tests. Capture auth, database and function errors from actual provider logs.
2. Confirm verified-email registration, password recovery, owner authenticator setup and challenge, optional user MFA, cross-device sign-out and a revoked JWT. Send invitation email only to designated test inboxes. Confirm cancellation, expiry, repeated use, mismatched email, provider error and optional manual link behavior.
3. Create ten trial restaurants with unique logos, slogans and colors. Upload and delete real images in the staging bucket, verify credentials and paths, and attempt cross-tenant CRUD, duplicate request and oversize/invalid payload attacks. Confirm no public bucket listing.
4. Use Chrome, Edge, Android and iOS where supported. Check deep links, each 192/512 icon, manifest identity and worker scope, native PWA install, update prompts, offline reconnect, keyboard navigation, responsive forms and status messages. Confirm tenant suspension removes availability from its manifest and private workspace.
5. Measure owner first load, workspace entry, switching and logo uploads under desktop, constrained mobile and representative portfolio sizes. Review dependency and platform advisories before promotion.

## Full v21 parity gates

Replay counter billing, QR-to-kitchen-to-waiter workflows, menu import/customization, stock changes, expense and customer behavior, records/report exports, receipt printing, legacy manager and waiter restrictions, notifications, Telegram deliveries and offline till operation. Verify ten tenants with independent operational data, users, device databases and R2 objects. Run simultaneous physical or emulated tills through disconnect, duplicate sync and restore, and reconcile paid orders, financial years and inventory. Check import preservation, staged cutover and rollback. The foundation’s local tests do not cover these operational gates.
