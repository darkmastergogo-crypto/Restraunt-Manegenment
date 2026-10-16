'use strict';
const TableAccess=(()=>{
 let visit=null,state=null,offset=0,busy=null,initialized=false,error='';
 const key=()=> 'RESTAURANT_TABLE_VISIT_v1_'+currentTable;
 function read(){try{return JSON.parse(sessionStorage.getItem(key())||'null');}catch{return null;}}
 function save(){sessionStorage.setItem(key(),JSON.stringify(visit));}
 function expired(){return !!visit?.expires_at&&Date.parse(visit.expires_at)<=Date.now()+offset;}
 function canCall(){return !!state?.active&&!state.expired&&!expired()&&!error;}
 function render(){const notice=document.getElementById('tableAccessNotice'),lock=document.getElementById('scanExpired');if(!notice)return;
  const isExpired=expired()||state?.expired===true;lock.hidden=!isExpired;
  notice.textContent=error||(state?.status==='Reserved'?'This table is reserved. Please ask a waiter.':'');notice.hidden=!notice.textContent;
  if(isExpired){window.OrderCelebration?.close();const d=document.getElementById('reviewDialog');if(d?.open)d.close();}
 }
 async function refresh(){if(busy)return busy;if(!visit)return;
  busy=(async()=>{try{state=await Cloud.rpc('restaurant_open_visit',{p_visit_id:visit.id,p_visit_token:visit.token,p_table:currentTable});offset=Date.parse(state.server_now)-Date.now();visit.expires_at=state.expires_at;save();error='';render();return state;}catch(e){error='Table access: '+e.message;render();throw e;}finally{busy=null;}})();return busy;
 }
 async function init(){if(initialized)return busy||state;initialized=true;visit=read();const nav=performance.getEntriesByType('navigation')[0]?.type||'navigate';const qr=new URL(location.href).searchParams.get('entry')==='qr';
  // A new opening of a printed QR can begin a fresh visit. Reload/back retain expiry.
  if(!visit||qr&&nav==='navigate'&&Date.parse(visit.expires_at||0)<=Date.now())visit={id:crypto.randomUUID(),token:crypto.randomUUID()};save();
  try{return await refresh();}catch{return null;}
 }
 async function credentials(ordering=true){if(!initialized)await init();else await refresh();if(!canCall())throw Error(expired()||state?.expired?'Scan expired. Please scan your table QR again.':error||'Please scan your table QR again.');if(ordering&&state.status==='Reserved')throw Error('This table is reserved. Please ask a waiter.');return {p_visit_id:visit.id,p_visit_token:visit.token};}
 setInterval(()=>{if(initialized&&!document.hidden)render();},1000);
 setInterval(()=>{if(initialized&&!document.hidden&&!expired())refresh().catch(()=>{});},5000);
 document.addEventListener('visibilitychange',()=>{if(initialized&&!document.hidden){render();if(!expired())refresh().catch(()=>{});}});
 return {init,credentials,canCall,expired};
})();
