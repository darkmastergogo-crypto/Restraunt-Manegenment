'use strict';
// Per-category ordering is saved atomically, with a revision check against other staff.
let menuLayoutData=null,layoutGroup='',layoutDraft=[],layoutDirty=false,layoutBusy=false;
async function openMenuArrangement(){
 if(!['admin','manager'].includes(staffRole))return;
 document.getElementById('menuArrangementModal').showModal();await reloadMenuArrangement();
}
async function reloadMenuArrangement(){
 if(layoutBusy)return;layoutBusy=true;document.getElementById('layoutStatus').textContent='Loading…';
 try{menuLayoutData=await Cloud.rpc('restaurant_menu_layout',{},true);const select=document.getElementById('layoutGroup');select.replaceChildren(new Option('Category buttons / All-menu category order',''),...menuLayoutData.categories.map(c=>new Option(c.name,c.name)));if(!menuLayoutData.categories.some(c=>c.name===layoutGroup))layoutGroup='';select.value=layoutGroup;loadArrangementDraft();document.getElementById('layoutStatus').textContent='';}
 catch(e){document.getElementById('layoutStatus').textContent=e.message;menuLayoutData=null;document.getElementById('layoutRows').replaceChildren();}finally{layoutBusy=false;paintArrangement();}
}
function loadArrangementDraft(){layoutDraft=layoutGroup?menuLayoutData.categories.find(c=>c.name===layoutGroup).items.map(i=>({id:i.id,name:i.name})):menuLayoutData.categories.map(c=>({id:c.name,name:c.name}));layoutDirty=false;paintArrangement();}
function changeArrangementGroup(){const select=document.getElementById('layoutGroup');if(layoutDirty&&!confirm('Discard unsaved arrangement changes?')){select.value=layoutGroup;return;}layoutGroup=select.value;loadArrangementDraft();}
function paintArrangement(){
 document.getElementById('layoutSave').disabled=layoutBusy||!menuLayoutData||!layoutDirty;
 document.getElementById('layoutGroup').disabled=layoutBusy||!menuLayoutData;
 document.getElementById('layoutRows').innerHTML=layoutDraft.map((r,i)=>`<li><span><b>${i+1}.</b> ${Cloud.esc(r.name)}</span><div><button class="secondary-btn" type="button" data-layout-move="${i}" data-layout-direction="-1" ${i===0||layoutBusy?'disabled':''} aria-label="Move ${Cloud.esc(r.name)} up">↑</button><button class="secondary-btn" type="button" data-layout-move="${i}" data-layout-direction="1" ${i===layoutDraft.length-1||layoutBusy?'disabled':''} aria-label="Move ${Cloud.esc(r.name)} down">↓</button></div></li>`).join('')||'<li>No dishes in this category.</li>';
}
async function saveMenuArrangement(){
 if(layoutBusy||!layoutDirty||!menuLayoutData)return;layoutBusy=true;paintArrangement();
 try{menuLayoutData=await Cloud.rpc('restaurant_menu_layout',{p_category:layoutGroup||null,p_ids:layoutDraft.map(r=>r.id),p_revision:menuLayoutData.revision},true);loadArrangementDraft();document.getElementById('layoutStatus').textContent='Saved. Customer and kitchen menus use this order on their next refresh.';await loadStaffCategories();await refreshCloud();}
 catch(e){document.getElementById('layoutStatus').textContent=e.message+' Your draft is retained; use Reload to get the latest menu.';}finally{layoutBusy=false;paintArrangement();}
}
document.addEventListener('click',event=>{const b=event.target.closest('[data-layout-move]');if(!b||layoutBusy)return;const i=Number(b.dataset.layoutMove),j=i+Number(b.dataset.layoutDirection);if(j<0||j>=layoutDraft.length)return;[layoutDraft[i],layoutDraft[j]]=[layoutDraft[j],layoutDraft[i]];layoutDirty=true;paintArrangement();});

