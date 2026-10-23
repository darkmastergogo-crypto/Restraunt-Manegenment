import fs from "node:fs";
import { FEATURES, FIELD_GROUPS, DEFAULTS, human } from "../shared/schema.mjs";
import { TEXTS } from "../public/texts.mjs";
const notes = {
  menu: "Public menu projection and permission gate.",
  search: "Client-side text filter.",
  categories: "Public category filter; admin categories edited separately.",
  diet: "Vegetarian/non-vegetarian filter.",
  photos:
    "HTTPS or PNG/JPEG/WebP data URL display; dish editor accepts a URL, not the original crop/upload workflow.",
  portions:
    "Stable portion IDs, labels and prices; JSON editor. When disabled, portioned dishes are withheld publicly.",
  recommended: "Dish flag, badge and filter.",
  bestSellers: "Dish flag, badge and filter.",
  cart: "QR checkout, quantity controls, subtotal and server validation.",
  notes: "Free-text kitchen instructions.",
  noteChips: "Three registered, editable instruction chips.",
  customerName: "Optional customer name; server snapshot.",
  tax: "Percent/fixed tax computed on server; currency formatting is configurable, not a full multi-jurisdiction tax engine.",
  tracking:
    "Manual order-status dialog with retained customer orders; idle menu polling is not a live tracking timeline.",
  history:
    "Saved-browser history within configured retention, in the same status dialog.",
  cancel:
    "Pending cancellation inside configured time window, with stock restore.",
  callWaiter:
    "Customer assistance and staff counter calls; requires valid visit for customer.",
  music:
    "New menu request form, cooldown/cap and server-side deny when disabled.",
  reviews:
    "Served-order review link in customer history after configured delay; not the original automated, multi-stage review prompt.",
  footer: "Public menu footer.",
  credit: "Configurable developer credit text.",
  footerLink: "Configurable HTTPS footer button.",
  orders: "Kitchen cards, status filters and idle polling, not realtime.",
  accept: "Pending → Cooking.",
  reject: "Pending → Rejected with optional reason and stock restore.",
  serve: "Cooking/Ready → Served.",
  undo: "Token- and actor-specific undo of acceptance/rejection, guarded by stock generation.",
  billing:
    "Manual Counter bill with Cash/Online record; no takeaway/table mode selector or payment processing.",
  payment:
    "Receipt payment-method label visibility; the manual payment selection remains required.",
  receipts:
    "Current-brand receipt preview using immutable order price/tax snapshots.",
  print:
    "Browser print with 58/80 mm maximum content width; real printer acceptance pending.",
  records:
    "Day/month/all filters, status filters, paging and receipt access; simplified compared with the original.",
  csv: "Filtered order summary CSV; no original dish/stock-specific export formats.",
  dishSales:
    "Separate all-current-epoch dish quantity/revenue tab, independently reset baseline.",
  analytics:
    "Served-sales summary plus tabular breakdowns; no original chart-rich dashboard or period-comparison tool.",
  trend: "Daily totals table, not the original interactive trend chart.",
  outcomes: "Order-status counts table.",
  weekdays: "Served revenue by weekday.",
  dishPerformance: "Dish revenue table.",
  categorySales: "Item subtotal revenue by saved category.",
  sizeSales: "Item subtotal revenue by saved portion.",
  tablePerformance: "Served bill totals by table.",
  hourSales: "Served bill totals by local hour.",
  recentOrders: "Up to six recent served-order cards.",
  requests: "Shared same-tenant request board; simplified lifecycle filters.",
  waiterCalls:
    "Assistance submission/handling gate; owner denial is server-checked.",
  reservedAlerts:
    "Deduplicated reserved-table scan alert; reserved tables cannot order.",
  musicQueue:
    "Kitchen music handling: Playing / Played / Rejected. No integrated player.",
  tables: "T1–T9999 management, available/reserved, remove/reactivate.",
  qr: "Copyable URL, downloadable SVG QR, table link rotation.",
  devices:
    "Saved-browser profiles, last seen, order count and basic list; no original advanced filtering/paging.",
  blocking: "Saved-browser block/unblock, not a permanent person/device ban.",
  securityAlerts: "Deduplicated blocked-scan notices; optional private Android push.",
  loyalty:
    "Current-month distinct ordering-day badge from currently retained epoch data; no CRM or lifetime program.",
  stocks:
    "Tracked/untracked counts, per-portion reservations/restores and selling-price valuation; no original filter/sort/export suite.",
  stockSummary: "Remaining-unit count and value at selling price.",
  stockChart:
    "Relative unit share bars, not the original complete stock chart.",
  stockLoops:
    "Lazy and private-scheduled 24-hour count replacement; no local-midnight schedule.",
  lowStock:
    "One stored notice per generation when crossing configured percentage.",
  notifications: "In-app notices and read marker, time-window filtered.",
  menuEditor:
    "Add/delete/admin edit, manager restrictions, prices/flags/sizes/availability.",
  arrangement:
    "Numeric per-dish position; not the original drag-and-drop arrangement.",
  categoryEditor:
    "Newline category list editor; no automatic replacement of categories on existing dishes.",
  contact: "Shared staff contact text popup.",
  waiter:
    "Revocable bearer-link role with configured orders/requests/billing permissions.",
  waiterBilling: "Additional permission for manual waiter billing.",
  alarms:
    "Open-tab oscillator presets; enable by gesture. Poll-based detection.",
  voice:
    "System speech synthesis, not the original four bundled recorded voices/table announcements.",
  customAudio:
    "One uploaded local tone for this tab session; not persisted IndexedDB, no separate per-category uploads or custom voice-pack JSON.",
  push: "Encrypted Web Push for Android Chrome/Firefox. Requires VAPID keys, owner entitlement, opt-in and a private scheduled worker. See ANDROID-PUSH-SETUP.md; real device delivery unverified.",
  themeSwitch:
    "Local fixed alternate light preset; main saved theme tokens configurable. Does not persist across reload.",
  wakeLock:
    "Explicit browser Wake Lock request, support/permission dependent; no automatic re-acquire persistence.",
  resets:
    "Analytics/dish baseline resets and reporting-epoch archival. NOT original permanent records/device deletion.",
};
const partial = new Set(
  "photos portions tracking history reviews orders billing payment receipts print records csv analytics trend dishSales devices loyalty stocks stockChart arrangement categoryEditor alarms voice customAudio themeSwitch wakeLock resets requests".split(
    " ",
  ),
);
let md = `# Feature parity and remaining work\n\nThis is a **new migration beta**, not full Release 44 parity. “Implemented” below means an implementation exists in this source; it does not mean hosted Appwrite behavior or production load has been certified. “Partial/changed” identifies meaningful differences from the supplied audit. The full old audit is in ORIGINAL-RELEASE44-AUDIT.md.\n\n## Must know before replacement\n\n- Main visual structure now reuses the supplied Release 44 CSS; see APPEARANCE-RESTORATION.md. This is not complete pixel parity of every view.\n\n- No automatic Supabase data migration or recorded/custom JSON voice-pack migration. Optional Android push is implemented; server keys and hosted device acceptance are required.\n- No literal arbitrary-layout/theme-builder or custom code execution. Registered text and safe schema values are editable, not every browser-native string, error or pixel.\n- Simplified reports (tables instead of original charts), editors, CSV and retention/reset semantics. No SaaS subscriptions, verified online payments, custom domains, automated account invitations or tenant-deletion workflow.\n- Appwrite setup, end-user session/MFA, live ACL isolation, hosted transaction contention and actual printer output remain unverified. Use HOSTED-ACCEPTANCE.md.\n\n## Feature-by-feature map\n\n| Key | Area | Status | Implemented behavior / difference |\n|---|---|---|---|\n`;
for (let [k, v] of Object.entries(FEATURES))
  md += `| \`${k}\` | ${v} | ${partial.has(k) ? "Partial / changed" : "Implemented in source"} | ${notes[k] || "See source implementation."} |\n`;
