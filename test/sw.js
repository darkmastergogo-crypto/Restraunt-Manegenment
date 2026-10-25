/* Release46: private API responses stay network-only. Public versioned photos may be cached. */
'use strict';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
 event.waitUntil((async()=>{
  let data;try{data=event.data?.json();}catch{return;}
  if(!data||!['waiter','kitchen'].includes(data.kind)||!data.tag||!Number.isFinite(Date.parse(data.expiresAt))||Date.parse(data.expiresAt)<=Date.now())return;
  const path=new URL(data.kind==='waiter'?'waiter.html':data.screen==='orders'?'kitchen.html#orders':data.screen==='notifications'?'kitchen.html#notifications':'kitchen.html#requests',self.registration.scope).href;
  const eventKind=data.event_type==='new_order'?'order':data.event_type==='low_stock'?'stock':data.event_type==='blocked_scan'?'security':'request';
  const eventKey=eventKind+':'+data.event_id;
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  await self.registration.showNotification(String(data.title).slice(0,100),{
   body:String(data.body||'Open the dashboard for details.').slice(0,180),
   tag:String(data.tag).slice(0,100),renotify:false,silent:false,requireInteraction:true,
   timestamp:Date.parse(data.createdAt)||Date.now(),
   data:{url:path,kind:data.kind,screen:data.screen},
   // No silent:true. Sound/vibration depend on Android/Windows/browser notification settings.
   vibrate:[500,150,500,150,500],
  });
  clients.forEach(c=>c.postMessage({type:'restaurant-push-delivered',kind:data.kind,event_key:eventKey}));
 })());
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const kind=event.notification.data?.kind;
  if(!['waiter','kitchen'].includes(kind))return;
  const url=new URL(kind==='waiter'?'waiter.html':event.notification.data?.screen==='orders'?'kitchen.html#orders':event.notification.data?.screen==='notifications'?'kitchen.html#notifications':'kitchen.html#requests',self.registration.scope);
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const existing=windows.find(c=>new URL(c.url).pathname===url.pathname&&new URL(c.url).origin===url.origin);
  if(existing){await existing.focus();existing.postMessage({type:'restaurant-push-open',kind,screen:event.notification.data?.screen});}
  else await self.clients.openWindow(url.href);
 })());
});

// Public content-addressed catalog photos only. Never cache RPC/Auth/order responses.
const PHOTO_CACHE='yummy-public-photos-v46';
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 for(const name of await caches.keys())if(name.startsWith('yummy-public-photos-')&&name!==PHOTO_CACHE)await caches.delete(name);
})()));
self.addEventListener('fetch',event=>{
 const u=new URL(event.request.url);
 if(event.request.method!=='GET'||event.request.destination!=='image'||u.protocol!=='https:'||!/[.]supabase[.]co$/.test(u.hostname)||!/^\/storage\/v1\/object\/public\/menu-images\/thumbs\/[a-f0-9]{64}\.(webp|png|jpeg)$/.test(u.pathname)||u.search)return;
 event.respondWith((async()=>{
  const cache=await caches.open(PHOTO_CACHE),hit=await cache.match(u.href);if(hit)return hit;
  const response=await fetch(u.href,{mode:'cors',credentials:'omit',cache:'default'});
  if(response.ok&&/^image\//.test(response.headers.get('Content-Type')||'')){
   try{await cache.put(u.href,response.clone());const keys=await cache.keys();for(const old of keys.slice(0,Math.max(0,keys.length-80)))await cache.delete(old);}catch{} // Quota failure does not block an image.
  }
  return response;
 })());
});
