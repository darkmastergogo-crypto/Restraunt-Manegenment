/* SHOI Restaurant OS — Release 73 business parity bridge.
   Requires SUPABASE/7-RUN-THIS-NOW (release 73 business parity).sql for the new features.
   Existing restaurant functions remain authoritative for orders/menu/stock. */
(() => {
  'use strict';
  let caps = null, capsPromise = null, editItemId = null, historyOffset = 0;
  const isWaiter = () => document.body.classList.contains('waiter-site');
  const auth = () => isWaiter() && typeof waiterKey !== 'undefined' ? {p_key: waiterKey} : {};
  const call = (name, args = {}) => Cloud.rpc(name, {...auth(), ...args}, !isWaiter());
  const esc = v => Cloud.esc(String(v ?? ''));
  const money = v => (Cloud.cfg.currency || '₹') + Number(v || 0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});

  async function ready(force = false) {
    if (caps && !force) return caps;
    if (capsPromise && !force) return capsPromise;
    capsPromise = call('restaurant_business_capabilities73').then(v => caps = v || null).catch(() => caps = null).finally(() => capsPromise = null);
    return capsPromise;
  }
  function paymentMethods() { return Array.isArray(caps?.payment_methods) && caps.payment_methods.length ? caps.payment_methods : ['Cash','Online']; }
  async function lookup(query) {
    if (!query || !(await ready())?.item_codes) return null;
    try { return await call('restaurant_business_lookup73',{p_query:String(query).trim()}); } catch { return null; }
  }

  function ensureBusinessDialog() {
    let d = document.getElementById('businessItem73Dialog'); if (d) return d;
    d = document.createElement('dialog'); d.id = 'businessItem73Dialog'; d.className = 'dlg68 business73-dialog';
    d.innerHTML = `<form id="businessItem73Form"><div class="dlg68-head"><div><span class="eyebrow73">Advanced item data</span><h2 id="businessItem73Title">Business details</h2></div><button type="button" class="secondary-btn" data-business73-close aria-label="Close">×</button></div>
      <p class="hint">Private accounting and retail metadata. Customers never receive these fields.</p>
      <div class="business73-grid">
       <label>Item code<input name="item_code" maxlength="80" autocomplete="off" placeholder="e.g. MOMO-PAN-6"></label>
       <label>Barcode<input name="barcode" maxlength="120" inputmode="numeric" autocomplete="off" placeholder="Scan or type barcode"></label>
       <label>HSN / SAC<input name="hsn_sac" maxlength="40" placeholder="Optional"></label>
       <label>Unit<select name="unit"><option>pcs</option><option>plate</option><option>portion</option><option>pack</option><option>box</option><option>kg</option><option>g</option><option>ltr</option><option>ml</option></select></label>
       <label>Cost price<input name="cost_price" type="number" min="0" max="9999999999" step="0.01" inputmode="decimal" placeholder="Optional"></label>
       <label>Default discount %<input name="default_discount" type="number" min="0" max="100" step="0.01" inputmode="decimal" value="0"></label>
       <label>Item tax %<input name="item_tax_rate" type="number" min="0" max="100" step="0.001" inputmode="decimal" placeholder="Optional"></label>
       <label class="business73-check"><input name="tax_inclusive" type="checkbox"> Tax is included in item price</label>
       <label>Storage location<input name="storage_location" maxlength="120" placeholder="e.g. Freezer A / Shelf 2"></label>
       <label>Batch no.<input name="batch_no" maxlength="80" placeholder="Optional"></label>
       <label>Manufactured on<input name="mfg_date" type="date"></label>
       <label>Expires on<input name="expiry_date" type="date"></label>
      </div><p id="businessItem73Status" class="hint" role="status"></p><div class="toolbar"><button class="primary-btn" type="submit">Save business details</button><button class="secondary-btn" type="button" data-business73-close>Cancel</button></div></form>`;
    document.body.append(d);
    d.querySelectorAll('[data-business73-close]').forEach(b => b.onclick = () => d.close());
    d.querySelector('form').onsubmit = saveBusinessItem;
    return d;
  }
  async function openBusinessItem(id, name = '') {
    const d = ensureBusinessDialog(), f = d.querySelector('form'), st = document.getElementById('businessItem73Status');
    editItemId = id; f.reset(); f.default_discount.value = '0'; st.textContent = 'Loading…';
    document.getElementById('businessItem73Title').textContent = name ? `Business details · ${name}` : 'Business details';
    if (!d.open) d.showModal();
    try {
      const data = await call('restaurant_business_item73',{p_id:id});
      for (const [k,v] of Object.entries(data || {})) {
        const input = f.elements[k]; if (!input) continue;
        if (input.type === 'checkbox') input.checked = v === true; else input.value = v ?? '';
      }
      f.querySelector('button[type=submit]').disabled = data?.can_edit === false;
      st.textContent = data?.can_edit === false ? 'Only an administrator can change these private fields.' : 'Private fields loaded.';
    } catch (e) {
      f.querySelector('button[type=submit]').disabled = true;
      st.textContent = /restaurant_business_item73|schema cache|PGRST202/i.test(e.message) ? 'Run SUPABASE/7-RUN-THIS-NOW (release 73 business parity).sql, then refresh.' : e.message;
    }
  }
  async function saveBusinessItem(event) {
    event.preventDefault(); const f = event.currentTarget, st = document.getElementById('businessItem73Status'), b = f.querySelector('button[type=submit]');
    if (!editItemId) return; b.disabled = true; st.textContent = 'Saving…';
    const p = Object.fromEntries(new FormData(f)); p.tax_inclusive = f.tax_inclusive.checked;
    try { await call('restaurant_business_item_save73',{p_id:editItemId,p_data:p}); st.textContent = 'Saved. Code/barcode lookup is available in Billing.'; setTimeout(()=>document.getElementById('businessItem73Dialog')?.close(),450); }
    catch (e) { st.textContent = e.message; }
    finally { b.disabled = false; }
  }

  function decorateMenuRows() {
    if (document.body.classList.contains('waiter-site')) return;
    const root = document.getElementById('adminMenuList'); if (!root) return;
    for (const card of root.querySelectorAll('[data-menu-id]')) {
      const id = card.dataset.menuId, actions = card.querySelector('.staff-detail-actions');
      if (!id || !actions || actions.querySelector('[data-business73]')) continue;
      const b = document.createElement('button'); b.type='button'; b.className='secondary-btn'; b.dataset.business73=id; b.textContent='Business details';
      actions.insertBefore(b, actions.querySelector('.danger-btn'));
    }
  }

  function ensureHistoryDialog() {
    let d=document.getElementById('stockHistory73Dialog'); if(d)return d;
    d=document.createElement('dialog'); d.id='stockHistory73Dialog'; d.className='dlg68 stockhistory73-dialog';
    d.innerHTML=`<div class="dlg68-head"><div><span class="eyebrow73">Inventory ledger</span><h2>Stock history</h2></div><button type="button" class="secondary-btn" data-history73-close>×</button></div><div id="stockHistory73Body"><p class="hint">Loading…</p></div><div class="stockhistory73-footer"><button id="stockHistory73Prev" class="secondary-btn" type="button">Previous</button><span id="stockHistory73Page" class="hint"></span><button id="stockHistory73Next" class="secondary-btn" type="button">Next</button></div>`;
    document.body.append(d); d.querySelector('[data-history73-close]').onclick=()=>d.close();
    document.getElementById('stockHistory73Prev').onclick=()=>{historyOffset=Math.max(0,historyOffset-50);loadStockHistory();};
    document.getElementById('stockHistory73Next').onclick=()=>{historyOffset+=50;loadStockHistory();}; return d;
  }
  async function loadStockHistory() {
    const d=ensureHistoryDialog(),body=document.getElementById('stockHistory73Body'),page=document.getElementById('stockHistory73Page');
    body.innerHTML='<p class="hint">Loading stock movements…</p>'; if(!d.open)d.showModal();
    try {
      const out=await call('restaurant_stock_history73',{p_menu_id:null,p_offset:historyOffset,p_limit:50}),rows=out?.records||[],total=Number(out?.total||0);
      if(historyOffset>=total&&historyOffset>0){historyOffset=Math.max(0,Math.floor(Math.max(0,total-1)/50)*50);return loadStockHistory();}
      body.innerHTML=rows.length?`<div class="table-scroll"><table class="stockhistory73-table"><thead><tr><th>Time</th><th>Item</th><th>Change</th><th>Count</th><th>Type</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(new Date(x.changed_at).toLocaleString())}</td><td><b>${esc(x.name)}</b><small>${esc(x.variant==='single'?x.category:(x.category+' · '+x.variant))}</small></td><td class="${Number(x.delta)<0?'neg68':Number(x.delta)>0?'good68':''}">${Number(x.delta)>0?'+':''}${esc(x.delta)}</td><td>${esc(x.before_qty??'—')} → <b>${esc(x.after_qty??'—')}</b></td><td>${esc(String(x.reason||'change').replaceAll('_',' '))}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty68">No stock movements have been recorded yet.</div>';
      page.textContent=total?`${historyOffset+1}–${Math.min(historyOffset+50,total)} of ${total}`:'0 records';
      document.getElementById('stockHistory73Prev').disabled=historyOffset<=0; document.getElementById('stockHistory73Next').disabled=historyOffset+50>=total;
    } catch(e){body.innerHTML=`<div class="empty68">${esc(/restaurant_stock_history73|schema cache|PGRST202/i.test(e.message)?'Run SUPABASE/7-RUN-THIS-NOW (release 73 business parity).sql to enable stock history.':e.message)}</div>`;}
  }
  function decorateStocks() {
    if (document.body.classList.contains('waiter-site')) return;
    const sec=document.getElementById('stocksSection'); if(!sec)return; const tools=sec.querySelector(':scope > .page-tools');
    if(tools&&!document.getElementById('stockHistory73Open')){const b=document.createElement('button');b.id='stockHistory73Open';b.type='button';b.className='secondary-btn';b.textContent='History';b.onclick=()=>{historyOffset=0;loadStockHistory();};tools.append(b);}
  }

  document.addEventListener('click',e=>{const b=e.target.closest('[data-business73]');if(b)openBusinessItem(b.dataset.business73,b.closest('[data-menu-id]')?.querySelector('h4')?.textContent||'');});

  // Existing menu renderer replaces row markup. Re-attach the business button after every render.
  const hookRenderer = () => {
    if (typeof window.renderAdminMenu === 'function' && !window.renderAdminMenu.__business73) {
      const original=window.renderAdminMenu; window.renderAdminMenu=function(...args){const r=original.apply(this,args);queueMicrotask(decorateMenuRows);return r;}; window.renderAdminMenu.__business73=true;
    }
    decorateMenuRows(); decorateStocks();
  };
  hookRenderer();
  new MutationObserver(()=>requestAnimationFrame(()=>{decorateMenuRows();decorateStocks();})).observe(document.body,{childList:true,subtree:true});

  // Load capability state after staff auth appears; repaint records once Cash/UPI/Card is available.
  let tries=0; const timer=setInterval(async()=>{tries++; const signed=typeof loggedIn==='undefined'?isWaiter():loggedIn; if(!signed&&tries<120)return; clearInterval(timer); const before=paymentMethods().join('|'); await ready(); if(paymentMethods().join('|')!==before&&typeof renderHistory==='function'&&typeof recordsData!=='undefined'&&recordsData)try{renderHistory();}catch{}},500);

  window.Business73={ready,paymentMethods,lookup,openBusinessItem,loadStockHistory,get capabilities(){return caps;}};
})();
