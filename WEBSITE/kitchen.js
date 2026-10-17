'use strict';
const $=id=>document.getElementById(id), esc=Cloud.esc, config=Cloud.cfg;
const money=n=>(config.currency||'₹')+Number(n||0).toFixed(2);
const timeText=v=>new Date(v).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
const dateText=v=>new Date(v).toLocaleDateString();
let kitchenRequests=null;
let staffRole=null,orders=[],menuItems=[],currentTab='live',currentFilter='active',currentBillOrderId=null,currentTableId=null;
let state=Cloud.read('KITCHEN_ADMIN_STATE_v1',{}),tables=[],photoDrafts={new:{data:''},edit:{data:''}},editingPhotoItemId=null;
let soundEnabled=false,audioContext=null,alarmNodes=[],alarmIds=[],alarmState=Cloud.read('RESTAURANT_ALARMS_v2',{}),busy=false,toastTimer,pollTimer=null;
let pollErrors=0,scannerStream=null,scannerFrame=null,wakeLock=null,loggedIn=false;
const terminal=s=>['Served','Cancelled','Rejected'].includes(s);
function showToast(text){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,6500);}
function cloudError(text){$('cloudError').textContent=text;$('cloudError').hidden=!text;}
function download(name,text,type='application/json'){const u=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
async function enterStaff(){
 staffRole=await Cloud.role();
 if(!['admin','manager'].includes(staffRole))throw Error('Admin or manager access required. Waiters should scan the private waiter QR.');
 $('tabManagementBtn').hidden=staffRole!=='admin';$('tabDevicesBtn').hidden=staffRole!=='admin';$('managerDeviceAccessPanel').hidden=staffRole!=='admin';$('tableAdminSetup').hidden=staffRole!=='admin';$('tablesSection').querySelector('h2').textContent=staffRole==='admin'?'Table setup & QR codes':'Tables';$('tabMenuBtn').hidden=false;$('adminMenuPanel').hidden=staffRole!=='admin';$('managerMenuPanel').hidden=staffRole!=='manager';$('rotateWaiterButton').hidden=staffRole!=='admin';$('resetControls').hidden=staffRole!=='admin';$('orderDevicePermissionPanel').hidden=staffRole!=='admin';
 await loadManagerDeviceAccess();BackgroundAlerts.init('kitchen');loggedIn=true;$('loginPanel').hidden=true;$('managerNav').hidden=false;$('staffMain').hidden=false;$('staffSession').hidden=false;
 $('staffIdentity').textContent=(staffRole==='admin'?'Admin':'Manager')+' · signed in';
 kitchenRequests=CallRequests.mount({root:$('kitchenRequests'),kind:'kitchen',onUpdate:data=>{$('requestsBadge').textContent=data.pending_count;renderRequestAlerts(data.pending_calls);},onError:()=>{$('requestsBadge').textContent='!';requestRows=[];requestRing.update([]);}});
 kitchenRequests.refresh();setConnection('Connecting');switchTab(location.hash==='#notifications'&&canSeeSecurityNotifications()?'notifications':location.hash==='#requests'?'requests':'live');refreshSecurityNotifications();await refreshCloud();
 clearInterval(pollTimer);pollTimer=setInterval(()=>{if(!document.hidden)refreshCloud();},5000);
}
function setConnection(label){
 $('syncBadge').textContent=label;const box=$('syncBadge').parentElement,color=label==='Live'?'#34d399':label==='Offline'?'#f87171':'#94a3b8';box.style.color=color;box.style.borderColor=color;box.style.background=label==='Live'?'rgba(16,185,129,.12)':'rgba(148,163,184,.08)';box.querySelector('span').style.background=color;
}
async function signOutStaff(){
 try{await BackgroundAlerts.disableForSignOut();}catch(e){if(!confirm('Could not disable background alerts on this device. If you sign out now, alerts may continue. Turn off this site’s notifications in browser settings to stop them. Sign out anyway?'))return;}
 requestRing.disable();orderRing.disable();loggedIn=false;clearInterval(pollTimer);stopAlarmSound();closeAlarm();soundEnabled=false;$('soundButton').textContent='Enable request sound';orders=[];menuItems=[];
 if(wakeLock){await wakeLock.release().catch(()=>{});wakeLock=null;}
 try{await Cloud.logout();}catch{}location.reload();
}
async function refreshCloud(){
 if(busy||!loggedIn)return;busy=true;
 try{const [rows,menu,summary]=await Promise.all([Cloud.orders(),Cloud.menu(true),Cloud.records('day',null,0,1),loadStaffCategories()]);if(!loggedIn)return;
  orders=rows;await refreshOrderDeviceStates();orderRing.update(orders.filter(o=>o.status==='Pending'));menuItems=menu;daySummary=summary;pollErrors=0;setConnection('Live');cloudError('');renderOrders();renderDashboard();kitchenRequests?.refresh();if(currentTab==='history')await refreshRecords();
  const signature=JSON.stringify([menu,Cloud.categories]);if(signature!==refreshCloud.menuSignature){refreshCloud.menuSignature=signature;renderAdminMenu();}checkAlarm();
 }catch(e){pollErrors++;setConnection('Offline');cloudError('Cloud sync failed: '+e.message+' Last loaded records are shown; they may be out of date.');}
 finally{busy=false;}
}
function switchTab(tab){
 const tabs=['live','history','dashboard','requests','tables','menu','management','devices','notifications'];if(!tabs.includes(tab))return;
 if(tab==='management'&&staffRole!=='admin'||tab==='devices'&&!canManageCustomerDevices()||tab==='notifications'&&!canSeeSecurityNotifications())return;
 currentTab=tab;tabs.forEach(t=>{$(t+'Section').hidden=t!==tab;$(t+'Section').style.display=t===tab?'block':'none';$('tab'+t[0].toUpperCase()+t.slice(1)+'Btn').classList.toggle('active',t===tab);});
 if(tab==='management'){loadManagerDeviceAccess();loadReviewSettings();renderAdminMenu();loadRetentionSettings();loadTaxSettings();loadWaiterPermissions();}if(tab==='notifications')refreshSecurityNotifications();if(tab==='devices')refreshCustomerDevices();if(tab==='tables')refreshTables();if(tab==='history')refreshRecords();if(tab==='requests')kitchenRequests?.refresh();if(tab==='menu')renderAdminMenu();
}
function setFilter(f){if(['all','Served','Cancelled'].includes(f)){recordStatusFilter=f==='all'?'All':f;recordOffset=0;$('recordStatusFilter').value=recordStatusFilter;switchTab('history');return;}currentFilter=['active','Pending'].includes(f)?f:'active';renderOrders();}
function statusPill(o){return `<span class="status-pill ${esc(o.status.toLowerCase())}">${esc(o.status)}</span>`;}
function actionButtons(o,withDevice=true){
 let next={Pending:'Cooking',Cooking:'Served',Ready:'Served'}[o.status];

 return (next?`<button class="primary-btn" data-next="${next}" data-id="${esc(o.id)}">${(o.status==='Pending'?'Accept order':'Mark served')}</button>`:'')+
 (['admin','manager'].includes(staffRole)&&o.status==='Pending'?`<button class="danger-btn" data-next="Rejected" data-id="${esc(o.id)}">Reject / unavailable</button>`:'')+`<button class="secondary-btn" data-bill="${esc(o.id)}">Bill</button>`+(withDevice?orderDeviceButton(o):" ");
}
function shortId(o){return Cloud.orderLabel(o);}
function renderOrders(){
 const active=orders.filter(o=>!terminal(o.status));$('activeOrdersBadge').textContent=active.filter(o=>o.status==='Pending').length;
 const filters=[['active','Active'],['Pending','Pending'],['Cancelled','Cancelled']];
 $('orderFilters').innerHTML=filters.map(([k,v])=>`<button class="nav-tab-btn ${currentFilter===k?'active':''}" data-filter="${k}">${v}</button>`).join('');
 const shown=currentFilter==='active'?active:currentFilter==='all'?orders:orders.filter(o=>o.status===currentFilter);
 $('ordersGrid').innerHTML=shown.length?shown.map(o=>`<article class="order-card status-${esc(o.status.toLowerCase())}">
 <div class="order-header"><div><div class="table-title">TABLE ${esc(o.table_number)}</div><div class="order-time" title="${esc(o.order_id)}">${esc(shortId(o))} · ${timeText(o.created_at)}</div></div>${statusPill(o)}</div>
 <div class="order-body"><div class="cust-info">Guest: <b>${esc(o.customer_name||'Guest')}</b></div>
 <ul class="items-list">${o.items.map(i=>`<li class="item-entry"><span><b class="item-qty">${Number(i.qty)}×</b> ${esc(i.name)}</span><span>${money(i.subtotal)}</span></li>`).join('')}</ul>
 ${o.kitchen_notes?`<div class="kitchen-notes-box">${esc(o.kitchen_notes)}</div>`:''}
 ${o.rejection_reason?`<p class="hint">Reason: ${esc(o.rejection_reason)}</p>`:''}
 <p class="hint">${o.status==='Pending'?'Waiting for acceptance':o.cooking_started_at?'Cooking started '+timeText(o.cooking_started_at):esc(o.status)}</p></div>
 <div class="order-footer"><b class="order-total">${money(o.total)}</b><div class="toolbar">${actionButtons(o)}</div></div></article>`).join(''):'<div class="empty">No orders in this view. New customer orders appear here automatically.</div>';
}
async function setOrderStatus(id,next,button){
 const o=findOrder(id);if(!o)return;
 let reason='';if(next==='Rejected'){reason=prompt('Reason shown to the customer:','Items unavailable');if(reason===null)return;}
 if(button)button.disabled=true;
 try{const saved=await Cloud.rpc('restaurant_staff_status',{p_id:id,p_expected:o.status,p_next:next,p_reason:reason},true);showToast('Order '+saved.status.toLowerCase()+'.');await refreshCloud();}
 catch(e){showToast(/This status change is not allowed/.test(e.message)?'Database upgrade required: run SUPABASE/UPGRADE-EXISTING-PROJECT.sql, then refresh kitchen.':e.message);await refreshCloud();}finally{if(button)button.disabled=false;}
}
let recordStatusFilter='All';
function selectRecordStatus(){recordStatusFilter=$('recordStatusFilter').value;recordOffset=0;refreshRecords();}
function fetchRecordPage(period,reference,offset,limit,status=recordStatusFilter){return Cloud.rpc('restaurant_filtered_records',{p_period:period,p_reference:reference||null,p_offset:offset,p_limit:limit,p_status:status},true);}
let recordPeriod='day',recordReference=null,recordOffset=0,recordsData=null,recordsBusy=false,recordsPending=false,daySummary=null;
function calendarLabel(value){return new Date(value+'T12:00:00Z').toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Kolkata'});}
function setRecordPeriod(period){recordPeriod=period;recordReference=null;recordOffset=0;$('recordDate').type=period==='day'?'date':period==='month'?'month':'number';$('recordDate').value='';if(period==='year'){$('recordDate').min='2000';$('recordDate').max='2100';$('recordDate').placeholder='2026';}['day','month','year'].forEach(p=>$('period'+p[0].toUpperCase()+p.slice(1)).className=p===period?'primary-btn':'secondary-btn');refreshRecords();}
function selectRecordDate(){const value=$('recordDate').value;if(recordPeriod==='year'&&value&&!/^(20[0-9]{2}|2100)$/.test(value)){showToast('Choose a year from 2000 to 2100.');return;}recordReference=value?(recordPeriod==='day'?value:recordPeriod==='month'?value+'-01':value+'-01-01'):null;recordOffset=0;refreshRecords();}
function followCurrentPeriod(){$('recordDate').value='';recordReference=null;recordOffset=0;refreshRecords();}
function changeRecordPage(delta){recordOffset=Math.max(0,recordOffset+delta*50);refreshRecords();}
async function refreshRecords(){
 if(!loggedIn)return;if(recordsBusy){recordsPending=true;return;}recordsBusy=true;
 const key=[recordPeriod,recordReference,recordOffset,recordStatusFilter].join('|');
 try{const result=await fetchRecordPage(recordPeriod,recordReference,recordOffset,50);if(key!==[recordPeriod,recordReference,recordOffset,recordStatusFilter].join('|'))return;recordsData=result;renderHistory();}
 catch(e){showToast('Records could not load: '+e.message);}
 finally{recordsBusy=false;if(recordsPending){recordsPending=false;refreshRecords();}}
}
function renderHistory(){
 if(!recordsData)return;const d=recordsData;
 $('statTotalOrders').textContent=d.total_orders;$('statTotalRevenue').textContent=money(d.total_value);$('statCompletedOrders').textContent=d.completed_orders;
 $('recordPeriodLabel').textContent=(recordReference?'Selected ':'Current ')+recordPeriod+' · '+calendarLabel(d.period_start)+' to '+calendarLabel(new Date(new Date(d.period_stop+'T12:00:00Z').getTime()-86400000).toISOString().slice(0,10))+' · India time. Old records are kept.';
 $('historyTableBody').innerHTML=d.records.length?d.records.map(o=>`<tr><td>${dateText(o.created_at)}<br>${timeText(o.created_at)}</td><td title="${esc(o.order_id)}">${esc(shortId(o))}</td><td>${esc(o.table_number)}</td><td>${o.items.map(i=>`${i.qty}× ${esc(i.name)}`).join(', ')}</td><td>${esc(o.kitchen_notes||'—')}</td><td>${money(o.total)}</td><td>${statusPill(o)}</td><td><div class="toolbar">${actionButtons(o,false)}</div></td></tr>`).join(''):'<tr><td colspan="8" class="empty">No orders in this calendar period.</td></tr>';
 $('recordsPrevious').disabled=d.offset===0;$('recordsNext').disabled=d.offset+d.records.length>=d.total_orders;
 $('recordsPageLabel').textContent=d.total_orders?`${d.offset+1}–${d.offset+d.records.length} of ${d.total_orders}`:'0 orders';
}
function renderDashboard(){
 $('statActiveOrders').textContent=orders.filter(o=>o.status==='Pending').length;$('statInKitchen').textContent=orders.filter(o=>o.status==='Cooking').length;$('statCompleted').textContent=daySummary?.completed_orders??0;$('statRevenue').textContent=money(daySummary?.total_value||0);
 $('recentOrdersList').innerHTML=[...orders].reverse().slice(0,5).map(o=>`<div class="recent-row"><div><b>${esc(o.table_number)} · ${esc(shortId(o))}</b><p class="muted">${timeText(o.created_at)}</p></div><div>${statusPill(o)} ${money(o.total)}</div></div>`).join('')||'<p class="empty">No active orders.</p>';
 $('adminDate').textContent=dateText(new Date());$('adminTime').textContent=timeText(new Date());
}
function renderAdminMenu(){
 if(staffRole!=='admin'){$('adminMenuList').innerHTML='';$('managerMenuList').innerHTML=menuItems.map(i=>`<article class="menu-row"><div class="menu-copy"><h4>${esc(i.name)}</h4><p>${money(i.price)}</p></div><div class="toolbar"><button class="secondary-btn" data-price-only="${esc(i.id)}">Change price</button><button class="${i.available?'primary-btn':'secondary-btn'}" data-availability="${esc(i.id)}" aria-pressed="${i.available}">${i.available?'Available ✓ · set unavailable':'Unavailable · set available'}</button><button class="secondary-btn" data-recommended="${esc(i.id)}" aria-pressed="${i.recommended}">${i.recommended?'Recommended ✓ · remove':'Mark recommended'}</button><button class="secondary-btn" data-best-seller="${esc(i.id)}" aria-pressed="${i.best_seller===true}">${i.best_seller?'Best seller ✓ · remove':'Mark best seller'}</button></div></article>`).join('');return;}
 $('managerMenuList').innerHTML='';
 $('adminMenuList').innerHTML=menuItems.length?menuItems.map(i=>`<article class="menu-row"><div class="menu-emoji">${Cloud.safeImage(i.image)?`<img class="menu-photo" src="${esc(Cloud.safeImage(i.image))}" alt="${esc(i.name)}">`:'🍽️'}</div><div class="menu-copy"><h4>${esc(i.name)}</h4><p class="muted">${esc(i.category)}</p><p class="muted">${esc(i.description)}</p></div><div><b>${money(i.price)}</b><p>${i.available?'Available':'Unavailable · hidden'}</p></div><label>Category<select data-dish-category="${esc(i.id)}">${Cloud.categories.slice(1).map(c=>`<option value="${esc(c)}" ${c===i.category?'selected':''}>${esc(c)}</option>`).join('')}</select></label><div class="toolbar"><button class="${i.available?'primary-btn':'secondary-btn'} availability" data-availability="${esc(i.id)}" aria-pressed="${i.available}">${i.available?'Available ✓ · set unavailable':'Unavailable · set available'}</button><button class="secondary-btn" data-recommended="${esc(i.id)}" aria-pressed="${i.recommended}">${i.recommended?'Recommended ✓ · remove':'Mark recommended'}</button><button class="secondary-btn" data-best-seller="${esc(i.id)}" aria-pressed="${i.best_seller===true}">${i.best_seller?'Best seller ✓ · remove':'Mark best seller'}</button><button class="secondary-btn" data-edit="${esc(i.id)}">Edit details</button><button class="secondary-btn" data-item-photo="${esc(i.id)}">Change photo</button><button class="danger-btn" data-delete-item="${esc(i.id)}">Delete</button></div></article>`).join(''):'<p class="empty">Your menu is empty. Use + Add Item to add this shop’s dishes, prices and photos.</p>';
}
async function toggleAvailability(id,b){const item=menuItems.find(i=>i.id===id);if(!item)return;b.disabled=true;try{await patchMenuOptions(id,{available:!item.available,updated_at:new Date().toISOString()});await refreshCloud();showToast(item.available?'Item hidden from all customer menus.':'Item is available again.');}catch(e){showToast(e.message);}finally{b.disabled=false;}}
async function editMenuDetails(id){
 const i=menuItems.find(x=>x.id===id);if(!i)return;
 const name=prompt('Item name',i.name);if(name===null)return;const price=prompt('Price',i.price);if(price===null)return;const description=prompt('Description',i.description);if(description===null)return;
 if(!name.trim()||name.length>120||!Number.isFinite(Number(price))||Number(price)<0||Number(price)>100000||description.length>1000){showToast('Enter a valid name, price and description.');return;}
 try{await Cloud.patchMenu(id,{name:name.trim(),price:Number(price),description,updated_at:new Date().toISOString()});await refreshCloud();}catch(e){showToast(e.message);}
}
function showAddItemModal(){$('addItemModal').showModal();}
function closeAddItemModal(){$('addItemModal').close();}
async function addMenuItem(){
 const b=$('addItemSaveButton');b.disabled=true;
 try{const row=Cloud.menuRow({id:crypto.randomUUID(),name:$('newItemName').value.trim(),price:$('newItemPrice').value,category:$('newItemCategory').value,description:$('newItemDesc').value,image:photoDrafts.new.data,veg:$('newItemVeg').checked,available:true});await Cloud.saveMenu([row]);closeAddItemModal();$('addItemModal').querySelector('form').reset();photoDrafts.new={data:''};$('newItemPhotoPreview').hidden=true;await refreshCloud();showToast('Item added to the shared menu.');}catch(e){showToast(e.message);}finally{b.disabled=false;}
}
async function deleteMenuItem(id){if(!confirm('Delete this dish from every customer menu? Existing order records are kept.'))return;try{await Cloud.deleteMenu(id);await refreshCloud();}catch(e){showToast(e.message);}}
async function chooseMenuPhoto(kind,input){
 const f=input.files?.[0];if(!f)return;const target=kind==='new'?'newItem':'editItem';
 if(!/^image\/(jpeg|png|webp)$/.test(f.type)||f.size>10*1024*1024){showToast('Use a JPG, PNG or WebP under 10 MB.');input.value='';return;}
 try{const bitmap=await createImageBitmap(f),scale=Math.min(1,480/Math.max(bitmap.width,bitmap.height)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(bitmap.width*scale));c.height=Math.max(1,Math.round(bitmap.height*scale));c.getContext('2d').drawImage(bitmap,0,0,c.width,c.height);bitmap.close();let image=c.toDataURL('image/jpeg',.75);if(image.length>240000)image=c.toDataURL('image/jpeg',.4);if(image.length>250000)throw Error('Image is still too large. Use a smaller photo.');photoDrafts[kind]={data:image};$(target+'PhotoImage').src=image;$(target+'PhotoPreview').hidden=false;}catch(e){showToast(e.message);}
}
function removePhotoDraft(kind){photoDrafts[kind]={data:''};$(kind==='new'?'newItemPhotoPreview':'editItemPhotoPreview').hidden=true;}
function showItemPhotoModal(id){const i=menuItems.find(x=>x.id===id);if(!i)return;editingPhotoItemId=id;photoDrafts.edit={data:i.image};$('photoModalItemName').textContent=i.name;$('editItemPhotoPreview').hidden=!i.image;if(i.image)$('editItemPhotoImage').src=Cloud.safeImage(i.image);$('itemPhotoModal').showModal();}
function closeItemPhotoModal(){$('itemPhotoModal').close();}
async function saveItemPhoto(){const b=$('saveItemPhotoButton');b.disabled=true;try{await Cloud.patchMenu(editingPhotoItemId,{image:photoDrafts.edit.data||'',updated_at:new Date().toISOString()});closeItemPhotoModal();await refreshCloud();}catch(e){showToast(e.message);}finally{b.disabled=false;}}
function stopAlarmSound(){alarmNodes.forEach(n=>{try{n.stop();n.disconnect();}catch{}});alarmNodes=[];}
function playLoudAlarm(){
 stopAlarmSound();if(!soundEnabled||audioContext?.state!=='running')return;
 const start=audioContext.currentTime;
 // 12-second two-tone alarm; volume still depends on the device's media volume.
 for(let j=0;j<24;j++){
  const osc=audioContext.createOscillator(),gain=audioContext.createGain(),at=start+j*.5;
  osc.type='triangle';osc.frequency.setValueAtTime(j%2?1046:784,at);
  gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.42,at+.02);gain.gain.setValueAtTime(.42,at+.28);gain.gain.linearRampToValueAtTime(0,at+.4);
  osc.connect(gain);gain.connect(audioContext.destination);osc.start(at);osc.stop(at+.42);alarmNodes.push(osc);
 }
 try{navigator.vibrate?.([300,150,300]);}catch{}
}
async function keepScreenAwake(){try{if(soundEnabled&&'wakeLock' in navigator&&document.visibilityState==='visible')wakeLock=await navigator.wakeLock.request('screen');}catch{}}
async function toggleSound(){await requestRing.toggle();soundEnabled=requestRing.enabled;if(soundEnabled)await keepScreenAwake();else if(wakeLock){await wakeLock.release().catch(()=>{});wakeLock=null;}}

function persistAlarms(){try{Cloud.write('RESTAURANT_ALARMS_v2',alarmState);}catch{}}
function closeAlarm(){if($('alarmModal').open)$('alarmModal').close();alarmIds=[];}
function checkAlarm(){requestRing.update(requestRows);orderRing.update(orders.filter(o=>o.status==='Pending'));}
async function toggleOrderSound(){await orderRing.toggle();}
function snoozeAlarm(){const now=Date.now();alarmIds.forEach(id=>{alarmState[id]={dismissed:false,snoozedUntil:now+120000,nextAt:now+120000};});persistAlarms();stopAlarmSound();closeAlarm();showToast('Alarm snoozed for 2 minutes on this device. Orders are still pending.');}
function dismissAlarm(){alarmIds.forEach(id=>{alarmState[id]={dismissed:true};});persistAlarms();stopAlarmSound();closeAlarm();showToast('Alarm dismissed on this device. The orders are NOT cancelled.');}
function viewAlarmOrders(){stopAlarmSound();closeAlarm();setFilter('Pending');switchTab('live');}
$('alarmModal').addEventListener('cancel',e=>{e.preventDefault();dismissAlarm();});

function makeQr(url){try{const qr=qrcode(0,'M');qr.addData(url);qr.make();return qr.createSvgTag({cellSize:4,margin:16,scalable:true});}catch{return '<p>Use the shared link instead.</p>';}}
let privateWaiterUrl='';
function waiterUrl(){return privateWaiterUrl;}
async function shareWaiterLink(rotate=false){
 if(rotate&&!confirm('Replace the waiter QR? All previously shared waiter links will stop working.'))return;
 if(!$('waiterModal').open)$('waiterModal').showModal();
 $('waiterLink').value='';$('waiterQr').hidden=true;$('waiterQr').innerHTML='';$('waiterLinkStatus').textContent='Preparing the private waiter link…';
 $('waiterShareButtons').querySelectorAll('button').forEach(b=>b.disabled=true);
 try{const result=await Cloud.rpc('restaurant_waiter_link',{p_rotate:rotate},true);const link=new URL('waiter.html',location.href);link.hash='key='+result.token;privateWaiterUrl=link.href;$('waiterLink').value=privateWaiterUrl;$('waiterQr').innerHTML=makeQr(privateWaiterUrl);$('waiterQr').hidden=false;$('waiterLinkStatus').textContent=rotate?'New QR ready. Previous links no longer work.':'Scan to open orders. No sign-in required.';}
 catch(e){privateWaiterUrl='';$('waiterLinkStatus').textContent='Could not prepare QR: '+e.message;}
 finally{$('waiterShareButtons').querySelectorAll('button').forEach(b=>b.disabled=!privateWaiterUrl);}
}
async function copyWaiterLink(){if(!privateWaiterUrl)return;try{await navigator.clipboard.writeText(privateWaiterUrl);showToast('Waiter link copied.');}catch{$('waiterLink').select();showToast('Copy the selected link manually.');}}
async function shareLinkNative(){if(!privateWaiterUrl)return;try{if(navigator.share)await navigator.share({title:config.restaurantName?config.restaurantName+' · waiter orders':'Waiter orders',url:privateWaiterUrl});else await copyWaiterLink();}catch(e){if(e.name!=='AbortError')showToast('Use Copy link instead.');}}
function findOrder(id){return orders.find(x=>x.id===id)||recordsData?.records.find(x=>x.id===id);}
function receiptHtml(o){return `<div class="receipt"><h2 style="text-align:center;">${esc(config.restaurantName)}</h2><p style="overflow-wrap:anywhere;">${esc(Cloud.orderLabel(o))}</p><p>${esc(o.order_day||dateText(o.created_at))} ${timeText(o.created_at)} · Table ${esc(o.table_number)}</p><p>${esc(o.status)}</p><table><thead><tr><th>Item</th><th>Qty</th><th>Total</th></tr></thead><tbody>${o.items.map(i=>`<tr><td>${esc(i.name)}</td><td>${i.qty}</td><td>${money(i.subtotal)}</td></tr>`).join('')}</tbody></table><div class="receipt-line"></div>${billTaxRows(o)}<div class="receipt-row"><b>Total</b><b>${money(o.total)}</b></div><p>Thank you for visiting.</p></div>`;}
function showBillPreview(id){const o=findOrder(id);if(!o)return;currentBillOrderId=id;$('billPreview').innerHTML=receiptHtml(o);$('billModal').showModal();}
function closeBillModal(){$('billModal').close();}
function printBill(){const o=findOrder(currentBillOrderId);if(!o)return;$('printReceipt').innerHTML=receiptHtml(o);closeBillModal();window.print();}
let exportBusy=false;
async function exportRecords(){
 if(exportBusy)return;exportBusy=true;showToast('Preparing the selected period export…');
 const period=recordPeriod,reference=recordReference||recordsData?.period_start,status=recordStatusFilter;
 try{const all=[];let offset=0;for(;;){const page=await fetchRecordPage(period,reference,offset,200,status);all.push(...page.records);offset+=page.records.length;if(offset>=page.total_orders||!page.records.length)break;}
 const quote=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"',rows=[['Time','Order number','Table','Customer','Items','Items subtotal','Tax','Total','Status'],...all.map(o=>[o.created_at,Cloud.orderLabel(o),o.table_number,o.customer_name,o.items.map(i=>i.qty+'x '+i.name).join('; '),o.items_subtotal??o.total,o.tax_amount??0,o.total,o.status])];download('restaurant-orders-'+period+'.csv','\uFEFF'+rows.map(r=>r.map(quote).join(',')).join('\r\n'),'text/csv');showToast('Exported '+all.length+' orders from the selected period.');}
 catch(e){showToast('Export failed: '+e.message);}finally{exportBusy=false;}
}
async function toggleRecommended(id,b){const item=menuItems.find(i=>i.id===id);if(!item)return;b.disabled=true;try{await patchMenuOptions(id,{recommended:!item.recommended});await refreshCloud();showToast('Recommendation updated.');}catch(e){showToast(e.message);}finally{b.disabled=false;}}
document.addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;
 if(b.dataset.filter)setFilter(b.dataset.filter);if(b.dataset.next)setOrderStatus(b.dataset.id,b.dataset.next,b);if(b.dataset.bill)showBillPreview(b.dataset.bill);
 if(b.dataset.priceOnly)changePriceOnly(b.dataset.priceOnly);if(b.dataset.bestSeller)toggleBestSeller(b.dataset.bestSeller,b);if(b.dataset.recommended)toggleRecommended(b.dataset.recommended,b);if(b.dataset.availability)toggleAvailability(b.dataset.availability,b);if(b.dataset.edit)editMenuDetails(b.dataset.edit);if(b.dataset.deleteItem)deleteMenuItem(b.dataset.deleteItem);if(b.dataset.itemPhoto)showItemPhotoModal(b.dataset.itemPhoto);

});
setConnection('Sign in');StaffAuth.start(enterStaff);
setInterval(()=>{checkAlarm();},1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&loggedIn){refreshCloud();keepScreenAwake();}else stopAlarmSound();});

