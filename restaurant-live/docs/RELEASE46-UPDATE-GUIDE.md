# Release 46 — requests, custom tables, responsive screens and installable apps

## Status

This is a source update, **not a live deployment**. It includes the earlier Appwrite Sites, Android Web Push and MFA sign-in fixes. Keep your existing database, restaurant identities, Function IDs, staff accounts and private configuration. Do not delete collections or make them public.

The supplied Yummy Momo Release 45 website is a visual reference only. This update does not modify that Vercel site, import its Supabase backend, or replace your clients' menus, prices, logos or restaurant data.

## Changes

- Kitchen/counter waiter calls are no longer hidden from the kitchen Requests response. The button opens and refreshes Requests after the server accepts the call. Customer calls retain idempotent request IDs and are tested for staff visibility and restaurant isolation.
- Existing request feature permissions still apply. Disabled requests do not produce a false successful counter-call acknowledgement.
- Table display names can be saved separately from T1/T2 stable IDs. Renaming retains QR credentials and existing visits. Orders and customer requests retain a name snapshot. Reopening/scanning the QR refreshes a previously open customer's table label.
- Kitchen/table/menu styling follows the supplied reference while retaining current controls and configurable features. Kitchen is responsive on desktop/tablet/phone; menu and waiter are phone-first. Existing dish images are retained; this does not invent or replace client food photos.
- Checkout confirmation, order tracking/timeline, cancellation, history and receipts remain connected to the authenticated backend. Optional honest-review links require the existing review feature/configuration and served-order timing.
- Maximum two **unaccepted pending orders per device per restaurant**, not two for the entire restaurant. Accepting one frees a slot. The server enforces the limit transactionally, including simultaneous submissions. A pre-existing stricter configured limit of one still applies. Device identity is not a human identity; a different browser/device has its own limit.
- Added PWA install controls and menu/kitchen/waiter manifests. The service worker registers independently of push permission and provides an offline explanation, not offline ordering.
- QR rotation/removal no longer inadvertently resets a reserved table flag. Clearing the checkout cart also refreshes the open cart view.

## Deploy safely

1. Back up the current Git commit and active Appwrite Function deployments. Test in staging first. Never put service keys, VAPID private keys or `.env` secrets in Git or frontend build variables.
2. Extract this ZIP. Copy its **contents** into the existing `restaurant-live` source folder in the repository, replacing source files but keeping existing private environment settings. Avoid an extra nested folder. Preserve unrelated files. The original live reference site is not the deployment target.
3. From that source folder run `npm ci`, `npm test`, and `npm run build`. The nested `build/restaurant-function.tar.gz` is the Function upload; do **not** upload the whole release ZIP as a Function.
4. Update the existing API Function, keeping its ID (`6ada10d40012db44568d`): upload the nested archive, Node.js 22, entrypoint `src/main.mjs`, build command `npm install --omit=dev`. Keep all existing server variables and scopes. Activate the successful deployment.
5. Update the existing private Sites worker (`6ada4a1a003ca82e4634`) using the same nested archive, entrypoint `src/sites-worker-main.mjs`, Node.js 22 and the same install command. Preserve private execution permissions, its existing schedule, server variables and 120-second timeout. This release does not establish or verify those cloud settings for you.
6. Commit the source to the appropriate release branches: `main` for the central owner Site and `restaurant-live` for client Sites, according to your existing Git setup. A branch name is separate from the repository's `restaurant-live` folder. Test the client branch before rolling it out; connected client Sites can rebuild automatically when it changes.
7. Keep the Appwrite Site root `./restaurant-live`, install `npm ci`, build `node scripts/build-site.mjs`, output `dist`, and SPA fallback `index.html`. Keep existing `SITE_MODE`, public API settings and restaurant identity variables. Do not replace an existing client identity with another restaurant's slug/ID.
8. Optional for existing client Sites: set the **non-secret** build variable `RESTAURANT_NAME` to the client's display name, then rebuild. Newly provisioned Sites receive this automatically. Without it, the existing Site uses its slug in the installed app name. Database branding changes still work as before; changing an installed app's manifest name requires a rebuild/browser refresh.
9. Wait for successful active deployments. Reload the site (close/reopen an old installed window if necessary) and run the checklist below. A previous warning saying settings are not live means you still need to redeploy that Function.

