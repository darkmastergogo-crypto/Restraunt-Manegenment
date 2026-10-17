/* Foreground doorbell and per-device silencing. Never marks a request handled. */
'use strict';
const RequestRing=(()=>{
 function mount({scope,button}){
  let enabled=false,context=null,nodes=[],rows=[],active=[],lastRing=0;
  const storage='RESTAURANT_REQUEST_RING_v1_'+scope;let state=Cloud.read(storage,{});if(!state||typeof state!=='object'||Array.isArray(state))state={};
  const dialog=document.createElement('dialog');dialog.className='request-ring '+(scope==='kitchen'?'ring-dark':'');dialog.setAttribute('aria-label','Waiter requested');
  dialog.innerHTML='<div class="ring-icon" aria-hidden="true">🔔</div><h2>Waiter requested</h2><p class="ring-locations"></p><p class="ring-help">Dismiss silences these calls on this device only. Snooze rings again in 2 minutes if still pending. Neither marks the request handled.</p><div class="ring-actions"><button type="button" data-ring-dismiss>Dismiss</button><button type="button" data-ring-snooze>Snooze 2 min</button></div>';
  document.body.append(dialog);
  function stop(){nodes.forEach(n=>{try{n.stop();n.disconnect();}catch{}});nodes=[];}
  function save(){const cutoff=Date.now()-86400000;state=Object.fromEntries(Object.entries(state).filter(([,v])=>v&&v.changed>cutoff).slice(-500));try{Cloud.write(storage,state);}catch{}}
  function silence(snooze){active.forEach(id=>state[id]={dismissed:!snooze,until:snooze?Date.now()+120000:0,changed:Date.now()});save();stop();if(dialog.open)dialog.close();active=[];}
  dialog.querySelector('[data-ring-dismiss]').addEventListener('click',()=>silence(false));dialog.querySelector('[data-ring-snooze]').addEventListener('click',()=>silence(true));dialog.addEventListener('cancel',e=>{e.preventDefault();silence(false);});
  function play(){
   if(!enabled||context?.state!=='running'||document.hidden)return;stop();const now=context.currentTime;
   // Three warm ding-dong pairs, replacing the old alternating alarm tone.
   for(let pair=0;pair<3;pair++)for(let note=0;note<2;note++){
    const start=now+pair*1.4+note*.42;
    for(const [harmonic,level] of [[1,.24],[2,.045]]){const oscillator=context.createOscillator(),gain=context.createGain();oscillator.type='sine';oscillator.frequency.value=(note?523.25:659.25)*harmonic;gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(level,start+.015);gain.gain.exponentialRampToValueAtTime(.0001,start+.8);oscillator.connect(gain);gain.connect(context.destination);oscillator.start(start);oscillator.stop(start+.82);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};nodes.push(oscillator);}
   }
   try{navigator.vibrate?.([250,150,250]);}catch{}
  }
  function tick(){
   const eligible=rows.filter(r=>r.status==='Pending'&&!state[r.id]?.dismissed&&Number(state[r.id]?.until||0)<=Date.now());
   if(!enabled||document.hidden||!eligible.length){stop();if(dialog.open)dialog.close();active=[];return;}
   const old=new Set(active);active=eligible.map(r=>r.id);dialog.querySelector('.ring-locations').textContent=eligible.map(r=>r.request_kind==='Reception'?'Reception':'Table '+r.table_number+(r.request_kind==='ReservedScan'?' · reserved table QR opened':'')).join(' • ');
   if(!dialog.open)dialog.showModal();if(Date.now()-lastRing>6000||active.some(id=>!old.has(id))){lastRing=Date.now();play();}
  }
  function update(next,allowed=true){rows=allowed?next:[];if(!allowed)disable();tick();}
  function disable(){enabled=false;stop();if(dialog.open)dialog.close();active=[];paint();}
  function paint(){button.textContent=enabled?'Request sound on · mute':'Enable request sound';button.setAttribute('aria-pressed',String(enabled));}
  async function toggle(){if(enabled){disable();return;}try{context ||= new (window.AudioContext||window.webkitAudioContext)();await context.resume();if(context.state!=='running')throw Error('Tap again to allow sound.');enabled=true;paint();lastRing=0;tick();}catch(e){button.textContent='Sound unavailable · tap to retry';}}
  setInterval(tick,1000);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&enabled&&context?.state==='suspended')context.resume().catch(()=>{});tick();});
  paint();return {update,toggle,disable,get enabled(){return enabled;},dialog};
 }
 return {mount};
})();
