/* Release 66 staff tools (kitchen.html):
   · Waiter accounts — manager/admin adds email + password, sees who is online, revokes/restores, resets password.
   · Manager permissions — admin decides if managers may add dishes and add/rename/delete/hide categories.
   · Categories — rename, hide/unhide from the customer menu, delete (dishes are moved, never deleted).
   · Theme studio refresh when Management opens.
   Needs SUPABASE/1-RUN-THIS-NOW (update 66).sql. */
'use strict';
(()=>{
const $=id=>document.getElementById(id),esc=v=>Cloud.esc(String(v??''));
const PERMS=[['addItem','Add new dishes','Shows “+ Add Item” in the manager’s Menu tab'],['categoryAdd','Add categories','Create new menu categories'],['categoryRename','Rename categories','Change a category’s name everywhere'],['categoryDelete','Delete categories','Remove a category (its dishes are moved, never deleted)'],['categoryHide','Hide / unhide categories','Hide a category from the customer menu without deleting it']];
const NEED_SQL='Run SUPABASE/“1-RUN-THIS-NOW (update 66).sql” in Supabase, then refresh this page.';
const missing=e=>/restaurant_(categories66|waiter_accounts66|add_menu_item66)|schema cache|PGRST202|Could not find the function/i.test(e?.message||'');
let can={add:false,rename:false,remove:false,hide:false,addItem:false},catList=[],waTimer=null,waBusy=false;
const role=()=>typeof staffRole!=='undefined'?staffRole:null;
const timeAgo=iso=>{if(!iso)return 'never';const s=Math.max(0,(Date.now()-Date.parse(iso))/1000);if(s<60)return 'just now';if(s<3600)return Math.round(s/60)+' min ago';if(s<86400)return Math.round(s/3600)+' h ago';return new Date(iso).toLocaleDateString([],{day:'numeric',month:'short'});};
const toast=m=>typeof showToast==='function'?showToast(m):alert(m);

/* ---------------- Categories ---------------- */
async function loadCategories66(){
 let data;
 try{data=await Cloud.rpc('restaurant_categories66',{p_action:'list',p_name:null,p_new_name:null,p_replacement:null},true);}
 catch(e){if(!missing(e))throw e;const legacy=await Cloud.rpc('restaurant_categories',{p_action:'list',p_name:null,p_replacement:null,p_item:null},true);data={categories:legacy.map(c=>({...c,hidden:false})),can:{add:role()==='admin',rename:false,remove:role()==='admin',hide:false,addItem:role()==='admin'},legacy:true};}
 catList=data.categories||[];can=data.can||can;
 Cloud.setCategories(catList.map(c=>c.name));
 const select=$('newItemCategory');if(select){const prev=select.value;select.replaceChildren(...catList.map(c=>new Option(c.name,c.name)));if(catList.some(c=>c.name===prev))select.value=prev;}
 renderCategories66(data.legacy);syncManagerUi();return catList.map(c=>({name:c.name,dish_count:c.dish_count}));
}
function renderCategories66(legacy){
 const root=$('categoryList');if(!root)return;
 const panel=root.closest('section'),form=$('categoryForm');
 const any=can.add||can.rename||can.remove||can.hide;
 if(panel&&role()==='manager')show(panel,any);
 if(form)form.hidden=!can.add;
 if(!any){root.innerHTML='';return;}
 const others=name=>catList.filter(x=>x.name!==name).map(x=>`<option value="${esc(x.name)}">${esc(x.name)}</option>`).join('');
 root.innerHTML=(legacy?`<p class="hint">${NEED_SQL} (Rename and hide need it.)</p>`:'')+`<div class="cat-admin-list">${catList.map(c=>`<article class="cat-admin-row${c.hidden?' is-hidden':''}" data-cat-row="${esc(c.name)}"><div><h4>${esc(c.name)}${c.hidden?'<span class="cat-hidden-pill">Hidden from menu</span>':''}</h4><p>${Number(c.dish_count)||0} ${Number(c.dish_count)===1?'dish':'dishes'}</p></div><div class="cat-admin-actions">${can.hide&&!legacy?`<button type="button" class="secondary-btn" data-cat66="${c.hidden?'show':'hide'}">${c.hidden?'Unhide':'Hide'}</button>`:''}${can.rename&&!legacy?`<button type="button" class="secondary-btn" data-cat66="rename">Rename</button>`:''}${can.remove&&catList.length>1?`<button type="button" class="danger-btn" data-cat66="remove">Delete</button>`:''}</div>${can.remove&&Number(c.dish_count)>0&&catList.length>1?`<label class="hint" style="grid-column:1/-1;display:flex;gap:8px;align-items:center;flex-wrap:wrap">If deleted, move its dishes to <select data-cat66-move>${others(c.name)}</select></label>`:''}</article>`).join('')}</div>`;
}
async function categoryAction(action,name,newName=null,replacement=null){
 const status=$('categoryStatus');if(status)status.textContent='Saving…';
 try{
  await Cloud.rpc('restaurant_categories66',{p_action:action,p_name:name,p_new_name:newName,p_replacement:replacement},true);
  await loadCategories66();await window.Custom48?.sync(true).catch(()=>{});
  if(typeof refreshCloud==='function')await refreshCloud().catch(()=>{});
  if(typeof renderAdminMenu==='function')renderAdminMenu();
  if(status)status.textContent={add:'Category added.',rename:'Category renamed everywhere.',remove:'Category deleted. Its dishes were moved.',hide:'Hidden from the customer menu.',show:'Visible on the customer menu again.'}[action];
 }catch(e){if(status)status.textContent=missing(e)?NEED_SQL:e.message;}
}
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-cat66]');if(!b)return;const row=b.closest('[data-cat-row]'),name=row.dataset.catRow,act=b.dataset.cat66;
 if(act==='rename'){const next=prompt('New name for “'+name+'”',name);if(next&&next.trim()&&next.trim()!==name)categoryAction('rename',name,next.trim());return;}
 if(act==='remove'){const move=row.querySelector('[data-cat66-move]')?.value||null;const cat=catList.find(c=>c.name===name);if(!confirm(`Delete category “${name}”?`+(cat&&cat.dish_count?`\n\nIts ${cat.dish_count} dishes will move to “${move}”. No dishes or bills are deleted.`:'')))return;categoryAction('remove',name,null,move);return;}
 categoryAction(act,name);
});
// Replace the old admin-only add/list with the permission-aware version.
window.addDishCategory=async function(e){e.preventDefault();const input=$('newCategoryName'),b=$('categoryAdd');b.disabled=true;try{await categoryAction('add',input.value.trim());input.value='';}finally{b.disabled=false;}};
window.loadStaffCategories=loadCategories66;

