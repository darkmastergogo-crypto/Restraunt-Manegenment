// Optional Playwright integration test. Use only the local in-memory demo.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');const fs=require('fs');const path=require('path');
const BASE=process.env.DEMO_BASE_URL || 'http://127.0.0.1:8744';
if(!['127.0.0.1','localhost'].includes(new URL(BASE).hostname))throw Error('Run this mutating test against the local in-memory demo only.');
const OUT=path.resolve(process.env.BROWSER_OUTPUT || 'browser-test-output');fs.mkdirSync(OUT,{recursive:true});
(async()=>{
 const b=await chromium.launch({...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),headless:true,args:['--no-sandbox']});
 const c=await b.newContext({viewport:{width:390,height:844}});const customer=await c.newPage(),staff=await c.newPage(),waiter=await c.newPage();const checks=[],errors=[];
 for(const p of [customer,staff,waiter])p.on('pageerror',e=>errors.push(e.message));
 const api=async x=>{const res=await c.request.post(BASE+'/demo-api',{data:x});const j=await res.json();assert.equal(res.ok(),true,JSON.stringify(j));return j.data};
 const data=await api({action:'staff',restaurant:'demo-cafe'});const qr=data.tables[0].qr;const wk=await api({action:'waiterLink',restaurant:'demo-cafe'});
 const menu=BASE+'/r/demo-cafe/menu?demo=1&table=T1&qr='+qr;
 await customer.goto(menu);await customer.locator('[data-action="call"]').waitFor();
 await customer.locator('[data-appearance-select]').selectOption('dark');
 assert.equal(await customer.locator('body').getAttribute('data-appearance'),'dark');
 assert.equal(await customer.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(23, 22, 20)');
 await customer.reload();await customer.locator('[data-action="call"]').waitFor();assert.equal(await customer.locator('[data-appearance-select]').inputValue(),'dark');checks.push('dark preference and palette survive reload');
 await customer.emulateMedia({colorScheme:'light'});await customer.locator('[data-appearance-select]').selectOption('system');assert.equal(await customer.locator('body').getAttribute('data-appearance'),'light');await customer.emulateMedia({colorScheme:'dark'});await customer.bringToFront();await customer.waitForFunction(()=>document.body.dataset.appearance==='dark');checks.push('device theme reacts to system changes');
 await customer.locator('[data-appearance-select]').selectOption('light');
 await staff.goto(BASE+'/r/demo-cafe/kitchen?demo=1');await staff.locator('#managerNav').waitFor();assert.equal(await staff.locator('[data-appearance-select]').inputValue(),'light');
 await customer.locator('[data-action="call"]').click();await customer.waitForTimeout(150);
 await staff.locator('[data-tab="requests"]').click();await staff.locator('.request-card').filter({hasText:'Waiter requested'}).last().waitFor();checks.push('customer call waiter appears in kitchen Requests');
 await waiter.goto(BASE+'/r/demo-cafe/waiter?demo=1#key='+wk.key);await waiter.locator('[data-tab="requests"]').click();await waiter.locator('.request-card').filter({hasText:'Waiter requested'}).last().waitFor();const request=waiter.locator('.request-card').filter({hasText:'Waiter requested'}).last();await request.locator('[data-next="On the way"]').click();await waiter.locator('.request-card').filter({hasText:'Waiter is on the way'}).last().waitFor();checks.push('waiter receives call and can mark On the way');
 await staff.locator('[data-tab="tables"]').click();await staff.waitForTimeout(500);await staff.locator('[data-table-name="T1"] input').fill('Garden Cabin 1');await staff.locator('[data-table-name="T1"] button[type="submit"]').click();await staff.waitForTimeout(500);console.log('table toast',await staff.locator('#toast').innerText());const updated=await api({action:'staff',restaurant:'demo-cafe'});assert.equal(updated.tables[0].displayName,'Garden Cabin 1');assert.equal(updated.tables[0].qr,qr);checks.push('custom table name saves without changing QR token');
 await customer.reload();await customer.locator('.table-badge').filter({hasText:'Garden Cabin 1'}).waitFor();
 await customer.locator('#menuSearch').fill('Vegetable');
 await customer.locator('[data-appearance-select]').selectOption('dark');assert.equal(await customer.locator('#menuSearch').inputValue(),'Vegetable');checks.push('appearance change preserves active menu search');
 await customer.locator('#menuSearch').fill('unlikely-dish-not-present');await customer.locator('[data-action="resetFilters"]').waitFor();await customer.locator('[data-action="resetFilters"]').click();assert.equal(await customer.locator('.item-card').count(),4);checks.push('empty menu filters have a working reset');
 await customer.locator('.item-card').first().locator('[data-action="qty"]').click();await customer.locator('[data-action="checkout"]').click();await customer.locator('#customerName').fill('Design test');await customer.locator('#customerNotes').fill('No onions');
 await customer.screenshot({path:path.join(OUT,'checkout-dark-390.png'),fullPage:false});
 assert.equal(await customer.locator('#modal').evaluate(el=>Math.round(el.getBoundingClientRect().width)),390);
 await customer.locator('#modal [data-action="submit"]').click();await customer.locator('.rp-confirmation').waitFor();checks.push('mobile cart drawer submits real local order and shows confirmation');
 await customer.locator('[data-action="trackOrder"]').click();await customer.locator('[data-tracking-order]').waitFor();const orderId=await customer.locator('[data-tracking-order]').getAttribute('data-tracking-order');assert.ok((await customer.locator('#modalBody').innerText()).includes('Waiting for kitchen acceptance'));
 await customer.screenshot({path:path.join(OUT,'tracking-dark-390.png'),fullPage:false});await customer.locator('#modalClose').click();
 await staff.locator('[data-tab="orders"]').click();await staff.waitForTimeout(300);await staff.locator(`[data-action="status"][data-id="${orderId}"][data-next="Cooking"]`).click();const accepted=await api({action:'staff',restaurant:'demo-cafe'});assert.equal(accepted.orders.find(o=>o.id===orderId).status,'Cooking');checks.push('kitchen accepts order and backend records Cooking');
 const layouts=[];
 for(const mode of ['light','dark']){
  await staff.locator('[data-appearance-select]').selectOption(mode);
  for(const tab of ['orders','billing','records','analytics','requests','tables','devices','menuEditor','stocks','customize','notifications','platform']){
   const nav=staff.locator(`[data-tab="${tab}"]`);if(!await nav.count())continue;
   await nav.click();await staff.waitForTimeout(150);
   for(const width of [360,768,1440]){
    await staff.setViewportSize({width,height:950});
    const r=await staff.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,theme:document.body.dataset.appearance}));
    assert.ok(r.scroll<=r.width+2,`${tab}/${mode}/${width}: ${r.scroll}`);layouts.push({tab,mode,...r});
   }
   if(['requests','tables','customize','billing','records','menuEditor'].includes(tab))await staff.screenshot({path:path.join(OUT,`${tab}-${mode}-1440.png`),fullPage:true});
  }
 }
 const other=await c.newPage();await other.goto(BASE+'/r/second-cafe/kitchen?demo=1');await other.locator('[data-appearance-select]').waitFor();assert.equal(await other.locator('[data-appearance-select]').inputValue(),'restaurant');checks.push('theme preference is isolated per restaurant');
 await other.goto(BASE+'/admin?demo=1');await other.locator('.owner-main').waitFor();assert.equal(await other.locator('[data-appearance-select]').inputValue(),'restaurant');checks.push('owner console has its own appearance preference');
 for(const mode of ['light','dark']){await other.locator('[data-appearance-select]').selectOption(mode);for(const width of [360,768,1440]){await other.setViewportSize({width,height:950});const overlap=await other.evaluate(()=>document.querySelector('main').getBoundingClientRect().top<document.querySelector('#app>header').getBoundingClientRect().bottom-1);assert.equal(overlap,false);}}
 checks.push('owner heading is not overlapped at phone, tablet or desktop widths');
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify({checks,layouts,errors},null,2));console.log(JSON.stringify({checks,layoutChecks:layouts.length,errors},null,2));await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
