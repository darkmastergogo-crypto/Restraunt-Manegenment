import test from 'node:test';
import assert from 'node:assert/strict';
import {createECDH,randomBytes} from 'node:crypto';
import {MemoryStore} from '../scripts/memory-store.mjs';
import {service} from '../functions/restaurant-api/src/service.mjs';
import {eventStore,validateSubscription,pushID,pushConfiguration,dispatchTenantPush,privatePayload} from '../functions/restaurant-api/src/push.mjs';
function subscription(endpoint='https://fcm.googleapis.com/fcm/send/token_ABC-123') {
 const k=createECDH('prime256v1');k.generateKeys();
 return {endpoint,keys:{p256dh:k.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}};
}
async function fixture() {
 const db=new MemoryStore();await db.put('_platform','lock','write',{});
 const opts={mfaVerified:true,push:{publicKey:'public-test-key'}};
 const call=(action,p={},user={$id:'owner'})=>service(db,{restaurant:'alpha-cafe',action,...p},user,['owner'],opts);
 for(const slug of ['alpha-cafe','bravo-cafe']) {
  await call('provision',{slug,name:slug});
  await call('entitlements',{restaurant:slug,features:{push:true}});
 }
 return {db,call,opts};
}
test('push endpoint validation rejects private hosts, credentials, redirects and malformed encryption keys',()=>{
 assert.ok(validateSubscription(subscription()));
 for(const host of ['http://fcm.googleapis.com/fcm/send/token','https://127.0.0.1/fcm/send/token','https://fcm.googleapis.com.evil.com/fcm/send/token','https://user@fcm.googleapis.com/fcm/send/token','https://fcm.googleapis.com:444/fcm/send/token','https://fcm.googleapis.com/fcm/send/token?redirect=http://localhost','https://fcm.googleapis.com/anything'])
  assert.throws(()=>validateSubscription(subscription(host)));
 const s=subscription();s.keys.p256dh='A'.repeat(87);assert.throws(()=>validateSubscription(s));
});
test('push configuration requires valid server keys and contact address; no keys are generated automatically',()=>{
 assert.equal(pushConfiguration({}),null);
 const k=createECDH('prime256v1');k.generateKeys();
 const cfg=pushConfiguration({PUSH_VAPID_PUBLIC_KEY:k.getPublicKey().toString('base64url'),PUSH_VAPID_PRIVATE_KEY:k.getPrivateKey().toString('base64url'),PUSH_VAPID_SUBJECT:'mailto:support@example.com'});
 assert.ok(cfg);assert.equal(typeof cfg.send,'function');assert.equal(cfg.privateKey,undefined);
});
test('subscriptions require authenticated authorized restaurant membership and MFA',async()=>{
 const {call,db,opts}=await fixture();const sub=subscription();
 await assert.rejects(call('pushSubscribe',{subscription:sub,categories:['orders']},null),e=>e.status===401);
 await assert.rejects(call('pushSubscribe',{subscription:sub,categories:['orders'],role:'owner'},{$id:'stranger'}),e=>e.status===403);
 await call('member',{userId:'client-a',role:'admin'});
 await assert.rejects(service(db,{action:'pushSubscribe',restaurant:'alpha-cafe',subscription:sub,categories:['orders']},{$id:'client-a'},['owner'],{...opts,mfaVerified:false}),e=>e.status===403);
 await call('pushSubscribe',{subscription:sub,categories:['orders']},{$id:'client-a'});
 await assert.rejects(call('pushSubscribe',{restaurant:'bravo-cafe',subscription:sub,categories:['orders'],restaurant_id:'alpha-cafe'},{$id:'client-a'}),e=>e.status===403);
 assert.equal((await db.all('bravo-cafe','push-subscription')).length,0);
 const pub=await call('public',{},null);assert.equal(pub.subscriptions,undefined);assert.equal(pub.push,undefined);
});
test('push feature disable and missing server keys prevent subscriptions',async()=>{
 const {call,db,opts}=await fixture();await call('entitlements',{features:{push:false}});
 await assert.rejects(call('pushSubscribe',{subscription:subscription(),categories:['orders']}),e=>e.status===403);
 await call('entitlements',{features:{push:true}});
 await assert.rejects(service(db,{action:'pushSubscribe',restaurant:'alpha-cafe',subscription:subscription(),categories:['orders']},{$id:'owner'},['owner'],{...opts,push:null}),e=>e.status===503);
});
test('subscription encryption keys stay private and a user cannot delete another user subscription',async()=>{
 const {db,call}=await fixture();const sub=subscription();
 await call('member',{userId:'manager-a',role:'manager'});
 await call('pushSubscribe',{subscription:sub,categories:['orders']});
 await call('pushUnsubscribe',{endpoint:sub.endpoint},{$id:'manager-a'});
 assert.ok(await db.get('alpha-cafe','push-subscription',pushID(sub.endpoint)));
 const staff=await call('staff');assert.equal(staff.subscriptions,undefined);assert.equal(JSON.stringify(staff).includes(sub.keys.auth),false);
 await call('pushUnsubscribe',{endpoint:sub.endpoint});assert.equal((await db.all('alpha-cafe','push-subscription')).length,0);
});
test('event writes are atomic, idempotent, and never contain customer/order details',async()=>{
 const {db}=await fixture();const tenant=await db.get('alpha-cafe','tenant','meta');
 await assert.rejects(db.transaction(tenant.id,async s=>{
  await eventStore(s,tenant).put(tenant.id,'order','order-1',{id:'order-1',status:'Pending',created:Date.now(),customer:'SECRET',phone:'SECRET'});throw Error('rollback');
 }));
 assert.equal((await db.all(tenant.id,'push-event')).length,0);
 const s=eventStore(db,tenant),o={id:'order-1',status:'Pending',created:Date.now(),customer:'SECRET'};
 await s.put(tenant.id,'order',o.id,o);await s.put(tenant.id,'order',o.id,o);
 const events=await db.all(tenant.id,'push-event');assert.equal(events.length,1);assert.equal(JSON.stringify(events).includes('SECRET'),false);
 await s.put(tenant.id,'order',o.id,{...o,status:'Ready',updated:Date.now()});assert.equal((await db.all(tenant.id,'push-event')).length,2);
});
test('dispatcher delivers only within a tenant and rechecks active membership immediately before sending',async()=>{
 const {db,call}=await fixture();await call('member',{userId:'client-a',role:'manager'});
 const a=subscription(),b=subscription('https://fcm.googleapis.com/fcm/send/BRAVO');
 await call('pushSubscribe',{subscription:a,categories:['orders']},{$id:'client-a'});
 await call('pushSubscribe',{restaurant:'bravo-cafe',subscription:b,categories:['orders']});
 let t=await db.get('alpha-cafe','tenant','meta');await eventStore(db,t).put(t.id,'order','x',{id:'x',status:'Pending',created:Date.now()});
 const sent=[];await dispatchTenantPush(db,t.id,{send:async(s,p)=>sent.push([s,p])},['owner']);
 assert.equal(sent.length,1);assert.equal(sent[0][0].endpoint,a.endpoint);assert.equal(sent[0][1].url,'/r/alpha-cafe/admin');
 await eventStore(db,t).put(t.id,'order','y',{id:'y',status:'Pending',created:Date.now()});
 await call('member',{userId:'client-a',role:'manager',active:false});
 await dispatchTenantPush(db,t.id,{send:async()=>sent.push('bad')},['owner']);assert.equal(sent.length,1);
});
test('preferences and security-alert permissions are enforced for each recipient',async()=>{
 const {db,call}=await fixture();await call('member',{userId:'manager',role:'manager'});
 const sub=subscription();await call('pushSubscribe',{subscription:sub,categories:['alerts']},{$id:'manager'});
 const t=await db.get('alpha-cafe','tenant','meta');t.config.manager.devices=false;t.config.manager.blocking=false;await db.put(t.id,'tenant','meta',t);
 let sent=0;const transport={send:async()=>sent++};
 await eventStore(db,t).put(t.id,'notice','security',{kind:'security',created:Date.now()});
 await dispatchTenantPush(db,t.id,transport,['owner']);assert.equal(sent,0);
 await eventStore(db,t).put(t.id,'request','req',{created:Date.now(),status:'Pending',type:'music'});
 await dispatchTenantPush(db,t.id,transport,['owner']);assert.equal(sent,0);
 await eventStore(db,t).put(t.id,'notice','stock',{kind:'stock',created:Date.now()});
 await dispatchTenantPush(db,t.id,transport,['owner']);assert.equal(sent,1);
});
test('provider expiry removes stale subscription; transient failures stay queued and errors remain private',async()=>{
 const {db,call}=await fixture();const sub=subscription();await call('pushSubscribe',{subscription:sub,categories:['orders']});
 const t=await db.get('alpha-cafe','tenant','meta');await eventStore(db,t).put(t.id,'order','x',{status:'Pending',created:Date.now()});
 await dispatchTenantPush(db,t.id,{send:async()=>{throw Object.assign(Error('SECRET provider response'),{statusCode:503});}},['owner']);
 let e=(await db.all(t.id,'push-event'))[0];assert.equal(e.status,'pending');assert.equal(e.attempts,1);assert.equal(JSON.stringify(e).includes('SECRET'),false);
 e.retryAt=0;await db.put(t.id,'push-event',e.id,e);
 await dispatchTenantPush(db,t.id,{send:async()=>{throw Object.assign(Error('gone'),{statusCode:410});}},['owner']);
 assert.equal((await db.all(t.id,'push-subscription')).length,0);assert.equal((await db.all(t.id,'push-event'))[0].status,'sent');
});
test('concurrent worker invocations do not send the same event twice under an active lease',async()=>{
 const {db,call}=await fixture();await call('pushSubscribe',{subscription:subscription(),categories:['orders']});
 const t=await db.get('alpha-cafe','tenant','meta');await eventStore(db,t).put(t.id,'order','x',{status:'Pending',created:Date.now()});
 let count=0;const transport={send:async()=>{count++;await new Promise(r=>setTimeout(r,10));}};
 await Promise.all([dispatchTenantPush(db,t.id,transport,['owner']),dispatchTenantPush(db,t.id,transport,['owner'])]);assert.equal(count,1);
});
test('expired events are not sent; subscription limits and category allowlist are enforced',async()=>{
 const {db,call}=await fixture();await assert.rejects(call('pushSubscribe',{subscription:subscription(),categories:['forged']}));
 for(let i=0;i<5;i++)await call('pushSubscribe',{subscription:subscription('https://fcm.googleapis.com/fcm/send/device'+i),categories:['orders']});
 await assert.rejects(call('pushSubscribe',{subscription:subscription(),categories:['orders']}),e=>e.status===409);
 await db.put('alpha-cafe','push-event','old',{id:'old',status:'pending',category:'orders',created:Date.now()-7200000,attempts:0});
 let sent=0;await dispatchTenantPush(db,'alpha-cafe',{send:async()=>sent++},['owner']);assert.equal(sent,0);assert.equal((await db.get('alpha-cafe','push-event','old')).status,'expired');
 const payload=privatePayload({id:'a',slug:'alpha-cafe'},{id:'evt',category:'orders',customer:'private',eventType:'new'});assert.equal(JSON.stringify(payload).includes('private'),false);
});
test('real service order and request actions enqueue events only after successful writes',async()=>{
 const {db,call}=await fixture();
 const item=await call('item',{item:{id:'dish-001',name:'Tea',price:10,category:'Drinks'}});
 await call('table',{number:'T1'});const table=await db.get('alpha-cafe','table','T1');
 const device={device:'browser-0001',deviceToken:randomBytes(32).toString('hex')};
 const visit=await call('openVisit',{...device,table:'T1',qr:table.qr},null);
 const payload={...device,visit:visit.id,visitToken:visit.token,items:[{id:item.id,qty:1,size:null}],requestId:'test-order-001',expectedTotal:10};
 await call('place',payload,null);await call('place',payload,null);
 assert.equal((await db.all('alpha-cafe','push-event')).filter(e=>e.category==='orders').length,1);
 await call('request',{...device,visit:visit.id,visitToken:visit.token,requestId:'test-request-001',type:'call'},null);
 assert.equal((await db.all('alpha-cafe','push-event')).filter(e=>e.category==='requests').length,1);
 await assert.rejects(call('place',{...payload,requestId:'test-order-002',expectedTotal:1},null));
 assert.equal((await db.all('alpha-cafe','push-event')).filter(e=>e.category==='orders').length,1);
});
