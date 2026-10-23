# Yummy Momo Release 44 — complete feature and settings inventory

## Scope and evidence

Source: the uploaded `Yummy-Momo-Release-44-Complete.zip`. This is a source-code and bundled-documentation audit, not a live restaurant acceptance test. The archive has 129 files. `WEBSITE` contains three application HTML pages and 36 JavaScript files. An additional local HTML utility generates push keys.

I inspected the screens, JavaScript modules, cumulative SQL, Release 43/44 migrations, setup instructions, and included QA material. I independently checked all 36 website JavaScript files with `node --check`: all passed. The three website HTML pages had no duplicate IDs or missing directly referenced local script/link/image assets. These checks do not execute PostgreSQL migrations or prove runtime, accessibility, receipt-printer, MFA, or push-delivery correctness.

**Critical deployment finding:** `WEBSITE/config.js` contains placeholder Supabase URL/key values. This ZIP is not a working live restaurant connection as supplied. The included public push key is not sufficient without its matching private backend configuration. No live credentials were requested or used, no website was deployed, and no database was changed.

Throughout this report, “has/supports” means an implementation is present in this archive. It does not certify the deployed site has the corresponding migration, configuration, data, permissions, or working integration.

## 1. Application structure and user types

| Surface | File | Purpose / access |
|---|---|---|
| Customer menu | `WEBSITE/index.html` | Table-QR access, menu, cart, ordering, tracking, history and waiter calls |
| Kitchen / admin / manager | `WEBSITE/kitchen.html` | Staff sign-in; orders, billing, records, analytics, requests, tables, devices, menu, stocks, notifications, management |
| Waiter | `WEBSITE/waiter.html` | Private capability link/QR; active orders, requests and optionally manual billing; no email/password sign-in |
| Push-key utility | `OWNER-OPTIONAL/generate-push-keys.html` | Owner setup utility, not a fourth restaurant screen |

The website is plain HTML/CSS/JavaScript. Supabase supplies PostgreSQL, REST/RPC and authentication. Background delivery additionally uses a Supabase Edge Function and browser push service worker. Normal “live” refreshes are polling, not a WebSocket/realtime subscription implementation. No build step is required by the included deployment guidance.

## 2. Customer menu: browsing and presentation

- Restaurant name/logo and warm food-oriented branding; customer page ships with `dark-site` styling.
- Table identity in header and order drawer.
- Explicit “scan your table QR” screen when table credentials are absent.
- Different notices for expired access, blocked browser and reserved table.
- Menu photos, dish names, descriptions, prices and vegetarian/non-vegetarian indicators.
- Recommended and Best seller badges and category shortcuts.
- `All`, `Best Sellers`, `Recommended`, plus administrator-defined categories.
- Horizontal scrollable category bar with dish counts and selected-state feedback.
- A category dropdown synchronized with that bar. It is not a price/name sort menu in this release.
- Text search across dish name, description and category.
- Dietary filter: all, vegetarian only, non-vegetarian only.
- Category, text and diet filters combine.
- Administrator-defined category/dish ordering preserved within results.
- Single-price dishes or multiple named portion choices, each with its own price.
- Sold-out tracked portions excluded from offered sizes; manually unavailable items excluded from the active customer menu.
- Loading, empty-results and connection-error feedback.
- Lazy-loading/async decoding of images; keyed menu reconciliation keeps unchanged photo nodes mounted during quantity updates.
- Desktop order sidebar and mobile floating cart bar; responsive device layouts.
- Customizable system-credit footer/link, described below.

## 3. Customer cart and order submission

- Add a dish/size, increase quantity, decrease quantity and remove a line at zero.
- Multiple sizes of the same dish can be ordered together as separate cart lines.
- Size name is included in the cart and saved item name.
- Up to 50 item/size lines, each quantity from 1 to 50.
- Client-side checks prevent exceeding current tracked stock; server checks remain authoritative.
- Order drawer shows table, items, line amounts, subtotal, tax and total.
- Optional name, up to 80 characters; blank becomes Guest.
- Kitchen instructions up to 1,000 characters.
- Toggleable note chips: Less spicy, No onion, Extra cheese. These edit the notes field; they are not priced modifier products. The screen warns extras may cost more and should be confirmed with staff.
- Percentage or fixed-per-order tax display when enabled by the admin.
- Submission saves a random request ID and private receipt token for safe retries.
- An uncertain submission is retained as “previous order not confirmed”; Retry original order reuses the original identity rather than deliberately creating a second order.
- Errors such as changed total, unavailable item, insufficient stock, invalid size, reserved table, expired scan or pending-order cap are surfaced.
- Server uses saved menu values, not client-submitted prices, and compares the expected final total.
- Saved names/prices/size labels/tax snapshots protect old bills from later menu changes.
- Release 44 permits at most **two Pending orders per saved customer browser device**, not two lifetime orders or two orders per table. Once one is accepted out of Pending, another can be placed. The device-scoped database lock is intended to serialize concurrent submissions; idempotent retries are checked before the cap.
- Release 44 accepts arbitrary saved size IDs rather than only regular/medium/large.
- QR-created orders are labeled `QR Scan Menu` in the payment field. This is an ordering-source label, not evidence payment was collected.
- Confirmation panel appears only after a confirmed cloud order; “Track my order” links into tracking. The celebration module exists, but its current `launch()` clears the particle container; do not count elaborate food-particle animation as verified functionality.

## 4. Customer tracking, history and cancellation

- Live order-status entry point and “order in progress” banner.
- Select another current order from the same table/device receipt set.
- Order identity uses daily order number and table.
- Status-specific explanation for Pending, Accepted, Cooking, Ready, Served, Cancelled and Rejected.
- Three-step visual progression: received, cooking, served/complete.
- Item quantities, saved prices/amounts, tax details and total.
- Rejection/cancellation reasons where provided.
- Add more items / order again returns to the menu; it is not a merge/edit of an existing kitchen order.
- Device-local history with dates, statuses, item previews and totals; selecting an entry opens that saved receipt detail.
- History is scoped to receipts saved on this browser and current table/project context, not an account-wide customer portal.
- Receipts have private tokens; refresh batches token-verified receipt checks.
- Saved receipts unavailable on the current shop database receive an explicit unavailable state instead of silently becoming a new valid order.
- Current-order display window defaults to 120 minutes; history window defaults to 180 minutes. Admin can change both; history must be at least as long as current.
- These visibility/retention windows are distinct from the table-scan lifetime and from staff order-record retention. They do not automatically delete financial order rows.
- Cancellation window: at most one minute from original creation, only Pending/legacy Accepted and only before cooking starts. Current Accept changes Pending directly to Cooking, immediately closing cancellation.
- Countdown and disabled/closed-state messaging; cancellation requires confirmation and receipt token.
- Pending orders unaccepted for 24 hours have automatic cancellation logic, a scheduled maintenance path and expiry checks. Accepted/Cooking/Ready are not subject to that Pending-only expiry rule.
- Menu and order tracking refresh normally every five seconds while visible; display/countdown updates run every second.
- Modal close/Escape/focus handling is implemented in customer layers; that is not a full accessibility certification.

## 5. Customer waiter calls and QR/table security

- Call waiter from a valid table visit.
- Private random call-receipt identity makes retry/status checking possible.
- 30-second call cooldown and duplicate suppression for an already-pending table assistance request.
- Backend queue-size guard of 50 pending calls in the shared call implementation.
- Customer sees sending, sent/waiting, on the way, handled, expired and failed-status messages.
- Call status is polled every five seconds; handled confirmation is shown briefly (seven seconds in the customer UI).
- One-hour table access established by a valid QR key; a bare `?table=T1` is not sufficient authorization.
- Visit identity/token in session storage; persistent random browser device identity/token in local storage.
- QR key is removed from the customer address bar after successful validation, while the visit remains.
- Rescanning required after expiry. This is not GPS/geofencing or proof of physical presence: a usable shared/copied QR URL can be opened remotely.
- Reserved table blocks ordering and creates a seating-check request on valid QR opening, with repeated reserved scans deduplicated/rate-limited.
- Blocking a saved browser prevents menu access, new orders and calls, but does not cancel its existing orders.
- Saved-browser blocking is not a permanent ban on a real person: changing browser or clearing site data creates another profile.
- Table identifiers are expected in the `T1`…`T9999` form; Counter is a special manual/staff location, not a customer dining-table order target.

