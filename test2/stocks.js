'use strict';
let stockLoopDrafts=new Map();
let stockRows=[],stocksBusy=false,stockLoaded=false,stockDrafts=new Map(),stockSaveBusy=new Set();
const stockKey=row=>JSON.stringify([row.menu_id,row.variant]);
const stockName=row=>row.name+(row.size_label?' — '+row.size_label:'');
const stockColors=['#71717a','#e23744','#f7a7ad','#e8e8ed','#202124'];
async function refreshStocks(){
 if(stocksBusy||YummyStocksSettings.hidden()||!['admin','manager','cashier','waiter'].includes(staffRole))return;stocksBusy=true;
 try{const rows=await Cloud.rpc('restaurant_stocks',{},true);if(!Array.isArray(rows))throw Error('Invalid stock response.');stockRows=rows;stockLoaded=true;const validKeys=new Set(rows.map(stockKey));for(const key of stockLoopDrafts.keys())if(!validKeys.has(key))stockLoopDrafts.delete(key);let removedDrafts=false;for(const key of stockDrafts.keys())if(!validKeys.has(key)){stockDrafts.delete(key);removedDrafts=true;}
  const category=document.getElementById('stockCategory'),selected=category.value,names=['All',...new Set(rows.map(r=>r.category))];category.replaceChildren(...names.map(n=>new Option(n==='All'?'All categories':n,n)));category.value=names.includes(selected)?selected:'All';
  if(removedDrafts)document.getElementById('stocksStatus').textContent='Dish or size options changed. Unsaved entries for removed options were discarded.';else if(!stockDrafts.size)document.getElementById('stocksStatus').textContent='Stock updated · '+new Date().toLocaleTimeString();renderStocks();
 }catch(e){document.getElementById('stocksStatus').textContent=/restaurant_stocks|schema cache/.test(e.message)?'Stock setup missing: install the Release23 SQL update, then refresh.':'Stock sync failed: '+e.message+' Last loaded quantities may be out of date.';}
 finally{stocksBusy=false;}
}
function renderStocks(){
 const root=document.getElementById('stockList');if(!root||!stockLoaded)return;
 const expanded=new Set([...root.querySelectorAll('[data-stock-card]')].filter(c=>c.querySelector('.stock72-editor')?.open).map(c=>c.dataset.stockCard));
 // Preserve focus/caret across online refreshes; drafts retain their original revision.
 const active=document.activeElement,focus=active?.closest('[data-stock-card]')?{key:active.closest('[data-stock-card]').dataset.stockCard,field:active.dataset.stockField}:null;
 const q=document.getElementById('stockSearch').value.toLowerCase().trim(),cat=document.getElementById('stockCategory').value,filter=document.getElementById('stockFilter').value,sort=document.getElementById('stockSort').value;
 const rows=stockRows.filter(r=>(cat==='All'||r.category===cat)&&(!q||[stockName(r),r.category].some(x=>x.toLowerCase().includes(q)))&&(filter==='all'||filter==='tracked'&&r.tracked||filter==='untracked'&&!r.tracked||filter==='out'&&r.tracked&&r.remaining===0||filter==='low'&&r.tracked&&r.remaining>0&&r.remaining<=5));
 rows.sort((a,b)=>sort==='name'?stockName(a).localeCompare(stockName(b)):sort==='value'?Number(b.tracked)*b.remaining*b.unit_price-Number(a.tracked)*a.remaining*a.unit_price:Number(b.tracked)*b.remaining-Number(a.tracked)*a.remaining||stockName(a).localeCompare(stockName(b)));
 const tracked=rows.filter(r=>r.tracked),units=tracked.reduce((n,r)=>n+r.remaining,0),value=tracked.reduce((n,r)=>n+r.remaining*Number(r.unit_price),0),out=tracked.filter(r=>r.remaining===0).length;
 const allTracked=stockRows.filter(r=>r.tracked),lowAll=allTracked.filter(r=>r.remaining>0&&r.remaining<=5).length,outAll=allTracked.filter(r=>r.remaining===0).length;{const ss=document.getElementById('stockSummary');ss.hidden=false;ss.innerHTML=`<div class="kpi68 kpi68-hero"><span>Stock value</span><strong>${money(value)}</strong><small>At menu prices</small></div><div class="kpi68"><span>Items tracked</span><strong>${allTracked.length}</strong><small>${units.toLocaleString()} units left</small></div><div class="kpi68"><span>Running low</span><strong class="${lowAll?'warn68':''}">${lowAll}</strong><small>5 or fewer left</small></div><div class="kpi68"><span>Sold out</span><strong class="${outAll?'neg68':''}">${outAll}</strong><small>Tracked options at 0</small></div>`;}
 const ranked=[...tracked].filter(r=>r.remaining>0).sort((a,b)=>b.remaining-a.remaining),segments=ranked.slice(0,4).map(r=>({name:stockName(r),quantity:r.remaining}));if(ranked.length>4)segments.push({name:'Others',quantity:ranked.slice(4).reduce((n,r)=>n+r.remaining,0)});
 let offset=0;const gradient=segments.map((s,i)=>{const next=offset+s.quantity/units*100,part=`${stockColors[i]} ${offset}% ${next}%`;offset=next;return part;}).join(',');
 document.getElementById('stockOverview').innerHTML=units?`<div class="stock-chart-wrap"><div class="stock-donut" aria-hidden="true" style="background:conic-gradient(${gradient})"><span><b>${units.toLocaleString()}</b><small>units left</small></span></div><ul class="stock-legend">${segments.map((s,i)=>`<li><span class="stock-swatch" style="background:${stockColors[i]}"></span><span>${esc(s.name)}</span><b>${s.quantity.toLocaleString()} <small>(${(s.quantity/units*100).toFixed(1)}%)</small></b></li>`).join('')}</ul></div>`:'<p class="stock-empty">No tracked stock remaining in these filters. Enter quantities below to start tracking.</p>';
 root.innerHTML=rows.length?`<div class="stock72-table" role="table" aria-label="Restaurant stock levels"><div class="stock72-thead" role="row"><span role="columnheader">Item</span><span role="columnheader">In stock</span><span role="columnheader">Value</span><span role="columnheader">Actions</span></div>${rows.map(r=>{
 const key=stockKey(r),draft=stockDrafts.get(key),qty=draft?draft.quantity:r.remaining,tracking=draft?draft.tracked:r.tracked,pending=stockSaveBusy.has(key),open=expanded.has(key);
 const value=r.tracked?money(r.remaining*Number(r.unit_price)):'—';
 return `<article class="stock-card" role="rowgroup" data-stock-card="${esc(key)}"><div class="stock72-row" role="row">
  <div role="cell"><h3>${esc(stockName(r))}</h3><p>${esc(r.category)}${!r.manual_available?' · Hidden in menu':''}</p></div>
  <div class="stock72-stock" role="cell"><span class="stock-state ${r.tracked&&r.remaining===0?'stock-out':''}">${r.tracked?r.remaining.toLocaleString()+' pcs':'Not tracked'}</span>${r.tracked&&r.remaining<=5?`<small class="${r.remaining?'warn68':'neg68'}">${r.remaining?'Running low':'Sold out'}</small>`:''}</div>
  <div role="cell" class="stock72-value">${value}</div>
  <div role="cell" class="stock72-actions"><button type="button" class="secondary-btn" data-stock-adjust="add"${pending||!r.tracked?' disabled':''} title="Add received stock">+ Add</button><button type="button" class="secondary-btn" data-stock-adjust="remove"${pending||!r.tracked||r.remaining===0?' disabled':''} title="Remove stock">Remove</button><button type="button" class="secondary-btn" data-stock-edit aria-expanded="${open}">Set count</button></div>
 </div><details class="stock72-editor" ${open?'open':''}><summary>Stock count and 24-hour loop</summary>
 <form class="stock-editor" data-stock-form="${esc(key)}"><label class="stock-track"><input type="checkbox" data-stock-field="tracking"${tracking?' checked':''}${pending?' disabled':''}> Track stock</label><label>Count available now<input data-stock-field="quantity" type="number" min="0" max="1000000" step="1" inputmode="numeric" value="${esc(qty)}"${!tracking||pending?' disabled':''} required></label><button type="submit" class="primary-btn"${pending?' disabled':''}>${pending?'Saving…':'Save quantity'}</button><button type="button" class="secondary-btn" data-stock-reload${pending?' disabled':''}>Reload row</button></form>
 ${stockLoopControls35(r,key,pending)}<p class="stock-row-status" role="status">${esc(draft?.message||(draft?'Unsaved count · Save quantity to apply.':r.updated_at?'Last updated: '+new Date(r.updated_at).toLocaleString():'Tracking is off. Enter your quantity to start.'))}</p>
 </details></article>`;
 }).join('')}</div>`:'<p class="stock-empty">No dishes or sizes match these filters.</p>';
 if(focus){const card=[...root.querySelectorAll('[data-stock-card]')].find(e=>e.dataset.stockCard===focus.key);card?.querySelector('[data-stock-field="'+focus.field+'"]')?.focus({preventScroll:true});}
}
function stockDraftFromControl(control){const card=control.closest('[data-stock-card]'),key=card.dataset.stockCard,row=stockRows.find(r=>stockKey(r)===key);if(!row)return;
 const existing=stockDrafts.get(key);const draft={tracked:card.querySelector('[data-stock-field=tracking]').checked,quantity:card.querySelector('[data-stock-field=quantity]').value,revision:existing?existing.revision:row.revision,message:'Unsaved count · Save quantity to apply.'};stockDrafts.set(key,draft);return {key,row,draft,card};}
