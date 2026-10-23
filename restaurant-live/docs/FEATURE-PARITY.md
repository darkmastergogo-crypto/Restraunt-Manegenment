# Feature parity and remaining work

This is a **new migration beta**, not full Release 44 parity. “Implemented” below means an implementation exists in this source; it does not mean hosted Appwrite behavior or production load has been certified. “Partial/changed” identifies meaningful differences from the supplied audit. The full old audit is in ORIGINAL-RELEASE44-AUDIT.md.

## Must know before replacement

- Main visual structure now reuses the supplied Release 44 CSS; see APPEARANCE-RESTORATION.md. This is not complete pixel parity of every view.

- No automatic Supabase data migration or recorded/custom JSON voice-pack migration. Optional Android push is implemented; server keys and hosted device acceptance are required.
- No literal arbitrary-layout/theme-builder or custom code execution. Registered text and safe schema values are editable, not every browser-native string, error or pixel.
- Simplified reports (tables instead of original charts), editors, CSV and retention/reset semantics. No SaaS subscriptions, verified online payments, custom domains, automated account invitations or tenant-deletion workflow.
- Appwrite setup, end-user session/MFA, live ACL isolation, hosted transaction contention and actual printer output remain unverified. Use HOSTED-ACCEPTANCE.md.

## Feature-by-feature map

