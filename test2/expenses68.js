/* Release 68 — Expenses (from the billing app): expense types, one-off expenses and
   monthly auto expenses that post themselves on a set day. */
'use strict';
const Expenses68=(()=>{
 const $=id=>document.getElementById(id),esc=v=>Cloud.esc(String(v??''));
 const NEED_SQL='Run SUPABASE/“4-RUN-THIS-NOW (update 68).sql” in Supabase, then refresh this page.';
 const missing=e=>/restaurant_expenses68|schema cache|PGRST202|Could not find the function/i.test(e?.message||'');
 const money=v=>(Cloud.cfg.currency||'₹')+Number(v||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
 const METHODS=['Cash','Online','UPI','Card','Bank'];
 let month=null,data=null,busy=false,req=0;
 const ym=d=>d.toISOString().slice(0,7);
 const today=()=>new Date(Date.now()+5.5*3600e3).toISOString().slice(0,10);
 function range(){const [y,m]=month.split('-').map(Number);const f=new Date(Date.UTC(y,m-1,1)),t=new Date(Date.UTC(y,m,0));return {from:f.toISOString().slice(0,10),to:t.toISOString().slice(0,10)};}
 function root(){return $('expensesSection');}
 function frame(){
  const r=root();if(!r||r.dataset.built)return;r.dataset.built='1';
  r.innerHTML=`<div class="page-tools"><div><h2>Expenses</h2><p class="hint">Rent, salaries, gas, vegetables… Auto expenses post themselves every month.</p></div><button type="button" class="primary-btn" data-ex="add">+ Add expense</button></div>
  <div class="ex-month68"><button type="button" class="secondary-btn" data-ex="prev" aria-label="Previous month">‹</button><b id="exMonth68"></b><button type="button" class="secondary-btn" data-ex="next" aria-label="Next month">›</button></div>
  <div class="kpi-grid68" id="exKpis68"></div>
  <div class="ex-cols68"><section class="panel"><div class="sec-head68"><h3>This month</h3></div><div id="exList68" class="ex-list68"><p class="hint">Loading…</p></div></section>
  <aside class="ex-side68"><section class="panel"><div class="sec-head68"><h3>By type</h3></div><div id="exHeads68"></div></section>
  <section class="panel" id="exAutoPanel68"><div class="sec-head68"><h3>Auto expenses</h3><button type="button" class="secondary-btn" data-ex="auto">+ Add</button></div><p class="hint">Same amount every month, posted on its day (the 1st if no day is set).</p><div id="exAutos68"></div></section>
  <section class="panel" id="exTypesPanel68"><div class="sec-head68"><h3>Expense types</h3><button type="button" class="secondary-btn" data-ex="type">+ Add</button></div><div id="exTypes68" class="ex-types68"></div></section></aside></div><p class="hint" id="exStatus68" role="status"></p>`;
 }
 function paint(){
  const r=root();if(!r||!data)return;const [y,m]=month.split('-').map(Number);
  $('exMonth68').textContent=new Date(Date.UTC(y,m-1,1)).toLocaleDateString('en-IN',{month:'long',year:'numeric',timeZone:'UTC'});
  const rows=data.rows||[],top=(data.by_head||[])[0];
  $('exKpis68').innerHTML=`<article class="kpi68 kpi68-hero"><span>Total spent</span><b>${money(data.total)}</b><small>${rows.length} expense${rows.length===1?'':'s'}</small></article><article class="kpi68"><span>Biggest type</span><b>${esc(top?.head||'—')}</b><small>${top?money(top.amount):'Nothing yet'}</small></article><article class="kpi68"><span>Auto expenses</span><b>${(data.autos||[]).filter(a=>a.active).length}</b><small>active every month</small></article>`;
  const byDay={};for(const x of rows)(byDay[x.spent_on]||=[]).push(x);
  $('exList68').innerHTML=rows.length?Object.entries(byDay).map(([d,list])=>`<div class="ex-day68"><span>${new Date(d+'T00:00:00').toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'})}</span><b>${money(list.reduce((s,x)=>s+Number(x.amount),0))}</b></div>`+list.map(x=>`<article class="ex-row68" data-ex-id="${esc(x.id)}"><span class="ex-dot68">${esc((x.head||x.title||'?').charAt(0).toUpperCase())}</span><div><b>${esc(x.head||'Other')}${x.title?` · ${esc(x.title)}`:''}</b><small>${esc(x.method)}${x.auto?' · Auto':''}${x.by?' · by '+esc(x.by):''}${x.note?' · '+esc(x.note):''}</small></div><strong>${money(x.amount)}</strong>${data.can_manage?`<span class="ex-acts68"><button type="button" class="secondary-btn" data-ex="edit">Edit</button><button type="button" class="danger-btn" data-ex="del" aria-label="Delete">Delete</button></span>`:''}</article>`).join('')).join(''):'<div class="empty68">No expenses this month. Tap “+ Add expense”.</div>';
  const max=Math.max(1,...(data.by_head||[]).map(h=>Number(h.amount)));
  $('exHeads68').innerHTML=(data.by_head||[]).length?(data.by_head||[]).map(h=>`<div class="bar68"><span><b>${esc(h.head)}</b><em>${money(h.amount)}</em></span><i style="width:${Math.max(4,Number(h.amount)/max*100)}%"></i></div>`).join(''):'<p class="hint">No expenses yet.</p>';
  $('exAutoPanel68').hidden=!data.can_manage;$('exTypesPanel68').hidden=!data.can_manage;
  $('exAutos68').innerHTML=(data.autos||[]).length?(data.autos||[]).map(a=>`<article class="ex-auto68${a.active?'':' is-off'}" data-auto-id="${esc(a.id)}"><div><b>${esc(a.head||a.title)}${a.head&&a.title?` · ${esc(a.title)}`:''}</b><small>${money(a.amount)} · day ${a.day_of_month||1} · ${esc(a.method)}${a.last_posted?' · last '+esc(a.last_posted):''}${a.active?'':' · paused'}</small></div><span class="ex-acts68"><button type="button" class="secondary-btn" data-ex="autoedit">Edit</button><button type="button" class="secondary-btn" data-ex="autotoggle">${a.active?'Pause':'Resume'}</button><button type="button" class="danger-btn" data-ex="autodel">Delete</button></span></article>`).join(''):'<p class="hint">None yet.</p>';
  $('exTypes68').innerHTML=(data.heads||[]).map(h=>`<span class="chip68" data-type="${esc(h)}">${esc(h)}<button type="button" data-ex="typeedit" aria-label="Rename ${esc(h)}">✎</button><button type="button" data-ex="typedel" aria-label="Remove ${esc(h)}">×</button></span>`).join('')||'<p class="hint">No types yet.</p>';
 }
 async function call(action,p={}){
  const id=++req;const st=$('exStatus68');
  try{const out=await Cloud.rpc('restaurant_expenses68',{p_action:action,p:{...range(),...p}},true);if(id===req){data=out;paint();}if(st&&action!=='list')st.textContent='Saved.';return out;}
  catch(e){if(st)st.textContent=missing(e)?NEED_SQL:e.message;if(action==='list'&&$('exList68'))$('exList68').innerHTML=`<div class="empty68">${esc(missing(e)?NEED_SQL:e.message)}</div>`;throw e;}
 }
 function form(kind,x={}){
  let d=$('exDialog68');if(!d){d=document.createElement('dialog');d.id='exDialog68';d.className='dlg68';document.body.append(d);}
  const heads=data?.heads||[],auto=kind==='auto';
  d.innerHTML=`<form method="dialog" class="dlg68-form" id="exForm68"><div class="dlg68-head"><h2>${auto?(x.id?'Edit auto expense':'New auto expense'):(x.id?'Edit expense':'Add expense')}</h2><button type="button" class="secondary-btn" data-close68 aria-label="Close">×</button></div>
   <label>Type<select name="head"><option value="">Other (type below)</option>${heads.map(h=>`<option${h===x.head?' selected':''}>${esc(h)}</option>`).join('')}</select></label>
   <label>What for <small>optional</small><input name="title" maxlength="80" value="${esc(x.title||'')}" placeholder="e.g. Gas cylinder"></label>
   <div class="dlg68-2"><label>Amount<input name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" required value="${esc(x.amount||'')}"></label>
   ${auto?`<label>Day of month<input name="day_of_month" type="number" min="1" max="31" placeholder="1" value="${esc(x.day_of_month||'')}"></label>`:`<label>Date<input name="spent_on" type="date" value="${esc(x.spent_on||today())}"></label>`}</div>
   <div class="dlg68-2"><label>Paid by<select name="method">${METHODS.map(m=>`<option${m===(x.method||'Cash')?' selected':''}>${m}</option>`).join('')}</select></label>${auto?`<label>Start month<input name="start_month" type="month" value="${esc((x.start_month||today()).slice(0,7))}"></label>`:'<span></span>'}</div>
   <label>Note <small>optional</small><input name="note" maxlength="200" value="${esc(x.note||'')}"></label>
   <p class="hint" id="exFormStatus68" role="status"></p><div class="toolbar"><button class="primary-btn" type="submit">Save</button><button class="secondary-btn" type="button" data-close68>Cancel</button></div></form>`;
  d.showModal();
  d.querySelector('form').onsubmit=async ev=>{ev.preventDefault();const f=ev.target,st=$('exFormStatus68'),p=Object.fromEntries(new FormData(f));if(p.start_month)p.start_month+='-01';if(x.id)p.id=x.id;
   if(f.dataset.saving==='1')return;f.dataset.saving='1';const submit=f.querySelector('[type=submit]');submit.disabled=true;st.textContent='Saving…';try{await call(auto?'auto_save':(x.id?'save':'add'),p);d.close();}catch(err){st.textContent=missing(err)?NEED_SQL:err.message;}finally{delete f.dataset.saving;submit.disabled=false;}};
 }
 document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-ex]');if(!b||!root()?.contains(b)&&!b.closest('#exDialog68'))return;const act=b.dataset.ex;
  const row=b.closest('[data-ex-id]'),auto=b.closest('[data-auto-id]'),chip=b.closest('[data-type]');
  const x=row?(data.rows||[]).find(r=>r.id===row.dataset.exId):null,a=auto?(data.autos||[]).find(r=>r.id===auto.dataset.autoId):null;
  if(act==='add')return form('one');
  if(act==='edit')return form('one',x);
  if(act==='auto')return form('auto');
  if(act==='autoedit')return form('auto',a);
  if(act==='prev'||act==='next'){const [y,m]=month.split('-').map(Number);const d=new Date(Date.UTC(y,m-1+(act==='next'?1:-1),1));month=ym(d);return call('list').catch(()=>{});}
  if(act==='del'){if(!confirm('Delete this expense?'))return;return call('delete',{id:x.id}).catch(()=>{});}
  if(act==='autotoggle')return call('auto_toggle',{id:a.id}).catch(()=>{});
  if(act==='autodel'){if(!confirm('Delete this auto expense? Months already posted stay.'))return;return call('auto_delete',{id:a.id}).catch(()=>{});}
  if(act==='type'){const n=prompt('New expense type (e.g. Packaging)');if(n&&n.trim())call('head_save',{name:n.trim()}).catch(()=>{});return;}
  if(act==='typeedit'){const old=chip.dataset.type,n=prompt('Rename expense type',old);if(n&&n.trim()&&n.trim()!==old)call('head_save',{name:n.trim(),old_name:old}).catch(()=>{});return;}
  if(act==='typedel'){const old=chip.dataset.type;if(confirm(`Remove the type “${old}”? Past expenses keep their type.`))call('head_delete',{name:old}).catch(()=>{});}
 });
 async function open(){frame();if(!month)month=today().slice(0,7);if(busy)return;busy=true;try{await call('list');}catch{}finally{busy=false;}}
 return {open};
})();

window.Expenses68=Expenses68;
