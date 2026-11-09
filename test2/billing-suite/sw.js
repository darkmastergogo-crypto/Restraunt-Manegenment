/* v19: opens fast. Versioned files (…?v=19) come straight from this phone's cache; the page itself is
   fetched fresh when the internet is quick and falls back to the cached copy after 2.5 seconds or offline.
   Bills, orders and every API call always go to the server — they are never cached. */
const CACHE = 'shopbill-suite-v20-load1';
const CORE = ['./', 'index.html', 'app.v20.css?v=20', 'app.v20.js?v=20-load1', '../config.js', 'icons/icon.svg', 'icons/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE).catch(() => {})).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('shopbill-suite-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
const put = (req, res) => { if (res && res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); } return res; };
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.endsWith('.webmanifest')) return;   // app name & logo always come fresh
  if (url.searchParams.has('v')) {   // versioned: never changes, so the cache is always right
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => put(req, res))));
    return;
  }
  e.respondWith(new Promise(resolve => {
    let done = false; const finish = r => { if (!done && r) { done = true; resolve(r); } };
    const net = (req.mode === 'navigate' ? fetch(req, { cache: 'no-cache' }) : fetch(req)).then(res => put(req, res));
    const fallback = () => caches.match(req).then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : null));
    const timer = setTimeout(() => fallback().then(finish), 2500);
    net.then(r => { clearTimeout(timer); finish(r); }, () => { clearTimeout(timer); fallback().then(r => finish(r || Response.error())); });
  }));
});
