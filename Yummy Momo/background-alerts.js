/* Consent is requested from an explicit setup tap. Remember preferences, never bypass browser rules. */
'use strict';
const BackgroundAlerts=(()=>{
 let role=null,key='',button=null,status=null,busy=false,initialized=false,enabled=false,panel=null,lastCheck=0;
 const seen=new Set(Cloud.read('YUMMY_NOTICE_SEEN_v38',[]));
 const supported=()=>window.isSecureContext&&'serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window;
 const publicKey=()=>typeof RESTAURANT_PUSH_CONFIG==='undefined'?'':RESTAURANT_PUSH_CONFIG.publicKey||'';
 const preference=()=>AlertDevice.enabled('push-'+role);
 function text(message,error=false){if(status){status.textContent=message;status.dataset.error=String(error);status.hidden=false;}const note=document.getElementById('alertReadyStatus');if(note)note.textContent=message;}
 function paint(){if(!button)return;button.disabled=busy;button.textContent=busy?'Please wait…':enabled?'Notifications on · disable':'Enable notifications';button.setAttribute('aria-pressed',String(enabled));const setup=document.getElementById('enableAllDeviceAlerts');if(setup)setup.disabled=busy;}
 const rpc=(action,subscription)=>Cloud.rpc('restaurant_push_device',{p_kind:role,p_key:role==='waiter'?key:null,p_action:action,p_subscription:subscription},role==='kitchen');
 function decode(v){const raw=atob(v.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(raw,c=>c.charCodeAt(0));}
 async function registration(){await navigator.serviceWorker.register(new URL('sw.js?v=yummy-38',location.href),{scope:new URL('./',location.href).pathname});return navigator.serviceWorker.ready;}
 async function existing(){const reg=await navigator.serviceWorker.getRegistration(new URL('./',location.href));return reg?await reg.pushManager.getSubscription():null;}
 async function enable(){
  if(!/^[A-Za-z0-9_-]{87}=?$/.test(publicKey()))throw Error('Permission saved. The owner must configure push-config.js and the Supabase push sender for background delivery.');
  const reg=await registration();let sub=await reg.pushManager.getSubscription();
  if(sub){const actual=sub.options.applicationServerKey,expected=decode(publicKey());if(actual&&Array.from(new Uint8Array(actual)).join(',')!==Array.from(expected).join(','))throw Error('The notification key has changed. Reset this site’s notification subscription in browser settings, then enable again.');}
  if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decode(publicKey())});
  const result=await rpc('enable',sub.toJSON());if(!result.enabled)throw Error('The server did not register this device.');enabled=true;
  text('Notifications registered for '+(role==='waiter'?'waiter calls':'incoming orders and waiter calls')+'. Sound choices are remembered. System notifications use your device volume; locked/closed delivery still depends on the push sender and OS.');
 }
 async function check(){
  if(busy)return;busy=true;paint();lastCheck=Date.now();
  try{if(!supported())throw Error('Notifications need HTTPS and a supported browser. On iPhone/iPad, install this site on the Home Screen first.');
   if(!preference()){enabled=false;text('Notifications muted on this device. Tap Enable sounds & notifications to turn them back on.');return;}
   if(Notification.permission==='denied')throw Error('Notifications are blocked. Allow this site in browser settings; a website cannot override your decision.');
   if(Notification.permission!=='granted'){text('Alerts are on by default. Tap below to allow notifications and unlock sound. Preferences stay saved; browsers may need a tap after reopening.');return;}
   await enable();
  }catch(e){enabled=false;text(e.message,true);}finally{busy=false;paint();}
 }
 async function setup(){
  if(busy)return;
  for(const k of [role==='waiter'?'waiter':'kitchen',...(role==='kitchen'?['kitchen-orders','voice','notification']:[]),'push-'+role])AlertDevice.set(k,true);
  // Invoke requestPermission before any await: mobile browsers require this direct user gesture.
  let permission;
  try{permission=supported()?Notification.requestPermission():Promise.resolve('unsupported');}catch(e){permission=Promise.reject(e);}
  document.dispatchEvent(new Event('yummy-enable-audio'));busy=true;paint();
  try{const result=await permission;if(result!=='granted')throw Error(result==='denied'?'Notifications blocked. Allow this site in browser settings. Sounds remain enabled.':result==='unsupported'?'Notifications require HTTPS and a supported browser; iOS requires a Home Screen web app.':'Notification permission was not granted. Sounds remain enabled; try again when ready.');await enable();}
  catch(e){enabled=false;text(e.message,true);}finally{busy=false;paint();}
 }
 async function toggle(){if(busy)return;if(!enabled){await setup();return;}busy=true;paint();try{const sub=await existing();if(sub)await rpc('disable',sub.toJSON());AlertDevice.set('push-'+role,false);enabled=false;text('Notifications off on this device. Foreground audio preferences are unchanged.');}catch(e){text('Could not disable notifications: '+e.message,true);}finally{busy=false;paint();}}
 async function disableForSignOut(){if(!supported())return;const sub=await existing();if(sub)await rpc('disable',sub.toJSON());enabled=false;if(panel)panel.hidden=true;paint();}
 function init(kind,privateKey=''){
  if(initialized){key=privateKey;if(panel?.hidden){panel.hidden=false;check();}return;}initialized=true;role=kind;key=privateKey;button=document.getElementById('backgroundAlertButton');status=document.getElementById('backgroundAlertStatus');document.getElementById('backgroundAlertPanel').hidden=false;
  panel=document.createElement('section');panel.className='alert-ready-panel';panel.setAttribute('aria-label','Device alerts setup');panel.innerHTML='<div><strong>Order & waiter-call alerts</strong><p id="alertReadyStatus" class="hint" role="status">Sounds are on by default. Allow notifications for background alerts.</p></div><button id="enableAllDeviceAlerts" type="button" class="primary-btn">Enable sounds & notifications</button>';
  if(role==='waiter')panel.querySelector('strong').textContent='Waiter-call alerts';
  const root=document.getElementById('staffMain')||document.querySelector('main');root.prepend(panel);
  button.addEventListener('click',toggle);document.getElementById('enableAllDeviceAlerts').addEventListener('click',setup);check();
 }
 async function notifyRows(kind,rows){
  if(!initialized)return;const fresh=[];
  for(const r of rows||[]){if(r.status!=='Pending'||r.on_the_way_at)continue;const id=kind+':'+r.id;if(seen.has(id))continue;seen.add(id);fresh.push(r);}
  try{Cloud.write('YUMMY_NOTICE_SEEN_v38',[...seen].slice(-500));}catch{}
  if(!fresh.length||enabled||!preference()||!supported()||Notification.permission!=='granted')return;
  try{const reg=await registration();for(const r of fresh.slice(-3))await reg.showNotification(kind==='order'?'New order · Table '+r.table_number:'Waiter requested · '+(r.request_kind==='Reception'?'Reception':'Table '+r.table_number),{body:kind==='order'?Cloud.orderLabel(r)+' · Open Pending Orders to accept.':'Open Requests to respond.',tag:'restaurant-local-'+kind+'-'+r.id,silent:false,renotify:true,requireInteraction:true,vibrate:[500,150,500],data:{kind:role,screen:kind==='order'?'orders':'requests'}});}catch(e){text('Local notification failed: '+e.message,true);}
 }
 async function test(){const target=document.getElementById('notificationTestStatus');try{if(!supported()||Notification.permission!=='granted')throw Error('Tap Enable sounds & notifications and allow notifications first.');const reg=await registration();await reg.showNotification('Yummy Momo · Alert test',{body:'Local display/sound test only. Background delivery requires the configured server sender.',tag:'restaurant-local-test',renotify:true,silent:false,requireInteraction:true,vibrate:[500,150,500],data:{kind:role,screen:'requests'}});if(target)target.textContent='Test sent. Check OS notification volume and Do Not Disturb if silent. This does not verify server delivery.';}catch(e){if(target)target.textContent=e.message;else text(e.message,true);}}
 document.addEventListener('visibilitychange',()=>{if(initialized&&!document.hidden&&Date.now()-lastCheck>300000)check();});
 return {init,setup,toggle,disableForSignOut,test,notifyRows,suspend(){if(panel)panel.hidden=true;},get enabled(){return enabled;}};
})();
