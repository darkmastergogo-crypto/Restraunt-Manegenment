// Network-only installable PWA + push. No application/session/API/restaurant caches.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => new Response(
    '<!doctype html><meta name="viewport" content="width=device-width"><title>Connection required</title><main><h1>You are offline</h1><p>Connect to the internet, then reload. No orders or requests are sent while offline.</p><button onclick="location.reload()">Try again</button></main>',
    {status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}})));
});
self.addEventListener('push',event=>{
  let p={};try{p=event.data.json();}catch{}
  const url=typeof p.url==='string' && /^\/r\/[a-z0-9-]{3,48}\/admin$/.test(p.url)?p.url:'/';
  event.waitUntil(self.registration.showNotification('Restaurant staff alert',{
    body:['New order received.','An order was updated.','A restaurant request needs attention.','A restaurant alert needs attention.'].includes(p.body)?p.body:'Open the dashboard for details.',
    tag:typeof p.tag==='string'?p.tag.slice(0,160):'restaurant-alert',icon:'/push-icon-192.png',badge:'/push-icon-192.png',
    data:{url},vibrate:[200,100,200],requireInteraction:true}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=new URL(event.notification.data?.url||'/',self.location.origin);
  if(target.origin!==self.location.origin)return;
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const found=windows.find(w=>w.url===target.href);
    if(found){await found.focus();return;}
    await self.clients.openWindow(target.href);
  })());
});
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
