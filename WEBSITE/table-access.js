'use strict';
const TableAccess=(()=>{
 let visit=null,state=null,offset=0,busy=null,initialized=false,error='',qrKey=null;
 const el=id=>document.getElementById(id),key=()=> 'RESTAURANT_TABLE_VISIT_v2_'+currentTable;
 function read(){try{return JSON.parse(sessionStorage.getItem(key())||'null');}catch{return null;}}
 function save(){sessionStorage.setItem(key(),JSON.stringify(visit));}
 function expired(){return !!visit?.expires_at&&Date.parse(visit.expires_at)<=Date.now()+offset;}
 function canCall(){return !!state?.active&&!state.expired&&!expired()&&!error;}
 function render(){if(!el('scanExpired'))return;const timedOut=expired()||state?.expired===true,locked=!canCall();el('scanExpired').hidden=!locked;
  el('scanExpiredTitle').textContent=timedOut?'Please scan your table QR again':'Please scan your table QR';
  el('scanAccessText').textContent=timedOut?'Your 1-hour table access has expired. Scan the QR printed on your table to continue.':error||'Scan the QR printed on your table to open the menu.';
  el('tableAccessNotice').textContent=state?.status==='Reserved'?'This table is reserved. Please ask a waiter.':'';el('tableAccessNotice').hidden=!el('tableAccessNotice').textContent;
  if(locked){window.OrderCelebration?.close();const d=el('reviewDialog');if(d?.open)d.close();}
 }
 async function refresh(){if(busy)return busy;if(!visit||!currentTable){render();return null;}
  busy=(async()=>{try{state=await Cloud.rpc('restaurant_open_visit',{p_visit_id:visit.id,p_visit_token:visit.token,p_table:currentTable,p_qr_key:qrKey});offset=Date.parse(state.server_now)-Date.now();visit.expires_at=state.expires_at;save();error='';
   if(qrKey){qrKey=null;const u=new URL(location.href);u.searchParams.delete('qr');u.searchParams.delete('entry');history.replaceState(null,'',u);}
   render();if(canCall()&&typeof resumeReviewPrompt==='function')resumeReviewPrompt();return state;
  }catch(e){error=e.message;render();throw e;}finally{busy=null;}})();return busy;
 }
 async function init(){if(initialized)return busy||state;initialized=true;qrKey=new URL(location.href).searchParams.get('qr');visit=read();
  if(!currentTable){error='Scan the QR printed on your table to open the menu.';render();return null;}
  if(qrKey){visit={id:crypto.randomUUID(),token:crypto.randomUUID()};}
  if(!visit){error='Scan the QR printed on your table to open the menu.';render();return null;}
  try{save();return await refresh();}catch{return null;}
 }
 async function credentials(ordering=true){if(!initialized)await init();else await refresh();if(!canCall())throw Error(expired()||state?.expired?'Scan expired. Please scan your table QR again.':error||'Please scan the table QR to open the menu.');if(ordering&&state.status==='Reserved')throw Error('This table is reserved. Please ask a waiter.');return {p_visit_id:visit.id,p_visit_token:visit.token};}
 setInterval(()=>{if(initialized&&!document.hidden)render();},1000);
 setInterval(()=>{if(initialized&&!document.hidden&&visit&&!expired())refresh().catch(()=>{});},5000);
 document.addEventListener('visibilitychange',()=>{if(initialized&&!document.hidden){render();if(visit&&!expired())refresh().catch(()=>{});}});
 return {init,credentials,canCall,expired};
})();
