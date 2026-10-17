/* Explicit per-device consent. No secret server keys here, and no permission prompt on page load. */
'use strict';
const BackgroundAlerts=(()=>{
 let role=null,key='',button=null,status=null,enabled=false,busy=false,initialized=false;
 const supported=()=>window.isSecureContext&&'serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window;
 const publicKey=()=>typeof RESTAURANT_PUSH_CONFIG==='undefined'?'':RESTAURANT_PUSH_CONFIG.publicKey||'';
 function text(message,error=false){if(status){status.textContent=message;status.dataset.error=String(error);status.hidden=!error;}}
 function paint(){if(!button)return;button.disabled=busy;button.textContent=busy?'Please wait…':enabled?(role==='waiter'?'Call alerts: on':'Staff alerts: on'):(role==='waiter'?'Call alerts':'Staff alerts');button.setAttribute('aria-pressed',String(enabled));}
 const rpc=(action,subscription)=>Cloud.rpc('restaurant_push_device',{p_kind:role,p_key:role==='waiter'?key:null,p_action:action,p_subscription:subscription},role==='kitchen');
 function decode(v){const raw=atob(v.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(raw,c=>c.charCodeAt(0));}
 async function existing(){const reg=await navigator.serviceWorker.getRegistration(new URL('./',location.href));return reg?await reg.pushManager.getSubscription():null;}
 async function check(){
  if(!supported()){text('Notifications need HTTPS and a supported browser.',true);button.disabled=true;return;}
  if(!/^[A-Za-z0-9_-]{87}=?$/.test(publicKey())){text('Configure push-config.js and the Supabase sender first.',true);return;}
  if(Notification.permission==='denied'){text('Notifications are blocked. Allow notifications in this site’s browser settings.',true);return;}
  try{const sub=await existing();if(sub&&Notification.permission==='granted')enabled=(await rpc('status',sub.toJSON())).enabled===true;
   if(enabled)text('Enabled for this device. Notifications can arrive with the screen locked or the page closed. Sound follows system settings; delivery is not guaranteed.');
   else text('Get a notification for '+(role==='waiter'?'customer calls':'customer requests and blocked-browser QR attempts')+' when this page is closed. Enable separately on each staff device.');
  }catch{text('Could not check alert settings. Reconnect and try again.',true);}
  paint();
 }
 async function toggle(){
  if(busy||!supported())return;busy=true;paint();
  try{
   if(enabled){const sub=await existing();if(sub)await rpc('disable',sub.toJSON());enabled=false;text('Background alerts are off for this dashboard on this device. In-page sound is controlled separately.');}
   else{
    if(!/^[A-Za-z0-9_-]{87}=?$/.test(publicKey()))throw Error('The owner must configure push-config.js and the Supabase sender first.');
    // Called directly from the button gesture; do not prompt automatically.
    const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('Notification permission was not granted. Allow notifications in site settings to use background alerts.');
    const reg=await navigator.serviceWorker.register(new URL('sw.js',location.href),{scope:new URL('./',location.href).pathname});
    await navigator.serviceWorker.ready;
    let sub=await reg.pushManager.getSubscription();
    if(sub){const actual=sub.options.applicationServerKey;const expected=decode(publicKey());if(actual&&Array.from(new Uint8Array(actual)).join(',')!==Array.from(expected).join(','))throw Error('This device uses a different push key. Ask the owner to reset site notification data, then enable alerts again.');}
    if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decode(publicKey())});
    const result=await rpc('enable',sub.toJSON());if(!result.enabled)throw Error('The server did not register this device.');
    enabled=true;text('Enabled for this device. Lock the screen and test a NEW '+(role==='waiter'?'customer call':'request or blocked-browser QR attempt')+'. Allow notification sound in system settings. Delivery is not guaranteed.');
   }
  }catch(e){text('Background alerts: '+e.message,true);}
  finally{busy=false;paint();}
 }
 async function disableForSignOut(){
  if(!supported())return;const sub=await existing();if(sub)await rpc('disable',sub.toJSON());enabled=false;paint();
 }
 function init(kind,privateKey=''){
  if(initialized)return;initialized=true;role=kind;key=privateKey;
  button=document.getElementById('backgroundAlertButton');status=document.getElementById('backgroundAlertStatus');
  document.getElementById('backgroundAlertPanel').hidden=false;
  button.addEventListener('click',toggle);check();
 }
 async function test(){const target=document.getElementById('notificationTestStatus');const note=m=>{if(target)target.textContent=m;};try{if(!supported()||Notification.permission!=='granted')throw Error('Enable Request/Call alerts and allow notifications first.');const reg=await navigator.serviceWorker.getRegistration(new URL('./',location.href));if(!reg)throw Error('Enable alerts first to install notifications.');await reg.showNotification('Test request alert',{body:'Local sound/display test. Background delivery still depends on your phone and sender.',tag:'restaurant-local-test',renotify:true,silent:false,requireInteraction:true,vibrate:[500,150,500,150,500],data:{kind:role,url:new URL(role==='waiter'?'waiter.html':'kitchen.html#requests',location.href).href}});note('Test notification requested. If silent, check phone notification sound/volume and Do Not Disturb. This does not test server delivery.');}catch(e){note(e.message);}}
 return {init,disableForSignOut,test};
})();