| Key | Area | Status | Implemented behavior / difference |
|---|---|---|---|
| `menu` | Customer menu | Implemented in source | Public menu projection and permission gate. |
| `search` | Menu search | Implemented in source | Client-side text filter. |
| `categories` | Category filters | Implemented in source | Public category filter; admin categories edited separately. |
| `diet` | Dietary filters | Implemented in source | Vegetarian/non-vegetarian filter. |
| `photos` | Dish photographs | Partial / changed | HTTPS or PNG/JPEG/WebP data URL display; dish editor accepts a URL, not the original crop/upload workflow. |
| `portions` | Custom portions | Partial / changed | Stable portion IDs, labels and prices; JSON editor. When disabled, portioned dishes are withheld publicly. |
| `recommended` | Recommended dishes | Implemented in source | Dish flag, badge and filter. |
| `bestSellers` | Best sellers | Implemented in source | Dish flag, badge and filter. |
| `cart` | Cart and checkout | Implemented in source | QR checkout, quantity controls, subtotal and server validation. |
| `notes` | Kitchen instructions | Implemented in source | Free-text kitchen instructions. |
| `noteChips` | Quick instruction chips | Implemented in source | Three registered, editable instruction chips. |
| `customerName` | Customer name | Implemented in source | Optional customer name; server snapshot. |
| `tax` | Bill tax | Implemented in source | Percent/fixed tax computed on server; currency formatting is configurable, not a full multi-jurisdiction tax engine. |
| `tracking` | Order tracking | Partial / changed | Manual order-status dialog with retained customer orders; idle menu polling is not a live tracking timeline. |
| `history` | Customer history | Partial / changed | Saved-browser history within configured retention, in the same status dialog. |
| `cancel` | Customer cancellation | Implemented in source | Pending cancellation inside configured time window, with stock restore. |
| `callWaiter` | Call waiter | Implemented in source | Customer assistance and staff counter calls; requires valid visit for customer. |
| `music` | Request music | Implemented in source | New menu request form, cooldown/cap and server-side deny when disabled. |
| `reviews` | Google review prompt | Partial / changed | Served-order review link in customer history after configured delay; not the original automated, multi-stage review prompt. |
| `footer` | Menu footer | Implemented in source | Public menu footer. |
| `credit` | Developer credit | Implemented in source | Configurable developer credit text. |
| `footerLink` | Developer link | Implemented in source | Configurable HTTPS footer button. |
| `orders` | Kitchen orders | Partial / changed | Kitchen cards, status filters and idle polling, not realtime. |
| `accept` | Accept orders | Implemented in source | Pending → Cooking. |
| `reject` | Reject orders | Implemented in source | Pending → Rejected with optional reason and stock restore. |
| `serve` | Mark served | Implemented in source | Cooking/Ready → Served. |
| `undo` | Undo staff action | Implemented in source | Token- and actor-specific undo of acceptance/rejection, guarded by stock generation. |
| `billing` | Manual billing | Partial / changed | Manual Counter bill with Cash/Online record; no takeaway/table mode selector or payment processing. |
| `payment` | Payment labels | Partial / changed | Receipt payment-method label visibility; the manual payment selection remains required. |
| `receipts` | Receipt preview | Partial / changed | Current-brand receipt preview using immutable order price/tax snapshots. |
| `print` | Receipt printing | Partial / changed | Browser print with 58/80 mm maximum content width; real printer acceptance pending. |
| `records` | Order records | Partial / changed | Day/month/all filters, status filters, paging and receipt access; simplified compared with the original. |
| `csv` | CSV exports | Partial / changed | Filtered order summary CSV; no original dish/stock-specific export formats. |
| `dishSales` | Dish sales | Partial / changed | Separate all-current-epoch dish quantity/revenue tab, independently reset baseline. |
| `analytics` | Sales analytics | Partial / changed | Served-sales summary plus tabular breakdowns; no original chart-rich dashboard or period-comparison tool. |
| `trend` | Sales trend | Partial / changed | Daily totals table, not the original interactive trend chart. |
| `outcomes` | Order outcomes | Implemented in source | Order-status counts table. |
| `weekdays` | Weekday sales | Implemented in source | Served revenue by weekday. |
| `dishPerformance` | Dish performance | Implemented in source | Dish revenue table. |
| `categorySales` | Category sales | Implemented in source | Item subtotal revenue by saved category. |
| `sizeSales` | Size sales | Implemented in source | Item subtotal revenue by saved portion. |
| `tablePerformance` | Table performance | Implemented in source | Served bill totals by table. |
| `hourSales` | Hourly sales | Implemented in source | Served bill totals by local hour. |
| `recentOrders` | Recent orders | Implemented in source | Up to six recent served-order cards. |
| `requests` | Requests board | Partial / changed | Shared same-tenant request board; simplified lifecycle filters. |
| `waiterCalls` | Assistance requests | Implemented in source | Assistance submission/handling gate; owner denial is server-checked. |
| `reservedAlerts` | Reserved-table alerts | Implemented in source | Deduplicated reserved-table scan alert; reserved tables cannot order. |
| `musicQueue` | Music queue in Requests | Implemented in source | Kitchen music handling: Playing / Played / Rejected. No integrated player. |
| `tables` | Table management | Implemented in source | T1–T9999 management, available/reserved, remove/reactivate. |
| `qr` | Table QR codes | Implemented in source | Copyable URL, downloadable SVG QR, table link rotation. |
| `devices` | Customer devices | Partial / changed | Saved-browser profiles, last seen, order count and basic list; no original advanced filtering/paging. |
| `blocking` | Device blocking | Implemented in source | Saved-browser block/unblock, not a permanent person/device ban. |
| `securityAlerts` | Blocked-browser alerts | Implemented in source | Deduplicated blocked-scan notices; optional private Android push. |
| `loyalty` | Monthly regular badges | Partial / changed | Current-month distinct ordering-day badge from currently retained epoch data; no CRM or lifetime program. |
| `stocks` | Stock tracking | Partial / changed | Tracked/untracked counts, per-portion reservations/restores and selling-price valuation; no original filter/sort/export suite. |
| `stockSummary` | Stock summary | Implemented in source | Remaining-unit count and value at selling price. |
| `stockChart` | Stock distribution | Partial / changed | Relative unit share bars, not the original complete stock chart. |
| `stockLoops` | 24-hour stock loops | Implemented in source | Lazy and private-scheduled 24-hour count replacement; no local-midnight schedule. |
| `lowStock` | Low-stock alerts | Implemented in source | One stored notice per generation when crossing configured percentage. |
| `notifications` | Notifications | Implemented in source | In-app notices and read marker, time-window filtered. |
| `menuEditor` | Menu management | Implemented in source | Add/delete/admin edit, manager restrictions, prices/flags/sizes/availability. |
| `arrangement` | Menu arrangement | Partial / changed | Numeric per-dish position; not the original drag-and-drop arrangement. |
| `categoryEditor` | Category management | Partial / changed | Newline category list editor; no automatic replacement of categories on existing dishes. |
| `contact` | Staff contact details | Implemented in source | Shared staff contact text popup. |
| `waiter` | Private waiter screen | Implemented in source | Revocable bearer-link role with configured orders/requests/billing permissions. |
| `waiterBilling` | Waiter manual billing | Implemented in source | Additional permission for manual waiter billing. |
| `alarms` | Foreground alarms | Partial / changed | Open-tab oscillator presets; enable by gesture. Poll-based detection. |
| `voice` | Voice announcements | Partial / changed | System speech synthesis, not the original four bundled recorded voices/table announcements. |
| `customAudio` | Local custom audio | Partial / changed | One uploaded local tone for this tab session; not persisted IndexedDB, no separate per-category uploads or custom voice-pack JSON. |
| `push` | Background push | Implemented in source | Encrypted Web Push for Android Chrome/Firefox. Requires VAPID keys, owner entitlement, opt-in and a private scheduled worker. See ANDROID-PUSH-SETUP.md; real device delivery unverified. |
| `themeSwitch` | Theme switch | Partial / changed | Local fixed alternate light preset; main saved theme tokens configurable. Does not persist across reload. |
| `wakeLock` | Keep screen awake | Partial / changed | Explicit browser Wake Lock request, support/permission dependent; no automatic re-acquire persistence. |
| `resets` | Reporting resets | Partial / changed | Analytics/dish baseline resets and reporting-epoch archival. NOT original permanent records/device deletion. |

