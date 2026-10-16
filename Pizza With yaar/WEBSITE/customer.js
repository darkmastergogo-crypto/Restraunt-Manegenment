'use strict';
let sharedMenu=[], receipts=[], pendingAttempt=null, serverOffset=0, menuBusy=false, trackingBusy=false,bestSellers=[],bestBusy=false;
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
function chooseOrder(id){activeOrder=receipts.find(r=>r.id===id&&r.table_number===currentTable);if(activeOrder){Cloud.write('RESTAURANT_ACTIVE_v2',id);renderTracking();pollActiveOrder();$('trackingModal').scrollTo({top:0,behavior:'instant'});}}
function openTrackingModal(){if(!activeOrder)return;$('trackingModal').classList.add('open');renderTracking();pollActiveOrder();}
function closeTrackingModal(){$('trackingModal').classList.remove('open');}
function renderTracking(){
 if(!activeOrder)return;
 $('activeOrderBanner').style.display='flex';$('trackingTableLabel').textContent='Table '+activeOrder.table_number;
 const tableOrders=receipts.filter(r=>r.table_number===currentTable).slice().sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
 const currentNumber=tableOrders.findIndex(r=>r.id===activeOrder.id)+1;
 $('trackingOrderIdentity').textContent=`Order ${currentNumber} of ${tableOrders.length} · ${activeOrder.order_id.slice(0,12)}`;
 const others=tableOrders.map((r,i)=>({r,number:i+1})).filter(o=>o.r.id!==activeOrder.id);
 $('otherOrdersPanel').hidden=others.length===0;
 const tabs=others.map(({r,number})=>`<button type="button" class="other-order-tab" data-switch-order="${Cloud.esc(r.id)}" aria-label="View order ${number}, ${Cloud.esc(r.status)}"><span class="other-order-tab-top"><strong>Order ${number}</strong><span aria-hidden="true">→</span></span><span class="other-order-state">${Cloud.esc(r.status)} · ${new Date(r.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span><span class="other-order-id">${Cloud.esc(r.order_id.slice(0,12))}</span></button>`).join('');
 if($('otherOrderTabs').innerHTML!==tabs)$('otherOrderTabs').innerHTML=tabs;
 $('trackingItemsList').innerHTML=activeOrder.items.map(i=>`<div style="display:flex;justify-content:space-between;gap:16px;padding:4px 0;"><span>${Cloud.esc(i.name)} × ${i.qty}</span><b>${Cloud.esc(RESTAURANT_CONFIG.currency)}${Number(i.subtotal).toFixed(2)}</b></div>`).join('')+`<div style="display:flex;justify-content:space-between;border-top:1px solid #cbd5e1;margin-top:8px;padding-top:8px;"><b>Total</b><b>${Cloud.esc(RESTAURANT_CONFIG.currency)}${Number(activeOrder.total).toFixed(2)}</b></div>`;
 updateTrackingStatusDisplay(activeOrder.status);updateCancelTimer();
}
function updateTrackingStatusDisplay(status){
 const copy={Pending:['⏳','Waiting for kitchen acceptance','Your order is safely saved. A staff member will accept it shortly.'],Accepted:['✓','Order accepted','The kitchen accepted your order. Cooking has not started yet.'],Cooking:['🔥','Cooking in the kitchen','Cooking has started. Online cancellation is now closed.'],Ready:['🔔','Ready for your table','Please ask a waiter to bring your dishes.'],Served:['✨','Served & complete','Enjoy your meal!'],Cancelled:['×','Order cancelled','Your cancellation was saved. The kitchen will not prepare this order.'],Rejected:['×','Order unavailable',activeOrder?.rejection_reason||'The kitchen could not accept this order. Please ask a waiter.']};
 const [icon,title,sub]=copy[status]||copy.Pending;
 $('trackingStatusIcon').textContent=icon;$('trackingStatusTitle').textContent=title;$('trackingStatusSub').textContent=sub;$('bannerStatusText').textContent=title;
 const step={Pending:0,Accepted:1,Cooking:2,Ready:3,Served:4}[status]??0;
 for(let i=1;i<=4;i++)$('step'+i).className='stepper-step '+(i<=step?'completed':i===step+1?'active':'');

}
function updateCancelTimer(){
 if(!activeOrder)return;
 const remaining=Math.max(0,new Date(activeOrder.cancel_deadline||new Date(activeOrder.created_at).getTime()+300000).getTime()-(Date.now()+serverOffset));
 const allowed=['Pending','Accepted'].includes(activeOrder.status)&&!activeOrder.cooking_started_at&&remaining>0;
 $('cancelOrderButton').disabled=!allowed;
 $('cancelCountdown').textContent=allowed?`Cancel within ${Math.floor(remaining/60000)}:${String(Math.floor(remaining/1000)%60).padStart(2,'0')} — only before cooking starts.`:activeOrder.status==='Cancelled'?'Cancellation confirmed.':['Cooking','Ready','Served'].includes(activeOrder.status)?'Cancellation closed: cooking has already started.':'Cancellation window is closed.';
}
async function pollActiveOrder(){
 if(!activeOrder||trackingBusy||['Served','Cancelled','Rejected'].includes(activeOrder.status))return;trackingBusy=true;
 const id=activeOrder.id,token=activeOrder.token;
 try{const row=await Cloud.rpc('restaurant_get_order',{p_id:id,p_token:token});if(activeOrder?.id===id){rememberOrder(row,token);renderTracking();$('trackingError').textContent='';}}
 catch(e){$('trackingError').textContent='Status connection error: '+e.message;}finally{trackingBusy=false;}
}
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
document.addEventListener('click',e=>{const tab=e.target.closest('[data-switch-order]');if(tab){chooseOrder(tab.dataset.switchOrder);return;}const b=e.target.closest('[data-qty]');if(b)updateQty(b.dataset.item,Number(b.dataset.qty));});
window.addEventListener('DOMContentLoaded',()=>{
 try{initTable();initBranding();renderCategories();updateCartUI();
  receipts=Cloud.read('RESTAURANT_RECEIPTS_v2',[]);const id=Cloud.read('RESTAURANT_ACTIVE_v2',null);activeOrder=receipts.find(r=>r.id===id&&r.table_number===currentTable)||receipts.filter(r=>r.table_number===currentTable).at(-1)||null;
  pendingAttempt=Cloud.read(attemptKey(),null);
  if(pendingAttempt){$('pendingRetry').hidden=false;$('btnPlaceOrder').textContent='Retry original order';message('A previous order was not confirmed. Open your cart and retry the original submission.');$('floatingCartBar').style.display='flex';$('cartItemsCount').textContent='ORDER NEEDS CONFIRMATION';}
  if(activeOrder){renderTracking();pollActiveOrder();}loadSharedMenu();loadBestSellers();
 }catch(e){message(e.message,true);}
});
setInterval(()=>{if(!document.hidden){loadSharedMenu();pollActiveOrder();}},5000);
setInterval(updateCancelTimer,1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){loadSharedMenu();pollActiveOrder();}});

async function loadBestSellers(){if(bestBusy)return;bestBusy=true;try{bestSellers=await Cloud.rpc('restaurant_best_sellers',{});handleSearch();}catch(e){if(activeCategory==='Best Sellers')message('Best sellers could not load: '+e.message,true);}finally{bestBusy=false;}}
setInterval(()=>{if(!document.hidden)loadBestSellers();},30000);