navigator.serviceWorker?.addEventListener('message',e=>{if(e.data?.type==='restaurant-push-open'&&loggedIn){switchTab(e.data.screen==='notifications'&&canSeeSecurityNotifications()?'notifications':'requests');refreshSecurityNotifications();refreshCloud();}});

async function loadReviewSettings(){$('reviewUrlInput').disabled=true;$('reviewSettingsSave').disabled=true;try{const r=await Cloud.rpc('restaurant_review_settings',{p_url:null});$('reviewUrlInput').value=r.url||'';$('reviewSettingsStatus').textContent='';}catch(e){$('reviewSettingsStatus').textContent=reviewSettingsError(e);}finally{$('reviewUrlInput').disabled=false;$('reviewSettingsSave').disabled=false;}}
async function saveReviewSettings(event){event.preventDefault();const b=$('reviewSettingsSave');b.disabled=true;try{const r=await Cloud.rpc('restaurant_review_settings',{p_url:$('reviewUrlInput').value},true);$('reviewUrlInput').value=r.url;$('reviewSettingsStatus').textContent=r.url?'Google review link saved.':'Review link cleared.';}catch(e){$('reviewSettingsStatus').textContent=reviewSettingsError(e);}finally{b.disabled=false;}}

function reviewSettingsError(e){return /restaurant_review_settings|schema cache/.test(e.message)?'Database setup missing: run SUPABASE/UPGRADE-EXISTING-PROJECT.sql in this shop’s Supabase project, wait a few seconds, then refresh this page.':e.message;}

