import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../scripts/memory-store.mjs';
import {service} from '../functions/restaurant-api/src/service.mjs';
import {AppwriteSites,advanceHosting,advanceHostingBatch,safeOrigin} from '../functions/restaurant-api/src/sites.mjs';
const owner={$id:'owner'};
async function fixture(hosting={preflight:async()=>{},step:async j=>({...j,stage:'ready',status:'ready',origin:'https://example.appwrite.network'})}) {
 const db=new MemoryStore();await db.put('_platform','lock','write',{});
 const opts={hosting,mfaVerified:true};
 const call=(action,p={},user=owner)=>service(db,{action,...p},user,['owner'],opts);
 return {db,call,hosting};
}
const create=(call,name='Amirlal Cafe',extra={})=>call('provision',{name,requestId:crypto.randomUUID(),...extra});
test('name-only creation generates immutable UUID identity and safe unique slug',async()=>{
 const {db,call}=await fixture(); const a=await create(call),b=await create(call);
 assert.match(a.id,/^[a-f0-9-]{36}$/);assert.notEqual(a.id,b.id);assert.notEqual(a.slug,b.slug);
 assert.match(a.slug,/^amirlal-cafe-[a-f0-9]{8}$/);
 assert.equal((await db.get(a.id,'tenant','meta')).slug,a.slug);
 assert.equal((await call('public',{restaurant:a.slug},null)).restaurant_id,a.id);
 assert.equal((await call('staff',{restaurant:a.slug})).restaurant_id,a.id);
 const row=(await call('platform')).restaurants.find(r=>r.id===a.id);
 assert.equal(row.hosting.status,'queued');assert.equal(row.hosting.origin,undefined);
});
test('same request ID is idempotent, without merging equal restaurant names',async()=>{
 const {db,call}=await fixture(); const requestId=crypto.randomUUID();
 const [a,b]=await Promise.all([create(call,'Same',{requestId}),create(call,'Same',{requestId})]);
 assert.deepEqual(a,b);assert.equal((await db.all('_platform','registry')).length,1);
 const c=await create(call,'Same');assert.notEqual(c.id,a.id);
});
test('missing Sites setup fails before creating records and name is required',async()=>{
 const {db,call}=await fixture(null);
 await assert.rejects(create(call),e=>e.status===503);
 assert.equal((await db.all('_platform','registry')).length,0);
 const f=await fixture();await assert.rejects(create(f.call,'   '),e=>e.status===400);
});
test('forged owner fields cannot create sites, inspect status, retry or attach',async()=>{
 const {call}=await fixture();const a=await create(call);
 for(const action of ['provision','platform','siteStatus','retrySite','attachSite'])
  for(const user of [null,{$id:'stranger'}])
   await assert.rejects(call(action,{restaurant:a.slug,name:'Forged',requestId:crypto.randomUUID(),owner:true,role:'owner',userId:'owner',siteId:'victim'},user),e=>e.status===403);
});
test('MFA is required for provisioning control actions',async()=>{
 const {db,hosting,call}=await fixture();const a=await create(call);
 for(const action of ['provision','siteStatus','retrySite','attachSite'])
  await assert.rejects(service(db,{action,restaurant:a.slug,name:'MFA',requestId:crypto.randomUUID()},owner,['owner'],{hosting}),e=>e.status===403);
});
test('separate UUID tenants cannot read or change each other with matching record IDs',async()=>{
 const {call,db}=await fixture();const a=await create(call,'Cafe A'),b=await create(call,'Cafe B');
 const admin={$id:'client-a'};
 await call('member',{restaurant:a.slug,userId:admin.$id,role:'admin'});
 for(const [r,price] of [[a,10],[b,20]]) await call('item',{restaurant:r.slug,item:{id:'same-dish',name:'Tea',price,category:'Drinks'}});
 assert.equal((await call('staff',{restaurant:a.slug},admin)).items[0].price,10);
 for(const action of ['staff','item','settings','member','stock','removeItem','table','reset','features'])
  await assert.rejects(call(action,{restaurant:b.slug,restaurant_id:a.id,role:'owner',userId:'owner',id:'same-dish',item:{id:'same-dish',name:'Hacked',price:1}},admin),e=>e.status===403);
 assert.equal((await db.get(b.id,'item','same-dish')).price,20);
 const pub=await call('public',{restaurant:b.slug},null);
 for(const key of ['members','orders','devices','hosting','waiterHash'])assert.equal(pub[key],undefined);
});
test('customization of one UUID tenant leaves another unchanged',async()=>{
 const {call}=await fixture();const a=await create(call,'Alpha'),b=await create(call,'Bravo');
 const current=await call('staff',{restaurant:a.slug});current.config.brand.name='New Alpha';
 await call('settings',{restaurant:a.slug,config:current.config,revision:current.revision});
 assert.equal((await call('public',{restaurant:b.slug},null)).config.brand.name,'Bravo');
 assert.equal((await call('platform')).restaurants.find(r=>r.id===a.id).name,'New Alpha');
});
test('failed host provisioning does not lose restaurant data or leak raw provider errors',async()=>{
 const h={preflight:async()=>{},step:async()=>{throw Object.assign(Error('secret-api-key-do-not-leak'),{code:403});}};
 const {call,db}=await fixture(h);const r=await create(call);let result=await call('siteStatus',{restaurant:r.slug,siteId:'victim'});
 assert.equal(result.hosting.status,'failed');assert.doesNotMatch(JSON.stringify(result),/secret-api/);
 assert(await db.get(r.id,'tenant','meta'));assert.equal(result.hosting.origin,undefined);
 h.step=async j=>({...j,stage:'ready',status:'ready',origin:'https://safe.appwrite.network'});
 result=await call('retrySite',{restaurant:r.slug});assert.equal(result.hosting.status,'ready');
 assert.equal((await db.all('_platform','registry')).length,1);
});
test('lease prevents concurrent duplicate external provisioning calls',async()=>{
 let count=0;const {db,call,hosting}=await fixture({preflight:async()=>{},step:async j=>{count++;await new Promise(r=>setTimeout(r,30));return {...j,stage:'configure',status:'creating'};}});
 const r=await create(call);await Promise.all([advanceHosting(db,hosting,r.slug),advanceHosting(db,hosting,r.slug)]);assert.equal(count,1);
});
test('existing restaurants attach without changing identity or records',async()=>{
 const {db,call}=await fixture();await service(db,{action:'provision',slug:'legacy-cafe',name:'Legacy'},owner,['owner'],{requireMfa:false});
 await service(db,{action:'item',restaurant:'legacy-cafe',item:{id:'dish-old',name:'Old dish',price:5}},owner,['owner'],{requireMfa:false});
 await call('attachSite',{restaurant:'legacy-cafe'});assert.equal((await db.get('legacy-cafe','item','dish-old')).price,5);
 assert.equal((await call('staff',{restaurant:'legacy-cafe'})).id,'legacy-cafe');
});
function fakeSDK() {
 let site=null,deployment=null;const vars=new Map();const calls=[];
 const sites={get:async({siteId})=>siteId==='template' ? {installationId:'trusted-install',providerRepositoryId:'trusted-repo',providerBranch:'main',providerRootDirectory:'Restraunt Control'} : site || Promise.reject({code:404}),
 create:async x=>{calls.push(['create',x]);site={$id:x.siteId,description:x.description,providerBranch:x.providerBranch};return site;},
 createVariable:async x=>{vars.set(x.key,x.value);},updateVariable:async x=>vars.set(x.key,x.value),
 createVcsDeployment:async x=>{calls.push(['deploy',x]);deployment={$id:'deployment-1',status:'building'};Object.assign(site,{latestDeploymentId:deployment.$id,latestDeploymentCreatedAt:new Date(Date.now()+1000).toISOString()});return deployment;},
 getDeployment:async()=>deployment};
 const proxy={listRules:async()=>({rules:[{domain:'preview.invalid',type:'deployment',deploymentResourceId:site.$id,deploymentId:'preview',status:'verified'},
  {domain:'generated.appwrite.network',type:'deployment',deploymentResourceId:site.$id,deploymentId:'',deploymentVcsProviderBranch:'',status:'verified'}]})};
 const project={createWebPlatform:async x=>{calls.push(['platform',x]);}};
 return {sites,proxy,project,vars,calls,ready:()=>{deployment.status='ready';site.deploymentId=deployment.$id;}};
}
const config={endpoint:'https://fra.cloud.appwrite.io/v1',project:'project',key:'DO_NOT_EXPOSE',functionId:'function',templateId:'template',ownerURL:'https://owner.appwrite.network',restaurantBranch:'restaurant-live'};
test('Sites adapter creates isolated static site, deploys trusted repo and reads actual active domain',async()=>{
 const sdk=fakeSDK(),h=new AppwriteSites(config,sdk),r={id:crypto.randomUUID(),slug:'amirlal-cafe',name:'Amirlal Cafe'};
 let j={stage:'queued',status:'queued'};
 j=await h.step(j,r);assert.equal(j.stage,'configure');
 const created=sdk.calls[0][1];assert.deepEqual(created.scopes,[]);assert.equal(created.providerRepositoryId,'trusted-repo');assert.equal(created.providerBranch,'restaurant-live');assert.equal(created.fallbackFile,'index.html');
 j=await h.step(j,r);assert.equal(sdk.vars.get('RESTAURANT_ID'),r.id);assert.equal(sdk.vars.get('RESTAURANT_SLUG'),r.slug);assert.doesNotMatch(JSON.stringify([...sdk.vars]),/DO_NOT_EXPOSE/);
 j=await h.step(j,r);assert.equal(j.stage,'build');j=await h.step(j,r);assert.equal(j.status,'deploying');sdk.ready();
 j=await h.step(j,r);assert.equal(j.stage,'domain');j=await h.step(j,r);assert.equal(j.status,'ready');assert.equal(j.origin,'https://generated.appwrite.network');
 assert.equal(sdk.calls.at(-1)[0],'platform');assert.equal(sdk.calls.at(-1)[1].hostname,'generated.appwrite.network');
});
test('a domain alone is insufficient: auth platform registration failure prevents Ready',async()=>{
 const sdk=fakeSDK();sdk.project.createWebPlatform=async()=>{throw {code:403};};const h=new AppwriteSites(config,sdk);
 await assert.rejects(h.step({stage:'domain'},{id:'a',slug:'cafe',name:'Cafe'}));
});
test('unmanaged sites cannot be overwritten',async()=>{
 const sdk=fakeSDK();sdk.sites.get=async()=>({description:'Someone else'});
 await assert.rejects(new AppwriteSites(config,sdk).step({stage:'queued'},{id:'a',name:'A'}),/unmanaged/);
});
test('hosting accepts only HTTPS origins, not javascript or credential-bearing URLs',()=>{
 for(const url of ['http://bad.test','javascript:alert(1)','https://u:p@bad.test','https://good.test/path','https://good.test/?x=1']) assert.throws(()=>safeOrigin(url));
 assert.equal(safeOrigin('https://good.test'),'https://good.test');
});
test('private background batch advances queued jobs without public identity bypass',async()=>{
 const {db,call,hosting}=await fixture();await create(call);const result=await advanceHostingBatch(db,hosting);assert.equal(result.advanced,1);
 const restaurants=(await call('platform')).restaurants;assert.equal(restaurants[0].hosting.status,'ready');
});
test('expired lease resumes after interruption without changing tenant identity',async()=>{
 const {db,call,hosting}=await fixture();const r=await create(call);const job=await db.get('_platform','hosting',r.slug);
 await db.put('_platform','hosting',r.slug,{...job,lease:'old',leaseUntil:Date.now()-1});
 assert.equal((await advanceHosting(db,hosting,r.slug)).status,'ready');
 assert.equal((await db.get('_platform','registry',r.slug)).id,r.id);
});
test('provider rate limit is persisted as retrying, with no premature links',async()=>{
 const {db,call}=await fixture({preflight:async()=>{},step:async()=>{throw {code:429};}});const r=await create(call);
 const {hosting}=await call('siteStatus',{restaurant:r.slug});assert.equal(hosting.status,'retrying');assert.equal(hosting.origin,undefined);
 assert((await db.get('_platform','hosting',r.slug)).nextAttempt>Date.now());
});
test('failed build retries a fresh deployment rather than looping on failed build',async()=>{
 const sdk=fakeSDK(),h=new AppwriteSites(config,sdk),r={id:'restaurant',slug:'restaurant',name:'Cafe'};
 let j=await h.step({stage:'queued'},r);j=await h.step(j,r);j=await h.step(j,r);
 sdk.sites.getDeployment=async()=>({status:'failed'});
 const failed=await h.step(j,r);assert.equal(failed.status,'failed');assert.equal(failed.stage,'deploy');
 // Simulate an old failed deployment (created before the new retry configuration marker).
 const originalGet=sdk.sites.get;sdk.sites.get=async args=>({...await originalGet(args),latestDeploymentCreatedAt:'2000-01-01T00:00:00Z'});
 await h.step(failed,r);assert.equal(sdk.calls.filter(c=>c[0]==='deploy').length,2);
});
test('staff receives only its own ready Site origin for restaurant QR generation',async()=>{
 const {db,call}=await fixture();const a=await create(call,'A'),b=await create(call,'B');
 await db.put('_platform','hosting',a.slug,{slug:a.slug,stage:'ready',status:'ready',origin:'https://a.appwrite.network'});
 await db.put('_platform','hosting',b.slug,{slug:b.slug,stage:'ready',status:'ready',origin:'https://b.appwrite.network'});
 assert.equal((await call('staff',{restaurant:a.slug})).siteOrigin,'https://a.appwrite.network');
 assert.equal((await call('staff',{restaurant:b.slug})).siteOrigin,'https://b.appwrite.network');
});