/* ---------------- Manager permissions (admin) ---------------- */
function renderPerms(){
 const root=$('managerPerms66');if(!root)return;if(role()!=='admin'){show(root,false);return;}
 const p=window.Custom48?.get().managerPerms||{};
 root.innerHTML=`<h3>What managers can do</h3><p class="hint">Turn a switch on to give every manager that power. Admins can always do everything.</p><div class="perm-grid">${PERMS.map(([k,l,h])=>`<button type="button" class="perm-toggle" role="switch" aria-checked="${p[k]===true}" data-perm66="${k}"><span>${esc(l)}<small class="hint">${esc(h)}</small></span><i class="perm-switch" aria-hidden="true"></i></button>`).join('')}</div><p class="hint" id="managerPermsStatus66" role="status"></p>`;
}
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-perm66]');if(!b||role()!=='admin')return;
 const current=structuredClone(window.Custom48.get().managerPerms||{}),k=b.dataset.perm66;current[k]=!(current[k]===true);
 b.setAttribute('aria-checked',String(current[k]));b.disabled=true;const st=$('managerPermsStatus66');
 try{await window.Custom48.patch({managerPerms:current});if(st)st.textContent='Saved. Managers see the change on their next refresh.';}
 catch(err){b.setAttribute('aria-checked',String(!current[k]));if(st)st.textContent='Could not save: '+err.message;}
 finally{b.disabled=false;}
});

