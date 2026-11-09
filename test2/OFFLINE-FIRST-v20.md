# v20 — billing that keeps working with no internet

Your app now keeps its own database on each device. Bills are taken, numbered, printed and
stored on the device itself, and sent to Supabase by themselves when a connection comes back.
Nothing was removed: every screen and feature from v19 still works exactly as before.

**No ZIP was attached to this request**, so this was built on the live source from our v19 work
(the restaurant workspace in `test2`), which is the newest copy of that same app.

---

## Run these two things, in this order

1. **Supabase → SQL Editor → run `SUPABASE/UPDATE-v19.sql`** — if you have not already.
2. **Supabase → SQL Editor → run `SUPABASE/OFFLINE-SYNC-v20.sql`** — the new one. It only adds
   things. No existing table, order, dish or login is touched.
   If the database uses `restaurant_inventory` and `restaurant_categories`, run
   `SUPABASE/OFFLINE-SYNC-v20-LEGACY-FIX.sql` immediately afterward. For an existing v20
   installation on that schema, apply just the compatibility fix.
3. **Upload `WEBSITE/` to `test2`** as usual.

Open the updated site at the same address and in the same browser profile to keep access
to locally saved bills. In **Saving & syncing**, click **Sync now** to send them immediately.

---

## What now works with no internet

| | Offline |
|---|---|
| Take a bill, print it, give change | **Yes** |
| Discounts, tax, short cash | **Yes** — the same sums as the server |
| Search the item list | **Yes** |
| See stock, and stock coming down as you sell | **Yes** |
| Records: today's bills, search, reprint | **Yes** |
| Dashboard: sales, best sellers, payment split | **Yes** |
| Change stock by hand | **Yes** (counted on the server as a movement, not an overwrite) |
| Kitchen orders, tables, QR menu, waiter app | No — these are about people arriving right now |
| Settings, Admin, Menu design, Expenses, imports, photo uploads | No — each says so plainly instead of failing |

When something needs internet it says: *"… can only be changed with internet. The till keeps
working — bills you take now are saved here and sent on by themselves."*

---

## How a bill is kept safe

Everything one bill touches — the bill, its lines, the stock it uses, and the note telling the
server about it — is written in **one transaction**. If any part fails, none of it happened. The
screen never says "saved" before the device has really saved it.

Each bill carries an id that it keeps for life. The server records that id the first time it
sees it. So a bill sent twice — because the reply was lost, the app was closed, the phone died
mid-send — still makes **exactly one bill**. This is tested, not assumed.

### Invoice numbers with no internet
A device collects a **block of 100 invoice numbers in advance** (say 101–200) and the year's
counter jumps past them, so no other device and no online bill can ever take the same number.
Offline, bills take the next number from the block. More are collected automatically whenever
the device connects.

If a device somehow uses all 100 while still offline, **billing is not blocked**. The bill gets
a number carrying that device's own tag, like `INV-7F3A-0001`. It is still unique, it is never
quietly renumbered, and the saving chip warns you. This is the only place offline numbers look
different from normal ones.

### Two devices selling the same dish
Stock is kept as a **list of movements**, never as "whatever the last device said". If the
counter sells 8 and the phone sells 15 while both are offline, after syncing the server has all
23 bills, stock is reduced by 23, and if that took it below zero the shortfall is **flagged for
you to look at** rather than silently hidden. Tested with exactly that case.

**Be clear with your staff about this:** while a device is offline it can only show the stock
*it* knows about. Two devices can both sell the last plate. The system will not lose either
sale, and it will tell you it happened — but it cannot prevent it.

---

## The saving chip

Top right, next to the clock. It says one plain thing at a time:

- **Saved and synced** — nothing waiting
- **Offline · 12 bills saved here** — no internet, still billing
- **Sending 20 of 50** — catching up
- **3 bills not sent** — the server refused something; tap to read why and retry or drop it
- **2 bills need attention** — something a person should look at

Tapping it opens a panel with **Sync now**, how many are waiting, when it last synced, how many
invoice numbers are left on the device, and **Save a backup / Restore**.

A backup is a single file holding every bill on that device **including the ones not yet sent**.
Keep it somewhere else. If a device is lost, wiped, or the app is uninstalled, what is on it
goes too — only what has already synced is safe in Supabase.

---

## What was tested, and how

Everything below was actually run on this machine against a real PostgreSQL database and a real
Chromium browser. Nothing in this list is an estimate.

**The sync rules, in the database (10 of 10 passed)** — invoice blocks move the year counter;
a bill sent twice stays one bill; a bill whose own total does not add up is refused for good; an
unknown operation is not retried for ever; pages of changes stop at the end; a device away
longer than the log is kept is told to take a fresh copy; a signed-out visitor cannot push.

**The device's own database (12 of 12 passed)** — the SQLite path and the browser path behave
identically; a failed transaction leaves nothing behind; data survives closing and reopening;
write-ahead logging is on.

