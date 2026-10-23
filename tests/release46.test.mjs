import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {MemoryStore} from '../scripts/memory-store.mjs';
import {service} from '../functions/restaurant-api/src/service.mjs';
import {token} from '../functions/restaurant-api/src/domain.mjs';
async function fixture() {
 const db=new MemoryStore(), owner={$id:'owner'}, opts={requireMfa:false};
 const call=(action,p={},u=owner)=>service(db,{action,restaurant:'alpha-cafe',...p},u,['owner'],opts);
 await db.put('_platform','lock','write',{});
 for(const slug of ['alpha-cafe','bravo-cafe']) await call('provision',{slug,name:slug});
 await call('item',{item:{id:'dish-001',name:'Tea',category:'Drinks',price:10}});
 await call('table',{number:'T1'});
 const table=await db.get('alpha-cafe','table','T1');
 const device={device:'browser-0001',deviceToken:token()};
 const visit=await call('openVisit',{...device,table:'T1',qr:table.qr},null);
 const payload={...device,visit:visit.id,visitToken:visit.token,items:[{id:'dish-001',qty:1,size:null}],expectedTotal:10};
 return {db,call,table,payload,device};
}
test('customer assistance acknowledgement corresponds to stored staff-visible request',async()=>{
 const {call,payload}=await fixture();
 const r=await call('request',{...payload,kind:'assistance',requestId:'call-00001'},null);
 assert.equal(r.saved,true);assert.equal(r.id,'call-00001');
 assert.equal((await call('staff')).requests.find(x=>x.id===r.id).type,'assistance');
 assert.equal((await call('staff',{restaurant:'bravo-cafe'})).requests.length,0);
 const replay=await call('request',{...payload,kind:'assistance',requestId:r.id},null);
 assert.equal(replay.id,r.id);assert.equal((await call('staff')).requests.length,1);
});
test('kitchen counter calls remain visible in kitchen Requests, not just waiter feed',async()=>{
 const {call}=await fixture(); await call('counterCall');
 const req=(await call('staff')).requests;assert.equal(req.length,1);assert.equal(req[0].type,'counter');
 await call('handle',{id:req[0].id,next:'On the way'});
 assert((await call('staff')).requests[0].onWay);
 await call('handle',{id:req[0].id,next:'Handled'});
 assert.equal((await call('staff')).requests[0].status,'Handled');
});
test('counter call cannot report success while Requests feature is disabled',async()=>{
 const {call}=await fixture();await call('entitlements',{features:{requests:false}});
 await assert.rejects(call('counterCall'),e=>e.status===403);
});
test('table rename preserves stable ID, QR, current visits and separate tenant names',async()=>{
 const {db,call,table,payload,device}=await fixture();
 await call('table',{number:'T1',displayName:'Garden Cabin 🌿'});
 const renamed=await db.get('alpha-cafe','table','T1');
 await call('table',{number:'T1',displayName:'🌿'.repeat(60)});
 assert.equal((await db.get('alpha-cafe','table','T1')).displayName,'🌿'.repeat(60));
 await call('table',{number:'T1',displayName:'Garden Cabin 🌿'});
 assert.equal(renamed.id,'T1');assert.equal(renamed.qr,table.qr);assert.equal(renamed.keyHash,table.keyHash);
 const o=await call('place',{...payload,requestId:'order-0001'},null);
 assert.equal(o.tableName,'Garden Cabin 🌿');assert.equal(o.table,'T1');
 const visit=await call('openVisit',{...device,table:'T1',qr:table.qr},null);
 assert.equal(visit.tableName,'Garden Cabin 🌿');
 await call('table',{number:'T1',displayName:'Upstairs Booth'});
 assert.equal((await call('customerOrders',device,null)).orders[0].tableName,'Garden Cabin 🌿');
 await call('table',{restaurant:'bravo-cafe',number:'T1',displayName:'Other cafe'});
 assert.equal((await db.get('alpha-cafe','table','T1')).displayName,'Upstairs Booth');
 const pub=await call('public',{},null);assert.equal(pub.tables,undefined);assert.doesNotMatch(JSON.stringify(pub),new RegExp(table.qr));
});
test('invalid table names and unauthorized table renames are rejected',async()=>{
 const {call}=await fixture();
 for(const displayName of ['', '   ', 'a'.repeat(61), 123]) await assert.rejects(call('table',{number:'T1',displayName}),e=>e.status===400);
 await call('member',{userId:'manager',role:'manager'});
 await assert.rejects(call('table',{number:'T1',displayName:'Bad'},{$id:'manager'}),e=>e.status===403);
 await assert.rejects(call('table',{number:'T1',displayName:'Bad'},null),e=>e.status===401);
 await call('table',{number:'T1',reserved:true},{$id:'manager'});
});
test('concurrent third pending order rejected; accepting one frees exactly one slot',async()=>{
 const {db,call,payload}=await fixture();
 const results=await Promise.allSettled([1,2,3].map(i=>call('place',{...payload,requestId:'order-000'+i},null)));
 assert.equal(results.filter(x=>x.status==='fulfilled').length,2);
 assert.equal(results.filter(x=>x.status==='rejected').length,1);
 const first=results.find(x=>x.status==='fulfilled').value;
 await call('status',{id:first.id,next:'Cooking',expected:'Pending'});
 await call('place',{...payload,requestId:'order-0004'},null);
 assert.equal((await db.all('alpha-cafe','order')).filter(o=>o.status==='Pending').length,2);
 await assert.rejects(call('place',{...payload,requestId:'order-0005'},null),/Pending order limit/);
});
test('order limit is per device, not whole restaurant, and cannot exceed two via old config',async()=>{
 const {db,call,payload,table}=await fixture();
 const t=await db.get('alpha-cafe','tenant','meta');t.config.behavior.pendingCap=50;await db.put('alpha-cafe','tenant','meta',t);
 for(let i=1;i<=2;i++)await call('place',{...payload,requestId:'limit-000'+i},null);
 await assert.rejects(call('place',{...payload,requestId:'limit-0003'},null),/Pending order limit/);
 const d={device:'browser-0002',deviceToken:token()};const v=await call('openVisit',{...d,table:'T1',qr:table.qr},null);
 await call('place',{...payload,...d,visit:v.id,visitToken:v.token,requestId:'limit-0004'},null);
 assert.equal((await call('staff')).orders.length,3);
});
test('install manifests have role-specific IDs and complete local icons',()=>{
 const ids=new Set();for(const name of ['manifest','kitchen','waiter','owner']) {
  const m=JSON.parse(fs.readFileSync('public/'+name+'.webmanifest'));
  assert.equal(m.display,'standalone');assert(m.start_url.startsWith('/'));assert(!m.start_url.includes('?'));
  ids.add(m.id);for(const size of ['192x192','512x512']) {
   const icon=m.icons.find(i=>i.sizes===size);assert(icon);assert(fs.statSync('public'+icon.src).size>0);
  }
 }assert.equal(ids.size,4);
});
test('PWA registers independently of push and never caches private API data',()=>{
 const install=fs.readFileSync('public/install-app.mjs','utf8'),sw=fs.readFileSync('public/push-sw.js','utf8');
 assert.match(install,/register\('\/push-sw.js'/);assert.match(install,/beforeinstallprompt/);
 assert.match(sw,/addEventListener\('fetch'/);assert.doesNotMatch(sw,/caches\.(open|match|put)|cache\.put|indexedDB/);
 assert.match(sw,/No orders or requests are sent while offline/);
 assert.match(sw,/addEventListener\('push'/);
});
