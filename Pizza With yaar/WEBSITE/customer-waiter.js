/* Call waiter: shared server request, not a local-only alert. */
'use strict';
(() => {
 let sending=false, until=0;
 const button=()=>document.getElementById('callWaiterButton');
 const status=()=>document.getElementById('callWaiterStatus');
 const storageKey=prefix=>prefix+currentTable;
 function note(text,error=false){status().textContent=text;status().dataset.error=String(error);}
 function update(){const left=Math.max(0,Math.ceil((until-Date.now())/1000));button().disabled=sending||left>0;button().textContent=sending?'Sending…':left?'Call sent · '+left+'s':'Call waiter';}
 async function send(){
  if(sending||until>Date.now())return;
  sending=true;update();note('Sending your request…');
  try{
   if(typeof Cloud==='undefined')throw Error('Connection unavailable. Please ask a staff member.');
   let attempt=Cloud.read(storageKey('WAITER_CALL_ATTEMPT_'),null);
   if(!attempt){attempt=crypto.randomUUID();Cloud.write(storageKey('WAITER_CALL_ATTEMPT_'),attempt);}
   const result=await Cloud.rpc('restaurant_call_waiter',{p_request_id:attempt,p_table:currentTable});
   until=Date.now()+Math.max(0,new Date(result.next_allowed_at)-new Date(result.server_now));
   Cloud.write(storageKey('WAITER_CALL_UNTIL_'),until);Cloud.write(storageKey('WAITER_CALL_ATTEMPT_'),null);
   if(result.status==='Handled')note('Your previous request was already handled. Please wait before calling again.');
   else if(result.status==='Expired')note('Your previous request expired. Please try again after the countdown.');
   else note(result.already_pending?'A waiter has already been requested for Table '+result.table_number+'. Please wait.':'Request saved for Table '+result.table_number+'. A waiter will see it on their open dashboard.');
  }catch(e){note('Could not send: '+e.message,true);}
  finally{sending=false;update();}
 }
 window.addEventListener('DOMContentLoaded',()=>{
  if(typeof Cloud!=='undefined'){until=Number(Cloud.read(storageKey('WAITER_CALL_UNTIL_'),0))||0;if(until>Date.now())note('Your waiter request was sent. Please wait before calling again.');}
  button().addEventListener('click',send);update();setInterval(update,1000);
 });
})();
