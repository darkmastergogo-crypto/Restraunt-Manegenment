'use strict';
/* config.js?v=19 */
;/* =====================================================================
   SHOP BILLING — per-shop configuration
   Edit this one file for each shop you set up. Use only the PUBLIC
   (publishable / anon) key here. Never paste the service_role key.
   Support contact, branding, payments and permissions are set inside
   the app by the Admin login (Admin tab), not here.
   ===================================================================== */
const SHOP_CONFIG = {
  // Supabase → Project Settings → API
  supabaseUrl: RESTAURANT_CONFIG.supabaseUrl,
  supabaseAnonKey: RESTAURANT_CONFIG.supabaseAnonKey,

  // Shown on the sign-in screen only until the shop's own name loads.
  shopName: RESTAURANT_CONFIG.restaurantName || 'My Restaurant',

  // Country code used for "Send on WhatsApp" when a 10-digit phone is entered.
  whatsappCountryCode: "91"
};

/* compat.js */
;/* UUID generation for older WebViews and local HTTP previews. */
if(typeof crypto.randomUUID!=='function')crypto.randomUUID=()=>{
 const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
 const s=Array.from(b,n=>n.toString(16).padStart(2,'0')).join('');
 return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20);
};

/* restaurant-cloud.js?v=19 */
;/* Shared cloud API. No n8n, no local-only order fallback, no service-role keys. */
'use strict';
const RestaurantCloud = (() => {
 const cfg=typeof RESTAURANT_CONFIG==='undefined'?{}:RESTAURANT_CONFIG;
 const url=String(cfg.supabaseUrl||'').replace(/\/$/,'');
 const key=String(cfg.supabaseAnonKey||'');
 let publicKey=key.startsWith('sb_publishable_');
 if(key.startsWith('eyJ')){try{publicKey=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role==='anon';}catch{}}
 const configured=publicKey && /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) && key.length>20 && !/YOUR_|PASTE_/i.test(key+url);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const safeImage=v=>typeof v==='string' && (/^https:\/\//i.test(v)||/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v))?v:'';
 // Release58: true deferred public menu images. `data-low-src` never starts a
 // network request; the real `src` is assigned only as the image approaches
 // the viewport. This is stricter than native loading=lazy and keeps unseen
 // category/dish photos at zero image egress for that visit.
 let lowImageObserver=null;
 function deferImages(root=document){
  if(!root)return;
  const images=[];
  if(root.matches?.('img[data-low-src]'))images.push(root);
  if(root.querySelectorAll)images.push(...root.querySelectorAll('img[data-low-src]'));
  if(!images.length)return;
  const load=img=>{
   const source=safeImage(img.dataset.lowSrc||'');
   if(!source){img.removeAttribute('data-low-src');return;}
   img.loading='lazy';img.decoding='async';try{img.fetchPriority='low';}catch{}
   if(img.getAttribute('src')!==source)img.setAttribute('src',source);
   img.removeAttribute('data-low-src');img.removeAttribute('data-low-observed');
   lowImageObserver?.unobserve(img);
  };
  if(!('IntersectionObserver' in window)){images.forEach(load);return;}
  if(!lowImageObserver)lowImageObserver=new IntersectionObserver(entries=>{
   for(const entry of entries)if(entry.isIntersecting)load(entry.target);
  },{root:null,rootMargin:'160px 0px',threshold:0.01});
  for(const img of images){
   img.loading='lazy';img.decoding='async';try{img.fetchPriority='low';}catch{}
   if(img.dataset.lowObserved==='1')continue;
   img.dataset.lowObserved='1';lowImageObserver.observe(img);
  }
 }
 // Schema46 persistent journals are project-scoped. Adopt legacy state only for the
 // first project using this origin; keep legacy copies for old tabs and rollback.
 let legacyProject='';try{legacyProject=localStorage.getItem('YUMMY46_LEGACY_PROJECT')||url;if(url&&!localStorage.getItem('YUMMY46_LEGACY_PROJECT'))localStorage.setItem('YUMMY46_LEGACY_PROJECT',url);}catch{}
 const privateKey=(k,staff=false)=>'YUMMY46:'+url+':'+(staff?'staff:'+String(session?.user?.id||'signed-out'):'public-device')+':'+k;
 const localKey=k=>'YUMMY46:'+url+':device:'+k;
 const read=(k,f)=>{try{const saved=localStorage.getItem(localKey(k))??(legacyProject===url?localStorage.getItem(k):null);return JSON.parse(saved||'null')??f;}catch{return f;}};
 const write=(k,v)=>{try{const text=JSON.stringify(v);localStorage.setItem(localKey(k),text);if(legacyProject===url)localStorage.setItem(k,text);}catch{throw Error('Browser storage is unavailable. Enable storage before ordering.');}};
 const remove=k=>{localStorage.removeItem(localKey(k));if(legacyProject===url)localStorage.removeItem(k);};
 let session=null,legacyStaffOwner='';
 // v19: one staff sign-in shared by every staff screen in this browser — tabs, the hidden alert engine and
 // reopening the app. Refreshes are serialised across all of them (Web Locks + shared storage), so a refresh
 // token is never spent twice. Spending one twice makes Supabase revoke the whole sign-in ("Refresh Token Not Found").
 const PERSIST=typeof window!=='undefined'&&window.RESTAURANT_STAFF_PERSIST===true;
 const SESSION_KEY='YUMMY46:'+url+':staff-session-v19';
 const stored=()=>{if(!PERSIST)return null;try{const s=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');return s?.access_token&&s?.refresh_token&&s?.user?.id?s:null;}catch{return null;}};
 const store=s=>{if(!PERSIST)return;try{s?localStorage.setItem(SESSION_KEY,JSON.stringify(s)):localStorage.removeItem(SESSION_KEY);}catch{}};
 const ended=reason=>{try{dispatchEvent(new CustomEvent('restaurant:session-ended',{detail:reason||''}));}catch{}};
 const authError=()=>Object.assign(Error('Your sign-in ended. Sign in again.'),{code:'AUTH',httpStatus:401});
 try{session=stored()||JSON.parse(sessionStorage.getItem(privateKey('RESTAURANT_STAFF_SESSION_v3'))||(legacyProject===url?sessionStorage.getItem('RESTAURANT_STAFF_SESSION_v3'):null)||'null');legacyStaffOwner=localStorage.getItem('YUMMY46_LEGACY_STAFF:'+url)||session?.user?.id||'';if(legacyStaffOwner)localStorage.setItem('YUMMY46_LEGACY_STAFF:'+url,legacyStaffOwner);}catch{}
 if(PERSIST&&session&&!stored())store(session);
 const canAdoptSession=staff=>legacyProject===url&&(!staff||session?.user?.id===legacyStaffOwner);
 function sessionRead(k,f=null,staff=false){try{return JSON.parse(sessionStorage.getItem(privateKey(k,staff))||(canAdoptSession(staff)?sessionStorage.getItem(k):null)||'null')??f;}catch{return f;}}
 function sessionWrite(k,v,staff=false){const text=JSON.stringify(v);sessionStorage.setItem(privateKey(k,staff),text);if(canAdoptSession(staff))sessionStorage.setItem(k,text);}
 function sessionRemove(k,staff=false){sessionStorage.removeItem(privateKey(k,staff));if(canAdoptSession(staff))sessionStorage.removeItem(k);}
 try{localStorage.removeItem('RESTAURANT_STAFF_SESSION_v2');}catch{}
 let refreshPromise=null;
 function requireConfig(){if(!configured)throw Error('Cloud not configured. The owner must upload config.js with the Supabase Project URL and PUBLIC key.');}
 async function transport(path,{method='GET',body,staff=false,headers={},raw=false,retried=false}={}) {
  requireConfig();
  if(staff){if(!session){ended('missing');throw authError();}if(session.expires_at*1000<Date.now()+60000)await refresh();}
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),15000);
  let res;
  try {
   res=await fetch(url+path,{method,headers:{apikey:key,...(staff?{Authorization:'Bearer '+session.access_token}:key.startsWith('eyJ')?{Authorization:'Bearer '+key}:{}),'Content-Type':'application/json',...headers},body:body===undefined?undefined:(raw?body:JSON.stringify(body)),signal:controller.signal,cache:'no-store'});
   const text=await res.text();let data;try{data=JSON.parse(text);}catch{data=text;}
   if(!res.ok){const error=Error(data?.message||data?.msg||data?.error_description||data?.error||('Cloud request failed (HTTP '+res.status+').'));error.httpStatus=res.status;const retry=res.headers.get('Retry-After');error.retryAt=retry?(isNaN(Number(retry))?Date.parse(retry):Date.now()+Number(retry)*1000):0;throw error;}
   return data;
  }catch(e){
   if(e.name==='AbortError'){const timeout=Error('The connection is slow and the request timed out. Try again.');timeout.code='ETIMEDOUT';throw timeout;}
   if(e instanceof TypeError&&!res){const offline=Error(navigator.onLine===false?'You are offline. Check the internet and try again.':'Could not reach the server. Check the internet and try again.');offline.code='NETWORK';throw offline;}
   // An expired access token (phone asleep, clock drift): renew once and repeat the same call.
   if(staff&&e.httpStatus===401&&!retried&&!path.startsWith('/auth/')&&session){clearTimeout(timer);await refresh(true);return transport(path,{method,body,staff,headers,raw,retried:true});}
   if(staff&&e.httpStatus===401&&retried&&!path.startsWith('/auth/')){session=null;store(null);clearPrivate();ended('rejected');throw authError();}
   throw e;
  }finally{clearTimeout(timer);}
 }
 function saveSession(s,ephemeral=!!(session?.ephemeral&&session?.user?.id===s?.user?.id)){
  if(session?.user?.id!==s.user?.id)clearPrivate();
  session={...s,expires_at:s.expires_at||Math.floor(Date.now()/1000)+(s.expires_in||3600)};
  if(ephemeral)session.ephemeral=true;else{delete session.ephemeral;if(PERSIST)store(session);else sessionWrite('RESTAURANT_STAFF_SESSION_v3',session);}
  return session;
 }
 function refresh(force=false){
  if(refreshPromise)return refreshPromise;
  const run=async()=>{
   if(!session)throw authError();
   const fresh=s=>s.expires_at*1000>Date.now()+60000;
   const latest=session.ephemeral?null:stored();
   if(latest&&latest.user.id===session.user.id&&latest.refresh_token!==session.refresh_token){session=latest;if(fresh(latest))return session;}
   else if(!force&&fresh(session))return session;
   try{return saveSession(await transport('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token}}));}
   catch(e){
    if(!(e.httpStatus>=400&&e.httpStatus<500))throw e; // offline or server busy: keep the sign-in and try again later
    const again=session?.ephemeral?null:stored();
    if(session&&again&&again.user.id===session.user.id&&again.refresh_token!==session.refresh_token){session=again;return session;}
    session=null;store(null);try{sessionRemove('RESTAURANT_STAFF_SESSION_v3');}catch{}clearPrivate();ended('expired');throw authError();
   }
  };
  refreshPromise=(PERSIST&&navigator.locks?.request?navigator.locks.request(SESSION_KEY,run):run()).finally(()=>{refreshPromise=null;});
  return refreshPromise;
 }
 if(PERSIST){
  addEventListener('storage',e=>{if(e.key!==SESSION_KEY||session?.ephemeral)return;const next=stored();
   if(!next){if(session){session=null;clearPrivate();ended('signed-out');}return;}
   if(session?.user?.id!==next.user.id)clearPrivate();session=next;});
  const keepFresh=()=>{if(!document.hidden&&navigator.onLine!==false&&session&&!session.ephemeral&&session.expires_at*1000<Date.now()+300000)refresh().catch(()=>{});};
  setInterval(keepFresh,60000);document.addEventListener('visibilitychange',keepFresh);addEventListener('online',keepFresh);
 }
 async function login(email,password,{keep=true}={}){return saveSession(await transport('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}}),!keep);}
 async function logout(){const s=session;try{if(s)await transport('/auth/v1/logout?scope=local',{method:'POST',staff:true});}catch{}finally{session=null;if(!s?.ephemeral){store(null);try{sessionRemove('RESTAURANT_STAFF_SESSION_v3');}catch{}}clearPrivate();}}
 // Caches are memory-only and partitioned by project, account and capability scope.
 // No receipt tokens or staff responses enter public HTTP/Service Worker caches.
 const menuCache=new Map();let orderCache=null;let cacheEpoch=0;
 const pendingReads=new Map(),failures=new Map();
 const readRPC=new Set(['restaurant_menu_sync47','restaurant_active_sync47','restaurant_receipt_sync47','restaurant_staff_pulse47','restaurant_waiter_sync47','restaurant_table_names','restaurant_get_device_orders','restaurant_order_loyalty','restaurant_staff_menu','restaurant_customer_menu','restaurant_open_device_visit','restaurant_requests_page47','restaurant_manual_menu','restaurant_sales_analytics','restaurant_recent_cancelled','restaurant_dish_sales','restaurant_filtered_records','restaurant_records','restaurant_waiter_public56','restaurant_staff_menu_page63','restaurant_staff_menu_item63','restaurant_manual_menu_page63','restaurant_sales_analytics_section63']);
 function scope(){return url+'|'+(session?.user?.id||'customer');}
 function clearPrivate(){cacheEpoch++;menuCache.clear();orderCache=null;pendingReads.clear();failures.clear();tableNames.clear();tableNamesAt.clear();}
 function request(path,options={}){
  const endpoint=path.split('/').at(-1),args=options.body||{};
  const configRead=['restaurant_manager_permissions','restaurant_alert_settings','restaurant_stock_visibility'].includes(endpoint)&&Object.values(args).every(v=>v===null);
  const listRead=['restaurant_notifications','restaurant_stock_alerts','restaurant_categories','restaurant_admin_devices'].includes(endpoint)&&(!args.p_action||args.p_action==='list');
  const isRead=(options.method||'GET')==='GET'||readRPC.has(endpoint)||configRead||listRead;
  if(!isRead)return transport(path,options); // Writes are NEVER automatically retried or deduplicated.
  const id=scope()+'|'+path+'|'+JSON.stringify(options.body||{}),failure=failures.get(id);
  if(pendingReads.has(id))return pendingReads.get(id);
  if(failure?.until>Date.now())return Promise.reject(failure.error);
  const epoch=cacheEpoch;
  const job=transport(path,options).then(data=>{
   if(epoch!==cacheEpoch)throw Error('Account changed during refresh. Please retry.');
   failures.delete(id);return data;
  }).catch(error=>{
   const tries=(failure?.tries||0)+1;
   const retryable=error.code==='ETIMEDOUT'||error.code==='NETWORK'||error.name==='TypeError'||[408,425,429].includes(error.httpStatus)||error.httpStatus>=500;
   const delay=retryable?Math.min(60000,1000*2**Math.min(tries,6))*(.75+Math.random()*.5):30000;
   if(epoch===cacheEpoch){if(failures.size>200)failures.clear();failures.set(id,{tries,error,until:Math.max(Date.now()+delay,error.retryAt||0)});}
   throw error;
  }).finally(()=>{if(pendingReads.get(id)===job)pendingReads.delete(id);});pendingReads.set(id,job);return job;
 }
 // One completion-based network scheduler per page. No catch-up ticks after suspension.
 const jobs=new Map();let scheduleTimer=null;
 function plan(){clearTimeout(scheduleTimer);if(document.hidden||navigator.onLine===false)return;
  const due=[...jobs.values()].filter(j=>!j.busy).map(j=>j.next);if(!due.length)return;
  scheduleTimer=setTimeout(tick,Math.max(50,Math.min(...due)-Date.now()));
 }
 function tick(){for(const job of jobs.values())if(!job.busy&&job.next<=Date.now()){
  job.busy=true;Promise.resolve().then(job.work).catch(()=>{}).finally(()=>{job.busy=false;job.next=Date.now()+job.ms;plan();});
 }plan();}
 function schedule(name,ms,work){jobs.set(name,{ms,work,busy:false,next:Date.now()+ms});plan();return ()=>{jobs.delete(name);plan();};}
 function resume(){if(!document.hidden&&navigator.onLine!==false)for(const job of jobs.values())job.next=Date.now()+Math.random()*500;plan();}
 document.addEventListener('visibilitychange',resume);window.addEventListener('online',resume);window.addEventListener('offline',plan);
 async function orders(){
  const epoch=cacheEpoch;const data=await rpc('restaurant_active_sync47',{p_known:orderCache?.revision||null},true);
  if(epoch!==cacheEpoch)throw Error('Account changed.');
  if(data.orders!==null)orderCache={revision:data.revision,rows:data.orders};
  if(!orderCache)throw Error('Order snapshot missing. Reload the page.');return orderCache.rows;
 }
 async function syncMenu(staff,access=null){
  const credentials=staff?{}:(access||await TableAccess.credentials(false));
  const id=scope()+'|'+(staff?'staff':currentTable+'|'+credentials.p_visit_id);
  let cached=menuCache.get(id);const epoch=cacheEpoch;
  const data=await rpc('restaurant_menu_sync47',{p_known:cached?.revisions||{},p_staff:!!staff,...credentials,...(!staff?{p_table:currentTable}:{})},!!staff);
  if(epoch!==cacheEpoch)throw Error('Account changed.');
  cached={catalog:data.catalog??cached?.catalog,state:data.state??cached?.state,commerce:data.commerce??cached?.commerce,revisions:data.revisions};
  if(!cached.catalog||!cached.state)throw Error('Menu snapshot missing. Reload the page.');
  const states=new Map(cached.state.map(row=>[row.id,row]));
  cached.rows=cached.catalog.map(item=>({...item,...states.get(item.id)}));menuCache.set(id,cached);
  if(data.tables)setTableNames(data.tables);if(data.categories)setCategories(data.categories);
  return cached;
 }
 async function menu(staff,access=null){return (await syncMenu(staff,access)).rows;}
 async function uploadMenuImage(data){
  if(!data||!data.startsWith('data:'))return data||'';
  const match=/^data:image\/(webp|png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(data);
  if(!match)throw Error('Unsupported image. Choose WebP, PNG or JPEG.');
  const bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));if(bytes.length>1048576)throw Error('Photo must be under 1 MB.');
  const ext=match[1];
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
  const r2Base=String(cfg.imagesBaseUrl||'').replace(/\/$/,'');
  const slug=String(cfg.restaurantSlug||'').trim();
  if(r2Base && slug) return uploadToR2(bytes,hash,ext,r2Base,slug);
  // Legacy path: Supabase Storage. Used only while imagesBaseUrl is blank.
  const path='thumbs/'+hash+'.'+ext,publicURL=url+'/storage/v1/object/public/menu-images/'+path;
  let check=await fetch(publicURL,{method:'HEAD',cache:'no-store'});
  if(!check.ok){
   try{await request('/storage/v1/object/menu-images/'+path,{method:'POST',body:bytes,raw:true,staff:true,headers:{'Content-Type':'image/'+ext,'Cache-Control':'max-age=31536000','x-upsert':'false'}});}
   catch(e){if(e.httpStatus!==409)throw e;}
   check=await fetch(publicURL,{method:'HEAD',cache:'no-store'});
  }
  if(!check.ok)throw Error('Uploaded photo could not be verified. Original photo has been preserved.');return publicURL;
 }
 // Cloudflare R2 path: bytes go straight from this browser to R2 over a short-lived
 // presigned URL handed out by /api/r2-upload-url. No image bytes touch Supabase,
 // so this keeps Supabase egress to just API/database traffic.
 async function uploadToR2(bytes,hash,ext,r2Base,slug){
  const objectKey='restaurants/'+slug+'/thumbs/'+hash+'.'+ext,publicURL=r2Base+'/'+objectKey;
  let check=await fetch(publicURL,{method:'HEAD',cache:'no-store'});
  if(!check.ok){
   if(!session)throw Error('Please sign in as staff.');
   const signRes=await fetch('/api/r2-upload-url',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({restaurant:slug,hash,ext,supabaseUrl:url,supabaseAnonKey:key})});
   const signData=await signRes.json().catch(()=>({}));
   if(!signRes.ok)throw Error(signData?.error||'Could not prepare image upload.');
   const put=await fetch(signData.uploadUrl,{method:'PUT',body:bytes,headers:{'Content-Type':'image/'+ext}});
   if(!put.ok)throw Error('Image upload to storage failed.');
   check=await fetch(publicURL,{method:'HEAD',cache:'no-store'});
  }
  if(!check.ok)throw Error('Uploaded photo could not be verified. Original photo has been preserved.');return publicURL;
 }
 const rpc=(name,body,staff=false)=>request('/rest/v1/rpc/'+name,{method:'POST',body,staff});
 const categories=[...(cfg.categories||['All','Steamed Momos','Fried Momos','Kurkure Momos','Tandoori Momos','Chutney & Dips','Drinks','Desserts'])];
 const normalizeCategory=v=>String(v||'').trim();
 const setCategories=names=>{categories.splice(0,categories.length,'All',...names);};
 function menuRow(item){return {id:String(item.id??crypto.randomUUID()),name:String(item.name||'').slice(0,120),price:Number(item.price)||0,category:normalizeCategory(item.category),description:String(item.description??item.desc??'').slice(0,1000),image:safeImage(item.photo||item.image||''),veg:item.veg!==false,available:item.available!==false,recommended:item.recommended===true,best_seller:item.best_seller===true,updated_at:new Date().toISOString()};}
 const tableNames=new Map(),tableNamesAt=new Map(),tableNamesBusy=new Map();
 const tableName=code=>{const id=String(code??'');return tableNames.get(id)||(['COUNTER','Counter','RECEPTION'].includes(id)?'Counter':id?'Table '+id:'Table');};
 function setTableNames(rows){let changed=false;for(const row of rows||[]){const name=String(row.display_name||('Table '+row.table_number));if(tableNames.get(row.table_number)!==name){tableNames.set(row.table_number,name);changed=true;}}if(changed)document.dispatchEvent(new Event('restaurant-table-names'));return changed;}
 async function refreshTableNames({staff=false,table=null,key=null,force=false}={}){
  const id=scope()+'|'+staff+'|'+table+'|'+key;
  if(!force&&Date.now()-(tableNamesAt.get(id)||0)<60000)return;
  if(tableNamesBusy.has(id))return tableNamesBusy.get(id);
  const epoch=cacheEpoch;const job=rpc('restaurant_table_names',{p_table:table,p_waiter_key:key},staff).then(rows=>{if(epoch===cacheEpoch){setTableNames(rows);tableNamesAt.set(id,Date.now());}return rows;}).finally(()=>tableNamesBusy.delete(id));tableNamesBusy.set(id,job);return job;
 }
 const orderLabel=o=>Number.isSafeInteger(Number(o?.daily_number))&&Number(o.daily_number)>0?'Order no. '+Number(o.daily_number):'Order number pending sync';
 return {cfg,configured,tableName,setTableNames,refreshTableNames,orderLabel,esc,safeImage,deferImages,read,write,remove,privateKey,sessionRead,sessionWrite,sessionRemove,categories,setCategories,normalizeCategory,menuRow,rpc,request,login,logout,hasSession:()=>!!session,user:()=>session?.user||null,ensureFresh:()=>session?refresh():Promise.reject(authError()),
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
  menu,syncMenu,schedule,uploadMenuImage,clearPrivate,
  saveMenu:async rows=>{const prepared=[];for(const row of rows)prepared.push({...row,image:await uploadMenuImage(row.image)});return request('/rest/v1/menu_items?on_conflict=id',{method:'POST',body:prepared,staff:true,headers:{Prefer:'resolution=merge-duplicates,return=minimal'}});},
  patchMenu:async(id,body)=>{if(Object.hasOwn(body,'image'))body={...body,image:await uploadMenuImage(body.image)};return request('/rest/v1/menu_items?id=eq.'+encodeURIComponent(id),{method:'PATCH',body,staff:true,headers:{Prefer:'return=minimal'}});},
  deleteMenu:id=>request('/rest/v1/menu_items?id=eq.'+encodeURIComponent(id),{method:'DELETE',staff:true}),
  orders,invalidateOrders:()=>{orderCache=null;},
  records:(period,reference,offset=0,limit=50)=>rpc('restaurant_records',{p_period:period,p_reference:reference||null,p_offset:offset,p_limit:limit},true),
  songs:()=>request('/rest/v1/song_requests?select=id,queue_no,created_at,updated_at,table_number,title,artist,song_url,status&status=in.(Queued,Playing)&order=queue_no.asc&limit=500',{staff:true}),
  playedSongs:()=>request('/rest/v1/song_requests?select=id,queue_no,created_at,finished_at,table_number,title,artist,status&status=eq.Played&order=finished_at.desc&limit=20',{staff:true})
 };
})();

/* restaurant-adapter.js?v=19 */
;/* Actual billing UI, existing restaurant Supabase APIs and R2 only. No shop schema.
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
  if(role!=='admin'&&custom.locked)throw Object.assign(Error(custom.lockMessage||'This workspace is paused by the administrator.'),{code:'LOCKED'});
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
  const [first]=await Promise.all([page(0),quiet(loadExtras())]);
  const total=Number(first.total||0),rest=[];for(let o=(first.items||[]).length;o<total&&(first.items||[]).length;o+=100)rest.push(page(o));
  const pages=[first,...await Promise.all(rest)];let categories=first.categories||[];
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
  const recent=(await hasV19())?call('restaurant_bills19',{p_from:a.p_from,p_to:a.p_to,p_status:'Paid',p_payment:'all',p_query:'',p_offset:0,p_limit:8}).then(r=>(r.rows||[]).map(bill)).catch(()=>[]):Promise.resolve(null);
  const d19=(await hasV19())?await call('restaurant_dashboard19',{p_from:a.p_from,p_to:a.p_to}).catch(e=>{if(missingFn(e))return null;throw e;}):null;
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
  recover:()=>Promise.reject(Error('Contact the restaurant administrator to reset access.')),useRecoveryToken:()=>false,setPassword:()=>Promise.reject(Error('Use restaurant account management.'))};
})();

/* js/themes.js?v=19 */
;/* 40 complete colour themes. Only Admin picks them (for everyone, or one per role).
   Every theme sets every colour token the app uses, and each text / control colour is
   checked against the background it sits on and darkened or lightened until it reaches
   the WCAG contrast ratio (4.5:1 for text, 3:1 for controls and borders). */
'use strict';
const Themes = (() => {
  // [id, name, mode, bg, surface, surface2, line, ink, muted, primary, side, sideInk, paper]
  const T = [
    ['ledger',    'Ledger',        'light', '#eef1f4', '#ffffff', '#f6f8fa', '#d9dfe6', '#1c2433', '#5f6a79', '#1f5fbf', '#1c2433', '#c4cdd9', '#fffefa'],
    ['mint',      'Mint Counter',  'light', '#edf5f1', '#ffffff', '#f4faf7', '#d3e5dc', '#14302a', '#56695f', '#0f7a5a', '#0f3d33', '#bfdcd2', '#fffffb'],
    ['saffron',   'Saffron',       'light', '#f7f1e8', '#fffdf9', '#fbf6ee', '#e8dccb', '#2e2216', '#6c5d4c', '#b93d0b', '#3b2414', '#e7cdb5', '#fffdf6'],
    ['lavender',  'Lavender',      'light', '#f2f0f8', '#ffffff', '#f7f6fb', '#ddd8ec', '#251f3a', '#625c7a', '#6d3fc0', '#2a2145', '#cfc6ea', '#fffefd'],
    ['rose',      'Rose Bazaar',   'light', '#f8eef1', '#ffffff', '#fbf4f6', '#ecd6dd', '#3a1b26', '#765562', '#be185d', '#3d1626', '#efc5d3', '#fffdfb'],
    ['ocean',     'Ocean',         'light', '#ebf3f8', '#ffffff', '#f3f8fb', '#cfe0ea', '#132b3a', '#516a79', '#0369a1', '#0c2b40', '#bcd8ea', '#fefefe'],
    ['sand',      'Sand & Ink',    'light', '#f3efe7', '#fffcf6', '#f8f4ec', '#e0d8c8', '#24211b', '#665f52', '#8a5a00', '#24211b', '#d9cfbd', '#fffbf0'],
    ['slate',     'Slate Pro',     'light', '#eceff3', '#ffffff', '#f4f6f9', '#d5dbe3', '#111827', '#596579', '#334155', '#0f172a', '#b8c2d1', '#ffffff'],
    ['forest',    'Forest',        'light', '#eef2ea', '#ffffff', '#f5f8f2', '#d6dfcd', '#1d2b17', '#5b6853', '#3f6212', '#1f2e17', '#c7d7b6', '#fffff8'],
    ['paper',     'Paper White',   'light', '#f6f6f4', '#ffffff', '#fafaf8', '#e2e2dd', '#1f1f1d', '#666660', '#2563eb', '#ffffff', '#45454a', '#ffffff'],
    ['coral',     'Coral',         'light', '#fbf0ec', '#ffffff', '#fdf6f3', '#f0d8cf', '#341c14', '#795a4f', '#c2410c', '#3a1d14', '#f1c7b6', '#fffdfa'],
    ['teal',      'Teal Clean',    'light', '#ecf6f6', '#ffffff', '#f4fafa', '#cfe5e4', '#102f2e', '#506d6c', '#0f766e', '#0d3533', '#b3dcd8', '#fefffe'],
    ['sky',       'Sky Blue',      'light', '#eaf4fd', '#ffffff', '#f3f9fe', '#cde3f6', '#0f2740', '#4d6680', '#0b6bcb', '#0b63b8', '#d6e9fb', '#ffffff'],
    ['peach',     'Peach',         'light', '#fdf1ea', '#fffaf6', '#fef5ef', '#f3d9c9', '#3a2014', '#7a5a49', '#c2531a', '#fbe3d3', '#5c3420', '#fffaf5'],
    ['sage',      'Sage',          'light', '#eff3ee', '#fbfcfa', '#f4f7f3', '#d8e1d5', '#1f2a1d', '#5c6a58', '#4a7a3f', '#dfe8db', '#2c3a29', '#fdfdf9'],
    ['sunflower', 'Sunflower',     'light', '#fbf6e6', '#fffdf5', '#fdf9ec', '#ece0b8', '#2b2410', '#6e6341', '#8a6400', '#2b2410', '#f2dc8f', '#fffcef'],
    ['blush',     'Blush',         'light', '#fbf0f4', '#ffffff', '#fdf6f8', '#f1d7e1', '#35182a', '#7b5a6b', '#b0306f', '#f8dde8', '#4a2038', '#fffdfd'],
    ['arctic',    'Arctic',        'light', '#f1f5f9', '#ffffff', '#f8fafc', '#dbe3ec', '#0f172a', '#566377', '#0e7490', '#f8fafc', '#334155', '#ffffff'],
    ['olive',     'Olive Grove',   'light', '#f2f1e6', '#fdfcf6', '#f7f6ec', '#dedcc4', '#25261a', '#626350', '#5f6b16', '#33361f', '#d8dbb3', '#fefdf6'],
    ['terracotta','Terracotta',    'light', '#f6ede7', '#fffbf8', '#faf3ee', '#e7d4c6', '#33201a', '#755b4f', '#a4401f', '#5a2a1c', '#f0cdbd', '#fffaf6'],
    ['indigo',    'Indigo Day',    'light', '#eef0fb', '#ffffff', '#f5f6fd', '#d6daf3', '#161a3b', '#575d84', '#3f46c9', '#22277a', '#cfd3fb', '#fffffe'],
    ['aqua',      'Aqua',          'light', '#e8f7f7', '#ffffff', '#f2fbfb', '#c9e9e8', '#0b2b2c', '#4b6c6d', '#0a7a80', '#d4f0ef', '#123c3e', '#fdffff'],
    ['midnight',  'Midnight',      'dark',  '#12161d', '#1a2029', '#212834', '#2f3845', '#e6eaf0', '#9ba6b5', '#6aa1ee', '#0d1015', '#a9b3c1', '#f4f1e8'],
    ['charcoal',  'Charcoal Gold', 'dark',  '#141414', '#1d1d1d', '#252525', '#353535', '#efeae0', '#a8a194', '#e0a526', '#0c0c0c', '#b9b2a4', '#f6f1e4'],
    ['deepsea',   'Deep Ocean',    'dark',  '#0b1622', '#112233', '#16293d', '#22394f', '#e2edf7', '#98aec2', '#38bdf8', '#07111b', '#9fb8cc', '#f2f6f8'],
    ['plum',      'Plum Night',    'dark',  '#17121f', '#211a2c', '#2a2137', '#3b2f4c', '#eee7f7', '#ab9fbe', '#b48cf2', '#100c16', '#b8a9cc', '#f5f1f8'],
    ['emerald',   'Emerald Night', 'dark',  '#0e1815', '#15231f', '#1b2c27', '#28403a', '#e3f2ec', '#97b2a8', '#34d399', '#09110f', '#a4c3b8', '#f1f6f3'],
    ['graphite',  'Graphite Red',  'dark',  '#151515', '#1f1f20', '#28282a', '#38383b', '#eeeeee', '#a7a7ab', '#f26b6b', '#0e0e0f', '#b5b5ba', '#f4f2ef'],
    ['cyber',     'Cyber Teal',    'dark',  '#0b1416', '#11201f', '#162a29', '#21403d', '#dff7f3', '#93b7b2', '#2dd4bf', '#071012', '#9cc9c3', '#f0f7f6'],
    ['mocha',     'Mocha',         'dark',  '#1a1512', '#241d19', '#2d2520', '#40352e', '#f2e8df', '#b4a497', '#e8955c', '#120e0c', '#c4b0a1', '#f7efe6'],
    ['obsidian',  'Obsidian',      'dark',  '#0f0f14', '#18181f', '#1f1f28', '#2e2e3a', '#ececf3', '#a0a0b2', '#8b8cf8', '#0a0a0e', '#b0b0c4', '#f3f3f6'],
    ['navygold',  'Navy & Gold',   'dark',  '#0c1424', '#131d33', '#18243f', '#263556', '#e8edf7', '#9eabc4', '#f2c14e', '#08101e', '#b4c0d8', '#f6f2e6'],
    ['crimson',   'Crimson Night', 'dark',  '#170d10', '#221418', '#2b1a1f', '#3f262d', '#f5e9ec', '#b8a0a7', '#ff6b81', '#100709', '#cbb0b7', '#f8f0f1'],
    ['moss',      'Moss',          'dark',  '#11150e', '#191f15', '#20271b', '#313b29', '#e9efe2', '#a3ae98', '#a3d65c', '#0b0e09', '#b5c2a8', '#f4f6ef'],
    ['sunset',    'Sunset',        'dark',  '#1b1210', '#251916', '#2f201c', '#45302a', '#f7ebe6', '#bba59c', '#ff8a4c', '#130c0a', '#d2b6aa', '#f9f0eb'],
    ['ink',       'Pure Black',    'dark',  '#000000', '#0b0b0b', '#141414', '#262626', '#f5f5f5', '#a3a3a3', '#4da3ff', '#000000', '#bdbdbd', '#f5f5f5'],
    ['royal',     'Royal Night',   'dark',  '#130f24', '#1b1633', '#221c3f', '#342b5a', '#ece8fb', '#a49dc4', '#e879f9', '#0d0a19', '#bcb3e0', '#f5f2fb'],
    ['copper',    'Copper',        'dark',  '#16110d', '#201913', '#291f18', '#3d2f24', '#f3e9e0', '#b3a291', '#d9925a', '#0f0b08', '#c9b4a1', '#f7efe7'],
    ['sapphire',  'Sapphire',      'dark',  '#08111f', '#0e1a2e', '#13223b', '#1f3354', '#e6eefb', '#9aaccb', '#5b9dff', '#050b15', '#a9bddc', '#f1f5fb'],
    ['contrast',  'High Contrast', 'dark',  '#000000', '#000000', '#0d0d0d', '#8a8a8a', '#ffffff', '#e0e0e0', '#ffd400', '#000000', '#ffffff', '#ffffff']
  ];
  const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const toHex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * t));
  const lum = h => { const [r, g, b] = hex(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  /* Moves fg toward black or white (away from the backgrounds) until it reaches the ratio on every one of them. */
  function ensure(fg, bgs, min) {
    bgs = [].concat(bgs);
    const ok = c => bgs.every(b => ratio(c, b) >= min);
    if (ok(fg)) return fg;
    const avg = bgs.reduce((s, b) => s + lum(b), 0) / bgs.length;
    const towards = avg > .18 ? '#000000' : '#ffffff';
    for (let t = .04; t <= 1.0001; t += .04) { const c = mix(fg, towards, t); if (ok(c)) return c; }
    return towards;
  }

  const list = T.map(([id, name, mode, bg, surface, surface2, line, ink, muted, primary, side, sideInk, paper]) => ({ id, name, mode, bg, surface, surface2, line, ink, muted, primary, side, sideInk, paper }));
  const get = id => list.find(t => t.id === id) || list[0];

  function tokens(t, accent) {
    const dark = t.mode === 'dark', S = [t.surface, t.surface2, t.bg];
    let p = /^#[0-9a-f]{6}$/i.test(accent || '') ? accent : t.primary;
    p = ensure(p, S, 4.5);                                   // primary is also used as link / tab text
    const soft = mix(p, t.surface, dark ? .8 : .9);
    p = ensure(p, [...S, soft], 4.5);
    const pInk = ratio('#ffffff', p) >= ratio('#0b1220', p) ? '#ffffff' : '#0b1220';
    const sideLight = lum(t.side) > .4;
    const sideOn = sideLight ? mix(t.side, p, .14) : mix(t.side, '#ffffff', .1);
    const status = (light, darkc, lightSoft) => {
      const base = dark ? darkc : light, sft = dark ? mix(darkc, t.surface, .82) : lightSoft;
      return [ensure(base, [...S, sft], 4.5), sft];
    };
    const [green, greenSoft] = status('#13795b', '#4cc38a', '#e3f3ec');
    const [red, redSoft] = status('#c2362f', '#ef6b62', '#fbe9e7');
    const [amber, amberSoft] = status('#8f5c08', '#e3ac4f', '#fdf1d8');
    const [orange, orangeSoft] = status('#b84a00', '#ff9a4d', '#ffedd9');
    const ink = ensure(t.ink, S, 7), muted = ensure(t.muted, [...S, soft], 4.6);
    return {
      '--bg': t.bg, '--surface': t.surface, '--surface-2': t.surface2, '--line': t.line, '--line-2': mix(t.line, t.surface, .45),
      '--line-strong': ensure(mix(t.line, ink, .25), [t.surface, t.surface2, t.bg], 3.15),   // input borders, switch tracks: 3:1
      '--ink': ink, '--ink-2': ensure(mix(ink, muted, .45), S, 4.5), '--muted': muted,
      '--primary': p, '--primary-hover': dark ? mix(p, '#ffffff', .16) : mix(p, '#000000', .16), '--primary-soft': soft,
      '--primary-ink': pInk,
      '--side': t.side, '--side-ink': ensure(t.sideInk, [t.side, sideOn], 4.5), '--side-hi': sideLight ? '#111111' : '#ffffff', '--side-on': sideOn,
      '--side-muted': ensure(mix(t.sideInk, t.side, .25), [t.side, sideOn], 4.5),
      '--side-line': sideLight ? 'rgba(0,0,0,.1)' : 'rgba(255,255,255,.1)',
      '--paper': t.paper, '--paper-ink': '#1f1f1f', '--paper-rule': '#c9c4b8',
      '--green': green, '--green-soft': greenSoft, '--red': red, '--red-soft': redSoft,
      '--amber': amber, '--amber-soft': amberSoft, '--orange': orange, '--orange-soft': orangeSoft,
      '--on-red': ratio('#ffffff', red) >= ratio('#111111', red) ? '#ffffff' : '#111111',
      '--on-amber': ratio('#ffffff', amber) >= ratio('#111111', amber) ? '#ffffff' : '#111111',
      '--side-gold': ensure(sideLight ? '#8a5a00' : '#f3c969', [t.side, sideOn], 3),
      '--scrim': dark ? 'rgba(0,0,0,.62)' : 'rgba(15,23,42,.45)',
      '--focus': `0 0 0 3px ${p}${dark ? '8c' : '66'}`
    };
  }
  const css = (t, accent) => `html:root,html:root[data-theme]{${Object.entries(tokens(t, accent)).map(([k, v]) => `${k}:${v}`).join(';')};color-scheme:${t.mode}}`;
  /* Applies a theme to the whole page, and remembers the finished CSS so the next start paints it before anything else (no flash). */
  function apply(id, accent) {
    const t = get(id), text = css(t, accent);
    document.documentElement.dataset.theme = t.mode;
    let st = document.getElementById('themeStyle');
    if (!st) { st = document.createElement('style'); st.id = 'themeStyle'; document.head.append(st); }
    if (st.textContent !== text) st.textContent = text;
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', t.side);
    try { localStorage.setItem('SHOPBILL_LAST_THEME', JSON.stringify([t.id, accent || ''])); localStorage.setItem('SHOPBILL_THEME_CSS', JSON.stringify([t.mode, text, t.side])); } catch { /* ignore */ }
    return t;
  }
  /* Small preview card used in the theme gallery. */
  function swatch(t, accent) {
    const k = tokens(t, accent);
    return `<span class="theme-mini" style="background:${k['--bg']}"><i style="background:${k['--side']}"><s style="background:${k['--side-ink']}"></s><s style="background:${k['--side-ink']}"></s></i><b style="background:${k['--surface']};border-color:${k['--line']}"><em style="background:${k['--primary']}"></em><u style="background:${k['--ink']}"></u><u style="background:${k['--muted']}"></u></b></span>`;
  }
  return { list, get, apply, swatch, tokens, ratio, ensure };
})();

/* js/ui.js?v=19 */
;/* Shared state and small UI helpers used by every screen. */
'use strict';
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ROLE_LABEL = { superadmin: 'Admin', owner: 'Owner', manager: 'Manager', cashier: 'Cashier', member: 'Member' };

/* What each permission means, grouped for the Admin → Roles & permissions screen. */
const PERMISSIONS = [
  ['Screens', [['billing', 'Billing counter'], ['records', 'Records (today)'], ['records_all', 'Records (any date)'], ['dashboard', 'Dashboard'], ['items', 'Items'], ['stocks', 'Stocks']]],
  ['Restaurant', [['kitchen', 'Kitchen orders'], ['requests', 'Customer requests'], ['tables', 'Tables & QR codes'], ['notifications', 'Notifications'], ['devices', 'Customer devices'], ['item_details', 'Menu photos & portions'], ['restaurant_settings', 'Restaurant settings']]],
  ['Billing', [['discount', 'Give discounts'], ['short_cash', 'Accept less cash than the total'], ['cancel_bills', 'Cancel bills'], ['export', 'Export records to CSV']]],
  ['Expenses', [['expenses', 'See and add expenses'], ['expenses_manage', 'Edit, delete, expense types & auto expenses']]],
  ['Members', [['members', 'See members'], ['members_add', 'Add and edit members'], ['members_renew', 'Renew or change a membership'], ['members_plans', 'Plans, dates & check-in code'], ['members_login', 'Member logins'], ['attendance', 'Attendance (check members in)']]],
  ['Settings', [['settings_shop', 'Shop details'], ['settings_tax', 'Billing (tax, payments, stock)'], ['settings_design', 'Bill design & extras'], ['settings_contact', 'Shop contact info'], ['staff', 'Staff & logins'], ['roles_manager', 'Change what managers can do'], ['roles_cashier', 'Change what cashiers can do'], ['reset', 'Delete all bills']]]
];

/* Which screen each permission belongs to. A screen switched off in the preset hides its permissions too. */
const PERM_MODULE = { billing: 'billing', records: 'records', records_all: 'records', cancel_bills: 'records', export: 'records', dashboard: 'dashboard', items: 'items', stocks: 'stocks',
  expenses: 'expenses', expenses_manage: 'expenses', members: 'members', members_add: 'members', members_renew: 'members', members_plans: 'members', members_login: 'members', attendance: 'members' };
/* Default screen names; a preset can rename them (e.g. Members → Students). */
const MODULE_LABEL = { billing: 'Billing', dashboard: 'Dashboard', records: 'Records', items: 'Items', stocks: 'Stocks', expenses: 'Expenses', members: 'Members' };

const Store = {
  me: null,            // { role, name, email, today, settings, system, perms }
  items: [],
  categories: [],
  itemsLoadedAt: 0,
  get settings() { return this.me?.settings || {}; },
  get sys() { return this.me?.system || App.publicInfo || {}; },
  get role() { return this.me?.role || ''; },
  get isAdmin() { return this.role === 'superadmin'; },
  feature(name) { const f = this.sys.features || {}; return name in f ? f[name] !== false : !['customer_details', 'customer_address'].includes(name); },
  can(perm) {
    const p = this.me?.perms || [];
    if (perm === 'settings') return ['settings_shop', 'settings_tax', 'settings_design', 'settings_contact', 'staff', 'reset', 'roles_manager', 'roles_cashier', 'restaurant_settings', 'limits'].some(x => p.includes(x));
    if (perm === 'stocks') return p.includes('stocks') && this.stockShown();
    return p.includes(perm);
  },
  payments() { const p = this.sys.payments || {}; return ['Cash', 'UPI', 'Card'].filter(m => p[m] !== false); },
  get isMember() { return this.role === 'member'; },
  moduleOn(m) { const mods = this.sys.modules || {}; return m in mods ? mods[m] !== false : m !== 'members'; },
  permShown(perm) { const m = PERM_MODULE[perm]; return !m || this.moduleOn(m); },
  label(m) { return (this.sys.labels || {})[m] || MODULE_LABEL[m] || m; },
  /* singular for "Add member" / "Add student" */
  label1(m) { const l = this.label(m); return /ies$/i.test(l) ? l.replace(/ies$/i, 'y') : l.replace(/s$/i, ''); },
  /* Stock can be hidden by the owner/manager; Admin always sees it. */
  stockShown() { return this.isAdmin || !this.settings.stock_hidden; },
  /* Optional item fields switched on in Settings → Billing. HSN is on by default; others off. */
  itemField(k) { const f = this.settings.item_fields || {}; return k in f ? !!f[k] : k === 'hsn'; },
  invoice() { return this.settings.invoice || {}; },
  async loadItems(force = false) {
    if (!force && this.itemsLoadedAt && Date.now() - this.itemsLoadedAt < 15000) return this.items;
    const data = await Cloud.rpc('shop_items_list');
    this.items = data.items || []; this.categories = data.categories || []; this.itemsLoadedAt = Date.now();
    document.dispatchEvent(new CustomEvent('items:changed'));
    return this.items;
  },
  upsertItem(item) {
    const i = this.items.findIndex(x => x.id === item.id);
    if (i >= 0) this.items[i] = item; else this.items.push(item);
    if (item.category && !this.categories.includes(item.category)) this.categories.push(item.category);
    this.items.sort((a, b) => a.name.localeCompare(b.name));
    document.dispatchEvent(new CustomEvent('items:changed'));
  },
  /* Patch stock counts locally from a bill/cancel response instead of re-downloading the whole item list. */
  applyStockUpdates(updates) {
    if (!updates?.length) return;
    for (const u of updates) { const it = this.items.find(x => x.id === u.id); if (it) it.stock = u.stock; }
    document.dispatchEvent(new CustomEvent('items:changed'));
  }
};

const Fmt = {
  nf2: new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  nf0: new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }),
  nfq: new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }),
  cur() { return Store.settings.currency || '₹'; },
  money(v) { return this.cur() + this.nf2.format(Number(v) || 0); },
  money0(v) { return this.cur() + this.nf0.format(Math.round(Number(v) || 0)); },
  compact(v) { const n = Number(v) || 0; if (Math.abs(n) >= 1e7) return this.cur() + (n / 1e7).toFixed(1).replace(/\.0$/, '') + 'Cr'; if (Math.abs(n) >= 1e5) return this.cur() + (n / 1e5).toFixed(1).replace(/\.0$/, '') + 'L'; if (Math.abs(n) >= 1e3) return this.cur() + (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k'; return this.cur() + Math.round(n); },
  qty(v) { return this.nfq.format(Number(v) || 0); },
  tz() { return Store.settings.timezone || 'Asia/Kolkata'; },
  dateTime(iso) { return new Date(iso).toLocaleString('en-IN', { timeZone: this.tz(), day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }); },
  time(iso) { return new Date(iso).toLocaleTimeString('en-IN', { timeZone: this.tz(), hour: 'numeric', minute: '2-digit' }); },
  date(d) { const dt = typeof d === 'string' && d.length === 10 ? new Date(d + 'T12:00:00Z') : new Date(d); return dt.toLocaleDateString('en-IN', { timeZone: typeof d === 'string' && d.length === 10 ? 'UTC' : this.tz(), day: 'numeric', month: 'short', year: 'numeric' }); },
  /* "today" as YYYY-MM-DD in the shop's time zone */
  today() { return new Intl.DateTimeFormat('en-CA', { timeZone: this.tz(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); },
  addDays(iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); },
  monthStart(iso) { return iso.slice(0, 8) + '01'; }
};

/* Period presets shared by Records and Dashboard. */
function periodRange(key, from, to) {
  const t = Fmt.today();
  switch (key) {
    case 'today': return [t, t];
    case 'yesterday': { const y = Fmt.addDays(t, -1); return [y, y]; }
    case 'week': return [Fmt.addDays(t, -6), t];
    case 'month': return [Fmt.monthStart(t), t];
    case 'lastmonth': { const end = Fmt.addDays(Fmt.monthStart(t), -1); return [Fmt.monthStart(end), end]; }
    case 'year': return [t.slice(0, 4) + '-01-01', t];
    default: return [from || t, to || from || t];
  }
}
const PERIODS = [['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'Last 7 days'], ['month', 'This month'], ['lastmonth', 'Last month'], ['year', 'This year'], ['custom', 'Custom']];

/* Toasts never pile up: the same message just stays up longer, and at most 3 show at once. */
function toast(message, kind = 'info', ms = 3600) {
  let host = $('#toasts');
  if (!host) { host = document.createElement('div'); host.id = 'toasts'; host.setAttribute('aria-live', 'polite'); document.body.append(host); }
  let t = [...host.children].find(x => x.textContent === message && !x.classList.contains('out'));
  if (t) { clearTimeout(t._timer); t.classList.remove('bump'); void t.offsetWidth; t.classList.add('bump'); }
  else {
    t = document.createElement('div'); t.className = 'toast toast-' + kind; t.textContent = message; host.append(t);
    while (host.children.length > 3) host.firstElementChild.remove();
  }
  t._timer = setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
}
const isTouch = () => matchMedia('(hover: none) and (pointer: coarse)').matches;

/* Promise-based dialog. Returns the input value (or true) on confirm, null on cancel. */
function ask({ title, body = '', confirm = 'OK', cancel = 'Cancel', danger = false, input = null }) {
  return new Promise(resolve => {
    const d = document.createElement('dialog'); d.className = 'modal modal-sm';
    d.innerHTML = `<form method="dialog"><header class="modal-head"><h2>${esc(title)}</h2></header>
      <div class="modal-body">${body ? `<p>${body}</p>` : ''}${input ? `<label class="field"><span>${esc(input.label)}</span><input name="v" ${input.type ? `type="${input.type}"` : ''} value="${esc(input.value || '')}" placeholder="${esc(input.placeholder || '')}" ${input.required ? 'required' : ''} maxlength="${input.maxlength || 200}" autocomplete="off"></label>` : ''}</div>
      <footer class="modal-foot"><button type="button" class="btn btn-ghost" value="cancel">${esc(cancel)}</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" value="ok">${esc(confirm)}</button></footer></form>`;
    document.body.append(d);
    const f = $('form', d);
    $('[value=cancel]', d).onclick = () => d.close('cancel');
    f.onsubmit = e => { e.preventDefault(); if (!f.reportValidity()) return; d.close('ok'); };
    d.addEventListener('close', () => { const ok = d.returnValue === 'ok'; resolve(ok ? (input ? $('[name=v]', d).value : true) : null); d.remove(); });
    d.showModal(); (input ? $('[name=v]', d) : $('[value=ok]', d)).focus();
  });
}

/* Generic modal shell. content: HTML string. Returns the dialog element. */
function modal(title, content, { size = '', onClose } = {}) {
  const d = document.createElement('dialog'); d.className = 'modal ' + size;
  d.innerHTML = `<header class="modal-head"><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Close">${Icon('x')}</button></header><div class="modal-body">${content}</div>`;
  document.body.append(d);
  d.addEventListener('click', e => { if (e.target.closest('[data-close]')) d.close(); });
  d.addEventListener('close', () => { onClose?.(); d.remove(); });
  d.showModal();
  return d;
}

function busy(btn, on, label) {
  if (!btn) return;
  if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; if (label) btn.textContent = label; }
  else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
}

function downloadFile(name, text, type = 'text/csv') {
  const blob = new Blob([type === 'text/csv' ? '﻿' + text : text], { type: type + ';charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function toCSV(rows) {
  return rows.map(r => r.map(v => { const s = String(v ?? ''); return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? '"' + (/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\r\n');
}
function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

/* Inline SVG icon set (stroke icons, 24px grid). */
const ICONS = {
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  hash: '<path d="M5 9h14M4 15h14M10 3 8 21M16 3l-2 18"/>',
  bill: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  chart: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 16v-5M12 16V8M16 16v-3"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><circle cx="12" cy="17" r=".6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
  printer: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  whatsapp: '<path d="M20 12a8 8 0 0 1-11.8 7L4 20l1-4.1A8 8 0 1 1 20 12z"/><path d="M9 9.5c.3 2 2.4 4.1 4.5 4.5l1-1.2 1.8.8c-.2 1-1 1.6-2 1.6-3 0-6-3-6-6 0-1 .6-1.8 1.6-2l.8 1.8z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  logout: '<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>', moon: '<path d="M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z"/>', sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>', globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>', upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>', trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>', alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.01"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.9-3M4 13a8 8 0 0 0 14.9 3"/><path d="M4 4v4h4M20 20v-4h-4"/>', keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  wifi: '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a15 15 0 0 1 20 0"/><circle cx="12" cy="19.5" r=".8"/>', check: '<path d="M5 12l5 5L20 7"/>',
  rupee: '<path d="M6 4h12M6 9h12M6 4c7 0 7 9 0 9l8 7"/>',
  store: '<path d="M4 9l1.5-5h13L20 9"/><path d="M4 9h16v2a3 3 0 0 1-5.3 1.9A3 3 0 0 1 12 14a3 3 0 0 1-2.7-1.1A3 3 0 0 1 4 11z"/><path d="M5 13.5V20h14v-6.5M10 20v-4h4v4"/>',
  qr: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 14h2M14 18h2M18 18h2v2M16 16h2v2"/>',
  insta: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17" cy="7" r=".7"/>', star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>', down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
    power: '<path d="M12 3v8"/><path d="M6.3 6.6a8 8 0 1 0 11.4 0"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-.5-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4.1-4-7.6-9-7.6z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/>',
  wallet: '<path d="M4 7a2 2 0 0 1 2-2h12v4"/><path d="M4 7v11a2 2 0 0 0 2 2h14V9H6a2 2 0 0 1-2-2z"/><circle cx="16" cy="14.5" r="1.2"/>',
  idcard: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.2"/><path d="M5.5 16.5a3.6 3.6 0 0 1 7 0M15 10h3M15 13.5h3"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M7 12h10"/>',
  repeat: '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>',
  bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>', ban: '<circle cx="12" cy="12" r="9"/><path d="M6 6l12 12"/>', barcode: '<path d="M4 5v14M7 5v14M10 5v14M14 5v14M17 5v14M20 5v14"/>'
};
function Icon(name, cls = '') { return `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`; }

/* Compress an uploaded image into a small data URL (logo use). */
async function imageToDataURL(file, maxSide = 360, maxBytes = 240000) {
  if (!file) return '';
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Choose a PNG, JPG or WEBP image.');
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('This image could not be read.')); i.src = URL.createObjectURL(file); });
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
  let q = 0.9, out = c.toDataURL('image/png');
  while (out.length > maxBytes && q > 0.3) { out = c.toDataURL('image/jpeg', q); q -= 0.1; }
  if (out.length > maxBytes) throw new Error('This image is too large even after shrinking. Use a simpler logo.');
  return out;
}

/* js/calc.js?v=19 */
;/* Bill arithmetic. Mirrors shop_create_bill on the server exactly (integer paise, half-up rounding),
   so the total on screen is always the total that gets saved. */
'use strict';
const Calc = (() => {
  const P = v => Math.round((Number(v) || 0) * 100);           // rupees -> paise
  const R = (num, den) => Math.round(num / den);                // integer division, rounded half up (positive values)

  /* lines: in the order they are sent to the server. Each: { qty, price, discount_pct, tax_rate, incl }
     s: shop settings. opts: { discount:{mode,value}, canDiscount, received (rupees), cashOn, canShort, maxShort, isAdmin } */
  function bill(lines, s, opts = {}) {
    const out = lines.map(l => {
      const q1000 = Math.round(Number(l.qty) * 1000), gross = R(q1000 * P(l.price), 1000);
      const d100 = Math.round((Number(l.discount_pct) || 0) * 100), disc = R(gross * d100, 10000);
      return { gross, disc, total: gross - disc, rate100: Math.round((Number(l.tax_rate) || 0) * 100), incl: !!l.incl, tax: 0, taxable: 0 };
    });
    const sub = out.reduce((a, l) => a + l.total, 0);
    let bdisc = 0; const dv = Number(opts.discount?.value) || 0;
    if (dv > 0 && opts.canDiscount) bdisc = opts.discount.mode === 'percent' ? R(sub * Math.round(Math.min(dv, 100) * 100), 10000) : Math.min(P(dv), sub);
    const taxable = sub - bdisc;
    let tax = 0, extra = 0;
    if (s.tax_enabled && s.tax_scope === 'item') {
      let allocated = 0;
      out.forEach((l, i) => {
        const alloc = i === out.length - 1 ? bdisc - allocated : (sub > 0 ? R(bdisc * l.total, sub) : 0);
        allocated += alloc;
        const net = l.total - alloc;
        if (l.rate100 > 0) {
          if (l.incl) { l.taxable = R(net * 10000, 10000 + l.rate100); l.tax = net - l.taxable; }
          else { l.taxable = net; l.tax = R(net * l.rate100, 10000); extra += l.tax; }
        } else l.taxable = net;
        tax += l.tax;
      });
    } else if (s.tax_enabled) {
      tax = s.tax_mode === 'percent' ? R(taxable * Math.round(Number(s.tax_value) * 100), 10000) : (taxable > 0 ? P(s.tax_value) : 0);
      extra = tax;
    }
    const gross = taxable + extra, total = s.round_off ? Math.round(gross / 100) * 100 : gross;
    const rec = opts.cashOn ? P(opts.received) : 0;
    let less = 0, shortBlocked = '';
    if (rec > 0 && rec < total) {
      if (!opts.canShort) shortBlocked = 'Collect the full amount.';
      else if (!opts.isAdmin && total - rec > P(opts.maxShort)) shortBlocked = 'max';
      else less = total - rec;
    }
    const final = total - less;
    // tax summary by rate (per-item mode)
    const groups = {};
    if (s.tax_enabled && s.tax_scope === 'item') for (const l of out) if (l.tax > 0) { const k = l.rate100 + (l.incl ? 'i' : 'e'); (groups[k] ||= { rate: l.rate100 / 100, incl: l.incl, tax: 0, taxable: 0 }); groups[k].tax += l.tax; groups[k].taxable += l.taxable; }
    return {
      lines: out.map(l => ({ gross: l.gross / 100, disc: l.disc / 100, total: l.total / 100, tax: l.tax / 100 })),
      sub: sub / 100, disc: bdisc / 100, tax: tax / 100, extra: extra / 100, round: (total - gross) / 100, total: total / 100,
      less: less / 100, final: final / 100, rec: rec / 100, change: rec > final ? (rec - final) / 100 : 0,
      short: rec > 0 && rec < total ? (total - rec) / 100 : 0, shortBlocked,
      breakdown: Object.values(groups).sort((a, b) => a.rate - b.rate || a.incl - b.incl).map(g => ({ ...g, tax: g.tax / 100, taxable: g.taxable / 100 })),
      qty: lines.reduce((a, l) => a + Number(l.qty), 0)
    };
  }
  /* Split a tax amount into CGST + SGST halves (paise-exact). */
  function split(amount) { const t = P(amount), c = Math.floor(t / 2); return [c / 100, (t - c) / 100]; }
  return { bill, split };
})();
if (typeof module !== 'undefined') module.exports = Calc;

/* js/qr.js?v=19 */
;/* Small QR code generator (byte mode, error-correction level M, versions 1–25).
   Based on the public QR Code specification (ISO/IEC 18004), following Project Nayuki's reference design.
   Used to print a UPI "scan to pay" code on bills — works offline, no outside library. */
'use strict';
const QR = (() => {
  const ECC_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28];
  const NUM_BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21];
  const MAX_VER = 25;
  const bit = (x, i) => ((x >>> i) & 1) !== 0;
  function rawModules(v) { let r = (16 * v + 128) * v + 64; if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; } return r; }
  const dataCodewords = v => Math.floor(rawModules(v) / 8) - ECC_PER_BLOCK[v] * NUM_BLOCKS[v];
  function gfMul(x, y) { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; } return z & 0xff; }
  function rsDivisor(deg) { const r = new Array(deg).fill(0); r[deg - 1] = 1; let root = 1; for (let i = 0; i < deg; i++) { for (let j = 0; j < r.length; j++) { r[j] = gfMul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; } root = gfMul(root, 2); } return r; }
  function rsRemainder(data, div) { const r = div.map(() => 0); for (const b of data) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= gfMul(c, f); }); } return r; }
  function alignPositions(v, size) { if (v === 1) return []; const n = Math.floor(v / 7) + 2, step = v === 32 ? 26 : Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2; const r = [6]; for (let p = size - 7; r.length < n; p -= step) r.splice(1, 0, p); return r; }

  function encode(text) {
    const bytes = [...new TextEncoder().encode(text)];
    let v = 1;
    for (; v <= MAX_VER; v++) { const cc = v < 10 ? 8 : 16; if (4 + cc + bytes.length * 8 <= dataCodewords(v) * 8) break; }
    if (v > MAX_VER) throw new Error('Text too long for a QR code.');
    // data bits
    const bits = []; const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(4, 4); put(bytes.length, v < 10 ? 8 : 16); bytes.forEach(b => put(b, 8));
    const cap = dataCodewords(v) * 8;
    put(0, Math.min(4, cap - bits.length)); put(0, (8 - bits.length % 8) % 8);
    for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
    const data = []; for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    // error correction + interleave
    const nb = NUM_BLOCKS[v], el = ECC_PER_BLOCK[v], raw = Math.floor(rawModules(v) / 8), nShort = nb - raw % nb, shortLen = Math.floor(raw / nb), div = rsDivisor(el);
    const blocks = []; for (let i = 0, k = 0; i < nb; i++) { const dat = data.slice(k, k + shortLen - el + (i < nShort ? 0 : 1)); k += dat.length; const ecc = rsRemainder(dat, div); if (i < nShort) dat.push(0); blocks.push(dat.concat(ecc)); }
    const cw = []; for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - el || j >= nShort) cw.push(b[i]); });
    // matrix
    const size = v * 4 + 17, m = [...Array(size)].map(() => Array(size).fill(false)), fn = [...Array(size)].map(() => Array(size).fill(false));
    const setF = (x, y, d) => { m[y][x] = d; fn[y][x] = true; };
    for (let i = 0; i < size; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
    const finder = (x, y) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)), xx = x + dx, yy = y + dy; if (xx >= 0 && xx < size && yy >= 0 && yy < size) setF(xx, yy, d !== 2 && d !== 4); } };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    const ap = alignPositions(v, size), na = ap.length;
    for (let i = 0; i < na; i++) for (let j = 0; j < na; j++) { if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setF(ap[i] + dx, ap[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); }
    const format = mask => {
      const d = (0 << 3) | mask; let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      const b = ((d << 10) | r) ^ 0x5412;
      for (let i = 0; i <= 5; i++) setF(8, i, bit(b, i));
      setF(8, 7, bit(b, 6)); setF(8, 8, bit(b, 7)); setF(7, 8, bit(b, 8));
      for (let i = 9; i < 15; i++) setF(14 - i, 8, bit(b, i));
      for (let i = 0; i < 8; i++) setF(size - 1 - i, 8, bit(b, i));
      for (let i = 8; i < 15; i++) setF(8, size - 15 + i, bit(b, i));
      setF(8, size - 8, true);
    };
    format(0);
    if (v >= 7) { let r = v; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25); const b = (v << 12) | r; for (let i = 0; i < 18; i++) { const d = bit(b, i), a = size - 11 + i % 3, c = Math.floor(i / 3); setF(a, c, d); setF(c, a, d); } }
    // place codewords
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
        if (!fn[y][x] && i < cw.length * 8) { m[y][x] = bit(cw[i >>> 3], 7 - (i & 7)); i++; }
      }
    }
    const maskFn = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => x * y % 2 + x * y % 3 === 0,
      (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0];
    const apply = k => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && maskFn[k](x, y)) m[y][x] = !m[y][x]; };
    const penalty = () => {
      let p = 0, dark = 0;
      for (let y = 0; y < size; y++) for (const horiz of [true, false]) { let run = 1; for (let x = 1; x < size; x++) { const a = horiz ? m[y][x] : m[x][y], b = horiz ? m[y][x - 1] : m[x - 1][y]; if (a === b) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; } }
      for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = m[y][x]; if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3; }
      for (const row of m) for (const c of row) if (c) dark++;
      return p + Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
    };
    let best = 0, bestScore = Infinity;
    for (let k = 0; k < 8; k++) { apply(k); format(k); const sc = penalty(); if (sc < bestScore) { bestScore = sc; best = k; } apply(k); }
    apply(best); format(best);
    return m;
  }

  /* Returns an <svg> string (scales cleanly on any printer). */
  function svg(text, px = 140) {
    const m = encode(text), n = m.length, q = 4, s = n + q * 2;
    let d = ''; m.forEach((row, y) => row.forEach((c, x) => { if (c) d += `M${x + q},${y + q}h1v1h-1z`; }));
    return `<svg class="qr-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${px}" height="${px}" shape-rendering="crispEdges"><rect width="${s}" height="${s}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }
  function upiLink({ upi_id, payee, amount, note }) {
    const p = new URLSearchParams({ pa: upi_id, pn: payee || '', cu: 'INR' });
    if (amount > 0) p.set('am', Number(amount).toFixed(2));
    if (note) p.set('tn', note);
    return 'upi://pay?' + p.toString().replace(/\+/g, '%20');
  }
  return { encode, svg, upiLink };
})();
if (typeof module !== 'undefined') module.exports = QR;

/* js/receipt.js?v=19 */
;/* Printed bill. Independent of the app theme: always printed on white. */
'use strict';
const Receipt = (() => {
  const LABELS = {
    bill_no: 'Bill', by: 'By', item: 'Item', qty: 'Qty', rate: 'Rate', amount: 'Amt', items_count: 'Items',
    subtotal: 'Subtotal', discount: 'Discount', round_off: 'Round off', less: 'Less (short paid)', total: 'TOTAL',
    total_screen: 'Total', paid_by: 'Paid by', cash_received: 'Cash received', change: 'Change returned', you_saved: 'You saved', hsn: 'HSN'
  };
  const LABEL_NAMES = {
    bill_no: 'Bill number', by: 'Billed by', item: 'Item column', qty: 'Quantity column', rate: 'Rate column', amount: 'Amount column',
    items_count: 'Item count', subtotal: 'Subtotal', discount: 'Discount', round_off: 'Round off', less: 'Short cash line',
    total: 'Grand total (printed)', total_screen: 'Total (on screen)', paid_by: 'Paid by', cash_received: 'Cash received', change: 'Change', you_saved: '“You saved”', hsn: 'HSN column'
  };
  const TEMPLATES = [['classic', 'Classic', 'Dashed lines, like a shop receipt'], ['modern', 'Modern', 'Bold coloured header'], ['minimal', 'Minimal', 'Clean, lots of space'],
                     ['grid', 'Grid', 'Bordered table, for A4/A5'], ['executive', 'Executive', 'Formal, with double rules']];
  const DEFAULTS = {
    paper: '80', fontSize: 12, align: 'center', titleText: 'Cash memo', template: 'classic', color: '#1f2937',
    showCustomer: true, showCashier: true, showPayment: true, showSavings: true, showCode: false, showItemCount: true, showCash: true,
    showHsn: true, showItemDiscount: true, headerText: '', footerText: 'Thank you! Please visit again.', labels: {}
  };
  const SHOP_FIELDS = [['logo', 'Logo'], ['name', 'Shop name'], ['tagline', 'Tagline'], ['address', 'Address'], ['phone', 'Phone'], ['email', 'Email'],
                       ['website', 'Website'], ['tax_id', 'GSTIN / tax line'], ['pan', 'PAN'], ['fssai', 'FSSAI licence no.']];
  const design = (s = Store.settings) => ({ ...DEFAULTS, ...(s.bill || {}) });
  const labels = (d = design()) => ({ ...LABELS, ...Object.fromEntries(Object.entries(d.labels || {}).filter(([, v]) => String(v).trim())) });
  /* Each shop field can be shown or hidden on the bill (Settings → Shop details). Older bill-design switches still count. */
  function showField(s, k) {
    const f = s.show_fields || {}, legacy = { logo: 'showLogo', tagline: 'showTagline', address: 'showAddress', phone: 'showPhone', tax_id: 'showTaxId' }[k];
    if (k in f) return !!f[k];
    if (legacy && s.bill && legacy in s.bill) return s.bill[legacy] !== false;
    return true;
  }

  function qrBlock(b, s, cur) {
    const q = (s.invoice || {}).qr || {};
    if (!q.enabled || (q.only_upi && b.payment_method !== 'UPI')) return '';
    const px = { small: 90, medium: 130, large: 170 }[q.size] || 130;
    let img = '';
    if (q.mode === 'upi' && q.upi_id) {
      try { img = QR.svg(QR.upiLink({ upi_id: q.upi_id, payee: q.payee || s.shop_name, amount: b.status === 'Cancelled' ? 0 : b.total, note: b.bill_no }), px); } catch { img = ''; }
    } else if (/^data:image\//.test(q.image || '')) img = `<img src="${esc(q.image)}" alt="Payment QR" style="width:${px}px;height:${px}px">`;
    if (!img) return '';
    return `<div class="r-qr">${img}<div class="r-qr-cap">${esc(q.caption || 'Scan to pay')}${q.mode === 'upi' && q.upi_id ? `<small>${esc(q.upi_id)}${b.status !== 'Cancelled' ? ' · ' + cur + Fmt.nf2.format(b.total) : ''}</small>` : ''}</div></div>`;
  }

  function taxRows(b, n) {
    if (!b.tax_enabled || !(Number(b.tax_amount) > 0)) return '';
    const label = esc(b.tax_label || 'Tax'), rows = [];
    const push = (rate, amt, incl) => {
      const tag = incl ? ' (incl.)' : '';
      if (b.tax_split) { const [c, g] = Calc.split(amt), h = rate === '' ? '' : ' ' + Fmt.qty(Number(rate) / 2) + '%'; rows.push([`CGST${h}${tag}`, c], [`SGST${h}${tag}`, g]); }
      else rows.push([`${label}${rate === '' ? '' : ' ' + Fmt.qty(rate) + '%'}${tag}`, amt]);
    };
    if (b.tax_scope === 'item' && Array.isArray(b.tax_breakdown) && b.tax_breakdown.length) for (const g of b.tax_breakdown) push(Number(g.rate), Number(g.tax), g.incl);
    else push(b.tax_mode === 'percent' ? Number(b.tax_value) : '', Number(b.tax_amount), false);
    return rows.map(([k, v]) => `<div class="r-row"><span>${k}</span><span>${n(v)}</span></div>`).join('');
  }

  function html(b, s = Store.settings, d = design(s)) {
    const cur = s.currency || '₹', L = labels(d), inv = s.invoice || {};
    const m = v => cur + Fmt.nf2.format(Number(v) || 0);
    const n = v => Fmt.nf2.format(Number(v) || 0);
    const items = Array.isArray(b.items) ? b.items : [];
    const align = ['left', 'center', 'right'].includes(d.align) ? d.align : 'center';
    const fs = Math.max(9, Math.min(18, Number(d.fontSize) || 12));
    const tz = s.timezone || 'Asia/Kolkata', when = new Date(b.created_at);
    const date = when.toLocaleDateString('en-IN', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' });
    const time = when.toLocaleTimeString('en-IN', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
    const qtyTotal = items.reduce((a, i) => a + Number(i.qty || 0), 0);
    const brand = Store.sys.brand || {};
    const sf = k => showField(s, k);
    const logo = sf('logo') && /^(https:|data:image\/)/.test(s.logo || '') ? `<img class="r-logo" src="${esc(s.logo)}" alt="">` : '';
    const cancelled = b.status === 'Cancelled', saved = Number(b.discount_amount) || 0;
    const wide = d.paper === 'a4' || d.paper === 'a5';   // narrow thermal rolls show HSN and discount under the item name instead of in columns
    const hsnCol = wide && d.showHsn && items.some(i => i.hsn), discCol = wide && d.showItemDiscount && items.some(i => Number(i.discount) > 0);
    const under = i => [d.showCode && i.code ? esc(i.code) : '', !wide && d.showHsn && i.hsn ? 'HSN ' + esc(i.hsn) : '', !wide && d.showItemDiscount && Number(i.discount) > 0 ? `${Number(i.discount_pct) ? Fmt.qty(i.discount_pct) + '% off ' : 'Disc '}-${n(i.discount)}` : ''].filter(Boolean).join(' · ');
    const qr = qrBlock(b, s, cur), qrPos = inv.qr?.position === 'top' ? 'top' : 'bottom';
    const bank = inv.bank?.enabled ? inv.bank : null, sig = inv.signature?.enabled ? inv.signature : null;
    const cf = Array.isArray(b.custom_fields) ? b.custom_fields.filter(x => x && x.value) : [];
    const tpl = TEMPLATES.some(t => t[0] === d.template) ? d.template : 'classic';
    const color = /^#[0-9a-f]{6}$/i.test(d.color || '') ? d.color : '#1f2937';
    const shopLines = [
      sf('tagline') && s.tagline ? `<div>${esc(s.tagline)}</div>` : '',
      sf('address') && s.address ? `<div class="r-pre">${esc(s.address)}</div>` : '',
      [sf('phone') && s.phone ? `Ph: ${esc(s.phone)}` : '', sf('email') && s.email ? esc(s.email) : ''].filter(Boolean).join(' · ') ? `<div>${[sf('phone') && s.phone ? `Ph: ${esc(s.phone)}` : '', sf('email') && s.email ? esc(s.email) : ''].filter(Boolean).join(' · ')}</div>` : '',
      sf('website') && s.website ? `<div>${esc(s.website)}</div>` : '',
      sf('tax_id') && s.tax_id ? `<div>${esc(s.tax_id)}</div>` : '',
      sf('pan') && s.pan ? `<div>PAN: ${esc(s.pan)}</div>` : '',
      sf('fssai') && s.fssai ? `<div>FSSAI Lic. No: ${esc(s.fssai)}</div>` : ''
    ].join('');
    return `<div class="receipt paper-${esc(d.paper)} rt-${tpl}" style="font-size:${fs}px;--bc:${color}">
      ${qrPos === 'top' ? qr : ''}
      <div class="r-head" style="text-align:${align}">
        ${logo}
        ${sf('name') ? `<div class="r-shop">${esc(s.shop_name || 'Shop')}</div>` : ''}
        ${shopLines}
        ${d.headerText ? `<div class="r-pre">${esc(d.headerText)}</div>` : ''}
        ${d.titleText ? `<div class="r-title">${esc(d.titleText)}</div>` : ''}
      </div>
      ${cancelled ? '<div class="r-void">CANCELLED</div>' : ''}
      <div class="r-meta">
        <div><span>${esc(L.bill_no)}: <b>${esc(b.bill_no || '—')}</b></span><span>${esc(date)}</span></div>
        ${b.order_no && b.invoice_no ? `<div><span>Order no: <b>#${esc(b.order_no)}</b></span><span>${b.table_number && b.table_number !== 'Counter' ? esc(RestaurantCloud.tableName(b.table_number)) : ''}</span></div>` : ''}
        <div><span>${d.showCashier && b.cashier_name ? esc(L.by) + ': ' + esc(b.cashier_name) : ''}</span><span>${esc(time)}</span></div>
        ${d.showCustomer && (b.customer_name || b.customer_phone) ? `<div><span>To: ${esc([b.customer_name, b.customer_phone].filter(Boolean).join(' · '))}</span></div>` : ''}
        ${d.showCustomer && b.customer_address ? `<div><span class="r-pre">${esc(b.customer_address)}</span></div>` : ''}
      </div>
      ${cf.length ? `<div class="r-fields">${cf.map(x => `<div><span>${esc(x.label)}</span><b>${esc(x.value)}</b></div>`).join('')}</div>` : ''}
      <table class="r-items"><thead><tr><th class="l">${esc(L.item)}</th>${hsnCol ? `<th>${esc(L.hsn)}</th>` : ''}<th>${esc(L.qty)}</th><th>${esc(L.rate)}</th>${discCol ? '<th>Disc</th>' : ''}<th>${esc(L.amount)}</th></tr></thead><tbody>
      ${items.map(i => `<tr><td class="l">${esc(i.alias || i.name)}${under(i) ? `<small>${under(i)}</small>` : ''}</td>${hsnCol ? `<td>${esc(i.hsn || '')}</td>` : ''}<td>${Fmt.qty(i.qty)}${i.unit && i.unit !== 'pcs' ? `<small>${esc(i.unit)}</small>` : ''}</td><td>${n(i.price)}</td>${discCol ? `<td>${Number(i.discount) > 0 ? '-' + n(i.discount) : ''}</td>` : ''}<td>${n(i.line_total)}</td></tr>`).join('')}
      </tbody></table>
      <div class="r-totals">
        ${d.showItemCount ? `<div class="r-row r-muted"><span>${esc(L.items_count)} ${items.length} · ${esc(L.qty)} ${Fmt.qty(qtyTotal)}</span><span></span></div>` : ''}
        <div class="r-row"><span>${esc(L.subtotal)}</span><span>${n(b.items_subtotal)}</span></div>
        ${saved > 0 ? `<div class="r-row"><span>${esc(L.discount)}${b.discount_mode === 'percent' ? ' (' + Number(b.discount_value) + '%)' : ''}</span><span>-${n(saved)}</span></div>` : ''}
        ${taxRows(b, n)}
        ${Number(b.round_off) ? `<div class="r-row"><span>${esc(L.round_off)}</span><span>${Number(b.round_off) > 0 ? '+' : ''}${n(b.round_off)}</span></div>` : ''}
        ${Number(b.less_amount) > 0 ? `<div class="r-row"><span>${esc(L.less)}</span><span>-${n(b.less_amount)}</span></div>` : ''}
        <div class="r-row r-grand"><span>${esc(L.total)}</span><span>${m(b.total)}</span></div>
        ${d.showPayment ? `<div class="r-row"><span>${esc(L.paid_by)}</span><span>${esc(b.payment_method)}</span></div>` : ''}
        ${d.showCash && b.cash_received != null && b.payment_method === 'Cash' ? `<div class="r-row"><span>${esc(L.cash_received)}</span><span>${n(b.cash_received)}</span></div>${Number(b.change_amount) > 0 ? `<div class="r-row"><span>${esc(L.change)}</span><span>${n(b.change_amount)}</span></div>` : ''}` : ''}
        ${d.showSavings && saved > 0 ? `<div class="r-save">${esc(L.you_saved)} ${m(saved)}</div>` : ''}
      </div>
      ${b.notes ? `<div class="r-note r-pre">${esc(b.notes)}</div>` : ''}
      ${bank ? `<div class="r-bank"><b>Bank details</b>${[['A/c name', bank.holder], ['Bank', bank.bank], ['A/c no.', bank.account], ['IFSC', bank.ifsc], ['Branch', bank.branch]].filter(x => x[1]).map(([k, v]) => `<div><span>${k}</span><span>${esc(v)}</span></div>`).join('')}</div>` : ''}
      ${qrPos === 'bottom' ? qr : ''}
      ${sig ? `<div class="r-sign sign-${esc(sig.size || 'medium')}">${/^data:image\//.test(sig.image || '') ? `<img src="${esc(sig.image)}" alt="Signature">` : '<div class="r-sign-line"></div>'}<div>${esc(sig.label || 'Authorised signatory')}</div><small>for ${esc(s.shop_name || '')}</small></div>` : ''}
      ${d.footerText ? `<div class="r-foot r-pre" style="text-align:${align}">${esc(d.footerText)}</div>` : ''}
      ${brand.show_on_bill !== false && brand.software_name ? `<div class="r-vendor">Billing software by ${esc(brand.software_name)}</div>` : ''}
    </div>`;
  }

  async function print(b) {
    const d = design();
    let area = $('#printArea');
    if (!area) { area = document.createElement('div'); area.id = 'printArea'; document.body.append(area); }
    area.innerHTML = html(b);
    let page = $('#pageStyle');
    if (!page) { page = document.createElement('style'); page.id = 'pageStyle'; document.head.append(page); }
    page.textContent = d.paper === 'a4' ? '@page{size:A4;margin:12mm}' : d.paper === 'a5' ? '@page{size:A5;margin:8mm}' : `@page{size:${d.paper === '58' ? 58 : 80}mm auto;margin:2mm}`;
    await Promise.all($$('img', area).map(i => i.decode?.().catch(() => {})));
    document.body.classList.add('printing');
    window.print();
    setTimeout(() => document.body.classList.remove('printing'), 400);
  }

  function shareText(b, s = Store.settings) {
    const L = labels();
    const lines = [`*${s.shop_name || 'Shop'}*`, `${L.bill_no} ${b.bill_no} · ${Fmt.dateTime(b.created_at)}`, ''];
    for (const i of b.items || []) lines.push(`${i.alias || i.name} × ${Fmt.qty(i.qty)}${i.unit && i.unit !== 'pcs' ? ' ' + i.unit : ''} = ${Fmt.money(i.line_total)}`);
    lines.push('');
    if (Number(b.discount_amount) > 0) lines.push(`${L.discount}: -${Fmt.money(b.discount_amount)}`);
    if (Number(b.tax_amount) > 0) lines.push(`${b.tax_label || 'Tax'}: ${Fmt.money(b.tax_amount)}`);
    if (Number(b.less_amount) > 0) lines.push(`${L.less}: -${Fmt.money(b.less_amount)}`);
    lines.push(`*${L.total_screen}: ${Fmt.money(b.total)}* (${b.payment_method})`);
    const q = (s.invoice || {}).qr; if (q?.enabled && q.mode === 'upi' && q.upi_id) lines.push(`Pay by UPI: ${q.upi_id}`);
    const foot = design(s).footerText; if (foot) lines.push('', foot);
    return lines.join('\n');
  }
  function whatsapp(b) {
    let phone = String(b.customer_phone || '').replace(/\D/g, '');
    if (phone.length === 10) phone = (Cloud.cfg.whatsappCountryCode || '91') + phone;
    const link = (phone ? 'https://wa.me/' + phone : 'https://wa.me/') + '?text=' + encodeURIComponent(shareText(b));
    window.open(link, '_blank', 'noopener');
  }
  return { html, print, whatsapp, design, labels, showField, DEFAULTS, LABELS, LABEL_NAMES, TEMPLATES, SHOP_FIELDS };
})();

/* js/billing.js?v=19 */
;/* Billing counter: search/scan items, build the bill, take payment, print. */
'use strict';
const Billing = (() => {
  const PENDING_KEY = () => 'SHOPBILL_PENDING:' + Cloud.cfg.supabaseUrl + ':' + Cloud.userEmail;
  let cart = [], payment = 'Cash', discount = { mode: 'percent', value: '' }, customer = { name: '', phone: '', address: '' }, notes = '', received = '', fields = {};
  let category = 'All', query = '', highlight = 0, saving = false, pending = null, lastBill = null, showExtras = false, root = null, catalogSig = '';

  try { pending = JSON.parse(localStorage.getItem(PENDING_KEY()) || 'null'); } catch { pending = null; }
  if (pending) ({ cart, payment, discount, customer, notes, received = '', fields = {} } = pending.state);
  customer = { name: '', phone: '', address: '', ...customer };

  const cashOn = () => payment === 'Cash' && Store.feature('cash_received');
  const warnMode = () => !!Store.settings.allow_negative_stock;      // true: warn and allow; false: stop at stock
  const customFields = () => { const c = Store.invoice().custom_fields || {}; return c.enabled ? (c.fields || []).filter(Boolean) : []; };

  /* Lines in the order the server receives them (oldest first). */
  function calcLines() {
    const s = Store.settings;
    return [...cart].reverse().map(l => l.custom
      ? { qty: l.qty, price: l.price, discount_pct: 0, tax_rate: s.tax_value, incl: !!s.tax_inclusive_default }
      : { qty: l.qty, price: l.price, discount_pct: l.dpct || 0, tax_rate: l.rate ?? s.tax_value, incl: !!l.incl });
  }
  function totals() {
    const sys = Store.sys;
    return Calc.bill(calcLines(), Store.settings, { discount, canDiscount: Store.can('discount'), received, cashOn: cashOn(),
      canShort: Store.can('short_cash'), maxShort: sys.limits?.max_short_amount ?? 0, isAdmin: Store.isAdmin });
  }
  const lineTotal = l => { const s = Store.settings; return Calc.bill([{ qty: l.qty, price: l.price, discount_pct: l.custom ? 0 : (l.dpct || 0), tax_rate: 0 }], { ...s, tax_enabled: false, round_off: false }).sub; };

  function persistPending() { try { pending ? localStorage.setItem(PENDING_KEY(), JSON.stringify(pending)) : localStorage.removeItem(PENDING_KEY()); } catch { /* ignore */ } }
  const locked = () => saving || !!pending;

  /* ---------- catalog ---------- */
  function matches() {
    const q = query.trim().toLowerCase();
    let list = Store.items.filter(i => i.active);
    if (category !== 'All') list = list.filter(i => i.category === category);
    if (q) {
      const scored = [];
      for (const i of list) {
        const name = i.name.toLowerCase(), code = (i.code || '').toLowerCase(), alias = (i.alias || '').toLowerCase();
        let score = -1;
        if (code && code === q) score = 0; else if (name.startsWith(q) || alias.startsWith(q)) score = 1; else if (code.startsWith(q)) score = 2;
        else if (name.split(/\s+/).some(w => w.startsWith(q))) score = 3; else if (name.includes(q) || alias.includes(q)) score = 4;
        if (score >= 0) scored.push([score, i]);
      }
      list = scored.sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name)).map(x => x[1]);
    }
    return list;
  }
  const noStock = i => i.track_stock && Number(i.stock) <= 0;
  const blocked = i => noStock(i) && !warnMode();
  function stockBadge(i) {
    if (!i.track_stock || !Store.feature('stock_badges') || !Store.stockShown()) return '';
    const n = Number(i.stock);
    if (n <= 0) return '<span class="badge badge-red">Out of stock</span>';
    if (n <= Number(i.low_stock_at)) return `<span class="badge badge-amber">${Fmt.qty(n)} left</span>`;
    return `<span class="stock-note">${Fmt.qty(n)} ${esc(i.unit)}</span>`;
  }
  function inCart(id) { return cart.filter(l => l.id === id && !l.custom).reduce((a, l) => a + Number(l.qty), 0); }

  /* Rebuilds the grid only when what is shown actually changes (search, category, stock, items). */
  function renderCatalog(force) {
    if (!root?.isConnected) return;
    const list = matches(), shown = list.slice(0, 120), codes = Store.feature('item_codes_on_tiles');
    if (highlight >= shown.length) highlight = Math.max(0, shown.length - 1);
    const cats = ['All', ...Store.categories.filter(c => Store.items.some(i => i.active && i.category === c))];
    const sig = JSON.stringify([category, query, highlight, cats, shown.map(i => [i.id, i.name, i.price, i.stock, i.track_stock, i.code]), warnMode(), Store.stockShown(), codes, list.length]);
    if (!force && sig === catalogSig) return paintBadges();
    catalogSig = sig;
    $('#bCats', root).innerHTML = cats.map(c => `<button type="button" class="chip ${c === category ? 'on' : ''}" data-cat="${esc(c)}">${esc(c === 'All' ? 'All items' : c)} <span class="category-count">${Store.items.filter(i => i.active && (c === 'All' || i.category === c)).length}</span></button>`).join('');
    const grid = $('#bGrid', root);
    if (!Store.items.length) {
      grid.innerHTML = `<div class="empty"><h3>No items yet</h3><p>${Store.can('items') ? 'Add the things you sell in <a href="#/items">Items</a>.' : 'Ask the owner to add items.'}</p></div>`;
    } else if (!list.length) {
      grid.innerHTML = `<div class="empty"><h3>No match for “${esc(query)}”</h3><p>Check the spelling or code${Store.feature('extra_items') ? ', or add it as an extra item' : ''}.</p></div>`;
    } else {
      grid.innerHTML = shown.map((i, n) => `<button type="button" class="tile ${n === highlight && query ? 'hl' : ''} ${blocked(i) ? 'off' : ''}" data-add="${esc(i.id)}" ${blocked(i) ? 'aria-disabled="true"' : ''}>
        <span class="tile-name">${esc(i.name)}</span>
        ${codes && i.code ? `<span class="tile-code">${esc(i.code)}</span>` : ''}
        <span class="tile-foot"><b>${Fmt.money(i.price)}</b><small>/${esc(i.unit)}</small>${stockBadge(i)}</span></button>`).join('') +
        (list.length > shown.length ? `<p class="grid-more">Showing 120 of ${list.length}. Type more of the name to narrow down.</p>` : '');
    }
    paintBadges();
  }
  /* Updates only the “×N” badges. Only the item that just changed animates. */
  function paintBadges(changedId) {
    if (!root?.isConnected || !Store.feature('qty_badges')) return;
    for (const tile of $$('#bGrid .tile', root)) {
      const id = tile.dataset.add, q = inCart(id);
      let b = tile.querySelector('.tile-qty');
      tile.classList.toggle('in-bill', q > 0);
      if (!q) { b?.remove(); continue; }
      if (!b) { b = document.createElement('span'); b.className = 'tile-qty'; b.setAttribute('aria-hidden', 'true'); tile.prepend(b); }
      const txt = '×' + Fmt.qty(q);
      if (b.textContent !== txt) b.textContent = txt;
      if (id === changedId) { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
    }
  }

  function stockNote(item, wanted) {
    if (!item.track_stock || wanted <= Number(item.stock)) return wanted;
    if (warnMode()) { toast(`${item.name}: only ${Fmt.qty(Math.max(0, item.stock))} ${item.unit} in stock. Billing more than stock.`, 'warn'); return wanted; }
    toast(`Only ${Fmt.qty(Math.max(0, item.stock))} ${item.unit} of ${item.name} in stock.`, 'warn');
    return Math.max(0, Number(item.stock));
  }

  function add(item, qty = 1) {
    if (locked()) return toast('Finish saving the current bill first.', 'warn');
    if (blocked(item)) return toast(`${item.name} is out of stock.`, 'warn');
    lastBill = null;
    let l = cart.find(x => x.id === item.id && !x.custom);
    const want = +((l ? Number(l.qty) : 0) + qty).toFixed(3), q = stockNote(item, want);
    if (l) { if (q === Number(l.qty)) return paintBadges(item.id); l.qty = q; }
    else {
      if (q <= 0) return;
      l = { key: crypto.randomUUID(), id: item.id, name: item.name, unit: item.unit, price: Number(item.price), qty: q, code: item.code || '',
            dpct: Number(item.default_discount) || 0, rate: item.tax_rate == null ? null : Number(item.tax_rate), incl: !!item.price_includes_tax };
      cart.unshift(l);
    }
    renderTicket(l.key, item.id);
  }

  async function addExtra() {
    if (!Store.feature('extra_items')) return;
    if (locked()) return toast('This bill is waiting to be saved. Press Retry save, or Discard it, before adding items.', 'warn', 6000);
    const d = modal('Add extra item', `<form id="xForm" class="form-grid">
      <label class="field span-2"><span>Item name</span><input name="name" required maxlength="120" placeholder="e.g. Carry bag" autocomplete="off"></label>
      <label class="field"><span>Price (${esc(Fmt.cur())})</span><input name="price" required type="number" min="0.01" max="9999999" step="0.01" inputmode="decimal"></label>
      <label class="field"><span>Quantity</span><input name="qty" required type="number" min="1" max="50" step="1" value="1" inputmode="numeric"></label>
      <p class="hint span-2">Only added to this bill. It is not saved in Items and does not change stock.</p>
      <div class="modal-actions span-2"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary">Add to bill</button></div></form>`, { size: 'modal-sm' });
    $('[name=name]', d).focus();
    $('#xForm', d).onsubmit = e => {
      e.preventDefault(); const f = new FormData(e.target);
      lastBill = null;
      cart.unshift({ key: crypto.randomUUID(), id: null, custom: true, name: String(f.get('name')).trim(), unit: 'pcs', price: Math.round(Number(f.get('price')) * 100) / 100, qty: Number(f.get('qty')) });
      d.close(); renderTicket(cart[0].key); focusSearch();
    };
  }

  /* ---------- ticket (the bill) ---------- */
  function taxRows(t) {
    const s = Store.settings; if (!s.tax_enabled) return '';
    const label = esc(s.tax_label || 'Tax'), rows = [];
    const push = (name, rate, amt, incl) => {
      if (s.tax_split) { const [c, g] = Calc.split(amt), h = Number(rate) / 2; rows.push([`CGST${rate !== '' ? ' ' + Fmt.qty(h) + '%' : ''}${incl ? ' (incl.)' : ''}`, c], [`SGST${rate !== '' ? ' ' + Fmt.qty(h) + '%' : ''}${incl ? ' (incl.)' : ''}`, g]); }
      else rows.push([`${name}${rate !== '' ? ' ' + Fmt.qty(rate) + '%' : ''}${incl ? ' (incl.)' : ''}`, amt]);
    };
    if (s.tax_scope === 'item') { for (const g of t.breakdown) push(label, g.rate, g.tax, g.incl); }
    else push(label, s.tax_mode === 'percent' ? Number(s.tax_value) : '', t.tax, false);
    return rows.map(([n, v]) => `<div class="ts"><span>${n}</span><span>${Fmt.nf2.format(v)}</span></div>`).join('');
  }

  function renderTicket(flashKey, changedId) {
    if (!root?.isConnected) return;
    const t = totals(), lock = locked(), L = Receipt.labels();
    const lines = $('#tLines', root);
    lines.innerHTML = cart.length ? cart.map(l => `<li class="tl ${l.key === flashKey ? 'flash' : ''}" data-key="${esc(l.key)}">
        <div class="tl-name">${esc(l.name)}${l.custom ? '<em>extra</em>' : ''}<small>${Fmt.money(l.price)} / ${esc(l.unit)}${!l.custom && l.dpct ? ` · <span class="tl-off">−${Fmt.qty(l.dpct)}%</span>` : ''}</small></div>
        <div class="tl-qty"><button type="button" class="qbtn" data-dec aria-label="Less" ${lock ? 'disabled' : ''}>${Icon('minus')}</button><input type="number" inputmode="decimal" step="any" min="0" value="${Number(l.qty)}" aria-label="Quantity of ${esc(l.name)}" data-qty ${lock ? 'disabled' : ''}><button type="button" class="qbtn" data-inc aria-label="More" ${lock ? 'disabled' : ''}>${Icon('plus')}</button></div>
        <div class="tl-amt">${Fmt.nf2.format(lineTotal(l))}</div>
        <button type="button" class="tl-del" data-del aria-label="Remove ${esc(l.name)}" ${lock ? 'disabled' : ''}>${Icon('x')}</button></li>`).join('')
      : `<li class="t-empty">${lastBill ? `<b>Ready for the next customer.</b>` : '<b>Bill is empty.</b>'}<span>${isTouch() ? 'Tap an item to add it.' : 'Scan a barcode, type a name and press Enter, or tap an item.'}</span></li>`;
    if (flashKey) lines.querySelector('.flash')?.scrollIntoView({ block: 'nearest' });

    $('#tCount', root).textContent = cart.length ? `${cart.length} line${cart.length === 1 ? '' : 's'} · Qty ${Fmt.qty(t.qty)}` : '';
    $('#tSums', root).innerHTML = `
      <div class="ts"><span>${esc(L.subtotal)}</span><span>${Fmt.nf2.format(t.sub)}</span></div>
      ${t.disc ? `<div class="ts"><span>${esc(L.discount)}</span><span>−${Fmt.nf2.format(t.disc)}</span></div>` : ''}
      ${taxRows(t)}
      ${t.round ? `<div class="ts"><span>${esc(L.round_off)}</span><span>${t.round > 0 ? '+' : ''}${Fmt.nf2.format(t.round)}</span></div>` : ''}
      ${t.less ? `<div class="ts ts-less"><span>${esc(L.less)}</span><span>−${Fmt.nf2.format(t.less)}</span></div>` : ''}
      <div class="ts ts-grand"><span>${esc(L.total_screen)}</span><span>${Fmt.money(t.final)}</span></div>`;

    const methods = Store.payments();
    if (!methods.includes(payment)) payment = methods[0] || 'Cash';
    for (const b of $$('[data-pay]', root)) { b.classList.toggle('on', b.dataset.pay === payment); b.setAttribute('aria-pressed', b.dataset.pay === payment); b.disabled = lock; }
    $('#tCash', root).hidden = !cashOn() || !cart.length;
    $('#tChange', root).innerHTML = !t.rec ? '' : t.short
      ? (t.shortBlocked ? `<span class="neg">Short by ${Fmt.money(t.short)}. ${t.shortBlocked === 'max' ? `You can accept at most ${Fmt.money(Store.sys.limits?.max_short_amount ?? 0)} less.` : esc(t.shortBlocked)}</span>` : `<span class="short-ok">Short by ${Fmt.money(t.short)} — bill will be <b>${Fmt.money(t.final)}</b></span>`)
      : `Return <b>${Fmt.money(t.change)}</b>`;
    $('#tDiscRow', root).hidden = !Store.can('discount');
    for (const el of $$('#tDiscMode, #tDiscVal, #tCust input, #tReceived', root)) el.disabled = lock;
    const custOn = Store.feature('customer_details'), addrOn = Store.feature('customer_address'), notesOn = Store.feature('notes'), cf = customFields();
    $('#tCustName', root).hidden = $('#tCustPhone', root).hidden = !custOn;
    $('#tCustAddr', root).hidden = !addrOn;
    $('#tNotes', root).hidden = !notesOn;
    $('#tFields', root).hidden = !cf.length;
    const tog = $('#tCustToggle', root), any = custOn || addrOn || notesOn || cf.length;
    tog.hidden = !any; $('#tCust', root).hidden = !showExtras || !any;
    const parts = [custOn || addrOn ? 'customer' : '', notesOn ? 'note' : '', cf.length ? 'details' : ''].filter(Boolean);
    const word = parts.length > 1 ? parts.slice(0, -1).join(', ') + ' & ' + parts.at(-1) : parts[0] || '';
    const filled = customer.name || customer.phone || customer.address || notes || Object.values(fields).some(Boolean);
    tog.textContent = showExtras ? `Hide ${word}` : `${filled ? 'Edit' : '+ Add'} ${word}`;
    $('#tExtra', root).hidden = !Store.feature('extra_items');

    const canSave = !saving && (pending || cart.length > 0), k = isTouch() ? '' : ' <kbd>F8</kbd>', k9 = isTouch() ? '' : ' <kbd>F9</kbd>';
    $('#tSave', root).disabled = !canSave; $('#tPrint', root).disabled = !canSave;
    $('#tSave', root).innerHTML = saving ? 'Saving…' : pending ? 'Retry save' : 'Save' + k;
    $('#tPrint', root).innerHTML = saving ? 'Saving…' : pending ? `${Icon('printer')} Retry & print` : `${Icon('printer')} Save & print${k9}`;
    $('#tClear', root).disabled = saving || (!pending && !cart.length);
    $('#tClear', root).textContent = pending ? 'Discard' : 'Clear';
    $('#tExtra', root).classList.toggle('is-locked', lock);
    $('#tPending', root).hidden = !pending;

    const done = $('#tDone', root);
    done.hidden = !lastBill;
    if (lastBill) done.innerHTML = `<div class="done-text">${Icon('check')}<span><b>${esc(lastBill.bill_no)}</b> saved · ${Fmt.money(lastBill.total)} · ${esc(lastBill.payment_method)}${Number(lastBill.change_amount) > 0 ? ` · return ${Fmt.money(lastBill.change_amount)}` : ''}</span></div>
      <div class="done-actions"><button type="button" class="btn btn-sm" data-reprint>${Icon('printer')} Print</button>${Store.feature('whatsapp') ? `<button type="button" class="btn btn-sm" data-wa>${Icon('whatsapp')} WhatsApp</button>` : ''}<button type="button" class="btn btn-sm btn-ghost" data-view>View</button></div>`;

    $('#mTotal', root).textContent = Fmt.money(t.final);
    $('#mCount', root).textContent = cart.length ? `${cart.length} line${cart.length === 1 ? '' : 's'} · Qty ${Fmt.qty(t.qty)}` : 'Empty bill';
    paintBadges(changedId);
  }

  function setQty(key, value) {
    const l = cart.find(x => x.key === key); if (!l || locked()) return;
    let q = Math.round(Number(value) * 1000) / 1000;
    if (!Number.isFinite(q) || q < 0) q = 1;
    if (q === 0) { cart = cart.filter(x => x !== l); renderTicket(null, l.id); return; }
    const item = l.id && Store.items.find(i => i.id === l.id);
    if (item) q = stockNote(item, q);
    if (q <= 0) { cart = cart.filter(x => x !== l); renderTicket(null, l.id); return; }
    l.qty = q; renderTicket(l.key, l.id);
  }

  function resetBill() { cart = []; discount = { mode: discount.mode, value: '' }; customer = { name: '', phone: '', address: '' }; notes = ''; received = ''; fields = {}; showExtras = false; }
  async function clearBill() {
    if (pending && !saving) {
      if (!(await ask({ title: 'Discard this unsaved bill?', body: 'Use this only if the bill is wrong. If you saw an internet error, check Records first — the bill may have been saved already. Retry save never makes a double bill.', confirm: 'Discard bill', danger: true }))) return;
      pending = null; persistPending(); resetBill(); syncInputs(); renderTicket(); focusSearch(); return;
    }
    if (locked() || !cart.length) return;
    if (cart.length > 1 && !(await ask({ title: 'Clear this bill?', body: 'All lines on the current bill will be removed.', confirm: 'Clear bill', danger: true }))) return;
    resetBill(); syncInputs(); renderTicket(); focusSearch();
  }

  function paintFields() {
    const box = $('#tFields', root); if (!box) return;
    box.innerHTML = customFields().map((lab, i) => `<input data-cf="${esc(lab)}" maxlength="120" placeholder="${esc(lab)}" aria-label="${esc(lab)}" value="${esc(fields[lab] || '')}">`).join('');
  }
  function syncInputs() {
    $('#tDiscMode', root).value = discount.mode; $('#tDiscVal', root).value = discount.value;
    $('#tCustName', root).value = customer.name; $('#tCustPhone', root).value = customer.phone; $('#tCustAddr', root).value = customer.address || ''; $('#tNotes', root).value = notes;
    $('#tReceived', root).value = received; paintFields();
  }

  /* ---------- save ---------- */
  async function save(andPrint) {
    if (saving) return;
    if (!pending) {
      if (!cart.length) return;
      const t = totals();
      if (t.shortBlocked) { $('#tReceived', root)?.focus(); return toast(`Cash is short by ${Fmt.money(t.short)}. ${t.shortBlocked === 'max' ? `You can accept at most ${Fmt.money(Store.sys.limits?.max_short_amount ?? 0)} less.` : t.shortBlocked}`, 'warn', 5000); }
      const lim = Store.sys.limits || {}, dPct = discount.mode === 'percent' ? Number(discount.value) || 0 : (t.sub > 0 ? (Number(discount.value) || 0) / t.sub * 100 : 0);
      if (!Store.isAdmin && Store.can('discount') && dPct > Number(lim.max_discount_percent ?? 100) + 1e-9) { $('#tDiscVal', root)?.focus(); return toast(`The biggest discount you can give is ${Fmt.qty(lim.max_discount_percent)}%.`, 'warn', 5000); }
      const gross = Calc.bill(calcLines(), Store.settings, {}).total;
      const items = [...cart].reverse().map(l => l.custom ? { custom: true, name: l.name, price: l.price.toFixed(2), qty: String(l.qty), unit: l.unit } : { id: l.id, name: l.name, qty: String(l.qty) });
      const dv = Store.can('discount') ? Number(discount.value) || 0 : 0, custOn = Store.feature('customer_details');
      const extra = {};
      if (Store.feature('customer_address') && customer.address?.trim()) extra.customer_address = customer.address.trim();
      const cf = customFields().map(label => ({ label, value: (fields[label] || '').trim() })).filter(x => x.value);
      if (cf.length) extra.custom_fields = cf;
      pending = {
        args: { p_request_id: crypto.randomUUID(), p_items: items, p_payment_method: payment, p_discount_mode: dv > 0 ? discount.mode : null, p_discount_value: dv > 0 ? dv : 0,
          p_customer_name: custOn ? customer.name.trim() : '', p_customer_phone: custOn ? customer.phone.trim() : '', p_notes: Store.feature('notes') ? notes.trim() : '',
          p_expected_total: t.final, p_gross_total: gross, p_cash_received: t.rec > 0 ? t.rec : null, p_extra: Object.keys(extra).length ? extra : null },
        state: { cart, payment, discount, customer, notes, received, fields }
      };
      persistPending();
    }
    saving = true; renderTicket();
    try {
      const bill = await Cloud.rpc('shop_create_bill', pending.args);
      pending = null; persistPending();
      lastBill = bill; resetBill(); payment = Store.payments()[0] || 'Cash';
      syncInputs(); toast(`${bill.bill_no} saved · ${Fmt.money(bill.total)}${Number(bill.change_amount) > 0 ? ' · return ' + Fmt.money(bill.change_amount) : ''}`, 'ok');
      document.body.classList.remove('sheet-open');
      if (andPrint) Receipt.print(bill);
      Store.applyStockUpdates(bill.stock_updates);
    } catch (e) {
      if (e.code === 'LOCKED') return;
      if (e.code === 'AUTH') toast('Sign in again to save this bill. It stays on this screen — then press Retry save.', 'warn', 7000);
      else if (e.code === 'NETWORK' || e.code === 'ETIMEDOUT' || !(e.status || e.httpStatus) || (e.status || e.httpStatus) >= 500) {
        toast('Not saved yet: ' + e.message + ' Press Retry save — it will not create a double bill.', 'error', 7000);
      } else {
        pending = null; persistPending();
        toast(e.message, 'error', 7000);
        if (/stock|no longer for sale|Prices/i.test(e.message)) Store.loadItems(true).catch(() => {});
        if (/payment method|permission|allowed|turned off/i.test(e.message)) App.refreshMe().then(() => renderTicket()).catch(() => {});
      }
    } finally { saving = false; renderTicket(); }
  }

  /* ---------- keyboard ---------- */
  function focusSearch() { const s = $('#bSearch', root); if (s && !isTouch()) { s.focus(); s.select(); } }
  function onKey(e) {
    if (!root?.isConnected || $('dialog[open]')) return;
    if (e.key === 'F2') { e.preventDefault(); focusSearch(); }
    else if (e.key === 'F8') { e.preventDefault(); save(false); }
    else if (e.key === 'F9') { e.preventDefault(); save(true); }
    else if (e.key === 'F4') { e.preventDefault(); if (!locked()) { const m = Store.payments(); payment = m[(m.indexOf(payment) + 1) % m.length]; renderTicket(); } }
    else if (e.altKey && e.key.toLowerCase() === 'x') { e.preventDefault(); addExtra(); }
    else if (e.altKey && e.key.toLowerCase() === 'n') { e.preventDefault(); clearBill(); }
  }

  /* ---------- mount ---------- */
  function mount(view) {
    root = view; catalogSig = '';
    const methods = Store.payments();
    if (!methods.includes(payment)) payment = methods[0] || 'Cash';
    view.innerHTML = `<div class="billing">
      <section class="catalog" aria-label="Items">
        <div class="catalog-bar">
          <label class="search">${Icon('search')}<input id="bSearch" type="search" placeholder="${isTouch() ? 'Search items' : 'Scan barcode or type item name or code'}" autocomplete="off" aria-label="Search items">${isTouch() ? '' : '<kbd>F2</kbd>'}</label>
          <button type="button" class="btn" id="tExtra" title="Add extra item">${Icon('plus')} <span>Extra item</span></button>
        </div>
        <div class="chips" id="bCats" role="toolbar" aria-label="Categories"></div>
        <div class="grid" id="bGrid"></div>
      </section>
      <aside class="ticket" id="ticket" aria-label="Current bill">
        <button type="button" class="sheet-close" id="sheetClose">${Icon('x')} Back to items</button>
        <div class="t-done" id="tDone" hidden></div>
        <div class="paper">
          <div class="paper-head"><span>Current bill</span><span id="tCount"></span></div>
          <ul class="t-lines" id="tLines"></ul>
          <div class="t-sums" id="tSums"></div>
        </div>
        <div class="t-controls">
          <div class="t-row" id="tDiscRow"><label for="tDiscVal">Discount</label><div class="joined"><input id="tDiscVal" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0"><select id="tDiscMode" aria-label="Discount type"><option value="percent">%</option><option value="amount">${esc(Fmt.cur())}</option></select></div></div>
          <button type="button" class="linkish" id="tCustToggle"></button>
          <div class="t-cust" id="tCust" hidden>
            <input id="tCustName" maxlength="80" placeholder="Customer name" autocomplete="off" aria-label="Customer name">
            <input id="tCustPhone" maxlength="20" inputmode="tel" placeholder="Phone" autocomplete="off" aria-label="Customer phone">
            <input id="tCustAddr" class="span-2" maxlength="200" placeholder="Customer address" autocomplete="off" aria-label="Customer address">
            <input id="tNotes" class="span-2" maxlength="300" placeholder="Note on bill (optional)" aria-label="Note on bill">
            <div class="t-fields span-2" id="tFields"></div>
          </div>
          <div class="pay" role="group" aria-label="Payment method" style="--n:${methods.length}">${methods.map(v => `<button type="button" data-pay="${v}">${v}</button>`).join('')}</div>
          <div class="t-row" id="tCash"><label for="tReceived">Cash received</label><input id="tReceived" type="number" min="0" step="1" inputmode="decimal" placeholder="0"><span class="change" id="tChange"></span></div>
          <p class="t-pending" id="tPending" hidden>This bill did not reach the server yet. Retry saves it once — never twice.</p>
          <div class="t-actions"><button type="button" class="btn btn-ghost" id="tClear">Clear</button><button type="button" class="btn" id="tSave"></button><button type="button" class="btn btn-primary btn-lg" id="tPrint"></button></div>
        </div>
      </aside>
      <div class="m-bar"><span><small id="mCount"></small><b id="mTotal"></b></span><button type="button" class="btn btn-primary" id="mOpen">View bill</button></div>
    </div>`;

    const search = $('#bSearch', view);
    search.value = query;
    search.addEventListener('input', () => { query = search.value; highlight = 0; renderCatalog(); });
    search.addEventListener('keydown', e => {
      const shown = matches().slice(0, 120);
      if (e.key === 'Enter') {
        e.preventDefault();
        const q = query.trim().toLowerCase(); if (!q) return;
        const exact = Store.items.find(i => i.active && i.code && i.code.toLowerCase() === q);
        const pick = exact || shown[highlight];
        if (pick) { query = ''; search.value = ''; highlight = 0; renderCatalog(); add(pick); }
        else toast(`No item matches “${query}”.`, 'warn');
      } else if (e.key === 'ArrowDown') { e.preventDefault(); highlight = Math.min(highlight + 1, shown.length - 1); renderCatalog(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); highlight = Math.max(highlight - 1, 0); renderCatalog(); }
      else if (e.key === 'Escape') { query = ''; search.value = ''; renderCatalog(); }
    });
    $('#bCats', view).addEventListener('click', e => { const c = e.target.closest('[data-cat]'); if (c) { category = c.dataset.cat; renderCatalog(); } });
    $('#bGrid', view).addEventListener('click', e => { const t = e.target.closest('[data-add]'); if (!t) return; const item = Store.items.find(i => i.id === t.dataset.add); if (item) add(item); });
    $('#tExtra', view).onclick = addExtra;

    const lines = $('#tLines', view);
    lines.addEventListener('click', e => {
      const li = e.target.closest('[data-key]'); if (!li) return; const l = cart.find(x => x.key === li.dataset.key); if (!l) return;
      if (e.target.closest('[data-inc]')) setQty(l.key, Number(l.qty) + 1);
      else if (e.target.closest('[data-dec]')) setQty(l.key, Math.max(0, Number(l.qty) - 1));
      else if (e.target.closest('[data-del]')) { if (!locked()) { cart = cart.filter(x => x !== l); renderTicket(null, l.id); } }
    });
    lines.addEventListener('change', e => { const i = e.target.closest('[data-qty]'); if (i) setQty(i.closest('[data-key]').dataset.key, i.value); });
    lines.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[data-qty]')) { e.target.blur(); focusSearch(); } });

    $('#tDiscVal', view).oninput = e => { discount.value = e.target.value; renderTicket(); };
    $('#tDiscMode', view).onchange = e => { discount.mode = e.target.value; renderTicket(); };
    $('#tCustName', view).oninput = e => { customer.name = e.target.value; };
    $('#tCustPhone', view).oninput = e => { customer.phone = e.target.value; };
    $('#tCustAddr', view).oninput = e => { customer.address = e.target.value; };
    $('#tNotes', view).oninput = e => { notes = e.target.value; };
    $('#tFields', view).oninput = e => { const i = e.target.closest('[data-cf]'); if (i) fields[i.dataset.cf] = i.value; };
    $('#tReceived', view).oninput = e => { received = e.target.value; renderTicket(); };
    $('#tCustToggle', view).onclick = () => { showExtras = !showExtras; renderTicket(); if (showExtras) ($('#tCust input:not([hidden])', view))?.focus(); };
    $('.pay', view).addEventListener('click', e => { const b = e.target.closest('[data-pay]'); if (b && !locked()) { payment = b.dataset.pay; renderTicket(); if (cashOn() && !isTouch()) $('#tReceived', view).focus(); } });
    $('#tSave', view).onclick = () => save(false);
    $('#tPrint', view).onclick = () => save(true);
    $('#tClear', view).onclick = clearBill;
    $('#tDone', view).addEventListener('click', e => {
      if (!lastBill) return;
      if (e.target.closest('[data-reprint]')) Receipt.print(lastBill);
      else if (e.target.closest('[data-wa]')) Receipt.whatsapp(lastBill);
      else if (e.target.closest('[data-view]')) Records.openBill(lastBill);
    });
    $('#mOpen', view).onclick = () => document.body.classList.add('sheet-open');
    $('#sheetClose', view).onclick = () => document.body.classList.remove('sheet-open');

    syncInputs(); renderCatalog(true); renderTicket();
    Store.loadItems().then(() => { if (root === view) renderCatalog(); }).catch(e => toast(e.message, 'error'));
    setTimeout(focusSearch, 50);
  }

  document.addEventListener('keydown', onKey);
  document.addEventListener('items:changed', () => { if (root?.isConnected) renderCatalog(); });
  return { mount, unmount() { root = null; document.body.classList.remove('sheet-open'); } };
})();

/* js/records.js?v=19 */
;/* Bill records: find, view, reprint, cancel, change payment, export. */
'use strict';
const Records = (() => {
  const PAGE = 50;
  let f = { period: 'today', from: '', to: '', status: 'all', payment: 'all', q: '' }, offset = 0, data = null, root = null, timer = null, req = 0;

  function range() { return periodRange(f.period, f.from, f.to); }

  const cache = new Map();
  async function load() {
    const id = ++req, [from, to] = range(), args = { p_from: from, p_to: to, p_status: f.status, p_payment: f.payment, p_query: f.q, p_offset: offset, p_limit: PAGE }, k = JSON.stringify(args), hit = cache.get(k);
    if (hit) { data = hit; render(); }
    $('#rStatus', root).innerHTML = `<span class="spin-dot" aria-hidden="true"></span>${hit ? 'Updating…' : 'Loading bills…'}`;
    try {
      const d = await Cloud.rpc('shop_bills_list', args);
      if (cache.size > 20) cache.delete(cache.keys().next().value);
      cache.set(k, d);
      if (id !== req || !root?.isConnected) return;
      data = d; render();
      if (d.rows.some(b => b.table_number && b.table_number !== 'Counter')) RestaurantCloud.refreshTableNames({ staff: true }).then(() => { if (id === req && root?.isConnected) render(); }).catch(() => {});
    } catch (e) {
      if (id !== req || !root?.isConnected) return;
      $('#rStatus', root).innerHTML = `<span class="neg">${esc(e.message)}</span> <button type="button" class="linkish" data-retry>Try again</button>`;
      $('[data-retry]', root).onclick = load;
    }
  }

  function render() {
    const s = data.summary, all = Store.can('records_all'), pays = Store.payments();
    $('#rSummary', root).innerHTML = [
      ['Sales', Fmt.money(s.sales), 'big'], ['Bills', s.bills], ...pays.map(m => [m, Fmt.money(s[m.toLowerCase()])]), ['Cancelled', s.cancelled]
    ].map(([k, v, c]) => `<div class="sum ${c || ''}"><span>${k}</span><b>${v}</b></div>`).join('');
    const label = data.from === data.to ? Fmt.date(data.from) : `${Fmt.date(data.from)} – ${Fmt.date(data.to)}`;
    $('#rStatus', root).textContent = data.total ? `${data.total} bill${data.total === 1 ? '' : 's'} · ${label}` : '';
    const body = $('#rBody', root);
    body.innerHTML = data.rows.length ? data.rows.map(b => `<tr data-id="${esc(b.id)}" tabindex="0" class="${b.status === 'Cancelled' ? 'is-void' : ''}">
        <td data-label="Bill no"><b class="mono">${esc(b.bill_no)}</b>${b.sync_state && b.sync_state !== 'synced' ? '<small class="bill-unsent">Saved here · not sent yet</small>' : ''}${b.invoice_no && b.order_no ? `<small class="order-no">Order #${esc(b.order_no)}${b.table_number && b.table_number !== 'Counter' ? ' · ' + esc(RestaurantCloud.tableName(b.table_number)) : ''}</small>` : ''}${b.kind === 'membership' ? ` <span class="badge badge-soft" title="Membership">${Icon('idcard')} ${esc(Store.label1('members'))}ship</span>` : ''}</td>
        <td data-label="Time">${esc(data.from === data.to ? Fmt.time(b.created_at) : Fmt.dateTime(b.created_at))}</td>
        <td data-label="Customer" class="${b.customer_name || b.customer_phone ? '' : 'm-hide'}">${esc(b.customer_name || b.customer_phone || '—')}</td>
        <td class="num" data-label="Lines">${(b.items || []).length}</td>
        <td data-label="Payment"><span class="pm pm-${esc(b.payment_method.toLowerCase())}">${esc(b.payment_method)}</span></td>
        <td class="num" data-label="Total"><b>${Fmt.money(b.total)}</b></td>
        <td data-label="Status">${b.status === 'Cancelled' ? '<span class="badge badge-red">Cancelled</span>' : '<span class="badge badge-green">Paid</span>'}</td>
        <td class="row-act"><button type="button" class="btn btn-sm btn-ghost" data-open>View</button></td></tr>`).join('')
      : `<tr><td colspan="8"><div class="empty"><h3>No bills here</h3><p>${f.q ? 'Nothing matches that search. Try an invoice number (INV012), an order number (#12), a name or a table.' : all ? 'No bills in this period. Pick another date range.' : 'No bills yet today.'}</p></div></td></tr>`;
    $('#rPrev', root).disabled = offset === 0;
    $('#rNext', root).disabled = offset + PAGE >= data.total;
    $('#rPage', root).textContent = data.total > PAGE ? `${offset + 1}–${Math.min(offset + PAGE, data.total)} of ${data.total}` : '';
  }

  function openBill(b) {
    const manage = Cloud.canCancelBill !== false && Store.can('cancel_bills') && b.status === 'Paid';
    const state = b.status === 'Cancelled' ? `<span class="badge badge-red">Cancelled</span>${b.cancel_reason ? `<small>${esc(b.cancel_reason)}</small>` : ''}` : `<span class="badge ${b.status === 'Paid' ? 'badge-green' : 'badge-soft'}">${esc(b.status || 'Paid')}</span>`;
    const paymentEditable = Cloud.recordPaymentEditable?.(b);
    const d = modal(`Bill ${b.bill_no}`, `<div class="bill-view">
        <div class="bill-paper">${Receipt.html(b)}</div>
        <div class="bill-side">
          <dl class="facts">
            <dt>Status</dt><dd>${state}</dd>
            <dt>Payment</dt><dd><b>${esc(b.payment_method)}</b>${b.cash_received != null ? `<small>Cash received ${Fmt.money(b.cash_received)}${Number(b.change_amount) > 0 ? ` · returned ${Fmt.money(b.change_amount)}` : ''}${Number(b.less_amount) > 0 ? ` · short ${Fmt.money(b.less_amount)}` : ''}</small>` : ''}</dd>
            ${b.order_no ? `<dt>Order no.</dt><dd><b>#${esc(b.order_no)}</b><small>Order numbers start again from 1 every day.</small></dd>` : ''}
            <dt>Billed by</dt><dd>${esc(b.cashier_name || '—')}</dd>
            <dt>Time</dt><dd>${esc(Fmt.dateTime(b.created_at))}</dd>
          </dl>
          <div class="stack">
            ${paymentEditable ? `<div class="sub-box stack" data-record-payment><h3>Record QR payment</h3><p class="hint">Choose once before this order’s edit window expires. The saved method is permanent.</p><div class="toolbar"><button type="button" class="btn" data-pay="Cash">Cash</button><button type="button" class="btn" data-pay="Online">Online</button></div></div>` : ''}
            <button type="button" class="btn btn-primary" data-print>${Icon('printer')} Print bill</button>
            ${Store.feature('whatsapp') ? `<button type="button" class="btn" data-wa>${Icon('whatsapp')} Send on WhatsApp</button>` : ''}
            ${manage ? `<button type="button" class="btn btn-danger-ghost" data-cancel>${Icon('ban')} Cancel bill</button><p class="hint">Cancelling puts the stock back and removes the bill from sales. The bill number stays in the records.</p>` : ''}
          </div>
        </div></div>`, { size: 'modal-lg' });
    d.addEventListener('click', async e => {
      const pay = e.target.closest('[data-pay]');
      if (pay) {
        if (!Cloud.recordPaymentEditable?.(b)) { toast('The payment edit window is closed. Refresh Records.', 'error'); return; }
        const controls = $$('[data-pay]', d); controls.forEach(x => x.disabled = true);
        try { const saved = await Cloud.rpc('shop_record_payment_save', { p_id: b.id, p_method: pay.dataset.pay }); Object.assign(b, saved); d.close(); openBill(b); if (root?.isConnected) load(); toast('Payment saved permanently.', 'ok'); }
        catch (err) { toast(err.message, 'error'); controls.forEach(x => x.disabled = false); }
      }
      else if (e.target.closest('[data-print]')) Receipt.print(b);
      else if (e.target.closest('[data-wa]')) Receipt.whatsapp(b);
      else if (e.target.closest('[data-cancel]')) {
        const reason = await ask({ title: `Cancel bill ${b.bill_no}?`, body: `${Fmt.money(b.total)} will be removed from sales and tracked stock will be added back.`, confirm: 'Cancel bill', cancel: 'Keep bill', danger: true, input: { label: 'Reason (optional)', placeholder: 'e.g. Customer returned items', maxlength: 200 } });
        if (reason === null) return;
        try { const nb = await Cloud.rpc('shop_bill_cancel', { p_id: b.id, p_reason: reason }); toast(`Bill ${nb.bill_no} cancelled.`, 'ok'); d.close(); Store.applyStockUpdates(nb.stock_updates); if (root?.isConnected) load(); }
        catch (err) { toast(err.message, 'error'); }
      }
    });
  }

  async function exportCSV(btn) {
    busy(btn, true, 'Preparing…');
    try {
      const [from, to] = range(); let rows = [], off = 0, total = 1;
      while (off < total && off < 20000) {
        const d = await Cloud.rpc('shop_bills_list', { p_from: from, p_to: to, p_status: f.status, p_payment: f.payment, p_query: f.q, p_offset: off, p_limit: 200 });
        total = d.total; rows.push(...d.rows); off += 200;
      }
      const out = [['Bill no', 'Date', 'Time', 'Status', 'Payment', 'Customer', 'Phone', 'Item', 'Qty', 'Unit', 'Rate', 'Line amount', 'Bill subtotal', 'Discount', 'Tax', 'Round off', 'Short cash', 'Bill total', 'Cash received', 'Change', 'Billed by', 'Cancel reason']];
      for (const b of rows.reverse()) {
        const dt = new Date(b.created_at), dd = dt.toLocaleDateString('en-CA', { timeZone: Fmt.tz() }), tt = dt.toLocaleTimeString('en-GB', { timeZone: Fmt.tz() });
        (b.items || []).forEach((i, n) => out.push([b.bill_no, dd, tt, b.status, b.payment_method, b.customer_name, b.customer_phone, i.name, i.qty, i.unit, i.price, i.line_total,
          n ? '' : b.items_subtotal, n ? '' : b.discount_amount, n ? '' : b.tax_amount, n ? '' : b.round_off, n ? '' : b.less_amount, n ? '' : b.total, n ? '' : (b.cash_received ?? ''), n ? '' : b.change_amount, b.cashier_name, b.cancel_reason]));
      }
      downloadFile(`bills_${from}_to_${to}.csv`, toCSV(out));
      toast(`Exported ${rows.length} bills.`, 'ok');
    } catch (e) { toast(e.message, 'error'); } finally { busy(btn, false); }
  }

  function mount(view) {
    root = view; offset = 0;
    const all = Store.can('records_all');
    if (!all) f.period = 'today';
    if (!['all', ...Store.payments()].includes(f.payment)) f.payment = 'all';
    view.innerHTML = `<div class="page">
      <header class="page-head"><div><h1>Records</h1><p class="sub">${all ? 'Every bill, with search, reprint and export.' : 'Bills made today. Tap a bill to reprint it.'}</p></div>
        <div class="head-actions"><a class="btn" href="#/dishSales">${Icon('chart')} Dish sales</a><button type="button" class="btn" id="rRefresh">${Icon('refresh')} Refresh</button>${Store.can('export') ? `<button type="button" class="btn" id="rExport">${Icon('download')} Export CSV</button>` : ''}</div></header>
      <div class="filters">
        ${all ? `<div class="seg" id="rPeriods">${PERIODS.map(([k, l]) => `<button type="button" data-p="${k}" class="${f.period === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="range" id="rRange" ${f.period === 'custom' ? '' : 'hidden'}><input type="date" id="rFrom" aria-label="From date"><span>to</span><input type="date" id="rTo" aria-label="To date"></div>` : ''}
        <label class="search sm">${Icon('search')}<input id="rQ" type="search" placeholder="Invoice, order #, customer or table" value="${esc(f.q)}" aria-label="Search bills"></label>
        <select id="rPay" aria-label="Payment filter"><option value="all">All payments</option>${Store.payments().map(m => `<option ${f.payment === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
        <select id="rStat" aria-label="Status filter"><option value="all">Paid & cancelled</option><option value="Paid" ${f.status === 'Paid' ? 'selected' : ''}>Paid only</option><option value="Cancelled" ${f.status === 'Cancelled' ? 'selected' : ''}>Cancelled only</option></select>
      </div>
      <div class="summary" id="rSummary"></div>
      <p class="status-line" id="rStatus" role="status"></p>
      <div class="table-wrap"><table class="table cards-on-mobile"><thead><tr><th>Bill no</th><th>Time</th><th>Customer</th><th class="num">Lines</th><th>Payment</th><th class="num">Total</th><th>Status</th><th></th></tr></thead><tbody id="rBody"></tbody></table></div>
      <div class="pager"><button type="button" class="btn btn-sm" id="rPrev">Previous</button><span id="rPage"></span><button type="button" class="btn btn-sm" id="rNext">Next</button></div>
    </div>`;
    const t = Fmt.today();
    if ($('#rFrom', view)) { $('#rFrom', view).value = f.from || t; $('#rTo', view).value = f.to || t; $('#rFrom', view).max = t; $('#rTo', view).max = t; }
    $('#rPeriods', view)?.addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (!b) return; f.period = b.dataset.p; $$('#rPeriods button', view).forEach(x => x.classList.toggle('on', x === b)); $('#rRange', view).hidden = f.period !== 'custom'; offset = 0; load(); });
    for (const id of ['#rFrom', '#rTo']) $(id, view)?.addEventListener('change', () => { f.from = $('#rFrom', view).value; f.to = $('#rTo', view).value; if (f.to < f.from) { f.to = f.from; $('#rTo', view).value = f.to; } offset = 0; load(); });
    $('#rQ', view).oninput = e => { clearTimeout(timer); timer = setTimeout(() => { f.q = e.target.value.trim(); offset = 0; load(); }, 300); };
    $('#rPay', view).onchange = e => { f.payment = e.target.value; offset = 0; load(); };
    $('#rStat', view).onchange = e => { f.status = e.target.value; offset = 0; load(); };
    $('#rRefresh', view).onclick = load;
    if ($('#rExport', view)) $('#rExport', view).onclick = e => exportCSV(e.currentTarget);
    $('#rPrev', view).onclick = () => { offset = Math.max(0, offset - PAGE); load(); };
    $('#rNext', view).onclick = () => { offset += PAGE; load(); };
    const pick = tr => { const b = data?.rows.find(x => x.id === tr.dataset.id); if (b) openBill(b); };
    $('#rBody', view).addEventListener('click', e => { const tr = e.target.closest('tr[data-id]'); if (tr) pick(tr); });
    $('#rBody', view).addEventListener('keydown', e => { if (e.key === 'Enter') { const tr = e.target.closest('tr[data-id]'); if (tr) pick(tr); } });
    load();
  }
  return { mount, openBill, unmount() { root = null; } };
})();

/* js/dashboard.js?v=19 */
;/* Owner dashboard: sales, trend, payments, best sellers, low stock. */
'use strict';
const Dashboard = (() => {
  let period = 'today', from = '', to = '', root = null, req = 0;

  function trendLabel(key, unit, short) {
    if (unit === 'hour') { const h = Number(key); return (h % 12 || 12) + (h < 12 ? 'am' : 'pm'); }
    if (unit === 'day') { const d = new Date(key + 'T12:00:00Z'); return short ? String(d.getUTCDate()) : d.toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short', weekday: 'short' }); }
    const d = new Date(key + '-15T12:00:00Z'); return d.toLocaleDateString('en-IN', { timeZone: 'UTC', month: 'short', ...(short ? {} : { year: 'numeric' }) });
  }

  function barChart(trend, unit) {
    const W = 760, H = 220, P = { l: 52, r: 8, t: 12, b: 26 };
    const max = Math.max(...trend.map(t => Number(t.sales)), 0);
    if (!max) return `<div class="empty slim"><p>No sales in this period yet.</p></div>`;
    const nice = (() => { const p = Math.pow(10, Math.floor(Math.log10(max))); for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= max) return m * p; return 10 * p; })();
    const iw = W - P.l - P.r, ih = H - P.t - P.b, n = trend.length, slot = iw / n, bw = Math.max(2, Math.min(28, slot * 0.62));
    const y = v => P.t + ih - (v / nice) * ih;
    const step = Math.ceil(n / 12);
    let g = '';
    for (let i = 0; i <= 4; i++) { const v = nice * i / 4, yy = y(v); g += `<line x1="${P.l}" x2="${W - P.r}" y1="${yy}" y2="${yy}" class="grid-l"/><text x="${P.l - 8}" y="${yy + 4}" class="ax" text-anchor="end">${esc(Fmt.compact(v))}</text>`; }
    const bars = trend.map((t, i) => {
      const v = Number(t.sales), x = P.l + slot * i + (slot - bw) / 2, h = Math.max(v ? 2 : 0, ih - (y(v) - P.t)), yy = P.t + ih - h, r = Math.min(4, bw / 2, h);
      const path = h ? `M${x},${P.t + ih} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + bw - r} Q${x + bw},${yy} ${x + bw},${yy + r} V${P.t + ih} Z` : '';
      return `<g class="bar" data-i="${i}"><rect x="${P.l + slot * i}" y="${P.t}" width="${slot}" height="${ih}" class="hit"/>${path ? `<path d="${path}"/>` : ''}${i % step === 0 ? `<text x="${x + bw / 2}" y="${H - 8}" class="ax" text-anchor="middle">${esc(trendLabel(t.key, unit, true))}</text>` : ''}</g>`;
    }).join('');
    return `<div class="chart" data-unit="${unit}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Sales by ${unit}">${g}<line x1="${P.l}" x2="${W - P.r}" y1="${P.t + ih}" y2="${P.t + ih}" class="base-l"/>${bars}</svg><div class="tip" hidden></div></div>`;
  }

  function hbars(rows, label, value, fmt, sub) {
    const max = Math.max(...rows.map(r => Number(r[value])), 0) || 1;
    return `<ul class="hbars">${rows.map(r => `<li><div class="hb-top"><span>${esc(r[label])}</span><b>${fmt(r[value])}</b></div><div class="hb-track"><i style="width:${(Number(r[value]) / max * 100).toFixed(1)}%"></i></div>${sub ? `<small>${sub(r)}</small>` : ''}</li>`).join('')}</ul>`;
  }

  function delta(now, prev) {
    if (!prev) return now ? '<span class="delta">New this period</span>' : '';
    const p = (now - prev) / prev * 100, up = p >= 0;
    return `<span class="delta ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${Math.abs(p).toFixed(p > -10 && p < 10 ? 1 : 0)}% vs previous period</span>`;
  }

  /* The last result for each period shows at once; the fresh numbers replace it when they arrive. */
  const cache = new Map();
  async function load() {
    const id = ++req, [f, t] = periodRange(period, from, to), k = f + '|' + t, hit = cache.get(k);
    if (hit) render(hit);
    root.classList.toggle('is-loading', !hit);
    $('#dStatus', root).innerHTML = `<span class="spin-dot" aria-hidden="true"></span>${hit ? 'Updating…' : 'Loading…'}`;
    try {
      const d = await Cloud.rpc('shop_dashboard', { p_from: f, p_to: t });
      if (cache.size > 12) cache.delete(cache.keys().next().value);
      cache.set(k, d);
      if (id !== req || !root?.isConnected) return;
      root.classList.remove('is-loading'); render(d);
    } catch (e) {
      if (id !== req || !root?.isConnected) return;
      root.classList.remove('is-loading');
      $('#dStatus', root).innerHTML = `<span class="neg">${esc(e.message)}</span> <button type="button" class="linkish" data-retry>Try again</button>`;
      $('[data-retry]', root).onclick = load;
    }
  }

  function render(d) {
    const m = d.metrics;
    $('#dStatus', root).textContent = d.from === d.to ? Fmt.date(d.from) : `${Fmt.date(d.from)} – ${Fmt.date(d.to)}`;
    const ex = m.expenses_on, exp = Number(m.expenses || 0), gross = Number(m.profit), inP = m.expenses_in_profit !== false;
    const net = ex && inP ? Number(m.sales) - exp : gross;
    $('#dKpis', root).innerHTML = `
      <div class="kpi kpi-hero"><span>Sales</span><b>${Fmt.money(m.sales)}</b>${m.prev_available===false?'<small>Completed restaurant orders</small>':delta(Number(m.sales), Number(m.prev_sales))}</div>
      <div class="kpi"><span>Bills</span><b>${Fmt.nf0.format(m.bills)}</b><small>${m.cancelled ? `${m.cancelled} cancelled (${Fmt.money(m.cancelled_value)})` : 'No cancelled bills'}</small></div>
      ${ex ? `<div class="kpi"><span>Expenses</span><b>${Fmt.money(exp)}</b><small><a class="linkish" href="#/expenses">${(d.expense_heads || []).length ? esc(d.expense_heads.slice(0, 2).map(h => h.head).join(', ')) + (d.expense_heads.length > 2 ? '…' : '') : 'Add expenses'}</a></small></div>` : ''}
      <div class="kpi ${net < 0 ? 'kpi-bad' : 'kpi-good'}"><span>Net profit</span><b>${m.profit_available===false&&!(ex&&inP)?'—':Fmt.money(net)}</b><small>${m.profit_available===false&&!(ex&&inP)?'Add expenses to see sales − expenses':ex && inP ? 'Sales − expenses' : 'Selling price − buying price'}${!ex || inP ? '' : ' · expenses not deducted'}</small></div>
      ${ex && inP && m.profit_available !== false ? `<div class="kpi"><span>Gross profit</span><b>${Fmt.money(gross)}</b><small>${Number(m.profit_cover) >= 99.5 ? 'Selling − buying price' : `Covers ${Number(m.profit_cover)}% of sales — add buying prices in Items`}</small></div>` : ''}
      ${m.members_on && Number(m.membership_sales) ? `<div class="kpi"><span>Memberships</span><b>${Fmt.money(m.membership_sales)}</b><small>Plans sold and renewed</small></div>` : ''}
      <div class="kpi"><span>Average bill</span><b>${Fmt.money(m.avg_bill)}</b><small>${Fmt.qty(m.qty)} units sold</small></div>
      <div class="kpi"><span>Discount given</span><b>${Fmt.money(m.discount)}</b><small>Tax collected ${Fmt.money(m.tax)}</small></div>`;
    const mb = d.members, L = Store.label('members');
    $('#dMembersCard', root).hidden = !mb;
    if (mb) $('#dMembers', root).innerHTML = `<div class="mini-stats"><a href="#/members" class="ms"><b>${mb.active}</b><span>Active</span></a><a href="#/members" class="ms ms-warn"><b>${mb.expiring}</b><span>Ending soon</span></a><a href="#/members" class="ms ms-bad"><b>${mb.expired}</b><span>Expired</span></a><span class="ms"><b>${mb.checkins_today}</b><span>Check-ins today</span></span></div><a class="linkish" href="#/members">Open ${esc(L.toLowerCase())}</a>`;
    $('#dMembersTitle', root).textContent = L;
    $('#dExpCard', root).hidden = !ex;
    const eh = d.expense_heads || [];
    if (ex) $('#dExp', root).innerHTML = eh.length ? hbars(eh, 'head', 'amount', v => Fmt.money(v), r => `${r.n} entr${r.n === 1 ? 'y' : 'ies'}`) + '<a class="linkish" href="#/expenses">All expenses</a>' : '<div class="empty slim"><p>No expenses in this period.</p></div>';
    $('#dLowCard', root).hidden = !Store.moduleOn('stocks') || !Store.can('stocks');
    $('#dTrend', root).innerHTML = barChart(d.trend || [], d.trend_unit);
    $('#dTrendTitle', root).textContent = { hour: 'Sales by hour', day: 'Sales by day', month: 'Sales by month' }[d.trend_unit];
    wireTip(d.trend || [], d.trend_unit);

    const pays = d.payments || [];
    $('#dPay', root).innerHTML = pays.length ? hbars(pays, 'method', 'amount', v => Fmt.money(v), r => `${r.bills} bill${r.bills === 1 ? '' : 's'} · ${(Number(r.amount) / (Number(m.sales) || 1) * 100).toFixed(0)}% of sales`) : '<div class="empty slim"><p>No payments yet.</p></div>';
    const top = d.top_items || [];
    $('#dTop', root).innerHTML = top.length ? `<table class="table compact"><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Sales</th></tr></thead><tbody>${top.map(r => `<tr><td>${esc(r.name)}</td><td class="num">${Fmt.qty(r.qty)} <small>${esc(r.unit || '')}</small></td><td class="num"><b>${Fmt.money(r.revenue)}</b></td></tr>`).join('')}</tbody></table>` : '<div class="empty slim"><p>Best sellers show up after the first bill.</p></div>';
    const cats = d.categories || [];
    $('#dCats', root).innerHTML = cats.length ? hbars(cats, 'category', 'revenue', v => Fmt.money(v)) : '<div class="empty slim"><p>No category sales yet.</p></div>';
    const low = d.low_stock || [];
    $('#dLow', root).innerHTML = low.length ? `<ul class="plain-list">${low.map(r => `<li><span>${esc(r.name)}</span><span class="badge ${Number(r.stock) <= 0 ? 'badge-red' : 'badge-amber'}">${Number(r.stock) <= 0 ? 'Out of stock' : Fmt.qty(r.stock) + ' ' + esc(r.unit) + ' left'}</span></li>`).join('')}</ul><a class="linkish" href="#/stocks">Open stocks</a>` : '<div class="empty slim"><p>Nothing is running low.</p></div>';
    const rec = d.recent || [];
    $('#dRecent', root).innerHTML = rec.length ? `<ul class="plain-list">${rec.map(r => `<li><span><b class="mono">${esc(r.bill_no)}</b> <small>${esc(Fmt.time(r.created_at))}${r.customer_name ? ' · ' + esc(r.customer_name) : ''}</small></span><span><small>${esc(r.payment_method)}</small> <b>${Fmt.money(r.total)}</b></span></li>`).join('')}</ul><a class="linkish" href="#/records">All records</a>` : '<div class="empty slim"><p>No bills in this period.</p></div>';
  }

  function wireTip(trend, unit) {
    const chart = $('.chart', root); if (!chart) return;
    const tip = $('.tip', chart), svg = $('svg', chart);
    const show = g => {
      const t = trend[Number(g.dataset.i)]; if (!t) return;
      $$('.bar', svg).forEach(b => b.classList.toggle('on', b === g));
      tip.innerHTML = `<b>${esc(trendLabel(t.key, unit, false))}</b><span>${Fmt.money(t.sales)}</span><small>${t.bills} bill${t.bills === 1 ? '' : 's'}</small>`;
      tip.hidden = false;
      const r = g.querySelector('.hit').getBoundingClientRect(), c = chart.getBoundingClientRect();
      const x = Math.min(Math.max(r.left - c.left + r.width / 2, 60), c.width - 60);
      tip.style.left = x + 'px';
    };
    svg.addEventListener('pointerover', e => { const g = e.target.closest('.bar'); if (g) show(g); });
    svg.addEventListener('pointerleave', () => { tip.hidden = true; $$('.bar', svg).forEach(b => b.classList.remove('on')); });
  }

  function mount(view) {
    root = view;
    view.innerHTML = `<div class="page">
      <header class="page-head"><div><h1>Dashboard</h1><p class="sub" id="dStatus" role="status"></p></div>
        <div class="head-actions"><a class="btn" href="#/restaurantReports">${Icon('chart')} Restaurant reports</a><button type="button" class="btn" id="dRefresh">${Icon('refresh')} Refresh</button></div></header>
      <div class="filters"><div class="seg" id="dPeriods">${PERIODS.map(([k, l]) => `<button type="button" data-p="${k}" class="${period === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="range" id="dRange" ${period === 'custom' ? '' : 'hidden'}><input type="date" id="dFrom" aria-label="From date"><span>to</span><input type="date" id="dTo" aria-label="To date"></div></div>
      <div class="kpis" id="dKpis"></div>
      <div class="dash-grid">
        <section class="card span-2"><h2 id="dTrendTitle">Sales</h2><div id="dTrend"></div></section>
        <section class="card"><h2>Payments</h2><div id="dPay"></div></section>
        <section class="card"><h2>Best-selling items</h2><div id="dTop"></div></section>
        <section class="card"><h2>Sales by category</h2><div id="dCats"></div></section>
        <section class="card" id="dMembersCard" hidden><h2 id="dMembersTitle">Members</h2><div id="dMembers"></div></section>
        <section class="card" id="dExpCard" hidden><h2>Expenses by type</h2><div id="dExp"></div></section>
        <section class="card" id="dLowCard"><h2>Low stock</h2><div id="dLow"></div></section>
        <section class="card"><h2>Latest bills</h2><div id="dRecent"></div></section>
      </div></div>`;
    const t = Fmt.today();
    $('#dFrom', view).value = from || Fmt.monthStart(t); $('#dTo', view).value = to || t; $('#dFrom', view).max = t; $('#dTo', view).max = t;
    $('#dPeriods', view).addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (!b) return; period = b.dataset.p; $$('#dPeriods button', view).forEach(x => x.classList.toggle('on', x === b)); $('#dRange', view).hidden = period !== 'custom'; if (period === 'custom') { from = $('#dFrom', view).value; to = $('#dTo', view).value; } load(); });
    for (const id of ['#dFrom', '#dTo']) $(id, view).addEventListener('change', () => { from = $('#dFrom', view).value; to = $('#dTo', view).value; if (to < from) { to = from; $('#dTo', view).value = to; } load(); });
    $('#dRefresh', view).onclick = load;
    load();
  }
  return { mount, unmount() { root = null; }, refresh() { if (root) load(); } };
})();

/* js/items.js?v=19 */
;/* Items: the things the shop sells. Add, edit, hide, import and export. */
'use strict';
const Items = (() => {
  const UNITS = ['pcs', 'kg', 'g', 'ltr', 'ml', 'pack', 'box', 'dozen', 'm', 'pair', 'set', 'bottle', 'strip'];
  let q = '', cat = 'All', show = 'active', root = null;

  function list() {
    const s = q.trim().toLowerCase();
    return Store.items.filter(i => (cat === 'All' || i.category === cat) && (show === 'all' || (show === 'active' ? i.active : !i.active))
      && (!s || i.name.toLowerCase().includes(s) || (i.code || '').toLowerCase().includes(s) || (i.hsn || '').includes(s) || (i.alias || '').toLowerCase().includes(s)));
  }

  function expiryBadge(i) {
    const e = i.meta?.expiry_date; if (!e) return '';
    const days = Math.round((new Date(e + 'T00:00:00Z') - new Date(Fmt.today() + 'T00:00:00Z')) / 864e5);
    if (days < 0) return `<span class="badge badge-red">Expired</span>`;
    if (days <= 30) return `<span class="badge badge-amber">Expires in ${days}d</span>`;
    return '';
  }
  function render() {
    if (!root?.isConnected) return;
    const rows = list(), stock = Store.stockShown();
    const sel = $('#iCat', root), prev = sel.value;
    sel.innerHTML = `<option value="All">All categories</option>` + Store.categories.map(c => `<option ${c === prev ? 'selected' : ''}>${esc(c)}</option>`).join('');
    if (!Store.categories.includes(cat)) cat = 'All';
    sel.value = cat;
    const active = Store.items.filter(i => i.active).length;
    $('#iCount', root).textContent = `${Store.items.length} item${Store.items.length === 1 ? '' : 's'} · ${active} for sale · ${Store.categories.length} categories`;
    $('#iStockTh', root).hidden = !stock;
    $('#iBody', root).innerHTML = rows.length ? rows.map(i => {
      const margin = i.cost_price != null && Number(i.price) > 0 ? (Number(i.price) - Number(i.cost_price)) / Number(i.price) * 100 : null;
      const tax = Store.settings.tax_enabled && Store.settings.tax_scope === 'item' ? `${Fmt.qty(i.tax_rate ?? Store.settings.tax_value)}% ${i.price_includes_tax ? 'incl.' : '+ tax'}` : '';
      return `<tr data-id="${esc(i.id)}" tabindex="0" class="${i.active ? '' : 'is-muted'}">
        <td data-label="Item"><b>${esc(i.name)}</b>${i.item_type === 'service' ? ' <span class="badge">Service</span>' : ''}${expiryBadge(i)}<small>${[i.code ? `<span class="mono">${esc(i.code)}</span>` : '', i.hsn ? 'HSN ' + esc(i.hsn) : '', i.alias ? esc(i.alias) : ''].filter(Boolean).join(' · ')}</small></td>
        <td data-label="Category">${esc(i.category)}</td>
        <td class="num" data-label="Price"><b>${Fmt.money(i.price)}</b><small>per ${esc(i.unit)}${Number(i.default_discount) ? ` · −${Fmt.qty(i.default_discount)}%` : ''}${tax ? ' · ' + tax : ''}</small></td>
        <td class="num" data-label="Cost">${i.cost_price != null ? Fmt.money(i.cost_price) + `<small>${margin.toFixed(0)}% margin</small>` : '<span class="muted">—</span>'}</td>
        ${stock ? `<td class="num" data-label="Stock">${i.track_stock ? `<span class="${Number(i.stock) <= 0 ? 'neg' : Number(i.stock) <= Number(i.low_stock_at) ? 'warn' : ''}">${Fmt.qty(i.stock)}</span> <small>${esc(i.unit)}</small>` : '<span class="muted">Not tracked</span>'}</td>` : ''}
        <td data-label="Status">${i.active ? '<span class="badge badge-green">For sale</span>' : '<span class="badge">Hidden</span>'}</td>
        <td class="row-act"><button type="button" class="btn btn-sm btn-ghost" data-edit>Edit</button></td></tr>`;
    }).join('') : `<tr><td colspan="7"><div class="empty"><h3>${Store.items.length ? 'No items match' : 'Add your first item'}</h3><p>${Store.items.length ? 'Change the search or filters.' : 'Add items one by one, or import a CSV list from Excel.'}</p>${Store.items.length ? '' : `<button type="button" class="btn btn-primary" data-new>${Icon('plus')} Add item</button>`}</div></td></tr>`;
  }

  function editor(item = null) {
    const S = Store.settings, F = k => Store.itemField(k), perItemTax = S.tax_enabled && S.tax_scope === 'item', stock = Store.stockShown();
    const i = item || { name: '', code: '', category: cat !== 'All' ? cat : 'General', unit: 'pcs', price: '', cost_price: null, active: true, track_stock: false, stock: 0, low_stock_at: 0,
      alias: '', description: '', hsn: '', tax_rate: null, price_includes_tax: !!S.tax_inclusive_default, default_discount: 0, item_type: 'product', meta: {} };
    const m = i.meta || {}, cats = [...new Set([...Store.categories, i.category].filter(Boolean))], units = [...new Set([...UNITS, i.unit])];
    const advOpen = F('advanced') && Object.keys(m).length > 0;
    const d = modal(item ? 'Edit item' : 'Add item', `<form id="itForm" class="item-form">
      ${F('item_type') ? `<div class="seg type-seg" role="radiogroup" aria-label="Type"><label><input type="radio" name="item_type" value="product" ${i.item_type !== 'service' ? 'checked' : ''}><span>${Icon('box')} Product</span></label><label><input type="radio" name="item_type" value="service" ${i.item_type === 'service' ? 'checked' : ''}><span>${Icon('tag')} Service</span></label></div>` : ''}
      <fieldset class="fgroup"><legend>General</legend><div class="form-grid">
        <label class="field span-2"><span>Item name</span><input name="name" required maxlength="120" value="${esc(i.name)}" autocomplete="off" placeholder="e.g. Tata Salt 1 kg"></label>
        ${F('alias') ? `<label class="field span-2"><span>Name on bill <em>optional — e.g. in Hindi</em></span><input name="alias" maxlength="120" value="${esc(i.alias)}" autocomplete="off"></label>` : ''}
        ${F('description') ? `<label class="field span-2"><span>Description <em>optional</em></span><textarea name="description" rows="2" maxlength="500">${esc(i.description)}</textarea></label>` : ''}
        <label class="field"><span>Barcode / code <em>optional</em></span><div class="joined"><input name="code" maxlength="60" value="${esc(i.code || '')}" autocomplete="off" placeholder="Scan or type"><button type="button" class="btn" data-gen title="Make a short code">Make</button></div></label>
        ${F('hsn') ? `<label class="field"><span>HSN / SAC <em>optional</em></span><input name="hsn" maxlength="20" value="${esc(i.hsn)}" inputmode="numeric" placeholder="e.g. 0406"></label>` : ''}
        <div class="field ${F('hsn') ? 'span-2' : ''}"><span>Category</span>
          <select name="catPick" aria-label="Category">${cats.map(c => `<option ${c === i.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}<option value="__new">+ New category…</option></select>
          <input name="category" maxlength="60" value="${esc(i.category)}" autocomplete="off" placeholder="New category name" hidden aria-label="New category name"></div>
      </div></fieldset>
      <fieldset class="fgroup"><legend>Pricing</legend><div class="form-grid">
        <label class="field"><span>Sale price (${esc(Fmt.cur())})</span><input name="price" type="number" min="0" max="9999999" step="0.01" inputmode="decimal" required value="${i.price === '' ? '' : Number(i.price)}"></label>
        <label class="field"><span>Purchase / cost price <em>optional</em></span><input name="cost_price" type="number" min="0" max="9999999" step="0.01" inputmode="decimal" value="${i.cost_price == null ? '' : Number(i.cost_price)}"></label>
        ${F('default_discount') ? `<label class="field"><span>Default discount %</span><input name="default_discount" type="number" min="0" max="100" step="0.01" inputmode="decimal" value="${Number(i.default_discount) || ''}" placeholder="0"></label>` : ''}
        ${perItemTax ? `<label class="field"><span>Tax % <em>empty = ${Fmt.qty(S.tax_value)}% default</em></span><input name="tax_rate" type="number" min="0" max="100" step="0.01" inputmode="decimal" value="${i.tax_rate == null ? '' : Number(i.tax_rate)}" list="gstRates"><datalist id="gstRates"><option value="0"><option value="5"><option value="12"><option value="18"><option value="28"></datalist></label>
          <div class="field span-2">${swi('price_includes_tax', i.price_includes_tax, 'Price includes tax', 'Tick if the sale price already has GST in it.')}</div>` : ''}
        <p class="hint span-2" id="priceHint"></p>
      </div></fieldset>
      <fieldset class="fgroup" data-inventory ${i.item_type === 'service' ? 'hidden' : ''}><legend>Inventory</legend><div class="form-grid">
        <div class="field"><span>Sold per (unit)</span>
          <select name="unitPick" aria-label="Unit">${units.map(u => `<option ${u === i.unit ? 'selected' : ''}>${esc(u)}</option>`).join('')}<option value="__new">Other…</option></select>
          <input name="unit" maxlength="12" value="${esc(i.unit)}" autocomplete="off" placeholder="e.g. bundle" hidden aria-label="Other unit"></div>
        <div class="field">${swi('active', i.active, 'Show in billing')}</div>
        ${stock ? `<div class="span-2">${swi('track_stock', i.track_stock, 'Track stock', 'Count how many you have. Turn off for unlimited stock.')}</div>
        <div class="span-2 form-grid sub-box" data-stock ${i.track_stock ? '' : 'hidden'}>
          ${item && i.track_stock ? `<div class="field"><span>In stock now</span><div class="stock-now"><b>${Fmt.qty(i.stock)} ${esc(i.unit)}</b>${Store.can('stocks') ? `<button type="button" class="btn btn-sm" data-stock-act="in">${Icon('plus')} Add</button><button type="button" class="btn btn-sm btn-ghost" data-stock-act="set">Set count</button>` : ''}</div></div>`
            : `<label class="field"><span>${item ? 'Stock count now' : 'Opening stock'}</span><input name="stock" type="number" step="any" min="0" inputmode="decimal" value="0"></label>`}
          <label class="field"><span>Low-stock alert at</span><input name="low_stock_at" type="number" step="any" min="0" inputmode="decimal" value="${Number(i.low_stock_at) || 0}"></label></div>` : ''}
      </div></fieldset>
      ${F('advanced') ? `<details class="fgroup adv" ${advOpen ? 'open' : ''}><summary>Advanced information <small>storage, batch, expiry</small></summary><div class="form-grid">
        <label class="field"><span>Storage location</span><input name="m_storage_location" maxlength="80" value="${esc(m.storage_location || '')}" placeholder="e.g. Rack B-3"></label>
        <label class="field"><span>Container number</span><input name="m_container_no" maxlength="80" value="${esc(m.container_no || '')}"></label>
        <label class="field"><span>Batch number</span><input name="m_batch_no" maxlength="80" value="${esc(m.batch_no || '')}"></label>
        <label class="field"><span>Manufacturing date</span><input name="m_mfg_date" type="date" value="${esc(m.mfg_date || '')}"></label>
        <label class="field"><span>Expiry date</span><input name="m_expiry_date" type="date" value="${esc(m.expiry_date || '')}"></label></div></details>` : ''}
      <p class="form-error" role="alert" hidden></p>
      <div class="modal-actions item-actions">${item ? `<button type="button" class="btn btn-danger-ghost" data-delete>${Icon('trash')} Delete</button>` : `<label class="check"><input type="checkbox" name="again"><span>Add another after saving</span></label>`}<span class="grow"></span><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">Save item</button></div>
    </form>`, { size: 'modal-md item-modal' });
    const form = $('#itForm', d), err = $('.form-error', d);
    if (!isTouch()) $('[name=name]', d).focus();
    const hint = () => {
      const h = $('#priceHint', d), price = Number(form.price.value) || 0, dd = Number(form.default_discount?.value) || 0, rate = form.tax_rate ? (form.tax_rate.value === '' ? Number(S.tax_value) : Number(form.tax_rate.value)) : 0;
      if (!price) { h.textContent = ''; return; }
      const net = price * (1 - dd / 100), parts = [];
      if (dd) parts.push(`After ${Fmt.qty(dd)}% off: ${Fmt.money(net)}`);
      if (perItemTax && rate) parts.push(form.price_includes_tax?.checked ? `includes ${Fmt.money(net - net * 100 / (100 + rate))} tax` : `customer pays ${Fmt.money(net * (1 + rate / 100))} with ${Fmt.qty(rate)}% tax`);
      h.textContent = parts.join(' · ');
    };
    form.addEventListener('input', hint); form.addEventListener('change', hint); hint();
    form.track_stock?.addEventListener('change', e => { $('[data-stock]', d).hidden = !e.target.checked; });
    $$('[name=item_type]', d).forEach(r => r.onchange = () => { $('[data-inventory]', d).hidden = form.item_type.value === 'service'; });
    $('[data-gen]', d).onclick = () => { form.code.value = String(Date.now()).slice(-7) + Math.floor(Math.random() * 10); };
    const pick = (sel, input) => { const s = form[sel], t = form[input]; s.onchange = () => { const nw = s.value === '__new'; t.hidden = !nw; if (nw) { t.value = ''; t.focus(); } else t.value = s.value; }; };
    pick('catPick', 'category'); pick('unitPick', 'unit');
    d.addEventListener('click', e => { const b = e.target.closest('[data-stock-act]'); if (b && item) { d.close(); Stocks.adjust(Store.items.find(x => x.id === item.id) || item, b.dataset.stockAct); } });
    $('[data-delete]', d)?.addEventListener('click', async () => {
      if (!(await ask({ title: `Delete ${i.name}?`, body: 'Old bills keep this item’s name and price. To stop selling it but keep it, turn off “Show in billing” instead.', confirm: 'Delete item', danger: true }))) return;
      try { await Cloud.rpc('shop_item_delete', { p_id: i.id }); Store.items = Store.items.filter(x => x.id !== i.id); document.dispatchEvent(new CustomEvent('items:changed')); toast(`${i.name} deleted.`, 'ok'); d.close(); }
      catch (e) { toast(e.message, 'error'); }
    });
    form.onsubmit = async e => {
      e.preventDefault(); err.hidden = true;
      const fd = new FormData(form), btn = e.submitter, again = form.again?.checked, service = fd.get('item_type') === 'service';
      const num = k => fd.get(k) === null || fd.get(k) === '' ? '' : String(Number(fd.get(k)));
      const p = { id: item?.id || null, name: fd.get('name').trim(), code: fd.get('code').trim(), category: (fd.get('category') || '').trim() || 'General', unit: (fd.get('unit') || '').trim() || 'pcs',
        price: String(Number(fd.get('price'))), cost_price: num('cost_price'), active: form.active.checked,
        track_stock: !service && !!form.track_stock?.checked, low_stock_at: num('low_stock_at') || '0', stock: item ? undefined : num('stock') || '0',
        item_type: service ? 'service' : 'product' };
      if (form.alias) p.alias = fd.get('alias').trim();
      if (form.description) p.description = fd.get('description').trim();
      if (form.hsn) p.hsn = fd.get('hsn').trim();
      if (form.default_discount) p.default_discount = num('default_discount') || '0';
      if (form.tax_rate) { p.tax_rate = num('tax_rate'); p.price_includes_tax = form.price_includes_tax.checked; }
      if (form.m_batch_no) p.meta = Object.fromEntries(['storage_location', 'container_no', 'batch_no', 'mfg_date', 'expiry_date'].map(k => [k, (fd.get('m_' + k) || '').trim()]));
      if (!stock && item) { p.track_stock = item.track_stock; p.low_stock_at = String(item.low_stock_at); }
      const startTracking = item && !item.track_stock && p.track_stock ? Number(fd.get('stock') || 0) : null;
      busy(btn, true, 'Saving…');
      try {
        let saved = await Cloud.rpc('shop_item_save', { p });
        if (startTracking !== null) saved = await Cloud.rpc('shop_stock_adjust', { p_item_id: saved.id, p_mode: 'set', p_qty: startTracking, p_note: 'Tracking started' });
        Store.upsertItem(saved); toast(`${saved.name} saved.`, 'ok');
        if (again) {
          const keep = { cat: saved.category, unit: saved.unit };
          form.reset(); form.again.checked = true;
          const cs = form.catPick; if (![...cs.options].some(o => o.value === keep.cat)) cs.add(new Option(keep.cat, keep.cat), cs.options.length - 1);
          cs.value = keep.cat; form.category.value = keep.cat; form.category.hidden = true; form.unitPick.value = keep.unit; form.unit.value = keep.unit; form.unit.hidden = true;
          if ($('[data-stock]', d)) $('[data-stock]', d).hidden = true; hint(); form.name.focus();
        } else d.close();
      } catch (ex) { err.textContent = ex.message; err.hidden = false; err.scrollIntoView({ block: 'nearest' }); }
      finally { busy(btn, false); }
    };
  }
  const swi = (name, on, title, desc = '') => `<label class="switch"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}><span class="sw" aria-hidden="true"></span><span class="sw-text"><b>${title}</b>${desc ? `<small>${desc}</small>` : ''}</span></label>`;

  function categories() {
    const d = modal('Categories', `<p class="hint">Rename a category to move all its items. Deleting one moves its items to General.</p>
      <form id="cAdd" class="inline-form"><input name="n" maxlength="60" placeholder="New category name" required aria-label="New category name"><button class="btn btn-primary">Add</button></form>
      <ul class="cat-list" id="cList"></ul>`, { size: 'modal-sm' });
    const paint = () => { $('#cList', d).innerHTML = Store.categories.map(c => `<li><span>${esc(c)} <small>${Store.items.filter(i => i.category === c).length} items</small></span>${c === 'General' ? '' : `<span><button type="button" class="btn btn-sm btn-ghost" data-ren="${esc(c)}">Rename</button><button type="button" class="btn btn-sm btn-ghost" data-del="${esc(c)}">Delete</button></span>`}</li>`).join(''); };
    paint();
    const after = cats => { Store.categories = cats; Store.loadItems(true).then(() => { paint(); render(); }); };
    $('#cAdd', d).onsubmit = async e => { e.preventDefault(); try { after(await Cloud.rpc('shop_category_save', { p_name: e.target.n.value.trim() })); e.target.reset(); } catch (ex) { toast(ex.message, 'error'); } };
    $('#cList', d).addEventListener('click', async e => {
      const r = e.target.closest('[data-ren]'), x = e.target.closest('[data-del]');
      try {
        if (r) { const n = await ask({ title: 'Rename category', input: { label: 'Category name', value: r.dataset.ren, required: true, maxlength: 60 }, confirm: 'Rename' }); if (n && n.trim() !== r.dataset.ren) after(await Cloud.rpc('shop_category_save', { p_name: n.trim(), p_old_name: r.dataset.ren })); }
        if (x && await ask({ title: `Delete ${x.dataset.del}?`, body: 'Its items move to General.', confirm: 'Delete', danger: true })) after(await Cloud.rpc('shop_category_delete', { p_name: x.dataset.del }));
      } catch (ex) { toast(ex.message, 'error'); }
    });
  }

  function deleteAll() {
    const cats = Store.categories.length;
    const d = modal('Delete all', `<form id="wForm" class="stack">
      <p class="hint">Removes many things in one go. Order records and sales history are kept. This cannot be undone — export your items first if you may need them.</p>
      <div class="wipe-choices" role="radiogroup" aria-label="What to delete">
        <label class="wipe-choice"><input type="radio" name="what" value="items" checked><span><b>All items</b><small>Every dish with its portions, photos and stock (${Store.items.length} lines). Categories stay.</small></span></label>
        <label class="wipe-choice"><input type="radio" name="what" value="categories"><span><b>All categories</b><small>${cats} categories. Dishes move to General.</small></span></label>
        <label class="wipe-choice"><input type="radio" name="what" value="both"><span><b>Items and categories</b><small>Start with an empty menu.</small></span></label></div>
      <label class="field"><span>Type <b>DELETE</b> to confirm</span><input name="confirm" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="DELETE"></label>
      <div class="wipe-progress" hidden><div class="meter"><i style="width:0%"></i></div><p class="hint" role="status"></p></div>
      <p class="form-error" role="alert" hidden></p>
      <div class="modal-actions"><button type="button" class="btn" data-exp>${Icon('download')} Export items first</button><span class="grow"></span><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-danger" disabled>Delete</button></div></form>`, { size: 'modal-sm' });
    const f = $('#wForm', d), go = $('.btn-danger', f), err = $('.form-error', f), prog = $('.wipe-progress', f);
    f.confirm.oninput = () => { go.disabled = f.confirm.value.trim().toUpperCase() !== 'DELETE'; };
    $('[data-exp]', f).onclick = exportCSV;
    f.onsubmit = async e => {
      e.preventDefault(); if (f.confirm.value.trim().toUpperCase() !== 'DELETE') return;
      const what = f.what.value; err.hidden = true; prog.hidden = false; busy(go, true, 'Deleting…'); $$('input,button', f).forEach(x => { if (x !== go) x.disabled = true; });
      const bar = $('.meter i', prog), line = $('p', prog);
      try {
        const r = await Cloud.rpc('shop_items_delete_all', { p_items: what !== 'categories', p_categories: what !== 'items', p_progress: (kind, n, total) => { bar.style.width = Math.round(n / Math.max(1, total) * 100) + '%'; line.textContent = `Deleting ${kind}: ${n} of ${total}`; } });
        await Store.loadItems(true).catch(() => {});
        render(); d.close(); toast(what === 'categories' ? `${r.categories} categories deleted. Dishes are in General.` : what === 'items' ? `${r.items} dishes deleted.` : `${r.items} dishes and ${r.categories} categories deleted.`, 'ok', 6000);
      } catch (ex) { err.textContent = 'Stopped: ' + ex.message + ' Some things may already be deleted — open Items again to check.'; err.hidden = false; busy(go, false); $$('input,button', f).forEach(x => { x.disabled = false; }); await Store.loadItems(true).catch(() => {}); render(); }
    };
  }

  const HEAD = ['name', 'code', 'category', 'unit', 'price', 'cost_price', 'stock', 'low_stock_at', 'hsn', 'tax_rate', 'default_discount', 'alias'];
  function exportCSV() {
    downloadFile('items.csv', toCSV([HEAD, ...Store.items.map(i => [i.name, i.code || '', i.category, i.unit, i.price, i.cost_price ?? '', i.track_stock ? i.stock : '', i.track_stock ? i.low_stock_at : '', i.hsn || '', i.tax_rate ?? '', Number(i.default_discount) || '', i.alias || ''])]));
  }
  function importCSV() {
    const d = modal('Import items from CSV', `<p>Use a CSV file (Excel → Save As → CSV) with these column names in the first row:</p>
      <p class="mono small">${HEAD.join(', ')}</p>
      <ul class="hint-list"><li><b>name</b> and <b>price</b> are needed. Other columns can be blank.</li><li>An item with the same code (or same name) is updated instead of added twice.</li><li>A number in <b>stock</b> sets the stock count and turns on stock tracking.</li></ul>
      <div class="toolbar"><button type="button" class="btn" data-tpl>${Icon('download')} Download template</button><label class="btn btn-primary file-btn">${Icon('upload')} Choose CSV file<input type="file" accept=".csv,text/csv" hidden></label></div>
      <div id="impPreview"></div>`, { size: 'modal-md' });
    $('[data-tpl]', d).onclick = () => downloadFile('items-template.csv', toCSV([HEAD, ['Tata Salt 1kg', '8904043901015', 'Grocery', 'pcs', '28', '24', '40', '10', '2501', '5', '', ''], ['Sugar (loose)', '', 'Grocery', 'kg', '44', '40', '25', '5', '1701', '5', '', 'चीनी']]));
    $('input[type=file]', d).onchange = async e => {
      const file = e.target.files[0]; if (!file) return;
      const rows = parseCSV(await file.text()); if (rows.length < 2) return toast('That file has no item rows.', 'warn');
      const head = rows[0].map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
      if (!head.includes('name') || !head.includes('price')) return toast('The first row needs at least “name” and “price” columns.', 'error');
      const data = rows.slice(1).map(r => Object.fromEntries(head.map((h, n) => [h, (r[n] ?? '').trim()]))).filter(r => r.name);
      const bad = data.filter(r => !/^\d{1,7}(\.\d{1,2})?$/.test(r.price));
      $('#impPreview', d).innerHTML = `<div class="sub-box"><p><b>${data.length}</b> items found in ${esc(file.name)}.${bad.length ? ` <span class="neg">${bad.length} have an invalid price and will be skipped (e.g. “${esc(bad[0].name)}”).</span>` : ''}</p><button type="button" class="btn btn-primary" data-go>Import ${data.length - bad.length} items</button></div>`;
      $('[data-go]', d).onclick = async ev => {
        const good = data.filter(r => !bad.includes(r)); let added = 0, updated = 0;
        busy(ev.currentTarget, true, 'Importing…');
        try {
          for (let n = 0; n < good.length; n += 300) { const r = await Cloud.rpc('shop_items_import', { p_rows: good.slice(n, n + 300) }); added += r.added; updated += r.updated; }
          await Store.loadItems(true); toast(`Import done: ${added} added, ${updated} updated.`, 'ok'); d.close();
        } catch (ex) { toast('Import stopped: ' + ex.message, 'error', 8000); await Store.loadItems(true); busy(ev.currentTarget, false); }
      };
    };
  }

  function mount(view) {
    root = view;
    view.innerHTML = `<div class="page">
      <header class="page-head"><div><h1>Items</h1><p class="sub" id="iCount"></p></div>
        <div class="head-actions">${Store.can('item_details')?'<a class="btn" href="#/itemDetails">Photos &amp; portions</a>':''}<button type="button" class="btn" id="iCats">Categories</button>${Store.can('settings_shop') ? `<button type="button" class="btn btn-danger-ghost" id="iWipe">${Icon('trash')} Delete all…</button>` : ''}<button type="button" class="btn" id="iImp">${Icon('upload')} Import</button><button type="button" class="btn" id="iExp">${Icon('download')} Export</button><button type="button" class="btn btn-primary" id="iNew">${Icon('plus')} Add item</button></div></header>
      <div class="filters">
        <label class="search sm">${Icon('search')}<input id="iQ" type="search" placeholder="Search name or code" value="${esc(q)}" aria-label="Search items"></label>
        <select id="iCat" aria-label="Category"></select>
        <div class="seg" id="iShow"><button type="button" data-s="active">For sale</button><button type="button" data-s="hidden">Hidden</button><button type="button" data-s="all">All</button></div>
      </div>
      <div class="table-wrap"><table class="table cards-on-mobile"><thead><tr><th>Item</th><th>Category</th><th class="num">Price</th><th class="num">Cost</th><th class="num" id="iStockTh">Stock</th><th>Status</th><th></th></tr></thead><tbody id="iBody"></tbody></table></div>
    </div>`;
    $$('#iShow button', view).forEach(b => b.classList.toggle('on', b.dataset.s === show));
    $('#iShow', view).onclick = e => { const b = e.target.closest('[data-s]'); if (!b) return; show = b.dataset.s; $$('#iShow button', view).forEach(x => x.classList.toggle('on', x === b)); render(); };
    $('#iQ', view).oninput = e => { q = e.target.value; render(); };
    $('#iCat', view).onchange = e => { cat = e.target.value; render(); };
    $('#iNew', view).onclick = () => editor();
    $('#iCats', view).onclick = categories;
    const wipe = $('#iWipe', view); if (wipe) wipe.onclick = deleteAll;
    $('#iImp', view).onclick = importCSV;
    $('#iExp', view).onclick = exportCSV;
    const open = tr => editor(Store.items.find(i => i.id === tr.dataset.id));
    $('#iBody', view).addEventListener('click', e => { if (e.target.closest('[data-new]')) return editor(); const tr = e.target.closest('tr[data-id]'); if (tr) open(tr); });
    $('#iBody', view).addEventListener('keydown', e => { if (e.key === 'Enter') { const tr = e.target.closest('tr[data-id]'); if (tr) open(tr); } });
    render();
    Store.loadItems(true).then(render).catch(e => toast(e.message, 'error'));
  }
  document.addEventListener('items:changed', render);
  return { mount, editor, unmount() { root = null; } };
})();

/* js/stocks.js?v=19 */
;/* Stocks: what is on the shelf, what is running out, and every stock change. */
'use strict';
const Stocks = (() => {
  let tab = 'levels', q = '', cat = 'All', show = 'tracked', root = null, movesOffset = 0, movesItem = null;
  const REASONS = { sale: 'Sold', cancel: 'Bill cancelled', stock_in: 'Stock added', stock_out: 'Stock removed', set: 'Count corrected', opening: 'Opening stock' };

  function rows() {
    const s = q.trim().toLowerCase();
    return Store.items.filter(i => (cat === 'All' || i.category === cat) && (!s || i.name.toLowerCase().includes(s) || (i.code || '').toLowerCase().includes(s))
      && (show === 'all' || (show === 'tracked' && i.track_stock) || (show === 'low' && i.track_stock && Number(i.stock) <= Number(i.low_stock_at) && Number(i.stock) > 0)
        || (show === 'out' && i.track_stock && Number(i.stock) <= 0) || (show === 'untracked' && !i.track_stock)))
      .sort((a, b) => (b.track_stock - a.track_stock) || (Number(a.stock) - Number(a.low_stock_at)) - (Number(b.stock) - Number(b.low_stock_at)) || a.name.localeCompare(b.name));
  }

  function renderLevels() {
    if (!root?.isConnected || tab !== 'levels') return;
    const tracked = Store.items.filter(i => i.track_stock && i.active);
    const value = tracked.reduce((a, i) => a + Math.max(0, Number(i.stock)) * Number(i.cost_price ?? i.price), 0);
    const low = tracked.filter(i => Number(i.stock) > 0 && Number(i.stock) <= Number(i.low_stock_at)).length, out = tracked.filter(i => Number(i.stock) <= 0).length;
    $('#sSummary', root).innerHTML = `<div class="sum big"><span>Stock value</span><b>${Fmt.money(value)}</b><small>At cost price, or selling price if no cost</small></div>
      <div class="sum"><span>Items tracked</span><b>${tracked.length}</b></div>
      <div class="sum ${low ? 'is-warn' : ''}"><span>Running low</span><b>${low}</b></div>
      <div class="sum ${out ? 'is-bad' : ''}"><span>Out of stock</span><b>${out}</b></div>`;
    const sel = $('#sCat', root); sel.innerHTML = `<option value="All">All categories</option>` + Store.categories.map(c => `<option>${esc(c)}</option>`).join(''); sel.value = Store.categories.includes(cat) ? cat : 'All';
    const list = rows();
    $('#sBody', root).innerHTML = list.length ? list.map(i => {
      const st = Number(i.stock), lim = Number(i.low_stock_at), state = !i.track_stock ? '' : st <= 0 ? 'out' : st <= lim ? 'low' : 'ok';
      const fill = !i.track_stock ? 0 : Math.min(100, lim > 0 ? st / (lim * 3) * 100 : (st > 0 ? 100 : 0));
      return `<tr data-id="${esc(i.id)}" class="${i.active ? '' : 'is-muted'}">
        <td data-label="Item"><b>${esc(i.name)}</b><small>${esc(i.category)}${i.active ? '' : ' · hidden from billing'}</small></td>
        <td data-label="In stock">${i.track_stock ? `<div class="level level-${state}"><b>${Fmt.qty(st)}</b> <small>${esc(i.unit)}</small><span class="meter"><i style="width:${fill.toFixed(0)}%"></i></span></div>` : '<span class="muted">Not tracked</span>'}</td>
        <td class="num" data-label="Warn at">${i.track_stock ? `${Fmt.qty(lim)} <small>${esc(i.unit)}</small>` : '—'}</td>
        <td class="num" data-label="Value">${i.track_stock ? Fmt.money(Math.max(0, st) * Number(i.cost_price ?? i.price)) : '—'}</td>
        <td class="row-act">${i.track_stock
          ? `<button type="button" class="btn btn-sm" data-act="in">${Icon('plus')} Add</button><button type="button" class="btn btn-sm btn-ghost" data-act="out">Remove</button><button type="button" class="btn btn-sm btn-ghost" data-act="set">Set count</button><button type="button" class="icon-btn" data-act="hist" aria-label="History of ${esc(i.name)}" title="History">${Icon('history')}</button>`
          : `<button type="button" class="btn btn-sm" data-act="set">Start tracking</button>`}</td></tr>`;
    }).join('') : `<tr><td colspan="5"><div class="empty"><h3>${Store.items.length ? 'Nothing here' : 'No items yet'}</h3><p>${!Store.items.length ? 'Add items first, then track their stock here.' : show === 'tracked' ? 'No item is tracked yet. Choose “Not tracked” and press Start tracking on an item.' : 'Try another filter.'}</p></div></td></tr>`;
  }

  async function adjust(item, mode) {
    const titles = { in: `Add stock · ${item.name}`, out: `Remove stock · ${item.name}`, set: item.track_stock ? `Set count · ${item.name}` : `Start tracking · ${item.name}` };
    const help = { in: 'For new stock that arrived (purchase, return from customer).', out: 'For damage, expiry, own use or return to supplier.', set: 'Enter the count you see on the shelf. The difference is recorded.' };
    const d = modal(titles[mode], `<form class="form-grid" id="adjForm">
      <p class="hint span-2">${help[mode]}${item.track_stock ? ` In stock now: <b>${Fmt.qty(item.stock)} ${esc(item.unit)}</b>.` : ''}</p>
      <label class="field"><span>${mode === 'set' ? 'Counted quantity' : 'Quantity'} (${esc(item.unit)})</span><input name="qty" type="number" step="any" min="0" required inputmode="decimal" autocomplete="off"></label>
      <label class="field"><span>Note <em>optional</em></span><input name="note" maxlength="200" placeholder="${mode === 'in' ? 'e.g. Supplier bill 1043' : mode === 'out' ? 'e.g. Expired' : 'e.g. Monthly count'}"></label>
      <p class="form-error span-2" role="alert" hidden></p>
      <div class="modal-actions span-2"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary">${mode === 'in' ? 'Add stock' : mode === 'out' ? 'Remove stock' : 'Save count'}</button></div></form>`, { size: 'modal-sm' });
    $('[name=qty]', d).focus();
    $('#adjForm', d).onsubmit = async e => {
      e.preventDefault(); const fd = new FormData(e.target), btn = e.submitter, err = $('.form-error', d); err.hidden = true;
      busy(btn, true, 'Saving…');
      try { const it = await Cloud.rpc('shop_stock_adjust', { p_item_id: item.id, p_mode: mode, p_qty: Number(fd.get('qty')), p_note: fd.get('note') }); Store.upsertItem(it); toast(`${it.name}: ${Fmt.qty(it.stock)} ${it.unit} in stock.`, 'ok'); d.close(); }
      catch (ex) { err.textContent = ex.message; err.hidden = false; } finally { busy(btn, false); }
    };
  }

  async function renderMoves() {
    const box = $('#sMoves', root); box.innerHTML = '<p class="status-line">Loading…</p>';
    try {
      const d = await Cloud.rpc('shop_stock_moves_list', { p_item_id: movesItem?.id || null, p_offset: movesOffset, p_limit: 50 });
      if (!root?.isConnected || tab !== 'history') return;
      box.innerHTML = `${movesItem ? `<p class="filter-note">Showing <b>${esc(movesItem.name)}</b> only. <button type="button" class="linkish" data-all>Show all items</button></p>` : ''}
        <div class="table-wrap"><table class="table"><thead><tr><th>When</th><th>Item</th><th>What happened</th><th class="num">Change</th><th class="num">Stock after</th><th>By</th></tr></thead><tbody>
        ${d.rows.length ? d.rows.map(m => `<tr><td>${esc(Fmt.dateTime(m.created_at))}</td><td>${esc(m.item_name)}</td><td>${esc(REASONS[m.reason] || m.reason)}${m.bill_no ? ` <span class="mono small">${esc(m.bill_no)}</span>` : ''}${m.note ? `<small>${esc(m.note)}</small>` : ''}</td>
          <td class="num ${Number(m.change) < 0 ? 'neg' : 'pos'}">${Number(m.change) > 0 ? '+' : ''}${Fmt.qty(m.change)}</td><td class="num">${Fmt.qty(m.balance)}</td><td>${esc(m.actor_name || '—')}</td></tr>`).join('')
          : '<tr><td colspan="6"><div class="empty slim"><p>No stock changes yet.</p></div></td></tr>'}</tbody></table></div>
        <div class="pager"><button type="button" class="btn btn-sm" data-prev ${movesOffset ? '' : 'disabled'}>Previous</button><span>${d.total > 50 ? `${movesOffset + 1}–${Math.min(movesOffset + 50, d.total)} of ${d.total}` : ''}</span><button type="button" class="btn btn-sm" data-next ${movesOffset + 50 < d.total ? '' : 'disabled'}>Next</button></div>`;
    } catch (e) { box.innerHTML = `<p class="status-line">${esc(e.message)}</p>`; }
  }

  function setTab(t) {
    tab = t; $$('#sTabs button', root).forEach(b => b.classList.toggle('on', b.dataset.t === t));
    $('#sLevels', root).hidden = t !== 'levels'; $('#sMoves', root).hidden = t !== 'history';
    if (t === 'levels') renderLevels(); else renderMoves();
  }

  function mount(view) {
    root = view;
    view.innerHTML = `<div class="page">
      <header class="page-head"><div><h1>Stocks</h1><p class="sub">Sales take stock off automatically. Add new stock when it arrives.</p></div>
        <div class="head-actions"><a class="btn" href="#/stockRules">${Icon('box')} Stock rules</a><div class="seg" id="sTabs"><button type="button" data-t="levels">Stock levels</button><button type="button" data-t="history">History</button></div></div></header>
      <div id="sLevels">
        <div class="summary" id="sSummary"></div>
        <div class="filters">
          <label class="search sm">${Icon('search')}<input id="sQ" type="search" placeholder="Search item or code" value="${esc(q)}" aria-label="Search stock"></label>
          <select id="sCat" aria-label="Category"></select>
          <div class="seg" id="sShow">${[['tracked', 'Tracked'], ['low', 'Running low'], ['out', 'Out of stock'], ['untracked', 'Not tracked'], ['all', 'All']].map(([k, l]) => `<button type="button" data-s="${k}" class="${show === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        </div>
        <div class="table-wrap"><table class="table cards-on-mobile"><thead><tr><th>Item</th><th>In stock</th><th class="num">Warn at</th><th class="num">Value</th><th></th></tr></thead><tbody id="sBody"></tbody></table></div>
      </div>
      <div id="sMoves" hidden></div></div>`;
    $('#sTabs', view).onclick = e => { const b = e.target.closest('[data-t]'); if (b) { movesItem = null; movesOffset = 0; setTab(b.dataset.t); } };
    $('#sShow', view).onclick = e => { const b = e.target.closest('[data-s]'); if (!b) return; show = b.dataset.s; $$('#sShow button', view).forEach(x => x.classList.toggle('on', x === b)); renderLevels(); };
    $('#sQ', view).oninput = e => { q = e.target.value; renderLevels(); };
    $('#sCat', view).onchange = e => { cat = e.target.value; renderLevels(); };
    $('#sBody', view).addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b) return; const item = Store.items.find(i => i.id === b.closest('tr').dataset.id); if (!item) return;
      if (b.dataset.act === 'hist') { movesItem = item; movesOffset = 0; setTab('history'); } else adjust(item, b.dataset.act);
    });
    $('#sMoves', view).addEventListener('click', e => {
      if (e.target.closest('[data-all]')) { movesItem = null; movesOffset = 0; renderMoves(); }
      if (e.target.closest('[data-prev]')) { movesOffset = Math.max(0, movesOffset - 50); renderMoves(); }
      if (e.target.closest('[data-next]')) { movesOffset += 50; renderMoves(); }
    });
    setTab(tab);
    Store.loadItems(true).then(renderLevels).catch(e => toast(e.message, 'error'));
  }
  document.addEventListener('items:changed', renderLevels);
  return { mount, adjust, unmount() { root = null; } };
})();

/* js/expenses.js?v=19 */
;/* Expenses: rent, electricity, salaries… with your own expense types, one-off custom expenses,
   and auto expenses that post themselves every month on a set day (the 1st if no day is set). */
'use strict';
const Expenses = (() => {
  let root = null, month = '', data = null, req = 0;
  const METHODS = ['Cash', 'UPI', 'Card', 'Bank'];
  const monthEnd = m => { const d = new Date(m + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return d.toISOString().slice(0, 10); };
  const shiftMonth = (m, n) => { const d = new Date(m + 'T12:00:00Z'); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
  const monthName = m => new Date(m + 'T12:00:00Z').toLocaleDateString('en-IN', { timeZone: 'UTC', month: 'long', year: 'numeric' });
  const ord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : (n % 10 < 4 ? n % 10 : 0)] || 'th');
  const nameOf = x => x.head && x.title ? `${x.head} · ${x.title}` : (x.head || x.title || 'Expense');
  const canManage = () => !!data?.can_manage;

  async function load() {
    const id = ++req; $('#eStatus', root).textContent = 'Loading…';
    try {
      const d = await Cloud.rpc('shop_expenses_list', { p_from: month, p_to: monthEnd(month) });
      if (id !== req || !root?.isConnected) return;
      data = d; render();
    } catch (e) { if (id === req && root?.isConnected) $('#eStatus', root).textContent = e.message; }
  }

  function render() {
    const rows = data.rows, total = Number(data.total), autos = rows.filter(r => r.auto);
    $('#eStatus', root).textContent = monthName(month);
    $('#eMonth', root).textContent = monthName(month);
    $('#eNext', root).disabled = month >= Fmt.monthStart(Fmt.today());
    const byHead = {}; rows.forEach(r => { const k = r.head || 'Other'; byHead[k] = (byHead[k] || 0) + Number(r.amount); });
    const heads = Object.entries(byHead).sort((a, b) => b[1] - a[1]);
    $('#eKpis', root).innerHTML = `<div class="kpi kpi-hero"><span>Spent in ${esc(monthName(month).split(' ')[0])}</span><b>${Fmt.money(total)}</b><small>${rows.length} expense${rows.length === 1 ? '' : 's'}</small></div>
      <div class="kpi"><span>Auto expenses</span><b>${Fmt.money(autos.reduce((s, r) => s + Number(r.amount), 0))}</b><small>${autos.length} posted automatically</small></div>
      <div class="kpi"><span>Biggest</span><b>${heads[0] ? esc(heads[0][0]) : '—'}</b><small>${heads[0] ? Fmt.money(heads[0][1]) : 'Nothing yet'}</small></div>`;
    $('#eList', root).innerHTML = rows.length ? `<table class="table cards-on-mobile exp-table"><thead><tr><th>Date</th><th>Expense</th><th>Paid by</th><th class="num">Amount</th>${canManage() ? '<th></th>' : ''}</tr></thead><tbody>${rows.map(r => `
      <tr data-id="${r.id}"><td data-label="Date">${esc(Fmt.date(r.spent_on))}</td>
        <td data-label="Expense"><b>${esc(nameOf(r))}</b>${r.auto ? ` <span class="badge badge-soft">${Icon('repeat')} Auto</span>` : ''}${r.note ? `<small class="block muted">${esc(r.note)}</small>` : ''}</td>
        <td data-label="Paid by">${esc(r.method)}${r.by && r.by !== 'Auto' ? `<small class="block muted">by ${esc(r.by)}</small>` : ''}</td>
        <td data-label="Amount" class="num"><b>${Fmt.money(r.amount)}</b></td>
        ${canManage() ? `<td class="row-act"><button type="button" class="btn btn-sm btn-ghost" data-edit aria-label="Edit">${Icon('edit')}</button><button type="button" class="btn btn-sm btn-ghost" data-del aria-label="Delete">${Icon('trash')}</button></td>` : ''}</tr>`).join('')}</tbody></table>`
      : `<div class="empty"><div class="empty-ico">${Icon('wallet')}</div><h3>No expenses in ${esc(monthName(month))}</h3><p>Add rent, electricity, salaries — anything the business pays for.</p><button type="button" class="btn btn-primary" data-add>${Icon('plus')} Add expense</button></div>`;
    const max = heads[0]?.[1] || 1;
    $('#eHeads', root).innerHTML = heads.length ? `<ul class="hbars">${heads.map(([h, v]) => `<li><div class="hb-top"><span>${esc(h)}</span><b>${Fmt.money(v)}</b></div><div class="hb-track"><i style="width:${(v / max * 100).toFixed(1)}%"></i></div><small>${(v / (total || 1) * 100).toFixed(0)}% of the month</small></li>`).join('')}</ul>` : '<div class="empty slim"><p>Your spending by type shows here.</p></div>';
    $('#eAutoCard', root).hidden = !canManage(); $('#eTypesCard', root).hidden = !canManage();
    if (canManage()) { paintAutos(); paintTypes(); }
  }

  function nextDue(a) {
    const t = Fmt.today(); let m = Fmt.monthStart(t);
    if (a.start_month > m) m = a.start_month;
    for (let i = 0; i < 3; i++) {
      const last = Number(monthEnd(m).slice(8)), day = Math.min(a.day_of_month || 1, last), due = m.slice(0, 8) + String(day).padStart(2, '0');
      if (due > t || (a.last_posted || '') < due) return due;
      m = shiftMonth(m, 1);
    }
    return '';
  }
  function paintAutos() {
    const a = data.autos || [];
    $('#eAutos', root).innerHTML = a.length ? `<ul class="auto-list">${a.map(x => `<li data-auto="${x.id}" class="${x.active ? '' : 'off'}">
        <div><b>${esc(nameOf(x))}</b><small>${Fmt.money(x.amount)} · every month on the ${ord(x.day_of_month || 1)}${x.day_of_month ? '' : ' (default)'} · ${esc(x.method)}</small>
        <small class="muted">${x.active ? `Next: ${esc(Fmt.date(nextDue(x)))}` : 'Paused'}${x.last_posted ? ` · last posted ${esc(Fmt.date(x.last_posted))}` : ''}</small></div>
        <div class="row-act"><label class="switch mini" title="${x.active ? 'Pause' : 'Resume'}"><input type="checkbox" data-toggle ${x.active ? 'checked' : ''} aria-label="Active"><span class="sw" aria-hidden="true"></span></label>
        <button type="button" class="btn btn-sm btn-ghost" data-aedit aria-label="Edit">${Icon('edit')}</button><button type="button" class="btn btn-sm btn-ghost" data-adel aria-label="Delete">${Icon('trash')}</button></div></li>`).join('')}</ul>`
      : '<p class="hint">Rent, salaries and other fixed bills can post themselves every month.</p>';
  }
  function paintTypes() {
    $('#eTypes', root).innerHTML = (data.heads || []).map(h => `<span class="chip" data-head="${esc(h)}"><button type="button" class="chip-name" data-rename title="Rename">${esc(h)}</button><button type="button" class="chip-x" data-hdel aria-label="Remove ${esc(h)}">${Icon('x')}</button></span>`).join('') || '<span class="hint">No expense types yet.</span>';
  }

  /* ---------- add / edit expense ---------- */
  function editor(x = null) {
    const heads = data?.heads || [], isOther = x && !x.head;
    const d = modal(x ? 'Edit expense' : 'Add expense', `<form id="eForm" class="stack">
      <div class="field"><span>Type</span><div class="pick-chips" role="radiogroup">${heads.map(h => `<label><input type="radio" name="head" value="${esc(h)}" ${x?.head === h || (!x && h === heads[0]) ? 'checked' : ''}><span>${esc(h)}</span></label>`).join('')}
        ${x?.head && !heads.includes(x.head) ? `<label><input type="radio" name="head" value="${esc(x.head)}" checked><span>${esc(x.head)}</span></label>` : ''}
        <label><input type="radio" name="head" value="" ${isOther || !heads.length ? 'checked' : ''}><span>${Icon('plus')} Other</span></label></div></div>
      <label class="field"><span data-titlelabel>What was it for?</span><input name="title" maxlength="80" value="${esc(x?.title || '')}" placeholder="e.g. Plumber, Diwali lights, Tea for staff"></label>
      <div class="form-grid"><label class="field"><span>Amount (${esc(Fmt.cur())})</span><input name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" required value="${x ? Number(x.amount) : ''}" class="big-input"></label>
        <label class="field"><span>Date</span><input name="spent_on" type="date" required value="${esc(x?.spent_on || (month === Fmt.monthStart(Fmt.today()) ? Fmt.today() : month))}" max="${Fmt.addDays(Fmt.today(), 31)}"></label></div>
      <div class="field"><span>Paid by</span><div class="seg" role="radiogroup">${METHODS.map(m => `<label><input type="radio" name="method" value="${m}" ${(x?.method || 'Cash') === m ? 'checked' : ''}><span>${m}</span></label>`).join('')}</div></div>
      <label class="field"><span>Note <em>optional</em></span><input name="note" maxlength="200" value="${esc(x?.note || '')}"></label>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary">${x ? 'Save changes' : 'Add expense'}</button></div></form>`, { size: 'modal-md' });
    const f = $('#eForm', d);
    const paint = () => { const other = !f.head.value; $('[data-titlelabel]', f).textContent = other ? 'What was it for?' : 'Details (optional)'; f.title.required = other; };
    f.addEventListener('change', paint); paint();
    if (!isTouch()) setTimeout(() => f.amount.focus(), 50);
    f.onsubmit = async e => {
      e.preventDefault(); busy(e.submitter, true, 'Saving…');
      try {
        await Cloud.rpc('shop_expense_save', { p: { id: x?.id || null, head: f.head.value, title: f.title.value.trim(), amount: f.amount.value, spent_on: f.spent_on.value, method: f.method.value, note: f.note.value.trim() } });
        d.close(); toast(x ? 'Expense updated.' : `${Fmt.money(f.amount.value)} added to expenses.`, 'ok');
        const m = Fmt.monthStart(f.spent_on.value); if (m !== month && !x) { month = m; } load();
      } catch (ex) { toast(ex.message, 'error', 6000); busy(e.submitter, false); }
    };
  }

  /* ---------- auto expense ---------- */
  function autoEditor(a = null) {
    const heads = data?.heads || [];
    const d = modal(a ? 'Edit auto expense' : 'New auto expense', `<form id="aForm" class="stack">
      <p class="hint">Posts itself every month on the day you choose — the 1st if you leave the day empty. You don’t need to open the app that day; it is added the next time anyone opens Expenses or the Dashboard.</p>
      <div class="form-grid"><label class="field"><span>Type</span><select name="head"><option value="">Other (type a name)</option>${heads.map(h => `<option ${a?.head === h || (!a && h === heads[0]) ? 'selected' : ''}>${esc(h)}</option>`).join('')}${a?.head && !heads.includes(a.head) ? `<option selected>${esc(a.head)}</option>` : ''}</select></label>
        <label class="field"><span>Name <em>optional</em></span><input name="title" maxlength="80" value="${esc(a?.title || '')}" placeholder="e.g. Shop rent, Ravi’s salary"></label>
        <label class="field"><span>Amount every month (${esc(Fmt.cur())})</span><input name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" required value="${a ? Number(a.amount) : ''}"></label>
        <label class="field"><span>Day of the month <em>empty = 1st</em></span><input name="day" type="number" inputmode="numeric" min="1" max="31" step="1" value="${a?.day_of_month || ''}" placeholder="1"><small class="hint">29–31 post on the last day in shorter months.</small></label>
        <label class="field"><span>Start from</span><input name="start" type="month" required value="${esc((a?.start_month || Fmt.monthStart(Fmt.today())).slice(0, 7))}"></label>
        <div class="field"><span>Paid by</span><select name="method">${METHODS.map(m => `<option ${(a?.method || 'Cash') === m ? 'selected' : ''}>${m}</option>`).join('')}</select></div></div>
      <label class="switch"><input type="checkbox" name="active" ${a ? (a.active ? 'checked' : '') : 'checked'}><span class="sw" aria-hidden="true"></span><span class="sw-text"><b>On</b><small>Turn off to pause it without deleting.</small></span></label>
      <p class="hint" data-when></p>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary">${a ? 'Save' : 'Create auto expense'}</button></div></form>`, { size: 'modal-md' });
    const f = $('#aForm', d);
    const when = () => { const day = Number(f.day.value) || 1; $('[data-when]', f).textContent = `Will post ${f.amount.value ? Fmt.money(f.amount.value) + ' ' : ''}on the ${ord(Math.min(day, 31))} of every month from ${monthName((f.start.value || Fmt.today().slice(0, 7)) + '-01')}.`; };
    f.addEventListener('input', when); when();
    f.onsubmit = async e => {
      e.preventDefault();
      if (!f.head.value && !f.title.value.trim()) return toast('Choose a type or type a name.', 'warn');
      busy(e.submitter, true, 'Saving…');
      try {
        data = { ...(await Cloud.rpc('shop_expense_auto_save', { p: { id: a?.id || null, head: f.head.value, title: f.title.value.trim(), amount: f.amount.value, day_of_month: f.day.value, start_month: f.start.value + '-01', method: f.method.value, active: f.active.checked } })) };
        d.close(); toast(a ? 'Auto expense saved.' : 'Auto expense created.', 'ok'); load();
      } catch (ex) { toast(ex.message, 'error', 6000); busy(e.submitter, false); }
    };
  }

  function mount(view) {
    root = view; month = month || Fmt.monthStart(Fmt.today());
    const L = Store.label('expenses');
    view.innerHTML = `<div class="page">
      <header class="page-head"><div><h1>${esc(L)}</h1><p class="sub" id="eStatus" role="status"></p></div>
        <div class="head-actions"><div class="month-nav"><button type="button" class="icon-btn" id="ePrev" aria-label="Previous month">‹</button><b id="eMonth"></b><button type="button" class="icon-btn" id="eNext" aria-label="Next month">›</button></div>
        <button type="button" class="btn btn-primary" data-add>${Icon('plus')} Add expense</button></div></header>
      <div class="kpis kpis-3" id="eKpis"></div>
      <div class="exp-grid">
        <section class="card"><h2>Expenses</h2><div id="eList"></div></section>
        <div class="exp-side">
          <section class="card"><h2>By type</h2><div id="eHeads"></div></section>
          <section class="card" id="eAutoCard" hidden><div class="card-title-row"><h2>${Icon('repeat')} Auto expenses</h2><button type="button" class="btn btn-sm" id="eAutoAdd">${Icon('plus')} New</button></div><div id="eAutos"></div></section>
          <section class="card" id="eTypesCard" hidden><h2>Expense types</h2><div class="chips" id="eTypes"></div>
            <form class="inline-add" id="eTypeForm"><input name="name" maxlength="40" placeholder="New type, e.g. Water bill" aria-label="New expense type"><button class="btn btn-sm">Add</button></form></section>
        </div></div></div>`;
    $('#ePrev', view).onclick = () => { month = shiftMonth(month, -1); load(); };
    $('#eNext', view).onclick = () => { month = shiftMonth(month, 1); load(); };
    $('#eAutoAdd', view).onclick = () => autoEditor();
    $('#eTypeForm', view).onsubmit = async e => {
      e.preventDefault(); const v = e.target.name.value.trim(); if (!v) return;
      try { data.heads = await Cloud.rpc('shop_expense_head_save', { p_name: v }); e.target.reset(); paintTypes(); toast(`“${v}” added.`, 'ok'); } catch (ex) { toast(ex.message, 'error'); }
    };
    $('.page', view).addEventListener('click', async e => {
      if (e.target.closest('[data-add]')) return editor();
      const tr = e.target.closest('tr[data-id]');
      if (tr && e.target.closest('[data-edit]')) return editor(data.rows.find(r => r.id === tr.dataset.id));
      if (tr && e.target.closest('[data-del]')) {
        const r = data.rows.find(x => x.id === tr.dataset.id);
        if (!(await ask({ title: 'Delete this expense?', body: `${esc(nameOf(r))} · ${Fmt.money(r.amount)}${r.auto ? '<br><br>It was posted by an auto expense and will not be posted again for this month.' : ''}`, confirm: 'Delete', danger: true }))) return;
        try { await Cloud.rpc('shop_expense_delete', { p_id: r.id }); toast('Expense deleted.', 'ok'); load(); } catch (ex) { toast(ex.message, 'error'); }
        return;
      }
      const li = e.target.closest('[data-auto]');
      if (li) {
        const a = data.autos.find(x => x.id === li.dataset.auto);
        if (e.target.closest('[data-aedit]')) return autoEditor(a);
        if (e.target.closest('[data-adel]')) {
          if (!(await ask({ title: 'Delete this auto expense?', body: 'It stops posting. Months already posted stay in your expenses.', confirm: 'Delete', danger: true }))) return;
          try { await Cloud.rpc('shop_expense_auto_delete', { p_id: a.id }); toast('Auto expense deleted.', 'ok'); load(); } catch (ex) { toast(ex.message, 'error'); }
        }
        return;
      }
      const chip = e.target.closest('[data-head]');
      if (chip && e.target.closest('[data-hdel]')) {
        if (!(await ask({ title: `Remove “${esc(chip.dataset.head)}”?`, body: 'Past expenses keep this name.', confirm: 'Remove' }))) return;
        try { data.heads = await Cloud.rpc('shop_expense_head_delete', { p_name: chip.dataset.head }); paintTypes(); } catch (ex) { toast(ex.message, 'error'); }
      } else if (chip && e.target.closest('[data-rename]')) {
        const v = await ask({ title: 'Rename expense type', confirm: 'Rename', input: { label: 'Name', value: chip.dataset.head, required: true, maxlength: 40 } });
        if (v === null || v.trim() === chip.dataset.head) return;
        try { data.heads = await Cloud.rpc('shop_expense_head_save', { p_name: v.trim(), p_old_name: chip.dataset.head }); load(); } catch (ex) { toast(ex.message, 'error'); }
      }
    });
    $('.page', view).addEventListener('change', async e => {
      const t = e.target.closest('[data-toggle]'); if (!t) return;
      const a = data.autos.find(x => x.id === t.closest('[data-auto]').dataset.auto);
      try { await Cloud.rpc('shop_expense_auto_save', { p: { ...a, start_month: a.start_month, active: t.checked } }); toast(t.checked ? 'Auto expense resumed.' : 'Auto expense paused.', 'ok'); load(); }
      catch (ex) { t.checked = !t.checked; toast(ex.message, 'error'); }
    });
    load();
  }
  return { mount, unmount() { root = null; }, refresh() { if (root) load(); } };
})();

/* js/members.js?v=19 */
;/* Members (gym, library, coaching…): plans, renewals, expiry reminders, member logins and attendance.
   Members with only a few days left float to the top in orange with a reminder. */
'use strict';
const Members = (() => {
  let root = null, data = null, filter = 'all', q = '', req = 0;
  const L = () => Store.label('members'), L1 = () => Store.label1('members');
  const uuid = () => crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  const planById = id => data?.plans.find(p => p.id === id);
  const dur = p => `${p.duration_value} ${p.duration_unit}${p.duration_value === 1 ? '' : 's'}`;
  const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
  const checkinURL = tok => location.origin + location.pathname.replace(/index\.html$/, '') + '#/checkin/' + tok;

  function daysText(m) {
    if (m.status === 'none') return 'No plan';
    if (m.status === 'archived') return 'Archived';
    const d = m.days_left;
    if (d < 0) return `Expired ${-d} day${d === -1 ? '' : 's'} ago`;
    if (d === 0) return 'Ends today';
    return `${d} day${d === 1 ? '' : 's'} left`;
  }
  const rank = m => ({ expiring: 0, expired: 1, active: 2, none: 3, archived: 4 }[m.status]);
  function sorted(list) {
    return [...list].sort((a, b) => rank(a) - rank(b) || (a.status === 'expired' ? b.days_left - a.days_left : (a.days_left ?? 1e9) - (b.days_left ?? 1e9)) || a.name.localeCompare(b.name));
  }
  function visible() {
    const s = q.trim().toLowerCase();
    return sorted(data.members.filter(m => (filter === 'all' ? m.status !== 'archived' : m.status === filter)
      && (!s || m.name.toLowerCase().includes(s) || m.phone.replace(/\D/g, '').includes(s.replace(/\D/g, '') || '¤') || m.member_no.toLowerCase().includes(s))));
  }

  async function load(quiet) {
    const id = ++req; if (!quiet && !data) $('#mStatus', root).textContent = 'Loading…';
    try {
      const d = await Cloud.rpc('shop_members_list');
      if (id !== req || !root?.isConnected) return;
      data = d; render();
    } catch (e) { if (id === req && root?.isConnected) $('#mStatus', root).textContent = e.message; }
  }

  function counts() { const c = { all: 0, expiring: 0, expired: 0, active: 0, none: 0, archived: 0 }; data.members.forEach(m => { c[m.status]++; if (m.status !== 'archived') c.all++; }); return c; }
  function render() {
    const c = counts(), rd = data.remind_days;
    $('#mStatus', root).textContent = `${c.all} ${L().toLowerCase()} · ${c.active + c.expiring} active`;
    $('#mAlert', root).innerHTML = c.expiring ? `<div class="remind-banner" role="status">${Icon('bell')}<div><b>${c.expiring} ${c.expiring === 1 ? L1().toLowerCase() + ' has' : L().toLowerCase() + ' have'} ${rd} day${rd === 1 ? '' : 's'} or less left</b><small>They are at the top of the list. Renew them, or send a WhatsApp reminder.</small></div><button type="button" class="btn btn-sm" data-filter="expiring">Show them</button></div>` : '';
    $('#mFilters', root).innerHTML = [['all', 'All'], ['expiring', 'Ending soon'], ['expired', 'Expired'], ['active', 'Active'], ['none', 'No plan'], ['archived', 'Archived']]
      .filter(([k]) => k === 'all' || c[k] || filter === k).map(([k, l]) => `<button type="button" data-filter="${k}" class="${filter === k ? 'on' : ''} f-${k}">${l} <span>${c[k]}</span></button>`).join('');
    paintList();
  }
  function paintList() {
    const list = visible(), ci = new Set(data.checked_in_today || []);
    const canR = Store.can('members_renew'), canA = Store.can('attendance') && Store.sys.members?.attendance !== false;
    $('#mList', root).innerHTML = list.length ? list.map(m => `<article class="mcard st-${m.status}" data-id="${m.id}">
        <button type="button" class="mcard-main" data-open aria-label="Open ${esc(m.name)}">
          <span class="avatar">${esc(initials(m.name))}</span>
          <span class="mcard-who"><b>${esc(m.name)}</b><small>${esc(m.member_no)}${m.phone ? ' · ' + esc(m.phone) : ''}</small></span>
          <span class="mcard-plan"><span class="days-pill">${m.status === 'expiring' ? Icon('bell') : ''}${esc(daysText(m))}</span><small>${m.plan_name ? esc(m.plan_name) + (m.end_date ? ' · ends ' + esc(Fmt.date(m.end_date)) : '') : 'Choose a plan to start'}</small></span>
          ${ci.has(m.id) ? `<span class="in-today" title="Checked in today">${Icon('check')}</span>` : ''}
        </button>
        <div class="mcard-act">
          ${canR && m.status !== 'archived' ? `<button type="button" class="btn btn-sm ${m.status === 'expiring' || m.status === 'expired' ? 'btn-primary' : ''}" data-renew>${Icon('repeat')} ${m.status === 'none' ? 'Start plan' : 'Renew'}</button>` : ''}
          ${canA && m.status !== 'archived' && !ci.has(m.id) ? `<button type="button" class="btn btn-sm btn-ghost" data-checkin>${Icon('check')} Check in</button>` : ''}
          ${(m.status === 'expiring' || m.status === 'expired') && m.phone ? `<a class="btn btn-sm btn-ghost" data-wa href="${esc(waLink(m))}" target="_blank" rel="noopener">${Icon('whatsapp')} Remind</a>` : ''}
        </div></article>`).join('')
      : `<div class="empty"><div class="empty-ico">${Icon('idcard')}</div><h3>${data.members.length ? 'Nobody matches' : `No ${L().toLowerCase()} yet`}</h3><p>${data.members.length ? 'Try another search or filter.' : `Add your first ${L1().toLowerCase()} and start their plan.`}</p>${!data.members.length && Store.can('members_add') ? `<button type="button" class="btn btn-primary" data-add>${Icon('plus')} Add ${esc(L1().toLowerCase())}</button>` : ''}</div>`;
  }

  function waLink(m) {
    const cc = String(Cloud.cfg.whatsappCountryCode || '91'), digits = m.phone.replace(/\D/g, '');
    const to = digits.length === 10 ? cc + digits : digits;
    const shop = Store.settings.shop_name || '';
    const msg = m.days_left < 0 ? `Hi ${m.name}, your ${m.plan_name} membership at ${shop} ended on ${Fmt.date(m.end_date)}. Please renew to continue. Thank you!`
      : `Hi ${m.name}, your ${m.plan_name} membership at ${shop} ends on ${Fmt.date(m.end_date)} (${daysText(m).toLowerCase()}). Please renew to continue without a break. Thank you!`;
    return `https://wa.me/${to}?text=${encodeURIComponent(msg)}`;
  }

  /* ---------- add / edit ---------- */
  function planPicker(selected, name = 'plan') {
    const plans = data.plans.filter(p => p.active);
    if (!plans.length) return `<p class="notice">${Store.can('members_plans') ? 'Add a plan first (Plans button).' : 'No plans yet. Ask the owner to add plans.'}</p>`;
    return `<div class="plan-cards" role="radiogroup">${plans.map((p, i) => `<label class="plan-card"><input type="radio" name="${name}" value="${p.id}" ${(selected ? selected === p.id : i === 0) ? 'checked' : ''}><span><b>${esc(p.name)}</b><small>${esc(dur(p))}</small><em>${Fmt.money(p.price)}</em></span></label>`).join('')}</div>`;
  }
  const paySeg = (name = 'pay') => `<div class="seg" role="radiogroup">${Store.payments().map((m, i) => `<label><input type="radio" name="${name}" value="${m}" ${i === 0 ? 'checked' : ''}><span>${m}</span></label>`).join('')}</div>`;

  function editor(m = null) {
    const isNew = !m;
    const d = modal(isNew ? `Add ${L1().toLowerCase()}` : `Edit ${m.name}`, `<form id="mForm" class="stack">
      <div class="form-grid">
        <label class="field span-2"><span>Full name</span><input name="name" required maxlength="80" value="${esc(m?.name || '')}" autocomplete="off"></label>
        <label class="field"><span>Mobile number</span><input name="phone" inputmode="tel" maxlength="20" value="${esc(m?.phone || '')}" placeholder="98765 43210"></label>
        <label class="field"><span>Email <em>optional</em></span><input name="email" type="email" maxlength="120" value="${esc(m?.email || '')}"></label>
        <label class="field span-2"><span>Address <em>optional</em></span><textarea name="address" rows="2" maxlength="300">${esc(m?.address || '')}</textarea></label>
        <label class="field"><span>Date of birth <em>optional</em></span><input name="dob" type="date" value="${esc(m?.dob || '')}" max="${Fmt.today()}"></label>
        <label class="field"><span>Gender <em>optional</em></span><select name="gender">${['', 'Male', 'Female', 'Other'].map(g => `<option value="${g}" ${(m?.gender || '') === g ? 'selected' : ''}>${g || '—'}</option>`).join('')}</select></label>
        <label class="field span-2"><span>Notes <em>optional</em></span><input name="notes" maxlength="500" value="${esc(m?.notes || '')}" placeholder="e.g. Morning batch, knee injury"></label>
      </div>
      ${isNew && Store.can('members_renew') ? `<fieldset class="sub-box"><legend>${Icon('idcard')} Start a plan now</legend>
        <label class="switch"><input type="checkbox" name="join" ${data.plans.some(p => p.active) ? 'checked' : ''}><span class="sw" aria-hidden="true"></span><span class="sw-text"><b>Start a plan and take payment</b><small>Makes a bill that shows in Records.</small></span></label>
        <div data-join>${planPicker()}<div class="form-grid"><label class="field"><span>Starts on</span><input name="start" type="date" value="${Fmt.today()}"></label>
          <label class="field"><span>Amount (${esc(Fmt.cur())})</span><input name="amount" type="number" min="0" step="0.01" inputmode="decimal" ${Store.can('discount') ? '' : 'readonly'}></label></div>
          <div class="field"><span>Paid by</span>${paySeg()}</div></div></fieldset>` : ''}
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary">${isNew ? `Add ${esc(L1().toLowerCase())}` : 'Save'}</button></div></form>`, { size: 'modal-md' });
    const f = $('#mForm', d);
    const syncAmt = () => { if (!f.amount) return; const p = planById(f.plan?.value); if (p && document.activeElement !== f.amount) f.amount.value = Number(p.price); };
    const paint = () => { const j = $('[data-join]', f); if (j) j.hidden = !f.join.checked; };
    f.addEventListener('change', e => { if (e.target.name === 'plan' && f.amount) { f.amount.value = Number(planById(e.target.value)?.price || 0); } paint(); });
    syncAmt(); paint();
    f.onsubmit = async e => {
      e.preventDefault(); busy(e.submitter, true, 'Saving…');
      const p = { id: m?.id || null, name: f.name.value.trim(), phone: f.phone.value.trim(), email: f.email.value.trim(), address: f.address.value.trim(), dob: f.dob.value, gender: f.gender.value, notes: f.notes.value.trim() };
      if (isNew && f.join?.checked && f.plan) p.join = { plan_id: f.plan.value, start: f.start.value, amount: f.amount.value, payment_method: f.pay.value, request_id: uuid() };
      try {
        const r = await Cloud.rpc('shop_member_save', { p });
        d.close(); toast(isNew ? `${r.name} added${r.term ? ` · ${r.plan_name} until ${Fmt.date(r.end_date)}` : ''}.` : 'Saved.', 'ok');
        if (r.term?.bill) printOffer(r.term.bill);
        load(true);
      } catch (ex) { toast(ex.message, 'error', 7000); busy(e.submitter, false); }
    };
  }

  function printOffer(bill) {
    toast(`Bill ${bill.bill_no} saved · ${Fmt.money(bill.total)}`, 'ok', 5000);
    const t = $('#toasts')?.lastElementChild; if (!t) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'toast-btn'; b.textContent = 'Print'; b.onclick = () => Receipt.print(bill); t.append(b);
  }

  /* ---------- renew / change plan ---------- */
  function renew(m, mode = m.status === 'none' ? 'change' : 'renew') {
    if (!data.plans.some(p => p.active)) return toast(Store.can('members_plans') ? 'Add a plan first (Plans button).' : 'No plans yet. Ask the owner to add plans.', 'warn');
    const d = modal(`${m.name} · membership`, `<form id="rForm" class="stack">
      <div class="m-now st-${m.status}"><span class="days-pill">${esc(daysText(m))}</span><small>${m.plan_name ? `Now: <b>${esc(m.plan_name)}</b>${m.end_date ? `, ${esc(Fmt.date(m.start_date))} – ${esc(Fmt.date(m.end_date))}` : ''}` : 'No plan yet'}</small></div>
      ${m.status !== 'none' ? `<div class="seg seg-wide" role="radiogroup">
        <label><input type="radio" name="mode" value="renew" ${mode === 'renew' ? 'checked' : ''}><span><b>Renew</b><small>Starts after the current plan ends</small></span></label>
        <label><input type="radio" name="mode" value="change" ${mode === 'change' ? 'checked' : ''}><span><b>Change plan now</b><small>New plan replaces the current one today</small></span></label></div>` : '<input type="hidden" name="mode" value="change">'}
      ${planPicker(m.plan_id && planById(m.plan_id)?.active ? m.plan_id : null)}
      <div class="form-grid"><label class="field"><span>Starts on</span><input name="start" type="date"></label>
        <label class="field"><span>Amount (${esc(Fmt.cur())})</span><input name="amount" type="number" min="0" step="0.01" inputmode="decimal" ${Store.can('discount') ? '' : 'readonly title="Only staff who can give discounts can change the amount"'}></label></div>
      <p class="renew-preview" data-preview></p>
      <div class="field"><span>Paid by</span>${paySeg()}</div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary btn-lg">${Icon('check')} Save & take payment</button></div></form>`, { size: 'modal-md' });
    const f = $('#rForm', d);
    const startFor = () => { const md = f.mode.value; return md === 'renew' && m.end_date && m.end_date >= Fmt.today() ? Fmt.addDays(m.end_date, 1) : Fmt.today(); };
    const endFor = (s, p) => { const dt = new Date(s + 'T12:00:00Z'); if (p.duration_unit === 'day') dt.setUTCDate(dt.getUTCDate() + p.duration_value); else if (p.duration_unit === 'month') dt.setUTCMonth(dt.getUTCMonth() + p.duration_value); else dt.setUTCFullYear(dt.getUTCFullYear() + p.duration_value); dt.setUTCDate(dt.getUTCDate() - 1); return dt.toISOString().slice(0, 10); };
    let startTouched = false;
    const paint = () => {
      const p = planById(f.plan.value); if (!p) return;
      if (!startTouched) f.start.value = startFor();
      const e = endFor(f.start.value || Fmt.today(), p);
      $('[data-preview]', f).innerHTML = `${Icon('calendar')} <b>${esc(p.name)}</b> · ${esc(Fmt.date(f.start.value))} → <b>${esc(Fmt.date(e))}</b>`;
    };
    f.addEventListener('change', e => { if (e.target.name === 'start') startTouched = true; if (e.target.name === 'mode') startTouched = false; if (e.target.name === 'plan') f.amount.value = Number(planById(f.plan.value).price); paint(); });
    f.amount.value = Number(planById(f.plan.value)?.price || 0); paint();
    f.onsubmit = async e => {
      e.preventDefault(); busy(e.submitter, true, 'Saving…');
      const p = planById(f.plan.value);
      try {
        const r = await Cloud.rpc('shop_member_renew', { p_request_id: uuid(), p_member_id: m.id, p_plan_id: p.id, p_mode: f.mode.value, p_start: startTouched ? f.start.value : null, p_payment_method: f.pay.value, p_amount: f.amount.value === '' ? null : Number(f.amount.value), p_note: '' });
        d.close(); toast(`${m.name}: ${p.name} until ${Fmt.date(r.end_date)}.`, 'ok');
        if (r.term?.bill) printOffer(r.term.bill);
        load(true);
      } catch (ex) { toast(ex.message, 'error', 7000); busy(e.submitter, false); }
    };
  }

  /* ---------- member details ---------- */
  async function details(m) {
    const d = modal(m.name, `<div class="m-detail">
      <div class="m-head st-${m.status}"><span class="avatar lg">${esc(initials(m.name))}</span><div><b>${esc(m.name)}</b><small>${esc(m.member_no)} · joined ${esc(Fmt.date(m.created_at))}</small><span class="days-pill">${m.status === 'expiring' ? Icon('bell') : ''}${esc(daysText(m))}</span></div></div>
      <dl class="kv">${m.plan_name ? `<dt>Plan</dt><dd>${esc(m.plan_name)}</dd><dt>Dates</dt><dd>${esc(Fmt.date(m.start_date))} – ${esc(Fmt.date(m.end_date))}</dd>` : ''}
        ${m.phone ? `<dt>Mobile</dt><dd><a href="tel:${esc(m.phone.replace(/[^\d+]/g, ''))}">${esc(m.phone)}</a></dd>` : ''}${m.email ? `<dt>Email</dt><dd>${esc(m.email)}</dd>` : ''}
        ${m.address ? `<dt>Address</dt><dd class="pre">${esc(m.address)}</dd>` : ''}${m.dob ? `<dt>Birthday</dt><dd>${esc(Fmt.date(m.dob))}</dd>` : ''}${m.notes ? `<dt>Notes</dt><dd>${esc(m.notes)}</dd>` : ''}
        <dt>App login</dt><dd>${m.has_login ? `${Icon('check')} ${esc(m.login_id)}` : '<span class="muted">Not set</span>'}</dd></dl>
      <div class="toolbar wrap">
        ${Store.can('members_renew') && m.status !== 'archived' ? `<button type="button" class="btn btn-primary" data-act="renew">${Icon('repeat')} Renew</button>${m.status !== 'none' ? `<button type="button" class="btn" data-act="change">Change plan</button>` : ''}` : ''}
        ${Store.can('members_add') ? `<button type="button" class="btn" data-act="edit">${Icon('edit')} Edit</button>` : ''}
        ${Store.can('members_plans') && m.end_date ? `<button type="button" class="btn btn-ghost" data-act="dates">${Icon('calendar')} Fix dates</button>` : ''}
        ${Store.can('members_login') && Store.sys.members?.login !== false ? `<button type="button" class="btn btn-ghost" data-act="login">${Icon('lock')} ${m.has_login ? 'Login' : 'Give app login'}</button>` : ''}
        ${m.phone ? `<a class="btn btn-ghost" href="${esc(waLink(m))}" target="_blank" rel="noopener">${Icon('whatsapp')} WhatsApp</a>` : ''}
        ${Store.can('members_add') ? `<button type="button" class="btn btn-ghost" data-act="archive">${m.active ? 'Archive' : 'Bring back'}</button>` : ''}
      </div>
      <div class="m-hist"><section><h3>Membership history</h3><div data-terms><p class="hint">Loading…</p></div></section>
        <section><h3>Visits</h3><div data-visits><p class="hint">Loading…</p></div></section></div></div>`, { size: 'modal-md' });
    d.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]')?.dataset.act; if (!a) return;
      if (a === 'renew' || a === 'change') { d.close(); renew(m, a); }
      if (a === 'edit') { d.close(); editor(m); }
      if (a === 'dates') { d.close(); fixDates(m); }
      if (a === 'login') { d.close(); loginEditor(m); }
      if (a === 'archive') {
        if (m.active && !(await ask({ title: `Archive ${esc(m.name)}?`, body: 'They leave the list and cannot sign in to the member app. Their history is kept and you can bring them back.', confirm: 'Archive' }))) return;
        try { await Cloud.rpc('shop_member_save', { p: { ...m, active: !m.active } }); d.close(); toast(m.active ? 'Archived.' : 'Back in the list.', 'ok'); load(true); } catch (ex) { toast(ex.message, 'error'); }
      }
    });
    try {
      const h = await Cloud.rpc('shop_member_history', { p_member_id: m.id }); if (!d.open) return;
      const kind = { new: 'Joined', renew: 'Renewed', change: 'Changed plan', edit: 'Dates changed' };
      $('[data-terms]', d).innerHTML = h.terms.length ? `<ul class="timeline">${h.terms.map(t => `<li><b>${kind[t.kind]} · ${esc(t.plan_name)}</b><small>${esc(Fmt.date(t.start_date))} – ${esc(Fmt.date(t.end_date))}${Number(t.amount) ? ` · ${Fmt.money(t.amount)}` : ''}${t.bill_no ? ` · ${esc(t.bill_no)}` : ''}${t.by ? ` · by ${esc(t.by)}` : ''}</small></li>`).join('')}</ul>` : '<p class="hint">No plans yet.</p>';
      const month = h.attendance.filter(a => a.at.slice(0, 7) === Fmt.today().slice(0, 7)).length;
      $('[data-visits]', d).innerHTML = h.attendance.length ? `<p><b>${month}</b> visit${month === 1 ? '' : 's'} this month</p><ul class="visit-list">${h.attendance.slice(0, 20).map(a => `<li>${esc(Fmt.dateTime(a.at))} <small class="muted">${a.method === 'qr' ? 'QR scan' : 'by ' + esc(a.by || 'staff')}</small></li>`).join('')}</ul>` : '<p class="hint">No visits yet.</p>';
    } catch (ex) { $('[data-terms]', d).innerHTML = `<p class="hint">${esc(ex.message)}</p>`; }
  }

  async function fixDates(m) {
    const d = modal(`Fix dates · ${m.name}`, `<form class="stack" id="dForm"><p class="hint">For example to add free days. No bill is made; the change is noted in their history.</p>
      <div class="form-grid"><label class="field"><span>Start</span><input type="date" name="s" value="${esc(m.start_date)}" required></label><label class="field"><span>End</span><input type="date" name="e" value="${esc(m.end_date)}" required></label></div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary">Save dates</button></div></form>`, { size: 'modal-sm' });
    $('#dForm', d).onsubmit = async e => { e.preventDefault(); const f = e.target; try { await Cloud.rpc('shop_member_set_dates', { p_member_id: m.id, p_start: f.s.value, p_end: f.e.value }); d.close(); toast('Dates saved.', 'ok'); load(true); } catch (ex) { toast(ex.message, 'error'); } };
  }

  function loginEditor(m) {
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    const d = modal(`App login · ${m.name}`, `<form class="stack" id="lForm">
      <p class="hint">They sign in to this same app with their mobile number and this password, and see their plan, days left and visits${Store.sys.members?.attendance !== false ? ', and scan the QR at the front desk to check in' : ''}.</p>
      <label class="field"><span>Mobile number or email</span><input name="login" required maxlength="120" value="${esc(m.login_id || m.phone || m.email)}" inputmode="email"></label>
      <label class="field"><span>Password <em>6+ characters</em></span><div class="inline-add"><input name="pw" required minlength="6" maxlength="72" value="${pin}" autocomplete="off"><button type="button" class="btn btn-sm btn-ghost" data-new>New</button></div></label>
      <div class="modal-actions">${m.has_login ? '<button type="button" class="btn btn-ghost btn-danger-text" data-remove>Remove login</button>' : ''}<button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary">${m.has_login ? 'Save new password' : 'Create login'}</button></div></form>`, { size: 'modal-sm' });
    const f = $('#lForm', d);
    $('[data-new]', d).onclick = () => { f.pw.value = String(Math.floor(100000 + Math.random() * 900000)); };
    f.onsubmit = async e => {
      e.preventDefault(); busy(e.submitter, true, 'Saving…');
      try {
        const r = await Cloud.rpc('shop_member_login_set', { p_member_id: m.id, p_login: f.login.value.trim(), p_password: f.pw.value });
        d.close(); load(true);
        const url = location.origin + location.pathname.replace(/index\.html$/, '');
        const msg = `Hi ${m.name}, your ${Store.settings.shop_name || ''} app login:\n${url}\nMobile/Email: ${r.login_id}\nPassword: ${f.pw.value}`;
        const share = modal('Login ready', `<p>Give these to ${esc(m.name)}:</p><pre class="login-card">${esc(msg)}</pre>
          <div class="modal-actions">${m.phone ? `<a class="btn" href="https://wa.me/${esc((m.phone.replace(/\D/g, '').length === 10 ? (Cloud.cfg.whatsappCountryCode || '91') : '') + m.phone.replace(/\D/g, ''))}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">${Icon('whatsapp')} Send on WhatsApp</a>` : ''}<button type="button" class="btn btn-primary" data-close>Done</button></div>`, { size: 'modal-sm' });
        share.focus?.();
      } catch (ex) { toast(ex.message, 'error', 7000); busy(e.submitter, false); }
    };
    $('[data-remove]', d)?.addEventListener('click', async () => {
      if (!(await ask({ title: 'Remove app login?', body: `${esc(m.name)} will not be able to sign in any more.`, confirm: 'Remove', danger: true }))) return;
      try { await Cloud.rpc('shop_member_login_remove', { p_member_id: m.id }); d.close(); toast('Login removed.', 'ok'); load(true); } catch (ex) { toast(ex.message, 'error'); }
    });
  }

  /* ---------- plans ---------- */
  function plans() {
    const d = modal('Plans', `<div class="stack"><ul class="plan-list" data-plans></ul>
      <form class="card sub-box" id="pForm"><h3 data-ptitle>New plan</h3><input type="hidden" name="id">
        <div class="form-grid"><label class="field span-2"><span>Name</span><input name="name" required maxlength="60" placeholder="e.g. Monthly, Quarterly, Yearly"></label>
          <div class="field"><span>Lasts</span><div class="inline-add"><input name="dv" type="number" min="1" max="3650" required value="1" aria-label="How long"><select name="du" aria-label="Unit"><option value="day">days</option><option value="month" selected>months</option><option value="year">years</option></select></div></div>
          <label class="field"><span>Price (${esc(Fmt.cur())})</span><input name="price" type="number" min="0" step="0.01" required inputmode="decimal"></label>
          ${Store.settings.tax_enabled && Store.settings.tax_scope === 'item' ? `<label class="field"><span>Tax % <em>included in price</em></span><input name="tax" type="number" min="0" max="100" step="0.01" placeholder="${Number(Store.settings.tax_value)}"></label>` : ''}
          <label class="field span-2"><span>Description <em>optional</em></span><input name="desc" maxlength="200"></label></div>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" data-pclear>Clear</button><button class="btn btn-primary">Save plan</button></div></form></div>`, { size: 'modal-md' });
    const f = $('#pForm', d);
    const paint = () => { $('[data-plans]', d).innerHTML = data.plans.length ? data.plans.map(p => `<li data-pid="${p.id}" class="${p.active ? '' : 'off'}"><div><b>${esc(p.name)}</b><small>${esc(dur(p))} · ${Fmt.money(p.price)}${p.active ? '' : ' · hidden'}</small></div><div class="row-act"><button type="button" class="btn btn-sm btn-ghost" data-pedit>${Icon('edit')} Edit</button><button type="button" class="btn btn-sm btn-ghost" data-pdel aria-label="Remove">${Icon('trash')}</button></div></li>`).join('') : '<li class="hint">No plans yet.</li>'; };
    const clear = () => { f.reset(); f.id.value = ''; $('[data-ptitle]', f).textContent = 'New plan'; };
    paint();
    d.addEventListener('click', async e => {
      const li = e.target.closest('[data-pid]'); if (e.target.closest('[data-pclear]')) return clear();
      if (!li) return; const p = planById(li.dataset.pid);
      if (e.target.closest('[data-pedit]')) { f.id.value = p.id; f.name.value = p.name; f.dv.value = p.duration_value; f.du.value = p.duration_unit; f.price.value = Number(p.price); if (f.tax) f.tax.value = p.tax_rate ?? ''; f.desc.value = p.description; $('[data-ptitle]', f).textContent = 'Edit ' + p.name; f.name.focus(); }
      if (e.target.closest('[data-pdel]')) {
        if (!(await ask({ title: `Remove ${esc(p.name)}?`, body: 'If anyone has used this plan it is hidden instead, so their history stays.', confirm: 'Remove' }))) return;
        try { await Cloud.rpc('shop_plan_delete', { p_id: p.id }); await load(true); paint(); } catch (ex) { toast(ex.message, 'error'); }
      }
    });
    f.onsubmit = async e => {
      e.preventDefault(); busy(e.submitter, true, 'Saving…');
      try { await Cloud.rpc('shop_plan_save', { p: { id: f.id.value || null, name: f.name.value.trim(), duration_value: f.dv.value, duration_unit: f.du.value, price: f.price.value, tax_rate: f.tax?.value || '', description: f.desc.value.trim(), active: true } }); toast('Plan saved.', 'ok'); await load(true); paint(); clear(); }
      catch (ex) { toast(ex.message, 'error'); } finally { busy(e.submitter, false); }
    };
  }

  /* ---------- attendance & check-in QR ---------- */
  async function attendance() {
    let day = Fmt.today();
    const d = modal('Attendance', `<div class="att-wrap">
      <div class="att-qr card"><h3>${Icon('scan')} Check-in QR</h3><p class="hint">Print it and stick it at the front desk. ${esc(L())} scan it in their app${Store.sys.members?.login === false ? '' : ' (or with the phone camera)'} to check in.</p><div class="qr-box" data-qr><p class="hint">Loading…</p></div>
        <div class="toolbar wrap"><button type="button" class="btn btn-primary" data-qprint>${Icon('printer')} Print QR</button>${Store.can('members_plans') ? '<button type="button" class="btn btn-ghost" data-qnew>New code</button>' : ''}</div></div>
      <div class="att-list"><div class="att-head"><input type="date" data-day value="${day}" max="${day}" aria-label="Day"><b data-count></b></div>
        <form class="inline-add" data-manual><input list="mNames" name="who" placeholder="Check someone in by name or number" aria-label="Check in"><datalist id="mNames">${data.members.filter(m => m.active).map(m => `<option value="${esc(m.name)} · ${esc(m.member_no)}">`).join('')}</datalist><button class="btn btn-sm">Check in</button></form>
        <ul class="visit-list" data-rows></ul></div></div>`, { size: 'modal-lg' });
    let token = '';
    const paintQR = () => { $('[data-qr]', d).innerHTML = QR.svg(checkinURL(token), 220) + `<small class="mono">${esc(Store.settings.shop_name || '')}</small>`; };
    const loadRows = async () => {
      try { const r = await Cloud.rpc('shop_attendance_list', { p_day: day }); if (!d.open) return;
        $('[data-count]', d).textContent = `${r.rows.length} check-in${r.rows.length === 1 ? '' : 's'}`;
        $('[data-rows]', d).innerHTML = r.rows.length ? r.rows.map(x => `<li><b>${esc(x.name)}</b> <small class="muted">${esc(x.member_no)}</small><span>${esc(Fmt.time(x.at))} · ${x.method === 'qr' ? 'QR' : 'by ' + esc(x.by || 'staff')}</span></li>`).join('') : '<li class="hint">Nobody yet.</li>';
      } catch (ex) { toast(ex.message, 'error'); }
    };
    try { token = (await Cloud.rpc('shop_checkin_code')).token; paintQR(); } catch (ex) { $('[data-qr]', d).textContent = ex.message; }
    loadRows();
    $('[data-day]', d).onchange = e => { day = e.target.value || Fmt.today(); loadRows(); };
    $('[data-manual]', d).onsubmit = async e => {
      e.preventDefault(); const v = e.target.who.value.trim(); if (!v) return;
      const m = data.members.find(x => v.endsWith(x.member_no)) || data.members.find(x => x.name.toLowerCase() === v.toLowerCase() || (x.phone && x.phone.replace(/\D/g, '') === v.replace(/\D/g, '')));
      if (!m) return toast('No one with that name or number.', 'warn');
      await checkIn(m); e.target.reset(); if (day === Fmt.today()) loadRows();
    };
    d.addEventListener('click', async e => {
      if (e.target.closest('[data-qprint]')) printQR(token);
      if (e.target.closest('[data-qnew]')) {
        if (!(await ask({ title: 'Make a new check-in code?', body: 'Printed QR codes with the old code stop working. Print the new one afterwards.', confirm: 'Make new code', danger: true }))) return;
        try { token = (await Cloud.rpc('shop_checkin_code', { p_new: true })).token; paintQR(); toast('New code ready. Print it.', 'ok'); } catch (ex) { toast(ex.message, 'error'); }
      }
    });
  }
  function printQR(token) {
    const w = window.open('', '_blank', 'width=480,height=640'); if (!w) return toast('Allow pop-ups to print.', 'warn');
    w.document.write(`<!doctype html><title>Check-in QR</title><style>body{font-family:system-ui,sans-serif;text-align:center;padding:30px;color:#111}h1{font-size:26px;margin:0 0 6px}p{margin:4px 0 18px;font-size:16px}svg{width:320px;height:320px}</style>
      <h1>${esc(Store.settings.shop_name || '')}</h1><p>Scan to check in</p>${QR.svg(checkinURL(token), 320)}<p style="margin-top:18px;font-size:13px;color:#444">Open the app → Scan to check in, or use your phone camera.</p><script>onload=()=>{print()}<\/script>`);
    w.document.close();
  }
  async function checkIn(m) {
    try {
      const r = await Cloud.rpc('shop_attendance_mark', { p_member_id: m.id });
      toast(r.already ? `${m.name} already checked in at ${Fmt.time(r.at)}.` : `${m.name} checked in.`, 'ok');
      if (m.status === 'expired') toast(`${m.name}’s plan has ended — remind them to renew.`, 'warn', 6000);
      if (!r.already) { data.checked_in_today = [...new Set([...(data.checked_in_today || []), m.id])]; paintList(); }
    } catch (ex) { toast(ex.message, 'error'); }
  }

  function mount(view) {
    root = view; data = null;
    view.innerHTML = `<div class="page">
      <header class="page-head"><div><h1>${esc(L())}</h1><p class="sub" id="mStatus" role="status"></p></div>
        <div class="head-actions">
          ${Store.can('attendance') && Store.sys.members?.attendance !== false ? `<button type="button" class="btn" id="mAtt">${Icon('scan')} Attendance</button>` : ''}
          ${Store.can('members_plans') ? `<button type="button" class="btn" id="mPlans">${Icon('layers')} Plans</button>` : ''}
          ${Store.can('members_add') ? `<button type="button" class="btn btn-primary" data-add>${Icon('plus')} Add ${esc(L1().toLowerCase())}</button>` : ''}</div></header>
      <div id="mAlert"></div>
      <div class="filters m-filters"><div class="seg seg-scroll" id="mFilters"></div><label class="search-box">${Icon('search')}<input type="search" id="mSearch" placeholder="Search name, number or ID" value="${esc(q)}" aria-label="Search"></label></div>
      <div class="mgrid" id="mList"><div class="empty slim"><p>Loading…</p></div></div></div>`;
    $('#mSearch', view).oninput = e => { q = e.target.value; if (data) paintList(); };
    $('#mAtt', view)?.addEventListener('click', () => data && attendance());
    $('#mPlans', view)?.addEventListener('click', () => data && plans());
    $('.page', view).addEventListener('click', e => {
      const fb = e.target.closest('[data-filter]'); if (fb) { filter = fb.dataset.filter; render(); return; }
      if (e.target.closest('[data-add]')) return data && editor();
      const card = e.target.closest('[data-id]'); if (!card || !data) return;
      const m = data.members.find(x => x.id === card.dataset.id);
      if (e.target.closest('[data-renew]')) return renew(m);
      if (e.target.closest('[data-checkin]')) return checkIn(m);
      if (e.target.closest('[data-open]')) return details(m);
    });
    load();
  }
  return { mount, unmount() { root = null; }, refresh() { if (root) load(true); } };
})();

/* js/portal.js?v=19 */
;/* Member app: what a gym / library member sees after signing in — their plan, days left, visits,
   and "Scan to check in" for the QR code at the front desk. */
'use strict';
const Portal = (() => {
  let root = null, scanning = null;
  const me = () => Store.me?.member || {};
  const cfg = () => Store.sys.members || {};
  const tokenFrom = text => { const m = String(text || '').match(/#\/checkin\/([A-Za-z0-9]{8,64})/) || String(text || '').match(/^([A-Za-z0-9]{16,64})$/); return m ? m[1] : ''; };

  function ring(m) {
    const total = m.start_date && m.end_date ? Math.max(1, (new Date(m.end_date) - new Date(m.start_date)) / 864e5 + 1) : 30;
    const left = Math.max(0, m.days_left ?? 0), pct = m.status === 'expired' || m.status === 'none' ? 0 : Math.min(1, (left + 1) / total);
    const R = 54, C = 2 * Math.PI * R;
    return `<svg class="ring" viewBox="0 0 128 128" aria-hidden="true"><circle cx="64" cy="64" r="${R}" class="ring-bg"/><circle cx="64" cy="64" r="${R}" class="ring-fg" stroke-dasharray="${C}" stroke-dashoffset="${(C * (1 - pct)).toFixed(1)}" transform="rotate(-90 64 64)"/></svg>`;
  }
  function bigDays(m) {
    if (m.status === 'none') return ['—', 'No active plan'];
    if (m.days_left < 0) return ['0', `Ended ${Fmt.date(m.end_date)}`];
    if (m.days_left === 0) return ['0', 'Last day today'];
    return [String(m.days_left), m.days_left === 1 ? 'day left' : 'days left'];
  }

  function render() {
    if (!root) return;
    const m = me(), c = cfg(), s = Store.settings, [num, cap] = bigDays(m), att = c.attendance !== false;
    const kind = { new: 'Joined', renew: 'Renewed', change: 'Changed plan' };
    root.className = 'portal';
    root.innerHTML = `<header class="p-top"><div class="p-brand">${s.logo ? `<img src="${esc(s.logo)}" alt="">` : `<span class="logo-chip">${esc((s.shop_name || 'S').charAt(0))}</span>`}<div><b>${esc(s.shop_name || '')}</b><small>${esc(Store.label1('members'))} app</small></div></div>
        <button type="button" class="icon-btn" data-help aria-label="Help & contact">${Icon('help')}</button><button type="button" class="icon-btn" id="pOut" aria-label="Sign out">${Icon('logout')}</button></header>
      <main class="p-main">
        <section class="p-card p-hero st-${m.status}">
          <div class="p-who"><span class="avatar lg">${esc(String(m.name || '?').split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase())}</span><div><h1>Hi, ${esc(String(m.name || '').split(' ')[0])}</h1><small>${esc(m.member_no || '')}</small></div></div>
          ${c.see_days_left !== false ? `<div class="p-ring">${ring(m)}<div class="p-ring-txt"><b>${esc(num)}</b><small>${esc(cap)}</small></div></div>` : ''}
          ${c.see_plan !== false ? `<dl class="kv p-plan"><dt>Plan</dt><dd>${esc(m.plan_name || 'None')}</dd>${m.end_date ? `<dt>From</dt><dd>${esc(Fmt.date(m.start_date))}</dd><dt>Until</dt><dd><b>${esc(Fmt.date(m.end_date))}</b></dd>` : ''}</dl>` : ''}
          ${m.status === 'expiring' ? `<p class="p-warn">${Icon('bell')} Your plan ends soon. Renew at the front desk to continue without a break.</p>` : ''}
          ${m.status === 'expired' ? `<p class="p-warn bad">${Icon('alert')} Your plan has ended. Please renew at the front desk.</p>` : ''}
        </section>
        ${att ? `<section class="p-card p-check">
          ${m.checked_in_today ? `<div class="p-done">${Icon('check')}<div><b>Checked in today</b><small>${m.month_visits || 0} visit${m.month_visits === 1 ? '' : 's'} this month</small></div></div>` : ''}
          <button type="button" class="btn btn-primary btn-xl" id="pScan" ${m.status === 'expired' || m.status === 'none' ? 'disabled' : ''}>${Icon('scan')} Scan to check in</button>
          <p class="hint center">Point at the QR code at the front desk. Your phone camera works too.</p></section>` : ''}
        ${c.see_attendance !== false && att && (m.attendance || []).length ? `<section class="p-card"><h2>Recent visits</h2><ul class="visit-list">${m.attendance.slice(0, 10).map(a => `<li>${esc(Fmt.dateTime(a))}</li>`).join('')}</ul></section>` : ''}
        ${c.see_history !== false && (m.terms || []).length ? `<section class="p-card"><h2>My plans</h2><ul class="timeline">${m.terms.map(t => `<li><b>${kind[t.kind] || ''} · ${esc(t.plan_name)}</b><small>${esc(Fmt.date(t.start_date))} – ${esc(Fmt.date(t.end_date))}${t.amount != null && Number(t.amount) ? ` · ${Fmt.money(t.amount)}` : ''}${t.bill_no ? ` · ${esc(t.bill_no)}` : ''}</small></li>`).join('')}</ul></section>` : ''}
        ${s.contact_phone || s.address ? `<section class="p-card p-contact"><h2>${esc(s.shop_name || 'Contact')}</h2>${s.address ? `<p class="pre">${esc(s.address)}</p>` : ''}${s.contact_phone ? `<a class="btn" href="tel:${esc(s.contact_phone.replace(/[^\d+]/g, ''))}">${Icon('phone')} ${esc(s.contact_phone)}</a>` : ''}</section>` : ''}
      </main>`;
    $('#pOut', root).onclick = App.signOut;
    $('#pScan', root)?.addEventListener('click', scan);
  }

  async function checkIn(token) {
    try {
      const r = await Cloud.rpc('shop_member_checkin', { p_token: token });
      toast(r.already ? `Already checked in at ${Fmt.time(r.at)}.` : 'Checked in. Have a great session!', 'ok', 5000);
      await App.refreshMe();
    } catch (e) { toast(e.message, 'error', 7000); }
  }
  function checkPending() {
    const t = sessionStorage.getItem('SHOPBILL_CHECKIN'); if (!t) return;
    sessionStorage.removeItem('SHOPBILL_CHECKIN'); checkIn(t);
  }

  /* ---------- camera scanner: the phone's own QR reader where it has one, otherwise jsQR (loaded only when needed) ---------- */
  function loadJsQR() {
    if (window.jsQR) return Promise.resolve(window.jsQR);
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js'; s.onload = () => res(window.jsQR); s.onerror = () => rej(new Error('The scanner could not load. Use your phone camera instead.')); document.head.append(s); });
  }
  async function scan() {
    const d = modal('Scan to check in', `<div class="scanner"><video playsinline muted></video><div class="scan-frame" aria-hidden="true"></div></div><p class="hint center" data-msg>Point your camera at the QR code at the front desk.</p>`, { size: 'modal-sm', onClose: stop });
    const video = $('video', d), msg = $('[data-msg]', d);
    let stream = null, timer = 0, done = false;
    function stop() { done = true; clearTimeout(timer); stream?.getTracks().forEach(t => t.stop()); scanning = null; }
    scanning = stop;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      video.srcObject = stream; await video.play();
    } catch { msg.textContent = 'Camera not available. Open your phone’s camera app and point it at the QR code instead.'; return; }
    let detect;
    if ('BarcodeDetector' in window) {
      try { const bd = new BarcodeDetector({ formats: ['qr_code'] }); detect = async () => (await bd.detect(video))[0]?.rawValue; } catch { detect = null; }
    }
    if (!detect) {
      try {
        const jsQR = await loadJsQR(), c = document.createElement('canvas'), ctx = c.getContext('2d', { willReadFrequently: true });
        detect = async () => { const w = video.videoWidth, h = video.videoHeight; if (!w) return ''; const k = Math.min(1, 640 / Math.max(w, h)); c.width = w * k; c.height = h * k; ctx.drawImage(video, 0, 0, c.width, c.height); return jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height)?.data; };
      } catch (e) { msg.textContent = e.message; return; }
    }
    const loop = async () => {
      if (done) return;
      try {
        const text = await detect();
        const tok = tokenFrom(text);
        if (tok) { d.close(); return checkIn(tok); }
        if (text) msg.textContent = 'That is not the check-in code. Scan the QR at the front desk.';
      } catch { /* keep trying */ }
      timer = setTimeout(loop, 250);
    };
    loop();
  }

  function mount(el) { root = el; render(); checkPending(); }
  return { mount, refresh() { render(); }, checkPending, unmount() { scanning?.(); root = null; } };
})();

/* workspace.js?v=19 */
;/* One staff shell. A hidden, resident alert engine keeps order/request alarms and phone notifications running
   while every screen is drawn natively by the billing app. The menu designer is the only embedded restaurant panel. */
'use strict';
const RestaurantWorkspace = (() => {
  let kernel = null, ready = false, panels = new Set(), pending = new Map(), seq = 0, alerts = new Map(), state = { controls: {}, ready: '', connected: false }, counts = {};
  const tokens = ['bg', 'surface', 'surface-2', 'line', 'line-2', 'ink', 'ink-2', 'muted', 'primary', 'primary-ink', 'primary-soft', 'primary-hover', 'green', 'green-soft', 'red', 'red-soft', 'amber', 'amber-soft', 'radius', 'radius-sm', 'font', 'mono'];
  function theme(frame) { if (!frame?.contentWindow) return; const css = getComputedStyle(document.documentElement); send(frame, { type: 'workspace:theme', vars: { ...Object.fromEntries(tokens.map(k => [k, css.getPropertyValue('--' + k).trim()])), scheme: /dark/.test(css.colorScheme) ? 'dark' : 'light' } }); }
  const src = (section, panel) => '../restaurant-engine.html?embedded=1&restaurant=1' + (panel ? '&panel=1' : '') + '&section=' + encodeURIComponent(section) + '#' + section;
  function create(section, panel = false) {
    const f = document.createElement('iframe'); f.className = 'workspace-engine'; f.title = panel ? 'Customer menu designer' : 'Restaurant alerts'; f.setAttribute('allow', 'autoplay; clipboard-write');
    f.addEventListener('load', () => theme(f));
    if (window.WORKSPACE_PREVIEW_ENGINE_HTML) f.srcdoc = window.WORKSPACE_PREVIEW_ENGINE_HTML; else f.src = src(section, panel);
    f.dataset.section = section; f.dataset.panel = String(panel); return f;
  }
  function start() {
    if (window.WORKSPACE_PREVIEW_NO_ENGINE) { state = { controls: {}, ready: 'Sounds and phone notifications run on the live site. This preview has no alarms.', connected: true }; return; }
    if (kernel?.isConnected) return; ready = false; state = { controls: {}, ready: '', connected: false };
    kernel = create('live'); kernel.id = 'restaurantAlertEngine'; kernel.hidden = true; kernel.setAttribute('aria-hidden', 'true'); kernel.tabIndex = -1;
    document.body.append(kernel);
  }
  function send(frame, message) { frame?.contentWindow?.postMessage(message, window.WORKSPACE_PREVIEW_ENGINE_HTML ? '*' : location.origin); }
  function command(cmd) { if (typeof cmd === 'string' && /^[A-Za-z]{2,40}$/.test(cmd)) send(kernel, { type: 'workspace:command', cmd }); }
  function mountPanel(root, section = 'management') {
    if (window.WORKSPACE_PREVIEW_NO_ENGINE) { root.innerHTML = '<p class="notice">The menu designer opens on the live site. It is not part of this sample preview.</p>'; return root; }
    const wrap = document.createElement('div'); wrap.className = 'workspace-panel'; wrap.innerHTML = '<p class="workspace-panel-loading" role="status">Loading the menu designer…</p>';
    const frame = create(section, true); wrap.append(frame); root.replaceChildren(wrap); panels.add(frame);
    const ob = new MutationObserver(() => { if (!frame.isConnected) { panels.delete(frame); ob.disconnect(); } }); ob.observe(document.body, { childList: true, subtree: true }); return wrap;
  }
  function beforeRoute() { for (const f of [...panels]) if (!f.isConnected) panels.delete(f); }
  function syncTheme() { theme(kernel); for (const f of panels) theme(f); }
  async function prepareSignOut() {
    if (!kernel || !ready) return; const id = 'cleanup-' + (++seq);
    await new Promise((resolve, reject) => { const timer = setTimeout(() => { pending.delete(id); reject(Error('Restaurant alert cleanup timed out. Please retry sign out.')); }, 15000); pending.set(id, { resolve, reject, timer }); send(kernel, { type: 'workspace:cleanup', id }); });
  }
  function stop() {
    for (const d of alerts.values()) d.close(); alerts.clear(); kernel?.remove(); kernel = null; ready = false; counts = {}; paintCounts();
    for (const f of panels) f.closest('.workspace-panel')?.remove(); panels.clear();
    for (const p of pending.values()) { clearTimeout(p.timer); p.resolve(); } pending.clear();
  }
  function paintCounts() {
    for (const [route, n] of [['kitchen', counts.orders], ['requests', counts.requests], ['notifications', counts.notices]]) {
      const a = document.querySelector(`.side-nav a[data-route="${route}"]`); if (!a) continue;
      let c = a.querySelector('.nav-count'); if (!c) { c = document.createElement('span'); c.className = 'nav-count'; a.querySelector('span')?.after(c); }
      c.textContent = Number(n) > 0 ? String(Math.min(99, Number(n))) : ''; c.setAttribute('aria-label', Number(n) > 0 ? n + ' waiting' : '');
    }
  }
  addEventListener('message', event => {
    if (event.origin !== location.origin && !(window.WORKSPACE_PREVIEW_ENGINE_HTML && event.origin === 'null')) return;
    const frame = event.source === kernel?.contentWindow ? kernel : [...panels].find(f => f.contentWindow === event.source); if (!frame) return;
    const d = event.data || {};
    if (d.type === 'workspace:ready') {
      if (frame === kernel) { ready = true; state.connected = true; send(frame, { type: 'workspace:section', section: 'live', active: false, kernel: true }); command('state'); }
      else { send(frame, { type: 'workspace:section', section: frame.dataset.section, panel: true, active: true }); frame.closest('.workspace-panel')?.querySelector('.workspace-panel-loading')?.remove(); }
      theme(frame);
    }
    if (d.type === 'workspace:navigate' && typeof d.route === 'string' && /^[a-zA-Z]+$/.test(d.route)) location.hash = '#/' + d.route;
    if (d.type === 'workspace:receipt' && d.order) Records.openBill(Cloud.orderToBill ? Cloud.orderToBill(d.order) : d.order);
    if (d.type === 'workspace:settings-changed') void App.refreshMe(true).catch(e => toast(e.message, 'error'));
    if (d.type === 'workspace:session-ended') { stop(); Store.me = null; App.loginView('Your session ended. Sign in again.'); }
    if (d.type === 'workspace:cleanup-result') { const p = pending.get(d.id); if (p) { clearTimeout(p.timer); pending.delete(d.id); d.error ? p.reject(Error(d.error)) : p.resolve(); } }
    if (d.type === 'workspace:height' && frame !== kernel) { const height = Number(d.height); if (Number.isFinite(height)) frame.style.height = Math.min(18000, Math.max(420, height)) + 'px'; }
    if (d.type === 'workspace:alert-state' && frame === kernel && d.state && typeof d.state === 'object') { state = { ...d.state, connected: true }; document.dispatchEvent(new CustomEvent('workspace:alert-state')); }
    if (d.type === 'workspace:counts' && frame === kernel) { counts = { orders: d.orders, requests: d.requests, notices: d.notices }; paintCounts(); document.dispatchEvent(new CustomEvent('workspace:counts', { detail: counts })); }
    if (d.type === 'workspace:alert' && frame === kernel && ['order', 'request'].includes(d.kind)) {
      if (!d.open) { alerts.get(d.kind)?.close(); alerts.delete(d.kind); return; }
      if (alerts.has(d.kind)) return;
      const route = d.kind === 'order' ? 'kitchen' : 'requests';
      const dialog = modal(d.title || 'Restaurant alert', `<p>${esc(d.message || 'A new request needs attention.')}</p><p class="hint" style="margin-top:8px">Snooze and Dismiss only silence this device. The ${d.kind === 'order' ? 'order' : 'request'} stays waiting.</p><div class="modal-actions" style="margin-top:14px"><button class="btn btn-ghost" data-alert-snooze>Snooze 2 min</button><button class="btn" data-alert-dismiss>Dismiss</button><a class="btn btn-primary" href="#/${route}" data-alert-open>${Icon(d.kind === 'order' ? 'store' : 'bell')} ${d.kind === 'order' ? 'Open kitchen' : 'Open requests'}</a></div>`, { size: 'modal-sm' });
      alerts.set(d.kind, dialog); let action = 'dismiss';
      dialog.querySelector('[data-alert-snooze]').onclick = () => { action = 'snooze'; dialog.close(); };
      dialog.querySelector('[data-alert-dismiss]').onclick = () => dialog.close();
      dialog.querySelector('[data-alert-open]').onclick = () => { action = 'dismiss'; setTimeout(() => dialog.close(), 0); };
      dialog.addEventListener('close', () => { alerts.delete(d.kind); send(kernel, { type: 'workspace:alert-action', kind: d.kind, action }); }, { once: true });
    }
  });
  document.addEventListener('setup:changed', syncTheme);
  return { start, stop, beforeRoute, mountPanel, syncTheme, prepareSignOut, command, alertState: () => state, counts: () => counts, paintCounts };
})();

/* ../menu17-data.js?v=19 */
;/* Customer menu v17: 20 layouts ("architectures"), 40 menu themes, editable words and switches.
   Shared by the customer menu (menu17.js) and the staff Menu design screen. Data only. */
(function () {
'use strict';
const T = (id, name, dark, bg, card, ink, sub, line, soft, accent, onAccent, head, body, radius, extra = {}) =>
  ({ id, name, dark, bg, card, ink, sub, line, soft, accent, onAccent, head, body, radius, ...extra });
const THEMES = [
  T('tomato', 'Tomato', 0, '#ffffff', '#ffffff', '#1c1c1c', '#696969', '#ececec', '#f4f4f4', '#e23744', '#ffffff', 'Inter', 'Inter', 16),
  T('saffron', 'Saffron', 0, '#ffffff', '#ffffff', '#1f1f1f', '#686b78', '#e9e9eb', '#f2f2f3', '#fc8019', '#ffffff', 'Plus Jakarta Sans', 'Plus Jakarta Sans', 16),
  T('basil', 'Basil', 0, '#fbfdfb', '#ffffff', '#14231b', '#5e6b63', '#e3ece6', '#eef5f0', '#1a9c5b', '#ffffff', 'Manrope', 'Manrope', 16),
  T('ocean', 'Ocean', 0, '#f7fafd', '#ffffff', '#0f1d2c', '#5b6b7c', '#e1e8f0', '#edf2f8', '#0e74d8', '#ffffff', 'Sora', 'Inter', 14),
  T('berry', 'Berry', 0, '#fff8fb', '#ffffff', '#2a0f1d', '#7a5a68', '#f3e1ea', '#fbeef4', '#c2185b', '#ffffff', 'Poppins', 'Poppins', 18),
  T('grape', 'Grape', 0, '#faf8ff', '#ffffff', '#1d1430', '#6b6080', '#e8e2f5', '#f1edfb', '#6d28d9', '#ffffff', 'Outfit', 'Outfit', 18),
  T('cocoa', 'Cocoa', 0, '#fbf7f2', '#fffdfa', '#2b1d14', '#7a6656', '#ece2d6', '#f4ece2', '#7b4b2a', '#ffffff', 'Lora', 'Manrope', 14),
  T('butter', 'Butter', 0, '#fffbea', '#ffffff', '#2a2210', '#776c4f', '#f1e8c7', '#fbf3d5', '#d97706', '#ffffff', 'Fredoka', 'Nunito', 20),
  T('mint', 'Mint', 0, '#f2fbf7', '#ffffff', '#0f2a20', '#567066', '#d9efe5', '#e6f6ef', '#0f9d76', '#ffffff', 'Outfit', 'Inter', 18),
  T('sky', 'Sky', 0, '#f3f8ff', '#ffffff', '#0d1b33', '#56657f', '#dbe6f7', '#e8f0fd', '#2563eb', '#ffffff', 'Plus Jakarta Sans', 'Inter', 16),
  T('blush', 'Blush', 0, '#fff5f5', '#ffffff', '#2d1215', '#7d5f62', '#f6dfe1', '#fdeced', '#e11d48', '#ffffff', 'DM Serif Display', 'Inter', 18),
  T('lavender', 'Lavender', 0, '#f7f5ff', '#ffffff', '#1c1733', '#68628a', '#e4e0f7', '#efecfd', '#7c3aed', '#ffffff', 'Sora', 'Manrope', 20),
  T('sand', 'Sand', 0, '#faf6ef', '#fffdf8', '#2b241a', '#7a6e5c', '#ebe2d2', '#f3ecdf', '#b45309', '#ffffff', 'Fraunces', 'Manrope', 14),
  T('paper', 'Paper menu', 0, '#f7f4ee', '#fbf9f5', '#1f1d1a', '#6e675d', '#ddd5c7', '#efe9de', '#8b1e1e', '#ffffff', 'Playfair Display', 'Lora', 6),
  T('clay', 'Clay', 0, '#fdf6f0', '#ffffff', '#2e1a10', '#7c6255', '#f1e0d3', '#f8ebe1', '#c2410c', '#ffffff', 'Bricolage Grotesque', 'Manrope', 16),
  T('olive', 'Olive', 0, '#f9faf2', '#ffffff', '#1f2410', '#676d55', '#e5e8d4', '#eff1e3', '#4d7c0f', '#ffffff', 'Fraunces', 'Inter', 14),
  T('teal', 'Teal', 0, '#f2fbfa', '#ffffff', '#0b2523', '#55706d', '#d6ece9', '#e4f4f2', '#0f766e', '#ffffff', 'Manrope', 'Manrope', 16),
  T('coral', 'Coral', 0, '#fff7f5', '#ffffff', '#2d1410', '#7e6159', '#f6e0da', '#fdece7', '#f2543d', '#ffffff', 'Poppins', 'Inter', 18),
  T('citrus', 'Citrus', 0, '#fbfdf2', '#ffffff', '#1c230c', '#646c50', '#e6ecd0', '#f1f5de', '#65a30d', '#ffffff', 'Outfit', 'Outfit', 18),
  T('slate', 'Slate', 0, '#f5f7fa', '#ffffff', '#111827', '#5f6b7a', '#e3e7ed', '#eef1f5', '#334155', '#ffffff', 'Inter', 'Inter', 12),
  T('mono', 'Black & white', 0, '#ffffff', '#ffffff', '#0a0a0a', '#5c5c5c', '#e6e6e6', '#f2f2f2', '#0a0a0a', '#ffffff', 'Space Grotesk', 'Space Grotesk', 4),
  T('candy', 'Candy', 0, '#fff0f7', '#ffffff', '#2e0f20', '#80607a', '#f8d9ea', '#fde6f2', '#ec4899', '#ffffff', 'Fredoka', 'Nunito', 24),
  T('matcha', 'Matcha', 0, '#f4f7ee', '#fdfef9', '#1b2412', '#646d58', '#e1e8d4', '#ebf0e0', '#5a7d2a', '#ffffff', 'Outfit', 'Manrope', 16),
  T('royal', 'Royal', 0, '#f8f6f1', '#fffdf9', '#14182b', '#626578', '#e6e0d2', '#f0ece2', '#1e3a8a', '#ffffff', 'Playfair Display', 'Manrope', 10, { tag: '#a07a1f' }),
  T('peach', 'Peach', 0, '#fff4ec', '#ffffff', '#2f1a0e', '#806554', '#f6e0cf', '#fdebdd', '#ea580c', '#ffffff', 'Poppins', 'Poppins', 20),
  T('banana', 'Banana leaf', 0, '#f6fbf3', '#ffffff', '#10230f', '#5b6c59', '#dcebd6', '#e9f4e5', '#166534', '#ffffff', 'Fraunces', 'Nunito', 16, { tag: '#b8860b' }),
  T('midnight', 'Midnight', 1, '#0f1115', '#181b21', '#f3f4f6', '#a0a6b1', '#2a2e36', '#20242b', '#ef4f5f', '#ffffff', 'Inter', 'Inter', 16),
  T('noir', 'Charcoal gold', 1, '#121212', '#1c1c1c', '#f5f1e8', '#b3aa98', '#2e2b26', '#24221e', '#d4a64a', '#1a1408', 'Playfair Display', 'Manrope', 12),
  T('neon', 'Neon', 1, '#0b0b14', '#14142a', '#eef0ff', '#9da0c4', '#272849', '#1b1c38', '#22d3ee', '#04161b', 'Space Grotesk', 'Space Grotesk', 14),
  T('forest', 'Forest night', 1, '#0f1a14', '#16241c', '#ecf5ef', '#9cb2a5', '#24382c', '#1c2e24', '#34d399', '#052016', 'Fraunces', 'Inter', 16),
  T('espresso', 'Espresso', 1, '#1b1410', '#251b15', '#f6ede4', '#bba795', '#3a2c22', '#2f231b', '#e0a96d', '#22160c', 'Fraunces', 'Manrope', 14),
  T('wine', 'Wine', 1, '#1a0f14', '#26151d', '#f9eaf0', '#c19aac', '#3d2230', '#311b26', '#f0457f', '#ffffff', 'DM Serif Display', 'Inter', 14),
  T('chalk', 'Chalkboard', 1, '#1f2a24', '#26332c', '#f1f5f2', '#b5c4ba', '#3a4a41', '#2f3d35', '#fbbf24', '#1f1606', 'Caveat', 'Nunito', 10),
  T('inkblue', 'Ink blue', 1, '#0b1324', '#121c33', '#eaf0ff', '#9aa8c7', '#24304d', '#1a2540', '#60a5fa', '#06142b', 'Sora', 'Inter', 16),
  T('amber', 'Amber night', 1, '#17120a', '#211a0f', '#fbf3e3', '#c2b08f', '#3a2e19', '#2c2314', '#f59e0b', '#1d1302', 'Bricolage Grotesque', 'Manrope', 16),
  T('plum', 'Plum', 1, '#160f1f', '#21162e', '#f4ecff', '#b3a2c8', '#372650', '#2a1d3d', '#c084fc', '#1c0b2e', 'Outfit', 'Outfit', 20),
  T('smoke', 'Smokehouse', 1, '#1a1b1e', '#232428', '#f4f4f5', '#a7a8ae', '#36373d', '#2b2c31', '#f97316', '#ffffff', 'Oswald', 'Inter', 8),
  T('lagoon', 'Lagoon', 1, '#071a1f', '#0d252c', '#e6fbf8', '#93b9b4', '#1a3a40', '#123037', '#2dd4bf', '#03201c', 'Manrope', 'Manrope', 18),
  T('onyx', 'Onyx', 1, '#000000', '#0f0f0f', '#ffffff', '#a3a3a3', '#262626', '#1a1a1a', '#ffffff', '#000000', 'Space Grotesk', 'Inter', 6),
  T('crimson', 'Crimson', 1, '#140b0b', '#1f1212', '#fbecec', '#c4a0a0', '#3b2222', '#2e1919', '#ef4444', '#ffffff', 'Oswald', 'Inter', 10)
];

/* Layout parts: hero, info, nav, group, item, cols. Each architecture is a full combination. */
const A = (id, name, note, hero, info, nav, group, item, cols = 1, extra = {}) => ({ id, name, note, hero, info, nav, group, item, cols, ...extra });
const ARCHS = [
  A('classic', 'Classic feed', 'Photo slider, info card, folding categories, dish rows with photo on the right.', 'carousel', 'sheet', 'pill', 'accordion', 'row'),
  A('swift', 'Swift', 'Banner on top, sticky category tabs, dish rows.', 'banner', 'inline', 'chips', 'sections', 'row'),
  A('photoleft', 'Photo left', 'Dish photo on the left, details on the right.', 'carousel', 'sheet', 'chips', 'sections', 'rowLeft'),
  A('grid', 'Grid cards', 'Two dishes per row with big photos.', 'banner', 'inline', 'chips', 'sections', 'card', 2),
  A('bigphoto', 'Big pictures', 'One large photo card per dish.', 'carousel', 'sheet', 'chips', 'sections', 'wide'),
  A('printed', 'Printed menu', 'Text-only menu with dotted price lines, like a paper menu.', 'cover', 'none', 'pill', 'sections', 'text', 1, { center: true }),
  A('tabs', 'One category at a time', 'Tabs at the top show one category at a time.', 'compact', 'inline', 'tabs', 'tabs', 'row'),
  A('rail', 'Side rail', 'Categories down the left side, dishes on the right.', 'compact', 'inline', 'rail', 'sections', 'thumb'),
  A('shelves', 'Shelves', 'Each category is a row you swipe sideways.', 'carousel', 'sheet', 'pill', 'shelves', 'card'),
  A('tiles', 'Category tiles', 'Picture tiles for categories, tap one to see its dishes.', 'banner', 'inline', 'tiles', 'tabs', 'row'),
  A('magazine', 'Magazine', 'Full-width food photos with the name on the picture.', 'cover', 'sheet', 'chips', 'sections', 'story'),
  A('bento', 'Bento', 'First dish of each category big, the rest in a grid.', 'split', 'inline', 'chips', 'sections', 'bento', 2),
  A('quick', 'Quick order', 'No banner, compact rows, fastest to order.', 'none', 'inline', 'chips', 'sections', 'text'),
  A('thumbs', 'Round thumbnails', 'Small round photos, slim rows.', 'banner', 'inline', 'chips', 'sections', 'thumb'),
  A('spotlight', 'Spotlight', 'Best sellers slider on top, then dish rows.', 'carousel', 'sheet', 'chips', 'sections', 'row', 1, { spot: true }),
  A('split', 'Split hero', 'Words and photo side by side, two-column cards.', 'split', 'inline', 'chips', 'sections', 'card', 2),
  A('book', 'Menu book', 'Every category folded; open the one you want.', 'cover', 'sheet', 'pill', 'accordion', 'rowLeft', 1, { folded: true }),
  A('minitiles', 'Mini tiles', 'Three small tiles per row.', 'compact', 'inline', 'chips', 'sections', 'tile', 3),
  A('gallery', 'Gallery', 'Photo-first cards in two columns.', 'carousel', 'sheet', 'chips', 'sections', 'gallery', 2),
  A('fine', 'Fine dining', 'Centred, elegant, descriptions first.', 'cover', 'none', 'chips', 'sections', 'fine', 1, { center: true })
];
const PARTS = {
  hero: [['carousel', 'Photo slider'], ['banner', 'Rounded banner'], ['split', 'Words + photo'], ['cover', 'Tall cover'], ['compact', 'Name bar'], ['none', 'No banner']],
  info: [['sheet', 'Card over the photo'], ['inline', 'Simple card'], ['none', 'Hidden']],
  nav: [['pill', 'Floating Menu button'], ['chips', 'Sticky category tabs'], ['rail', 'Side rail'], ['tiles', 'Category tiles'], ['tabs', 'Tabs (one at a time)']],
  group: [['sections', 'All categories'], ['accordion', 'Folding categories'], ['shelves', 'Swipe rows'], ['tabs', 'One category at a time']],
  item: [['row', 'Row, photo right'], ['rowLeft', 'Row, photo left'], ['card', 'Card'], ['wide', 'Big photo'], ['text', 'Text only'], ['tile', 'Small tile'], ['story', 'Photo with name on it'], ['thumb', 'Round thumbnail'], ['bento', 'Bento'], ['gallery', 'Gallery'], ['fine', 'Fine dining']],
  cols: [['1', '1 column'], ['2', '2 columns'], ['3', '3 columns']]
};
const FONTS = {
  'Inter': 'Inter:wght@400;500;600;700;800', 'Plus Jakarta Sans': 'Plus+Jakarta+Sans:wght@400;500;600;700;800', 'Manrope': 'Manrope:wght@400;500;600;700;800',
  'Sora': 'Sora:wght@400;500;600;700', 'Poppins': 'Poppins:wght@400;500;600;700;800', 'Outfit': 'Outfit:wght@400;500;600;700;800', 'Lora': 'Lora:wght@400;500;600;700',
  'Fredoka': 'Fredoka:wght@400;500;600;700', 'Nunito': 'Nunito:wght@400;600;700;800', 'DM Serif Display': 'DM+Serif+Display', 'Fraunces': 'Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700',
  'Playfair Display': 'Playfair+Display:wght@500;600;700;800', 'Bricolage Grotesque': 'Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700;12..96,800',
  'Space Grotesk': 'Space+Grotesk:wght@400;500;600;700', 'Caveat': 'Caveat:wght@600;700', 'Oswald': 'Oswald:wght@500;600;700'
};
const TEXTS = [
  ['Dishes', [
    ['add', 'ADD'], ['customisable', 'customisable'], ['more', 'more'], ['soldOut', 'Sold out'], ['onlyLeft', 'Only {n} left'], ['from', 'from'],
    ['bestseller', 'Bestseller'], ['recommended', 'Chef’s special'], ['dishes', '{n} dishes'], ['oneDish', '1 dish']]],
  ['Top of the menu', [
    ['search', 'Search for dishes'], ['table', 'Table'], ['tagline', ''], ['location', ''], ['time', ''], ['chip', ''], ['rating', ''], ['ratingCount', ''],
    ['aboutTitle', 'About us'], ['about', '']]],
  ['Filters & categories', [
    ['filters', 'Filters'], ['veg', 'Veg'], ['nonveg', 'Non-veg'], ['saved', 'Saved'], ['menuPill', 'Menu'], ['menuTitle', 'Menu'], ['spotTitle', 'Best sellers'],
    ['sortTitle', 'Sort by'], ['sortDefault', 'Recommended'], ['sortLow', 'Price: low to high'], ['sortHigh', 'Price: high to low'], ['apply', 'Apply'], ['clear', 'Clear all'],
    ['results', 'Results for “{q}”'], ['noResults', 'No dishes match your filters.']]],
  ['Dish details', [
    ['quantity', 'Quantity'], ['required', 'Required'], ['selectOne', 'Select any 1 option'], ['cookingTitle', 'Add a cooking request (optional)'],
    ['cookingHint', 'We’ll try our best to follow your request.'], ['cookingPlaceholder', 'e.g. Don’t make it too spicy'], ['addItem', 'Add item'], ['save', 'Save'], ['share', 'Share']]],
  ['Buttons & cart', [
    ['callWaiter', 'Call waiter'], ['requestSong', 'Request song'], ['viewCart', 'View cart'], ['itemAdded', '{n} item added'], ['itemsAdded', '{n} items added'], ['yourOrders', 'Your orders']]],
  ['Offers', [
    ['offersLine', 'Get up to {amount} off'], ['offersCount', '{n} offers'], ['offerCount1', '1 offer'], ['offersTitle', 'Offers for you'],
    ['instaTitle', 'Follow us on Instagram'], ['instaSub', 'Follow {handle} and get {amount} off this order.'], ['instaBtn', 'Follow'], ['instaConfirm', 'I followed {handle}'],
    ['reviewTitle', 'Rate us 5★ on Google'], ['reviewSub', 'Post a 5-star Google review and get {amount} off this order.'], ['reviewBtn', 'Write review'], ['reviewConfirm', 'I posted my 5-star review'],
    ['applyOffer', 'Apply'], ['applied', 'Applied'], ['remove', 'Remove'], ['offerDiscount', 'Offer discount'], ['offerOne', 'One offer per order.'], ['offerBoth', 'You can use both offers together.'],
    ['offerCheck', 'Please show it to the staff when your food is served.'], ['offerMin', 'Order {amount} or more to use this offer.'], ['offerUsed', 'Offer already used on this phone today.']]]
];
const TEXT_DEFAULTS = Object.fromEntries(TEXTS.flatMap(([, rows]) => rows));
const TEXT_LABELS = {
  add: 'Add button', customisable: 'Under the add button for dishes with portions', more: 'Read more link', soldOut: 'Sold out', onlyLeft: 'Low stock ({n} = number left)', from: 'Before the lowest portion price',
  bestseller: 'Best seller tag', recommended: 'Recommended tag', dishes: 'Dish count ({n})', oneDish: 'Dish count for one',
  search: 'Search box', table: 'Table word', tagline: 'Line under the name', location: 'Address / area line', time: 'Timing line (e.g. Serving in 15–20 min)', chip: 'Small badge (e.g. Pure veg kitchen)',
  rating: 'Rating number (e.g. 4.4)', ratingCount: 'Ratings count (e.g. 1.2K+ ratings)', aboutTitle: 'Info sheet title', about: 'Info sheet words (opening hours, address, phone…)',
  filters: 'Filters button', veg: 'Veg filter', nonveg: 'Non-veg filter', saved: 'Saved dishes filter', menuPill: 'Floating menu button', menuTitle: 'Category list title', spotTitle: 'Best sellers slider title',
  sortTitle: 'Sort title', sortDefault: 'Default order', sortLow: 'Low to high', sortHigh: 'High to low', apply: 'Apply button', clear: 'Clear button', results: 'Search title ({q})', noResults: 'Nothing found',
  quantity: 'Portion card title', required: 'Required tag', selectOne: 'Portion hint', cookingTitle: 'Cooking request title', cookingHint: 'Cooking request hint', cookingPlaceholder: 'Cooking request example',
  addItem: 'Add item button', save: 'Save (bookmark)', share: 'Share',
  callWaiter: 'Call waiter button', requestSong: 'Request song button', viewCart: 'Cart bar button', itemAdded: 'Cart bar, one item', itemsAdded: 'Cart bar, many items ({n})', yourOrders: 'Your orders',
  offersLine: 'Offer strip ({amount})', offersCount: 'Offer count ({n})', offerCount1: 'Offer count for one', offersTitle: 'Offers sheet title',
  instaTitle: 'Instagram offer title', instaSub: 'Instagram offer words ({handle}, {amount})', instaBtn: 'Instagram button', instaConfirm: 'Instagram tick box ({handle})',
  reviewTitle: 'Google review offer title', reviewSub: 'Google review offer words ({amount})', reviewBtn: 'Google review button', reviewConfirm: 'Google review tick box',
  applyOffer: 'Apply offer', applied: 'Applied', remove: 'Remove offer', offerDiscount: 'Discount row on the bill', offerOne: 'Rule: one offer', offerBoth: 'Rule: both offers', offerCheck: 'Note about showing proof', offerMin: 'Order too small for the offer ({amount})', offerUsed: 'Already used'
};
const SHOW = [
  ['hero', 'Banner / photo slider', true], ['info', 'Restaurant info card', true], ['rating', 'Rating badge', true], ['offers', 'Offer strip and offers in the cart', true],
  ['search', 'Search', true], ['filters', 'Filter chips (Veg, Non-veg…)', true], ['menuPill', 'Floating Menu button', true], ['photos', 'Dish photos', true],
  ['desc', 'Dish descriptions', true], ['tags', 'Best seller / recommended tags', true], ['vegMark', 'Veg / non-veg mark', true], ['bookmark', 'Save (bookmark) button', true],
  ['share', 'Share button', true], ['customisable', '“customisable” under ADD', true], ['cooking', 'Cooking request in dish details', true], ['counts', 'Dish count next to categories', true],
  ['catPhotos', 'Category photos', true], ['waiter', 'Call waiter button', true], ['song', 'Request song button', true], ['orders', 'Your orders button', true]
];
const SHOW_DEFAULTS = Object.fromEntries(SHOW.map(([k, , v]) => [k, v]));
const OFFER_DEFAULTS = { mode: 'one', insta: { on: false, handle: '', amount: 20 }, review: { on: false, url: '', amount: 50 } };
function offers(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const amt = (v, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 1 && n <= 10000 ? n : d; };
  const handle = String(o.insta?.handle || '').trim().replace(/^@+/, '').replace(/[^A-Za-z0-9._]/g, '').slice(0, 30);
  let url = String(o.review?.url || '').trim(); try { const u = new URL(url); if (u.protocol !== 'https:') url = ''; } catch { url = ''; }
  return { mode: o.mode === 'both' ? 'both' : 'one',
    insta: { on: o.insta?.on === true && !!handle, handle, amount: amt(o.insta?.amount, 20) },
    review: { on: o.review?.on === true && !!url, url, amount: amt(o.review?.amount, 50) } };
}
window.M17Data = Object.freeze({ THEMES, ARCHS, PARTS, FONTS, TEXTS, TEXT_DEFAULTS, TEXT_LABELS, SHOW, SHOW_DEFAULTS, OFFER_DEFAULTS, offers });
})();

/* js/restaurant.js?v=19 */
;/* Restaurant screens built from the billing design system. Same RPC contracts as the proven restaurant tools. */
'use strict';
const RX = (() => {
  const rpc = (name, args = {}) => RestaurantCloud.rpc(name, args, true);
  const role = () => Store.me?.native_role || 'manager';
  const isAdmin = () => role() === 'admin';
  const table = t => t === 'COUNTER' ? 'Counter' : RestaurantCloud.tableName(t);
  const orderNo = o => RestaurantCloud.orderLabel(o);
  const when = iso => iso ? Fmt.dateTime(iso) : '—';
  /* One timer per screen; pauses while the app is in the background, never piles up. */
  function poll(ms, work) {
    let timer = null, stopped = false;
    const run = async () => { if (stopped) return; if (!document.hidden) { try { await work(); } catch { /* the next run retries */ } } if (!stopped) timer = setTimeout(run, ms); };
    const wake = () => { if (!document.hidden && !stopped) { clearTimeout(timer); run(); } };
    document.addEventListener('visibilitychange', wake);
    timer = setTimeout(run, ms);
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener('visibilitychange', wake); };
  }
  const pager = (offset, shown, total, noun) => `<div class="pager"><button type="button" class="btn btn-sm" data-page="-1" ${offset ? '' : 'disabled'}>Previous</button><span>${total ? `${offset + 1}–${offset + shown} of ${total}` : `0 ${noun}`}</span><button type="button" class="btn btn-sm" data-page="1" ${offset + shown < total ? '' : 'disabled'}>Next</button></div>`;
  const statusBadge = s => `<span class="badge ${({ Pending: 'badge-amber', Accepted: 'badge-soft', Cooking: 'badge-soft', Ready: 'badge-soft', Served: 'badge-green', Paid: 'badge-green', Handled: 'badge-green', Cancelled: 'badge-red', Rejected: 'badge-red', Expired: '' })[s] || ''}">${esc(s)}</span>`;
  function deviceLabel(info) {
    const ua = info?.user_agent || '', browser = /Edg/i.test(ua) ? 'Edge' : /Firefox|FxiOS/i.test(ua) ? 'Firefox' : /Chrome|CriOS/i.test(ua) ? 'Chrome' : /Safari/i.test(ua) ? 'Safari' : 'Browser';
    const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows' : /Mac OS/i.test(ua) ? 'macOS' : info?.platform || 'Unknown platform';
    return browser + ' · ' + os;
  }
  function download(name, text, type) { downloadFile(name, text, type); }
  async function copy(text, done = 'Copied.') { try { await navigator.clipboard.writeText(text); toast(done, 'ok'); } catch { toast('Copy this: ' + text, 'info', 8000); } }
  const head = (title, sub, actions = '') => `<header class="page-head"><div><h1>${esc(title)}</h1><p class="sub">${sub}</p></div>${actions ? `<div class="head-actions">${actions}</div>` : ''}</header>`;
  const sum = (label, value, cls = '', small = '') => `<div class="sum ${cls}"><span>${esc(label)}</span><b>${value}</b>${small ? `<small>${small}</small>` : ''}</div>`;
  return { rpc, role, isAdmin, table, orderNo, when, poll, pager, statusBadge, deviceLabel, download, copy, head, sum };
})();

/* ---------------- Kitchen orders ---------------- */
const Kitchen = (() => {
  const OPEN = ['Pending', 'Accepted', 'Cooking', 'Ready'];
  const NEXT = { Pending: 'Cooking', Cooking: 'Served', Ready: 'Served' };
  let root = null, orders = [], filter = 'active', busyIds = new Set(), devices = new Map(), cancelled = null, cOffset = 0, perms = {}, stop = null, error = '', loaded = false, req = 0, clockDelta = 0;
  const canBlock = () => RX.isAdmin() || perms.order_device_block === true;
  const cancelledRows = () => (cancelled?.records || []).filter(o => !o.cancelled_expires_at || Date.parse(o.cancelled_expires_at) > Date.now() + clockDelta);

  async function loadDevices() {
    if (!canBlock()) { devices.clear(); return; }
    const ids = [...new Set([...orders, ...(cancelled?.records || [])].map(o => o.id))].slice(0, 1000);
    if (!ids.length) { devices.clear(); return; }
    try { const d = await RX.rpc('restaurant_order_devices', { p_ids: ids }); devices = new Map((Array.isArray(d) ? d : []).map(x => [x.order_id, x])); } catch { devices.clear(); }
  }
  async function loadCancelled() {
    const d = await RX.rpc('restaurant_recent_cancelled', { p_offset: cOffset, p_limit: 50 });
    if (d.server_now) clockDelta = Date.parse(d.server_now) - Date.now();
    if (cOffset > 0 && !d.records?.length) { cOffset = Math.max(0, Math.floor(Math.max(0, d.total - 1) / 50) * 50); return loadCancelled(); }
    cancelled = d;
  }
  async function refresh(full = false) {
    const id = ++req;
    try {
      if (full) { try { perms = await RX.rpc('restaurant_manager_permissions', {}); } catch { perms = {}; } }
      await RestaurantCloud.refreshTableNames({ staff: true }).catch(() => {});
      const rows = await RestaurantCloud.orders();
      if (filter === 'Cancelled') await loadCancelled();
      if (id !== req) return;
      orders = rows; loaded = true; error = '';
      await loadDevices();
    } catch (e) { if (id === req) error = 'Orders could not refresh: ' + e.message; }
    if (id === req) render();
  }

  const OFFER_NAMES = { insta: 'Instagram follow', review: 'Google 5★ review' };
  const offerOf = o => {
    const d = Number(o.discount_amount) || 0; if (d <= 0) return null;
    const list = Array.isArray(o.offers) ? o.offers : (() => { try { return JSON.parse(o.offers || '[]'); } catch { return []; } })();
    return { amount: d, names: list.map(k => OFFER_NAMES[k] || k).join(' + ') || 'Customer offer' };
  };
  const noteText = o => String(o.kitchen_notes || '').split('\n').filter(l => !(offerOf(o) && /^Offer: /.test(l))).join('\n').trim();
  function offerHtml(o, busy) {
    const of = offerOf(o); if (!of) return '';
    const canRemove = !['Cancelled', 'Rejected'].includes(o.status);
    return `<div class="ocard-offer">${Icon('tag')}<span><b>Offer −${Fmt.money(of.amount)}</b><small>${esc(of.names)} · check the customer’s phone before serving</small></span>${canRemove ? `<button type="button" class="btn btn-sm btn-danger-ghost" data-offer-remove ${busy ? 'disabled' : ''}>Remove</button>` : ''}</div>`;
  }
  async function removeOffer(o) {
    const of = offerOf(o); if (!of) return;
    if (!(await ask({ title: 'Remove the offer?', body: `${esc(RX.table(o.table_number))} · ${esc(of.names)}. The order goes back to the full price (${Fmt.money(Number(o.total) + of.amount)}). Use this when the customer did not follow or review.`, confirm: 'Remove offer', danger: true }))) return;
    busyIds.add(o.id); render();
    try { await RX.rpc('restaurant_order_offer17', { p_order: o.id, p_action: 'remove' }); RestaurantCloud.invalidateOrders(); toast('Offer removed. The order is back to full price.', 'ok'); }
    catch (e) { toast(/restaurant_order_offer17|PGRST202|schema cache|Could not find/i.test(e.message) ? 'Run SUPABASE/MENU-OFFERS-v18.sql once in Supabase to manage offers.' : e.message, 'error', 7000); }
    finally { busyIds.delete(o.id); await refresh(true); }
  }

  function card(o) {
    const busy = busyIds.has(o.id), next = NEXT[o.status], dev = devices.get(o.id);
    const actions = busy ? '<button type="button" class="btn btn-sm" disabled>Saving…</button>' :
      (next ? `<button type="button" class="btn btn-primary" data-next="${next}">${o.status === 'Pending' ? `${Icon('check')} Accept order` : `${Icon('check')} Mark served`}</button>` : '') +
      (o.status === 'Pending' ? '<button type="button" class="btn btn-danger-ghost" data-next="Rejected">Reject</button>' : '') +
      `<button type="button" class="btn" data-bill>${Icon('bill')} Bill</button>`;
    const device = canBlock() && dev?.device_id ? `<p class="ocard-dev">${Icon('users')}<span>Customer browser <span class="mono">${esc(dev.device_id.slice(0, 8))}</span>${dev.blocked ? ' · <b class="neg">blocked</b>' : ''}</span><button type="button" class="btn btn-sm ${dev.blocked ? '' : 'btn-danger-ghost'}" data-device="${dev.blocked ? 'false' : 'true'}" ${busy ? 'disabled' : ''}>${dev.blocked ? 'Unblock' : 'Block'}</button></p>` : '';
    const state = o.status === 'Pending' ? 'Waiting for acceptance' : o.status === 'Cancelled' || o.status === 'Rejected' ? `${o.status} ${Fmt.time(o.cancelled_at || o.updated_at || o.created_at)}${o.cancelled_expires_at ? ` · leaves this view at ${Fmt.time(o.cancelled_expires_at)}` : ''}` : o.cooking_started_at ? 'Cooking since ' + Fmt.time(o.cooking_started_at) : o.status;
    return `<article class="ocard st-${esc(String(o.status).toLowerCase())}" data-id="${esc(o.id)}">
      <header class="ocard-head"><div><b>${esc(RX.table(o.table_number))}</b><small>${esc(RX.orderNo(o))} · ${esc(Fmt.time(o.created_at))}</small></div>${RX.statusBadge(o.status)}</header>
      <div class="ocard-body">
        <p class="ocard-guest">${Icon('user')} ${esc(o.customer_name || 'Guest')}</p>
        <ul class="ocard-items">${(o.items || []).map(i => `<li><span><b class="ocard-qty">${Number(i.qty)}×</b> ${esc(i.name)}</span><span class="num">${Fmt.money(i.subtotal ?? Number(i.qty) * Number(i.price))}</span></li>`).join('')}</ul>
        ${offerHtml(o, busy)}${noteText(o) ? `<p class="ocard-note">${Icon('edit')} ${esc(noteText(o))}</p>` : ''}
        ${o.rejection_reason ? `<p class="hint">Reason: ${esc(o.rejection_reason)}</p>` : ''}
        <p class="hint">${esc(state)}</p>${device}
      </div>
      <footer class="ocard-foot"><div class="ocard-total"><span>Total${offerOf(o) ? ` <s>${Fmt.money(Number(o.total) + offerOf(o).amount)}</s>` : ''}</span><b>${Fmt.money(o.total)}</b></div><div class="toolbar">${actions}</div></footer>
    </article>`;
  }

  function render() {
    if (!root?.isConnected) return;
    const open = orders.filter(o => OPEN.includes(o.status));
    const pending = open.filter(o => o.status === 'Pending'), cooking = open.filter(o => o.status !== 'Pending');
    $('#kSummary', root).innerHTML = RX.sum('Waiting to accept', pending.length, pending.length ? 'is-warn' : '') + RX.sum('In the kitchen', cooking.length) + RX.sum('Open orders value', Fmt.money(open.reduce((n, o) => n + Number(o.total || 0), 0)), 'big') + RX.sum('Served recently', orders.filter(o => o.status === 'Served').length);
    $$('#kFilter button', root).forEach(b => { b.classList.toggle('on', b.dataset.f === filter); const c = b.querySelector('span'); if (c) c.textContent = b.dataset.f === 'active' ? open.length : b.dataset.f === 'Pending' ? pending.length : b.dataset.f === 'Cooking' ? cooking.length : ''; });
    const list = filter === 'Cancelled' ? cancelledRows() : filter === 'active' ? open : filter === 'Cooking' ? cooking : pending;
    $('#kStatus', root).textContent = error || (!loaded ? 'Loading orders…' : filter === 'Cancelled' ? 'Cancelled and rejected orders stay here for a few hours. Full history is in Records.' : `Live · updated ${Fmt.time(new Date().toISOString())}`);
    $('#kList', root).innerHTML = list.length ? list.map(card).join('') : loaded ? `<div class="empty"><h3>${filter === 'Cancelled' ? 'No cancelled orders' : 'No orders here'}</h3><p>${filter === 'Cancelled' ? 'Nothing was cancelled or rejected recently.' : 'New customer orders appear here automatically.'}</p></div>` : '';
    $('#kPager', root).innerHTML = filter === 'Cancelled' && cancelled ? RX.pager(cOffset, cancelledRows().length, cancelled.total || 0, 'cancelled orders') : '';
  }

  async function setStatus(o, next, btn) {
    let reason = '';
    if (next === 'Rejected') { reason = await ask({ title: `Reject ${RX.orderNo(o).toLowerCase()}?`, body: `${esc(RX.table(o.table_number))} · ${Fmt.money(o.total)}. The customer sees the reason.`, confirm: 'Reject order', cancel: 'Keep order', danger: true, input: { label: 'Reason shown to the customer', value: 'Items unavailable', required: true, maxlength: 200 } }); if (reason === null) return; }
    if (busyIds.has(o.id)) return; busyIds.add(o.id); render();
    try {
      const saved = await RX.rpc('restaurant_staff_status', { p_id: o.id, p_expected: o.status, p_next: next, p_reason: reason });
      RestaurantCloud.invalidateOrders(); RestaurantWorkspace.command('refresh');
      toast(`${RX.orderNo(o)} ${String(saved?.status || next).toLowerCase()}.`, 'ok');
    } catch (e) { toast(/This status change is not allowed/.test(e.message) ? 'The order changed on another screen. It has been refreshed.' : e.message, 'error', 6000); }
    finally { busyIds.delete(o.id); await refresh(); }
  }

  async function setDevice(o, block) {
    if (block && !(await ask({ title: 'Block this customer browser?', body: 'It can no longer open the menu, order or call a waiter. This order is not cancelled.', confirm: 'Block device', danger: true }))) return;
    busyIds.add(o.id); render();
    try { await RX.rpc('restaurant_order_devices', { p_action: 'set_blocked', p_order: o.id, p_blocked: block }); toast(block ? 'Customer browser blocked. The order is unchanged.' : 'Customer browser unblocked.', 'ok'); }
    catch (e) { toast(e.message, 'error', 6000); } finally { busyIds.delete(o.id); await loadDevices(); render(); }
  }

  async function callWaiter() {
    let tables = [];
    try { tables = await RX.rpc('restaurant_manage_tables', { p_action: 'list', p_table: null, p_status: null }); RestaurantCloud.setTableNames(tables); } catch (e) { return toast(e.message, 'error'); }
    const d = modal('Call a waiter', `<form class="stack" id="cwForm"><p class="hint">Sends a waiter request that shows on the waiter app and in Requests.</p>
      <label class="field"><span>Where</span><select name="table"><option value="COUNTER">Counter</option>${tables.map(t => `<option value="${esc(t.table_number)}">${esc(RX.table(t.table_number))}</option>`).join('')}</select></label>
      <p class="form-error" role="alert" hidden></p>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary">${Icon('bell')} Call waiter</button></div></form>`, { size: 'modal-sm' });
    let attempt = null;
    $('#cwForm', d).onsubmit = async e => {
      e.preventDefault(); const t = e.target.table.value, btn = e.submitter, err = $('.form-error', d); err.hidden = true; busy(btn, true, 'Calling…');
      try { if (attempt?.table !== t) attempt = { id: crypto.randomUUID(), table: t }; await RX.rpc('restaurant_staff_call', { p_request_id: attempt.id, p_table: t }); toast(t === 'COUNTER' ? 'Waiter requested at the counter.' : 'Waiter requested for ' + RX.table(t) + '.', 'ok'); d.close(); }
      catch (ex) { err.textContent = ex.message; err.hidden = false; } finally { busy(btn, false); }
    };
  }

  function mount(view) {
    root = view; loaded = false; error = '';
    view.innerHTML = `<div class="page rx">
      ${RX.head('Kitchen orders', 'New QR orders appear here automatically. Accept, cook and serve them in order.', `${RX.isAdmin() ? `<button type="button" class="btn" id="kOffers">${Icon('tag')} Offers</button>` : ''}<button type="button" class="btn" id="kCall">${Icon('bell')} Call waiter</button><button type="button" class="btn" id="kAlerts">${Icon('bell')} Alerts</button><button type="button" class="btn" id="kRefresh">${Icon('refresh')} Refresh</button>`)}
      <div class="summary" id="kSummary"></div>
      <div class="filters"><div class="seg seg-scroll" id="kFilter">${[['active', 'Open'], ['Pending', 'Pending'], ['Cooking', 'Cooking'], ['Cancelled', 'Cancelled']].map(([k, l]) => `<button type="button" data-f="${k}">${l} <span></span></button>`).join('')}</div></div>
      <p class="status-line" id="kStatus" role="status"></p>
      <div class="mgrid ogrid" id="kList"></div><div id="kPager"></div></div>`;
    $('#kFilter', view).onclick = async e => { const b = e.target.closest('[data-f]'); if (!b) return; filter = b.dataset.f; cOffset = 0; render(); if (filter === 'Cancelled') { await refresh(); } };
    $('#kRefresh', view).onclick = async e => { busy(e.currentTarget, true, 'Refreshing…'); RestaurantCloud.invalidateOrders(); await refresh(true); busy(e.currentTarget, false); };
    $('#kCall', view).onclick = callWaiter;
    const ko = $('#kOffers', view); if (ko) ko.onclick = () => MenuDesign.offersModal();
    $('#kAlerts', view).onclick = () => AlertsPanel.open();
    $('#kPager', view).onclick = e => { const b = e.target.closest('[data-page]'); if (!b) return; cOffset = Math.max(0, cOffset + Number(b.dataset.page) * 50); refresh(); };
    $('#kList', view).addEventListener('click', e => {
      const art = e.target.closest('[data-id]'); if (!art) return; const o = orders.find(x => x.id === art.dataset.id) || cancelled?.records?.find(x => x.id === art.dataset.id); if (!o) return;
      const n = e.target.closest('[data-next]'); if (n) return setStatus(o, n.dataset.next, n);
      if (e.target.closest('[data-bill]')) return Records.openBill(Cloud.orderToBill(o));
      const dv = e.target.closest('[data-device]'); if (dv) return setDevice(o, dv.dataset.device === 'true');
      if (e.target.closest('[data-offer-remove]')) return removeOffer(o);
    });
    render(); refresh(true);
    stop = RX.poll(4000, () => refresh());
  }
  return { mount, unmount() { stop?.(); stop = null; root = null; } };
})();

/* ---------------- Customer requests ---------------- */
const Requests = (() => {
  let root = null, filter = 'Pending', offset = 0, data = null, error = '', handling = new Set(), stop = null, req = 0;
  const KNOWN = { active: null, config: null, permissions: null, calls: null, stock_notices: null, security_notices: null };
  const title = c => c.request_kind === 'Reception' ? 'Counter' : RX.table(c.table_number);
  const what = c => c.request_kind === 'Reception' ? 'Waiter requested at the counter.' : c.request_kind === 'ReservedScan' ? 'Reserved table QR opened — please check seating.' : c.request_kind === 'Song' ? `Song requested: ${c.request_text || 'Untitled song'}` : c.request_origin === 'staff_dashboard' || c.request_origin === 'staff' ? 'Staff requested a waiter.' : c.request_kind && !['Waiter', 'Call'].includes(c.request_kind) ? `${c.request_kind} requested.` : 'Customer requested assistance.';
  async function load() {
    const id = ++req;
    try {
      let d;
      if (filter === 'Pending' && offset === 0) { const p = await RX.rpc('restaurant_staff_pulse47', { p_known: KNOWN }); const calls = Array.isArray(p.calls) ? p.calls : []; d = { calls, total: calls.length }; }
      else { d = await RX.rpc('restaurant_requests_page47', { p_key: null, p_status: filter, p_offset: offset, p_limit: 50 }); if (!Array.isArray(d.calls)) throw Error('Invalid request response.'); if (offset > 0 && !d.calls.length) { offset = Math.max(0, offset - 50); return load(); } }
      if (id !== req) return; data = d; error = '';
    } catch (e) { if (id === req) error = 'Requests could not update: ' + e.message; }
    if (id === req) render();
  }
  function render() {
    if (!root?.isConnected) return;
    $$('#qFilter button', root).forEach(b => b.classList.toggle('on', b.dataset.f === filter));
    const rows = data?.calls || [];
    $('#qStatus', root).textContent = error || (!data ? 'Loading requests…' : '');
    $('#qList', root).innerHTML = rows.length ? rows.map(c => `<article class="ocard st-${esc(String(c.status).toLowerCase())}" data-id="${esc(c.id)}">
      <header class="ocard-head"><div><b>${c.request_kind === 'Song' ? '🎵 ' : ''}${esc(title(c))}</b><small>${c.request_kind === 'ReservedScan' ? 'QR opened' : c.request_kind === 'Song' ? 'Requested' : 'Called'} ${esc(Fmt.dateTime(c.created_at))}</small></div>${RX.statusBadge(c.status)}</header>
      <div class="ocard-body"><p>${esc(what(c))}</p>${c.on_the_way_at && c.request_kind !== 'Song' ? `<p class="pos small">${Icon('check')} Waiter is on the way</p>` : ''}${c.handled_at ? `<p class="hint">Handled ${esc(Fmt.dateTime(c.handled_at))}</p>` : ''}</div>
      ${c.status === 'Pending' ? `<footer class="ocard-foot"><span></span><div class="toolbar">${!c.on_the_way_at && c.request_kind !== 'Song' ? `<button type="button" class="btn" data-onway ${handling.has(c.id) ? 'disabled' : ''}>On the way</button>` : ''}<button type="button" class="btn btn-primary" data-handle ${handling.has(c.id) ? 'disabled' : ''}>${handling.has(c.id) ? 'Saving…' : `${Icon('check')} Mark handled`}</button></div></footer>` : ''}
    </article>`).join('') : data ? `<div class="empty"><h3>No ${filter === 'All' ? '' : filter.toLowerCase() + ' '}requests</h3><p>${filter === 'Pending' ? 'Waiter calls from tables appear here automatically.' : 'Nothing in this view.'}</p></div>` : '';
    $('#qPager', root).innerHTML = data && !(filter === 'Pending' && offset === 0) ? RX.pager(offset, rows.length, data.total || 0, 'requests') : '';
  }
  async function act(c, onWay) {
    if (handling.has(c.id)) return; handling.add(c.id); render();
    try { await RX.rpc(onWay ? 'restaurant_waiter_on_way' : 'restaurant_handle_waiter_call', { p_key: null, p_id: c.id }); RestaurantWorkspace.command('refresh'); toast(onWay ? 'Marked on the way.' : 'Request handled.', 'ok'); }
    catch (e) { toast('Could not save: ' + e.message, 'error', 6000); } finally { handling.delete(c.id); await load(); }
  }
  function mount(view) {
    root = view; data = null; offset = 0;
    view.innerHTML = `<div class="page rx">${RX.head('Requests', 'Waiter calls, reserved-table scans and song requests from customers.', `<button type="button" class="btn" id="qAlerts">${Icon('bell')} Alerts</button><button type="button" class="btn" id="qRefresh">${Icon('refresh')} Refresh</button>`)}
      <div class="filters"><div class="seg seg-scroll" id="qFilter">${['Pending', 'Handled', 'Expired', 'All'].map(s => `<button type="button" data-f="${s}">${s}</button>`).join('')}</div></div>
      <p class="status-line" id="qStatus" role="status"></p><div class="mgrid ogrid" id="qList"></div><div id="qPager"></div></div>`;
    $('#qFilter', view).onclick = e => { const b = e.target.closest('[data-f]'); if (!b) return; filter = b.dataset.f; offset = 0; data = null; render(); load(); };
    $('#qRefresh', view).onclick = load; $('#qAlerts', view).onclick = () => AlertsPanel.open();
    $('#qPager', view).onclick = e => { const b = e.target.closest('[data-page]'); if (b) { offset = Math.max(0, offset + Number(b.dataset.page) * 50); load(); } };
    $('#qList', view).addEventListener('click', e => { const a = e.target.closest('[data-id]'); const c = a && data?.calls.find(x => x.id === a.dataset.id); if (!c) return; if (e.target.closest('[data-onway]')) act(c, true); if (e.target.closest('[data-handle]')) act(c, false); });
    render(); load(); stop = RX.poll(5000, load);
  }
  return { mount, unmount() { stop?.(); stop = null; root = null; } };
})();

/* ---------------- Tables & QR codes ---------------- */
const Tables = (() => {
  let root = null, rows = [], busyAll = false, error = '';
  const canRename = () => RX.isAdmin() || Cloud.custom().managerCanRenameTables !== false;
  const link = t => { const u = new URL(RestaurantCloud.cfg.publicMenuUrl || '../', location.href); u.searchParams.set('table', t.table_number); u.searchParams.set('qr', t.qr_key); u.hash = ''; return u.href; };
  async function load() {
    try { rows = await RX.rpc('restaurant_manage_tables', { p_action: 'list', p_table: null, p_status: null }); RestaurantCloud.setTableNames(rows); error = ''; } catch (e) { error = 'Tables could not load: ' + e.message; }
    render();
  }
  function namedSvg(t) {
    const holder = document.createElement('div'); holder.innerHTML = QR.svg(link(t), 600); const svg = holder.querySelector('svg');
    const box = (svg.getAttribute('viewBox') || '0 0 600 600').split(/\s+/).map(Number), size = box[2], name = RX.table(t.table_number), h = Math.max(12, size * .12), ns = 'http://www.w3.org/2000/svg';
    svg.setAttribute('viewBox', `0 0 ${size} ${size + h}`); svg.setAttribute('width', '600'); svg.setAttribute('height', String(Math.round(600 * (size + h) / size)));
    const bg = document.createElementNS(ns, 'rect'); bg.setAttribute('width', String(size)); bg.setAttribute('height', String(size + h)); bg.setAttribute('fill', 'white'); svg.prepend(bg);
    const label = document.createElementNS(ns, 'text'); label.setAttribute('x', String(size / 2)); label.setAttribute('y', String(size + h * .65)); label.setAttribute('text-anchor', 'middle'); label.setAttribute('font-family', 'Arial, sans-serif'); label.setAttribute('font-size', String(Math.min(size * .055, size * 1.5 / Math.max(1, [...name].length)))); label.setAttribute('fill', '#1c2433'); label.textContent = name; svg.append(label);
    return new XMLSerializer().serializeToString(svg);
  }
  function render() {
    if (!root?.isConnected) return;
    const admin = RX.isAdmin(), reserved = rows.filter(t => t.status === 'Reserved').length;
    $('#tSummary', root).innerHTML = RX.sum('Tables', rows.length) + RX.sum('Available', rows.length - reserved) + RX.sum('Reserved', reserved, reserved ? 'is-warn' : '');
    $('#tStatus', root).textContent = error;
    $('#tList', root).innerHTML = rows.length ? rows.map(t => `<article class="ocard tcard" data-t="${esc(t.table_number)}">
      <header class="ocard-head"><div><b>${esc(RX.table(t.table_number))}</b><small>ID ${esc(t.table_number)}</small></div><span class="badge ${t.status === 'Reserved' ? 'badge-amber' : 'badge-green'}">${t.status === 'Reserved' ? 'Reserved' : 'Available'}</span></header>
      <div class="ocard-body stack">
        <form class="inline-form" data-rename><label class="field grow"><span>Table name</span><input name="name" value="${esc(RX.table(t.table_number))}" maxlength="60" required ${canRename() ? '' : 'disabled'}></label><button class="btn" ${canRename() ? '' : 'disabled'}>Save name</button></form>
        ${canRename() ? '' : '<p class="hint">Table name editing is turned off by the administrator.</p>'}
        <label class="field"><span>Availability</span><select data-status><option value="Available" ${t.status !== 'Reserved' ? 'selected' : ''}>Available</option><option value="Reserved" ${t.status === 'Reserved' ? 'selected' : ''}>Reserved</option></select></label>
        ${admin ? `<div class="tqr">${QR.svg(link(t), 168)}<div class="stack"><label class="field"><span>Customer link</span><input readonly value="${esc(link(t))}" data-link></label>
          <div class="toolbar"><a class="btn btn-sm" href="${esc(link(t))}" target="_blank" rel="noopener">${Icon('globe')} Open menu</a><button type="button" class="btn btn-sm" data-copy>${Icon('copy')} Copy</button><button type="button" class="btn btn-sm" data-share>Share</button><button type="button" class="btn btn-sm" data-qr>${Icon('download')} QR</button><button type="button" class="btn btn-sm" data-print>${Icon('printer')} Print</button></div></div></div>` : ''}
      </div>
      ${admin ? `<footer class="ocard-foot"><span></span><div class="toolbar"><button type="button" class="btn btn-sm btn-danger-ghost" data-rotate>${Icon('refresh')} New QR link</button><button type="button" class="btn btn-sm btn-danger-ghost" data-remove>${Icon('trash')} Remove</button></div></footer>` : ''}
    </article>`).join('') : `<div class="empty"><h3>No tables yet</h3><p>Add a table above. Each table gets its own QR code.</p></div>`;
  }
  async function change(action, t, status = null) {
    try { await RX.rpc('restaurant_manage_tables', { p_action: action, p_table: t, p_status: status }); toast(action === 'remove' ? 'Table removed. Its order records are kept.' : action === 'rotate' ? 'Old link revoked. Print the new QR code.' : 'Table saved.', 'ok'); }
    catch (e) { toast(e.message, 'error', 6000); }
    await load();
  }
  async function saveName(table, raw) {
    const clean = String(raw).trim().replace(/\s+/gu, ' ');
    if (!clean || [...clean].length > 60 || /[\x00-\x1f\x7f]/.test(raw)) { toast('Enter a table name with 1–60 characters.', 'warn'); return false; }
    try { const saved = await RX.rpc('restaurant_save_table_name', { p_table: table, p_name: clean }); RestaurantCloud.setTableNames([saved]); toast(table ? 'Table name saved. Existing QR codes still work.' : 'Table added.', 'ok'); await load(); return true; }
    catch (e) { toast(/restaurant_save_table_name|schema cache/.test(e.message) ? 'The table-name database update is missing. Ask support to install it.' : e.message, 'error', 6000); return false; }
  }
  /* ---------- export every table QR at once: one SVG sheet and/or a print-ready A4 PDF ---------- */
  const shopName = () => String(Store.settings.shop_name || Cloud.custom().name || '').trim();
  const runs = m => { const out = []; m.forEach((row, y) => { let x = 0; while (x < row.length) { if (!row[x]) { x++; continue; } const s = x; while (x < row.length && row[x]) x++; out.push([s, y, x - s]); } }); return out; };
  function sheetSvg(list) {
    const cols = 3, cw = 62, ch = 70, mx = 12, top = 18, rowsN = Math.ceil(list.length / cols), W = 210, H = top + rowsN * ch + 10, shop = shopName();
    const cells = list.map((t, i) => {
      const x = mx + (i % cols) * cw, y = top + Math.floor(i / cols) * ch, m = QR.encode(link(t)), n = m.length, q = 2, size = 44, u = size / (n + q * 2), ox = x + (cw - size) / 2, oy = y + 12;
      const d = runs(m).map(([rx, ry, w]) => `M${(ox + (rx + q) * u).toFixed(3)} ${(oy + (ry + q) * u).toFixed(3)}h${(w * u).toFixed(3)}v${u.toFixed(3)}h-${(w * u).toFixed(3)}z`).join('');
      return `<g><rect x="${x + 1}" y="${y + 1}" width="${cw - 2}" height="${ch - 2}" rx="3" fill="#fff" stroke="#c9ced6" stroke-width=".3" stroke-dasharray="1.5 1.5"/>
        <text x="${x + cw / 2}" y="${y + 9}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="3.2" fill="#5b6472">Scan to see the menu &amp; order</text>
        <path d="${d}" fill="#000"/><text x="${x + cw / 2}" y="${y + 63}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${Math.min(6, 80 / Math.max(8, [...RX.table(t.table_number)].length))}" font-weight="700" fill="#111">${esc(RX.table(t.table_number))}</text></g>`;
    }).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>
      <text x="${W / 2}" y="11" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="6" font-weight="700" fill="#111">${esc(shop || 'Table QR codes')}</text>${cells}</svg>`;
  }
  function labelJpeg(lines, wMm, hMm) {
    const k = 12, c = document.createElement('canvas'); c.width = Math.round(wMm * k); c.height = Math.round(hMm * k);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach(([text, size, weight, color, y]) => { let px = size * k; g.font = `${weight} ${px}px Arial, Helvetica, sans-serif`; while (g.measureText(text).width > c.width * .94 && px > 8) { px -= 2; g.font = `${weight} ${px}px Arial, Helvetica, sans-serif`; } g.fillStyle = color; g.fillText(text, c.width / 2, y * k); });
    const b64 = c.toDataURL('image/jpeg', .95).split(',')[1], bin = atob(b64), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { w: c.width, h: c.height, bytes };
  }
  function sheetPdf(list) {
    const mm = 72 / 25.4, PW = 595.28, PH = 841.89, cols = 3, rowsPer = 4, cw = 62, ch = 68, mx = (210 - cols * cw) / 2, my = (297 - rowsPer * ch) / 2, per = cols * rowsPer, shop = shopName();
    const images = [labelJpeg([[shop || 'Scan to order', 3.4, 700, '#111', 2.6], ['Scan to see the menu & order', 2.6, 400, '#5b6472', 6.4]], 56, 8.4)];
    const pages = [];
    for (let p = 0; p * per < list.length; p++) {
      let ops = '', used = [0];
      list.slice(p * per, p * per + per).forEach((t, j) => {
        const cx = mx + (j % cols) * cw, cy = my + Math.floor(j / cols) * ch, X = v => (v * mm).toFixed(2), Y = v => (PH - v * mm).toFixed(2);
        ops += `q 0.79 0.81 0.84 RG 0.6 w [3 3] 0 d ${X(cx + 1)} ${Y(cy + ch - 1)} ${((cw - 2) * mm).toFixed(2)} ${((ch - 2) * mm).toFixed(2)} re S Q\n`;
        ops += `q ${(56 * mm).toFixed(2)} 0 0 ${(8.4 * mm).toFixed(2)} ${X(cx + 3)} ${Y(cy + 2.5 + 8.4)} cm /Im0 Do Q\n`;
        const m = QR.encode(link(t)), n = m.length, q = 2, size = 44, u = size / (n + q * 2), ox = cx + (cw - size) / 2, oy = cy + 11.5;
        ops += '0 0 0 rg\n' + runs(m).map(([rx, ry, w]) => `${X(ox + (rx + q) * u)} ${Y(oy + (ry + q + 1) * u)} ${(w * u * mm).toFixed(2)} ${(u * mm + .02).toFixed(2)} re`).join('\n') + '\nf\n';
        images.push(labelJpeg([[RX.table(t.table_number), 5.2, 700, '#111', 3.6]], 56, 7.2)); const id = images.length - 1; used.push(id);
        ops += `q ${(56 * mm).toFixed(2)} 0 0 ${(7.2 * mm).toFixed(2)} ${X(cx + 3)} ${Y(cy + 57.5 + 7.2)} cm /Im${id} Do Q\n`;
      });
      pages.push({ ops, used });
    }
    const enc = new TextEncoder(), parts = [], offs = []; let len = 0;
    const put = x => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
    const obj = (n, body, stream) => { offs[n] = len; put(`${n} 0 obj\n`); put(body); if (stream) { put('\nstream\n'); put(stream); put('\nendstream'); } put('\nendobj\n'); };
    put(new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52, 10, 37, 226, 227, 207, 211, 10]));
    const imgBase = 3, pageBase = imgBase + images.length, total = pageBase + pages.length * 2;
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${pageBase + i * 2} 0 R`).join(' ')}] >>`);
    images.forEach((im, i) => obj(imgBase + i, `<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >>`, im.bytes));
    pages.forEach((pg, i) => {
      const n = pageBase + i * 2, body = enc.encode(pg.ops);
      obj(n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << ${pg.used.map(k => `/Im${k} ${imgBase + k} 0 R`).join(' ')} >> >> /Contents ${n + 1} 0 R >>`);
      obj(n + 1, `<< /Length ${body.length} >>`, body);
    });
    const xref = len; put(`xref\n0 ${total}\n0000000000 65535 f \n`);
    for (let n = 1; n < total; n++) put(String(offs[n]).padStart(10, '0') + ' 00000 n \n');
    put(`trailer\n<< /Size ${total} /Root 1 0 R /Info << /Title (Table QR codes) /Producer (Restaurant workspace) >> >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(parts, { type: 'application/pdf' });
  }
  function saveBlob(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
  function exportAll() {
    if (!rows.length) return toast('Add a table first.', 'warn');
    const d = modal('Export all QR codes', `<form id="qxForm" class="stack"><p class="hint">${rows.length} table${rows.length === 1 ? '' : 's'}. Each code shows the table name and opens that table’s menu.</p>
      <div class="wipe-choices" role="radiogroup" aria-label="File type">
        <label class="wipe-choice"><input type="radio" name="kind" value="pdf" checked><span><b>PDF for printing</b><small>A4 pages, 12 codes per page with cut lines. Print at 100% (actual size).</small></span></label>
        <label class="wipe-choice"><input type="radio" name="kind" value="svg"><span><b>One SVG file</b><small>Every code on a single sheet. Sharp at any size; opens in browsers and design apps.</small></span></label>
        <label class="wipe-choice"><input type="radio" name="kind" value="both"><span><b>Both files</b><small>Downloads the PDF and the SVG.</small></span></label></div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary">${Icon('download')} Download</button></div></form>`, { size: 'modal-sm' });
    $('#qxForm', d).onsubmit = async e => {
      e.preventDefault(); const kind = e.target.kind.value, btn = e.submitter; busy(btn, true, 'Making files…');
      await new Promise(r => setTimeout(r, 30));
      try {
        const list = rows.slice().sort((a, b) => RX.table(a.table_number).localeCompare(RX.table(b.table_number), undefined, { numeric: true })), stamp = new Date().toISOString().slice(0, 10);
        if (kind !== 'svg') saveBlob(`table-qr-codes-${stamp}.pdf`, sheetPdf(list));
        if (kind !== 'pdf') saveBlob(`table-qr-codes-${stamp}.svg`, new Blob([sheetSvg(list)], { type: 'image/svg+xml' }));
        toast(kind === 'both' ? 'PDF and SVG downloaded.' : (kind === 'pdf' ? 'PDF' : 'SVG') + ' downloaded.', 'ok'); d.close();
      } catch (ex) { toast('Export failed: ' + ex.message, 'error', 6000); } finally { busy(btn, false); }
    };
  }
  function printQR(t) {
    const w = open('', '_blank', 'width=480,height=640'); if (!w) return toast('Allow pop-ups to print.', 'warn');
    w.document.write(`<!doctype html><title>${esc(RX.table(t.table_number))}</title><body style="font-family:system-ui;text-align:center;padding:24px"><h1 style="margin:0 0 4px">${esc(Store.settings.shop_name || '')}</h1><p style="margin:0 0 16px;color:#444">Scan to see the menu and order</p>${QR.svg(link(t), 320)}<h2>${esc(RX.table(t.table_number))}</h2><script>onload=()=>{print()}<\/script></body>`); w.document.close();
  }
  function mount(view) {
    root = view;
    view.innerHTML = `<div class="page rx">${RX.head('Tables & QR codes', 'Each table has its own QR code. Customers scan it to see the menu, order and call a waiter.', `${RX.isAdmin() ? `<button type="button" class="btn" id="tExport">${Icon('download')} Export all QR</button>` : ''}<button type="button" class="btn" id="tRefresh">${Icon('refresh')} Refresh</button>`)}
      <div class="summary" id="tSummary"></div>
      <form class="card inline-add" id="tAdd"><label class="field grow"><span>New table name</span><input name="name" maxlength="60" required placeholder="e.g. Garden 1" autocomplete="off"></label><button class="btn btn-primary">${Icon('plus')} Add table</button></form>
      <p class="status-line" id="tStatus" role="status"></p><div class="mgrid ogrid tgrid" id="tList"></div></div>`;
    $('#tRefresh', view).onclick = load;
    const tx = $('#tExport', view); if (tx) tx.onclick = exportAll;
    $('#tAdd', view).onsubmit = async e => { e.preventDefault(); if (busyAll) return; busyAll = true; busy(e.submitter, true, 'Adding…'); if (await saveName(null, e.target.name.value)) e.target.reset(); busy(e.submitter, false); busyAll = false; };
    $('#tList', view).addEventListener('submit', async e => { const f = e.target.closest('[data-rename]'); if (!f) return; e.preventDefault(); const t = f.closest('[data-t]').dataset.t; busy(e.submitter, true, 'Saving…'); await saveName(t, f.name.value); busy(e.submitter, false); });
    $('#tList', view).addEventListener('change', async e => { const s = e.target.closest('[data-status]'); if (!s) return; s.disabled = true; await change('status', s.closest('[data-t]').dataset.t, s.value); });
    $('#tList', view).addEventListener('click', async e => {
      const card = e.target.closest('[data-t]'); if (!card) return; const t = rows.find(x => x.table_number === card.dataset.t); if (!t) return; const name = RX.table(t.table_number);
      if (e.target.closest('[data-copy]')) RX.copy(link(t), 'Table link copied.');
      else if (e.target.closest('[data-share]')) { try { if (navigator.share) await navigator.share({ title: (Store.settings.shop_name || 'Menu') + ' · ' + name, url: link(t) }); else RX.copy(link(t), 'Sharing is not available here. Link copied.'); } catch (x) { if (x.name !== 'AbortError') RX.copy(link(t), 'Link copied.'); } }
      else if (e.target.closest('[data-qr]')) RX.download('table-' + t.table_number + '-qr.svg', namedSvg(t), 'image/svg+xml');
      else if (e.target.closest('[data-print]')) printQR(t);
      else if (e.target.closest('[data-rotate]')) { if (await ask({ title: `New QR link for ${name}?`, body: 'The old link and printed QR stop working and current table sessions end. Orders stay. Print the new QR before customers scan again.', confirm: 'Make new link', danger: true })) change('rotate', t.table_number); }
      else if (e.target.closest('[data-remove]')) { if (await ask({ title: `Remove ${name}?`, body: 'Its QR code stops taking orders and waiter calls. Order records are kept.', confirm: 'Remove table', danger: true })) change('remove', t.table_number); }
    });
    render(); load();
  }
  return { mount, unmount() { root = null; } };
})();

/* ---------------- Notifications ---------------- */
const Notices = (() => {
  let root = null, stock = null, sec = null, sOff = 0, nOff = 0, perms = {}, stop = null, busyIds = new Set();
  const canSecurity = () => RX.isAdmin() || perms.customer_devices === true || perms.order_device_block === true;
  const sizeName = n => n.variant === 'single' || !n.variant ? '' : ' — ' + (n.size_label || n.variant);
  async function load() {
    try { perms = await RX.rpc('restaurant_manager_permissions', {}); } catch { perms = {}; }
    try { stock = await RX.rpc('restaurant_stock_alerts', { p_offset: sOff }); if (sOff > 0 && !stock.notifications?.length) { sOff = Math.max(0, Math.floor(Math.max(0, stock.total - 1) / 50) * 50); stock = await RX.rpc('restaurant_stock_alerts', { p_offset: sOff }); } } catch (e) { stock = { error: e.message }; }
    if (canSecurity()) { try { sec = await RX.rpc('restaurant_notifications', { p_offset: nOff }); if (nOff > 0 && !sec.notifications?.length) { nOff = Math.max(0, Math.floor(Math.max(0, sec.total - 1) / 50) * 50); sec = await RX.rpc('restaurant_notifications', { p_offset: nOff }); } } catch (e) { sec = { error: e.message }; } } else sec = null;
    render();
  }
  function render() {
    if (!root?.isConnected) return;
    const su = stock?.unread || 0, nu = sec?.unread || 0;
    $('#nSummary', root).innerHTML = RX.sum('Unread low-stock alerts', su, su ? 'is-warn' : '') + (sec ? RX.sum('Unread blocked-browser alerts', nu, nu ? 'is-bad' : '') : '') + RX.sum('Kept for', Math.round(Number(stock?.retention_minutes || 1440) / 60) + ' hours');
    const sRows = stock?.notifications || [];
    $('#nStock', root).innerHTML = `<div class="card-title-row"><div><h2>${Icon('box')} Low stock</h2><p class="hint">A dish or size with 5% or less of its tracked stock left.</p></div><div class="toolbar"><button type="button" class="btn btn-sm" data-s-refresh>${Icon('refresh')} Refresh</button><button type="button" class="btn btn-sm" data-s-all ${su ? '' : 'disabled'}>${Icon('check')} Mark all read</button></div></div>
      ${stock?.error ? `<p class="status-line">Stock alerts could not load: ${esc(stock.error)}</p>` : ''}
      <div class="table-wrap"><table class="table cards-on-mobile"><thead><tr><th>Dish</th><th class="num">Left at alert</th><th>When</th><th>Status</th><th></th></tr></thead><tbody>
      ${sRows.length ? sRows.map(n => `<tr class="${n.read_at ? 'is-muted' : ''}"><td data-label="Dish"><b>${esc(n.dish_name)}${esc(sizeName(n))}</b><small>${esc(n.category || '')}</small></td><td class="num" data-label="Left at alert">${Number(n.remaining)} of ${Number(n.baseline)}<small>${n.baseline ? (100 * n.remaining / n.baseline).toFixed(1) + '%' : ''}</small></td><td data-label="When">${esc(RX.when(n.created_at))}</td><td data-label="Status">${n.read_at ? '<span class="badge">Read</span>' : '<span class="badge badge-amber">New</span>'}</td><td class="row-act">${n.read_at ? '' : `<button type="button" class="btn btn-sm btn-ghost" data-s-read="${esc(n.id)}">Mark read</button>`}</td></tr>`).join('') : '<tr><td colspan="5"><div class="empty slim"><p>No low-stock alerts.</p></div></td></tr>'}
      </tbody></table></div>${RX.pager(stock?.offset ?? sOff, sRows.length, stock?.total || 0, 'alerts').replace(/data-page/g, 'data-s-page')}`;
    const box = $('#nSec', root); box.hidden = !sec;
    if (!sec) return;
    const nRows = sec.notifications || [];
    box.innerHTML = `<div class="card-title-row"><div><h2>${Icon('ban')} Blocked-browser alerts</h2><p class="hint">A blocked customer browser tried to open a table QR.</p></div><div class="toolbar"><button type="button" class="btn btn-sm" data-n-refresh>${Icon('refresh')} Refresh</button><button type="button" class="btn btn-sm" data-n-all ${nu ? '' : 'disabled'}>${Icon('check')} Mark all read</button></div></div>
      ${sec.error ? `<p class="status-line">${esc(sec.error)}</p>` : ''}
      <div class="table-wrap"><table class="table cards-on-mobile"><thead><tr><th>Table</th><th>Browser</th><th>When</th><th class="num">Tries</th><th>Status</th><th></th></tr></thead><tbody>
      ${nRows.length ? nRows.map(n => `<tr class="${n.read_at ? 'is-muted' : ''}"><td data-label="Table"><b>${esc(RX.table(n.table_number))}</b></td><td data-label="Browser">${esc(RX.deviceLabel(n.browser_info))}<small class="mono">${esc(String(n.device_id || '').slice(0, 8))}</small></td><td data-label="When">${esc(RX.when(n.created_at))}<small>Last try ${esc(RX.when(n.last_attempt_at))}</small></td><td class="num" data-label="Tries">${Number(n.attempts || 1)}</td><td data-label="Status">${n.read_at ? '<span class="badge">Read</span>' : '<span class="badge badge-red">New</span>'}</td>
        <td class="row-act"><button type="button" class="btn btn-sm ${n.blocked ? '' : 'btn-danger-ghost'}" data-n-block="${esc(n.id)}" data-blocked="${!n.blocked}" ${!n.device_exists || busyIds.has(n.id) ? 'disabled' : ''}>${!n.device_exists ? 'No device' : n.blocked ? 'Unblock' : 'Block'}</button>${n.read_at ? '' : `<button type="button" class="btn btn-sm btn-ghost" data-n-read="${esc(n.id)}">Mark read</button>`}</td></tr>`).join('') : '<tr><td colspan="6"><div class="empty slim"><p>No blocked-browser alerts.</p></div></td></tr>'}
      </tbody></table></div>${RX.pager(sec.offset ?? nOff, nRows.length, sec.total || 0, 'alerts').replace(/data-page/g, 'data-n-page')}`;
  }
  async function run(work, ok) { try { await work(); if (ok) toast(ok, 'ok'); RestaurantWorkspace.command('refresh'); } catch (e) { toast(e.message, 'error', 6000); } await load(); }
  function mount(view) {
    root = view;
    view.innerHTML = `<div class="page rx">${RX.head('Notifications', 'Low-stock warnings and blocked customer browsers.', `<button type="button" class="btn" id="nAlerts">${Icon('bell')} Alerts</button>`)}
      <div class="summary" id="nSummary"></div><div class="stack"><section class="card" id="nStock"></section><section class="card" id="nSec" hidden></section></div></div>`;
    $('#nAlerts', view).onclick = () => AlertsPanel.open();
    view.addEventListener('click', async e => {
      const t = e.target.closest('button'); if (!t) return; const d = t.dataset;
      if ('sRefresh' in d || 'nRefresh' in d) load();
      else if ('sAll' in d) run(() => RX.rpc('restaurant_stock_alerts', { p_action: 'read_all', p_id: null }), 'All stock alerts marked read.');
      else if (d.sRead) run(() => RX.rpc('restaurant_stock_alerts', { p_action: 'read', p_id: d.sRead }));
      else if ('nAll' in d) run(() => RX.rpc('restaurant_notifications', { p_action: 'read_all', p_id: null }), 'All alerts marked read.');
      else if (d.nRead) run(() => RX.rpc('restaurant_notifications', { p_action: 'read', p_id: d.nRead }));
      else if (d.sPage) { sOff = Math.max(0, sOff + Number(d.sPage) * 50); load(); }
      else if (d.nPage) { nOff = Math.max(0, nOff + Number(d.nPage) * 50); load(); }
      else if (d.nBlock) {
        const block = d.blocked === 'true';
        if (block && !(await ask({ title: 'Block this browser?', body: 'It can no longer open the menu, order or call a waiter. Existing orders stay.', confirm: 'Block', danger: true }))) return;
        busyIds.add(d.nBlock); render();
        await run(() => RX.rpc('restaurant_notification_device', { p_id: d.nBlock, p_blocked: block }), block ? 'Browser blocked.' : 'Browser unblocked.'); busyIds.delete(d.nBlock); render();
      }
    });
    render(); load(); stop = RX.poll(20000, load);
  }
  return { mount, unmount() { stop?.(); stop = null; root = null; } };
})();

/* ---------------- Customer devices ---------------- */
const Devices = (() => {
  let root = null, data = null, offset = 0, sort = 'date', dir = 'desc', perms = {}, busyIds = new Set(), stop = null, error = '';
  const args = () => ({ p_action: 'list', p_device: null, p_blocked: null, p_sort: sort, p_direction: dir, p_offset: offset, p_limit: 50 });
  async function load() {
    try { perms = await RX.rpc('restaurant_manager_permissions', {}); } catch { perms = {}; }
    try { data = await RX.rpc('restaurant_admin_devices', args()); error = ''; if (offset > 0 && !data.devices?.length) { offset = Math.max(0, offset - 50); return load(); } } catch (e) { data = null; error = 'Devices could not load: ' + e.message; }
    render();
  }
  function render() {
    if (!root?.isConnected) return;
    const admin = RX.isAdmin();
    $('#dAccess', root).hidden = !admin;
    if (admin) $('#dAccess', root).innerHTML = `<header class="card-head"><h2>Manager access</h2><p class="hint">Choose what managers may do with customer browsers.</p></header>
      <label class="switch"><input type="checkbox" data-perm="p_customer_devices" ${perms.customer_devices ? 'checked' : ''}><span class="sw"></span><span class="sw-text"><b>See and block saved browsers</b><small>Managers get this Customer devices screen.</small></span></label>
      <label class="switch"><input type="checkbox" data-perm="p_order_device_block" ${perms.order_device_block ? 'checked' : ''}><span class="sw"></span><span class="sw-text"><b>Block a device from an order</b><small>Managers see Block device on kitchen order cards.</small></span></label>`;
    const rows = data?.devices || [];
    $('#dSummary', root).innerHTML = data ? RX.sum('Saved browsers', data.total || 0) + RX.sum('Blocked', data.blocked_count || 0, data.blocked_count ? 'is-bad' : '') + RX.sum('Allowed', Math.max(0, (data.total || 0) - (data.blocked_count || 0))) : '';
    $('#dStatus', root).textContent = error || (!data ? 'Loading devices…' : '');
    $('#dBody', root).innerHTML = rows.length ? rows.map(d => `<tr data-id="${esc(d.id)}" class="${d.blocked ? 'is-muted' : ''}">
      <td data-label="Browser"><b>${d.is_star ? '★ ' : ''}${esc(RX.deviceLabel(d.browser_info))}</b><small class="mono">${esc(d.id.slice(0, 8))}${d.is_star ? ' · Monthly regular' : ''}</small></td>
      <td class="num" data-label="Orders">${Number(d.order_count || 0)}<small>${Number(d.monthly_order_days || 0)} / 4 days this month</small></td>
      <td data-label="Last table">${esc(d.last_table_number ? RX.table(d.last_table_number) : '—')}${d.last_order ? `<small>Order no. ${Number(d.last_order.number)} · ${esc(d.last_order.day)}</small>` : ''}</td>
      <td data-label="Last seen">${esc(RX.when(d.last_seen))}<small>First seen ${esc(RX.when(d.first_seen))}</small></td>
      <td data-label="Status">${d.blocked ? '<span class="badge badge-red">Blocked</span>' : '<span class="badge badge-green">Allowed</span>'}</td>
      <td class="row-act"><button type="button" class="btn btn-sm btn-ghost" data-info>Details</button><button type="button" class="btn btn-sm ${d.blocked ? '' : 'btn-danger-ghost'}" data-block="${!d.blocked}" ${busyIds.has(d.id) ? 'disabled' : ''}>${d.blocked ? 'Unblock' : `${Icon('ban')} Block`}</button></td></tr>`).join('')
      : `<tr><td colspan="6"><div class="empty"><h3>No customer browsers yet</h3><p>A browser is saved here after a customer opens a table QR.</p></div></td></tr>`;
    $('#dPager', root).innerHTML = data ? RX.pager(offset, rows.length, data.total || 0, 'devices') : '';
  }
  function info(d) {
    const b = d.browser_info || {};
    modal('Browser ' + d.id.slice(0, 8), `<dl class="facts"><dt>Browser</dt><dd>${esc(RX.deviceLabel(b))}</dd><dt>Status</dt><dd>${d.blocked ? '<span class="badge badge-red">Blocked</span>' : '<span class="badge badge-green">Allowed</span>'}</dd><dt>Orders</dt><dd>${Number(d.order_count || 0)}</dd>
      <dt>First seen</dt><dd>${esc(RX.when(d.first_seen))}</dd><dt>Last seen</dt><dd>${esc(RX.when(d.last_seen))}</dd><dt>Last changed</dt><dd>${esc(RX.when(d.updated_at))}</dd><dt>Last table</dt><dd>${esc(d.last_table_number ? RX.table(d.last_table_number) : '—')}</dd>
      <dt>Platform</dt><dd>${esc(b.platform || 'Unknown')} · ${esc(b.language || 'Unknown')}</dd><dt>Time zone</dt><dd>${esc(b.time_zone || 'Unknown')}</dd><dt>ID</dt><dd class="mono small">${esc(d.id)}</dd><dt>Reported browser</dt><dd class="small">${esc(b.user_agent || 'Unknown')}</dd></dl>`, { size: 'modal-md' });
  }
  function mount(view) {
    root = view; data = null;
    view.innerHTML = `<div class="page rx">${RX.head('Customer devices', 'Browsers that opened a table QR. Block a browser that misuses the menu.', `<button type="button" class="btn" id="dRefresh">${Icon('refresh')} Refresh</button>`)}
      <section class="card" id="dAccess" hidden></section>
      <div class="summary" id="dSummary"></div>
      <div class="filters"><select id="dSort" aria-label="Sort by"><option value="date">First seen</option><option value="seen">Last seen</option><option value="orders">Number of orders</option><option value="edited">Last changed</option></select><select id="dDir" aria-label="Direction"><option value="desc">Newest / highest first</option><option value="asc">Oldest / lowest first</option></select></div>
      <p class="status-line" id="dStatus" role="status"></p>
      <div class="table-wrap"><table class="table cards-on-mobile"><thead><tr><th>Browser</th><th class="num">Orders</th><th>Last table</th><th>Last seen</th><th>Status</th><th></th></tr></thead><tbody id="dBody"></tbody></table></div><div id="dPager"></div></div>`;
    $('#dSort', view).value = sort; $('#dDir', view).value = dir;
    $('#dSort', view).onchange = e => { sort = e.target.value; offset = 0; load(); };
    $('#dDir', view).onchange = e => { dir = e.target.value; offset = 0; load(); };
    $('#dRefresh', view).onclick = load;
    $('#dPager', view).onclick = e => { const b = e.target.closest('[data-page]'); if (b) { offset = Math.max(0, offset + Number(b.dataset.page) * 50); load(); } };
    $('#dAccess', view).onchange = async e => {
      const c = e.target.closest('[data-perm]'); if (!c) return; c.disabled = true;
      try { perms = await RX.rpc('restaurant_manager_permissions', { [c.dataset.perm]: c.checked }); toast('Manager access saved.', 'ok'); } catch (ex) { c.checked = !c.checked; toast(ex.message, 'error'); } finally { c.disabled = false; }
    };
    $('#dBody', view).addEventListener('click', async e => {
      const tr = e.target.closest('tr[data-id]'); const d = tr && data?.devices.find(x => x.id === tr.dataset.id); if (!d) return;
      const b = e.target.closest('[data-block]');
      if (!b) { if (e.target.closest('[data-info]') || !e.target.closest('button')) info(d); return; }
      const block = b.dataset.block === 'true';
      if (block && !(await ask({ title: `Block browser ${d.id.slice(0, 8)}?`, body: 'It can no longer open the menu, order or call a waiter. Existing orders stay.', confirm: 'Block device', danger: true }))) return;
      busyIds.add(d.id); render();
      try { await RX.rpc('restaurant_admin_devices', { ...args(), p_action: 'set_blocked', p_device: d.id, p_blocked: block }); toast(block ? 'Browser blocked.' : 'Browser unblocked.', 'ok'); } catch (ex) { toast(ex.message, 'error', 6000); }
      busyIds.delete(d.id); load();
    });
    render(); load(); stop = RX.poll(15000, load);
  }
  return { mount, unmount() { stop?.(); stop = null; root = null; } };
})();

/* ---------------- Photos & portions ---------------- */
const MenuDetails = (() => {
  let root = null, items = [], total = 0, q = '', cat = 'All', avail = 'all', categories = [], busyIds = new Set(), req = 0, loading = false, timer = null;
  const PAGE = 30;
  const label = (i, k) => String(i?.size_labels?.[k] || ({ regular: 'Regular', medium: 'Medium', large: 'Large' })[k] || k);
  const sizes = i => Object.keys(i?.size_prices || {});
  const shown = i => i.manual_available ?? i.available;
  const priceOf = i => i.sizes_enabled ? Math.min(...sizes(i).map(k => Number(i.size_prices[k]))) : Number(i.price);
  const validPrice = v => Number.isFinite(v) && v >= 0 && v <= 100000 && Math.abs(v * 100 - Math.round(v * 100)) < 0.00001;
  async function load(reset = true) {
    const id = ++req; loading = true; paintMore();
    try {
      const d = await RX.rpc('restaurant_staff_menu_page63', { p_query: q, p_category: cat, p_availability: avail, p_offset: reset ? 0 : items.length, p_limit: PAGE });
      if (id !== req) return;
      if (Array.isArray(d.categories)) { categories = d.categories.map(c => typeof c === 'string' ? c : c.name); RestaurantCloud.setCategories?.(categories); }
      const incoming = Array.isArray(d.items) ? d.items : [];
      if (reset) items = incoming; else { const ids = new Set(items.map(i => i.id)); items.push(...incoming.filter(i => !ids.has(i.id))); }
      total = Number(d.total) || 0;
    } catch (e) { if (id === req) toast(e.message, 'error', 6000); }
    finally { if (id === req) { loading = false; render(); } }
  }
  function paintMore() { const m = root && $('#mdMore', root); if (m) { m.hidden = !(items.length < total) && !loading; m.disabled = loading; m.textContent = loading ? 'Loading…' : `Show more (${items.length} of ${total})`; } }
  function render() {
    if (!root?.isConnected) return;
    const sel = $('#mdCat', root); sel.innerHTML = '<option value="All">All categories</option>' + categories.map(c => `<option>${esc(c)}</option>`).join(''); sel.value = categories.includes(cat) ? cat : 'All';
    $('#mdStatus', root).textContent = total ? `${items.length} of ${total} dishes` : '';
    const admin = RX.isAdmin();
    $('#mdBody', root).innerHTML = items.length ? items.map(i => {
      const img = RestaurantCloud.safeImage(i.image);
      return `<tr data-id="${esc(i.id)}" class="${shown(i) ? '' : 'is-muted'}">
        <td data-label="Dish"><div class="dish-cell"><span class="dish-thumb">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : Icon('image')}</span><span><b>${esc(i.name)}</b><small>${esc(i.category)}${i.veg === false ? ' · Non-veg' : ''}</small></span></div></td>
        <td data-label="Price" class="num"><b>${i.sizes_enabled ? 'From ' : ''}${Fmt.money(priceOf(i))}</b>${i.sizes_enabled ? `<small>${sizes(i).map(k => esc(label(i, k)) + ' ' + Fmt.money(i.size_prices[k])).join(' · ')}</small>` : ''}</td>
        <td data-label="Labels"><div class="toolbar">${i.stock_sold_out ? '<span class="badge badge-red">Sold out</span>' : shown(i) ? '<span class="badge badge-green">On menu</span>' : '<span class="badge">Hidden</span>'}${i.recommended ? '<span class="badge badge-soft">Recommended</span>' : ''}${i.best_seller ? '<span class="badge badge-amber">Best seller</span>' : ''}</div></td>
        <td class="row-act"><button type="button" class="btn btn-sm" data-act="price">Prices & sizes</button><button type="button" class="btn btn-sm btn-ghost" data-act="photo">${Icon('image')} Photo</button><button type="button" class="btn btn-sm btn-ghost" data-act="more" ${busyIds.has(i.id) ? 'disabled' : ''}>More</button></td></tr>`;
    }).join('') : `<tr><td colspan="4"><div class="empty"><h3>${loading ? 'Loading dishes…' : 'No dishes here'}</h3><p>${loading ? '' : q || cat !== 'All' || avail !== 'all' ? 'Try another search or filter.' : 'Add dishes in Items first.'}</p></div></td></tr>`;
    paintMore(); void admin;
  }
  async function flag(i, patch, msg) {
    busyIds.add(i.id); render();
    try { const saved = await RX.rpc('restaurant_manager_menu_flags', { p_id: i.id, p_available: patch.available ?? null, p_recommended: patch.recommended ?? null, p_best_seller: patch.best_seller ?? null }); Object.assign(i, saved && typeof saved === 'object' ? saved : patch); toast(msg, 'ok'); }
    catch (e) { toast(/restaurant_manager_menu_flags|schema cache/i.test(e.message) ? 'Menu labels need a database update. Ask support to install it.' : e.message, 'error', 6000); }
    finally { busyIds.delete(i.id); await load(); }
  }
  function more(i) {
    const admin = RX.isAdmin();
    const d = modal(i.name, `<div class="stack">
      <button type="button" class="btn" data-m="avail">${shown(i) ? `${Icon('ban')} Hide from customer menu` : `${Icon('check')} Show on customer menu`}</button>
      <button type="button" class="btn" data-m="rec">${i.recommended ? 'Remove Recommended label' : 'Mark as Recommended'}</button>
      <button type="button" class="btn" data-m="best">${i.best_seller ? 'Remove Best seller label' : 'Mark as Best seller'}</button>
      ${admin ? `<button type="button" class="btn btn-danger-ghost" data-m="del">${Icon('trash')} Delete dish</button>` : ''}
      <p class="hint">Customer menus update within about 30 seconds.</p></div>`, { size: 'modal-sm' });
    d.addEventListener('click', async e => {
      const b = e.target.closest('[data-m]'); if (!b) return; d.close();
      if (b.dataset.m === 'avail') flag(i, { available: !shown(i) }, shown(i) ? 'Dish hidden from customer menus.' : 'Dish is on the menu again.');
      if (b.dataset.m === 'rec') flag(i, { recommended: !i.recommended }, i.recommended ? 'Recommended label removed.' : 'Marked Recommended.');
      if (b.dataset.m === 'best') flag(i, { best_seller: !i.best_seller }, i.best_seller ? 'Best seller label removed.' : 'Marked Best seller.');
      if (b.dataset.m === 'del') { if (!(await ask({ title: `Delete ${i.name}?`, body: 'It disappears from every customer menu. Old order records are kept.', confirm: 'Delete dish', danger: true }))) return; try { await RestaurantCloud.deleteMenu(i.id); toast('Dish deleted.', 'ok'); Store.itemsLoadedAt = 0; } catch (ex) { toast(ex.message, 'error', 6000); } load(); }
    });
  }
  function pricing(i) {
    const admin = RX.isAdmin(), snap = JSON.stringify({ name: i.name, description: i.description || '', category: i.category, veg: i.veg !== false, sizes_enabled: i.sizes_enabled === true, price: Number(i.price), size_prices: i.size_prices || {}, size_labels: i.size_labels || {} });
    const row = (key, lab, price) => `<div class="size-row" data-v="${esc(key || 'v_' + crypto.randomUUID().replaceAll('-', ''))}"><label class="field"><span>Size name</span><input data-l maxlength="40" required placeholder="e.g. Half · 6 pieces" value="${esc(lab)}"></label><label class="field"><span>Price (${esc(Fmt.cur())})</span><input data-p type="number" min="0" max="100000" step="0.01" inputmode="decimal" required value="${esc(price)}"></label><button type="button" class="icon-btn" data-del aria-label="Remove size">${Icon('trash')}</button></div>`;
    const d = modal('Prices & sizes · ' + i.name, `<form class="stack" id="prForm">
      ${admin ? `<div class="form-grid"><label class="field span-2"><span>Dish name</span><input name="name" maxlength="120" required value="${esc(i.name)}"></label>
        <label class="field"><span>Category</span><select name="category">${categories.map(c => `<option ${c === i.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
        <label class="switch"><input type="checkbox" name="veg" ${i.veg !== false ? 'checked' : ''}><span class="sw"></span><span class="sw-text"><b>Vegetarian</b><small>Shows the green veg mark.</small></span></label>
        <label class="field span-2"><span>Description <em>optional</em></span><textarea name="description" rows="2" maxlength="1000">${esc(i.description || '')}</textarea></label></div>` : ''}
      <label class="switch"><input type="checkbox" name="sizes" ${i.sizes_enabled ? 'checked' : ''}><span class="sw"></span><span class="sw-text"><b>Portion sizes</b><small>For example Half and Full, each with its own price.</small></span></label>
      <label class="field" data-single><span>Price (${esc(Fmt.cur())})</span><input name="price" type="number" min="0" max="100000" step="0.01" inputmode="decimal" value="${Number.isFinite(Number(i.price)) ? Number(i.price).toFixed(2) : '0.00'}"></label>
      <div class="stack" data-multi><div class="stack" id="prRows">${sizes(i).map(k => row(k, label(i, k), Number(i.size_prices[k] || 0).toFixed(2))).join('')}</div><button type="button" class="btn btn-ghost" id="prAdd">${Icon('plus')} Add size</button></div>
      <p class="form-error" role="alert" hidden></p>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary">Save changes</button></div></form>`, { size: 'modal-md' });
    const f = $('#prForm', d), err = $('.form-error', d);
    const mode = () => { const on = f.sizes.checked; $('[data-single]', d).hidden = on; $('[data-multi]', d).hidden = !on; f.price.required = !on; $$('#prRows input', d).forEach(x => { x.required = on; }); };
    f.sizes.onchange = () => { if (f.sizes.checked && !$('#prRows', d).children.length) { $('#prRows', d).insertAdjacentHTML('beforeend', row('', 'Half', '') + row('', 'Full', '')); } mode(); };
    $('#prAdd', d).onclick = () => { if ($('#prRows', d).children.length >= 20) return toast('A dish can have up to 20 sizes.', 'warn'); $('#prRows', d).insertAdjacentHTML('beforeend', row('', '', '')); mode(); $('#prRows', d).lastElementChild.querySelector('input').focus(); };
    $('#prRows', d).onclick = e => { const x = e.target.closest('[data-del]'); if (x) { x.closest('.size-row').remove(); mode(); } };
    mode();
    f.onsubmit = async e => {
      e.preventDefault(); err.hidden = true; const on = f.sizes.checked, prices = {}, labels = {}, seen = new Set();
      const fail = m => { err.textContent = m; err.hidden = false; };
      if (on) for (const r of $$('#prRows .size-row', d)) { const l = $('[data-l]', r).value.trim(), raw = $('[data-p]', r).value, p = Number(raw); if (!l || seen.has(l.toLowerCase()) || raw === '' || !validPrice(p)) return fail('Use unique size names and prices from 0 to 100000 with up to two decimals.'); seen.add(l.toLowerCase()); prices[r.dataset.v] = p; labels[r.dataset.v] = l; }
      const base = on ? Math.min(...Object.values(prices)) : Number(f.price.value);
      if (!validPrice(base) || (on && !Object.keys(prices).length)) return fail('Add at least one size, or turn portion sizes off and enter one price.');
      const meta = admin ? { name: f.name.value.trim(), description: f.description.value.trim(), category: f.category.value, veg: f.veg.checked } : null;
      if (meta && (!meta.name || meta.name.length > 120)) return fail('Enter a dish name (up to 120 characters).');
      busy(e.submitter, true, 'Saving…');
      try {
        const latest = await RX.rpc('restaurant_staff_menu_item63', { p_id: i.id }); if (!latest) throw Error('Dish not found. Refresh and try again.');
        const now = JSON.stringify({ name: latest.name, description: latest.description || '', category: latest.category, veg: latest.veg !== false, sizes_enabled: latest.sizes_enabled === true, price: Number(latest.price), size_prices: latest.size_prices || {}, size_labels: latest.size_labels || {} });
        if (now !== snap) throw Error('This dish changed on another device. Close, refresh and try again.');
        await RX.rpc('restaurant_menu_customize', { p_id: i.id, p_sizes_enabled: on, p_base_price: base, p_size_prices: prices, p_size_labels: labels, p_details: meta, p_expected_updated_at: latest.updated_at });
        toast('Saved. Customer menus and billing use the new prices.', 'ok'); Store.itemsLoadedAt = 0; d.close(); load();
      } catch (ex) { fail(/restaurant_menu_customize|schema cache/.test(ex.message) ? 'Portion sizes need a database update. Ask support to install it.' : ex.message); } finally { busy(e.submitter, false); }
    };
  }
  function photo(i) {
    let draft = i.image || '', bmp = null, zoom = 1, px = .5, py = .5, drag = null;
    const d = modal('Photo · ' + i.name, `<div class="stack">
      <div class="photo-edit"><img id="phImg" alt="" ${RestaurantCloud.safeImage(draft) ? `src="${esc(RestaurantCloud.safeImage(draft))}"` : 'hidden'}><canvas id="phCanvas" width="600" height="600" aria-label="Square photo crop" hidden></canvas><p class="hint" id="phEmpty" ${draft ? 'hidden' : ''}>No photo yet. Choose a photo to add one.</p></div>
      <div class="form-grid" id="phCtl" hidden><label class="field"><span>Zoom</span><input type="range" id="phZoom" min="1" max="4" step="0.01" value="1"></label><label class="field"><span>Left – right</span><input type="range" id="phX" min="0" max="1" step="0.001" value="0.5"></label><label class="field span-2"><span>Up – down</span><input type="range" id="phY" min="0" max="1" step="0.001" value="0.5"></label><p class="hint span-2">Drag the photo to choose the square crop.</p></div>
      <div class="toolbar"><label class="btn file-btn">${Icon('upload')} Choose photo<input type="file" id="phFile" accept="image/jpeg,image/png,image/webp" hidden></label><button type="button" class="btn btn-ghost" id="phRemove" ${draft ? '' : 'disabled'}>${Icon('trash')} Remove photo</button></div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="button" class="btn btn-primary" id="phSave" disabled>Save photo</button></div></div>`, { size: 'modal-md' });
    const c = $('#phCanvas', d), ctx = c.getContext('2d');
    const draw = () => {
      ctx.fillStyle = '#f6f8fa'; ctx.fillRect(0, 0, 600, 600);
      if (bmp) { const s = Math.max(600 / bmp.width, 600 / bmp.height) * zoom, w = bmp.width * s, h = bmp.height * s; ctx.drawImage(bmp, (600 - w) * px, (600 - h) * py, w, h); }
    };
    const view = mode => { $('#phImg', d).hidden = mode !== 'img'; c.hidden = mode !== 'crop'; $('#phEmpty', d).hidden = mode !== 'none'; };
    const sync = () => { zoom = +$('#phZoom', d).value; px = +$('#phX', d).value; py = +$('#phY', d).value; draw(); };
    ['#phZoom', '#phX', '#phY'].forEach(s => $(s, d).addEventListener('input', sync));
    c.addEventListener('pointerdown', e => { if (!bmp) return; c.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, px, py }; });
    c.addEventListener('pointermove', e => { if (!drag) return; const r = c.getBoundingClientRect(); px = Math.min(1, Math.max(0, drag.px - (e.clientX - drag.x) / r.width)); py = Math.min(1, Math.max(0, drag.py - (e.clientY - drag.y) / r.height)); $('#phX', d).value = px; $('#phY', d).value = py; draw(); });
    c.addEventListener('pointerup', () => { drag = null; });
    $('#phFile', d).onchange = async e => {
      const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
      if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 10 * 1024 * 1024) return toast('Use a JPG, PNG or WebP photo under 10 MB.', 'warn');
      try { bmp = await createImageBitmap(file); zoom = 1; px = py = .5; ['#phZoom', '#phX', '#phY'].forEach((s, n) => { $(s, d).value = n ? .5 : 1; }); $('#phCtl', d).hidden = false; view('crop'); draw(); $('#phSave', d).disabled = false; $('#phRemove', d).disabled = false; }
      catch { toast('This photo could not be read.', 'error'); }
    };
    $('#phRemove', d).onclick = () => { bmp = null; draft = ''; $('#phCtl', d).hidden = true; $('#phEmpty', d).textContent = 'The photo is removed when you save.'; view('none'); $('#phSave', d).disabled = false; };
    $('#phSave', d).onclick = async e => {
      const btn = e.currentTarget; busy(btn, true, 'Saving…');
      try {
        let data = '';
        if (bmp) { draw(); data = c.toDataURL('image/jpeg', .86); if (data.length > 1400000) data = c.toDataURL('image/jpeg', .72); }
        await RestaurantCloud.patchMenu(i.id, { image: data, updated_at: new Date().toISOString() });
        toast(data ? 'Photo saved. Customer menus show it within about 30 seconds.' : 'Photo removed.', 'ok'); d.close(); load();
      } catch (ex) { toast(ex.message, 'error', 8000); } finally { busy(btn, false); }
    };
  }
  async function categoryOrder() {
    let data;
    try { data = await RX.rpc('restaurant_menu_layout', {}); } catch (e) { return toast(e.message, 'error'); }
    let list = (data.categories || []).map(c => c.name), dirty = false;
    const d = modal('Order of categories', `<p class="hint">The customer menu and billing screen show categories in this order.</p><ul class="plain-list" id="coList"></ul>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="button" class="btn btn-primary" id="coSave">Save order</button></div>`, { size: 'modal-sm' });
    const paint = () => { $('#coList', d).innerHTML = list.map((n, k) => `<li data-k="${k}"><span><b class="mono">${k + 1}.</b> ${esc(n)}</span><span class="toolbar"><button type="button" class="icon-btn" data-up ${k ? '' : 'disabled'} aria-label="Move up">${Icon('up')}</button><button type="button" class="icon-btn" data-down ${k < list.length - 1 ? '' : 'disabled'} aria-label="Move down">${Icon('down')}</button></span></li>`).join(''); };
    paint();
    $('#coList', d).onclick = e => { const li = e.target.closest('[data-k]'); if (!li) return; const k = +li.dataset.k; if (e.target.closest('[data-up]') && k) [list[k - 1], list[k]] = [list[k], list[k - 1]]; else if (e.target.closest('[data-down]') && k < list.length - 1) [list[k + 1], list[k]] = [list[k], list[k + 1]]; else return; dirty = true; paint(); };
    $('#coSave', d).onclick = async e => {
      if (!dirty) return d.close(); const btn = e.currentTarget; busy(btn, true, 'Saving…');
      try { await RX.rpc('restaurant_menu_layout', { p_category: null, p_ids: list, p_revision: data.revision }); toast('Category order saved.', 'ok'); Store.itemsLoadedAt = 0; d.close(); load(); }
      catch (ex) { toast(ex.message, 'error', 6000); } finally { busy(btn, false); }
    };
  }
  function mount(view) {
    root = view; items = []; total = 0;
    view.innerHTML = `<div class="page rx">${RX.head('Photos & portions', 'Dish photos, portion sizes and menu labels that customers see.', `<a class="btn" href="#/items">${Icon('tag')} Items</a><button type="button" class="btn" id="mdOrder">${Icon('list')} Order of categories</button>`)}
      <div class="filters"><label class="search sm">${Icon('search')}<input id="mdQ" type="search" placeholder="Search dish, category or description" value="${esc(q)}" aria-label="Search dishes"></label>
        <select id="mdCat" aria-label="Category"></select><select id="mdAvail" aria-label="Availability"><option value="all">All dishes</option><option value="available">On menu</option><option value="unavailable">Hidden</option></select></div>
      <p class="status-line" id="mdStatus" role="status"></p>
      <div class="table-wrap"><table class="table cards-on-mobile"><thead><tr><th>Dish</th><th class="num">Price</th><th>Labels</th><th></th></tr></thead><tbody id="mdBody"></tbody></table></div>
      <div class="pager"><button type="button" class="btn btn-sm" id="mdMore" hidden>Show more</button></div></div>`;
    $('#mdAvail', view).value = avail;
    $('#mdQ', view).oninput = e => { clearTimeout(timer); timer = setTimeout(() => { q = e.target.value.trim(); load(); }, 300); };
    $('#mdCat', view).onchange = e => { cat = e.target.value; load(); };
    $('#mdAvail', view).onchange = e => { avail = e.target.value; load(); };
    $('#mdMore', view).onclick = () => load(false);
    $('#mdOrder', view).onclick = categoryOrder;
    $('#mdBody', view).addEventListener('click', e => {
      const tr = e.target.closest('tr[data-id]'); const i = tr && items.find(x => x.id === tr.dataset.id); if (!i) return;
      const a = e.target.closest('[data-act]')?.dataset.act || 'price';
      if (a === 'price') pricing(i); else if (a === 'photo') photo(i); else more(i);
    });
    render(); load();
  }
  return { mount, unmount() { root = null; } };
})();

/* ---------------- Stock rules (24-hour loops) ---------------- */
const StockRules = (() => {
  let root = null, rows = [], q = '', cat = 'All', show = 'tracked', busyKeys = new Set(), error = '', loaded = false;
  const key = r => JSON.stringify([r.menu_id, r.variant]);
  const name = r => r.name + (r.size_label ? ' — ' + r.size_label : r.variant && r.variant !== 'single' ? ' — ' + ({ regular: 'Regular', medium: 'Medium', large: 'Large' }[r.variant] || r.variant) : '');
  async function load() {
    try { const d = await RX.rpc('restaurant_stocks', {}); if (!Array.isArray(d)) throw Error('Invalid stock response.'); rows = d; error = ''; loaded = true; }
    catch (e) { error = /restaurant_stocks|schema cache/.test(e.message) ? 'Stock rules need a database update. Ask support to install it.' : 'Stock could not load: ' + e.message; }
    render();
  }
  function render() {
    if (!root?.isConnected) return;
    const cats = [...new Set(rows.map(r => r.category))].sort(); const sel = $('#srCat', root); sel.innerHTML = '<option value="All">All categories</option>' + cats.map(c => `<option>${esc(c)}</option>`).join(''); sel.value = cats.includes(cat) ? cat : 'All';
    const s = q.toLowerCase().trim(), tracked = rows.filter(r => r.tracked), looping = rows.filter(r => r.loop_enabled);
    $('#srSummary', root).innerHTML = RX.sum('Tracked dishes & sizes', tracked.length) + RX.sum('24-hour loops on', looping.length, looping.length ? 'big' : '') + RX.sum('Sold out', tracked.filter(r => Number(r.remaining) === 0).length, tracked.some(r => Number(r.remaining) === 0) ? 'is-bad' : '');
    const list = rows.filter(r => (cat === 'All' || r.category === cat) && (!s || [name(r), r.category].some(x => String(x).toLowerCase().includes(s))) && (show === 'all' || (show === 'tracked' && r.tracked) || (show === 'loop' && r.loop_enabled) || (show === 'untracked' && !r.tracked))).sort((a, b) => (b.loop_enabled - a.loop_enabled) || (b.tracked - a.tracked) || name(a).localeCompare(name(b)));
    $('#srStatus', root).textContent = error || (!loaded ? 'Loading stock…' : '');
    $('#srBody', root).innerHTML = list.length ? list.map(r => `<tr data-k="${esc(key(r))}">
      <td data-label="Dish"><b>${esc(name(r))}</b><small>${esc(r.category)}${r.manual_available === false ? ' · hidden on menu' : ''}</small></td>
      <td data-label="In stock">${r.tracked ? `<div class="level level-${Number(r.remaining) === 0 ? 'out' : 'ok'}"><b>${Fmt.qty(r.remaining)}</b> <small>left</small></div>` : '<span class="muted">Not tracked</span>'}</td>
      <td data-label="24-hour loop">${r.loop_enabled ? `<span class="badge badge-green">${Icon('repeat')} Back to ${Fmt.qty(r.loop_quantity)}</span><small>Next reset ${esc(RX.when(r.loop_next_reset_at))}</small>` : '<span class="badge">Off</span>'}</td>
      <td class="row-act">${r.tracked ? `<button type="button" class="btn btn-sm" data-loop ${busyKeys.has(key(r)) ? 'disabled' : ''}>${Icon('repeat')} ${r.loop_enabled ? 'Change loop' : 'Set loop'}</button>${r.loop_enabled ? `<button type="button" class="btn btn-sm btn-danger-ghost" data-stop ${busyKeys.has(key(r)) ? 'disabled' : ''}>Stop</button>` : ''}` : '<a class="btn btn-sm btn-ghost" href="#/stocks">Track in Stocks</a>'}</td></tr>`).join('')
      : `<tr><td colspan="4"><div class="empty"><h3>Nothing here</h3><p>${show === 'tracked' ? 'Start tracking a dish in Stocks first, then set its 24-hour loop here.' : 'Try another filter.'}</p></div></td></tr>`;
  }
  async function save(r, enabled, quantity) {
    const k = key(r); busyKeys.add(k); render();
    try { await RX.rpc('restaurant_set_stock_loop', { p_id: r.menu_id, p_variant: r.variant, p_enabled: enabled, p_quantity: quantity, p_revision: r.revision }); toast(enabled ? '24-hour loop saved. The next reset restores this quantity.' : 'Loop stopped. Current stock is unchanged.', 'ok'); Store.itemsLoadedAt = 0; }
    catch (e) { toast(e.message, 'error', 6000); } finally { busyKeys.delete(k); load(); }
  }
  async function loop(r) {
    const v = await ask({ title: `24-hour loop · ${name(r)}`, body: 'Every 24 hours the stock goes back to this quantity. Leftovers are replaced, not added.', confirm: r.loop_enabled ? 'Save loop' : 'Start loop', input: { label: 'Quantity to restore', type: 'number', value: String(r.loop_quantity ?? r.remaining ?? 0), required: true, maxlength: 7 } });
    if (v === null) return; const n = Number(v);
    if (!Number.isSafeInteger(n) || n < 0 || n > 1000000) return toast('Enter a whole quantity from 0 to 1000000.', 'warn');
    save(r, true, n);
  }
  function mount(view) {
    root = view; loaded = false;
    view.innerHTML = `<div class="page rx">${RX.head('Stock rules', 'Refill a dish to a set quantity every 24 hours, for example daily momo batches.', `<a class="btn" href="#/stocks">${Icon('box')} Stocks</a><button type="button" class="btn" id="srRefresh">${Icon('refresh')} Refresh</button>`)}
      <div class="summary" id="srSummary"></div>
      <div class="filters"><label class="search sm">${Icon('search')}<input id="srQ" type="search" placeholder="Search dish or size" value="${esc(q)}" aria-label="Search stock"></label><select id="srCat" aria-label="Category"></select>
        <div class="seg seg-scroll" id="srShow">${[['tracked', 'Tracked'], ['loop', 'Loops on'], ['untracked', 'Not tracked'], ['all', 'All']].map(([k, l]) => `<button type="button" data-s="${k}" class="${show === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <p class="status-line" id="srStatus" role="status"></p>
      <div class="table-wrap"><table class="table cards-on-mobile"><thead><tr><th>Dish</th><th>In stock</th><th>24-hour loop</th><th></th></tr></thead><tbody id="srBody"></tbody></table></div></div>`;
    $('#srQ', view).oninput = e => { q = e.target.value; render(); };
    $('#srCat', view).onchange = e => { cat = e.target.value; render(); };
    $('#srShow', view).onclick = e => { const b = e.target.closest('[data-s]'); if (!b) return; show = b.dataset.s; $$('#srShow button', view).forEach(x => x.classList.toggle('on', x === b)); render(); };
    $('#srRefresh', view).onclick = load;
    $('#srBody', view).addEventListener('click', async e => {
      const tr = e.target.closest('tr[data-k]'); const r = tr && rows.find(x => key(x) === tr.dataset.k); if (!r) return;
      if (e.target.closest('[data-loop]')) loop(r);
      if (e.target.closest('[data-stop]') && await ask({ title: `Stop the loop for ${name(r)}?`, body: 'Current stock stays as it is.', confirm: 'Stop loop', danger: true })) save(r, false, Number(r.loop_quantity ?? r.remaining ?? 0));
    });
    render(); load();
  }
  return { mount, unmount() { root = null; } };
})();

/* ---------------- Dish sales ---------------- */
const DishSales = (() => {
  let root = null, period = 'day', ref = null, mode = 'dishes', sort = 'quantity', offset = 0, data = null, error = '', req = 0;
  const args = (o = offset, limit = 50) => ({ p_period: period, p_reference: ref, p_mode: mode, p_sort: sort, p_offset: o, p_limit: limit });
  const range = d => d ? (d.period_start === Fmt.addDays(d.period_stop, -1) || d.period_start === d.period_stop ? Fmt.date(d.period_start) : `${Fmt.date(d.period_start)} – ${Fmt.date(Fmt.addDays(d.period_stop, -1))}`) : '';
  async function load() {
    const id = ++req; $('#dsStatus', root).textContent = 'Loading…';
    try { const d = await RX.rpc('restaurant_dish_sales', args()); if (id !== req) return; if (offset > 0 && !d.rows.length) { offset = Math.max(0, Math.floor(Math.max(0, d.total_rows - 1) / 50) * 50); return load(); } data = d; error = ''; }
    catch (e) { if (id === req) { data = null; error = 'Dish sales could not load: ' + e.message; } }
    if (id === req) render();
  }
  function render() {
    if (!root?.isConnected) return;
    $$('#dsPeriod button', root).forEach(b => b.classList.toggle('on', b.dataset.p === period));
    const rows = data?.rows || [];
    $('#dsStatus', root).textContent = error || (data ? `${ref ? 'Selected' : 'Current'} ${period} · ${range(data)} · served orders, before tax` : '');
    const units = rows.reduce((n, r) => n + Number(r.quantity || 0), 0), rev = rows.reduce((n, r) => n + Number(r.revenue || 0), 0);
    const part = (data?.total_rows || 0) > rows.length ? ' (this page)' : '';
    $('#dsSummary', root).innerHTML = data ? RX.sum('Item revenue' + part, Fmt.money(rev), 'big') + RX.sum('Units sold' + part, Fmt.qty(units)) + RX.sum(mode === 'daily' ? 'Day & dish rows' : 'Dishes sold', data.total_rows || 0) : '';
    $('#dsBody', root).innerHTML = rows.length ? rows.map(r => `<tr><td class="num" data-label="Rank">${r.position}</td><td data-label="Date">${r.sale_day ? esc(Fmt.date(r.sale_day)) : esc(range(data))}</td><td data-label="Dish"><b>${esc(r.dish_name)}</b>${r.size_label ? `<small>${esc(r.size_label)}</small>` : ''}</td><td class="num" data-label="Qty sold">${Fmt.qty(r.quantity)}</td><td class="num" data-label="Orders">${r.order_count}</td><td class="num" data-label="Revenue"><b>${Fmt.money(r.revenue)}</b></td></tr>`).join('')
      : `<tr><td colspan="6"><div class="empty"><h3>No dish sales</h3><p>No served orders in this period.</p></div></td></tr>`;
    $('#dsPager', root).innerHTML = data ? RX.pager(data.offset || 0, rows.length, data.total_rows || 0, 'rows') : '';
  }
  async function exportCSV(btn) {
    busy(btn, true, 'Preparing…');
    try {
      const a = args(0, 100), out = []; let page;
      do { page = await RX.rpc('restaurant_dish_sales', { ...a, p_offset: out.length }); out.push(...page.rows); a.p_reference = page.period_start; if (!page.rows.length) break; } while (out.length < page.total_rows);
      downloadFile(`dish-sales-${period}-${page?.period_start || 'current'}.csv`, toCSV([['Date / period', 'Dish', 'Size', 'Quantity sold', 'Served orders', 'Item revenue (before tax)'], ...out.map(r => [r.sale_day || `${page.period_start} to ${Fmt.addDays(page.period_stop, -1)}`, r.dish_name, r.size_label || '', r.quantity, r.order_count, r.revenue])]));
      toast(`Exported ${out.length} rows.`, 'ok');
    } catch (e) { toast(e.message, 'error'); } finally { busy(btn, false); }
  }
  async function reset() {
    const v = await ask({ title: 'Reset dish sales?', body: 'Served orders so far stop counting in dish sales. Orders, bills and stock are not changed.', confirm: 'Reset dish sales', danger: true, input: { label: 'Type RESET DISH SALES to confirm', required: true } });
    if (v === null) return; if (v.trim() !== 'RESET DISH SALES') return toast('Type RESET DISH SALES exactly.', 'warn');
    try { const r = await RX.rpc('restaurant_reset_dish_sales', { p_confirmation: 'RESET DISH SALES', p_request_id: crypto.randomUUID() }); toast(`${r.excluded_orders ?? 0} served orders cleared from dish sales.`, 'ok'); offset = 0; load(); } catch (e) { toast(e.message, 'error', 6000); }
  }
  function mount(view) {
    root = view; data = null; offset = 0;
    view.innerHTML = `<div class="page rx">${RX.head('Dish sales', 'Which dishes sell the most, by day or month.', `<a class="btn" href="#/records">${Icon('list')} Records</a><button type="button" class="btn" id="dsExport">${Icon('download')} Export CSV</button>`)}
      <div class="filters"><div class="seg" id="dsPeriod"><button type="button" data-p="day">Day</button><button type="button" data-p="month">Month</button><button type="button" data-p="year">Year</button></div>
        <input type="date" id="dsDay" aria-label="Choose a day" style="width:auto"><input type="month" id="dsMonth" aria-label="Choose a month" style="width:auto" hidden><input type="number" id="dsYear" aria-label="Choose a year" min="2000" max="2100" style="width:110px" hidden>
        <select id="dsMode" aria-label="Report"><option value="dishes">Top dishes in period</option><option value="daily">Day-by-day dish sales</option></select>
        <select id="dsSort" aria-label="Sort"><option value="quantity">Most sold</option><option value="revenue">Highest revenue</option><option value="name">Dish name</option></select></div>
      <div class="summary" id="dsSummary"></div><p class="status-line" id="dsStatus" role="status"></p>
      <div class="table-wrap"><table class="table cards-on-mobile"><thead><tr><th class="num">#</th><th>Date</th><th>Dish</th><th class="num">Qty sold</th><th class="num">Orders</th><th class="num">Revenue</th></tr></thead><tbody id="dsBody"></tbody></table></div><div id="dsPager"></div>
      ${RX.isAdmin() ? `<section class="card rx-danger"><div class="data-row danger-zone"><div><h3>Reset dish sales</h3><p class="hint">Start counting dish sales again from now. Orders, bills and stock stay as they are.</p></div><button type="button" class="btn btn-danger" id="dsReset">Reset dish sales…</button></div></section>` : ''}</div>`;
    const t = Fmt.today();
    const pick = () => { $('#dsDay', view).hidden = period !== 'day'; $('#dsMonth', view).hidden = period !== 'month'; $('#dsYear', view).hidden = period !== 'year'; };
    $('#dsDay', view).max = t; $('#dsDay', view).value = ref && period === 'day' ? ref : t; $('#dsMonth', view).value = t.slice(0, 7); $('#dsMonth', view).max = t.slice(0, 7); $('#dsYear', view).value = t.slice(0, 4);
    $('#dsMode', view).value = mode; $('#dsSort', view).value = sort; pick();
    $('#dsPeriod', view).onclick = e => { const b = e.target.closest('[data-p]'); if (!b) return; period = b.dataset.p; ref = null; offset = 0; pick(); load(); };
    $('#dsDay', view).onchange = e => { ref = e.target.value && e.target.value !== t ? e.target.value : null; offset = 0; load(); };
    $('#dsMonth', view).onchange = e => { ref = e.target.value ? e.target.value + '-01' : null; offset = 0; load(); };
    $('#dsYear', view).onchange = e => { if (!/^(20\d\d|2100)$/.test(e.target.value)) return toast('Choose a year from 2000 to 2100.', 'warn'); ref = e.target.value + '-01-01'; offset = 0; load(); };
    $('#dsMode', view).onchange = e => { mode = e.target.value; offset = 0; load(); };
    $('#dsSort', view).onchange = e => { sort = e.target.value; offset = 0; load(); };
    $('#dsExport', view).onclick = e => exportCSV(e.currentTarget);
    $('#dsReset', view)?.addEventListener('click', reset);
    $('#dsPager', view).onclick = e => { const b = e.target.closest('[data-page]'); if (b) { offset = Math.max(0, offset + Number(b.dataset.page) * 50); load(); } };
    render(); load();
  }
  return { mount, unmount() { root = null; } };
})();

/* ---------------- Restaurant reports ---------------- */
const RestaurantReports = (() => {
  const SECTIONS = ['trend', 'statuses', 'hours', 'weekdays', 'dishes', 'categories', 'sizes', 'tables', 'recent'];
  let root = null, period = 'day', ref = null, data = {}, req = 0;
  const num = v => Fmt.nf0.format(Number(v) || 0);
  const bars = (rows, lab, val, fmt, sub) => { if (!rows?.length) return '<div class="empty slim"><p>No data in this period.</p></div>'; const max = Math.max(...rows.map(r => Number(r[val]) || 0), 1); return `<ul class="hbars">${rows.map(r => `<li><div class="hb-top"><span>${esc(r[lab])}</span><b>${fmt(r[val])}</b></div><div class="hb-track"><i style="width:${(Math.max(0, Number(r[val]) || 0) / max * 100).toFixed(1)}%"></i></div>${sub ? `<small>${sub(r)}</small>` : ''}</li>`).join('')}</ul>`; };
  const table = (heads, rows) => rows.length ? `<div class="table-wrap"><table class="table compact"><thead><tr>${heads.map((h, i) => `<th class="${i ? 'num' : ''}">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td class="${i ? 'num' : ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<div class="empty slim"><p>No data in this period.</p></div>';
  const sizeName = r => r.size === 'single' ? 'Single / no size' : r.size_label || r.size;
  async function load() {
    const id = ++req; data = {}; render(); $('#rrStatus', root).textContent = 'Loading reports…';
    try {
      const s = await RX.rpc('restaurant_sales_analytics_section63', { p_period: period, p_reference: ref, p_section: 'summary' }); if (id !== req) return; data = { ...s }; render();
      await Promise.all(SECTIONS.map(async sec => { try { const d = await RX.rpc('restaurant_sales_analytics_section63', { p_period: period, p_reference: ref, p_section: sec }); if (id === req) { data[sec] = d[sec]; data.loaded = { ...(data.loaded || {}), [sec]: true }; render(); } } catch { if (id === req) { data.loaded = { ...(data.loaded || {}), [sec]: 'error' }; render(); } } }));
      if (id === req) $('#rrStatus', root).textContent = `Updated ${Fmt.time(new Date().toISOString())}`;
    } catch (e) { if (id === req) $('#rrStatus', root).textContent = 'Reports could not load: ' + e.message; }
  }
  function render() {
    if (!root?.isConnected) return;
    $$('#rrPeriod button', root).forEach(b => b.classList.toggle('on', b.dataset.p === period));
    const s = data.summary, l = data.loaded || {};
    const wait = sec => l[sec] === 'error' ? '<div class="empty slim"><p>Could not load.</p></div>' : '<p class="status-line">Loading…</p>';
    const last = data.period_stop && data.period_stop > data.period_start ? Fmt.addDays(data.period_stop, -1) : data.period_start;
    $('#rrRange', root).textContent = data.period_start ? `${ref ? 'Selected' : 'Current'} ${data.period === 'month' ? 'month' : 'day'} · ${last === data.period_start ? Fmt.date(data.period_start) : Fmt.date(data.period_start) + ' – ' + Fmt.date(last)}` : '';
    $('#rrKpis', root).innerHTML = s ? `<div class="kpi kpi-hero"><span>Item sales · served</span><b>${Fmt.money(s.served_subtotal)}</b><small>Before tax, completed orders only</small></div>
      <div class="kpi"><span>Served orders</span><b>${num(s.served_orders)}</b><small>Completion rate ${num(s.completion_rate)}%</small></div>
      <div class="kpi"><span>Average served bill</span><b>${Fmt.money(s.average_bill)}</b><small>Bill total ÷ served orders</small></div>
      <div class="kpi ${Number(s.cancelled_orders) ? 'kpi-bad' : ''}"><span>Cancelled orders</span><b>${num(s.cancelled_orders)}</b><small>${Fmt.money(s.cancelled_value)} · ${num(s.cancellation_rate)}%</small></div>` : '';
    const box = (id, html) => { const n = $(id, root); if (n) n.innerHTML = html; };
    box('#rrTrend', l.trend ? bars(data.trend || [], 'label', 'item_sales', v => Fmt.money(v), r => `${num(r.placed)} placed · ${num(r.served_orders)} served${r.future ? ' · not yet' : ''}`) : wait('trend'));
    box('#rrStatuses', l.statuses ? bars(data.statuses || [], 'status', 'order_count', num) : wait('statuses'));
    box('#rrHours', l.hours ? bars((data.hours || []).map(r => ({ ...r, label: r.label ?? r.hour })), 'label', 'item_sales', v => Fmt.money(v), r => `${num(r.order_count ?? r.served_orders ?? 0)} orders`) : wait('hours'));
    box('#rrWeekdays', l.weekdays ? bars((data.weekdays || []).map(r => ({ ...r, label: r.label ?? r.weekday })), 'label', 'item_sales', v => Fmt.money(v), r => `${num(r.order_count ?? r.served_orders ?? 0)} orders`) : wait('weekdays'));
    box('#rrDishes', l.dishes ? table(['Dish / size', 'Units', 'Orders', 'Item sales'], (data.dishes || []).map(r => [esc(r.dish_name) + (r.size && r.size !== 'single' ? ' — ' + esc(r.size_label || r.size) : ''), num(r.units), num(r.order_count), Fmt.money(r.item_sales)])) : wait('dishes'));
    box('#rrCats', l.categories ? bars(data.categories || [], 'category', 'item_sales', v => Fmt.money(v), r => `${num(r.units)} units`) : wait('categories'));
    box('#rrSizes', l.sizes ? table(['Size', 'Units', 'Item sales'], (data.sizes || []).map(r => [esc(sizeName(r)), num(r.units), Fmt.money(r.item_sales)])) : wait('sizes'));
    box('#rrTables', l.tables ? table(['Table', 'Orders', 'Item sales', 'Bill total'], (data.tables || []).map(r => [esc(RX.table(r.table_number)), num(r.order_count), Fmt.money(r.item_sales), Fmt.money(r.bill_total)])) : wait('tables'));
    box('#rrRecent', l.recent ? ((data.recent || []).length ? `<ul class="plain-list">${data.recent.map(o => `<li data-o="${esc(o.id)}"><span><b>${esc(RX.orderNo(o))} · ${esc(RX.table(o.table_number))}</b><small class="muted"> ${esc(Fmt.dateTime(o.created_at))}</small></span><span class="toolbar">${RX.statusBadge(o.status)}<b>${Fmt.money(o.total)}</b><button type="button" class="btn btn-sm btn-ghost" data-bill>Bill</button></span></li>`).join('')}</ul>` : '<div class="empty slim"><p>No orders in this period.</p></div>') : wait('recent'));
  }
  async function exportCSV(btn) {
    busy(btn, true, 'Preparing…');
    try {
      const d = await RX.rpc('restaurant_sales_analytics', { p_period: period, p_reference: ref }); const out = [['Restaurant report', d.period, d.period_start, d.period_stop], [], ['Summary', 'Value'], ...Object.entries(d.summary || {})];
      for (const [k, head] of [['dishes', 'Dish sales'], ['categories', 'Category sales'], ['tables', 'Table sales'], ['hours', 'Hourly sales'], ['weekdays', 'Weekday sales'], ['trend', 'Trend']]) { const rows = d[k] || []; if (!rows.length) continue; out.push([], [head], Object.keys(rows[0]), ...rows.map(r => Object.values(r).map(v => typeof v === 'object' ? JSON.stringify(v) : v))); }
      downloadFile(`restaurant-report-${d.period}-${d.period_start}.csv`, toCSV(out)); toast('Report exported.', 'ok');
    } catch (e) { toast(e.message, 'error'); } finally { busy(btn, false); }
  }
  async function reset() {
    const v = await ask({ title: 'Reset restaurant reports?', body: 'Reports start counting again from now. Orders, bills and stock are not changed.', confirm: 'Reset reports', danger: true, input: { label: 'Type RESET ANALYTICS to confirm', required: true } });
    if (v === null) return; if (v.trim() !== 'RESET ANALYTICS') return toast('Type RESET ANALYTICS exactly.', 'warn');
    try { await RX.rpc('restaurant_reset_analytics', { p_confirmation: 'RESET ANALYTICS', p_request_id: crypto.randomUUID() }); toast('Reports reset.', 'ok'); load(); } catch (e) { toast(e.message, 'error', 6000); }
  }
  function mount(view) {
    root = view;
    view.innerHTML = `<div class="page rx">${RX.head('Restaurant reports', 'QR and counter orders by hour, weekday, table, dish and size.', `<a class="btn" href="#/dashboard">${Icon('chart')} Dashboard</a><button type="button" class="btn" id="rrExport">${Icon('download')} Export CSV</button>`)}
      <div class="filters"><div class="seg" id="rrPeriod"><button type="button" data-p="day">Day</button><button type="button" data-p="month">Month</button></div><input type="date" id="rrDay" aria-label="Choose a day" style="width:auto"><input type="month" id="rrMonth" aria-label="Choose a month" style="width:auto" hidden><span class="hint" id="rrRange"></span></div>
      <p class="status-line" id="rrStatus" role="status"></p>
      <div class="kpis" id="rrKpis"></div>
      <div class="dash-grid">
        <section class="card span-2"><h2>Sales trend</h2><div id="rrTrend"></div></section><section class="card"><h2>Order outcomes</h2><div id="rrStatuses"></div></section>
        <section class="card"><h2>By hour of day</h2><div id="rrHours"></div></section><section class="card"><h2>By weekday</h2><div id="rrWeekdays"></div></section><section class="card"><h2>By category</h2><div id="rrCats"></div></section>
        <section class="card span-2"><h2>Dishes & sizes</h2><div id="rrDishes"></div></section><section class="card"><h2>Portion sizes</h2><div id="rrSizes"></div></section>
        <section class="card"><h2>Tables</h2><div id="rrTables"></div></section><section class="card span-2"><h2>Orders in this period</h2><div id="rrRecent"></div></section>
      </div>${RX.isAdmin() ? `<section class="card rx-danger"><div class="data-row danger-zone"><div><h3>Reset restaurant reports</h3><p class="hint">Reports start again from now. Orders, bills and stock stay as they are.</p></div><button type="button" class="btn btn-danger" id="rrReset">Reset reports…</button></div></section>` : ''}</div>`;
    const t = Fmt.today();
    $('#rrDay', view).max = t; $('#rrDay', view).value = t; $('#rrMonth', view).max = t.slice(0, 7); $('#rrMonth', view).value = t.slice(0, 7);
    const pick = () => { $('#rrDay', view).hidden = period !== 'day'; $('#rrMonth', view).hidden = period !== 'month'; }; pick();
    $('#rrPeriod', view).onclick = e => { const b = e.target.closest('[data-p]'); if (!b) return; period = b.dataset.p; ref = null; pick(); load(); };
    $('#rrDay', view).onchange = e => { ref = e.target.value && e.target.value !== t ? e.target.value : null; load(); };
    $('#rrMonth', view).onchange = e => { ref = e.target.value && e.target.value !== t.slice(0, 7) ? e.target.value + '-01' : null; load(); };
    $('#rrExport', view).onclick = e => exportCSV(e.currentTarget);
    $('#rrReset', view)?.addEventListener('click', reset);
    $('#rrRecent', view).onclick = e => { const li = e.target.closest('[data-o]'); const o = li && data.recent?.find(x => x.id === li.dataset.o); if (o && e.target.closest('[data-bill]')) Records.openBill(Cloud.orderToBill(o)); };
    load();
  }
  return { mount, unmount() { root = null; } };
})();

/* ---------------- Alerts on this device (runs in the background alert engine) ---------------- */
const AlertsPanel = (() => {
  let dialog = null;
  const CONTROLS = [['enableAllDeviceAlerts', 'Turn on sounds & notifications', 'Do this once on every kitchen phone or tablet and choose Allow.'], ['orderSoundButton', 'New order sound', 'Rings when a customer places an order.'], ['soundButton', 'Waiter call sound', 'Rings when a table calls a waiter.'], ['notificationSoundButton', 'Notification sound', 'Low-stock and blocked-browser alerts.'], ['backgroundAlertButton', 'Alerts when the app is closed', 'Phone notifications while this app is in the background.'], ['volumeTestButton', 'Volume test', 'Plays every alarm once at full volume.'], ['volumeStopButton', 'Stop volume test', ''], ['wakeLockButton', 'Keep screen awake', 'Stops a kitchen tablet from sleeping.']];
  function paint() {
    if (!dialog?.open) return; const st = RestaurantWorkspace.alertState();
    $('[data-ready]', dialog).textContent = st.ready || (st.connected ? '' : 'Starting alerts…');
    $('[data-list]', dialog).innerHTML = CONTROLS.map(([id, title, hint]) => { const c = st.controls?.[id]; if (!c || c.hidden) return ''; const sound = ['orderSoundButton', 'soundButton', 'notificationSoundButton'].includes(id), on = sound && /\bon\b/i.test(c.label) && !/muted|enable/i.test(c.label);
        const label = sound ? (on ? 'On · Mute' : 'Off · Turn on') : c.label;
        return `<div class="data-row"><div><h3>${esc(title)}${sound ? ` <span class="badge ${on ? 'badge-green' : ''}">${on ? 'On' : 'Off'}</span>` : ''}</h3>${hint ? `<p class="hint">${esc(hint)}</p>` : ''}</div><button type="button" class="btn ${!sound && c.pressed ? 'btn-primary' : ''}" data-cmd="${id}" ${c.disabled ? 'disabled' : ''}>${esc(sound ? (on ? 'Mute' : 'Turn on') : label)}</button></div>`; }).join('') || '<p class="status-line">Alert controls are loading…</p>';
  }
  function open() {
    dialog = modal('Alerts on this device', `<p class="hint">These settings belong to this phone or tablet. Sounds play only while the browser allows them; check the phone volume and Do Not Disturb.</p><p class="status-line" data-ready role="status"></p><div data-list></div>
      <div class="data-row"><div><h3>Alarm tunes</h3><p class="hint">Choose the shared tunes in Settings → Restaurant.</p></div><a class="btn btn-ghost" href="#/settings" data-close>Open settings</a></div>
      <div class="data-row"><div><h3>Test notification</h3><p class="hint">Shows a test notification on this device.</p></div><button type="button" class="btn" data-cmd="testNotification">Send test</button></div>`, { size: 'modal-md', onClose: () => { dialog = null; } });
    dialog.addEventListener('click', e => { const b = e.target.closest('[data-cmd]'); if (b) { RestaurantWorkspace.command(b.dataset.cmd); setTimeout(paint, 400); } });
    paint(); RestaurantWorkspace.command('state');
  }
  document.addEventListener('workspace:alert-state', paint);
  return { open };
})();

/* ---------------- Settings → Restaurant, and Staff & logins (waiter accounts) ---------------- */
const RestaurantSettings = (() => {
  const SECTIONS = [['live', 'Kitchen orders'], ['billing', 'Billing'], ['history', 'Records'], ['dashboard', 'Dashboard & reports'], ['requests', 'Requests'], ['tables', 'Tables & QR codes'], ['menu', 'Items & photos'], ['stocks', 'Stocks'], ['devices', 'Customer devices'], ['notifications', 'Notifications']];
  const WAITER_PERMS = [['enabled', 'Waiter app is on', 'Turn off to stop every waiter phone at once.'], ['view_orders', 'See open orders', ''], ['accept_orders', 'Accept new orders', ''], ['serve_orders', 'Mark orders served', ''], ['view_requests', 'See table and counter requests', ''], ['handle_requests', 'Mark requests handled', ''], ['alerts', 'Order and request sounds & notifications', '']];
  const TUNES = [['chime', 'Rising chime'], ['doorbell', 'Ding-dong'], ['bell', 'Bell'], ['none', 'Muted']];
  const sw = (name, on, title, desc = '', extra = '') => `<label class="switch"><input type="checkbox" name="${name}" ${on ? 'checked' : ''} ${extra}><span class="sw" aria-hidden="true"></span><span class="sw-text"><b>${esc(title)}</b>${desc ? `<small>${esc(desc)}</small>` : ''}</span></label>`;
  const safe = async (fn, fallback = null) => { try { return await fn(); } catch (e) { return { __error: e.message, ...(fallback || {}) }; } };
  const errLine = r => r?.__error ? `<p class="form-error">${esc(r.__error)}</p>` : '';
  let root = null;

  async function mount(body) {
    root = body; const admin = RX.isAdmin();
    body.innerHTML = '<div class="card"><p class="status-line">Loading restaurant settings…</p></div>';
    const custom = await Cloud.reloadCustom().catch(() => Cloud.custom());
    const [perms, alertsS, review, footer, retention, activity, contact] = await Promise.all([
      safe(() => RX.rpc('restaurant_manager_permissions', {})), admin ? safe(() => RX.rpc('restaurant_alert_settings', {})) : null, admin ? safe(() => RX.rpc('restaurant_review_settings', { p_url: null })) : null,
      admin ? safe(() => RX.rpc('restaurant_footer_settings', { p_show_credit: null, p_show_link: null, p_url: null })) : null, admin ? safe(() => RX.rpc('restaurant_retention_settings', { p_current_minutes: null, p_history_minutes: null })) : null,
      admin ? safe(() => RX.rpc('restaurant_activity_settings', {})) : null, safe(() => RX.rpc('restaurant_contact', {}))]);
    if (root !== body) return;
    const hidden = new Set(custom.hiddenSections || []);
    body.innerHTML = `<div class="stack">
      ${admin ? `<form class="card form-grid" id="rsMgr"><header class="span-2 card-head"><h2>What managers can do</h2><p class="hint">Admins always see everything.</p></header>
        <div class="span-2">${sw('rename', custom.managerCanRenameTables !== false, 'Rename tables', 'Managers can change table names. QR codes keep working.')}${sw('devices', perms.customer_devices === true, 'See and block customer browsers', 'Shows the Customer devices screen to managers.')}${sw('orderBlock', perms.order_device_block === true, 'Block a device from an order card', 'Shows Block device on kitchen order cards for managers.')}</div>
        <fieldset class="checks span-2"><legend>Screens managers can open</legend>${SECTIONS.map(([k, l]) => `<label class="check"><input type="checkbox" data-section="${k}" ${hidden.has(k) ? '' : 'checked'}> ${esc(l)}</label>`).join('')}</fieldset>
        ${errLine(perms)}<div class="form-actions span-2"><button class="btn btn-primary">Save manager access</button></div></form>` : ''}

      <form class="card form-grid" id="rsWaiter"><header class="span-2 card-head"><h2>Waiter app</h2><p class="hint">Waiters use their phones to see orders and table calls.</p></header>
        <label class="field"><span>Waiter app name</span><input name="app_name" maxlength="40" required placeholder="Waiter"></label>
        <label class="field"><span>Phone stays signed in for <em>hours, 1–24</em></span><input name="hours" type="number" min="1" max="24" step="1" inputmode="numeric" required></label>
        <div class="span-2">${admin ? sw('songs', false, 'Song requests', 'Customers can request a song from the menu.') : ''}${sw('waiterBilling', contact?.manual_waiter_access !== false, 'Waiters can make counter bills', 'Lets the waiter app create manual orders.')}</div>
        ${admin ? `<fieldset class="checks span-2" id="rsWaiterPerms"><legend>Waiter permissions</legend>${WAITER_PERMS.map(([k, l]) => `<label class="check"><input type="checkbox" data-wperm="${k}"> ${esc(l)}</label>`).join('')}</fieldset>` : ''}
        <p class="form-error span-2" role="alert" hidden></p>
        <div class="form-actions span-2"><button type="button" class="btn" id="rsWaiterQr">${Icon('qr')} Waiter sign-in QR</button>${admin ? `<button type="button" class="btn btn-danger-ghost" id="rsWaiterRotate">${Icon('refresh')} Sign out all & new QR</button>` : ''}<button class="btn btn-primary">Save waiter app</button></div></form>

      ${admin ? `<form class="card form-grid" id="rsTunes"><header class="span-2 card-head"><h2>Alarm tunes</h2><p class="hint">Shared by every kitchen device. Each device turns sounds on in Kitchen orders → Alerts.</p></header>
        ${[['orders', 'New orders'], ['waiter', 'Waiter calls'], ['notification', 'Notifications']].map(([k, l]) => `<label class="field"><span>${l}</span><select name="${k}">${TUNES.map(([v, t]) => `<option value="${v}" ${alertsS?.[k + '_sound'] === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`).join('')}
        ${errLine(alertsS)}<div class="form-actions span-2"><button type="button" class="btn" id="rsAlertsDevice">${Icon('bell')} Alerts on this device</button><button class="btn btn-primary">Save tunes</button></div></form>

      <form class="card form-grid" id="rsMenu"><header class="span-2 card-head"><h2>Customer menu</h2><p class="hint">Links shown on the QR menu.</p></header>
        <label class="field span-2"><span>Google review link <em>optional</em></span><input name="review" type="url" maxlength="2048" placeholder="https://g.page/r/…" value="${esc(review?.url || '')}"></label>
        <div class="span-2">${sw('credit', !!footer?.show_credit, 'Show “Powered by” line', 'Small credit line at the bottom of the menu.')}${sw('link', !!footer?.show_link, 'Make the credit line a link', '')}</div>
        <label class="field span-2"><span>Credit link address</span><input name="url" type="url" maxlength="2048" placeholder="https://your-website.com" value="${esc(footer?.url || '')}"></label>
        ${errLine(review)}${errLine(footer)}<div class="form-actions span-2"><button class="btn btn-primary">Save customer menu</button></div></form>` : ''}

      ${admin ? `<form class="card form-grid" id="rsPay"><header class="span-2 card-head"><h2>QR order payments</h2><p class="hint">Staff can record once how a QR order was paid, from Records → Bill.</p></header>
        <div class="span-2">${sw('edit', custom.orderRecordPaymentEdit !== false, 'Allow recording Cash or Online for QR orders', 'The choice is permanent once saved.')}</div>
        <label class="field"><span>Time allowed after the order <em>minutes, 5–1440</em></span><input name="minutes" type="number" min="5" max="1440" step="1" value="${Number(custom.orderRecordPaymentEditMinutes) || 120}"></label>
        <div class="form-actions span-2"><button class="btn btn-primary">Save payments</button></div></form>` : ''}

      ${admin ? `<form class="card form-grid" id="rsKeep"><header class="span-2 card-head"><h2>How long things stay</h2><p class="hint">In minutes. 1440 minutes is one day; 10080 is one week.</p></header>
        <label class="field"><span>Customer sees current orders for</span><input name="current" type="number" min="1" max="10080" step="1" value="${esc(retention?.current_minutes ?? '')}"></label>
        <label class="field"><span>Customer sees order history for</span><input name="history" type="number" min="1" max="10080" step="1" value="${esc(retention?.history_minutes ?? '')}"></label>
        <label class="field"><span>Notifications stay for</span><input name="notices" type="number" min="1" max="10080" step="1" value="${esc(activity?.notification_minutes ?? '')}"></label>
        <label class="field"><span>Requests stay for</span><input name="requests" type="number" min="1" max="10080" step="1" value="${esc(activity?.request_minutes ?? '')}"></label>
        ${errLine(retention)}${errLine(activity)}<div class="form-actions span-2"><button class="btn btn-primary">Save times</button></div></form>

      <section class="card"><header class="card-head"><h2>Customer menu design</h2><p class="hint">Layouts, themes, words, banner photos, the Request song button and Instagram / Google review offers are in Menu design. Category banners and the menu backup are in the older designer.</p></header>
        <div class="form-actions"><button type="button" class="btn" id="rsDesigner">${Icon('image')} Category banners & backup</button><a class="btn btn-primary" href="#/menuDesign">${Icon('palette')} Open Menu design</a></div><div id="rsDesignerBox" class="workspace-designer"></div></section>

      <section class="card"><header class="card-head"><h2>Permanent resets</h2><p class="hint">These cannot be undone. Export Records first.</p></header>
        <div class="data-row danger-zone"><div><h3>Delete all order records</h3><p class="hint">Deletes every finished order, dish sales history and daily order numbers. Stock is not changed. Active orders must be finished first.</p></div><button type="button" class="btn btn-danger" data-reset="records">Delete records…</button></div>
        <div class="data-row danger-zone"><div><h3>Delete all customer devices</h3><p class="hint">Removes saved customer browsers, blocks and blocked-browser alerts. Customers scan the table QR again.</p></div><button type="button" class="btn btn-danger" data-reset="devices">Delete devices…</button></div></section>` : ''}
    </div>`;
    wire(body, { custom, perms, admin, contact });
    loadWaiter(body, admin);
  }

  async function loadWaiter(body, admin) {
    const f = $('#rsWaiter', body); if (!f) return; [...f.elements].forEach(x => { x.disabled = true; });
    const [access, cfg, wp] = await Promise.all([safe(() => RX.rpc('restaurant_waiter_access_settings', { p_hours: null })), safe(() => RX.rpc('restaurant_waiter_config56', { p_app_name: null, p_song_requests: null })), admin ? safe(() => RX.rpc('restaurant_waiter_permissions', {})) : null]);
    if (!f.isConnected) return; [...f.elements].forEach(x => { x.disabled = false; });
    f.hours.value = access?.access_hours || 18; f.app_name.value = cfg?.app_name || 'Waiter';
    if (f.songs) f.songs.checked = cfg?.song_requests_enabled !== false;
    if (wp && !wp.__error) $$('[data-wperm]', f).forEach(c => { c.checked = !!wp[c.dataset.wperm]; });
    const err = [access, cfg, wp].find(x => x?.__error); if (err) { const e = $('.form-error', f); e.textContent = err.__error; e.hidden = false; }
  }

  function wire(body, { custom, perms, admin, contact }) {
    const save = async (e, work, ok) => { e.preventDefault(); const btn = e.submitter, err = $('.form-error', e.target); if (err) err.hidden = true; busy(btn, true, 'Saving…'); try { await work(e.target); toast(ok, 'ok'); } catch (ex) { if (err) { err.textContent = ex.message; err.hidden = false; } toast(ex.message, 'error', 6000); } finally { busy(btn, false); } };
    $('#rsMgr', body)?.addEventListener('submit', e => save(e, async f => {
      const hiddenSections = $$('[data-section]', f).filter(c => !c.checked).map(c => c.dataset.section);
      await Cloud.patchCustom({ hiddenSections, managerCanRenameTables: f.rename.checked });
      if (f.devices.checked !== (perms.customer_devices === true)) perms = await RX.rpc('restaurant_manager_permissions', { p_customer_devices: f.devices.checked });
      if (f.orderBlock.checked !== (perms.order_device_block === true)) perms = await RX.rpc('restaurant_manager_permissions', { p_order_device_block: f.orderBlock.checked });
      App.refreshMe(true).catch(() => {});
    }, 'Manager access saved. Managers see it within a minute.'));
    $('#rsWaiter', body)?.addEventListener('submit', e => save(e, async f => {
      const hours = Number(f.hours.value), name = f.app_name.value.trim();
      if (!Number.isInteger(hours) || hours < 1 || hours > 24) throw Error('Choose a whole number of hours from 1 to 24.');
      if (!name || name.length > 40) throw Error('Enter a waiter app name of 1 to 40 characters.');
      const cfg = await RX.rpc('restaurant_waiter_config56', { p_app_name: name, p_song_requests: admin && f.songs ? f.songs.checked : null }); if (cfg?.error) throw Error(cfg.error);
      await RX.rpc('restaurant_waiter_access_settings', { p_hours: hours });
      if (admin) { const args = {}; $$('[data-wperm]', f).forEach(c => { args['p_' + c.dataset.wperm] = c.checked; }); await RX.rpc('restaurant_waiter_permissions', args); }
      const c = await RX.rpc('restaurant_contact', {});
      if (!!c.manual_waiter_access !== f.waiterBilling.checked) await RX.rpc('restaurant_contact', { p_save: true, p_name: c.contact_name, p_phone: c.phone, p_details: c.details, p_waiter_billing: f.waiterBilling.checked });
    }, 'Waiter app saved.'));
    const waiterQr = async rotate => {
      if (rotate && !(await ask({ title: 'Sign out all waiter phones?', body: 'Every waiter phone that joined with the QR is signed out. Show the new QR to waiters to join again.', confirm: 'Sign out & new QR', danger: true }))) return;
      try {
        const r = await RX.rpc('restaurant_waiter_link', { p_rotate: rotate }); const link = new URL('../waiter.html', location.href); link.hash = 'pair=' + r.token;
        const d = modal('Waiter sign-in QR', `<div class="stack" style="align-items:center;text-align:center"><div class="qr-box">${QR.svg(link.href, 240)}</div><p class="hint">Waiters scan this with their phone camera. It works for ${Number(r.expires_in_hours || r.access_hours || 18)} hours per phone.</p><input readonly value="${esc(link.href)}" aria-label="Waiter link"><div class="toolbar"><button type="button" class="btn" data-copy>${Icon('copy')} Copy link</button><button type="button" class="btn" data-share>Share</button></div></div>`, { size: 'modal-sm' });
        d.addEventListener('click', async e => { if (e.target.closest('[data-copy]')) RX.copy(link.href, 'Waiter link copied.'); if (e.target.closest('[data-share]')) { try { if (navigator.share) await navigator.share({ title: 'Waiter app', url: link.href }); else RX.copy(link.href, 'Link copied.'); } catch { /* closed */ } } });
        if (rotate) toast('All waiter phones signed out. Share the new QR.', 'ok');
      } catch (e) { toast(e.message, 'error', 6000); }
    };
    $('#rsWaiterQr', body)?.addEventListener('click', () => waiterQr(false));
    $('#rsWaiterRotate', body)?.addEventListener('click', () => waiterQr(true));
    $('#rsAlertsDevice', body)?.addEventListener('click', () => AlertsPanel.open());
    let tuneRev = null;
    $('#rsTunes', body)?.addEventListener('submit', e => save(e, async f => {
      if (tuneRev === null) tuneRev = (await RX.rpc('restaurant_alert_settings', {})).revision;
      const s = await RX.rpc('restaurant_alert_settings', { p_settings: { voice_enabled: false, orders_sound: f.orders.value, waiter_sound: f.waiter.value, notification_sound: f.notification.value }, p_revision: tuneRev }); tuneRev = s.revision; RestaurantWorkspace.command('refresh');
    }, 'Alarm tunes saved for all kitchen devices.'));
    $('#rsMenu', body)?.addEventListener('submit', e => save(e, async f => {
      const r = await RX.rpc('restaurant_review_settings', { p_url: f.review.value.trim() }); f.review.value = r.url || '';
      const url = f.url.value.trim(); if (f.link.checked && !/^https:\/\//i.test(url)) throw Error('Enter a link starting with https:// or turn the link off.');
      await RX.rpc('restaurant_footer_settings', { p_show_credit: f.credit.checked, p_show_link: f.link.checked, p_url: url || null });
    }, 'Customer menu saved. Menus update within about 30 seconds.'));
    $('#rsPay', body)?.addEventListener('submit', e => save(e, async f => {
      const m = Number(f.minutes.value); if (!Number.isInteger(m) || m < 5 || m > 1440) throw Error('Choose 5 to 1440 minutes.');
      await Cloud.patchCustom({ orderRecordPaymentEdit: f.edit.checked, orderRecordPaymentEditMinutes: m });
    }, 'QR order payment setting saved.'));
    $('#rsKeep', body)?.addEventListener('submit', e => save(e, async f => {
      const [c, h, n, r] = ['current', 'history', 'notices', 'requests'].map(k => Number(f[k].value));
      if ([c, h, n, r].some(v => !Number.isInteger(v) || v < 1 || v > 10080)) throw Error('Use whole minutes from 1 to 10080.');
      if (h < c) throw Error('Order history must stay at least as long as current orders.');
      await RX.rpc('restaurant_retention_settings', { p_current_minutes: c, p_history_minutes: h });
      await RX.rpc('restaurant_activity_settings', { p_notification_minutes: n, p_request_minutes: r });
    }, 'Times saved.'));
    $('#rsDesigner', body)?.addEventListener('click', e => { e.currentTarget.hidden = true; RestaurantWorkspace.mountPanel($('#rsDesignerBox', body), 'management'); });
    body.addEventListener('click', async e => {
      const b = e.target.closest('[data-reset]'); if (!b) return; const scope = b.dataset.reset, phrase = scope === 'records' ? 'DELETE RECORDS' : 'DELETE DEVICES';
      const v = await ask({ title: scope === 'records' ? 'Delete all order records?' : 'Delete all customer devices?', body: 'This cannot be undone.', confirm: 'Delete permanently', danger: true, input: { label: `Type ${phrase} to confirm`, required: true } });
      if (v === null) return; if (v.trim() !== phrase) return toast(`Type ${phrase} exactly.`, 'warn');
      try { await RX.rpc('restaurant_admin_reset', { p_scope: scope, p_confirmation: phrase, p_request_id: crypto.randomUUID() }); toast(scope === 'records' ? 'All order records deleted.' : 'All customer devices deleted.', 'ok'); } catch (ex) { toast(ex.message, 'error', 8000); }
    });
    void custom; void contact;
  }

  /* Staff & logins: the restaurant's waiter accounts, drawn like the billing staff list. */
  async function waiters(body) {
    root = body;
    body.innerHTML = `<div class="card"><header class="card-head"><h2>Staff & logins</h2><p class="hint">Waiters sign in on the waiter app with their mobile number or email, and their password. Admin and manager logins are managed by support.</p></header>
      <form id="waForm" class="staff-form"><label class="field"><span>Name</span><input name="name" maxlength="60" required placeholder="e.g. Ravi" autocomplete="off"></label><label class="field"><span>Mobile number <em>to sign in with</em></span><input name="phone" type="tel" inputmode="numeric" maxlength="16" placeholder="98765 43210" autocomplete="off"></label><label class="field"><span>Email <em>optional with a mobile number</em></span><input name="email" type="email" placeholder="ravi@example.com" autocomplete="off"></label><label class="field"><span>Password <em>8+ characters</em></span><input name="password" type="text" minlength="8" required autocomplete="new-password"></label><button class="btn btn-primary">${Icon('plus')} Add waiter</button></form>
      <div class="summary" id="waSum"></div><p class="status-line" id="waStatus" role="status">Loading…</p>
      <div class="table-wrap"><table class="table cards-on-mobile"><thead><tr><th>Name</th><th>Status</th><th>Last seen</th><th></th></tr></thead><tbody id="waBody"></tbody></table></div></div>`;
    let phones = {};
    const paint = d => {
      const list = d.accounts || d.waiters || [], online = list.filter(a => a.online).length, active = list.filter(a => a.active !== false).length;
      $('#waSum', body).innerHTML = RX.sum('Waiters', list.length) + RX.sum('Online now', online, online ? 'big' : '') + RX.sum('With access', active) + (d.qr_devices ? RX.sum('Phones via QR', d.qr_devices) : '');
      $('#waStatus', body).textContent = '';
      $('#waBody', body).innerHTML = list.length ? list.map(a => `<tr data-u="${esc(a.user_id)}" data-n="${esc(a.name)}" class="${a.active === false ? 'is-muted' : ''}"><td data-label="Name"><b>${esc(a.name)}</b>${phones[a.user_id] ? `<small class="mono">${esc(phones[a.user_id].replace(/(\d{5})(\d{5})/, '$1 $2'))}</small>` : ''}${/@waiter\.login$/i.test(a.email) ? '' : `<small>${esc(a.email)}</small>`}</td>
        <td data-label="Status">${a.active === false ? '<span class="badge">Access off</span>' : a.online ? '<span class="badge badge-green">Online</span>' : a.signed_in ? '<span class="badge badge-soft">Signed in</span>' : '<span class="badge">Signed out</span>'}</td>
        <td data-label="Last seen">${esc(RX.when(a.last_seen))}</td>
        <td class="row-act">${a.active === false ? '<button type="button" class="btn btn-sm" data-a="restore">Give access</button>' : '<button type="button" class="btn btn-sm btn-ghost" data-a="revoke">Turn off</button>'}<button type="button" class="btn btn-sm btn-ghost" data-a="phone">${phones[a.user_id] ? 'Number' : 'Add number'}</button><button type="button" class="btn btn-sm btn-ghost" data-a="password">Password</button><button type="button" class="btn btn-sm btn-ghost" data-a="rename">Rename</button><button type="button" class="icon-btn" data-a="remove" aria-label="Delete ${esc(a.name)}">${Icon('trash')}</button></td></tr>`).join('')
        : '<tr><td colspan="4"><div class="empty slim"><p>No waiter logins yet. Add one above.</p></div></td></tr>';
    };
    const call = async (action, a = {}) => { const d = await RX.rpc('restaurant_waiter_accounts66', { p_action: action, p_email: a.email ?? null, p_password: a.password ?? null, p_name: a.name ?? null, p_user: a.user ?? null }); if (root === body) paint(d); return d; };
    const loadPhones = async () => { try { phones = (await Cloud.rpc('shop_staff_phones', {})) || {}; } catch { phones = {}; } };
    try { await loadPhones(); await call('list'); } catch (e) { $('#waStatus', body).textContent = /waiter_accounts66|schema cache|PGRST202/i.test(e.message) ? 'Waiter logins need a database update. Ask support to install it.' : e.message; }
    $('#waForm', body).onsubmit = async e => {
      e.preventDefault(); const f = e.target, digits = f.phone.value.replace(/\D/g, '').slice(-10), email = f.email.value.trim().toLowerCase();
      if (f.phone.value.trim() && digits.length !== 10) return toast('Enter a 10-digit mobile number.', 'warn');
      if (!digits && !email) return toast('Enter a mobile number or an email for this waiter.', 'warn');
      if (digits && !Cloud.hasV19?.()) return toast('Mobile number sign-in needs the database update UPDATE-v19.sql. Add an email for now.', 'warn', 7000);
      const login = email || digits + '@waiter.login';
      busy(e.submitter, true, 'Adding…');
      try {
        const d = await call('add', { name: f.name.value.trim(), email: login, password: f.password.value });
        if (digits) { const who = (d.accounts || d.waiters || []).find(a => String(a.email).toLowerCase() === login); if (who) { phones = await Cloud.rpc('shop_staff_phones', { p_user: who.user_id, p_phone: digits }) || phones; paint(d); } }
        toast(`${f.name.value.trim()} can now sign in on the waiter app${digits ? ' with ' + digits : ''}.`, 'ok', 6000); f.reset();
      } catch (ex) { toast(ex.message, 'error', 8000); } finally { busy(e.submitter, false); }
    };
    $('#waBody', body).addEventListener('click', async e => {
      const b = e.target.closest('[data-a]'), tr = b?.closest('tr'); if (!tr) return; const act = b.dataset.a, a = { user: tr.dataset.u }, name = tr.dataset.n;
      if (act === 'phone') {
        if (!Cloud.hasV19?.()) return toast('Mobile number sign-in needs the database update UPDATE-v19.sql.', 'warn', 7000);
        const v = await ask({ title: `Mobile number for ${name}`, body: 'They can sign in on the waiter app with this number and their password. Leave empty to remove it.', confirm: 'Save number', input: { label: 'Mobile number', value: phones[a.user] || '', maxlength: 16 } });
        if (v === null) return; const digits = v.replace(/\D/g, '').slice(-10);
        if (v.trim() && digits.length !== 10) return toast('Enter a 10-digit mobile number.', 'warn');
        try { phones = await Cloud.rpc('shop_staff_phones', { p_user: a.user, p_phone: digits || null, p_clear: !digits }) || {}; await call('list'); toast(digits ? 'Number saved.' : 'Number removed.', 'ok'); } catch (ex) { toast(ex.message, 'error', 6000); }
        return;
      }
      if (act === 'password') { const pw = await ask({ title: `New password for ${name}`, confirm: 'Set password', input: { label: 'New password (8+ characters)', required: true, maxlength: 72 } }); if (pw === null) return; if (pw.length < 8) return toast('Use at least 8 characters.', 'warn'); a.password = pw; }
      if (act === 'rename') { const n = await ask({ title: 'Rename waiter', confirm: 'Rename', input: { label: 'Name', value: name, required: true, maxlength: 60 } }); if (!n?.trim()) return; a.name = n.trim(); }
      if (act === 'revoke' && !(await ask({ title: `Turn off ${name}?`, body: 'They are signed out straight away.', confirm: 'Turn off', danger: true }))) return;
      if (act === 'remove' && !(await ask({ title: `Delete ${name}?`, body: 'Their login is removed. Orders they handled are kept.', confirm: 'Delete', danger: true }))) return;
      try { await call(act, a); toast({ password: 'Password changed.', rename: 'Name changed.', revoke: 'Access turned off.', restore: 'Access given.', remove: 'Waiter deleted.' }[act] || 'Saved.', 'ok'); } catch (ex) { toast(ex.message, 'error', 6000); }
    });
  }
  return { mount, waiters };
})();

/* js/menu-design.js?v=19 */
;/* Menu design — the customer QR menu: 20 layouts, 40 menu themes, every word, parts on/off, banner photos,
   the Request song button and the Instagram / Google review offers. A live phone preview shows the draft;
   Save publishes it for every customer (stored with the shared customization, key m17). */
'use strict';
const MenuDesign = (() => {
  const D = window.M17Data;
  const TABS = [['layout', 'Layout', 'grid'], ['theme', 'Theme', 'palette'], ['top', 'Top of menu', 'image'], ['cats', 'Categories', 'layers'], ['parts', 'Show / hide', 'sliders'], ['words', 'Words', 'edit'], ['offers', 'Offers', 'tag'], ['more', 'More', 'gear']];
  const clone = v => JSON.parse(JSON.stringify(v ?? {}));
  let catPhotos = {}, catBase = {};
  let root = null, draft = {}, base = {}, items = [], cats = [], tab = 'layout', song = null, songBase = null, themeFilter = 'all', pushTimer = 0, offersDb = null, review = '', loading = 0;

  /* ---------- small builders ---------- */
  const sw = (name, on, title, desc = '', extra = '') => `<label class="switch"><input type="checkbox" data-k="${name}" ${on ? 'checked' : ''} ${extra}><span class="sw" aria-hidden="true"></span><span class="sw-text"><b>${esc(title)}</b>${desc ? `<small>${esc(desc)}</small>` : ''}</span></label>`;
  const arch = () => D.ARCHS.find(a => a.id === draft.arch) || D.ARCHS[0];
  const theme = () => D.THEMES.find(t => t.id === draft.theme) || D.THEMES[0];
  const layoutNow = () => { const L = { ...arch() }, o = draft.layout || {}; for (const k of ['hero', 'info', 'nav', 'group', 'item']) if (o[k]) L[k] = o[k]; if (o.cols) L.cols = Number(o.cols); for (const k of ['spot', 'center', 'folded']) if (typeof o[k] === 'boolean') L[k] = o[k]; return L; };
  const partName = (k, v) => (D.PARTS[k].find(([x]) => x === String(v)) || [, v])[1];

  /* A tiny drawing of each layout so owners can see the difference before choosing. */
  function schematic(L) {
    const f = { bg: 'var(--surface)', soft: 'var(--surface-2)', line: 'var(--line)', ink: 'var(--ink-2)', acc: 'var(--primary)' };
    const r = (x, y, w, h, c, rx = 2, op = 1) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${c}" opacity="${op}"/>`;
    let y = 0, s = '';
    if (L.hero === 'carousel') { s += r(0, 0, 120, 34, f.acc, 0, .55); y = 34; }
    else if (L.hero === 'banner') { s += r(0, 0, 120, 10, f.soft, 0) + r(6, 12, 108, 24, f.acc, 4, .55); y = 38; }
    else if (L.hero === 'split') { s += r(6, 4, 108, 30, f.soft, 4) + r(12, 12, 40, 5, f.ink, 1) + r(12, 20, 28, 3, f.ink, 1, .5) + r(76, 8, 32, 22, f.acc, 3, .55); y = 36; }
    else if (L.hero === 'cover') { s += r(0, 0, 120, 46, f.acc, 0, .7) + `<circle cx="60" cy="22" r="6" fill="${f.bg}"/>` + r(40, 31, 40, 4, f.bg, 1); y = 46; }
    else if (L.hero === 'compact') { s += r(0, 0, 120, 10, f.soft, 0); y = 10; } else { s += r(0, 0, 120, 8, f.soft, 0); y = 8; }
    if (L.info === 'sheet') { s += r(0, y - 5, 120, 16, f.bg, 5) + r(6, y - 1, 46, 4, f.ink, 1) + r(6, y + 5, 30, 3, f.ink, 1, .5) + r(100, y - 1, 14, 9, '#1ba672', 2); y += 12; }
    else if (L.info === 'inline') { s += r(4, y + 2, 112, 15, f.bg, 3) + `<rect x="4" y="${y + 2}" width="112" height="15" rx="3" fill="none" stroke="${f.line}"/>` + r(9, y + 6, 40, 3.5, f.ink, 1) + r(9, y + 12, 26, 2.5, f.ink, 1, .5); y += 19; }
    let x0 = 4, w = 112;
    if (L.nav === 'chips' || L.nav === 'tabs') { for (let i = 0; i < 4; i++) s += r(4 + i * 28, y + 2, 25, 6, i ? f.soft : (L.nav === 'tabs' ? f.bg : f.ink), 3) + (L.nav === 'tabs' && !i ? r(4, y + 8, 25, 1.5, f.acc, 0) : ''); y += 11; }
    if (L.nav === 'tiles') { for (let i = 0; i < 4; i++) s += r(4 + i * 28, y + 2, 22, 16, i ? f.soft : f.acc, 3, i ? 1 : .5); y += 20; }
    if (L.nav === 'rail') { s += r(0, y, 22, 150 - y, f.soft, 0); for (let i = 0; i < 5; i++) s += `<circle cx="11" cy="${y + 9 + i * 17}" r="5.5" fill="${i ? f.line : f.acc}" opacity="${i ? 1 : .6}"/>`; x0 = 26; w = 90; }
    if (L.spot) { s += r(x0, y + 2, 30, 4, f.ink, 1); for (let i = 0; i < 3; i++) s += r(x0 + i * 34, y + 8, 30, 20, f.acc, 3, .35); y += 30; }
    const cols = Math.max(1, Math.min(3, L.cols || 1));
    const head = () => { s += r(x0, y + 3, 36, 4.5, f.ink, 1) + (L.group === 'accordion' ? `<circle cx="${x0 + w - 4}" cy="${y + 5}" r="3" fill="${f.soft}"/>` : ''); y += 10; };
    for (let blk = 0; blk < 3 && y < 145; blk++) {
      head();
      if (L.group === 'accordion' && L.folded && blk) { y += 2; continue; }
      const n = L.group === 'tabs' && blk ? 0 : 2;
      for (let i = 0; i < n && y < 145; i++) {
        const it = L.item;
        if (L.group === 'shelves') { for (let k = 0; k < 3; k++) s += r(x0 + k * 40, y, 36, 26, f.acc, 3, .35) + r(x0 + k * 40 + 2, y + 28, 22, 3, f.ink, 1); y += 34; break; }
        if (it === 'row' || it === 'rowLeft') { const px = it === 'row' ? x0 + w - 24 : x0; const tx = it === 'row' ? x0 : x0 + 28; s += r(px, y, 24, 22, f.acc, 3, .45) + r(px + 3, y + 18, 18, 6, f.bg, 2) + `<rect x="${px + 3}" y="${y + 18}" width="18" height="6" rx="2" fill="none" stroke="${f.acc}" stroke-width=".7"/>` + r(tx, y + 3, 44, 4, f.ink, 1) + r(tx, y + 10, 20, 3, f.ink, 1, .6) + r(tx, y + 16, 54, 2.5, f.ink, 1, .35); y += 29; }
        else if (it === 'thumb') { s += `<circle cx="${x0 + 8}" cy="${y + 8}" r="8" fill="${f.acc}" opacity=".45"/>` + r(x0 + 20, y + 3, 44, 4, f.ink, 1) + r(x0 + 20, y + 10, 22, 3, f.ink, 1, .6) + r(x0 + w - 18, y + 4, 18, 7, f.bg, 2) + `<rect x="${x0 + w - 18}" y="${y + 4}" width="18" height="7" rx="2" fill="none" stroke="${f.acc}" stroke-width=".7"/>`; y += 20; }
        else if (it === 'text' || it === 'fine') { if (it === 'fine') { s += r(x0 + w / 2 - 22, y + 2, 44, 4.5, f.ink, 1) + r(x0 + w / 2 - 10, y + 9, 20, 3, f.ink, 1, .6) + r(x0 + w / 2 - 30, y + 15, 60, 2.5, f.ink, 1, .35); y += 22; } else { s += r(x0, y + 2, 36, 4, f.ink, 1) + `<line x1="${x0 + 40}" x2="${x0 + w - 16}" y1="${y + 5}" y2="${y + 5}" stroke="${f.ink}" stroke-dasharray="1 2" opacity=".6"/>` + r(x0 + w - 14, y + 2, 14, 4, f.ink, 1) + r(x0, y + 9, 60, 2.5, f.ink, 1, .35); y += 16; } }
        else if (it === 'wide' || it === 'story') { s += r(x0, y, w, 36, f.acc, 4, it === 'story' ? .8 : .45) + (it === 'story' ? r(x0 + 4, y + 26, 40, 4, f.bg, 1) : r(x0, y + 39, 44, 4, f.ink, 1)); y += it === 'story' ? 40 : 47; }
        else { const c = it === 'tile' ? 3 : (it === 'bento' && !i ? 1 : cols > 1 ? cols : 2), gap = 4, cw = (w - gap * (c - 1)) / c, h = it === 'gallery' ? 30 : it === 'tile' ? 18 : 22; for (let k = 0; k < c; k++) s += r(x0 + k * (cw + gap), y, cw, (it === 'gallery' && k % 2 ? h - 8 : h), f.acc, 3, .4) + r(x0 + k * (cw + gap) + 2, y + h + 2, cw * .6, 3, f.ink, 1); y += h + 9; }
      }
    }
    if (L.nav === 'pill') s += r(86, 132, 28, 11, f.ink, 4) + r(92, 136, 16, 3, f.bg, 1);
    return `<svg class="md-schem" viewBox="0 0 120 150" aria-hidden="true">${r(0, 0, 120, 150, f.bg, 0)}${s}</svg>`;
  }
  function swatch(t) {
    return `<span class="md-swatch" style="background:${t.bg};border-color:${t.line}"><i style="background:${t.card};border-color:${t.line}"><em style="background:${t.ink}"></em><u style="background:${t.sub}"></u><s style="color:${t.accent};border-color:${t.accent};background:${t.dark ? t.card : '#fff'}">ADD</s></i><b style="background:${t.accent}"></b></span>`;
  }

  /* ---------- preview ---------- */
  function payload() {
    const custom = Cloud.custom() || {};
    return { custom: { ...custom, m17: draft, categoryPhotos: catPhotos }, items, categories: cats, table: 'Table 1' };
  }
  function push(now = false) {
    clearTimeout(pushTimer);
    const go = () => { const f = root && $('#mdFrame', root); try { f?.contentWindow?.postMessage({ type: 'm17-preview', payload: payload() }, location.origin); } catch { /* frame not ready */ } };
    if (now) go(); else pushTimer = setTimeout(go, 120);
  }
  function changed() {
    const dirty = JSON.stringify(draft) !== JSON.stringify(base) || song !== songBase || JSON.stringify(catPhotos) !== JSON.stringify(catBase);
    const b = root && $('#mdDirty', root); if (b) b.hidden = !dirty;
    for (const id of ['#mdSave', '#mdUndo']) { const x = root && $(id, root); if (x) x.disabled = !dirty; }
    push();
  }
  const onMsg = e => { if (e.origin === location.origin && e.data?.type === 'm17-preview-ready') push(true); };
  const onLeave = e => { if (root && $('#mdDirty', root) && !$('#mdDirty', root).hidden) { e.preventDefault(); e.returnValue = ''; } };

  /* ---------- tabs ---------- */
  function layoutTab() {
    const L = layoutNow(), o = draft.layout || {}, a = arch();
    const sel = (k, label) => `<label class="field"><span>${label}</span><select data-layout="${k}"><option value="">Layout default — ${esc(partName(k, a[k]))}</option>${D.PARTS[k].map(([v, l]) => `<option value="${v}" ${String(o[k] ?? '') === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
    const tri = (k, label, desc) => sw('lay-' + k, !!L[k], label, desc);
    return `<section class="card"><div class="card-title-row"><div><h2>Choose a layout</h2><p class="hint">20 complete menu layouts. Each one changes the banner, the category menu and how every dish is drawn.</p></div></div>
      <div class="theme-grid md-arch-grid" role="list">${D.ARCHS.map(x => `<button type="button" role="listitem" class="theme-card md-arch ${x.id === a.id ? 'on' : ''}" data-arch="${x.id}" aria-pressed="${x.id === a.id}">${schematic({ ...x })}<b>${esc(x.name)}</b><small>${esc(x.note)}</small>${x.id === a.id ? `<span class="tc-on">${Icon('check')}</span>` : ''}</button>`).join('')}</div></section>
      <section class="card form-grid"><header class="span-2 card-head"><h2>Mix your own</h2><p class="hint">Change any part of the layout you picked. “Layout default” keeps what the layout uses.</p></header>
        ${sel('hero', 'Banner')}${sel('info', 'Restaurant info')}${sel('nav', 'Category menu')}${sel('group', 'Categories')}${sel('item', 'Dish style')}${sel('cols', 'Columns (cards and tiles)')}
        <div class="span-2 md-switches">${tri('spot', 'Best sellers slider on top', 'Shows dishes marked best seller or recommended.')}${tri('center', 'Centred headings', 'Elegant, centred category names.')}${tri('folded', 'Start with categories folded', 'For folding categories: customers open the one they want.')}</div>
        <div class="form-actions span-2"><button type="button" class="btn" id="mdLayoutReset" ${Object.keys(o).length ? '' : 'disabled'}>${Icon('refresh')} Use the layout as it is</button></div></section>`;
  }
  function themeTab() {
    const t = theme(), list = D.THEMES.filter(x => themeFilter === 'all' || (themeFilter === 'dark' ? x.dark : !x.dark));
    const fonts = Object.keys(D.FONTS).map(f => `<option ${f === draft.font ? 'selected' : ''}>${esc(f)}</option>`).join('');
    const bfonts = Object.keys(D.FONTS).map(f => `<option ${f === draft.bodyFont ? 'selected' : ''}>${esc(f)}</option>`).join('');
    const radius = draft.radius !== undefined && draft.radius !== '' ? Number(draft.radius) : t.radius;
    return `<section class="card"><div class="card-title-row"><div><h2>Menu theme</h2><p class="hint">40 themes only for the customer menu. The kitchen and billing screens keep their own theme.</p></div>
        <div class="seg" id="mdThemeFilter">${[['all', 'All 40'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => `<button type="button" data-tf="${k}" class="${themeFilter === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="theme-grid md-theme-grid" role="list">${list.map(x => `<button type="button" role="listitem" class="theme-card ${x.id === t.id ? 'on' : ''}" data-theme17="${x.id}" aria-pressed="${x.id === t.id}">${swatch(x)}<b>${esc(x.name)}</b><small>${x.dark ? 'Dark' : 'Light'} · ${esc(x.head)}</small>${x.id === t.id ? `<span class="tc-on">${Icon('check')}</span>` : ''}</button>`).join('')}</div></section>
      <section class="card form-grid"><header class="span-2 card-head"><h2>Fine-tune</h2><p class="hint">Optional changes on top of the theme.</p></header>
        <div class="field span-2"><div class="color-row">${sw('accentOn', !!draft.accent, 'Use my own button colour')}<label class="color-custom"><input type="color" id="mdAccent" value="${esc(draft.accent || t.accent)}" aria-label="Button colour"><span class="mono">${esc(draft.accent || t.accent)}</span></label></div></div>
        <label class="field"><span>Heading font</span><select id="mdFont"><option value="">Theme font — ${esc(t.head)}</option>${fonts}</select></label>
        <label class="field"><span>Text font</span><select id="mdBodyFont"><option value="">Theme font — ${esc(t.body)}</option>${bfonts}</select></label>
        <label class="field"><span>Corner roundness <em id="mdRadiusV">${radius}px</em></span><input type="range" id="mdRadius" min="0" max="28" step="1" value="${radius}"></label>
        <div class="field"><span>Spacing</span><div class="seg" id="mdDensity">${[['cozy', 'Roomy'], ['compact', 'Compact']].map(([k, l]) => `<button type="button" data-dn="${k}" class="${(draft.density || 'cozy') === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <div class="form-actions span-2"><button type="button" class="btn" id="mdTuneReset">${Icon('refresh')} Use the theme as it is</button></div></section>`;
  }
  function textField(k, def, wide = false) {
    const v = draft.texts?.[k] ?? '', label = D.TEXT_LABELS[k] || k, long = k === 'about' || def.length > 60;
    const input = long ? `<textarea data-text="${k}" rows="${k === 'about' ? 4 : 2}" maxlength="600" placeholder="${esc(def || 'Not shown when empty')}">${esc(v)}</textarea>` : `<input data-text="${k}" maxlength="${k === 'rating' ? 8 : 160}" value="${esc(v)}" placeholder="${esc(def || 'Not shown when empty')}">`;
    return `<label class="field ${wide || long ? 'span-2' : ''}"><span>${esc(label)}</span>${input}</label>`;
  }
  function topTab() {
    const slides = draft.hero?.slides || [];
    const group = D.TEXTS.find(([g]) => g === 'Top of the menu')[1];
    return `<section class="card"><div class="card-title-row"><div><h2>Banner photos</h2><p class="hint">Up to 8 photos for the slider or banner. Without photos the menu uses category photos, then dish photos.</p></div>
        <div class="toolbar"><label class="btn file-btn">${Icon('plus')} Add photo<input type="file" id="mdSlideFile" accept="image/png,image/jpeg,image/webp" hidden></label><button type="button" class="btn" id="mdSlideLink">Add by link</button></div></div>
      <div class="md-slides">${slides.length ? slides.map((x, n) => `<div class="md-slide" data-n="${n}"><img src="${esc(RestaurantCloud.safeImage(x.src))}" alt=""><label class="field"><span>Caption <em>optional</em></span><input data-cap="${n}" maxlength="120" value="${esc(x.caption || '')}" placeholder="e.g. Fresh momos every morning"></label>
          <div class="toolbar"><button type="button" class="icon-btn" data-slide="up" aria-label="Move up" ${n ? '' : 'disabled'}>${Icon('up')}</button><button type="button" class="icon-btn" data-slide="down" aria-label="Move down" ${n < slides.length - 1 ? '' : 'disabled'}>${Icon('down')}</button><button type="button" class="btn btn-sm btn-danger-ghost" data-slide="del">Remove</button></div></div>`).join('') : '<p class="hint md-empty">No banner photos yet.</p>'}</div></section>
      <section class="card form-grid"><header class="span-2 card-head"><h2>Restaurant info</h2><p class="hint">Shown under the banner. Leave a line empty to hide it.</p></header>
        ${group.map(([k, def]) => textField(k, def, k === 'location' || k === 'time')).join('')}</section>`;
  }
  /* ---------- category banners ---------- */
  function catsTab() {
    const style = draft.catBanner || 'banner', list = cats.length ? cats : [...new Set(items.map(i => i.category).filter(Boolean))];
    const opt = (v, t, d) => `<label class="md-cb-opt ${style === v ? 'on' : ''}"><input type="radio" name="mdCatStyle" value="${v}" ${style === v ? 'checked' : ''}><span class="md-cb-pic md-cb-${v}" aria-hidden="true"><i></i><b></b><b></b></span><span><b>${t}</b><small>${d}</small></span></label>`;
    return `<section class="card"><header class="card-head"><h2>How categories start</h2><p class="hint">Applies to every layout. Categories without a photo show just their name.</p></header>
        <div class="md-cb-opts">${opt('banner', 'Big banner photo', 'A wide picture with the category name on it.')}${opt('thumb', 'Small photo', 'A small square picture beside the name.')}${opt('none', 'Name only', 'No pictures — just the category name.')}</div></section>
      <section class="card"><div class="card-title-row"><div><h2>Category photos</h2><p class="hint">Each category has its own photo. Photos are cropped to a wide banner (about 2 : 1) and shrunk to load fast. They are also used for category tiles, the side rail and — when you have no banner photos — the photo slider.</p></div></div>
        ${list.length ? `<div class="md-cats">${list.map((c, n) => { const src = RestaurantCloud.safeImage(catPhotos[c] || ''); return `<div class="md-cat" data-cat="${esc(c)}" data-n="${n}">
            <div class="md-cat-pic">${src ? `<img src="${esc(src)}" alt="">` : `<span>${Icon('image')}<small>No photo</small></span>`}<b>${esc(c)}</b></div>
            <div class="toolbar"><label class="btn btn-sm file-btn">${Icon('upload')} ${src ? 'Change' : 'Add photo'}<input type="file" data-catfile="${n}" accept="image/png,image/jpeg,image/webp" hidden></label><button type="button" class="btn btn-sm btn-ghost" data-catlink="${n}">Link</button>${src ? `<button type="button" class="btn btn-sm btn-danger-ghost" data-catdel="${n}">Remove</button>` : ''}</div></div>`; }).join('')}</div>`
        : `<div class="md-empty"><p>No categories yet. Add dishes and categories in Items first.</p></div>`}</section>`;
  }
  /* Crops to a 2:1 banner, at most 1400 px wide, WebP — small and quick for customers. */
  async function bannerData(file) {
    if (!file || !/^image\/(png|jpe?g|webp)$/.test(file.type)) throw Error('Choose a PNG, JPEG or WebP photo.');
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(Error('This photo could not be opened.')); i.src = url; });
      const W = Math.min(1400, Math.max(600, img.naturalWidth)), H = Math.round(W / 2), c = document.createElement('canvas'); c.width = W; c.height = H;
      const r = Math.max(W / img.naturalWidth, H / img.naturalHeight), w = img.naturalWidth * r, h = img.naturalHeight * r;
      c.getContext('2d').drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
      for (const q of [0.82, 0.72, 0.6, 0.5]) { const d = c.toDataURL('image/webp', q); if (d.startsWith('data:image/webp') && d.length * 0.75 < 900000) return d; }
      return c.toDataURL('image/jpeg', 0.7);
    } finally { URL.revokeObjectURL(url); }
  }
  function partsTab() {
    const s = { ...D.SHOW_DEFAULTS, ...(draft.show || {}) };
    const desc = { song: 'Also turns song requests on or off for customers.', offers: 'Set the offers in the Offers tab.', cooking: 'Customers can write a note for each dish.', photos: 'Turn off for a text-only menu.' };
    return `<section class="card"><div class="card-title-row"><div><h2>Show or hide parts of the menu</h2><p class="hint">Switch off anything you do not want customers to see.</p></div><div class="toolbar"><button type="button" class="btn btn-sm" id="mdAllOn">Show all</button></div></div>
      <div class="md-switches md-switch-grid">${D.SHOW.map(([k, label]) => sw('show-' + k, k === 'song' ? song !== false && s.song !== false : s[k] !== false, label, desc[k] || '')).join('')}</div>
      ${song === null ? '<p class="hint">Song requests setting could not be loaded. The switch still hides the button.</p>' : ''}</section>`;
  }
  function wordsTab() {
    return D.TEXTS.filter(([g]) => g !== 'Top of the menu' && g !== 'Offers').map(([g, rows]) => `<section class="card form-grid"><header class="span-2 card-head"><h2>${esc(g)}</h2></header>${rows.map(([k, def]) => textField(k, def)).join('')}</section>`).join('')
      + `<section class="card"><div class="data-row"><div><h3>Start again</h3><p class="hint">Puts every word back to the original. Restaurant info and offer words are kept.</p></div><button type="button" class="btn" id="mdWordsReset">${Icon('refresh')} Reset words</button></div></section>`;
  }
  function offersForm(o) {
    return `<div class="md-offer-grid">
      <fieldset class="md-offer"><legend>${Icon('insta')} Instagram follow</legend>${sw('of-insta', o.insta.on, 'Give a discount for following us', 'Customers tap Follow, follow your page, tick the box and apply.')}
        <label class="field"><span>Instagram handle</span><div class="md-prefix"><b>@</b><input data-of="handle" maxlength="30" value="${esc(o.insta.handle)}" placeholder="yourrestaurant" autocapitalize="off" spellcheck="false"></div></label>
        <label class="field"><span>Discount <em>₹</em></span><input data-of="instaAmount" type="number" min="1" max="10000" step="1" inputmode="numeric" value="${o.insta.amount}"></label></fieldset>
      <fieldset class="md-offer"><legend>${Icon('star')} Google 5-star review</legend>${sw('of-review', o.review.on, 'Give a discount for a Google review', 'Customers open your review page, post a 5-star review, tick the box and apply.')}
        <label class="field"><span>Google review link</span><input data-of="url" type="url" maxlength="2048" value="${esc(o.review.url || review)}" placeholder="https://g.page/r/…/review"></label>
        <label class="field"><span>Discount <em>₹</em></span><input data-of="reviewAmount" type="number" min="1" max="10000" step="1" inputmode="numeric" value="${o.review.amount}"></label></fieldset></div>
      <div class="field"><span>When both are on</span><div class="seg" data-of-mode>${[['one', 'One offer per order'], ['both', 'Both together']].map(([k, l]) => `<button type="button" data-mode="${k}" class="${o.mode === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <p class="hint">Each phone can use an offer once in 12 hours. The kitchen sees the offer on the order and can remove it if the customer did not follow or review.</p>`;
  }
  function readOffers(box, prev) {
    const raw = clone(prev || D.OFFER_DEFAULTS); raw.insta ||= {}; raw.review ||= {};
    raw.insta.on = $('[data-k="of-insta"]', box).checked; raw.insta.handle = $('[data-of="handle"]', box).value.trim().replace(/^@+/, '');
    raw.insta.amount = Number($('[data-of="instaAmount"]', box).value); raw.review.on = $('[data-k="of-review"]', box).checked;
    raw.review.url = $('[data-of="url"]', box).value.trim(); raw.review.amount = Number($('[data-of="reviewAmount"]', box).value);
    raw.mode = $('[data-of-mode] .on', box)?.dataset.mode === 'both' ? 'both' : 'one';
    return raw;
  }
  function offerProblems(raw) {
    const out = [];
    if (raw.insta.on && !/^[A-Za-z0-9._]{1,30}$/.test(raw.insta.handle)) out.push('Enter the Instagram handle (letters, numbers, dots and underscores).');
    if (raw.review.on && !/^https:\/\/\S+$/.test(raw.review.url)) out.push('Enter the Google review link that starts with https://');
    for (const [on, a] of [[raw.insta.on, raw.insta.amount], [raw.review.on, raw.review.amount]]) if (on && !(Number.isInteger(a) && a >= 1 && a <= 10000)) out.push('Discounts must be whole rupees from 1 to 10000.');
    return [...new Set(out)];
  }
  function offersTab() {
    const o = D.offers(draft.offers), raw = { ...D.OFFER_DEFAULTS, ...clone(draft.offers || {}) };
    raw.insta = { ...D.OFFER_DEFAULTS.insta, ...(raw.insta || {}) }; raw.review = { ...D.OFFER_DEFAULTS.review, ...(raw.review || {}) };
    const words = D.TEXTS.find(([g]) => g === 'Offers')[1];
    const status = offersDb === false ? `<div class="notice notice-bad"><b>One database step is needed before offers work.</b> Run <code>SUPABASE/MENU-OFFERS-v18.sql</code> once in Supabase → SQL Editor. Until then customers can see the offers but cannot use them.</div>`
      : offersDb === true ? '' : '';
    return `<section class="card" id="mdOffers"><div class="card-title-row"><div><h2>Offers for customers</h2><p class="hint">Get more followers and Google reviews: give a small discount on the order.</p></div><span class="badge ${o.insta.on || o.review.on ? 'badge-green' : ''}">${o.insta.on || o.review.on ? 'On' : 'Off'}</span></div>
      ${status}${offersForm(raw)}<p class="form-error" id="mdOfferErr" role="alert" hidden></p></section>
      <details class="card md-details"><summary><b>Offer words</b><small class="hint">What customers read in the offer cards.</small></summary><div class="form-grid">${words.map(([k, def]) => textField(k, def)).join('')}</div></details>`;
  }
  function moreTab() {
    return `<section class="card"><div class="md-switches">${sw('enabled', draft.enabled !== false, 'Use this menu design', 'Switch off to go back to the old menu page.')}</div></section>
      <section class="card"><div class="data-row"><div><h3>Back up this design</h3><p class="hint">Download the layout, theme, words and offers as a file, or load a file you saved.</p></div><div class="toolbar"><button type="button" class="btn" id="mdExport">${Icon('download')} Download</button><label class="btn file-btn">${Icon('up')} Load file<input type="file" id="mdImport" accept="application/json,.json" hidden></label></div></div>
        <div class="data-row"><div><h3>Dish photos and portions</h3><p class="hint">Category photos are in the Categories tab. Dish photos, portions and category order are in Items → Photos & portions.</p></div><a class="btn" href="#/itemDetails">${Icon('image')} Photos & portions</a></div>
        <div class="data-row danger-zone"><div><h3>Start over</h3><p class="hint">Puts the whole menu design back to the first layout and theme. Nothing is published until you press Save.</p></div><button type="button" class="btn btn-danger-ghost" id="mdResetAll">Reset design…</button></div></section>`;
  }
  function paint() {
    if (!root) return;
    $$('#mdTabs button', root).forEach(b => { const on = b.dataset.tab === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    const body = $('#mdBody', root);
    body.innerHTML = { layout: layoutTab, theme: themeTab, top: topTab, cats: catsTab, parts: partsTab, words: wordsTab, offers: offersTab, more: moreTab }[tab]();
    changed();
  }

  /* ---------- events ---------- */
  function setText(k, v) { draft.texts ||= {}; if (v === '') delete draft.texts[k]; else draft.texts[k] = v; }
  function syncOffers() {
    const box = $('#mdOffers', root); if (!box) return;
    const raw = readOffers(box, draft.offers); draft.offers = raw;
    const err = $('#mdOfferErr', root), p = offerProblems(raw); err.hidden = !p.length; err.textContent = p.join(' ');
  }
  function wire() {
    $('#mdTabs', root).onclick = e => { const b = e.target.closest('[data-tab]'); if (!b) return; tab = b.dataset.tab; paint(); b.scrollIntoView({ block: 'nearest', inline: 'center' }); };
    const body = $('#mdBody', root);
    body.addEventListener('click', async e => {
      const t = e.target;
      const a = t.closest('[data-arch]'); if (a) { draft.arch = a.dataset.arch; paint(); return; }
      const th = t.closest('[data-theme17]'); if (th) { draft.theme = th.dataset.theme17; paint(); return; }
      const tf = t.closest('[data-tf]'); if (tf) { themeFilter = tf.dataset.tf; paint(); return; }
      const dn = t.closest('[data-dn]'); if (dn) { if (dn.dataset.dn === 'cozy') delete draft.density; else draft.density = dn.dataset.dn; paint(); return; }
      const md = t.closest('[data-mode]'); if (md) { $$('[data-mode]', md.parentElement).forEach(x => x.classList.toggle('on', x === md)); syncOffers(); changed(); return; }
      const sl = t.closest('[data-slide]'); if (sl) { const n = Number(sl.closest('[data-n]').dataset.n), list = draft.hero.slides; if (sl.dataset.slide === 'del') list.splice(n, 1); else { const m = sl.dataset.slide === 'up' ? n - 1 : n + 1; [list[n], list[m]] = [list[m], list[n]]; } paint(); return; }
      const cl = t.closest('[data-catlink]'); if (cl) {
        const c = cl.closest('[data-cat]').dataset.cat;
        const url = await ask({ title: `Photo for ${c}`, body: 'Paste an image address that starts with https://', confirm: 'Use photo', input: { label: 'Image link', type: 'url', placeholder: 'https://…', required: true, value: catPhotos[c] || '' } });
        if (!url) return; if (!RestaurantCloud.safeImage(url.trim())) { toast('Use an image link that starts with https://', 'error'); return; }
        catPhotos = { ...catPhotos, [c]: url.trim() }; paint(); return;
      }
      const cd = t.closest('[data-catdel]'); if (cd) { const c = cd.closest('[data-cat]').dataset.cat; catPhotos = { ...catPhotos }; delete catPhotos[c]; paint(); return; }
      if (t.closest('#mdLayoutReset')) { delete draft.layout; paint(); return; }
      if (t.closest('#mdTuneReset')) { for (const k of ['accent', 'font', 'bodyFont', 'radius', 'density']) delete draft[k]; paint(); return; }
      if (t.closest('#mdAllOn')) { draft.show = {}; song = songBase === null ? null : true; paint(); return; }
      if (t.closest('#mdWordsReset')) { const keep = new Set(D.TEXTS.filter(([g]) => g === 'Top of the menu' || g === 'Offers').flatMap(([, r]) => r.map(([k]) => k))); for (const k of Object.keys(draft.texts || {})) if (!keep.has(k)) delete draft.texts[k]; paint(); toast('Words reset. Press Save to publish.'); return; }
      if (t.closest('#mdSlideLink')) {
        const url = await ask({ title: 'Add banner photo by link', body: 'Paste an image address that starts with https://', confirm: 'Add photo', input: { label: 'Image link', type: 'url', placeholder: 'https://…', required: true } });
        if (!url) return; if (!RestaurantCloud.safeImage(url.trim())) { toast('Use an image link that starts with https://', 'error'); return; }
        addSlide(url.trim()); return;
      }
      if (t.closest('#mdExport')) { downloadFile('menu-design.json', JSON.stringify({ kind: 'menu-design', version: 18, m17: draft }, null, 2), 'application/json'); return; }
      if (t.closest('#mdResetAll')) { if (await ask({ title: 'Reset the menu design?', body: 'Layout, theme, words, switches, banner photos and offers go back to the start. Nothing changes for customers until you press Save.', confirm: 'Reset design', danger: true })) { draft = {}; paint(); } return; }
    });
    body.addEventListener('input', e => {
      const t = e.target;
      if (t.dataset.text) { setText(t.dataset.text, t.value); changed(); return; }
      if (t.dataset.cap !== undefined) { draft.hero.slides[Number(t.dataset.cap)].caption = t.value; changed(); return; }
      if (t.id === 'mdAccent') { draft.accent = t.value; const on = $('[data-k="accentOn"]', root); if (on) on.checked = true; t.nextElementSibling.textContent = t.value; changed(); return; }
      if (t.id === 'mdRadius') { draft.radius = Number(t.value); $('#mdRadiusV', root).textContent = t.value + 'px'; changed(); return; }
      if (t.closest('#mdOffers')) { syncOffers(); changed(); }
    });
    body.addEventListener('change', async e => {
      const t = e.target, k = t.dataset.k;
      if (t.dataset.layout) { draft.layout ||= {}; if (t.value) draft.layout[t.dataset.layout] = t.dataset.layout === 'cols' ? Number(t.value) : t.value; else delete draft.layout[t.dataset.layout]; if (!Object.keys(draft.layout).length) delete draft.layout; paint(); return; }
      if (k?.startsWith('lay-')) { draft.layout ||= {}; draft.layout[k.slice(4)] = t.checked; changed(); return; }
      if (k?.startsWith('show-')) { const key = k.slice(5); draft.show ||= {}; if (t.checked === D.SHOW_DEFAULTS[key]) delete draft.show[key]; else draft.show[key] = t.checked; if (key === 'song' && songBase !== null) song = t.checked; changed(); return; }
      if (k === 'accentOn') { if (t.checked) draft.accent = $('#mdAccent', root).value; else delete draft.accent; changed(); return; }
      if (k === 'enabled') { if (t.checked) delete draft.enabled; else draft.enabled = false; changed(); return; }
      if (k?.startsWith('of-')) { syncOffers(); changed(); return; }
      if (t.id === 'mdFont') { if (t.value) draft.font = t.value; else delete draft.font; changed(); return; }
      if (t.id === 'mdBodyFont') { if (t.value) draft.bodyFont = t.value; else delete draft.bodyFont; changed(); return; }
      if (t.name === 'mdCatStyle') { if (t.value === 'banner') delete draft.catBanner; else draft.catBanner = t.value; paint(); return; }
      if (t.dataset.catfile !== undefined) {
        const f = t.files[0], c = t.closest('[data-cat]').dataset.cat, box = t.closest('.md-cat'); t.value = ''; if (!f) return;
        box.classList.add('is-busy');
        try { toast('Uploading photo…'); const url = await RestaurantCloud.uploadMenuImage(await bannerData(f)); catPhotos = { ...catPhotos, [c]: url }; paint(); toast(`Photo ready for ${c}. Press Save to publish.`, 'ok'); }
        catch (ex) { box.classList.remove('is-busy'); toast('Photo not added: ' + ex.message, 'error', 6000); }
        return;
      }
      if (t.id === 'mdSlideFile') { const f = t.files[0]; t.value = ''; if (!f) return; try { toast('Uploading photo…'); const data = await imageToDataURL(f, 1600, 900000); const url = await RestaurantCloud.uploadMenuImage(data); addSlide(url); } catch (ex) { toast('Photo not added: ' + ex.message, 'error', 6000); } return; }
      if (t.id === 'mdImport') { const f = t.files[0]; t.value = ''; if (!f) return; try { const j = JSON.parse(await f.text()); if (j?.kind !== 'menu-design' || typeof j.m17 !== 'object') throw Error('This is not a menu design file.'); draft = clone(j.m17); paint(); toast('Design loaded. Press Save to publish.', 'ok'); } catch (ex) { toast(ex.message, 'error'); } }
    });
    $('#mdSave', root).onclick = save;
    $('#mdUndo', root).onclick = () => { draft = clone(base); song = songBase; catPhotos = clone(catBase); paint(); toast('Changes undone.'); };
    $('#mdDevice', root).onclick = e => { const b = e.target.closest('[data-dev]'); if (!b) return; $$('#mdDevice button', root).forEach(x => x.classList.toggle('on', x === b)); $('.md-phone', root).classList.toggle('wide', b.dataset.dev === 'wide'); };
    $('#mdReload', root).onclick = async e => { busy(e.currentTarget, true, 'Loading…'); try { await loadMenu(); push(true); toast('Dishes refreshed.', 'ok'); } catch (ex) { toast(ex.message, 'error'); } finally { busy(e.currentTarget, false); } };
    $('#mdFrame', root).addEventListener('load', () => push(true));
  }
  function addSlide(src) { draft.hero ||= {}; draft.hero.slides ||= []; if (draft.hero.slides.length >= 8) { toast('Up to 8 banner photos.', 'warn'); return; } draft.hero.slides.push({ src, caption: '' }); paint(); toast('Photo added. Press Save to publish.', 'ok'); }

  async function save() {
    const btn = $('#mdSave', root);
    if (draft.offers) { const p = offerProblems(draft.offers); if (p.length) { tab = 'offers'; paint(); toast(p[0], 'error', 6000); return; } }
    busy(btn, true, 'Saving…');
    try {
      const next = clone(draft); if (next.texts && !Object.keys(next.texts).length) delete next.texts; if (next.show && !Object.keys(next.show).length) delete next.show;
      const photosChanged = JSON.stringify(catPhotos) !== JSON.stringify(catBase);
      await Cloud.patchCustom(photosChanged ? { m17: next, categoryPhotos: clone(catPhotos) } : { m17: next });
      catBase = clone(catPhotos);
      if (song !== null && song !== songBase) { const r = await RX.rpc('restaurant_waiter_config56', { p_app_name: null, p_song_requests: song }); if (r?.error) throw Error(r.error); songBase = song; }
      base = clone(next); draft = clone(next); changed(); toast('Menu design saved. Customers see it the next time the menu loads.', 'ok');
    } catch (e) { toast(e.message, 'error', 7000); } finally { busy(btn, false); changed(); }
  }
  async function loadMenu() {
    const rows = await RestaurantCloud.menu(true);
    items = rows.map(r => ({ ...r, price: Number(r.price), image: RestaurantCloud.safeImage(r.image) }));
    cats = (RestaurantCloud.categories || []).slice(1);
  }
  async function mount(view) {
    root = view; const id = ++loading;
    view.innerHTML = `<div class="page md-page"><header class="page-head"><div><h1>Menu design</h1><p class="sub">How the QR menu looks on customers’ phones. Try anything — the preview changes at once. Press Save to publish.</p></div>
      <div class="head-actions"><span class="badge badge-amber" id="mdDirty" hidden>Not saved</span><button type="button" class="btn" id="mdUndo" disabled>Undo changes</button><button type="button" class="btn btn-primary" id="mdSave" disabled>${Icon('check')} Save</button></div></header>
      <div class="md-split"><div class="md-main"><div class="seg seg-scroll md-tabs" id="mdTabs" role="tablist">${TABS.map(([k, l, ic]) => `<button type="button" role="tab" data-tab="${k}">${Icon(ic)}<span>${l}</span></button>`).join('')}</div><div id="mdBody" class="stack"><div class="card"><p class="status-line">Loading menu design…</p></div></div></div>
      <aside class="md-side" aria-label="Live preview"><div class="md-phone"><iframe id="mdFrame" title="Customer menu preview" src="../menu-preview.html?v=19"></iframe></div>
        <div class="md-side-foot"><div class="seg" id="mdDevice"><button type="button" data-dev="phone" class="on">Phone</button><button type="button" data-dev="wide">Wide</button></div><button type="button" class="btn btn-sm" id="mdReload">${Icon('refresh')} Refresh dishes</button></div>
        <p class="hint md-side-note">Preview only — tapping ADD here does not order.</p></aside></div></div>`;
    addEventListener('message', onMsg); addEventListener('beforeunload', onLeave);
    wire();
    try {
      const custom = await Cloud.reloadCustom().catch(() => Cloud.custom());
      const [, cfg, rv] = await Promise.all([loadMenu().catch(e => { toast('Dishes could not be loaded: ' + e.message, 'error'); }),
        RX.rpc('restaurant_waiter_config56', { p_app_name: null, p_song_requests: null }).catch(() => null), RX.rpc('restaurant_review_settings', { p_url: null }).catch(() => null)]);
      if (id !== loading || root !== view) return;
      base = clone(custom.m17 || {}); draft = clone(base);
      catBase = Object.fromEntries(Object.entries(custom.categoryPhotos || {}).filter(([, v]) => RestaurantCloud.safeImage(v))); catPhotos = clone(catBase);
      songBase = cfg && typeof cfg.song_requests_enabled === 'boolean' ? cfg.song_requests_enabled : null; song = songBase;
      if (songBase === false && draft.show?.song !== false) { draft.show ||= {}; draft.show.song = false; base = clone(draft); }
      review = rv?.url || '';
      RX.rpc('restaurant_order_offer17', { p_order: null, p_action: 'check' }).then(() => { offersDb = true; }, e => { offersDb = !/restaurant_order_offer17|PGRST202|schema cache|Could not find/i.test(e.message); if (tab === 'offers') paint(); });
      paint(); push(true);
    } catch (e) { $('#mdBody', view).innerHTML = `<div class="card"><p class="form-error">${esc(e.message)}</p></div>`; }
  }
  function unmount() { removeEventListener('message', onMsg); removeEventListener('beforeunload', onLeave); clearTimeout(pushTimer); root = null; loading++; }

  /* ---------- Offers from Kitchen orders ---------- */
  async function offersModal() {
    let custom; try { custom = await Cloud.reloadCustom(); } catch { custom = Cloud.custom(); }
    const m = clone(custom.m17 || {}), raw = { ...D.OFFER_DEFAULTS, ...clone(m.offers || {}) };
    raw.insta = { ...D.OFFER_DEFAULTS.insta, ...(raw.insta || {}) }; raw.review = { ...D.OFFER_DEFAULTS.review, ...(raw.review || {}) };
    if (!raw.review.url) { try { review = (await RX.rpc('restaurant_review_settings', { p_url: null }))?.url || ''; } catch { /* optional */ } }
    const d = modal('Customer offers', `<form id="koForm" class="stack">${offersForm(raw)}<p class="form-error" role="alert" hidden></p>
      <footer class="modal-foot"><a class="btn btn-ghost" href="#/menuDesign" data-close>More menu settings</a><button class="btn btn-primary">${Icon('check')} Save offers</button></footer></form>`, { size: 'modal-lg' });
    const f = $('#koForm', d);
    f.addEventListener('click', e => { const md = e.target.closest('[data-mode]'); if (md) $$('[data-mode]', f).forEach(x => x.classList.toggle('on', x === md)); });
    f.addEventListener('submit', async e => {
      e.preventDefault(); const err = $('.form-error', f), next = readOffers(f, m.offers), p = offerProblems(next);
      if (p.length) { err.textContent = p.join(' '); err.hidden = false; return; }
      busy(e.submitter, true, 'Saving…');
      try { const cur = await Cloud.reloadCustom(); await Cloud.patchCustom({ m17: { ...clone(cur.m17 || {}), offers: next } }); toast('Offers saved. Customers see them the next time the menu loads.', 'ok'); d.close(); }
      catch (ex) { err.textContent = ex.message; err.hidden = false; } finally { busy(e.submitter, false); }
    });
  }
  return { mount, unmount, offersModal, schematic };
})();

/* js/settings.js?v=19 */
;/* Shop settings. Each section follows its permission, so managers can get the Billing tab without shop details. */
'use strict';
const Settings = (() => {
  let root = null, section = null, draftBill = null, draftLogo = null, draftInv = null;
  const SECTIONS = [
    ['shop', 'Shop details', 'settings_shop', 'store'], ['billing', 'Billing', 'settings_tax', 'bill'], ['design', 'Bill design', 'settings_design', 'printer'],
    ['extras', 'Bill extras', 'settings_design', 'qr'], ['staff', 'Staff & logins', 'staff', 'users'], ['perms', 'Permissions', ['roles_manager', 'roles_cashier'], 'lock'],
    ['contact', 'Contact info', 'settings_contact', 'phone'], ['restaurant', 'Restaurant', 'restaurant_settings', 'store'], ['limits', 'Limits', 'limits', 'sliders'], ['data', 'Data', 'reset', 'download']];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const TIMEZONES = ['Asia/Kolkata', 'Asia/Kathmandu', 'Asia/Dhaka', 'Asia/Karachi', 'Asia/Colombo', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York'];
  const FEATURES = [
    ['extra_items', 'Extra items', 'Bill something that is not in the item list.'],
    ['cash_received', 'Cash received box', 'Type the cash given to see the change. Needed for short-cash bills.'],
    ['customer_details', 'Customer name & phone', 'Ask for the customer’s name and phone.'],
    ['notes', 'Note on bill', 'A short note that prints on the bill.'],
    ['whatsapp', 'Send bill on WhatsApp', 'WhatsApp button after saving a bill.'],
    ['qty_badges', 'Quantity on item tiles', 'Show ×2, ×3… on an item already on the bill.'],
    ['stock_badges', 'Stock on item tiles', 'Show “12 left” and “Out of stock” while billing.'],
    ['item_codes_on_tiles', 'Item codes on tiles', 'Show the barcode / code under each item name.']];
  const ITEM_FIELDS = [['hsn', 'HSN / SAC code', 'Tax classification code, printed in its own column.'], ['alias', 'Name on bill', 'A different name to print on the bill (e.g. Hindi name).'],
    ['description', 'Description', 'A longer note about the item, also shown on the menu.']];
  const sw = (name, on, title, desc = '', extra = '') => `<label class="switch"><input type="checkbox" name="${name}" ${on ? 'checked' : ''} ${extra}><span class="sw" aria-hidden="true"></span><span class="sw-text"><b>${title}</b>${desc ? `<small>${desc}</small>` : ''}</span></label>`;
  const swMini = (name, on, label) => `<label class="switch mini" title="${esc(label)}"><input type="checkbox" name="${name}" ${on ? 'checked' : ''} aria-label="${esc(label)}"><span class="sw" aria-hidden="true"></span><span class="sw-cap">On bill</span></label>`;

  async function saveSettings(patch, btn, msg = 'Settings saved.') {
    busy(btn, true, 'Saving…');
    try { Store.me.settings = await Cloud.rpc('shop_settings_save', { p: patch }); App.applyShop(); toast(msg, 'ok'); return true; }
    catch (e) { toast(e.message, 'error', 6000); return false; } finally { busy(btn, false); }
  }

  /* ---------- shop details ---------- */
  function shopSection(s) {
    draftLogo = s.logo || '';
    const tzs = TIMEZONES.includes(s.timezone) ? TIMEZONES : [s.timezone, ...TIMEZONES];
    const sf = k => Receipt.showField(s, k);
    const row = (key, label, input, wide = false) => `<div class="field-row ${wide ? 'span-2' : ''}"><label class="field"><span>${label}</span>${input}</label>${swMini('show_' + key, sf(key), label + ' on bill')}</div>`;
    return `<form id="fShop" class="card form-grid">
      <header class="span-2 card-head"><h2>Shop details</h2><p class="hint">Printed at the top of every bill. Use the switches to choose what appears on the bill.</p></header>
      <div class="span-2 logo-row-wrap"><div class="field"><span>Logo</span><div class="logo-row"><div class="logo-box" id="logoBox"></div><label class="btn file-btn">${Icon('upload')} Choose image<input type="file" accept="image/png,image/jpeg,image/webp" hidden id="logoFile"></label><button type="button" class="btn btn-ghost" id="logoRemove">Remove</button></div></div>${swMini('show_logo', sf('logo'), 'Logo on bill')}</div>
      ${row('name', 'Shop name', `<input name="shop_name" required maxlength="80" value="${esc(s.shop_name)}">`, true)}
      ${row('tagline', 'Tagline <em>optional</em>', `<input name="tagline" maxlength="120" value="${esc(s.tagline)}" placeholder="e.g. Fresh groceries daily">`, true)}
      ${row('address', 'Address', `<textarea name="address" rows="2" maxlength="300">${esc(s.address)}</textarea>`, true)}
      ${row('phone', 'Phone', `<input name="phone" maxlength="60" value="${esc(s.phone)}" placeholder="Separate numbers with commas">`)}
      ${row('email', 'Email', `<input name="email" type="email" maxlength="120" value="${esc(s.email)}">`)}
      ${row('website', 'Website', `<input name="website" maxlength="120" value="${esc(s.website)}" placeholder="www.yourshop.in">`)}
      ${row('tax_id', 'GSTIN / tax line', `<input name="tax_id" maxlength="80" value="${esc(s.tax_id)}" placeholder="GSTIN: 22AAAAA0000A1Z5">`)}
      ${row('pan', 'PAN', `<input name="pan" maxlength="20" value="${esc(s.pan)}" placeholder="ABCDE1234F" style="text-transform:uppercase">`)}
      ${row('fssai', 'FSSAI licence no.', `<input name="fssai" maxlength="30" value="${esc(s.fssai)}" placeholder="14-digit number" inputmode="numeric">`)}
      <label class="field"><span>Currency symbol</span><input name="currency" maxlength="5" required value="${esc(s.currency)}"></label>
      <label class="field"><span>Time zone</span><select name="timezone">${tzs.map(t => `<option ${t === s.timezone ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
      <div class="form-actions span-2 sticky-save"><button class="btn btn-primary btn-lg">Save shop details</button></div></form>`;
  }
  function paintLogo() { const b = $('#logoBox', root); if (b) b.innerHTML = draftLogo ? `<img src="${esc(draftLogo)}" alt="Shop logo">` : '<span>No logo</span>'; }

  /* ---------- billing ---------- */
  function billingSection(s) {
    const sys = Store.sys, p = sys.payments || {}, f = sys.features || {};
    return `<form id="fBill" class="admin-stack">
      <section class="card form-grid"><header class="span-2 card-head"><h2>Tax</h2></header>
        <div class="span-2">${sw('tax_enabled', s.tax_enabled, 'Add tax to bills')}</div>
        <div class="span-2 form-grid sub-box" data-tax ${s.tax_enabled ? '' : 'hidden'}>
          <input type="hidden" name="tax_scope" value="bill">
          <label class="field"><span>Tax name on bill</span><input name="tax_label" maxlength="30" value="${esc(s.tax_label)}" placeholder="GST"></label>
          <label class="field" data-billtax><span>Tax type</span><select name="tax_mode"><option value="percent" ${s.tax_mode === 'percent' ? 'selected' : ''}>Percent of bill</option><option value="fixed" ${s.tax_mode === 'fixed' ? 'selected' : ''}>Fixed amount per bill</option></select></label>
          <label class="field"><span data-ratelabel>${s.tax_scope === 'item' ? 'Default tax % (items without their own rate)' : 'Tax value'}</span><input name="tax_value" type="number" min="0" step="0.01" value="${Number(s.tax_value)}"></label>
          <div class="span-2 switches">${sw('tax_split', s.tax_split, 'Show as CGST + SGST', 'Splits the tax into two equal halves on the bill, e.g. GST 5% → CGST 2.5% + SGST 2.5%.')}
          <div data-itemtax>${sw('tax_inclusive_default', s.tax_inclusive_default, 'Extra items already include tax', 'For items typed in at the counter.')}</div></div>
          <p class="hint span-2">One rate for the whole bill, worked out after discounts. Customers’ QR orders use the same rate.</p>
        </div></section>
      <section class="card" id="invCard"><header class="card-head"><h2>Invoice & order numbers</h2><p class="hint">Every paid bill gets the next invoice number of the year — INV001, INV002 … INV365 … — counter bills and QR orders alike. Order numbers (#1, #2 …) start again from 1 every day.</p></header>
        <div id="invBody"><p class="hint">Loading…</p></div></section>
      <section class="card"><header class="card-head"><h2>Stock</h2></header>
        <p class="hint">Dishes with tracked stock stop selling when they run out — on the counter and on the QR menu.</p><input type="hidden" name="stock_mode" value="stop">
        ${sw('stock_shown', !s.stock_hidden, 'Show stock', 'Turn off to hide the Stocks screen and stock numbers for everyone except Admin. Sales still count stock in the background.')}</section>
      ${Store.moduleOn('expenses') ? `<section class="card"><header class="card-head"><h2>Profit on the dashboard</h2></header>
        <div class="field"><span>Take expenses off the profit?</span><div class="seg seg-wide" role="radiogroup">
          <label><input type="radio" name="exp_profit" value="yes" ${s.expenses_in_profit !== false ? 'checked' : ''}><span><b>Yes</b><small>Net profit = sales − expenses</small></span></label>
          <label><input type="radio" name="exp_profit" value="no" ${s.expenses_in_profit === false ? 'checked' : ''}><span><b>No</b><small>Net profit = selling price − buying price</small></span></label></div></div></section>` : ''}
      <section class="card"><header class="card-head"><h2>Payment methods</h2><p class="hint">Only these appear on the billing screen.</p></header>
        <div class="pay-toggles">${['Cash', 'UPI', 'Card'].map(m => m === 'Card' && Cloud.hasAddon ? sw('pay_' + m, false, 'Card', 'Restaurant orders record Cash or Online (UPI).', 'disabled') : sw('pay_' + m, p[m] !== false, m === 'UPI' && Cloud.hasAddon ? 'UPI / Online' : m)).join('')}</div></section>
      <section class="card"><header class="card-head"><h2>Billing screen</h2></header>
        <div class="switches two">${FEATURES.map(([k, t, dsc]) => sw('f_' + k, Store.feature(k), t, dsc)).join('')}</div></section>
      <section class="card"><header class="card-head"><h2>Item form fields</h2><p class="hint">Extra fields on the Add item screen. Turn on only what your shop needs.</p></header>
        <div class="switches two">${ITEM_FIELDS.map(([k, t, dsc]) => sw('if_' + k, Store.itemField(k), t, dsc)).join('')}</div></section>
      <div class="form-actions sticky-save"><button class="btn btn-primary btn-lg">Save billing settings</button></div></form>`;
  }

  /* ---------- bill design ---------- */
  const FLAGS = [['showCustomer', 'Customer details'], ['showCashier', 'Who made the bill'], ['showPayment', 'Payment method'], ['showCash', 'Cash received & change'], ['showItemCount', 'Item & quantity count'],
                 ['showSavings', '“You saved” line'], ['showHsn', 'HSN column'], ['showItemDiscount', 'Item discount column'], ['showCode', 'Item codes']];
  const BILL_COLORS = ['#1f2937', '#1f5fbf', '#0f7a5a', '#b42318', '#6d3fc0', '#c2410c'];
  function designSection(s) {
    draftBill = { ...Receipt.design(s) }; draftBill.labels = { ...(draftBill.labels || {}) };
    const b = draftBill, L = Receipt.LABELS;
    return `<div class="design-wrap"><form id="fDesign" class="admin-stack">
      <section class="card"><header class="card-head"><h2>Template</h2></header>
        <div class="tpl-gallery">${Receipt.TEMPLATES.map(([k, l, dsc]) => `<label class="tpl-card"><input type="radio" name="template" value="${k}" ${b.template === k ? 'checked' : ''}><span class="tpl-thumb tpl-${k}"><i></i><i></i><i></i><i></i></span><b>${l}</b><small>${dsc}</small></label>`).join('')}</div>
        <div class="field" style="margin-top:14px"><span>Bill colour <em>A4/A5 and colour printers</em></span><div class="color-row">${BILL_COLORS.map(c => `<label class="swatch sm"><input type="radio" name="color" value="${c}" ${b.color === c ? 'checked' : ''}><span style="--c:${c}"></span></label>`).join('')}<label class="color-custom"><input type="color" name="colorCustom" value="${esc(b.color)}" aria-label="Custom colour"><span class="mono">${esc(b.color)}</span></label></div></div></section>
      <section class="card form-grid"><header class="span-2 card-head"><h2>Paper & text</h2></header>
        <label class="field"><span>Paper</span><select name="paper"><option value="80" ${b.paper === '80' ? 'selected' : ''}>80 mm thermal roll</option><option value="58" ${b.paper === '58' ? 'selected' : ''}>58 mm thermal roll</option><option value="a5" ${b.paper === 'a5' ? 'selected' : ''}>A5 sheet</option><option value="a4" ${b.paper === 'a4' ? 'selected' : ''}>A4 sheet</option></select></label>
        <label class="field"><span>Text size</span><input name="fontSize" type="number" min="9" max="18" value="${Number(b.fontSize)}"></label>
        <label class="field"><span>Heading alignment</span><select name="align">${['left', 'center', 'right'].map(a => `<option value="${a}" ${b.align === a ? 'selected' : ''}>${a[0].toUpperCase() + a.slice(1)}</option>`).join('')}</select></label>
        <label class="field"><span>Bill title <em>optional</em></span><input name="titleText" maxlength="40" value="${esc(b.titleText)}" placeholder="Cash memo, Tax invoice"></label>
        <label class="field span-2"><span>Extra line under the shop details <em>optional</em></span><textarea name="headerText" rows="2" maxlength="300">${esc(b.headerText)}</textarea></label>
        <label class="field span-2"><span>Message at the bottom</span><textarea name="footerText" rows="2" maxlength="300">${esc(b.footerText)}</textarea></label></section>
      <section class="card"><header class="card-head"><h2>Print on the bill</h2><p class="hint">Shop name, address, GSTIN, PAN and FSSAI are switched on or off in Shop details.</p></header>
        <div class="switches two">${FLAGS.map(([k, l]) => sw(k, b[k], l)).join('')}</div>
        <details class="label-editor"><summary>Words printed on the bill</summary><p class="hint">Change any word, e.g. “TOTAL” to “Grand Total”. Leave empty for the default.</p>
          <div class="form-grid">${Object.keys(L).map(k => `<label class="field"><span>${esc(Receipt.LABEL_NAMES[k])}</span><input data-label="${k}" maxlength="30" placeholder="${esc(L[k])}" value="${esc(b.labels[k] || '')}"></label>`).join('')}</div></details></section>
      <div class="form-actions sticky-save"><button type="button" class="btn" id="testPrint">${Icon('printer')} Test print</button><button class="btn btn-primary btn-lg">Save bill design</button></div></form>
      <aside class="design-preview"><h3>Preview <small>sample bill</small></h3><div class="bill-paper" id="designPreview"></div></aside></div>`;
  }
  function sampleBill() {
    const s = Store.settings, item = s.tax_enabled && s.tax_scope === 'item';
    const lines = [{ name: 'Veg Steamed Momos — Full', hsn: '996331', code: 'M01', qty: 2, unit: 'pcs', price: 120, discount_pct: 0, tax_rate: 5, incl: false },
                   { name: 'Paneer Tikka', alias: 'पनीर टिक्का', hsn: '996331', code: 'P02', qty: 1, unit: 'plate', price: 220, discount_pct: 0, tax_rate: 5, incl: false },
                   { name: 'Cold Coffee', hsn: '996331', code: 'D05', qty: 3, unit: 'glass', price: 95, discount_pct: 0, tax_rate: 5, incl: false }];
    const t = Calc.bill(lines, s, { discount: { mode: 'percent', value: 5 }, canDiscount: true });
    return { bill_no: (s.invoice_numbers?.prefix ?? s.bill_prefix ?? 'INV') + '042', invoice_no: 'sample', order_no: 12, table_number: 'Counter', created_at: new Date().toISOString(), cashier_name: Store.me.name, customer_name: 'Amit Kumar', customer_phone: '98765 43210', customer_address: Store.feature('customer_address') ? '12, MG Road, Patna' : '',
      items: lines.map((l, i) => ({ ...l, line_total: t.lines[i].total, discount: t.lines[i].disc })), items_subtotal: t.sub, discount_mode: 'percent', discount_value: 5, discount_amount: t.disc,
      tax_enabled: s.tax_enabled, tax_mode: s.tax_mode, tax_value: s.tax_value, tax_label: s.tax_label, tax_amount: t.tax, tax_scope: item ? 'item' : 'bill', tax_split: s.tax_split, tax_breakdown: t.breakdown,
      round_off: t.round, less_amount: 0, total: t.total, cash_received: Math.ceil(t.total / 100) * 100, change_amount: Math.ceil(t.total / 100) * 100 - t.total, payment_method: 'Cash', status: 'Paid', notes: '',
      custom_fields: ((draftInv || s.invoice || {}).custom_fields?.enabled ? ((draftInv || s.invoice).custom_fields.fields || []) : []).slice(0, 6).map(l => ({ label: l, value: 'Sample value' })) };
  }
  function readDesign() {
    const f = $('#fDesign', root); if (!f) return;
    for (const k of ['paper', 'align', 'titleText', 'headerText', 'footerText']) draftBill[k] = f[k].value;
    draftBill.template = f.template.value || 'classic';
    draftBill.color = (f.querySelector('[name=color]:checked') || {}).value || f.colorCustom.value;
    draftBill.fontSize = Number(f.fontSize.value) || 12;
    for (const [k] of FLAGS) draftBill[k] = f[k].checked;
    draftBill.labels = {}; for (const i of $$('[data-label]', f)) if (i.value.trim()) draftBill.labels[i.dataset.label] = i.value.trim();
  }
  function paintPreview() {
    const p = $('#designPreview', root); if (!p) return;
    const s = { ...Store.settings, invoice: draftInv || Store.settings.invoice };
    p.innerHTML = Receipt.html(sampleBill(), s, draftBill || Receipt.design(s));
  }

  /* ---------- bill extras: QR, bank, signature, custom fields ---------- */
  function extrasSection(s) {
    draftInv = JSON.parse(JSON.stringify(s.invoice || {}));
    const q = draftInv.qr ||= { enabled: false, mode: 'image', position: 'bottom', size: 'medium', caption: 'Scan to pay' };
    const bk = draftInv.bank ||= { enabled: false }, sg = draftInv.signature ||= { enabled: false, size: 'medium', label: 'Authorised signatory' };
    const cf = draftInv.custom_fields ||= { enabled: false, fields: [] };
    draftBill = Receipt.design(s);
    return `<div class="design-wrap"><form id="fExtras" class="admin-stack">
      <section class="card form-grid"><header class="span-2 card-head row-head"><div><h2>Payment QR on bill</h2><p class="hint">Customers scan it to pay you by UPI.</p></div>${sw('qr_enabled', q.enabled, '')}</header>
        <div class="span-2 form-grid" data-when="qr_enabled">
          <div class="field span-2"><span>QR code</span><div class="seg seg-wide" role="radiogroup">
            <label><input type="radio" name="qr_mode" value="image" ${q.mode !== 'upi' ? 'checked' : ''}><span><b>My own QR image</b><small>Upload the QR from your bank or UPI app.</small></span></label>
            <label><input type="radio" name="qr_mode" value="upi" ${q.mode === 'upi' ? 'checked' : ''}><span><b>Make it from my UPI ID</b><small>Fills in the bill amount automatically.</small></span></label></div></div>
          <div class="field span-2" data-qr="image"><span>QR image</span><div class="logo-row"><div class="logo-box qr-box" id="qrBox"></div><label class="btn file-btn">${Icon('upload')} Upload QR<input type="file" accept="image/png,image/jpeg,image/webp" hidden id="qrFile"></label><button type="button" class="btn btn-ghost" id="qrRemove">Remove</button></div></div>
          <label class="field" data-qr="upi"><span>UPI ID</span><input name="qr_upi" maxlength="80" value="${esc(q.upi_id || '')}" placeholder="shopname@okaxis"></label>
          <label class="field" data-qr="upi"><span>Name shown in UPI app</span><input name="qr_payee" maxlength="60" value="${esc(q.payee || '')}" placeholder="${esc(s.shop_name)}"></label>
          <label class="field"><span>Position</span><select name="qr_position"><option value="bottom" ${q.position !== 'top' ? 'selected' : ''}>Bottom of bill</option><option value="top" ${q.position === 'top' ? 'selected' : ''}>Top of bill</option></select></label>
          <label class="field"><span>Size</span><select name="qr_size">${['small', 'medium', 'large'].map(z => `<option value="${z}" ${q.size === z ? 'selected' : ''}>${z[0].toUpperCase() + z.slice(1)}</option>`).join('')}</select></label>
          <label class="field"><span>Text under QR</span><input name="qr_caption" maxlength="40" value="${esc(q.caption || 'Scan to pay')}"></label>
          <div class="field">${sw('qr_only_upi', q.only_upi, 'Only on UPI bills')}</div></div></section>
      <section class="card form-grid"><header class="span-2 card-head row-head"><div><h2>Bank details on bill</h2><p class="hint">For customers who pay by bank transfer.</p></div>${sw('bank_enabled', bk.enabled, '')}</header>
        <div class="span-2 form-grid" data-when="bank_enabled">
          <label class="field"><span>Account holder</span><input name="bank_holder" maxlength="80" value="${esc(bk.holder || '')}"></label>
          <label class="field"><span>Bank name</span><input name="bank_bank" maxlength="80" value="${esc(bk.bank || '')}"></label>
          <label class="field"><span>Account number</span><input name="bank_account" maxlength="30" inputmode="numeric" value="${esc(bk.account || '')}"></label>
          <label class="field"><span>IFSC</span><input name="bank_ifsc" maxlength="15" value="${esc(bk.ifsc || '')}" style="text-transform:uppercase"></label>
          <label class="field span-2"><span>Branch <em>optional</em></span><input name="bank_branch" maxlength="80" value="${esc(bk.branch || '')}"></label></div></section>
      <section class="card form-grid"><header class="span-2 card-head row-head"><div><h2>Signature</h2><p class="hint">Printed as “Authorised signatory”. PNG with a white or clear background works best.</p></div>${sw('sig_enabled', sg.enabled, '')}</header>
        <div class="span-2 form-grid" data-when="sig_enabled">
          <div class="field span-2"><span>Signature image</span><div class="logo-row"><div class="logo-box sig-box" id="sigBox"></div><label class="btn file-btn">${Icon('upload')} Upload signature<input type="file" accept="image/png,image/jpeg,image/webp" hidden id="sigFile"></label><button type="button" class="btn btn-ghost" id="sigRemove">Remove</button></div></div>
          <label class="field"><span>Size</span><select name="sig_size">${['small', 'medium', 'large'].map(z => `<option value="${z}" ${sg.size === z ? 'selected' : ''}>${z[0].toUpperCase() + z.slice(1)}</option>`).join('')}</select></label>
          <label class="field"><span>Text under signature</span><input name="sig_label" maxlength="40" value="${esc(sg.label || 'Authorised signatory')}"></label></div></section>
      <section class="card"><header class="card-head row-head"><div><h2>Custom fields</h2><p class="hint">Extra boxes on the billing screen — like vehicle number or order number — printed on the bill when filled.</p></div>${sw('cf_enabled', cf.enabled, '')}</header>
        <div data-when="cf_enabled"><ol class="cf-list" id="cfList"></ol>
          <div class="inline-form"><input id="cfNew" maxlength="40" placeholder="New field name, e.g. Vehicle no." aria-label="New field name"><button type="button" class="btn btn-primary" id="cfAdd">${Icon('plus')} Add</button></div>
          <div class="toolbar"><span class="hint">Quick add:</span>${['Delivery note', 'Mode/Terms of payment', 'Buyer’s order no.', 'Dispatched through', 'Destination', 'Motor vehicle no.', 'Terms of delivery'].map(x => `<button type="button" class="chip" data-quick="${esc(x)}">${esc(x)}</button>`).join('')}</div></div></section>
      <div class="form-actions sticky-save"><button class="btn btn-primary btn-lg">Save bill extras</button></div></form>
      <aside class="design-preview"><h3>Preview <small>sample bill</small></h3><div class="bill-paper" id="designPreview"></div></aside></div>`;
  }
  function paintExtras() {
    const f = $('#fExtras', root); if (!f) return;
    for (const box of $$('[data-when]', f)) box.hidden = !f[box.dataset.when].checked;
    const mode = f.qr_mode.value; for (const el of $$('[data-qr]', f)) el.hidden = el.dataset.qr !== mode;
    $('#qrBox', root).innerHTML = draftInv.qr.image ? `<img src="${esc(draftInv.qr.image)}" alt="QR">` : '<span>No QR</span>';
    $('#sigBox', root).innerHTML = draftInv.signature.image ? `<img src="${esc(draftInv.signature.image)}" alt="Signature">` : '<span>No signature</span>';
    const list = draftInv.custom_fields.fields;
    $('#cfList', root).innerHTML = list.length ? list.map((x, i) => `<li data-i="${i}"><button type="button" class="icon-btn" data-up ${i ? '' : 'disabled'} aria-label="Move up">${Icon('up')}</button><button type="button" class="icon-btn" data-down ${i < list.length - 1 ? '' : 'disabled'} aria-label="Move down">${Icon('down')}</button><input value="${esc(x)}" maxlength="40" data-cfedit aria-label="Field name"><button type="button" class="icon-btn danger" data-del aria-label="Delete">${Icon('trash')}</button></li>`).join('') : '<li class="hint">No fields yet. Add one below.</li>';
  }
  function readExtras() {
    const f = $('#fExtras', root); if (!f) return;
    Object.assign(draftInv.qr, { enabled: f.qr_enabled.checked, mode: f.qr_mode.value, upi_id: f.qr_upi.value.trim(), payee: f.qr_payee.value.trim(), position: f.qr_position.value, size: f.qr_size.value, caption: f.qr_caption.value.trim(), only_upi: f.qr_only_upi.checked });
    Object.assign(draftInv.bank, { enabled: f.bank_enabled.checked, holder: f.bank_holder.value.trim(), bank: f.bank_bank.value.trim(), account: f.bank_account.value.trim(), ifsc: f.bank_ifsc.value.trim().toUpperCase(), branch: f.bank_branch.value.trim() });
    Object.assign(draftInv.signature, { enabled: f.sig_enabled.checked, size: f.sig_size.value, label: f.sig_label.value.trim() });
    draftInv.custom_fields.enabled = f.cf_enabled.checked;
  }

  /* ---------- staff ---------- */
  function staffSection() {
    const canOwner = ['owner', 'superadmin'].includes(Store.role);
    return `<div class="card"><header class="card-head"><h2>Staff & logins</h2><p class="hint">Each person signs in with their own email and password.</p></header>
      <form id="fStaff" class="staff-form">
        <label class="field"><span>Name on bills</span><input name="name" maxlength="60" placeholder="e.g. Ravi" autocomplete="off"></label>
        <label class="field"><span>Email</span><input name="email" type="email" required placeholder="ravi@example.com" autocomplete="off"></label>
        <label class="field"><span>Password <em>8+ characters</em></span><input name="password" type="text" minlength="8" placeholder="New login only" autocomplete="new-password"></label>
        <label class="field"><span>Role</span><select name="role"><option value="cashier">Cashier</option><option value="manager">Manager</option>${canOwner ? '<option value="owner">Owner</option>' : ''}</select></label>
        <button class="btn btn-primary">${Icon('plus')} Add staff</button>
      </form>
      <div class="table-wrap"><table class="table cards-on-mobile"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last sign-in</th><th></th></tr></thead><tbody id="staffBody"><tr><td colspan="5">Loading…</td></tr></tbody></table></div></div>`;
  }
  async function loadStaff() {
    try { const list = await Cloud.rpc('shop_staff_list'); if (root?.isConnected && section === 'staff') paintStaff(list); }
    catch (e) { if (root?.isConnected) { const b = $('#staffBody', root); if (b) b.innerHTML = `<tr><td colspan="5">${esc(e.message)}</td></tr>`; } }
  }
  function paintStaff(list) {
    const b = $('#staffBody', root); if (!b) return;
    const canOwner = ['owner', 'superadmin'].includes(Store.role);
    b.innerHTML = list.length ? list.map(s => {
      const locked = s.me || (s.role === 'owner' && !canOwner);
      return `<tr data-uid="${esc(s.user_id)}" data-email="${esc(s.email)}" data-name="${esc(s.name)}"><td data-label="Name"><b>${esc(s.name || '—')}</b>${s.me ? ' <small>(you)</small>' : ''}</td><td data-label="Email">${esc(s.email)}</td>
      <td data-label="Role">${locked ? `<span class="badge">${ROLE_LABEL[s.role]}</span>` : `<select data-role aria-label="Role for ${esc(s.email)}">${['cashier', 'manager', ...(canOwner ? ['owner'] : [])].map(v => `<option value="${v}" ${v === s.role ? 'selected' : ''}>${ROLE_LABEL[v]}</option>`).join('')}</select>`}</td>
      <td data-label="Last sign-in">${s.last_sign_in ? esc(Fmt.dateTime(s.last_sign_in)) : '<span class="muted">Never</span>'}</td>
      <td class="row-act">${locked ? '' : `<button type="button" class="btn btn-sm" data-pw>${Icon('lock')} Password</button><button type="button" class="btn btn-sm btn-ghost" data-remove>Remove</button>`}</td></tr>`;
    }).join('') : '<tr><td colspan="5"><div class="empty slim"><p>No staff yet. Add the first one above.</p></div></td></tr>';
  }

  /* ---------- permissions for lower roles ---------- */
  function permsSection() {
    const roles = ['manager', 'cashier'].filter(r => Store.can('roles_' + r)), mine = Store.me.perms || [], cur = Store.sys.roles || {};
    return `<form id="fPerms" class="card">
      <header class="card-head"><h2>Permissions</h2><p class="hint">Choose what each role can see and do. You can only give permissions you have yourself. The server checks every action.</p></header>
      <div class="table-wrap perm-wrap"><table class="table perm-table"><thead><tr><th>Permission</th>${roles.map(x => `<th class="c">${ROLE_LABEL[x]}</th>`).join('')}</tr></thead><tbody>
      ${PERMISSIONS.map(([group, all]) => [group, all.filter(([k]) => Store.permShown(k))]).filter(([, perms]) => perms.length).map(([group, perms]) => `<tr class="perm-group"><td colspan="${roles.length + 1}">${group}</td></tr>` + perms.map(([k, label]) => `<tr><td>${label}</td>${roles.map(x => {
        const has = (cur[x] || []).includes(k), can = Store.isAdmin || mine.includes(k) || has;
        return `<td class="c"><input type="checkbox" data-role="${x}" data-perm="${k}" ${has ? 'checked' : ''} ${can ? '' : 'disabled title="You don’t have this permission yourself"'} aria-label="${ROLE_LABEL[x]}: ${label}"></td>`;
      }).join('')}</tr>`).join('')).join('')}
      </tbody></table></div>
      <div class="form-actions"><button class="btn btn-primary">Save permissions</button></div></form>`;
  }

  function contactSection(s) {
    return `<form id="fContact" class="form-grid card"><header class="span-2 card-head"><h2>Contact info</h2><p class="hint">Staff see this in Help & contact.</p></header>
      <label class="field"><span>Contact person</span><input name="contact_name" maxlength="80" value="${esc(s.contact_name)}"></label>
      <label class="field"><span>Phone</span><input name="contact_phone" maxlength="40" inputmode="tel" value="${esc(s.contact_phone)}"></label>
      <label class="field span-2"><span>Other details</span><textarea name="contact_details" rows="3" maxlength="1000" placeholder="e.g. Printer paper is in the bottom drawer.">${esc(s.contact_details)}</textarea></label>
      <div class="form-actions span-2"><button class="btn btn-primary">Save contact info</button></div></form>`;
  }
  function dataSection() {
    return `<div class="card"><h2>Data</h2>
      <div class="data-row"><div><h3>Back up</h3><p class="hint">Download every bill as CSV from Records → Export, and the item list from Items → Export.</p></div><div class="toolbar"><a class="btn" href="#/records">Open records</a><a class="btn" href="#/items">Open items</a></div></div>
      <div class="data-row danger-zone"><div><h3>Delete all bills</h3><p class="hint">Removes every bill and its sales history for good. Items and stock stay. Use only to clear test bills.</p></div><button type="button" class="btn btn-danger" id="resetBills">Delete all bills…</button></div></div>`;
  }

  /* ---------- invoice numbers (admin changes them; managers see them) ---------- */
  async function invoiceBox() {
    const box = $('#invBody', root); if (!box) return;
    let c;
    try { c = await Cloud.rpc('shop_invoice_get'); } catch (e) { box.innerHTML = `<p class="neg">${esc(e.message)}</p>`; return; }
    if (!$('#invBody', root)) return;
    if (!c) { box.innerHTML = `<div class="notice">${Icon('alert')} <div><b>Run the database update UPDATE-v19.sql once</b><p class="hint">Supabase → SQL Editor → paste the file → Run. Then refresh this page to switch on INV001-style invoice numbers.</p></div></div>`; return; }
    const ed = !!c.can_edit, dis = ed ? '' : 'disabled';
    const ex = (pre, dig, n) => pre + (String(n).length >= dig ? String(n) : String(n).padStart(dig, '0'));
    box.innerHTML = `<div class="inv-now"><div><span>Next invoice</span><b class="mono" id="invNext">${esc(c.next_text)}</b><small>Year ${esc(c.year)}</small></div><div><span>Order numbers</span><b class="mono">#1, #2…</b><small>Start from 1 every day</small></div></div>
      <div class="form-grid inv-form">
        <label class="field"><span>Starts with</span><input name="inv_prefix" maxlength="12" value="${esc(c.prefix)}" ${dis} pattern="[A-Za-z0-9/_-]{0,12}" placeholder="INV"></label>
        <label class="field"><span>Digits</span><select name="inv_digits" ${dis}>${[1, 2, 3, 4, 5, 6].map(n => `<option value="${n}" ${Number(c.digits) === n ? 'selected' : ''}>${n} — ${esc(ex('', n, 1))}</option>`).join('')}</select></label>
        <label class="field"><span>Numbers restart every year in</span><select name="inv_month" ${dis}>${MONTHS.map((m, i) => `<option value="${i + 1}" ${Number(c.start_month) === i + 1 ? 'selected' : ''}>${m}${i === 3 ? ' (financial year)' : i === 0 ? ' (calendar year)' : ''}</option>`).join('')}</select></label>
        <label class="field"><span>Next number <em>only to continue from an old book</em></span><input name="inv_next" type="number" min="1" step="1" inputmode="numeric" placeholder="${Number(c.next)}" ${dis}></label>
        ${ed ? `<div class="form-actions span-2"><button type="button" class="btn btn-primary" id="invSave">Save invoice numbers</button></div>` : `<p class="hint span-2">Only the admin login can change invoice numbers.</p>`}</div>`;
    if (!ed) return;
    const paint = () => { const f = $('#fBill', root); if (!f) return; $('#invNext', root).textContent = ex(f.inv_prefix.value.trim(), Number(f.inv_digits.value), Number(f.inv_next.value) || Number(c.next)); };
    $('#fBill', root).addEventListener('input', e => { if (/^inv_/.test(e.target.name || '')) paint(); });
    $('#invSave', root).onclick = async e => {
      const f = $('#fBill', root), next = f.inv_next.value ? Number(f.inv_next.value) : null;
      if (!/^[A-Za-z0-9/_-]{0,12}$/.test(f.inv_prefix.value.trim())) return toast('Use up to 12 letters, numbers, / - or _.', 'warn');
      busy(e.currentTarget, true, 'Saving…');
      try { await Cloud.rpc('shop_invoice_save', { p_prefix: f.inv_prefix.value.trim(), p_digits: Number(f.inv_digits.value), p_start_month: Number(f.inv_month.value), p_next: next }); toast('Invoice numbers saved.', 'ok'); invoiceBox(); }
      catch (ex2) { toast(ex2.message, 'error', 7000); } finally { busy(e.currentTarget, false); }
    };
  }
  /* ---------- limits (admin and manager) ---------- */
  function limitsSection() {
    const l = Store.sys.limits || {}, v19 = Cloud.hasV19?.();
    return `<form id="fLimits" class="card form-grid"><header class="span-2 card-head"><h2>Limits</h2><p class="hint">How much discount and short cash a manager may give on the billing counter. The admin login is never limited. The server checks every bill.</p></header>
      ${v19 ? '' : `<div class="notice span-2">${Icon('alert')} <div><b>Run the database update UPDATE-v19.sql once</b><p class="hint">Discounts and short cash on counter bills switch on after it.</p></div></div>`}
      <label class="field"><span>Biggest discount allowed (%)</span><input name="max_discount_percent" type="number" min="0" max="100" step="0.5" inputmode="decimal" value="${Number(l.max_discount_percent ?? 100)}" ${v19 ? '' : 'disabled'}></label>
      <label class="field"><span>Most cash a customer can pay short (${esc(Fmt.cur())})</span><input name="max_short_amount" type="number" min="0" max="100000" step="1" inputmode="numeric" value="${Number(l.max_short_amount ?? 0)}" ${v19 ? '' : 'disabled'}></label>
      <p class="hint span-2">Short cash: when the cash received is less than the total, the bill is reduced to what was paid — up to this amount.</p>
      <div class="form-actions span-2"><button class="btn btn-primary" ${v19 ? '' : 'disabled'}>Save limits</button></div></form>`;
  }

  const allowed = () => SECTIONS.filter(([k, , p]) => k !== 'perms' && (Array.isArray(p) ? p.some(x => Store.can(x)) : Store.can(p)));

  function show(sec, scroll = false) {
    section = sec;
    $$('#setNav button', root).forEach(b => b.classList.toggle('on', b.dataset.s === sec));
    const s = Store.settings, body = $('#setBody', root);
    if (sec === 'restaurant') { RestaurantSettings.mount(body); return; }
    if (sec === 'staff') { RestaurantSettings.waiters(body); return; }
    body.innerHTML = { shop: shopSection, billing: billingSection, design: designSection, extras: extrasSection, staff: staffSection, perms: permsSection, contact: contactSection, data: dataSection, limits: limitsSection }[sec](s);
    if (sec === 'limits') $('#fLimits', root).onsubmit = async e => {
      e.preventDefault(); const f = e.target, btn = e.submitter; busy(btn, true, 'Saving…');
      try { const l = await Cloud.rpc('shop_limits_save', { p_max_discount_percent: Number(f.max_discount_percent.value), p_max_short_amount: Number(f.max_short_amount.value) }); Store.me.system = { ...Store.me.system, limits: l }; toast('Limits saved.', 'ok'); }
      catch (ex) { toast(ex.message, 'error', 6000); } finally { busy(btn, false); }
    };
    if (scroll) body.scrollIntoView?.({ block: 'nearest' });
    if (sec === 'shop') {
      paintLogo();
      $('#logoFile', root).onchange = async e => { try { draftLogo = await imageToDataURL(e.target.files[0]); paintLogo(); toast('Logo ready. Press Save to keep it.'); } catch (ex) { toast(ex.message, 'error'); } e.target.value = ''; };
      $('#logoRemove', root).onclick = () => { draftLogo = ''; paintLogo(); };
      $('#fShop', root).onsubmit = e => {
        e.preventDefault(); const f = e.target;
        const show_fields = Object.fromEntries(Receipt.SHOP_FIELDS.map(([k]) => [k, f['show_' + k].checked]));
        saveSettings({ shop_name: f.shop_name.value, tagline: f.tagline.value, address: f.address.value, phone: f.phone.value, email: f.email.value, website: f.website.value.trim(), tax_id: f.tax_id.value,
          pan: f.pan.value.trim().toUpperCase(), fssai: f.fssai.value.trim(), currency: f.currency.value, timezone: f.timezone.value, logo: draftLogo, show_fields }, e.submitter, 'Shop details saved.');
      };
    }
    if (sec === 'billing') {
      const f = $('#fBill', root);
      const paint = () => { $('[data-tax]', f).hidden = !f.tax_enabled.checked; const item = f.tax_scope.value === 'item'; $('[data-billtax]', f).hidden = item; $('[data-itemtax]', f).hidden = !item; $('[data-ratelabel]', f).textContent = item ? 'Default tax % (items without their own rate)' : 'Tax value'; };
      f.addEventListener('change', paint); paint();
      invoiceBox();
      f.onsubmit = async e => {
        e.preventDefault(); const btn = e.submitter;
        const payments = Object.fromEntries(['Cash', 'UPI', 'Card'].map(m => [m, f['pay_' + m].checked]));
        if (!Object.values(payments).some(Boolean)) return toast('Keep at least one payment method turned on.', 'warn');
        const ok = await saveSettings({ tax_enabled: f.tax_enabled.checked, tax_label: f.tax_label.value, tax_mode: f.tax_mode.value, tax_value: f.tax_value.value || '0', tax_scope: 'bill',
          tax_split: f.tax_split.checked, tax_inclusive_default: f.tax_inclusive_default.checked,
          allow_negative_stock: f.stock_mode.value === 'warn', stock_hidden: !f.stock_shown.checked, ...(f.exp_profit ? { expenses_in_profit: f.exp_profit.value === 'yes' } : {}),
          item_fields: Object.fromEntries(ITEM_FIELDS.map(([k]) => [k, f['if_' + k].checked])) }, btn, 'Billing settings saved.');
        if (!ok) return;
        busy(btn, true, 'Saving…');
        try { Store.me.system = await Cloud.rpc('shop_billing_options_save', { p: { payments, features: Object.fromEntries(FEATURES.map(([k]) => [k, f['f_' + k].checked])) } }); await App.refreshMe(); App.rebuildNav(); }
        catch (ex) { toast(ex.message, 'error', 6000); } finally { busy(btn, false); }
      };
    }
    if (sec === 'design') {
      const f = $('#fDesign', root); draftInv = null; paintPreview();
      f.addEventListener('input', e => { if (e.target.name === 'colorCustom') { $$('[name=color]', f).forEach(r => { r.checked = false; }); f.colorCustom.nextElementSibling.textContent = e.target.value; } readDesign(); paintPreview(); });
      $('#testPrint', root).onclick = () => { const keep = Store.me.settings.bill; readDesign(); Store.me.settings.bill = draftBill; Receipt.print(sampleBill()); Store.me.settings.bill = keep; };
      f.onsubmit = e => { e.preventDefault(); readDesign(); saveSettings({ bill: draftBill }, e.submitter, 'Bill design saved.'); };
    }
    if (sec === 'extras') {
      const f = $('#fExtras', root); paintExtras(); paintPreview();
      const refresh = () => { readExtras(); paintExtras(); paintPreview(); };
      f.addEventListener('change', refresh); f.addEventListener('input', e => { if (!e.target.matches('[data-cfedit], #cfNew')) { readExtras(); paintPreview(); } });
      const upload = (id, key, max) => { $(id, root).onchange = async e => { try { const img = await imageToDataURL(e.target.files[0], max, 120000); if (key === 'qr') draftInv.qr.image = img; else draftInv.signature.image = img; refresh(); } catch (ex) { toast(ex.message, 'error'); } e.target.value = ''; }; };
      upload('#qrFile', 'qr', 600); upload('#sigFile', 'sig', 500);
      $('#qrRemove', root).onclick = () => { draftInv.qr.image = ''; refresh(); };
      $('#sigRemove', root).onclick = () => { draftInv.signature.image = ''; refresh(); };
      const list = () => draftInv.custom_fields.fields;
      const addField = v => { v = String(v || '').trim(); if (!v) return; if (list().length >= 20) return toast('Up to 20 custom fields.', 'warn'); if (list().includes(v)) return toast('That field is already there.', 'warn'); list().push(v); paintExtras(); paintPreview(); };
      $('#cfAdd', root).onclick = () => { addField($('#cfNew', root).value); $('#cfNew', root).value = ''; $('#cfNew', root).focus(); };
      $('#cfNew', root).onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('#cfAdd', root).click(); } };
      f.addEventListener('click', e => {
        const q = e.target.closest('[data-quick]'); if (q) return addField(q.dataset.quick);
        const li = e.target.closest('#cfList li[data-i]'); if (!li) return; const i = Number(li.dataset.i), l = list();
        if (e.target.closest('[data-del]')) l.splice(i, 1);
        else if (e.target.closest('[data-up]') && i > 0) [l[i - 1], l[i]] = [l[i], l[i - 1]];
        else if (e.target.closest('[data-down]') && i < l.length - 1) [l[i + 1], l[i]] = [l[i], l[i + 1]];
        else return;
        paintExtras(); paintPreview();
      });
      f.addEventListener('change', e => { const i = e.target.closest('[data-cfedit]'); if (i) { const v = i.value.trim(); const idx = Number(i.closest('li').dataset.i); if (v) list()[idx] = v; else list().splice(idx, 1); paintExtras(); paintPreview(); } });
      f.onsubmit = e => { e.preventDefault(); readExtras(); if (draftInv.qr.enabled && draftInv.qr.mode === 'upi' && !/^[\w.\-]{2,}@[a-z]{2,}$/i.test(draftInv.qr.upi_id)) return toast('Enter a UPI ID like shopname@okaxis.', 'warn'); if (draftInv.qr.enabled && draftInv.qr.mode === 'image' && !draftInv.qr.image) return toast('Upload your QR image, or switch the QR off.', 'warn'); saveSettings({ invoice: draftInv }, e.submitter, 'Bill extras saved.'); };
    }
    if (sec === 'staff') {
      loadStaff();
      $('#fStaff', root).onsubmit = async e => {
        e.preventDefault(); const f = e.target; busy(e.submitter, true, 'Saving…');
        try { paintStaff(await Cloud.rpc('shop_staff_set', { p_email: f.email.value.trim(), p_role: f.role.value, p_name: f.name.value.trim(), p_password: f.password.value || null })); toast(`${f.email.value} can now sign in as ${ROLE_LABEL[f.role.value]}.`, 'ok'); f.reset(); }
        catch (ex) { toast(ex.message, 'error', 8000); } finally { busy(e.submitter, false); }
      };
      $('#staffBody', root).addEventListener('change', async e => { const sel = e.target.closest('[data-role]'); if (!sel) return; const tr = sel.closest('tr'); try { paintStaff(await Cloud.rpc('shop_staff_set', { p_email: tr.dataset.email, p_role: sel.value, p_name: tr.dataset.name })); toast('Role changed. They see it after signing in again.', 'ok'); } catch (ex) { toast(ex.message, 'error'); loadStaff(); } });
      $('#staffBody', root).addEventListener('click', async e => {
        const tr = e.target.closest('tr'); if (!tr) return;
        if (e.target.closest('[data-pw]')) {
          const pw = await ask({ title: `New password for ${tr.dataset.name || tr.dataset.email}`, body: 'Tell them the new password. They can sign in with it straight away.', confirm: 'Set password', input: { label: 'New password (8+ characters)', required: true, maxlength: 72 } });
          if (pw === null) return;
          try { await Cloud.rpc('shop_staff_set_password', { p_user_id: tr.dataset.uid, p_password: pw }); toast('Password changed.', 'ok'); } catch (ex) { toast(ex.message, 'error'); }
        }
        if (e.target.closest('[data-remove]')) {
          if (!(await ask({ title: `Remove ${tr.dataset.email}?`, body: 'They will no longer be able to use this shop’s billing. Their old bills stay.', confirm: 'Remove access', danger: true }))) return;
          try { paintStaff(await Cloud.rpc('shop_staff_remove', { p_user_id: tr.dataset.uid })); toast('Access removed.', 'ok'); } catch (ex) { toast(ex.message, 'error'); }
        }
      });
    }
    if (sec === 'perms') $('#fPerms', root).onsubmit = async e => {
      e.preventDefault(); const btn = e.submitter; busy(btn, true, 'Saving…');
      try {
        for (const r of ['manager', 'cashier'].filter(x => Store.can('roles_' + x))) {
          const perms = [...(Store.sys.roles?.[r] || []).filter(x => !Store.permShown(x)), ...$$(`[data-role="${r}"]`, e.target).filter(c => c.checked).map(c => c.dataset.perm)];
          Store.me.system = await Cloud.rpc('shop_role_perms_save', { p_role: r, p_perms: perms });
        }
        toast('Permissions saved. Staff see the change within a minute.', 'ok');
      } catch (ex) { toast(ex.message, 'error', 6000); } finally { busy(btn, false); }
    };
    if (sec === 'contact') $('#fContact', root).onsubmit = e => { e.preventDefault(); const f = e.target; saveSettings({ contact_name: f.contact_name.value, contact_phone: f.contact_phone.value, contact_details: f.contact_details.value }, e.submitter, 'Contact info saved.'); };
    if (sec === 'data') $('#resetBills', root).onclick = async () => {
      const v = await ask({ title: 'Delete all bills?', body: 'This cannot be undone. Export your records first if you might need them.', confirm: 'Delete all bills', danger: true, input: { label: 'Type DELETE ALL BILLS to confirm', required: true } });
      if (v === null) return;
      try { const r = await Cloud.rpc('shop_reset_bills', { p_confirm: v.trim(), p_restart_numbers: false }); toast(`${r.deleted} bills deleted.`, 'ok'); } catch (e) { toast(e.message, 'error'); }
    };
  }

  function mount(view) {
    root = view;
    const secs = allowed();
    if (!secs.some(([k]) => k === section)) section = secs[0]?.[0];
    view.innerHTML = `<div class="page"><header class="page-head"><div><h1>Settings</h1><p class="sub">Your restaurant, bills, billing screen and staff.</p></div></header>
      <div class="settings"><nav class="set-nav" id="setNav">${secs.map(([k, l, , ic]) => `<button type="button" data-s="${k}">${Icon(ic)}<span>${l}</span></button>`).join('')}</nav><div id="setBody"></div></div></div>`;
    $('#setNav', view).onclick = e => { const b = e.target.closest('[data-s]'); if (b) { show(b.dataset.s, true); b.scrollIntoView({ inline: 'center', block: 'nearest' }); } };
    if (section) show(section);
  }
  return { mount, unmount() { root = null; } };
})();

/* js/admin.js?v=19 */
;/* Admin management: only the software admin sees this. System on/off, presets for each kind of business,
   app name & logo, themes, support details, limits, permissions and admin logins. */
'use strict';
const Admin = (() => {
  let root = null, section = 'brand', presets = null, editing = null, themeFilter = 'all';
  const SECTIONS = [
    ['presets', 'Presets', 'grid', 'Gym, library, shop… what each business gets'],
    ['brand', 'App name & logo', 'image', 'Name and icon on phones and computers'],
    ['appearance', 'Themes', 'palette', '40 themes for everyone or each role'],
    ['support', 'Support contact', 'phone', 'Who shops call for help'],
    ['billing', 'Limits', 'sliders', 'Biggest discount and short cash'],
    ['roles', 'Roles & permissions', 'users', 'What owner, manager and cashier can do'],
    ['admins', 'Admin logins', 'shield', 'Who can open this page'],
    ['access', 'System on / off', 'power', 'Shut down, or hide the admin-only tabs']
  ].filter(([k]) => !(Cloud.hiddenAdmin || []).includes(k));
  const FEATURES = [
    ['extra_items', 'Extra items', 'Bill something that is not in the item list.'],
    ['cash_received', 'Cash received box', 'Type the cash given to see the change.'],
    ['customer_details', 'Customer name & phone', 'Ask for the customer’s name and phone.'],
    ['customer_address', 'Customer address', 'Ask for the customer’s address.'],
    ['notes', 'Note on bill', 'A short note that prints on the bill.'],
    ['whatsapp', 'Send bill on WhatsApp', 'WhatsApp button after saving a bill.'],
    ['qty_badges', 'Quantity on item tiles', '×2, ×3… on items already on the bill.'],
    ['stock_badges', 'Stock on item tiles', '“12 left” and “Out of stock”.'],
    ['item_codes_on_tiles', 'Item codes on tiles', 'The barcode / code under each name.']
  ];
  const MODULES = [['billing', 'Billing counter'], ['dashboard', 'Dashboard'], ['records', 'Records'], ['members', 'Members (plans, renewals, attendance)'], ['items', 'Items'], ['stocks', 'Stocks'], ['expenses', 'Expenses']];
  const MEMBER_SEES = [['see_plan', 'Their plan and dates'], ['see_days_left', 'Days left (big counter)'], ['see_history', 'Plan history'], ['see_payments', 'Amounts paid'], ['see_attendance', 'Their visits']];
  /* Same defaults as the database, so a preset saved here is complete on its own. */
  const DEF = {
    modules: { billing: true, dashboard: true, records: true, items: true, stocks: true, expenses: true, members: false },
    payments: { Cash: true, UPI: true, Card: true },
    features: { extra_items: true, customer_details: false, customer_address: false, notes: true, whatsapp: true, cash_received: true, stock_badges: true, item_codes_on_tiles: true, qty_badges: true },
    members: { remind_days: 5, login: true, attendance: true, checkin_gap_minutes: 120, see_plan: true, see_days_left: true, see_history: true, see_attendance: true, see_payments: true },
    roles: {
      owner: ['billing', 'records', 'records_all', 'dashboard', 'items', 'stocks', 'expenses', 'expenses_manage', 'members', 'members_add', 'members_renew', 'members_plans', 'members_login', 'attendance', 'settings_shop', 'settings_tax', 'settings_design', 'settings_contact', 'staff', 'roles_manager', 'roles_cashier', 'discount', 'short_cash', 'cancel_bills', 'export', 'reset'],
      manager: ['billing', 'records', 'records_all', 'dashboard', 'items', 'stocks', 'expenses', 'members', 'members_add', 'members_renew', 'members_plans', 'attendance', 'settings_tax', 'roles_cashier', 'discount', 'short_cash', 'cancel_bills', 'export'],
      cashier: ['billing', 'records', 'discount', 'short_cash', 'members', 'members_renew', 'attendance']
    }
  };
  const full = data => ({
    modules: { ...DEF.modules, ...(data.modules || {}) }, payments: { ...DEF.payments, ...(data.payments || {}) }, features: { ...DEF.features, ...(data.features || {}) },
    members: { ...DEF.members, ...(data.members || {}) }, roles: { ...DEF.roles, ...(data.roles || {}) }, labels: { ...(data.labels || {}) }, plans: [...(data.plans || [])]
  });
  const sys = () => Store.sys;

  async function save(patch, btn, msg) {
    busy(btn, true, 'Saving…');
    try {
      Store.me.system = await Cloud.rpc('shop_system_save', { p: patch });
      await App.refreshMe(true); toast(msg || 'Saved. Every login in this shop now uses this.', 'ok'); return true;
    } catch (e) { toast(e.message, 'error', 7000); return false; } finally { busy(btn, false); }
  }
  const sw = (name, on, title, desc = '', attrs = '') => `<label class="switch"><input type="checkbox" name="${name}" ${on ? 'checked' : ''} ${attrs}><span class="sw" aria-hidden="true"></span><span class="sw-text"><b>${title}</b>${desc ? `<small>${desc}</small>` : ''}</span></label>`;

  /* ---------- system on / off ---------- */
  function accessSection() {
    const a = sys().access || {}, on = !a.locked;
    const since = a.locked_at ? Fmt.dateTime(a.locked_at) : '';
    return `<div class="admin-stack">
      <section class="card power-card ${on ? 'is-on' : 'is-off'}">
        <div class="power-state"><span class="power-dot" aria-hidden="true"></span><div>
          <h2>${on ? 'System is running' : 'System is shut down'}</h2>
          <p>${on ? 'Owner, staff and members can sign in.' : `Only admin logins work${since ? ` · since ${esc(since)}` : ''}. Everyone else is signed out and sees your message.`}</p></div></div>
        <button type="button" class="btn btn-lg ${on ? 'btn-danger' : 'btn-primary'}" id="powerBtn">${Icon('power')} ${on ? 'Shut down system' : 'Turn system back on'}</button>
      </section>
      <form id="aAccess" class="card form-grid">
        <header class="span-2 card-head"><h2>Message shown while shut down</h2><p class="hint">Shown on the sign-in screen with your support contact, and to anyone who is signed out by the shutdown.</p></header>
        <label class="field span-2"><span>Message</span><textarea name="message" rows="3" maxlength="300">${esc(a.message || '')}</textarea></label>
        <div class="form-actions span-2"><button class="btn">Save message</button></div></form>
      <section class="card view-card"><div class="view-row"><div><h2>Hide admin-only tabs</h2>
          <p class="hint">Your admin logins then see exactly what a manager sees — the same side menu, the same Settings tabs, no Admin page. Use it when you hand this phone or counter to the restaurant. A <b>Show admin tabs</b> button stays at the bottom of the side menu to bring everything back.</p></div>
          <button type="button" class="btn" id="managerViewBtn">${Icon('eye')} Hide admin-only tabs</button></div></section>
      <section class="card"><header class="card-head"><h2>What happens when the system is shut down</h2></header>
        <ul class="hint-list"><li>Every action by owner, manager, cashier or member is refused by the server straight away.</li>
        <li>Open screens sign themselves out within a minute.</li>
        <li>Nothing is deleted. Bills, items, members and logins stay exactly as they are.</li>
        <li>You can still sign in, use every screen and turn the system back on.</li></ul></section></div>`;
  }

  /* ---------- presets ---------- */
  const modChips = d => MODULES.filter(([k]) => full(d).modules[k]).map(([k]) => `<span class="chip-s">${esc((d.labels || {})[k] || MODULE_LABEL[k])}</span>`).join('');
  function presetsSection() {
    if (!presets) { loadPresets(); return '<div class="card"><p class="hint">Loading presets…</p></div>'; }
    const act = presets.active;
    return `<div class="admin-stack">
      <section class="card"><div class="card-title-row"><div><h2>Presets</h2><p class="hint">A preset is a ready-made setup for one kind of business: which screens it has, what they are called, what owner, manager, cashier and members can see, billing switches and starter plans. Apply one and everyone gets it straight away — editing the active preset changes the app live.</p></div>
        <div class="toolbar"><label class="btn btn-ghost file-btn">${Icon('upload')} Import<input type="file" accept="application/json,.json" id="pImport" hidden></label><button type="button" class="btn btn-primary" id="pNew">${Icon('plus')} New preset</button></div></div></section>
      <div class="preset-grid">${presets.presets.map(p => `<article class="preset-card ${p.id === act ? 'is-active' : ''}" data-pid="${esc(p.id)}">
        <div class="pc-top"><span class="pc-icon" aria-hidden="true">${esc(p.icon || '🏷️')}</span><div><h3>${esc(p.name)}</h3>${p.id === act ? `<span class="badge badge-green">${Icon('check')} Active</span>` : p.builtin ? '<span class="badge">Built-in</span>' : '<span class="badge">Custom</span>'}</div></div>
        <p class="hint">${esc(p.description || '')}</p>
        <div class="chips-s">${modChips(p.data)}</div>
        <div class="pc-act">${p.id === act ? '' : `<button type="button" class="btn btn-sm btn-primary" data-apply>Apply</button>`}<button type="button" class="btn btn-sm" data-edit>${Icon('edit')} Edit</button>
          <button type="button" class="btn btn-sm btn-ghost" data-dup>Duplicate</button><button type="button" class="btn btn-sm btn-ghost" data-export aria-label="Export ${esc(p.name)}">${Icon('download')}</button>
          ${p.builtin ? '<button type="button" class="btn btn-sm btn-ghost" data-restore>Restore original</button>' : p.id === act ? '' : `<button type="button" class="btn btn-sm btn-ghost" data-del aria-label="Delete ${esc(p.name)}">${Icon('trash')}</button>`}</div>
      </article>`).join('')}</div></div>`;
  }
  async function loadPresets() {
    try { presets = await Cloud.rpc('shop_presets_list'); if (root && section === 'presets' && !editing) show('presets'); }
    catch (e) { toast(e.message, 'error'); }
  }
  function presetEditor(p) {
    const d = full(p.data || {}), isActive = p.id && p.id === presets.active;
    const roles = ['owner', 'manager', 'cashier'];
    return `<form id="pForm" class="admin-stack" autocomplete="off">
      <section class="card"><div class="card-title-row"><div><h2>${p.id ? 'Edit preset' : 'New preset'}</h2><p class="hint">${isActive ? `${Icon('check')} This preset is in use: saving changes the app for everyone right away.` : 'Saved presets can be applied to this shop any time, or exported and imported into another shop.'}</p></div><button type="button" class="btn btn-ghost" data-back>${Icon('x')} Close</button></div>
        <div class="form-grid"><label class="field"><span>Name</span><input name="name" required maxlength="40" value="${esc(p.name || '')}" placeholder="e.g. Gym"></label>
          <label class="field"><span>Icon <em>an emoji</em></span><input name="icon" maxlength="8" value="${esc(p.icon || '')}" placeholder="🏋️"></label>
          <label class="field span-2"><span>Description</span><input name="description" maxlength="160" value="${esc(p.description || '')}"></label></div></section>
      <section class="card"><header class="card-head"><h2>Screens</h2><p class="hint">Switch screens on or off, and rename them for this business (e.g. Members → Students). A screen that is off is hidden for everyone, Admin too.</p></header>
        <div class="mod-rows">${MODULES.map(([k, t]) => `<div class="mod-row">${sw('m_' + k, d.modules[k], t)}<input name="l_${k}" maxlength="24" value="${esc(d.labels[k] || '')}" placeholder="${esc(MODULE_LABEL[k])}" aria-label="Name shown for ${esc(t)}"></div>`).join('')}</div></section>
      <section class="card" data-members-box><header class="card-head"><h2>Members</h2></header>
        <div class="form-grid"><label class="field"><span>Remind when this many days are left</span><input name="remind_days" type="number" min="0" max="60" value="${Number(d.members.remind_days)}"><small class="hint">Members this close to their end date move to the top in orange.</small></label>
          <label class="field"><span>Minutes before the same member can check in again</span><input name="gap" type="number" min="0" max="1440" value="${Number(d.members.checkin_gap_minutes)}"></label></div>
        <div class="switches two">${sw('mem_login', d.members.login, 'Member app login', 'Members sign in with their mobile number to see their plan.')}${sw('mem_att', d.members.attendance, 'QR attendance', 'Members scan the front-desk QR to check in; staff can check them in too.')}</div>
        <h3 class="sub-h">What members see in their app</h3>
        <div class="switches two">${MEMBER_SEES.map(([k, t]) => sw('see_' + k, d.members[k], t)).join('')}</div>
        <h3 class="sub-h">Starter plans <small class="hint">added when this preset is applied to a shop that has no plans yet</small></h3>
        <div class="starter" data-plans>${d.plans.map(planRow).join('')}</div><button type="button" class="btn btn-sm" data-addplan>${Icon('plus')} Add plan</button></section>
      <section class="card"><header class="card-head"><h2>Billing</h2></header>
        <div class="pay-toggles">${['Cash', 'UPI', 'Card'].map(m => sw('pay_' + m, d.payments[m], m)).join('')}</div>
        <div class="switches two">${FEATURES.map(([k, t, ds]) => sw('f_' + k, d.features[k], t, ds)).join('')}</div></section>
      <section class="card"><header class="card-head"><h2>Who sees what</h2><p class="hint">Tick what each role can see and do with this preset. Rows for screens that are off are greyed out.</p></header>
        <div class="table-wrap perm-wrap"><table class="table perm-table"><thead><tr><th>Permission</th>${roles.map(x => `<th class="c">${ROLE_LABEL[x]}</th>`).join('')}</tr></thead><tbody>
        ${PERMISSIONS.map(([group, perms]) => `<tr class="perm-group"><td colspan="4">${group}</td></tr>` + perms.map(([k, label]) => `<tr data-mod="${PERM_MODULE[k] || ''}"><td>${label}</td>${roles.map(x => `<td class="c"><input type="checkbox" data-role="${x}" data-perm="${k}" ${(d.roles[x] || []).includes(k) ? 'checked' : ''} aria-label="${ROLE_LABEL[x]}: ${label}"></td>`).join('')}</tr>`).join('')).join('')}
        </tbody></table></div></section>
      <div class="form-actions sticky-save">${p.id && !isActive ? '<button type="button" class="btn" data-saveapply>Save & apply</button>' : ''}<button class="btn btn-primary btn-lg">${isActive ? 'Save — changes apply now' : 'Save preset'}</button></div></form>`;
  }
  const planRow = (x = {}) => `<div class="starter-row"><input name="sp_name" maxlength="60" value="${esc(x.name || '')}" placeholder="Plan name" aria-label="Plan name"><input name="sp_val" type="number" min="1" max="3650" value="${Number(x.duration_value || 1)}" aria-label="How long"><select name="sp_unit" aria-label="Unit">${['day', 'month', 'year'].map(u => `<option value="${u}" ${(x.duration_unit || 'month') === u ? 'selected' : ''}>${u}s</option>`).join('')}</select><input name="sp_price" type="number" min="0" step="1" value="${x.price ?? ''}" placeholder="Price" aria-label="Price"><button type="button" class="icon-btn" data-delplan aria-label="Remove plan">${Icon('x')}</button></div>`;
  function readPreset(f) {
    const roles = { owner: [], manager: [], cashier: [] };
    for (const c of $$('[data-perm]', f)) if (c.checked) roles[c.dataset.role].push(c.dataset.perm);
    const labels = {}; MODULES.forEach(([k]) => { const v = f['l_' + k].value.trim(); if (v) labels[k] = v; });
    const plans = $$('.starter-row', f).map(r => ({ name: $('[name=sp_name]', r).value.trim(), duration_value: Number($('[name=sp_val]', r).value) || 1, duration_unit: $('[name=sp_unit]', r).value, price: Number($('[name=sp_price]', r).value) || 0 })).filter(x => x.name);
    return {
      id: editing.id || null, name: f.name.value.trim(), icon: f.icon.value.trim(), description: f.description.value.trim(),
      data: {
        modules: Object.fromEntries(MODULES.map(([k]) => [k, f['m_' + k].checked])), labels,
        payments: Object.fromEntries(['Cash', 'UPI', 'Card'].map(m => [m, f['pay_' + m].checked])),
        features: Object.fromEntries(FEATURES.map(([k]) => [k, f['f_' + k].checked])),
        members: { remind_days: Number(f.remind_days.value) || 0, checkin_gap_minutes: Number(f.gap.value) || 0, login: f.mem_login.checked, attendance: f.mem_att.checked, ...Object.fromEntries(MEMBER_SEES.map(([k]) => [k, f['see_' + k].checked])) },
        roles, plans
      }
    };
  }
  function wirePresetEditor() {
    const f = $('#pForm', root);
    const paint = () => { $('[data-members-box]', f).hidden = !f.m_members.checked; $$('tr[data-mod]', f).forEach(tr => { const m = tr.dataset.mod; tr.classList.toggle('mod-off', !!m && !f['m_' + m].checked); }); };
    f.addEventListener('change', paint); paint();
    f.addEventListener('click', e => {
      if (e.target.closest('[data-back]')) { editing = null; show('presets'); }
      if (e.target.closest('[data-addplan]')) $('[data-plans]', f).insertAdjacentHTML('beforeend', planRow());
      if (e.target.closest('[data-delplan]')) e.target.closest('.starter-row').remove();
    });
    const doSave = async (btn, apply) => {
      const p = readPreset(f);
      if (!p.name) return toast('Give the preset a name.', 'warn');
      if (!Object.values(p.data.payments).some(Boolean)) return toast('Keep at least one payment method on.', 'warn');
      if (!Object.values(p.data.modules).some(Boolean)) return toast('Keep at least one screen on.', 'warn');
      busy(btn, true, 'Saving…');
      try {
        const r = await Cloud.rpc('shop_preset_save', { p }); presets = r;
        if (apply) presets = await Cloud.rpc('shop_preset_apply', { p_id: r.saved });
        const live = apply || r.saved === presets.active;
        if (live) await App.refreshMe(true);
        toast(live ? `“${p.name}” saved — everyone sees it now.` : `“${p.name}” saved.`, 'ok');
        editing = null; show('presets');
      } catch (ex) { toast(ex.message, 'error', 7000); } finally { busy(btn, false); }
    };
    f.onsubmit = e => { e.preventDefault(); doSave(e.submitter, false); };
    $('[data-saveapply]', f)?.addEventListener('click', e => doSave(e.currentTarget, true));
  }
  function wirePresets() {
    $('#pNew', root)?.addEventListener('click', () => { editing = { name: '', icon: '', description: '', data: {} }; show('presets'); });
    $('#pImport', root)?.addEventListener('change', async e => {
      const file = e.target.files[0]; e.target.value = ''; if (!file) return;
      try {
        const j = JSON.parse(await file.text());
        if (j.format !== 'shopbill-preset' || !j.name || typeof j.data !== 'object') throw new Error('This file is not a preset exported from this app.');
        presets = await Cloud.rpc('shop_preset_save', { p: { name: j.name, icon: j.icon || '', description: j.description || '', data: j.data } });
        toast(`Preset “${j.name}” imported.`, 'ok'); show('presets');
      } catch (ex) { toast(ex.message, 'error', 6000); }
    });
    $('.preset-grid', root)?.addEventListener('click', async e => {
      const card = e.target.closest('[data-pid]'); if (!card) return;
      const p = presets.presets.find(x => x.id === card.dataset.pid);
      if (e.target.closest('[data-edit]')) { editing = p; return show('presets'); }
      if (e.target.closest('[data-dup]')) { editing = { name: p.name + ' copy', icon: p.icon, description: p.description, data: JSON.parse(JSON.stringify(p.data)) }; return show('presets'); }
      if (e.target.closest('[data-export]')) return downloadFile(`preset-${p.id}.json`, JSON.stringify({ format: 'shopbill-preset', version: 1, name: p.name, icon: p.icon, description: p.description, data: p.data }, null, 2), 'application/json');
      if (e.target.closest('[data-apply]')) {
        if (!(await ask({ title: `Apply “${esc(p.name)}”?`, body: 'Screens, names and permissions change for everyone straight away. Bills, items and members are not touched.', confirm: 'Apply preset' }))) return;
        try { presets = await Cloud.rpc('shop_preset_apply', { p_id: p.id }); await App.refreshMe(true); toast(`“${p.name}” is now active.`, 'ok'); show('presets'); } catch (ex) { toast(ex.message, 'error'); }
      }
      if (e.target.closest('[data-restore]')) {
        if (!(await ask({ title: `Restore “${esc(p.name)}”?`, body: 'Your changes to this built-in preset are undone.', confirm: 'Restore' }))) return;
        try { presets = await Cloud.rpc('shop_preset_restore', { p_id: p.id }); if (p.id === presets.active) await App.refreshMe(true); toast('Restored.', 'ok'); show('presets'); } catch (ex) { toast(ex.message, 'error'); }
      }
      if (e.target.closest('[data-del]')) {
        if (!(await ask({ title: `Delete “${esc(p.name)}”?`, confirm: 'Delete', danger: true }))) return;
        try { presets = await Cloud.rpc('shop_preset_delete', { p_id: p.id }); toast('Deleted.', 'ok'); show('presets'); } catch (ex) { toast(ex.message, 'error'); }
      }
    });
  }

  /* ---------- app name & logo ---------- */
  let draftIcon = null;
  function brandSection() {
    const b = sys().brand || {};
    return `<div class="admin-split"><form id="aBrand" class="card form-grid">
      <header class="span-2 card-head"><h2>App name & logo</h2><p class="hint">The name and icon people see on their home screen, in the browser tab and on the sign-in screen.</p></header>
      <label class="field"><span>App name</span><input name="app_title" maxlength="40" value="${esc(b.app_title)}" placeholder="Shop Billing"></label>
      <label class="field"><span>Short name <em>under the home-screen icon, up to 12 letters</em></span><input name="app_short_name" maxlength="12" value="${esc(b.app_short_name || '')}" placeholder="${esc((b.app_title || 'Shop Billing').slice(0, 12))}"></label>
      <div class="field span-2"><span>App logo <em>square PNG or JPG works best</em></span>
        <div class="logo-row"><span class="app-icon-prev" id="iconPrev"></span><div class="toolbar"><label class="btn file-btn">${Icon('upload')} Choose logo<input type="file" id="iconFile" accept="image/png,image/jpeg,image/webp" hidden></label><button type="button" class="btn btn-ghost" id="iconRemove">Use the standard icon</button></div></div>
        <label class="field narrow"><span>Logo background</span><input type="color" name="icon_bg" value="#ffffff" aria-label="Logo background colour"></label></div>
      <label class="field"><span>Software company name</span><input name="software_name" maxlength="60" value="${esc(b.software_name)}" placeholder="e.g. SHOI SYSTEMS"></label>
      <label class="field"><span>Sign-in message</span><input name="signin_message" maxlength="120" value="${esc(b.signin_message)}"></label>
      <div class="span-2 switches">${sw('show_on_bill', b.show_on_bill !== false, 'Print “Billing software by …” on bills')}${sw('show_on_signin', b.show_on_signin !== false, 'Show company name on the sign-in screen')}</div>
      <div class="form-actions span-2 sticky-save"><button class="btn btn-primary btn-lg">Save name & logo</button></div></form>
      <aside class="admin-preview"><h3>On a phone</h3><div class="phone-prev"><div class="home-grid"><span class="hg"></span><span class="hg"></span><span class="hg-app"><span class="app-icon-prev sm" id="iconPrev2"></span><small id="namePrev"></small></span><span class="hg"></span></div></div>
        <p class="hint">The tab title and the icon inside the app change straight away for everyone. Installed apps on Android update their icon and name on their own within a day or so (the phone may ask once). On iPhone, people need to remove and add the app to the home screen again to see a new icon.</p></aside></div>`;
  }
  async function makeIcon(file, bg) {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Choose a PNG, JPG or WEBP image.');
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('This image could not be read.')); i.src = URL.createObjectURL(file); });
    const draw = (pad, fill) => { const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d'); x.fillStyle = fill; x.fillRect(0, 0, 512, 512);
      const box = 512 * (1 - pad * 2), k = Math.min(box / img.width, box / img.height), w = img.width * k, h = img.height * k; x.imageSmoothingQuality = 'high'; x.drawImage(img, (512 - w) / 2, (512 - h) / 2, w, h); return c.toDataURL('image/png'); };
    const icon = draw(0.06, bg), maskable = draw(0.18, bg);
    if (icon.length + maskable.length > 590000) throw new Error('This logo is too detailed to use as an app icon. Try a simpler PNG.');
    return { icon, maskable };
  }
  function paintIconPrev(f) {
    const cur = draftIcon ? draftIcon.icon : (JSON.parse(localStorage.getItem('SHOPBILL_ICON') || 'null')?.icon || '');
    for (const id of ['#iconPrev', '#iconPrev2']) { const el = $(id, root); if (el) el.innerHTML = cur ? `<img src="${cur}" alt="">` : `<img src="icons/icon-192.png" alt="">`; }
    $('#namePrev', root).textContent = (f.app_short_name.value || f.app_title.value || 'Shop Billing').slice(0, 12);
  }

  /* ---------- themes ---------- */
  function appearanceSection() {
    const a = sys().appearance || {}, roles = ['owner', 'manager', 'cashier', 'member'], cur = a.theme || 'ledger';
    const opts = sel => Themes.list.map(t => `<option value="${t.id}" ${sel === t.id ? 'selected' : ''}>${esc(t.name)} (${t.mode})</option>`).join('');
    return `<div class="admin-stack" id="aLook">
      <section class="card"><div class="card-title-row"><div><h2>Theme for everyone</h2><p class="hint">Tap a theme — it is saved and every login in this shop switches to it within a minute. Only Admin can change themes.</p></div>
        <div class="seg" id="tFilter">${[['all', 'All 40'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => `<button type="button" data-tf="${k}" class="${themeFilter === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <div class="theme-grid" role="list">${Themes.list.filter(t => themeFilter === 'all' || t.mode === themeFilter).map(t => `<button type="button" role="listitem" class="theme-card ${t.id === cur ? 'on' : ''}" data-theme-id="${t.id}" aria-pressed="${t.id === cur}">${Themes.swatch(t, a.accent)}<b>${esc(t.name)}</b><small>${t.mode === 'dark' ? 'Dark' : 'Light'}</small>${t.id === cur ? `<span class="tc-on">${Icon('check')}</span>` : ''}</button>`).join('')}</div></section>
      <form class="card form-grid" id="aRoleTheme"><header class="span-2 card-head"><h2>Different theme for a role</h2><p class="hint">Optional. For example a dark theme for the cashier at a dim counter, or a bright one for the member app.</p></header>
        ${roles.map(r => `<label class="field"><span>${ROLE_LABEL[r]}</span><select name="role_${r}"><option value="">Same as everyone</option>${opts(a[r])}</select></label>`).join('')}</form>
      <form class="card form-grid" id="aAccent"><header class="span-2 card-head"><h2>Brand colour</h2><p class="hint">Replace the theme’s button colour with your own. It is adjusted automatically if it would be hard to read.</p></header>
        <div class="field span-2"><div class="color-row">${sw('accent_on', !!a.accent, 'Use my own colour')}<label class="color-custom"><input type="color" name="accent" value="${esc(a.accent || '#1f5fbf')}" aria-label="Brand colour"><span class="mono">${esc(a.accent || '#1f5fbf')}</span></label></div></div></form></div>`;
  }
  let themeSaving = 0;
  async function saveAppearance(patch, msg) {
    const id = ++themeSaving;
    try {
      Store.me.system = await Cloud.rpc('shop_system_save', { p: { appearance: patch } });
      if (id === themeSaving) { App.applyTheme(); paintHeader(); toast(msg, 'ok', 2200); }
    } catch (e) { toast(e.message, 'error', 6000); }
  }

  /* ---------- support, limits, roles, admins ---------- */
  function supportSection() {
    const s = sys().support || {};
    return `<div class="admin-split"><form id="aSupport" class="card form-grid">
      <header class="span-2 card-head"><h2>Support contact</h2><p class="hint">Shown in Help & contact for every login, and on the sign-in screen. Only Admin can change it.</p></header>
      <label class="field"><span>Name</span><input name="name" maxlength="60" value="${esc(s.name)}" placeholder="e.g. Sumit"></label>
      <label class="field"><span>Mobile number</span><input name="phone" maxlength="30" inputmode="tel" value="${esc(s.phone)}" placeholder="+91 …"></label>
      <label class="field"><span>WhatsApp number <em>with country code, digits only</em></span><input name="whatsapp" maxlength="20" inputmode="numeric" value="${esc(s.whatsapp)}" placeholder="919142786139"></label>
      <label class="field"><span>Email <em>optional</em></span><input name="email" type="email" maxlength="120" value="${esc(s.email)}"></label>
      <label class="field span-2"><span>Website <em>optional</em></span><input name="website" type="url" maxlength="200" value="${esc(s.website)}" placeholder="https://"></label>
      <label class="field span-2"><span>Note <em>optional, e.g. support hours</em></span><textarea name="note" rows="2" maxlength="300">${esc(s.note)}</textarea></label>
      <div class="form-actions span-2"><button class="btn btn-primary">Save support contact</button></div></form>
      <aside class="admin-preview"><h3>How staff see it</h3><div class="help-card support-card" id="supPreview"></div></aside></div>`;
  }
  function paintSupportPreview() {
    const f = $('#aSupport', root); if (!f) return;
    const v = k => f[k].value.trim();
    $('#supPreview', root).innerHTML = `<h3>System support${sys().brand?.software_name ? ` · ${esc(sys().brand.software_name)}` : ''}</h3>
      ${v('name') ? `<p class="support-name">${esc(v('name'))}</p>` : ''}${v('phone') ? `<p class="support-phone">Mob no: <b>${esc(v('phone'))}</b></p>` : ''}
      <div class="stack">${v('phone') ? `<span class="btn btn-primary">${Icon('phone')} Call</span>` : ''}${v('whatsapp') ? `<span class="btn">${Icon('whatsapp')} WhatsApp</span>` : ''}${v('email') ? `<span class="btn">${Icon('mail')} ${esc(v('email'))}</span>` : ''}</div>
      ${v('note') ? `<p class="hint pre">${esc(v('note'))}</p>` : ''}`;
  }
  function billingSection() {
    const l = sys().limits || {};
    return `<form id="aBilling" class="admin-stack">
      <section class="card form-grid"><header class="span-2 card-head"><h2>Limits</h2><p class="hint">Admin is never limited. Everyone else is — the server enforces these.</p></header>
        <label class="field"><span>Biggest discount allowed (%)</span><input name="max_discount_percent" type="number" min="0" max="100" step="0.5" value="${Number(l.max_discount_percent ?? 100)}"></label>
        <label class="field"><span>Most cash a customer can pay short (${esc(Fmt.cur())})</span><input name="max_short_amount" type="number" min="0" max="100000" step="1" value="${Number(l.max_short_amount ?? 0)}"><small class="hint">When cash received is less than the total, the bill is reduced to what was paid — up to this amount.</small></label>
        <div class="form-actions span-2"><button class="btn btn-primary">Save limits</button></div></section>
      <section class="card"><header class="card-head"><h2>Payment methods & billing screen</h2><p class="hint">These are part of the active preset (Admin → Presets), and also in <a href="#/settings">Settings → Billing</a> for managers.</p></header></section></form>`;
  }
  function rolesSection() {
    const r = sys().roles || {}, roles = ['owner', 'manager', 'cashier'], pn = sys().preset?.name;
    return `<form id="aRoles" class="card">
      <header class="card-head"><h2>Roles & permissions</h2><p class="hint">Tick what each role can see and do. ${pn ? `Saved into the active preset <b>${esc(pn)}</b>.` : ''} Permissions of screens that are switched off are hidden. The server checks every action. Admin can always do everything.</p></header>
      <div class="table-wrap perm-wrap"><table class="table perm-table"><thead><tr><th>Permission</th>${roles.map(x => `<th class="c">${ROLE_LABEL[x]}</th>`).join('')}</tr></thead><tbody>
      ${PERMISSIONS.map(([group, perms]) => { const vis = perms.filter(([k]) => Store.permShown(k)); return vis.length ? `<tr class="perm-group"><td colspan="4">${group}</td></tr>` + vis.map(([k, label]) => `<tr><td>${label}</td>${roles.map(x => `<td class="c"><input type="checkbox" data-role="${x}" data-perm="${k}" ${(r[x] || []).includes(k) ? 'checked' : ''} aria-label="${ROLE_LABEL[x]}: ${label}"></td>`).join('')}</tr>`).join('') : ''; }).join('')}
      </tbody></table></div>
      <div class="form-actions"><button type="button" class="btn btn-ghost" id="aRolesReset">Reset to default</button><button class="btn btn-primary">Save permissions</button></div></form>`;
  }
  function adminsSection() {
    return `<div class="admin-stack">
      <section class="card"><header class="card-head"><h2>Admin logins</h2><p class="hint">Admin logins never appear in the owner’s staff list, cannot be changed by the owner, and can open this page.</p></header>
        <div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Email</th><th>Last sign-in</th><th></th></tr></thead><tbody id="adminBody"><tr><td colspan="4">Loading…</td></tr></tbody></table></div></section>
      <form id="aAddAdmin" class="card form-grid"><header class="span-2 card-head"><h2>Add another admin</h2></header>
        <label class="field"><span>Name</span><input name="name" maxlength="60" placeholder="e.g. Sumit"></label>
        <label class="field"><span>Email</span><input name="email" type="email" required autocomplete="off"></label>
        <label class="field"><span>Password <em>8+ characters</em></span><input name="password" type="text" minlength="8" required autocomplete="new-password"></label>
        <div class="form-actions"><button class="btn btn-primary">Add admin</button></div></form>
      <form id="aMe" class="card form-grid"><header class="span-2 card-head"><h2>My admin login</h2><p class="hint">${esc(Store.me.email)}</p></header>
        <label class="field"><span>Name shown on bills you make</span><input name="name" maxlength="60" value="${esc(Store.me.name)}"></label>
        <label class="field"><span>New password <em>leave empty to keep</em></span><input name="password" type="password" minlength="8" autocomplete="new-password"></label>
        <div class="form-actions span-2"><button class="btn btn-primary">Save my login</button></div></form></div>`;
  }
  async function loadAdmins() {
    try {
      const list = await Cloud.rpc('shop_admin_list'); const b = $('#adminBody', root); if (!b) return;
      b.innerHTML = list.map(a => `<tr data-uid="${esc(a.user_id)}"><td><b>${esc(a.name || 'Admin')}</b>${a.me ? ' <small>(you)</small>' : ''}</td><td>${esc(a.email)}</td><td>${a.last_sign_in ? esc(Fmt.dateTime(a.last_sign_in)) : '<span class="muted">Never</span>'}</td><td class="row-act">${a.me ? '' : '<button type="button" class="btn btn-sm btn-ghost" data-remove>Remove</button>'}</td></tr>`).join('');
    } catch (e) { const b = $('#adminBody', root); if (b) b.innerHTML = `<tr><td colspan="4">${esc(e.message)}</td></tr>`; }
  }

  /* ---------- wiring ---------- */
  function show(sec) {
    section = sec;
    $$('#adminNav button', root).forEach(b => b.classList.toggle('on', b.dataset.s === sec));
    const body = $('#adminBody2', root);
    body.innerHTML = sec === 'presets' && editing ? presetEditor(editing) : { access: accessSection, presets: presetsSection, support: supportSection, brand: brandSection, appearance: appearanceSection, billing: billingSection, roles: rolesSection, admins: adminsSection }[sec]();
    if (sec === 'presets') { if (editing) wirePresetEditor(); else wirePresets(); }
    if (sec === 'appearance') {
      const look = $('#aLook', root);
      look.addEventListener('click', e => {
        const tf = e.target.closest('[data-tf]'); if (tf) { themeFilter = tf.dataset.tf; return show('appearance'); }
        const c = e.target.closest('[data-theme-id]'); if (!c) return;
        const t = Themes.get(c.dataset.themeId);
        $$('.theme-card', look).forEach(x => { const on = x === c; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); $('.tc-on', x)?.remove(); if (on) x.insertAdjacentHTML('beforeend', `<span class="tc-on">${Icon('check')}</span>`); });
        Themes.apply(t.id, Store.sys.appearance?.accent);
        saveAppearance({ theme: t.id }, `${t.name} saved for everyone.`);
      });
      $('#aRoleTheme', root).addEventListener('change', e => { const r = e.target.name.replace('role_', ''); saveAppearance({ [r]: e.target.value }, e.target.value ? `${ROLE_LABEL[r]} now use ${Themes.get(e.target.value).name}.` : `${ROLE_LABEL[r]} use the shop theme.`); });
      const af = $('#aAccent', root); let at = 0;
      const accent = () => { af.accent.nextElementSibling.textContent = af.accent.value; const v = af.accent_on.checked ? af.accent.value : ''; Themes.apply((Store.sys.appearance || {})[Store.role] || Store.sys.appearance?.theme, v); clearTimeout(at); at = setTimeout(() => saveAppearance({ accent: v }, v ? 'Brand colour saved.' : 'Theme colours restored.'), 500); };
      af.addEventListener('change', accent); af.addEventListener('input', e => { if (e.target.name === 'accent') { af.accent_on.checked = true; accent(); } });
    }
    if (sec === 'access') {
      const f = $('#aAccess', root);
      $('#managerViewBtn', root).onclick = async e => { if (await ask({ title: 'Hide admin-only tabs?', body: 'Every admin login will see the app the way a manager does. Bring the tabs back any time with “Show admin tabs” at the bottom of the side menu.', confirm: 'Hide admin-only tabs' })) App.setManagerView(true, e.currentTarget); };
      f.onsubmit = e => { e.preventDefault(); save({ access: { message: f.message.value.trim() } }, e.submitter, 'Message saved.'); };
      $('#powerBtn', root).onclick = async e => {
        const on = !sys().access?.locked;
        if (on && !(await ask({ title: 'Shut down the system?', body: 'Owner, staff and members will be signed out and cannot sign in until you turn it back on. Admin logins keep working. Nothing is deleted.', confirm: 'Shut down', danger: true }))) return;
        const ok = await save({ access: { locked: on, message: f.message.value.trim() || sys().access?.message || '', locked_at: on ? new Date().toISOString() : null } }, e.currentTarget,
          on ? 'System shut down. Only admin logins work now.' : 'System is running again. Everyone can sign in.');
        if (ok) { App.paintLock(); paintHeader(); show('access'); }
      };
    }
    if (sec === 'support') {
      const f = $('#aSupport', root); paintSupportPreview(); f.oninput = paintSupportPreview;
      f.onsubmit = e => { e.preventDefault(); save({ support: { name: f.name.value.trim(), phone: f.phone.value.trim(), whatsapp: f.whatsapp.value.replace(/\D/g, ''), email: f.email.value.trim(), website: f.website.value.trim(), note: f.note.value.trim() } }, e.submitter, 'Support contact saved.').then(paintHeader); };
    }
    if (sec === 'brand') {
      const f = $('#aBrand', root); draftIcon = null; paintIconPrev(f);
      f.oninput = () => paintIconPrev(f);
      let lastFile = null;
      const build = async file => { try { draftIcon = await makeIcon(file, f.icon_bg.value); paintIconPrev(f); } catch (ex) { toast(ex.message, 'error'); } };
      $('#iconFile', root).onchange = e => { lastFile = e.target.files[0]; e.target.value = ''; if (lastFile) build(lastFile).then(() => toast('Logo ready. Press Save to use it.')); };
      f.icon_bg.onchange = () => { if (lastFile) build(lastFile); };
      $('#iconRemove', root).onclick = () => { draftIcon = { icon: '', maskable: '' }; lastFile = null; paintIconPrev(f); };
      f.onsubmit = async e => {
        e.preventDefault(); const btn = e.submitter; busy(btn, true, 'Saving…');
        try {
          if (draftIcon) { const r = await Cloud.rpc('shop_app_icon_save', { p_icon: draftIcon.icon, p_maskable: draftIcon.maskable }); localStorage.setItem('SHOPBILL_ICON', JSON.stringify({ v: r.v, icon: r.icon })); App.setIcon(r.icon); draftIcon = null; }
          Store.me.system = await Cloud.rpc('shop_system_save', { p: { brand: { software_name: f.software_name.value.trim(), app_title: f.app_title.value.trim() || 'Shop Billing', app_short_name: f.app_short_name.value.trim(), signin_message: f.signin_message.value.trim(), show_on_bill: f.show_on_bill.checked, show_on_signin: f.show_on_signin.checked } } });
          await App.refreshMe(true); toast('App name and logo saved.', 'ok');
        } catch (ex) { toast(ex.message, 'error', 7000); } finally { busy(btn, false); }
      };
    }
    if (sec === 'billing') {
      const f = $('#aBilling', root);
      f.onsubmit = e => { e.preventDefault(); save({ limits: { max_discount_percent: Number(f.max_discount_percent.value) || 0, max_short_amount: Number(f.max_short_amount.value) || 0 } }, e.submitter, 'Limits saved.').then(paintHeader); };
    }
    if (sec === 'roles') {
      const f = $('#aRoles', root);
      f.onsubmit = e => {
        e.preventDefault();
        const cur = sys().roles || {}, roles = {};
        for (const r of ['owner', 'manager', 'cashier']) {
          const hidden = (cur[r] || []).filter(p => !Store.permShown(p));            // keep permissions of switched-off screens
          roles[r] = [...hidden, ...$$(`[data-role="${r}"]`, f).filter(c => c.checked).map(c => c.dataset.perm)];
        }
        save({ roles }, e.submitter, 'Permissions saved. Staff see the change within a minute.');
      };
      $('#aRolesReset', root).onclick = async () => {
        if (!(await ask({ title: 'Reset permissions?', body: 'Owner, manager and cashier go back to the standard permissions.', confirm: 'Reset' }))) return;
        if (await save({ roles: DEF.roles }, null, 'Permissions reset.')) show('roles');
      };
    }
    if (sec === 'admins') {
      loadAdmins();
      $('#adminBody', root).addEventListener('click', async e => {
        const tr = e.target.closest('tr[data-uid]'); if (!tr || !e.target.closest('[data-remove]')) return;
        if (!(await ask({ title: 'Remove this admin?', body: 'They will no longer be able to sign in to this shop.', confirm: 'Remove admin', danger: true }))) return;
        try { await Cloud.rpc('shop_admin_remove', { p_user_id: tr.dataset.uid }); toast('Admin removed.', 'ok'); loadAdmins(); } catch (ex) { toast(ex.message, 'error'); }
      });
      $('#aAddAdmin', root).onsubmit = async e => {
        e.preventDefault(); const f = e.target; busy(e.submitter, true, 'Saving…');
        try { await Cloud.rpc('shop_admin_set', { p_email: f.email.value.trim(), p_name: f.name.value.trim(), p_password: f.password.value }); toast('Admin added.', 'ok'); f.reset(); loadAdmins(); }
        catch (ex) { toast(ex.message, 'error', 7000); } finally { busy(e.submitter, false); }
      };
      $('#aMe', root).onsubmit = async e => {
        e.preventDefault(); const f = e.target; busy(e.submitter, true, 'Saving…');
        try { await Cloud.rpc('shop_admin_set', { p_email: Store.me.email, p_name: f.name.value.trim(), p_password: f.password.value || null }); await App.refreshMe(); f.password.value = ''; toast('Your login is saved.', 'ok'); loadAdmins(); }
        catch (ex) { toast(ex.message, 'error', 7000); } finally { busy(e.submitter, false); }
      };
    }
  }

  function paintHeader() {
    const h = $('#adminSummary', root); if (!h) return;
    const s = sys().support || {}, locked = !!sys().access?.locked, pr = sys().preset || {};
    h.innerHTML = `<div class="sum ${locked ? 'is-bad' : ''}"><span>System</span><b>${locked ? 'Shut down' : 'Running'}</b><small>${locked ? 'Only admin can sign in' : 'Everyone can sign in'}</small></div>
      ${(Cloud.hiddenAdmin || []).includes('presets') ? `<div class="sum"><span>Business</span><b>${esc(Store.settings.shop_name || 'Restaurant')}</b><small>Restaurant workspace</small></div>` : `<div class="sum"><span>Preset</span><b>${esc(pr.name || '—')}</b><small><button type="button" class="linkish" data-goto="presets">Change</button></small></div>`}
      <div class="sum"><span>Theme</span><b>${esc(Themes.get(sys().appearance?.theme).name)}</b><small><button type="button" class="linkish" data-goto="appearance">Change</button></small></div>
      <div class="sum"><span>Support</span><b>${esc(s.name || '—')}</b><small>${esc(s.phone || 'No number')}</small></div>`;
  }

  function mount(view) {
    root = view; presets = null; editing = null;
    view.innerHTML = `<div class="page admin-page">
      <header class="page-head"><div><h1>${Icon('shield')} Admin</h1><p class="sub">Only admin logins can see this page. Changes apply to every login in this shop straight away.</p></div></header>
      <div class="summary admin-summary" id="adminSummary"></div>
      <div class="settings admin-layout">
        <nav class="set-nav admin-nav" id="adminNav">${SECTIONS.map(([k, l, ic, d]) => `<button type="button" data-s="${k}">${Icon(ic)}<span><b>${l}</b><small>${d}</small></span></button>`).join('')}</nav>
        <div id="adminBody2"></div>
      </div></div>`;
    $('#adminNav', view).onclick = e => { const b = e.target.closest('[data-s]'); if (b) { if (b.dataset.s === 'presets') editing = null; show(b.dataset.s); } };
    $('.page', view).addEventListener('click', e => { const g = e.target.closest('[data-goto]'); if (g) { editing = null; show(g.dataset.goto); } });
    paintHeader(); show(section);
  }
  return { mount, unmount() { root = null; App.applyTheme(); }, refresh() { if (root) paintHeader(); } };
})();

/* offline/local-db.js?v=20 */
;/* The till's own database, on the device.
   One small interface, two drivers underneath:
     • SQLite  — used inside the installed Windows and Android app (Tauri SQL plugin).
     • IndexedDB — used in the browser and the installed web app.
   Both keep the same tables, the same indexes and real all-or-nothing transactions, so the
   rest of the app never knows or cares which one it is talking to.

   The SQLite driver takes its low-level runner as a parameter, so the very same code is
   driven by the Tauri plugin on a device and by a plain SQLite library in the test suite. */
'use strict';
const LocalDB = (() => {

  /* Every table, its key, and the fields worth indexing.
     Rows are kept whole as JSON with the indexed fields copied out beside them, which keeps
     the two drivers identical and lets a table gain a field later without a migration. */
  const SCHEMA = {
    meta:        { key: 'k',     index: {} },
    items:       { key: 'id',    index: { name: 'text', category: 'text' } },
    categories:  { key: 'name',  index: { sort_order: 'int' } },
    bills:       { key: 'id',    index: { bill_day: 'text', created_at: 'text', sync_state: 'text', invoice_no: 'text' } },
    bill_items:  { key: 'id',    index: { bill_id: 'text', name: 'text' } },
    stock_moves: { key: 'id',    index: { item_id: 'text', created_at: 'text', sync_state: 'text' } },
    outbox:      { key: 'op_id', index: { state: 'text', created_at: 'text', next_try_at: 'text' } },
    conflicts:   { key: 'id',    index: { created_at: 'text', seen: 'int' } },
    blobs:       { key: 'id',    index: { state: 'text' } }
  };
  const STORES = Object.keys(SCHEMA);
  const VERSION = 1;                       // bump only when SCHEMA changes shape
  const keyOf = store => SCHEMA[store].key;

  /* ---------------- IndexedDB driver (browser, installed web app) ---------------- */
  function idbDriver(dbName) {
    let db = null;
    const open = () => new Promise((ok, no) => {
      const req = indexedDB.open(dbName, VERSION);
      req.onupgradeneeded = e => {
        const d = req.result;
        for (const [store, def] of Object.entries(SCHEMA)) {
          const s = d.objectStoreNames.contains(store) ? req.transaction.objectStore(store) : d.createObjectStore(store, { keyPath: def.key });
          for (const field of Object.keys(def.index)) if (!s.indexNames.contains(field)) s.createIndex(field, field, { unique: false });
        }
        void e;
      };
      req.onsuccess = () => { db = req.result; db.onversionchange = () => db.close(); ok(db); };
      req.onerror = () => no(req.error || Error('This browser would not open local storage.'));
      req.onblocked = () => no(Error('Another copy of this app is open and is holding the local database. Close the other tab and try again.'));
    });
    const done = tx => new Promise((ok, no) => { tx.oncomplete = () => ok(); tx.onerror = () => no(tx.error); tx.onabort = () => no(tx.error || Error('The local save was rolled back.')); });
    const wrap = req => new Promise((ok, no) => { req.onsuccess = () => ok(req.result); req.onerror = () => no(req.error); });

    /* A handle over one IndexedDB transaction. Only these calls may be used inside tx(): an
       IndexedDB transaction closes itself the moment it waits on anything outside itself. */
    function handle(tx) {
      return {
        get: (store, key) => wrap(tx.objectStore(store).get(key)),
        put: (store, row) => wrap(tx.objectStore(store).put(row)).then(() => row),
        del: (store, key) => wrap(tx.objectStore(store).delete(key)).then(() => true),
        count: store => wrap(tx.objectStore(store).count()),
        all: (store, q = {}) => query(tx.objectStore(store), q)
      };
    }
    function query(os, q) {
      const src = q.index ? os.index(q.index) : os;
      let range = null;
      try {
        if (q.equals !== undefined) range = IDBKeyRange.only(q.equals);
        else if (q.from !== undefined && q.to !== undefined) range = IDBKeyRange.bound(q.from, q.to);
        else if (q.from !== undefined) range = IDBKeyRange.lowerBound(q.from);
        else if (q.to !== undefined) range = IDBKeyRange.upperBound(q.to);
      } catch { range = null; }
      const out = [], limit = q.limit || Infinity;
      let skip = q.offset || 0;
      return new Promise((ok, no) => {
        const req = src.openCursor(range, q.desc ? 'prev' : 'next');
        req.onsuccess = () => {
          const c = req.result;
          if (!c || out.length >= limit) return ok(out);
          if (skip > 0) { skip--; c.continue(); return; }
          out.push(c.value); c.continue();
        };
        req.onerror = () => no(req.error);
      });
    }
    return {
      kind: 'indexeddb',
      async open() { if (!db) await open(); return true; },
      async tx(stores, fn) {
        const tx = db.transaction(stores, 'readwrite');
        const finished = done(tx);
        let result;
        try { result = await fn(handle(tx)); }
        catch (e) { try { tx.abort(); } catch { /* already gone */ } throw e; }
        await finished;                      // only resolves once everything is really written
        return result;
      },
      async read(stores, fn) {
        const tx = db.transaction(stores, 'readonly');
        const r = await fn(handle(tx));
        await done(tx).catch(() => {});
        return r;
      },
      async wipe() { if (db) { db.close(); db = null; } await new Promise(ok => { const r = indexedDB.deleteDatabase(dbName); r.onsuccess = r.onerror = r.onblocked = () => ok(); }); }
    };
  }

  /* ---------------- SQLite driver (installed Windows / Android app) ----------------
     `runner` supplies two calls: execute(sql, params) and select(sql, params).
     Tauri's SQL plugin provides them on a device; the test suite provides the same two
     calls over a plain SQLite file, so this code path is exercised without the app. */
  function sqlDriver(runner) {
    const col = f => 'i_' + f;
    const ddl = [];
    for (const [store, def] of Object.entries(SCHEMA)) {
      const extra = Object.entries(def.index).map(([f, t]) => `, ${col(f)} ${t === 'int' ? 'INTEGER' : 'TEXT'}`).join('');
      ddl.push(`CREATE TABLE IF NOT EXISTS ${store} (k TEXT PRIMARY KEY, doc TEXT NOT NULL${extra})`);
      for (const f of Object.keys(def.index)) ddl.push(`CREATE INDEX IF NOT EXISTS ix_${store}_${f} ON ${store}(${col(f)})`);
    }
    const row = (store, r) => {
      const def = SCHEMA[store], vals = [String(r[def.key]), JSON.stringify(r)];
      const cols = ['k', 'doc'];
      for (const f of Object.keys(def.index)) { cols.push(col(f)); vals.push(r[f] === undefined || r[f] === null ? null : (SCHEMA[store].index[f] === 'int' ? Number(r[f]) : String(r[f]))); }
      return { sql: `INSERT INTO ${store} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')}) ` +
                    `ON CONFLICT(k) DO UPDATE SET ${cols.slice(1).map(c => `${c}=excluded.${c}`).join(',')}`, vals };
    };
    const parse = rs => (rs || []).map(x => JSON.parse(x.doc));
    function where(store, q) {
      const c = q.index ? col(q.index) : 'k';
      const parts = [], vals = [];
      if (q.equals !== undefined) { parts.push(`${c} = ?`); vals.push(q.equals); }
      if (q.from !== undefined) { parts.push(`${c} >= ?`); vals.push(q.from); }
      if (q.to !== undefined) { parts.push(`${c} <= ?`); vals.push(q.to); }
      return { clause: parts.length ? ' WHERE ' + parts.join(' AND ') : '', vals, order: ` ORDER BY ${c} ${q.desc ? 'DESC' : 'ASC'}` };
    }
    const handle = {
      async get(store, key) { const r = await runner.select(`SELECT doc FROM ${store} WHERE k = ?`, [String(key)]); return r[0] ? JSON.parse(r[0].doc) : undefined; },
      async put(store, r) { const q = row(store, r); await runner.execute(q.sql, q.vals); return r; },
      async del(store, key) { await runner.execute(`DELETE FROM ${store} WHERE k = ?`, [String(key)]); return true; },
      async count(store) { const r = await runner.select(`SELECT COUNT(*) n FROM ${store}`); return Number(r[0].n); },
      async all(store, q = {}) {
        const w = where(store, q);
        const lim = q.limit ? ` LIMIT ${Number(q.limit)}` : (q.offset ? ' LIMIT -1' : '');
        const off = q.offset ? ` OFFSET ${Number(q.offset)}` : '';
        return parse(await runner.select(`SELECT doc FROM ${store}${w.clause}${w.order}${lim}${off}`, w.vals));
      }
    };
    let depth = 0;
    return {
      kind: 'sqlite',
      async open() {
        await runner.execute('PRAGMA journal_mode = WAL');      // survives a sudden power cut
        await runner.execute('PRAGMA foreign_keys = ON');
        await runner.execute('PRAGMA synchronous = FULL');      // a saved bill is really on disk
        for (const s of ddl) await runner.execute(s);
        return true;
      },
      async tx(stores, fn) {
        void stores;
        if (depth++ > 0) { try { return await fn(handle); } finally { depth--; } }
        await runner.execute('BEGIN IMMEDIATE');
        try { const r = await fn(handle); await runner.execute('COMMIT'); return r; }
        catch (e) { try { await runner.execute('ROLLBACK'); } catch { /* already rolled back */ } throw e; }
        finally { depth--; }
      },
      async read(stores, fn) { void stores; return fn(handle); },
      async wipe() { for (const s of STORES) await runner.execute(`DELETE FROM ${s}`); }
    };
  }

  /* ---------------- choosing a driver ---------------- */
  let driver = null, ready = null;
  const tauriSql = () => {
    const t = typeof window !== 'undefined' && (window.__TAURI__ || window.__TAURI_INTERNALS__);
    if (!t) return null;
    const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke || window.__TAURI_INTERNALS__?.invoke;
    if (typeof invoke !== 'function') return null;
    const DB = 'sqlite:restaurant-till.db';
    // The SQL plugin wants the file opened once before anything is asked of it. It is also
    // listed under "preload" in tauri.conf.json; asking again here costs nothing and means a
    // changed configuration can never leave the till with no database.
    let loaded = null;
    const ready = () => (loaded ||= invoke('plugin:sql|load', { db: DB }).catch(e => { loaded = null; throw e; }));
    return {
      async execute(sql, params = []) { await ready(); return invoke('plugin:sql|execute', { db: DB, query: sql, values: params }); },
      async select(sql, params = []) { await ready(); return invoke('plugin:sql|select', { db: DB, query: sql, values: params }); }
    };
  };

  function open({ name = 'restaurant-till', runner = null } = {}) {
    if (ready) return ready;
    const low = runner || tauriSql();
    driver = low ? sqlDriver(low) : idbDriver(name);
    ready = driver.open().then(() => driver).catch(e => { ready = null; throw e; });
    return ready;
  }

  const need = () => { if (!driver) throw Error('The local database is not open yet.'); return driver; };
  return {
    SCHEMA, STORES, VERSION, keyOf, open,
    get kind() { return driver ? driver.kind : 'none'; },
    get isOpen() { return !!driver; },
    tx: (stores, fn) => need().tx(stores, fn),
    read: (stores, fn) => need().read(stores, fn),
    get: (store, key) => need().read([store], h => h.get(store, key)),
    all: (store, q) => need().read([store], h => h.all(store, q)),
    count: store => need().read([store], h => h.count(store)),
    put: (store, row) => need().tx([store], h => h.put(store, row)),
    del: (store, key) => need().tx([store], h => h.del(store, key)),
    wipe: () => need().wipe(),
    /* exposed so the test suite can drive the SQLite path without Tauri */
    _sqlDriver: sqlDriver, _idbDriver: idbDriver
  };
})();
if (typeof module !== 'undefined') module.exports = LocalDB;

/* offline/repo.js?v=20 */
;/* What the till knows and does on its own, with or without internet.
   Everything a bill touches — the bill, its lines, the stock it uses and the note telling the
   server about it — is written in ONE transaction. If any part of it fails, none of it happened,
   and the screen never says "saved" until the device has really saved it. */
'use strict';
const LocalRepo = (() => {
  const DB = () => LocalDB;
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
  const money = n => Math.round((Number(n) || 0) * 100) / 100;
  const nowISO = () => new Date().toISOString();
  const dayIn = (tz = 'Asia/Kolkata', d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d);

  /* ---------- small settings kept beside the data ---------- */
  const metaGet = async (k, fallback = null) => { const r = await DB().get('meta', k); return r === undefined ? fallback : r.v; };
  const metaSet = (k, v) => DB().put('meta', { k, v });
  const metaSetIn = (h, k, v) => h.put('meta', { k, v });

  /* ---------- this device ---------- */
  async function deviceId() {
    let id = await metaGet('device_id');
    if (!id) { id = uuid(); await metaSet('device_id', id); }
    return id;
  }
  const shortId = id => String(id || '').replace(/-/g, '').slice(0, 4).toUpperCase();

  /* ---------- invoice numbers that stay unique with no internet ----------
     The server hands this device a block of numbers in advance (say 101–200) and moves the
     year's counter past them, so no other device and no online bill can ever use the same
     number. Offline, bills take the next number from the block.
     If the block runs out while still offline the bill is NOT blocked — money comes first —
     it is given a clearly marked number carrying this device's tag, which stays unique and is
     never quietly renumbered afterwards. */
  const pad = (n, digits) => { const s = String(n); return s.length >= digits ? s : s.padStart(digits, '0'); };
  async function invoiceState() {
    return (await metaGet('invoice_block')) || { prefix: 'INV', digits: 3, year: '', start: 0, end: -1, next: 0, fallback: 0 };
  }
  function takeInvoice(block, device) {
    if (block.next <= block.end && block.end > 0) return { no: block.prefix + pad(block.next, block.digits), block: { ...block, next: block.next + 1 }, provisional: false };
    const n = (block.fallback || 0) + 1;
    return { no: `${block.prefix}-${shortId(device)}-${pad(n, 4)}`, block: { ...block, fallback: n }, provisional: true };
  }
  const invoiceLeft = b => (b.end >= b.start && b.next <= b.end) ? (b.end - b.next + 1) : 0;

  /* ---------- the catalogue, kept locally so billing never waits for the network ---------- */
  async function saveCatalogue(items, categories) {
    await DB().tx(['items', 'categories', 'meta'], async h => {
      for (const i of items) await h.put('items', i);
      if (Array.isArray(categories)) {
        let n = 0;
        for (const c of categories) await h.put('categories', { name: typeof c === 'string' ? c : c.name, sort_order: n++ });
      }
      await metaSetIn(h, 'catalogue_at', nowISO());
    });
  }
  const catalogue = async () => ({
    items: await DB().all('items', { index: 'name' }),
    categories: (await DB().all('categories', { index: 'sort_order' })).map(c => c.name)
  });

  /* ---------- the bill ---------- */
  /* Works out one bill exactly the way the server does, so the figure on the screen, the figure
     on the printed receipt and the figure that reaches the server are the same figure. */
  function price(args, items) {
    const lines = [];
    for (const raw of args.p_items || []) {
      const qty = Number(raw.qty);
      if (!Number.isFinite(qty) || qty <= 0) throw Error('Every line needs a quantity.');
      if (raw.custom) {
        lines.push({ id: null, size: null, custom: true, name: String(raw.name || 'Item').slice(0, 120), unit: raw.unit || 'pcs', qty, price: money(raw.price) });
        continue;
      }
      const it = items.get(raw.id);
      if (!it) throw Error(`“${raw.name || 'An item'}” is not in this device's item list yet. Connect once so the list can be copied here.`);
      if (it.active === false) throw Error(`“${it.name}” is not for sale.`);
      let menuId = raw.id, size = null;
      try { const p = JSON.parse(raw.id); if (Array.isArray(p)) { menuId = p[0]; size = p[1] || null; } } catch { /* a plain id */ }
      lines.push({ id: menuId, size, item_id: raw.id, custom: false, name: it.name, unit: it.unit || 'pcs', qty, price: money(it.price) });
    }
    if (!lines.length) throw Error('This bill has no items.');
    const subtotal = money(lines.reduce((n, l) => n + l.qty * l.price, 0));
    const dv = Number(args.p_discount_value) || 0;
    let discount = 0;
    if (dv > 0) discount = args.p_discount_mode === 'amount' ? Math.min(money(dv), subtotal) : money(subtotal * Math.min(dv, 100) / 100);
    const taxable = money(subtotal - discount);
    const s = args.__settings || {};
    const tax = s.tax_enabled ? (s.tax_mode === 'fixed' ? (taxable > 0 ? money(s.tax_value) : 0) : money(taxable * (Number(s.tax_value) || 0) / 100)) : 0;
    let total = money(taxable + tax), short = 0;
    const rec = Number(args.p_cash_received) || 0;
    if (args.p_payment_method === 'Cash' && rec > 0 && rec < total) { short = money(total - rec); total = money(rec); }
    return { lines, subtotal, discount, tax, total, short, change: rec > total ? money(rec - total) : 0 };
  }

  /* One bill, saved completely or not at all. */
  async function commitBill(args) {
    const device = await deviceId();
    const items = new Map((await DB().all('items', {})).map(i => [i.id, i]));
    const t = price(args, items);

    // The screen already showed a total. If this device works out a different one, something is
    // wrong — stop rather than save a bill that does not match the receipt the customer saw.
    const shown = Number(args.p_expected_total);
    if (Number.isFinite(shown) && Math.abs(shown - t.total) > 0.05) {
      throw Error(`This bill now adds up to ${t.total.toFixed(2)}, not ${shown.toFixed(2)}. Check the bill and save it again.`);
    }

    const opId = args.p_request_id || uuid();
    const billId = opId;                                  // the bill and its operation share an id
    const createdAt = nowISO();
    const tz = args.__settings?.timezone || 'Asia/Kolkata';
    const day = dayIn(tz);

    return DB().tx(['meta', 'bills', 'bill_items', 'stock_moves', 'items', 'outbox'], async h => {
      const existing = await h.get('bills', billId);
      if (existing) return existing;                      // the same save pressed twice

      // Everything in here must stay inside this one transaction: opening another one
      // (even just to read a setting) makes the browser close this one underneath us.
      const blockRow = await h.get('meta', 'invoice_block');
      const block = blockRow ? blockRow.v : { prefix: 'INV', digits: 3, year: '', start: 0, end: -1, next: 0, fallback: 0 };
      const inv = takeInvoice(block, device);
      await metaSetIn(h, 'invoice_block', inv.block);

      const bill = {
        id: billId, op_id: opId, device_id: device,
        invoice_no: inv.no, invoice_provisional: inv.provisional,
        bill_no: inv.no, order_no: null, order_id: null,
        bill_day: day, created_at: createdAt,
        status: 'Paid', order_source: 'manual', table_number: 'Counter',
        cashier_name: args.__cashier || 'Counter',
        customer_name: String(args.p_customer_name || '').slice(0, 80),
        customer_phone: String(args.p_customer_phone || '').slice(0, 20),
        notes: String(args.p_notes || '').slice(0, 300),
        items: t.lines.map(l => ({ ...l, item_id: l.item_id || null, line_total: money(l.qty * l.price), subtotal: money(l.qty * l.price) })),
        items_subtotal: t.subtotal,
        discount_amount: money(t.discount + t.short), bill_discount: t.discount, short_amount: t.short,
        tax_amount: t.tax, round_off: 0, total: t.total,
        cash_received: Number(args.p_cash_received) || null, change_amount: t.change,
        native_payment_method: args.p_payment_method === 'Cash' ? 'Cash' : 'Online',
        payment_method: args.p_payment_method === 'Cash' ? 'Cash' : 'UPI',
        sync_state: 'pending', stock_updates: []
      };

      for (const [n, l] of bill.items.entries()) {
        await h.put('bill_items', { id: billId + ':' + n, bill_id: billId, name: l.name, qty: l.qty, price: l.price, line_total: l.line_total, item_id: l.item_id, custom: !!l.custom });
      }

      // Stock comes down here and the same change is written to the ledger, so when this bill
      // reaches the server it is added to whatever the other devices sold, never on top of it.
      for (const l of bill.items) {
        if (l.custom || !l.item_id) continue;
        const it = await h.get('items', l.item_id);
        if (!it || !it.track_stock) continue;
        const before = Number(it.stock) || 0, after = Math.max(0, before - Math.ceil(l.qty));
        await h.put('items', { ...it, stock: after });
        await h.put('stock_moves', { id: billId + ':' + l.item_id, item_id: l.item_id, menu_id: l.id, variant: l.size || 'single',
          change: -Math.ceil(l.qty), balance_after: after, reason: 'sale', ref: inv.no, device_id: device,
          created_at: createdAt, op_id: opId, sync_state: 'with_bill' });
        bill.stock_updates.push({ id: l.item_id, stock: after });
      }

      await h.put('bills', bill);
      await h.put('outbox', {
        op_id: opId, kind: 'bill.create', state: 'pending', tries: 0, created_at: createdAt, next_try_at: createdAt, error: '',
        payload: {
          invoice_no: bill.invoice_no, customer_name: bill.customer_name, notes: bill.notes,
          payment_method: bill.native_payment_method, bill_day: bill.bill_day, created_at: createdAt,
          items: bill.items.map(l => ({ id: l.id, size: l.size, custom: !!l.custom, name: l.name, qty: l.qty, price: l.price })),
          discount_amount: bill.discount_amount, tax_amount: bill.tax_amount, total: bill.total
        }
      });
      return bill;
    });
  }

  /* ---------- stock changed by hand ---------- */
  async function adjustStock({ item_id, mode, qty, note = '' }) {
    const device = await deviceId(), opId = uuid(), at = nowISO();
    const n = Number(qty);
    if (!['set', 'in', 'out'].includes(mode) || !Number.isFinite(n) || n < 0) throw Error('Choose a valid stock change.');
    return DB().tx(['items', 'stock_moves', 'outbox'], async h => {
      const it = await h.get('items', item_id);
      if (!it) throw Error('Reload Items before changing stock.');
      const before = Number(it.stock) || 0;
      const after = mode === 'set' ? Math.round(n) : mode === 'in' ? before + Math.round(n) : before - Math.round(n);
      if (after < 0 || after > 1000000) throw Error('Stock must be a whole quantity from 0 to 1000000.');
      const change = after - before;
      const next = { ...it, stock: after, track_stock: true };
      await h.put('items', next);
      let menuId = item_id, size = null;
      try { const p = JSON.parse(item_id); if (Array.isArray(p)) { menuId = p[0]; size = p[1] || null; } } catch { /* plain id */ }
      await h.put('stock_moves', { id: opId, item_id, menu_id: menuId, variant: size || 'single', change, balance_after: after,
        reason: !it.track_stock ? 'opening' : mode === 'in' ? 'stock_in' : mode === 'out' ? 'stock_out' : 'set',
        ref: '', note: String(note).slice(0, 200), device_id: device, created_at: at, op_id: opId, sync_state: 'pending' });
      if (change !== 0) await h.put('outbox', { op_id: opId, kind: 'stock.move', state: 'pending', tries: 0, created_at: at, next_try_at: at, error: '',
        payload: { menu_id: menuId, variant: size || 'single', change, reason: mode === 'set' ? 'set' : mode === 'in' ? 'stock_in' : 'stock_out', ref: '' } });
      return next;
    });
  }

  /* ---------- reading back what this device holds ---------- */
  async function bills({ from, to, status = 'all', payment = 'all', query = '', offset = 0, limit = 50 }) {
    const all = await DB().all('bills', { index: 'bill_day', from, to });
    all.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const q = String(query || '').trim().toLowerCase();
    const hit = all.filter(b =>
      (status === 'all' || !status || b.status === status) &&
      (payment === 'all' || !payment || b.payment_method === payment) &&
      (!q || [b.bill_no, b.invoice_no, b.customer_name, '#' + (b.order_no || ''), b.table_number].join(' ').toLowerCase().includes(q)));
    const paid = all.filter(b => b.status !== 'Cancelled');
    const sum = (xs, f = () => true) => money(xs.filter(f).reduce((n, b) => n + Number(b.total || 0), 0));
    return { from, to, total: hit.length, rows: hit.slice(offset, offset + limit),
      summary: { sales: sum(paid), bills: paid.length, cancelled: all.length - paid.length,
        cash: sum(paid, b => b.payment_method === 'Cash'), upi: sum(paid, b => b.payment_method === 'UPI'), card: 0 } };
  }

  async function dashboard({ from, to }) {
    const all = (await DB().all('bills', { index: 'bill_day', from, to })).filter(b => b.status !== 'Cancelled');
    const sales = money(all.reduce((n, b) => n + Number(b.total || 0), 0));
    const top = new Map(), trend = new Map(), pay = new Map(), cat = new Map();
    const items = new Map((await DB().all('items', {})).map(i => [i.id, i]));
    let qty = 0;
    for (const b of all) {
      trend.set(b.bill_day, money((trend.get(b.bill_day) || 0) + Number(b.total)));
      const m = b.payment_method || 'Cash';
      pay.set(m, { method: m, amount: money((pay.get(m)?.amount || 0) + Number(b.total)), bills: (pay.get(m)?.bills || 0) + 1 });
      for (const l of b.items || []) {
        qty += Number(l.qty) || 0;
        const t = top.get(l.name) || { name: l.name, unit: l.unit || 'pcs', qty: 0, revenue: 0 };
        t.qty += Number(l.qty) || 0; t.revenue = money(t.revenue + Number(l.line_total || 0)); top.set(l.name, t);
        const c = (items.get(l.item_id) || {}).category || 'Other';
        const e = cat.get(c) || { category: c, name: c, qty: 0, revenue: 0 };
        e.qty += Number(l.qty) || 0; e.revenue = money(e.revenue + Number(l.line_total || 0)); e.sales = e.revenue; cat.set(c, e);
      }
    }
    const low = [...items.values()].filter(i => i.track_stock && Number(i.stock) <= (Number(i.low_stock_at) || 5))
      .sort((a, b) => a.stock - b.stock).slice(0, 20).map(i => ({ id: i.id, name: i.name, stock: Number(i.stock) || 0, low_stock_at: Number(i.low_stock_at) || 5, unit: i.unit || 'pcs' }));
    const label = k => new Date(k + 'T12:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    return { from, to, offline: true,
      metrics: { sales, bills: all.length, cancelled: 0, cancelled_value: 0, avg_bill: all.length ? money(sales / all.length) : 0,
        qty, discount: money(all.reduce((n, b) => n + Number(b.discount_amount || 0), 0)), tax: money(all.reduce((n, b) => n + Number(b.tax_amount || 0), 0)),
        profit: 0, profit_available: false, profit_cover: 0, expenses_on: false, expenses: 0, expenses_in_profit: false, prev_available: false, prev_sales: 0 },
      trend_unit: 'day', trend: [...trend].sort().map(([k, v]) => ({ key: k, label: label(k), sales: v })),
      payments: ['Cash', 'UPI'].map(m => pay.get(m) || { method: m, amount: 0, bills: 0 }),
      top_items: [...top.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
      categories: [...cat.values()].sort((a, b) => b.revenue - a.revenue),
      expense_heads: [], low_stock: low,
      recent: (await DB().all('bills', { index: 'created_at', desc: true, limit: 8 })) };
  }

  const stockMoves = async ({ item_id = null, offset = 0, limit = 50 }) => {
    const rows = (await DB().all('stock_moves', { index: 'created_at', desc: true }))
      .filter(m => !item_id || m.item_id === item_id);
    return { total: rows.length, rows: rows.slice(offset, offset + limit).map(m => ({ created_at: m.created_at, ref: m.item_id, item_name: m.item_name || '', reason: m.reason, change: m.change, balance: m.balance_after, note: m.note || '', actor_name: 'This device' })) };
  };

  /* ---------- what the server told us while we were away ---------- */
  async function applyChanges(changes) {
    if (!changes.length) return 0;
    let n = 0;
    await DB().tx(['items', 'categories', 'bills', 'meta'], async h => {
      for (const c of changes) {
        const d = c.data || {};
        if (c.kind === 'category') { c.deleted ? await h.del('categories', c.row_id) : await h.put('categories', { name: d.name, sort_order: Number(d.sort_order) || 0 }); n++; }
        else if (c.kind === 'item') {
          if (c.deleted) { for (const row of await h.all('items', {})) if (String(row.menu_id || row.id) === c.row_id || String(row.id).includes(`"${c.row_id}"`)) await h.del('items', row.id); }
          else {
            // keep the local shape: the id used by the screens is [menu id, portion]
            const id = JSON.stringify([d.id, null]);
            const was = await h.get('items', id);
            await h.put('items', { ...(was || {}), id, menu_id: d.id, name: d.name, category: d.category, price: Number(d.price),
              description: d.description || '', image: d.image || '', active: d.available !== false, unit: was?.unit || 'pcs',
              track_stock: was?.track_stock || false, stock: was?.stock || 0, low_stock_at: was?.low_stock_at || 0, updated_at: d.updated_at });
          }
          n++;
        } else if (c.kind === 'stock' && !c.deleted) {
          const id = JSON.stringify([d.menu_id, d.variant === 'single' ? null : d.variant]);
          const was = await h.get('items', id);
          if (was) { await h.put('items', { ...was, track_stock: !!d.tracked, stock: Number(d.remaining) || 0 }); n++; }
        }
      }
    });
    return n;
  }

  /* ---------- the outbox ---------- */
  const pending = () => DB().all('outbox', { index: 'state', equals: 'pending' });
  const failed = () => DB().all('outbox', { index: 'state', equals: 'failed' });
  const counts = async () => ({ pending: (await pending()).length, failed: (await failed()).length });
  async function conflict(row) { await DB().put('conflicts', { id: row.id || uuid(), created_at: nowISO(), seen: 0, ...row }); }

  return { uuid, money, nowISO, dayIn, metaGet, metaSet, deviceId, shortId,
    invoiceState, takeInvoice, invoiceLeft, pad,
    saveCatalogue, catalogue, price, commitBill, adjustStock,
    bills, dashboard, stockMoves, applyChanges,
    pending, failed, counts, conflict };
})();
if (typeof module !== 'undefined') module.exports = LocalRepo;

/* offline/sync.js?v=20 */
;/* Keeping the device and the cloud in step.
   Up:   every note in the outbox is sent with its own id. The server remembers that id, so a note
         that arrives twice — because the reply was lost, the app was closed, the phone died —
         still makes exactly one bill.
   Down: the server keeps a numbered list of everything that changed. The device remembers the
         last number it has seen and asks only for what came after it, so nothing is downloaded
         twice and an interrupted download simply carries on from where it stopped.
   Nothing here ever blocks billing. */
'use strict';
const SyncEngine = (() => {
  const R = () => LocalRepo;
  const BATCH = 50, PAGE = 500, BLOCK = 100, BLOCK_LOW = 20;
  const MAX_BACKOFF = 5 * 60 * 1000;

  let cloud = null, device = null, running = false, timer = null, started = false, signedIn = () => true;
  let registering = null, invoiceTopUp = null, invoicePreparation = null;
  let state = { online: navigator.onLine !== false, pending: 0, failed: 0, conflicts: 0, syncing: false,
    lastOk: null, lastError: '', invoiceLeft: 0, invoiceProvisional: 0, registered: false, phase: '' };
  const listeners = new Set();
  const emit = () => { for (const f of listeners) { try { f(state); } catch { /* a screen went away */ } } };
  const set = p => { state = { ...state, ...p }; emit(); };
  const onChange = f => { listeners.add(f); f(state); return () => listeners.delete(f); };

  // Only a genuine failure to reach the server counts as being offline. A server that answers
  // with a refusal is online, and saying otherwise once hid a real fault behind "no internet".
  const isNetworkError = e => e?.code === 'NETWORK' || e?.code === 'ETIMEDOUT' || e?.name === 'TypeError' ||
    /Failed to fetch|NetworkError|Could not reach|internet/i.test(e?.message || '');
  const missingFn = e => e?.httpStatus === 404 || /Could not find the function|schema cache|PGRST202/i.test(e?.message || '');

  async function refreshCounts() {
    const c = await R().counts();
    const block = await R().invoiceState();
    const prov = (await LocalDB.all('bills', {})).filter(b => b.invoice_provisional && b.sync_state !== 'synced').length;
    const conflicts = (await LocalDB.all('conflicts', {})).filter(c2 => !c2.seen).length;
    set({ pending: c.pending, failed: c.failed, conflicts, invoiceLeft: R().invoiceLeft(block), invoiceProvisional: prov });
  }

  /* ---------- the device says hello and collects invoice numbers in advance ---------- */
  async function register() {
    if (registering) return registering;
    registering = (async () => {
      device = await R().deviceId();
      const platform = typeof window !== 'undefined' && window.__TAURI__ ? 'tauri' : (navigator.userAgent || '').slice(0, 40);
      const r = await cloud.rpc('restaurant_device_register20', { p_device: device, p_label: deviceLabel(), p_platform: platform, p_version: '20' });
      set({ registered: true });
      const cur = await R().metaGet('cursor', null);
      if (cur === null) await R().metaSet('cursor', Number(r.cursor_now) || 0);   // a new device starts from "now"
      return r;
    })();
    try { return await registering; }
    finally { registering = null; }
  }
  const deviceLabel = () => { try { return (navigator.platform || 'Device') + ' · ' + new Date().toLocaleDateString('en-IN'); } catch { return 'Device'; } };

  async function topUpInvoices(force = false) {
    if (invoiceTopUp) return invoiceTopUp;
    invoiceTopUp = (async () => {
      const block = await R().invoiceState();
      if (!force && R().invoiceLeft(block) > BLOCK_LOW) return block;
      const b = await cloud.rpc('restaurant_invoice_block20', { p_device: device, p_size: BLOCK });
      // Numbers already handed to this device are never thrown away: the new block simply follows on.
      const left = R().invoiceLeft(block);
      const next = left > 0 ? block : { ...block, prefix: b.prefix || 'INV', digits: Number(b.digits) || 3, year: b.year, start: Number(b.start), end: Number(b.end), next: Number(b.start) };
      if (left > 0) { next.spare = { start: Number(b.start), end: Number(b.end) }; }
      await R().metaSet('invoice_block', next);
      await refreshCounts();
      return next;
    })();
    try { return await invoiceTopUp; }
    finally { invoiceTopUp = null; }
  }

  /* A newly installed or restored device can be ready to take bills before its first background
     sync has collected a number block. When there is a connection, prepare the block before
     saving the bill so the device-tagged fallback is reserved for genuinely offline selling. */
  async function prepareInvoiceNumbers() {
    if (!cloud || !signedIn() || navigator.onLine === false) return;
    if (invoicePreparation) return invoicePreparation;
    invoicePreparation = (async () => {
      if (!state.registered) await register();
      await rollBlock();
      if (R().invoiceLeft(await R().invoiceState()) === 0) {
        await topUpInvoices(true);
        await rollBlock();
      }
    })().catch(e => {
      if (isNetworkError(e)) set({ online: false });
      else set({ lastError: e.message || String(e) });
      // Billing stays available if the server cannot issue a block; commitBill keeps its
      // guaranteed unique device-tagged fallback for that case.
    }).finally(() => { invoicePreparation = null; });
    return invoicePreparation;
  }
  /* When the block in use is finished, step onto the spare one that was fetched earlier. */
  async function rollBlock() {
    const b = await R().invoiceState();
    if (R().invoiceLeft(b) > 0 || !b.spare) return b;
    const next = { ...b, start: b.spare.start, end: b.spare.end, next: b.spare.start, spare: null };
    await R().metaSet('invoice_block', next);
    return next;
  }

  /* ---------- up ---------- */
  async function pushOnce() {
    const all = await R().pending();
    if (!all.length) return { sent: 0, done: 0 };
    const now = Date.now();
    const due = all.filter(o => !o.next_try_at || Date.parse(o.next_try_at) <= now)
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).slice(0, BATCH);
    if (!due.length) return { sent: 0, done: 0 };
    set({ phase: `Sending ${due.length} of ${all.length}` });
    const reply = await cloud.rpc('restaurant_sync_push20', { p_device: device, p_ops: due.map(o => ({ op_id: o.op_id, kind: o.kind, payload: o.payload })) });
    const results = reply?.results || [];
    let done = 0;
    for (const [i, res] of results.entries()) {
      const op = due[i];
      if (!op) continue;
      if (res.ok) { await settle(op, res.result); done++; }
      else if (res.permanent) {
        await LocalDB.put('outbox', { ...op, state: 'failed', error: String(res.error || 'The server refused this.'), tries: (op.tries || 0) + 1 });
        await R().conflict({ op_id: op.op_id, kind: op.kind, reason: String(res.error || ''), payload: op.payload });
      } else {
        const tries = (op.tries || 0) + 1;
        const wait = Math.min(MAX_BACKOFF, 2000 * Math.pow(2, Math.min(tries, 8))) * (0.75 + Math.random() * 0.5);
        await LocalDB.put('outbox', { ...op, tries, error: String(res.error || ''), next_try_at: new Date(Date.now() + wait).toISOString() });
      }
    }
    await refreshCounts();
    return { sent: due.length, done };
  }

  /* One accepted note: mark it done and write back whatever the server decided. */
  async function settle(op, result) {
    await LocalDB.tx(['outbox', 'bills', 'stock_moves'], async h => {
      await h.del('outbox', op.op_id);
      if (op.kind === 'bill.create') {
        const b = await h.get('bills', op.op_id);
        if (b) await h.put('bills', { ...b, sync_state: 'synced', synced_at: R().nowISO(),
          order_no: Number(result?.daily_number) || b.order_no, order_id: result?.order_id || b.order_id,
          server_invoice_no: result?.invoice_no || b.invoice_no });
        const mv = await h.all('stock_moves', { index: 'sync_state', equals: 'with_bill' });
        for (const m of mv) if (m.op_id === op.op_id) await h.put('stock_moves', { ...m, sync_state: 'synced' });
      }
      if (op.kind === 'stock.move') {
        const m = await h.get('stock_moves', op.op_id);
        if (m) await h.put('stock_moves', { ...m, sync_state: 'synced' });
      }
    });
  }

  /* ---------- down ---------- */
  async function pullOnce() {
    let cursor = Number(await R().metaGet('cursor', 0)) || 0, pages = 0, applied = 0;
    for (;;) {
      const r = await cloud.rpc('restaurant_sync_pull20', { p_device: device, p_cursor: cursor, p_limit: PAGE });
      if (r.reset) {                     // away longer than the server keeps its list
        set({ phase: 'Taking a fresh copy' });
        await fullRefresh();
        await R().metaSet('cursor', Number(r.cursor) || 0);
        return { applied: -1, reset: true };
      }
      const changes = r.changes || [];
      if (changes.length) {
        applied += await R().applyChanges(changes);
        cursor = Number(r.cursor) || cursor;
        await R().metaSet('cursor', cursor);   // only after the batch is safely written
      }
      pages++;
      if (!r.more || !changes.length || pages > 40) break;
      set({ phase: `Catching up (${applied})` });
    }
    return { applied, reset: false };
  }

  /* The whole catalogue again, in the shape the screens already use. */
  async function fullRefresh() {
    const list = await cloud.rpc('shop_items_list', {}, { forceOnline: true });
    if (list?.items) await R().saveCatalogue(list.items, list.categories);
  }

  /* ---------- the round trip ---------- */
  async function syncNow({ quiet = false } = {}) {
    if (running || !cloud || !signedIn()) return state;
    if (navigator.onLine === false) { set({ online: false }); return state; }
    running = true; set({ syncing: true, phase: 'Starting', lastError: '' });
    try {
      if (!state.registered) await register();
      await rollBlock();
      let guard = 0;
      for (;;) {                                  // keep going while the outbox still empties
        const r = await pushOnce();
        if (!r.done || ++guard > 20) break;
        if (!(await R().pending()).length) break;
      }
      await pullOnce();
      await topUpInvoices();
      await refreshCounts();
      set({ online: true, lastOk: new Date().toISOString(), phase: '' });
      await R().metaSet('last_sync', state.lastOk);
    } catch (e) {
      if (missingFn(e)) set({ lastError: 'Run OFFLINE-SYNC-v20.sql in Supabase once to switch syncing on.', phase: '' });
      else if (isNetworkError(e)) set({ online: false, phase: '', lastError: '' });
      else set({ lastError: e.message || String(e), phase: '' });
      if (!quiet && !isNetworkError(e)) try { console.warn('[sync]', e.message); } catch { /* no console */ }
    } finally { running = false; set({ syncing: false }); }
    return state;
  }

  /* ---------- when to try ---------- */
  function schedule() {
    clearTimeout(timer);
    const soon = state.pending > 0 ? 15000 : 90000;
    timer = setTimeout(() => { if (!document.hidden && navigator.onLine !== false) syncNow({ quiet: true }).finally(schedule); else schedule(); }, soon);
  }
  async function start(c, opts = {}) {
    cloud = c;
    if (opts.signedIn) signedIn = opts.signedIn;
    await refreshCounts();
    if (started) return;
    started = true;
    addEventListener('online', () => { set({ online: true }); syncNow({ quiet: true }); });
    addEventListener('offline', () => set({ online: false }));
    document.addEventListener('visibilitychange', () => { if (!document.hidden && navigator.onLine !== false) syncNow({ quiet: true }); });
    schedule();
    syncNow({ quiet: true });
  }
  function stop() { clearTimeout(timer); started = false; listeners.clear(); }

  async function retryFailed() {
    for (const op of await R().failed()) await LocalDB.put('outbox', { ...op, state: 'pending', tries: 0, next_try_at: R().nowISO(), error: '' });
    await refreshCounts();
    return syncNow();
  }
  async function dropFailed(opId) {
    const op = await LocalDB.get('outbox', opId);
    if (op) { await LocalDB.del('outbox', opId); if (op.kind === 'bill.create') { const b = await LocalDB.get('bills', opId); if (b) await LocalDB.put('bills', { ...b, sync_state: 'abandoned' }); } }
    await refreshCounts();
  }

  return { start, stop, syncNow, pushOnce, pullOnce, register, topUpInvoices, rollBlock, prepareInvoiceNumbers, fullRefresh,
    retryFailed, dropFailed, refreshCounts, onChange, state: () => state,
    get device() { return device; }, _setCloud: c => { cloud = c; }, _setDevice: d => { device = d; } };
})();
if (typeof module !== 'undefined') module.exports = SyncEngine;

/* offline/router.js?v=20 */
;/* Where each request goes.
   The screens are untouched: they still call Cloud.rpc(...). This decides, for each call,
   whether the device answers it, the server answers it, or the person is told plainly that
   this particular thing needs internet.

   Taking payment is always answered by the device first, online or not. That is what makes a
   bill instant, and it is why a flaky connection can never produce a half-saved bill. */
'use strict';
const OfflineMode = (() => {
  const R = () => LocalRepo;

  /* Saved on the device, then sent on. Taking payment must never wait for a network. */
  const LOCAL_FIRST = new Set(['shop_create_bill']);
  /* Done on the server while there is internet — it keeps the shared stock history and the
     server's own version checks — and on the device only when there is none. */
  const SERVER_PREFERRED = new Set(['shop_stock_adjust']);
  /* Answered by the server when there is internet, by the device when there is not. */
  const LOCAL_READ = new Set(['shop_me', 'shop_items_list', 'shop_bills_list', 'shop_dashboard', 'shop_stock_moves_list']);
  /* Everything else needs the server. Each gets a plain reason rather than a dead button. */
  const NEEDS_NET = {
    shop_settings_save: 'Shop settings', shop_system_save: 'These settings', shop_billing_options_save: 'Billing settings',
    shop_invoice_save: 'Invoice numbering', shop_limits_save: 'Limits', shop_item_delete: 'Deleting a dish',
    shop_items_delete_all: 'Deleting everything', shop_items_import: 'Importing items', shop_category_delete: 'Deleting a category',
    shop_record_payment_save: 'Recording a QR payment', shop_reset_bills: 'Deleting all bills', shop_app_icon_save: 'The app icon',
    shop_staff_phones: 'Staff phone numbers', shop_expenses_list: 'Expenses', shop_expense_save: 'Expenses',
    shop_expense_delete: 'Expenses', shop_expense_auto_save: 'Monthly expenses', shop_expense_auto_delete: 'Monthly expenses',
    shop_expense_head_save: 'Expense types', shop_expense_head_delete: 'Expense types', shop_invoice_get: 'Invoice numbering'
  };

  let base = null, cloud = null, settings = () => ({}), cashier = () => 'Counter', ready = false;
  const online = () => navigator.onLine !== false && SyncEngine.state().online !== false;
  const offlineError = what => Object.assign(Error(`${what} can only be changed with internet. The till keeps working — bills you take now are saved here and sent on by themselves.`), { code: 'OFFLINE' });

  /* ---------- keeping the device's copy fresh whenever the server answers ---------- */
  async function cacheFromServer(name, result) {
    try {
      if (name === 'shop_items_list' && result?.items) await R().saveCatalogue(result.items, result.categories);
      if (name === 'shop_me' && result) await R().metaSet('me', result);
    } catch { /* a full disk must never break a working screen */ }
  }

  /* ---------- bills this device has taken but not yet sent ---------- */
  const unsent = async (from, to) => (await LocalDB.all('bills', { index: 'bill_day', from, to })).filter(b => b.sync_state !== 'synced' && b.sync_state !== 'abandoned');
  const money = n => Math.round((Number(n) || 0) * 100) / 100;

  function mergeBills(serverList, local) {
    if (!local.length) return serverList;
    const seen = new Set(serverList.rows.map(r => r.invoice_no || r.bill_no));
    const extra = local.filter(b => !seen.has(b.invoice_no)).map(b => ({ ...b, not_sent_yet: true }));
    const rows = [...extra, ...serverList.rows].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const s = serverList.summary || {};
    return { ...serverList, rows: rows.slice(0, serverList.rows.length + extra.length), total: Number(serverList.total || 0) + extra.length,
      summary: { ...s, sales: money(Number(s.sales || 0) + extra.reduce((n, b) => n + Number(b.total || 0), 0)),
        bills: Number(s.bills || 0) + extra.length,
        cash: money(Number(s.cash || 0) + extra.filter(b => b.payment_method === 'Cash').reduce((n, b) => n + Number(b.total || 0), 0)),
        upi: money(Number(s.upi || 0) + extra.filter(b => b.payment_method === 'UPI').reduce((n, b) => n + Number(b.total || 0), 0)) },
      unsent: extra.length };
  }
  function mergeDashboard(d, local) {
    if (!local.length) return d;
    const m = { ...d.metrics };
    const add = local.reduce((n, b) => n + Number(b.total || 0), 0);
    m.sales = money(Number(m.sales || 0) + add);
    m.bills = Number(m.bills || 0) + local.length;
    m.qty = Number(m.qty || 0) + local.reduce((n, b) => n + (b.items || []).reduce((q, l) => q + Number(l.qty || 0), 0), 0);
    m.discount = money(Number(m.discount || 0) + local.reduce((n, b) => n + Number(b.discount_amount || 0), 0));
    m.tax = money(Number(m.tax || 0) + local.reduce((n, b) => n + Number(b.tax_amount || 0), 0));
    m.avg_bill = m.bills ? money(m.sales / m.bills) : 0;
    const trend = new Map((d.trend || []).map(t => [t.key, { ...t }]));
    for (const b of local) { const t = trend.get(b.bill_day) || { key: b.bill_day, label: b.bill_day, sales: 0 }; t.sales = money(t.sales + Number(b.total)); trend.set(b.bill_day, t); }
    const pay = new Map((d.payments || []).map(p => [p.method, { ...p }]));
    for (const b of local) { const k = b.payment_method || 'Cash'; const p = pay.get(k) || { method: k, amount: 0, bills: 0 }; p.amount = money(p.amount + Number(b.total)); p.bills++; pay.set(k, p); }
    const top = new Map((d.top_items || []).map(t => [t.name, { ...t }]));
    for (const b of local) for (const l of b.items || []) { const t = top.get(l.name) || { name: l.name, unit: l.unit || 'pcs', qty: 0, revenue: 0 }; t.qty += Number(l.qty) || 0; t.revenue = money(t.revenue + Number(l.line_total || 0)); top.set(l.name, t); }
    return { ...d, metrics: m, unsent: local.length,
      trend: [...trend.values()].sort((a, b) => String(a.key).localeCompare(String(b.key))),
      payments: [...pay.values()], top_items: [...top.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10) };
  }

  /* ---------- the router ---------- */
  async function route(name, args = {}, opts = {}) {
    if (!ready) return base(name, args);
    if (opts.forceOnline) return base(name, args);

    if (LOCAL_FIRST.has(name)) {
      if (name === 'shop_create_bill') {
        // Do not let the first online sale beat the background registration and receive a
        // device-tagged fallback number. Offline billing still proceeds immediately.
        if (online()) await SyncEngine.prepareInvoiceNumbers();
        const bill = await R().commitBill({ ...args, __settings: settings(), __cashier: cashier() });
        SyncEngine.refreshCounts(); if (online()) SyncEngine.syncNow({ quiet: true });
        return bill;
      }
    }

    if (SERVER_PREFERRED.has(name)) {
      if (online()) {
        try { const item = await base(name, args); try { await LocalDB.put('items', item); } catch { /* cache only */ } return item; }
        catch (e) { if (!isNet(e)) throw e; SyncEngine.state().online = false; }
      }
      const item = await R().adjustStock({ item_id: args.p_item_id, mode: args.p_mode, qty: args.p_qty, note: args.p_note });
      SyncEngine.refreshCounts();
      return item;
    }

    if (LOCAL_READ.has(name)) {
      if (online()) {
        try {
          const r = await base(name, args);
          cacheFromServer(name, r);
          if (name === 'shop_bills_list') return mergeBills(r, await unsent(args.p_from, args.p_to));
          if (name === 'shop_dashboard') return mergeDashboard(r, await unsent(args.p_from, args.p_to));
          if (name === 'shop_stock_moves_list') {
            const mine = (await LocalDB.all('stock_moves', { index: 'sync_state', equals: 'pending' })).filter(m => !args.p_item_id || m.item_id === args.p_item_id);
            if (!mine.length) return r;
            const extra = mine.map(m => ({ created_at: m.created_at, ref: m.item_id, item_name: m.item_name || '', reason: m.reason, change: m.change, balance: m.balance_after, note: m.note || '', actor_name: 'This device · not sent yet' }));
            return { ...r, total: Number(r.total || 0) + extra.length, rows: [...extra, ...(r.rows || [])] };
          }
          return r;
        } catch (e) {
          if (!isNet(e)) throw e;                  // a real refusal is not hidden behind the cache
          SyncEngine.state().online = false;
        }
      }
      return localRead(name, args);
    }

    if (!online() && NEEDS_NET[name]) throw offlineError(NEEDS_NET[name]);
    return base(name, args);
  }
  const isNet = e => e?.code === 'NETWORK' || e?.code === 'ETIMEDOUT' || e?.name === 'TypeError';

  async function localRead(name, args) {
    if (name === 'shop_me') {
      const me = await R().metaGet('me', null);
      if (!me) throw Object.assign(Error('This device has not been set up yet. Connect to the internet once and sign in, then it will work offline.'), { code: 'OFFLINE' });
      return { ...me, offline: true };
    }
    if (name === 'shop_items_list') {
      const c = await R().catalogue();
      if (!c.items.length) throw Object.assign(Error('The item list has not reached this device yet. Connect once so it can be copied here.'), { code: 'OFFLINE' });
      return { ...c, offline: true };
    }
    if (name === 'shop_bills_list') return { ...(await R().bills({ from: args.p_from, to: args.p_to, status: args.p_status, payment: args.p_payment, query: args.p_query, offset: args.p_offset, limit: args.p_limit })), offline: true };
    if (name === 'shop_dashboard') return { ...(await R().dashboard({ from: args.p_from, to: args.p_to })), offline: true };
    if (name === 'shop_stock_moves_list') return { ...(await R().stockMoves({ item_id: args.p_item_id, offset: args.p_offset, limit: args.p_limit })), offline: true };
    if (name === 'shop_items_list') return { ...(await R().catalogue()), offline: true };
    throw offlineError('That');
  }

  /* ---------- switching it on ---------- */
  async function install(c, { getSettings, getCashier, runner = null } = {}) {
    cloud = c; base = c.rpc.bind(c);
    if (getSettings) settings = getSettings;
    if (getCashier) cashier = getCashier;
    try { await LocalDB.open({ runner }); } catch (e) { console.warn('[offline] local storage unavailable:', e.message); return false; }
    c.rpc = route;
    c.offline = { isOn: () => ready, state: () => SyncEngine.state(), syncNow: () => SyncEngine.syncNow(), db: LocalDB };
    ready = true;
    // Syncing talks to the restaurant API directly. Sending its calls through the billing
    // adapter would make them look like unknown actions, which once looked like "no internet".
    const rawRpc = (n, a) => (/^shop_/.test(n) ? base(n, a) : RestaurantCloud.rpc(n, a, true));
    await SyncEngine.start({ rpc: rawRpc }, { signedIn: () => c.signedIn !== false });
    return true;
  }

  return { install, route, mergeBills, mergeDashboard, LOCAL_FIRST, LOCAL_READ, NEEDS_NET,
    get isOn() { return ready; }, _reset() { ready = false; } };
})();
if (typeof module !== 'undefined') module.exports = OfflineMode;

/* offline/ui.js?v=20 */
;/* The small status chip in the top bar, and the panel behind it.
   It says one plain thing at a time and never gets in the way of billing. */
'use strict';
const OfflineUI = (() => {
  let chip = null, off = null;

  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  function wording(s) {
    if (s.conflicts) return { cls: 'sy-warn', text: `${plural(s.conflicts, 'bill needs', 'bills need')} attention` };
    if (s.failed) return { cls: 'sy-bad', text: `${plural(s.failed, 'bill', 'bills')} not sent` };
    if (!s.online) return { cls: 'sy-off', text: s.pending ? `Offline · ${plural(s.pending, 'bill', 'bills')} saved here` : 'Offline · saving here' };
    if (s.syncing) return { cls: 'sy-busy', text: s.phase || 'Sending…' };
    if (s.pending) return { cls: 'sy-busy', text: `${plural(s.pending, 'bill', 'bills')} to send` };
    return { cls: 'sy-ok', text: 'Saved and synced' };
  }

  function mount() {
    const top = document.querySelector('.top'); if (!top || document.getElementById('syncChip')) return;
    chip = document.createElement('button');
    chip.type = 'button'; chip.id = 'syncChip'; chip.className = 'sync-chip'; chip.title = 'Saving and syncing';
    chip.onclick = panel;
    top.querySelector('#net')?.before(chip) || top.append(chip);
    off?.(); off = SyncEngine.onChange(paint);
  }
  function paint(s) {
    if (!chip?.isConnected) return;
    const w = wording(s);
    chip.className = 'sync-chip ' + w.cls;
    chip.innerHTML = `<span class="sy-dot" aria-hidden="true"></span><span class="sy-t">${esc(w.text)}</span>`;
    chip.setAttribute('aria-label', 'Saving and syncing: ' + w.text);
  }

  const when = t => { if (!t) return 'not yet'; const m = Math.round((Date.now() - Date.parse(t)) / 60000);
    return m < 1 ? 'just now' : m < 60 ? m + ' minutes ago' : Fmt.dateTime(t); };

  async function panel() {
    const s = SyncEngine.state();
    const failed = await LocalRepo.failed();
    const conflicts = (await LocalDB.all('conflicts', { index: 'created_at', desc: true, limit: 20 })).filter(c => !c.seen);
    const block = await LocalRepo.invoiceState();
    const left = LocalRepo.invoiceLeft(block);
    const prov = s.invoiceProvisional;
    const d = modal('Saving & syncing', `<div class="stack sync-panel">
      <div class="sum-row">
        <div class="sum"><span>Right now</span><b>${esc(wording(s).text)}</b></div>
        <div class="sum"><span>Waiting to send</span><b>${s.pending}</b></div>
        <div class="sum"><span>Last synced</span><b>${esc(when(s.lastOk))}</b></div>
      </div>
      ${!s.online ? `<div class="notice">${Icon('wifi')}<div><b>No internet just now</b><p class="hint">Keep billing. Everything is saved on this device and sent on by itself the moment the connection is back.</p></div></div>` : ''}
      ${s.lastError ? `<div class="notice notice-bad">${Icon('alert')}<div><b>Could not sync</b><p class="hint">${esc(s.lastError)}</p></div></div>` : ''}
      ${left <= 20 ? `<div class="notice ${left === 0 ? 'notice-bad' : ''}">${Icon('bill')}<div><b>${left === 0 ? 'Offline invoice numbers used up' : `${left} invoice numbers left on this device`}</b>
        <p class="hint">${left === 0
          ? 'Bills still save, with a number carrying this device’s tag so it can never clash. Connect to pick up a fresh block of ordinary numbers.'
          : 'This device holds numbers in advance so it can bill with no internet. More are collected automatically when it connects.'}</p></div></div>` : ''}
      ${prov ? `<div class="notice">${Icon('alert')}<div><b>${plural(prov, 'bill uses', 'bills use')} a stand-in number</b><p class="hint">They are real, unique numbers and are never renumbered. They just look different from the rest.</p></div></div>` : ''}
      ${failed.length ? `<section class="card"><header class="card-head"><h3>The server refused these</h3>
        <p class="hint">These will not go through on their own. Look at each one, then send it again or drop it.</p></header>
        <ul class="plain-list">${failed.slice(0, 10).map(f => `<li><span><b>${esc(f.kind === 'bill.create' ? (f.payload?.invoice_no || 'Bill') : f.kind)}</b><small>${esc(f.error || '')}</small></span>
          <span class="toolbar"><button type="button" class="btn btn-sm" data-retry="${esc(f.op_id)}">Try again</button><button type="button" class="btn btn-sm btn-ghost" data-drop="${esc(f.op_id)}">Drop</button></span></li>`).join('')}</ul></section>` : ''}
      ${conflicts.length ? `<section class="card"><header class="card-head"><h3>Worth a look</h3></header>
        <ul class="plain-list">${conflicts.slice(0, 8).map(c => `<li><span><b>${esc(c.kind || 'Change')}</b><small>${esc(c.reason || '')}</small></span></li>`).join('')}</ul>
        <div class="form-actions"><button type="button" class="btn btn-sm" data-seen>Mark as seen</button></div></section>` : ''}
      <section class="card"><header class="card-head"><h3>This device</h3></header>
        <dl class="facts"><dt>Saved on</dt><dd>${esc(LocalDB.kind === 'sqlite' ? 'This computer’s own database (SQLite)' : 'This browser’s own database')}</dd>
        <dt>Bills held here</dt><dd>${await LocalDB.count('bills')}</dd>
        <dt>Device tag</dt><dd class="mono">${esc(LocalRepo.shortId(await LocalRepo.deviceId()))}</dd></dl>
        <div class="toolbar"><button type="button" class="btn" data-backup>${Icon('download')} Save a backup</button>
          <label class="btn btn-ghost file-btn">${Icon('upload')} Restore…<input type="file" accept="application/json,.json" hidden data-restore></label></div>
        <p class="hint">A backup holds every bill on this device, including any still waiting to be sent. Keep it somewhere else — if this device is lost, wiped or the app is uninstalled, what is on it goes too.</p></section>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Close</button>
        <button type="button" class="btn btn-primary" data-sync ${s.online ? '' : 'disabled'}>${Icon('refresh')} Sync now</button></div></div>`, { size: 'modal-md' });

    const stop = SyncEngine.onChange(() => { /* keep the chip live while the panel is open */ });
    d.addEventListener('close', () => stop(), { once: true });
    d.addEventListener('click', async e => {
      const t = e.target;
      if (t.closest('[data-sync]')) { busy(t.closest('[data-sync]'), true, 'Syncing…'); await SyncEngine.syncNow(); busy(t.closest('[data-sync]'), false); d.close(); panel(); return; }
      const r = t.closest('[data-retry]'); if (r) { await LocalDB.put('outbox', { ...(await LocalDB.get('outbox', r.dataset.retry)), state: 'pending', tries: 0, next_try_at: LocalRepo.nowISO() }); await SyncEngine.syncNow(); d.close(); panel(); return; }
      const dr = t.closest('[data-drop]'); if (dr) {
        if (!(await ask({ title: 'Drop this one?', body: 'It will never be sent to the server. The bill stays on this device, marked as not sent. Use this only when the reason above cannot be fixed.', confirm: 'Drop it', danger: true }))) return;
        await SyncEngine.dropFailed(dr.dataset.drop); d.close(); panel(); return;
      }
      if (t.closest('[data-seen]')) { for (const c of conflicts) await LocalDB.put('conflicts', { ...c, seen: 1 }); await SyncEngine.refreshCounts(); d.close(); panel(); return; }
      if (t.closest('[data-backup]')) { await Backup.download(); return; }
    });
    d.querySelector('[data-restore]')?.addEventListener('change', async e => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      try { const n = await Backup.restore(f); toast(`Restored ${n} bills from the backup.`, 'ok'); d.close(); }
      catch (ex) { toast(ex.message, 'error', 7000); }
    });
  }

  /* ---------- backup ---------- */
  const Backup = {
    async make() {
      const out = { format: 'restaurant-till-backup', version: 1, at: LocalRepo.nowISO(), device: await LocalRepo.deviceId(), stores: {} };
      for (const s of LocalDB.STORES) out.stores[s] = await LocalDB.all(s, {});
      return out;
    },
    async download() {
      const b = await this.make();
      const name = `till-backup-${b.at.slice(0, 10)}-${LocalRepo.shortId(b.device)}.json`;
      downloadFile(name, JSON.stringify(b), 'application/json');
      toast(`Backup saved: ${b.stores.bills.length} bills, ${b.stores.outbox.length} still to send.`, 'ok', 6000);
    },
    async restore(file) {
      const j = JSON.parse(await file.text());
      if (j?.format !== 'restaurant-till-backup' || !j.stores) throw Error('That is not a backup from this app.');
      // A restore never throws away what is already here and never overwrites a newer bill:
      // anything the device already has wins, and only missing rows are put back.
      let added = 0;
      for (const store of LocalDB.STORES) {
        if (store === 'meta') continue;                       // the device keeps its own identity
        for (const row of j.stores[store] || []) {
          const key = row[LocalDB.keyOf(store)];
          if (key === undefined || await LocalDB.get(store, key)) continue;
          await LocalDB.put(store, row); if (store === 'bills') added++;
        }
      }
      await SyncEngine.refreshCounts();
      return added;
    }
  };

  return { mount, panel, Backup, wording };
})();

/* js/app.js?v=19 */
;/* App shell: sign-in, navigation, help & contact, theme, app name & logo, live updates. */
'use strict';
const App = (() => {
  const ROUTES = {
    billing: { mod: 'billing', icon: 'bill', perm: 'billing', view: () => Billing },
    kitchen: { label: 'Kitchen orders', icon: 'store', perm: 'kitchen', view: () => Kitchen },
    requests: { label: 'Requests', icon: 'bell', perm: 'requests', view: () => Requests },
    tables: { label: 'Tables & QR codes', icon: 'qr', perm: 'tables', view: () => Tables },
    dashboard: { mod: 'dashboard', icon: 'chart', perm: 'dashboard', view: () => Dashboard },
    records: { mod: 'records', icon: 'list', perm: 'records', view: () => Records },
    items: { mod: 'items', icon: 'tag', perm: 'items', view: () => Items },
    stocks: { mod: 'stocks', icon: 'box', perm: 'stocks', view: () => Stocks },
    members: { mod: 'members', icon: 'idcard', perm: 'members', view: () => Members },
    expenses: { mod: 'expenses', icon: 'wallet', perm: 'expenses', view: () => Expenses },
    notifications: { label: 'Notifications', icon: 'bell', perm: 'notifications', view: () => Notices },
    devices: { label: 'Customer devices', icon: 'users', perm: 'devices', view: () => Devices },
    menuDesign: { label: 'Menu design', icon: 'palette', perm: 'settings_shop', view: () => MenuDesign },
    itemDetails: { label: 'Photos & portions', icon: 'image', perm: 'item_details', nav: false, view: () => MenuDetails },
    restaurantReports: { label: 'Restaurant reports', icon: 'chart', perm: 'dashboard', nav: false, view: () => RestaurantReports },
    dishSales: { label: 'Dish sales', icon: 'chart', perm: 'records', nav: false, view: () => DishSales },
    stockRules: { label: 'Stock rules', icon: 'repeat', perm: 'stocks', nav: false, view: () => StockRules },
    alerts: { label: 'Kitchen orders', icon: 'bell', perm: 'kitchen', nav: false, view: () => ({ mount(v) { Kitchen.mount(v); setTimeout(() => AlertsPanel.open(), 50); }, unmount: Kitchen.unmount }) },
    settings: { label: 'Settings', icon: 'gear', perm: 'settings', view: () => Settings },
    admin: { label: 'Admin', icon: 'shield', perm: 'admin', view: () => Admin }
  };
  const routeLabel = r => r.label || Store.label(r.mod);
  let current = null;
  const app = () => $('#app');

  /* ---------- no zooming: the installed app behaves like an app, not a web page ---------- */
  (() => {
    // Preserve browser zoom and accessibility controls; layout remains responsive.
  })();

  /* ---------- themes (Admin only) ---------- */
  function myTheme() {
    const a = Store.sys.appearance || {};
    let id = a.theme || 'ledger';
    if (Store.me && a[Store.role]) id = a[Store.role];
    return id;
  }
  function applyTheme() { return Themes.apply(myTheme(), Store.sys.appearance?.accent); }

  /* ---------- app name & logo ---------- */
  const LS = { get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } } };
  const appName = () => Store.sys.brand?.app_title || 'Shop Billing';
  function setIcon(icon) {
    const href = icon || 'icons/icon.svg';
    for (const [rel, fallback] of [['icon', 'icons/icon.svg'], ['apple-touch-icon', 'icons/icon-180.png']]) {
      const l = document.querySelector(`link[rel="${rel}"]`); const want = icon || fallback;
      if (l && l.getAttribute('href') !== want) { l.setAttribute('href', want); if (rel === 'icon') l.type = icon ? 'image/png' : 'image/svg+xml'; }
    }
    $$('.brand-mark').forEach(b => { b.classList.toggle('has-img', !!icon); if (icon) b.innerHTML = `<img src="${href}" alt="">`; });
  }
  async function syncIcon(v) {
    const cached = LS.get('SHOPBILL_ICON');
    if ((cached?.v || '') === (v || '')) return setIcon(cached?.icon || '');
    if (!v) { LS.set('SHOPBILL_ICON', { v: '', icon: '' }); return setIcon(''); }
    try { const r = await Cloud.publicRpc('shop_app_icon'); LS.set('SHOPBILL_ICON', { v: r.v, icon: r.icon }); setIcon(r.icon); } catch { /* keep the old one */ }
  }
  function applyBrand() {
    const b = Store.sys.brand || {};
    applyTheme();
    const name = appName(), shop = Store.settings.shop_name || App.publicInfo?.shop_name || '';
    const title = shop && shop !== name ? `${shop} · ${name}` : name;
    if (document.title !== title) document.title = title;
    document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', b.app_short_name || name);
    LS.set('SHOPBILL_BRAND', { title, short: b.app_short_name || name });
    const v = Store.me?.system ? (App.publicInfo?.icon_v ?? LS.get('SHOPBILL_ICON')?.v) : App.publicInfo?.icon_v;
    if (v !== undefined) syncIcon(v); else setIcon(LS.get('SHOPBILL_ICON')?.icon || '');
  }

  /* ---------- sign-in ---------- */
  function vendorLine() {
    const b = Store.sys.brand || {};
    return b.show_on_signin !== false && b.software_name ? `<p class="vendor">Billing software by <b>${esc(b.software_name)}</b> · <button type="button" class="linkish" data-help>Contact us</button></p>` : '';
  }
  async function loadPublic() {
    if (!Cloud.configured) return;
    try { App.publicInfo = await Cloud.publicRpc('shop_public_info'); applyBrand(); } catch { /* sign-in still works without it */ }
  }
  function lockNotice() {
    const a = App.publicInfo?.access; if (!a?.locked) return '';
    const sup = Store.sys.support || {};
    return `<div class="lock-notice" role="alert">${Icon('lock')}<div><b>System shut down</b><p>${esc(a.message || 'This billing system is shut down for now.')}</p>
      ${sup.name || sup.phone ? `<p class="lock-contact">${esc(sup.name || 'Support')}${sup.phone ? ` · Mob no: <a href="tel:${esc(String(sup.phone).replace(/[^\d+]/g, ''))}">${esc(sup.phone)}</a>` : ''}</p>` : ''}</div></div>`;
  }
  const membersLogin = () => !!App.publicInfo?.members_login;
  /* Members sign in with a mobile number; it maps to the login the shop created for them. */
  const loginEmail = id => id;   // a mobile number is turned into the login email by the server (Cloud.login)
  function loginView(message = '') {
    app().className = 'auth';
    const shop = Store.me?.settings?.shop_name || App.publicInfo?.shop_name || Cloud.cfg.shopName || 'Shop Billing';
    const ml = membersLogin(), icon = LS.get('SHOPBILL_ICON')?.icon;
    app().innerHTML = `<main class="auth-wrap">
      <section class="auth-card">
        <div class="brand-mark ${icon ? 'has-img' : ''}">${icon ? `<img src="${icon}" alt="">` : Icon('bill')}</div>
        <h1>${esc(shop)}</h1>
        <p class="sub">${esc(Store.sys.brand?.signin_message || 'Sign in to start billing.')}</p>
        ${lockNotice()}
        ${!Cloud.configured ? `<div class="notice notice-bad"><b>Not connected yet.</b> Open <span class="mono">config.js</span> and paste this shop’s Supabase Project URL and public key. See START-HERE.txt.</div>` : ''}
        ${sessionStorage.getItem('SHOPBILL_CHECKIN') ? `<div class="notice">${Icon('scan')} Sign in to finish checking in.</div>` : ''}
        <form id="loginForm" class="stack">
          <label class="field"><span>Email or mobile number</span><input name="email" type="text" inputmode="email" autocomplete="username" autocapitalize="off" spellcheck="false" required maxlength="254"></label>
          <label class="field"><span>Password</span><input name="password" type="password" autocomplete="current-password" required></label>
          <p class="form-error" role="alert" ${message ? '' : 'hidden'}>${esc(message)}</p>
          <button class="btn btn-primary btn-lg" ${Cloud.configured ? '' : 'disabled'}>Sign in</button>
          <button type="button" class="linkish" id="forgot">Forgot password?</button>
        </form>
        ${ml ? `<p class="hint center">${esc(Store.label1('members'))}s: sign in with the mobile number and password the front desk gave you.</p>` : ''}
      </section>${vendorLine()}</main>`;
    const f = $('#loginForm'), err = $('.form-error', f);
    if (!isTouch()) f.email.focus();
    f.onsubmit = async e => {
      e.preventDefault(); err.hidden = true; busy(e.submitter, true, 'Signing in…');
      const id = f.email.value.trim();
      if (!id.includes('@') && id.replace(/\D/g, '').length < 10) { err.textContent = 'Enter your email, or your 10-digit mobile number.'; err.hidden = false; busy(e.submitter, false); return; }
      try { await Cloud.login(loginEmail(id), f.password.value); await start(); }
      catch (ex) { err.textContent = /Wrong email/.test(ex.message) && !id.includes('@') ? 'Wrong mobile number or password.' : ex.message; err.hidden = false; busy(e.submitter, false); }
    };
    $('#forgot').onclick = () => {
      const s = Store.sys.support || {};
      modal('Forgot password?', `<p>Staff: ask the shop owner to set a new password for you in <b>Settings → Staff & logins</b>.</p>
        ${ml ? `<p style="margin-top:8px">${esc(Store.label1('members'))}s: ask at the front desk.</p>` : ''}
        <p class="hint" style="margin-top:10px">Owner locked out? Contact software support${s.name ? ` — <b>${esc(s.name)}</b>` : ''}${s.phone ? `, Mob no: <a href="tel:${esc(String(s.phone).replace(/[^\d+]/g, ''))}">${esc(s.phone)}</a>` : ''}.</p>`, { size: 'modal-sm' });
    };
  }

  /* ---------- shell ---------- */
  const routeOn = k => Store.can(ROUTES[k].perm) && (!ROUTES[k].mod || Store.moduleOn(ROUTES[k].mod));
  const navKeys = () => Object.keys(ROUTES).filter(k => ROUTES[k].nav !== false && routeOn(k));
  const navHTML = () => navKeys().map(k => `<a href="#/${k}" data-route="${k}" class="${k === 'admin' ? 'nav-admin' : ''}">${Icon(ROUTES[k].icon)}<span>${esc(routeLabel(ROUTES[k]))}</span>${k === 'billing' && !isTouch() ? '<kbd>F2</kbd>' : ''}</a>`).join('');
  function shell() {
    const me = Store.me;
    app().className = 'shell';
    app().innerHTML = `<aside class="side" id="side">
        <div class="side-brand"><div class="logo-chip" id="shopLogo"></div><div><b id="shopName"></b><small id="shopTag"></small></div></div>
        <nav class="side-nav" id="sideNav" aria-label="Main">${navHTML()}</nav>
        <div class="side-foot">
          <button type="button" class="side-btn" data-help>${Icon('help')}<span>Help & contact</span></button>
          ${me.manager_view ? `<button type="button" class="side-btn side-restore" id="showAdminTabs">${Icon('shield')}<span>Show admin tabs</span></button>` : ''}
          <div class="who">${Icon(me.native_role === 'admin' ? 'shield' : 'user')}<span><b>${esc(me.name)}</b><small>${me.manager_view ? 'Admin · manager view' : ROLE_LABEL[me.role] || ''} · ${esc(me.email)}</small></span></div>
          <button type="button" class="side-btn" id="logoutBtn">${Icon('logout')}<span>Sign out</span></button>
        </div>
      </aside>
      <div class="main">
        <header class="top">
          <button type="button" class="icon-btn menu-btn" id="menuBtn" aria-label="Open menu">${Icon('menu')}</button>
          <b class="top-title" id="topTitle"></b>
          <span class="top-gap"></span>
          <a class="lock-chip" id="lockChip" href="#/admin" hidden>${Icon('lock')}<span>System shut down for staff</span></a>
          <span class="net" id="net" role="status"></span>
          <span class="clock" id="clock"></span>
        </header>
        <main id="view" tabindex="-1"></main>
      </div>
      <div class="scrim" id="scrim"></div>`;
    applyShop();
    $('#logoutBtn').onclick = signOut;
    $('#showAdminTabs')?.addEventListener('click', e => setManagerView(false, e.currentTarget));
    $('#menuBtn').onclick = () => document.body.classList.add('nav-open');
    $('#scrim').onclick = () => document.body.classList.remove('nav-open');
    const tick = () => { const c = $('#clock'); if (c) c.textContent = new Date().toLocaleString('en-IN', { timeZone: Fmt.tz(), weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); };
    tick(); clearInterval(App._clock); App._clock = setInterval(tick, 20000);
    net(); paintLock();
    if (typeof OfflineUI !== 'undefined') OfflineUI.mount();
    // Now that someone is signed in, let the device introduce itself and collect invoice numbers.
    if (typeof SyncEngine !== 'undefined') setTimeout(() => SyncEngine.syncNow({ quiet: true }), 300);
    // The hidden alert engine is heavy; start it once the first screen has had a moment to load.
    clearTimeout(App._engine); App._engine = setTimeout(() => { if (Store.me && !Store.isMember && Cloud.signedIn) { RestaurantWorkspace.start(); RestaurantWorkspace.syncTheme(); } }, 1800);
  }
  async function signOut() {
    if (!(await ask({ title: 'Sign out?', body: 'You will need your password to sign in again on this device.', confirm: 'Sign out' }))) return;
    try { await RestaurantWorkspace.prepareSignOut(); } catch (e) { if (!(await ask({title:'Alert cleanup did not finish',body:e.message+' Background alerts may continue on this device. Sign out anyway?',confirm:'Sign out',cancel:'Stay signed in'}))) return; }
    current?.unmount?.(); current = null; if (Store.isMember) Portal.unmount();
    RestaurantWorkspace.stop();
    await Cloud.logout(); Store.me = null; history.replaceState(null, '', location.pathname); loginView();
  }
  function paintLock() { const c = $('#lockChip'); if (c) c.hidden = !(Store.isAdmin && Store.sys.access?.locked); }

  /* ---------- system shut down by Admin ---------- */
  let kicking = false;
  async function kickOut(message) {
    if (kicking || !Store.me || Store.isAdmin || Store.me.native_role === 'admin') return;
    kicking = true;
    App.publicInfo = { ...(App.publicInfo || {}), support: Store.sys.support, brand: Store.sys.brand, shop_name: Store.settings.shop_name, access: { locked: true, message } };
    $$('dialog[open]').forEach(d => d.close());
    current?.unmount?.(); current = null; if (Store.isMember) Portal.unmount();
    RestaurantWorkspace.stop();
    await Cloud.logout(); Store.me = null; history.replaceState(null, '', location.pathname);
    loginView(); kicking = false;
  }
  addEventListener('system:locked', e => kickOut(e.detail));

  /* ---------- live updates ----------
     Every open screen asks for a tiny version fingerprint once a minute (and when the app comes back to the front).
     Only when Admin or the owner changed something does it download the new setup and repaint — in place, without a reload. */
  let syncing = false, lastSync = 0;
  async function sync(force = false) {
    if (!Store.me || syncing || document.hidden || (!force && Date.now() - lastSync < 55000)) return;
    syncing = true; lastSync = Date.now();
    try {
      const v = await Cloud.publicRpc('shop_version');
      if (v && v !== Store.me.v) await refreshMe(true);
    } catch (e) { if (e.code === 'LOCKED') kickOut(e.message); }
    finally { syncing = false; }
  }
  document.addEventListener('visibilitychange', () => sync(false));
  setInterval(() => sync(true), 60000);

  /* Applies a fresh copy of the signed-in user's setup without disturbing the open screen. */
  async function refreshMe(live = false) {
    const prevNav = Store.me ? navKeys().join() + '|' + navKeys().map(k => routeLabel(ROUTES[k])).join() : '';
    const prevIcon = App.publicInfo?.icon_v;
    let me;
    try { me = await Cloud.rpc('shop_me'); }
    catch (e) {
      if (e.code === 'LOCKED') return kickOut(e.message);
      if (e.status === 403 && Store.isMember) { Portal.unmount(); $$('dialog[open]').forEach(d => d.close()); await Cloud.logout(); Store.me = null; return loginView(e.message); }
      throw e;
    }
    Store.me = me; LS.set(ME_KEY(), me);
    try { const pi = await Cloud.publicRpc('shop_public_info'); App.publicInfo = pi; } catch { /* icon check can wait */ }
    if (me.role === 'member') { applyBrand(); Portal.refresh?.(); return me; }
    applyShop(); paintLock();
    const nav = navKeys().join() + '|' + navKeys().map(k => routeLabel(ROUTES[k])).join();
    if (nav !== prevNav && $('#sideNav')) {
      $('#sideNav').innerHTML = navHTML(); RestaurantWorkspace.paintCounts();
      const key = (location.hash.match(/^#\/(\w+)/) || [])[1];
      if (!key || !Store.can(ROUTES[key]?.perm)) route(); else markNav(key);
    }
    if (live) { current?.refresh?.(); document.dispatchEvent(new CustomEvent('setup:changed')); }
    if (prevIcon !== App.publicInfo?.icon_v) applyBrand();
    return me;
  }

  function applyShop() {
    const s = Store.settings;
    applyBrand();
    if ($('#shopName')) { $('#shopName').textContent = s.shop_name || 'My Shop'; $('#shopTag').textContent = s.tagline || appName(); }
    const l = $('#shopLogo'); if (l) l.innerHTML = s.logo ? `<img src="${esc(s.logo)}" alt="">` : esc((s.shop_name || 'S').trim().charAt(0).toUpperCase());
    RestaurantWorkspace.syncTheme();
  }

  function net() {
    const n = $('#net'); if (!n) return;
    // With the till's own database in place, the saving chip says everything worth saying,
    // and "bills cannot be saved" is no longer true.
    if (typeof OfflineMode !== 'undefined' && OfflineMode.isOn) { n.hidden = true; return; }
    const on = navigator.onLine; n.className = 'net ' + (on ? 'on' : 'off');
    n.innerHTML = Icon('wifi') + `<span>${on ? 'Online' : 'Offline — bills cannot be saved'}</span>`;
  }
  addEventListener('online', () => { net(); sync(true); }); addEventListener('offline', net);

  function markNav(key) {
    const parent = ({ itemDetails: 'items', restaurantReports: 'dashboard', dishSales: 'records', stockRules: 'stocks', alerts: 'kitchen' })[key] || key;
    $$('.side-nav a').forEach(a => a.classList.toggle('on', a.dataset.route === parent));
    const t = $('#topTitle'); if (t && ROUTES[key]) t.textContent = routeLabel(ROUTES[key]);
  }
  function route() {
    if (!Store.me) return;
    if (Store.isMember) return;
    $$('dialog[open]').forEach(d => d.close());   // a link inside a dialog must not leave the dialog covering the new screen
    let key = (location.hash.match(/^#\/(\w+)/) || [])[1];
    if (!ROUTES[key] || !routeOn(key)) key = Object.keys(ROUTES).find(k => ROUTES[k].nav !== false && routeOn(k)) || 'billing';
    if (location.hash !== '#/' + key) history.replaceState(null, '', '#/' + key);
    current?.unmount?.();
    RestaurantWorkspace.beforeRoute();
    const r = ROUTES[key]; current = r.view();
    markNav(key);
    document.body.classList.remove('nav-open');
    document.body.dataset.route = key;
    const v = $('#view'); v.innerHTML = '';
    if (Cloud.sectionHidden?.(key)) { v.innerHTML = '<div class="page"><section class="card empty"><h2>This tab is hidden by the administrator</h2><p>Your administrator can restore access in Settings.</p></section></div>'; return; }
    current.mount(v);
  }

  /* ---------- help & contact ---------- */
  function help() {
    const s = Store.me?.settings || {}, sup = Store.sys.support || {}, brand = Store.sys.brand || {};
    const tel = p => String(p || '').replace(/[^\d+]/g, '');
    const wa = String(sup.whatsapp || '').replace(/\D/g, '');
    const shopContact = Store.me && (s.contact_name || s.contact_phone || s.contact_details);
    const hasSupport = sup.name || sup.phone || wa || sup.email || sup.website;
    const d = modal('Help & contact', `<div class="help-grid">
      ${shopContact ? `<section class="help-card"><h3>${Store.isMember ? esc(s.shop_name || 'Front desk') : 'Shop contact'}</h3>${s.contact_name ? `<p><b>${esc(s.contact_name)}</b></p>` : ''}
        ${s.contact_phone ? `<div class="toolbar"><a class="btn" href="tel:${esc(tel(s.contact_phone))}">${Icon('phone')} ${esc(s.contact_phone)}</a><button type="button" class="btn btn-ghost" data-copy="${esc(s.contact_phone)}">${Icon('copy')} Copy</button></div>` : ''}
        ${s.contact_details ? `<p class="pre">${esc(s.contact_details)}</p>` : ''}</section>` : ''}
      <section class="help-card support-card"><h3>System support${brand.software_name ? ` · ${esc(brand.software_name)}` : ''}</h3>
        ${sup.name ? `<p class="support-name">${esc(sup.name)}</p>` : ''}
        ${sup.phone ? `<p class="support-phone">Mob no: <b>${esc(sup.phone)}</b></p>` : ''}
        <div class="stack">${sup.phone ? `<a class="btn btn-primary" href="tel:${esc(tel(sup.phone))}">${Icon('phone')} Call</a>` : ''}${wa ? `<a class="btn" href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener">${Icon('whatsapp')} WhatsApp</a>` : ''}${sup.email ? `<a class="btn" href="mailto:${esc(sup.email)}">${Icon('mail')} ${esc(sup.email)}</a>` : ''}${sup.website ? `<a class="btn" href="${esc(sup.website)}" target="_blank" rel="noopener">${Icon('globe')} Website</a>` : ''}</div>
        ${sup.note ? `<p class="hint pre">${esc(sup.note)}</p>` : ''}
        ${!hasSupport ? '<p class="hint">Support details have not been added yet.</p>' : ''}</section>
      ${Store.me && !Store.isMember && Store.can('billing') && !isTouch() ? `<section class="help-card span-2"><h3>Keyboard shortcuts on the billing screen</h3><dl class="keys">
        <dt><kbd>F2</kbd></dt><dd>Search or scan an item</dd><dt><kbd>Enter</kbd></dt><dd>Add the highlighted item (barcode scanners do this for you)</dd>
        <dt><kbd>↑</kbd> <kbd>↓</kbd></dt><dd>Move through search results</dd><dt><kbd>F4</kbd></dt><dd>Change payment method</dd>
        <dt><kbd>F8</kbd></dt><dd>Save bill</dd><dt><kbd>F9</kbd></dt><dd>Save and print bill</dd><dt><kbd>Alt</kbd>+<kbd>X</kbd></dt><dd>Add an item that isn’t in the list</dd><dt><kbd>Alt</kbd>+<kbd>N</kbd></dt><dd>Clear the bill</dd></dl></section>` : ''}
    </div>`, { size: 'modal-md' });
    d.addEventListener('click', async e => { const c = e.target.closest('[data-copy]'); if (c) { try { await navigator.clipboard.writeText(c.dataset.copy); toast('Number copied.', 'ok'); } catch { toast(c.dataset.copy); } } });
  }
  document.addEventListener('click', e => { if (e.target.closest('[data-help]')) help(); });

  /* ---------- sign-in ended (expired on the server, or signed out in another tab) ----------
     The open screen and any unsaved bill stay put; a small sign-in box appears on top. */
  let reauth = null;
  addEventListener('restaurant:session-ended', () => {
    if (!Store.me || reauth || Store.isMember) return;
    const email = Store.me.email || '';
    reauth = modal('Sign in again', `<form id="reForm" class="stack"><p class="hint">Your sign-in on this device ended. Sign in to carry on — this screen and any unsaved bill stay as they are.</p>
      <label class="field"><span>Email or mobile number</span><input name="email" type="text" inputmode="email" autocomplete="username" autocapitalize="off" spellcheck="false" required maxlength="254" value="${esc(email)}"></label>
      <label class="field"><span>Password</span><input name="password" type="password" autocomplete="current-password" required></label>
      <p class="form-error" role="alert" hidden></p>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-full>Go to sign-in screen</button><button class="btn btn-primary">Sign in</button></div></form>`, { size: 'modal-sm' });
    const f = $('#reForm', reauth), err = $('.form-error', f);
    (email ? f.password : f.email).focus();
    reauth.addEventListener('close', () => { const wasOpen = reauth; reauth = null; if (wasOpen && !Cloud.signedIn && Store.me) { current?.unmount?.(); current = null; RestaurantWorkspace.stop(); Store.me = null; loginView('Your sign-in ended. Please sign in again.'); } });
    $('[data-full]', f).onclick = () => reauth?.close();
    f.onsubmit = async e => {
      e.preventDefault(); err.hidden = true; busy(e.submitter, true, 'Signing in…');
      try { await Cloud.login(f.email.value.trim(), f.password.value); const d = reauth; reauth = null; d.close(); await refreshMe(true); RestaurantWorkspace.start();
        // Anything taken while the sign-in was dead is waiting on the device: send it now.
        if (typeof SyncEngine !== 'undefined') SyncEngine.syncNow({ quiet: true });
        toast('Signed in again.', 'ok'); }
      catch (ex) { err.textContent = ex.message; err.hidden = false; } finally { busy(e.submitter, false); }
    };
  });

  /* ---------- the app is an app: no “copy link / download link” menu on long press ---------- */
  document.addEventListener('contextmenu', e => { if (!e.target.closest('input, textarea, select, [contenteditable="true"], .allow-menu')) e.preventDefault(); });
  document.addEventListener('dragstart', e => { if (e.target.closest?.('a, img')) e.preventDefault(); });

  /* ---------- admin: hide the admin-only tabs (see the app as a manager does) ---------- */
  async function setManagerView(on, btn) {
    busy(btn, true, on ? 'Hiding…' : 'Showing…');
    try { Store.me.system = await Cloud.rpc('shop_system_save', { p: { admin_manager_view: !!on } }); await refreshMe(true); shell(); route(); toast(on ? 'Admin-only tabs are hidden. Use “Show admin tabs” in the menu to bring them back.' : 'Admin tabs are back.', 'ok', 6000); }
    catch (e) { toast(e.message, 'error', 6000); } finally { busy(btn, false); }
  }

  /* ---------- boot ---------- */
  /* The last setup this login saw opens the app at once; the fresh copy replaces it a moment later. */
  const ME_KEY = () => 'RX19_ME:' + (Cloud.cfg.supabaseUrl || '') + ':' + (Cloud.userId || '');
  async function start() {
    const cached = Cloud.userId ? LS.get(ME_KEY()) : null, early = !!(cached?.perms?.length && cached.role !== 'member');
    if (early) { Store.me = cached; shell(); route(); }
    else { app().className = 'loading'; app().innerHTML = '<div class="boot"><div class="brand-mark">' + Icon('bill') + '</div><p>Opening…</p></div>'; }
    setIcon(LS.get('SHOPBILL_ICON')?.icon || '');
    try {
      const prevNav = early ? navKeys().join() + '|' + navKeys().map(k => routeLabel(ROUTES[k])).join() : '';
      const me = await Cloud.rpc('shop_me');
      LS.set(ME_KEY(), me);
      if (!App.publicInfo) loadPublic();
      if (me.role === 'member') { Store.me = me; applyBrand(); current = null; return Portal.mount(app()); }
      if (early && Store.me === cached && $('#sideNav')) {
        const changed = JSON.stringify([cached.settings, cached.system, cached.role]) !== JSON.stringify([me.settings, me.system, me.role]);
        Store.me = me; applyShop(); paintLock();
        const nav = navKeys().join() + '|' + navKeys().map(k => routeLabel(ROUTES[k])).join();
        if (nav !== prevNav || changed) { const foot = $('.side-foot'); if (nav !== prevNav || me.manager_view !== cached.manager_view) { shell(); route(); } else { current?.refresh?.(); document.dispatchEvent(new CustomEvent('setup:changed')); } void foot; }
        return;
      }
      Store.me = me; shell(); route(); // the landing screen loads the item list itself; no need to fetch it twice
    } catch (e) {
      if (early && (e.code === 'NETWORK' || e.code === 'ETIMEDOUT' || e.name === 'TypeError' || !e.httpStatus && !e.status && !e.code)) { toast('Working with the last saved setup — ' + e.message, 'warn', 6000); return; }
      if (early) { current?.unmount?.(); current = null; RestaurantWorkspace.stop(); Store.me = null; try { localStorage.removeItem(ME_KEY()); } catch { /* ignore */ } }
      if (e.code === 'LOCKED') { await Cloud.logout(); Store.me = null; App.publicInfo = { ...(App.publicInfo || {}), access: { locked: true, message: e.message } }; return loginView(); }
      if (e.code === 'AUTH' || e.status === 401 || e.httpStatus === 401) { await Cloud.logout(); return loginView('Your sign-in ended. Please sign in again.'); }
      if (e.status === 403) { await Cloud.logout(); return loginView(e.message); }
      app().className = 'auth';
      app().innerHTML = `<main class="auth-wrap"><section class="auth-card"><div class="brand-mark">${Icon('alert')}</div><h1>Can’t open the app</h1><p class="sub">${esc(e.message)}</p>
        <div class="toolbar"><button type="button" class="btn btn-primary" id="retry">Try again</button><button type="button" class="btn btn-ghost" id="out">Sign out</button></div></section>${vendorLine()}</main>`;
      $('#retry').onclick = start; $('#out').onclick = async () => { await Cloud.logout(); loginView(); };
    }
  }

  async function boot() {
    try { const [id, ac] = LS.get('SHOPBILL_LAST_THEME') || []; Themes.apply(id || 'ledger', ac); } catch { Themes.apply('ledger'); }
    // A check-in QR opened with the phone camera lands here: remember it until the member is signed in.
    const ck = location.hash.match(/^#\/checkin\/([A-Za-z0-9]{8,64})/);
    if (ck) { sessionStorage.setItem('SHOPBILL_CHECKIN', ck[1]); history.replaceState(null, '', location.pathname); }
    addEventListener('hashchange', () => {
      const c = location.hash.match(/^#\/checkin\/([A-Za-z0-9]{8,64})/);
      if (c) { sessionStorage.setItem('SHOPBILL_CHECKIN', c[1]); history.replaceState(null, '', location.pathname); if (Store.isMember) Portal.checkPending(); return; }
      route();
    });
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
    // The till's own database comes up before anything is asked of the network, so the app can
    // open, bill and print with no internet at all.
    if (typeof OfflineMode !== 'undefined') {
      await OfflineMode.install(Cloud, { getSettings: () => Store.settings, getCashier: () => Store.me?.name || 'Counter' });
    }
    if (Cloud.signedIn) return start();
    loginView();
    await loadPublic();
    // repaint the sign-in card with the shop name and support details, keeping anything already typed
    if (!Store.me && $('#loginForm')) { const f = $('#loginForm'), em = f.email.value, pw = f.password.value; loginView(); $('#loginForm').email.value = em; $('#loginForm').password.value = pw; }
  }
  function rebuildNav() { if (!Store.me || Store.isMember) return; const n = $('#sideNav'); if (!n) { shell(); return route(); } n.innerHTML = navHTML(); RestaurantWorkspace.paintCounts(); const key = (location.hash.match(/^#\/(\w+)/) || [])[1]; if (!key || !Store.can(ROUTES[key]?.perm)) route(); else markNav(key); }
  return { boot, applyShop, applyBrand, applyTheme, help, refreshMe, start, paintLock, rebuildNav, signOut, sync, setIcon, syncIcon, loginView, setManagerView, publicInfo: null };
})();
App.boot();