md += `\n## Cross-cutting gaps\n\n### Customization scope\n\nThe admin has generated editors for all fields listed in CUSTOMIZATION-CATALOG.md, plus module visibility and registered text overrides. Owner group locks and feature entitlements take priority. Texts are plain text, not injected HTML. “Texts” includes labels and buttons, but not every internal exception/status code, built-in browser file picker/dialog, literal database value, mathematical unit or native printer setting. Hiding a registered label is presentation only. Protected settings/escape controls remain reachable. There is no live WYSIWYG page builder, CSS/script injection, independent alternate-light palette editor or arbitrary receipt block designer.\n\nConfiguration arrays \`order\` and \`sectionOrder\` are reserved in the beta schema and are not used by the UI. Arrangement uses item.position. Do not rely on those arrays as implemented layout controls.\n\n### Retention and historical identity\n\nHistory/Requests/notification durations mostly control visibility, not physical data deletion. The private maintenance job expires pending orders and old visits and applies stock loops. It does not delete old customer profiles, notices or archived orders. Records reset rotates an epoch and requires no active orders; it does not erase old data. Device-list reset is not ported. Receipt item prices/tax are snapshots, but printed branding/contact/footer use current settings.\n\n### Access and scale\n\nMembership rows replace one-Team-per-restaurant. Owners configure features and settings access; admins manage their restaurant. No cross-restaurant bulk dashboard or custom per-user fine-grained policy editor exists. Public access still needs anti-abuse protections. Reports scan current tenant rows with a 20,000-row guard, not large-scale warehouse queries. Read-only staff bootstrap is not a single consistent multi-table snapshot.\n\n### Original UI details not faithfully reproduced\n\nMulti-dialog item sizing UI; original exact sortable/filterable device/stock/report lists; per-device IndexedDB alarms and four voice packs; custom voice-pack upload/download; original foreground browser Notification API; receipt verification service; rich date comparisons/charts; category reassignment workflow; hard-deletion resets; connectivity/chime diagnostics; detailed original custom-note/customer-help wording. Their original definitions remain in the supplied audit for later migration work.\n\n### Dependencies and safe controls\n\nTurning off Requests, Music or Music queue prevents new music requests. Turning off portions withholds portioned dishes from the public menu. Inventory quantities continue to constrain orders when the Stocks administration screen is hidden. The manual payment selector remains required even when receipt payment labels are hidden. Module visibility does not physically delete data.\n`;
fs.writeFileSync("docs/FEATURE-PARITY.md", md);
let c = `# Customization catalog\n\nGenerated from shared/schema.mjs and public/texts.mjs. These are the beta's actual declared settings, not a guarantee of original-app parity. Editable schema fields are in Management; global restaurant creation/listing is in Main admin; per-restaurant protected controls are in Owner controls. See FEATURE-PARITY.md for limitations, particularly reserved arrays, native browser text and light preset.\n\n## Ordinary settings\n\n| Group | Field | Control kind | Default |\n|---|---|---|---|\n`;
const esc = (s) =>
  String(s ?? "")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ");