document.addEventListener('input',event=>{if(!event.target.matches('[data-stock-field=quantity]'))return;const result=stockDraftFromControl(event.target);if(result)result.card.querySelector('.stock-row-status').textContent=result.draft.message;});
document.addEventListener('change',event=>{if(!event.target.matches('[data-stock-field=tracking]'))return;stockDraftFromControl(event.target);renderStocks();});
document.addEventListener('click',event=>{const button=event.target.closest('[data-stock-reload]');if(!button)return;stockDrafts.delete(button.closest('[data-stock-card]').dataset.stockCard);stockLoopDrafts.delete(button.closest('[data-stock-card]').dataset.stockCard);renderStocks();refreshStocks();});
document.addEventListener('submit',async event=>{const form=event.target.closest('[data-stock-form]');if(!form)return;event.preventDefault();const result=stockDraftFromControl(form.querySelector('[data-stock-field=tracking]'));if(!result)return;const {key,row,draft}=result;if(stockSaveBusy.has(key))return;
 const qty=Number(draft.quantity);if(draft.quantity===''||!Number.isSafeInteger(qty)||qty<0||qty>1000000){draft.message='Enter a whole stock quantity from 0 to 1000000.';renderStocks();return;}
 stockSaveBusy.add(key);renderStocks();try{await Cloud.rpc('restaurant_set_stock',{p_id:row.menu_id,p_variant:row.variant,p_tracking:draft.tracked,p_quantity:qty,p_revision:draft.revision},true);stockDrafts.delete(key);document.getElementById('stocksStatus').textContent='Stock quantity saved. Online menus update on their next refresh.';await refreshStocks();await refreshCloud();}
 catch(e){draft.message=e.message;stockDrafts.set(key,draft);}finally{stockSaveBusy.delete(key);renderStocks();}
});