async function toggleBestSeller(id,b){const item=menuItems.find(i=>i.id===id);if(!item)return;b.disabled=true;try{await patchMenuOptions(id,{best_seller:!item.best_seller});await refreshCloud();showToast(item.best_seller?'Best seller removed.':'Item marked as Best seller.');}catch(e){showToast(/best_seller|schema cache/.test(e.message)?'Run SUPABASE/BEST-SELLER-UPDATE.sql first, then refresh kitchen.':e.message);}finally{b.disabled=false;}}

let requestRows=[],lastRequestAlarm=0,reservedSeen=new Set();
function renderRequestAlerts(rows){requestRows=rows;const current=rows.filter(r=>r.request_kind==='ReservedScan');const box=$('reservedStaffAlert');box.hidden=!current.length;box.textContent=current.map(r=>'Reserved table QR opened · Table '+r.table_number+' — please check seating.').join(' ');if(rows.some(r=>!reservedSeen.has(r.id))){if(current.length)showToast(box.textContent);lastRequestAlarm=0;checkAlarm();}if(!rows.length)stopAlarmSound();reservedSeen=new Set(rows.map(r=>r.id));}
async function changePriceOnly(id){const i=menuItems.find(x=>x.id===id);if(!i)return;const value=prompt('New price for '+i.name,i.price);if(value===null)return;const price=Number(value);if(!value.trim()||!Number.isFinite(price)||price<0||price>100000){showToast('Enter a valid price.');return;}try{await Cloud.rpc('restaurant_manager_price',{p_id:id,p_price:price},true);await refreshCloud();showToast('Price updated.');}catch(e){showToast(e.message);}}
let staffCallAttempt=null;
async function openStaffCall(){try{const data=await Cloud.rpc('restaurant_manage_tables',{p_action:'list',p_table:null,p_status:null},true);$('staffCallTable').innerHTML='<option value="RECEPTION">Reception</option>'+data.map(t=>`<option value="${esc(t.table_number)}">Table ${esc(t.table_number)}</option>`).join('');$('staffCallStatus').textContent='';$('staffCallSend').disabled=false;$('staffCallModal').showModal();}catch(e){showToast(e.message);}}
async function sendStaffCall(event){event.preventDefault();const table=$('staffCallTable').value,b=$('staffCallSend');b.disabled=true;try{if(staffCallAttempt?.table!==table)staffCallAttempt={id:crypto.randomUUID(),table};await Cloud.rpc('restaurant_staff_call',{p_request_id:staffCallAttempt.id,p_table:table},true);staffCallAttempt=null;$('staffCallStatus').textContent=table==='RECEPTION'?'Waiter requested at reception.':'Waiter requested for Table '+table;await kitchenRequests.refresh();}catch(e){$('staffCallStatus').textContent=e.message;}finally{b.disabled=false;}}

function patchMenuOptions(id,patch){if(staffRole==='manager')return Cloud.rpc('restaurant_manager_menu_flags',{p_id:id,p_available:patch.available??null,p_recommended:patch.recommended??null,p_best_seller:patch.best_seller??null},true);return Cloud.patchMenu(id,patch);}

const requestRing=RequestRing.mount({scope:'kitchen',button:document.getElementById('soundButton'),onActive:()=>orderRing.pause()});
const orderRing=RequestRing.mount({scope:'kitchen-orders',kind:'order',button:document.getElementById('orderSoundButton'),suppressed:()=>requestRing.enabled&&requestRing.dialog.open});