## 6. Kitchen live orders

- Pending Orders section with All open, Pending orders and Cancelled views.
- Pending count and live in-kitchen count.
- Cards show table, daily order number, time, status, guest name, items, amounts, notes, total and available actions.
- Monthly regular blue/star treatment for qualifying linked devices.
- Accept order: Pending → Cooking and records cooking start.
- Reject / unavailable: Pending → Rejected, with customer-visible reason (server trims to 200 characters).
- Mark served: Cooking/Ready → Served.
- Legacy Accepted/Ready are recognized in displays, but there is no exposed full arbitrary status editor or separate Ready-production button in the active action map.
- Bill preview from order cards.
- Optional linked-browser Block/Unblock from cards and order records.
- Immediate accept/reject, then guarded Undo back to Pending using a server-issued token.
- Undo is tied to the same actor/action/version; refuses stale state or unsafe stock restoration/re-reservation. It is not arbitrary history editing.
- Undo cannot extend the original 24-hour Pending lifetime.
- Rejected cards held in the temporary live/undo view for four minutes from server action time, then removed from that view; not deleted from Order Records.
- Cancelled view contains six hours of cancelled cards with pagination/expiry display; full retained records remain elsewhere.
- Concurrent status checks reject changes based on an outdated expected status.
- Visible kitchen polling every five seconds, separate background/summary fetches normally every 30 seconds; transient request retry/backoff and reconnect/last-sync messaging.
- Active-order fetch has a 1,000-row limit. Do not interpret it as an unlimited active-board guarantee.

## 7. Manual billing / Counter / takeaway

- Billing section available to admin and manager; optionally private waiter link.
- Search menu and filter by category; refresh shared prices/tax.
- Each dish groups all available portions together; multiple sizes can be selected simultaneously.
- Select checkbox and quantity; quantity 1–50; sold-out options disabled.
- Cart summary, subtotal, tax and final total; Clear button when no uncertain submission is pending.
- Must choose **Cash** or **Online** before Done. These record the staff-selected tender; Online is not an integrated UPI/card checkout, payment verification, gateway or bank reconciliation.
- Current billing UI submits table `Counter`, blank customer name and blank notes. The backend accepts an eligible table argument, but no corresponding table/name/notes selector is exposed in this manual-billing screen.
- Atomic Done writes a manual order directly as Served and reserves/deducts stock in the transaction. It does not send it through the customer Pending acceptance workflow.
- Server validates actor, payload identity, saved prices, sizes, quantities and expected taxed total.
- Pending bill identity kept in session storage; Check / retry Done avoids intentional duplicate deductions after uncertainty.
- Submission-in-flight controls are locked; uncertain submission cannot simply be cleared into a new bill.
- Receipt opens after completion; View / print last bill remains available.
- Fixed mobile billing checkout controls show payment selection and total.
- Shared daily numbering with customer orders.
- Release 43 payment migration required for this current Cash/Online RPC signature.
- Waiter billing is separately controlled, default off, and requires waiter capability/access.

## 8. Receipts and printing

- Preview and browser Print Bill for staff order records/cards and manual bills.
- Black-and-white restaurant badge; independent of dark/light dashboard theme.
- Hard-coded receipt restaurant name “Yummy Momo”, tagline “Yummy in your tummy”, and GSTIN `10RQNPK2564R1ZX`.
- Daily order number; creation date/time in Asia/Kolkata.
- Table or Counter / takeaway location.
- Payment label when present on the loaded order data.
- Item name/size, quantity, rate and line total.
- Conditional subtotal and percentage/fixed-tax lines; grand total; thank-you message.
- No Pending/Served/Done status line printed.
- Waits for receipt logo decoding before printing; thermal/monospace print CSS.
- Uses `window.print()`, not direct silent Bluetooth/USB thermal printer control. Paper width, margins and printer headers/footers require device testing.
- Adding a GSTIN does not enable tax or establish legal invoice compliance by itself.
- No receipt-logo/GSTIN editor appears in Management. These require asset/source changes.
- Important data-path caveat: `Cloud.orders()` requests active-order fields without `payment_method`/`order_source`, whereas records/manual RPC objects include them. Payment text may therefore be absent on an active-card preview until opened through a data path containing that property. This is a source-level observation, not a tested live incident.

## 9. Order Records and exports

- Day/month/year periods; current period shortcut and optional historical date/month/year.
- Year controls restrict selections to 2000–2100.
- Status filter: All, Served, Cancelled.
- Summary: Total Orders, Order value, Completed Orders.
- Order value is not automatically synonymous with served sales/revenue; use the explicitly served-sales analytics for that distinction.
- Rows show time, daily order identity, table, expandable dish amounts, notes, total, payment, status and actions.
- Expandable line detail: quantity × saved unit price and line amount.
- Bill preview/print and eligible order actions from records.
- 50 rows per UI page, Previous/Next.
- CSV export fetches the selected period/status across pages rather than exporting only the visible page.
- Order CSV columns: Time, Order number, Table, Customer, Items, Items subtotal, Tax, Total, Payment method, Status.
- CSV escaping, UTF-8 BOM and spreadsheet-formula-prefix protection are implemented.

## 10. Dish-sales reporting

- Switch between Order records and Dish sales using the same period controls.
- Top dishes in period or Daily dish sales.
- Sort by Most sold, Highest item revenue or Dish name.
- Served orders only; order-placement date in India time; item revenue excludes tax.
- Rows: rank, date/period, dish/size, quantity, order count, item revenue.
- Pagination and full report CSV export with readable size labels.
- Uses saved order item snapshots; later dish/price edits do not rewrite historical receipts.
- Reset dish sales only excludes currently served orders from this report without deleting original records, bills, inventory, numbering or active orders. Future served orders count.

## 11. Sales dashboard / analytics

- Live Pending and In kitchen counts.
- Today / This month / This year and historical date/month/year selection.
- Manual refresh; normal 30-second fetch throttling; retains last successful results with error feedback.
- Exactly four headline metrics in current Release 44 UI:
  1. Item sales · served (excludes tax).
  2. Served orders, with completion rate.
  3. Average served bill (served total / served orders).
  4. Cancelled orders, with cancelled value and cancellation rate.
- Sales trend bars: hourly for day, daily for month, monthly for year.
- Hover titles with exact amounts and order counts; expandable exact trend table.
- Future buckets faded, not predicted/forecast sales.
- Order-outcome counts across statuses, including non-sales outcomes.
- Total sales by weekday (not per-day averages).
- Dish and portion performance: units, served-order count and item sales.
- Snapshot category sales; portion-size sales.
- Table performance: served orders, item sales, bill total.
- Sales by order-placement hour in India time.
- Recent orders with status, totals and bill action; Open order records shortcut.
- Export analytics CSV includes summary, previous-period comparison, change calculation, all breakdowns, time boundaries and reset/generated timestamps. Some backend/export metrics are not additional visible headline cards.
- Analytics is sales/order activity, not ingredient cost accounting, net profit, payroll, GST filing or forecasting.
- Reset all analytics starts a new reporting baseline based on orders placed after reset, across all dashboard periods/exports. It does not delete orders or reset the separate Dish sales report, stock or live work.

## 12. Menu administration and customization

- Admin: add item, edit details, photo change/removal, category assignment, delete item.
- Managers: price/size customization, availability, Recommended/Best seller flags and ordering; no dish-name/description/category/photo/delete administrative detail privileges.
- New/edit metadata: name, category, description, vegetarian flag, single price and optional photo.
- Name up to 120 characters, description up to 1,000.
- Availability/manual hidden control separate from automatically sold-out tracked stock.
- Manually mark Recommended / Best seller; the customer shortcuts are based on these flags, not automatic machine-learned recommendations or automatic best-seller ranking.
- Price & sizes editor switches single price / offered portions.
- Add/remove sizes, rename any size, set each price, draft changes then Save/Cancel.
- Maximum 20 sizes, unique case-insensitive readable labels up to 40 characters.
- Prices ₹0–100,000, at most two decimal places.
- Stable size IDs keep inventory/loops connected across label renames.
- New sizes on tracked dishes start at zero stock until counted; removed sizes stop being offered and their loops are disabled.
- Optimistic version checks prevent overwriting another staff member’s newly edited dish.
- Staff menu search includes name/category/description; category and availability filters; Clear filters; count of shown/total dishes.
- Portion prices and per-size tracked quantities shown in staff cards.
- Dish/categories ordering: choose category group or categories themselves, move up/down or enter numeric position, save atomically, reload latest, confirm before discarding an unsaved draft.
- Revision checking preserves a failed/stale draft rather than silently overwriting another staff arrangement.
- Fixed All/Best Sellers/Recommended shortcuts remain ahead of custom categories.
- Admin category creation/removal; counts of dishes; removing category moves dishes to a selected replacement without deleting dishes/bills.