function stockLoopControls35(row,key,pending){const draft=stockLoopDrafts.get(key),quantity=draft?draft.quantity:(row.loop_quantity??row.remaining),enabled=row.loop_enabled===true;
 return `<details class="stock-loop-controls"${enabled||draft?' open':''}><summary><span>24-hour loop</span><em class="${enabled?'on':''}">${enabled?'On':'Off'}</em></summary><p class="hint">Restore to a saved quantity every 24 hours. Leftovers are replaced, not added.</p><form data-stock-loop-form="${esc(key)}"><label>Quantity to restore<input data-stock-field="loopQuantity" data-stock-loop-quantity type="number" min="0" max="1000000" step="1" inputmode="numeric" value="${esc(quantity)}" ${!row.tracked||pending?'disabled':''} required></label><div class="toolbar"><button type="submit" class="${enabled?'secondary-btn':'primary-btn'}" ${!row.tracked||pending?'disabled':''}>${pending?'Saving…':enabled?'Save loop quantity':'Loop · every 24 hours'}</button>${enabled?`<button type="button" class="danger-btn" data-stock-loop-stop ${pending?'disabled':''}>Stop loop</button>`:''}</div></form><p class="stock-loop-status" role="status">${esc(draft?.message||(enabled?'Loop on · next reset '+new Date(row.loop_next_reset_at).toLocaleString():row.tracked?'Loop off · enable to start a 24-hour cycle.':'Save a tracked stock quantity before enabling a loop.'))}</p></details>`;
}
document.addEventListener('input',event=>{if(!event.target.matches('[data-stock-loop-quantity]'))return;const card=event.target.closest('[data-stock-card]'),key=card.dataset.stockCard,row=stockRows.find(r=>stockKey(r)===key);if(!row)return;const prior=stockLoopDrafts.get(key);stockLoopDrafts.set(key,{quantity:event.target.value,revision:prior?.revision??row.revision,message:'Unsaved loop quantity.'});card.querySelector('.stock-loop-status').textContent='Unsaved loop quantity.';});
async function saveStockLoop35(card,enabled){const key=card.dataset.stockCard,row=stockRows.find(r=>stockKey(r)===key);if(!row||stockSaveBusy.has(key))return;const input=card.querySelector('[data-stock-loop-quantity]'),prior=stockLoopDrafts.get(key);const draft=prior||{quantity:input.value,revision:row.revision};const quantity=enabled?Number(draft.quantity):Number(row.loop_quantity??row.remaining);
 if(enabled&&(draft.quantity===''||!Number.isSafeInteger(quantity)||quantity<0||quantity>1000000)){draft.message='Enter a whole loop quantity from 0 to 1000000.';stockLoopDrafts.set(key,draft);renderStocks();return;}
 stockSaveBusy.add(key);renderStocks();try{await Cloud.rpc('restaurant_set_stock_loop',{p_id:row.menu_id,p_variant:row.variant,p_enabled:enabled,p_quantity:quantity,p_revision:draft.revision},true);stockLoopDrafts.delete(key);document.getElementById('stocksStatus').textContent=enabled?'24-hour loop saved. The next scheduled reset restores the saved quantity.':'Loop stopped. Current remaining stock is unchanged.';await refreshStocks();}catch(e){draft.message=e.message;stockLoopDrafts.set(key,draft);}finally{stockSaveBusy.delete(key);renderStocks();}}
