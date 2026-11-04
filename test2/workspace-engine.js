/* Restaurant features inside the billing shell; never a second staff workspace. */
'use strict';
(()=>{
 const embedded=parent!==window,params=new URLSearchParams(location.search);
 const routeMap={live:'kitchen',billing:'billing',history:'records',dashboard:'dashboard',menu:'items',stocks:'stocks',management:'settings',requests:'requests',tables:'tables',devices:'devices',notifications:'notifications'};
 if(!embedded){const requested=params.get('section')||location.hash.slice(1)||'live';location.replace('billing-suite/index.html#/'+(routeMap[requested]||'kitchen'));return;}
 document.documentElement.dataset.workspaceEmbedded='true';
 const preview=window.WORKSPACE_ENGINE_PREVIEW===true;
 const post=data=>parent.postMessage(data,preview?'*':location.origin);
 const nativeSwitch=window.switchTab;let announced=false,wanted=params.get('section')||'live',panel=params.get('panel')==='1'||window.frameElement?.dataset.panel==='true',active=false;
 const sections=new Set(['live','requests','tables','devices','notifications','menu','management','alerts','restaurantReports','dishSales','stockRules']);
 function reconcile(){
  const root=document.getElementById('managementSection');if(!root)return;
  // The billing forms are authoritative. Keep only restaurant-specific settings here.
  for(const index of [0,3]){const detail=document.getElementById('custom49Group'+index);if(detail)detail.hidden=true;const tab=document.getElementById('custom49Shortcuts')?.children[index];if(tab)tab.hidden=true;}
  const available=[...root.querySelectorAll('#custom48Form > details')].filter(d=>!d.hidden);if(available.length&&!available.some(d=>d.open))available[0].open=true;
  const customForm=document.getElementById('custom48Form'),payment=document.querySelector('.record-payment-option59');
  if(panel&&customForm){
   // The designer panel only shows the customer-menu design groups; every other control is a native billing screen.
   const keep=new Set(['Menu layout, categories & banners','Menu words & pictures','Menu backup & local file preview']);
   for(const d of customForm.querySelectorAll(':scope > details')){const t=(d.querySelector('summary')?.textContent||'').trim();d.hidden=!keep.has(t);}
   for(const el of root.children)if(!el.contains(customForm))el.hidden=true;
   const first=[...customForm.querySelectorAll(':scope > details')].find(d=>!d.hidden);if(first&&![...customForm.querySelectorAll(':scope > details')].some(d=>!d.hidden&&d.open))first.open=true;
   return;
  }
  if(payment&&customForm&&!document.getElementById('workspaceQrPayment')){
   const detail=document.createElement('details');detail.id='workspaceQrPayment';detail.open=true;
   detail.innerHTML='<summary>QR-order payment editing</summary>';detail.append(payment);
   customForm.querySelector('.custom48-save')?.before(detail);
  }
  for(const id of ['yummyContactSettings','themeStudio','themeStudioPanel','stockVisibilitySettings']){
   const el=document.getElementById(id);if(el){el.hidden=true;const group=el.closest('.management48-group');if(group)group.hidden=true;}
  }
  for(const card of root.querySelectorAll(':scope > .panel,:scope > .management48-group')){
   const title=(card.querySelector('summary,h3')?.textContent||'').trim();
   if(['Bill tax','Shop contact info','Contact info','Appearance & themes','Theme studio'].includes(title))card.hidden=true;
  }
  // Advanced category hiding remains; add/rename/delete live in the billing Items screen.
  const cat=document.getElementById('categoryForm');if(cat)cat.hidden=true;
  for(const b of root.querySelectorAll('[data-cat66="rename"],[data-cat66="remove"]'))b.hidden=true;
  for(const button of document.querySelectorAll('#menuSection button[onclick="openCsvImport67()"],#menuSection button[onclick="showAddItemModal()"]'))button.hidden=true;
  // The shared Admin access screen is the single system-lock control.
  const lock=document.getElementById('c48Lock'),message=document.getElementById('c48LockMessage');if(lock)lock.hidden=true;if(message)message.closest('label').hidden=true;
  for(const heading of root.querySelectorAll('h3'))if(heading.textContent.trim()==='System lock'){heading.hidden=true;if(heading.nextElementSibling?.tagName==='P')heading.nextElementSibling.hidden=true;}
 }
 function show(){
  if(!announced||!sections.has(wanted))return;
  const actual=({alerts:'requests',restaurantReports:'dashboard',dishSales:'history',stockRules:'stocks'})[wanted]||wanted;
  if(wanted==='dishSales'&&typeof setRecordsView==='function')setRecordsView('dishes');
  nativeSwitch(actual);
  document.documentElement.dataset.workspaceSection=wanted;
  document.documentElement.dataset.workspacePanel=String(panel);
  if(wanted==='dishSales'){
   const heading=document.querySelector('#historySection h2');if(heading)heading.textContent='Dish sales';
   const tabs=document.querySelector('#historySection .record-subtabs');if(tabs)tabs.hidden=true;
  }
  if(wanted==='restaurantReports'){const heading=document.querySelector('#dashboardSection h2');if(heading)heading.textContent='Restaurant reports';}
  if(wanted==='menu'){const heading=document.querySelector('#menuSection h2');if(heading)heading.textContent='Photos & portions';}
  if(wanted==='stockRules'){const heading=document.querySelector('#stocksSection h2');if(heading)heading.textContent='Stock rules';}
  reconcile();
  if(wanted==='alerts')document.getElementById('alertSetupModal')?.showModal();
  requestAnimationFrame(reportHeight);
 }
 function reportHeight(){
  if(!panel)return;const main=document.getElementById('staffMain');if(!main||main.hidden)return;
  post({type:'workspace:height',height:Math.ceil(main.getBoundingClientRect().height+32)});
 }
 function ready(){
  if(announced||document.getElementById('staffMain')?.hidden!==false)return;
  const alertControls=document.querySelector('#staffAccount .account-alert-controls'),tools=document.querySelector('.workspace-kitchen-tools');if(alertControls&&tools)tools.append(alertControls);
  announced=true;post({type:'workspace:ready'});show();setTimeout(()=>{postState();postCounts();},300);
 }
 window.switchTab=tab=>{
  if(!announced||!active){nativeSwitch(tab);return;}
  // Internal alarm controls can still focus the active kitchen route.
  if(tab==='live'&&wanted==='live'){nativeSwitch(tab);return;}
  if(routeMap[tab])post({type:'workspace:navigate',route:routeMap[tab]});
 };
 window.showBillPreview=id=>{const order=typeof findOrder==='function'?findOrder(id):null;if(order)post({type:'workspace:receipt',order});else if(typeof showToast==='function')showToast('Refresh orders and try again.');};
 window.signOutStaff=()=>post({type:'workspace:navigate',route:'settings'});
 addEventListener('message',async event=>{
  if(event.source!==parent||(!preview&&event.origin!==location.origin))return;const d=event.data||{};
  if(d.type==='workspace:theme'&&d.vars&&typeof d.vars==='object'){
   const allowed=new Set(['scheme','bg','surface','surface-2','line','line-2','ink','ink-2','muted','primary','primary-ink','primary-soft','primary-hover','green','green-soft','red','red-soft','amber','amber-soft','radius','radius-sm','font','mono']);
   for(const [key,value]of Object.entries(d.vars))if(allowed.has(key)&&typeof value==='string'&&value.length<300)document.documentElement.style.setProperty('--wk-'+key,value);
  }
  if(d.type==='workspace:section'&&sections.has(d.section)){wanted=d.section;panel=d.panel===true||params.get('panel')==='1';active=d.active===true||panel;show();}
  if(d.type==='workspace:active')active=d.active===true;
  if(d.type==='workspace:cleanup'){
   try{if(typeof BackgroundAlerts!=='undefined')await BackgroundAlerts.disableForSignOut();if(typeof RestaurantAlerts!=='undefined'){RestaurantAlerts.stop();RestaurantAlerts.stopVolumeTest();}if(typeof KitchenOps!=='undefined')await KitchenOps.stop();post({type:'workspace:cleanup-result',id:d.id});}
   catch(e){post({type:'workspace:cleanup-result',id:d.id,error:e.message});}
  }
  if(d.type==='workspace:command'&&typeof d.cmd==='string'){
   const ids=['orderSoundButton','soundButton','notificationSoundButton','backgroundAlertButton','enableAllDeviceAlerts','volumeTestButton','volumeStopButton','wakeLockButton'];
   try{
    if(d.cmd==='refresh'){if(typeof Cloud!=='undefined')Cloud.invalidateOrders?.();if(typeof refreshStaffPulse46==='function')await refreshStaffPulse46();else if(typeof refreshCloud==='function')await refreshCloud();}
    else if(d.cmd==='testNotification'){if(typeof BackgroundAlerts!=='undefined')await BackgroundAlerts.test();}
    else if(ids.includes(d.cmd))document.getElementById(d.cmd)?.click();
   }catch(e){if(typeof showToast==='function')showToast(e.message);}
   setTimeout(postState,350);setTimeout(postState,1500);
  }
  if(d.type==='workspace:alert-action'&&['order','request'].includes(d.kind)&&['dismiss','snooze'].includes(d.action)){
   const dialog=document.querySelector('.request-ring[data-ring-kind="'+d.kind+'"][open]');dialog?.querySelector('[data-ring-'+d.action+']')?.click();
  }
 });
 const main=document.getElementById('staffMain');if(main){new MutationObserver(()=>{ready();reportHeight();}).observe(main,{attributes:true,attributeFilter:['hidden']});new ResizeObserver(reportHeight).observe(main);}
 for(const [id,route,label]of [['menuSection','items','Items'],['dashboardSection','dashboard','Dashboard'],['historySection','records','Records'],['stocksSection','stocks','Stocks']]){
  const section=document.getElementById(id);if(!section)continue;const back=document.createElement('button');back.type='button';back.className='workspace-back';back.textContent='‹ Back to '+label;back.onclick=()=>post({type:'workspace:navigate',route});section.prepend(back);
 }
 const observedAlerts=new Map();new MutationObserver(()=>{
  if(panel)return;for(const dialog of document.querySelectorAll('.request-ring')){
   const open=dialog.open,kind=dialog.dataset.ringKind;if(observedAlerts.get(dialog)===open)continue;observedAlerts.set(dialog,open);
   post({type:'workspace:alert',kind,open,title:dialog.querySelector('h2')?.textContent||'Restaurant alert',message:dialog.querySelector('.ring-locations')?.textContent||''});
  }
 }).observe(document.body,{attributes:true,subtree:true,attributeFilter:['open']});
 let scheduled=false;new MutationObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;reconcile();});}).observe(document.getElementById('managementSection'),{childList:true,subtree:true});
 let lastSaved='';new MutationObserver(()=>{const message=document.getElementById('custom48Status')?.textContent||'';if(message!==lastSaved&&/saved/i.test(message)){lastSaved=message;post({type:'workspace:settings-changed'});}}).observe(document.getElementById('managementSection'),{childList:true,subtree:true,characterData:true});
 // Put restaurant device controls in the kitchen page, under the shared header.
 const tools=document.getElementById('kitchenDeviceTools'),call=document.getElementById('headerCallWaiter'),section=document.getElementById('liveSection');
 if(section&&tools){const details=document.createElement('details');details.className='workspace-kitchen-tools';details.innerHTML='<summary>Kitchen tools &amp; alerts</summary>';details.append(tools);if(call)details.prepend(call);section.querySelector('.page-tools')?.after(details);}
 const login=document.getElementById('staffLoginForm');if(login){login.hidden=true;const heading=document.getElementById('loginTitle');if(heading)heading.textContent='Restoring restaurant controls';const retry=document.createElement('button');retry.type='button';retry.className='secondary-btn';retry.textContent='Retry connection';retry.onclick=()=>location.reload();login.after(retry);}
 /* Alert controls and waiting counts for the native screens. */
 function postState(){
  if(panel)return;const ids=['enableAllDeviceAlerts','orderSoundButton','soundButton','notificationSoundButton','backgroundAlertButton','volumeTestButton','volumeStopButton','wakeLockButton'],controls={};
  for(const id of ids){const el=document.getElementById(id);if(el)controls[id]={label:el.textContent.trim().replace(/\s+/g,' ').slice(0,80),pressed:el.getAttribute('aria-pressed')==='true',hidden:!!el.hidden,disabled:!!el.disabled};}
  post({type:'workspace:alert-state',state:{controls,ready:(document.getElementById('alertReadyStatus')?.textContent||document.getElementById('deviceToolsStatus')?.textContent||'').trim().slice(0,300)}});
 }
 let lastCounts='';
 function postCounts(){
  if(panel)return;const n=id=>Number(document.getElementById(id)?.textContent||0)||0;
  const c={type:'workspace:counts',orders:n('activeOrdersBadge'),requests:n('requestsBadge'),notices:n('securityUnread')};const key=JSON.stringify(c);if(key!==lastCounts){lastCounts=key;post(c);}
 }
 new MutationObserver(()=>{postCounts();}).observe(document.body,{childList:true,subtree:true,characterData:true});
 let stateTimer=0;new MutationObserver(()=>{clearTimeout(stateTimer);stateTimer=setTimeout(postState,120);}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['aria-pressed','hidden','disabled'],childList:true,characterData:true});
 ready();
})();
