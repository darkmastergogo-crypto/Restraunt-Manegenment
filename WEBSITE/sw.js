/* No offline menu/order cache. Push alerts are separate from confirmed cloud orders. */
'use strict';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
 event.waitUntil((async()=>{
  let data;try{data=event.data?.json();}catch{return;}
  if(!data||!['waiter','kitchen'].includes(data.kind)||!data.tag||!Number.isFinite(Date.parse(data.expiresAt))||Date.parse(data.expiresAt)<=Date.now())return;
  const path=new URL(data.kind==='waiter'?'waiter.html':data.screen==='notifications'?'kitchen.html#notifications':'kitchen.html#requests',self.registration.scope).href;
  await self.registration.showNotification(String(data.title).slice(0,100),{
   body:String(data.body||'Open the dashboard for details.').slice(0,180),
   tag:String(data.tag).slice(0,100),renotify:true,silent:false,requireInteraction:true,
   timestamp:Date.parse(data.createdAt)||Date.now(),
   data:{url:path,kind:data.kind,screen:data.screen},
   // No silent:true. Sound/vibration depend on Android/Windows/browser notification settings.
   vibrate:[500,150,500,150,500],
  });
 })());
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const kind=event.notification.data?.kind;
  if(!['waiter','kitchen'].includes(kind))return;
  const url=new URL(kind==='waiter'?'waiter.html':event.notification.data?.screen==='notifications'?'kitchen.html#notifications':'kitchen.html#requests',self.registration.scope);
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const existing=windows.find(c=>new URL(c.url).pathname===url.pathname&&new URL(c.url).origin===url.origin);
  if(existing){await existing.focus();existing.postMessage({type:'restaurant-push-open',kind,screen:event.notification.data?.screen});}
  else await self.clients.openWindow(url.href);
 })());
});
