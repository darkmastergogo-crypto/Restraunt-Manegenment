/* Release 68 — Dashboard in the billing-app style: period chips, sales vs previous period,
   bills, expenses, profit after expenses, payments, best sellers, trend, tables and low stock. */
'use strict';
const Dashboard68=(()=>{
 const $=id=>document.getElementById(id),esc=v=>Cloud.esc(String(v??''));
 const NEED_SQL='Run SUPABASE/“4-RUN-THIS-NOW (update 68).sql” in Supabase, then refresh this page.';
 const missing=e=>/restaurant_dashboard68|schema cache|PGRST202|Could not find the function/i.test(e?.message||'');
 const money=v=>(Cloud.cfg.currency||'₹')+Number(v||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
 const short=v=>{const n=Number(v||0);return (Cloud.cfg.currency||'₹')+(n>=1e5?(n/1e5).toFixed(1)+'L':n>=1e3?(n/1e3).toFixed(1)+'k':n.toFixed(0));};
 const PERIODS=[['today','Today'],['yesterday','Yesterday'],['7d','Last 7 days'],['month','This month'],['lastmonth','Last month'],['year','This year'],['custom','Custom']];
 let period='today',from='',to='',req=0,timer=null;
 const ist=()=>new Date(Date.now()+5.5*3600e3);
 const iso=d=>d.toISOString().slice(0,10);
 function range(){
  const t=ist(),y=t.getUTCFullYear(),m=t.getUTCMonth(),d=t.getUTCDate(),D=(a,b,c)=>iso(new Date(Date.UTC(a,b,c)));
  switch(period){
   case 'yesterday':return [D(y,m,d-1),D(y,m,d-1)];
   case '7d':return [D(y,m,d-6),D(y,m,d)];
   case 'month':return [D(y,m,1),D(y,m,d)];
   case 'lastmonth':return [D(y,m-1,1),D(y,m,0)];
   case 'year':return [D(y,0,1),D(y,m,d)];
   case 'custom':return [from||D(y,m,d),to||from||D(y,m,d)];
   default:return [D(y,m,d),D(y,m,d)];
  }
 }
 function frame(){
  const sec=$('dashboardSection');if(!sec||$('dash68'))return;
  const box=document.createElement('div');box.id='dash68';
  box.innerHTML=`<div class="page-tools dash68-head"><div><h2>Dashboard</h2><p class="hint" id="dashDate68"></p></div><button type="button" class="secondary-btn" data-dash="refresh">↻ Refresh</button></div>
  <div class="chips68" role="group" aria-label="Period">${PERIODS.map(([k,l])=>`<button type="button" data-period="${k}" aria-pressed="${k===period}">${l}</button>`).join('')}</div>
  <div class="dash68-custom" id="dashCustom68" hidden><label>From<input type="date" id="dashFrom68"></label><label>To<input type="date" id="dashTo68"></label><button type="button" class="primary-btn" data-dash="apply">Show</button></div>
  <div id="dashBody68" class="dash68-body"><div class="kpi-grid68"><article class="kpi68 kpi68-hero sk68"></article><article class="kpi68 sk68"></article><article class="kpi68 sk68"></article><article class="kpi68 sk68"></article></div></div>`;
  sec.prepend(box);
  const old=sec.querySelector(':scope > .page-tools:not(.dash68-head) h2');if(old)old.textContent='Detailed analytics';
  box.addEventListener('click',e=>{
   const p=e.target.closest('[data-period]');if(p){period=p.dataset.period;for(const b of box.querySelectorAll('[data-period]'))b.setAttribute('aria-pressed',String(b===p));$('dashCustom68').hidden=period!=='custom';if(period!=='custom')load();return;}
   const a=e.target.closest('[data-dash]');if(!a)return;if(a.dataset.dash==='apply'){from=$('dashFrom68').value;to=$('dashTo68').value;load();}else load();
  });
 }
 function delta(cur,prev){if(!Number(prev))return Number(cur)?'<span class="up68">New vs previous period</span>':'<span class="flat68">No sales in the previous period</span>';const p=(cur-prev)/prev*100;return `<span class="${p>=0?'up68':'down68'}">${p>=0?'▲':'▼'} ${Math.abs(p).toFixed(0)}% vs previous period</span>`;}
 function paint(raw){
  const body=$('dashBody68');if(!body)return;
  const [rf,rt]=range();const d={from:rf,to:rt,days:rf===rt?1:2,sales:0,prev_sales:0,bills:0,cancelled:0,pending:0,avg_bill:0,units:0,tax:0,qr_sales:0,counter_sales:0,qr_bills:0,counter_bills:0,payments:[],top_items:[],trend:[],tables:[],expense_heads:[],low_stock:[],cost_ready:false,food_cost:0,gross_profit:0,net_profit:0,coverage_percent:0,...(raw&&!Array.isArray(raw)?raw:{})};
  const [f,t]=[d.from,d.to],fmt=x=>new Date(x+'T00:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
  $('dashDate68').textContent=f===t?fmt(f):`${fmt(f)} – ${fmt(t)}`;
  const beforeCost=Number(d.sales)-Number(d.expenses||0),profit=d.cost_ready?Number(d.net_profit):beforeCost,max=Math.max(1,...(d.trend||[]).map(x=>Number(x.amount))),pay=d.payments||[],paySum=pay.reduce((s,x)=>s+Number(x.amount),0)||1;
  const topMax=Math.max(1,...(d.top_items||[]).map(x=>Number(x.qty)));
  body.innerHTML=`<div class="kpi-grid68">
   <article class="kpi68 kpi68-hero"><span>Sales</span><b>${money(d.sales)}</b><small>${delta(Number(d.sales),Number(d.prev_sales))}</small></article>
   <article class="kpi68"><span>Bills</span><b>${d.bills}</b><small>${d.cancelled?`${d.cancelled} rejected / cancelled`:'No cancelled orders'}${d.pending?` · ${d.pending} pending`:''}</small></article>
   ${d.expenses_on?`<article class="kpi68"><span>Expenses</span><b>${money(d.expenses)}</b><small>${(d.expense_heads||[])[0]?`<a href="#" data-goto="expenses">${esc(d.expense_heads[0].head)}</a> is the biggest`:'None in this period'}</small></article>
   ${d.cost_ready?`<article class="kpi68"><span>Item cost</span><b>${money(d.food_cost)}</b><small>${Number(d.coverage_percent).toFixed(1)}% of sold lines have cost data</small></article><article class="kpi68"><span>Net profit</span><b class="${profit>=0?'good68':'neg68'}">${money(profit)}</b><small>Sales − item cost − expenses</small></article>`:`<article class="kpi68"><span>After expenses</span><b class="${profit>=0?'good68':'neg68'}">${money(profit)}</b><small>Item cost is not installed yet</small></article>`}`:''}
   <article class="kpi68"><span>Average bill</span><b>${money(d.avg_bill)}</b><small>${Number(d.units)} items sold</small></article>
   <article class="kpi68"><span>QR orders · Counter</span><b>${d.qr_bills} · ${d.counter_bills}</b><small>${short(d.qr_sales)} · ${short(d.counter_sales)}</small></article>
   <article class="kpi68"><span>Tax collected</span><b>${money(d.tax)}</b><small>${d.busiest_hour?'Busiest hour '+esc(d.busiest_hour):'—'}</small></article>
  </div>
  <div class="dash68-cols">
   <section class="panel dash68-trend"><div class="sec-head68"><h3>${d.days===1?'Sales by hour':'Sales by day'}</h3></div><div class="bars68" role="img" aria-label="Sales trend">${(d.trend||[]).map(x=>`<span title="${esc(x.label)} · ${money(x.amount)}"><i style="height:${Math.max(2,Number(x.amount)/max*100)}%"></i><em>${esc(d.days===1?x.label.slice(0,2):x.label.split(' ')[0])}</em></span>`).join('')}</div></section>
   <section class="panel"><div class="sec-head68"><h3>Payments</h3></div>${pay.length?`<div class="stack68">${pay.map(p=>`<div class="pay68"><span><b>${esc(p.method)}</b><em>${money(p.amount)} · ${p.n} bill${p.n===1?'':'s'}</em></span><i style="width:${Number(p.amount)/paySum*100}%"></i></div>`).join('')}</div>`:'<p class="hint">No paid orders yet.</p>'}</section>
   <section class="panel"><div class="sec-head68"><h3>Best sellers</h3></div>${(d.top_items||[]).length?`<ol class="top68">${d.top_items.map((x,i)=>`<li><span class="rank68">${i+1}</span><span class="top68-name"><b>${esc(x.name)}</b><i style="width:${Number(x.qty)/topMax*100}%"></i></span><span class="top68-num"><b>${Number(x.qty)}</b><em>${short(x.amount)}</em></span></li>`).join('')}</ol>`:'<p class="hint">Nothing sold yet in this period.</p>'}</section>
   <section class="panel"><div class="sec-head68"><h3>Top tables</h3></div>${(d.tables||[]).length?`<div class="stack68">${d.tables.map(x=>`<div class="row68"><b>${esc(Cloud.tableName?.(x.table_number)||x.table_number)}</b><span>${x.n} order${x.n===1?'':'s'} · ${money(x.amount)}</span></div>`).join('')}</div>`:'<p class="hint">No table orders yet.</p>'}</section>
   ${d.expenses_on?`<section class="panel"><div class="sec-head68"><h3>Expenses by type</h3><button type="button" class="secondary-btn" data-goto="expenses">Open</button></div>${(d.expense_heads||[]).length?`<div class="stack68">${d.expense_heads.map(x=>`<div class="row68"><b>${esc(x.head)}</b><span>${money(x.amount)}</span></div>`).join('')}</div>`:'<p class="hint">No expenses in this period.</p>'}</section>`:''}
   <section class="panel"><div class="sec-head68"><h3>Running low</h3><button type="button" class="secondary-btn" data-goto="stocks">Stocks</button></div>${(d.low_stock||[]).length?`<div class="stack68">${d.low_stock.map(x=>`<div class="row68"><b>${esc(x.name)}</b><span class="${x.remaining?'warn68':'neg68'}">${x.remaining?x.remaining+' left':'Sold out'}</span></div>`).join('')}</div>`:'<p class="hint">Nothing is running low.</p>'}</section>
  </div>`;
 }
 document.addEventListener('click',e=>{const g=e.target.closest('[data-goto]');if(!g||!$('dash68')?.contains(g))return;e.preventDefault();switchTab(g.dataset.goto);});
 async function load(){
  frame();const id=++req,[f,t]=range();
  try{const d=await Cloud.rpc('restaurant_dashboard68',{p_from:f,p_to:t},true);try{const p=await Cloud.rpc('restaurant_profit73',{p_from:f,p_to:t},true);if(p&&typeof p==='object')Object.assign(d,p);}catch{}if(id===req)paint(d);}
  catch(e){if(id===req&&$('dashBody68'))$('dashBody68').innerHTML=`<div class="empty68">${esc(missing(e)?NEED_SQL:e.message)}</div>`;}
 }
 function open(){load();clearInterval(timer);timer=setInterval(()=>{if(typeof currentTab!=='undefined'&&currentTab==='dashboard'&&!document.hidden)load();else clearInterval(timer);},60000);}
 return {open,load};
})();

window.Dashboard68=Dashboard68;