for (let [g, fields] of Object.entries(FIELD_GROUPS))
  for (let [k, kind] of Object.entries(fields))
    c += `| ${human(g)} | \`${g}.${k}\` | ${kind} | ${esc(JSON.stringify(DEFAULTS[g][k]))} |\n`;
c += `\n## Units, boundaries and effects\n\n- Prices/tax use at most two decimal places. Prices up to 100,000 currency units; percent tax 0–100; fixed tax applies per bill. Brand currency changes formatting, not exchange rates.\n- visitMinutes: QR visit lifetime; currentMinutes/historyMinutes: order visibility windows (history ≥ current); notificationMinutes/requestMinutes: board visibility windows. Whole minutes 1–10,080. Current/history use the combined customer status dialog, not two separate originals.\n- pendingHours: pending expiry, 1–168 hours, applied by the private scheduler. pendingCap: 1–50 pending orders per saved browser.\n- cancelSeconds, callCooldown, musicCooldown, snoozeSeconds and ringSeconds are seconds. Call/music cooldowns ≥1; ringSeconds 1–60. reviewDelay is seconds in this beta, not the original automatic review sequence.\n- cancelledHours is hours; rejectedMinutes is minutes. lowStockPercent is 0–100; loyaltyDays/musicLimit/maxQuantity are whole counts 1–50; maxLines is 1–25 distinct dish/portion lines to fit the transaction guard.\n- Theme colors are six-digit hex. Font: system-ui/Georgia/Arial/Verdana. Radius 0–32 px. Density comfortable/compact. Main dark/base palette only; alternate light palette is fixed.\n- Receipt paper: 58 or 80 mm maximum content width. All show* flags affect preview/print. Name falls back to brand name; blank receipt logo falls back to brand logo. Native printer paper size still needs manual setup.\n- Image URL: HTTPS or PNG/JPEG/WebP data URL. Settings upload input accepts files ≤180 KB. The total serialized row has a 480 KB guard: several uploads can exceed it; use small optimized images or HTTPS URLs. No Appwrite Storage bucket or external image proxy is configured.\n- Music title 160 characters, artist 120; supported link hosts are YouTube/Spotify over HTTPS. No playback.\n- Customer name 80; notes 1,000; registered text overrides up to 2,000 each; images do not accept SVG.\n- categories: up to 60 unique strings, each ≤60 characters; not an automatic reassignment tool for existing dish categories.\n- \`visible\`: module IDs plus ui.TEXT_KEY. Module controls are enforced by applicable server actions; UI controls are presentation only and some protected labels/escape controls are retained. \`texts\`: plain-text overrides. The \`order\`/\`sectionOrder\` arrays are reserved, not active layout editors.\n\n## Owner-only controls\n\nMain admin (/admin) lists restaurants, provisions a restaurant URL/name and generates copyable menu/admin links. Per-restaurant Owner controls set supplied feature booleans; allowed admin customization groups. The platform-owner identity list itself is server environment configuration, not a restaurant setting. Staff members are assigned existing Appwrite user IDs and admin/manager roles. Waiter links are separate revocable bearer capabilities. Secrets, membership checks and tenant isolation cannot be edited into an insecure state by restaurant theme/text changes.\n\n## Registered interface text\n\nThis registry contains ${Object.keys(TEXTS).length} entries, including generated field/feature labels. Dynamic dish/category/portion content is edited in its own menu editor. The registry does not imply every key can be hidden in every context.\n\n| Key | Default plain text |\n|---|---|\n`;
for (let [k, v] of Object.entries(TEXTS).sort())
  c += `| \`${k}\` | ${esc(v)} |\n`;
fs.writeFileSync("docs/CUSTOMIZATION-CATALOG.md", c);
console.log(
  "Generated parity and customization catalogs for " +
    Object.keys(FEATURES).length +
    " capabilities.",
);
