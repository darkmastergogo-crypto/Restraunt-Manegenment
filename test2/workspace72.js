/* SHOI release 72 — role-scoped Admin navigation and live summary.
 * This is a frontend shortcut into the existing persisted Settings69 controls;
 * it never exposes settings or adds a second configuration store. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const admin=()=>typeof staffRole!=='undefined'&&staffRole==='admin';
let inAdmin=false;
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function ensureNavigation(){
 const nav=$('managerNav'),management=$('tabManagementBtn');
 if(!nav||!management||$('tabAdmin72Btn'))return;
 const group=management.closest('.side-group71');
 const btn=document.createElement('button');btn.type='button';btn.id='tabAdmin72Btn';
 btn.className='nav-tab-btn';btn.hidden=true;btn.title='Administrator controls';
 btn.innerHTML='<svg class="ui-icon s68-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 5 6v6c0 4 3 7.5 7 9 4-1.5 7-5 7-9V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></svg><span class="nav-label68">Admin</span>';
 btn.addEventListener('click',()=>{
   if(!admin()||$('staffMain')?.hidden)return;
   switchTab('management');
   inAdmin=true;document.body.dataset.workspaceView72='admin';
   // Settings69 is also mounted by Shell68, which refreshes its rail on entry.
   setTimeout(()=>{
     if(!inAdmin||!admin())return;
     window.Settings69?.show('system');
     paintAdmin();
   },85);
 });
 (group||nav).append(btn);
}
function ensureAdminSummary(){
 const m=$('managementSection'),head=$('set69Head');if(!m||!head)return;
 if(!$('admin72Head')){
  const h=document.createElement('div');h.id='admin72Head';h.className='admin72-head';h.hidden=true;
  h.innerHTML='<h2>Admin</h2><p>Administrator-only system settings, access and support.</p>';
  head.after(h);
 }
 if(!$('admin72Strip')){
  const d=document.createElement('div');d.id='admin72Strip';d.className='admin72-strip';d.hidden=true;
  $('admin72Head').after(d);
 }
}
function paintAdmin(){
 ensureNavigation();
 const btn=$('tabAdmin72Btn');if(btn)btn.hidden=!admin();
 if(!admin())inAdmin=false;
 const active=inAdmin&&admin()&&!$('managementSection')?.hidden;
 if(!active&&inAdmin)inAdmin=false;
 ensureAdminSummary();
 $('admin72Head')&&($('admin72Head').hidden=!active);
 $('admin72Strip')&&($('admin72Strip').hidden=!active);
 if(btn)btn.classList.toggle('active',active);
 const manage=$('tabManagementBtn');
 if(manage&&active)manage.classList.remove('active');
 if(active){
  const s=window.Custom48?.get?.()||{};
  const mode=s.system69?.on===false?'Switched off':s.locked?'Locked':'Running';
  const theme=(s.theme||document.documentElement.dataset.theme||'shoi-teal').replace(/-/g,' ');
  const support=s.support68?.name||'Not configured';
  $('admin72Strip').innerHTML=`<div class="admin72-stat"><small>System</small><strong>${escapeHTML(mode)}</strong></div><div class="admin72-stat"><small>Theme</small><strong>${escapeHTML(theme)}</strong></div><div class="admin72-stat"><small>Support</small><strong>${escapeHTML(support)}</strong></div>`;
  const h=document.querySelector('body.staff-site > header h1');if(h)h.textContent='Admin';
  if($('set69Head'))$('set69Head').hidden=true;
 }else if($('set69Head')){$('set69Head').hidden=false;}
}
const original=window.switchTab;
if(typeof original==='function'){
 window.switchTab=function(tab){
   if(tab!=='management'){
     inAdmin=false;
     delete document.body.dataset.workspaceView72;
   }else if(inAdmin){
     // A normal Settings click should return to Settings, not remain in Admin.
     inAdmin=false;
     delete document.body.dataset.workspaceView72;
   }
   const out=original.apply(this,arguments);
   // Admin is an optional navigation shortcut: existing switchTab remains the
   // only authority for opening screens and permission checks.
   paintAdmin();
   return out;
 };
}
function sync(){
 ensureNavigation();
 const button=$('tabAdmin72Btn');if(button)button.hidden=!admin()||!!$('staffMain')?.hidden;
 if(!admin()){inAdmin=false;paintAdmin();}
}
const main=$('staffMain');
if(main)new MutationObserver(()=>{sync();}).observe(main,{attributes:true,attributeFilter:['hidden']});
document.addEventListener('custom48:applied',()=>{if(inAdmin)paintAdmin();});
document.addEventListener('themechange',()=>{if(inAdmin)paintAdmin();});
// Monitor role-dependent navigation visibility using the same event as sign-in.
document.addEventListener('click',e=>{
 const button=e.target.closest('#managerNav .nav-tab-btn');
 if(button&&button.id!=='tabAdmin72Btn'&&inAdmin){inAdmin=false;delete document.body.dataset.workspaceView72;queueMicrotask(paintAdmin);}
});
sync();
window.Workspace72={paintAdmin,openAdmin:()=>{$('tabAdmin72Btn')?.click();}};
})();
