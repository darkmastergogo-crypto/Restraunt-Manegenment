/* Release63: atomic counter/waiter billing with true server-side lazy menu pages. */
'use strict';
const YummyBilling=(()=>{
 let menu=[],tax={},cart=new Map(),loaded=false,saving=false,pending=null,lastOrder=null,waiterOpen=false,paymentMethod=null;
 let total=0,hasMore=false,pageBusy=false,pageRequest=0,searchTimer=null,observer=null,reloadQueued=false;
 const PAGE=15,el=id=>document.getElementById(id),isWaiter=()=>document.body.classList.contains('waiter-site');
 const auth=()=>isWaiter()?{p_key:waiterKey}:{};
 const rpc=(name,args={})=>Cloud.rpc(name,{...auth(),...args},!isWaiter());
 const money=v=>(Cloud.cfg.currency||'₹')+Number(v||0).toFixed(2);
 const storageKey=()=> 'YUMMY_MANUAL_PENDING_v1:'+new URL(Cloud.cfg.supabaseUrl).host+':'+(isWaiter()?'waiter':'staff');
 const lineKey=line=>line.custom?String(line.id):JSON.stringify([line.id,line.size??null]);
 function storePending(){try{if(pending)Cloud.sessionWrite(storageKey(),pending,!isWaiter());else Cloud.sessionRemove(storageKey(),!isWaiter());}catch{}}
 function setup(){
  const root=el('billingSection');if(root.dataset.ready)return;root.dataset.ready='true';
  root.innerHTML=`<div class="page-tools"><div><h2>Billing</h2></div><button id="manualRefresh" type="button" class="secondary-btn">Refresh menu</button></div>
  <div class="manual-layout"><section class="panel">
   <div class="manual-custom57" aria-labelledby="manualCustomHeading"><div><h3 id="manualCustomHeading">Custom bill item</h3><p class="hint">For something sold in the shop but not listed on the menu. It is added only to this bill and does not affect menu stock.</p></div><div class="manual-custom-grid57"><label>Item name<input id="manualCustomName" maxlength="120" placeholder="e.g. Water bottle"></label><label>Price<input id="manualCustomPrice" type="number" min="0.01" max="999999.99" step="0.01" inputmode="decimal" placeholder="0.00"></label><label>Qty<input id="manualCustomQty" type="number" min="1" max="50" step="1" value="1" inputmode="numeric"></label><button id="manualCustomAdd" type="button" class="secondary-btn">+ Add custom item</button></div></div>
   <div class="manual-filters"><label>Search menu<input id="manualSearch" type="search" placeholder="Find a dish"></label><label>Category<select id="manualCategory"><option value="All">All categories</option></select></label></div><div id="manualCategoryChips" class="manual-category-chips" aria-label="Menu categories"></div><p id="manualMenuCount63" class="hint"></p><div id="manualMenu"></div><div id="manualMenuSentinel63" class="lazy-sentinel63" role="status">Scroll to load more dishes</div><button id="manualLoadMore63" type="button" class="secondary-btn" hidden>Load more dishes</button>
  </section><section class="panel manual-summary"><div id="manualCart"></div><div id="manualTotals"></div><p id="manualPendingNotice" class="hint" hidden>Checking a previous submission. Retry uses the same order ID and cannot deduct stock twice. Keep this tab open.</p><div class="manual-payment" role="group" aria-label="Payment method"><span>Paid through</span><label><input type="radio" name="manualPayment" value="Cash"> Cash</label><label><input type="radio" name="manualPayment" value="Online"> Online</label></div><div class="toolbar"><button id="manualDone" type="button" class="primary-btn" disabled>Done</button><button id="manualClear" type="button" class="secondary-btn">Clear</button></div><p id="manualStatus" role="status" aria-live="polite"></p><button id="manualLastBill" type="button" class="secondary-btn" hidden>View / print last bill</button></section></div><div id="manualMobileCheckout" class="manual-mobile-checkout" role="region" aria-label="Bill total"><span><small id="manualMobilePayment">Select payment</small><b id="manualMobileTotal">₹0.00</b></span><button id="manualMobileDone" type="button" class="primary-btn" disabled>Done</button></div>`;
  const custom=el('manualCustomHeading').closest('.manual-custom57');const dialog=document.createElement('dialog');dialog.id='extraItemDialog';dialog.append(custom);root.append(dialog);custom.insertAdjacentHTML('afterbegin','<button type="button" id="closeExtraItem" aria-label="Close">×</button>');const plus=document.createElement('button');plus.type='button';plus.className='secondary-btn';plus.textContent='+';plus.setAttribute('aria-label','Add extra item');el('manualSearch').parentElement.append(plus);plus.onclick=()=>dialog.showModal();el('closeExtraItem').onclick=()=>dialog.close();
  el('manualSearch').oninput=()=>{clearTimeout(searchTimer);el('manualMenuCount63').textContent='Searching…';searchTimer=setTimeout(()=>loadPage(true),250);};
  el('manualCategory').onchange=()=>loadPage(true);el('manualCategoryChips').onclick=event=>{const button=event.target.closest('[data-manual-category]');if(!button)return;el('manualCategory').value=button.dataset.manualCategory;loadPage(true);};el('manualRefresh').onclick=()=>open();el('manualDone').onclick=done;el('manualMobileDone').onclick=()=>el('manualCart').scrollIntoView({behavior:'smooth',block:'start'});el('manualCustomAdd').onclick=addCustomItem;el('manualLoadMore63').onclick=()=>loadPage(false);
  root.querySelector('.manual-summary').insertAdjacentHTML('afterbegin','<button id="posBack">← Back to items</button>');
  const review=value=>{root.classList.toggle('pos-review',value);window.scrollTo(0,0);};
  el('posBack').onclick=()=>review(false);el('manualMobileDone').onclick=()=>review(true);
  root.addEventListener('click',e=>{
   const b=e.target.closest('[data-pos]');if(!b||saving||pending)return;
   const key=b.dataset.pos,option=options().find(o=>o.key===key),line=cart.get(key)||option;if(!line)return;
   const delta=Number(b.dataset.delta),qty=delta===0?0:(cart.get(key)?.qty||0)+delta;
   if(qty>50||delta>0&&option?.stock?.tracked&&qty>option.stock.remaining)return;
   if(qty<=0)cart.delete(key);else cart.set(key,{...line,qty});render();
  });
  for(const input of root.querySelectorAll('input[name=manualPayment]'))input.onchange=()=>{if(pending?.payload?.p_payment_method||saving)return;paymentMethod=input.value;render();};
  el('manualClear').onclick=()=>{if(!pending&&!saving){cart.clear();render();}};el('manualLastBill').onclick=()=>showReceipt(lastOrder);
  root.addEventListener('click',event=>{const button=event.target.closest('[data-remove-custom57]');if(!button||pending||saving)return;cart.delete(button.dataset.removeCustom57);render();});
  root.addEventListener('change',event=>{
   const row=event.target.closest('[data-manual-key]');if(!row||pending||saving)return;const key=row.dataset.manualKey,option=options().find(o=>o.key===key);if(!option)return;
   const checkbox=row.querySelector('[data-manual-check]'),qty=row.querySelector('[data-manual-qty]');if(event.target===qty)checkbox.checked=true;
   if(checkbox.checked){const n=Number(qty.value);if(!Number.isInteger(n)||n<1||n>50){qty.setCustomValidity('Choose a whole quantity from 1 to 50.');qty.reportValidity();return;}qty.setCustomValidity('');cart.set(key,{id:option.id,size:option.size,qty:n,name:option.name,price:option.price,veg:option.veg});}else cart.delete(key);render();
  });
  try{const saved=Cloud.sessionRead(storageKey(),null,!isWaiter());if(saved?.id&&saved?.payload&&Array.isArray(saved.lines)){pending=saved;paymentMethod=saved.payload.p_payment_method||null;for(const line of saved.lines)cart.set(lineKey(line),line);}}catch{}
  if('IntersectionObserver' in window){observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting&&hasMore&&!pageBusy)loadPage(false);},{root:null,rootMargin:'180px 0px',threshold:0});observer.observe(el('manualMenuSentinel63'));}else el('manualLoadMore63').hidden=false;
 }
 function options(){return menu.flatMap(m=>{if(!m.available)return [];return (m.sizes_enabled?MenuOptions.keys(m):[null]).map(size=>{const stock=size?m.size_stock?.[size]:m.stock;return {id:m.id,size,key:JSON.stringify([m.id,size]),name:m.name+(size?' — '+MenuOptions.label(m,size):''),category:m.category,price:Number(size?m.size_prices[size]:m.price),veg:m.veg!==false,stock,available:!stock?.tracked||stock.remaining>0};});});}
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
  if(pending||saving)return;const name=el('manualCustomName').value.trim(),price=Number(el('manualCustomPrice').value),qty=Number(el('manualCustomQty').value);
  if(!name||name.length>120){el('manualCustomName').setCustomValidity('Enter an item name up to 120 characters.');el('manualCustomName').reportValidity();return;}el('manualCustomName').setCustomValidity('');
  if(!Number.isFinite(price)||price<=0||price>999999.99){el('manualCustomPrice').setCustomValidity('Enter a price from 0.01 to 999999.99.');el('manualCustomPrice').reportValidity();return;}el('manualCustomPrice').setCustomValidity('');
  if(!Number.isInteger(qty)||qty<1||qty>50){el('manualCustomQty').setCustomValidity('Choose a whole quantity from 1 to 50.');el('manualCustomQty').reportValidity();return;}el('manualCustomQty').setCustomValidity('');
  const id='custom:'+crypto.randomUUID(),line={id,custom:true,name,price:Math.round(price*100)/100,qty};cart.set(id,line);el('manualCustomName').value='';el('manualCustomPrice').value='';el('manualCustomQty').value='1';el('extraItemDialog').close();render();el('manualStatus').textContent='Custom item added to this bill only.';
 }
 function renderMenu(){
  if(!el('manualMenu'))return;const all=options();
  el('manualMenu').innerHTML=all.map(o=>`<button class="pos-card" data-pos="${Cloud.esc(o.key)}" data-delta="1" ${!o.available||saving||pending?'disabled':''}><strong>${Cloud.esc(o.name)}</strong><span class="pos-card-footer"><b>${money(o.price)}<em>/pcs</em></b><small>${o.stock?.tracked?Number(o.stock.remaining)+' pcs':Cloud.esc(o.category)}</small></span>${cart.has(o.key)?'<i>×'+cart.get(o.key).qty+'</i>':''}</button>`).join('')||'No matching dishes';
  el('manualMenuCount63').textContent=`${menu.length} of ${total} matching dishes loaded`;
  el('manualMenuSentinel63').textContent=pageBusy?'Loading more dishes…':hasMore?'Scroll to load more dishes':total?'All matching dishes loaded':'No matching dishes';
  if(!observer)el('manualLoadMore63').hidden=!hasMore;
 }
 function totals(){const cents=[...cart.values()].reduce((sum,line)=>sum+line.qty*Math.round(line.price*100),0);const taxCents=tax.tax_enabled?(tax.tax_mode==='percent'?Math.round(cents*Math.round(Number(tax.tax_value)*100)/10000):Math.round(Number(tax.tax_value)*100)):0;return {subtotal:cents/100,tax:taxCents/100,total:(cents+taxCents)/100};}
 function render(){
  renderMenu();const t=totals();
  const quantity=[...cart.values()].reduce((n,line)=>n+line.qty,0);el('manualCart').innerHTML=`<h3><span>Current bill</span><small>${cart.size} lines · Qty ${quantity}</small></h3>`+[...cart.entries()].map(([key,line])=>`<article class="pos-line"><strong>${Cloud.esc(line.name)}</strong><small>${money(line.price)} / pcs</small><div><button data-pos="${Cloud.esc(key)}" data-delta="-1" aria-label="Remove one">−</button><span>${line.qty}</span><button data-pos="${Cloud.esc(key)}" data-delta="1" aria-label="Add one">+</button><button data-pos="${Cloud.esc(key)}" data-delta="0" aria-label="Remove item">×</button></div><b>${money(line.qty*line.price)}</b></article>`).join('');
  el('manualTotals').innerHTML=`<div class="receipt-row"><span>Items subtotal</span><b>${money(t.subtotal)}</b></div>${tax.tax_enabled?`<div class="receipt-row"><span>Tax ${tax.tax_mode==='percent'?'('+Number(tax.tax_value)+'%)':'(fixed)'}</span><b>${money(t.tax)}</b></div>`:''}<div class="receipt-row manual-total"><b>Total</b><b>${money(t.total)}</b></div>`;
  const canSubmit=!saving&&!!paymentMethod&&(pending||loaded&&cart.size>0);el('manualDone').disabled=!canSubmit;el('manualMobileDone').disabled=false;el('manualDone').textContent=saving?'Saving…':pending?'Check / retry Done':'Done';el('manualMobileDone').textContent='View bill';el('manualClear').disabled=saving||!!pending;el('manualPendingNotice').hidden=!pending;el('manualRefresh').disabled=saving;el('manualMobileTotal').textContent=money(t.total);el('manualMobilePayment').textContent=`${cart.size} lines · Qty ${quantity}`;el('manualCustomAdd').disabled=saving||!!pending;
  for(const input of el('billingSection').querySelectorAll('input[name=manualPayment]')){input.checked=input.value===paymentMethod;input.disabled=saving||!!pending?.payload?.p_payment_method;}
 }
 async function loadPage(reset){
  setup();if(pageBusy){if(reset)reloadQueued=true;return;}const request=++pageRequest,pageOffset=reset?0:menu.length;if(reset){menu=[];total=0;hasMore=false;loaded=false;renderMenu();}
  pageBusy=true;renderMenu();if(reset)el('manualStatus').textContent='Loading menu…';
  try{
   const data=await rpc('restaurant_manual_menu_page63',{p_query:el('manualSearch').value.trim(),p_category:el('manualCategory').value||'All',p_offset:pageOffset,p_limit:PAGE});
   if(request!==pageRequest||!data)return;
   const incoming=Array.isArray(data.items)?data.items:[];if(reset)menu=incoming;else{const ids=new Set(menu.map(m=>m.id));for(const item of incoming)if(!ids.has(item.id)){ids.add(item.id);menu.push(item);}}
   total=Number(data.total)||0;hasMore=menu.length<total&&incoming.length>0;tax=data.tax||tax;loaded=true;
   const selected=el('manualCategory').value;if(Array.isArray(data.categories)){el('manualCategory').replaceChildren(...['All',...data.categories].map(c=>new Option(c==='All'?'All categories':c,c)));el('manualCategory').value=[...el('manualCategory').options].some(o=>o.value===selected)?selected:'All';const active=el('manualCategory').value;el('manualCategoryChips').innerHTML=['All',...data.categories].map(c=>`<button type="button" data-manual-category="${Cloud.esc(c)}" class="${c===active?'active':''}">${c==='All'?'All items '+total:Cloud.esc(c)}</button>`).join('');}
   // Refresh prices only for cart lines that were actually returned in this small page.
   const available=options();for(const [key,line] of cart){if(line.custom)continue;const option=available.find(o=>o.key===key);if(option)cart.set(key,{...line,name:option.name,price:option.price,veg:option.veg});}
   if(reset)el('manualStatus').textContent=pending&&!pending.payload.p_payment_method?'Choose Cash or Online to check the previous submission.':'';
  }catch(error){loaded=false;el('manualStatus').textContent=/restaurant_manual_menu_page63|schema cache/i.test(error.message)?'Billing lazy-load setup is missing. Run RUN-THIS-RELEASE63.sql in Supabase.':'Billing unavailable: '+error.message;}
  finally{pageBusy=false;render();if(reloadQueued){reloadQueued=false;void loadPage(true);}}
 }
 async function open(){setup();return loadPage(true);}
 async function done(){
  if(saving||!paymentMethod||(!pending&&(!loaded||!cart.size)))return;if(pending&&!pending.payload.p_payment_method){pending.payload.p_payment_method=paymentMethod;storePending();}
  if(!pending){const invalid=[...el('billingSection').querySelectorAll('input[type=number]')].find(c=>!c.disabled&&!c.checkValidity());if(invalid){invalid.reportValidity();return;}
   const items=[...cart.values()].map(line=>line.custom?{id:line.id,custom:true,name:line.name,price:line.price,qty:line.qty}:{id:line.id,size:line.size,qty:line.qty});
   pending={id:crypto.randomUUID(),payload:{p_table:'Counter',p_name:'',p_notes:'',p_items:items,p_expected_total:totals().total,p_payment_method:paymentMethod},lines:[...cart.values()]};storePending();
  }
  saving=true;render();el('manualStatus').textContent='Confirming bill and deducting tracked menu stock…';
  try{const order=await rpc('restaurant_manual_order',{p_request_id:pending.id,...pending.payload});lastOrder=order;pending=null;paymentMethod=null;storePending();cart.clear();el('manualLastBill').hidden=false;el('manualStatus').textContent='Done · '+Cloud.orderLabel(order)+' · '+money(order.total);showReceipt(order);if(!isWaiter()){Cloud.invalidateOrders();refreshCloud();}loaded=false;}
  catch(error){
   if(error.httpStatus>=400&&error.httpStatus<500){
    pending=null;storePending();
    if(/unavailable/i.test(error.message)){
     const removed=await refreshSelectedMenuLines(),hasCustom=[...cart.values()].some(line=>line.custom);
     if(removed?.length)el('manualStatus').textContent=`Removed unavailable menu item${removed.length===1?'':'s'}: ${removed.join(', ')}. Review the remaining bill and tap Done again.${hasCustom?' Custom bill items remain on the bill.':''}`;
     else if(hasCustom&&removed===null)el('manualStatus').textContent='Required billing database setup is missing. Run SUPABASE/UPDATE-57-CUSTOM-BILLING.sql and RUN-THIS-RELEASE63.sql in Supabase, refresh this page, and retry the bill.';
     else if(removed&&hasCustom)el('manualStatus').textContent='Custom billing is not installed on this shop database. Run SUPABASE/UPDATE-57-CUSTOM-BILLING.sql in Supabase, refresh this page, and retry the bill.';
     else el('manualStatus').textContent=error.message+' Refresh the menu, review the bill, then tap Done again.';
    }else el('manualStatus').textContent=error.message+' Refresh the menu, review the bill, then tap Done again.';
   }else el('manualStatus').textContent='Confirmation could not be verified: '+error.message+' Tap Check / retry Done. Do not create another bill for this customer.';
  }
  finally{saving=false;render();if(!pending){const message=el('manualStatus').textContent;await open();el('manualStatus').textContent=message;}}
 }
 function showReceipt(order){if(!order)return;let d=el('manualReceiptDialog');if(!d){d=document.createElement('dialog');d.id='manualReceiptDialog';d.innerHTML='<h2>Bill preview</h2><div id="manualReceiptBody"></div><div class="toolbar"><button id="manualPrint" class="primary-btn" type="button">Print bill</button><button class="secondary-btn" type="button" onclick="document.getElementById(\'manualReceiptDialog\').close()">Close</button></div>';document.body.append(d);}el('manualReceiptBody').innerHTML=YummyReceipt.html(order);el('manualPrint').onclick=async()=>{try{await window.Custom48?.sync();}catch(error){el('manualStatus').textContent='Bill settings could not load: '+error.message;return;}let target=el('printReceipt');if(!target){target=document.createElement('div');target.id='printReceipt';document.body.append(target);}target.innerHTML=YummyReceipt.html(order);target.dataset.receiptTotal=String(order.total||0);target.dataset.paymentMethod=String(order.payment_method||'');await YummyReceipt.ready(target);d.close();window.print();};if(!d.open)d.showModal();}
 function toggleWaiter(){waiterOpen=!waiterOpen;el('billingSection').hidden=!waiterOpen;document.body.classList.toggle('waiter-manual-mode',waiterOpen);el('waiterBillingToggle').textContent=waiterOpen?'Back to orders & requests':'Billing';if(waiterOpen)open();}
 function waiterAccess(allowed){el('waiterBillingToggle').hidden=!allowed;if(!allowed){waiterOpen=false;el('billingSection').hidden=true;document.body.classList.remove('waiter-manual-mode');el('manualReceiptDialog')?.close();}}
 return {open,done,toggleWaiter,waiterAccess};
})();