document.addEventListener('submit',event=>{const form=event.target.closest('[data-stock-loop-form]');if(!form)return;event.preventDefault();saveStockLoop35(form.closest('[data-stock-card]'),true);});
document.addEventListener('click',event=>{const b=event.target.closest('[data-stock-loop-stop]');if(b)saveStockLoop35(b.closest('[data-stock-card]'),false);});

/* Release 72: the reference Add and Remove shortcuts reuse the existing
   revision-checked restaurant_set_stock RPC. No client-only stock edits. */
document.addEventListener('click',async event=>{
 const edit=event.target.closest('[data-stock-edit]');
 if(edit){
  const card=edit.closest('[data-stock-card]'),panel=card?.querySelector('.stock72-editor');
  if(!panel)return;panel.open=!panel.open;edit.setAttribute('aria-expanded',String(panel.open));
  if(panel.open)panel.querySelector('[data-stock-field=quantity]')?.focus({preventScroll:true});
  return;
 }
 const button=event.target.closest('[data-stock-adjust]');
 if(!button)return;
 const card=button.closest('[data-stock-card]'),key=card?.dataset.stockCard;
 const row=stockRows.find(r=>stockKey(r)===key),mode=button.dataset.stockAdjust;
 if(!row||!row.tracked||stockSaveBusy.has(key)||stockDrafts.has(key)){
  if(stockDrafts.has(key))document.getElementById('stocksStatus').textContent='Save or reload the pending stock count before adjusting it.';
  return;
 }
 const raw=prompt(`${mode==='add'?'How many units arrived':'How many units should be removed'} for ${stockName(row)}?`,'1');
 if(raw===null)return;
 const delta=Number(raw);
 if(!/^\d+$/.test(raw.trim())||!Number.isSafeInteger(delta)||delta<=0||delta>1000000){document.getElementById('stocksStatus').textContent='Enter a positive whole number of units (maximum 1,000,000).';return;}
 const current=Number(row.remaining);
 if(!Number.isSafeInteger(current)||current<0){document.getElementById('stocksStatus').textContent='Current stock is invalid. Refresh stocks before adjusting.';return;}
 const next=current+(mode==='add'?delta:-delta);
 if(next<0||next>1000000){document.getElementById('stocksStatus').textContent=next<0?'Cannot remove more stock than currently available.':'Maximum stock quantity is 1,000,000.';return;}
 stockSaveBusy.add(key);renderStocks();
 try{
  await Cloud.rpc('restaurant_set_stock',{p_id:row.menu_id,p_variant:row.variant,p_tracking:true,p_quantity:next,p_revision:row.revision},true);
  document.getElementById('stocksStatus').textContent=(mode==='add'?'Added ':'Removed ')+delta+' unit(s) for '+stockName(row)+'.';
  await refreshStocks();
  if(typeof refreshCloud==='function')await refreshCloud();
 }catch(e){document.getElementById('stocksStatus').textContent='Stock update failed: '+e.message+' Refresh stocks before retrying.';}
 finally{stockSaveBusy.delete(key);renderStocks();}
});
