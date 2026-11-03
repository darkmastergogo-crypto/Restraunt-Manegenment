/* Release 66 — waiter email/password sign-in + online presence.
   The waiter signs in with the account the manager created; the server swaps that
   login for the normal waiter session token, so every waiter feature works as before.
   The waiter QR still works as a second option. */
'use strict';
(()=>{
const el=id=>document.getElementById(id);
const NAME_KEY='YUMMY_WAITER_NAME_v66';
let scannerWanted=false,beat=null;
const missingSql=e=>/restaurant_waiter_(account_session66|heartbeat66)|schema cache|PGRST202|Could not find the function/i.test(e?.message||'');

// The QR camera now opens only when the waiter asks for it.
el('waiterScannerStart')?.addEventListener('click',()=>{scannerWanted=true;el('waiterPairGate')?.classList.add('scanning66');},true);
if(typeof openWaiterScanner==='function'){const original=openWaiterScanner;window.openWaiterScanner=function(){if(!scannerWanted)return;return original.apply(this,arguments);};}
window.showPairGate=function(reason=''){
 if(typeof stopWaiterScanner==='function')stopWaiterScanner();
 el('waiterInstallGate').hidden=true;el('waiterPairGate').hidden=false;el('waiterAppShell').hidden=true;
 el('waiterScannerStatus').textContent='Tap “Open camera scanner” to use the waiter QR instead.';
 const status=el('waiterLoginStatus66');if(status)status.textContent=reason&&!/scan the waiter qr to start/i.test(reason)?reason:'';
 setTimeout(()=>el('waiterEmail66')?.focus(),60);
};

function paintName(){
 const name=(()=>{try{return localStorage.getItem(NAME_KEY)||'';}catch{return '';}})();
 const holder=el('waiterRestaurant');if(holder&&name){holder.hidden=false;holder.textContent='Signed in as '+name;}
}
async function heartbeat(){
 if(typeof waiterKey==='undefined'||!waiterKey||document.hidden)return;
 try{const r=await Cloud.rpc('restaurant_waiter_heartbeat66',{p_key:waiterKey});if(r?.name){try{localStorage.setItem(NAME_KEY,r.name);}catch{}paintName();}}
 catch(e){
  if(missingSql(e)){clearInterval(beat);beat=null;return;}
  if(typeof waiterSessionFailure==='function'&&waiterSessionFailure(e)){
   try{localStorage.removeItem(NAME_KEY);}catch{}
   if(typeof signOutWaiterSession==='function')await signOutWaiterSession(true).catch(()=>{});
   else{clearWaiterSession();showPairGate();}
   const s=el('waiterLoginStatus66');if(s)s.textContent='You were signed out by the manager or your shift ended. Sign in again.';
  }
 }
}
function startBeat(){if(!beat)beat=setInterval(heartbeat,30000);heartbeat();}

el('waiterLoginForm66')?.addEventListener('submit',async e=>{
 e.preventDefault();
 const status=el('waiterLoginStatus66'),button=el('waiterLoginButton66'),email=el('waiterEmail66').value.trim(),password=el('waiterPassword66').value;
 button.disabled=true;status.textContent='Signing in…';
 try{
  await Cloud.login(email,password);
  const result=await Cloud.rpc('restaurant_waiter_account_session66',{p_device:typeof waiterDeviceId==='function'?waiterDeviceId():null},true);
  if(!/^[a-f0-9]{64}$/.test(result?.token||'')||!result.expires_at)throw Error('Invalid session response.');
  storeWaiterSession(result.token,result.expires_at);
  try{localStorage.setItem(NAME_KEY,result.name||email);}catch{}
  // The waiter token is all the app needs; drop the email login so it can't be reused on this phone.
  await Cloud.logout().catch(()=>{});
  el('waiterPassword66').value='';status.textContent='';
  showWaiterDashboard();paintName();startBeat();await loadWaiterOrders();
 }catch(err){
  await Cloud.logout().catch(()=>{});
  status.textContent=missingSql(err)?'Waiter accounts are not set up yet. Ask the owner to run UPDATE-66 in Supabase.':/invalid login|invalid_grant|credentials/i.test(err.message)?'Wrong email or password.':err.message;
 }finally{button.disabled=false;}
});

// Already signed in from a previous visit → keep presence fresh.
const wait=setInterval(()=>{if(typeof waiterKey!=='undefined'&&waiterKey){clearInterval(wait);paintName();startBeat();}},1000);
setTimeout(()=>clearInterval(wait),60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&typeof waiterKey!=='undefined'&&waiterKey)heartbeat();});
})();
