/* Keeps the app's own files on the device so it opens instantly and opens at all with no
   internet. Bills are not cached here: they live in the device's own database (js/offline/). */
const CACHE = 'shopbill-v9';
const V = '?v=9';
const APP = ['config.js', 'css/app.css', 'js/cloud.js', 'js/themes.js', 'js/ui.js', 'js/calc.js',
  'js/offline/local-db.js', 'js/offline/repo.js', 'js/offline/sync.js', 'js/offline/router.js', 'js/offline/ui.js',
  'js/qr.js', 'js/receipt.js', 'js/billing.js', 'js/records.js', 'js/dashboard.js', 'js/items.js', 'js/stocks.js',
  'js/expenses.js', 'js/members.js', 'js/portal.js', 'js/settings.js', 'js/admin.js', 'js/app.js'].map(f => f + V);
const FILES = ['./', 'index.html', ...APP, 'icons/icon.svg', 'icons/icon-192.png'];

self.addEventListener('install', e => {
  // One missing file must not stop the whole install, or the app would never work offline.
  e.waitUntil(caches.open(CACHE)
    .then(c => Promise.all(FILES.map(f => c.add(f).catch(() => null))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.endsWith('.webmanifest')) return;              // app name & logo always come fresh

  // The app's own files carry a version in their address, so a cached copy is never the wrong
  // one. Serving it straight away is what lets the app open with no internet, and open fast.
  if (url.search === V || /\.(png|svg|woff2?)$/.test(url.pathname)) {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    })));
    return;
  }
  // Everything else: try the network, fall back to whatever was kept.
  e.respondWith(fetch(e.request)
    .then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return res; })
    .catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
