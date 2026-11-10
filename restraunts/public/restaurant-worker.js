const scope = new URL(self.registration.scope);
const cacheName = `restaurant-offline:${scope.pathname}:1`;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.add('/offline.html')));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const prefix = `restaurant-offline:${scope.pathname}:`;
    for (const key of await caches.keys()) {
      if (key.startsWith(prefix) && key !== cacheName) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'activate-update' && event.source?.url?.startsWith(scope.href)) self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const workspace = url.pathname === scope.pathname || url.pathname === `${scope.pathname}team`;
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate' || url.origin !== scope.origin || !workspace) return;
  event.respondWith(fetch(event.request).catch(async () => (await (await caches.open(cacheName)).match('/offline.html')) || Response.error()));
});