### Dish photos

- JPG/PNG/WebP, up to 10 MB input.
- Actual square canvas crop; mouse/touch dragging, zoom 1×–4×, horizontal/vertical sliders with keyboard interaction.
- Preview before saving; remove photo; cancel crop.
- WebP resizing/compression through decreasing export edges/quality; data URL capped around 245,000 characters.
- Saved shared menu image data, not only a browser-local cosmetic crop.
- No external image search, AI image generator or gallery management UI is provided.

## 13. Inventory / stocks

- Admin and manager stock section; admin can hide it for both roles without stopping inventory logic.
- Track per single-price dish or per portion-size ID.
- Toggle tracking; set an absolute counted quantity; save; reload individual row.
- Quantities are whole numbers 0–1,000,000.
- Tracking off means not constrained by counted stock; the system does not guess an initial quantity.
- Search stock and filter category; All / Tracked / Sold out / Not tracked.
- Sort Most stock first, Name or Highest stock value.
- Summary: units remaining, stock value at menu selling prices, sold-out options, tracked/shown options.
- Donut/legend for remaining quantities, top four options plus Others; per-row quantity share/progress.
- Cards show unit selling price, remaining selling value, manual-hidden notice, tracking state and last update.
- Unsaved counts retained with original revision while background reads occur; stale updates are checked server-side.
- Atomic reservation/deduction on order creation, including Pending customer orders and completed manual bills.
- Cancelled/Rejected transitions restore previously reserved quantities once, only when tracking generation still matches. A later recount/reset is not blindly increased by an old cancellation.
- Undo rejection safely re-reserves stock or refuses when no longer available/compatible.
- Tracked zero stock causes sold-out behavior; manual availability remains a separate rule.
- **24-hour loop per option:** restore to a saved absolute quantity, enable/save loop quantity, show next reset, stop loop.
- Leftovers replaced, not accumulated. Stop preserves current remaining count.
- Runs are backed by database scheduled maintenance and on-access application logic. Database cron availability/configuration must be checked for unattended operation.
- Removed/incompatible options disable loops; renamed stable IDs keep them.
- Low-stock notification when a deduction crosses to ≤5% of the stock generation baseline; baseline must be positive. Not a customizable threshold in the visible Management UI.
- One low-stock notice per option/generation avoids endless duplicates until a new count/reset baseline.
- Inventory is sellable dish/portion counting, not recipe/BOM ingredients, purchase orders, supplier invoices, expiry dates or cost-of-goods accounting.

## 14. Tables and QR management

- Admin adds table; admin/manager can set Available or Reserved.
- Admin views each customer link and rendered QR.
- Open menu, Copy link, native Share with copy fallback, Download QR as SVG.
- Revoke link & generate new rotates table QR key and expires old access; old printed QR stops working.
- Remove table stops new QR ordering/calls while preserving historical order records.
- Public URL can be based on configured `publicMenuUrl`, otherwise deployment location.
- Reservation here is a table flag plus staff attention alerts, not a date/time booking calendar or guest reservation workflow.

## 15. Waiter interface and request board

- Admin generates/views/shares private waiter QR/link; copy and native sharing.
- Rotate/revoke link invalidates old capability links; no password account required for waiter entry.
- Token passed in URL fragment and saved on waiter browser after verified access.
- Admin-controlled capability switches, enforced server-side.
- Waiter screen shows connection state, refresh, local dark/light theme and sound/notification controls.
- Responsive Orders / Requests navigation with counts.
- Active order cards: table, status, daily number/time, items/amounts, total, monthly regular badge.
- Accept pending orders and mark Cooking/Ready served only when permitted.
- Request board common to staff/waiter: All / Pending / Handled / Expired, pagination (50), location/kind, created/handled time, On the way and Mark handled.
- On the way records shared acknowledgment and stops request alarms, but request stays Pending until handled/expired.
- Mark handled is shared across devices. Dismiss and Snooze are not handling.
- Reserved-table QR alert explains seating check.
- Counter waiter request routed to waiter devices only, not kitchen/counter alarms.
- Table assistance and reserved scans routed to kitchen/counter and authorized waiters.
- Waiter billing available only if enabled separately.
- Three-second visible waiter refresh; refresh on returning to page/push-open event.
- Access verification failures clear/hide operational content rather than intentionally leaving stale privileged controls active.
- Anyone holding the capability has its permissions. There is no individual waiter identity, per-waiter task attribution, roster or attendance system.

## 16. Saved customer devices, blocking and monthly regulars

- Random persistent browser profiles; no customer login required.
- Profile list: browser/OS label, short/full ID, allowed/blocked, order count, monthly distinct days and star.
- Expand details: first seen, last seen, last edited, last table, last order, reported user agent/platform/language/time zone.
- Sort by first seen, edited time, order count or last seen; ascending/descending; 50-row pagination.
- Admin block/unblock from device list, linked order cards/records and security notifications.
- Two separate manager delegations: customer-device list access; order-card block/unblock. Security-notice access requires at least one relevant delegation.
- Blocks leave old orders intact; clearing site storage/new browser can evade the profile identity.
- Blocked saved browser opening a valid table QR creates staff security notification.
- Repeated attempts from same browser/table grouped for five minutes, with attempt count and last-attempt time; grouping does not extend first-event expiry.
- Individual or all mark-read; read state shared between staff.
- Notifications show device details and block/unblock if linked profile still exists.
- **Monthly regular:** same saved device, four distinct valid ordering dates in current Asia/Kolkata calendar month.
- Multiple orders on same date count once. Pending/Accepted/Cooking/Ready/Served count; Cancelled/Rejected do not.
- Fourth qualifying day immediately qualifies. Cancelling/rejecting sole valid order of a day can remove qualification.
- Blue/star device card and qualifying current-month kitchen/waiter order cards.
- Automatically restarts each calendar month; no manual monthly reset required.
- Manual Counter bills without customer device do not qualify. It is a badge, not loyalty points, cash rewards, coupon/discount or person identification.

## 17. Foreground alarms, voices and device notifications

### Sound categories and foreground behavior

- Separate incoming-order, waiter-request and notification alarms.
- Built-in presets per category: Rising chime, Ding-dong, Bell, Muted.
- Default orders chime, waiter ding-dong, notification bell; voice/global/device preferences default enabled in the current migration path while explicit local mute choices persist.
- Visible, eligible pending orders/requests repeat on a two-second cadence; requests take priority while their dialog is active.
- Alarm dialog identifies affected order/table/location; Dismiss and Snooze two minutes affect this browser only.
- Accept/reject/serve/handle changes the shared operational item, unlike local silencing.
- On the way stops request repetition without declaring it handled.
- Mute/enable controls for order, call, voice and notification sound.
- Master device setup “Enable sounds & notifications” requests browser consent on user gesture and re-enables local choices.
- Four bundled recorded voice styles: Male 1 warm, Male 2 deep, Female 1 clear, Female 2 bright. Orders and requests independently selectable per browser.
- Voice builds table announcements from phrase/digit segments; e.g. T12 as one-two. Counter has dedicated bundled clips.
- Long announcements accelerated to fit around 1.85 seconds; rotates eligible tables across cycles.
- Four-step volume test: order, waiter, notification and voice, with Stop test; system notification test when permission available.
- Browser-local theme, audio choice and mute persistence; browser autoplay may still need a tap after reopen.
- Digital 3× gain and limiter in audio output is not a promise of 3× acoustic loudness or an OS-volume override.

### Custom alarms and custom voice pack

