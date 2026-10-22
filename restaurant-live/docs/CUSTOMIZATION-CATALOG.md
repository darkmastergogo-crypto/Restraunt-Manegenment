# Customization catalog

Generated from shared/schema.mjs and public/texts.mjs. These are the beta's actual declared settings, not a guarantee of original-app parity. Editable schema fields are in Management; global restaurant creation/listing is in Main admin; per-restaurant protected controls are in Owner controls. See FEATURE-PARITY.md for limitations, particularly reserved arrays, native browser text and light preset.

## Ordinary settings

| Group | Field | Control kind | Default |
|---|---|---|---|
| Brand | `brand.name` | text | "Your restaurant" |
| Brand | `brand.tagline` | text | "Made fresh. Served with care." |
| Brand | `brand.logo` | image | "" |
| Brand | `brand.favicon` | image | "" |
| Brand | `brand.hero` | image | "" |
| Brand | `brand.currency` | text | "INR" |
| Brand | `brand.locale` | text | "en-IN" |
| Brand | `brand.timezone` | text | "Asia/Kolkata" |
| Theme | `theme.background` | color | "#100e0c" |
| Theme | `theme.surface` | color | "#191511" |
| Theme | `theme.raised` | color | "#201a14" |
| Theme | `theme.text` | color | "#f2e7d3" |
| Theme | `theme.muted` | color | "#b8aa97" |
| Theme | `theme.accent` | color | "#d6b184" |
| Theme | `theme.accentText` | color | "#20150d" |
| Theme | `theme.border` | color | "#655039" |
| Theme | `theme.danger` | color | "#ffb4a5" |
| Theme | `theme.success` | color | "#9cdbb1" |
| Theme | `theme.font` | font | "original" |
| Theme | `theme.radius` | number | 12 |
| Theme | `theme.density` | density | "comfortable" |
| Receipt | `receipt.name` | text | "" |
| Receipt | `receipt.tagline` | text | "Thank you for visiting!" |
| Receipt | `receipt.logo` | image | "" |
| Receipt | `receipt.address` | textarea | "" |
| Receipt | `receipt.phone` | text | "" |
| Receipt | `receipt.taxIdLabel` | text | "GSTIN" |
| Receipt | `receipt.taxId` | text | "" |
| Receipt | `receipt.footer` | textarea | "Thank you. See you again!" |
| Receipt | `receipt.paper` | paper | 80 |
| Receipt | `receipt.showLogo` | boolean | true |
| Receipt | `receipt.showTaxId` | boolean | true |
| Receipt | `receipt.showPayment` | boolean | true |
| Receipt | `receipt.showTable` | boolean | true |
| Receipt | `receipt.showTime` | boolean | true |
| Receipt | `receipt.showNumber` | boolean | true |
| Receipt | `receipt.showItems` | boolean | true |
| Receipt | `receipt.showQuantity` | boolean | true |
| Receipt | `receipt.showRate` | boolean | true |
| Receipt | `receipt.showLineTotal` | boolean | true |
| Receipt | `receipt.showSubtotal` | boolean | true |
| Receipt | `receipt.showTax` | boolean | true |
| Receipt | `receipt.showTotal` | boolean | true |
| Receipt | `receipt.showFooter` | boolean | true |
| Behavior | `behavior.taxEnabled` | boolean | false |
| Behavior | `behavior.taxMode` | taxMode | "percent" |
| Behavior | `behavior.taxValue` | number | 0 |
| Behavior | `behavior.visitMinutes` | number | 60 |
| Behavior | `behavior.cancelSeconds` | number | 60 |
| Behavior | `behavior.pendingCap` | number | 2 |
| Behavior | `behavior.pendingHours` | number | 24 |
| Behavior | `behavior.currentMinutes` | number | 120 |
| Behavior | `behavior.historyMinutes` | number | 180 |
| Behavior | `behavior.notificationMinutes` | number | 1440 |
| Behavior | `behavior.requestMinutes` | number | 120 |
| Behavior | `behavior.callCooldown` | number | 30 |
| Behavior | `behavior.musicCooldown` | number | 60 |
| Behavior | `behavior.musicLimit` | number | 3 |
| Behavior | `behavior.rejectedMinutes` | number | 4 |
| Behavior | `behavior.cancelledHours` | number | 6 |
| Behavior | `behavior.lowStockPercent` | number | 5 |
| Behavior | `behavior.loyaltyDays` | number | 4 |
| Behavior | `behavior.snoozeSeconds` | number | 120 |
| Behavior | `behavior.ringSeconds` | number | 2 |
| Behavior | `behavior.reviewDelay` | number | 5 |
| Behavior | `behavior.maxQuantity` | number | 50 |
| Behavior | `behavior.maxLines` | number | 25 |
| Contact | `contact.name` | text | "" |
| Contact | `contact.phone` | text | "" |
| Contact | `contact.details` | textarea | "" |
| Links | `links.review` | url | "" |
| Links | `links.footer` | url | "" |
| Links | `links.credit` | text | "Powered by SHOI SYSTEMS" |
| Waiter | `waiter.enabled` | boolean | true |
| Waiter | `waiter.viewOrders` | boolean | true |
| Waiter | `waiter.accept` | boolean | true |
| Waiter | `waiter.serve` | boolean | true |
| Waiter | `waiter.viewRequests` | boolean | true |
| Waiter | `waiter.handle` | boolean | true |
| Waiter | `waiter.alerts` | boolean | true |
| Waiter | `waiter.billing` | boolean | false |
| Manager | `manager.devices` | boolean | false |
| Manager | `manager.blocking` | boolean | false |
| Audio | `audio.orders` | tone | "chime" |
| Audio | `audio.requests` | tone | "doorbell" |
| Audio | `audio.notifications` | tone | "bell" |
| Audio | `audio.voice` | boolean | true |