window.RestaurantAlerts=(()=>{
 let settings=null,settingsBusy=false,fillRequested=false,formRevision=null,voiceArmed=false,notificationArmed=false,ctx=null,seenOrders=null,seenNotifications=new Set(),notificationInitialized=false;
 const el=id=>document.getElementById(id);
 const presets={chime:[784,988,1319],doorbell:[659,523],bell:[880,1175,880]};
 function paint(){const b=el('voiceAlertsButton');if(b){b.hidden=!settings?.voice_enabled;b.textContent=voiceArmed?'Voice alerts on · mute':'Enable voice alerts';b.setAttribute('aria-pressed',String(voiceArmed));}const n=el('notificationSoundButton');if(n){n.textContent=notificationArmed?'Notification sound on · mute':'Enable notification sound';n.setAttribute('aria-pressed',String(notificationArmed));}}
 async function sync(fillForm=false){
  if(fillForm)fillRequested=true;if(settingsBusy||!['admin','manager'].includes(staffRole))return;fillForm=fillRequested;fillRequested=false;settingsBusy=true;if(el('alertSettingsSave'))el('alertSettingsSave').disabled=true;
  try{settings=await Cloud.rpc('restaurant_alert_settings',{},true);if(!settings.voice_enabled){voiceArmed=false;window.speechSynthesis?.cancel();}paint();if(fillForm&&staffRole==='admin'){formRevision=settings.revision;el('voiceAlertEnabled').checked=settings.voice_enabled;for(const key of ['orders','waiter','notification'])el(key+'SoundPreset').value=settings[key+'_sound'];el('alertSettingsStatus').textContent='';}}
  catch(e){if(fillForm)el('alertSettingsStatus').textContent=e.message;}finally{settingsBusy=false;if(el('alertSettingsSave'))el('alertSettingsSave').disabled=formRevision===null;if(fillRequested)sync(true);}
 }
 async function save(event){event.preventDefault();if(staffRole!=='admin'||settingsBusy)return;settingsBusy=true;el('alertSettingsSave').disabled=true;
  try{const next={voice_enabled:el('voiceAlertEnabled').checked};for(const key of ['orders','waiter','notification'])next[key+'_sound']=el(key+'SoundPreset').value;settings=await Cloud.rpc('restaurant_alert_settings',{p_settings:next,p_revision:formRevision},true);formRevision=settings.revision;if(!settings.voice_enabled){voiceArmed=false;window.speechSynthesis?.cancel();}paint();el('alertSettingsStatus').textContent='Alert preferences saved for all kitchen staff. Each device must enable its sounds/voice.';}
  catch(e){el('alertSettingsStatus').textContent=e.message;}finally{settingsBusy=false;el('alertSettingsSave').disabled=false;}
 }
 function play(kind,context,override){
  if(!settings&&!override)return null;
  const preset=override||settings[kind+'_sound'];if(preset==='none')return [];
  if(!context||context.state!=='running'||document.hidden)return [];
  const nodes=[],notes=presets[preset]||presets.chime,t=context.currentTime;
  notes.forEach((hz,i)=>{const o=context.createOscillator(),g=context.createGain(),at=t+i*.28;o.type=preset==='doorbell'?'sine':'triangle';o.frequency.value=hz;g.gain.setValueAtTime(.0001,at);g.gain.exponentialRampToValueAtTime(.18,at+.02);g.gain.exponentialRampToValueAtTime(.0001,at+.55);o.connect(g);g.connect(context.destination);o.start(at);o.stop(at+.56);o.onended=()=>{o.disconnect();g.disconnect();};nodes.push(o);});return nodes;
 }
 async function unlock(){ctx ||= new(window.AudioContext||window.webkitAudioContext)();await ctx.resume();if(ctx.state!=='running')throw Error('Tap again to allow audio.');return ctx;}
 async function test(kind){try{await unlock();play(kind,ctx,el(kind+'SoundPreset').value);el('alertSettingsStatus').textContent='Preview: '+el(kind+'SoundPreset').selectedOptions[0].textContent;}catch(e){el('alertSettingsStatus').textContent=e.message;}}
 async function toggleNotifications(){notificationArmed=!notificationArmed;if(notificationArmed)try{await unlock();play('notification',ctx);}catch(e){notificationArmed=false;showToast(e.message);}paint();}
 function speak(text){if(!settings?.voice_enabled||!voiceArmed||document.hidden||!window.speechSynthesis)return;const u=new SpeechSynthesisUtterance(text);u.lang='en-IN';u.rate=.95;u.volume=1;window.speechSynthesis.speak(u);}
 function toggleVoice(){if(!settings?.voice_enabled)return;if(!window.speechSynthesis){showToast('Voice is unavailable in this browser.');return;}voiceArmed=!voiceArmed;if(voiceArmed)speak('Voice alerts enabled');else window.speechSynthesis.cancel();paint();}
 function observeOrders(rows){const ids=new Set(rows.map(o=>o.id));if(seenOrders){for(const o of rows)if(o.status==='Pending'&&!seenOrders.has(o.id))speak('New order, table '+String(o.table_number).replace(/^T/i,''));}seenOrders=ids;}
 function observeNotifications(rows){const fresh=rows.some(n=>!n.read_at&&!seenNotifications.has(n.id));rows.forEach(n=>seenNotifications.add(n.id));if(seenNotifications.size>2000)seenNotifications=new Set(rows.map(n=>n.id));if(notificationInitialized&&fresh&&notificationArmed)play('notification',ctx);notificationInitialized=true;}
 function stop(){voiceArmed=false;notificationArmed=false;window.speechSynthesis?.cancel();paint();}
 let diagnosticStopped=false,diagnosticNodes=[],diagnosticRunning=false;
 function stopVolumeTest(){diagnosticStopped=true;diagnosticRunning=false;diagnosticNodes.forEach(n=>{try{n.stop();}catch{}});diagnosticNodes=[];window.speechSynthesis?.cancel();}
 async function volumeTest(onStep){
  if(document.hidden)throw Error('Keep the dashboard visible during the volume test.');diagnosticRunning=true;try{
  diagnosticStopped=false;await unlock();if(!settings)await sync();
  for(const [i,kind,label] of [[1,'orders','Incoming orders'],[2,'waiter','Waiter requests'],[3,'notification','Notification alerts']]){
   if(diagnosticStopped){onStep('Volume test stopped.');return;}
   const chosen=settings?.[kind+'_sound']||'chime',preset=chosen==='none'?(kind==='waiter'?'doorbell':'bell'):chosen;
   onStep(i+'/4 · '+label+' — test tone requested'+(chosen==='none'?' (live setting is muted; diagnostic preview only)':''));diagnosticNodes=play(kind,ctx,preset)||[];await new Promise(r=>setTimeout(r,1600));
  }
  if(diagnosticStopped){onStep('Volume test stopped.');return;}
  if(settings?.voice_enabled&&window.speechSynthesis){onStep('4/4 · Voice preview requested. Listen for the table announcement.');const u=new SpeechSynthesisUtterance('New order, table 1. Volume test.');u.lang='en-IN';window.speechSynthesis.speak(u);await new Promise(r=>{u.onend=r;u.onerror=r;setTimeout(r,3500);});}
  else onStep('4/4 · Voice skipped: disabled by admin or unavailable in this browser.');
  if(diagnosticStopped){onStep('Volume test stopped.');return;}
  if(typeof Notification!=='undefined'&&Notification.permission==='granted'){await BackgroundAlerts.test();onStep('System notification test requested if a service worker is installed. Check the device; this does not verify server push delivery.');}
  else onStep('Alarm test complete. System notification skipped: enable Staff alerts and notification permission to test it.');
 }finally{diagnosticRunning=false;diagnosticNodes=[];}
 }
 return {sync,save,test,play,toggleVoice,toggleNotifications,observeOrders,observeNotifications,stop,volumeTest,stopVolumeTest,get testing(){return diagnosticRunning;}};
})();