- Separate uploaded custom alarm for orders, waiter calls and notifications.
- Browser-decodable MP3/WAV/OGG/WebM; under 2 MB; 0.1–15 seconds; only first 1.8 seconds played/repeated.
- Preview; “Use built-in alarm” removes local category override.
- Custom voice JSON under 3 MB, version 1, embedded audio data URL (no arbitrary external URL execution).
- Required segments: orders, waiter, reception, digits 0–9; phrase duration ≤5 sec, digit ≤1.5 sec, all within decoded audio.
- Download working sample pack; bundled `CUSTOM-AUDIO/VOICE-PACK-SAMPLE.json` and readme.
- Local uploaded sounds/pack stored in IndexedDB, not uploaded/shared with staff. Voice selection stored locally and saved immediately.
- Shared presets / global voice permission saved by admin; local uploads/voice selections must be set separately per browser.
- Current Counter announcement uses dedicated bundled voice clips; selecting a custom voice for waiter calls falls back to bundled Female 1 for Counter, rather than using the custom pack’s legacy reception phrase.

### Push / system notifications

- Service worker with supported HTTPS PushManager/Notification browser APIs.
- Register/disable staff browser subscriptions; remembers explicit opt-out; can reconnect when permission already granted.
- Events: new order, table assistance, Counter call (waiter only), reserved table scan, low stock and blocked-browser scan.
- Manager security alerts respect delegated access; waiter events respect waiter settings.
- Server sender uses VAPID public/private pair and a secret-protected Edge Function.
- Provider endpoint allowlist: Google FCM, Mozilla Firefox, Windows WNS and Apple Web Push; rejects insecure/arbitrary/lookalike endpoints.
- Expired 404/410 subscriptions removed, transient failures retried, leased jobs and ten-minute event expiry, limited attempts.
- Existing pending event not discarded simply because no registered recipient currently exists; retry within expiry.
- Immediate wake hooks plus cron retry fallback where configured.
- Delivery diagnostics distinguish subscription registered from sender configured; last successful run plus accepted/retry/expired-subscription counts.
- Provider accepted does not prove notification appeared or sounded on the intended phone.
- Foreground system-notification fallback when push sender is missing; service-worker acknowledgments reduce duplicates.
- Click notification opens/focuses appropriate staff page and refreshes relevant data.
- Local notification test is not a server/locked-screen delivery test.
- Custom voices/alarm uploads are foreground-visible only. Background notifications use OS sound/volume/settings.
- Cannot bypass DND, silent mode, browser permission denial, force-stop, battery restrictions, or guarantee locked/closed delivery.
- iPhone/iPad push requires a supported installed Home Screen web app. No web-app manifest is included, so do not treat this archive as a fully verified installable-PWA implementation merely because it has `sw.js`.
- No offline order/menu cache in the service worker; no offline-only “success” fallback.

## 18. Complete administrator settings catalog

These controls are in Management unless a different location is stated. Defaults describe fresh schema/current source intent, not unknown values on an existing installation.

| Setting | Options / boundaries / effect | Scope |
|---|---|---|
| Stocks visibility | Hide/show entire section; does not disable stock/loops | Shared, admin |
| Contact name | Up to 80 characters | Shared |
| Phone number | Up to 40 characters; copyable in staff Contact us | Shared |
| Additional contact details | Up to 500 characters | Shared |
| Allow private waiter manual bills | Boolean; default false | Shared capability |
| Allow repeating voice | Boolean; current migration default on | Shared |
| Incoming-order preset | Chime / Ding-dong / Bell / Muted | Shared |
| Waiter-request preset | Chime / Ding-dong / Bell / Muted | Shared |
| Notification preset | Chime / Ding-dong / Bell / Muted | Shared |
| Incoming-order custom alarm | Upload / use built-in / preview | This browser |
| Waiter custom alarm | Upload / use built-in / preview | This browser |
| Notification custom alarm | Upload / use built-in / preview | This browser |
| Incoming-order voice | Male 1 / Male 2 / Female 1 / Female 2 / uploaded pack | This browser |
| Waiter-request voice | Same voice choices | This browser |
| Custom voice pack | Upload JSON / download sample | This browser |
| Manager device-list permission | Allow list + block/unblock; default false | Shared, all managers |
| Manager order-card blocking | Separate boolean; default false | Shared, all managers |
| Waiter access enabled | Master capability toggle; default true | Shared |
| Waiter view active orders | Boolean; default true | Shared |
| Waiter accept orders | Boolean; default true | Shared |
| Waiter mark served | Boolean; default true | Shared |
| Waiter view requests | Boolean; default true | Shared |
| Waiter handle requests | Boolean; default true | Shared |
| Waiter request sound/notifications | Boolean; default true | Shared |
| Private waiter QR/link | View/share/copy/revoke/regenerate | Shared capability |
| Add tax to bills | Boolean; fresh default off | Shared, future bill snapshots |
| Tax type | Percentage or fixed rupees/order | Shared |
| Tax rate/amount | Percent 0–100; fixed 0–100,000; max 2 decimals | Shared |
| Dish categories | Add/remove; select replacement for removed category | Shared |
| Notification reset minutes | 1–10,080; fresh default 1,440 | Shared activity retention |
| Request-list reset minutes | 1–10,080; fresh default 120 | Shared activity retention |
| Customer current/status minutes | 1–10,080; fresh default 120 | Shared visibility rule |
| Customer history minutes | 1–10,080; fresh default 180; ≥ current | Shared visibility rule |
| Show SHOI SYSTEMS credit | Boolean | Shared public footer |
| Show Click here link | Boolean; needs destination | Shared public footer |
| Footer destination | Valid http/https; no URL login credentials; max 2,048 chars | Shared |
| Google review URL | Approved HTTPS Google review/maps host validation; blank clears | Shared public |
| Permanent reset actions | Four separately guarded reset types, below | Shared, admin-only |

Related non-Management settings/actions:
- Account menu: local light/dark, Contact us, sign out, Enable sounds & notifications, Alert setup/test.
- Device tools: volume test/stop and Keep screen awake (Wake Lock API, saved desired preference, visible/supported browser only).
- Live orders: order-sound and voice toggles; request/notification sections have sound controls.
- Waiter: local theme, refresh, call sound, notifications, optional billing view.
- Menu: pricing/portion editor, availability, flags, categories, images, arrangement.
- Stocks: tracked/untracked counts, filters, sort, per-option loops.
- Tables: Available/Reserved, add/remove, QR sharing/rotation.
- Devices/reports/analytics/requests: their filters, sort, periods and pagination are view controls, not additional global business settings.

## 19. Destructive reset types — do not confuse these

| Action | Confirmation | What changes | What stays |
|---|---|---|---|
| Reset ALL order records & dish sales | `DELETE RECORDS` | Permanently deletes order history, related receipt verification/report data and daily numbering counters; next number starts at 1 | Menu/stock counts; refuses reset while active orders exist |
| Reset dish sales only | `RESET DISH SALES` | Excludes currently Served orders from separate dish-sales report | Original orders, bills, stock, numbering, active work; future served orders count |
| Reset all analytics | `RESET ANALYTICS` | New dashboard analytics baseline; only orders placed after reset count | Order Records, bills, separate dish sales, menu/stock/devices and live work |
| Reset all customer devices | `DELETE DEVICES` | Profiles, blocks, links and blocked-scan notices removed; table visits expire | Orders, menu, table QR keys; customers must rescan and previously blocked browsers can enter |

Export/back up first. App provides no general Undo for these destructive/report-baseline resets. A reporting reset is not a tax-compliant data-retention policy.

## 20. Authentication, authorization and privacy

- Admin and manager use registered Supabase email/password and `staff_users` role mapping.
- Admin additionally requires native Supabase TOTP/AAL2; Google/Microsoft/compatible authenticator enrollment QR and manual setup secret supported.
- Six-digit verification, verified-factor selector, refresh verification options, back to sign-in.
- Manager is password-only in this design.
- Admin enrollment secret displayed transiently in DOM, not intentionally stored in browser storage; cleared on verification/pagehide.
- Only this app’s unfinished/unverified factors cleaned during re-enrollment; verified factors not automatically removed.
- No email OTP, no password-only admin bypass and no app-issued MFA recovery codes. Lost-factor recovery requires independently authorized Supabase project owner/admin tooling.
- Staff tokens stored in sessionStorage, refresh-token flow before expiry, logout clears session/cache. This is not a permanent cross-browser “remember login” system.
- Server-side role checks/RLS and restricted RPC grants supplement hidden buttons; private waiter key verified server-side.
- Waiter QR is bearer capability, not named staff login. Table QR proves possession of a key, not presence at venue.
- Persistent customer device/browser metadata and token-protected receipt records stored for operations. Profiles are browser identities, not hardware fingerprints or real-person verification.
- Input escaping, image/URL validation, backend price checks, request identity checks and revision locks are implemented safeguards, not an independent penetration-test guarantee.
- Client accepts public anon/publishable Supabase keys, rejects service-role-style misuse in configuration checks. Private service-role/VAPID/webhook values belong backend-side only.