No database migration, new API secret or additional permission scope is required specifically for Release 46. Existing Appwrite provisioning and push prerequisites still apply; see `APPWRITE-SITES-SETUP.md` and `ANDROID-PUSH-SETUP.md` if they were not completed earlier.

## Install for a client

Use the client's own HTTPS Site, **not the platform-owner website**. Sign in with that restaurant's authorized staff account for the kitchen. Use the private waiter link only for trusted waiters.

### Android

1. Open the client's kitchen/menu/waiter URL in Chrome.
2. Use **Install app** (kitchen: in the account menu), or Chrome ⋮ → Add to home screen → Install.
3. Approve Chrome's installation dialog. Launch from the home screen/app list.

If Chrome still says it cannot install, first confirm that the updated Site is active. Its manifest, `/push-sw.js` and local 192/512 icons must return the actual files over HTTPS, not a sign-in page or SPA HTML fallback. Reload/close older tabs and retry. Browser policy, private browsing and device restrictions can also block installation.

### Windows PC

Open the client's Site in Chrome or Edge. Use **Install app**, the address-bar install icon, or browser menu → Apps/Install this site as an app. It opens in a standalone window and can be pinned to Start/taskbar.

This is a **PWA**, not an APK, EXE/MSI installer or Play Store/Microsoft Store package. It requires internet for orders, requests and sign-in. Installing a public menu does not grant staff permissions. The menu app launches without embedding a secret QR link; a new device must scan a valid table QR before ordering.

### Phone notifications are a separate step

Installation alone does not enable push. Follow `ANDROID-PUSH-SETUP.md`, enable Phone notifications on the staff screen and allow browser/Android notifications. Delivery while locked/tab closed requires the deployed server Web Push setup, an active subscription, network and Android allowing background notifications. Force-stopping Chrome, disabled notifications, Do Not Disturb or battery restrictions can prevent/delay alerts. No guaranteed always-on ringing is promised.

## Acceptance checklist on the hosted Site

- From a real table QR, tap Call waiter; verify the same restaurant's kitchen and waiter Requests show it. Mark On the way and Handled. Confirm another restaurant cannot see it.
- From the kitchen header, Call waiter; verify Counter needs a waiter appears immediately in Requests.
- Rename a table to a custom name; scan the **previously printed** QR and check it still opens that table with the new name. Confirm existing order history is intact.
- In one browser/device place two orders while neither has been accepted. A third must be rejected. Accept one; another order must become possible. A different device has a separate allowance.
- Verify order tracking, cancellation rules, billing, configured menu images/prices/portions, music requests and role permissions. Do not remove MFA to work around sign-in problems.
- Check kitchen on Windows, tablet and Android; check menu and waiter on a narrow phone.
- Install on an actual Android device and Windows PC. Test an authenticated kitchen launch and a public-menu launch separately.
- With push configured, trigger an actual order/request from another device while the staff phone is locked and the tab is closed. Verify delivery and notification links. Local demo data does not exercise Appwrite or real push.

## Verification and limitations

81 automated tests passed, including request visibility/isolation, QR-preserving rename, permissions, simultaneous pending submissions, and PWA manifest/worker checks. Local browser workflow covers customer call → staff Requests, counter call, checkout/tracking/acceptance and 390/768/1440-pixel kitchen layouts. A local normal-profile Chromium check reported no installability errors; waiter phone layout and offline navigation (503 with no offline writes) also passed. Separate owner/restaurant static builds validated manifest identities and public-configuration allowlisting. These checks are not a guarantee that every possible bug is eliminated. Hosted Appwrite acceptance, actual OS installation and locked-phone push must still be verified on your account/devices.

## Rollback

Restore your backed-up Git commit and reactivate the previous successful Function deployments. Do not delete restaurant records to roll back. Older code ignores the optional table-name snapshots; stable IDs and QR credentials remain intact. Keep client identity/environment variables unchanged.
