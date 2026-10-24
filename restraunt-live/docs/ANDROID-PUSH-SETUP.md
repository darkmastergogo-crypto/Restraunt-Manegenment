# Android phone push update — implementation and deployment guide

## Status and limits
This release adds encrypted Web Push for Android Chrome and Firefox. It is source code, not an already-enabled cloud service. Automated tests use mocked transports/browser APIs; delivery through FCM/Mozilla to a real locked Android phone has NOT been verified. Do not replace your live source without backing up and staging. Existing restaurant IDs, records and permissions are not migrated or merged.

Phone notification support can work with the page closed and screen locked, after user permission. Network access, Android/browser notification settings, battery restrictions and Do Not Disturb affect delivery; a force-stopped browser cannot be relied on. This is not a guaranteed alarm or emergency system. Keep your kitchen dashboard's foreground alarms and unread alerts. Default system notification sound is controlled by Android; arbitrary loud/repeating alarms and custom sounds are not promised.

## What was added
- Staff account menu → Phone notifications: opt in, choose Orders / Requests / Alerts, disable this browser, local display test.
- Push service worker with no fetch interception or authenticated response caching; notification tap opens that restaurant's protected dashboard.
- Encrypted delivery; generic lock-screen wording excludes customer names, phone numbers, tables, prices, dish names and request contents.
- New order and order status changes; all persisted service/music/reserved-table/counter requests and request status changes; newly created low-stock/security notices. Existing records are not replayed. Automatic maintenance expiry is not hooked into this new alert queue.
- Restaurant-scoped private subscription and event rows in the existing entities table. No new public read/write table permissions. Platform owner/admin/manager accounts can subscribe. Anonymous customers and bearer waiter links cannot. A dedicated kitchen-only role is not implemented by this update.
- Fresh membership/feature/alert-permission checks before dispatch, expired provider subscriptions removed, bounded retries, transaction outbox/leases. If a worker dies after sending but before recording success, a repeat delivery is possible; stable notification tags reduce duplicate display. Delivery is not exactly once.
- Maximum five browser subscriptions per user per restaurant and 100 per restaurant. Subscriptions require renewal after 30 days (use Enable / update this phone). Signing out unsubscribes the current browser; other devices must be disabled separately. If a user loses membership, sending stops. Alert preferences default to all three categories when the panel is reopened; select desired values before saving an update.
- Old push events are pruned after 24h in bounded batches. Business records are never deleted by this push cleanup. Retry queue events expire after one hour/eight transient failures; push-provider message TTL is five minutes. Long outages are not replayed indefinitely.

## 1. Update source and function deployments
The folder containing this guide is the complete project source.
1. Back up the current Git repository and active function deployments. Do not delete the database or rerun setup merely to install push.
2. Replace the contents of your repository's `restaurant-live/` folder with this updated source (not a second nested restaurant-live folder). Include package.json and package-lock.json, public/, functions/, scripts/, shared/, tests/, and docs/. Do not upload node_modules, any real .env, or private keys.
3. Update main first and verify the owner Site build. Also update the real Git branch restaurant-live with the same code. Existing client Sites following this branch can auto-build; test on staging before rolling it to all clients. Individual restaurant data/settings remain separate.
4. The Site settings remain: root ./restaurant-live; npm ci; node scripts/build-site.mjs; output dist; fallback index.html. Existing Site variables stay unchanged. No push private key is ever added to a Site or public/config.js. The browser retrieves only the public VAPID key from the authenticated API.
5. Update the existing API Function `6ada10d40012db44568d` with `build/restaurant-function.tar.gz`; entrypoint `src/main.mjs`, build `npm install --omit=dev`.
6. Update the existing Restaurant Site Worker with the SAME archive; entrypoint `src/sites-worker-main.mjs`, build `npm install --omit=dev`, timeout120s. Do not create another worker just for push. Retain private execute permissions [] and existing Sites scopes/settings. The worker still processes Sites jobs and additionally drains the push queue.

## 2. Generate a VAPID key pair locally
From the extracted project folder on your own computer:

    node scripts/generate-push-keys.mjs

This uses Node's local cryptographic generator. It makes no network request. It prints a public/private key pair and a subject placeholder. The PRIVATE key must stay private: never paste it into chat, screenshots, Git, public files or a Site variable. Keep a secure backup. Do not rerun the generator separately for each Function; both Functions must use the same pair. Rotating it requires devices to re-enable notifications.