let stockNotificationsData=null,stockNotificationsBusy=false,stockNotificationsOffset=0,stockKnownIds=null;
function paintNotificationsBadge(){const e=document.getElementById('securityUnread');if(e)e.textContent=Number(securityData?.unread||0)+Number(stockNotificationsData?.unread||0);}
async function refreshStockNotifications(){
 if(!loggedIn||stockNotificationsBusy)return;stockNotificationsBusy=true;
 try{const data=await Cloud.rpc('restaurant_stock_alerts',{p_offset:stockNotificationsOffset},true);stockNotificationsData=data;RestaurantAlerts.observeNotifications(data.notifications);if(stockKnownIds){const fresh=data.notifications.find(n=>!n.read_at&&!stockKnownIds.has(n.id));if(fresh)showToast('Low stock: '+fresh.dish_name+(fresh.variant==='single'?'':' — '+fresh.variant)+' · '+fresh.remaining+' of '+fresh.baseline+' left.');}stockKnownIds=new Set(data.notifications.map(n=>n.id));paintNotificationsBadge();
  document.getElementById('stockNotificationsList').innerHTML=data.notifications.map(n=>`<article class="device-card"><h3>${Cloud.esc(n.dish_name)}${n.variant==='single'?'':' — '+Cloud.esc(n.variant)}</h3><p><b>At alert: ${n.remaining} of ${n.baseline} left · ${(100*n.remaining/n.baseline).toFixed(1)}%</b></p><p>${Cloud.esc(n.category)} · ${Cloud.esc(new Date(n.created_at).toLocaleString())}</p>${n.read_at?'<span>Read</span>':`<button class="secondary-btn" type="button" data-stock-notice="${Cloud.esc(n.id)}">Mark read</button>`}</article>`).join('')||'<p class="empty">No low-stock notifications.</p>';
  document.getElementById('stockNotificationsPage').textContent=data.total?`${data.offset+1}–${data.offset+data.notifications.length} of ${data.total}`:'0 alerts';document.getElementById('stockNotificationsPrevious').disabled=stockNotificationsOffset===0;document.getElementById('stockNotificationsNext').disabled=data.offset+data.notifications.length>=data.total;document.getElementById('stockNotificationsStatus').textContent='';
 }catch(e){document.getElementById('stockNotificationsStatus').textContent='Stock alerts: '+e.message;}finally{stockNotificationsBusy=false;}
}
async function markStockNotification(id){try{await Cloud.rpc('restaurant_stock_alerts',{p_action:id?'read':'read_all',p_id:id},true);await refreshStockNotifications();}catch(e){document.getElementById('stockNotificationsStatus').textContent=e.message;}}
function pageStockNotifications(direction){stockNotificationsOffset=Math.max(0,stockNotificationsOffset+50*direction);refreshStockNotifications();}
document.addEventListener('click',e=>{const b=e.target.closest('[data-stock-notice]');if(b)markStockNotification(b.dataset.stockNotice);});