### Role matrix

| Capability | Admin | Manager | Private waiter | Customer |
|---|---|---|---|---|
| Customer QR order/track/call | Through valid customer visit | Through valid customer visit | Through valid customer visit | Yes, valid visit |
| Kitchen sign-in | Password + TOTP | Password | No | No |
| Accept/serve kitchen orders | Yes | Yes | If enabled | No |
| Reject / guarded Undo | Yes | Yes | No exposed reject/Undo | No |
| Manual Counter bill | Yes | Yes | If separately enabled | No |
| Order records / analytics / exports | Yes | Yes | No full reports | Own saved receipts only |
| Prices/sizes, availability, badges | Yes | Yes | No | No |
| Dish/category/photo create/detail/delete | Yes | No administrative detail editing | No | No |
| Dish/category arrangement | Yes | Yes | No | No |
| Stocks / loops | Yes | Yes, unless hidden | No | No |
| Table availability | Yes | Yes | No | No |
| Table add/remove/QR rotation | Yes | No | No | No |
| Customer-device/security controls | Yes | Delegated only | No | No |
| Global Management / reset / tax | Yes | No | No | No |

## 21. Owner / deployment configuration

### Browser configuration: `WEBSITE/config.js`

- `publicMenuUrl`: empty uses deployment-relative links.
- `restaurantName`: Yummy Momo.
- `tagline`: Yummy in your tummy, although parts of UI/receipt contain hard-coded text instead of universally honoring it.
- `currency`: ₹; financial controls/receipts also have India/INR-specific assumptions and labels. This is not fully internationalized currency/tax support.
- `supabaseUrl`: placeholder; supply this restaurant’s own public HTTPS project URL.
- `supabaseAnonKey`: placeholder; supply public anon/publishable key only.
- `googleReviewUrl`: optional config fallback; shared saved review setting normally queried.
- `categories`: startup fallback categories; actual shared category configuration supplied by database.
- `menuItems`: empty; not a shipped populated menu or a working offline menu fallback.

### Push/backend setup

- Public VAPID key in `WEBSITE/push-config.js` must match private server pair.
- Edge Function secrets: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `PUSH_WEBHOOK_SECRET`; Supabase server supplies project URL/service-role environment values.
- Sender requires POST and strong secret header; optional function config disables JWT only for this separately authenticated sender, not the application’s staff security.
- `OWNER-OPTIONAL/PUSH/02-enable-delivery.sql` configures private sender wake URL/secret using backend setup. Never publish a filled secret-bearing copy.
- Private backend extensions include cron/network/Vault where needed; check environment support.
- Key generator is an owner utility; do not routinely rotate working VAPID keys.
- `vercel.json` headers: no-cache, nosniff and same-origin referrer policy.
- No n8n or service-role key in the browser design.

### Migration caveats

- Already Release 43: apply `SUPABASE/YUMMY-MOMO-44.sql`, then website update preserving live config files.
- Release 43 adds Cash/Online payment storage/RPC; Release 44 adds QR source label, pending-device cap and arbitrary size-ID validation.
- Cumulative/fresh installers in this archive reach the earlier consolidated baseline (through Release 39); do not assume selecting one of them alone produces the entire Release 44 schema. Review/apply the separate required 43/44 migrations in dependency order.
- Fresh installer is only for an empty project; never run it on a populated live restaurant as a reset/repair shortcut.
- Some older setup guides refer to missing historic UPDATE filenames or obsolete release instructions. Prefer current release notes and verified dependencies, not a filename copied from an old error message.
- `FIX-CURRENT-INSTALL.sql` and `UPGRADE-EXISTING-PROJECT.sql` are duplicate cumulative files in this ZIP; they are not evidence of two different features.

## 22. Legacy / dormant / non-features

- SQL includes a song-request queue subsystem (`song_requests` and request/get/cancel/queue/next/finish/done RPCs), plus Cloud song helper methods and leftover CSS. Current three application screens have no song-request/player/queue UI. Treat as backend/legacy functionality, not a usable current customer music feature.
- Historical email-OTP admin setup exists in early migration text but later cumulative SQL drops its functions/tables; active staff auth is native TOTP, not simultaneous email verification.
- Reception remains a compatibility enum/alias internally; current UI says Counter. It is not a separate additional desk feature.
- Scanner-related variable declarations are not a functioning camera scanner screen. Customer scans QR using device camera/external scanner; app generates table/waiter QRs.
- Service worker exists for notifications, not offline orders/menu caching.
- No visible customer account/signup/password portal, delivery-address/dispatch workflow, integrated online-payment checkout, refunds/reconciliation, coupon/promo pricing, paid loyalty points, staff shifts/payroll, ingredient purchasing/supplier workflow or multi-restaurant dashboard.
- No arbitrary configurable AI/chatbot or AI feature is implemented in this app merely because generated/assisted code or synthetic voices are included.

## 23. Verification findings and limitations

### Independent checks during this audit

- 36/36 website JavaScript files pass Node syntax checking.
- Three website HTML pages inspected for duplicate IDs: none found.
- Direct local script/link/image references checked: no missing files found.
- No live API requests, migrations, push sends, staff sign-ins or deployments performed.

### Bundled QA evidence — not rerun/certified here

The archive contains Playwright-style UI tests, mocked cloud/notification tests, minimal fixture database tests and sender tests/results. Their own README says local synthetic only and not the owner’s project. Latest release notes explicitly say live migration/production QR flow were not tested. Several stored UI audit results contain low-contrast warnings even alongside passing functional checks; this is not a WCAG pass. Some QA scripts require extra packages/path adaptation not included as app dependencies.

### Specific discrepancies worth checking

1. Release 43 test prose says four HTML pages, but `WEBSITE` has three; owner key utility exists separately.
2. Supabase placeholders prevent this bundle alone connecting to real restaurant data.
3. Current cumulative/fresh baseline is older than the latest separately included migrations.
4. Theme CSS support and old QA screenshots do not prove a customer-facing theme toggle; current customer page starts dark and has no visible customer theme-switch control.
5. Logo, receipt GSTIN and some branding/copy are hard-coded, not all configurable via Management.
6. Online manual tender selection is not payment collection/verification; QR Scan Menu is not a tender.
7. A configured public push key plus granted permission does not establish working locked-screen delivery.
8. Saved-browser blocks and regular badges are evadable/lost with a new browser identity; no real-person guarantee.
9. Active-card receipt payment label depends on fields returned by its fetch path.
10. Legacy music/OTP/scanner remnants should not be marketed as active complete user features.

## 24. Primary source map

- Customer: `WEBSITE/index.html`, `customer.js`, `menu-experience.js`, `menu-options.js`, `table-access.js`, `customer-waiter.js`, `reviews.js`, `order-celebration.js`.
- Staff operations: `kitchen.html`, `kitchen.js`, `staff-auth.js`, `kitchen-ops.js`, `staff-extras.js`.
- Menu/admin: `admin-controls.js`, `yummy-crop.js`; `restaurant_menu_customize`/category/layout SQL.
- Billing/receipts/contact: `yummy-billing.js`, `yummy-receipt.js`, `yummy-contact.js`, `SUPABASE/YUMMY-MOMO-43.sql`.
- Stock: `stocks.js`, `yummy-stocks-settings.js`, inventory/reservation/loop/threshold SQL.
- Reports: `dish-sales.js`, `operations-analytics.js`, records/dish-sales/analytics SQL.
- Devices/security: `device-management.js`, `security-controls.js`, `monthly-loyalty.js`, device/loyalty SQL.
- Waiter/requests/tables: `waiter.html`, `waiter.js`, `waiter-access.js`, `call-requests.js`, `tables.js`.
- Alarms/push: `alert-device.js`, `alert-audio.js`, `request-ring.js`, `background-alerts.js`, `sw.js`, `voice-packs.json`, `OWNER-OPTIONAL/PUSH/*`, `CUSTOM-AUDIO/*`.
- Latest enforcement: `SUPABASE/YUMMY-MOMO-44.sql`.
- Historical/cumulative backend: `OWNER-OPTIONAL/NEW-EMPTY-PROJECT-ONLY.sql`, `SUPABASE/UPGRADE-EXISTING-PROJECT.sql`, standalone migrations.
- Setup/test scope: `START-HERE-RELEASE39/42/43/44.txt`, `ADMIN-AUTHENTICATOR-SETUP.txt`, `QA/README.txt`, latest `TEST-RESULTS*`.

