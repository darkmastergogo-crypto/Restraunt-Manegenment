/* Release 68 — one app for every role.
   · Feature switches: admin hides/unhides every feature per role (manager, cashier, waiter)
     and decides which features a manager may switch for cashiers and waiters.
   · Staff & logins: admin adds managers/cashiers/waiters, managers add cashiers/waiters.
   · Temporary waiters (waiter QR): list, extend or end sessions.
   · Online presence heartbeat.
   Needs SUPABASE/“4-RUN-THIS-NOW (update 68).sql”. Loaded before kitchen.js. */
'use strict';
const Access68=(()=>{
 const NEED_SQL='Run SUPABASE/“4-RUN-THIS-NOW (update 68).sql” in Supabase, then refresh this page.';
 const missing=e=>/restaurant_(staff68|access68|temp_waiters68|staff_heartbeat68|can68)|schema cache|PGRST202|Could not find the function/i.test(e?.message||'');
 // [key, label, help, group]
 const FEATURES=[
  ['live','Pending orders','See and work on incoming orders','Screens'],
  ['billing','Billing (counter bills)','Make bills at the counter','Screens'],
  ['members','Members','Membership plans, renewals and attendance','Screens'],
  ['history','Order records','Past orders, reprint bills','Screens'],
  ['dashboard','Dashboard','Sales, profit and best sellers','Screens'],
  ['expenses','Expenses','See and add expenses','Screens'],
  ['requests','Requests','Waiter calls and song requests','Screens'],
  ['tables','Tables','Table status and table QR codes','Screens'],
  ['menu','Menu','Dish availability and prices','Screens'],
  ['stocks','Stocks','Dish stock levels','Screens'],
  ['notifications','Notifications','Low stock and security alerts','Screens'],
  ['devices','Customer devices','See and block customer phones','Screens'],
  ['settings','Settings','Open the Settings screen','Screens'],
  ['orderAccept','Accept orders','“Accept order” button','Actions'],
  ['orderServe','Mark served','“Mark served” button','Actions'],
  ['orderReject','Reject orders','“Reject / unavailable” button','Actions'],
  ['recordPayment','Change payment in records','Set Cash / UPI / Card on a record','Actions'],
  ['expensesManage','Edit & delete expenses','Expense types and auto expenses','Actions'],
  ['callWaiter','Call waiter button','Header “Call waiter”','Actions'],
  ['staff','Staff & logins','Add cashier and waiter logins','Admin powers'],
  ['tempWaiter','Temporary waiters','Waiter QR and their sessions','Admin powers'],
  ['themes','Change theme','Pick the app theme','Admin powers']
 ];
 const ON=k=>true;
 const DEF={roles:{
  manager:Object.fromEntries(FEATURES.map(([k])=>[k,k!=='themes'])),
  cashier:Object.fromEntries(FEATURES.map(([k])=>[k,['live','billing','members','history','requests','tables','tempWaiter','callWaiter','orderAccept','orderServe','recordPayment'].includes(k)])),
  waiter:Object.fromEntries(FEATURES.map(([k])=>[k,['live','requests','tables','callWaiter','orderAccept','orderServe'].includes(k)]))
 },grant:Object.fromEntries(FEATURES.map(([k])=>[k,!['expensesManage','devices','notifications','settings','staff','themes'].includes(k)]))};
 const TAB_FEATURE={live:'live',billing:'billing',members:'members',history:'history',dashboard:'dashboard',expenses:'expenses',requests:'requests',tables:'tables',menu:'menu',stocks:'stocks',management:'settings',devices:'devices',notifications:'notifications'};
 const $=id=>document.getElementById(id),esc=v=>Cloud.esc(String(v??''));
 const role=()=>typeof staffRole!=='undefined'?staffRole:null;
 const stored=()=>window.Custom48?.get()?.access68||{};
 function can(feature,r=role()){
  if(!r)return false;if(r==='admin')return true;
  const s=stored(),v=s.roles?.[r]?.[feature];
  return typeof v==='boolean'?v:!!DEF.roles[r]?.[feature];
 }
 function grantable(feature){const v=stored().grant?.[feature];return typeof v==='boolean'?v:!!DEF.grant[feature];}
 function tabAllowed(tab){const f=TAB_FEATURE[tab];if(!f)return true;if(tab==='management')return can('settings')||can('staff')||can('tempWaiter')||can('themes');return can(f);}
 function firstTab(){return ['live','billing','requests','history','tables','dashboard','expenses','menu','stocks','management'].find(t=>tabAllowed(t))||'live';}

 /* ---------- visibility ---------- */
 function apply(){
  const r=role();if(!r)return;
  document.body.dataset.role68=r;
  for(const [tab,f] of Object.entries(TAB_FEATURE)){const b=$('tab'+tab[0].toUpperCase()+tab.slice(1)+'Btn');if(b)b.classList.toggle('access-off',!tabAllowed(tab));}
  for(const f of ['orderAccept','orderServe','orderReject','recordPayment','callWaiter','expensesManage'])document.body.classList.toggle('no-'+f,!can(f));
  if(typeof currentTab!=='undefined'&&!tabAllowed(currentTab)&&typeof switchTab==='function'){const t=firstTab();if(t!==currentTab)switchTab(t);}
  paintSettingsPanels();
 }

 /* ---------- Settings panels: permissions, staff, temporary waiters ---------- */
 function paintSettingsPanels(){
  const r=role();
  show($('staffPanel68'),r==='admin'||r==='manager'&&can('staff'));
  show($('accessPanel68'),r==='admin'||r==='manager');
  show($('tempWaiters68'),['admin','manager','cashier'].includes(r)&&can('tempWaiter'));
  show($('supportPanel68'),r==='admin');
  // Old update-66 waiter accounts panel is replaced by Staff & logins.
  show($('waiterAccounts66'),false);
  // Non-admins only see the Settings panels they are allowed to use.
  if(r!=='admin'){
   const keep=new Set(['staffPanel68','accessPanel68','tempWaiters68','waiterAccessPanel','themeStudio']);
   for(const g of document.querySelectorAll('#managementSection > details.management48-group,#managementSection > section.panel')){
    const panel=g.matches('section')?g:g.querySelector(':scope > section, :scope > form, :scope > div');
    const id=panel?.id||'';
    if(id==='themeStudio'||g.querySelector('#categoryList'))continue;
    if(!keep.has(id))g.hidden=true;
   }
   show($('waiterAccessPanel'),can('tempWaiter'));show($('themeStudio'),can('themes'));
  }
 }
 function show(el,v){if(!el)return;el.hidden=!v;const g=el.closest('details.management48-group');if(g)g.hidden=!v;}

 let accessBusy=false;
 function renderAccess(){
  const root=$('accessPanel68');if(!root||root.hidden)return;
  const r=role(),admin=r==='admin',cols=admin?['manager','cashier','waiter']:['cashier','waiter'];
  const groups=[...new Set(FEATURES.map(f=>f[3]))];
  root.innerHTML=`<div class="acc-head"><div><h3>Who can see what</h3><p class="hint">${admin?'Switch any feature on or off for each role. The last column decides whether managers may change it for cashiers and waiters. Admins always see everything.':'Switch features on or off for cashiers and waiters. Greyed switches are controlled by the admin.'}</p></div><p class="hint" id="accessStatus68" role="status"></p></div>
  <div class="acc-table" role="table" aria-label="Feature access" style="--acc-cols:${cols.length+(admin?1:0)}"><div class="acc-row acc-th" role="row"><span role="columnheader">Feature</span>${cols.map(c=>`<span role="columnheader">${c[0].toUpperCase()+c.slice(1)}</span>`).join('')}${admin?'<span role="columnheader" title="Manager may change this for cashiers and waiters">Manager can give</span>':''}</div>
  ${groups.map(g=>`<div class="acc-group" role="row"><span>${esc(g)}</span></div>`+FEATURES.filter(f=>f[3]===g).map(([k,l,h])=>{
    const cells=cols.map(c=>{const on=can(k,c),locked=!admin&&!grantable(k);return `<span role="cell"><button type="button" class="acc-switch" role="switch" aria-checked="${on}" aria-label="${esc(l)} for ${c}" data-acc-role="${c}" data-acc-feature="${k}" ${locked?'disabled':''}><i></i></button></span>`;}).join('');
    const grant=admin?`<span role="cell"><button type="button" class="acc-switch acc-grant" role="switch" aria-checked="${grantable(k)}" aria-label="Manager can give ${esc(l)}" data-acc-grant="${k}"><i></i></button></span>`:'';
    return `<div class="acc-row" role="row"><span role="cell"><b>${esc(l)}</b><small>${esc(h)}</small></span>${cells}${grant}</div>`;}).join('')).join('')}</div>`;
 }
 document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-acc-feature],[data-acc-grant]');if(!b||accessBusy)return;
  const grant=b.dataset.accGrant,next=b.getAttribute('aria-checked')!=='true';accessBusy=true;b.setAttribute('aria-checked',String(next));
  const st=$('accessStatus68');if(st)st.textContent='Saving…';
  try{
   await Cloud.rpc('restaurant_access68',grant?{p_role:null,p_feature:grant,p_value:null,p_grant:next}:{p_role:b.dataset.accRole,p_feature:b.dataset.accFeature,p_value:next,p_grant:null},true);
   await window.Custom48?.sync(true);if(st)st.textContent='Saved. Everyone gets the change within a few seconds.';apply();renderAccess();
  }catch(err){b.setAttribute('aria-checked',String(!next));if(st)st.textContent=missing(err)?NEED_SQL:err.message;}
  finally{accessBusy=false;}
 });

 /* ---------- staff & logins ---------- */
 const ROLE_LABEL={admin:'Admin',manager:'Manager',cashier:'Cashier',waiter:'Waiter'};
 const ago=iso=>{if(!iso)return 'never';const s=(Date.now()-Date.parse(iso))/1000;if(s<60)return 'just now';if(s<3600)return Math.round(s/60)+' min ago';if(s<86400)return Math.round(s/3600)+' h ago';return new Date(iso).toLocaleDateString([],{day:'numeric',month:'short'});};
 let staffData=null,staffBusy=false,staffTimer=null;
 function renderStaff(){
  const root=$('staffPanel68');if(!root||root.hidden)return;
  const d=staffData,canAdd=Array.isArray(d?.can_add)?d.can_add:(role()==='admin'?['manager','cashier','waiter']:['cashier','waiter']);
  if(!root.dataset.built){root.dataset.built='1';root.innerHTML=`<h3>Staff & logins</h3><p class="hint">Each person signs in to this same app with their own email and password. They only see what their role allows (see “Who can see what”).</p>
   <form id="staffForm68" class="st-form" autocomplete="off"><label>Name<input name="name" maxlength="40" placeholder="e.g. Ravi"></label><label>Email<input name="email" type="email" required maxlength="254" placeholder="ravi@example.com" autocomplete="off"></label><label>Password <small>8+ characters</small><input name="password" type="text" required minlength="8" maxlength="72" autocomplete="new-password" placeholder="New login only"></label><label>Role<select name="role" id="staffRole68"></select></label><button class="primary-btn" type="submit">+ Add staff</button></form>
   <p class="hint" id="staffStatus68" role="status"></p><div class="st-summary" id="staffSummary68"></div><div class="st-list" id="staffList68"><p class="hint">Loading…</p></div>`;}
  const sel=$('staffRole68');if(sel&&sel.dataset.sig!==canAdd.join()){sel.dataset.sig=canAdd.join();sel.innerHTML=canAdd.slice().reverse().map(r=>`<option value="${r}">${ROLE_LABEL[r]}</option>`).join('');}
  if(!d)return;
  const list=d.staff||[],online=list.filter(s=>s.online).length;
  $('staffSummary68').innerHTML=['manager','cashier','waiter'].map(r=>`<span class="wa-chip"><b>${list.filter(s=>s.role===r).length}</b> ${ROLE_LABEL[r].toLowerCase()}${list.filter(s=>s.role===r).length===1?'':'s'}</span>`).join('')+`<span class="wa-chip"><b>${online}</b> online now</span>`;
  $('staffList68').innerHTML=list.length?list.map(s=>`<article class="st-row${s.self?' is-self':''}" data-st="${esc(s.user_id)}" data-st-name="${esc(s.name)}"><span class="wa-avatar">${esc((s.name||'?').charAt(0).toUpperCase())}<i class="wa-dot ${s.online?'on':''}"></i></span>
   <div class="st-info"><strong>${esc(s.name)}${s.self?' <small>(you)</small>':''}</strong><span>${esc(s.email)}</span><span class="st-meta"><em class="st-role st-role-${esc(s.role)}">${ROLE_LABEL[s.role]||esc(s.role)}</em>${s.online?'<em class="wa-state on">Online now</em>':`<em class="wa-state">Last seen ${esc(ago(s.last_seen||s.last_sign_in))}</em>`}</span></div>
   ${s.editable?`<div class="st-actions"><select data-st-role aria-label="Role for ${esc(s.name)}">${canAdd.map(r=>`<option value="${r}"${r===s.role?' selected':''}>${ROLE_LABEL[r]}</option>`).join('')}</select><button type="button" class="secondary-btn" data-st-act="password">Password</button><button type="button" class="secondary-btn" data-st-act="rename">Rename</button><button type="button" class="danger-btn" data-st-act="remove">Remove</button></div>`:''}</article>`).join(''):'<p class="hint">No staff logins yet.</p>';
 }
 async function staffCall(action,args={}){
  try{staffData=await Cloud.rpc('restaurant_staff68',{p_action:action,p_email:args.email??null,p_password:args.password??null,p_name:args.name??null,p_role:args.role??null,p_user:args.user??null},true);renderStaff();return staffData;}
  catch(e){if(action==='list'){const l=$('staffList68');if(l)l.innerHTML=`<p class="hint">${esc(missing(e)?NEED_SQL:e.message)}</p>`;}throw e;}
 }
 document.addEventListener('submit',async e=>{
  if(e.target.id!=='staffForm68')return;e.preventDefault();if(staffBusy)return;const f=e.target,st=$('staffStatus68'),b=f.querySelector('button[type=submit]');staffBusy=true;b.disabled=true;st.textContent='Creating login…';
  try{await staffCall('add',{name:f.name.value.trim(),email:f.email.value.trim(),password:f.password.value,role:f.role.value});st.textContent=`Done. ${f.name.value.trim()||f.email.value.trim()} can sign in now with that email and password.`;f.reset();}
  catch(err){st.textContent=missing(err)?NEED_SQL:err.message;}finally{staffBusy=false;b.disabled=false;}
 });
 document.addEventListener('change',async e=>{
  const s=e.target.closest('[data-st-role]');if(!s)return;const row=s.closest('[data-st]'),st=$('staffStatus68');
  try{await staffCall('role',{user:row.dataset.st,role:s.value});st.textContent=`${row.dataset.stName} is now a ${ROLE_LABEL[s.value].toLowerCase()}.`;}catch(err){st.textContent=err.message;renderStaff();}
 });
 document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-st-act]');if(!b||staffBusy)return;const row=b.closest('[data-st]'),name=row.dataset.stName,act=b.dataset.stAct,st=$('staffStatus68');const args={user:row.dataset.st};
  if(act==='password'){const pw=prompt(`New password for ${name} (8 or more characters):`);if(!pw)return;if(pw.length<8){st.textContent='Password must be at least 8 characters.';return;}args.password=pw;}
  if(act==='rename'){const nm=prompt('Name shown on bills and in the app',name);if(!nm||!nm.trim())return;args.name=nm.trim();}
  if(act==='remove'&&!confirm(`Remove ${name}'s login? They are signed out and cannot sign in again. Their past orders and bills are kept.`))return;
  staffBusy=true;b.disabled=true;
  try{await staffCall(act,args);st.textContent={password:`Password changed for ${name}.`,rename:'Name updated.',remove:`${name}'s login was removed.`}[act];}
  catch(err){st.textContent=missing(err)?NEED_SQL:err.message;}finally{staffBusy=false;b.disabled=false;}
 });

 /* ---------- temporary waiters (waiter QR) ---------- */
 let tempData=null;
 function renderTemp(){
  const root=$('tempWaiters68');if(!root||root.hidden)return;
  if(!root.dataset.built){root.dataset.built='1';root.innerHTML=`<div class="acc-head"><div><h3>Temporary waiters</h3><p class="hint">People who signed in by scanning the waiter QR (for a shift, without an email login). Change how long each one stays signed in, or sign them out.</p></div><div class="toolbar"><button type="button" class="secondary-btn" data-tw="refresh">Refresh</button><button type="button" class="danger-btn" data-tw="end_all">Sign out all</button></div></div>${role()==='admin'?`<label class="perm-toggle tw-toggle68" role="switch" aria-checked="${window.Custom48?.get()?.tempWaiterLogin68!==false}" data-tw="login"><span>Temporary waiter button on the sign-in screen<small class="hint">Turn off to stop anyone from starting a QR waiter session.</small></span><i class="perm-switch" aria-hidden="true"></i></label>`:''}<p class="hint" id="tempStatus68" role="status"></p><div id="tempList68" class="st-list"><p class="hint">Loading…</p></div>`;}
  if(!tempData)return;
  const list=tempData.sessions||[];
  $('tempList68').innerHTML=list.length?list.map((s,i)=>{const left=Math.max(0,Date.parse(s.expires_at)-Date.now()),mins=Math.ceil(left/60e3),h=Math.floor(mins/60),m=mins%60,on=s.last_seen&&Date.now()-Date.parse(s.last_seen)<90e3;
   return `<article class="st-row" data-tw-id="${esc(s.id)}"><span class="wa-avatar">T${i+1}<i class="wa-dot ${on?'on':''}"></i></span><div class="st-info"><strong>Temporary waiter ${i+1}</strong><span>Signed in ${esc(new Date(s.issued_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}))}${s.device?' · device '+esc(s.device):''}</span><span class="st-meta"><em class="wa-state ${on?'on':''}">${h}h ${m}m left</em></span></div><div class="st-actions"><select data-tw-hours aria-label="New session length">${[1,2,3,4,6,8,10,12,18,24].map(x=>`<option value="${x}">${x} h from now</option>`).join('')}</select><button type="button" class="secondary-btn" data-tw="extend">Set time</button><button type="button" class="danger-btn" data-tw="end">Sign out</button></div></article>`;}).join(''):'<p class="hint">No temporary waiters are signed in.</p>';
 }
 async function tempCall(action,id=null,hours=null){
  try{tempData=await Cloud.rpc('restaurant_temp_waiters68',{p_action:action,p_id:id,p_hours:hours},true);renderTemp();}
  catch(e){const l=$('tempList68');if(l&&action==='list')l.innerHTML=`<p class="hint">${esc(missing(e)?NEED_SQL:e.message)}</p>`;else{const st=$('tempStatus68');if(st)st.textContent=e.message;}}
 }
 document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-tw]');if(!b)return;const act=b.dataset.tw,row=b.closest('[data-tw-id]'),st=$('tempStatus68');
  if(act==='refresh')return tempCall('list');
  if(act==='login'){const next=b.getAttribute('aria-checked')!=='true';b.setAttribute('aria-checked',String(next));try{await window.Custom48.patch({tempWaiterLogin68:next});if(st)st.textContent=next?'The sign-in screen shows the temporary waiter button.':'Temporary waiter sign-in is turned off.';}catch(err){b.setAttribute('aria-checked',String(!next));if(st)st.textContent=err.message;}return;}
  if(act==='end_all'&&!confirm('Sign out every temporary waiter now?'))return;
  if(act==='end'&&!confirm('Sign out this temporary waiter now?'))return;
  b.disabled=true;await tempCall(act,row?.dataset.twId||null,act==='extend'?Number(row.querySelector('[data-tw-hours]').value):null);b.disabled=false;
  if(st&&!st.textContent)st.textContent='Done.';
 });

 /* ---------- support contact (Help & contact) ---------- */
 function renderSupport(){
  const root=$('supportPanel68');if(!root||root.hidden||root.dataset.built)return;root.dataset.built='1';
  const s=window.Custom48?.get()?.support68||{};
  root.innerHTML=`<h3>Help & contact</h3><p class="hint">Shown to every staff member under “Help & contact” in the menu.</p><form id="supportForm68" class="st-form"><label>Support name<input name="name" maxlength="60" value="${esc(s.name||'')}" placeholder="e.g. Sumit"></label><label>Phone<input name="phone" maxlength="20" value="${esc(s.phone||'')}" inputmode="tel"></label><label>WhatsApp number<input name="whatsapp" maxlength="20" value="${esc(s.whatsapp||'')}" inputmode="tel"></label><label>Email<input name="email" type="email" maxlength="120" value="${esc(s.email||'')}"></label><label>Website<input name="website" type="url" maxlength="200" value="${esc(s.website||'')}" placeholder="https://"></label><label>Note<input name="note" maxlength="300" value="${esc(s.note||'')}" placeholder="e.g. Available 10am–8pm"></label><button class="primary-btn" type="submit">Save contact</button></form><p class="hint" id="supportStatus68" role="status"></p>`;
 }
 document.addEventListener('submit',async e=>{
  if(e.target.id!=='supportForm68')return;e.preventDefault();const f=e.target,st=$('supportStatus68');
  const support68=Object.fromEntries(['name','phone','whatsapp','email','website','note'].map(k=>[k,f[k].value.trim()]));
  st.textContent='Saving…';try{await window.Custom48.patch({support68});st.textContent='Saved.';}catch(err){st.textContent=err.message;}
 });

 /* ---------- wiring ---------- */
 function openSettings(){apply();renderAccess();renderStaff();renderSupport();if(!$('staffPanel68')?.hidden)staffCall('list').catch(()=>{});if(!$('tempWaiters68')?.hidden)tempCall('list');
  clearInterval(staffTimer);staffTimer=setInterval(()=>{if(typeof currentTab==='undefined'||currentTab!=='management'||document.hidden){clearInterval(staffTimer);return;}if(!$('staffPanel68')?.hidden)staffCall('list').catch(()=>{});if(!$('tempWaiters68')?.hidden)tempCall('list');},20000);}
 // presence
 setInterval(()=>{if(typeof loggedIn!=='undefined'&&loggedIn&&!document.hidden)Cloud.rpc('restaurant_staff_heartbeat68',{},true).catch(()=>{});},30000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&typeof loggedIn!=='undefined'&&loggedIn)Cloud.rpc('restaurant_staff_heartbeat68',{},true).catch(()=>{});});
 document.addEventListener('custom48:applied',()=>{apply();if(typeof currentTab!=='undefined'&&currentTab==='management')renderAccess();});
 return {can,tabAllowed,firstTab,apply,openSettings,FEATURES,role,heartbeat:()=>Cloud.rpc('restaurant_staff_heartbeat68',{},true).catch(()=>{})};
})();

window.Access68=Access68;
