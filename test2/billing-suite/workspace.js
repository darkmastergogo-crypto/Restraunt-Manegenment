/* One staff shell. The internal host preserves restaurant-only controls and alerts. */
'use strict';
const RestaurantWorkspace=(()=>{
 const sections={kitchen:'live',requests:'requests',tables:'tables',devices:'devices',notifications:'notifications',itemDetails:'menu',alerts:'alerts',restaurantReports:'restaurantReports',dishSales:'dishSales',stockRules:'stockRules'};
 let host=null,kernel=null,ready=false,wanted='live',panels=new Set(),pending=new Map(),seq=0,alerts=new Map();
 const tokens=['bg','surface','surface-2','line','line-2','ink','ink-2','muted','primary','primary-ink','primary-soft','primary-hover','green','green-soft','red','red-soft','amber','amber-soft','radius','radius-sm','font','mono'];
 function theme(frame){if(!frame?.contentWindow)return;const css=getComputedStyle(document.documentElement);const vars=Object.fromEntries(tokens.map(k=>[k,css.getPropertyValue('--'+k).trim()]));send(frame,{type:'workspace:theme',vars});}
 function src(section,panel){return '../restaurant-engine.html?embedded=1&restaurant=1'+(panel?'&panel=1':'')+'&section='+encodeURIComponent(section)+'#'+section;}
 function create(section,panel=false){const f=document.createElement('iframe');f.className='workspace-engine';f.title=panel?'Restaurant settings':'Restaurant operations';f.setAttribute('allow','autoplay; clipboard-write');f.addEventListener('load',()=>theme(f));if(window.WORKSPACE_PREVIEW_ENGINE_HTML)f.srcdoc=window.WORKSPACE_PREVIEW_ENGINE_HTML;else f.src=src(section,panel);f.dataset.section=section;f.dataset.panel=String(panel);return f;}
 function start(){if(kernel?.isConnected)return;ready=false;host=document.createElement('section');host.id='restaurantWorkspaceHost';host.className='workspace-host';host.hidden=true;kernel=create('live');host.append(kernel);document.querySelector('.main')?.append(host);}
 function send(frame,message){frame?.contentWindow?.postMessage(message,window.WORKSPACE_PREVIEW_ENGINE_HTML?'*':location.origin);}
 function navigate(section){wanted=section;send(kernel,{type:'workspace:section',section,active:true});}
 function mountSection(view,key){start();view.hidden=true;host.hidden=false;host.dataset.route=key;kernel.title={kitchen:'Kitchen orders',requests:'Customer requests',tables:'Tables and QR codes',devices:'Customer devices',notifications:'Notifications',itemDetails:'Menu photos and portions',alerts:'Order and request alerts',restaurantReports:'Restaurant reports',dishSales:'Dish sales',stockRules:'Stock rules'}[key]||'Restaurant operations';navigate(sections[key]||'live');}
 function mountPanel(root,section='management'){
  const wrap=document.createElement('div');wrap.className='workspace-panel';wrap.innerHTML='<p class="workspace-panel-loading" role="status">Loading restaurant controls…</p>';
  const frame=create(section,true);wrap.append(frame);root.replaceChildren(wrap);panels.add(frame);
  const ob=new MutationObserver(()=>{if(!frame.isConnected){panels.delete(frame);ob.disconnect();}});ob.observe(document.body,{childList:true,subtree:true});return wrap;
 }
 function view(key){return {mount:node=>mountSection(node,key),unmount:()=>{if(host)host.hidden=true;const node=document.getElementById('view');if(node)node.hidden=false;}};}
 function beforeRoute(){if(host)host.hidden=true;send(kernel,{type:'workspace:active',active:false});const node=document.getElementById('view');if(node)node.hidden=false;for(const f of [...panels])if(!f.isConnected)panels.delete(f);}
 function syncTheme(){theme(kernel);for(const f of panels)theme(f);}
 async function prepareSignOut(){if(!kernel||!ready)return;const id='cleanup-'+(++seq);await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('Restaurant alert cleanup timed out. Please retry sign out.'));},15000);pending.set(id,{resolve,reject,timer});send(kernel,{type:'workspace:cleanup',id});});}
 function stop(){for(const d of alerts.values())d.close();alerts.clear();host?.remove();host=null;kernel=null;ready=false;for(const f of panels)f.closest('.workspace-panel')?.remove();panels.clear();for(const p of pending.values()){clearTimeout(p.timer);p.resolve();}pending.clear();}
 addEventListener('message',event=>{
  if(event.origin!==location.origin&&!(window.WORKSPACE_PREVIEW_ENGINE_HTML&&event.origin==='null'))return;const frame=event.source===kernel?.contentWindow?kernel:[...panels].find(f=>f.contentWindow===event.source);if(!frame)return;
  const d=event.data||{};
  if(d.type==='workspace:ready'){if(frame===kernel){ready=true;send(frame,{type:'workspace:section',section:wanted,active:!host.hidden});}else{send(frame,{type:'workspace:section',section:frame.dataset.section,panel:true,active:true});frame.closest('.workspace-panel')?.querySelector('.workspace-panel-loading')?.remove();}theme(frame);}
  if(d.type==='workspace:navigate'&&typeof d.route==='string'&&/^[a-zA-Z]+$/.test(d.route))location.hash='#/'+d.route;
  if(d.type==='workspace:receipt'&&d.order){const order=Cloud.orderToBill?Cloud.orderToBill(d.order):d.order;Records.openBill(order);}
  if(d.type==='workspace:settings-changed')void App.refreshMe(true).catch(e=>toast(e.message,'error'));
  if(d.type==='workspace:session-ended'){stop();Store.me=null;App.loginView('Your session ended. Sign in again.');}
  if(d.type==='workspace:cleanup-result'){const p=pending.get(d.id);if(p){clearTimeout(p.timer);pending.delete(d.id);d.error?p.reject(Error(d.error)):p.resolve();}}
  if(d.type==='workspace:height'&&frame!==kernel){const height=Number(d.height);if(Number.isFinite(height))frame.style.height=Math.min(18000,Math.max(420,height))+'px';}
  if(d.type==='workspace:alert'&&frame===kernel&&['order','request'].includes(d.kind)){
   if(!d.open){alerts.get(d.kind)?.close();alerts.delete(d.kind);return;}
   if(!host.hidden||alerts.has(d.kind))return;
   const dialog=modal(d.title||'Restaurant alert','<p>'+esc(d.message||'A new request needs attention.')+'</p><p class="hint">These controls silence the alert on this device. The order or request stays pending.</p><div class="modal-actions"><button class="btn" data-alert-snooze>Snooze 2 min</button><button class="btn btn-primary" data-alert-dismiss>Dismiss</button></div>',{size:'modal-sm'});
   alerts.set(d.kind,dialog);let action='dismiss';
   dialog.querySelector('[data-alert-snooze]').onclick=()=>{action='snooze';dialog.close();};
   dialog.querySelector('[data-alert-dismiss]').onclick=()=>dialog.close();
   dialog.addEventListener('close',()=>{alerts.delete(d.kind);send(kernel,{type:'workspace:alert-action',kind:d.kind,action});},{once:true});
  }
 });
 document.addEventListener('setup:changed',syncTheme);
 return {start,stop,beforeRoute,view,mountPanel,syncTheme,prepareSignOut};
})();