## Appendix A. Every static form field and choice in the three application screens

This is generated from the shipped HTML, so fields rendered dynamically by JavaScript (manual billing, crop controls, per-row stock inputs, per-device blocking and request buttons) are described in the chapters above instead. Hidden forms are included here as implementation inventory, not a claim they are all visible at once.

### index.html

| Field ID/name | Type | Label / choices / limits |
|---|---|---|
| `searchInput` | search | Search dishes, drinks and desserts |
| `menuSort` | select | Filter by category; Choices: All categories [All] |
| `menuDiet` | select | Dietary filter; Choices: Veg / Non-Veg [all], Veg only [veg], Non-Veg only [nonveg] |
| `custNameInput` | text | Enter your name (optional); maxlength=80 |
| `custTableInput` | hidden |  |
| `custNotesInput` | textarea | e.g. Less spicy, extra plates, no onions...; maxlength=1000 |

### kitchen.html

| Field ID/name | Type | Label / choices / limits |
|---|---|---|
| `staffEmail` | email | Staff email; maxlength=254 |
| `staffPassword` | password | Password |
| `adminMfaFactor` | select | Authenticator; Choices:  |
| `adminMfaCode` | input | Six-digit authenticator code; maxlength=6; pattern=[0-9]{6} |
| `recordDate` | date | Choose a past period (optional) |
| `recordStatusFilter` | select | Order status; Choices: All [], Served [], Cancelled [] |
| `dishReportMode` | select | Report Top dishes in period Daily dish sales; Choices: Top dishes in period [dishes], Daily dish sales [daily] |
| `dishReportSort` | select | Sort by Most sold Highest item revenue Dish name; Choices: Most sold [quantity], Highest item revenue [revenue], Dish name [name] |
| `analyticsReference` | date | Or choose date / month / year; min=2000-01-01; max=2100-12-31 |
| `managerDevicesAccess` | checkbox | Allow managers to view and block/unblock customer devices |
| `deviceSort` | select | Sort by Date first seen Time edited Number of orders Last seen; Choices: Date first seen [date], Time edited [edited], Number of orders [orders], Last seen [seen] |
| `deviceDirection` | select | Direction Newest / highest first Oldest / lowest first; Choices: Newest / highest first [desc], Oldest / lowest first [asc] |
| `newTableNumber` | input | Table number; maxlength=5; pattern=T[1-9][0-9]{0,3} |
| `stockSearch` | search | Search stock |
| `stockCategory` | select | Category All categories; Choices: All categories [All] |
| `stockFilter` | select | Show All stock Tracked only Sold out Not tracked; Choices: All stock [all], Tracked only [tracked], Sold out [out], Not tracked [untracked] |
| `stockSort` | select | Sort Most stock first Name Highest stock value; Choices: Most stock first [quantity], Name [name], Highest stock value [value] |
| `staffMenuSearch` | search | Search dishes |
| `staffMenuCategory` | select | Category All categories; Choices: All categories [All] |
| `staffMenuAvailability` | select | Availability All dishes Available Unavailable; Choices: All dishes [all], Available [available], Unavailable [unavailable] |
| `layoutGroup` | select | Arrange; Choices:  |
| `contactName` | input | Contact name; maxlength=80 |
| `contactPhone` | tel | Phone number; maxlength=40 |
| `contactDetails` | textarea | Additional contact details; maxlength=500 |
| `manualWaiterAccess` | checkbox | Allow private waiter-link users to create manual bills |
| `voiceAlertEnabled` | checkbox | Allow repeating order and waiter-request voice alerts |
| `ordersSoundPreset` | select | Incoming orders; Choices: Rising chime [chime], Ding-dong [doorbell], Bell [bell], Muted [none] |
| `(dynamic identifier)` | file | Custom alarm (this browser); accept=audio/mpeg,audio/wav,audio/ogg,audio/webm |
| `ordersVoice` | select | Announcement voice (this browser); Choices: Male 1 · warm [male1], Male 2 · deep [male2], Female 1 · clear [female1], Female 2 · bright [female2], Custom uploaded pack [custom] |
| `waiterSoundPreset` | select | Waiter requests; Choices: Rising chime [chime], Ding-dong [doorbell], Bell [bell], Muted [none] |
| `(dynamic identifier)` | file | Custom alarm (this browser); accept=audio/mpeg,audio/wav,audio/ogg,audio/webm |
| `waiterVoice` | select | Announcement voice (this browser); Choices: Male 1 · warm [male1], Male 2 · deep [male2], Female 1 · clear [female1], Female 2 · bright [female2], Custom uploaded pack [custom] |
| `notificationSoundPreset` | select | Notification alerts; Choices: Rising chime [chime], Ding-dong [doorbell], Bell [bell], Muted [none] |
| `(dynamic identifier)` | file | Custom alarm (this browser); accept=audio/mpeg,audio/wav,audio/ogg,audio/webm |
| `(dynamic identifier)` | file | Custom voice pack; accept=application/json,.json |
| `managerOrderDeviceAccess` | checkbox | Allow managers to block/unblock from order cards |
| `waiterPermission_enabled` | checkbox | Waiter access enabled |
| `waiterPermission_view_orders` | checkbox | View active orders |
| `waiterPermission_accept_orders` | checkbox | Accept pending orders |
| `waiterPermission_serve_orders` | checkbox | Mark cooking orders served |
| `waiterPermission_view_requests` | checkbox | View customer / counter requests |
| `waiterPermission_handle_requests` | checkbox | Mark requests handled |
| `waiterPermission_alerts` | checkbox | Request notifications and in-page sound |
| `taxEnabled` | checkbox | Add tax to bills |
| `taxMode` | select | Tax type Percentage (%) Fixed rupees per order (₹); Choices: Percentage (%) [percent], Fixed rupees per order (₹) [fixed] |
| `taxValue` | number | Tax rate / amount; min=0; max=100000; step=0.01 |
| `newCategoryName` | input | Category name; maxlength=60 |
| `notificationRetentionMinutes` | number | Notifications (minutes); min=1; max=10080; step=1 |
| `requestRetentionMinutes` | number | Requests list (minutes); min=1; max=10080; step=1 |
| `currentRetentionMinutes` | number | Order status / current orders (minutes); min=1; max=10080; step=1 |
| `historyRetentionMinutes` | number | Order history (minutes); min=1; max=10080; step=1 |
| `footerShowCredit` | checkbox | Show “This system is made by SHOI SYSTEMS” |
| `footerShowLink` | checkbox | Show “Click here” link |
| `footerRedirectUrl` | url | Click here destination URL; maxlength=2048 |
| `reviewUrlInput` | url | Google review link; maxlength=2048 |
| `pricingDishName` | input | Dish name; maxlength=120 |
| `pricingCategory` | select | Category; Choices:  |
| `pricingDescription` | textarea | Description; maxlength=1000 |
| `pricingVeg` | checkbox | Vegetarian |
| `pricingUseSizes` | checkbox | Offer portion sizes |
| `pricingBasePrice` | number | Single price (₹); min=0; max=100000; step=0.01 |
| `adminResetConfirm` | input | Type the exact confirmation phrase shown above |
| `staffCallTable` | select | Location; Choices:  |
| `newItemName` | input | Item name; maxlength=120 |
| `newItemPrice` | number | Price; min=0; step=0.01 |
| `newItemVeg` | checkbox | Vegetarian |
| `newItemCategory` | select | Category; Choices: Starters [Starters], Main Course [Main Course], Breads & Rice [Breads & Rice], Drinks [Drinks], Desserts [Desserts] |
| `newItemDesc` | textarea | Description; maxlength=1000 |
| `newItemPhoto` | file | Item photo (optional); accept=image/jpeg,image/png,image/webp |
| `editItemPhoto` | file | Choose an item photo; accept=image/jpeg,image/png,image/webp |
| `waiterLink` | input | Waiter dashboard link |
| `dishSalesResetConfirm` | input | Type RESET DISH SALES |
| `analyticsResetConfirm` | input | Type RESET ANALYTICS |

