/* Actual billing UI, existing restaurant Supabase APIs and R2 only. No shop schema.
   v19: invoice numbers, one-call Records/Dashboard, discounts, short cash, item extras, limits, phone sign-in,
   and a parallel start-up (the app used to wait for seven calls in a row before it showed anything). */
'use strict';
const Cloud=(()=>{
 const R=RestaurantCloud;let custom={},revision=null,me=null,addon=null,v19=null,extras=null,limits=null;const catalog=new Map();
 const ADDON_MSG='This needs the one-time database update WORKSPACE-ADDON-v17.sql. Run it in Supabase → SQL Editor, then refresh.';
 const V19_MSG='This needs the one-time database update UPDATE-v19.sql. Run it in Supabase → SQL Editor, then refresh.';
 const missingFn=e=>e?.httpStatus===404||/Could not find the function|schema cache|PGRST202/i.test(e?.message||'');
 async function hasAddon(){if(addon!==null)return addon;try{await R.rpc('workspace_docs_list',{p_kind:'expense_heads',p_from:null,p_to:null,p_ref:null,p_offset:0,p_limit:1},true);addon=true;}catch(e){if(missingFn(e))addon=false;else throw e;}return addon;}
 let invoiceCfg=null;
 async function hasV19(){if(v19!==null)return v19;try{invoiceCfg=await R.rpc('restaurant_invoice19',{},true);v19=true;}catch(e){if(missingFn(e))v19=false;else throw e;}return v19;}
 async function docs(kind,{from=null,to=null,ref=null,offset=0,limit=500}={}){if(!await hasAddon())throw Error(ADDON_MSG);return R.rpc('workspace_docs_list',{p_kind:kind,p_from:from,p_to:to,p_ref:ref,p_offset:offset,p_limit:limit},true);}
 async function saveDoc(kind,id,data,day=null,insertOnly=false){if(!await hasAddon())throw Error(ADDON_MSG);return R.rpc('workspace_doc_save',{p_kind:kind,p_id:id,p_data:data,p_day:day,p_insert_only:insertOnly},true);}
 async function delDoc(kind,id){if(!await hasAddon())throw Error(ADDON_MSG);return R.rpc('workspace_doc_delete',{p_kind:kind,p_id:id},true);}
 async function stableId(text){const h=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(b=>b.toString(16).padStart(2,'0')).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-5'+h.slice(13,16)+'-'+((parseInt(h[16],16)&3)|8).toString(16)+h.slice(17,20)+'-'+h.slice(20,32);}
 const HEADS_ID='00000000-0000-4000-8000-0000000000e1',DEFAULT_HEADS=['Rent','Electricity','Gas','Salary','Groceries','Repairs'];
 async function expenseHeads(){const d=await docs('expense_heads',{limit:1});return d.rows[0]?.data?.heads||DEFAULT_HEADS;}
 const monthEnd=m=>{const d=new Date(m.slice(0,7)+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);return d.toISOString().slice(0,10);};
 const nextMonth=m=>{const d=new Date(m.slice(0,7)+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);return d.toISOString().slice(0,10);};
 async function postAutos(){
  const autos=(await docs('expense_auto')).rows,t=today();
  for(const a of autos){const x=a.data||{};if(x.active===false)continue;let m=(x.start_month||t).slice(0,7)+'-01',n=0,last=x.last_posted||'';
   while(m<=t&&n++<24){const day=Math.min(Number(x.day_of_month)||1,Number(monthEnd(m).slice(8))),due=m.slice(0,8)+String(day).padStart(2,'0');
    if(due<=t&&due>last){await saveDoc('expense',await stableId(a.id+'|'+due),{head:x.head||'',title:x.title||'',amount:Number(x.amount),method:x.method||'Cash',note:'',auto_id:a.id,by:'Auto'},due,true);if(me?.native_role==='admin'){last=due;await saveDoc('expense_auto',a.id,{...x,last_posted:due},null,false);}}
    m=nextMonth(m);}}
 }
 const expenseRow=d=>({id:d.id,spent_on:d.doc_day,head:d.data.head||'',title:d.data.title||'',amount:Number(d.data.amount||0),method:d.data.method||'Cash',note:d.data.note||'',auto:!!d.data.auto_id,by:d.data.by||''});
 async function expensesIn(from,to){const out=[];for(let off=0;;off+=500){const d=await docs('expense',{from,to,offset:off,limit:500});out.push(...d.rows.map(expenseRow));if(out.length>=d.total||!d.rows.length)break;}return out;}
 const call=(n,a={})=>R.rpc(n,a,true);
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(new Date());
 async function load(known=null){const d=await R.rpc('restaurant_custom48',{p_known:known,p_settings:null,p_expected:null},R.hasSession());if(d.settings)custom=d.settings;revision=d.revision;}
 async function patch(change){if(!revision)await load();const d=await call('restaurant_custom48',{p_known:null,p_settings:{...custom,...change},p_expected:revision});custom=d.settings||{...custom,...change};revision=d.revision;}
 async function images(v){if(Array.isArray(v))return Promise.all(v.map(images));if(v&&typeof v==='object'){const out={};for(const [k,x]of Object.entries(v))out[k]=await images(x);return out;}return typeof v==='string'&&/^data:image\//.test(v)?R.uploadMenuImage(v):v;}
 const RESTAURANT_SETTINGS={tax_scope:'bill',round_off:false,allow_negative_stock:false,item_fields:{hsn:true,alias:true,description:true,default_discount:false,item_type:false,advanced:false}};
 const settings=()=>{const saved=custom.billingClone?.settings||{};return {shop_name:custom.name||RESTAURANT_CONFIG.restaurantName||'My Restaurant',tagline:custom.tagline||'',logo:custom.logo||'',currency:RESTAURANT_CONFIG.currency||'₹',timezone:'Asia/Kolkata',tax_enabled:false,tax_mode:'percent',tax_value:0,tax_label:'Tax',invoice:{},bill:{},...saved,...RESTAURANT_SETTINGS,item_fields:{...RESTAURANT_SETTINGS.item_fields,...Object.fromEntries(['hsn','alias','description'].filter(k=>k in(saved.item_fields||{})).map(k=>[k,!!saved.item_fields[k]]))},bill_prefix:invoiceCfg?.prefix??'INV',invoice_numbers:invoiceCfg};};
 const lim=()=>({max_discount_percent:Number(limits?.max_discount_pct??custom.billingClone?.system?.limits?.max_discount_percent??100),max_short_amount:Number(limits?.max_short_amount??custom.billingClone?.system?.limits?.max_short_amount??0)});
 const system=()=>{const saved=custom.billingClone?.system||{};return {brand:{app_title:'Restaurant'},appearance:{theme:'ledger'},...saved,features:{...saved.features,customer_address:false},modules:{...saved.modules,billing:true,dashboard:true,records:true,items:true,stocks:true,members:false,expenses:addon===true},payments:{Cash:saved.payments?.Cash!==false,UPI:saved.payments?.UPI!==false,Card:false},roles:{manager:[],cashier:[]},limits:lim(),v19:v19===true,access:{...saved.access,locked:!!custom.locked,message:custom.lockMessage||''}};};
 const MANAGER_PERMS=['billing','records','records_all','dashboard','items','stocks','export','kitchen','requests','tables','notifications','item_details','restaurant_settings','expenses','limits'];
 const quiet=p=>p.catch(()=>null);
 async function who(){
  // Everything the first screen needs, asked for at the same time.
  // Who is this first (a waiter is turned away before anything else is asked for); then everything else at the same time.
  const role=await R.role();
  if(!['admin','manager'].includes(role))throw Object.assign(Error('Admin or manager access required.'),{status:403});
  await Promise.all([load(),quiet(hasAddon()),quiet(hasV19())]);
  if(role!=='admin'&&custom.locked)throw Object.assign(Error(custom.lockMessage||'This workspace is paused.'),{code:'LOCKED'});
  const [commerce,contact,permissions,stock,lims]=await Promise.all([quiet(call('restaurant_commerce_settings',{p_enabled:null,p_mode:null,p_value:null})),quiet(call('restaurant_contact')),quiet(call('restaurant_manager_permissions')),quiet(call('restaurant_stock_visibility')),v19?quiet(call('restaurant_private19',{p_key:'limits'})):null]);
  if(lims)limits=lims;
  const s=settings();if(commerce)Object.assign(s,commerce,RESTAURANT_SETTINGS,{item_fields:s.item_fields});
  if(typeof stock?.stocks_hidden==='boolean')s.stock_hidden=stock.stocks_hidden;
  if(contact)Object.assign(s,{contact_name:contact.contact_name||'',contact_phone:contact.phone||'',contact_details:contact.details||''});
  const UNSUPPORTED=['cancel_bills','members','members_add','members_renew','members_plans','members_login','attendance','roles_manager','roles_cashier',...(v19?[]:['discount','short_cash'])];
  const managerView=role==='admin'&&custom.billingClone?.system?.admin_manager_view===true;
  let perms=role==='admin'&&!managerView?[...PERMISSIONS.flatMap(g=>g[1].map(p=>p[0])).filter(p=>!UNSUPPORTED.includes(p)),'admin','limits']:[...MANAGER_PERMS,...(v19?['discount','short_cash']:[])];
  if(role==='manager'&&permissions?.customer_devices)perms.push('devices');
  if(managerView)perms.push('devices');
  return me={role:role==='admin'&&!managerView?'superadmin':'manager',native_role:role,manager_view:managerView,name:role==='admin'?'Admin':'Manager',email:R.user()?.email||'',today:today(),settings:s,system:system(),perms,v:String(revision)};
 }
 // ---------- item extras (cost price, unit, low-stock alert, HSN, name on bill) — private, never on the customer menu ----------
 async function loadExtras(force=false){if(!await hasV19().catch(()=>false))return extras={};if(extras&&!force)return extras;try{extras=await call('restaurant_private19',{p_key:'items'})||{};}catch{extras=extras||{};}return extras;}
 async function saveExtras(id,x){if(!v19)throw Error(V19_MSG);const all=await loadExtras(true);const clean=Object.fromEntries(Object.entries(x).filter(([,v])=>v!==''&&v!=null&&!(typeof v==='object'&&!Object.values(v).some(Boolean))));if(Object.keys(clean).length)all[id]=clean;else delete all[id];extras=await call('restaurant_private19',{p_key:'items',p_data:all});}
 const key=(id,size)=>JSON.stringify([String(id),size||null]);
 function flat(m,size){const stock=size?m.size_stock?.[size]:m.stock,id=key(m.id,size),x=extras?.[id]||{};catalog.set(id,{menu:m,size});return {id,name:m.name+(size?' — '+(m.size_labels?.[size]||size):''),category:m.category,code:m.item_code||'',description:m.description||'',unit:x.unit||'pcs',price:Number(size?m.size_prices[size]:m.price),cost_price:x.cost_price??null,hsn:x.hsn||'',alias:x.alias||'',meta:x.meta||{},active:m.available!==false,track_stock:!!stock?.tracked,stock:Number(stock?.remaining||0),low_stock_at:Number(x.low_stock_at||0),image:m.image||''};}
 async function items(){
  const page=offset=>call('restaurant_staff_menu_page63',{p_query:'',p_category:'All',p_availability:'all',p_offset:offset,p_limit:100});
  const itemExtras=quiet(loadExtras());
  const first=await page(0);
  const total=Number(first.total||0),rest=[];for(let o=(first.items||[]).length;o<total&&(first.items||[]).length;o+=100)rest.push(page(o));
  const [remaining]=await Promise.all([Promise.all(rest),itemExtras]);
  const pages=[first,...remaining],categories=first.categories||[];
  const rows=pages.flatMap(d=>(d.items||[]).flatMap(m=>m.sizes_enabled?Object.keys(m.size_prices||{}).map(s=>flat(m,s)):[flat(m,null)]));
  return {items:rows,categories:categories.map(c=>typeof c==='string'?c:c.name)};
 }
 const payLabel=p=>p==='Online'?'UPI':p||'Not recorded';
 function bill(o){
  const list=typeof o.items==='string'?JSON.parse(o.items):o.items,rawPayment=o.native_payment_method??o.payment_method,orderNo=Number(o.daily_number)>0?Number(o.daily_number):null;
  return {...o,bill_no:o.invoice_no||(orderNo?'Order #'+orderNo:o.order_id||String(o.id)),invoice_no:o.invoice_no||'',order_no:orderNo,bill_day:o.order_day||String(o.created_at).slice(0,10),cashier_name:o.order_source==='manual'?'Counter':o.order_source==='waiter'?'Waiter':'QR order',
   status:['Cancelled','Rejected'].includes(o.status)?'Cancelled':['Served','Paid'].includes(o.status)?'Paid':o.status||'Paid',native_payment_method:rawPayment||null,payment_method:payLabel(rawPayment),
   items:(list||[]).map(i=>({...i,item_id:key(i.id,i.size),unit:'pcs',qty:Number(i.qty||i.quantity||0),line_total:Number(i.subtotal??Number(i.qty)*Number(i.price))})),items_subtotal:Number(o.items_subtotal??o.total),discount_amount:Number(o.discount_amount)||0,bill_discount:Number(o.discount_amount)||0,round_off:0,change_amount:Number(o.change_amount)||0};
 }
 function recordPaymentEditable(b){
  const native=b.native_payment_method??(b.payment_method==='Not recorded'?null:b.payment_method),minutes=Math.max(5,Math.min(1440,Number(custom.orderRecordPaymentEditMinutes)||120));
  return ['admin','manager'].includes(me?.native_role)&&custom.orderRecordPaymentEdit!==false&&b.order_source!=='manual'&&!String(b.order_id||'').startsWith('MAN-')&&!native&&Number.isFinite(Date.parse(b.created_at))&&Date.now()<Date.parse(b.created_at)+minutes*60000;
 }
 function checkRange(a){const start=new Date(a.p_from+'T00:00:00Z'),end=new Date(a.p_to+'T00:00:00Z');if(!Number.isFinite(+start)||!Number.isFinite(+end)||end<start||end-start>366*86400000)throw Error('Choose a valid range of up to one year.');return [start,end];}
 // Older databases: one call per day, eight days at a time instead of one after another.
 async function recordsByDay(a){const [start,end]=checkRange(a),days=[];for(let d=start;d<=end;d=new Date(+d+86400000))days.push(d.toISOString().slice(0,10));
  const one=async day=>{const out=[];for(let offset=0;;){const d=await call('restaurant_filtered_records',{p_period:'day',p_reference:day,p_offset:offset,p_limit:100,p_status:'All'}),page=d.records||[];out.push(...page.filter(o=>['Served','Cancelled','Rejected'].includes(o.status)).map(bill));offset+=page.length;if(!page.length||offset>=Number(d.total_orders??d.total??0))break;}return out;};
  const rows=[];for(let n=0;n<days.length;n+=8)(await Promise.all(days.slice(n,n+8).map(one))).forEach(r=>rows.push(...r));return rows.sort((x,y)=>String(y.created_at).localeCompare(String(x.created_at)));}
 const sum=(xs,k)=>xs.reduce((n,x)=>n+Number(x[k]||0),0);
 async function lowStock(){try{const [list]=await Promise.all([call('restaurant_stocks'),loadExtras()]);const names=new Map([...catalog.entries()].map(([id,c])=>[c.menu.id+'|'+(c.size||'single'),{id,name:c.menu.name+(c.size?' — '+(c.menu.size_labels?.[c.size]||c.size):'')}]));
  return (list||[]).filter(r=>r.tracked).map(r=>{const n=names.get(r.menu_id+'|'+(r.variant||'single'))||{id:key(r.menu_id,r.variant==='single'?null:r.variant),name:r.name||r.menu_name||'Item'};const at=Number(extras?.[n.id]?.low_stock_at||0)||5;return {id:n.id,name:n.name,stock:Number(r.remaining||0),low_stock_at:at,unit:extras?.[n.id]?.unit||'pcs'};}).filter(r=>r.stock<=r.low_stock_at).sort((x,y)=>x.stock-y.stock).slice(0,20);}catch{return [];}}
 const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
 const trendLabel=(k,unit)=>unit==='month'?MONTHS[Number(k.slice(5,7))-1]+' '+k.slice(2,4):new Date(k+'T12:00:00Z').toLocaleDateString('en-IN',{day:'numeric',month:'short',timeZone:'UTC'});
 async function dashboard(a){
  checkRange(a);
  const exp=addon?expensesIn(a.p_from,a.p_to).catch(()=>null):Promise.resolve(null),low=lowStock();
  let m;
  const supportsReports=await hasV19();
  const recent=supportsReports?call('restaurant_bills19',{p_from:a.p_from,p_to:a.p_to,p_status:'Paid',p_payment:'all',p_query:'',p_offset:0,p_limit:8}).then(r=>(r.rows||[]).map(bill)).catch(()=>[]):Promise.resolve(null);
  const d19=supportsReports?await call('restaurant_dashboard19',{p_from:a.p_from,p_to:a.p_to}).catch(e=>{if(missingFn(e))return null;throw e;}):null;
  if(d19){const d=d19,x=d.metrics||{};
   m={metrics:{sales:Number(x.sales),bills:Number(x.bills),cancelled:Number(x.cancelled),cancelled_value:Number(x.cancelled_value),avg_bill:Number(x.avg_bill),qty:Number(x.qty),discount:Number(x.discount),tax:Number(x.tax),prev_available:true,prev_sales:Number(x.prev_sales),prev_bills:Number(x.prev_bills)},
    trend_unit:d.trend_unit,trend:(d.trend||[]).map(t=>({key:t.key,label:trendLabel(t.key,d.trend_unit),sales:Number(t.sales),bills:Number(t.bills)})),
    payments:['Cash','UPI'].map(method=>{const p=(d.payments||[]).filter(x=>payLabel(x.method)===method);return {method,amount:sum(p,'amount'),bills:sum(p,'bills')};}),
    top_items:(d.top_items||[]).map(t=>({...t,qty:Number(t.qty),revenue:Number(t.revenue)})),categories:(d.categories||[]).map(c=>({...c,name:c.category,qty:Number(c.qty),revenue:Number(c.revenue),sales:Number(c.revenue)}))};}
  else{const rows=await recordsByDay(a),paid=rows.filter(b=>b.status==='Paid'),sales=sum(paid,'total'),top=new Map(),trend=new Map();for(const b of paid){trend.set(b.bill_day,(trend.get(b.bill_day)||0)+Number(b.total));for(const i of b.items){const x=top.get(i.name)||{name:i.name,unit:i.unit,qty:0,revenue:0};x.qty+=Number(i.qty);x.revenue+=Number(i.line_total);top.set(i.name,x);}}
   m={recent:paid.slice(0,8),metrics:{sales,bills:paid.length,cancelled:rows.length-paid.length,cancelled_value:sum(rows.filter(b=>b.status==='Cancelled'),'total'),avg_bill:paid.length?sales/paid.length:0,qty:paid.reduce((n,b)=>n+sum(b.items,'qty'),0),discount:sum(paid,'discount_amount'),tax:sum(paid,'tax_amount'),prev_available:false,prev_sales:0},trend_unit:'day',trend:[...trend].sort().map(([k,amount])=>({key:k,label:trendLabel(k,'day'),sales:amount})),payments:['Cash','UPI'].map(method=>({method,amount:sum(paid.filter(b=>b.payment_method===method),'total'),bills:paid.filter(b=>b.payment_method===method).length})),top_items:[...top.values()].sort((x,y)=>y.revenue-x.revenue).slice(0,10),categories:[]};}
  const e=await exp,r=await recent;if(r)m.recent=r;
  Object.assign(m.metrics,{profit:0,profit_available:false,profit_cover:0,expenses_on:!!e,expenses:e?sum(e,'amount'):0,expenses_in_profit:settings().expenses_in_profit!==false});
  return {from:a.p_from,to:a.p_to,...m,expense_heads:e?Object.values(e.reduce((g,x)=>{const k=x.head||x.title||'Other';(g[k]||=(g[k]={head:k,amount:0,n:0})).amount+=x.amount;g[k].n++;return g;},{})).sort((x,y)=>y.amount-x.amount):[],low_stock:await low};
 }
 async function bills(a){
  if(await hasV19())try{const d=await call('restaurant_bills19',{p_from:a.p_from,p_to:a.p_to,p_status:a.p_status||'all',p_payment:a.p_payment==='UPI'?'UPI':a.p_payment||'all',p_query:a.p_query||'',p_offset:a.p_offset||0,p_limit:a.p_limit||50});const s=d.summary||{};
   return {from:a.p_from,to:a.p_to,total:Number(d.total||0),rows:(d.rows||[]).map(bill),summary:{sales:Number(s.sales||0),bills:Number(s.bills||0),cancelled:Number(s.cancelled||0),cash:Number(s.cash||0),upi:Number(s.upi||0),card:0}};}catch(e){if(!missingFn(e))throw e;}
  const all=await recordsByDay(a),paid=all.filter(b=>b.status==='Paid'),q=(a.p_query||'').toLowerCase(),rows=all.filter(b=>(!a.p_status||a.p_status==='all'||b.status===a.p_status)&&(!a.p_payment||a.p_payment==='all'||b.payment_method===a.p_payment)&&(!q||[b.bill_no,b.order_id,b.customer_name,'#'+b.order_no].join(' ').toLowerCase().includes(q)));
  return {from:a.p_from,to:a.p_to,total:rows.length,rows:rows.slice(a.p_offset||0,(a.p_offset||0)+(a.p_limit||50)),summary:{sales:sum(paid,'total'),bills:paid.length,cancelled:all.length-paid.length,cash:sum(paid.filter(b=>b.payment_method==='Cash'),'total'),upi:sum(paid.filter(b=>b.payment_method==='UPI'),'total'),card:0}};
 }
 async function setTracked(mapped,qty){const list=await call('restaurant_stocks'),row=list.find(r=>r.menu_id===mapped.menu.id&&r.variant===(mapped.size||'single'));await call('restaurant_set_stock',{p_id:mapped.menu.id,p_variant:mapped.size||'single',p_tracking:true,p_quantity:qty,p_revision:Number(row?.revision||0)});}
 async function dispatch(name,a={}){
  if(name==='shop_me')return who();
  if(name==='shop_items_list')return items();
  if(name==='shop_invoice_save'){const r=await call('restaurant_invoice19',{p_prefix:a.p_prefix??null,p_digits:a.p_digits??null,p_start_month:a.p_start_month??null,p_next:a.p_next??null});invoiceCfg=r;return r;}
  if(name==='shop_invoice_get'){if(!await hasV19())return null;invoiceCfg=await call('restaurant_invoice19',{});return invoiceCfg;}
  if(name==='shop_limits_save'){if(!await hasV19())throw Error(V19_MSG);const pct=Number(a.p_max_discount_percent),amt=Number(a.p_max_short_amount);if(!(pct>=0&&pct<=100))throw Error('Discount limit must be from 0 to 100%.');if(!(amt>=0&&amt<=100000))throw Error('Short cash must be from 0 to 100000.');limits=await call('restaurant_private19',{p_key:'limits',p_data:{max_discount_pct:pct,max_short_amount:amt}});if(me)me.system=system();return lim();}
  if(name==='shop_settings_save'){
   const p=await images(a.p||a.p_patch||a);
   if(p.tax_scope==='item')throw Error('Restaurant bills use one tax rate for the whole bill. Choose “One rate for the whole bill”.');
   if(['contact_name','contact_phone','contact_details'].some(k=>k in p)){const c=await call('restaurant_contact');await call('restaurant_contact',{p_save:true,p_name:p.contact_name??c.contact_name,p_phone:p.contact_phone??c.phone,p_details:p.contact_details??c.details,p_waiter_billing:c.manual_waiter_access});}
   if('stock_hidden'in p)await call('restaurant_stock_visibility',{p_hidden:!!p.stock_hidden});
   const keep={...p};for(const k of ['round_off','allow_negative_stock','tax_scope','bill_prefix'])delete keep[k];
   await patch({name:p.shop_name??custom.name,tagline:p.tagline??custom.tagline,logo:p.logo??custom.logo,billingClone:{...custom.billingClone,settings:{...custom.billingClone?.settings,...keep}}});if('tax_enabled'in p)await call('restaurant_commerce_settings',{p_enabled:p.tax_enabled,p_mode:p.tax_mode==='fixed'?'fixed':'percent',p_value:Number(p.tax_value)});return (await who()).settings;
  }
  if(name==='shop_system_save'||name==='shop_billing_options_save'){
   const p=await images(a.p||a.p_patch||a);
   if(p.roles)throw Error('The current restaurant API uses its existing manager and waiter permissions. Open Settings → Restaurant to change those permissions. No changes were saved.');
   if(p.limits){await dispatch('shop_limits_save',{p_max_discount_percent:p.limits.max_discount_percent,p_max_short_amount:p.limits.max_short_amount});delete p.limits;}
   const next={...(custom.billingClone?.system||{}),...p};delete next.limits;
   const access=p.access?{locked:typeof p.access.locked==='boolean'?p.access.locked:!!custom.locked,lockMessage:p.access.message??custom.lockMessage??''}:{};
   if(Object.keys(p).length)await patch({...access,billingClone:{...custom.billingClone,system:next}});return system();
  }
  if(name==='shop_create_bill'){
   if(a.p_payment_method==='Card')throw Error('Card is not used for restaurant bills — they record Cash or UPI. No bill was saved.');
   if(a.p_extra&&Object.keys(a.p_extra).length)throw Error('Restaurant orders cannot save customer addresses or custom bill fields. Turn them off in Settings → Bill extras. No bill was saved.');
   const requestItems=a.p_items.map(x=>{if(!Number.isInteger(Number(x.qty))||Number(x.qty)<1||Number(x.qty)>50)throw Error('Choose whole quantities from 1 to 50.');if(x.custom)return {custom:true,name:String(x.name).slice(0,120),price:Number(x.price),qty:Number(x.qty)};const pair=JSON.parse(x.id);return {id:pair[0],size:pair[1],qty:Number(x.qty)};});
   const who_=[a.p_customer_name,a.p_customer_phone].map(v=>String(v||'').trim()).filter(Boolean).join(' · ').slice(0,80);
   const pay=a.p_payment_method==='Cash'?'Cash':'Online';
   let fn19=await hasV19();
   if(fn19)try{
    const o=await call('restaurant_counter_bill19',{p_request_id:a.p_request_id,p_name:who_,p_notes:a.p_notes||'',p_items:requestItems,p_expected_total:Number(a.p_gross_total??a.p_expected_total),p_payment_method:pay,p_discount_mode:a.p_discount_value>0?a.p_discount_mode:null,p_discount_value:Number(a.p_discount_value)||0,p_cash_received:a.p_cash_received??null,p_expected_final:Number(a.p_expected_total)});
    const b=bill(o);if(pay==='Cash'&&Number(a.p_cash_received)>Number(b.total))b.change_amount=Math.round((Number(a.p_cash_received)-Number(b.total))*100)/100;b.cash_received=a.p_cash_received??null;return {...b,stock_updates:[]};
   }catch(e){if(!missingFn(e))throw e;}
   if(Number(a.p_discount_value)>0)throw Error('Discounts need the database update UPDATE-v19.sql. No bill was saved.');
   const o=await call('restaurant_manual_order',{p_request_id:a.p_request_id,p_table:'Counter',p_name:who_,p_notes:a.p_notes||'',p_items:requestItems,p_expected_total:Number(a.p_expected_total),p_payment_method:pay});const b=bill(o);if(pay==='Cash'&&Number(a.p_cash_received)>Number(b.total))b.change_amount=Math.round((Number(a.p_cash_received)-Number(b.total))*100)/100;return {...b,stock_updates:[]};}
  if(name==='shop_record_payment_save'){
   if(!['Cash','Online'].includes(a.p_method))throw Error('Choose Cash or Online.');
   const saved=await call('restaurant_set_record_payment59',{p_order:a.p_id,p_payment_method:a.p_method});if(!saved?.id)throw Error('Payment was not confirmed. Refresh Records before trying again.');return bill(saved);
  }
  if(name==='shop_stock_adjust'){const mapped=catalog.get(a.p_item_id);if(!mapped)throw Error('Reload Items before changing stock.');const list=await call('restaurant_stocks'),row=list.find(r=>r.menu_id===mapped.menu.id&&r.variant===(mapped.size||'single')),current=Number(row?.remaining||0),qty=Number(a.p_qty);if(!['set','in','out'].includes(a.p_mode)||!Number.isFinite(qty)||qty<0)throw Error('Choose a valid stock adjustment.');const next=a.p_mode==='set'?qty:a.p_mode==='in'?current+qty:current-qty;if(!Number.isInteger(next)||next<0||next>1000000)throw Error('Stock must be a whole quantity from 0 to 1000000.');await call('restaurant_set_stock',{p_id:mapped.menu.id,p_variant:mapped.size||'single',p_tracking:true,p_quantity:next,p_revision:Number(row?.revision||0)});const item={...flat(mapped.menu,mapped.size),stock:next,track_stock:true};if(addon)saveDoc('stock_move',null,{ref:a.p_item_id,item_name:item.name,reason:!row?.tracked?'opening':a.p_mode==='in'?'stock_in':a.p_mode==='out'?'stock_out':'set',change:next-current,balance:next,note:String(a.p_note||'').slice(0,200),actor_name:me?.name||''},today(),true).catch(()=>{});return item;}
  if(name==='shop_category_save'){await call('restaurant_categories66',{p_action:a.p_old_name?'rename':'add',p_name:a.p_old_name||a.p_name,p_new_name:a.p_old_name?a.p_name:null,p_replacement:null});return (await items()).categories;}
  if(name==='shop_category_delete'){const list=(await items()).categories,others=list.filter(c=>c!==a.p_name),move=others.includes('General')?'General':others[0]||null;await call('restaurant_categories66',{p_action:'remove',p_name:a.p_name,p_new_name:null,p_replacement:move});return (await items()).categories;}
  if(name==='shop_items_delete_all'){const progress=typeof a.p_progress==='function'?a.p_progress:()=>{};let gone=0,cats=0;
   if(a.p_items){await items();const ids=[...new Set([...catalog.values()].map(x=>x.menu.id))];for(let n=0;n<ids.length;n+=4){await Promise.all(ids.slice(n,n+4).map(id=>R.deleteMenu(id)));gone=Math.min(ids.length,n+4);progress('items',gone,ids.length);}catalog.clear();}
   if(a.p_categories){const left=(await items()).items.length,list=(await items()).categories;const keep=left?'General':null;
    if(keep&&!list.includes(keep))await call('restaurant_categories66',{p_action:'add',p_name:keep,p_new_name:null,p_replacement:null});
    const drop=list.filter(c=>c!==keep);for(const [n,c]of drop.entries()){await call('restaurant_categories66',{p_action:'remove',p_name:c,p_new_name:null,p_replacement:keep});cats++;progress('categories',n+1,drop.length);}}
   return {items:gone,categories:cats};}
  if(name==='shop_item_delete'){const mapped=catalog.get(a.p_id);if(!mapped)throw Error('Reload Items before deleting.');if(mapped.size)throw Error('This is one portion size of '+mapped.menu.name+'. Remove the size in Items → Photos & portions, or delete the whole dish there.');await R.deleteMenu(mapped.menu.id);if(extras?.[a.p_id])saveExtras(a.p_id,{}).catch(()=>{});return {ok:true};}
  if(name==='shop_items_import'){const r=await call('restaurant_import_menu67',{p_rows:(a.p_rows||[]).map(x=>({...x,code:x.code||''}))});if(r.ok===false)throw Error((r.errors||[]).map(e=>'Row '+e.row+': '+e.message).join('; '));return {added:r.created||0,updated:r.updated||0};}
  if(name==='shop_item_save'){
   const p=a.p,mapped=p.id&&catalog.get(p.id);
   if(Number(p.default_discount)>0)throw Error('Per-item discounts are not used on restaurant bills. Give a discount on the bill instead. Nothing was saved.');
   if(p.tax_rate!=null&&p.tax_rate!=='')throw Error('Restaurant bills use one tax rate for the whole bill (Settings → Billing). Nothing was saved.');
   const x={cost_price:p.cost_price===''||p.cost_price==null?null:Number(p.cost_price),unit:p.unit&&p.unit!=='pcs'?String(p.unit).slice(0,12):'',low_stock_at:Number(p.low_stock_at)>0?Number(p.low_stock_at):0,hsn:String(p.hsn||'').slice(0,20),alias:String(p.alias||'').slice(0,80),meta:p.meta&&Object.values(p.meta).some(Boolean)?p.meta:null};
   const hasExtras=x.cost_price!=null||x.unit||x.low_stock_at||x.hsn||x.alias||x.meta;
   if(hasExtras&&!await hasV19())throw Error('Buying price, unit, low-stock alert, HSN and name on bill need the database update UPDATE-v19.sql. Nothing was saved.');
   const row={name:p.name,price:Number(p.price),category:p.category,available:p.active,item_code:p.code||null};if('description'in p)row.description=p.description||'';
   let id=p.id;
   if(mapped){
    if(mapped.size){const latest=await call('restaurant_staff_menu_item63',{p_id:mapped.menu.id});if(!latest)throw Error('Dish not found. Refresh Items.');const label=latest.size_labels?.[mapped.size]||mapped.size;if((p.name&&p.name!==latest.name+' — '+label)||(p.category&&p.category!==latest.category))throw Error('This line is one portion size. Change the dish name or category in Items → Photos & portions.');const prices={...latest.size_prices,[mapped.size]:Number(p.price)};await call('restaurant_menu_customize',{p_id:latest.id,p_sizes_enabled:true,p_base_price:Math.min(...Object.values(prices).map(Number)),p_size_prices:prices,p_size_labels:latest.size_labels||{},p_details:null,p_expected_updated_at:latest.updated_at});if('active'in p&&p.active!==(latest.available!==false))await call('restaurant_manager_menu_flags',{p_id:latest.id,p_available:!!p.active,p_recommended:null,p_best_seller:null});}
    else await R.patchMenu(mapped.menu.id,row);
    const tracked=!!(mapped.size?mapped.menu.size_stock?.[mapped.size]?.tracked:mapped.menu.stock?.tracked);
    if('track_stock'in p&&!p.track_stock&&tracked){const list=await call('restaurant_stocks'),r=list.find(s=>s.menu_id===mapped.menu.id&&s.variant===(mapped.size||'single'));await call('restaurant_set_stock',{p_id:mapped.menu.id,p_variant:mapped.size||'single',p_tracking:false,p_quantity:Number(r?.remaining||0),p_revision:Number(r?.revision||0)});}
   }else{
    const menuId=crypto.randomUUID();await call('restaurant_add_menu_item66',{p_row:{id:menuId,...row,description:row.description||'',veg:true}});id=key(menuId,null);
    if(p.track_stock){const qty=Math.max(0,Math.round(Number(p.stock)||0));try{await setTracked({menu:{id:menuId},size:null},qty);}catch(e){throw Error('The item was saved, but its stock was not: '+e.message+' Set the stock in Stocks.');}}
   }
   if(v19&&(hasExtras||extras?.[id]))await saveExtras(id,x);
   const list=(await items()).items;return list.find(i=>i.id===id)||list.find(i=>i.name===p.name);
  }
  if(name==='shop_bills_list')return bills(a);
  if(name==='shop_dashboard')return dashboard(a);
  if(name==='shop_expenses_list'){await postAutos().catch(e=>{if(!/admin/i.test(e.message))throw e;});const [rows,autos,heads]=await Promise.all([expensesIn(a.p_from,a.p_to),docs('expense_auto'),expenseHeads()]);return {rows,autos:autos.rows.map(d=>({id:d.id,...d.data,amount:Number(d.data.amount||0),day_of_month:Number(d.data.day_of_month)||null,active:d.data.active!==false})),heads,total:rows.reduce((n,r)=>n+r.amount,0),can_manage:me?.native_role==='admin'};}
  if(name==='shop_expense_save'){const p=a.p||{},amount=Math.round(Number(p.amount)*100)/100;if(!(amount>0)||amount>100000000)throw Error('Enter an amount above 0.');if(!/^\d{4}-\d{2}-\d{2}$/.test(p.spent_on||''))throw Error('Choose a date.');if(!p.head&&!String(p.title||'').trim())throw Error('Choose a type or type a name.');return saveDoc('expense',p.id||null,{head:String(p.head||'').slice(0,60),title:String(p.title||'').trim().slice(0,80),amount,method:['Cash','UPI','Card','Bank'].includes(p.method)?p.method:'Cash',note:String(p.note||'').slice(0,200),by:me?.name||''},p.spent_on,false);}
  if(name==='shop_expense_delete')return delDoc('expense',a.p_id);
  if(name==='shop_expense_auto_save'){const p=a.p||{},amount=Math.round(Number(p.amount)*100)/100;if(!(amount>0))throw Error('Enter an amount above 0.');let prev={};if(p.id){prev=(await docs('expense_auto')).rows.find(r=>r.id===p.id)?.data||{};}const start=String(p.start_month||today()).slice(0,7)+'-01';const d={head:String(p.head||'').slice(0,60),title:String(p.title||'').trim().slice(0,80),amount,day_of_month:Math.min(28,Math.max(1,Number(p.day_of_month)||1)),start_month:start,method:['Cash','UPI','Card','Bank'].includes(p.method)?p.method:'Cash',active:p.active!==false,last_posted:start!==prev.start_month?'':prev.last_posted||''};await saveDoc('expense_auto',p.id||null,d,null,false);await postAutos();return {};}
  if(name==='shop_expense_auto_delete')return delDoc('expense_auto',a.p_id);
  if(name==='shop_expense_head_save'||name==='shop_expense_head_delete'){let heads=await expenseHeads();const v=String(a.p_name||'').trim().slice(0,40);if(name==='shop_expense_head_delete')heads=heads.filter(h=>h!==a.p_name);else{if(!v)throw Error('Enter a type name.');if(a.p_old_name)heads=heads.map(h=>h===a.p_old_name?v:h);else if(!heads.includes(v)){if(heads.length>=30)throw Error('Up to 30 expense types.');heads=[...heads,v];}}await saveDoc('expense_heads',HEADS_ID,{heads:[...new Set(heads)]},null,false);return heads;}
  if(name==='shop_stock_moves_list'){if(!await hasAddon())throw Error('Stock history is not switched on yet. '+ADDON_MSG);const d=await docs('stock_move',{ref:a.p_item_id||null,offset:a.p_offset||0,limit:a.p_limit||50});return {total:d.total,rows:d.rows.map(r=>({created_at:r.created_at,...r.data}))};}
  if(name==='shop_reset_bills'){if(String(a.p_confirm||'').trim()!=='DELETE ALL BILLS')throw Error('Type DELETE ALL BILLS exactly.');const r=await call('restaurant_admin_reset',{p_scope:'records',p_confirmation:'DELETE RECORDS',p_request_id:crypto.randomUUID()});return {deleted:Number(r?.deleted??r?.deleted_orders??r?.orders??0)};}
  if(name==='shop_app_icon_save'){if(me?.native_role!=='admin')throw Error('Admin access required.');const icon=await images(a.p_icon||'');const v=String(Date.now());await patch({billingClone:{...custom.billingClone,appIcon:{icon,maskable:!!a.p_maskable,v}}});return {icon,v};}
  if(name==='shop_staff_phones'){if(!await hasV19())return null;return call('restaurant_staff_phone19',{p_user:a.p_user||null,p_phone:a.p_phone||null,p_clear:!!a.p_clear});}
  throw Error('This action is unavailable with the current restaurant setup. Open Restaurant settings for the existing controls. No changes were saved.');
 }
 // Staff can type a mobile number instead of an email when one is saved for their login.
 async function login(id,password){
  let email=String(id||'').trim();
  if(!email.includes('@')){const digits=email.replace(/\D/g,'');if(digits.length<10)throw Error('Enter your email or your 10-digit mobile number.');
   try{email=await R.rpc('restaurant_login_email19',{p_phone:digits});}catch(e){throw missingFn(e)?Error('Mobile number sign-in needs the database update UPDATE-v19.sql. Use your email for now.'):e;}
   if(!email)throw Error('No login uses this mobile number. Check the number or use your email.');}
  try{return await R.login(email,password);}catch(e){throw /invalid login|invalid_grant|credentials/i.test(e.message)?Error(id.includes('@')?'Wrong email or password.':'Wrong mobile number or password.'):e;}
 }
 return {hiddenAdmin:['presets','roles','admins'],hasAddon:()=>addon===true,hasV19:()=>v19===true,custom:()=>custom,reloadCustom:async()=>{await load();return custom;},patchCustom:async change=>{await load();await patch(change);return custom;},orderToBill:bill,recordPaymentEditable,canCancelBill:false,
  sectionHidden:route=>me?.role!=='superadmin'&&(custom.hiddenSections||[]).includes(({kitchen:'live',records:'history',dishSales:'history',restaurantReports:'dashboard',items:'menu',itemDetails:'menu',stockRules:'stocks',settings:'management'})[route]||route),
  cfg:SHOP_CONFIG,configured:R.configured,get signedIn(){return R.hasSession();},get userEmail(){return me?.email||R.user()?.email||'';},get userId(){return R.user()?.id||'';},login,logout:()=>R.logout(),rpc:dispatch,
  publicRpc:async(name)=>{if(name==='shop_version'){await load(revision);return String(revision||'');}if(name==='shop_app_icon')return {icon:custom.billingClone?.appIcon?.icon||'',v:custom.billingClone?.appIcon?.v||''};if(name==='shop_public_info'){try{await load();}catch{}return {...system(),icon_v:custom.billingClone?.appIcon?.v||'',access:{locked:!!custom.locked,message:custom.lockMessage||''},shop_name:settings().shop_name};}throw Error('Unsupported public API.');},
  recover:()=>Promise.reject(Error('Contact support to reset access.')),useRecoveryToken:()=>false,setPassword:()=>Promise.reject(Error('Use restaurant account management.'))};
})();