/* Reference POS extra-item dialog: presentation-only enhancement. */
(()=>{
 const apply=()=>{
  const dialog=document.getElementById('extraItemDialog'),custom=dialog?.querySelector('.manual-custom57');
  if(!dialog||!custom||custom.dataset.referenceStyled)return;
  custom.dataset.referenceStyled='true';dialog.classList.add('extra-item-dialog');
  const intro=custom.querySelector(':scope > div:first-of-type'),heading=custom.querySelector('#manualCustomHeading'),hint=custom.querySelector('.hint'),grid=custom.querySelector('.manual-custom-grid57'),add=custom.querySelector('#manualCustomAdd');
  if(heading)heading.textContent='Add extra item';
  if(intro&&hint&&grid){intro.removeChild(hint);grid.after(hint);}
  const labels=[...custom.querySelectorAll('.manual-custom-grid57 label')];
  if(labels[1]?.firstChild)labels[1].firstChild.nodeValue='Price (₹)';
  if(labels[2]?.firstChild)labels[2].firstChild.nodeValue='Quantity';
  if(add){add.textContent='Add to bill';const cancel=document.createElement('button');cancel.type='button';cancel.className='secondary-btn';cancel.id='cancelExtraItem';cancel.textContent='Cancel';cancel.onclick=()=>dialog.close();grid.insertBefore(cancel,add);}
 };
 const root=document.body;if(root){new MutationObserver(apply).observe(root,{childList:true,subtree:true});setInterval(apply,500);}
})();