## Units, boundaries and effects

- Prices/tax use at most two decimal places. Prices up to 100,000 currency units; percent tax 0–100; fixed tax applies per bill. Brand currency changes formatting, not exchange rates.
- visitMinutes: QR visit lifetime; currentMinutes/historyMinutes: order visibility windows (history ≥ current); notificationMinutes/requestMinutes: board visibility windows. Whole minutes 1–10,080. Current/history use the combined customer status dialog, not two separate originals.
- pendingHours: pending expiry, 1–168 hours, applied by the private scheduler. pendingCap: 1–50 pending orders per saved browser.
- cancelSeconds, callCooldown, musicCooldown, snoozeSeconds and ringSeconds are seconds. Call/music cooldowns ≥1; ringSeconds 1–60. reviewDelay is seconds in this beta, not the original automatic review sequence.
- cancelledHours is hours; rejectedMinutes is minutes. lowStockPercent is 0–100; loyaltyDays/musicLimit/maxQuantity are whole counts 1–50; maxLines is 1–25 distinct dish/portion lines to fit the transaction guard.
- Theme colors are six-digit hex. Font: system-ui/Georgia/Arial/Verdana. Radius 0–32 px. Density comfortable/compact. Main dark/base palette only; alternate light palette is fixed.
- Receipt paper: 58 or 80 mm maximum content width. All show* flags affect preview/print. Name falls back to brand name; blank receipt logo falls back to brand logo. Native printer paper size still needs manual setup.
- Image URL: HTTPS or PNG/JPEG/WebP data URL. Settings upload input accepts files ≤180 KB. The total serialized row has a 480 KB guard: several uploads can exceed it; use small optimized images or HTTPS URLs. No Appwrite Storage bucket or external image proxy is configured.
- Music title 160 characters, artist 120; supported link hosts are YouTube/Spotify over HTTPS. No playback.
- Customer name 80; notes 1,000; registered text overrides up to 2,000 each; images do not accept SVG.
- categories: up to 60 unique strings, each ≤60 characters; not an automatic reassignment tool for existing dish categories.
- `visible`: module IDs plus ui.TEXT_KEY. Module controls are enforced by applicable server actions; UI controls are presentation only and some protected labels/escape controls are retained. `texts`: plain-text overrides. The `order`/`sectionOrder` arrays are reserved, not active layout editors.