### waiter.html

| Field ID/name | Type | Label / choices / limits |
|---|---|---|

## Appendix B. Website RPC call map

Literal RPC names referenced by the website are listed below. A reference is not proof of a visible screen or enabled permission; dormant Cloud helpers are included. Dynamically selected RPC names may not appear in this literal-only extraction.

| Source module | Literal RPC references |
|---|---|
| `admin-controls.js` | `restaurant_categories`, `restaurant_commerce_settings`, `restaurant_footer_settings` |
| `background-alerts.js` | `disable`, `enable`, `restaurant_push_device`, `restaurant_push_diagnostics` |
| `call-requests.js` | `restaurant_requests` |
| `cloud.js` | `restaurant_customer_menu`, `restaurant_records`, `restaurant_staff_menu` |
| `customer-waiter.js` | `restaurant_customer_call`, `restaurant_waiter_call_status` |
| `customer.js` | `restaurant_cancel_order`, `restaurant_customer_commerce`, `restaurant_get_device_orders`, `restaurant_place_order_v13` |
| `device-management.js` | `restaurant_admin_devices`, `restaurant_manager_permissions`, `restaurant_retention_settings` |
| `dish-sales.js` | `restaurant_dish_sales`, `restaurant_reset_dish_sales` |
| `kitchen.js` | `restaurant_filtered_records`, `restaurant_manage_tables`, `restaurant_manager_menu_flags`, `restaurant_manager_price`, `restaurant_menu_customize`, `restaurant_review_settings`, `restaurant_staff_call`, `restaurant_staff_status`, `restaurant_waiter_link` |
| `monthly-loyalty.js` | `restaurant_order_loyalty` |
| `operations-analytics.js` | `restaurant_recent_cancelled`, `restaurant_reset_analytics`, `restaurant_sales_analytics` |
| `reviews.js` | `restaurant_review_settings` |
| `security-controls.js` | `restaurant_activity_settings`, `restaurant_admin_reset`, `restaurant_manager_permissions`, `restaurant_notification_device`, `restaurant_notifications`, `restaurant_order_devices` |
| `staff-auth.js` | `restaurant_admin_auth_status` |
| `staff-extras.js` | `restaurant_alert_settings`, `restaurant_menu_layout`, `restaurant_stock_alerts`, `restaurant_undo_staff_action` |
| `stocks.js` | `restaurant_set_stock`, `restaurant_set_stock_loop`, `restaurant_stocks` |
| `table-access.js` | `restaurant_open_device_visit` |
| `tables.js` | `restaurant_manage_tables` |
| `waiter-access.js` | `restaurant_waiter_permissions` |
| `waiter.js` | `restaurant_waiter_orders`, `restaurant_waiter_status` |
| `yummy-billing.js` | `restaurant_manual_menu`, `restaurant_manual_order` |
| `yummy-contact.js` | `restaurant_contact` |
| `yummy-stocks-settings.js` | `restaurant_stock_visibility` |

## Appendix C. File-by-file archive inventory

Each original file is listed, including old release references and optional setup. Duplicates and historical files are not separate active features.

| Relative file | Bytes |
|---|---:|
| `ADMIN-AUTHENTICATOR-SETUP.txt` | 6420 |
| `CUSTOM-AUDIO/READ-ME.txt` | 3491 |
| `CUSTOM-AUDIO/VOICE-PACK-SAMPLE.json` | 99384 |
| `LEGACY-REFERENCE/RELEASE-33-QUICK-GUIDE.txt` | 1789 |
| `LEGACY-REFERENCE/RELEASE-34-QUICK-GUIDE.txt` | 932 |
| `LEGACY-REFERENCE/RELEASE-35-QUICK-GUIDE.txt` | 828 |
| `LEGACY-REFERENCE/REQUEST-ALERTS-BEFORE-38.txt` | 8598 |
| `LEGACY-REFERENCE/START-HERE-RELEASE34.txt` | 7038 |
| `LEGACY-REFERENCE/START-HERE-RELEASE35.txt` | 6330 |
| `LEGACY-REFERENCE/START-HERE-RELEASE40.txt` | 1704 |
| `LEGACY-REFERENCE/START-HERE.txt` | 49810 |
| `LEGACY-REFERENCE/TEST-RESULTS-RELEASE34.txt` | 4567 |
| `LEGACY-REFERENCE/TEST-RESULTS-RELEASE35.txt` | 5489 |
| `LEGACY-REFERENCE/TEST-RESULTS.txt` | 2429 |
| `OWNER-OPTIONAL/FRESH-SETUP.txt` | 1392 |
| `OWNER-OPTIONAL/NEW-EMPTY-PROJECT-ONLY.sql` | 401797 |
| `OWNER-OPTIONAL/PUSH/02-enable-delivery.sql` | 2797 |
| `OWNER-OPTIONAL/PUSH/README.txt` | 3967 |
| `OWNER-OPTIONAL/PUSH/config.toml` | 119 |
| `OWNER-OPTIONAL/PUSH/restaurant-push.ts` | 3753 |
| `OWNER-OPTIONAL/generate-push-keys.html` | 5757 |
| `QA/README.txt` | 472 |
| `QA/database-results.json` | 1216 |
| `QA/database.cjs` | 12948 |
| `QA/features-results.json` | 2383 |
| `QA/features.cjs` | 15974 |
| `QA/new-features.cjs` | 16464 |
| `QA/new-results.json` | 5568 |
| `QA/regression.cjs` | 13470 |
| `QA/results.json` | 11802 |
| `QA/sender-results.json` | 444 |
| `QA/sender.cjs` | 4773 |
| `REQUEST-ALERTS-READ-FIRST.txt` | 391 |
| `START-HERE-RELEASE39.txt` | 7826 |
| `START-HERE-RELEASE42.txt` | 1425 |
| `START-HERE-RELEASE43.txt` | 357 |
| `START-HERE-RELEASE44.txt` | 338 |
| `START-HERE.txt` | 338 |
| `SUPABASE/FIX-CURRENT-INSTALL.sql` | 301042 |
| `SUPABASE/SET-MANAGER-ROLE.sql` | 982 |
| `SUPABASE/UPDATE-26.sql` | 2901 |
| `SUPABASE/UPDATE-29.sql` | 6489 |
| `SUPABASE/UPDATE-31.sql` | 11953 |
| `SUPABASE/UPDATE-32.sql` | 10713 |
| `SUPABASE/UPGRADE-EXISTING-PROJECT.sql` | 301042 |
| `SUPABASE/YUMMY-MOMO-34.sql` | 10579 |
| `SUPABASE/YUMMY-MOMO-35.sql` | 15552 |
| `SUPABASE/YUMMY-MOMO-36.sql` | 29743 |
| `SUPABASE/YUMMY-MOMO-38.sql` | 799 |
| `SUPABASE/YUMMY-MOMO-39.sql` | 22048 |
| `SUPABASE/YUMMY-MOMO-43.sql` | 7094 |
| `SUPABASE/YUMMY-MOMO-44.sql` | 7283 |
| `TEST-RESULTS-RELEASE40.txt` | 954 |
| `TEST-RESULTS-RELEASE41.txt` | 257 |
| `TEST-RESULTS-RELEASE42.txt` | 1475 |
| `TEST-RESULTS-RELEASE43.txt` | 630 |
| `TEST-RESULTS-RELEASE44.txt` | 537 |
| `TEST-RESULTS.txt` | 537 |
| `WEBSITE/admin-controls.js` | 7047 |
| `WEBSITE/alert-audio.js` | 8053 |
| `WEBSITE/alert-device.js` | 1078 |
| `WEBSITE/analytics.css` | 5320 |
| `WEBSITE/background-alerts.js` | 11266 |
| `WEBSITE/call-requests.css` | 2314 |
| `WEBSITE/call-requests.js` | 4193 |
| `WEBSITE/cloud.js` | 7868 |
| `WEBSITE/config.js` | 715 |
| `WEBSITE/counter-female1.mp3` | 11891 |
| `WEBSITE/counter-female2.mp3` | 12019 |
| `WEBSITE/counter-male1.mp3` | 15191 |
| `WEBSITE/counter-male2.mp3` | 16183 |
| `WEBSITE/customer-waiter.js` | 4104 |
| `WEBSITE/customer.js` | 36012 |
| `WEBSITE/dark-theme.css` | 41454 |
| `WEBSITE/device-layouts.css` | 18359 |
| `WEBSITE/device-management.js` | 8894 |
| `WEBSITE/dish-sales.js` | 6485 |
| `WEBSITE/icons.svg` | 4318 |
| `WEBSITE/index.html` | 33219 |
| `WEBSITE/kitchen-ops.js` | 3526 |
| `WEBSITE/kitchen.html` | 73339 |
| `WEBSITE/kitchen.js` | 43882 |
| `WEBSITE/menu-customization.css` | 2221 |
| `WEBSITE/menu-experience.js` | 2881 |
| `WEBSITE/menu-hero.webp` | 99612 |
| `WEBSITE/menu-options.js` | 414 |
| `WEBSITE/menu-theme.css` | 21820 |
| `WEBSITE/monthly-loyalty.js` | 922 |
| `WEBSITE/operations-analytics.js` | 12682 |
| `WEBSITE/order-celebration.css` | 2952 |
| `WEBSITE/order-celebration.js` | 1814 |
| `WEBSITE/order-empty-dark.svg` | 395 |
| `WEBSITE/order-empty.svg` | 395 |
| `WEBSITE/push-config.js` | 171 |
| `WEBSITE/qr.js` | 56696 |
| `WEBSITE/receipt-logo.png` | 35862 |
| `WEBSITE/release38.css` | 1774 |
| `WEBSITE/release39.css` | 1191 |
| `WEBSITE/release42.css` | 7381 |
| `WEBSITE/release43.css` | 4638 |
| `WEBSITE/request-ring.css` | 1054 |
| `WEBSITE/request-ring.js` | 6929 |
| `WEBSITE/reviews.js` | 2942 |
| `WEBSITE/security-controls.js` | 13015 |
| `WEBSITE/staff-auth.js` | 6216 |
| `WEBSITE/staff-extras.js` | 19739 |
| `WEBSITE/stocks.js` | 12470 |
| `WEBSITE/sw.js` | 2461 |
| `WEBSITE/table-access.js` | 4219 |
| `WEBSITE/tables.css` | 703 |
| `WEBSITE/tables.js` | 4995 |
| `WEBSITE/vercel.json` | 191 |
| `WEBSITE/voice-female1.mp3` | 76947 |
| `WEBSITE/voice-female2.mp3` | 75902 |
| `WEBSITE/voice-male1.mp3` | 73812 |
| `WEBSITE/voice-male2.mp3` | 71096 |
| `WEBSITE/voice-packs.json` | 2880 |
| `WEBSITE/waiter-access.js` | 1280 |
| `WEBSITE/waiter.css` | 4555 |
| `WEBSITE/waiter.html` | 4836 |
| `WEBSITE/waiter.js` | 7753 |
| `WEBSITE/yaar-theme.css` | 40921 |
| `WEBSITE/yummy-billing.js` | 11656 |
| `WEBSITE/yummy-contact.js` | 2737 |
| `WEBSITE/yummy-crop.js` | 3836 |
| `WEBSITE/yummy-momo-logo.webp` | 99612 |
| `WEBSITE/yummy-momo.css` | 8842 |
| `WEBSITE/yummy-receipt.js` | 1950 |
| `WEBSITE/yummy-stocks-settings.js` | 1563 |