/* ---------------- Manager "+ Add Item" ---------------- */
function syncManagerUi(){
 const panel=$('managerMenuPanel');if(!panel)return;
 let bar=$('managerAddItemBar66');
 if(role()==='manager'&&can.addItem){
  if(!bar){bar=document.createElement('div');bar.id='managerAddItemBar66';bar.className='page-tools';bar.innerHTML='<div><h3>Menu items</h3></div><button class="primary-btn" type="button" onclick="showAddItemModal()">+ Add Item</button>';panel.prepend(bar);}
  bar.hidden=false;
 }else if(bar)bar.hidden=true;
}
if(typeof addMenuItem==='function'){
 const adminAdd=addMenuItem;
 window.addMenuItem=async function(){
  if(role()!=='manager')return adminAdd();
  const b=$('addItemSaveButton');b.disabled=true;
  try{
   const row=Cloud.menuRow({id:crypto.randomUUID(),name:$('newItemName').value.trim(),price:$('newItemPrice').value,category:$('newItemCategory').value,description:$('newItemDesc').value,image:photoDrafts.new.data,veg:$('newItemVeg').checked,available:true});
   row.image=await Cloud.uploadMenuImage(row.image);row.price=String(row.price);
   await Cloud.rpc('restaurant_add_menu_item66',{p_row:row},true);
   closeAddItemModal();$('addItemModal').querySelector('form').reset();photoDrafts.new={data:''};$('newItemPhotoPreview').hidden=true;
   if(typeof refreshCloud==='function')await refreshCloud();if(typeof loadStaffMenuPage63==='function')await loadStaffMenuPage63(true).catch(()=>{});
   toast('Dish added to the menu.');
  }catch(e){toast(missing(e)?NEED_SQL:e.message);}finally{b.disabled=false;}
 };
}

/* ---------------- Waiter accounts ---------------- */
function waRow(a){
 const state=!a.active?'Access turned off':a.online?'Online now':a.signed_in?'Signed in · idle':'Signed out',dot=!a.active?'':a.online?'on':a.signed_in?'idle':'';
 return `<article class="wa-row${a.active?'':' is-off'}" data-wa="${esc(a.user_id)}" data-wa-name="${esc(a.name)}"><span class="wa-avatar">${esc((a.name||'?').trim().charAt(0).toUpperCase())}<i class="wa-dot ${dot}" aria-hidden="true"></i></span><div class="wa-info"><strong>${esc(a.name)}</strong><span>${esc(a.email)}</span><span class="wa-state ${a.online?'on':''}">${state}${a.active&&!a.online?' · seen '+timeAgo(a.last_seen):''}</span></div><div class="wa-actions">${a.active?`<button type="button" class="danger-btn" data-wa-act="revoke">Revoke access</button>`:`<button type="button" class="primary-btn" data-wa-act="restore">Give access</button>`}<button type="button" class="secondary-btn" data-wa-act="password">Reset password</button><button type="button" class="secondary-btn" data-wa-act="rename">Rename</button><button type="button" class="secondary-btn" data-wa-act="remove" aria-label="Delete ${esc(a.name)}">Delete</button></div></article>`;
}
function renderWaiters(data,error){
 const list=$('waiterAccountsList66');if(!list)return;
 if(error){list.innerHTML=`<p class="hint">${esc(missing(error)?NEED_SQL:error.message)}</p>`;return;}
 const accounts=data.accounts||[],online=accounts.filter(a=>a.online).length,active=accounts.filter(a=>a.active).length;
 $('waiterAccountsSummary66').innerHTML=`<span class="wa-chip"><b>${online}</b> online</span><span class="wa-chip"><b>${active}</b> with access</span><span class="wa-chip"><b>${accounts.length-active}</b> revoked</span>${data.qr_devices?`<span class="wa-chip"><b>${data.qr_devices}</b> phone(s) via waiter QR</span>`:''}`;
 list.innerHTML=accounts.length?accounts.map(waRow).join(''):'<p class="hint">No waiter accounts yet. Add your first waiter above.</p>';
}
async function waiterCall(action,args={}){
 if(waBusy&&action==='list')return;waBusy=true;
 try{const data=await Cloud.rpc('restaurant_waiter_accounts66',{p_action:action,p_email:args.email??null,p_password:args.password??null,p_name:args.name??null,p_user:args.user??null},true);renderWaiters(data);return data;}
 catch(e){if(action==='list')renderWaiters(null,e);throw e;}finally{waBusy=false;}
}
function refreshWaiters(){if(!$('waiterAccounts66')||!['admin','manager'].includes(role()))return;waiterCall('list').catch(()=>{});}
document.addEventListener('submit',async e=>{
 if(e.target.id!=='waiterAccountForm66')return;e.preventDefault();
 const f=e.target,status=$('waiterAccountStatus66'),btn=f.querySelector('button[type=submit]');btn.disabled=true;status.textContent='Creating account…';
 try{await waiterCall('add',{name:f.waName.value.trim(),email:f.waEmail.value.trim(),password:f.waPassword.value});status.textContent=`Done. ${f.waName.value.trim()||'The waiter'} can now sign in on the Waiter app with ${f.waEmail.value.trim()}.`;f.reset();}
 catch(err){status.textContent=missing(err)?NEED_SQL:err.message;}finally{btn.disabled=false;}
});
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-wa-act]');if(!b)return;const row=b.closest('[data-wa]'),user=row.dataset.wa,name=row.dataset.waName,act=b.dataset.waAct,status=$('waiterAccountStatus66');
 let args={user};
 if(act==='password'){const pw=prompt(`New password for ${name} (8 or more characters):`);if(!pw)return;if(pw.length<8){toast('Password must be at least 8 characters.');return;}args.password=pw;}
 if(act==='rename'){const nm=prompt('New display name',name);if(!nm||!nm.trim())return;args.name=nm.trim();}
 if(act==='revoke'&&!confirm(`Turn off access for ${name}? They are signed out immediately.`))return;
 if(act==='remove'&&!confirm(`Delete ${name}'s waiter account permanently? Orders they handled are kept.`))return;
 b.disabled=true;
 try{await waiterCall(act,args);status.textContent={password:`Password changed. ${name} must sign in again.`,rename:'Name updated.',revoke:`${name} has been signed out and can no longer sign in.`,restore:`${name} can sign in again.`,remove:`${name}'s account was deleted.`}[act];}
 catch(err){status.textContent=missing(err)?NEED_SQL:err.message;}finally{b.disabled=false;}
});

