/* Release 68 — app shell for the kitchen/admin app (billing-app style):
   sidebar with brand, icons and counts · footer with Help & contact, who is signed in, Sign out ·
   top bar with the page title and clock · hamburger drawer on phones · Management is now “Settings” ·
   sign-in card with “Temporary waiter? Scan the waiter QR” · Settings organised into sections. */
'use strict';
(()=>{
const $=id=>document.getElementById(id),esc=v=>Cloud.esc(String(v??''));
const I={
 orders:'<path d="M9 5h6M9 3h6a1 1 0 0 1 1 1v1H8V4a1 1 0 0 1 1-1Z"/><path d="M8 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2M9 12h6M9 16h4"/>',
 bill:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
 list:'<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
 chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
 wallet:'<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2Z"/><circle cx="16" cy="14.5" r="1.2"/>',
 bell:'<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2Z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
 table:'<path d="M3 9h18M5 9v10M19 9v10M8 9l1-4h6l1 4"/>',
 phone:'<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18h2"/>',
 menu:'<path d="M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4V4Z"/><path d="M9 9h6M9 13h6"/>',
 box:'<path d="m3 7 9-4 9 4-9 4-9-4Z"/><path d="M3 7v10l9 4 9-4V7M12 11v10"/>',
 gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
 alert:'<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17h.01"/>',
 help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/>',
 shield:'<path d="M12 3 5 6v6c0 4 3 7.5 7 9 4-1.5 7-5 7-9V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
 user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
 logout:'<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11"/>',
 scan:'<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10"/>',
 call:'<path d="M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/>',
 wa:'<path d="M4 20l1.3-4A8 8 0 1 1 8 18.8L4 20Z"/><path d="M9 9.5c.5 2 2.5 4 4.5 4.5l1-1.2 1.8.8-.4 1.6c-3.4.2-7-3.4-6.8-6.8l1.6-.4.8 1.8L9 9.5Z"/>',
 mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
 globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'
};
const ic=(n,c='')=>`<svg class="ui-icon s68-ic ${c}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]||''}</svg>`;
const NAV=[['Live','orders','Orders','activeOrdersBadge'],['Billing','bill','Billing'],['History','list','Records'],['Dashboard','chart','Dashboard'],['Expenses','wallet','Expenses'],['Requests','bell','Requests','requestsBadge'],['Tables','table','Tables'],['Menu','menu','Menu'],['Stocks','box','Stocks'],['Devices','phone','Customer devices'],['Notifications','alert','Notifications','securityUnread'],['Management','gear','Settings']];
const ROLE_LABEL={admin:'Admin',manager:'Manager',cashier:'Cashier',waiter:'Waiter'};
let me=null;

function buildNav(){
 const nav=$('managerNav');if(!nav||nav.dataset.shell68)return;nav.dataset.shell68='1';
 // Expenses tab + section
 if(!$('tabExpensesBtn')){const b=document.createElement('button');b.className='nav-tab-btn';b.id='tabExpensesBtn';b.type='button';b.setAttribute('onclick',"switchTab('expenses')");$('tabDashboardBtn')?.after(b);}
 if(!$('expensesSection')){const s=document.createElement('section');s.id='expensesSection';s.hidden=true;s.style.display='none';$('dashboardSection')?.after(s);}
 for(const [key,icon,label,badge] of NAV){
  const b=$('tab'+key+'Btn');if(!b)continue;const count=badge?$(badge):null;if(count)count.remove();
  b.innerHTML=`${ic(icon)}<span class="nav-label68">${label}</span>`;if(count){count.className='nav-count68';b.append(count);}
  b.title=label;
 }
 const brand=document.createElement('div');brand.className='side-brand68';
 brand.innerHTML=`<span class="logo-chip68"><img class="brand-logo" src="yummy-momo-logo.webp?v=yummy-44" alt=""></span><span class="staff-brand side-name68"><strong>${esc(Cloud.cfg.restaurantName||'Restaurant')}</strong><small id="sideTagline68">${esc(Cloud.cfg.tagline||'')}</small></span>`;
 nav.prepend(brand);
 // Group only the existing navigation buttons. Keep their IDs and native onclick
 // handlers untouched so permissions and tab state remain authoritative.
 const GROUPS=[
  ['Operations',['Live','Billing','History','Requests','Tables']],
  ['Business',['Dashboard','Expenses','Menu','Stocks']],
  ['Administration',['Devices','Notifications','Management']]
 ];
 for(const [name,keys] of GROUPS){
  const group=document.createElement('div');group.className='side-group71';
  group.setAttribute('role','group');group.setAttribute('aria-label',name);
  const label=document.createElement('p');label.className='side-label68';label.textContent=name;
  group.append(label);
  keys.forEach(key=>{const btn=$('tab'+key+'Btn');if(btn)group.append(btn);});
  nav.append(group);
 }
 function syncGroups(){
  for(const group of nav.querySelectorAll('.side-group71')){
   const buttons=[...group.querySelectorAll('.nav-tab-btn')];
   const visible=buttons.some(b=>!b.hidden&&!b.classList.contains('access-off')&&getComputedStyle(b).display!=='none');
   if(group.hidden!==!visible)group.hidden=!visible;
  }
 }
 // Role permissions arrive asynchronously; keep empty groups out of the sidebar.
 new MutationObserver(m=>{if(m.some(x=>x.target.classList?.contains('nav-tab-btn')))syncGroups();})
   .observe(nav,{subtree:true,attributes:true,attributeFilter:['class','hidden']});
 queueMicrotask(syncGroups);
 const foot=document.createElement('div');foot.className='side-foot68';
 foot.innerHTML=`<button type="button" class="side-btn68" data-help68>${ic('help')}<span>Help & contact</span></button>
  <div class="who68">${ic('user','who-ic68')}<span><b id="whoName68">Signed in</b><small id="whoRole68"></small></span></div>
  <button type="button" class="side-btn68" id="signOut68">${ic('logout')}<span>Sign out</span></button>`;
 nav.append(foot);
 $('signOut68').onclick=()=>{if(confirm('Sign out of this device?'))signOutStaff();};
 const mh=document.querySelector('#managementSection > h2');if(mh)mh.textContent='Settings';
}
function paintWho(){
 const r=typeof staffRole!=='undefined'?staffRole:null;
 const ic2=document.querySelector('.who68 .s68-ic');if(ic2)ic2.outerHTML=ic(r==='admin'?'shield':'user','who-ic68');
 if($('whoName68'))$('whoName68').textContent=me?.name||ROLE_LABEL[r]||'Signed in';
 if($('whoRole68'))$('whoRole68').textContent=(ROLE_LABEL[r]||'')+(me?.email?' · '+me.email:'');
 const acc=$('staffAccountRole');if(acc&&r)acc.textContent=ROLE_LABEL[r]||acc.textContent;
}
function paintBrand(){
 const s=window.Custom48?.get?.()||{};
 if($('sideTagline68'))$('sideTagline68').textContent=s.tagline||'';
}
function paintTitle(tab){
 const h=document.querySelector('body.staff-site>header h1');if(!h)return;
 const key=tab||(typeof currentTab!=='undefined'?currentTab:'live');
 const row=NAV.find(n=>n[0].toLowerCase()===key);h.textContent=row?row[2]:'Kitchen';
 document.body.dataset.tab68=key;
}
function clock(){
 let c=$('clock68');const host=document.querySelector('.staff-header-actions');if(!host)return;
 if(!c){c=document.createElement('span');c.id='clock68';c.className='clock68';host.prepend(c);}
 c.textContent=new Date().toLocaleString('en-IN',{weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});
}

/* ---------- Help & contact ---------- */
function help(){
 const s=window.Custom48?.get?.()||{},sup=s.support68||{},tel=p=>String(p||'').replace(/[^\d+]/g,''),wa=String(sup.whatsapp||'').replace(/\D/g,'');
 let d=$('help68');if(!d){d=document.createElement('dialog');d.id='help68';d.className='help68';document.body.append(d);}
 const has=sup.name||sup.phone||wa||sup.email||sup.website;
 d.innerHTML=`<div class="help68-head"><h2>Help & contact</h2><button type="button" class="secondary-btn help68-x" aria-label="Close" data-close68>×</button></div>
 <div class="help68-grid"><section class="help68-card help68-support"><h3>System support</h3>${sup.name?`<p class="help68-name">${esc(sup.name)}</p>`:''}${sup.phone?`<p>Mob no: <b>${esc(sup.phone)}</b></p>`:''}
  <div class="help68-actions">${sup.phone?`<a class="primary-btn" href="tel:${esc(tel(sup.phone))}">${ic('call')} Call</a>`:''}${wa?`<a class="secondary-btn" href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener">${ic('wa')} WhatsApp</a>`:''}${sup.email?`<a class="secondary-btn" href="mailto:${esc(sup.email)}">${ic('mail')} ${esc(sup.email)}</a>`:''}${sup.website?`<a class="secondary-btn" href="${esc(sup.website)}" target="_blank" rel="noopener">${ic('globe')} Website</a>`:''}</div>
  ${sup.note?`<p class="hint">${esc(sup.note)}</p>`:''}${has?'':`<p class="hint">Support details have not been added yet.${typeof staffRole!=='undefined'&&staffRole==='admin'?' Add them in Settings → Help & contact.':''}</p>`}</section>
  <section class="help68-card"><h3>${esc(s.name||'Restaurant')} contact</h3><p class="hint">Phone, address and timings saved by the admin.</p><button type="button" class="secondary-btn" data-contact68>Open restaurant contact</button></section>
  <section class="help68-card help68-wide"><h3>Keyboard shortcuts on Billing</h3><dl class="help68-keys"><dt><kbd>F2</kbd></dt><dd>Search a dish</dd><dt><kbd>Enter</kbd></dt><dd>Add the first result</dd><dt><kbd>F8</kbd></dt><dd>Save bill</dd><dt><kbd>F9</kbd></dt><dd>Save and print</dd><dt><kbd>Alt</kbd>+<kbd>X</kbd></dt><dd>Item not on the menu</dd><dt><kbd>Alt</kbd>+<kbd>N</kbd></dt><dd>Clear the bill</dd></dl></section></div>`;
 d.showModal();
}
document.addEventListener('click',e=>{
 if(e.target.closest('[data-help68]')){help();return;}
 if(e.target.closest('[data-close68]')){e.target.closest('dialog')?.close();return;}
 if(e.target.closest('[data-contact68]')){$('help68')?.close();(typeof YummyContact!=="undefined")&&YummyContact.open();}
});

/* ---------- Sign-in card ---------- */
function loginCard(){
 const p=$('loginPanel');if(!p||p.dataset.shell68)return;p.dataset.shell68='1';
 const head=document.createElement('div');head.className='auth-brand68';
 head.innerHTML=`<span class="logo-chip68 logo-chip68-lg"><img class="brand-logo" src="yummy-momo-logo.webp?v=yummy-44" alt=""></span><p class="staff-brand"><strong>${esc(Cloud.cfg.restaurantName||'Restaurant')}</strong></p>`;
 p.prepend(head);
 const t=$('loginTitle');if(t)t.textContent='Sign in';
 const m=p.querySelector('p.muted');if(m)m.textContent='Admin, manager, cashier and waiter — use the email and password you were given.';
 const tw=document.createElement('div');tw.className='temp-waiter68';tw.id='tempWaiterEntry68';
 tw.innerHTML=`<p class="waiter-divider66">or</p><a class="secondary-btn temp-btn68" href="waiter.html?temp=1">${ic('scan')}<span>Temporary waiter? Scan the waiter QR</span></a><p class="hint">For a one-shift waiter without an email login. A manager or cashier shows the QR from Settings.</p>`;
 $('loginStatus')?.after(tw);
 const f=document.createElement('p');f.className='auth-foot68';f.innerHTML=`<button type="button" class="linkish68" data-help68>Help & contact</button>`;p.append(f);
 const s=window.Custom48?.get?.();tw.hidden=s?.tempWaiterLogin68===false;
}
document.addEventListener('custom48:applied',()=>{paintBrand();const tw=$('tempWaiterEntry68');if(tw)tw.hidden=window.Custom48.get()?.tempWaiterLogin68===false;});

/* ---------- Settings ----------
   Owned by settings69.js: a declarative section list driving a rail and one
   pane. The old version guessed sections with a regex over heading text. */
function organiseSettings(){
 window.Settings69?.build();      // make sure the rail and pane exist
 window.Release69?.mount(false);  // add the Release 69 panels into the pane
 window.Settings69?.refresh();    // then sort everything into its section
}

/* ---------- Stocks filter as chips ---------- */
function stockChips(){
 const sel=$('stockFilter');if(!sel||$('stockChips68'))return;
 if(!sel.value||sel.value==='all')sel.value='tracked';
 const bar=document.createElement('div');bar.id='stockChips68';bar.className='chips68';bar.setAttribute('role','group');bar.setAttribute('aria-label','Show');
 const paint=()=>{bar.innerHTML=[...sel.options].map(o=>`<button type="button" data-sv="${o.value}" aria-pressed="${o.value===sel.value}">${esc(o.textContent)}</button>`).join('');};paint();
 bar.onclick=e=>{const b=e.target.closest('[data-sv]');if(!b)return;sel.value=b.dataset.sv;paint();if(typeof renderStocks==='function')renderStocks();};
 sel.closest('label')?.classList.add('sr-only68');(sel.closest('.stock-filters')||sel.closest('label')?.parentElement)?.before(bar);
}

/* ---------- wiring ---------- */
function onTab(tab){
 paintTitle(tab);
 if(tab==='management'){setTimeout(()=>{organiseSettings();window.Access68?.openSettings();},60);}
}
if(typeof switchTab==='function'){
 const original=window.switchTab;
 window.switchTab=function(tab){const out=original.apply(this,arguments);onTab(typeof currentTab!=='undefined'?currentTab:tab);return out;};
}
async function whoAmI(){
 try{me=await Cloud.rpc('restaurant_staff_heartbeat68',{},true);}catch{me=null;}
 paintWho();
}
let started=false;
function onSignedIn(){
 if(started)return;started=true;
 buildNav();paintBrand();paintWho();whoAmI();window.Access68?.apply();paintTitle();
 const r=typeof staffRole!=='undefined'?staffRole:null;if(r&&r!=='admin'&&window.Access68&&!Access68.tabAllowed(currentTab))switchTab(Access68.firstTab());
}
buildNav();loginCard();stockChips();clock();setInterval(clock,20000);
// enterStaff() shows #staffMain when sign-in finishes.
const main=$('staffMain');
if(main){const check=()=>{if(!main.hidden&&typeof staffRole!=='undefined'&&staffRole)onSignedIn();else if(main.hidden)started=false;};new MutationObserver(check).observe(main,{attributes:true,attributeFilter:['hidden']});check();}
window.Shell68={help,paintTitle,organiseSettings};
})();
