/* Release 68 — counter billing in the billing-app style (kitchen app and waiter app).
   Dish cards with category chips and search, a bill on the right (a sheet on phones),
   table / counter, guest name, notes, billing-app payment methods, save or save & print.
   Same safe server flow as before: one request ID per bill, retry never makes a double bill,
   totals are checked by the server, tracked stock is deducted once. */
'use strict';
const YummyBilling=(()=>{
 let menu=[],tax={},cart=new Map(),loaded=false,saving=false,pending=null,lastOrder=null,waiterOpen=false,paymentMethod='Cash',category='All',categories=[];
 let total=0,hasMore=false,pageBusy=false,pageRequest=0,searchTimer=null,observer=null,reloadQueued=false,table='Counter',tables=[],printAfter=false;
 let billing73=false,billingSettings={max_discount_percent:0,max_cash_short:0,round_nearest_rupee:false,ask_customer_phone:false,ask_customer_address:false};
 const PAGE=24,el=id=>document.getElementById(id),isWaiter=()=>document.body.classList.contains('waiter-site');
 const auth=()=>isWaiter()?{p_key:waiterKey}:{};
 const rpc=(name,args={})=>Cloud.rpc(name,{...auth(),...args},!isWaiter());
 const money=v=>(Cloud.cfg.currency||'₹')+Number(v||0).toFixed(2);
 const esc=v=>Cloud.esc(String(v??''));
 const storageKey=()=> 'YUMMY_MANUAL_PENDING_v1:'+new URL(Cloud.cfg.supabaseUrl).host+':'+(isWaiter()?'waiter':'staff');
 const lineKey=line=>line.custom?String(line.id):JSON.stringify([line.id,line.size??null]);
 const visible=()=>{const r=el('billingSection');return r&&!r.hidden&&r.offsetParent!==null;};
 function storePending(){try{if(pending)Cloud.sessionWrite(storageKey(),pending,!isWaiter());else Cloud.sessionRemove(storageKey(),!isWaiter());}catch{}}
 function setup(){
  const root=el('billingSection');if(root.dataset.ready68)return;root.dataset.ready68='true';
  root.innerHTML=`<div class="pos68">
   <section class="pos68-catalog" aria-label="Menu">
    <div class="pos68-search"><span class="pos68-search-ic" aria-hidden="true"></span><input id="manualSearch" type="search" placeholder="Search dishes, code or barcode${isWaiter()?'':' (F2)'}" autocomplete="off" aria-label="Search dishes"><button id="pos68Custom" type="button" class="secondary-btn pos68-plus" title="Item not on the menu (Alt+X)" aria-label="Add an item that is not on the menu">+</button><button id="manualRefresh" type="button" class="secondary-btn pos68-refresh" title="Refresh menu" aria-label="Refresh menu">↻</button></div>
    <div class="chips68 pos68-cats" id="pos68Cats" role="group" aria-label="Categories"></div>
    <p id="manualMenuCount63" class="pos68-count"></p>
    <div id="manualMenu" class="pos68-grid"></div>
    <div id="manualMenuSentinel63" class="lazy-sentinel63" role="status"></div><button id="manualLoadMore63" type="button" class="secondary-btn" hidden>Load more dishes</button>
   </section>
   <aside class="pos68-ticket" id="pos68Ticket" aria-label="Current bill">
    <div class="pos68-ticket-head"><h3>Current bill</h3><button id="pos68Close" type="button" class="secondary-btn pos68-close" aria-label="Close bill">×</button></div>
    <div class="pos68-meta"><label>For<select id="pos68Table"><option value="Counter">Counter</option></select></label><label>Guest name<input id="pos68Name" maxlength="80" placeholder="Optional"></label><label id="pos68PhoneWrap" hidden>Phone<input id="pos68Phone" type="tel" maxlength="40" placeholder="Optional"></label><label id="pos68AddressWrap" class="pos68-meta-wide" hidden>Address<input id="pos68Address" maxlength="300" placeholder="Optional"></label></div>
    <div id="manualCart" class="pos68-lines"></div>
    <label class="pos68-notes">Notes<input id="pos68Notes" maxlength="300" placeholder="Optional, printed on the bill"></label>
    <div id="pos68CustomFields" class="pos68-customfields"></div>
    <div id="pos68BillTools" class="pos68-billtools" hidden><div class="pos68-discount"><label>Discount<select id="pos68DiscountType"><option value="none">No discount</option><option value="percent">Percent %</option><option value="fixed">Fixed amount</option></select></label><label id="pos68DiscountValueWrap" hidden>Value<input id="pos68DiscountValue" type="number" min="0" step="0.01" inputmode="decimal" value="0"></label></div><div id="pos68CashWrap" class="pos68-cash" hidden><label>Cash received<input id="pos68CashReceived" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Exact or more"></label><small id="pos68CashHint"></small></div></div>
    <div id="manualTotals" class="pos68-totals"></div>
    <p id="manualPendingNotice" class="hint pos68-pending" hidden>Checking a previous submission. Retry uses the same bill ID and cannot deduct stock twice. Keep this tab open.</p>
    <div class="pos68-pay" role="radiogroup" aria-label="Paid through">${(window.Business73?.paymentMethods?.()||['Cash','Online']).map(m=>`<label><input type="radio" name="manualPayment" value="${esc(m)}"><span>${esc(m==='Online'?'Online / UPI':m)}</span></label>`).join('')}</div>
    <div class="pos68-actions"><button id="manualDone" type="button" class="primary-btn" disabled>Save${isWaiter()?'':' · F8'}</button><button id="pos68Print" type="button" class="secondary-btn" disabled>Save & print${isWaiter()?'':' · F9'}</button></div>
    <div class="pos68-sub"><button id="manualClear" type="button" class="linkish68">Clear bill</button><button id="manualLastBill" type="button" class="linkish68" hidden>Last bill</button></div>
    <p id="manualStatus" class="pos68-status" role="status" aria-live="polite"></p>
   </aside>
   <div id="manualMobileCheckout" class="pos68-bar" role="region" aria-label="Bill total"><span><small id="manualMobilePayment">Empty bill</small><b id="manualMobileTotal">₹0.00</b></span><button id="manualMobileDone" type="button" class="primary-btn">View bill</button></div>
   <div class="pos68-scrim" id="pos68Scrim"></div>
  </div>`;
  el('manualSearch').oninput=()=>{clearTimeout(searchTimer);el('manualMenuCount63').textContent='Searching…';searchTimer=setTimeout(()=>loadPage(true),220);};
  el('manualSearch').onkeydown=async e=>{if(e.key==='Enter'){e.preventDefault();const q=el('manualSearch').value.trim();if(q&&window.Business73?.lookup){try{const hit=await window.Business73.lookup(q);if(hit?.id){const at=menu.findIndex(x=>x.id===hit.id);if(at>=0)menu[at]=hit;else menu.unshift(hit);if(hit.category&&!categories.includes(hit.category))categories.push(hit.category);category='All';paintCats();el('manualSearch').value=hit.name||q;renderMenu();const found=options().filter(o=>o.id===hit.id&&o.available);if(found.length===1){addOption(found[0].key,1);status('Added '+found[0].name+' from code / barcode.');}else status(found.length?'Item found · choose the size to add.':'Item found but it is currently unavailable.');return;}}catch{}}const first=el('manualMenu').querySelector('[data-pos-add]:not([disabled])');if(first)first.click();}};
  el('manualRefresh').onclick=()=>open();el('manualDone').onclick=()=>{printAfter=false;done();};el('pos68Print').onclick=()=>{printAfter=true;done();};
  el('manualMobileDone').onclick=()=>toggleTicket(true);el('pos68Close').onclick=()=>toggleTicket(false);el('pos68Scrim').onclick=()=>toggleTicket(false);
  el('pos68Custom').onclick=addCustomItem;el('manualLoadMore63').onclick=()=>loadPage(false);
  el('pos68Table').onchange=e=>{table=e.target.value;};
  el('pos68DiscountType').onchange=()=>{el('pos68DiscountValueWrap').hidden=el('pos68DiscountType').value==='none';render();};
  el('pos68DiscountValue').oninput=render;el('pos68CashReceived').oninput=render;
  el('pos68Cats').onclick=e=>{const b=e.target.closest('[data-cat]');if(!b)return;category=b.dataset.cat;paintCats();loadPage(true);};
  for(const input of root.querySelectorAll('input[name=manualPayment]'))input.onchange=()=>{if(pending?.payload?.p_payment_method||saving)return;paymentMethod=input.value;render();};
  el('manualClear').onclick=()=>{if(!pending&&!saving&&cart.size&&confirm('Clear this bill?')){cart.clear();el('pos68Name').value='';el('pos68Notes').value='';if(el('pos68Phone'))el('pos68Phone').value='';if(el('pos68Address'))el('pos68Address').value='';if(el('pos68DiscountType'))el('pos68DiscountType').value='none';if(el('pos68DiscountValue'))el('pos68DiscountValue').value='0';if(el('pos68CashReceived'))el('pos68CashReceived').value='';clearCustomFields();render();}};el('manualLastBill').onclick=()=>showReceipt(lastOrder);
  root.addEventListener('click',event=>{
   const add=event.target.closest('[data-pos-add]');if(add){addOption(add.dataset.posAdd,1);return;}
   const step=event.target.closest('[data-pos-step]');if(step){stepLine(step.dataset.key,Number(step.dataset.posStep));return;}
  });
  try{const saved=Cloud.sessionRead(storageKey(),null,!isWaiter());if(saved?.id&&saved?.payload&&Array.isArray(saved.lines)){pending=saved;paymentMethod=saved.payload.p_payment_method||paymentMethod;table=saved.payload.p_table||'Counter';for(const line of saved.lines)cart.set(lineKey(line),line);}}catch{}
  if('IntersectionObserver' in window){observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting&&hasMore&&!pageBusy)loadPage(false);},{root:null,rootMargin:'240px 0px',threshold:0});observer.observe(el('manualMenuSentinel63'));}else el('manualLoadMore63').hidden=false;
  loadTables();
 }
 async function loadTables(){
  try{const data=await Cloud.rpc('restaurant_table_names',{},false).catch(()=>null);const list=Array.isArray(data)?data:Array.isArray(data?.tables)?data.tables:[];tables=list.map(t=>t.table_number).filter(t=>/^T[1-9][0-9]{0,3}$/.test(t));
   const sel=el('pos68Table');if(sel)sel.innerHTML=['Counter',...tables].map(t=>`<option value="${esc(t)}"${t===table?' selected':''}>${esc(t==='Counter'?'Counter':(Cloud.tableName?.(t)||t))}</option>`).join('');}catch{}
 }
 function fieldLabels(){const raw=window.Custom48?.get?.()?.bill?.customFieldLabels;return Array.isArray(raw)?raw.map(x=>String(x||'').trim()).filter(Boolean).slice(0,10):[];}
 function paintCustomFields(){const box=el('pos68CustomFields');if(!box)return;const old={};for(const i of box.querySelectorAll('input[data-bill73-field]'))old[i.dataset.bill73Field]=i.value;const labels=billing73?fieldLabels():[];box.innerHTML=labels.map((label,i)=>`<label class="${i===labels.length-1&&labels.length%2?'pos68-field-wide':''}">${esc(label)}<input data-bill73-field="${esc(label)}" maxlength="200" value="${esc(old[label]||'')}" placeholder="Optional"></label>`).join('');}
 function customFieldValues(){const out={};for(const i of el('pos68CustomFields')?.querySelectorAll('input[data-bill73-field]')||[]){const v=i.value.trim();if(v)out[i.dataset.bill73Field]=v;}return out;}
 function clearCustomFields(){for(const i of el('pos68CustomFields')?.querySelectorAll('input[data-bill73-field]')||[])i.value='';}
 async function loadBilling73(){
  try{const out=await rpc('restaurant_billing_settings73',{p_action:'get',p:{}});if(out?.available){billing73=true;billingSettings={...billingSettings,...out};}}catch(e){billing73=false;}
  try{await window.Custom48?.sync?.();}catch{}
  if(el('pos68BillTools'))el('pos68BillTools').hidden=!billing73;if(el('pos68PhoneWrap'))el('pos68PhoneWrap').hidden=!(billing73&&billingSettings.ask_customer_phone);if(el('pos68AddressWrap'))el('pos68AddressWrap').hidden=!(billing73&&billingSettings.ask_customer_address);paintCustomFields();render();
 }
 function bill73(){
  const base=totals(),type=billing73?(el('pos68DiscountType')?.value||'none'):'none',raw=Number(el('pos68DiscountValue')?.value||0);let value=Number.isFinite(raw)&&raw>0?raw:0,discount=0;
  if(type==='percent')discount=Math.min(base.total,Math.round(base.total*Math.min(value,Number(billingSettings.max_discount_percent||0))*100/100)/100);
  else if(type==='fixed')discount=Math.min(base.total,value);
  let final=Math.max(0,Math.round((base.total-discount)*100)/100),round=0;if(billing73&&billingSettings.round_nearest_rupee){const r=Math.round(final);round=Math.round((r-final)*100)/100;final=r;}
  const cashRaw=el('pos68CashReceived')?.value??'',cash=cashRaw===''?null:Number(cashRaw);let change=0,short=0;if(paymentMethod==='Cash'&&cash!==null&&Number.isFinite(cash)&&cash>=0){if(cash>=final)change=Math.round((cash-final)*100)/100;else short=Math.round((final-cash)*100)/100;}
  return {...base,discountType:type,discountValue:value,discount,round,final,cash,change,short};
 }
 function applyBilling73(){if(!el('pos68BillTools'))return;el('pos68BillTools').hidden=!billing73;el('pos68PhoneWrap').hidden=!(billing73&&billingSettings.ask_customer_phone);el('pos68AddressWrap').hidden=!(billing73&&billingSettings.ask_customer_address);const cash=billing73&&paymentMethod==='Cash';el('pos68CashWrap').hidden=!cash;const hint=el('pos68CashHint');if(hint)hint.textContent=Number(billingSettings.max_cash_short)>0?`Up to ${money(billingSettings.max_cash_short)} short cash is allowed.`:'Enter cash to calculate change.';}
 function toggleTicket(open){
  // app69.css opens the mobile bill sheet through .is-open on the sheet/scrim.
  // The old app68.css listened to body.pos68-open, which is no longer loaded.
  document.body.classList.toggle('pos68-open',!!open);
  const sheet=el('pos68Ticket'),scrim=el('pos68Scrim'),trigger=el('manualMobileDone');
  sheet?.classList.toggle('is-open',!!open);
  scrim?.classList.toggle('is-open',!!open);
  if(sheet){sheet.setAttribute('role','region');sheet.setAttribute('aria-label','Current bill');}
  if(trigger)trigger.setAttribute('aria-expanded',String(!!open));
  if(open)el('pos68Close')?.focus({preventScroll:true});
  else if(document.activeElement?.closest?.('#pos68Ticket'))trigger?.focus({preventScroll:true});
 }
 function paintCats(){const box=el('pos68Cats');if(!box)return;box.innerHTML=['All',...categories].map(c=>`<button type="button" data-cat="${esc(c)}" aria-pressed="${c===category}">${esc(c==='All'?'All items':c)}</button>`).join('');}
 function options(){return menu.flatMap(m=>{if(!m.available)return [];return (m.sizes_enabled?MenuOptions.keys(m):[null]).map(size=>{const stock=size?m.size_stock?.[size]:m.stock;return {id:m.id,size,key:JSON.stringify([m.id,size]),name:m.name+(size?' — '+MenuOptions.label(m,size):''),dish:m.name,sizeLabel:size?MenuOptions.label(m,size):'',category:m.category,price:Number(size?m.size_prices[size]:m.price),veg:m.veg!==false,stock,available:!stock?.tracked||stock.remaining>0};});});}
 function addOption(key,n){
  if(pending||saving)return;const o=options().find(x=>x.key===key);if(!o||!o.available)return;
  const cur=cart.get(key),qty=Math.min(50,(cur?.qty||0)+n);
  if(o.stock?.tracked&&qty>Number(o.stock.remaining)){status(`Only ${o.stock.remaining} left of ${o.name}.`);return;}
  cart.set(key,{id:o.id,size:o.size,qty,name:o.name,price:o.price,veg:o.veg});render();
  const card=el('manualMenu').querySelector(`[data-pos-add="${CSS.escape(key)}"]`);if(card){card.classList.remove('pos68-bump');void card.offsetWidth;card.classList.add('pos68-bump');}
 }
 function stepLine(key,n){
  if(pending||saving)return;
  const line=cart.get(key);if(!line)return;
  const qty=line.qty+n;
  if(qty<=0)cart.delete(key);
  else {
   const option=line.custom?null:options().find(o=>o.key===key);
   if(!line.custom&&option?.stock?.tracked&&qty>Number(option.stock.remaining)){
    status(`Only ${option.stock.remaining} left of ${line.name}.`);return;
   }
   cart.set(key,{...line,qty:Math.min(50,qty)});
  }
  render();
 }
 function status(t){const s=el('manualStatus');if(s)s.textContent=t;}
 async function refreshSelectedMenuLines(){
  const removed=[],selected=[...cart.entries()].filter(([,line])=>!line.custom);
  try{
   for(const [key,line] of selected){
    const known=menu.find(item=>String(item.id)===String(line.id));
    const query=known?.name||String(line.name||'').replace(/\s+—\s+[^—]+$/,'').trim();
    const data=await rpc('restaurant_manual_menu_page63',{p_query:query,p_category:'All',p_offset:0,p_limit:40});
    const item=(data?.items||[]).find(candidate=>String(candidate.id)===String(line.id));
    let option=null;
    if(item?.available!==false){
     const size=line.size??null,hasSize=item.sizes_enabled&&size&&MenuOptions.keys(item).includes(size)&&Object.prototype.hasOwnProperty.call(item.size_prices||{},size);
     if((item.sizes_enabled&&hasSize)||(!item.sizes_enabled&&!size)){
      const stock=size?item.size_stock?.[size]:item.stock,price=Number(size?item.size_prices[size]:item.price);
      if(Number.isFinite(price)&&price>=0&&(!stock?.tracked||Number(stock.remaining)>0))option={name:item.name+(size?' — '+MenuOptions.label(item,size):''),price,veg:item.veg!==false};
     }
    }
    if(!option){cart.delete(key);removed.push(line.name);}
    else cart.set(key,{...line,...option});
   }
   return removed;
  }catch{return null;}
 }
 function addCustomItem(){
  if(pending||saving)return;
  let d=el('pos68CustomDialog');if(!d){d=document.createElement('dialog');d.id='pos68CustomDialog';d.className='dlg68';document.body.append(d);}
  d.innerHTML=`<form class="dlg68-form" method="dialog"><div class="dlg68-head"><h2>Item not on the menu</h2><button type="button" class="secondary-btn" data-close68 aria-label="Close">×</button></div><p class="hint">Added only to this bill. It does not change the menu or stock.</p><label>Item name<input name="name" maxlength="120" required placeholder="e.g. Water bottle"></label><div class="dlg68-2"><label>Price<input name="price" type="number" min="0.01" max="999999.99" step="0.01" inputmode="decimal" required></label><label>Qty<input name="qty" type="number" min="1" max="50" step="1" value="1" inputmode="numeric" required></label></div><div class="toolbar"><button class="primary-btn" type="submit">Add to bill</button><button class="secondary-btn" type="button" data-close68>Cancel</button></div></form>`;
  d.showModal();setTimeout(()=>d.querySelector('[name=name]').focus(),30);
  d.querySelector('form').onsubmit=e=>{e.preventDefault();const f=e.target,name=String(f.elements.namedItem('name')?.value||'').trim(),price=Number(f.elements.namedItem('price')?.value),qty=Number(f.elements.namedItem('qty')?.value);
   if(!name||!Number.isFinite(price)||price<=0||!Number.isInteger(qty)||qty<1||qty>50)return;
   const id='custom:'+crypto.randomUUID();cart.set(id,{id,custom:true,name,price:Math.round(price*100)/100,qty});d.close();render();status('Item added to this bill only.');};
 }
 function renderMenu(){
  if(!el('manualMenu'))return;const all=options();
  el('manualMenu').innerHTML=all.length?all.map(o=>{const q=cart.get(o.key)?.qty||0,st=o.stock?.tracked?Number(o.stock.remaining):null;
   return `<button type="button" class="pos68-card${q?' in-bill':''}${o.available?'':' is-out'}" data-pos-add="${esc(o.key)}" ${!o.available||saving||pending?'disabled':''} aria-label="Add ${esc(o.name)}, ${money(o.price)}">
    <span class="pos68-card-top"><i class="pos68-diet ${o.veg?'veg':'nonveg'}" aria-hidden="true"></i><b>${esc(o.dish)}</b></span>${o.sizeLabel?`<small class="pos68-size">${esc(o.sizeLabel)}</small>`:''}
    <span class="pos68-card-bottom"><strong>${money(o.price)}</strong>${st!==null?`<em class="pos68-stock${st<=5?' low':''}">${st?st+' left':'Sold out'}</em>`:''}</span>${q?`<span class="pos68-qty">${q}</span>`:''}</button>`;}).join(''):`<div class="empty68">${loaded?'No dishes match.':'Loading menu…'}</div>`;
  el('manualMenuCount63').textContent=loaded?`${all.length} item${all.length===1?'':'s'}${total>menu.length?` · ${total} dishes, scroll for more`:''}`:'';
  el('manualMenuSentinel63').textContent=pageBusy&&menu.length?'Loading more…':'';
  if(!observer)el('manualLoadMore63').hidden=!hasMore;
 }
 function totals(){const cents=[...cart.values()].reduce((sum,line)=>sum+line.qty*Math.round(line.price*100),0);const taxCents=tax.tax_enabled?(tax.tax_mode==='percent'?Math.round(cents*Math.round(Number(tax.tax_value)*100)/10000):Math.round(Number(tax.tax_value)*100)):0;return {subtotal:cents/100,tax:taxCents/100,total:(cents+taxCents)/100};}
 function render(){
  renderMenu();applyBilling73();const t=bill73(),count=[...cart.values()].reduce((s,l)=>s+l.qty,0),lock=saving||!!pending;
  el('manualCart').innerHTML=cart.size?[...cart.entries()].map(([key,line])=>`<div class="pos68-line${line.custom?' custom':''}"><span class="pos68-line-name"><b>${esc(line.name)}</b><small>${money(line.price)}${line.custom?' · not on menu':''}</small></span><span class="pos68-qty"><button class="pos68-step" type="button" data-pos-step="-1" data-key="${esc(key)}" aria-label="One less ${esc(line.name)}" ${lock?'disabled':''}>−</button><b>${line.qty}</b><button class="pos68-step" type="button" data-pos-step="1" data-key="${esc(key)}" aria-label="One more ${esc(line.name)}" ${lock?'disabled':''}>+</button></span><strong>${money(line.qty*line.price)}</strong></div>`).join(''):'<div class="pos68-empty"><b>Bill is empty</b><span>Tap a dish to add it.</span></div>';
  el('manualTotals').innerHTML=`<div><span>Items (${count})</span><b>${money(t.subtotal)}</b></div>${tax.tax_enabled?`<div><span>Tax ${tax.tax_mode==='percent'?'('+Number(tax.tax_value)+'%)':'(fixed)'}</span><b>${money(t.tax)}</b></div>`:''}${billing73&&t.discount>0?`<div class="pos68-saving"><span>Discount${t.discountType==='percent'?' ('+Number(t.discountValue)+'%)':''}</span><b>−${money(t.discount)}</b></div>`:''}${billing73&&t.round!==0?`<div><span>Round off</span><b>${t.round>0?'+':''}${money(t.round)}</b></div>`:''}<div class="pos68-grand"><span>Total</span><b>${money(t.final)}</b></div>${billing73&&paymentMethod==='Cash'&&t.cash!==null&&Number.isFinite(t.cash)?`<div class="${t.short>Number(billingSettings.max_cash_short||0)?'pos68-error':'pos68-change'}"><span>${t.short>0?'Short cash':'Change'}</span><b>${money(t.short>0?t.short:t.change)}</b></div>`:''}`;
  const canSubmit=!saving&&!!paymentMethod&&(pending||loaded&&cart.size>0);
  el('manualDone').disabled=!canSubmit;el('pos68Print').disabled=!canSubmit;
  el('manualDone').textContent=saving?'Saving…':pending?'Check / retry':'Save'+(isWaiter()?'':' · F8');
  el('manualClear').disabled=lock;el('manualPendingNotice').hidden=!pending;el('manualRefresh').disabled=saving;el('pos68Custom').disabled=lock;
  el('manualMobileTotal').textContent=money(t.final);el('manualMobilePayment').textContent=count?`${count} item${count===1?'':'s'} · ${paymentMethod||'choose payment'}`:'Empty bill';
  el('pos68Table').disabled=lock;el('pos68Name').disabled=lock;el('pos68Notes').disabled=lock;if(el('pos68Phone'))el('pos68Phone').disabled=lock;if(el('pos68Address'))el('pos68Address').disabled=lock;if(el('pos68DiscountType'))el('pos68DiscountType').disabled=lock;if(el('pos68DiscountValue'))el('pos68DiscountValue').disabled=lock;if(el('pos68CashReceived'))el('pos68CashReceived').disabled=lock;for(const i of el('pos68CustomFields')?.querySelectorAll('input')||[])i.disabled=lock;
  for(const input of el('billingSection').querySelectorAll('input[name=manualPayment]')){input.checked=input.value===paymentMethod;input.disabled=saving||!!pending?.payload?.p_payment_method;}
 }
 async function loadPage(reset){
  setup();if(pageBusy){if(reset)reloadQueued=true;return;}const request=++pageRequest,pageOffset=reset?0:menu.length;if(reset){menu=[];total=0;hasMore=false;loaded=false;renderMenu();}
  pageBusy=true;renderMenu();
  try{
   const data=await rpc('restaurant_manual_menu_page63',{p_query:el('manualSearch').value.trim(),p_category:category||'All',p_offset:pageOffset,p_limit:PAGE});
   if(request!==pageRequest||!data)return;
   const incoming=Array.isArray(data.items)?data.items:[];if(reset)menu=incoming;else{const ids=new Set(menu.map(m=>m.id));for(const item of incoming)if(!ids.has(item.id)){ids.add(item.id);menu.push(item);}}
   total=Number(data.total)||0;hasMore=menu.length<total&&incoming.length>0;tax=data.tax||tax;loaded=true;
   if(Array.isArray(data.categories)){categories=data.categories;if(category!=='All'&&!categories.includes(category))category='All';paintCats();}
   const available=options();for(const [key,line] of cart){if(line.custom)continue;const option=available.find(o=>o.key===key);if(option)cart.set(key,{...line,name:option.name,price:option.price,veg:option.veg});}
   if(reset&&!saving)status(pending&&!pending.payload.p_payment_method?'Choose a payment method to check the previous bill.':'');
  }catch(error){loaded=false;status(/restaurant_manual_menu_page63|schema cache/i.test(error.message)?'Billing setup is missing. Run the latest SQL update in Supabase.':'Billing unavailable: '+error.message);}
  finally{pageBusy=false;render();if(reloadQueued){reloadQueued=false;void loadPage(true);}}
 }
 async function open(){try{await window.Business73?.ready?.();}catch{}setup();await loadBilling73();loadTables();return loadPage(true);}
 async function done(){
  if(saving||!paymentMethod||(!pending&&(!loaded||!cart.size)))return;if(pending&&!pending.payload.p_payment_method){pending.payload.p_payment_method=paymentMethod;storePending();}
  if(!pending){
   const items=[...cart.values()].map(line=>line.custom?{id:line.id,custom:true,name:line.name,price:line.price,qty:line.qty}:{id:line.id,size:line.size,qty:line.qty}),calc=bill73();
   const advanced=billing73?{discount_type:calc.discountType,discount_value:calc.discountValue,cash_received:paymentMethod==='Cash'&&calc.cash!==null&&Number.isFinite(calc.cash)?calc.cash:null,customer_phone:el('pos68Phone')?.value.trim()||'',customer_address:el('pos68Address')?.value.trim()||'',custom_fields:customFieldValues()}:null;
   pending={id:crypto.randomUUID(),fn:billing73?'restaurant_manual_order73':'restaurant_manual_order',payload:{p_table:table||'Counter',p_name:el('pos68Name').value.trim(),p_notes:el('pos68Notes').value.trim(),p_items:items,p_expected_total:totals().total,p_payment_method:paymentMethod,...(billing73?{p_bill:advanced}:{})},lines:[...cart.values()]};storePending();
  }
  saving=true;render();status('Saving the bill…');
  try{const order=await rpc(pending.fn||'restaurant_manual_order',{p_request_id:pending.id,...pending.payload});lastOrder=order;pending=null;storePending();cart.clear();el('pos68Name').value='';el('pos68Notes').value='';if(el('pos68Phone'))el('pos68Phone').value='';if(el('pos68Address'))el('pos68Address').value='';if(el('pos68DiscountType'))el('pos68DiscountType').value='none';if(el('pos68DiscountValue'))el('pos68DiscountValue').value='0';if(el('pos68CashReceived'))el('pos68CashReceived').value='';clearCustomFields();el('manualLastBill').hidden=false;status('Saved · '+Cloud.orderLabel(order)+' · '+money(order.total));toggleTicket(false);
   if(printAfter)printOrder(order);else showReceipt(order);
   if(!isWaiter()){Cloud.invalidateOrders();refreshCloud();}loaded=false;}
  catch(error){
   if(error.httpStatus>=400&&error.httpStatus<500){
    pending=null;storePending();
    if(/unavailable/i.test(error.message)){const removed=await refreshSelectedMenuLines();status(removed?.length?`Removed unavailable item${removed.length===1?'':'s'}: ${removed.join(', ')}. Check the bill and save again.`:error.message+' Refresh the menu and save again.');}
    else status(error.message+' Check the bill and save again.');
   }else status('Could not confirm the save: '+error.message+' Tap “Check / retry”. Do not make a new bill for this customer.');
  }
  finally{saving=false;render();if(!pending){const message=el('manualStatus').textContent;await open();status(message);}}
 }
 async function printOrder(order){try{await window.Custom48?.sync();}catch{}let target=el('printReceipt');if(!target){target=document.createElement('div');target.id='printReceipt';document.body.append(target);}target.innerHTML=YummyReceipt.html(order);await YummyReceipt.ready(target);window.print();}
 function showReceipt(order){if(!order)return;let d=el('manualReceiptDialog');if(!d){d=document.createElement('dialog');d.id='manualReceiptDialog';d.className='dlg68';d.innerHTML='<div class="dlg68-head"><h2>Bill saved</h2><button type="button" class="secondary-btn" data-close68 aria-label="Close">×</button></div><div id="manualReceiptBody" class="receipt68"></div><div class="toolbar"><button id="manualPrint" class="primary-btn" type="button">Print bill</button><button id="manualShare73" class="secondary-btn" type="button">Share / WhatsApp</button><button class="secondary-btn" type="button" data-close68>New bill</button></div>';document.body.append(d);}el('manualReceiptBody').innerHTML=YummyReceipt.html(order);el('manualPrint').onclick=async()=>{d.close();await printOrder(order);};el('manualShare73').onclick=()=>YummyReceipt.share(order);if(!d.open)d.showModal();}
 document.addEventListener('click',e=>{if(e.target.closest('#manualReceiptDialog [data-close68],#pos68CustomDialog [data-close68]'))e.target.closest('dialog').close();});
 document.addEventListener('keydown',e=>{
  if(!visible()||document.querySelector('dialog[open]'))return;
  if(e.key==='F2'){e.preventDefault();el('manualSearch')?.focus();el('manualSearch')?.select();}
  else if(e.key==='F8'){e.preventDefault();if(!el('manualDone').disabled){printAfter=false;done();}}
  else if(e.key==='F9'){e.preventDefault();if(!el('pos68Print').disabled){printAfter=true;done();}}
  else if(e.altKey&&(e.key==='n'||e.key==='N')){e.preventDefault();el('manualClear').click();}
  else if(e.altKey&&(e.key==='x'||e.key==='X')){e.preventDefault();addCustomItem();}
 });
 function toggleWaiter(){waiterOpen=!waiterOpen;el('billingSection').hidden=!waiterOpen;document.body.classList.toggle('waiter-manual-mode',waiterOpen);el('waiterBillingToggle').textContent=waiterOpen?'Back to orders & requests':'Billing';if(waiterOpen)open();}
 function waiterAccess(allowed){el('waiterBillingToggle').hidden=!allowed;if(!allowed){waiterOpen=false;el('billingSection').hidden=true;document.body.classList.remove('waiter-manual-mode');el('manualReceiptDialog')?.close();}}
 return {open,done,toggleWaiter,waiterAccess};
})();

window.YummyBilling=YummyBilling;