/* ---------------- Wiring into the existing Management tab ---------------- */
// Management panels get wrapped in collapsible <details> groups; show/hide the panel and its group together.
function show(el,visible){if(!el)return;el.hidden=!visible;const g=el.closest('details.management48-group');if(g)g.hidden=!visible;}
function applyVisibility(){
 const r=role(),staff=['admin','manager'].includes(r);
 show($('waiterAccounts66'),staff);show($('themeStudio'),r==='admin');show($('telegramAlertsPanel'),r==='admin');show($('managerPerms66'),r==='admin');
 const cat=$('categoryList')?.closest('section.panel');if(cat&&r==='manager')show(cat,can.add||can.rename||can.remove||can.hide);
 const ts=$('themeStudio')?.closest('details.management48-group');if(ts&&!ts.dataset.opened66){ts.open=true;ts.dataset.opened66='1';}
}
function refreshManagement(){
 const r=role();if(!['admin','manager'].includes(r))return;
 renderPerms();applyVisibility();window.ThemeEngine?.renderStudio();if(r==='admin'&&typeof loadTelegramSettings==='function')loadTelegramSettings();
 loadCategories66().catch(e=>{const s=$('categoryStatus');if(s)s.textContent=e.message;});
 refreshWaiters();clearInterval(waTimer);waTimer=setInterval(()=>{if(typeof currentTab!=='undefined'&&currentTab==='management'&&!document.hidden)refreshWaiters();else clearInterval(waTimer);},15000);
}
if(typeof configureManagementAccess==='function'){
 const original=configureManagementAccess;
 window.configureManagementAccess=function(){original.apply(this,arguments);applyVisibility();};
}
if(typeof switchTab==='function'){
 const original=switchTab;
 window.switchTab=function(tab){const out=original.apply(this,arguments);if(tab==='management')refreshManagement();if(tab==='menu'&&role()==='manager')loadCategories66().catch(()=>{});return out;};
}
document.addEventListener('themechange',()=>{});
window.Admin66={refresh:refreshManagement,loadCategories:loadCategories66};
})();
