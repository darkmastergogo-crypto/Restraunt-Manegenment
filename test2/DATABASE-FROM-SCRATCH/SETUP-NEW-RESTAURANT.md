# Set up a new restaurant from scratch

One SQL file builds the whole database the website needs: menu, stock, tables and QR codes, customer ordering, kitchen, waiter app, counter billing, records, reports, expenses, settings and all security rules.

## 1. Supabase (database)
1. Create a new, empty Supabase project.
2. SQL Editor → New query → paste all of `SETUP-RESTAURANT-FROM-SCRATCH.sql` → **Run**. It is safe to run again later; it only adds what is missing and updates the functions.
3. Authentication → Users → **Add user** → your email and a strong password → tick **Auto Confirm User**.
4. SQL Editor, run once with your email:
   `select public.restaurant_make_admin('you@example.com', 'Your name');`
5. Optional manager: add the user the same way, then
   `select public.restaurant_make_manager('manager@example.com', 'Manager name');`
6. Project Settings → API: copy the **Project URL** and the **anon public** key.

## 2. Website (Vercel)
1. Upload the `WEBSITE` folder as a new Vercel project.
2. In `config.js` set: `supabaseUrl`, `supabaseAnonKey` (step 1.6), `restaurantName`, `tagline`, and a new unique `restaurantSlug` (lowercase, e.g. `aryan-momo`). Keep `imagesBaseUrl` as your R2 public URL.
3. Vercel → Settings → Environment Variables (for photo uploads to R2): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_BASE_URL`, `ALLOWED_SUPABASE_URL` (this restaurant's Supabase URL), `ALLOWED_RESTAURANT_SLUG` (same slug as config.js). Redeploy.

## 3. First use (inside the app)
Sign in at `/staff.html` with the admin login, then:
- **Settings → Shop details**: name, logo, contact.
- **Items → Add item / Import** (or Photos & portions for sizes and photos), **Stocks** for tracked quantities.
- **Tables & QR codes → Add table**, then **Export all QR** (A4 PDF and/or one SVG) to print every code at once.
- **Menu design** (side menu): pick one of 20 layouts and 40 menu themes, edit any word, add banner photos, show/hide parts (including Request song) and switch on the Instagram / Google review offers. Press **Save**.
- **Settings → Staff & logins**: add waiter logins. **Settings → Restaurant**: waiter app, alarm tunes, tax is in **Settings → Billing**.

## Good to know
- Times and daily order numbers use India time (Asia/Kolkata).
- 24-hour stock loops, request expiry and notification clean-up run automatically whenever the app is used; no scheduler is needed.
- Phone notifications when the app is fully closed need a separate push sender (Supabase Edge Function), which is not part of this file. Sounds and alerts while the app is open work without it.
- Old Yummy Momo installs: do **not** run this on the existing live database. It is for new, empty projects.
