'use strict';
let waiterOrders=[],waiterBusy=false;
const wEl=id=>document.getElementById(id),wEsc=Cloud.esc;
const waiterKey=new URLSearchParams(location.hash.slice(1)).get('key')||'';
function moneyWaiter(v){return (Cloud.cfg.currency||'₹')+Number(v||0).toFixed(2);}
function renderWaiterOrders(){
 wEl('waiterCount').textContent=waiterOrders.length+' active '+(waiterOrders.length===1?'order':'orders');
 wEl('waiterOrders').innerHTML=waiterOrders.length?waiterOrders.map(o=>`<article class="order-card"><div class="card-heading"><h3>Table ${wEsc(o.table_number)}</h3><span class="status ${o.status==='Ready'?'status-ready':''}">${wEsc(o.status)}</span></div><p class="muted order-time">${wEsc(o.order_id.slice(0,12))}… · ${new Date(o.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</p><ul class="items">${o.items.map(i=>`<li><span><b>${Number(i.qty)}×</b> ${wEsc(i.name)}</span><b>${moneyWaiter(i.subtotal)}</b></li>`).join('')}</ul><p><b>Total: ${moneyWaiter(o.total)}</b></p></article>`).join(''):'<p class="empty">No active orders right now.</p>';
}
async function loadWaiterOrders(){
 if(waiterBusy)return;
 if(!/^[a-f0-9]{64}$/.test(waiterKey)){wEl('waiterConnection').textContent='Scan QR';wEl('waiterError').textContent='Please scan the private waiter QR from the manager/receptionist. No sign-in is needed.';return;}
 waiterBusy=true;
 try{const result=await Cloud.rpc('restaurant_waiter_orders',{p_key:waiterKey});waiterOrders=result.orders;wEl('waiterConnection').textContent='Live';wEl('waiterConnection').classList.add('live');wEl('waiterError').textContent='';renderWaiterOrders();}
 catch(e){wEl('waiterConnection').textContent='Offline';wEl('waiterConnection').classList.remove('live');if(/Invalid or expired|permission denied/i.test(e.message)){waiterOrders=[];wEl('waiterOrders').innerHTML='';wEl('waiterCount').textContent='';}wEl('waiterError').textContent='Orders could not update: '+e.message+(waiterOrders.length?' Last loaded orders are shown and may be out of date.':'');}
 finally{waiterBusy=false;}
}
wEl('waiterRestaurant').textContent=Cloud.cfg.restaurantName||'';
loadWaiterOrders();setInterval(()=>{if(!document.hidden)loadWaiterOrders();},5000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadWaiterOrders();});
