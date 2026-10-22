# Original Release 44 appearance restoration — beta update

## Visual baseline

The supplied `Yummy-Momo-Release-44-Complete.zip` is the reference, not the earlier Copper & Steam demo screenshots. The original stylesheet stacks are included in `public/original/` and loaded in their original order for menu, kitchen/admin and waiter routes. `public/appearance.css` bridges the new multi-tenant markup to those styles. It also fixes legacy CSS selectors that would otherwise style editable text wrappers as ornaments or badges.

## Restored main layout

- Original warm dark/gold palette, original staff typography, borders and button treatments. Bundled Plus Jakarta Sans font files avoid a runtime Google Fonts dependency.
- Kitchen/admin: left desktop navigation rail; brand, kitchen heading and sync indicator at the top; Call waiter and account dropdown on the right. Theme, contact and sign-out actions are inside the dropdown.
- Navigation labels/order follow the original: Pending Orders, Billing, Order Records, Dashboard, Requests, Tables, Customer devices, Menu, Stocks, Management, Notifications. The platform-owner-only Owner controls entry is an addition.
- Requests: title left, sound/setup controls right, filters underneath, then cards and count/pagination area. Music adds its own filter and request actions; it is not an integrated music player. Request-list pagination remains simplified in this beta.
- Customer menu: compact single-column layout, original header actions, category chips, search/filter controls, dish controls and floating View Order bar. Checkout uses the original centered dark dialog styling rather than the previous beta's always-visible order sidebar.
- Request music is placed in the existing customer-tools area below the menu introduction, without moving the original header actions.
- Waiter: requests left and pending orders right on desktop; mobile section tabs. Order headers, item area and footer actions are separated like the reference.
- New per-restaurant customization groups live in Management; these are new controls, not a claim that the original settings markup was ported unchanged.

## Customization and isolation

A new restaurant defaults to the reference palette and `theme.font = "original"`. Admin-selected theme tokens, font, branding and registered text still override these defaults. The sample Yummy Momo logo is only assigned by the local demo seed. Newly provisioned live restaurants do not inherit that logo. No old Supabase client, authentication or data code is loaded.

## Validation and limits

Local service/adapter suite: 41 passing tests. Browser smoke checks cover all main admin sections, QR checkout, customer music → kitchen Requests, music hide/show, saved settings propagation and 390px page-width checks. Desktop/mobile previews of menu, kitchen, Management, checkout and waiter screens are included. Additional position checks verify the desktop rail, compact menu width, and scrollable long-order checkout with visible submit/close controls at 1440px and 390px. A separate browser style check verifies that tenant-selected accent, header surface and font override the original cascade; these checks use local DOM token overrides, not a hosted settings deployment.

This restores the main visual structure; it is **not a certified pixel-for-pixel port of every Release 44 screen, dialog or state**. Reports, records, billing, editors, tracking and other advanced workflows still have the functional/layout differences documented in FEATURE-PARITY.md. In particular, original chart-rich dashboards and some specialized editors have not been recreated merely by reusing CSS. Complete parity still requires those views to be ported and compared with the old app using equivalent data and browser dimensions.

No hosted Appwrite configuration was changed. This ZIP remains a source beta, not a deployed production release.

## Re-run local checks

With a fresh `npm run dev` process running, and optional Playwright plus system Chromium installed:

```sh
node scripts/ui-smoke.mjs
node scripts/layout-audit.mjs
node scripts/theme-audit.mjs
node scripts/capture-appearance.mjs
```

The check scripts use sample local data only. Never point this demo backend at a public production address. Theme-audit screenshots deliberately use a blue/Verdana override to test customization; the default reference theme remains brown/gold.

## Separate main-admin workspace

`/admin` is a new platform-owner workspace, not part of a restaurant. Its matching warm dark/gold styling does not move the restaurant header/sidebar controls. Create restaurant and the global restaurant list are only here. Restaurant Owner controls now link back to Main admin. New desktop/mobile screenshots and test results use the `main-admin-` prefix. They are local demo previews, not a live Appwrite login.
