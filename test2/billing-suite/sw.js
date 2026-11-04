/* Caches the app files so it opens fast. Bills always go to the server. */
const CACHE = 'shopbill-suite-v17';
const FILES = ['./', 'index.html', 'css/app.css?v=4', 'css/restaurant.css?v=17', 'workspace.css?v=17', 'config.js?v=5', 'js/themes.js?v=4', 'js/ui.js?v=17', 'js/calc.js?v=4', 'js/qr.js?v=4', 'js/receipt.js?v=4', 'js/billing.js?v=17', 'js/records.js?v=17', 'js/dashboard.js?v=17', 'js/items.js?v=17', 'js/stocks.js?v=17', 'js/expenses.js?v=4', 'js/members.js?v=4', 'js/portal.js?v=4', 'workspace.js?v=17', 'js/restaurant.js?v=17', 'js/settings.js?v=17', 'js/admin.js?v=17', 'js/app.js?v=17', 'icons/icon.svg', 'icons/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll([...FILES,'../config.js','compat.js','restaurant-cloud.js?v=17','restaurant-adapter.js?v=17','../restaurant-engine.html','../workspace-engine.css?v=17','../workspace-engine.js?v=17'])).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('shopbill-suite-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.endsWith('.webmanifest')) return;   // app name & logo always come fresh
  // Network first so updates show up straight away; cache only when offline.
  e.respondWith(fetch(e.request).then(res => { const copy = res.clone(); if (res.ok) caches.open(CACHE).then(c => c.put(e.request, copy)); return res; }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