## 3. Configure BOTH server Functions
Add the same values to API Function and private Restaurant Site Worker variables:

    PUSH_VAPID_PUBLIC_KEY=<generated public key>
    PUSH_VAPID_PRIVATE_KEY=<generated private key>
    PUSH_VAPID_SUBJECT=mailto:<your-real-support-email>

Also set `PLATFORM_OWNER_IDS` on the worker to the same existing owner Auth user IDs as the API; do not substitute a Function ID. Existing DATABASE_ID and SITES_* values stay unchanged. Use Appwrite's generated execution key with rows.read/rows.write and your transaction scopes. No Firebase service-account credential, messaging.write scope, public worker permission or new project is needed for standard Web Push.

Redeploy BOTH Functions after saving configuration; Appwrite's “Settings changes are not live yet” banner means the old settings are still active.

## 4. Finish private worker access and scheduling
The Function's TOP-LEVEL **Security** tab controls execute access (not Settings → General/Executions/Runtime). Confirm no Any/Users/Guests entries: execute permissions []. Keep this private even when a generated Function domain exists. Never grant public execute access merely to make a schedule work.

After code, variables and scopes are applied, inspect Settings → Executions → Schedule → Interval and use the shortest interval supported by your plan, ideally one minute. Cron may be locked on the free plan; interval availability/minimum must be checked in your actual Console. Do not assume continuous background work is enabled until a scheduled execution is observed in logs. Schedules/execution quotas can have cost implications. If no usable schedule is available, do not make the worker public: discuss a supported paid interval or a separately secured external scheduler.

The API attempts a small delivery batch after successful incoming-order/request actions; the private worker handles remaining recipients and retries even if dashboards are closed. Worker invocations rotate through up to five restaurant queues with at most six subscriptions per event per tenant. Large fleets or large recipient sets require a higher-throughput queue architecture; this implementation is bounded, not a production-scale messaging service.

## 5. Enable for each restaurant and each phone
1. Main owner dashboard → Customize restaurant → Features: enable **Background push**. Also enable the event modules you want (Orders, Requests, Notifications/security/low stock). Existing restaurants intentionally remain push-disabled until owner opt-in; no automatic cross-restaurant enrollment.
2. On Android, open THAT restaurant dashboard in supported Chrome or Firefox over HTTPS and sign in using the client's authorized account. Admins/owners complete MFA. Adding to the Home Screen is optional on Android (manifest/icons included).
3. Open the staff account menu → Phone notifications. Choose categories and tap Enable / update this phone. Tap Allow on the browser's permission prompt. A denied prompt must be changed in the browser's website notification settings.
4. Use Test this phone for a LOCAL display test. This does not test encrypted server delivery.
5. Lock the phone/close its page, place a real test order from a DIFFERENT customer browser. Repeat for service/music requests and stock/security alerts. Tap opens the correct protected restaurant dashboard; the link does not grant access.
6. Verify another restaurant's users do not get the alert. Revoke a membership and verify no further notifications are delivered. Disable Background push and verify delivery stops. Signing out disables this browser's subscription.
7. Recheck on actual Android after phone reboot, browser close, Do Not Disturb and battery restrictions. Never promise delivery in a force-stopped browser.

## Diagnostics
- Server keys not configured: ensure the same valid key pair/contact email is on both Functions and redeploy; malformed/missing keys disable delivery safely.
- Feature disabled: owner enables Background push for the specific restaurant.
- No alerts when closed: verify subscription, entitlement, membership, private worker schedule/executions/scopes, Android permission/network/battery state. A successful local test is not a server test.
- Events commit even if provider delivery fails; the API must not reject an already-created order because push is unavailable. Generic error messages intentionally omit endpoint/key/provider details. Never send raw push endpoints or encryption keys in diagnostic screenshots.
- No Appwrite schema changes are needed: new row types use existing tenant/type/key/payload fields and private permissions.

## Validation in this release
Automated service tests: authentication, tenant isolation, MFA, feature gates, private payloads, endpoint SSRF allowlist, key validation, outbox atomicity/idempotency, membership revocation, preferences, retries/410 cleanup, lease concurrency, rate limits/expiry. Local browser UI checks mock PushManager/permission/provider calls. A real Android/FCM end-to-end test remains required after deployment.
