/* Launch food only AFTER a confirmed cloud order. Optional presentation, never order logic. */
'use strict';
window.OrderCelebration=(()=>{
 const seen=new Set();let timer=null,onDone=null;
 const storageKey='RESTAURANT_ORDER_CELEBRATIONS_v1';
 try{const rows=JSON.parse(sessionStorage.getItem(storageKey)||'[]');if(Array.isArray(rows))rows.slice(-100).forEach(id=>seen.add(id));}catch{}
 const dialog=()=>document.getElementById('orderCelebration');
 const safely=fn=>{try{fn?.();}catch{}};
 function finish(){
  clearTimeout(timer);timer=null;
  document.getElementById('celebrationParticles')?.replaceChildren();
  const callback=onDone;onDone=null;
  if(document.getElementById('trackingModal')?.classList.contains('open'))document.querySelector('#trackingModal .btn-close-drawer')?.focus({preventScroll:true});
  safely(callback);
 }
 function close(){const d=dialog();if(d?.open)d.close();}
 function launch(){
  const field=document.getElementById('celebrationParticles');field.replaceChildren();
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const food=['🍕','🍟','🍕','🥤','🍔','🍕','🍟','🍕','🥤','🍕','🍔','🍕'];
  const spread=[-44,36,-27,46,-37,22,-14,10,32,-21,42,-42];
  food.forEach((icon,i)=>{
   const piece=document.createElement('span');piece.className='food-flight';piece.textContent=icon;
   const x=spread[i],turn=(i%2?1:-1)*(100+i*11);
   piece.style.setProperty('--from-x',(-10+(i*7)%21)+'vw');
   piece.style.setProperty('--mid-x',(x*.8)+'vw');piece.style.setProperty('--to-x',x+'vw');
   piece.style.setProperty('--from-turn',(-25+i*5)+'deg');piece.style.setProperty('--mid-turn',(turn*.65)+'deg');piece.style.setProperty('--to-turn',turn+'deg');
   piece.style.setProperty('--duration',(2050+(i%4)*100)+'ms');piece.style.setProperty('--delay',((i%4)*95)+'ms');
   field.appendChild(piece);
  });
 }
 function show(orderId,callback){
  const d=dialog();
  if(!orderId||seen.has(orderId)||!d||typeof d.showModal!=='function'){safely(callback);return false;}
  try{
   clearTimeout(timer);onDone=callback;if(!d.open)d.showModal();launch();
   seen.add(orderId);try{sessionStorage.setItem(storageKey,JSON.stringify([...seen].slice(-100)));}catch{}
   timer=setTimeout(close,3600);
   return true;
  }catch{if(d.open)d.close();else finish();return false;}
 }
 const d=dialog();
 if(d){d.addEventListener('close',()=>{if(!d.open)finish();});d.addEventListener('click',e=>{if(e.target===d)close();});document.getElementById('celebrationTrackButton')?.addEventListener('click',close);}
 return {show,close};
})();