## Cross-cutting gaps

### Customization scope

The admin has generated editors for all fields listed in CUSTOMIZATION-CATALOG.md, plus module visibility and registered text overrides. Owner group locks and feature entitlements take priority. Texts are plain text, not injected HTML. “Texts” includes labels and buttons, but not every internal exception/status code, built-in browser file picker/dialog, literal database value, mathematical unit or native printer setting. Hiding a registered label is presentation only. Protected settings/escape controls remain reachable. There is no live WYSIWYG page builder, CSS/script injection, independent alternate-light palette editor or arbitrary receipt block designer.

Configuration arrays `order` and `sectionOrder` are reserved in the beta schema and are not used by the UI. Arrangement uses item.position. Do not rely on those arrays as implemented layout controls.

### Retention and historical identity

History/Requests/notification durations mostly control visibility, not physical data deletion. The private maintenance job expires pending orders and old visits and applies stock loops. It does not delete old customer profiles, notices or archived orders. Records reset rotates an epoch and requires no active orders; it does not erase old data. Device-list reset is not ported. Receipt item prices/tax are snapshots, but printed branding/contact/footer use current settings.

### Access and scale

Membership rows replace one-Team-per-restaurant. Owners configure features and settings access; admins manage their restaurant. No cross-restaurant bulk dashboard or custom per-user fine-grained policy editor exists. Public access still needs anti-abuse protections. Reports scan current tenant rows with a 20,000-row guard, not large-scale warehouse queries. Read-only staff bootstrap is not a single consistent multi-table snapshot.

### Original UI details not faithfully reproduced

Multi-dialog item sizing UI; original exact sortable/filterable device/stock/report lists; per-device IndexedDB alarms and four voice packs; custom voice-pack upload/download; original foreground browser Notification API; receipt verification service; rich date comparisons/charts; category reassignment workflow; hard-deletion resets; connectivity/chime diagnostics; detailed original custom-note/customer-help wording. Their original definitions remain in the supplied audit for later migration work.

### Dependencies and safe controls

Turning off Requests, Music or Music queue prevents new music requests. Turning off portions withholds portioned dishes from the public menu. Inventory quantities continue to constrain orders when the Stocks administration screen is hidden. The manual payment selector remains required even when receipt payment labels are hidden. Module visibility does not physically delete data.