// Six-second staged actions: Undo cancels BEFORE the status/stock transaction occurs.
const stagedOrderActions=new Map();
function stageOrderAction(order,next,reason){if(stagedOrderActions.has(order.id))return;stagedOrderActions.set(order.id,{order,expected:order.status,next,reason,deadline:Date.now()+6000,committing:false});paintStagedActions();renderOrders();}
function paintStagedActions(){const bar=document.getElementById('orderUndoBar');if(!bar)return;bar.hidden=stagedOrderActions.size===0;bar.innerHTML=[...stagedOrderActions.values()].map(a=>`<div><span>Table ${Cloud.esc(a.order.table_number)} · ${a.next==='Rejected'?'Reject':'Accept'} ${a.committing?'saving…':'in '+Math.max(0,Math.ceil((a.deadline-Date.now())/1000))+'s'}</span><button class="secondary-btn" type="button" data-undo-order="${Cloud.esc(a.order.id)}" ${a.committing?'disabled':''}>Undo</button></div>`).join('');}
function observeStagedActions(rows){for(const [id,a] of stagedOrderActions){if(a.committing)continue;const current=rows.find(o=>o.id===id);if(!current||current.status!==a.expected){stagedOrderActions.delete(id);showToast('Scheduled action cancelled: this order changed.');}}paintStagedActions();}
async function commitStagedAction(id,a){a.committing=true;paintStagedActions();try{if(!loggedIn)throw Error('Sign in again; the action was not sent.');const saved=await Cloud.rpc('restaurant_staff_status',{p_id:id,p_expected:a.expected,p_next:a.next,p_reason:a.reason},true);Cloud.invalidateOrders();showToast('Order '+saved.status.toLowerCase()+'.');}catch(e){showToast('Order not changed: '+e.message);}finally{stagedOrderActions.delete(id);paintStagedActions();await refreshCloud();renderOrders();}}
document.addEventListener('click',e=>{const b=e.target.closest('[data-undo-order]');if(!b)return;const a=stagedOrderActions.get(b.dataset.undoOrder);if(a&&!a.committing){stagedOrderActions.delete(b.dataset.undoOrder);paintStagedActions();renderOrders();showToast('Undone. The order is unchanged.');}});
setInterval(()=>{if(!stagedOrderActions.size)return;paintStagedActions();for(const [id,a] of stagedOrderActions)if(!a.committing&&Date.now()>=a.deadline)commitStagedAction(id,a);},250);
window.addEventListener('beforeunload',e=>{if(stagedOrderActions.size){e.preventDefault();e.returnValue='';}});
setInterval(()=>{if(typeof loggedIn!=='undefined'&&loggedIn&&!document.hidden){RestaurantAlerts.sync();refreshStockNotifications();}},5000);

function closeMenuArrangement(){if(layoutBusy)return;if(layoutDirty&&!confirm('Discard unsaved arrangement changes?'))return;document.getElementById('menuArrangementModal').close();}
document.getElementById('menuArrangementModal').addEventListener('cancel',e=>{if(layoutBusy||layoutDirty){e.preventDefault();closeMenuArrangement();}});
