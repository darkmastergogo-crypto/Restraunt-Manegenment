const keyBytes=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));
export async function disablePhonePush(api) {
  if(!('serviceWorker' in navigator))return;
  const registration=await navigator.serviceWorker.getRegistration('/');
  const subscription=await registration?.pushManager?.getSubscription();
  if(subscription){
    // Unsubscribe with the browser even if server-side removal fails; never keep a logged-out device subscribed.
    try{await api('pushUnsubscribe',{endpoint:subscription.endpoint});}catch{}
    if(!await subscription.unsubscribe())throw Error('Could not disable phone notifications. Retry before signing out.');
  }
}
export async function phonePushPanel(api,modal) {
  if(!isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window))throw Error('Use Android Chrome or Firefox over HTTPS for phone notifications.');
  const info=await api('pushInfo');
  if(!info.configured)throw Error('Server push keys are not configured yet.');
  if(!info.enabled)throw Error('The platform owner must enable Background push under this restaurant’s Features.');
  modal(`<h2>Phone notifications</h2><p>Receive private alerts on this Android device, including when the screen is locked. Android permission and network access are required. Delivery is not guaranteed.</p>
    <label><input type="checkbox" id="pushOrders" checked> Orders and order updates</label>
    <label><input type="checkbox" id="pushRequests" checked> Service, music and table requests</label>
    <label><input type="checkbox" id="pushAlerts" checked> Stock and security alerts</label>
    <div class="toolbar"><button type="button" id="pushEnable">Enable / update this phone</button><button type="button" id="pushDisable">Disable this phone</button><button type="button" id="pushTest">Test this phone</button></div><p id="pushResult" role="status"></p>
    <p>Keep Android browser notifications enabled. Do not force-stop the browser. Signing out disables this browser’s subscription. Re-enable after signing in. A test verifies local display, not server delivery.</p>`);
  const status=document.querySelector('#pushResult');
  document.querySelector('#pushEnable').onclick=async()=>{
    try{
      const categories=['orders','requests','alerts'].filter((k,i)=>document.querySelector('#'+['pushOrders','pushRequests','pushAlerts'][i]).checked);
      if(!categories.length)throw Error('Select at least one notification type.');
      if(await Notification.requestPermission()!=='granted')throw Error('Notifications blocked. Allow them in this website’s Android Chrome settings.');
      const reg=await navigator.serviceWorker.register('/push-sw.js',{scope:'/'});await navigator.serviceWorker.ready;
      let sub=await reg.pushManager.getSubscription();
      if(sub && sub.options.applicationServerKey && new Uint8Array(sub.options.applicationServerKey).toString()!==keyBytes(info.publicKey).toString()){
        await sub.unsubscribe();sub=null;
      }
      sub ||= await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(info.publicKey)});
      try{await api('pushSubscribe',{subscription:sub.toJSON(),categories});}catch(e){await sub.unsubscribe();throw e;}
      status.textContent='Phone notifications enabled for this restaurant. Lock the phone and send a real test order to verify background delivery.';
    }catch(e){status.textContent=e.message;}
  };
  document.querySelector('#pushDisable').onclick=async()=>{try{await disablePhonePush(api);status.textContent='Phone notifications disabled on this browser.';}catch(e){status.textContent=e.message;}};
  document.querySelector('#pushTest').onclick=async()=>{
    try{const reg=await navigator.serviceWorker.getRegistration('/');if(!reg || Notification.permission!=='granted')throw Error('Enable this phone first.');
      await reg.showNotification('Restaurant staff alert',{body:'Local notification test. No order was created.',tag:'rp-local-test',icon:'/push-icon-192.png'});
      status.textContent='Local test shown. Verify server push separately with a real order.';
    }catch(e){status.textContent=e.message;}
  };
}
