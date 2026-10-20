/* Only AndroidX's origin-restricted main-frame message channel is supported.
   Tokens/capabilities are never logged or copied into localStorage by this bridge. */
'use strict';
window.YummyAndroid=(()=>{
 let state=null,kind=null,key='',permissions={},busy=false,lastSignature='',lastRefresh=0,nextAttempt=0,disabled=false;
 const native=()=>typeof window.YummyNative?.postMessage==='function';
 const post=data=>{if(native())window.YummyNative.postMessage(JSON.stringify(data));};
 function available(){return native();}function active(){return !!(native()&&state?.registered&&state?.requested&&state?.notifications);}
 function paint(message){if(!native())return;let panel=document.getElementById('nativeAppAlerts');if(!panel){panel=document.createElement('section');panel.id='nativeAppAlerts';panel.className='app-alert-controls';panel.innerHTML='<p id="nativeAppAlertStatus" role="status"></p><button class="secondary-btn waiter-button" type="button" id="nativeAppAlertSettings">App alerts</button>';const main=document.querySelector('main');if(!main)return;main.prepend(panel);document.getElementById('nativeAppAlertSettings').onclick=settings;}
  document.getElementById('nativeAppAlertStatus').textContent=message||(!state?.firebaseReady?'App push setup missing: add the Firebase configuration and rebuild.':!state?.requested?'App alerts are off. Tap App alerts to enable.':!state?.notifications?'Allow Android notifications in App alerts.':active()?'App alerts connected · voice '+(state.voice?'on':'off')+'. Android sound and DND settings still apply.':'App alerts waiting for staff sign-in / private waiter link, or server registration.');}
 async function register(){if(!native()||busy||Date.now()<nextAttempt||disabled||!state?.requested||!state.notifications||!state.token||!state.firebaseReady||!kind)return;
  if((kind==='kitchen'&&!(typeof loggedIn!=='undefined'&&loggedIn))||(kind==='waiter'&&(!permissions.enabled||!permissions.alerts||!(permissions.view_orders||permissions.view_requests))))return;
  if((state.app==='admin')!==(kind==='kitchen')){paint('This app cannot register a different staff role.');return;}
  const signature=JSON.stringify([state.device,state.token,kind,key]);if(signature===lastSignature&&Date.now()-lastRefresh<12*3600000)return;busy=true;
  try{const result=await Cloud.rpc('restaurant_native_device',{p_action:'enable',p_device:state.device,p_secret:state.secret,p_token:state.token,p_app:state.app,p_key:kind==='waiter'?key:null},kind==='kitchen');if(!result.enabled)throw Error('Device registration was not confirmed.');lastSignature=signature;lastRefresh=Date.now();nextAttempt=0;post({type:'registered',value:true});paint('App alerts registered. Use a new real order / request to test server delivery.');}
  catch(e){nextAttempt=Date.now()+30000;post({type:'registered',value:false});paint('App alerts not registered: '+e.message+' Check SUPABASE/YUMMY-MOMO-37.sql and the native sender setup.');}finally{busy=false;}}
 function connect(nextKind,privateKey='',perms={}){kind=nextKind;key=privateKey;permissions=perms;if(nextKind==='waiter'&&Object.hasOwn(perms,'enabled')&&(!perms.enabled||!perms.alerts||!(perms.view_orders||perms.view_requests))){post({type:'registered',value:false});lastSignature='';}register();}
 async function disconnect(){disabled=true;post({type:'disable'});if(!state?.device)return;try{await Cloud.rpc('restaurant_native_device',{p_action:'disable',p_device:state.device,p_secret:state.secret},false);}finally{lastSignature='';}}
 function settings(){post({type:'settings'});}function test(){post({type:'test'});}function toggleVoice(){post({type:'voice'});}function refresh(){post({type:'status'});}
 function pending(type,ids){if(active())post({type:'pending',kind:type,ids:ids.slice(0,1000)});}
 if(native()){
  YummyNative.onmessage=event=>{try{const next=JSON.parse(event.data);if(next.type!=='state')return;const wasRequested=state?.requested;state=next;disabled=!next.requested;document.dispatchEvent(new Event('yummy-native-state'));paint();if(wasRequested&&!next.requested&&next.device)Cloud.rpc('restaurant_native_device',{p_action:'disable',p_device:next.device,p_secret:next.secret},false).catch(()=>{});register();}catch{paint('App alert status could not be read. Reopen the app.');}};
  window.print=()=>post({type:'print'});if(typeof window.download==='function')window.download=(name,text,type='application/json')=>{if(String(text).length>6*1024*1024){window.showToast?.('Export is too large for the app. Export a smaller period or use the browser.');return;}post({type:'save',name:String(name),text:String(text),mime:String(type)});};if(navigator.clipboard)try{navigator.clipboard.writeText=text=>{post({type:'copy',text:String(text)});return Promise.resolve();};}catch{}refresh();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});setInterval(()=>{if(!document.hidden){refresh();if(!kind){if(typeof loggedIn!=='undefined'&&loggedIn)connect('kitchen');else if(typeof waiterPermissions!=='undefined'&&typeof waiterKey!=='undefined')connect('waiter',waiterKey,waiterPermissions);}}},30000);
  // The page may already be signed in when this last-loaded script initializes.
  setTimeout(()=>{if(typeof loggedIn!=='undefined'&&loggedIn)connect('kitchen');else if(typeof waiterPermissions!=='undefined'&&typeof waiterKey!=='undefined')connect('waiter',waiterKey,waiterPermissions);},50);
 }
 return {available,active,state:()=>state,connect,disconnect,settings,test,toggleVoice,refresh,pending};
})();
