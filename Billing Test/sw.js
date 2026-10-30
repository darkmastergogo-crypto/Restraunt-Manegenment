/* Caches the app files so it opens fast. Bills always go to the server. */
const CACHE = 'shopbill-v1';
const FILES = ['./', 'index.html', 'config.js?v=1', 'css/app.css?v=1', 'js/cloud.js?v=1', 'js/ui.js?v=1', 'js/receipt.js?v=1', 'js/billing.js?v=1',
  'js/records.js?v=1', 'js/dashboard.js?v=1', 'js/items.js?v=1', 'js/stocks.js?v=1', 'js/settings.js?v=1', 'js/app.js?v=1', 'icons/icon.svg', 'icons/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Network first so updates show up straight away; cache only when offline.
  e.respondWith(fetch(e.request).then(res => { const copy = res.clone(); if (res.ok) caches.open(CACHE).then(c => c.put(e.request, copy)); return res; }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