## Owner-only controls

Main admin (/admin) lists restaurants, provisions a restaurant URL/name and generates copyable menu/admin links. Per-restaurant Owner controls set supplied feature booleans; allowed admin customization groups. The platform-owner identity list itself is server environment configuration, not a restaurant setting. Staff members are assigned existing Appwrite user IDs and admin/manager roles. Waiter links are separate revocable bearer capabilities. Secrets, membership checks and tenant isolation cannot be edited into an insecure state by restaurant theme/text changes.

## Registered interface text

This registry contains 491 entries, including generated field/feature labels. Dynamic dish/category/portion content is edited in its own menu editor. The registry does not imply every key can be hidden in every context.

| Key | Default plain text |
|---|---|
| `app.title` | Restaurant |
| `audio.announcement` | New restaurant activity |
| `audio.custom` | Custom audio / voice |
| `audio.default` | Default |
| `audio.enable` | Enable sounds |
| `audio.enabled` | Sound enabled for this open tab. |
| `audio.failed` | Audio is not available in this browser. |
| `audio.muted` | Muted |
| `audio.orderEnable` | Enable order sound |
| `audio.requestMute` | Call sound on · mute |
| `audio.setup` | Alert setup / test |
| `audio.snoozed` | Alerts snoozed. |
| `audio.test` | Volume test |
| `audio.unmuted` | Unmuted |
| `audio.upload` | Local audio file, this browser only |
| `audio.voice` | System voice |
| `audio.voiceOff` | Voice alerts off |
| `audio.voiceOn` | Voice alerts on |
| `audio.voiceToggle` | Enable voice alerts |
| `auth.authenticator` | Authenticator options |
| `auth.code` | Authenticator code |
| `auth.email` | Email |
| `auth.explain` | Use your Appwrite staff account. Admins require an authenticator. |
| `auth.password` | Password |
| `auth.secretHelp` | Add this secret to your authenticator app, then enter the generated code. Keep it private. |
| `auth.setup` | Set up authenticator |
| `auth.signIn` | Sign in |
| `auth.signOut` | Sign out |
| `auth.signedIn` | Signed in |
| `auth.title` | Staff sign-in |
| `auth.verify` | Verify authenticator |
| `bill.number` | Bill no. |
| `bill.print` | Print receipt |
| `bill.subtotal` | Items Subtotal |
| `bill.tax` | Tax |
| `bill.time` | Time |
| `bill.total` | Total to Pay |
| `billing.choose` | Select payment |
| `billing.done` | Done |
| `billing.payment` | Paid through |
| `billing.title` | New bill |
| `brand.name` | Restaurant name |
| `cart.add` | ADD |
| `cart.clear` | Clear |
| `cart.empty` | Add something delicious from the menu. |
| `cart.extras` | Extras may cost more. Confirm with staff. |
| `cart.items` | ITEMS |
| `cart.minus` | − |
| `cart.name` | Your Name (Optional) |
| `cart.namePlaceholder` | Enter your name (optional) |
| `cart.notes` | Special Instructions for Kitchen |
| `cart.place` | Place Order |
| `cart.plus` | + |
| `cart.title` | Your order |
| `cart.view` | View Order |
| `category.all` | All |
| `category.best` | Best Sellers |
| `category.recommended` | Recommended |
| `common.close` | Close |
| `common.copied` | Copied. |
| `common.copy` | Copy |
| `common.next` | Next |
| `common.previous` | Previous |
| `common.refresh` | Refresh |
| `common.save` | Save |
| `common.theme` | Use light theme |
| `connection.failed` | Connection interrupted. Showing the last received data. |
| `connection.guide` | Finish Appwrite setup using the included README. This project does not silently switch to demo data. |
| `connection.live` | Live |
| `connection.setup` | Connection needs attention |
| `connection.sync` | Last successful sync |
| `contact.open` | Contact us |
| `customer.call` | Call waiter |
| `customer.music` | Request music |
| `customer.status` | Order status |
| `device.allowed` | Allowed |
| `device.awake` | Keep screen awake |
| `device.awakeEnabled` | Screen wake lock requested. |
| `device.block` | Block device |
| `device.blocked` | Blocked |
| `device.confirm` | Change this browser’s access? |
| `device.denied` | This browser has been blocked by restaurant staff. |
| `device.empty` | No saved customer browsers. |
| `device.lastSeen` | Last seen |
| `device.orders` | Orders |
| `device.unblock` | Unblock device |
| `diet.all` | All dishes |
| `diet.nonveg` | Non-vegetarian |
| `diet.veg` | Vegetarian |
| `feature.accept` | Accept orders |
| `feature.alarms` | Foreground alarms |
| `feature.analytics` | Sales analytics |
| `feature.arrangement` | Menu arrangement |
| `feature.bestSellers` | Best sellers |
| `feature.billing` | Manual billing |
| `feature.blocking` | Device blocking |
| `feature.callWaiter` | Call waiter |
| `feature.cancel` | Customer cancellation |
| `feature.cart` | Cart and checkout |
| `feature.categories` | Category filters |
| `feature.categoryEditor` | Category management |
| `feature.categorySales` | Category sales |
| `feature.contact` | Staff contact details |
| `feature.credit` | Developer credit |
| `feature.csv` | CSV exports |
| `feature.customAudio` | Local custom audio |
| `feature.customerName` | Customer name |
| `feature.devices` | Customer devices |
| `feature.diet` | Dietary filters |
| `feature.dishPerformance` | Dish performance |
| `feature.dishSales` | Dish sales |
| `feature.footer` | Menu footer |
| `feature.footerLink` | Developer link |
| `feature.history` | Customer history |
| `feature.hourSales` | Hourly sales |
| `feature.lowStock` | Low-stock alerts |
| `feature.loyalty` | Monthly regular badges |
| `feature.menu` | Customer menu |
| `feature.menuEditor` | Menu management |
| `feature.music` | Request music |
| `feature.musicQueue` | Music queue in Requests |
| `feature.noteChips` | Quick instruction chips |
| `feature.notes` | Kitchen instructions |
| `feature.notifications` | Notifications |
| `feature.orders` | Kitchen orders |
| `feature.outcomes` | Order outcomes |
| `feature.payment` | Payment labels |
| `feature.photos` | Dish photographs |
| `feature.portions` | Custom portions |
| `feature.print` | Receipt printing |
| `feature.push` | Background push |
| `feature.qr` | Table QR codes |
| `feature.receipts` | Receipt preview |
| `feature.recentOrders` | Recent orders |
| `feature.recommended` | Recommended dishes |
| `feature.records` | Order records |
| `feature.reject` | Reject orders |
| `feature.requests` | Requests board |
| `feature.reservedAlerts` | Reserved-table alerts |
| `feature.resets` | Reporting resets |
| `feature.reviews` | Google review prompt |
| `feature.search` | Menu search |
| `feature.securityAlerts` | Blocked-browser alerts |
| `feature.serve` | Mark served |
| `feature.sizeSales` | Size sales |
| `feature.stockChart` | Stock distribution |
| `feature.stockLoops` | 24-hour stock loops |
| `feature.stockSummary` | Stock summary |
| `feature.stocks` | Stock tracking |
| `feature.tablePerformance` | Table performance |
| `feature.tables` | Table management |
| `feature.tax` | Bill tax |
| `feature.themeSwitch` | Theme switch |
| `feature.tracking` | Order tracking |
| `feature.trend` | Sales trend |
| `feature.undo` | Undo staff action |
| `feature.voice` | Voice announcements |
| `feature.waiter` | Private waiter screen |
| `feature.waiterBilling` | Waiter manual billing |
| `feature.waiterCalls` | Assistance requests |
| `feature.wakeLock` | Keep screen awake |
| `feature.weekdays` | Weekday sales |
| `filter.All` | All |
| `filter.Cancelled` | Cancelled |
| `filter.Expired` | Expired |
| `filter.Handled` | Handled |
| `filter.Music` | Music |
| `filter.Pending` | Pending |
| `footer.link` | Click here |
| `history.empty` | No recent orders on this browser. |
| `image.limit` | Image must be PNG/JPEG/WebP under 180 KB. |
| `item.category` | Category |
| `item.description` | Description |
| `item.image` | Image HTTPS URL |
| `item.name` | Dish name |
| `item.position` | Sort position |
| `item.price` | Base price |
| `loyalty.regular` | Monthly regular |
| `menu.add` | Add dish |
| `menu.arrange` | Categories & arrangement |
| `menu.available` | Available |
| `menu.bestSeller` | Best seller |
| `menu.categoriesHeading` | Categories |
| `menu.categoriesHelp` | Categories, one per line. Dish sort positions control arrangement. |
| `menu.category` | Category |
| `menu.confirmDelete` | Delete this dish? |
| `menu.delete` | Delete dish |
| `menu.diet` | Dietary filter |
| `menu.edit` | Edit / prices / sizes |
| `menu.empty` | No dishes match these filters. |
| `menu.eyebrow` | FRESH INGREDIENTS · BOLD FLAVORS |
| `menu.headline` | Our Menu |
| `menu.listDescription` | Find your next favourite. |
| `menu.listTitle` | Our menu |
| `menu.recommended` | Recommended |
| `menu.search` | Search menu |
| `menu.searchPlaceholder` | Search dishes, drinks, desserts... |
| `menu.soldOut` | Sold out |
| `menu.standard` | Standard |
| `menu.subtitle` | Steamed, crispy or spicy — find your favourite momos, dips and delicious bites. |
| `menu.unavailable` | Unavailable |
| `music.artist` | Artist (optional) |
| `music.open` | Open song link |
| `music.title` | Song title |
| `music.url` | YouTube / Spotify link (optional) |
| `nav.analytics` | Dashboard |
| `nav.billing` | Billing |
| `nav.customize` | Management |
| `nav.devices` | Customer devices |
| `nav.dishSales` | Dish Sales |
| `nav.menuEditor` | Menu |
| `nav.notifications` | Notifications |
| `nav.orders` | Pending Orders |
| `nav.platform` | Owner controls |
| `nav.records` | Order Records |
| `nav.requests` | Requests |
| `nav.stocks` | Stocks |
| `nav.tables` | Tables |
| `notes.0` | Less spicy |
| `notes.1` | No onion |
| `notes.2` | Extra cheese |
| `notice.attempts` | attempts |
| `notice.done` | Read |
| `notice.empty` | No notifications. |
| `notice.read` | Mark read |
| `order.accept` | Accept order |
| `order.bill` | Bill |
| `order.cancel` | Cancel order |
| `order.empty` | No orders in this view. |
| `order.number` | Order no. |
| `order.reason` | Reason for rejection |
| `order.reject` | Reject / unavailable |
| `order.retry` | Retry original submission |
| `order.saved` | Order saved |
| `order.serve` | Mark served |
| `order.table` | Table |
| `order.uncertain` | Previous submission needs confirmation. |
| `order.undo` | Undo |
| `owner.adminURL` | Restaurant admin URL |
| `owner.back` | Main admin · all restaurants |
| `owner.copied` | URL copied. |
| `owner.copyAdmin` | Copy admin URL |
| `owner.copyMenu` | Copy menu URL |
| `owner.copyTitle` | Copy this URL |
| `owner.created` | Restaurant created. Its website is being prepared; links appear when Ready. |
| `owner.eyebrow` | PLATFORM OVERVIEW |
| `owner.howURLs` | How restaurant URLs work |
| `owner.intro` | Create restaurants, open their dashboards and manage what each restaurant can use. |
| `owner.matching` | restaurants shown |
| `owner.menuURL` | Customer menu URL |
| `owner.mfaHelp` | After password sign-in, complete authenticator verification. For first-time enrollment, use Authenticator options. |
| `owner.notHosting` | Each managed website uses an automatic Appwrite HTTPS address. Dashboard and kitchen links require authorized staff sign-in. Custom domains are optional and are not registered by this action. |
| `owner.open` | Open restaurant |
| `owner.platformName` | Restaurant Platform |
| `owner.qrHelp` | Next: add dishes, configure this restaurant, then create table QR codes under Tables. |
| `owner.ready` | Your restaurant URLs are ready |
| `owner.role` | Platform owner |
| `owner.search` | Find a restaurant |
| `owner.searchPlaceholder` | Search by restaurant name or URL slug |
| `owner.secure` | Owner access only |
| `owner.shared` | One shared app. Separate restaurant settings and data. |
| `owner.signIn` | Sign in to main admin |
| `owner.signInEyebrow` | YOUR PLATFORM. ALL RESTAURANTS. |
| `owner.signInHelp` | Sign in with your Appwrite platform-owner account to manage all restaurants. Restaurant staff cannot access this workspace. |
| `owner.signInTitle` | Main admin sign-in |
| `owner.switchAccount` | Sign out / switch account |
| `owner.title` | All restaurants |
| `owner.total` | Restaurants added |
| `owner.url` | Website URL |
| `owner.urlHelp` | Enter a restaurant name. Appwrite creates its separate website from the shared codebase. Copy menu, dashboard and kitchen links when the status is Ready. |
| `owner.workspace` | Main admin workspace |
| `page.analytics` | Dashboard |
| `page.billing` | Billing |
| `page.customize` | Management |
| `page.devices` | Customer devices |
| `page.dishSales` | Dish Sales |
| `page.menuEditor` | Menu |
| `page.notifications` | Notifications |
| `page.orders` | Pending Orders |
| `page.platform` | Owner controls |
| `page.records` | Order Records |
| `page.requests` | Requests |
| `page.stocks` | Stocks |
| `page.tables` | Tables |
| `platform.create` | Create restaurant |
| `platform.customization` | Settings groups restaurant admins may edit |
| `platform.entitlements` | Features supplied to this restaurant |
| `platform.explain` | Owner-only controls. Disabled features are denied by the backend, not merely hidden. |
| `platform.save` | Save supplied features |
| `platform.saveAccess` | Save customization access |
| `platform.saved` | Owner permissions saved. |
| `qr.copyFallback` | Copy the link instead. |
| `qr.required` | Scan your table QR before ordering. |
| `receipt.preview` | Receipt preview |
| `records.date` | Date |
| `records.dishes` | Dish Sales |
| `records.export` | Export filtered CSV |
| `records.orders` | Order Records |
| `records.period` | Period |
| `records.results` | matching orders |
| `records.status` | Status |
| `report.average` | Average bill |
| `report.basis` | Revenue includes served orders only. Reports cover the current reporting epoch. |
| `report.categories` | Category revenue |
| `report.dishes` | Dish revenue |
| `report.empty` | No data in this period. |
| `report.hours` | Hourly revenue |
| `report.orders` | Served orders |
| `report.outcomes` | Order outcomes |
| `report.recent` | Recent served orders |
| `report.revenue` | Served revenue |
| `report.sizes` | Portion revenue |
| `report.tables` | Table revenue |
| `report.trend` | Daily sales |
| `report.units` | Dish units sold |
| `report.weekdays` | Weekday sales |
| `request.Handled` | Handled |
| `request.Ontheway` | On the way |
| `request.Played` | Played |
| `request.Playing` | Playing |
| `request.Rejected` | Rejected |
| `request.assistance` | Waiter requested |
| `request.count` | requests |
| `request.empty` | No requests. |
| `request.music` | Music request |
| `request.onWay` | Waiter is on the way |
| `request.reserved` | Reserved table opened |
| `request.sent` | Request sent to the kitchen. |
| `reset.analytics` | Reset Analytics |
| `reset.dishSales` | Reset Dish Sales |
| `reset.records` | Reset Records |
| `review.open` | Leave a review |
| `role.admin` | Admin |
| `role.manager` | Manager |
| `role.owner` | Platform owner |
| `role.waiter` | Waiter |
| `setting.audio.notifications` | Notifications |
| `setting.audio.orders` | Orders |
| `setting.audio.requests` | Requests |
| `setting.audio.voice` | Voice |
| `setting.behavior.callCooldown` | Call Cooldown |
| `setting.behavior.cancelSeconds` | Cancel Seconds |
| `setting.behavior.cancelledHours` | Cancelled Hours |
| `setting.behavior.currentMinutes` | Current Minutes |
| `setting.behavior.historyMinutes` | History Minutes |
| `setting.behavior.lowStockPercent` | Low Stock Percent |
| `setting.behavior.loyaltyDays` | Loyalty Days |
| `setting.behavior.maxLines` | Max Lines |
| `setting.behavior.maxQuantity` | Max Quantity |
| `setting.behavior.musicCooldown` | Music Cooldown |
| `setting.behavior.musicLimit` | Music Limit |
| `setting.behavior.notificationMinutes` | Notification Minutes |
| `setting.behavior.pendingCap` | Pending Cap |
| `setting.behavior.pendingHours` | Pending Hours |
| `setting.behavior.rejectedMinutes` | Rejected Minutes |
| `setting.behavior.requestMinutes` | Request Minutes |
| `setting.behavior.reviewDelay` | Review Delay |
| `setting.behavior.ringSeconds` | Ring Seconds |
| `setting.behavior.snoozeSeconds` | Snooze Seconds |
| `setting.behavior.taxEnabled` | Tax Enabled |
| `setting.behavior.taxMode` | Tax Mode |
| `setting.behavior.taxValue` | Tax Value |
| `setting.behavior.visitMinutes` | Visit Minutes |
| `setting.brand.currency` | Currency |
| `setting.brand.favicon` | Favicon |
| `setting.brand.hero` | Hero |
| `setting.brand.locale` | Locale |
| `setting.brand.logo` | Logo |
| `setting.brand.name` | Name |
| `setting.brand.tagline` | Tagline |
| `setting.brand.timezone` | Timezone |
| `setting.contact.details` | Details |
| `setting.contact.name` | Name |
| `setting.contact.phone` | Phone |
| `setting.links.credit` | Credit |
| `setting.links.footer` | Footer |
| `setting.links.review` | Review |
| `setting.manager.blocking` | Blocking |
| `setting.manager.devices` | Devices |
| `setting.receipt.address` | Address |
| `setting.receipt.footer` | Footer |
| `setting.receipt.logo` | Logo |
| `setting.receipt.name` | Name |
| `setting.receipt.paper` | Paper |
| `setting.receipt.phone` | Phone |
| `setting.receipt.showFooter` | Show Footer |
| `setting.receipt.showItems` | Show Items |
| `setting.receipt.showLineTotal` | Show Line Total |
| `setting.receipt.showLogo` | Show Logo |
| `setting.receipt.showNumber` | Show Number |
| `setting.receipt.showPayment` | Show Payment |
| `setting.receipt.showQuantity` | Show Quantity |
| `setting.receipt.showRate` | Show Rate |
| `setting.receipt.showSubtotal` | Show Subtotal |
| `setting.receipt.showTable` | Show Table |
| `setting.receipt.showTax` | Show Tax |
| `setting.receipt.showTaxId` | Show Tax Id |
| `setting.receipt.showTime` | Show Time |
| `setting.receipt.showTotal` | Show Total |
| `setting.receipt.tagline` | Tagline |
| `setting.receipt.taxId` | Tax Id |
| `setting.receipt.taxIdLabel` | Tax Id Label |
| `setting.theme.accent` | Accent |
| `setting.theme.accentText` | Accent Text |
| `setting.theme.background` | Background |
| `setting.theme.border` | Border |
| `setting.theme.danger` | Danger |
| `setting.theme.density` | Density |
| `setting.theme.font` | Font |
| `setting.theme.muted` | Muted |
| `setting.theme.radius` | Radius |
| `setting.theme.raised` | Raised |
| `setting.theme.success` | Success |
| `setting.theme.surface` | Surface |
| `setting.theme.text` | Text |
| `setting.waiter.accept` | Accept |
| `setting.waiter.alerts` | Alerts |
| `setting.waiter.billing` | Billing |
| `setting.waiter.enabled` | Enabled |
| `setting.waiter.handle` | Handle |
| `setting.waiter.serve` | Serve |
| `setting.waiter.viewOrders` | View Orders |
| `setting.waiter.viewRequests` | View Requests |
| `settings.audio` | Audio |
| `settings.behavior` | Behavior |
| `settings.brand` | Brand |
| `settings.contact` | Contact |
| `settings.discard` | Discard changes |
| `settings.explain` | These settings belong only to this restaurant. Owner feature permissions take priority. |
| `settings.export` | Export settings JSON |
| `settings.findText` | Find interface text |
| `settings.import` | Import settings JSON |
| `settings.links` | Links |
| `settings.manager` | Manager |
| `settings.receipt` | Receipt |
| `settings.save` | Save changes |
| `settings.saved` | Restaurant settings saved. |
| `settings.show` | Show |
| `settings.staff` | Staff |
| `settings.textHelp` | Edit registered text and hide/show individual labels and buttons. Blank overrides intentionally show blank text. Clear overrides with Discard after reloading or restore the default value. |
| `settings.texts` | Texts |
| `settings.theme` | Theme |
| `settings.tools` | Tools |
| `settings.unsaved` | Discard unsaved settings? |
| `settings.visibility` | Visibility |
| `settings.visibilityHelp` | Hide modules or individual interface elements. Hiding a label is presentation only; module controls are enforced by the server. |
| `settings.waiter` | Waiter |
| `staff.add` | Add existing Appwrite user |
| `staff.call` | Call waiter |
| `staff.disable` | Disable / enable |
| `staff.heading` | Kitchen Display & Orders |
| `staff.members` | Restaurant staff |
| `staff.name` | Display name |
| `staff.navigation` | Staff navigation |
| `staff.role` | Role |
| `staff.userId` | Appwrite user ID |
| `status.Cancelled` | Cancelled |
| `status.Cooking` | Cooking |
| `status.Expired` | Expired |
| `status.Handled` | Handled |
| `status.Pending` | Pending |
| `status.Played` | Played |
| `status.Playing` | Playing |
| `status.Ready` | Ready |
| `status.Rejected` | Rejected |
| `status.Served` | Served |
| `stock.edit` | Count / loop settings |
| `stock.loop` | Reset every 24 hours |
| `stock.loopQuantity` | Reset quantity |
| `stock.remaining` | Units remaining |
| `stock.tracked` | Track stock |
| `stock.units` | Units remaining |
| `stock.untracked` | Not tracked |
| `stock.value` | Value at selling prices |
| `table.add` | Add table |
| `table.available` | Available |
| `table.confirm` | This invalidates table access. Continue? |
| `table.copy` | Copy link |
| `table.download` | Download QR |
| `table.prompt` | Table number, for example T1 |
| `table.remove` | Remove table |
| `table.reserved` | Reserved |
| `table.rotate` | Revoke QR |
| `table.scan` | Scan table QR |
| `table.toggle` | Available / reserved |
| `tools.explain` | Export settings before major edits. Reporting resets archive earlier reporting data; they do not physically delete records. |
| `waiter.confirm` | Revoke the previous waiter link and generate a new one? |
| `waiter.heading` | Waiter Display & Requests |
| `waiter.link` | Generate / revoke waiter link |
| `waiter.orders` | Pending orders |
| `waiter.secret` | Anyone holding this link has the configured waiter permissions. Share privately. |
