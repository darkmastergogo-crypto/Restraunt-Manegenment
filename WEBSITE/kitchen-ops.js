'use strict';
window.KitchenOps=(()=>{
 let desired=false,requesting=false,healthBusy=false,volumeBusy=false,printPending=false;
 const el=id=>document.getElementById(id),safe=Cloud.esc;
 function init(){
  document.body.classList.toggle('dark-site',Cloud.read('RESTAURANT_DARK_KITCHEN_v26',true)!==false);
  el('themeToggle').textContent=document.body.classList.contains('dark-site')?'Use light theme':'Use dark theme';el('staffAccount').hidden=false;el('staffAccountRole').textContent=staffRole==='admin'?'Admin':'Manager';el('kitchenDeviceTools').hidden=false;
  desired=Cloud.read('RESTAURANT_WAKE_DESIRED_v26',false)===true;paintWake();ensureAwake();paintPrinter();
 }
 function theme(){const dark=document.body.classList.toggle('dark-site');Cloud.write('RESTAURANT_DARK_KITCHEN_v26',dark);el('themeToggle').textContent=dark?'Use light theme':'Use dark theme';}
 function paintWake(message){const supported='wakeLock' in navigator;el('wakeLockButton').disabled=!supported||requesting;el('wakeLockButton').setAttribute('aria-pressed',String(!!wakeLock&&!wakeLock.released));el('wakeLockButton').textContent=!supported?'Keep awake: unsupported':wakeLock&&!wakeLock.released?'Keep awake: on':desired?'Keep awake: retry':'Keep screen awake';if(message)el('deviceToolsStatus').textContent=message;}
 async function ensureAwake(){
  if(!desired||!loggedIn||requesting||document.visibilityState!=='visible'||!('wakeLock' in navigator)||wakeLock&&!wakeLock.released)return;
  requesting=true;paintWake();
  try{const handle=await navigator.wakeLock.request('screen');if(!desired||!loggedIn){await handle.release();return;}wakeLock=handle;handle.addEventListener('release',()=>{if(wakeLock===handle)wakeLock=null;paintWake(desired?'Screen wake lock released by browser/OS. It will be requested again when the page becomes visible.':'Screen wake lock off.');});paintWake('Screen awake while this visible page holds the lock. The OS or browser can release it.');}
  catch(e){paintWake('Wake lock not held: '+e.message+' Check HTTPS, battery settings and keep this page visible.');}finally{requesting=false;paintWake();}
 }
 async function toggleWake(){if(wakeLock&&!wakeLock.released){desired=false;Cloud.write('RESTAURANT_WAKE_DESIRED_v26',false);await wakeLock.release();wakeLock=null;paintWake('Keep-screen-awake disabled.');return;}desired=true;Cloud.write('RESTAURANT_WAKE_DESIRED_v26',true);await ensureAwake();}
 async function stop(){desired=false;Cloud.write('RESTAURANT_WAKE_DESIRED_v26',false);if(wakeLock){await wakeLock.release().catch(()=>{});wakeLock=null;}paintWake();}
 function startup(){
  if(location.protocol!=='https:'||!/^[a-z0-9.-]+$/i.test(location.hostname)){el('startupStatus').textContent='Open your deployed HTTPS kitchen page before creating its startup shortcut.';return;}
  const url=new URL('kitchen.html',location.href);url.search='';url.hash='';
  const text='[InternetShortcut]\r\nURL='+url.href+'\r\n';download('Pizza-With-Yaar-Kitchen.url',text,'application/internet-shortcut');
  el('startupStatus').textContent='Shortcut downloaded. On YOUR Windows PC: press Win+R, type shell:startup, press Enter, then move Pizza-With-Yaar-Kitchen.url into that folder. It opens at Windows sign-in. Sign-in/MFA is still required. Remove the shortcut there to disable. This page cannot change Windows startup automatically.';
 }
 async function health(){
  if(healthBusy||!loggedIn)return;healthBusy=true;el('healthRefresh').disabled=true;el('healthInternet').textContent=navigator.onLine?'Checking connection…':'Browser reports offline';el('healthServer').textContent='Checking…';
  const started=performance.now();
  try{const data=await Cloud.rpc('restaurant_health',{},true);if(data.database!=='responding')throw Error('Unexpected server response.');el('healthInternet').textContent='Reachable · verified by HTTPS round trip';el('healthServer').textContent='Responding · database read OK · '+Math.round(performance.now()-started)+' ms';el('healthDetails').textContent='Database release '+data.release+' · '+data.menu_rows+' menu rows · '+data.open_orders+' open orders · server time '+new Date(data.server_time).toLocaleString();}
  catch(e){el('healthInternet').textContent=navigator.onLine?'Unverified · browser reports a network, but the server check failed':'Offline · browser reports no network';el('healthServer').textContent='Not verified · '+e.message;el('healthDetails').textContent='A browser cannot distinguish every internet, sign-in, server or database failure. No green status is inferred from navigator.onLine alone.';}
  finally{el('healthChecked').textContent='Checked '+new Date().toLocaleString();paintPrinter();healthBusy=false;el('healthRefresh').disabled=false;}
 }
 function paintPrinter(){const last=Cloud.read('RESTAURANT_PRINT_TEST_v26',null);el('healthPrinter').textContent=last?(last.ok?'Last manually verified print: ':'Last test reported unsuccessful: ')+new Date(last.at).toLocaleString():'Not verified · no direct printer connection';}
 function printTest(){
  const stamp=new Date().toLocaleString();el('printReceipt').innerHTML='<section class="receipt"><h2>Pizza With Yaar</h2><h3>PRINTER TEST — NOT A SALE</h3><p>'+safe(stamp)+'</p><p>Table: TEST</p><hr><p>1 × Test item ........ ₹0.00</p><p>0123456789 · ABCDEFGHIJKLMNOPQRSTUVWXYZ</p><hr><p>If this page printed clearly on the intended printer, confirm in Health.</p></section>';
  printPending=true;el('printerConfirmation').hidden=false;el('printerTestStatus').textContent='Print requested. Choose your printer in the system dialog. Closing that dialog does not prove printing succeeded.';window.print();
 }
 function confirmPrint(ok){if(!printPending)return;Cloud.write('RESTAURANT_PRINT_TEST_v26',{ok:ok===true,at:Date.now()});printPending=false;el('printerConfirmation').hidden=true;el('printerTestStatus').textContent=ok?'You confirmed the test printed correctly. This is not continuous printer monitoring.':'You reported that the test did not print. Check power, cable/network, paper, drivers and printer selection.';paintPrinter();}
 async function volumeTest(){
  if(volumeBusy)return;volumeBusy=true;el('volumeTestButton').disabled=true;el('volumeStopButton').hidden=false;
  try{requestRing.pause();orderRing.pause();await RestaurantAlerts.volumeTest(text=>el('deviceToolsStatus').textContent=text);if(!document.hidden)el('deviceToolsStatus').textContent+=' Test requests finished. Only you can confirm what was audible; check speaker volume, mute and OS settings.';}
  catch(e){el('deviceToolsStatus').textContent='Volume test could not run: '+e.message;}finally{volumeBusy=false;el('volumeTestButton').disabled=false;el('volumeStopButton').hidden=true;}
 }
 return {init,theme,ensureAwake,toggleWake,stop,startup,health,printTest,confirmPrint,volumeTest};
})();
