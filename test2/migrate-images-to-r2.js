#!/usr/bin/env node
/**
 * ONE-TIME, OPTIONAL migration: copies a restaurant's existing dish/logo
 * images out of Supabase Storage (bucket "menu-images") into Cloudflare R2,
 * then updates every menu_items row that still points at the old Supabase
 * Storage URL so it points at the new R2 URL instead.
 *
 * Run this ONCE per restaurant, locally on your own computer, AFTER you have:
 *   1. Created the R2 bucket and an R2 API token (see R2-SETUP-GUIDE.txt).
 *   2. Deployed the updated website with imagesBaseUrl + restaurantSlug set
 *      in config.js (so NEW uploads already go to R2).
 * It does NOT touch customization_settings (logo/banners saved there) —
 * those get re-uploaded automatically the next time you open Customize and
 * hit Save, or you can run this script again after extending the SQL below
 * if you want it to also rewrite customization_settings.
 *
 * This script needs your Supabase SERVICE ROLE key (Project Settings ->
 * API -> service_role). That key bypasses all security rules, so:
 *   - NEVER put it in config.js or any file that gets deployed.
 *   - Only run this script on your own machine, then close the terminal.
 *
 * Usage:
 *   npm install aws4fetch node-fetch   (if your Node version has no global fetch)
 *   SUPABASE_URL="https://xxxx.supabase.co" \
 *   SUPABASE_SERVICE_ROLE_KEY="xxxx" \
 *   R2_ACCOUNT_ID="xxxx" \
 *   R2_ACCESS_KEY_ID="xxxx" \
 *   R2_SECRET_ACCESS_KEY="xxxx" \
 *   R2_BUCKET_NAME="restaurant-images" \
 *   R2_PUBLIC_BASE_URL="https://images.yourdomain.com" \
 *   RESTAURANT_SLUG="yummy-momo" \
 *   node migrate-images-to-r2.js
 */
'use strict';
const { AwsClient } = require('aws4fetch');

const {
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
  R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_BASE_URL,
  RESTAURANT_SLUG
} = process.env;

function need(name, value) { if (!value) { console.error(`Missing required env var: ${name}`); process.exit(1); } }
[['SUPABASE_URL', SUPABASE_URL], ['SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY],
 ['R2_ACCOUNT_ID', R2_ACCOUNT_ID], ['R2_ACCESS_KEY_ID', R2_ACCESS_KEY_ID],
 ['R2_SECRET_ACCESS_KEY', R2_SECRET_ACCESS_KEY], ['R2_BUCKET_NAME', R2_BUCKET_NAME],
 ['R2_PUBLIC_BASE_URL', R2_PUBLIC_BASE_URL], ['RESTAURANT_SLUG', RESTAURANT_SLUG]
].forEach(([n, v]) => need(n, v));

const base = SUPABASE_URL.replace(/\/$/, '');
const r2 = new AwsClient({ accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, service: 's3', region: 'auto' });
const publicBase = R2_PUBLIC_BASE_URL.replace(/\/$/, '');

async function sbFetch(path, opts = {}) {
  const res = await fetch(base + path, {
    ...opts,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      ...(opts.headers || {})
    }
  });
  if (!res.ok) throw new Error(`Supabase request failed (${res.status}): ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function uploadToR2(bytes, contentType, objectKey) {
  const endpoint = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET_NAME}/${objectKey}`;
  const res = await r2.fetch(endpoint, { method: 'PUT', body: bytes, headers: { 'content-type': contentType } });
  if (!res.ok) throw new Error(`R2 upload failed (${res.status}): ${await res.text()}`);
}

function extFromContentType(ct) {
  if (/webp/i.test(ct)) return 'webp';
  if (/png/i.test(ct)) return 'png';
  if (/jpe?g/i.test(ct)) return 'jpeg';
  return 'webp';
}

async function migrateOne(row) {
  const oldUrl = row.image;
  if (!oldUrl || !oldUrl.includes('/storage/v1/object/public/menu-images/')) return false; // not a Supabase Storage image
  const imgRes = await fetch(oldUrl);
  if (!imgRes.ok) { console.warn(`  skip ${row.id}: could not download ${oldUrl} (${imgRes.status})`); return false; }
  const contentType = imgRes.headers.get('content-type') || 'image/webp';
  const ext = extFromContentType(contentType);
  const bytes = Buffer.from(await imgRes.arrayBuffer());
  const hash = require('crypto').createHash('sha256').update(bytes).digest('hex');
  const objectKey = `restaurants/${RESTAURANT_SLUG}/thumbs/${hash}.${ext}`;
  const newUrl = `${publicBase}/${objectKey}`;

  const head = await fetch(newUrl, { method: 'HEAD' });
  if (!head.ok) await uploadToR2(bytes, contentType, objectKey);

  await sbFetch(`/rest/v1/menu_items?id=eq.${encodeURIComponent(row.id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ image: newUrl })
  });
  console.log(`  migrated ${row.id}: ${oldUrl} -> ${newUrl}`);
  return true;
}

(async () => {
  console.log(`Fetching menu_items for migration...`);
  const rows = await sbFetch('/rest/v1/menu_items?select=id,image');
  console.log(`Found ${rows.length} menu items. Migrating images still on Supabase Storage...`);
  let migrated = 0;
  for (const row of rows) {
    try { if (await migrateOne(row)) migrated++; }
    catch (err) { console.error(`  error on ${row.id}:`, err.message); }
  }
  console.log(`Done. Migrated ${migrated} image(s). Images already on R2 or using some other URL were left untouched.`);
  console.log(`You can now safely delete the old files from the Supabase "menu-images" bucket once you've verified the new photos load correctly.`);
})();
