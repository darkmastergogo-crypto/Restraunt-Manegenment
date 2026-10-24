/* Shared cloud API. No n8n, no local-only order fallback, no service-role keys. */
'use strict';
const Cloud = (() => {
 const cfg=typeof RESTAURANT_CONFIG==='undefined'?{}:RESTAURANT_CONFIG;
 const url=String(cfg.supabaseUrl||'').replace(/\/$/,'');
 const key=String(cfg.supabaseAnonKey||'');
 let publicKey=key.startsWith('sb_publishable_');
 if(key.startsWith('eyJ')){try{publicKey=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role==='anon';}catch{}}
 const configured=publicKey && /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) && key.length>20 && !/YOUR_|PASTE_/i.test(key+url);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const safeImage=v=>typeof v==='string' && (/^https:\/\//i.test(v)||/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v))?v:'';
 const read=(k,f)=>{try{return JSON.parse(localStorage.getItem(k)||'null')??f;}catch{return f;}};
 const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{throw Error('Browser storage is unavailable. Enable storage before ordering.');}};
 try{localStorage.removeItem('RESTAURANT_STAFF_SESSION_v2');}catch{}
 let session=null;try{session=JSON.parse(sessionStorage.getItem('RESTAURANT_STAFF_SESSION_v3')||'null');}catch{}
 let refreshPromise=null;
 const reads46=new Map(),inflight46=new Map(),cooldowns46=new Map(),jobs46=new Map();
 let cacheGeneration46=0;
 const clone46=value=>JSON.parse(JSON.stringify(value));
 function clearPrivate46(){cacheGeneration46++;reads46.clear();inflight46.clear();cooldowns46.clear();orderCache=null;for(const k of Object.keys(menuCache))delete menuCache[k];tableNames.clear();document.dispatchEvent(new Event('restaurant-private-cache-clear'));}
 function schedule(name,work,period,{essential=false}={}){
  const job={work,period,essential,due:Date.now()+period,busy:false};jobs46.set(name,job);
  return ()=>jobs46.delete(name);
 }
 async function tick46(){
  if(navigator.onLine===false||document.hidden)return;
  const now=Date.now();for(const job of jobs46.values()){
   if(job.busy||now<job.due)continue;job.busy=true;job.due=now+job.period;
   Promise.resolve().then(job.work).catch(()=>{}).finally(()=>{job.busy=false;job.due=Date.now()+job.period;});
  }
 }
 setInterval(tick46,1000);
 for(const event of ['online','visibilitychange']) (event==='online'?window:document).addEventListener(event,()=>{
  if(!document.hidden&&navigator.onLine!==false){for(const j of jobs46.values())j.due=Date.now()+Math.random()*800;}
 });
 // No catch-up queue, no write retries. Failed reads get an endpoint cooldown.
 const retryable46=e=>e?.name==='TypeError'||e?.code==='ETIMEDOUT'||[408,425,429].includes(e?.httpStatus)||e?.httpStatus>=500;
 async function singleRead46(id,work){
  if(inflight46.has(id))return inflight46.get(id);
  const cool=cooldowns46.get(id);if(cool?.until>Date.now())throw cool.error;
  const generation=cacheGeneration46;
  const promise=Promise.resolve().then(work).then(v=>{if(generation!==cacheGeneration46)throw Error('Account changed. Refresh this screen.');cooldowns46.delete(id);return v;}).catch(e=>{
   if(retryable46(e)){const failures=(cool?.failures||0)+1;cooldowns46.set(id,{failures,error:e,until:Date.now()+Math.max(e.retryAfterMs||0,Math.min(60000,1000*2**Math.min(failures,6))*(.75+Math.random()*.5))});}
   else reads46.delete(id);throw e;
  }).finally(()=>{if(inflight46.get(id)===promise)inflight46.delete(id);});
  inflight46.set(id,promise);return promise;
 }
 const scope46=staff=>staff?'staff:'+String(session?.user?.id||'none')+':'+String(session?.access_token||''):'capability';
 const readNames46=new Set(['restaurant_requests','restaurant_table_names','restaurant_alert_settings','restaurant_manager_permissions','restaurant_stock_alerts','restaurant_notifications','restaurant_order_devices','restaurant_order_loyalty','restaurant_filtered_records','restaurant_records']);
 function isRead46(name,body){return readNames46.has(name)&&(!body.p_action||body.p_action==='list')&&!('p_settings' in body)&&!('p_customer_devices' in body)&&!('p_order_device_block' in body);}
 async function revisionRead46(name,body,staff){
  if(staff&&session&&session.expires_at*1000<Date.now()+60000)await refresh();
  const id=scope46(staff)+':'+name+':'+JSON.stringify(body);
  return clone46(await singleRead46(id,async()=>{
   const old=reads46.get(id),generation=cacheGeneration46;
   const result=await request('/rest/v1/rpc/restaurant_read_sync46',{method:'POST',staff,body:{p_name:name,p_args:body,p_known:old?.revision||null}});
   if(generation!==cacheGeneration46)throw Error('Account changed.');
   const value=Object.hasOwn(result,'data')?result.data:old?.value;
   if(value===undefined)throw Error('Missing initial sync snapshot. Reload this page.');
   if(reads46.size>100)reads46.delete(reads46.keys().next().value);reads46.set(id,{revision:result.revision,value});return value;
  }));
 }
 function requireConfig(){if(!configured)throw Error('Cloud not configured. The owner must upload config.js with the Supabase Project URL and PUBLIC key.');}
 async function request(path,{method='GET',body,staff=false,headers={}}={}) {
  requireConfig();
  if(staff){if(!session)throw Error('Please sign in as staff.');if(session.expires_at*1000<Date.now()+60000)await refresh();}
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),15000);
  try {
   const res=await fetch(url+path,{method,headers:{apikey:key,...(staff?{Authorization:'Bearer '+session.access_token}:key.startsWith('eyJ')?{Authorization:'Bearer '+key}:{}),'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal,cache:'no-store'});
   const text=await res.text();let data;try{data=JSON.parse(text);}catch{data=text;}
   if(!res.ok){const error=Error(data?.message||data?.msg||data?.error_description||data?.error||('Cloud request failed (HTTP '+res.status+').'));if(staff&&[401,403].includes(res.status))clearPrivate46();error.httpStatus=res.status;const retry=res.headers.get('Retry-After');error.retryAfterMs=retry?(/^\d+(\.\d+)?$/.test(retry)?Number(retry)*1000:Math.max(0,Date.parse(retry)-Date.now())):0;throw error;}
   return data;
  }catch(e){if(e.name==='AbortError'){const timeout=Error('Cloud request timed out. Check your connection and retry.');timeout.code='ETIMEDOUT';throw timeout;}throw e;}finally{clearTimeout(timer);}
 }
 function saveSession(s){if(session?.user?.id!==s.user?.id||session?.access_token!==s.access_token)clearPrivate46();session={...s,expires_at:s.expires_at||Math.floor(Date.now()/1000)+(s.expires_in||3600)};sessionStorage.setItem('RESTAURANT_STAFF_SESSION_v3',JSON.stringify(session));return session;}
 async function refresh(){if(!refreshPromise)refreshPromise=request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token}}).then(saveSession).catch(e=>{clearPrivate46();session=null;try{sessionStorage.removeItem('RESTAURANT_STAFF_SESSION_v3');}catch{}throw e;}).finally(()=>refreshPromise=null);return refreshPromise;}
 async function login(email,password){return saveSession(await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}}));}
 async function logout(){try{if(session)await request('/auth/v1/logout',{method:'POST',staff:true});}finally{clearPrivate46();session=null;sessionStorage.removeItem('RESTAURANT_STAFF_SESSION_v3');}}
 const menuCache={};let orderCache=null;
 async function orders({compact=false}={}){
  if(session&&session.expires_at*1000<Date.now()+60000)await refresh();
  const mode=compact?'compact':'full',id=scope46(true)+':active-orders:'+mode;
  return clone46(await singleRead46(id,async()=>{
   const generation=cacheGeneration46;
   const result=await request('/rest/v1/rpc/restaurant_orders_sync46',{method:'POST',staff:true,body:{p_known:orderCache?.[mode]?.revision||null,p_compact:compact}});
   if(generation!==cacheGeneration46)throw Error('Account changed.');
   if(result.rows){orderCache ||= {};orderCache[mode]={revision:result.revision,rows:result.rows};}
   if(!orderCache?.[mode])throw Error('Missing active-order snapshot.');return orderCache[mode].rows;
  }));
 }
 async function menu(staff,access=null){
  if(staff&&session&&session.expires_at*1000<Date.now()+60000)await refresh();
  if(!staff&&!access)access=await TableAccess.credentials(false);
  const id=scope46(staff)+':menu:'+JSON.stringify(access||{});
  return clone46(await singleRead46(id,async()=>{
   const previous=menuCache[id],generation=cacheGeneration46;
   const result=await request('/rest/v1/rpc/restaurant_menu_sync46',{method:'POST',staff,body:{p_staff:!!staff,p_known:previous?.revisions||{},...(!staff?{...access,p_table:currentTable}:{})}});
   if(generation!==cacheGeneration46)throw Error('Account changed.');
   if(result.schema!==46)throw Error('Sync schema changed. Reload this page; do not retry an uncertain order with a new identity.');
   const next={catalog:result.catalog||previous?.catalog,stock:result.stock||previous?.stock,commerce:result.commerce||previous?.commerce,revisions:result.revisions};
   if(!next.catalog||!next.stock)throw Error('Missing menu snapshot.');
   menuCache[id]=next;
   const state=new Map(next.stock.map(row=>[row.id,row]));
   const rows=next.catalog.map(row=>({...row,...state.get(row.id)})).filter(row=>staff||row.available);
   if(!staff&&next.commerce&&typeof applyCommerce==='function')applyCommerce(next.commerce);
   return rows;
  }));
 }
 const directReads46=new Set(['restaurant_receipt_sync46','restaurant_get_device_orders','restaurant_open_device_visit','restaurant_customer_commerce','restaurant_stocks','restaurant_public_review_settings','restaurant_customer_waiter_status','restaurant_waiter_call_status']);
 const rpc=(name,body={},staff=false)=>isRead46(name,body)?revisionRead46(name,body,staff):directReads46.has(name)?singleRead46(scope46(staff)+':'+name+':'+JSON.stringify(body),()=>request('/rest/v1/rpc/'+name,{method:'POST',body,staff})):request('/rest/v1/rpc/'+name,{method:'POST',body,staff});
 async function waiterSync(key,compact=false){
  const id='waiter:'+key+':'+(compact?'compact':'full');
  return clone46(await singleRead46(id,async()=>{
   const previous=reads46.get(id);
   const result=await request('/rest/v1/rpc/restaurant_waiter_sync46',{method:'POST',body:{p_key:key,p_known:previous?.revision||null,p_compact:compact}});
   const value={...result,orders:result.orders||previous?.value?.orders||[]};if(reads46.size>100)reads46.delete(reads46.keys().next().value);reads46.set(id,{revision:result.revision,value});return value;
  }));
 }
 async function uploadMenuImage(data){
  if(!data||!data.startsWith('data:'))return data||'';
  if(!/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(data))throw Error('Use a WebP thumbnail from the crop tool.');
  const bytes=Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0));
  if(bytes.length>184320)throw Error('Thumbnail exceeds 180 KiB.');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
  const path='v46/'+hash+'.webp',objectUrl=url+'/storage/v1/object/public/menu-thumbnails/'+path;
  if(!session)throw Error('Staff sign-in required.');if(session.expires_at*1000<Date.now()+60000)await refresh();
  const response=await fetch(url+'/storage/v1/object/menu-thumbnails/'+path,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+session.access_token,'Content-Type':'image/webp','Cache-Control':'max-age=31536000','x-upsert':'false'},body:bytes,signal:AbortSignal.timeout(20000)});
  if(!response.ok&&![400,409].includes(response.status))throw Error('Thumbnail upload failed. Existing photo is unchanged.');
  // Byte-level verification, including when the immutable content already exists.
  const verify=await fetch(objectUrl,{cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!verify.ok)throw Error('Thumbnail is not publicly accessible. Existing photo is unchanged.');
  const received=new Uint8Array(await verify.arrayBuffer());
  const check=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',received))).map(v=>v.toString(16).padStart(2,'0')).join('');
  if(check!==hash)throw Error('Thumbnail verification failed. Existing photo is unchanged.');
  return objectUrl;
 }
 async function imageRows46(rows){return Promise.all(rows.map(async row=>({...row,...(Object.hasOwn(row,'image')?{image:await uploadMenuImage(row.image)}:{})})));}
 const categories=[...(cfg.categories||['All','Steamed Momos','Fried Momos','Kurkure Momos','Tandoori Momos','Chutney & Dips','Drinks','Desserts'])];
 const normalizeCategory=v=>String(v||'').trim();
 const setCategories=names=>{categories.splice(0,categories.length,'All',...names);};
 function menuRow(item){return {id:String(item.id??crypto.randomUUID()),name:String(item.name||'').slice(0,120),price:Number(item.price)||0,category:normalizeCategory(item.category),description:String(item.description??item.desc??'').slice(0,1000),image:safeImage(item.photo||item.image||''),veg:item.veg!==false,available:item.available!==false,recommended:item.recommended===true,best_seller:item.best_seller===true,updated_at:new Date().toISOString()};}
 const tableNames=new Map();let tableNamesBusy=null;
 const tableName=code=>{const id=String(code??'');return tableNames.get(id)||(['COUNTER','Counter','RECEPTION'].includes(id)?'Counter':id?'Table '+id:'Table');};
 function setTableNames(rows){let changed=false;for(const row of rows||[]){const name=String(row.display_name||('Table '+row.table_number));if(tableNames.get(row.table_number)!==name){tableNames.set(row.table_number,name);changed=true;}}if(changed)document.dispatchEvent(new Event('restaurant-table-names'));return changed;}
 async function refreshTableNames({staff=false,table=null,key=null}={}){if(tableNamesBusy)return tableNamesBusy;tableNamesBusy=rpc('restaurant_table_names',{p_table:table,p_waiter_key:key},staff).then(rows=>{setTableNames(rows);return rows;}).finally(()=>tableNamesBusy=null);return tableNamesBusy;}
 const orderLabel=o=>Number.isSafeInteger(Number(o?.daily_number))&&Number(o.daily_number)>0?'Order no. '+Number(o.daily_number):'Order number pending sync';
 return {schedule,waiterSync,clearPrivate46,uploadMenuImage,cfg,configured,tableName,setTableNames,refreshTableNames,orderLabel,esc,safeImage,read,write,categories,setCategories,normalizeCategory,menuRow,rpc,request,login,logout,hasSession:()=>!!session,
  mfaFactors:async()=>{const user=await request('/auth/v1/user',{staff:true});return (user.factors||[]).filter(f=>f.factor_type==='totp');},
  mfaEnroll:()=>request('/auth/v1/factors',{method:'POST',body:{factor_type:'totp',friendly_name:'Yummy Momo admin '+new Date().toISOString(),issuer:'Yummy Momo'},staff:true}),
  mfaUnenrollPending:id=>request('/auth/v1/factors/'+encodeURIComponent(id),{method:'DELETE',staff:true}),
  mfaVerify:async(id,code)=>{
   if(!/^[0-9]{6}$/.test(code))throw Error('Enter the six-digit code from your authenticator app.');
   const challenge=await request('/auth/v1/factors/'+encodeURIComponent(id)+'/challenge',{method:'POST',body:{},staff:true});
   const tokens=await request('/auth/v1/factors/'+encodeURIComponent(id)+'/verify',{method:'POST',body:{challenge_id:challenge.id,code},staff:true});
   if(!tokens.access_token||!tokens.refresh_token)throw Error('Verification did not return a valid session. Sign in again.');
   saveSession(tokens);
  },
  role:async()=>{const data=await request('/rest/v1/staff_users?select=role&user_id=eq.'+session.user.id,{staff:true});if(!data[0])throw Error('This account has no staff access. Ask the owner to add it to staff_users.');return data[0].role;},
  menu,
  saveMenu:async rows=>request('/rest/v1/menu_items?on_conflict=id',{method:'POST',body:await imageRows46(rows),staff:true,headers:{Prefer:'resolution=merge-duplicates,return=minimal'}}),
  patchMenu:async(id,body)=>request('/rest/v1/menu_items?id=eq.'+encodeURIComponent(id),{method:'PATCH',body:(await imageRows46([body]))[0],staff:true,headers:{Prefer:'return=minimal'}}),
  deleteMenu:id=>request('/rest/v1/menu_items?id=eq.'+encodeURIComponent(id),{method:'DELETE',staff:true}),
  orders,invalidateOrders:()=>{orderCache=null;},
  records:(period,reference,offset=0,limit=50)=>rpc('restaurant_records',{p_period:period,p_reference:reference||null,p_offset:offset,p_limit:limit},true),
  songs:()=>request('/rest/v1/song_requests?select=id,queue_no,created_at,updated_at,table_number,title,artist,song_url,status&status=in.(Queued,Playing)&order=queue_no.asc&limit=500',{staff:true}),
  playedSongs:()=>request('/rest/v1/song_requests?select=id,queue_no,created_at,finished_at,table_number,title,artist,status&status=eq.Played&order=finished_at.desc&limit=20',{staff:true})
 };
})();
