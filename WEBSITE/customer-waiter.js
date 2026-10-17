/* Retry-safe waiter calls, with a private random call receipt for status tracking. */
'use strict';
(()=>{
 let sending=false,checking=false,until=0,receipt=null;
 const el=id=>document.getElementById(id),storageKey=prefix=>prefix+currentTable;
 function note(text,error=false){el('callWaiterStatus').textContent=text;el('callWaiterStatus').dataset.error=String(error);}
 function showStatus(){
  if(!receipt)return;
  if(Date.now()-Date.parse(receipt.created_at)>3600000){receipt=null;note('');return;}
  const label={Pending:'Waiter requested · Pending',Handled:'Waiter call handled ✓',Expired:'Waiter request expired. Please call again if you still need help.'}[receipt.status]||'Waiter request saved';
  note(label+(receipt.status==='Pending'?' · Table '+receipt.table_number:''));
 }
 function update(){
  const left=Math.max(0,Math.ceil((until-Date.now())/1000));
  el('callWaiterButton').disabled=sending||left>0||!TableAccess.canCall();
  el('callWaiterButton').textContent='🔔 '+(sending?'Sending…':left?'Call sent · '+left+'s':'Call waiter');
 }
 async function checkStatus(){
  if(checking||sending||!receipt?.request_id||receipt.status!=='Pending'||document.hidden)return;
  checking=true;const request=receipt.request_id;
  try{
   const row=await Cloud.rpc('restaurant_waiter_call_status',{p_request_id:request});
   if(receipt?.request_id!==request)return;
   receipt={...row,request_id:request};Cloud.write(storageKey('WAITER_CALL_RECEIPT_'),receipt);showStatus();
  }catch(e){note('Call status could not update. '+e.message,true);}
  finally{checking=false;}
 }
 async function send(){
  if(sending||until>Date.now())return;sending=true;update();note('Sending your request…');
  try{
   if(typeof Cloud==='undefined')throw Error('Connection unavailable. Please ask a staff member.');
   let attempt=Cloud.read(storageKey('WAITER_CALL_ATTEMPT_'),null);
   if(!attempt){attempt=crypto.randomUUID();Cloud.write(storageKey('WAITER_CALL_ATTEMPT_'),attempt);}
   const access=await TableAccess.credentials(false);
   const result=await Cloud.rpc('restaurant_customer_call',{p_request_id:attempt,p_table:currentTable,...access});
   until=Date.now()+Math.max(0,new Date(result.next_allowed_at)-new Date(result.server_now));
   receipt={...result,request_id:attempt};
   Cloud.write(storageKey('WAITER_CALL_UNTIL_'),until);
   Cloud.write(storageKey('WAITER_CALL_RECEIPT_'),receipt);
   Cloud.write(storageKey('WAITER_CALL_ATTEMPT_'),null);showStatus();
  }catch(e){note('Could not send: '+e.message,true);}
  finally{sending=false;update();}
 }
 window.addEventListener('DOMContentLoaded',()=>{
  if(typeof Cloud!=='undefined'){
   until=Number(Cloud.read(storageKey('WAITER_CALL_UNTIL_'),0))||0;
   receipt=Cloud.read(storageKey('WAITER_CALL_RECEIPT_'),null);showStatus();checkStatus();
  }
  el('callWaiterButton').addEventListener('click',send);update();
  setInterval(update,1000);setInterval(checkStatus,5000);
 });
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkStatus();});
})();