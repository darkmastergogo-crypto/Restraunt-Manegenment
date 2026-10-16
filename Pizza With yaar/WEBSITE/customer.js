'use strict';
let sharedMenu=[], receipts=[], pendingAttempt=null, serverOffset=0, menuBusy=false, trackingBusy=false,bestSellers=[],bestBusy=false;
let receiptSyncPromise=null,receiptSyncError='',historyReturnFocus=null,trackingHistoryMode=false;
const CURRENT_VISIT_MS=2*60*60*1000, HISTORY_KEEP_MS=3*60*60*1000;
function receiptAge(r){const t=Date.parse(r?.created_at);return Number.isFinite(t)?Math.max(0,Date.now()+serverOffset-t):Infinity;}
function pruneReceipts(){const kept=receipts.filter(r=>receiptAge(r)<HISTORY_KEEP_MS);if(kept.length!==receipts.length){receipts=kept;saveReceipts();if(activeOrder&&!receipts.some(r=>r.id===activeOrder.id))activeOrder=null;}}
const CURRENT_ORDER_STATUSES=new Set(['Pending','Accepted','Cooking','Ready']);
const RECEIPT_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let activeCategory = "All";
    let cart = {}; // itemId -> { item, qty }
    let currentTable = "T1";
    let activeOrder = null; // { orderId, table, items, total, status }

    // Init from URL Query Params (e.g. ?table=T1 or ?table=2)
    function initTable() {
      const urlParams = new URLSearchParams(window.location.search);
      const tableParam = urlParams.get('table');
      if (tableParam) {
        currentTable = tableParam.toUpperCase();
      } else {
        const stored = localStorage.getItem('CURRENT_TABLE');
        currentTable = stored || "T1";
      }
      localStorage.setItem('CURRENT_TABLE', currentTable);
      document.getElementById('tableText').innerText = `Table ${currentTable}`;
      document.getElementById('custTableInput').value = `Table ${currentTable}`;
      document.getElementById('cartTableLabel').textContent = `Table ${currentTable}`;
    }

    // Load branding
    function initBranding() {
      document.getElementById('restaurantName').innerText = RESTAURANT_CONFIG.restaurantName || '';
      document.getElementById('restaurantTagline').innerText = RESTAURANT_CONFIG.tagline;
      document.getElementById('googleReviewBtn').href = RESTAURANT_CONFIG.googleReviewUrl;
    }

    // Render Categories
    function renderCategories() {
      const bar = document.getElementById('categoriesBar');
      bar.innerHTML = ['All','Best Sellers','Recommended',...Cloud.categories.slice(1)].map(cat => `
        <button class="cat-btn ${cat === activeCategory ? 'active' : ''}" onclick="selectCategory('${cat}')">
          ${cat}
        </button>
      `).join('');
    }

    function selectCategory(cat) {
      activeCategory = cat;
      renderCategories();
      renderMenuItems();
    }

    // Helper to normalize category matching
    function normalizeCategory(cat) {
      if (!cat) return "Starters";
      const c = String(cat).toLowerCase().replace(/[-_]/g, ' ').trim();
      if (c.includes('start') || c.includes('snack') || c.includes('top pick')) return 'Starters';
      if (c.includes('main')) return 'Main Course';
      if (c.includes('bread') || c.includes('rice') || c.includes('naan') || c.includes('roti')) return 'Breads & Rice';
      if (c.includes('drink') || c.includes('tea') || c.includes('chai') || c.includes('coffee') || c.includes('beverage')) return 'Drinks';
      if (c.includes('dessert') || c.includes('sweet')) return 'Desserts';
      return cat;
    }

    function getActiveMenuItems(){return sharedMenu.filter(i=>i.available!==false);}

    // Render Menu Items
    function renderMenuItems(filteredList = null) {
      const container = document.getElementById('menuContainer');
      const allItems = getActiveMenuItems();
      const q=document.getElementById('searchInput').value.toLowerCase().trim();
      const list=(filteredList||allItems).filter(i=>activeCategory==='All'||activeCategory==='Best Sellers'&&bestSellers.some(b=>b.id===i.id)||activeCategory==='Recommended'&&i.recommended||normalizeCategory(i.category)===activeCategory).filter(i=>!q||[i.name,i.description,i.category].some(v=>String(v).toLowerCase().includes(q)));

      if (list.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:40px; color:#94a3b8;">No items found in ${activeCategory}.</div>`;
        return;
      }

      container.innerHTML = list.map(item => {
        const inCartQty = cart[item.id] ? cart[item.id].qty : 0;
        const imgHtml = (item.image)
          ? `<img class="item-img" src="${Cloud.esc(Cloud.safeImage(item.image))}" alt="${Cloud.esc(item.name)}" loading="lazy">`
          : `<div class="item-img" style="display:flex;align-items:center;justify-content:center;font-size:2.8rem;background:#f1f5f9;border-radius:12px;">🍽️</div>`;

        return `
          <div class="item-card">
            <div class="item-info">
              <div>
                <div class="badge-veg-nonveg ${item.veg ? 'badge-veg' : 'badge-nonveg'}">
                  <span class="dot"></span>
                </div>
                <h3 class="item-title">${Cloud.esc(item.name)}</h3>${item.recommended?'<span class="menu-label">Recommended</span>':''}${bestSellers.some(b=>b.id===item.id)?'<span class="menu-label">Best seller</span>':''}
                <div class="item-price">${(typeof RESTAURANT_CONFIG !== 'undefined' ? RESTAURANT_CONFIG.currency : '₹')}${item.price}</div>
                <p class="item-desc">${Cloud.esc(item.description)}</p>
              </div>
            </div>
            <div class="item-img-container">
              ${imgHtml}
              <div class="action-btn-wrapper">
                ${inCartQty === 0 ? `
                  <button class="btn-add" data-qty="1" data-item="${Cloud.esc(item.id)}">+ Add</button>
                ` : `
                  <div class="qty-counter">
                    <button class="qty-btn" data-qty="-1" data-item="${Cloud.esc(item.id)}">−</button>
                    <span>${inCartQty}</span>
                    <button class="qty-btn" data-qty="1" data-item="${Cloud.esc(item.id)}">+</button>
                  </div>
                `}
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    function handleSearch(){renderMenuItems();}

    // Cart Operations
    function updateQty(itemId, delta) {
      const item = getActiveMenuItems().find(i => String(i.id) === String(itemId)) || (delta < 0 ? cart[itemId]?.item : null);
      if (!item) return;

      const current = cart[itemId] ? cart[itemId].qty : 0;
      const next = current + delta;

      if (next <= 0) {
        delete cart[itemId];
      } else {
        cart[itemId] = { item, qty: Math.min(50,next) };
      }

      renderMenuItems();
      updateCartUI();
    }

    function updateCartUI() {
      const items = Object.values(cart);
      const totalCount = items.reduce((sum, i) => sum + i.qty, 0);
      const totalPrice = items.reduce((sum, i) => sum + (i.qty * i.item.price), 0);

      const bar = document.getElementById('floatingCartBar');
      if (totalCount > 0) {
        bar.style.display = 'flex';
        document.getElementById('cartItemsCount').innerText = `${totalCount} ITEM${totalCount > 1 ? 'S' : ''}`;
        document.getElementById('cartTotalPrice').innerText = `${RESTAURANT_CONFIG.currency}${totalPrice}`;
      } else {
        bar.style.display = 'none';
      }

      // Drawer updates
      const placeOrderSpan = document.getElementById('placeOrderAmount');
      if (placeOrderSpan) placeOrderSpan.innerText = `${RESTAURANT_CONFIG.currency}${totalPrice}`;
      const subtotalEl = document.getElementById('billSubtotal');
      if (subtotalEl) subtotalEl.innerText = `${RESTAURANT_CONFIG.currency}${totalPrice}`;
      const totalEl = document.getElementById('billTotal');
      if (totalEl) totalEl.innerText = `${RESTAURANT_CONFIG.currency}${totalPrice}`;

      const listContainer = document.getElementById('cartItemsList');
      if (items.length === 0) {
        listContainer.innerHTML = `<p style="text-align:center; color:#94a3b8; padding:20px;">Your cart is empty.</p>`;
      } else {
        listContainer.innerHTML = items.map(c => `
          <div class="cart-item-row">
            <div class="cart-item-info">
              <h4>${Cloud.esc(c.item.name)}</h4>
              <p>${RESTAURANT_CONFIG.currency}${c.item.price} × ${c.qty} = ${RESTAURANT_CONFIG.currency}${c.item.price * c.qty}</p>
            </div>
            <div class="cart-item-stepper">
              <button data-qty="-1" data-item="${Cloud.esc(c.item.id)}">−</button>
              <span style="font-weight:700;">${c.qty}</span>
              <button data-qty="1" data-item="${Cloud.esc(c.item.id)}">+</button>
            </div>
          </div>
        `).join('');
      }
    }

    function openCartDrawer() {
      document.getElementById('drawerOverlay').classList.add('open');
      document.getElementById('cartDrawer').classList.add('open');
    }

    function closeCartDrawer() {
      document.getElementById('drawerOverlay').classList.remove('open');
      document.getElementById('cartDrawer').classList.remove('open');
    }

const $=id=>document.getElementById(id);
function message(text,error=false){$('cloudMessage').textContent=text;$('cloudMessage').dataset.error=String(error);$('cloudMessage').style.color=error?'#b91c1c':'#475569';}
function mapMenu(row){return {...row,price:Number(row.price),image:Cloud.safeImage(row.image),description:row.description||''};}
async function loadSharedMenu(){
 if(menuBusy)return;menuBusy=true;
 try{
  const rows=await Cloud.menu(false),signature=JSON.stringify(rows);
  if(signature!==loadSharedMenu.signature){sharedMenu=rows.map(mapMenu);loadSharedMenu.signature=signature;
   let removed=false;Object.keys(cart).forEach(id=>{const item=sharedMenu.find(m=>m.id===id);if(!item){delete cart[id];removed=true;}else cart[id].item=item;});
   handleSearch();updateCartUI();if(removed)message('An unavailable item was removed from your cart.');else message(rows.length?'Live restaurant menu · updates automatically':'No dishes are available right now. Please ask a waiter.');
  }else if(rows.length)message('Live restaurant menu · updates automatically');
 }catch(e){message('Menu connection error: '+e.message+' Please retry or ask a waiter.',true);if(!sharedMenu.length)$('menuContainer').textContent='The menu could not be loaded. No order will be sent without a cloud connection.';}
 finally{menuBusy=false;}
}
function attemptKey(){return 'RESTAURANT_PENDING_v2_'+currentTable;}
function saveReceipts(){Cloud.write('RESTAURANT_RECEIPTS_v2',receipts);}
function rememberOrder(row,token){
 if(row.server_now)serverOffset=new Date(row.server_now).getTime()-Date.now();
 const receipt={...row,token}, index=receipts.findIndex(r=>r.id===row.id);
 if(index<0)receipts.push(receipt);else receipts[index]=receipt;
 receipts=receipts.slice(-100);saveReceipts();activeOrder=receipt;
 Cloud.write('RESTAURANT_ACTIVE_v2',row.id);
}
function currentTableReceipts(){
 pruneReceipts();return receipts.filter(r=>r&&r.table_number===currentTable&&r.id)
  .slice().sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
}
function isCurrentOrder(r){return !!r&&!r.tracking_unavailable&&CURRENT_ORDER_STATUSES.has(r.status)&&receiptAge(r)<CURRENT_VISIT_MS;}
function currentOrders(){return currentTableReceipts().filter(isCurrentOrder);}
function pastOrders(){return currentTableReceipts().filter(r=>!isCurrentOrder(r)).reverse();}
function receiptStatus(r){return r.tracking_unavailable?'Unavailable on this project':r.status;}
function receiptDate(r){return new Date(r.created_at).toLocaleString([],{dateStyle:'medium',timeStyle:'short'});}
function renderOrderLists(){
 const current=currentOrders(),past=pastOrders(),latest=current.at(-1);
 $('customerOrdersBar').hidden=!current.length&&!past.length;
 $('currentOrdersButton').textContent=`Order status (${current.length})`;
 $('currentOrdersButton').disabled=!current.length;
 $('orderHistoryButton').textContent=`Order history (${past.length})`;
 $('activeOrderBanner').style.display=latest?'flex':'none';
 if(latest)$('bannerStatusText').textContent=`${current.length===1?'Order in progress':current.length+' current orders'} · ${latest.status}`;
 $('orderSyncMessage').textContent=receiptSyncError;
 $('historySyncMessage').textContent=receiptSyncError;
 $('orderHistorySubtitle').textContent=`Table ${currentTable} · History from the last 3 hours on this device`;
 const html=past.length?past.map(r=>`<button type="button" class="history-order-card" data-history-order="${Cloud.esc(r.id)}"><span class="history-card-top"><strong>${Cloud.esc(String(r.order_id||r.id).slice(0,12))}</strong><span class="history-card-status">${Cloud.esc(receiptStatus(r))}</span></span><span class="history-card-date">${Cloud.esc(receiptDate(r))}</span>${r.rejection_reason?`<span class="history-card-reason">${Cloud.esc(r.rejection_reason)}</span>`:''}<span class="history-card-bottom"><span>${Cloud.esc(RESTAURANT_CONFIG.currency)}${Number(r.total||0).toFixed(2)}</span><span>View order →</span></span></button>`).join(''):'<p class="history-empty">No past orders for this table on this device yet. Served, cancelled and rejected orders will appear here.</p>';
 if($('orderHistoryList').innerHTML!==html)$('orderHistoryList').innerHTML=html;
}
function openOrderHistory(){
 historyReturnFocus=document.activeElement;
 renderOrderLists();$('orderHistoryModal').hidden=false;
 $('orderHistoryModal').scrollTo({top:0,behavior:'instant'});
 $('orderHistoryModal').querySelector('.btn-close-drawer').focus();
 syncDeviceOrders(true);
}
function closeOrderHistory(){
 $('orderHistoryModal').hidden=true;
 if(historyReturnFocus?.isConnected)historyReturnFocus.focus();
}
async function syncDeviceOrders(forceAll=false){
 if(receiptSyncPromise){
  await receiptSyncPromise;
  if(forceAll)return syncDeviceOrders(true);
  return;
 }
 const submitted=currentTableReceipts().filter(r=>RECEIPT_UUID.test(r.id)&&RECEIPT_UUID.test(r.token||''))
  .filter(r=>forceAll||isCurrentOrder(r)||r.id===activeOrder?.id&&$('trackingModal').classList.contains('open'))
  .slice(-100).map(r=>({id:r.id,token:r.token}));
 if(!submitted.length){renderOrderLists();return;}
 receiptSyncPromise=(async()=>{
  try{
   const data=await Cloud.rpc('restaurant_get_device_orders',{p_receipts:submitted});
   if(!data||!Array.isArray(data.orders)||!Array.isArray(data.unavailable_ids))throw Error('Invalid saved-order response. Please retry.');
   if(data.server_now)serverOffset=new Date(data.server_now).getTime()-Date.now();
   const sent=new Map(submitted.map(r=>[r.id,r])),rows=new Map(data.orders.filter(r=>sent.has(r.id)).map(r=>[r.id,r]));
   const unavailable=new Set(data.unavailable_ids.filter(id=>sent.has(id)));
   receipts=receipts.map(r=>rows.has(r.id)?(new Date(r.updated_at||0)>new Date(rows.get(r.id).updated_at||0)?r:{...rows.get(r.id),token:sent.get(r.id).token}):unavailable.has(r.id)?{...r,tracking_unavailable:true}:r);
   saveReceipts();
   if(activeOrder)activeOrder=receipts.find(r=>r.id===activeOrder.id)||null;
   receiptSyncError='';
   renderOrderLists();if(activeOrder)renderTracking();
   $('trackingError').textContent='';
  }catch(e){
   receiptSyncError='Saved order statuses may be out of date. '+(/restaurant_get_device_orders|schema cache|Could not find the function/i.test(e.message)?'Install the order-history database upgrade first.':e.message);
   renderOrderLists();if($('trackingModal').classList.contains('open'))$('trackingError').textContent=receiptSyncError;
  }
 })();
 try{await receiptSyncPromise;}finally{receiptSyncPromise=null;}
}
async function placeOrder(){
 const btn=$('btnPlaceOrder');if(btn.disabled)return;
 const entries=Object.values(cart);if(!entries.length&&!pendingAttempt)return;
 try{
  if(!pendingAttempt){pendingAttempt={request_id:crypto.randomUUID(),token:crypto.randomUUID(),table:currentTable,name:$('custNameInput').value.trim().slice(0,80)||'Guest',notes:$('custNotesInput').value.trim().slice(0,1000),items:entries.map(c=>({id:c.item.id,qty:c.qty}))};Cloud.write(attemptKey(),pendingAttempt);}
  btn.disabled=true;btn.textContent='Saving order to kitchen…';
  const a=pendingAttempt;
  const row=await Cloud.rpc('restaurant_create_order',{p_request_id:a.request_id,p_token:a.token,p_table:a.table,p_name:a.name,p_notes:a.notes,p_items:a.items});
  rememberOrder(row,a.token);localStorage.removeItem(attemptKey());pendingAttempt=null;
  $('pendingRetry').hidden=true;cart={};handleSearch();updateCartUI();closeCartDrawer();openTrackingModal();message('Order saved. Waiting for kitchen acceptance.');
  if(!['Cancelled','Rejected'].includes(row.status)&&window.OrderCelebration){OrderCelebration.show(row.id,()=>promptOrderReview(row.id));}
  else promptOrderReview(row.id);
 }catch(e){message('Order not confirmed: '+e.message+' Use “Retry original order” to safely retry the same submission.',true);
  // A definite database validation error is safe to edit/retry with a new request.
  if(/unavailable|Invalid|Quantity|Cart must|Name or notes/.test(e.message)){pendingAttempt=null;$('pendingRetry').hidden=true;localStorage.removeItem(attemptKey());await loadSharedMenu();}
 }finally{$('pendingRetry').hidden=!pendingAttempt;btn.disabled=false;btn.innerHTML=pendingAttempt?'Retry original order':`<span>Place Order</span><span id="placeOrderAmount">${Cloud.esc(RESTAURANT_CONFIG.currency)}${Object.values(cart).reduce((s,c)=>s+c.qty*c.item.price,0)}</span>`;}
}
function chooseOrder(id){const receipt=receipts.find(r=>r.id===id&&r.table_number===currentTable);if(receipt){trackingHistoryMode=!isCurrentOrder(receipt);activeOrder=receipt;Cloud.write('RESTAURANT_ACTIVE_v2',id);$('orderHistoryModal').hidden=true;$('trackingModal').classList.add('open');renderTracking();pollActiveOrder();$('trackingModal').scrollTo({top:0,behavior:'instant'});}}
function openTrackingModal(){trackingHistoryMode=false;activeOrder=currentOrders().at(-1)||null;$('trackingModal').classList.add('open');renderTracking();pollActiveOrder();}
function closeTrackingModal(){$('trackingModal').classList.remove('open');}
function renderTracking(){
 renderOrderLists();
 if(!trackingHistoryMode&&!isCurrentOrder(activeOrder))activeOrder=currentOrders().at(-1)||null;
 const empty=!activeOrder;
 $('trackingEmpty').hidden=!empty;
 ['trackingStepper','trackingItemsSection','trackingActions','trackingCancelPanel'].forEach(id=>$(id).hidden=empty);
 $('trackingModal').querySelector('.tracking-status-hero').hidden=empty;
 if(empty){$('trackingTitle').textContent='Order status';$('trackingOrderIdentity').textContent='Table '+currentTable;$('otherOrdersPanel').hidden=true;return;}
 $('trackingTableLabel').textContent='Table '+activeOrder.table_number;
 const tableOrders=currentOrders();
 const currentNumber=tableOrders.findIndex(r=>r.id===activeOrder.id)+1;
 $('trackingTitle').textContent=isCurrentOrder(activeOrder)?'Order Status':'Past order';
 $('trackingOrderIdentity').textContent=(isCurrentOrder(activeOrder)?`Order ${currentNumber} of ${tableOrders.length}`:'Saved in order history')+` · ${String(activeOrder.order_id||activeOrder.id).slice(0,12)}`;
 const others=tableOrders.map((r,i)=>({r,number:i+1})).filter(o=>o.r.id!==activeOrder.id);
 $('otherOrdersPanel').hidden=others.length===0;
 const tabs=others.map(({r,number})=>`<button type="button" class="other-order-tab" data-switch-order="${Cloud.esc(r.id)}" aria-label="View order ${number}, ${Cloud.esc(r.status)}"><span class="other-order-tab-top"><strong>Order ${number}</strong><span aria-hidden="true">→</span></span><span class="other-order-state">${Cloud.esc(r.status)} · ${new Date(r.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span><span class="other-order-id">${Cloud.esc(String(r.order_id||r.id).slice(0,12))}</span></button>`).join('');
 if($('otherOrderTabs').innerHTML!==tabs)$('otherOrderTabs').innerHTML=tabs;
 $('trackingItemsList').innerHTML=activeOrder.items.map(i=>`<div style="display:flex;justify-content:space-between;gap:16px;padding:4px 0;"><span>${Cloud.esc(i.name)} × ${i.qty}</span><b>${Cloud.esc(RESTAURANT_CONFIG.currency)}${Number(i.subtotal).toFixed(2)}</b></div>`).join('')+`<div style="display:flex;justify-content:space-between;border-top:1px solid #cbd5e1;margin-top:8px;padding-top:8px;"><b>Total</b><b>${Cloud.esc(RESTAURANT_CONFIG.currency)}${Number(activeOrder.total).toFixed(2)}</b></div>`;
 updateTrackingStatusDisplay(activeOrder.status);updateCancelTimer();
}
function updateTrackingStatusDisplay(status){
 const copy={Pending:['⏳','Waiting for kitchen acceptance','Your order is safely saved. A staff member will accept it shortly.'],Accepted:['🔥','Cooking in the kitchen','The kitchen is preparing your food.'],Cooking:['🔥','Cooking in the kitchen','Cooking has started. Online cancellation is now closed.'],Ready:['🔔','Ready for your table','Please ask a waiter to bring your dishes.'],Served:['✨','Served & complete','Enjoy your meal! This order is saved in your order history.'],Cancelled:['×','Order cancelled',activeOrder?.rejection_reason||'This order was cancelled and is saved in your order history.'],Rejected:['×','Order unavailable',activeOrder?.rejection_reason||'The kitchen could not accept this order. Please ask a waiter.']};
 const [icon,title,sub]=activeOrder?.tracking_unavailable?['?','Saved order unavailable','This receipt could not be verified on the current shop database. Ask a waiter. Its previous details are retained below.']:(copy[status]||['?','Saved order','Please ask a waiter for an update.']);
 $('trackingStatusIcon').textContent=icon;$('trackingStatusTitle').textContent=title;$('trackingStatusSub').textContent=sub;
 $('trackingStepper').hidden=!!activeOrder?.tracking_unavailable||['Cancelled','Rejected'].includes(status);
 const step=status==='Served'?3:['Accepted','Cooking','Ready'].includes(status)?2:1;
 for(let i=1;i<=3;i++)$('step'+i).className='stepper-step '+(status==='Served'||i<step?'completed':i===step?'active':'');

}
function updateCancelTimer(){
 if(!activeOrder)return;
 const remaining=Math.max(0,new Date(activeOrder.cancel_deadline||new Date(activeOrder.created_at).getTime()+300000).getTime()-(Date.now()+serverOffset));
 const allowed=!activeOrder.tracking_unavailable&&['Pending','Accepted'].includes(activeOrder.status)&&!activeOrder.cooking_started_at&&remaining>0;
 $('cancelOrderButton').disabled=!allowed;
 $('cancelOrderButton').hidden=!isCurrentOrder(activeOrder);
 $('cancelCountdown').textContent=activeOrder.tracking_unavailable?'Receipt unavailable on this shop database.':allowed?`Cancel within ${Math.floor(remaining/60000)}:${String(Math.floor(remaining/1000)%60).padStart(2,'0')} — only before cooking starts.`:activeOrder.status==='Cancelled'?'Cancelled · saved in order history.':activeOrder.status==='Served'?'Completed · saved in order history.':activeOrder.status==='Rejected'?'Rejected · saved in order history.':['Cooking','Ready'].includes(activeOrder.status)?'Cancellation closed: cooking has already started.':'Cancellation window is closed.';
}
function pollActiveOrder(){return syncDeviceOrders();}
async function cancelCustomerOrder(){
 if(!activeOrder||$('cancelOrderButton').disabled||!confirm('Cancel this order? This cannot be undone.'))return;
 $('cancelOrderButton').disabled=true;
 try{const row=await Cloud.rpc('restaurant_cancel_order',{p_id:activeOrder.id,p_token:activeOrder.token});rememberOrder(row,activeOrder.token);renderTracking();$('trackingError').textContent='';}
 catch(e){$('trackingError').textContent=e.message;await pollActiveOrder();}finally{updateCancelTimer();}
}
function addMoreItems(){closeTrackingModal();window.scrollTo({top:0,behavior:'smooth'});}
function promptOrderReview(id){const link=RESTAURANT_CONFIG.googleReviewUrl;if(!/^https:\/\//.test(link||'')||link.includes('YOUR_PLACE_ID'))return;try{if(Cloud.read('REVIEW_SHOWN_'+id,false))return;Cloud.write('REVIEW_SHOWN_'+id,true);}catch{}setTimeout(showGoogleReviewModal,500);}
function showGoogleReviewModal(){$('reviewOverlay').classList.add('open');}
function closeReviewModal(){$('reviewOverlay').classList.remove('open');}
document.addEventListener('click',e=>{const history=e.target.closest('[data-history-order]');if(history){chooseOrder(history.dataset.historyOrder);return;}const tab=e.target.closest('[data-switch-order]');if(tab){chooseOrder(tab.dataset.switchOrder);return;}const b=e.target.closest('[data-qty]');if(b)updateQty(b.dataset.item,Number(b.dataset.qty));});
document.addEventListener('keydown',e=>{
 if($('orderHistoryModal').hidden)return;
 if(e.key==='Escape'){e.preventDefault();closeOrderHistory();return;}
 if(e.key==='Tab'){
  const buttons=[...$('orderHistoryModal').querySelectorAll('button:not([disabled])')];
  const first=buttons[0],last=buttons.at(-1);
  if(!$('orderHistoryModal').contains(document.activeElement)){e.preventDefault();first.focus();}
  else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
 }
});
window.addEventListener('DOMContentLoaded',()=>{
 try{initTable();initBranding();renderCategories();updateCartUI();
  const saved=Cloud.read('RESTAURANT_RECEIPTS_v2',[]);receipts=Array.isArray(saved)?saved.filter(r=>r&&typeof r==='object'):[];
  const id=Cloud.read('RESTAURANT_ACTIVE_v2',null);activeOrder=currentOrders().find(r=>r.id===id)||currentOrders().at(-1)||null;
  pendingAttempt=Cloud.read(attemptKey(),null);
  if(pendingAttempt){$('pendingRetry').hidden=false;$('btnPlaceOrder').textContent='Retry original order';message('A previous order was not confirmed. Open your cart and retry the original submission.');$('floatingCartBar').style.display='flex';$('cartItemsCount').textContent='ORDER NEEDS CONFIRMATION';}
  renderOrderLists();if(activeOrder)renderTracking();syncDeviceOrders(true);loadSharedMenu();loadBestSellers();checkCustomerTable();
 }catch(e){message(e.message,true);}
});
setInterval(()=>{if(!document.hidden){loadSharedMenu();pollActiveOrder();}},5000);
setInterval(()=>{if(!document.hidden){pruneReceipts();if($('trackingModal').classList.contains('open'))renderTracking();else renderOrderLists();updateCancelTimer();}},1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){loadSharedMenu();pollActiveOrder();}});

async function loadBestSellers(){if(bestBusy)return;bestBusy=true;try{bestSellers=await Cloud.rpc('restaurant_best_sellers',{});handleSearch();}catch(e){if(activeCategory==='Best Sellers')message('Best sellers could not load: '+e.message,true);}finally{bestBusy=false;}}
setInterval(()=>{if(!document.hidden)loadBestSellers();},30000);

async function checkCustomerTable(){try{const t=await Cloud.rpc('restaurant_table_info',{p_table:currentTable});if(!t?.active){$('tableText').textContent='Table unavailable';message('This table link is no longer active. Please ask a waiter.',true);}}catch(e){message('Table check failed: '+e.message,true);}}