## Appendix D. Independent static-check results

```json
{
  "javascript_files_checked": 36,
  "syntax_failures": [],
  "html_files": 3,
  "missing_static_assets": [],
  "duplicate_html_ids": [],
  "archive_file_count": 129
}
```

## Appendix E. Google reviews, exact timers and remaining configuration details

### Google review flow

- Administrator saves/clears a Google review URL; client/backend validate Google-related HTTPS links rather than accepting an arbitrary executable scheme.
- Config `googleReviewUrl` is a fallback when loading shared settings fails.
- Following a confirmed order that is not Cancelled/Rejected, the customer code queues a review prompt for roughly five seconds later; it does **not** wait until Served or until the diner has actually eaten.
- Prompt says an honest review is optional and any rating is welcome. Buttons: Open Google reviews and Maybe later.
- Once-per-order prompt markers and pending prompt queue live in browser storage; reopening/visibility changes can resume due prompts while table access remains valid.
- Pending prompt TTL is three hours; pending entries limited to the most recent 20.
- If no valid review URL exists, the external-link action is hidden and a missing-link message is shown. Some older documentation says blank disables the prompt; current code can still show the no-link dialog, so blank is not guaranteed to suppress the entire modal.
- No embedded Google review ingestion, star-rating dashboard, forced five-star flow, reward or review-posting API.

### Timer/limit reference

| Rule | Source value / meaning |
|---|---|
| Table visit | One hour; renew by valid QR rescan |
| Customer cancel deadline | One minute from creation; before cooking |
| Pending order automatic expiry | 24 hours; Pending only |
| Cancelled live-card window | Six hours; not order deletion |
| Rejected undo-card window | Four minutes from server action time |
| Snooze | Two minutes, per browser |
| Foreground repeating ring | Around two seconds while visible/eligible; not guaranteed background cadence |
| Call cooldown | 30 seconds |
| Reserved scan dedupe | Existing Pending event or recent five-minute event suppresses duplicate generation |
| Blocked scan grouping | Five minutes per browser/table; first-event retention not extended |
| Pending request expiration | Lesser of configured request-list minutes and 30 minutes |
| Default request-list visibility | 120 minutes |
| Default notification activity retention | 1,440 minutes |
| Default customer current/history | 120 / 180 minutes |
| Configurable retention bounds | Whole minutes 1–10,080 (seven days); history ≥ current |
| Customer/kitchen visible polling | Normally five seconds |
| Waiter visible polling | Three seconds |
| Kitchen summary and analytics refresh throttle | Normally 30 seconds |
| Device list refresh while open | 15 seconds |
| Manager device-access recheck | Five seconds while visible |
| Cloud HTTP timeout | 15 seconds |
| Temporary cloud retry | Up to three attempts, short exponential backoff, for selected staff fetches |
| Push event expiry | Ten minutes; attempt cap and lease apply |
| Push lease | Three minutes |
| Edge send timeout | Five seconds per target |
| Edge workers | Up to ten concurrent per job; current batching comments specify up to five events × 30 targets |
| Review queue delay / TTL | About five seconds / three hours |
| Customer cart | 1–50 distinct item/size lines; quantity 1–50 each |
| Pending cap | Two Pending QR orders per saved browser device |
| Dishes / portions | Up to 20 portion entries per dish |
| Portion label | 1–40 characters, unique case-insensitively per dish |
| Dish name / description | 120 / 1,000 characters |
| Customer name / kitchen notes | 80 / 1,000 characters |
| Category name | 1–60 trimmed characters; reserved shortcut names excluded |
| Stock count/loop quantity | 0–1,000,000, whole units |
| Selling prices | 0–100,000, at most two decimals |
| Low-stock trigger | Deduction to ≤5% of positive generation baseline |
| Default report/device/request page | 50 rows; some backend RPCs permit larger capped pages |

### Storage distinctions

- Supabase: authoritative menu, categories, tables/QR keys, orders/snapshots, inventory/reservations/loops, shared settings, staff roles, device profiles, request/read state, push subscription queue and report-reset information.
- Customer localStorage: random device identity/token, receipt list/private receipt tokens, uncertain order identity, call receipts/cooldown and review markers. This is not an encrypted independent backup.
- Customer sessionStorage: scan visit credentials and celebration markers.
- Staff sessionStorage: authentication session, uncertain manual bill state, Undo receipts and last-sync information.
- Browser preferences/localStorage: dark/light for staff/waiter, desired wake state, audio/mute/voice choices, per-device dismissed/snoozed alerts and notification seen markers.
- IndexedDB: uploaded custom sound/voice assets. Clearing browser data removes them.
- Database monthly badge is derived from retained orders rather than trusting a client-side loyalty counter.

### Out-of-the-box fallback categories

`All`, `Steamed Momos`, `Fried Momos`, `Kurkure Momos`, `Tandoori Momos`, `Chutney & Dips`, `Drinks`, `Desserts`. Database-managed names/order supersede startup fallback values.
