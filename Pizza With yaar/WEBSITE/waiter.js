/* Orders remain read-only. A private waiter key can acknowledge customer calls only. */
'use strict';
let waiterOrders=[],waiterCalls=[],waiterBusy=false,waiterConnected=false;
let waiterSoundEnabled=false,waiterAudioContext=null,waiterAlarmNodes=[],waiterWakeLock=null;
let waiterRequestBoard=null;
const wEl=id=>document.getElementById(id),wEsc=Cloud.esc;
// Save the private staff capability on this staff device so a push tap can reopen its dashboard.
// A rotated QR still revokes it on the server. Never store this on a shared customer device.
const scannedWaiterKey=new URLSearchParams(location.hash.slice(1)).get('key');
let waiterKey=scannedWaiterKey||Cloud.read('RESTAURANT_WAITER_DEVICE_KEY_v1','');
function moneyWaiter(v){return (Cloud.cfg.currency||'₹')+Number(v||0).toFixed(2);}
function renderWaiterOrders(){
 wEl('waiterCount').textContent=waiterOrders.length+' active '+(waiterOrders.length===1?'order':'orders');
 wEl('waiterOrders').innerHTML=waiterOrders.length?waiterOrders.map(o=>`<article class="order-card"><div class="card-heading"><h3>Table ${wEsc(o.table_number)}</h3><span class="status ${o.status==='Ready'?'status-ready':''}">${wEsc(o.status)}</span></div><p class="muted order-time">${wEsc(o.order_id.slice(0,12))}… · ${new Date(o.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</p><ul class="items">${o.items.map(i=>`<li><span><b>${Number(i.qty)}×</b> ${wEsc(i.name)}</span><b>${moneyWaiter(i.subtotal)}</b></li>`).join('')}</ul><p><b>Total: ${moneyWaiter(o.total)}</b></p></article>`).join(''):'<p class="empty">No active orders right now.</p>';
}
function renderWaiterCalls(){
 wEl('waiterCallCount').textContent=waiterCalls.length;
 document.title=waiterCalls.length?'('+waiterCalls.length+') Table '+waiterCalls[0].table_number+' calling · Waiter':'Waiter Orders & Requests';
 if(!waiterCalls.length)stopWaiterAlarm();
}
function callNotice(text,error=false){wEl('waiterCallNotice').textContent=error?text:'';wEl('waiterCallNotice').hidden=!error;}
function stopWaiterAlarm(){waiterAlarmNodes.forEach(n=>{try{n.stop();n.disconnect();}catch{}});waiterAlarmNodes=[];}
function playWaiterAlarm(test=false){
 if(!waiterSoundEnabled||!waiterAudioContext||waiterAudioContext.state!=='running'||document.hidden||(!test&&(!waiterConnected||!waiterCalls.length)))return false;
 stopWaiterAlarm();const start=waiterAudioContext.currentTime;
 for(let i=0;i<(test?2:6);i++){
  const o=waiterAudioContext.createOscillator(),g=waiterAudioContext.createGain(),t=start+i*.22;
  o.type='sine';o.frequency.value=i%2?1046:784;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.2,t+.015);g.gain.exponentialRampToValueAtTime(.001,t+.17);
  o.connect(g);g.connect(waiterAudioContext.destination);o.start(t);o.stop(t+.18);o.onended=()=>{try{o.disconnect();g.disconnect();}catch{}};waiterAlarmNodes.push(o);
 }
 return true;
}
async function keepWaiterAwake(){if(!waiterSoundEnabled||document.hidden||waiterWakeLock)return;try{waiterWakeLock=await navigator.wakeLock?.request('screen');waiterWakeLock?.addEventListener('release',()=>{waiterWakeLock=null;});}catch{}}
async function toggleWaiterSound(){
 if(waiterSoundEnabled&&waiterAudioContext?.state==='running'){waiterSoundEnabled=false;stopWaiterAlarm();try{await waiterWakeLock?.release();}catch{}waiterWakeLock=null;}
 else{
  try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)throw Error('Sound is not supported in this browser.');if(!waiterAudioContext||waiterAudioContext.state==='closed')waiterAudioContext=new AC();await waiterAudioContext.resume();if(waiterAudioContext.state!=='running')throw Error('Tap again to allow sound.');waiterSoundEnabled=true;await keepWaiterAwake();playWaiterAlarm(true);if(waiterCalls.length)setTimeout(()=>playWaiterAlarm(),600);}
  catch(e){callNotice('Could not enable sound: '+e.message,true);return;}
 }
 wEl('waiterSoundButton').textContent=waiterSoundEnabled?'Sound on · mute':'Enable sound';wEl('waiterSoundButton').setAttribute('aria-pressed',String(waiterSoundEnabled));

}
async function loadWaiterOrders(){
 if(waiterBusy)return;
 if(!/^[a-f0-9]{64}$/.test(waiterKey)){wEl('waiterConnection').textContent='Scan QR';wEl('waiterError').textContent='Please scan the private waiter QR from the manager/receptionist. No sign-in is needed.';return;}
 waiterBusy=true;
 try{
  const result=await Cloud.rpc('restaurant_waiter_orders',{p_key:waiterKey});
  if(!Array.isArray(result.calls))throw Error('The waiter-call SQL upgrade is missing. Ask the manager to run upgrade-waiter-calls.sql.');
  const oldIds=new Set(waiterCalls.map(c=>c.id));waiterOrders=result.orders;waiterCalls=result.calls;waiterConnected=true;
  try{Cloud.write('RESTAURANT_WAITER_DEVICE_KEY_v1',waiterKey);}catch{}
  BackgroundAlerts.init('waiter',waiterKey);
  if(!waiterRequestBoard)waiterRequestBoard=CallRequests.mount({root:wEl('waiterCalls'),kind:'waiter',key:waiterKey,onUpdate:data=>{const old=new Set(waiterCalls.map(c=>c.id));waiterCalls=data.pending_calls;renderWaiterCalls();if(waiterCalls.some(c=>!old.has(c.id)))playWaiterAlarm();}});
  waiterRequestBoard.refresh();wEl('waiterCallPanel').hidden=false;wEl('waiterConnection').textContent='Live';wEl('waiterConnection').classList.add('live');wEl('waiterError').textContent='';renderWaiterOrders();renderWaiterCalls();
  if(waiterCalls.some(c=>!oldIds.has(c.id)))playWaiterAlarm();
 }catch(e){
  waiterConnected=false;stopWaiterAlarm();wEl('waiterConnection').textContent='Offline';wEl('waiterConnection').classList.remove('live');
  if(/Invalid or expired|permission denied/i.test(e.message)){try{localStorage.removeItem('RESTAURANT_WAITER_DEVICE_KEY_v1');}catch{}wEl('backgroundAlertPanel').hidden=true;waiterOrders=[];waiterCalls=[];wEl('waiterOrders').innerHTML='';wEl('waiterCount').textContent='';wEl('waiterCallPanel').hidden=true;renderWaiterCalls();}
  wEl('waiterError').textContent='Orders and calls could not update: '+e.message+' Alerts need a live connection. Last loaded records, if shown, may be out of date.';
 }finally{waiterBusy=false;}
}
wEl('waiterRestaurant').textContent=Cloud.cfg.restaurantName||'';
wEl('waiterSoundButton').addEventListener('click',toggleWaiterSound);
loadWaiterOrders();setInterval(()=>{if(!document.hidden)loadWaiterOrders();},3000);setInterval(()=>playWaiterAlarm(),5000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){keepWaiterAwake();if(waiterSoundEnabled&&waiterAudioContext?.state==='suspended')waiterAudioContext.resume().catch(()=>callNotice('Tap Sound on to re-enable audio.',true));loadWaiterOrders();}else stopWaiterAlarm();});

navigator.serviceWorker?.addEventListener('message',e=>{if(e.data?.type==='restaurant-push-open')loadWaiterOrders();});
