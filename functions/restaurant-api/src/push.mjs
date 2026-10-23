import { createHash, ECDH, randomUUID } from 'node:crypto';
import webpush from 'web-push';
import { enabled, mergeConfig } from './schema.mjs';
const bad = message => {throw Object.assign(Error(message),{status:400});};
export const pushID = endpoint => createHash('sha256').update(endpoint).digest('hex').slice(0,36);
export function validateSubscription(value) {
  if(!value || typeof value.endpoint!=='string' || value.endpoint.length>2048) bad('Invalid push subscription.');
  let u;try{u=new URL(value.endpoint);}catch{bad('Invalid push endpoint.');}
  const allowed=(u.hostname==='fcm.googleapis.com' && /^\/(fcm\/send|wp)\/[A-Za-z0-9_:\-]+$/.test(u.pathname)) ||
    (u.hostname==='updates.push.services.mozilla.com' && /^\/wpush\/v2\/[A-Za-z0-9_\-]+$/.test(u.pathname));
  if(u.protocol!=='https:' || u.port || u.username || u.password || u.search || u.hash || !allowed) bad('Unsupported push provider. Use Android Chrome or Firefox.');
  const keys=value.keys;
  if(!keys || !/^[A-Za-z0-9_-]{86,88}={0,2}$/.test(keys.p256dh||'') || !/^[A-Za-z0-9_-]{22}={0,2}$/.test(keys.auth||'')) bad('Invalid push encryption keys.');
  try{if(Buffer.from(keys.auth,'base64url').length!==16)bad('Invalid keys.');ECDH.convertKey(Buffer.from(keys.p256dh,'base64url'),'prime256v1');}catch{bad('Invalid push encryption keys.');}
  return {endpoint:u.href,keys:{p256dh:keys.p256dh,auth:keys.auth}};
}
export function pushConfiguration(env=process.env) {
  const publicKey=env.PUSH_VAPID_PUBLIC_KEY||'',privateKey=env.PUSH_VAPID_PRIVATE_KEY||'',subject=env.PUSH_VAPID_SUBJECT||'';
  if(!publicKey || !privateKey || !/^mailto:[^\s@]+@[^\s@]+$/.test(subject)) return null;
  try {webpush.getVapidHeaders('https://fcm.googleapis.com',subject,publicKey,privateKey,'aes128gcm');return {publicKey,send:(sub,payload)=>webpush.sendNotification(sub,JSON.stringify(payload),{vapidDetails:{subject,publicKey,privateKey},TTL:300,urgency:'high',timeout:2500})};}catch{return null;}
}
// Called inside the same database transaction as the event. No external delivery before commit.
export function eventStore(store,tenant) {
  return new Proxy(store,{get(target,prop){
    if(prop!=='put') {const v=Reflect.get(target,prop);return typeof v==='function'?v.bind(target):v;}
    return async(t,type,key,value)=>{
      const observed=t===tenant.id && ['order','request','notice'].includes(type) && enabled(tenant,'push');
      const previous=observed?await target.get(t,type,key):null;
      const result=await target.put(t,type,key,value);
      if(observed && (!previous || (type!=='notice' && (previous.status!==value.status || previous.onWay!==value.onWay)))) {
        const category=type==='order'?'orders':type==='request'?'requests':'alerts';
        const id=pushID([type,key,value.status||'',value.onWay||'',value.updated||value.created||''].join('|'));
        if(!await target.get(t,'push-event',id)) await target.put(t,'push-event',id,{id,category,kind:type==='notice'?value.kind||'alert':type,
          eventType:!previous?'new':'updated',created:Date.now(),status:'pending',attempts:0,delivered:[],leaseUntil:0});
      }
      return result;
    };
  }});
}
export function canReceive(tenant,role,event) {
  if(!enabled(tenant,'push')) return false;
  if(event.category==='orders')return enabled(tenant,'orders');
  if(event.category==='requests')return enabled(tenant,'requests') || enabled(tenant,'callWaiter');
  if(!enabled(tenant,'notifications'))return false;
  return event.kind!=='security' || role!=='manager' || tenant.config.manager.devices || tenant.config.manager.blocking;
}
export function privatePayload(tenant,event) {
  return {title:'Restaurant staff alert',body:event.category==='orders'?(event.eventType==='new'?'New order received.':'An order was updated.'):
    event.category==='requests'?'A restaurant request needs attention.':'A restaurant alert needs attention.',
    tag:'rp-'+tenant.id+'-'+event.id,url:'/r/'+encodeURIComponent(tenant.slug)+'/admin'};
}
export async function dispatchTenantPush(store,tenantID,transport,owners=[],{limit=6,now=Date.now()}={}) {
  if(!transport)return {sent:0};
  let tenant=await store.get(tenantID,'tenant','meta');
  if(!tenant || tenant.status!=='active')return {sent:0};
  tenant.config=mergeConfig(tenant.config);
  const pending=(await store.all(tenantID,'push-event')).filter(e=>e.status==='pending' && (!e.retryAt || e.retryAt<=now) && (!e.leaseUntil || e.leaseUntil<=now)).sort((a,b)=>a.created-b.created).slice(0,1);
  let sent=0;
  for(const candidate of pending) {
    const lease=randomUUID();
    const claimed=await store.transaction(tenantID,async s=>{
      const e=await s.get(tenantID,'push-event',candidate.id);
      if(!e || e.status!=='pending' || e.leaseUntil>now)return null;
      e.lease=lease;e.leaseUntil=now+150000;
      if(e.created<now-3600000 || e.attempts>=8){e.status='expired';e.leaseUntil=0;await s.put(tenantID,'push-event',e.id,e);return null;}
      await s.put(tenantID,'push-event',e.id,e);return e;
    });
    if(!claimed)continue;
    const delivered=new Set(claimed.delivered||[]);let transient=false,count=0;
    const subscriptions=(await store.all(tenantID,'push-subscription')).filter(x=>!delivered.has(x.id) && x.created<=claimed.created);
    for(const sub of subscriptions.slice(0,limit)) {
      count++;
      const current=await store.get(tenantID,'tenant','meta');current.config=mergeConfig(current.config);
      const member=await store.get(tenantID,'member',sub.userId);
      const role=owners.includes(sub.userId)?'owner':member?.active?member.role:null;
      if(sub.updated<now-30*86400000 || current.status!=='active' || !['owner','admin','manager'].includes(role) || !sub.categories?.includes(claimed.category) || !canReceive(current,role,claimed)) {delivered.add(sub.id);continue;}
      try {
        const safe=validateSubscription(sub.subscription);
        await transport.send(safe,privatePayload(current,claimed));delivered.add(sub.id);sent++;
      }catch(e){
        if([404,410].includes(e.statusCode) || e.status===400) {
          await store.transaction(tenantID,async s=>{const x=await s.get(tenantID,'push-subscription',sub.id);if(x?.updated===sub.updated)await s.remove(tenantID,'push-subscription',sub.id);});delivered.add(sub.id);
        } else transient=true;
      }
    }
    await store.transaction(tenantID,async s=>{
      const e=await s.get(tenantID,'push-event',claimed.id);if(!e || e.lease!==lease)return;
      e.delivered=[...delivered];e.leaseUntil=0;
      if(transient){e.attempts++;e.retryAt=Date.now()+Math.min(300000,10000*2**e.attempts);}
      else e.retryAt=0;
      if(!transient && count===subscriptions.length)e.status='sent';
      await s.put(tenantID,'push-event',e.id,e);
    });
  }
  const old=(await store.all(tenantID,'push-event')).filter(e=>e.created<now-86400000).slice(0,10);
  if(old.length)await store.transaction(tenantID,async s=>{for(const e of old){const live=await s.get(tenantID,'push-event',e.id);if(live && (!live.leaseUntil || live.leaseUntil<=now))await s.remove(tenantID,'push-event',e.id);}});
  return {sent};
}
export async function dispatchPushBatch(store,transport,owners=[]) {
  if(!transport)return {sent:0,configured:false};
  let sent=0;
  const rows=await store.all('_platform','registry');
  // Rotate across tenants so a large restaurant cannot monopolize every invocation.
  const offset=rows.length?Math.floor(Date.now()/60000)%rows.length:0;
  for(const row of [...rows.slice(offset),...rows.slice(0,offset)].slice(0,5))
    sent+=(await dispatchTenantPush(store,row.id,transport,owners)).sent;
  return {sent,configured:true};
}
