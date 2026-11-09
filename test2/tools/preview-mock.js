/* Sample restaurant backend for the read-and-click preview. Never used by the live site. */
'use strict';
window.PreviewMock=function makeMock(log=()=>{},opts={}){
 const now=()=>new Date().toISOString(),ago=n=>new Date(Date.now()-n*60000).toISOString();
 let rev=1;const bump=()=>++rev;
 const menu=[
  {id:'m1',name:'Steamed Veg Momos',category:'Steamed Momos',price:80,available:true,veg:true,description:'Freshly steamed momos.',image:'',sizes_enabled:false,size_prices:{},size_labels:{},updated_at:ago(30),stock:{tracked:true,remaining:24},recommended:false,best_seller:true,item_code:'SVM'},
  {id:'m2',name:'Paneer Momos',category:'Steamed Momos',price:120,available:true,veg:true,description:'Paneer filling.',image:'',sizes_enabled:true,size_prices:{regular:70,large:120},size_labels:{regular:'Half',large:'Full'},size_stock:{regular:{tracked:true,remaining:18},large:{tracked:true,remaining:12}},updated_at:ago(30),recommended:true,best_seller:false},
  {id:'m3',name:'Chicken Fried Momos',category:'Fried Momos',price:140,available:true,veg:false,description:'Crispy fried.',image:'',sizes_enabled:false,size_prices:{},size_labels:{},updated_at:ago(30),stock:{tracked:false,remaining:0}},
  {id:'m4',name:'Cold Coffee',category:'Drinks',price:90,available:false,veg:true,description:'',image:'',sizes_enabled:false,size_prices:{},size_labels:{},updated_at:ago(30),stock:{tracked:false,remaining:0}}];
 const orders=[
  {id:'o1',order_id:'QR-1',daily_number:42,table_number:'T1',customer_name:'Amit',created_at:ago(4),updated_at:ago(4),status:'Pending',device_id:'d1aaaaaaaaaaaa',order_source:'qr',payment_method:null,items:[{id:'m1',name:'Steamed Veg Momos',qty:2,price:80,subtotal:160}],items_subtotal:160,tax_amount:0,total:160,kitchen_notes:'Less spicy'},
  {id:'o2',order_id:'QR-2',daily_number:43,table_number:'T2',customer_name:'Guest',created_at:ago(9),updated_at:ago(2),cooking_started_at:ago(2),status:'Cooking',order_source:'qr',payment_method:'Cash',items:[{id:'m2',size:'large',name:'Paneer Momos — Full',qty:1,price:120,subtotal:120}],items_subtotal:120,tax_amount:0,total:120,kitchen_notes:''},
  {id:'o3',order_id:'QR-3',daily_number:41,table_number:'T1',customer_name:'Riya',created_at:ago(60),updated_at:ago(40),status:'Served',order_source:'qr',payment_method:null,items:[{id:'m3',name:'Chicken Fried Momos',qty:1,price:140,subtotal:140}],items_subtotal:140,tax_amount:0,total:140}];
 let tables=[{table_number:'T1',display_name:'Window table',status:'Available',qr_key:'qk-one'},{table_number:'T2',display_name:'Family table',status:'Reserved',qr_key:'qk-two'}];
 let calls=[{id:'c1',table_number:'T1',request_kind:'Waiter',request_origin:'customer_menu',status:'Pending',created_at:ago(2)},{id:'c2',table_number:'T2',request_kind:'Water',status:'Pending',created_at:ago(5)}];
 let devices=[{id:'d1aaaaaaaaaaaa',browser_info:{user_agent:'Mozilla/5.0 (Linux; Android 14) Chrome/120',platform:'Linux',language:'en-IN',time_zone:'Asia/Kolkata'},first_seen:ago(300),last_seen:ago(3),updated_at:ago(3),order_count:3,monthly_order_days:2,blocked:false,last_table_number:'T1',last_order:{number:42,day:now().slice(0,10)}},{id:'d2aaaaaaaaaaaa',browser_info:{user_agent:'Mozilla/5.0 (iPhone) Safari',platform:'iPhone'},first_seen:ago(900),last_seen:ago(200),order_count:1,blocked:true,last_table_number:'T2'}];
 let stockN=[{id:'s1',dish_name:'Paneer Momos',variant:'regular',size_label:'Half',menu_id:'m2',remaining:1,baseline:20,category:'Steamed Momos',created_at:ago(10),read_at:null}],secN=[{id:'n1',table_number:'T2',device_id:'d2aaaaaaaaaaaa',browser_info:{user_agent:'Mozilla/5.0 (iPhone) Safari',platform:'iPhone'},created_at:ago(30),last_attempt_at:ago(20),attempts:2,read_at:null,blocked:true,device_exists:true}];
 let waiters=[{user_id:'w1',name:'Ravi',email:'ravi@yummy.test',active:true,online:true,signed_in:true,last_seen:ago(1)}];
 let custom={name:'Aryan Momo wala',tagline:'Yummy in your big tummy',hiddenSections:[],bill:{},categoryPhotos:{},categoryLabels:{},categoryOptions:{},categoryImageTransforms:{},managerPerms:{},menuContent51:{},menuImages51:{hero:{}},locked:false,orderRecordPaymentEdit:true,orderRecordPaymentEditMinutes:120};
 let customRev=5;
 const cats=()=>[...new Set(menu.map(m=>m.category))];
 const stocksRows=()=>menu.flatMap(m=>(m.sizes_enabled?Object.keys(m.size_prices):['single']).map(v=>{const s=v==='single'?m.stock:m.size_stock?.[v];return {menu_id:m.id,variant:v,name:m.name,category:m.category,manual_available:m.available,tracked:!!s?.tracked,remaining:s?.remaining||0,unit_price:v==='single'?m.price:m.size_prices[v],revision:1,loop_enabled:false};}));
 const E=(m,status=400)=>{const e=Error(m);e.status=status;throw e;};
 const rpc={
  restaurant_custom48:a=>{if(a.p_settings){if(a.p_expected!=null&&String(a.p_expected)!==String(customRev))E('Settings changed elsewhere. Reload.',409);custom=a.p_settings;customRev++;}return {settings:custom,revision:customRev};},
  restaurant_staff_menu_page63:a=>{let l=menu.filter(m=>(a.p_category&&a.p_category!=='All'?m.category===a.p_category:true)&&(!a.p_query||m.name.toLowerCase().includes(String(a.p_query).toLowerCase())));return {items:l.slice(a.p_offset||0,(a.p_offset||0)+(a.p_limit||50)),total:l.length,categories:cats(),tax:{tax_enabled:false,tax_mode:'percent',tax_value:0}};},
  restaurant_manual_menu_page63:a=>rpc.restaurant_staff_menu_page63(a),
  restaurant_staff_menu_item63:a=>menu.find(m=>m.id===a.p_id),
  restaurant_staff_pulse47:a=>({role:opts.role||'admin',revisions:{active:String(rev),config:String(customRev),permissions:'1',calls:String(rev),stock_notices:'1',security_notices:'1'},calls:calls.filter(c=>c.status==='Pending'),stock:{unread:stockN.filter(n=>!n.read).length,notifications:stockN},security:{unread:secN.filter(n=>!n.read).length,notifications:secN}}),
  restaurant_active_sync47:a=>({revision:String(rev),orders:String(a.p_known)===String(rev)?null:orders.filter(o=>['Pending','Accepted','Cooking','Ready'].includes(o.status)||(o.status==='Served'&&Date.now()-Date.parse(o.updated_at)<7200000))}),
  restaurant_staff_status:a=>{const o=orders.find(x=>x.id===a.p_id);if(!o)E('Order not found');if(a.p_expected&&o.status!==a.p_expected)E('Order changed. Refresh.',409);o.status=a.p_next;o.updated_at=now();if(a.p_next==='Cooking')o.cooking_started_at=now();bump();return o;},
  restaurant_cancel_order:a=>{const o=orders.find(x=>x.id===(a.p_id||a.p_order));if(o){o.status='Cancelled';bump();}return o||{};},
  restaurant_manage_tables:a=>{const act=a.p_action||'list';if(act==='add'){if(tables.some(t=>t.table_number===a.p_table))E('Table exists');tables.push({table_number:a.p_table,display_name:a.p_table,status:'Available',qr_key:'qk-'+Math.random().toString(36).slice(2,8)});}else if(act==='remove')tables=tables.filter(t=>t.table_number!==a.p_table);else if(act==='status'||act==='set_status'){const t=tables.find(t=>t.table_number===a.p_table);if(t)t.status=a.p_status;}else if(act!=='list'){const t=tables.find(t=>t.table_number===a.p_table);if(t&&a.p_status)t.status=a.p_status;}return tables;},
  restaurant_save_table_name:a=>{if(!a.p_table){const id='T'+(tables.length+1)+'x';const t={table_number:id,display_name:a.p_name,status:'Available',qr_key:'qk-'+id};tables.push(t);return t;}const t=tables.find(t=>t.table_number===a.p_table);if(!t)E('No table');t.display_name=a.p_name;return t;},
  restaurant_table_names:()=>tables.map(t=>({table_number:t.table_number,display_name:t.display_name})),
  restaurant_requests_page47:a=>{const l=calls.filter(c=>!a.p_status||a.p_status==='All'||c.status===a.p_status);return {calls:l,pending_calls:calls.filter(c=>c.status==='Pending'),total:l.length,pending_count:calls.filter(c=>c.status==='Pending').length};},
  restaurant_staff_call:a=>{if(a.p_id||a.p_call){const c=calls.find(c=>c.id===(a.p_id||a.p_call));if(c)c.status=a.p_status||'Handled';}else calls.push({id:'c'+Date.now(),table_number:a.p_table,request_kind:'Waiter',request_origin:'staff',status:'Pending',created_at:now()});bump();return {ok:true};},
  restaurant_contact:a=>{if(a.p_save)custom.contact={contact_name:a.p_name,phone:a.p_phone,details:a.p_details,manual_waiter_access:a.p_waiter_billing};return custom.contact||{contact_name:'Front desk',phone:'9876543210',details:'Ask at the counter.',manual_waiter_access:true};},
  restaurant_stock_visibility:a=>{if(a.p_hidden!=null)custom.stockHidden=a.p_hidden;return {stocks_hidden:!!custom.stockHidden};},
  restaurant_manager_permissions:a=>{if(a.p_customer_devices!=null)custom.mp={customer_devices:a.p_customer_devices,order_device_block:a.p_order_device_block};return custom.mp||{customer_devices:true,order_device_block:true};},
  restaurant_commerce_settings:a=>{if(a.p_enabled!=null)custom.tax={tax_enabled:a.p_enabled,tax_mode:a.p_mode,tax_value:a.p_value};return custom.tax||{tax_enabled:false,tax_mode:'percent',tax_value:0};},
  restaurant_order_devices:a=>{if(a.p_action==='set_blocked'){const o=orders.find(o=>o.id===a.p_order);const d=devices.find(d=>d.id===o?.device_id);if(d)d.blocked=!!a.p_blocked;return {ok:true};}return orders.filter(o=>(a.p_ids||[]).includes(o.id)).map(o=>{const d=devices.find(d=>d.id===o.device_id);return {order_id:o.id,device_id:d?.id||null,blocked:!!d?.blocked};});},
  restaurant_notification_device:a=>{const n=secN.find(n=>n.id===a.p_id);if(n){n.blocked=!!a.p_blocked;const d=devices.find(d=>d.id===n.device_id);if(d)d.blocked=n.blocked;}return {ok:true};},
  restaurant_waiter_on_way:a=>{const c=calls.find(c=>c.id===a.p_id);if(c)c.on_the_way_at=now();bump();return {ok:true};},
  restaurant_handle_waiter_call:a=>{const c=calls.find(c=>c.id===a.p_id);if(c){c.status='Handled';c.handled_at=now();}bump();return {ok:true};},
  restaurant_reset_dish_sales:()=>({excluded_orders:3}),restaurant_reset_analytics:()=>({ok:true}),restaurant_admin_reset:a=>({ok:true,scope:a.p_scope}),
  restaurant_sales_analytics:a=>({period:'day',period_start:now().slice(0,10),period_stop:now().slice(0,10),summary:{served_subtotal:4148,served_orders:4},dishes:[{dish_name:'Steamed Veg Momos',units:24}]}),
  restaurant_order_loyalty:()=>({month:now().slice(0,7),orders:[]}),
  restaurant_admin_devices:a=>{if(a.p_action==='set_blocked'){const d=devices.find(d=>d.id===a.p_device);if(d)d.blocked=!!a.p_blocked;}return {devices,total:devices.length,blocked_count:devices.filter(d=>d.blocked).length};},
  restaurant_stock_alerts:a=>{if(a.p_action==='read'){const n=stockN.find(n=>n.id===a.p_id);if(n)n.read_at=now();}if(a.p_action==='read_all')stockN.forEach(n=>n.read_at=now());return {notifications:stockN,total:stockN.length,offset:0,unread:stockN.filter(n=>!n.read_at).length,retention_minutes:1440};},
  restaurant_notifications:a=>{if(a.p_action==='read'){const n=secN.find(n=>n.id===a.p_id);if(n)n.read_at=now();}if(a.p_action==='read_all')secN.forEach(n=>n.read_at=now());return {notifications:secN,total:secN.length,offset:0,unread:secN.filter(n=>!n.read_at).length,retention_minutes:1440};},
  restaurant_alert_settings:a=>{if(a.p_settings)custom.alerts={...a.p_settings,revision:(custom.alerts?.revision||1)+1};return custom.alerts||{revision:1,orders_sound:'chime',waiter_sound:'doorbell',notification_sound:'bell',voice_enabled:false};},
  restaurant_waiter_access_settings:a=>{if(a.p_hours!=null)custom.wh=a.p_hours;return {access_hours:custom.wh||18};},
  restaurant_waiter_config56:a=>{if(a.p_app_name!=null)custom.wapp=a.p_app_name;if(a.p_song_requests!=null)custom.songs=a.p_song_requests;return {app_name:custom.wapp||'Restaurant waiter',song_requests_enabled:custom.songs!==false};},
  restaurant_waiter_permissions:a=>{if(Object.keys(a).length)custom.wperm=Object.fromEntries(Object.entries(a).map(([k,v])=>[k.slice(2),v]));return custom.wperm||{enabled:true,view_orders:true,accept_orders:true,serve_orders:true,view_requests:true,handle_requests:true,alerts:true};},
  restaurant_waiter_accounts66:a=>{const w=waiters.find(w=>w.user_id===a.p_user);if(a.p_action==='add'){if(!a.p_password||a.p_password.length<8)E('Password too short');waiters.push({user_id:'w'+Date.now(),name:a.p_name,email:a.p_email,active:true,online:false,signed_in:false,last_seen:null});}if(a.p_action==='rename')w.name=a.p_name;if(a.p_action==='revoke')w.active=false;if(a.p_action==='restore')w.active=true;if(a.p_action==='remove')waiters=waiters.filter(x=>x!==w);return {accounts:waiters,can_manage:true,qr_devices:1};},
  restaurant_waiter_link:()=>({token:'tok123',expires_in_hours:18}),
  restaurant_footer_settings:a=>{if(a.p_show_credit!=null)custom.footer={show_credit:a.p_show_credit,show_link:a.p_show_link,url:a.p_url};return custom.footer||{show_credit:true,show_link:false,url:''};},
  restaurant_review_settings:a=>{if(a.p_url!=null)custom.review=a.p_url;return {url:custom.review||''};},
  restaurant_retention_settings:a=>{if(a.p_current_minutes!=null)custom.ret={current_minutes:a.p_current_minutes,history_minutes:a.p_history_minutes};return custom.ret||{current_minutes:120,history_minutes:1440};},
  restaurant_recent_cancelled:()=>({records:[],total:0,offset:0,server_now:now()}),
  restaurant_sales_analytics_section63:a=>({trend:[{label:'9 am',item_sales:400,placed:2,served_orders:2},{label:'1 pm',item_sales:1800,placed:5,served_orders:4}],period:a.p_period||'day',period_start:now().slice(0,10),period_stop:now().slice(0,10),server_now:now(),summary:{served_subtotal:4148,served_orders:4,completion_rate:80,average_bill:1037,cancelled_orders:0,cancelled_value:0,cancellation_rate:0},trend:[],statuses:[{status:'Served',order_count:4}],weekdays:[],hours:[{hour:'1 pm',item_sales:1800,order_count:4}],dishes:[{dish_name:'Steamed Veg Momos',size:'single',units:24,order_count:4,item_sales:1920}],categories:[{category:'Steamed Momos',units:24,item_sales:4148}],sizes:[{size:'large',size_label:'Full',units:3,item_sales:360}],tables:[{table_number:'T1',order_count:3,item_sales:1200,bill_total:1200}],recent:orders.slice(0,3)}),
  restaurant_dish_sales:()=>({rows:[{position:1,dish_name:'Steamed Veg Momos',quantity:24,order_count:4,revenue:1920}],offset:0,total_rows:1,period_start:now().slice(0,10),period_stop:now().slice(0,10)}),
  restaurant_activity_settings:a=>{if(a.p_notification_minutes!=null)custom.act={notification_minutes:a.p_notification_minutes,request_minutes:a.p_request_minutes};return custom.act||{notification_minutes:1440,request_minutes:1440};},
  restaurant_menu_layout:a=>{if(a.p_ids){custom.catOrder=a.p_ids;}const order=custom.catOrder||cats();return {revision:1,categories:order.map((name,i)=>({name,sort_order:i})),items:menu};},
  restaurant_filtered_records:a=>{const day=a.p_reference;const l=orders.filter(o=>o.created_at.slice(0,10)===day||!day);return {records:l.slice(a.p_offset||0,(a.p_offset||0)+(a.p_limit||50)),total_orders:l.length,total_value:l.reduce((n,o)=>n+o.total,0),completed_orders:l.filter(o=>o.status==='Served').length,period_start:day,period_stop:day,page_size:50};},
  restaurant_records:a=>rpc.restaurant_filtered_records(a),
  restaurant_stocks:()=>stocksRows(),
  restaurant_set_stock:a=>{const m=menu.find(m=>m.id===a.p_id);if(a.p_variant==='single')m.stock={tracked:a.p_tracking,remaining:a.p_quantity};else m.size_stock[a.p_variant]={tracked:a.p_tracking,remaining:a.p_quantity};bump();return {ok:true};},
  restaurant_set_stock_loop:()=>({ok:true}),
  restaurant_menu_sync47:()=>({catalog:menu.map(m=>({...m})),state:menu.map(m=>({id:m.id,available:m.available,stock:m.stock,size_stock:m.size_stock})),commerce:{tax:{tax_enabled:false,tax_mode:'percent',tax_value:0},footer:null,categories:cats()},revisions:{catalog:String(rev)},categories:cats()}),
  restaurant_order_offer17:a=>{if(a.p_action==='check')return {ok:true,installed:true};const o=orders.find(x=>x.id===a.p_order);if(!o)E('Order not found.');const d=Number(o.discount_amount)||0;o.total=Number(o.total)+d;o.discount_amount=0;o.offers=[];o.kitchen_notes=String(o.kitchen_notes||'').replace(/Offer: [^\n]*/g,'Offer removed by staff — full price');o.updated_at=now();bump();return {ok:true,total:o.total,discount_amount:0};},
  restaurant_categories66:a=>{if(a.p_action==='remove'){for(const m of menu)if(m.category===a.p_name)m.category=a.p_replacement||'General';custom.extraCats=(custom.extraCats||[]).filter(c=>c!==a.p_name);custom.removedCats=[...(custom.removedCats||[]),a.p_name];}
  if(a.p_action==='add'){menu.push;custom.extraCats=[...(custom.extraCats||[]),a.p_name];}return {categories:[...new Set([...cats(),...(custom.extraCats||[])])].map(name=>({name,dish_count:menu.filter(m=>m.category===name).length,hidden:false})),can:{add:true,rename:true,remove:true,hide:true,addItem:true}};},
  restaurant_categories:()=>cats().map(name=>({name,dish_count:menu.filter(m=>m.category===name).length})),
  restaurant_manager_menu_flags:a=>{const m=menu.find(m=>m.id===a.p_id);for(const k of ['available','recommended','best_seller'])if(a['p_'+k]!=null)m[k]=a['p_'+k];m.updated_at=now();return m;},
  restaurant_manager_price:a=>{const m=menu.find(m=>m.id===a.p_id);m.price=a.p_price;return m;},
  restaurant_menu_customize:a=>{const m=menu.find(m=>m.id===a.p_id);Object.assign(m,{sizes_enabled:a.p_sizes_enabled,price:a.p_base_price,size_prices:a.p_size_prices||{},size_labels:a.p_size_labels||{},updated_at:now()});return m;},
  restaurant_add_menu_item66:a=>{menu.push({...a.p_row,sizes_enabled:false,size_prices:{},size_labels:{},updated_at:now(),stock:{tracked:false,remaining:0}});return a.p_row;},
  restaurant_import_menu67:a=>({ok:true,created:(a.p_rows||[]).length,updated:0}),
  restaurant_manual_order:a=>{const o={id:'o'+Date.now(),order_id:'MAN-'+(orders.length+1),daily_number:orders.length+40,table_number:'Counter',customer_name:a.p_name,created_at:now(),updated_at:now(),status:'Served',order_source:'manual',payment_method:a.p_payment_method,items:a.p_items.map(i=>{const m=menu.find(m=>m.id===i.id);const price=i.custom?i.price:(i.size?m.size_prices[i.size]:m.price);return {id:i.id,size:i.size,name:i.custom?i.name:m.name,qty:i.qty,price,subtotal:price*i.qty};}),tax_amount:0};o.total=o.items_subtotal=o.items.reduce((n,i)=>n+i.subtotal,0);orders.push(o);bump();return o;},
  restaurant_set_record_payment59:a=>{const o=orders.find(o=>o.id===a.p_order);o.payment_method=a.p_payment_method;return o;},
  restaurant_egress_checkpoint48:()=>({ok:true}),
  restaurant_push_diagnostics:()=>({devices:0}),
  restaurant_waiter_status:()=>({}),
 };
 // v19: invoice numbers, one-call records/dashboard, counter discounts, private settings, waiter phones.
 let invNo=0,priv={},phones={};const inv=()=>'INV'+String(++invNo).padStart(3,'0');
 for(const o of orders)if(o.status==='Served'&&!o.invoice_no)o.invoice_no=inv();
 const day=o=>(o.order_day||o.created_at.slice(0,10)),payOf=o=>o.payment_method==='Online'?'UPI':o.payment_method||'Not recorded',done=o=>['Served','Cancelled','Rejected'].includes(o.status);
 const baseMO=rpc.restaurant_manual_order;rpc.restaurant_manual_order=a=>{const o=baseMO(a);const row=orders.find(x=>x.id===o.id)||o;if(!row.invoice_no)row.invoice_no=inv();return {...o,invoice_no:row.invoice_no};};
 rpc.restaurant_invoice19=()=>({prefix:'INV',digits:3,start_month:4,year:'2026-27',next:invNo+1,next_text:'INV'+String(invNo+1).padStart(3,'0'),can_edit:(opts.role||'admin')==='admin'});
 rpc.restaurant_bills19=a=>{const q=String(a.p_query||'').toLowerCase(),base=orders.filter(o=>done(o)&&day(o)>=a.p_from&&day(o)<=a.p_to),st=o=>o.status==='Served'?'Paid':'Cancelled';
  const hit=base.filter(o=>(!a.p_status||a.p_status==='all'||st(o)===a.p_status)&&(!a.p_payment||a.p_payment==='all'||payOf(o)===a.p_payment)&&(!q||[o.order_id,o.invoice_no,o.customer_name,'#'+o.daily_number,o.table_number].join(' ').toLowerCase().includes(q))).sort((x,y)=>y.created_at.localeCompare(x.created_at));
  const paid=base.filter(o=>st(o)==='Paid'),sum=(l,f=()=>true)=>l.filter(f).reduce((n,o)=>n+Number(o.total),0);
  return {total:hit.length,rows:hit.slice(a.p_offset||0,(a.p_offset||0)+(a.p_limit||50)),summary:{sales:sum(paid),bills:paid.length,cancelled:base.length-paid.length,cash:sum(paid,o=>payOf(o)==='Cash'),upi:sum(paid,o=>payOf(o)==='UPI'),card:0}};};
 rpc.restaurant_dashboard19=a=>{const base=orders.filter(o=>done(o)&&day(o)>=a.p_from&&day(o)<=a.p_to),paid=base.filter(o=>o.status==='Served'),sales=paid.reduce((n,o)=>n+Number(o.total),0);
  const lines=paid.flatMap(o=>o.items||[]),top=new Map();for(const i of lines){const t=top.get(i.name)||{name:i.name,unit:'pcs',qty:0,revenue:0};t.qty+=Number(i.qty);t.revenue+=Number(i.subtotal??i.qty*i.price);top.set(i.name,t);}
  const cat=new Map();for(const i of lines){const c=(menu.find(m=>m.id===i.id)||{}).category||'Other',t=cat.get(c)||{category:c,qty:0,revenue:0};t.qty+=Number(i.qty);t.revenue+=Number(i.subtotal??i.qty*i.price);cat.set(c,t);}
  const tr=new Map();for(const o of paid){const k=day(o);tr.set(k,(tr.get(k)||0)+Number(o.total));}
  const pay=new Map();for(const o of paid){const k=o.payment_method||null,t=pay.get(k)||{method:k,amount:0,bills:0};t.amount+=Number(o.total);t.bills++;pay.set(k,t);}
  return {metrics:{sales,bills:paid.length,cancelled:base.length-paid.length,cancelled_value:base.filter(o=>o.status!=='Served').reduce((n,o)=>n+Number(o.total),0),avg_bill:paid.length?sales/paid.length:0,qty:lines.reduce((n,i)=>n+Number(i.qty),0),discount:paid.reduce((n,o)=>n+Number(o.discount_amount||0),0),tax:0,prev_sales:0,prev_bills:0},trend_unit:'day',trend:[...tr].sort().map(([key,s])=>({key,sales:s,bills:0})),payments:[...pay.values()],top_items:[...top.values()].sort((x,y)=>y.revenue-x.revenue).slice(0,10),categories:[...cat.values()].sort((x,y)=>y.revenue-x.revenue)};};
 rpc.restaurant_private19=a=>{if(a.p_data)priv[a.p_key]=a.p_data;return priv[a.p_key]||{};};
 rpc.restaurant_staff_phone19=a=>{if(a.p_user){if(a.p_clear)delete phones[a.p_user];else phones[a.p_user]=String(a.p_phone).replace(/\D/g,'').slice(-10);}return phones;};
 rpc.restaurant_counter_bill19=a=>{const o=rpc.restaurant_manual_order(a),row=orders.find(x=>x.id===o.id)||o,sub=Number(row.items_subtotal||row.total),v=Number(a.p_discount_value)||0;
  let disc=v>0?(a.p_discount_mode==='amount'?Math.min(v,sub):Math.round(sub*Math.min(v,100))/100):0,fin=sub-disc;
  if(a.p_payment_method==='Cash'&&Number(a.p_cash_received)>0&&Number(a.p_cash_received)<fin){disc+=fin-Number(a.p_cash_received);fin=Number(a.p_cash_received);}
  row.discount_amount=disc;row.total=fin;return {...o,discount_amount:disc,total:fin,invoice_no:row.invoice_no};};
 rpc.restaurant_login_email19=()=>null;
 let docsStore=[],addonOn=true;
 rpc.workspace_docs_list=a=>{if(!addonOn){const e=Error('Could not find the function public.workspace_docs_list in the schema cache');e.status=404;throw e;}const l=docsStore.filter(d=>d.kind===a.p_kind&&(!a.p_from||d.doc_day>=a.p_from)&&(!a.p_to||d.doc_day<=a.p_to)&&(!a.p_ref||d.data.ref===a.p_ref)).sort((x,y)=>String(y.doc_day).localeCompare(String(x.doc_day))||y.created_at.localeCompare(x.created_at));return {role:'admin',total:l.length,rows:l.slice(a.p_offset||0,(a.p_offset||0)+(a.p_limit||200))};};
 rpc.workspace_doc_save=a=>{if(!addonOn){const e=Error('Could not find the function');e.status=404;throw e;}const id=a.p_id||('doc-'+Math.random().toString(36).slice(2));let d=docsStore.find(x=>x.id===id);if(d){if(!a.p_insert_only){d.data=a.p_data;d.doc_day=a.p_day;}}else{d={id,kind:a.p_kind,data:a.p_data,doc_day:a.p_day,created_at:now(),updated_at:now()};docsStore.push(d);}return d;};
 rpc.workspace_doc_delete=a=>{docsStore=docsStore.filter(d=>d.id!==a.p_id);return {deleted:1};};
 return {setAddon:v=>{addonOn=v},get docs(){return docsStore},state:{menu,orders,get tables(){return tables},get calls(){return calls},get custom(){return custom}},
  handle(method,path,body){
   if(path.startsWith('/auth/v1/token'))return {access_token:'tok-'+Date.now(),refresh_token:'ref-'+Date.now(),expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:{id:'u-admin',email:'owner@yummy.test'}};
   if(path.startsWith('/auth/v1/logout'))return {};
   if(path.startsWith('/rest/v1/staff_users'))return [{role:opts.role||'admin'}];
   if(path.startsWith('/rest/v1/menu_items')){if(method==='PATCH'){const id=decodeURIComponent(path.match(/id=eq\.([^&]+)/)[1]);const m=menu.find(m=>m.id===id);Object.assign(m,body);return [m];}return menu;}
   if(path.startsWith('/rest/v1/song_requests'))return [];
   const m=path.match(/^\/rest\/v1\/rpc\/([a-z0-9_]+)/);
   if(m){const fn=rpc[m[1]];if(!fn){log('UNMOCKED RPC '+m[1]+' '+JSON.stringify(body).slice(0,200));return {};}return fn(body||{});}
   log('UNMOCKED '+method+' '+path);return {};
  }};
};
