/* Caches the app files so it opens fast. Bills always go to the server. */
const CACHE = 'shopbill-v5';
const FILES = ['./', 'index.html', 'config.js?v=5', 'css/app.css?v=5', 'js/cloud.js?v=5', 'js/themes.js?v=5', 'js/ui.js?v=5', 'js/calc.js?v=5', 'js/qr.js?v=5', 'js/receipt.js?v=5', 'js/billing.js?v=5',
  'js/records.js?v=5', 'js/dashboard.js?v=5', 'js/items.js?v=5', 'js/stocks.js?v=5', 'js/expenses.js?v=5', 'js/members.js?v=5', 'js/portal.js?v=5', 'js/settings.js?v=5', 'js/admin.js?v=5', 'js/app.js?v=5',
  'icons/icon.svg', 'icons/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.endsWith('.webmanifest')) return;   // app name & logo always come fresh
  // Network first so updates show up straight away; cache only when offline.
  e.respondWith(fetch(e.request).then(res => { const copy = res.clone(); if (res.ok) caches.open(CACHE).then(c => c.put(e.request, copy)); return res; }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