**Taking a bill (20 of 20 passed)** — totals match the server's rules to the paise; pressing
save twice makes one bill; a total that does not match the screen is refused and writes nothing;
the number block is used to its last number and then falls back safely; stock moves only for
tracked dishes.

**100 bills with the internet cut, then reconnecting (19 of 19 passed)**
- 100 bills taken with no network, each with its own real invoice number
- closed and reopened while still offline — all 100 still there
- the connection died **during** syncing — 50 had gone, the app carried on
- reconnected: all 100 on the server, **100 bills / 100 different numbers**, stock exactly right
- replaying a bill made no second bill; nothing downloaded twice

**In a real browser, end to end (18 of 18 passed)** — signed in, device registered, numbers
collected; a bill online; network cut, 12 more bills; then **every request blocked, the app
reloaded, and it still opened and listed all 13 bills**; another bill taken in that state;
reconnected and all 14 arrived with no duplicates.

**Two devices at once (20 of 20 passed)** — a Windows counter and an Android phone, separate
number blocks with no overlap, 8 and 15 bills each with no internet, both reconnecting: 23 bills
on the server, 23 different numbers, stock counted not overwritten, 3-over-stock flagged. Plus:
an unknown device is refused, a device you switch off is refused, one device replaying another's
bill makes no copy, a bill with a negative quantity is refused, and a backup restored onto a
replacement device brings every bill back while the replacement keeps its own identity.

**Busy till (9 of 9 passed)** — with **10,000 items and 5,200 bills** on the device:
saving a bill 17 ms on average, opening a page of records 16 ms, the whole day's dashboard
41 ms, searching the item list under 1 ms, 3.4 MB on disk. Measured on this machine; a cheap
phone will be slower, but nothing here grows with the size of the history.

**Nothing from v19 broke** — the existing suites were re-run with all of this in place:
38, 18, and a clean sweep of every screen for both admin and manager, plus the 25 v19 feature
checks and the contract verifier. All pass.

Two things these runs found and fixed along the way, worth naming because they were real:
stock history had stopped being written (stock changes now go to the server while online,
exactly as before, and to the device only when there is none), and offline bills were not
recording where their number sat in the year's run.

---

## What is **not** done

- **No Windows installer and no Android APK were built.** This machine cannot reach the Rust
  package registry and has no Android SDK, so no Rust was compiled at all. The complete Tauri
  project is in `src-tauri/` and the exact build steps are in
  `BUILD-WINDOWS-AND-ANDROID.md`. The Rust sources parse cleanly; they have never been compiled.
  **Until you build it, use the installed web app** — it is already offline-capable on both
  Windows and Android, which is how all the browser testing above was done.
- **The device database is not encrypted.** Plain SQLite has no encryption. The usual answer
  (SQLCipher) could not be fetched or tested here, and some builds of it are not free. What
  protects the file today is the operating system: on Android it is inside the app's private
  storage; in a browser it is inside that browser's profile. If a device might be lost, turn on
  device encryption (BitLocker, or Android's default). Do not assume more than that.
- **Direct ESC/POS printing** to USB or Bluetooth thermal printers is not implemented. Printing
  goes through the normal Windows printer dialog or Android's print service, as it does today.
- **Editing dishes, categories, settings, photos and expenses offline** is not supported. The
  server-side pieces for offline dish edits exist and are tested, but the Items screen still
  needs internet for them, because photos, portions and buying prices have no offline path yet.
- **Card payments and any payment verification stay online-only.** An unverified digital payment
  is never marked as received.
- **Expenses and the kitchen screens** have no offline mode.
- **iOS** is not set up.

---

## Cost

Nothing new is paid for. The device database is SQLite and IndexedDB, both free and built in.
Syncing is a handful of extra Supabase function calls, and it is deliberately frugal: a device
downloads only what changed since it last asked, in pages, and uploads at most 50 bills per
request. The change log prunes itself after 30 days. Photos keep using your existing Cloudflare
R2 and are cached on the device after the first view.

One thing to watch: the change log and the operation ledger are rows in your database, so they
count towards the Supabase free tier. At a few hundred bills a day this is small. If you grow to
many restaurants on one project, prune them on a schedule.

---

## For whoever works on this next

```
WEBSITE/billing-suite/offline/
  local-db.js   the device's database: one interface, SQLite and IndexedDB behind it
  repo.js       what the till knows and does: the catalogue, the bill, stock, reading back
  sync.js       sending up, downloading down, retries, invoice blocks
  router.js     decides for each request: the device, the server, or "this needs internet"
  ui.js         the saving chip, the panel, backup and restore
SUPABASE/OFFLINE-SYNC-v20.sql   devices, operation ledger, change log, stock movements, blocks
src-tauri/                      the Windows and Android shell (not built here)
qa/off/                         every test named above, runnable
```

The screens were not touched. They still call `Cloud.rpc(...)`; `router.js` decides where that
goes. To make one more thing work offline, add it there.

After editing any file under `WEBSITE/`, run `BUNDLE_VERSION=20 node tools/build-v19.js WEBSITE`
to rebuild the one-file bundle the app actually loads.
