# Tenant isolation and trust boundaries

## Identity and tenant selection

Restaurant slugs are locators, not authorization. The server validates the slug, loads that tenant's active metadata and resolves an actor from one of:

1. An Appwrite-validated JWT whose user ID is in server-configured `PLATFORM_OWNER_IDS` (plus TOTP session verification).
2. A valid private waiter capability hashed in that tenant's metadata, with configured limited waiter permissions.
3. An Appwrite-validated JWT with an active membership row **inside the selected tenant**. Admins require TOTP; managers have the narrower role.

The caller's `role`, `userId`, `tenantId`, prices, menu stock, totals and owner claims are not authority. Appwrite account IDs must be added by an existing tenant admin/owner; the public interface cannot self-enroll. The beta does not check the target account exists before saving a membership; create/verify that account first.

## Database policy

`entities` has row security enabled and no user/team/guest table grants. Every server-created row has an empty permissions list. Browsers use **no direct database API**. Even restaurant admins cannot directly query this table. Appwrite API keys bypass normal end-user ACLs, so all private reads and writes go through explicit server-side tenant checks. This architecture needs careful handler reviews; private rows alone are not enough.

The row ID hashes tenant/type/key. Reads verify both tenant and type. Lists always constrain tenant and entity type; optional device/status filters narrow them further. The public menu returns a safe projection, not staff membership, customer devices or order history. Browser order history requires a per-browser random secret; waiter secrets are separate and revocable. The frontend never receives server keys or stored device-secret hashes.

## Mutations and concurrency

The Appwrite store stages a change to the tenant's shared lock row **before reading mutable order/stock/cap data**, then stages all changes inside a real TablesDB transaction and commits them atomically. Two concurrent tenant mutations touching that lock should conflict; the loser retries at most three times against fresh state. This depends on actual hosted optimistic concurrency semantics and must be verified with simultaneous Appwrite executions, not only the mock tests.

Orders use caller-generated request IDs plus a hashed submission identity to make retries idempotent. Line prices/portions/tax are resolved server-side. Stock reservations, daily numbering and order inserts share one commit. Rejections/cancellations restore only the original stock generation. Undo is actor-specific, token-checked and fails if stock reset generations differ. Settings/menu/stock edits use revision checks. Device blocking and table-QR rotation invalidate future operations.

There is an 85-write guard within transactions, below the current documented free-plan 100-operation limit. Carts are limited to 25 distinct dish/portion lines, reserving room for stock notices and the lock/counter/device writes. Recheck actual plan limits and SDK behavior. A transaction failure must not fall back to independent writes.

## Public requests and abuse

Anonymous customer ordering is required. It is authorized by a valid table QR → expiring visit secret → saved-browser profile and enforced pending caps/cooldowns. Music links are restricted to HTTPS Spotify/YouTube hosts; no server fetch occurs. Strings are escaped before rendering; settings images accept HTTPS or PNG/JPEG/WebP data URLs, not SVG/script URLs.

This is **not** a complete anti-abuse system. A copied QR and many generated browser identities can still create traffic. Add application/firewall rate limits, bot protection, function budgets, anomalous-traffic monitoring and staff procedures before public launch. Do not treat saved-browser blocking or hidden controls as user authentication.

## Feature controls versus visibility

Effective module permission = owner entitlement AND restaurant module visibility. Mutations such as music submission, order transitions, billing, menu edits and stock edits enforce their relevant server capabilities and actor roles.

Presentation controls such as hiding a label or changing an accent color are not security policy. They do not erase existing data or revoke underlying staff records access. Module dependencies exist (e.g. music requires Requests and Music queue). Stock counts remain enforced on orders even when the inventory administration screen is hidden. If the Portions module is off, portioned dishes are withheld from the public menu rather than offered at a wrong fallback price.

Protected sign-out/save/customization escape controls are not arbitrarily removed. Tenant code execution, auth policy and tenant identifiers are intentionally not editable. The platform owner can lock settings groups; restaurant admins cannot bypass those group locks through raw API requests.

## Runtime restrictions

- Public handler must run inside Appwrite Functions and use Appwrite's trusted headers, never an untrusted standalone server.
- The maintenance entrypoint is deployed as a **separate private function with no user execution permissions**. Never set it to Any. It has server access to all tenants for scheduled work.
- Runtime keys have row read/write scopes, not broad account/project administration. Setup uses a separate temporary privileged key that should be revoked afterward.
- Keep `REQUIRE_ADMIN_MFA=true`. Server verification requires an enabled account MFA flag and a current session containing `totp`; recovery-only sessions are not accepted as an admin TOTP substitute in this beta. Validate the actual JWT/session API behavior before launch.
- Slugs are not renamed in place. Custom domains and tenant deletion/suspension are not implemented administrative workflows in the beta.
- No hosted penetration test, compliance review or backup/restore drill has been performed.

## References for deployment review

- Appwrite permissions: https://appwrite.io/docs/advanced/security/permissions
- Appwrite transactions: https://appwrite.io/docs/products/databases/transactions
- Function runtime headers: https://appwrite.io/docs/products/functions/develop

Documentation and SDKs change. Confirm against the actual project version before enabling live ordering.

## Main-admin workspace

The `/admin` route is separate from tenant consoles. Its `platform` and `provision` API actions are authorized before tenant lookup and require a server-configured platform-owner user ID plus verified TOTP in production. No restaurant slug is required to create the first tenant. Restaurant-admin membership does not permit listing/creating tenants. The list projects current display name/status, slug, ID and creation time only. Opening a tenant as owner still passes the same backend owner/MFA checks. Tenant text/theme/visibility settings cannot modify the global owner workspace or grant access to it.

Browser tests cover list/create/search/copy and mocked sign-in/challenge/redirect/logout sequencing. Those simulations are not proof of hosted cookies, MFA, JWT or ACL behavior.
