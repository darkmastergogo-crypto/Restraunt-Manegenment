# Restaurant workspace — v19

## 1. Run this once in Supabase (needed)
Supabase → SQL Editor → New query → paste **`SUPABASE/UPDATE-v19.sql`** → Run. It only adds things; your orders, menu and logins stay. Run it again any time — it is safe.

It switches on invoice numbers, the fast Records and Dashboard, counter discounts and short cash, Limits for managers, item buying prices and stock alerts, and waiter sign-in by mobile number. Until you run it, the app keeps working the old (slower) way, and these new parts show a short “run UPDATE-v19.sql” note.

New restaurants: `SETUP-RESTAURANT-FROM-SCRATCH.sql` already includes it.

## 2. Upload
Upload everything in `WEBSITE/` to `test2` as before (replace all). Keep your own `config.js`.

GitHub’s web uploader often fails with “Something went really wrong” when you drop a whole folder (too many files at once). Upload one folder at a time — for example `billing-suite/` first, then the files in the top folder — or push with Git from your computer.

## What changed

### Sign-in fixed (“Please sign in as staff”, “Invalid Refresh Token”)
- **Cause:** the app and its hidden alert engine kept two copies of the same sign-in and both renewed it. Supabase then saw one renewal code used twice, and cancelled the sign-in about an hour after you logged in. Signing out on one phone also signed the same login out everywhere.
- **Now:**
  - Every staff screen in a browser shares one sign-in, and only one of them renews it at a time.
  - Signing out only signs out that phone.
  - The app stays signed in when you close and reopen it.
- **If a sign-in ever ends:** a small “Sign in again” box opens over the screen. The open bill is kept; sign in and press **Retry save**.

### Invoice and order numbers
- Every paid bill gets the next number of the year: **INV001, INV002 … INV365 …**. This covers counter bills and QR orders alike.
  - Numbers restart each financial year (April). You can choose January instead.
  - You can also change the prefix and the number of digits, or continue from an old bill book: **Settings → Billing → Invoice & order numbers**. Only admin can change these.
  - This year’s paid bills were numbered once, oldest first.
- **Order numbers (#1, #2 …)** start again from 1 every day. Records, receipts and the bill view show both numbers.

### Speed
- **Records and Dashboard** load any period, including “This year”, in one request. They used to make one request per day: 365 for a year, which is why they took so long or failed.
  - The last result shows instantly and refreshes in the background.
  - If loading fails, a **Try again** button appears.
- **The app opens faster:**
  - It shows the last screen straight away and checks for updates in the background.
  - Start-up requests now run at the same time.
  - The heavy alert engine starts a moment later.
- **Fewer, smaller files:**
  - The staff app loads 1 file instead of 24.
  - The customer menu loads 1 file instead of 13.
  - Phones keep these files, so the next visit downloads almost nothing.
  - The app also opens offline.
- Menu photos are kept on the phone after the first view.

### Customer menu
- **Category banner photos:** each category can have its own picture. Set them in **Menu design → Categories** (Add photo, Change, Link, Remove). Photos are cropped to a wide banner and shrunk to load fast.
  - You also choose how every category starts: a big banner, a small photo, or the name only.
- **Layout fixes:**
  - The page no longer jumps when you scroll past the top photo.
  - The floating **Menu** button no longer covers ADD buttons.
  - Swipe rows (Shelves, Best sellers) no longer stick to the screen edge.
  - The preview inside Menu design no longer shows the wrong header.
- Long-press on menu pictures and buttons no longer opens a save or download menu.

### Billing counter
- **Discounts work:** % or ₹, checked by the server.
- **Short cash works:** the bill is reduced to the cash received, up to your limit.
- **Custom (“Extra item”) button:**
  - It now explains why it is locked when a bill is waiting to be saved.
  - Quantities are whole numbers, 1–50.
  - A stuck bill can now be **discarded**.
- **Server refusals:** a bill the server refuses (for example, over the limit) shows the reason. It no longer stays stuck as “not saved yet”.
- **Customer details:** customer name and phone are saved on the order.

### Admin and manager
- **System on / off** is now the last tab in Admin.
- **Hide admin-only tabs** (Admin → System on / off) makes every admin login see exactly what a manager sees. A **Show admin tabs** button at the bottom of the side menu brings them back.
- **Limits** (biggest discount %, short cash ₹) is now a tab for managers too, in Settings. Managers are held to it; the admin login is not.
- On phones, the whole side menu scrolls, so the last tabs are never hidden.

### Staff and waiters
- **Waiters can sign in with their mobile number:**
  - Add the number in **Settings → Staff & logins** when you add a waiter, or with the **Add number** button on an existing waiter.
  - Email is optional when you give a number.

### Items
- **More fields save now:**
  - Buying (cost) price, unit (plate, glass, kg…), HSN, and name on bill.
  - A low-stock alert level for each item.
  - These are kept private — customers never see them.
- **Track stock** with an opening stock now saves in one go.
- Options the restaurant system cannot use are hidden: per-item tax, per-item discount, service items and batch/expiry.

### Other fixes
- **Long-press:** holding a tab or button no longer opens the phone’s “Copy link / Download link” menu.
- **Dashboard:**
  - “Latest bills” is filled in.
  - Low stock uses each item’s alert level.
  - Net profit shows sales minus expenses.
- **Settings:** the colour pickers show a proper swatch, and the bill design sample now uses dishes.
- **Waiter app:** it no longer hangs on a blank page when the browser blocks its background worker.

## Checked
- **Real database tests:**
  - Discount bill → INV number.
  - Extra item.
  - “This year” Records and Dashboard, each in one request.
  - Changing invoice format.
  - Limits, including a manager over the limit being stopped.
  - Hide and show admin tabs.
  - An item with buying price, opening stock 60 and alert 5.
  - Waiter added with a mobile number, then signing in on the waiter app with it.
  - Manager signing in with a mobile number.
  - Category style save.
  - Sign-in ending mid-bill: the bill is kept and saves after signing in again.
- **Sign-in stress test:**
  - 2 tabs plus 2 alert engines with 70-second sign-ins for 3½ minutes.
  - 20 renewals, 0 failures, still signed in everywhere.
- **Every menu layout:**
  - All 20 layouts, phone and desktop, with category banners.
  - Content movement while scrolling measured at 0 px on all 20.
- **Every staff screen and tab:**
  - Admin on phone and desktop, and manager on phone.
  - Fixed what looked wrong and checked again.
- **Earlier regression suites:** they pass on the bundled files.
- **Offline preview:** `Restaurant-Workspace-Preview-v19.html` opens offline with sample data.

**Not checked:** your live Supabase project, real R2 photo uploads, printing on your printer, and real phones. Run UPDATE-v19.sql first, then try one bill.

## For later edits
The readable source files are still in the folder. `index.src.html` lists them. After editing any of them, run `node tools/build-v19.js WEBSITE` to rebuild `app.v19.js`, `app.v19.css`, `menu.v19.js` and both `index.html` files.
