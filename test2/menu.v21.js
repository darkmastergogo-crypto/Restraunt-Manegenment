'use strict';
/* menu-options.js?v=yummy-46 */
;/* Stable variant IDs keep stock and loops intact when display names change. */
'use strict';
const MenuOptions=Object.freeze({
 keys:item=>Object.keys(item?.size_prices||{}),
 label:(item,key)=>String(item?.size_labels?.[key]||({regular:'Regular',medium:'Medium',large:'Large'}[key])||key),
 validPrice:value=>Number.isFinite(value)&&value>=0&&value<=100000&&Math.abs(value*100-Math.round(value*100))<0.00001
});

/* cloud.js?v=19 */
;/* Shared cloud API. No n8n, no local-only order fallback, no service-role keys. */
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

/* order-celebration.js?v=yummy-64 */
;/* Launch food only AFTER a confirmed cloud order. Optional presentation, never order logic. */
'use strict';
window.OrderCelebration=(()=>{
 const seen=new Set();let timer=null,onDone=null,tracked=false;
 const storageKey='RESTAURANT_ORDER_CELEBRATIONS_v1';
 try{const rows=JSON.parse(sessionStorage.getItem(storageKey)||'[]');if(Array.isArray(rows))rows.slice(-100).forEach(id=>seen.add(id));}catch{}
 const dialog=()=>document.getElementById('orderCelebration');
 const safely=fn=>{try{fn?.();}catch{}};
 function finish(){
  clearTimeout(timer);timer=null;
  document.getElementById('celebrationParticles')?.replaceChildren();
  const callback=onDone;onDone=null;
  if(document.getElementById('trackingModal')?.classList.contains('open'))document.querySelector('#trackingModal .btn-close-drawer')?.focus({preventScroll:true});
  safely(()=>callback?.(tracked));
 }
 function close(){const d=dialog();if(d?.open)d.close();}
 function foodEmoji(name){
  const n=String(name||'').toLowerCase();
  if(/momo|dumpling/.test(n))return '🥟';
  if(/burger/.test(n))return '🍔';
  if(/chicken/.test(n))return '🍗';
  if(/noodle|ramen/.test(n))return '🍜';
  if(/pizza/.test(n))return '🍕';
  if(/fries|potato/.test(n))return '🍟';
  if(/drink|juice|water|soda/.test(n))return '🥤';
  if(/rice/.test(n))return '🍚';
  if(/cake|dessert|sweet/.test(n))return '🍰';
  return '🍽️';
 }
 function launch(items=[]){
  const root=document.getElementById('celebrationParticles');if(!root)return;root.replaceChildren();
  const foods=[];
  for(const item of Array.isArray(items)?items:[]){
   const count=Math.max(1,Math.min(4,Number(item.qty)||1));
   for(let i=0;i<count;i++)foods.push(foodEmoji(item.name));
  }
  (foods.length?foods:Array(8).fill('🍽️')).slice(0,18).forEach((emoji,i)=>{
   const node=document.createElement('span');node.className='food-flight';node.textContent=emoji;
   node.style.setProperty('--from-x',`${Math.random()*100-50}vw`);node.style.setProperty('--mid-x',`${Math.random()*90-45}vw`);
   node.style.setProperty('--to-x',`${Math.random()*130-65}vw`);node.style.setProperty('--from-turn',`${Math.random()*50-25}deg`);
   node.style.setProperty('--mid-turn',`${Math.random()*220-110}deg`);node.style.setProperty('--to-turn',`${Math.random()*360-180}deg`);
   node.style.setProperty('--duration',`${1900+Math.random()*900}ms`);node.style.setProperty('--delay',`${Math.random()*260}ms`);root.append(node);
  });
  ['🎉','🎊','🎉','✨'].forEach((emoji,i)=>{
   const node=document.createElement('span');node.className='party-pop';node.textContent=emoji;
   node.style.setProperty('--burst-x',`${(i-1.5)*34}vw`);node.style.setProperty('--burst-y',`${-28-Math.random()*34}vh`);
   node.style.setProperty('--burst-turn',`${Math.random()*100-50}deg`);node.style.setProperty('--delay',`${i*70}ms`);root.append(node);
  });
  const colors=['#e23744','#f59e0b','#10b981','#3b82f6','#a855f7','#fb7185'];
  for(let i=0;i<34;i++){
   const bit=document.createElement('i');bit.className='party-confetti';bit.style.setProperty('--x',`${Math.random()*100}vw`);
   bit.style.setProperty('--y',`${45+Math.random()*45}vh`);bit.style.setProperty('--turn',`${Math.random()*720-360}deg`);
   bit.style.setProperty('--color',colors[i%colors.length]);bit.style.setProperty('--delay',`${Math.random()*220}ms`);root.append(bit);
  }
 }
 function show(orderId,callback,items=[]){
  const d=dialog();
  if(!orderId||seen.has(orderId)||!d||typeof d.showModal!=='function'){safely(()=>callback?.(false));return false;}
  try{
   clearTimeout(timer);tracked=false;onDone=callback;if(!d.open)d.showModal();launch(items);
   seen.add(orderId);try{sessionStorage.setItem(storageKey,JSON.stringify([...seen].slice(-100)));}catch{}
   // Wait for Track my order or dismissal; animation itself remains brief.
   return true;
  }catch{if(d.open)d.close();else finish();return false;}
 }
 const d=dialog();
 if(d){d.addEventListener('close',()=>{if(!d.open)finish();});d.addEventListener('click',e=>{if(e.target===d)close();});document.getElementById('celebrationTrackButton')?.addEventListener('click',()=>{tracked=true;close();});}
 return {show,close};
})();

/* reviews.js?v=yummy-46 */
;'use strict';
let reviewTimer=null,reviewUrl='',reviewReturnFocus=null;
function safeReviewUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(/^(g\.page|maps\.app\.goo\.gl|([a-z0-9-]+\.)?google\.com|www\.google\.[a-z.]{2,12})$/i.test(u.hostname))?u.href:'';}catch{return '';}}
async function loadPublicReviewSettings(){try{const r=await Cloud.rpc('restaurant_review_settings',{p_url:null});reviewUrl=safeReviewUrl(r.url);}catch{reviewUrl=safeReviewUrl(RESTAURANT_CONFIG.googleReviewUrl);}renderReviewLink();}
function renderReviewLink(){const a=document.getElementById('googleReviewBtn');a.hidden=!reviewUrl;if(reviewUrl)a.href=reviewUrl;else a.removeAttribute('href');document.getElementById('reviewLinkStatus').textContent=reviewUrl?'':'The restaurant has not added its Google review link yet. You can review later.';}
const REVIEW_PENDING_KEY='RESTAURANT_REVIEW_PENDING_v2',REVIEW_TTL=3*60*60*1000;
function pendingReviews(){const rows=Cloud.read(REVIEW_PENDING_KEY,[]);return (Array.isArray(rows)?rows:[]).filter(r=>r&&typeof r.id==='string'&&Number.isFinite(r.due)&&Date.now()-r.due<REVIEW_TTL&&!Cloud.read('REVIEW_SHOWN_'+r.id,false)).slice(-20);}
function promptOrderReview(id){if(!id||Cloud.read('REVIEW_SHOWN_'+id,false))return;const rows=pendingReviews();if(!rows.some(r=>r.id===id))rows.push({id,due:Date.now()+5000});Cloud.write(REVIEW_PENDING_KEY,rows.slice(-20));loadPublicReviewSettings();resumeReviewPrompt();}
function resumeReviewPrompt(){clearTimeout(reviewTimer);reviewTimer=null;const rows=pendingReviews().sort((a,b)=>a.due-b.due);Cloud.write(REVIEW_PENDING_KEY,rows);if(!rows.length||document.hidden||(typeof TableAccess!=='undefined'&&!TableAccess.canCall())||document.getElementById('reviewDialog').open)return;const next=rows[0],left=next.due-Date.now();if(left>0){reviewTimer=setTimeout(resumeReviewPrompt,Math.min(left,2147483647));return;}try{showGoogleReviewModal();Cloud.write('REVIEW_SHOWN_'+next.id,true);Cloud.write(REVIEW_PENDING_KEY,rows.filter(r=>r.id!==next.id));}catch{reviewTimer=setTimeout(resumeReviewPrompt,1000);}}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)resumeReviewPrompt();});
window.addEventListener('pageshow',()=>resumeReviewPrompt());
window.addEventListener('storage',e=>{if(e.key===REVIEW_PENDING_KEY||e.key?.startsWith('REVIEW_SHOWN_'))resumeReviewPrompt();});
function showGoogleReviewModal(){const d=document.getElementById('reviewDialog');if(d.open)return;window.OrderCelebration?.close();reviewReturnFocus=document.activeElement;renderReviewLink();d.showModal();}
function closeReviewModal(){document.getElementById('reviewDialog').close();if(reviewReturnFocus?.isConnected)reviewReturnFocus.focus({preventScroll:true});}
window.addEventListener('DOMContentLoaded',()=>{document.getElementById('reviewDialog').addEventListener('close',()=>{setTimeout(resumeReviewPrompt,0);});resumeReviewPrompt();});

/* table-access.js?v=yummy-46 */
;'use strict';
const TableAccess=(()=>{
 let visit=null,state=null,offset=0,busy=null,initialized=false,error='',qrKey=null,device=null,validatedAt=0;
 function browserInfo(){return {user_agent:navigator.userAgent,platform:navigator.userAgentData?.platform||navigator.platform||'',language:navigator.language||'',time_zone:Intl.DateTimeFormat().resolvedOptions().timeZone||''};}
 function loadDevice(){const saved=Cloud.read('RESTAURANT_CUSTOMER_DEVICE_v1',null),valid=v=>typeof v==='string'&&/^[0-9a-f-]{36}$/i.test(v);if(saved&&valid(saved.id)&&valid(saved.token))return saved;const next={id:crypto.randomUUID(),token:crypto.randomUUID()};Cloud.write('RESTAURANT_CUSTOMER_DEVICE_v1',next);return next;}
 const el=id=>document.getElementById(id),key=()=> 'RESTAURANT_TABLE_VISIT_v2_'+currentTable;
 function read(){try{return Cloud.sessionRead(key());}catch{return null;}}
 function save(){Cloud.sessionWrite(key(),visit);}
 function expired(){return !!visit?.expires_at&&Date.parse(visit.expires_at)<=Date.now()+offset;}
 function canCall(){return !!state?.active&&!state.expired&&!expired()&&!error;}
 function render(){if(!el('scanExpired'))return;const timedOut=expired()||state?.expired===true,locked=!canCall();el('scanExpired').hidden=!locked;
  const blocked=/browser device has been blocked/i.test(error);el('scanExpiredTitle').textContent=blocked?'Device access blocked':timedOut?'Please scan your table QR again':'Please scan your table QR';
  el('scanAccessText').textContent=timedOut?'Your 1-hour table access has expired. Scan the QR printed on your table to continue.':error||'Scan the QR printed on your table to open the menu.';
  el('tableAccessNotice').textContent=state?.status==='Reserved'?'This table is reserved. Please ask a waiter.':'';el('tableAccessNotice').hidden=!el('tableAccessNotice').textContent;
  if(locked){window.OrderCelebration?.close();const d=el('reviewDialog');if(d?.open)d.close();}
 }
 async function refresh(force=false){if(busy)return busy;if(!force&&state&&Date.now()-validatedAt<10000&&!expired())return state;if(!visit||!currentTable||!device){render();return null;}
  busy=(async()=>{try{state=await Cloud.rpc('restaurant_open_device_visit',{p_visit_id:visit.id,p_visit_token:visit.token,p_table:currentTable,p_qr_key:qrKey,p_device_id:device.id,p_device_token:device.token,p_info:browserInfo()});await Cloud.refreshTableNames({table:currentTable}).catch(()=>{});validatedAt=Date.now();offset=Date.parse(state.server_now)-Date.now();visit.expires_at=state.expires_at;save();error=state.blocked?(state.error||'This browser device has been blocked. Please contact restaurant staff.'):'';if(typeof applyCustomerRetention==='function')applyCustomerRetention(state.retention,state.server_now);
   if(qrKey){qrKey=null;const u=new URL(location.href);u.searchParams.delete('qr');u.searchParams.delete('entry');history.replaceState(null,'',u);}
   render();if(canCall()&&typeof resumeReviewPrompt==='function')resumeReviewPrompt();return state;
  }catch(e){error=e.message;render();throw e;}finally{busy=null;}})();return busy;
 }
 async function init(){if(initialized)return busy||state;initialized=true;qrKey=new URL(location.href).searchParams.get('qr');visit=read();
  if(!currentTable){error='Scan the QR printed on your table to open the menu.';render();return null;}
  if(qrKey){visit={id:crypto.randomUUID(),token:crypto.randomUUID()};}
  if(!visit){error='Scan the QR printed on your table to open the menu.';render();return null;}
  try{device=loadDevice();save();return await refresh();}catch(e){error=e.message;render();return null;}
 }
 async function credentials(ordering=true){if(!initialized)await init();else await refresh();if(!canCall())throw Error(expired()||state?.expired?'Scan expired. Please scan your table QR again.':error||'Please scan the table QR to open the menu.');if(ordering&&state.status==='Reserved')throw Error('This table is reserved. Please ask a waiter.');return {p_visit_id:visit.id,p_visit_token:visit.token};}
 setInterval(()=>{if(initialized&&!document.hidden)render();},1000);
 Cloud.schedule('visit',10000,()=>{if(initialized&&visit&&!expired())return refresh();});
 document.addEventListener('visibilitychange',()=>{if(initialized&&!document.hidden){render();if(visit&&!expired())refresh().catch(()=>{});}});
 return {init,credentials,canCall,expired};
})();

/* menu-experience.js?v=yummy-46 */
;'use strict';
function renderOrderSidebar(){
 const root=document.getElementById('desktopOrderItems');if(!root)return;const entries=Object.values(cart);
 const html=entries.length?entries.map(line=>`<div class="sidebar-order-line"><strong>${Cloud.esc(lineName(line))}</strong><span>${line.qty} × ${priceText(line.item.price)}</span><b>${priceText(line.qty*line.item.price)}</b></div>`).join(''):'<div class="empty-order"><svg class="ui-icon" aria-hidden="true"><use href="icons.svg#clipboard"></use></svg><strong>No items yet</strong><p>Add dishes to your order.</p></div>';
 if(root._html!==html){root.innerHTML=html;root._html=html;}
 document.getElementById('desktopOrderTotal').textContent=priceText(cartTotal());document.getElementById('desktopOrderCheckout').hidden=!entries.length&&!pendingAttempt;document.getElementById('desktopOrderBill').hidden=!entries.length;
}
function syncNoteChips(){const parts=document.getElementById('custNotesInput').value.split(';').map(x=>x.trim().toLowerCase());document.querySelectorAll('[data-note-chip]').forEach(b=>b.setAttribute('aria-pressed',String(parts.includes(b.dataset.noteChip.toLowerCase()))));}
document.addEventListener('click',event=>{const b=event.target.closest('[data-note-chip]');if(!b)return;const input=document.getElementById('custNotesInput'),label=b.dataset.noteChip,parts=input.value.split(';').map(s=>s.trim()).filter(Boolean),at=parts.findIndex(p=>p.toLowerCase()===label.toLowerCase());if(at<0)parts.push(label);else parts.splice(at,1);const next=parts.join('; ');if(next.length>1000){message('Notes can contain at most 1000 characters.',true);return;}input.value=next;syncNoteChips();});
document.getElementById('custNotesInput').addEventListener('input',syncNoteChips);

// Keyed menu reconciliation keeps decoded photographs mounted across quantity changes.
function patchMenuCards(root,markup,onlyId=null){
 if(onlyId===null&&root._menuMarkup===markup)return;
 const template=document.createElement('template');template.innerHTML=markup;
 const previous=new Map([...root.querySelectorAll(':scope > [data-menu-id]')].map(n=>[n.dataset.menuId,n])),nodes=[],ids=new Set();
 for(const next of [...template.content.children]){
  const id=next.dataset.menuId,html=next.outerHTML,old=previous.get(id);let node=next;ids.add(id);
  if(old&&old._markup===html)node=old;
  else if(old){const oldPhoto=old.querySelector('.item-img-container'),newPhoto=next.querySelector('.item-img-container');if(oldPhoto&&newPhoto&&oldPhoto.innerHTML===newPhoto.innerHTML)newPhoto.replaceWith(oldPhoto);old.replaceWith(next);}
  node._markup=html;nodes.push(node);
 }
 if(onlyId===null){for(const child of [...root.children])if(!ids.has(child.dataset.menuId))child.remove();nodes.forEach((node,i)=>{if(root.children[i]!==node)root.insertBefore(node,root.children[i]||null);});root._menuMarkup=markup;}
 else root._menuMarkup=null;
}

/* category-menu49.js?v=66 */
;/* Category-led menu. Banner nodes stay mounted while quantities change. */
window.CategoryMenu49=(()=>{
 'use strict';
 const cfg=()=>window.Custom48?.get()||{},e=v=>Cloud.esc(String(v??''));
 const enabled=()=>cfg().menuLayout!=='cards';
 const id=category=>'menu-category-'+encodeURIComponent(category).replaceAll('%','_');
 const label=category=>cfg().categoryLabels?.[category]||category;
 const imageTransform=category=>{const raw=cfg().categoryImageTransforms?.[category]||{},z=Number(raw.zoom),x=Number(raw.x),y=Number(raw.y);return {zoom:Number.isFinite(z)?Math.max(1,Math.min(2.5,z)):1,x:Number.isFinite(x)?Math.max(0,Math.min(100,x)):50,y:Number.isFinite(y)?Math.max(0,Math.min(100,y)):50};};
 function nav(items){
  const settings=cfg(),bar=document.getElementById('categoriesBar'),browse=document.getElementById('browseMenu'),dropdown=document.getElementById('menuSort');
  const categories=Cloud.categories.slice(1).filter(cat=>items.some(i=>i.category===cat)&&settings.categoryOptions?.[cat]?.showLink!==false);
  const specials=[
   {name:'Best Sellers',count:items.filter(i=>i.best_seller===true).length,symbol:'star'},
   {name:'Recommended',count:items.filter(i=>i.recommended===true).length,symbol:'check'}
  ].filter(x=>x.count>0);
  if(['Best Sellers','Recommended'].includes(activeCategory)&&!specials.some(x=>x.name===activeCategory)){activeCategory='All';const title=document.getElementById('menuListTitle');if(title)title.textContent='Our menu';}
  const show=settings.showCategoryLinks!==false;
  if(browse)browse.hidden=!show;if(dropdown)dropdown.hidden=!show;if(!bar)return;
  const signature=JSON.stringify([categories,specials,settings.categoryLabels,show,activeCategory]);if(bar.dataset.signature49===signature)return;bar.dataset.signature49=signature;bar.replaceChildren();
  if(dropdown){dropdown.replaceChildren(new Option('All categories','All'),...specials.map(x=>new Option(x.name,x.name)),...categories.map(cat=>new Option(label(cat),cat)));dropdown.setAttribute('aria-label','Filter or jump to category');dropdown.value=['Best Sellers','Recommended'].includes(activeCategory)?activeCategory:'All';}
  if(!show)return;
  for(const special of specials){const button=document.createElement('button');button.type='button';button.className='cat-btn category-special49'+(activeCategory===special.name?' active':'');button.setAttribute('aria-pressed',String(activeCategory===special.name));button.innerHTML='<svg class="ui-icon" aria-hidden="true"><use href="icons.svg#'+special.symbol+'"></use></svg><span>'+e(special.name)+'</span><small class="category-count">'+special.count+'</small>';button.onclick=()=>jump(special.name);bar.append(button);}
  for(const category of categories){const link=document.createElement('a');link.className='cat-btn category-jump49';link.href='#'+id(category);link.textContent=label(category);link.onclick=event=>{event.preventDefault();jump(category);};bar.append(link);}
 }
 function jump(category){
  const special=['Best Sellers','Recommended'].includes(category);
  const heading=document.getElementById('menuListTitle'),dropdown=document.getElementById('menuSort');
  if(special){
   activeCategory=category;if(heading)heading.textContent=category;renderCategories();renderMenuItems();
   document.getElementById('menuContainer')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
   if(dropdown)dropdown.value=category;return;
  }
  activeCategory='All';if(heading)heading.textContent='Our menu';document.getElementById('searchInput').value='';document.getElementById('menuDiet').value='all';renderCategories();renderMenuItems();
  if(category!=='All'){
   const target=document.getElementById(id(category));if(target){target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});const categoryHeading=target.querySelector('h2');categoryHeading?.focus({preventScroll:true});}
  }
  for(const link of document.querySelectorAll('.category-jump49')){const active=category!=='All'&&link.getAttribute('href')==='#'+id(category);link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','true');else link.removeAttribute('aria-current');}
  if(dropdown)dropdown.value=category==='All'?'All':category;
 }
 function row(item){
  const settings=cfg(),options=offeredSizes(item),catOptions=settings.categoryOptions?.[item.category]||{};
  if(item.sizes_enabled&&!options.includes(selectedSizes[item.id]))selectedSizes[item.id]=options[0];
  const size=item.sizes_enabled?selectedSizes[item.id]:null,key=cartKey(item.id,size),qty=cart[key]?.qty||0,price=size?Number(item.size_prices[size]):item.price,attr=size?' data-size="'+e(size)+'"':'';
  const labels=`${item.best_seller===true?'<span class="menu-label menu-label-best">Bestseller</span>':''}${item.recommended===true?'<span class="menu-label">Chef’s pick</span>':''}`;
  const diet=`<span class="badge-veg-nonveg ${item.veg?'badge-veg':'badge-nonveg'}" title="${item.veg?'Vegetarian':'Non-vegetarian'}" aria-label="${item.veg?'Vegetarian':'Non-vegetarian'}"><span class="dot"></span></span>`;
  const desc=item.description&&catOptions.showDescription===true?`<p class="item-desc">${e(item.description)}</p>`:'';
  const sizes=options.length?`<div class="dish-sizes49" role="group" aria-label="Choose size for ${e(item.name)}">${options.map(option=>`<button type="button" class="pizza-size-button${option===size?' selected':''}" data-pick-size="${e(option)}" data-item="${e(item.id)}" aria-pressed="${option===size}">${e(sizeLabel(option,item))} <small>${priceText(item.size_prices[option])}</small></button>`).join('')}</div>`:'';
  const buy=qty?`<div class="qty-counter"><button class="qty-btn" aria-label="Remove one ${e(item.name)}" data-qty="-1" data-item="${e(item.id)}"${attr}>−</button><span>${qty}</span><button class="qty-btn" aria-label="Add one ${e(item.name)}" data-qty="1" data-item="${e(item.id)}"${attr}>+</button></div>`:`<button class="btn-add" aria-label="Add ${e(item.name)}" data-qty="1" data-item="${e(item.id)}"${attr}>ADD<span aria-hidden="true">+</span></button>`;
  const photo=Cloud.safeImage(item.image);
  const media=photo?`<div class="dish-row49-media"><div class="dish-row49-thumb"><img data-low-src="${e(photo)}" alt="${e(item.name)}" width="240" height="240" loading="lazy" decoding="async" fetchpriority="low"></div><div class="dish-row49-purchase">${buy}</div></div>`:`<div class="dish-row49-media no-photo"><div class="dish-row49-purchase">${buy}</div></div>`;
  return `<article class="dish-row49 item-card${qty?' in-cart':''}${photo?' has-photo':''}" data-menu-id="${e(item.id)}"><div class="dish-row49-copy"><div class="dish-meta49">${diet}${labels?`<span class="dish-labels49">${labels}</span>`:''}</div><h3 class="item-title">${e(item.name)}</h3><strong class="item-price">${priceText(price)}</strong>${desc}${sizes}</div>${media}</article>`;
 }
 function render(items){
  const container=document.getElementById('menuContainer'),settings=cfg();container.classList.add('category-menu49');container._menuMarkup=null;
  const groups=new Map();for(const item of items){if(!groups.has(item.category))groups.set(item.category,[]);groups.get(item.category).push(item);}
  const old=new Map([...container.querySelectorAll(':scope > .category-section49')].map(el=>[el.dataset.category49,el]));
  const next=[];let bannerCount=0;for(const [category,dishes]of groups){let section=old.get(category);if(!section){section=document.createElement('section');section.className='category-section49';section.dataset.category49=category;section.id=id(category);section.innerHTML='<div class="category-header49"></div><div class="category-rows49"></div>';}
   const candidate=settings.showCategoryImages!==false&&settings.categoryOptions?.[category]?.showImage!==false?Cloud.safeImage(settings.categoryPhotos?.[category]):'';const url=candidate&&bannerCount<20?(bannerCount++,candidate):'';
   const transform=imageTransform(category),head=section.querySelector('.category-header49'),header=`${url?`<figure class="category-banner49 category-photo48"><img data-low-src="${e(url)}" alt="${e(label(category))} dishes" width="1600" height="300" loading="lazy" decoding="async" fetchpriority="low" style="object-position:${transform.x}% ${transform.y}%;transform:scale(${transform.zoom});transform-origin:${transform.x}% ${transform.y}%"></figure>`:''}<div class="category-title49"><h2 tabindex="-1">${e(label(category))}</h2><small>${dishes.length} ${dishes.length===1?'dish':'dishes'}</small></div>`;
   if(head._markup!==header){head.innerHTML=header;head._markup=header;}
   const root=section.querySelector('.category-rows49'),rows=new Map([...root.children].map(el=>[el.dataset.menuId,el])),wanted=[];
   for(const item of dishes){const html=row(item);let node=rows.get(String(item.id));if(!node||node._markup!==html){const template=document.createElement('template');template.innerHTML=html;const replacement=template.content.firstElementChild;if(node)node.replaceWith(replacement);node=replacement;node._markup=html;}wanted.push(node);}
   for(const child of [...root.children])if(!wanted.includes(child))child.remove();for(const [i,node]of wanted.entries())if(root.children[i]!==node)root.insertBefore(node,root.children[i]||null);next.push(section);
  }
  for(const child of [...container.children])if(!next.includes(child))child.remove();for(const [i,node]of next.entries())if(container.children[i]!==node)container.insertBefore(node,container.children[i]||null);
  Cloud.deferImages?.(container);
 }
 return {enabled,nav,jump,render};
})();

/* customer.js?v=66 */
;'use strict';
let sharedMenu=[], receipts=[], pendingAttempt=null, serverOffset=0, menuBusy=false, trackingBusy=false,placingOrder=false;
let receiptSyncPromise=null,receiptSyncError='',historyReturnFocus=null,trackingHistoryMode=false;
function vibrateCookingAlert(){try{navigator.vibrate?.([900,180,900,180,900]);}catch{}}
let CURRENT_VISIT_MS=2*60*60*1000,HISTORY_KEEP_MS=3*60*60*1000,retentionLoaded=false;
function applyCustomerRetention(settings,serverNow){if(Number.isFinite(Date.parse(serverNow)))serverOffset=Date.parse(serverNow)-Date.now();if(!settings||!Number.isInteger(settings.current_minutes)||!Number.isInteger(settings.history_minutes))return;const current=settings.current_minutes*60000,history=settings.history_minutes*60000,changed=!retentionLoaded||current!==CURRENT_VISIT_MS||history!==HISTORY_KEEP_MS;CURRENT_VISIT_MS=current;HISTORY_KEEP_MS=history;retentionLoaded=true;if(changed){pruneReceipts();renderOrderLists();if(activeOrder)renderTracking();}}

function receiptAge(r){const t=Date.parse(r?.created_at);return Number.isFinite(t)?Math.max(0,Date.now()+serverOffset-t):Infinity;}
function pruneReceipts(){if(!retentionLoaded)return;const kept=receipts.filter(r=>receiptAge(r)<HISTORY_KEEP_MS);if(kept.length!==receipts.length){receipts=kept;saveReceipts();if(activeOrder&&!receipts.some(r=>r.id===activeOrder.id))activeOrder=null;}}
const CURRENT_ORDER_STATUSES=new Set(['Pending','Accepted','Cooking','Ready']);
const RECEIPT_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let activeCategory = "All";
    let cart = {}; // item + size -> { item, size, qty }
    const selectedSizes=Object.create(null);
    const sizeLabel=(size,item)=>MenuOptions.label(item,size);
    const cartKey=(id,size)=>size?JSON.stringify([String(id),size]):String(id);
    const offeredSizes=item=>item.sizes_enabled?MenuOptions.keys(item).filter(size=>Object.prototype.hasOwnProperty.call(item.size_prices||{},size)&&Number.isFinite(Number(item.size_prices[size]))&&!(item.size_stock?.[size]?.tracked&&Number(item.size_stock[size].remaining)<=0)):[];
    const remainingStock=(item,size)=>{const stock=size?item?.size_stock?.[size]:item?.stock;return stock?.tracked?Math.max(0,Number(stock.remaining)||0):Infinity;};
    const lineName=line=>line.item.name+(line.size?' — '+sizeLabel(line.size,line.item):'');
    const priceText=price=>(RESTAURANT_CONFIG.currency||'₹')+Number(price).toFixed(2);
    let currentTable = "T1";
    let activeOrder = null; // { orderId, table, items, total, status }

    // Init from URL Query Params (e.g. ?table=T1 or ?table=2)
    function initTable() {
      const tableParam=new URL(location.href).searchParams.get('table');
      currentTable=tableParam&&/^T[1-9][0-9]{0,3}$/i.test(tableParam)?tableParam.toUpperCase():'';
      document.getElementById('tableText').innerText = Cloud.tableName(currentTable);
      document.getElementById('custTableInput').value = Cloud.tableName(currentTable);
      document.getElementById('cartTableLabel').textContent = Cloud.tableName(currentTable);
    }

    // Load branding
    function initBranding() {
      document.getElementById('restaurantName').innerText = RESTAURANT_CONFIG.restaurantName || 'Yummy Momo';
      document.getElementById('restaurantTagline').innerText = 'Made for your cravings.';
      document.getElementById('googleReviewBtn').href = RESTAURANT_CONFIG.googleReviewUrl;
    }

    // Render Categories
    function renderCategories() {
      if(window.CategoryMenu49?.enabled()){CategoryMenu49.nav(getActiveMenuItems());return;}
      const bar = document.getElementById('categoriesBar');bar.removeAttribute('data-signature49');document.getElementById('browseMenu').hidden=window.Custom48?.get().showCategoryLinks===false;document.getElementById('menuSort').hidden=window.Custom48?.get().showCategoryLinks===false;
      const scroll=bar.scrollLeft,hadFocus=bar.contains(document.activeElement);bar.replaceChildren();
      const hiddenCats=window.Custom48?.get().categoryOptions||{};const categories=[...new Set(['All','Best Sellers','Recommended',...Cloud.categories.slice(1).filter(c=>hiddenCats[c]?.hidden!==true)])];
      if(!categories.includes(activeCategory))activeCategory='All';
      const dropdown=document.getElementById('menuSort');if(dropdown){dropdown.replaceChildren(...categories.map(cat=>{const o=document.createElement('option');o.value=cat;o.textContent=cat==='All'?'All categories':cat;return o;}));dropdown.value=activeCategory;}
      for(const cat of categories){
        const button=document.createElement('button');button.className='cat-btn'+(cat===activeCategory?' active':'');const sym=cat==='All'?'grid':cat==='Best Sellers'?'star':cat==='Recommended'?'check':/drinks/i.test(cat)?'cup':/dessert/i.test(cat)?'cake':'momo';button.innerHTML='<svg class="ui-icon" aria-hidden="true"><use href="icons.svg#'+sym+'"></use></svg><span>'+Cloud.esc(cat)+'</span>';const count=getActiveMenuItems().filter(i=>cat==='All'||cat==='Best Sellers'&&i.best_seller||cat==='Recommended'&&i.recommended||i.category===cat).length;const badge=document.createElement('small');badge.className='category-count';badge.textContent=count;button.append(badge);button.setAttribute('aria-pressed',String(cat===activeCategory));button.addEventListener('click',()=>selectCategory(cat));bar.append(button);
      }
      bar.scrollLeft=scroll;if(hadFocus)bar.querySelector('[aria-pressed="true"]')?.focus({preventScroll:true});
    }

    function selectCategory(cat) {
      if(window.CategoryMenu49?.enabled()){CategoryMenu49.jump(cat);return;}
      activeCategory = cat;
      const heading=document.getElementById('menuListTitle');if(heading)heading.textContent=cat==='All'?'Our menu':cat;
      renderCategories();
      renderMenuItems();
      const rail=document.getElementById('categoriesBar'),active=rail.querySelector('[aria-pressed="true"]');if(active){const b=active.getBoundingClientRect(),r=rail.getBoundingClientRect();if(b.left<r.left)rail.scrollLeft-=r.left-b.left;else if(b.right>r.right)rail.scrollLeft+=b.right-r.right;}
    }

    // Helper to normalize category matching
    function normalizeCategory(cat){return Cloud.normalizeCategory(cat);}

    function getActiveMenuItems(){const hidden=window.Custom48?.get().categoryOptions||{};return sharedMenu.filter(i=>i.available!==false&&hidden[i.category]?.hidden!==true);}

    // Render Menu Items
    function renderMenuItems(filteredList = null,changedId = null) {
      const container = document.getElementById('menuContainer');
      const allItems = getActiveMenuItems();
      const q=document.getElementById('searchInput').value.toLowerCase().trim();
      let list=(filteredList||allItems).filter(i=>activeCategory==='All'||activeCategory==='Best Sellers'&&i.best_seller===true||activeCategory==='Recommended'&&i.recommended||normalizeCategory(i.category)===activeCategory).filter(i=>!q||[i.name,i.description,i.category].some(v=>String(v).toLowerCase().includes(q)));

      const diet=$('menuDiet')?.value||'all';list=list.filter(i=>diet==='all'||(diet==='veg'?i.veg:!i.veg));
      if(window.CategoryMenu49?.enabled()){if(!list.length){container.innerHTML='<p class="empty">No dishes match your search.</p>';return;}CategoryMenu49.render(list);return;}
      container.classList.remove('category-menu49');
      const categoryPhotoItems48=[...list];
      if(changedId!==null)list=list.filter(i=>String(i.id)===String(changedId));
      if (list.length === 0) {
        if(changedId!==null)return;
        container._menuMarkup=null;container.innerHTML = `<div style="text-align:center; padding:40px; color:#71717a;">No dishes found in ${Cloud.esc(activeCategory)}.</div>`;
        return;
      }

      const markup = list.map(item => {
        const options=offeredSizes(item);if(item.sizes_enabled&&!options.includes(selectedSizes[item.id]))selectedSizes[item.id]=options[0];
        const size=item.sizes_enabled?selectedSizes[item.id]:null,key=cartKey(item.id,size),unitPrice=size?Number(item.size_prices[size]):item.price;
        const inCartQty=cart[key]?.qty||0;const sizeAttr=size?' data-size="'+size+'"':'';
        const imgHtml = item.image
          ? `<img class="item-img" data-low-src="${Cloud.esc(Cloud.safeImage(item.image))}" alt="${Cloud.esc(item.name)}" loading="lazy" decoding="async" fetchpriority="low">`
          : `<div class="item-img" style="display:flex;align-items:center;justify-content:center;font-size:2.8rem;background:var(--soft);border-radius:12px;"><svg class="ui-icon" aria-hidden="true" style="width:42px;height:42px;color:var(--red)"><use href="icons.svg#momo"></use></svg></div>`;

        return `
          <div class="item-card" data-menu-id="${Cloud.esc(item.id)}">
            <div class="item-info">
              <div>
                <div class="badge-veg-nonveg ${item.veg ? 'badge-veg' : 'badge-nonveg'}">
                  <span class="dot"></span>
                </div>
                <h3 class="item-title">${Cloud.esc(item.name)}</h3>${item.recommended?'<span class="menu-label">Recommended</span>':''}${item.best_seller===true?'<span class="menu-label">Best seller</span>':''}
                <p class="item-desc">${Cloud.esc(item.description)}</p>
              </div>
            </div>
            <div class="item-img-container">
              ${imgHtml}
            </div>
            ${options.length?`<div class="item-size-options" role="group" aria-label="Choose size for ${Cloud.esc(item.name)}">${options.map(option=>`<button type="button" class="pizza-size-button${option===size?' selected':''}" data-pick-size="${option}" data-item="${Cloud.esc(item.id)}" aria-pressed="${option===size}"><span>${Cloud.esc(sizeLabel(option,item))}</span><small>${priceText(item.size_prices[option])}</small></button>`).join('')}</div>`:''}
            <div class="item-purchase-row"><div><div class="item-price">${priceText(unitPrice)}${size?`<span>${Cloud.esc(sizeLabel(size,item))}</span>`:''}</div></div>
              <div class="action-btn-wrapper">
                ${inCartQty === 0 ? `
                  <button class="btn-add" data-qty="1" data-item="${Cloud.esc(item.id)}"${sizeAttr}>+ Add</button>
                ` : `
                  <div class="qty-counter">
                    <button class="qty-btn" data-qty="-1" data-item="${Cloud.esc(item.id)}"${sizeAttr}>−</button>
                    <span>${inCartQty}</span>
                    <button class="qty-btn" data-qty="1" data-item="${Cloud.esc(item.id)}"${sizeAttr}>+</button>
                  </div>
                `}
              </div>
            </div>
          </div>
        `;
      }).join('');
      patchMenuCards(container,markup,changedId);
      Cloud.deferImages?.(container);
      window.Custom48?.renderCategoryPhotos(categoryPhotoItems48);
    }

    function handleSearch(){renderMenuItems();}

    // Cart Operations
    function updateQty(itemId,delta,size=null) {
      const key=cartKey(itemId,size),base=getActiveMenuItems().find(i=>String(i.id)===String(itemId));
      if(delta>0&&(!base||(base.sizes_enabled?!offeredSizes(base).includes(size):!!size)))return;
      const item=base?{...base,price:size?Number(base.size_prices[size]):base.price}:cart[key]?.item;
      if(!item)return;const next=(cart[key]?.qty||0)+delta;
      if(next<=0)delete cart[key];
      else {const left=remainingStock(base,size);if(delta>0&&next>left){message('Only '+left+' left for this item or size. Please check your cart.',true);return;}if(!cart[key]&&Object.keys(cart).length>=50){message('Cart must contain at most 50 item/size lines.',true);return;}cart[key]={item,size,qty:Math.min(50,next)};}
      renderMenuItems(null,itemId);updateCartUI();
    }

    function updateCartUI() {
      renderOrderSidebar();
      const items = Object.values(cart);
      const totalCount = items.reduce((sum, i) => sum + i.qty, 0);
      const subtotal = Math.round(items.reduce((sum, i) => sum + (i.qty * i.item.price), 0)*100)/100;
      const tax=cartTax(subtotal),totalPrice=Math.round((subtotal+tax)*100)/100;

      const bar = document.getElementById('floatingCartBar');
      if (totalCount > 0) {
        bar.style.display = 'flex';
        document.getElementById('cartItemsCount').innerText = `${totalCount} ITEM${totalCount > 1 ? 'S' : ''}`;
        document.getElementById('cartTotalPrice').innerText = `${RESTAURANT_CONFIG.currency}${totalPrice}`;
      } else {
        bar.style.display = 'none';
      }

      // Drawer updates
      const placeOrderSpan = document.getElementById('placeOrderAmount');
      if (placeOrderSpan) placeOrderSpan.innerText = `${RESTAURANT_CONFIG.currency}${totalPrice}`;
      const subtotalEl = document.getElementById('billSubtotal');
      if (subtotalEl) subtotalEl.innerText = `${RESTAURANT_CONFIG.currency}${subtotal.toFixed(2)}`;
      document.getElementById('billTaxRow').hidden=!customerTax.tax_enabled;document.getElementById('billTaxLabel').textContent=customerTax.tax_mode==='percent'?'Tax ('+Number(customerTax.tax_value)+'%)':'Tax (fixed per order)';document.getElementById('billTaxAmount').textContent=RESTAURANT_CONFIG.currency+tax.toFixed(2);
      const totalEl = document.getElementById('billTotal');
      if (totalEl) totalEl.innerText = `${RESTAURANT_CONFIG.currency}${totalPrice}`;

      const listContainer = document.getElementById('cartItemsList');
      if (items.length === 0) {
        listContainer._cartMarkup=null;listContainer.innerHTML = `<p style="text-align:center; color:#71717a; padding:20px;">Your cart is empty.</p>`;
      } else {
        const cartHTML = items.map(c => `
          <div class="cart-item-row">
            <div class="cart-item-info">
              <h4>${Cloud.esc(lineName(c))}</h4>
              <p>${RESTAURANT_CONFIG.currency}${c.item.price} × ${c.qty} = ${RESTAURANT_CONFIG.currency}${c.item.price * c.qty}</p>
            </div>
            <div class="cart-item-stepper">
              <button data-qty="-1" data-item="${Cloud.esc(c.item.id)}"${c.size?` data-size="${c.size}"`:""}>−</button>
              <span style="font-weight:700;">${c.qty}</span>
              <button data-qty="1" data-item="${Cloud.esc(c.item.id)}"${c.size?` data-size="${c.size}"`:""}>+</button>
            </div>
          </div>
        `).join('');if(listContainer._cartMarkup!==cartHTML){listContainer.innerHTML=cartHTML;listContainer._cartMarkup=cartHTML;}
      }
    }

    function openCartDrawer() {
      document.getElementById('drawerOverlay').classList.add('open');
      document.getElementById('cartDrawer').classList.add('open');syncCustomerLayerLock();
    }

    function closeCartDrawer() {
      document.getElementById('drawerOverlay').classList.remove('open');
      document.getElementById('cartDrawer').classList.remove('open');
    }

const $=id=>document.getElementById(id);
function message(text,error=false){$('cloudMessage').textContent=text;$('cloudMessage').dataset.error=String(error);$('cloudMessage').style.color=error?'#b91c1c':'#71717a';}
function mapMenu(row){return {...row,price:Number(row.price),image:Cloud.safeImage(row.image),description:row.description||''};}
async function loadSharedMenu(){
 if(!TableAccess.canCall()){renderSystemFooter(null);return;}if(menuBusy)return;menuBusy=true;
 try{
  const access=await TableAccess.credentials(false);const snapshot=await Cloud.syncMenu(false,access);const rows=snapshot.rows;applyCommerce(snapshot.commerce);const signature=JSON.stringify(rows);
  if(signature!==loadSharedMenu.signature){sharedMenu=rows.map(mapMenu);renderCategories();loadSharedMenu.signature=signature;
   let removed=false,pricesChanged=false,stockChanged=false;Object.keys(cart).forEach(key=>{const line=cart[key],item=sharedMenu.find(m=>m.id===line.item.id);if(!item||(item.sizes_enabled?!offeredSizes(item).includes(line.size):!!line.size)){delete cart[key];removed=true;}else{const price=line.size?Number(item.size_prices[line.size]):item.price;pricesChanged=pricesChanged||price!==line.item.price;line.item={...item,price};const left=remainingStock(item,line.size);if(line.qty>left){line.qty=left;stockChanged=true;if(!left){delete cart[key];removed=true;}}}});
   handleSearch();updateCartUI();if(removed)message('An unavailable item or size was removed from your cart. Please review it.');else if(stockChanged)message('Stock changed. Your cart quantities were reduced to the remaining stock. Please review them.');else if(pricesChanged)message('Menu prices changed. Please review your cart.');else message(rows.length?'Live restaurant menu':'No dishes are available right now. Please ask a waiter.');
  }else if(rows.length)message('Live restaurant menu');
 }catch(e){renderSystemFooter(null);message('Menu connection error: '+e.message+' Please retry or ask a waiter.',true);if(!sharedMenu.length)$('menuContainer').textContent='The menu could not be loaded. No order will be sent without a cloud connection.';}
 finally{menuBusy=false;}
}
function attemptKey(){return 'RESTAURANT_PENDING_v2_'+currentTable;}
function saveReceipts(){Cloud.write('RESTAURANT_RECEIPTS_v2',receipts);}
function rememberOrder(row,token){
 if(row.server_now)serverOffset=new Date(row.server_now).getTime()-Date.now();
 const receipt={...row,token,_statusChecked:Date.now()}, index=receipts.findIndex(r=>r.id===row.id);
 if(index<0)receipts.push(receipt);else receipts[index]=receipt;
 receipts=receipts.slice(-100);saveReceipts();activeOrder=receipt;
 Cloud.write('RESTAURANT_ACTIVE_v2',row.id);
}
function currentTableReceipts(){
 pruneReceipts();return receipts.filter(r=>r&&r.table_number===currentTable&&r.id)
  .slice().sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
}
function isCurrentOrder(r){return !!r&&!r.tracking_unavailable&&CURRENT_ORDER_STATUSES.has(r.status)&&receiptAge(r)<CURRENT_VISIT_MS;}
function currentOrders(){return currentTableReceipts().filter(isCurrentOrder);}
function pastOrders(){return currentTableReceipts().filter(r=>!isCurrentOrder(r)).reverse();}
function receiptStatus(r){return r.tracking_unavailable?'Unavailable on this project':r.status;}
function receiptDate(r){return new Date(r.created_at).toLocaleString([],{dateStyle:'medium',timeStyle:'short'});}
function renderOrderLists(){
 const current=currentOrders(),past=pastOrders(),latest=current.at(-1);
 $('customerOrdersBar').hidden=!current.length&&!past.length;
 $('currentOrdersButton').textContent=`Order status (${current.length})`;
 $('currentOrdersButton').disabled=!current.length;
 $('orderHistoryButton').textContent=`Order history (${past.length})`;
 $('activeOrderBanner').style.display=latest?'flex':'none';
 if(latest)$('bannerStatusText').textContent=`${current.length===1?'Order in progress':current.length+' current orders'} · ${latest.status}`;
 $('orderSyncMessage').textContent=receiptSyncError;
 $('historySyncMessage').textContent=receiptSyncError;
 $('orderHistorySubtitle').textContent=`${Cloud.tableName(currentTable)} · History from the last ${Math.round(HISTORY_KEEP_MS/60000)} minutes on this device`;
 const html=past.length?past.map(r=>`<button type="button" class="history-order-card" data-order-status="${Cloud.esc(r.status)}" data-history-order="${Cloud.esc(r.id)}"><span class="history-card-top"><strong>${Cloud.esc(Cloud.orderLabel(r))}</strong><span class="history-card-status">${Cloud.esc(receiptStatus(r))}</span></span><span class="history-card-date">${Cloud.esc(receiptDate(r))}</span><span class="history-card-items">${Cloud.esc((Array.isArray(r.items)?r.items:[]).slice(0,2).map(i=>`${Number(i.qty)||0} × ${i.name||'Item'}`).join(' · ')||'Open to view order details')}${Array.isArray(r.items)&&r.items.length>2?` · +${r.items.length-2} more`: ''}</span>${r.payment_method?`<span class="history-card-payment">Paid through: ${Cloud.esc(r.payment_method)}</span>`:''}${r.rejection_reason?`<span class="history-card-reason">${Cloud.esc(r.rejection_reason)}</span>`:''}<span class="history-card-bottom"><span>${Cloud.esc(RESTAURANT_CONFIG.currency)}${Number(r.total||0).toFixed(2)}</span><span>View order →</span></span></button>`).join(''):'<p class="history-empty">No past orders for this table on this device yet. Served, cancelled and rejected orders will appear here.</p>';
 if($('orderHistoryList').innerHTML!==html)$('orderHistoryList').innerHTML=html;
}
function openOrderHistory(){
 historyReturnFocus=document.activeElement;
 renderOrderLists();$('orderHistoryModal').hidden=false;
 $('orderHistoryModal').scrollTo({top:0,behavior:'instant'});
 $('orderHistoryModal').querySelector('.btn-close-drawer').focus();
 syncDeviceOrders(true);
}
function closeOrderHistory(){
 $('orderHistoryModal').hidden=true;
 if(historyReturnFocus?.isConnected)historyReturnFocus.focus();
}
async function syncDeviceOrders(forceAll=false){
 if(receiptSyncPromise){
  await receiptSyncPromise;
  if(forceAll)return syncDeviceOrders(true);
  return;
 }
 const submitted=currentTableReceipts().filter(r=>RECEIPT_UUID.test(r.id)&&RECEIPT_UUID.test(r.token||''))
  .filter(r=>forceAll||isCurrentOrder(r))
  .slice(-100).map(r=>({id:r.id,token:r.token}));
 if(!submitted.length){renderOrderLists();return;}
 receiptSyncPromise=(async()=>{
  try{
   const data=await Cloud.rpc('restaurant_receipt_sync47',{p_receipts:submitted});
   if(!data||!Array.isArray(data.orders)||!Array.isArray(data.unavailable_ids))throw Error('Invalid saved-order response. Please retry.');
   if(data.server_now)serverOffset=new Date(data.server_now).getTime()-Date.now();
   const sent=new Map(submitted.map(r=>[r.id,r])),rows=new Map(data.orders.filter(r=>sent.has(r.id)).map(r=>[r.id,r]));
   const unavailable=new Set(data.unavailable_ids.filter(id=>sent.has(id)));
   receipts=receipts.filter(r=>!unavailable.has(r.id)).map(r=>{
    const incoming=rows.get(r.id);if(!incoming)return r;
    if(new Date(r.updated_at||0)>new Date(incoming.updated_at||0))return r;
    if(incoming.status==='Cooking'&&r.status!=='Cooking')vibrateCookingAlert();
    return {...r,...incoming,token:sent.get(r.id).token,_statusChecked:Date.now()};
   });
   saveReceipts();
   if(activeOrder)activeOrder=receipts.find(r=>r.id===activeOrder.id)||null;
   receiptSyncError='';
   renderOrderLists();if(activeOrder||$('trackingModal').classList.contains('open'))renderTracking();
   $('trackingError').textContent='';
  }catch(e){
   receiptSyncError='Saved order statuses may be out of date. '+(/restaurant_get_device_orders|schema cache|Could not find the function/i.test(e.message)?'Install the order-history database upgrade first.':e.message);
   renderOrderLists();if($('trackingModal').classList.contains('open'))$('trackingError').textContent=receiptSyncError;
  }
 })();
 try{await receiptSyncPromise;}finally{receiptSyncPromise=null;}
}
async function placeOrder(){
 const btn=$('btnPlaceOrder');if(placingOrder||btn.disabled)return;
 const entries=Object.values(cart);if(!entries.length&&!pendingAttempt)return;placingOrder=true;btn.disabled=true;
 try{
  $('cartOrderError').textContent='';
  if(!pendingAttempt){pendingAttempt={request_id:crypto.randomUUID(),token:crypto.randomUUID(),table:currentTable,name:$('custNameInput').value.trim().slice(0,80)||'Guest',notes:$('custNotesInput').value.trim().slice(0,1000),items:entries.map(c=>({id:c.item.id,qty:c.qty,...(c.size?{size:c.size}:{})})),expected_total:cartTotal()};Cloud.write(attemptKey(),pendingAttempt);}
  btn.disabled=true;btn.textContent='Saving order to kitchen…';
  const a=pendingAttempt;
  const access=await TableAccess.credentials(true);
  const row=await Cloud.rpc('restaurant_place_order_v13',{p_request_id:a.request_id,p_token:a.token,p_table:a.table,p_name:a.name,p_notes:a.notes,p_items:a.items,p_expected_total:a.expected_total,...access});
  rememberOrder(row,a.token);Cloud.remove(attemptKey());pendingAttempt=null;
  $('pendingRetry').hidden=true;cart={};$('custNotesInput').value='';syncNoteChips();handleSearch();updateCartUI();closeCartDrawer();openTrackingModal();message('Order saved. Waiting for kitchen acceptance.');
  if(!['Cancelled','Rejected'].includes(row.status)){promptOrderReview(row.id);if(window.OrderCelebration)OrderCelebration.show(row.id,null,row.items);}

 }catch(e){$('cartOrderError').textContent=e.message;message('Order not confirmed: '+e.message+' Use “Retry original order” to safely retry the same submission.',true);
  // A definite database validation error is safe to edit/retry with a new request.
  if(/Insufficient stock|Stock changed|sold out|Total changed|unavailable|Invalid|Quantity|Cart must|Name or notes|Two orders are already pending|This table is reserved|Scan expired|scan your table QR/.test(e.message)){pendingAttempt=null;$('pendingRetry').hidden=true;Cloud.remove(attemptKey());await loadSharedMenu();}
 }finally{placingOrder=false;$('pendingRetry').hidden=!pendingAttempt;btn.disabled=false;btn.innerHTML=pendingAttempt?'Retry original order':`<span>Place Order</span><span id="placeOrderAmount">${Cloud.esc(RESTAURANT_CONFIG.currency)}${cartTotal()}</span>`;updateCartUI();}
}
function chooseOrder(id){const receipt=receipts.find(r=>r.id===id&&r.table_number===currentTable);if(receipt){trackingHistoryMode=!isCurrentOrder(receipt);activeOrder=receipt;Cloud.write('RESTAURANT_ACTIVE_v2',id);$('orderHistoryModal').hidden=true;$('trackingModal').classList.add('open');renderTracking();if(trackingHistoryMode)syncDeviceOrders(true);else pollActiveOrder();$('trackingModal').scrollTo({top:0,behavior:'instant'});}}
function openTrackingModal(){trackingHistoryMode=false;activeOrder=currentOrders().at(-1)||null;$('trackingModal').classList.add('open');renderTracking();pollActiveOrder();}
function closeTrackingModal(){$('trackingModal').classList.remove('open');syncCustomerLayerLock();}
function renderTracking(){
 renderOrderLists();
 if(!trackingHistoryMode&&!isCurrentOrder(activeOrder))activeOrder=currentOrders().at(-1)||null;
 const empty=!activeOrder;
 $('trackingEmpty').hidden=!empty;
 ['trackingStepper','trackingItemsSection','trackingActions','trackingCancelPanel'].forEach(id=>$(id).hidden=empty);
 $('trackingModal').querySelector('.tracking-status-hero').hidden=empty;
 if(empty){$('trackingTitle').textContent='Order status';$('trackingOrderIdentity').textContent=Cloud.tableName(currentTable);$('otherOrdersPanel').hidden=true;return;}
 $('trackingTableLabel').textContent=Cloud.tableName(activeOrder.table_number);
 const tableOrders=currentOrders();
 const currentNumber=tableOrders.findIndex(r=>r.id===activeOrder.id)+1;
 $('trackingTitle').textContent=isCurrentOrder(activeOrder)?'Order Status':'Past order';
 $('trackingOrderIdentity').textContent=Cloud.orderLabel(activeOrder)+' · '+Cloud.tableName(activeOrder.table_number);
 const others=tableOrders.map((r,i)=>({r,number:i+1})).filter(o=>o.r.id!==activeOrder.id);
 $('otherOrdersPanel').hidden=others.length===0;
 const tabs=others.map(({r,number})=>`<button type="button" class="other-order-tab" data-switch-order="${Cloud.esc(r.id)}" aria-label="View ${Cloud.esc(Cloud.orderLabel(r))}, ${Cloud.esc(r.status)}"><span class="other-order-tab-top"><strong>${Cloud.esc(Cloud.orderLabel(r))}</strong><span aria-hidden="true">→</span></span><span class="other-order-state">${Cloud.esc(r.status)} · ${new Date(r.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span><span class="other-order-id">${Cloud.esc(r.order_day||new Date(r.created_at).toLocaleDateString())}</span></button>`).join('');
 if($('otherOrderTabs').innerHTML!==tabs)$('otherOrderTabs').innerHTML=tabs;
 const trackingItemsHTML=activeOrder.items.map(i=>`<div style="display:flex;justify-content:space-between;gap:16px;padding:4px 0;"><span>${Cloud.esc(i.name)} × ${i.qty}</span><b>${Cloud.esc(RESTAURANT_CONFIG.currency)}${Number(i.subtotal).toFixed(2)}</b></div>`).join('')+receiptTaxRows(activeOrder)+`<div style="display:flex;justify-content:space-between;border-top:1px solid #cbd5e1;margin-top:8px;padding-top:8px;"><b>Total</b><b>${Cloud.esc(RESTAURANT_CONFIG.currency)}${Number(activeOrder.total).toFixed(2)}</b></div>`;
 if($('trackingItemsList').innerHTML!==trackingItemsHTML)$('trackingItemsList').innerHTML=trackingItemsHTML;
 updateTrackingStatusDisplay(activeOrder.status);updateCancelTimer();
}
function updateTrackingStatusDisplay(status){
 const copy={Pending:['⏳','Waiting for kitchen acceptance','Your order is safely saved. A staff member will accept it shortly.'],Accepted:['🔥','Cooking in the kitchen','The kitchen is preparing your food.'],Cooking:['🔥','Cooking in the kitchen','Cooking has started. Online cancellation is now closed.'],Ready:['🔔','Ready for your table','Please ask a waiter to bring your dishes.'],Served:['✨','Served & complete','Enjoy your meal! This order is saved in your order history.'],Cancelled:['×','Order cancelled',activeOrder?.rejection_reason||'This order was cancelled and is saved in your order history.'],Rejected:['×','Order unavailable',activeOrder?.rejection_reason||'The kitchen could not accept this order. Please ask a waiter.']};
 const [icon,title,sub]=activeOrder?.tracking_unavailable?['?','Saved order unavailable','This receipt could not be verified on the current shop database. Ask a waiter. Its previous details are retained below.']:(copy[status]||['?','Saved order','Please ask a waiter for an update.']);
 $('trackingStatusIcon').textContent=icon;$('trackingStatusTitle').textContent=title;$('trackingStatusSub').textContent=sub;
 $('trackingStepper').hidden=!!activeOrder?.tracking_unavailable||['Cancelled','Rejected'].includes(status);
 const step=status==='Served'?3:['Accepted','Cooking','Ready'].includes(status)?2:1;
 for(let i=1;i<=3;i++)$('step'+i).className='stepper-step '+(status==='Served'||i<step?'completed':i===step?'active':'');

}
function updateCancelTimer(){
 if(!activeOrder)return;
 const remaining=Math.max(0,Math.min((Date.parse(activeOrder.cancel_deadline)||Infinity),new Date(activeOrder.created_at).getTime()+60000)-(Date.now()+serverOffset));
 const allowed=!activeOrder.tracking_unavailable&&['Pending','Accepted'].includes(activeOrder.status)&&!activeOrder.cooking_started_at&&remaining>0;
 $('cancelOrderButton').disabled=!allowed;
 $('cancelOrderButton').hidden=!isCurrentOrder(activeOrder);
 $('cancelCountdown').textContent=activeOrder.tracking_unavailable?'Receipt unavailable on this shop database.':allowed?`Cancel within ${Math.floor(remaining/60000)}:${String(Math.floor(remaining/1000)%60).padStart(2,'0')} — only before cooking starts.`:activeOrder.status==='Cancelled'?'Cancelled · saved in order history.':activeOrder.status==='Served'?'Completed · saved in order history.':activeOrder.status==='Rejected'?'Rejected · saved in order history.':['Cooking','Ready'].includes(activeOrder.status)?'Cancellation closed: cooking has already started.':'Cancellation window is closed.';
}
function pollActiveOrder(){return syncDeviceOrders();}
async function cancelCustomerOrder(){
 if(!activeOrder||$('cancelOrderButton').disabled||!confirm('Cancel this order? This cannot be undone.'))return;
 $('cancelOrderButton').disabled=true;
 try{const row=await Cloud.rpc('restaurant_cancel_order',{p_id:activeOrder.id,p_token:activeOrder.token});rememberOrder(row,activeOrder.token);renderTracking();$('trackingError').textContent='';}
 catch(e){$('trackingError').textContent=e.message;await pollActiveOrder();}finally{updateCancelTimer();}
}
function addMoreItems(){closeTrackingModal();window.scrollTo({top:0,behavior:'smooth'});}
document.addEventListener('click',e=>{const history=e.target.closest('[data-history-order]');if(history){chooseOrder(history.dataset.historyOrder);return;}const tab=e.target.closest('[data-switch-order]');if(tab){chooseOrder(tab.dataset.switchOrder);return;}const choice=e.target.closest('[data-pick-size]');if(choice){selectedSizes[choice.dataset.item]=choice.dataset.pickSize;renderMenuItems(null,choice.dataset.item);document.querySelector('[data-pick-size="'+choice.dataset.pickSize+'"][data-item="'+CSS.escape(choice.dataset.item)+'"]')?.focus({preventScroll:true});return;}const b=e.target.closest('[data-qty]');if(b)updateQty(b.dataset.item,Number(b.dataset.qty),b.dataset.size||null);});
document.addEventListener('keydown',e=>{
 if($('orderHistoryModal').hidden)return;
 if(e.key==='Escape'){e.preventDefault();closeOrderHistory();return;}
 if(e.key==='Tab'){
  const buttons=[...$('orderHistoryModal').querySelectorAll('button:not([disabled])')];
  const first=buttons[0],last=buttons.at(-1);
  if(!$('orderHistoryModal').contains(document.activeElement)){e.preventDefault();first.focus();}
  else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
 }
});
window.addEventListener('DOMContentLoaded',()=>{
 try{initTable();initBranding();renderCategories();updateCartUI();
  const saved=Cloud.read('RESTAURANT_RECEIPTS_v2',[]);receipts=Array.isArray(saved)?saved.filter(r=>r&&typeof r==='object'):[];
  const id=Cloud.read('RESTAURANT_ACTIVE_v2',null);activeOrder=currentOrders().find(r=>r.id===id)||currentOrders().at(-1)||null;
  pendingAttempt=Cloud.read(attemptKey(),null);
  if(pendingAttempt){$('pendingRetry').hidden=false;$('btnPlaceOrder').textContent='Retry original order';message('A previous order was not confirmed. Open your cart and retry the original submission.');$('floatingCartBar').style.display='flex';$('cartItemsCount').textContent='ORDER NEEDS CONFIRMATION';}
  renderOrderLists();if(activeOrder)renderTracking();TableAccess.init().then(()=>{if(TableAccess.canCall()){pollActiveOrder();loadSharedMenu();loadPublicReviewSettings();}});
 }catch(e){message(e.message,true);}
});
Cloud.schedule('customer-menu',30000,loadSharedMenu);Cloud.schedule('customer-receipts',10000,pollActiveOrder);
setInterval(()=>{if(!document.hidden){pruneReceipts();renderOrderLists();updateCancelTimer();}},1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){loadSharedMenu();pollActiveOrder();}});




let customerTax={tax_enabled:false,tax_mode:'percent',tax_value:0};
function cartTax(subtotal){return customerTax.tax_enabled?(customerTax.tax_mode==='percent'?Math.round(Math.round(subtotal*100)*Math.round(Number(customerTax.tax_value)*100)/10000)/100:Math.round(Number(customerTax.tax_value)*100)/100):0;}
function cartTotal(){const subtotal=Math.round(Object.values(cart).reduce((s,c)=>s+c.qty*c.item.price,0)*100)/100;return Math.round((subtotal+cartTax(subtotal))*100)/100;}
function applyCommerce(data){renderSystemFooter(data.footer);customerTax=data.tax;const signature=JSON.stringify(data.categories);if(signature!==applyCommerce.signature){applyCommerce.signature=signature;Cloud.setCategories(data.categories);if(!['All','Best Sellers','Recommended',...data.categories].includes(activeCategory))activeCategory='All';renderCategories();renderMenuItems();}updateCartUI();}
function receiptTaxRows(o){if(!o.tax_enabled&&!(Number(o.tax_amount)>0))return '';const row=(l,v)=>`<div style="display:flex;justify-content:space-between;padding:4px 0"><span>${Cloud.esc(l)}</span><b>${Cloud.esc(RESTAURANT_CONFIG.currency)}${Number(v).toFixed(2)}</b></div>`;return row('Items subtotal',o.items_subtotal)+row(o.tax_mode==='percent'?'Tax ('+Number(o.tax_value)+'%)':'Tax (fixed)',o.tax_amount);}

function renderSystemFooter(settings){
 const footer=document.getElementById('systemFooter'),credit=document.getElementById('systemFooterCredit'),link=document.getElementById('systemFooterLink');
 let url=null;try{const raw=String(settings?.url||'');const parsed=new URL(raw);if(/^https?:\/\//i.test(raw)&&['http:','https:'].includes(parsed.protocol)&&!parsed.username&&!parsed.password&&!/[\s<>"\\]/.test(raw))url=parsed.href;}catch{}
 credit.hidden=settings?.show_credit!==true;
 link.hidden=!(settings?.show_link===true&&url);if(link.hidden)link.removeAttribute('href');else link.href=url;
 footer.hidden=credit.hidden&&link.hidden;
}

function syncCustomerLayerLock(){document.body.classList.toggle('customer-layer-open',!!document.querySelector('#cartDrawer.open,#trackingModal.open,#orderHistoryModal:not([hidden])'));}
new MutationObserver(syncCustomerLayerLock).observe(document.getElementById('cartDrawer'),{attributes:true,attributeFilter:['class']});
new MutationObserver(syncCustomerLayerLock).observe(document.getElementById('trackingModal'),{attributes:true,attributeFilter:['class']});
new MutationObserver(syncCustomerLayerLock).observe(document.getElementById('orderHistoryModal'),{attributes:true,attributeFilter:['hidden']});

document.addEventListener('keydown',e=>{
 if(document.getElementById('orderCelebration').open||!document.getElementById('orderHistoryModal').hidden)return;
 const root=document.querySelector('#cartDrawer.open')||document.querySelector('#trackingModal.open');if(!root)return;
 if(e.key==='Escape'){e.preventDefault();if(root.id==='cartDrawer')closeCartDrawer();else closeTrackingModal();return;}
 if(e.key==='Tab'){const controls=[...root.querySelectorAll('button:not([disabled]),input:not([type=hidden]),textarea,select,a[href]')].filter(x=>x.getClientRects().length);const first=controls[0],last=controls.at(-1);if(!first)return;if(!root.contains(document.activeElement)||e.shiftKey&&document.activeElement===first){e.preventDefault();(e.shiftKey?last:first).focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
});

// A renamed table keeps the same QR/session identity and updates its visible label.
document.addEventListener('restaurant-table-names',()=>{
 for(const id of ['tableText','cartTableLabel']){const node=document.getElementById(id);if(node)node.textContent=Cloud.tableName(currentTable);}
 const field=document.getElementById('custTableInput');if(field)field.value=Cloud.tableName(currentTable);
 renderOrderLists();if(activeOrder)renderTracking();
});
window.addEventListener('offline',()=>{message('Offline — the menu may be out of date. Reconnect before ordering.',true);$('btnPlaceOrder').disabled=true;});
window.addEventListener('online',()=>{updateCartUI();loadSharedMenu();pollActiveOrder();});

/* customer-waiter.js?v=yummy-50 */
;/* Retry-safe waiter calls, with a private random call receipt for status tracking. */
'use strict';
(()=>{
 let sending=false,checking=false,until=0,receipt=null,handledTimer=null;
 const el=id=>document.getElementById(id),storageKey=prefix=>prefix+currentTable;
 function note(text,error=false){for(const id of ['callWaiterStatus','waiterConfirmationText'])el(id).textContent=text;el('callWaiterStatus').dataset.error=String(error);el('waiterConfirmation').hidden=!text;el('waiterConfirmation').dataset.error=String(error);}
 function showStatus(){
  clearTimeout(handledTimer);if(!receipt)return;
  if(receipt.status==='Handled'){if(!receipt.handled_seen_at){receipt.handled_seen_at=Date.now();Cloud.write(storageKey('WAITER_CALL_RECEIPT_'),receipt);}const left=7000-(Date.now()-receipt.handled_seen_at);if(left<=0){note('');return;}handledTimer=setTimeout(()=>note(''),left);}
  if(Date.now()-Date.parse(receipt.created_at)>3600000){receipt=null;note('');return;}
  const label={Pending:receipt.on_the_way_at?'Waiter is coming ✓':'Call sent ✓ · Waiting for waiter confirmation',Handled:'Waiter call handled ✓',Expired:'Waiter request expired. Please call again if you still need help.'}[receipt.status]||'Waiter request saved';
  note(label+(receipt.status==='Pending'?' · '+Cloud.tableName(receipt.table_number):''));
 }
 document.addEventListener('restaurant-table-names',showStatus);
 function update(){
  if(document.hidden)return;
  const left=Math.max(0,Math.ceil((until-Date.now())/1000));
  el('callWaiterButton').disabled=sending||left>0||!TableAccess.canCall();
  const button=el('callWaiterButton');let label=button.querySelector('span');
  if(!button.querySelector('svg path')){button.innerHTML='<svg class="ui-icon waiter-bell" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5l-2 3Zm5 4h4M12 2v2"/></svg><span></span>';label=button.querySelector('span');}
  const text=sending?'Sending…':left?'Call sent · '+left+'s':'Call waiter';if(label.textContent!==text)label.textContent=text;
  button.dataset.pending=String(receipt?.status==='Pending');

 }
 async function checkStatus(){
  if(checking||sending||!receipt?.request_id||receipt.status!=='Pending'||document.hidden)return;
  checking=true;const request=receipt.request_id;
  try{
   const row=await Cloud.rpc('restaurant_waiter_call_status',{p_request_id:request});
   if(receipt?.request_id!==request)return;
   receipt={...row,request_id:request};Cloud.write(storageKey('WAITER_CALL_RECEIPT_'),receipt);showStatus();
  }catch(e){note('Call status could not update. '+e.message,true);}
  finally{checking=false;}
 }
 async function send(){
  if(sending||until>Date.now())return;sending=true;update();note('Sending your request…');
  try{
   if(typeof Cloud==='undefined')throw Error('Connection unavailable. Please ask a staff member.');
   let attempt=Cloud.read(storageKey('WAITER_CALL_ATTEMPT_'),null);
   if(!attempt){attempt=crypto.randomUUID();Cloud.write(storageKey('WAITER_CALL_ATTEMPT_'),attempt);}
   const access=await TableAccess.credentials(false);
   const result=await Cloud.rpc('restaurant_customer_call',{p_request_id:attempt,p_table:currentTable,...access});
   until=Date.now()+Math.max(0,new Date(result.next_allowed_at)-new Date(result.server_now));
   receipt={...result,request_id:attempt};
   Cloud.write(storageKey('WAITER_CALL_UNTIL_'),until);
   Cloud.write(storageKey('WAITER_CALL_RECEIPT_'),receipt);
   Cloud.write(storageKey('WAITER_CALL_ATTEMPT_'),null);showStatus();
  }catch(e){note('Could not send: '+e.message,true);}
  finally{sending=false;update();}
 }
 window.addEventListener('DOMContentLoaded',()=>{
  if(typeof Cloud!=='undefined'){
   until=Number(Cloud.read(storageKey('WAITER_CALL_UNTIL_'),0))||0;
   receipt=Cloud.read(storageKey('WAITER_CALL_RECEIPT_'),null);showStatus();checkStatus();
  }
  el('callWaiterButton').addEventListener('click',send);update();
  setInterval(update,1000);Cloud.schedule('customer-call',10000,checkStatus);
 });
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkStatus();});
})();
/* customer-requests56.js?v=yummy-56 */
;/* Release56: optional table-authenticated customer song requests. */
'use strict';
(()=>{
 const $=id=>document.getElementById(id);
 let config={song_requests_enabled:false},busy=false,attempt=null;
 const attemptKey=()=>`SONG_REQUEST_ATTEMPT56_${currentTable||'table'}`;
 function paint(){const b=$('requestSongButton');if(!b)return;b.hidden=config.song_requests_enabled!==true;b.disabled=busy||!TableAccess.canCall();}
 async function load(){try{config=await Cloud.rpc('restaurant_waiter_public56',{});paint();}catch{config={song_requests_enabled:false};paint();}}
 function open(){if(!config.song_requests_enabled)return;if(!TableAccess.canCall()){const s=$('songRequestStatus');if(s)s.textContent='Please scan your table QR again before sending a song request.';return;}$('songRequestStatus').textContent='';$('songRequestText').value='';$('songModal').showModal();$('songRequestText').focus();}
 function close(){if($('songModal').open)$('songModal').close();}
 async function send(event){event.preventDefault();if(busy)return;const text=$('songRequestText').value.trim(),status=$('songRequestStatus'),button=$('songRequestSend');if(!text){status.textContent='Enter a song name or artist.';return;}busy=true;button.disabled=true;paint();status.textContent='Sending song request…';
  try{
   attempt=attempt||Cloud.read(attemptKey(),null)||crypto.randomUUID();Cloud.write(attemptKey(),attempt);
   const access=await TableAccess.credentials(false);
   const result=await Cloud.rpc('restaurant_customer_song_request',{p_request_id:attempt,p_table:currentTable,p_song:text,...access});
   Cloud.remove(attemptKey());attempt=null;status.textContent=result.already_pending?'This song request is already pending.':'Song request sent ✓ · Staff can see it in Requests.';
   setTimeout(()=>{if($('songModal').open)close();},1300);
  }catch(error){status.textContent='Could not send song request: '+error.message;}
  finally{busy=false;button.disabled=false;paint();}
 }
 window.addEventListener('DOMContentLoaded',()=>{$('requestSongButton')?.addEventListener('click',open);$('songRequestForm')?.addEventListener('submit',send);$('songRequestClose')?.addEventListener('click',close);$('songRequestCancel')?.addEventListener('click',close);load();paint();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
 Cloud.schedule('customer-features56',30000,load);
 window.CustomerRequests56={reload:load};
})();

/* custom48.js?v=66 */
;/* Shared customization. Text stays plain text; private data never enters public caches. */
(() => {
'use strict';
const $=id=>document.getElementById(id),e=v=>Cloud.esc(String(v??''));
const staffPage=document.body.classList.contains('staff-site');
const sections=['live','billing','history','dashboard','requests','tables','menu','stocks','devices','notifications'];
let settings={name:Cloud.cfg.restaurantName||'Yummy Momo',tagline:'Yummy in your tummy',photoMode:'category',menuLayout:'category-list',showCategoryLinks:true,showCategoryImages:true,categoryOptions:{},categoryPhotos:{},categoryImageTransforms:{},categoryLabels:{},texts:{},hiddenSections:[],locked:false,orderRecordPaymentEdit:true,orderRecordPaymentEditMinutes:120,bill:{}},revision=null,busy=null,editing=false,draft=null,manifestURL=null,observer;
const originals=new WeakMap(),attrOriginals=new WeakMap(),brandOriginals=new WeakMap(),iconOriginals=new WeakMap(),catalog=new Set();
const isAdmin=()=>staffPage&&typeof staffRole!=='undefined'&&staffRole==='admin';
function availability(ready,message=''){for(const id of ['c48Save','bill49Save'])if($(id))$(id).disabled=!ready;for(const button of document.querySelectorAll('.custom49-section-save'))button.disabled=!ready;const warning=$('custom49SetupWarning');if(warning){warning.hidden=ready;warning.textContent=message;}}
const menuFields51=[
 ['heroKicker','Hero badge','.experience-kicker','THE GOOD FOOD CLUB'],['heroEyebrow','Hero small heading','.hero-eyebrow','A LITTLE STEAM. A LOT OF LOVE.'],['heroHeading','Main hero heading','#restaurantTagline','Made for your cravings.'],['heroDescription','Hero description','.hero-description','Big cravings. Little pockets of happiness. Pick your favourites, we’ll bring them to your table.'],['menuHeading','Menu heading','#menuListTitle','Our menu'],['menuSubtitle','Menu subtitle','.menu-list-heading p','Find your next favourite.'],['categoryHeading','Categories heading','#browseTitle','Categories'],['searchPlaceholder','Search placeholder','#searchInput','Search dishes, drinks, desserts...'],['callWaiter','Call waiter button','#callWaiterButton span','Call waiter'],['orderStatus','Order status button','.header-cart span','Order status']
];
function setMenuText51(node,value){if(!node)return;const textNodes=[...node.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE&&n.nodeValue.trim());if(textNodes.length){const [first,...rest]=textNodes;if(first.nodeValue!==value)first.nodeValue=value;for(const n of rest)if(n.nodeValue!=='')n.nodeValue='';}else if(node.textContent!==value)node.textContent=value;}
function applyMenu51(){
 if(!staffPage){const content=settings.menuContent51||{};for(const [key,,selector]of menuFields51)if(Object.hasOwn(content,key)){const node=document.querySelector(selector);if(key==='searchPlaceholder'){if(node&&node.placeholder!==content[key])node.placeholder=content[key];}else setMenuText51(node,String(content[key]));}
 const hero=document.querySelector('.menu-hero'),photo=document.querySelector('.hero-photo'),image=photo?.querySelector('img'),config=settings.menuImages51?.hero||{};
 if(hero){const hide=content.showHero===false;hero.dataset.heroHidden51=String(hide);hero.dataset.imageHidden51=String(config.visible===false);}
 if(photo)photo.hidden=config.visible===false;
 if(image){const hidden=content.showHero===false||config.visible===false,target=hidden?'momo-hero46.svg':Cloud.safeImage(config.url)||'momo-hero46.svg';if(image.getAttribute('src')!==target)image.src=target;if(Object.hasOwn(content,'heroImageAlt'))image.alt=content.heroImageAlt;}
 }
 const can=canRenameTables();for(const fieldset of document.querySelectorAll('[data-table-rename51]'))fieldset.disabled=!can;for(const hint of document.querySelectorAll('[data-table-rename-hint51]'))hint.hidden=can;
}
function canRenameTables(){return staffPage&&typeof staffRole!=='undefined'&&(staffRole==='admin'||staffRole==='manager'&&settings.managerCanRenameTables!==false);}
function fillMenu51(){
 draft.menuContent51||={};draft.menuImages51||={};draft.menuImages51.hero||={};const content=draft.menuContent51;
 $('menu51TextFields').innerHTML=menuFields51.map(([key,label,,fallback])=>`<label>${e(label)}<textarea data-menu-text51="${key}" maxlength="2000" rows="2">${e(content[key]??fallback)}</textarea></label>`).join('');
 $('menu51HeroVisible').checked=content.showHero!==false;$('menu51HeroImageVisible').checked=draft.menuImages51.hero.visible!==false;$('menu51HeroAlt').value=content.heroImageAlt??'An illustration of freshly steamed momos';previewMenuImage51();
 $('managerRenameToggle51').textContent=draft.managerCanRenameTables===false?'Allow managers to rename tables':'Revoke manager table renaming';$('managerRenameToggle51').disabled=!draft.tableRenameGuard51;$('managerRenameStatus51').textContent=draft.tableRenameGuard51?(draft.managerCanRenameTables===false?'Managers cannot rename tables. Admins retain access.':'Managers can currently rename tables.'):'Run SUPABASE/YUMMY-MOMO-51-MENU-MANAGEMENT.sql to enable this server permission control.';
}
function previewMenuImage51(){const image=$('menu51HeroPreview');image.src=Cloud.safeImage(draft.menuImages51.hero.url)||'momo-hero46.svg';}
async function loadMenuDishes51(){if(!isAdmin()||!$('menu51Dishes'))return;const root=$('menu51Dishes');try{menuItems=await Cloud.menu(true);root.dataset.loaded='true';root.replaceChildren();for(const item of menuItems){const article=document.createElement('article');article.className='menu51-dish-photo';article.innerHTML=`<h4>${e(item.name)}</h4><p>${e(item.category)}</p><button type="button" class="secondary-btn" data-edit-dish51>Edit dish text, prices & portion names</button><label>Replace individual dish photo<input type="file" accept="image/png,image/jpeg,image/webp"></label><button type="button" class="secondary-btn" data-remove-photo51>Remove dish photo</button><p class="menu51-status" role="status"></p>`;
 article.querySelector('[data-edit-dish51]').onclick=()=>openMenuPricing(item.id);const message=article.querySelector('[role=status]');const upload=article.querySelector('input');upload.onchange=async()=>{upload.disabled=true;try{const url=await compressedUpload(upload.files[0],560,false,null,22000);await Cloud.patchMenu(item.id,{image:url,updated_at:new Date().toISOString()});message.textContent='Dish photo saved. It appears when individual dish-photo mode is enabled.';}catch(error){message.textContent=error.message;}finally{upload.value='';upload.disabled=false;}};article.querySelector('[data-remove-photo51]').onclick=async event=>{event.target.disabled=true;try{await Cloud.patchMenu(item.id,{image:'',updated_at:new Date().toISOString()});message.textContent='Dish photo removed.';}catch(error){message.textContent=error.message;}finally{event.target.disabled=false;}};root.append(article);}if(!menuItems.length)root.textContent='No dishes yet. Add dishes in Menu first.';}catch(error){root.textContent='Menu controls could not load: '+error.message;}}

function status(message){if($('custom48Status'))$('custom48Status').textContent=message;}
function textSource(text){return text.trim();}
function applyText(root=document.body){
 if(!root)return;
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
 while((node=walker.nextNode())){
  const parent=node.parentElement;if(!parent||parent.closest('script,style,textarea,input,#custom48Panel,[data-custom48-ignore]'))continue;
  const current=node.nodeValue,prev=originals.get(node);const source=prev&&current===prev.result?prev.source:current;
  const key=textSource(source);if(!key||key.length>500||/^[-+₹\d\s.,:%/×]+$/.test(key))continue;
  catalog.add(key);const value=settings.texts[key]??settings.categoryLabels[key]??(key==='Yummy Momo'?settings.name:key==='Yummy in your tummy'?settings.tagline:null);
  const result=value==null?source:source.replace(key,String(value));originals.set(node,{source,result});if(current!==result)node.nodeValue=result;
 }
 for(const el of root.querySelectorAll?.('[placeholder],[title],[aria-label]')||[]){
  if(el.closest('#custom48Panel'))continue;let map=attrOriginals.get(el)||{};
  for(const attr of ['placeholder','title','aria-label']){if(!el.hasAttribute(attr))continue;const current=el.getAttribute(attr),prev=map[attr],source=prev&&current===prev.result?prev.source:current;if(!source)continue;catalog.add(source);const result=settings.texts[source]??source;map[attr]={source,result};if(current!==result)el.setAttribute(attr,result);}attrOriginals.set(el,map);
 }
}
function sectionHidden(tab){return staffPage&&!isAdmin()&&settings.hiddenSections.includes(tab);}
function apply(){
 Cloud.cfg.restaurantName=settings.name;Cloud.cfg.tagline=settings.tagline;
 if($('restaurantName'))$('restaurantName').textContent=settings.name;
 for(const el of document.querySelectorAll('.staff-brand strong'))el.textContent=settings.name;
 for(const el of document.querySelectorAll('img')){if(!el.matches('.brand-logo,.restaurant-logo,.hero-logo,[data-brand48]')&&!/yummy-momo-logo/.test(el.getAttribute('src')||''))continue;
  if(!brandOriginals.has(el))brandOriginals.set(el,{src:el.getAttribute('src'),alt:el.alt});el.dataset.brand48='';const original=brandOriginals.get(el),target=Cloud.safeImage(settings.logo)||original.src;if(el.getAttribute('src')!==target)el.src=target;el.alt=settings.logo?settings.name+' logo':original.alt;
 }
 if($('managerNav'))$('managerNav').dataset.brand48=settings.name;
 if(!location.pathname.endsWith('waiter.html'))document.title=settings.name+(staffPage?' · Kitchen & Admin':' · Menu');
 for(const tab of sections){const el=$('tab'+tab[0].toUpperCase()+tab.slice(1)+'Btn');if(!el)continue;const hidden=sectionHidden(tab);el.classList.toggle('admin-hidden-tab',hidden);if(hidden){el.dataset.custom48Hidden='1';el.title='This tab is hidden by the administrator.';}else if(el.dataset.custom48Hidden){delete el.dataset.custom48Hidden;el.removeAttribute('title');}}
 if(staffPage&&typeof currentTab!=='undefined'&&sectionHidden(currentTab))switchTab(currentTab);
 const blocked=settings.locked&&!isAdmin();let overlay=$('custom48Lock');
 if(blocked&&!overlay){overlay=document.createElement('section');overlay.id='custom48Lock';overlay.setAttribute('role','alert');overlay.setAttribute('data-custom48-ignore','');document.body.append(overlay);}
 if(overlay){overlay.hidden=!blocked;overlay.replaceChildren();const title=document.createElement('h1');title.textContent=settings.name;const msg=document.createElement('p');msg.textContent=settings.lockMessage||'System paused by administrator.';overlay.append(title,msg);if(staffPage){const link=document.createElement('a');link.href='kitchen.html';link.textContent='Administrator sign in';link.onclick=()=>{overlay.hidden=true;document.querySelector('#staffMain')?.setAttribute('hidden','');document.querySelector('#loginPanel')?.removeAttribute('hidden');};overlay.append(link);}}
 document.documentElement.dataset.photoMode=settings.photoMode;window.ThemeEngine?.fromSettings(settings);if(staffPage&&isAdmin())window.ThemeEngine?.renderStudio();
 applyText();applyMenu51();updateManifest();
}
async function sync(force=false){
 if(busy)return busy.then(value=>{applyMenu51();return value;});
 busy=(async()=>{try{const data=await Cloud.rpc('restaurant_custom48',{p_known:force?null:revision,p_settings:null,p_expected:null},Cloud.hasSession());if(!data.revision||(!revision&&!data.settings))throw Error('Customization database setup is missing. Run SUPABASE/SAFE-CUSTOMIZATION-SETUP.sql in the Supabase project used by config.js, then Reload settings.');if(data.settings){const prev=settings;settings={...settings,...data.settings};revision=data.revision;availability(true);apply();if(JSON.stringify([prev.photoMode,prev.categoryPhotos,prev.categoryImageTransforms,prev.categoryLabels,prev.menuLayout,prev.showCategoryLinks,prev.showCategoryImages,prev.categoryOptions])!==JSON.stringify([settings.photoMode,settings.categoryPhotos,settings.categoryImageTransforms,settings.categoryLabels,settings.menuLayout,settings.showCategoryLinks,settings.showCategoryImages,settings.categoryOptions])){if(typeof renderCategories==='function')renderCategories();if(typeof renderMenuItems==='function')renderMenuItems();if(typeof renderAdminMenu==='function'&&typeof loggedIn!=='undefined'&&loggedIn)renderAdminMenu();}}else if(data.revision)revision=data.revision;applyMenu51();return settings;}catch(error){if(/restaurant_custom48|schema cache|PGRST202/.test(error.message))error=Error('Database customization setup is missing. Run SUPABASE/SAFE-CUSTOMIZATION-SETUP.sql in the Supabase project used by config.js, then Reload settings.');availability(false,'Settings are not connected. '+error.message);status('Customization could not load: '+error.message);throw error;}finally{busy=null;}})();return busy;
}
function updateManifest(){
 const link=document.querySelector('link[rel="manifest"]');if(!link||!navigator.serviceWorker?.controller)return;
 // The worker serves an app-scoped manifest at a stable URL. Installed OS icons
 // refresh on browser schedule; a reinstall may be needed on some devices.
 navigator.serviceWorker.controller.postMessage({type:'custom48-brand',name:settings.name,icon:Cloud.safeImage(settings.pwaIcon||settings.logo||'')});
 const desired=new URL(staffPage?'custom-kitchen48.webmanifest':location.pathname.endsWith('waiter.html')?'custom-waiter48.webmanifest':'custom-menu48.webmanifest',location.href).href;
 if(link.href!==desired)link.href=desired;
 for(const icon of document.querySelectorAll('link[rel="icon"],link[rel="apple-touch-icon"]')){if(!iconOriginals.has(icon))iconOriginals.set(icon,icon.href);icon.href=Cloud.safeImage(settings.pwaIcon||settings.logo)||iconOriginals.get(icon);}
}
function categoryTransform48(category,source=settings){const raw=source?.categoryImageTransforms?.[category]||{},zoom=Number(raw.zoom),x=Number(raw.x),y=Number(raw.y);return {zoom:Number.isFinite(zoom)?Math.max(1,Math.min(2.5,zoom)):1,x:Number.isFinite(x)?Math.max(0,Math.min(100,x)):50,y:Number.isFinite(y)?Math.max(0,Math.min(100,y)):50};}
function categoryImageStyle48(category,source=settings){const t=categoryTransform48(category,source);return `object-position:${t.x}% ${t.y}%;transform:scale(${t.zoom});transform-origin:${t.x}% ${t.y}%`; }
function renderCategoryPhotos(items){
 const container=$('menuContainer');if(!container)return;
 for(const old of container.querySelectorAll('.category-photo48'))old.remove();
 const seen=new Set();let bannerCount=0;for(const item of items){if(seen.has(item.category))continue;seen.add(item.category);if(bannerCount>=20)continue;const url=settings.showCategoryImages!==false&&settings.categoryOptions?.[item.category]?.showImage!==false?Cloud.safeImage(settings.categoryPhotos[item.category]):'';if(!url)continue;bannerCount++;const first=[...container.querySelectorAll('[data-menu-id]')].find(el=>el.dataset.menuId===String(item.id));if(!first)continue;
 const box=document.createElement('figure');box.className='category-photo48';const img=document.createElement('img');img.dataset.lowSrc=url;img.alt=settings.categoryLabels[item.category]||item.category;img.loading='lazy';img.decoding='async';img.fetchPriority='low';img.style.cssText=categoryImageStyle48(item.category,settings);const caption=document.createElement('figcaption');caption.textContent=img.alt;box.append(img,caption);first.before(box);Cloud.deferImages?.(box);}
}
async function compressedUpload(file,size=1100,square=false,aspect=null,targetBytes=60000){
 if(!file||!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>12000000)throw Error('Choose a JPG, PNG or WebP under 12 MB.');
 const bitmap=await createImageBitmap(file),sourceAspect=bitmap.width/bitmap.height;let edge=Math.min(size,Math.max(bitmap.width,bitmap.height)),data='';
 const bytesOf=value=>Math.ceil((value.split(',')[1]?.length||0)*3/4);
 try{
  for(let pass=0;pass<5&&!data;pass++){
   const canvas=document.createElement('canvas');
   if(aspect){canvas.width=Math.max(480,Math.round(edge));canvas.height=Math.max(90,Math.round(canvas.width/aspect));}
   else if(square){canvas.width=canvas.height=Math.max(256,Math.round(edge));}
   else{const ratio=Math.min(1,edge/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));}
   const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
   if(aspect){const cropWidth=Math.min(bitmap.width,bitmap.height*aspect),cropHeight=cropWidth/aspect;ctx.drawImage(bitmap,(bitmap.width-cropWidth)/2,(bitmap.height-cropHeight)/2,cropWidth,cropHeight,0,0,canvas.width,canvas.height);}
   else if(square){const crop=Math.min(bitmap.width,bitmap.height);ctx.drawImage(bitmap,(bitmap.width-crop)/2,(bitmap.height-crop)/2,crop,crop,0,0,canvas.width,canvas.height);}
   else ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
   for(const quality of [.72,.62,.52,.42,.34,.28]){const candidate=canvas.toDataURL('image/webp',quality);if(bytesOf(candidate)<=targetBytes){data=candidate;break;}}
   edge*=.82;
  }
 }finally{bitmap.close();}
 if(!data)throw Error('This photo is too detailed to fit the low-egress image budget. Choose a simpler or smaller image.');
 return Cloud.uploadMenuImage(data);
}
function buildPanel(){
 if($('custom48Panel')||!$('managementSection'))return;
 const panel=document.createElement('section');panel.id='custom48Panel';panel.className='panel custom48';panel.innerHTML=`<div class="custom48-heading"><div><span class="custom48-eyebrow">Your restaurant, your way</span><h2>Customize your workspace</h2><p>One shared setup for the customer menu, kitchen and bills.</p></div><button type="button" class="secondary-btn" id="custom48Reload">Reload settings</button></div>
 <div id="custom49SetupWarning" class="custom49-warning" role="alert" hidden></div><nav class="custom49-shortcuts" id="custom49Shortcuts" aria-label="Customization sections"></nav><form id="custom48Form"><details open><summary>Brand & app identity</summary><div class="custom48-grid"><label>Restaurant / organisation name<input id="c48Name" maxlength="120" required></label><label>Tagline<input id="c48Tagline" maxlength="200"></label><label>Logo<input id="c48Logo" type="file" accept="image/png,image/jpeg,image/webp"><small>Compressed once; shared across menu, kitchen and bills.</small></label><label>PWA app icon<input id="c48Icon" type="file" accept="image/png,image/jpeg,image/webp"><small>Use a square icon. Installed devices may need a reinstall to show it.</small></label></div><div id="c48BrandPreviews"></div><button type="button" id="c48ClearLogo" class="secondary-btn">Use original logo</button><button type="button" id="c48ClearIcon" class="secondary-btn">Use logo as app icon</button></details>
 <details><summary>Menu layout, categories & banners</summary><div class="custom48-grid"><label>Menu layout<select id="c49MenuLayout"><option value="category-list">Category banners with simple dish rows</option><option value="cards">Individual dish cards</option></select></label></div><div class="custom48-checks"><label><input id="c49CategoryLinks" type="checkbox">Show quick category jump links</label><label><input id="c49CategoryImages" type="checkbox">Show optional category banners</label></div><label>Dish &amp; category photos<span class="hint-inline">Individual dish photos (set per dish in Menu → Edit details → Change photo) and category banners now display together — each is independent and optional.</span></label><p class="hint">Each category can have one 16:3 banner showing all its dishes, controlled by "Show optional category banners" above. Each dish can separately have its own photo. Uploads are aggressively compressed for low egress, and both banners and dish photos are fetched only when the customer scrolls near them. Leave a category banner empty or turn the checkbox off for a text-only category — dish photos for that category still show. All photos are stored in Cloudflare R2, not Supabase.</p><div id="c48Categories"></div></details>
 <details><summary>Menu words & pictures</summary><h3 class="menu51-subtitle">Menu headline and labels</h3><div id="menu51TextFields" class="menu51-fields"></div><div class="custom48-checks"><label><input id="menu51HeroVisible" type="checkbox">Show the hero section</label><label><input id="menu51HeroImageVisible" type="checkbox">Show the hero picture</label></div><h3 class="menu51-subtitle">Every menu picture</h3><div class="menu51-pictures"><article class="menu51-picture"><h4>Hero picture</h4><img id="menu51HeroPreview" class="menu51-hero-preview" alt="Current hero picture"><label>Replace hero picture<input id="menu51HeroUpload" type="file" accept="image/png,image/jpeg,image/webp"></label><label>Image description (accessibility)<input id="menu51HeroAlt" maxlength="500"></label><button id="menu51HeroReset" class="secondary-btn" type="button">Use original illustration</button></article><article class="menu51-picture"><h4>Other pictures</h4><p>Change the restaurant logo in Brand & app identity. Every category has its own picture controls in Menu layout, categories & banners.</p><button id="menu51BrandLink" class="secondary-btn" type="button">Restaurant logo</button><button id="menu51CategoriesLink" class="secondary-btn" type="button">Category banners</button></article></div><h3 class="menu51-subtitle">Dish text and pictures</h3><p>Load the shared menu to edit each dish name, description, price, portion name and optional individual photo. Individual photos appear only in dish-photo mode.</p><button id="menu51LoadDishes" type="button" class="secondary-btn">Load dish controls</button><div id="menu51Dishes"></div><h3 class="menu51-subtitle">All remaining menu & kitchen wording</h3><p>Change visible wording without changing order status values or calculations. Search the text list, or enter an exact existing phrase. Open a kitchen section to discover its dynamic labels.</p><label>Find text<input id="c48TextSearch" type="search" placeholder="Search buttons, headings and hints"></label><div id="c48TextRows" class="custom48-text-rows"></div><div class="custom48-grid"><label>Exact original phrase<input id="c48TextSource" maxlength="500"></label><label>Your replacement<input id="c48TextValue" maxlength="2000"></label></div><button id="c48TextAdd" type="button" class="secondary-btn">Add text replacement</button><p class="hint">Clear a replacement to restore original wording. Dish names and descriptions use Menu → Edit details.</p></details>
 <details><summary>Bill design & printed content</summary><p>These settings are saved for actual order bills and counter bills. Preview is only a way to check your changes before saving.</p><h3 class="bill49-template-title">Template</h3><div class="bill49-templates" role="radiogroup" aria-label="Bill template"><label><input type="radio" name="bill49Template" value="classic"><span class="receipt-thumb classic"></span><b>Classic</b><small>Dashed lines, like a shop receipt</small></label><label><input type="radio" name="bill49Template" value="modern"><span class="receipt-thumb modern"></span><b>Modern</b><small>Bold coloured header</small></label><label><input type="radio" name="bill49Template" value="minimal"><span class="receipt-thumb minimal"></span><b>Minimal</b><small>Clean, lots of space</small></label><label><input type="radio" name="bill49Template" value="grid"><span class="receipt-thumb grid"></span><b>Grid</b><small>Bordered table</small></label><label><input type="radio" name="bill49Template" value="executive"><span class="receipt-thumb executive"></span><b>Executive</b><small>Formal, with double rules</small></label></div><div class="bill49-controls"><div class="custom48-grid"><label>Bill restaurant / organisation name<input id="bill49Name" maxlength="120" placeholder="Use shared restaurant name"></label><label>Bill tagline<input id="bill49Tagline" maxlength="200" placeholder="Use shared tagline"></label><label>Bill-only logo<input id="bill49Logo" type="file" accept="image/png,image/jpeg,image/webp"></label><label>Paper width<select id="bill49Width"><option value="80">80 mm</option><option value="58">58 mm</option></select></label><label>Text size (px)<input id="bill49FontSize" type="number" min="8" max="18" step="1"></label><label>Logo size (px)<input id="bill49LogoSize" type="number" min="40" max="150" step="1"></label><label>Header alignment<select id="bill49Align"><option value="center">Centre</option><option value="left">Left</option><option value="right">Right</option></select></label><label>Typeface<select id="bill49Font"><option value="mono">Receipt monospace</option><option value="sans">Clean sans serif</option></select></label><label>Extra header text<textarea id="bill49Header" maxlength="500" rows="2"></textarea></label><label>Address<textarea id="bill49Address" maxlength="500" rows="2"></textarea></label><label>Contact text<input id="bill49Contact" maxlength="300"></label></div><div id="bill49LogoPreview" class="bill49-logo-preview"></div><button id="bill49SharedLogo" class="secondary-btn" type="button">Use shared restaurant logo</button></div><div id="c48BillFlags" class="custom48-checks"></div><div class="record-payment-option59"><label><input id="c59RecordPaymentEdit" type="checkbox"> Allow one-time Cash / Online selection for QR-scanned orders in Order Records</label><div class="timeout-row61"><label for="c61RecordPaymentMinutes">QR payment edit timeout (minutes)</label><input id="c61RecordPaymentMinutes" type="number" min="5" max="1440" step="1" inputmode="numeric"></div><p class="hint">Default 120 minutes. Manual Billing orders always stay read-only. After a QR order is set once, or the timeout expires, only the saved payment text remains.</p></div><div id="c48BillTexts" class="custom48-grid"></div><div class="bill49-buttons"><button type="button" id="bill49Save" class="primary-btn">Save bill design for all bills</button><button type="button" id="c48BillPreview" class="secondary-btn">Preview current edits</button></div><p id="bill49Status" role="status">Save to apply your design to actual printed bills.</p></details>
 <details><summary>Kitchen sections</summary><p>Toggle sections for managers. Administrators keep access to every section.</p><p class="hint">Hidden tabs stay visible in the sidebar for managers, but opening them shows only a “hidden by the administrator” notice. No controls or section data are shown.</p><div id="c48Sections" class="custom48-checks"></div></details>
 <details><summary>Menu backup & local file preview</summary><p>Download the menu already loaded in this browser. Upload previews a downloaded file on this device without contacting Supabase. Photos are excluded from backup files. Category-photo links and names are included.</p><button type="button" id="c48Export" class="secondary-btn">Download menu JSON</button><label>Upload downloaded menu<input type="file" id="c48Import" accept="application/json,.json"></label><p id="c48ImportPreview"></p><div id="c48LocalPreview"></div><p class="hint">Download uses the menu snapshot already loaded in Menu. Shared database restore is disabled because you requested no added egress for this feature. If no snapshot is loaded, open Menu first.</p></details>
 <details><summary>Usage & record cleanup</summary><p>Egress is downloaded data. Deleting records cannot undo it. Cleanup keeps private analytics snapshots, removes only the oldest completed/cancelled/rejected records older than 30 days, and never removes active orders.</p><p>Automatic provider metering is not connected. Enter usage verified in the Supabase dashboard; values here are not a live meter. At 4 GB or more, each checkpoint archives up to 500 eligible records.</p><div class="custom48-grid"><label>Verified usage in GB<input id="c48Usage" type="number" min="0" step="0.001"></label><label>Billing period starts<input id="c48UsageStart" type="date"></label><label>Billing period ends (exclusive)<input id="c48UsageEnd" type="date"></label></div><button id="c48Checkpoint" type="button" class="secondary-btn">Record verified usage & run eligible cleanup</button><p id="c48UsageStatus" role="status"></p></details>
 <details><summary>System access</summary><h3>Manager table permissions</h3><p>Revoke or restore manager access to renaming tables. Admins always retain access. Table availability controls are separate.</p><button id="managerRenameToggle51" class="secondary-btn" type="button" disabled>Revoke manager table renaming</button><p id="managerRenameStatus51" role="status"></p><h3>System lock</h3><p>Pause the customer menu, waiter and manager operations. Administrators retain access to unlock. Active order data stays saved.</p><label>Message while locked<input id="c48LockMessage" maxlength="300"></label><button id="c48Lock" type="button" class="danger-btn">Lock system now</button></details>
 <div class="custom48-save"><button id="c48Save" class="primary-btn" type="submit">Save customization</button><p id="custom48Status" role="status" aria-live="polite"></p></div></form>`;
 const upi=document.createElement('section');upi.className='bill49-upi';upi.innerHTML='<h3>Payment QR on bill</h3><p>Generate a scan-to-pay QR from your UPI ID. The bill amount is filled automatically.</p><div class="custom48-grid"><label>UPI ID<input id="bill49UpiId" maxlength="120" placeholder="name@bank"></label><label>Name shown in UPI app<input id="bill49UpiName" maxlength="120" placeholder="Restaurant name"></label><label>Position<select id="bill49UpiPosition"><option value="top">Top of bill</option><option value="bottom">Bottom of bill</option></select></label><label>Size<select id="bill49UpiSize"><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></label><label>Text under QR<input id="bill49UpiText" maxlength="100" placeholder="Scan to pay"></label></div><label class="bill49-upi-only"><input id="bill49UpiOnly" type="checkbox"> Only on UPI / online bills</label>';panel.querySelector('.bill49-controls').before(upi);
 const extras=document.createElement('section');extras.className='bill49-extras';extras.innerHTML='<h3>Bill extras</h3><p>Optional information printed below the total.</p><label class="bill49-extra-toggle"><span><b>Bank details on bill</b><small>For customers who pay by bank transfer.</small></span><input id="bill49BankEnabled" type="checkbox" role="switch"></label><label class="bill49-extra-field">Bank details<textarea id="bill49BankDetails" rows="3" maxlength="600" placeholder="Bank name, account number and IFSC"></textarea></label><label class="bill49-extra-toggle"><span><b>Signature</b><small>Printed as “Authorised signatory”.</small></span><input id="bill49SignatureEnabled" type="checkbox" role="switch"></label><label class="bill49-extra-field">Signature image<input id="bill49Signature" type="file" accept="image/png,image/jpeg,image/webp"><small>Use a white or transparent background.</small></label><div id="bill49SignaturePreview" class="bill49-signature-preview"></div><button id="bill49SignatureRemove" class="secondary-btn" type="button">Remove signature</button>';upi.after(extras);
 const management=$('managementSection');for(const child of [...management.children]){if(!child.classList.contains('panel'))continue;const heading=child.querySelector('h3');if(!heading)continue;const group=document.createElement('details');group.className='management48-group';const summary=document.createElement('summary');summary.textContent=heading.textContent;child.before(group);group.append(summary,child);}management.prepend(panel);
 $('custom48Form').onsubmit=event=>{event.preventDefault();void save().catch(err=>status(err.message));};
 $('custom48Reload').onclick=()=>open(true).catch(err=>status(err.message));
 $('c48TextSearch').oninput=renderTexts;
 $('menu51HeroUpload').onchange=async event=>{try{status('Compressing hero picture…');draft.menuImages51.hero.url=await compressedUpload(event.target.files[0],800,false,null,26000);previewMenuImage51();status('Hero picture ready. Save settings to publish.');}catch(error){status(error.message);}event.target.value='';};$('menu51HeroReset').onclick=()=>{delete draft.menuImages51.hero.url;previewMenuImage51();};
 for(const [id,index]of [['menu51BrandLink',0],['menu51CategoriesLink',1]])$(id).onclick=()=>{const group=$('custom49Group'+index);group.open=true;group.scrollIntoView({behavior:'smooth'});};$('menu51LoadDishes').onclick=loadMenuDishes51;
 $('managerRenameToggle51').onclick=async()=>{if(!settings.tableRenameGuard51){status('Run the Release51 SQL upgrade before changing this permission.');return;}try{collect();draft.managerCanRenameTables=settings.managerCanRenameTables===false;await persist(draft);fillMenu51();status('Manager table-name permission saved on the server.');}catch(error){status(error.message);}};

 $('c48TextAdd').onclick=()=>{const source=$('c48TextSource').value.trim();if(source){const value=$('c48TextValue').value;if(value)draft.texts[source]=value;else delete draft.texts[source];catalog.add(source);renderTexts();}};
 $('c48ClearLogo').onclick=()=>{draft.logo='';previewBrand();};$('c48ClearIcon').onclick=()=>{draft.pwaIcon='';previewBrand();};
 for(const [id,key,size] of [['c48Logo','logo',512],['c48Icon','pwaIcon',512]])$(id).onchange=async()=>{try{status('Compressing and uploading image…');draft[key]=await compressedUpload($(id).files[0],size,key==='pwaIcon',null,18000);previewBrand();status('Image ready. Save customization to publish.');}catch(err){status(err.message);}finally{$(id).value='';}};
 $('c48BillPreview').onclick=()=>{collect();const dialog=$('bill49PreviewDialog'),sample=$('c48BillSample'),previewOrder={order_id:'PREVIEW',daily_number:1,created_at:new Date().toISOString(),table_number:'Preview',items:[{name:'Sample dish',qty:1,price:100,subtotal:100}],total:105,items_subtotal:100,tax_amount:5,tax_enabled:true,tax_mode:'percent',tax_value:5,payment_method:'UPI'};sample.innerHTML=YummyReceipt.html(previewOrder,draft);sample.dataset.receiptTotal=String(previewOrder.total);sample.dataset.paymentMethod=previewOrder.payment_method;void YummyReceipt.ready(sample,draft);dialog.showModal();};
 const preview=document.createElement('dialog');preview.id='bill49PreviewDialog';preview.className='bill49-preview-dialog';preview.innerHTML='<div class="page-tools"><h3>Bill design preview</h3><button type="button" class="secondary-btn" id="bill49Close">Close</button></div><div id="c48BillSample"></div>';document.body.append(preview);$('bill49Close').onclick=()=>preview.close();
 $('bill49Save').onclick=async()=>{try{await save();$('bill49Status').textContent='Saved. New previews and printed bills use this design.';}catch(error){$('bill49Status').textContent='Not saved: '+error.message;status(error.message);}};
 $('bill49Logo').onchange=async event=>{try{status('Compressing bill logo…');draft.bill.logo=await compressedUpload(event.target.files[0],512,false,null,18000);previewBillLogo();status('Bill logo ready. Save bill design to publish.');}catch(error){status(error.message);}event.target.value='';};$('bill49SharedLogo').onclick=()=>{delete draft.bill.logo;previewBillLogo();};
 $('bill49Signature').onchange=async event=>{try{status('Compressing signature…');draft.bill.signature=await compressedUpload(event.target.files[0],600,false,null,18000);previewBillSignature();status('Signature ready. Save bill design to publish.');}catch(error){status(error.message);}event.target.value='';};$('bill49SignatureRemove').onclick=()=>{delete draft.bill.signature;previewBillSignature();};
 const details=[...panel.querySelectorAll('details')];const selectSettingsTab=(detail,button,move=true)=>{for(const item of details)item.open=item===detail;for(const tab of $('custom49Shortcuts').children){const active=tab===button;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;}if(move)detail.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});};
 for(const [i,detail]of details.entries()){detail.id='custom49Group'+i;const button=document.createElement('button');button.type='button';button.role='tab';button.setAttribute('aria-controls',detail.id);button.textContent=detail.querySelector('summary').textContent;button.onclick=()=>selectSettingsTab(detail,button);button.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const tabs=[...$('custom49Shortcuts').children],at=tabs.indexOf(button),next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(at+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[next].focus();tabs[next].click();};$('custom49Shortcuts').append(button);detail.addEventListener('toggle',()=>{if(detail.open)selectSettingsTab(detail,button,false);});if(i!==3){const saveButton=document.createElement('button');saveButton.type='button';saveButton.className='primary-btn custom49-section-save';saveButton.textContent='Save settings';saveButton.onclick=()=>save().catch(error=>status(error.message));detail.append(saveButton);}if(i===0)selectSettingsTab(detail,button,false);}
 $('c48Export').onclick=exportMenu;$('c48Import').onchange=previewImport;
 $('c48Lock').onclick=async()=>{try{collect();const next=!settings.locked;draft.locked=next;await persist(draft);fill();status(next?'System locked. Admin access remains available.':'System unlocked.');}catch(err){status(err.message);}};
 $('c48Checkpoint').onclick=checkpoint;
}
function previewBillLogo(){const root=$('bill49LogoPreview');root.replaceChildren();if(draft.bill.logo){const image=document.createElement('img');image.src=Cloud.safeImage(draft.bill.logo);image.alt='Bill logo';root.append(image);}else root.textContent='Using shared restaurant logo.';}
function previewBillSignature(){const root=$('bill49SignaturePreview');root.replaceChildren();if(draft.bill.signature){const image=document.createElement('img');image.src=Cloud.safeImage(draft.bill.signature);image.alt='Authorised signature preview';root.append(image);$('bill49SignatureRemove').hidden=false;}else{root.textContent='No signature image selected.';$('bill49SignatureRemove').hidden=true;}}
function previewBrand(){const root=$('c48BrandPreviews');root.replaceChildren();for(const [key,label] of [['logo','Logo'],['pwaIcon','App icon']])if(draft[key]){const img=document.createElement('img');img.src=Cloud.safeImage(draft[key]);img.alt=label;img.width=64;img.height=64;root.append(img);}}
function fill(){
 draft=structuredClone(settings);draft.bill||={};draft.texts||={};draft.categoryPhotos||={};draft.categoryImageTransforms||={};draft.categoryLabels||={};draft.categoryOptions||={};
 $('c48Name').value=draft.name;$('c48Tagline').value=draft.tagline||'';$('c48LockMessage').value=draft.lockMessage||'';$('c48Lock').textContent=draft.locked?'Unlock system now':'Lock system now';previewBrand();
 $('c49MenuLayout').value=draft.menuLayout||'category-list';$('c49CategoryLinks').checked=draft.showCategoryLinks!==false;$('c49CategoryImages').checked=draft.showCategoryImages!==false;
 for(const [id,key,fallback]of [['bill49Name','name',''],['bill49Tagline','tagline',''],['bill49Header','headerText',''],['bill49Address','address',''],['bill49Contact','contact',''],['bill49FontSize','fontSize',12],['bill49LogoSize','logoSize',80],['bill49Width','paperWidth',80],['bill49Align','align','center'],['bill49Font','font','mono'],['bill49UpiId','upiId',''],['bill49UpiName','upiName',''],['bill49UpiPosition','upiPosition','top'],['bill49UpiSize','upiSize','small'],['bill49UpiText','upiText','Scan to pay'],['bill49BankDetails','bankDetails','']])$(id).value=draft.bill[key]??fallback;$('bill49UpiOnly').checked=draft.bill.upiOnly===true;$('bill49BankEnabled').checked=draft.bill.bankEnabled===true;$('bill49SignatureEnabled').checked=draft.bill.signatureEnabled===true;const template=['classic','modern','minimal','grid','executive'].includes(draft.bill.template)?draft.bill.template:'classic';document.querySelector('[name="bill49Template"][value="'+template+'"]').checked=true;previewBillLogo();previewBillSignature();$('c59RecordPaymentEdit').checked=draft.orderRecordPaymentEdit!==false;$('c61RecordPaymentMinutes').value=Number.isFinite(Number(draft.orderRecordPaymentEditMinutes))?Math.max(5,Math.min(1440,Math.round(Number(draft.orderRecordPaymentEditMinutes)))):120;
 const cats=Cloud.categories.filter(c=>!['All','Best Sellers','Recommended'].includes(c));
 $('c48Categories').innerHTML=cats.map((c,i)=>{const t=categoryTransform48(c,draft);return `<article class="custom48-category"><h4>${e(c)}</h4><div class="custom48-grid"><label>Displayed category name<input data-cat-label="${i}" value="${e(draft.categoryLabels[c]||c)}" maxlength="60"></label><label>Optional category photo<input type="file" data-cat-photo="${i}" accept="image/png,image/jpeg,image/webp"></label></div><div class="custom48-checks"><label><input type="checkbox" data-cat-option="showImage" data-cat-index="${i}" ${draft.categoryOptions[c]?.showImage!==false?'checked':''}>Show banner</label><label><input type="checkbox" data-cat-option="showLink" data-cat-index="${i}" ${draft.categoryOptions[c]?.showLink!==false?'checked':''}>Show jump link</label><label><input type="checkbox" data-cat-option="showDescription" data-cat-index="${i}" ${draft.categoryOptions[c]?.showDescription===true?'checked':''}>Show dish descriptions</label></div><div class="category-banner-editor57"><div data-cat-preview="${i}" class="category-banner-preview57"></div><div class="category-banner-controls57"><label>Zoom <output data-cat-zoom-out="${i}">${t.zoom.toFixed(2)}×</output><input type="range" min="1" max="2.5" step="0.01" value="${t.zoom}" data-cat-transform="zoom" data-cat-transform-index="${i}"></label><label>Move left / right<input type="range" min="0" max="100" step="1" value="${t.x}" data-cat-transform="x" data-cat-transform-index="${i}"></label><label>Move up / down<input type="range" min="0" max="100" step="1" value="${t.y}" data-cat-transform="y" data-cat-transform-index="${i}"></label><button type="button" class="secondary-btn" data-cat-reset-transform="${i}">Reset position</button></div></div><button type="button" class="secondary-btn" data-cat-clear="${i}">Remove category photo</button></article>`;}).join('');
 for(const [i,c]of cats.entries()){draft.categoryImageTransforms[c]||={zoom:1,x:50,y:50};const show=()=>{const root=document.querySelector(`[data-cat-preview="${i}"]`);root.replaceChildren();if(draft.categoryPhotos[c]){const img=document.createElement('img');img.dataset.lowSrc=Cloud.safeImage(draft.categoryPhotos[c]);img.alt=c;img.loading='lazy';img.decoding='async';img.fetchPriority='low';img.style.cssText=categoryImageStyle48(c,draft);root.append(img);Cloud.deferImages?.(root);}};show();document.querySelector(`[data-cat-clear="${i}"]`).onclick=()=>{delete draft.categoryPhotos[c];delete draft.categoryImageTransforms[c];show();};document.querySelector(`[data-cat-photo="${i}"]`).onchange=async ev=>{try{status('Compressing category photo for low egress…');draft.categoryPhotos[c]=await compressedUpload(ev.target.files[0],960,false,null,18000);draft.categoryImageTransforms[c]={zoom:1,x:50,y:50};for(const input of document.querySelectorAll(`[data-cat-transform-index="${i}"]`)){input.value=input.dataset.catTransform==='zoom'?1:50;}const out=document.querySelector(`[data-cat-zoom-out="${i}"]`);if(out)out.textContent='1.00×';show();status('Category photo ready. Adjust zoom/position if needed, then save customization.');}catch(err){status(err.message);}ev.target.value='';};for(const input of document.querySelectorAll(`[data-cat-transform-index="${i}"]`))input.oninput=()=>{const key=input.dataset.catTransform;draft.categoryImageTransforms[c]||={zoom:1,x:50,y:50};draft.categoryImageTransforms[c][key]=Number(input.value);if(key==='zoom'){const out=document.querySelector(`[data-cat-zoom-out="${i}"]`);if(out)out.textContent=Number(input.value).toFixed(2)+'×';}show();};document.querySelector(`[data-cat-reset-transform="${i}"]`).onclick=()=>{draft.categoryImageTransforms[c]={zoom:1,x:50,y:50};for(const input of document.querySelectorAll(`[data-cat-transform-index="${i}"]`))input.value=input.dataset.catTransform==='zoom'?1:50;const out=document.querySelector(`[data-cat-zoom-out="${i}"]`);if(out)out.textContent='1.00×';show();};}
 const flags={showHeader:'Extra header text',showAddress:'Address',showContact:'Contact text',showSeparator:'Separator line',showName:'Restaurant name',showItems:'Item table',showQty:'Quantity column',showRate:'Rate column',showLineTotal:'Line total column',showTotal:'Grand total',showLogo:'Logo',showTagline:'Tagline',showTaxId:'Tax registration text',showOrder:'Order number',showDate:'Date and time',showTable:'Table / takeaway',showPayment:'Payment method',showTax:'Tax breakdown',showFooter:'Footer'};
 $('c48BillFlags').innerHTML=Object.entries(flags).map(([key,label])=>`<label><input type="checkbox" data-bill-flag="${key}" ${draft.bill[key]!==false?'checked':''}>${label}</label>`).join('');
 const texts={taxId:'Tax registration text',footer:'Footer message',itemLabel:'Item column',qtyLabel:'Quantity column',rateLabel:'Rate column',totalLabel:'Total label',subtotalLabel:'Subtotal label',taxLabel:'Tax label',paymentLabel:'Payment label',orderLabel:'Order number label',dateLabel:'Date label',tableLabel:'Table label',takeawayLabel:'Takeaway text',emptyText:'Missing item details message'};
 const defaults={taxId:'GSTIN: 10RQNPK2564R1ZX',footer:'Thank you for visiting!',itemLabel:'Item',qtyLabel:'Qty',rateLabel:'Rate',totalLabel:'Total',subtotalLabel:'Items subtotal',taxLabel:'Tax',paymentLabel:'Paid through',orderLabel:'Order no.',dateLabel:'',tableLabel:'Table',takeawayLabel:'Counter / takeaway',emptyText:'Item details unavailable. Please refresh order records.'};
 $('c48BillTexts').innerHTML=Object.entries(texts).map(([key,label])=>`<label>${label}<input data-bill-text="${key}" value="${e(draft.bill[key]??defaults[key])}" maxlength="300"></label>`).join('');
 $('c48Sections').innerHTML=sections.map(tab=>`<label><input type="checkbox" data-section48="${tab}" ${draft.hiddenSections.includes(tab)?'':'checked'}>${tab==='live'?'Pending orders':tab==='history'?'Order records':tab==='dashboard'?'Analytics':tab[0].toUpperCase()+tab.slice(1)}</label>`).join('');
 // One click persists section visibility immediately; admin controls remain reachable.
 for(const box of document.querySelectorAll('[data-section48]'))box.onchange=async()=>{try{collect();await persist(draft);status('Section visibility saved.');}catch(err){box.checked=!box.checked;status(err.message);}};
 fillMenu51();renderTexts();
}
function collect(){if(!draft)return;for(const k of ['theme','themeTweaks','managerPerms'])if(settings[k]!==undefined)draft[k]=structuredClone(settings[k]);draft.categoryOptions||={};for(const [c,o]of Object.entries(settings.categoryOptions||{})){if(o&&'hidden' in o){draft.categoryOptions[c]||={};draft.categoryOptions[c].hidden=o.hidden;}}draft.menuContent51||={};draft.menuImages51||={};draft.menuImages51.hero||={};for(const input of document.querySelectorAll('[data-menu-text51]'))draft.menuContent51[input.dataset.menuText51]=input.value;draft.menuContent51.showHero=$('menu51HeroVisible').checked;draft.menuContent51.heroImageAlt=$('menu51HeroAlt').value;draft.menuImages51.hero.visible=$('menu51HeroImageVisible').checked;draft.name=$('c48Name').value.trim();draft.tagline=$('c48Tagline').value;draft.photoMode='dish';draft.menuLayout=$('c49MenuLayout').value;draft.showCategoryLinks=$('c49CategoryLinks').checked;draft.showCategoryImages=$('c49CategoryImages').checked;
 for(const [id,key]of [['bill49Name','name'],['bill49Tagline','tagline'],['bill49Header','headerText'],['bill49Address','address'],['bill49Contact','contact'],['bill49Align','align'],['bill49Font','font'],['bill49UpiId','upiId'],['bill49UpiName','upiName'],['bill49UpiPosition','upiPosition'],['bill49UpiSize','upiSize'],['bill49UpiText','upiText'],['bill49BankDetails','bankDetails']])draft.bill[key]=$(id).value.trim();draft.bill.upiOnly=$('bill49UpiOnly').checked;draft.bill.bankEnabled=$('bill49BankEnabled').checked;draft.bill.signatureEnabled=$('bill49SignatureEnabled').checked;draft.bill.template=document.querySelector('[name="bill49Template"]:checked')?.value||'classic';for(const [id,key]of [['bill49FontSize','fontSize'],['bill49LogoSize','logoSize'],['bill49Width','paperWidth']]){if(!$(id).checkValidity())throw Error('Choose valid bill dimensions and text sizes.');draft.bill[key]=Number($(id).value);}
draft.lockMessage=$('c48LockMessage').value;draft.hiddenSections=[...document.querySelectorAll('[data-section48]')].filter(el=>!el.checked).map(el=>el.dataset.section48);
 const cats=Cloud.categories.filter(c=>!['All','Best Sellers','Recommended'].includes(c));for(const [i,c]of cats.entries()){draft.categoryOptions[c]||={};for(const checkbox of document.querySelectorAll(`[data-cat-index="${i}"]`))draft.categoryOptions[c][checkbox.dataset.catOption]=checkbox.checked;const input=document.querySelector(`[data-cat-label="${i}"]`);if(input){const name=input.value.trim();if(!name)throw Error('Category names cannot be empty.');draft.categoryLabels[c]=name;}}
 draft.orderRecordPaymentEdit=$('c59RecordPaymentEdit').checked;if(!$('c61RecordPaymentMinutes').checkValidity())throw Error('Choose a QR payment edit timeout from 5 to 1440 minutes.');draft.orderRecordPaymentEditMinutes=Math.round(Number($('c61RecordPaymentMinutes').value)||120);
 for(const box of document.querySelectorAll('[data-bill-flag]'))draft.bill[box.dataset.billFlag]=box.checked;
 for(const input of document.querySelectorAll('[data-bill-text]'))draft.bill[input.dataset.billText]=input.value;
}
function renderTexts(){if(!draft)return;const query=$('c48TextSearch').value.toLowerCase();const keys=[...new Set([...catalog,...Object.keys(draft.texts)])].filter(k=>!query||k.toLowerCase().includes(query)||(draft.texts[k]||'').toLowerCase().includes(query)).sort().slice(0,100);const root=$('c48TextRows');root.replaceChildren();for(const key of keys){const label=document.createElement('label');label.textContent=key;const input=document.createElement('input');input.value=draft.texts[key]??'';input.placeholder='Use original text';input.maxLength=2000;input.oninput=()=>{if(input.value)draft.texts[key]=input.value;else delete draft.texts[key];};label.append(input);root.append(label);}}
async function persist(next){if(!isAdmin())throw Error('Admin access required.');if(!revision)throw Error('Database customization setup is missing. Run SUPABASE/SAFE-CUSTOMIZATION-SETUP.sql from this project, then Reload settings.');if(!next.name)throw Error('Enter a restaurant name.');const data=await Cloud.rpc('restaurant_custom48',{p_known:null,p_settings:next,p_expected:revision},true);settings=data.settings;revision=data.revision;availability(true);apply();if(typeof renderCategories==='function')renderCategories();if(typeof renderMenuItems==='function')renderMenuItems();if(typeof recordsData!=='undefined'&&recordsData&&typeof renderHistory==='function')renderHistory();return settings;}
async function save(){const button=$('c48Save');button.disabled=true;try{collect();await persist(draft);draft=structuredClone(settings);status('Customization saved for menu, kitchen and bills.');}finally{button.disabled=!revision;}}
async function open(force=false){if(!isAdmin())return;buildPanel();let failure=null;try{await sync(force);}catch(error){failure=error;}try{const response=await fetch('text-catalog48.json');if(response.ok)for(const text of await response.json())catalog.add(text);}catch{}fill();availability(!failure&&!!revision,failure?'Settings are not connected. '+failure.message:'');if(!failure)status('');}

function exportMenu(){try{if(!menuItems.length)throw Error('Open Menu first to load a menu snapshot, then download here.');collect();const fields=['id','name','category','price','description','veg','available','recommended','best_seller','sizes_enabled','size_prices','size_labels','sort_order'];const items=menuItems.map(row=>Object.fromEntries(fields.map(key=>[key,key==='available'?(row.manual_available??row.available):row[key]])));const data={format:'yummy-menu-48',exported_at:new Date().toISOString(),categories:Cloud.categories.filter(c=>c!=='All').map((name,sort_order)=>({name,sort_order})),items,categoryPhotos:draft.categoryPhotos,categoryImageTransforms:draft.categoryImageTransforms,categoryLabels:draft.categoryLabels};download('restaurant-menu.json',JSON.stringify(data,null,2));status('Menu downloaded from the loaded snapshot.');}catch(err){status(err.message);}}
let imported=null;
async function previewImport(){try{const file=$('c48Import').files[0];if(!file)return;if(file.size>3000000)throw Error('Use a menu JSON under 3 MB.');const value=JSON.parse(await file.text());if(value.format!=='yummy-menu-48'||!Array.isArray(value.items)||!Array.isArray(value.categories)||value.items.length>2000)throw Error('Choose a downloaded Yummy menu JSON.');const ids=new Set();for(const item of value.items){if(typeof item.id!=='string'||!item.name||!Number.isFinite(Number(item.price))||Number(item.price)<0||ids.has(item.id))throw Error('Invalid or duplicate dish.');ids.add(item.id);}imported=value;$('c48ImportPreview').textContent=`Local preview: ${value.items.length} dishes and ${value.categories.length} categories. Nothing was sent to the database.`;$('c48LocalPreview').innerHTML=value.items.map(item=>`<article class="custom48-category"><h4>${e(item.name)}</h4><p>${e(item.category)} · ${e(Cloud.cfg.currency||'₹')}${e(item.price)}</p><p>${e(item.description||'')}</p></article>`).join('');}catch(err){imported=null;$('c48LocalPreview').replaceChildren();status(err.message);}}
async function checkpoint(){const button=$('c48Checkpoint');button.disabled=true;try{const gb=Number($('c48Usage').value);if(!$('c48Usage').value||!Number.isFinite(gb)||gb<0)throw Error('Enter verified dashboard usage.');const result=await Cloud.rpc('restaurant_egress_checkpoint48',{p_bytes:Math.round(gb*1e9),p_start:$('c48UsageStart').value,p_end:$('c48UsageEnd').value},true);$('c48UsageStatus').textContent=`Verified checkpoint recorded. ${result.archived} old records archived; analytics preserved.`;}catch(err){$('c48UsageStatus').textContent=err.message;}finally{button.disabled=false;}}
window.Custom48={sync,open,photoMode:()=>settings.photoMode,sectionHidden,renderCategoryPhotos,canRenameTables,refreshManagementDishes:()=>{if($('menu51Dishes')?.dataset.loaded)return loadMenuDishes51();},get:()=>settings,applyText,patch:async changes=>{if(!revision)await sync(true);return persist({...structuredClone(settings),...changes});}};
let queued=false;observer=new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;observer.disconnect();applyText();applyMenu51();observer.observe(document.body,{childList:true,subtree:true,characterData:true});});});observer.observe(document.body,{childList:true,subtree:true,characterData:true});
navigator.serviceWorker?.addEventListener('controllerchange',updateManifest);
void sync().catch(()=>{});Cloud.schedule('shared-customization48',30000,()=>sync());
})();

/* menu17-data.js?v=19 */
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

/* menu17.js?v=19 */
;/* Customer menu v17. Draws the whole QR menu from menu17-data.js settings (20 layouts × 40 themes),
   with dish photos, portion picker sheet, cooking requests, filters, search and the Instagram / Google review offers.
   Loaded after customer.js; it takes over renderMenuItems / renderCategories / selectCategory / handleSearch
   and keeps every original cart, order and tracking feature. In preview mode (menu-preview.html) it draws
   the same menu from data sent by the staff Menu design screen. */
(function () {
'use strict';
const D = window.M17Data; if (!D) return;
const PREVIEW = document.documentElement.dataset.m17Preview === '1';
const byId = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const cur = () => (typeof RESTAURANT_CONFIG !== 'undefined' && RESTAURANT_CONFIG.currency) || '₹';
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const money = n => { n = r2(n); return cur() + (Number.isInteger(n) ? n : n.toFixed(2)); };
const safeImg = v => (typeof Cloud !== 'undefined' && Cloud.safeImage) ? Cloud.safeImage(v) : (typeof v === 'string' && /^(https:\/\/|data:image\/(jpeg|png|webp);base64,)/i.test(v) ? v : '');
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } } };
const today = () => new Date().toLocaleDateString('en-CA');
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const slug = s => 'm17c-' + encodeURIComponent(String(s)).replace(/[^A-Za-z0-9]/g, '_');

/* ---------- icons ---------- */
const I = {
  search: '<path d="M11 4a7 7 0 1 0 4.2 12.6l4.1 4.1 1.4-1.4-4.1-4.1A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z"/>',
  dots: '<circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>',
  mark: '<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1Zm1 2v12.3l5-3.2 5 3.2V5H7Z"/>',
  markOn: '<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1Z"/>',
  share: '<path d="M18 16a3 3 0 0 0-2.4 1.2l-6.7-3.4a3 3 0 0 0 0-1.6l6.7-3.4A3 3 0 1 0 15 7l-6.7 3.4a3 3 0 1 0 0 3.2L15 17a3 3 0 1 0 3-1Z"/>',
  info: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-6h2v6Zm0-8h-2V7h2v2Z"/>',
  star: '<path d="m12 17.3 6.2 3.7-1.6-7 5.4-4.7-7.1-.6L12 2 9.1 8.7 2 9.3l5.4 4.7-1.6 7z"/>',
  down: '<path d="M7 10l5 5 5-5z"/>', chev: '<path d="M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6z"/>', back: '<path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z"/>',
  x: '<path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z"/>',
  pin: '<path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"/>',
  clock: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 10.4 3.5 2.1-.8 1.3L11 13V7h2v5.4Z"/>',
  tag: '<path d="M21.4 11.6 12.4 2.6A2 2 0 0 0 11 2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 .6 1.4l9 9a2 2 0 0 0 2.8 0l7-7a2 2 0 0 0 0-2.8ZM6.5 8A1.5 1.5 0 1 1 6.5 5a1.5 1.5 0 0 1 0 3Z"/>',
  insta: '<path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 8.2a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4ZM17.3 5.5a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4ZM12 2c-2.7 0-3 0-4.1.1-1 0-1.8.2-2.4.5a5 5 0 0 0-1.8 1.2A5 5 0 0 0 2.6 5.6c-.3.6-.5 1.4-.5 2.4C2 9 2 9.3 2 12s0 3 .1 4.1c0 1 .2 1.8.5 2.4.3.7.7 1.3 1.2 1.8s1.1.9 1.8 1.2c.6.3 1.4.5 2.4.5 1.1.1 1.4.1 4.1.1s3 0 4.1-.1c1 0 1.8-.2 2.4-.5a5 5 0 0 0 1.8-1.2 5 5 0 0 0 1.2-1.8c.3-.6.5-1.4.5-2.4.1-1.1.1-1.4.1-4.1s0-3-.1-4.1c0-1-.2-1.8-.5-2.4a5 5 0 0 0-1.2-1.8 5 5 0 0 0-1.8-1.2c-.6-.3-1.4-.5-2.4-.5C15 2 14.7 2 12 2Zm0 1.8c2.7 0 3 0 4 .1.9 0 1.5.2 1.8.3.5.2.8.4 1.2.8.4.4.6.7.8 1.2.1.3.3.9.3 1.8.1 1 .1 1.3.1 4s0 3-.1 4c0 .9-.2 1.5-.3 1.8-.2.5-.4.8-.8 1.2-.4.4-.7.6-1.2.8-.3.1-.9.3-1.8.3-1 .1-1.3.1-4 .1s-3 0-4-.1c-.9 0-1.5-.2-1.8-.3a3 3 0 0 1-1.2-.8 3 3 0 0 1-.8-1.2c-.1-.3-.3-.9-.3-1.8-.1-1-.1-1.3-.1-4s0-3 .1-4c0-.9.2-1.5.3-1.8.2-.5.4-.8.8-1.2.4-.4.7-.6 1.2-.8.3-.1.9-.3 1.8-.3 1-.1 1.3-.1 4-.1Z"/>',
  google: '<path d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.8 3-4.4 3-7.3Z"/><path d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z" opacity=".75"/><path d="M6.4 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9.1L6.4 14Z" opacity=".55"/><path d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.5L6.4 10c.8-2.3 3-4.1 5.6-4.1Z" opacity=".9"/>',
  filter: '<path d="M3 5h18v2H3zm4 6h10v2H7zm3 6h4v2h-4z"/>', list: '<path d="M4 6h2v2H4zm4 0h12v2H8zM4 11h2v2H4zm4 0h12v2H8zm-4 5h2v2H4zm4 0h12v2H8z"/>',
  check: '<path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/>', fire: '<path d="M13.5 1s.7 2.6.7 4.7c0 2-1.3 3.7-3.4 3.7S7.3 7.7 7.3 5.7l.1-.4A11.9 11.9 0 0 0 4 13.8 8 8 0 0 0 20 14c0-5.4-2.6-10.2-6.5-13Z"/>'
};
const ic = (name, cls = '') => `<svg class="m-ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${I[name] || ''}</svg>`;

/* ---------- data sources ---------- */
let P = null; // preview payload from the staff screen
const initialCustom = !PREVIEW && window.Custom48 && Custom48.get ? Custom48.get() : null;
const cached = PREVIEW ? null : store.get('m17-cache', null);
function custom() {
  if (PREVIEW) return (P && P.custom) || {};
  const c = (window.Custom48 && Custom48.get && Custom48.get()) || {};
  // Until the saved design arrives, draw the last design this phone saw (no flash of the default look).
  if (c === initialCustom && cached && typeof cached === 'object') return { ...c, ...cached };
  return c;
}
function remember() {
  if (PREVIEW || !window.Custom48) return; const c = Custom48.get(); if (!c || c === initialCustom) return;
  const lg = typeof c.logo === 'string' && c.logo.length < 150000 ? c.logo : undefined;
  store.set('m17-cache', { m17: c.m17, name: c.name, tagline: c.tagline, logo: lg });
}
function allItems() {
  try { return typeof getActiveMenuItems === 'function' ? getActiveMenuItems() : []; } catch { return []; }
}
function categoryOrder() {
  if (PREVIEW) return (P && P.categories) || [];
  return ((typeof Cloud !== 'undefined' && Cloud.categories) || []).slice(1);
}
const catLabel = c => { const l = custom().categoryLabels; return (l && typeof l[c] === 'string' && l[c].trim()) ? l[c] : c; };
const catPhoto = c => safeImg((custom().categoryPhotos || {})[c]);
const restaurantName = () => String(custom().name || (typeof Cloud !== 'undefined' && Cloud.cfg && Cloud.cfg.restaurantName) || (typeof RESTAURANT_CONFIG !== 'undefined' && RESTAURANT_CONFIG.restaurantName) || 'Our restaurant');
const logo = () => safeImg(custom().logo) || (PREVIEW ? '' : 'yummy-momo-logo.webp?v=yummy-44');
function tableLabel() {
  if (PREVIEW) return (P && P.table) || 'Table 1';
  const t = byId('tableText'); return (t && t.textContent.trim()) || '';
}

/* ---------- settings ---------- */
function onAccent(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 160 ? '#111111' : '#ffffff';
}
function conf() {
  const c = custom(), m = (c.m17 && typeof c.m17 === 'object') ? c.m17 : {};
  const arch = D.ARCHS.find(a => a.id === m.arch) || D.ARCHS[0], L = { ...arch }, o = (m.layout && typeof m.layout === 'object') ? m.layout : {};
  for (const k of ['hero', 'info', 'nav', 'group', 'item']) if (o[k] && D.PARTS[k].some(([v]) => v === o[k])) L[k] = o[k];
  if (['1', '2', '3'].includes(String(o.cols))) L.cols = Number(o.cols);
  for (const k of ['spot', 'center', 'folded']) if (typeof o[k] === 'boolean') L[k] = o[k];
  const theme = { ...(D.THEMES.find(t => t.id === m.theme) || D.THEMES[0]) };
  if (/^#[0-9a-f]{6}$/i.test(m.accent || '')) { theme.accent = m.accent; theme.onAccent = onAccent(m.accent); }
  if (m.font && D.FONTS[m.font]) theme.head = m.font;
  if (m.bodyFont && D.FONTS[m.bodyFont]) theme.body = m.bodyFont;
  if (m.radius !== undefined && m.radius !== '' && Number.isFinite(Number(m.radius))) theme.radius = Math.max(0, Math.min(28, Number(m.radius)));
  const texts = { ...D.TEXT_DEFAULTS };
  if (m.texts && typeof m.texts === 'object') for (const [k, v] of Object.entries(m.texts)) if (k in texts && typeof v === 'string') texts[k] = v.slice(0, 600);
  const show = { ...D.SHOW_DEFAULTS };
  if (m.show && typeof m.show === 'object') for (const [k, v] of Object.entries(m.show)) if (k in show && typeof v === 'boolean') show[k] = v;
  const slides = (Array.isArray(m.hero && m.hero.slides) ? m.hero.slides : []).map(s => ({ src: safeImg(s && s.src), caption: String((s && s.caption) || '').slice(0, 120) })).filter(s => s.src).slice(0, 8);
  const catBanner = ['banner', 'thumb', 'none'].includes(m.catBanner) ? m.catBanner : 'banner';
  return { enabled: m.enabled !== false, L, theme, texts, show, slides, offers: D.offers(m.offers), density: m.density === 'compact' ? 'compact' : 'cozy', catBanner };
}
let C = conf();
const t = (key, vars = {}) => String(C.texts[key] ?? D.TEXT_DEFAULTS[key] ?? '').replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

/* ---------- state ---------- */
const S = {
  q: '', f: new Set(), sort: 'default', tab: null, open: new Set(), closed: new Set(), saved: new Set(store.get('m17-saved', [])),
  offers: new Set(), go: {}, ok: {}, sheet: null, notes: store.get('m17-notes', {}), lastFocus: null, active: null
};
const saveNotes = () => store.set('m17-notes', S.notes);
function usedOffers() { const u = store.get('m17-offers-used', null); return u && u.day === today() && Array.isArray(u.offers) ? u.offers : []; }
function markUsed(list) { store.set('m17-offers-used', { day: today(), offers: [...new Set([...usedOffers(), ...list])] }); }

/* ---------- theme ---------- */
const loadedFonts = new Set();
function font(name) {
  if (!name || loadedFonts.has(name) || !D.FONTS[name]) return; loadedFonts.add(name);
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=' + D.FONTS[name] + '&display=swap'; document.head.append(l);
}
function applyTheme() {
  const th = C.theme; font(th.head); font(th.body);
  const vars = {
    '--m-bg': th.bg, '--m-card': th.card, '--m-ink': th.ink, '--m-sub': th.sub, '--m-line': th.line, '--m-soft': th.soft, '--m-accent': th.accent, '--m-on-accent': th.onAccent,
    '--m-tag': th.tag || (th.dark ? '#4ade80' : '#1ba672'), '--m-good': th.dark ? '#22c55e' : '#1ba672', '--m-veg': th.dark ? '#22c55e' : '#0f8a3d', '--m-nonveg': th.dark ? '#f87171' : '#c0392b',
    '--m-add-bg': th.dark ? th.card : '#ffffff', '--m-add-ink': th.accent === '#ffffff' || th.accent === '#0a0a0a' ? th.ink : th.accent,
    '--m-r': th.radius + 'px', '--m-r-sm': Math.max(0, Math.round(th.radius * 0.6)) + 'px', '--m-head': `'${th.head}', system-ui, sans-serif`, '--m-body': `'${th.body}', system-ui, sans-serif`,
    '--m-shadow': th.dark ? '0 8px 28px -12px rgba(0,0,0,.7)' : '0 8px 24px -14px rgba(28,28,28,.28)', '--m-scheme': th.dark ? 'dark' : 'light'
  };
  let st = byId('m17Vars'); if (!st) { st = document.createElement('style'); st.id = 'm17Vars'; document.head.append(st); }
  const css = ':root{' + Object.entries(vars).map(([k, v]) => k + ':' + v).join(';') + '}';
  if (st.textContent !== css) st.textContent = css;
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = th.bg;
}

/* ---------- shell ---------- */
let root = null, layer = null;
function shell() {
  if (root) return root;
  root = document.createElement('div'); root.id = 'm17'; root.setAttribute('data-custom48-ignore', '');
  root.innerHTML = `
    <div class="m-head" id="m17Head">
      <div class="m-topbar" id="m17TopBar"><div class="m-tb-left" id="m17TbLeft"></div>
        <button type="button" class="m-searchpill" data-a="search"><span class="m-sp-ic">${ic('search')}</span><span class="m-sp-t" id="m17SearchLabel"></span></button>
        <div class="m-tb-right" id="m17TbRight"></div></div>
      <div class="m-hero-box" id="m17Hero"></div></div>
    <div class="m-info" id="m17Info"></div>
    <div class="m-actions" id="m17Actions"></div>
    <div class="m-slot" id="m17Slot"></div>
    <div class="m-sticky" id="m17Sticky">
      <div class="m-mini" id="m17Mini"></div>
      <div class="m-searchbar" id="m17SearchBar" hidden><button type="button" class="m-icbtn" data-a="search-close" aria-label="Close search">${ic('back')}</button>
        <input type="search" id="m17Q" autocomplete="off" enterkeyhint="search"><button type="button" class="m-icbtn" data-a="search-clear" aria-label="Clear search" id="m17QClear" hidden>${ic('x')}</button></div>
      <div class="m-filters" id="m17Filters" role="toolbar"></div>
      <nav class="m-chips" id="m17Chips"></nav></div>
    <div class="m-tiles" id="m17Tiles"></div>
    <section class="m-spot" id="m17Spot"></section>
    <div class="m-body" id="m17Body"><nav class="m-rail" id="m17Rail"></nav><main class="m-list" id="m17List"></main></div>
    <div class="m-foot-space"></div>
    <button type="button" class="m-pill" id="m17Pill" data-a="cats" hidden></button>`;
  const anchor = document.querySelector('.menu-hero');
  if (anchor) anchor.before(root); else document.body.prepend(root);
  layer = document.createElement('div'); layer.id = 'm17Layer'; layer.className = 'm17-layer'; layer.hidden = true; layer.setAttribute('data-custom48-ignore', '');
  layer.innerHTML = '<div class="m-scrim" data-a="close"></div><div class="m-sheet" role="dialog" aria-modal="true" aria-labelledby="m17SheetTitle" tabindex="-1"><button type="button" class="m-x" data-a="close" aria-label="Close">' + ic('x') + '</button><div class="m-sheet-in" id="m17SheetBody"></div></div>';
  document.body.append(layer);
  if (!PREVIEW) {
    const ordersBtn = document.createElement('button'); ordersBtn.type = 'button'; ordersBtn.id = 'm17OrdersBtn'; ordersBtn.className = 'm-act'; ordersBtn.dataset.a = 'orders'; byId('m17Actions').append(ordersBtn);
  } else {
    byId('m17TbLeft').innerHTML = '<span class="table-badge"><span class="dot"></span><span>' + esc(tableLabel()) + '</span></span>';
    byId('m17TbRight').innerHTML = '<button type="button" class="nav-menu-toggle" aria-label="Open menu"><span></span><span></span><span></span></button>';
    byId('m17Actions').innerHTML = '<div class="waiter-call-action"><button type="button" class="call-waiter-button" id="m17PvWaiter"><span></span></button></div><button type="button" class="song-request-button" id="m17PvSong"></button>';
  }
  const q = byId('m17Q');
  q.addEventListener('input', () => { S.q = q.value.trim(); byId('m17QClear').hidden = !q.value; schedule(); });
  q.addEventListener('keydown', e => { if (e.key === 'Escape') closeSearch(); });
  root.addEventListener('click', onClick); layer.addEventListener('click', onClick);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !layer.hidden) closeLayer(); if (e.key === 'Tab' && !layer.hidden) trap(e); });
  byId('m17Body').addEventListener('scroll', () => {}, { passive: true });
  watchScroll();
  return root;
}
/* The original page keeps its own buttons (call waiter, song, table badge, notices); the new menu borrows them
   and gives them back if the owner switches the new menu off. */
const borrowed = [];
function adopt() {
  if (PREVIEW) return;
  const place = (node, target, before = null) => { if (!node || !target || target.contains(node)) return; borrowed.push({ node, parent: node.parentNode, next: node.nextSibling }); target.insertBefore(node, before); };
  const slot = byId('m17Slot');
  for (const id of ['tableAccessNotice', 'waiterConfirmation', 'activeOrderBanner', 'customerOrdersBar', 'cloudMessage', 'pendingRetry']) place(byId(id), slot);
  place(byId('tableBadge'), byId('m17TbLeft')); place(byId('navMenuToggle'), byId('m17TbRight'));
  const actions = byId('m17Actions'), ob = byId('m17OrdersBtn');
  place(document.querySelector('.waiter-call-action'), actions, ob); place(byId('requestSongButton'), actions, ob);
}
function release() { while (borrowed.length) { const { node, parent, next } = borrowed.pop(); if (parent) parent.insertBefore(node, next && next.parentNode === parent ? next : null); } }
function trap(e) {
  const f = [...layer.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),textarea,select')].filter(x => x.offsetParent !== null);
  if (!f.length) return; const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

/* ---------- helpers for dishes ---------- */
const sizesOf = i => (i && i.sizes_enabled && typeof offeredSizes === 'function') ? offeredSizes(i).slice().sort((a, b) => Number(i.size_prices[a]) - Number(i.size_prices[b])) : [];
const isSized = i => !!(i && i.sizes_enabled);
const priceOf = (i, s) => s ? Number(i.size_prices[s]) : Number(i.price);
const minPrice = i => { const o = sizesOf(i); return o.length ? Math.min(...o.map(s => priceOf(i, s))) : Number(i.price); };
const left = (i, s) => { try { return typeof remainingStock === 'function' ? remainingStock(i, s) : Infinity; } catch { return Infinity; } };
const soldOut = i => isSized(i) ? !sizesOf(i).length : left(i, null) <= 0;
const lines = id => Object.values(typeof cart === 'object' ? cart : {}).filter(l => String(l.item.id) === String(id));
const qtyOf = id => lines(id).reduce((n, l) => n + l.qty, 0);
const keyOf = (id, s) => typeof cartKey === 'function' ? cartKey(id, s) : (s ? JSON.stringify([String(id), s]) : String(id));
const sizeName = (i, s) => typeof sizeLabel === 'function' ? sizeLabel(s, i) : s;
const findItem = id => allItems().find(i => String(i.id) === String(id));

function filtered(list) {
  let out = list;
  if (S.q) { const q = S.q.toLowerCase(); out = out.filter(i => [i.name, i.description, i.category, catLabel(i.category)].some(v => String(v || '').toLowerCase().includes(q))); }
  if (S.f.has('veg')) out = out.filter(i => i.veg === true);
  if (S.f.has('nonveg')) out = out.filter(i => i.veg !== true);
  if (S.f.has('best')) out = out.filter(i => i.best_seller === true);
  if (S.f.has('rec')) out = out.filter(i => i.recommended === true);
  if (S.f.has('saved')) out = out.filter(i => S.saved.has(String(i.id)));
  if (S.sort === 'low') out = [...out].sort((a, b) => minPrice(a) - minPrice(b));
  if (S.sort === 'high') out = [...out].sort((a, b) => minPrice(b) - minPrice(a));
  return out;
}
function groups(list) {
  const order = categoryOrder(), map = new Map();
  for (const c of order) map.set(c, []);
  for (const i of list) { const c = i.category || 'Menu'; if (!map.has(c)) map.set(c, []); map.get(c).push(i); }
  return [...map].filter(([, xs]) => xs.length).map(([cat, xs]) => ({ cat, label: catLabel(cat), items: xs, photo: catPhoto(cat) || safeImg((xs.find(x => safeImg(x.image)) || {}).image) }));
}

/* ---------- dish markup ---------- */
function vegMark(i) { return C.show.vegMark ? `<span class="m-veg ${i.veg ? 'is-veg' : 'is-non'}" role="img" aria-label="${i.veg ? 'Vegetarian' : 'Non-vegetarian'}"><i></i></span>` : ''; }
function tags(i) {
  if (!C.show.tags) return '';
  return (i.best_seller === true ? `<span class="m-tag">${ic('fire')}${esc(t('bestseller'))}</span>` : '') + (i.recommended === true ? `<span class="m-tag m-tag-rec">${ic('star')}${esc(t('recommended'))}</span>` : '');
}
function buy(i, compact = false) {
  if (soldOut(i)) return `<span class="m-sold">${esc(t('soldOut'))}</span>`;
  const q = qtyOf(i.id), id = esc(i.id);
  const btn = q ? `<div class="m-step" role="group" aria-label="${esc(i.name)} quantity"><button type="button" data-a="dec" data-id="${id}" aria-label="Remove one ${esc(i.name)}">−</button><b aria-live="polite">${q}</b><button type="button" data-a="inc" data-id="${id}" aria-label="Add one more ${esc(i.name)}">+</button></div>`
    : `<button type="button" class="m-add" data-a="add" data-id="${id}" aria-label="Add ${esc(i.name)}">${esc(t('add'))}<i aria-hidden="true">+</i></button>`;
  const custom = isSized(i) && C.show.customisable && !compact ? `<small class="m-custom">${esc(t('customisable'))}</small>` : '';
  return `<div class="m-buy">${btn}${custom}</div>`;
}
function priceLine(i) {
  const sized = isSized(i) && sizesOf(i).length > 1, p = minPrice(i);
  const l = isSized(i) ? Infinity : left(i, null);
  return `<div class="m-price">${sized ? `<small>${esc(t('from'))}</small> ` : ''}<b>${money(p)}</b>${Number.isFinite(l) && l > 0 && l <= 5 ? `<span class="m-low">${esc(t('onlyLeft', { n: l }))}</span>` : ''}</div>`;
}
function icons(i) {
  const saved = S.saved.has(String(i.id)), id = esc(i.id);
  return (C.show.bookmark ? `<button type="button" class="m-round${saved ? ' on' : ''}" data-a="save" data-id="${id}" aria-pressed="${saved}" aria-label="${esc(t('save'))} ${esc(i.name)}">${ic(saved ? 'markOn' : 'mark')}</button>` : '')
    + (C.show.share ? `<button type="button" class="m-round" data-a="share" data-id="${id}" aria-label="${esc(t('share'))} ${esc(i.name)}">${ic('share')}</button>` : '');
}
function dish(i, style, big = false) {
  const photo = C.show.photos ? safeImg(i.image) : '', id = esc(i.id), q = qtyOf(i.id);
  const desc = C.show.desc && i.description ? `<p class="m-desc">${esc(i.description)}</p>` : '';
  const more = C.show.desc && i.description && i.description.length > 70 ? `<button type="button" class="m-more" data-a="open" data-id="${id}">${esc(t('more'))}</button>` : '';
  const tg = tags(i), icn = icons(i);
  const name = `<h3 class="m-name"><button type="button" data-a="open" data-id="${id}">${esc(i.name)}</button></h3>`;
  const img = photo ? `<img src="${esc(photo)}" alt="${esc(i.name)}" loading="lazy" decoding="async" width="300" height="300">` : '';
  const cls = `m-dish m-s-${style}${big ? ' m-big' : ''}${photo ? ' has-photo' : ' no-photo'}${q ? ' in-cart' : ''}${soldOut(i) ? ' is-sold' : ''}`;
  const head = `<div class="m-meta">${vegMark(i)}${tg ? `<span class="m-tags">${tg}</span>` : ''}</div>`;
  if (style === 'story') {
    return `<article class="${cls}" data-k="${id}"><div class="m-media" data-a="open" data-id="${id}">${img || `<div class="m-noimg">${esc(i.name.slice(0, 1))}</div>`}<div class="m-shade"><div class="m-meta">${vegMark(i)}</div>${name}${priceLine(i)}</div></div>
      <div class="m-under">${tg ? `<div class="m-tags">${tg}</div>` : ''}${desc}<div class="m-row-end"><div class="m-icons">${icn}</div>${buy(i)}</div></div></article>`;
  }
  if (['text', 'fine', 'thumb'].includes(style) || !photo) {
    const thumb = style === 'thumb' && photo ? `<div class="m-thumb" data-a="open" data-id="${id}">${img}</div>` : '';
    return `<article class="${cls}" data-k="${id}">${thumb}<div class="m-copy">${head}<div class="m-line">${name}${style === 'text' ? '<span class="m-dots" aria-hidden="true"></span>' + priceLine(i) : ''}</div>${style !== 'text' ? priceLine(i) : ''}${desc}${more}${icn ? `<div class="m-icons">${icn}</div>` : ''}</div><div class="m-side">${buy(i)}</div></article>`;
  }
  return `<article class="${cls}" data-k="${id}"><div class="m-copy">${head}${name}${priceLine(i)}${desc}${more}${icn ? `<div class="m-icons">${icn}</div>` : ''}</div>
    <div class="m-media"><button type="button" class="m-photo" data-a="open" data-id="${id}" aria-label="Open ${esc(i.name)}">${img}</button>${buy(i)}</div></article>`;
}

/* ---------- keyed patching keeps photos from reloading ---------- */
function patch(parent, parts) {
  const old = new Map([...parent.children].map(n => [n.dataset.k, n])), want = [];
  for (const { k, html } of parts) {
    let n = old.get(k);
    if (!n || n._h !== html) { const tpl = document.createElement('template'); tpl.innerHTML = html.trim(); const fresh = tpl.content.firstElementChild; fresh._h = html; if (n) n.replaceWith(fresh); n = fresh; }
    want.push(n);
  }
  for (const c of [...parent.children]) if (!want.includes(c)) c.remove();
  want.forEach((n, i) => { if (parent.children[i] !== n) parent.insertBefore(n, parent.children[i] || null); });
}

/* ---------- sections ---------- */
function headHtml(g, fold, open) {
  const count = C.show.counts ? `<span class="m-count">${esc(g.items.length === 1 ? t('oneDish') : t('dishes', { n: g.items.length }))}</span>` : '';
  // v19: each category can have its own banner photo (Menu design → Categories).
  const own = C.show.catPhotos && C.catBanner === 'banner' ? catPhoto(g.cat) : '';
  if (own) {
    const inner = `<img class="m-cb-img" src="${esc(own)}" alt="" loading="lazy" decoding="async"><span class="m-cb-shade"></span><span class="m-cat-t"><h2>${esc(g.label)}</h2>${count}</span>${fold ? `<span class="m-cat-chev${open ? ' open' : ''}">${ic('chev')}</span>` : ''}`;
    return fold ? `<button type="button" class="m-cat-head m-cat-banner" data-a="fold" data-cat="${esc(g.cat)}" aria-expanded="${open}">${inner}</button>` : `<div class="m-cat-head m-cat-banner">${inner}</div>`;
  }
  const ph = C.show.catPhotos && C.catBanner !== 'none' && g.photo && (C.L.group === 'accordion' || C.catBanner === 'thumb') ? `<span class="m-cat-ph"><img src="${esc(g.photo)}" alt="" loading="lazy" decoding="async"></span>` : '';
  const inner = `${ph}<span class="m-cat-t"><h2>${esc(g.label)}</h2>${count}</span>${fold ? `<span class="m-cat-chev${open ? ' open' : ''}">${ic('chev')}</span>` : ''}`;
  return fold ? `<button type="button" class="m-cat-head" data-a="fold" data-cat="${esc(g.cat)}" aria-expanded="${open}">${inner}</button>` : `<div class="m-cat-head">${inner}</div>`;
}
function renderList(gs, flat) {
  const list = byId('m17List'), L = C.L;
  if (!gs.length) {
    const any = S.q || S.f.size;
    patch(list, [{ k: 'empty', html: `<div class="m-empty" data-k="empty"><p>${esc(allItems().length ? t('noResults') : (PREVIEW ? 'Add dishes in Items to see them here.' : ''))}</p>${any ? `<button type="button" class="m-btn" data-a="clear">${esc(t('clear'))}</button>` : ''}</div>` }]);
    return;
  }
  if (flat) {
    const style = L.item === 'story' || L.item === 'bento' ? 'row' : L.item;
    const html = `<section class="m-cat m-results" data-k="results"><div class="m-cat-head"><span class="m-cat-t"><h2>${esc(S.q ? t('results', { q: S.q }) : t('menuTitle'))}</h2></span></div><div class="m-items" data-style="${style}"></div></section>`;
    patch(list, [{ k: 'results', html }]);
    patch(list.querySelector('.m-items'), gs.flatMap(g => g.items).map(i => ({ k: String(i.id), html: dish(i, style) })));
    return;
  }
  let show = gs;
  if (L.group === 'tabs') { if (!gs.some(g => g.cat === S.tab)) S.tab = gs[0].cat; show = gs.filter(g => g.cat === S.tab); }
  const fold = L.group === 'accordion';
  const parts = show.map((g, idx) => {
    const open = !fold || (L.folded ? S.open.has(g.cat) : !S.closed.has(g.cat));
    return { g, open, k: 'c:' + g.cat, html: `<section class="m-cat${open ? '' : ' is-closed'}" data-k="c:${esc(g.cat)}" id="${slug(g.cat)}" data-cat="${esc(g.cat)}">${headHtml(g, fold, open)}<div class="m-items" data-style="${L.item}"${open ? '' : ' hidden'}></div></section>` };
  });
  patch(list, parts.map(({ k, html }) => ({ k, html })));
  parts.forEach(({ g, open }, idx) => {
    const box = list.children[idx].querySelector('.m-items');
    if (!open) { box.replaceChildren(); return; }
    patch(box, g.items.map((i, n) => ({ k: String(i.id), html: dish(i, L.item, L.item === 'bento' && n === 0) })));
  });
}

/* ---------- top of the page ---------- */
function slidesFor() {
  if (C.slides.length) return C.slides;
  const cats = custom().categoryPhotos || {}, out = [];
  for (const c of categoryOrder()) { const s = safeImg(cats[c]); if (s) out.push({ src: s, caption: catLabel(c) }); }
  if (!out.length) for (const i of allItems()) { const s = safeImg(i.image); if (s) out.push({ src: s, caption: i.name }); if (out.length >= 5) break; }
  return out.slice(0, 8);
}
let heroSig = '', heroTimer = null;
function renderHero() {
  const box = byId('m17Hero'), kind = C.show.hero ? C.L.hero : 'none', slides = slidesFor();
  const name = restaurantName(), tag = t('tagline') || (custom().tagline || '');
  const lg = logo();
  const sig = JSON.stringify([kind, slides, name, tag, lg]);
  root.dataset.hero = kind; root.dataset.heroImg = String(!!slides.length && ['carousel', 'cover', 'banner', 'split'].includes(kind));
  if (sig === heroSig) return; heroSig = sig; clearInterval(heroTimer);
  const fallback = `<div class="m-hero-fallback"><span>${esc(name)}</span></div>`;
  if (kind === 'none' || kind === 'compact') { box.innerHTML = ''; return; }
  if (kind === 'split') {
    box.innerHTML = `<div class="m-split"><div class="m-split-t">${lg ? `<img class="m-logo" src="${esc(lg)}" alt="">` : ''}<h2>${esc(name)}</h2>${tag ? `<p>${esc(tag)}</p>` : ''}</div><div class="m-split-ph">${slides[0] ? `<img src="${esc(slides[0].src)}" alt="" fetchpriority="high">` : fallback}</div></div>`;
    return;
  }
  if (kind === 'cover') {
    box.innerHTML = `<div class="m-cover">${slides[0] ? `<img class="m-cover-img" src="${esc(slides[0].src)}" alt="" fetchpriority="high">` : '<div class="m-cover-img m-grad"></div>'}<div class="m-cover-t">${lg ? `<img class="m-logo" src="${esc(lg)}" alt="">` : ''}<h2>${esc(name)}</h2>${tag ? `<p>${esc(tag)}</p>` : ''}</div></div>`;
    return;
  }
  if (!slides.length) { box.innerHTML = `<div class="m-slider m-${kind}">${fallback}</div>`; return; }
  box.innerHTML = `<div class="m-slider m-${kind}"><div class="m-slides" id="m17Slides">${slides.map((s, n) => `<figure class="m-slide"><img src="${esc(s.src)}" alt="${esc(s.caption)}" ${n ? 'loading="lazy"' : 'fetchpriority="high"'} decoding="async"></figure>`).join('')}</div>
    <div class="m-cap"><b id="m17Cap">${esc(slides[0].caption)}</b>${slides.length > 1 ? `<span class="m-dots-nav">${slides.map((_, n) => `<i class="${n ? '' : 'on'}"></i>`).join('')}</span>` : ''}</div></div>`;
  const track = byId('m17Slides'); let idx = 0;
  const sync = () => { const n = Math.round(track.scrollLeft / Math.max(1, track.clientWidth)); if (n === idx) return; idx = n; byId('m17Cap').textContent = slides[n] ? slides[n].caption : ''; box.querySelectorAll('.m-dots-nav i').forEach((d, k) => d.classList.toggle('on', k === n)); };
  track.addEventListener('scroll', () => requestAnimationFrame(sync), { passive: true });
  if (slides.length > 1 && !reduced()) heroTimer = setInterval(() => { if (document.hidden || !track.isConnected) return; const next = (idx + 1) % slides.length; track.scrollTo({ left: next * track.clientWidth, behavior: 'smooth' }); }, 4500);
}
function offerList() {
  const o = C.offers, used = usedOffers(), out = [];
  if (o.insta.on && !used.includes('insta')) out.push('insta');
  if (o.review.on && !used.includes('review')) out.push('review');
  return out;
}
function bestOffer() { const o = C.offers, l = offerList(); if (!l.length) return 0; const a = l.map(k => o[k].amount); return o.mode === 'both' ? a.reduce((x, y) => x + y, 0) : Math.max(...a); }
function renderInfo() {
  const box = byId('m17Info'), kind = C.show.info ? C.L.info : 'none'; root.dataset.info = kind;
  if (kind === 'none') { box.innerHTML = ''; return; }
  const name = restaurantName(), lg = logo(), tag = t('tagline') || '', loc = t('location'), tm = t('time'), chip = t('chip');
  const rating = C.show.rating && t('rating') ? `<button type="button" class="m-rate" data-a="${C.offers.review.on ? 'offers' : 'about'}"><span class="m-rate-top">${esc(t('rating'))}${ic('star')}</span>${t('ratingCount') ? `<span class="m-rate-bot">${esc(t('ratingCount'))}</span>` : ''}</button>` : '';
  const tbl = tableLabel();
  const offers = C.show.offers ? offerList() : [];
  const strip = offers.length ? `<button type="button" class="m-offerstrip" data-a="offers"><span class="m-os-ic">${ic('tag')}</span><span class="m-os-t"><b>${esc(t('offersLine', { amount: money(bestOffer()) }))}</b><span> · ${esc(offers.length === 1 ? t('offerCount1') : t('offersCount', { n: offers.length }))}</span></span>${ic('down', 'm-os-down')}</button>` : '';
  const about = t('about') ? `<button type="button" class="m-i" data-a="about" aria-label="${esc(t('aboutTitle'))}">${ic('info')}</button>` : '';
  const heroKind = C.show.hero ? C.L.hero : 'none', heroNamed = heroKind === 'cover' || heroKind === 'split';
  const lines = `${loc ? `<p class="m-info-line">${ic('pin')}<span>${esc(loc)}</span></p>` : ''}${tm || tbl ? `<p class="m-info-line">${ic('clock')}<span>${esc([tm, tbl].filter(Boolean).join(' · '))}</span></p>` : ''}`;
  if (heroNamed && !lines && !rating && !chip && !strip && !about) { box.innerHTML = ''; return; }
  const top = heroNamed
    ? `<div class="m-info-top m-info-slim"><div class="m-info-name">${lines}${about ? `<button type="button" class="m-info-about" data-a="about">${ic('info')}<span>${esc(t('aboutTitle'))}</span></button>` : ''}</div>${rating}</div>`
    : `<div class="m-info-top">${lg ? `<img class="m-logo" src="${esc(lg)}" alt="">` : ''}<div class="m-info-name"><h1>${esc(name)}${about}</h1>${tag ? `<p>${esc(tag)}</p>` : ''}</div>${rating}</div>${lines}`;
  box.innerHTML = `<div class="m-info-card${heroNamed ? ' m-info-named' : ''}">${top}
    ${chip ? `<span class="m-chip-badge">${esc(chip)}</span>` : ''}${strip}</div>`;
}
function renderActions() {
  const a = byId('m17Actions');
  a.classList.toggle('no-waiter', !C.show.waiter); a.classList.toggle('no-song', !C.show.song);
  const w = a.querySelector('.call-waiter-button span:last-child, #m17PvWaiter span'); if (w) w.textContent = t('callWaiter');
  const s = a.querySelector('#requestSongButton, #m17PvSong'); if (s) s.textContent = '♪ ' + t('requestSong');
  const o = byId('m17OrdersBtn');
  if (o) { const bar = byId('customerOrdersBar'); o.hidden = !C.show.orders || !bar || bar.hidden; o.textContent = t('yourOrders'); }
  const songVisible = s && C.show.song && !(s.hidden && !PREVIEW);
  const waiterVisible = C.show.waiter && a.querySelector('.call-waiter-button');
  a.hidden = !(songVisible || waiterVisible || (o && !o.hidden));
  const bar = byId('customerOrdersBar'); if (bar) bar.classList.toggle('m17-has-btn', !!o && !o.hidden);
}
function renderFilters(all) {
  const box = byId('m17Filters'); box.hidden = !C.show.filters;
  if (!C.show.filters) return;
  const has = k => S.f.has(k), any = (fn) => all.some(fn);
  const chips = [
    ['sort', `${ic('filter')}${esc(t('filters'))}${S.sort !== 'default' ? '<i class="m-dot"></i>' : ''}${ic('down', 'm-dd')}`, S.sort !== 'default', true],
    any(i => i.veg === true) && any(i => i.veg !== true) ? ['veg', `<span class="m-veg is-veg"><i></i></span>${esc(t('veg'))}`, has('veg')] : null,
    any(i => i.veg === true) && any(i => i.veg !== true) ? ['nonveg', `<span class="m-veg is-non"><i></i></span>${esc(t('nonveg'))}`, has('nonveg')] : null,
    any(i => i.best_seller === true) ? ['best', esc(t('bestseller')), has('best')] : null,
    any(i => i.recommended === true) ? ['rec', esc(t('recommended')), has('rec')] : null,
    S.saved.size && C.show.bookmark ? ['saved', `${ic('markOn')}${esc(t('saved'))}`, has('saved')] : null
  ].filter(Boolean);
  const html = chips.map(([k, label, on, sheet]) => `<button type="button" class="m-fchip${on ? ' on' : ''}" data-a="${sheet ? 'sort' : 'filter'}" data-f="${k}" aria-pressed="${!!on}">${label}${on && !sheet ? `<span class="m-fx">${ic('x')}</span>` : ''}</button>`).join('');
  if (box._h !== html) { box.innerHTML = html; box._h = html; }
}
function renderNav(gs) {
  const L = C.L, chips = byId('m17Chips'), rail = byId('m17Rail'), tiles = byId('m17Tiles'), pill = byId('m17Pill');
  const searching = !!S.q;
  const navChips = !searching && (L.nav === 'chips' || L.nav === 'tabs') && gs.length > 1;
  chips.hidden = !navChips; rail.hidden = searching || L.nav !== 'rail'; tiles.hidden = searching || L.nav !== 'tiles' || gs.length < 2;
  root.dataset.rail = String(!rail.hidden);
  const cur = L.group === 'tabs' ? S.tab : S.active;
  if (navChips) {
    const html = gs.map(g => `<button type="button" class="m-chip${g.cat === cur ? ' on' : ''}" data-a="jump" data-cat="${esc(g.cat)}" aria-current="${g.cat === cur}">${esc(g.label)}</button>`).join('');
    if (chips._h !== html) { chips.innerHTML = html; chips._h = html; }
  }
  if (!rail.hidden) {
    const html = gs.map(g => `<button type="button" class="m-rl${g.cat === cur ? ' on' : ''}" data-a="jump" data-cat="${esc(g.cat)}" aria-current="${g.cat === cur}"><span class="m-rl-ph">${C.show.catPhotos && g.photo ? `<img src="${esc(g.photo)}" alt="" loading="lazy">` : `<b>${esc(g.label.slice(0, 1))}</b>`}</span><span class="m-rl-t">${esc(g.label)}</span></button>`).join('');
    if (rail._h !== html) { rail.innerHTML = html; rail._h = html; }
  }
  if (!tiles.hidden) {
    const html = `<div class="m-tiles-in">${gs.map(g => `<button type="button" class="m-tile${g.cat === cur ? ' on' : ''}" data-a="jump" data-cat="${esc(g.cat)}">${C.show.catPhotos && g.photo ? `<img src="${esc(g.photo)}" alt="" loading="lazy">` : `<span class="m-tile-ph">${esc(g.label.slice(0, 1))}</span>`}<span class="m-tile-t">${esc(g.label)}</span></button>`).join('')}</div>`;
    if (tiles._h !== html) { tiles.innerHTML = html; tiles._h = html; }
  }
  const pillOn = C.show.menuPill && !searching && gs.length > 1 && (L.nav === 'pill' || L.nav === 'tiles') && L.group !== 'tabs';
  pill.hidden = !pillOn;
  if (pillOn) pill.innerHTML = `${ic('list')}<span>${esc(t('menuPill'))}</span>`;
}
function renderSpot(all) {
  const box = byId('m17Spot'), on = C.L.spot && !S.q && !S.f.size;
  const picks = on ? all.filter(i => i.best_seller === true || i.recommended === true).slice(0, 10) : [];
  box.hidden = !picks.length;
  if (!picks.length) { box.innerHTML = ''; return; }
  const html = `<h2>${esc(t('spotTitle'))}</h2><div class="m-spot-row">${picks.map(i => dish(i, 'card')).join('')}</div>`;
  if (box._h !== html) { box.innerHTML = html; box._h = html; }
}
function renderMini() {
  const m = byId('m17Mini'), lg = logo();
  const html = `${lg ? `<img class="m-logo" src="${esc(lg)}" alt="">` : ''}<b>${esc(restaurantName())}</b>${C.show.search ? `<button type="button" class="m-icbtn" data-a="search" aria-label="${esc(t('search'))}">${ic('search')}</button>` : ''}`;
  if (m._h !== html) { m.innerHTML = html; m._h = html; }
  byId('m17SearchLabel').textContent = t('search');
  byId('m17Q').placeholder = t('search');
  root.querySelector('.m-searchpill').hidden = !C.show.search;
}

/* ---------- main render ---------- */
let queued = false, sticky = 0;
function schedule() { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; render(); }); }
function on() { document.body.classList.add('m17-on'); }
function off() { document.body.classList.remove('m17-on'); }
function render() {
  C = conf();
  if (!PREVIEW && !C.enabled) { off(); legacy(); return; }
  shell(); adopt(); root.hidden = false; on(); applyTheme(); remember();
  const L = C.L;
  Object.assign(root.dataset, { nav: L.nav, group: L.group, item: L.item, cols: String(L.cols), center: String(!!L.center), density: C.density, dark: String(!!C.theme.dark), searching: String(!!S.q) });
  document.body.dataset.m17Dark = String(!!C.theme.dark);
  const all = allItems(), list = filtered(all), gs = groups(list), flat = !!S.q;
  if (L.group === 'tabs' && gs.length && !gs.some(g => g.cat === S.tab)) S.tab = gs[0].cat;
  renderHero(); renderInfo(); renderActions(); renderMini(); renderFilters(all); renderNav(groups(S.q ? [] : list)); renderSpot(all); renderList(gs, flat);
  measure(); spy(); paintCart();
}
function legacy() {
  // The owner turned the new menu off: hand the page back to the original renderer.
  if (!orig.renderMenuItems) return;
  if (root) { root.hidden = true; release(); }
  orig.renderCategories(); orig.renderMenuItems();
}

/* ---------- sticky offset + scroll spy ---------- */
function measure() {
  const st = byId('m17Sticky'), mini = byId('m17Mini'); const h = (st ? st.offsetHeight : 0) + (mini && root && !root.classList.contains('m-search-on') ? mini.offsetHeight : 0);
  if (h !== sticky) { sticky = h; document.documentElement.style.setProperty('--m-sticky-h', h + 'px'); }
}
let spyObs = null;
// Measure against this page's own viewport, even inside the Menu design preview frame (the default root would be the outer page).
const ioRoot = (() => { try { new IntersectionObserver(() => {}, { root: document }); return document; } catch { return null; } })();
function spy() {
  if (spyObs) spyObs.disconnect();
  if (!('IntersectionObserver' in window) || C.L.group === 'tabs' || S.q) return;
  spyObs = new IntersectionObserver(entries => {
    const vis = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
    if (!vis) return; const cat = vis.target.dataset.cat; if (!cat || cat === S.active) return; S.active = cat; highlight();
  }, { root: ioRoot, rootMargin: `-${sticky + 8}px 0px -65% 0px`, threshold: 0 });
  for (const s of byId('m17List').querySelectorAll('.m-cat[data-cat]')) spyObs.observe(s);
}
function highlight() {
  const cur = C.L.group === 'tabs' ? S.tab : S.active;
  for (const b of root.querySelectorAll('.m-chip,.m-rl,.m-tile')) {
    const on = b.dataset.cat === cur; b.classList.toggle('on', on); b.setAttribute('aria-current', String(on));
    if (on && b.closest('.m-chips')) { const bar = b.parentElement, br = b.getBoundingClientRect(), rr = bar.getBoundingClientRect(); if (br.left < rr.left + 8 || br.right > rr.right - 8) bar.scrollTo({ left: bar.scrollLeft + br.left - rr.left - 16, behavior: reduced() ? 'auto' : 'smooth' }); }
  }
}
function watchScroll() {
  const head = byId('m17Head'); if (!('IntersectionObserver' in window)) return;
  new IntersectionObserver(([e]) => { root.classList.toggle('m-scrolled', !e.isIntersecting); requestAnimationFrame(measure); }, { root: ioRoot, threshold: 0, rootMargin: '-56px 0px 0px 0px' }).observe(head);
}
function jump(cat) {
  if (C.L.group === 'tabs') { S.tab = cat; schedule(); requestAnimationFrame(() => byId('m17List').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' })); return; }
  if (C.L.group === 'accordion') { if (C.L.folded) S.open.add(cat); else S.closed.delete(cat); render(); }
  const el = byId(slug(cat)); if (!el) return;
  S.active = cat; highlight();
  const y = el.getBoundingClientRect().top + scrollY - sticky - 6;
  scrollTo({ top: y, behavior: reduced() ? 'auto' : 'smooth' });
}

/* ---------- search ---------- */
function openSearch() { root.classList.add('m-search-on'); byId('m17SearchBar').hidden = false; measure(); const q = byId('m17Q'); q.focus(); const st = byId('m17Sticky'); if (st.getBoundingClientRect().top > sticky) scrollTo({ top: st.getBoundingClientRect().top + scrollY - 2, behavior: 'auto' }); }
function closeSearch() { root.classList.remove('m-search-on'); byId('m17SearchBar').hidden = true; const q = byId('m17Q'); q.value = ''; S.q = ''; byId('m17QClear').hidden = true; render(); }

/* ---------- sheets ---------- */
function openLayer(html, kind) {
  S.lastFocus = document.activeElement; layer.dataset.kind = kind; byId('m17SheetBody').innerHTML = html; layer.hidden = false;
  document.body.classList.add('m17-locked'); requestAnimationFrame(() => { layer.classList.add('open'); layer.querySelector('.m-sheet').focus({ preventScroll: true }); });
}
function closeLayer() {
  if (layer.hidden) return; layer.classList.remove('open'); S.sheet = null; document.body.classList.remove('m17-locked');
  setTimeout(() => { if (!layer.classList.contains('open')) { layer.hidden = true; byId('m17SheetBody').innerHTML = ''; } }, reduced() ? 0 : 220);
  if (S.lastFocus && S.lastFocus.isConnected) S.lastFocus.focus({ preventScroll: true });
}
function dishSheet(id, size) {
  const i = findItem(id); if (!i) return;
  const opts = sizesOf(i), sized = isSized(i);
  const prior = S.sheet && String(S.sheet.id) === String(id) ? S.sheet : null;
  const pick = sized ? (opts.includes(size) ? size : (prior && opts.includes(prior.size) ? prior.size : opts[0])) : null;
  S.sheet = { id: String(i.id), size: pick, qty: prior ? prior.qty : 1, note: prior ? prior.note : (S.notes[keyOf(i.id, pick)] || '') };
  openLayer(sheetHtml(i), 'dish');
}
function sheetHtml(i) {
  const sh = S.sheet, opts = sizesOf(i), photo = C.show.photos ? safeImg(i.image) : '', sold = soldOut(i);
  const unit = sh.size ? priceOf(i, sh.size) : Number(i.price), total = unit * sh.qty;
  const radio = opts.length ? `<section class="m-card"><header><div><h3>${esc(t('quantity'))}</h3><p>${esc(t('required'))} • ${esc(t('selectOne'))}</p></div></header>
    <div class="m-radios" role="radiogroup" aria-label="${esc(t('quantity'))}">${opts.map(s => `<label class="m-radio"><span>${vegMark(i)}${esc(sizeName(i, s))}</span><span class="m-rp">${money(priceOf(i, s))}</span><input type="radio" name="m17size" value="${esc(s)}" data-a="size" ${s === sh.size ? 'checked' : ''}><i></i></label>`).join('')}</div></section>` : '';
  const cook = C.show.cooking ? `<section class="m-card"><header><div><h3>${esc(t('cookingTitle'))}</h3><p>${esc(t('cookingHint'))}</p></div></header>
    <div class="m-ta"><textarea id="m17Note" maxlength="100" rows="3" placeholder="${esc(t('cookingPlaceholder'))}">${esc(sh.note)}</textarea><small><span id="m17NoteN">${sh.note.length}</span>/100</small></div></section>` : '';
  return `${photo ? `<div class="m-sh-photo"><img src="${esc(photo)}" alt="${esc(i.name)}"></div>` : ''}
    <section class="m-card m-sh-main"><header class="m-sh-head"><div class="m-sh-name">${vegMark(i)}<h2 id="m17SheetTitle">${esc(i.name)}</h2></div><div class="m-icons">${icons(i)}</div></header>
    ${tags(i) ? `<div class="m-tags m-sh-tags">${tags(i)}</div>` : ''}${!opts.length ? `<p class="m-sh-price">${money(i.price)}</p>` : ''}${C.show.desc && i.description ? `<p class="m-sh-desc">${esc(i.description)}</p>` : ''}</section>
    ${radio}${cook}
    <footer class="m-sh-foot">${sold ? `<p class="m-sold">${esc(t('soldOut'))}</p>` : `<div class="m-step m-step-lg"><button type="button" data-a="sq-" aria-label="Fewer">−</button><b id="m17Sq">${sh.qty}</b><button type="button" data-a="sq+" aria-label="More">+</button></div>
      <button type="button" class="m-addbig" data-a="sheet-add" data-autofocus>${esc(t('addItem'))} <b id="m17St">${money(total)}</b></button>`}</footer>`;
}
function refreshSheet() {
  const i = findItem(S.sheet && S.sheet.id); if (!i) return;
  const unit = S.sheet.size ? priceOf(i, S.sheet.size) : Number(i.price);
  const q = byId('m17Sq'), st = byId('m17St'); if (q) q.textContent = S.sheet.qty; if (st) st.textContent = money(unit * S.sheet.qty);
}
function sheetAdd() {
  const sh = S.sheet, i = findItem(sh && sh.id); if (!i) return;
  const key = keyOf(i.id, sh.size), before = (cart[key] && cart[key].qty) || 0;
  for (let n = 0; n < sh.qty; n++) updateQty(i.id, 1, sh.size);
  const note = (byId('m17Note') ? byId('m17Note').value : sh.note).trim().slice(0, 100);
  if (((cart[key] && cart[key].qty) || 0) > before) { if (note) S.notes[key] = note; else delete S.notes[key]; saveNotes(); closeLayer(); bump(); }
}
function bump() { const b = byId('floatingCartBar'); if (!b) return; b.classList.remove('m17-bump'); void b.offsetWidth; b.classList.add('m17-bump'); }
function catsSheet() {
  const gs = groups(filtered(allItems()));
  openLayer(`<h2 id="m17SheetTitle" class="m-sh-title">${esc(t('menuTitle'))}</h2><div class="m-catlist">${gs.map(g => `<button type="button" data-a="jump" data-cat="${esc(g.cat)}" class="${g.cat === S.active ? 'on' : ''}"><span>${esc(g.label)}</span><b>${g.items.length}</b></button>`).join('')}</div>`, 'cats');
}
function sortSheet() {
  const rows = [['default', t('sortDefault')], ['low', t('sortLow')], ['high', t('sortHigh')]];
  openLayer(`<h2 id="m17SheetTitle" class="m-sh-title">${esc(t('sortTitle'))}</h2><div class="m-radios" role="radiogroup">${rows.map(([k, l]) => `<label class="m-radio"><span>${esc(l)}</span><input type="radio" name="m17sort" value="${k}" data-a="sortpick" ${S.sort === k ? 'checked' : ''}><i></i></label>`).join('')}</div>
    <footer class="m-sh-foot"><button type="button" class="m-btn" data-a="clear">${esc(t('clear'))}</button><button type="button" class="m-addbig" data-a="close" data-autofocus>${esc(t('apply'))}</button></footer>`, 'sort');
}
function aboutSheet() {
  openLayer(`<h2 id="m17SheetTitle" class="m-sh-title">${esc(t('aboutTitle'))}</h2><div class="m-about">${esc(t('about') || restaurantName()).replace(/\n/g, '<br>')}</div>`, 'about');
}
function offerCards(where) {
  const o = C.offers, list = offerList();
  if (!list.length) return '';
  const sel = selected();
  const card = k => {
    const isI = k === 'insta', cfg = o[k], applied = sel.includes(k), handle = '@' + o.insta.handle;
    const href = isI ? 'https://www.instagram.com/' + encodeURIComponent(o.insta.handle) + '/' : o.review.url;
    const title = isI ? t('instaTitle') : t('reviewTitle'), sub = isI ? t('instaSub', { handle, amount: money(cfg.amount) }) : t('reviewSub', { amount: money(cfg.amount) });
    const short = !PREVIEW && where === 'cart' && rawTotal() < cfg.amount;
    const acts = short ? `<p class="m-offer-note">${esc(t('offerMin', { amount: money(cfg.amount) }))}</p>` : applied
      ? `<p class="m-applied">${ic('check')}<b>${esc(t('applied'))} · −${money(cfg.amount)}</b><button type="button" class="m-link" data-a="offer-remove" data-offer="${k}">${esc(t('remove'))}</button></p><p class="m-offer-note">${esc(t('offerCheck'))}</p>`
      : `<div class="m-offer-acts"><a class="m-btn" href="${esc(href)}" target="_blank" rel="noopener noreferrer" data-a="offer-go" data-offer="${k}">${ic(isI ? 'insta' : 'google')}${esc(isI ? t('instaBtn') : t('reviewBtn'))}</a>
         <label class="m-check${S.go[k] ? '' : ' is-off'}"><input type="checkbox" data-a="offer-ok" data-offer="${k}" ${S.ok[k] ? 'checked' : ''} ${S.go[k] ? '' : 'disabled'}><span>${esc(isI ? t('instaConfirm', { handle }) : t('reviewConfirm'))}</span></label>
         <button type="button" class="m-btn m-btn-accent" data-a="offer-apply" data-offer="${k}" ${S.ok[k] ? '' : 'disabled'}>${esc(t('applyOffer'))} −${money(cfg.amount)}</button></div>`;
    return `<article class="m-offer${applied ? ' is-on' : ''}" data-offer="${k}"><span class="m-offer-ic m-${k}">${ic(isI ? 'insta' : 'google')}</span><div class="m-offer-b"><h3>${esc(title)}</h3><p>${esc(sub)}</p>${acts}</div></article>`;
  };
  return `<div class="m-offers m-offers-${where}">${list.map(card).join('')}${list.length > 1 ? `<p class="m-offer-rule">${esc(o.mode === 'both' ? t('offerBoth') : t('offerOne'))}</p>` : ''}</div>`;
}
function offersSheet() { openLayer(`<h2 id="m17SheetTitle" class="m-sh-title">${esc(t('offersTitle'))}</h2>${offerCards('sheet') || `<p class="m-about">${esc(t('offerUsed'))}</p>`}`, 'offers'); }
function selected() {
  const avail = offerList(); let sel = [...S.offers].filter(k => avail.includes(k));
  if (C.offers.mode === 'one' && sel.length > 1) sel = [sel[sel.length - 1]];
  return sel;
}
function discountFor(total) { const sum = selected().reduce((n, k) => n + C.offers[k].amount, 0); return sum > 0 && sum <= total ? r2(sum) : 0; }
const rawTotal = () => { try { return orig.cartTotal ? orig.cartTotal() : 0; } catch { return 0; } };

/* ---------- clicks ---------- */
function share(i) {
  const text = i.name + ' at ' + restaurantName();
  if (navigator.share) navigator.share({ title: restaurantName(), text }).catch(() => {});
  else { try { navigator.clipboard.writeText(text); flash('Copied'); } catch { /* blocked */ } }
}
function flash(msg) { let f = byId('m17Flash'); if (!f) { f = document.createElement('div'); f.id = 'm17Flash'; f.setAttribute('role', 'status'); document.body.append(f); } f.textContent = msg; f.classList.remove('show'); void f.offsetWidth; f.classList.add('show'); }
function onClick(e) {
  const el = e.target.closest('[data-a]'); if (!el || !(root.contains(el) || layer.contains(el) || el.closest('#m17CartOffers'))) return;
  const a = el.dataset.a, id = el.dataset.id;
  if (a === 'offer-go') { S.go[el.dataset.offer] = true; setTimeout(repaintOffers, 400); return; }
  if (a === 'offer-ok') { S.ok[el.dataset.offer] = el.checked; repaintOffers(); return; }
  if (el.tagName === 'INPUT' && a !== 'size' && a !== 'sortpick') return;
  switch (a) {
    case 'add': { const i = findItem(id); if (!i) return; if (isSized(i)) dishSheet(id); else { updateQty(i.id, 1, null); bump(); } break; }
    case 'inc': { const i = findItem(id); if (!i) return; if (isSized(i)) { const l = lines(id); dishSheet(id, l.length ? l[l.length - 1].size : null); } else updateQty(i.id, 1, null); break; }
    case 'dec': { const l = lines(id); if (l.length === 1) updateQty(l[0].item.id, -1, l[0].size || null); else if (l.length > 1) { if (typeof openCartDrawer === 'function') openCartDrawer(); } break; }
    case 'open': dishSheet(id); break;
    case 'save': { const k = String(id); if (S.saved.has(k)) S.saved.delete(k); else S.saved.add(k); store.set('m17-saved', [...S.saved]); if (!S.saved.size) S.f.delete('saved'); schedule(); if (S.sheet) { const ic2 = layer.querySelector('[data-a="save"]'); if (ic2) { const on2 = S.saved.has(k); ic2.classList.toggle('on', on2); ic2.setAttribute('aria-pressed', String(on2)); ic2.innerHTML = ic(on2 ? 'markOn' : 'mark'); } } break; }
    case 'share': { const i = findItem(id); if (i) share(i); break; }
    case 'size': S.sheet.size = el.value; S.sheet.note = byId('m17Note') ? byId('m17Note').value : S.sheet.note; refreshSheet(); break;
    case 'sq-': S.sheet.qty = Math.max(1, S.sheet.qty - 1); refreshSheet(); break;
    case 'sq+': { const i = findItem(S.sheet.id), l = left(i, S.sheet.size), inCart = (cart[keyOf(S.sheet.id, S.sheet.size)] || {}).qty || 0; if (S.sheet.qty + inCart < Math.min(50, l)) { S.sheet.qty++; refreshSheet(); } else flash(t('onlyLeft', { n: Math.max(0, Math.min(50, l) - inCart) })); break; }
    case 'sheet-add': sheetAdd(); break;
    case 'close': closeLayer(); break;
    case 'fold': { const c = el.dataset.cat; if (C.L.folded) { if (S.open.has(c)) S.open.delete(c); else S.open.add(c); } else if (S.closed.has(c)) S.closed.delete(c); else S.closed.add(c); render(); break; }
    case 'jump': closeLayer(); jump(el.dataset.cat); break;
    case 'cats': catsSheet(); break;
    case 'search': openSearch(); break;
    case 'search-close': closeSearch(); break;
    case 'search-clear': { const q = byId('m17Q'); q.value = ''; S.q = ''; byId('m17QClear').hidden = true; q.focus(); render(); break; }
    case 'filter': { const f = el.dataset.f; if (S.f.has(f)) S.f.delete(f); else { S.f.add(f); if (f === 'veg') S.f.delete('nonveg'); if (f === 'nonveg') S.f.delete('veg'); } render(); break; }
    case 'sort': sortSheet(); break;
    case 'sortpick': S.sort = el.value; render(); break;
    case 'clear': S.f.clear(); S.sort = 'default'; if (S.q) closeSearch(); closeLayer(); render(); break;
    case 'about': aboutSheet(); break;
    case 'offers': offersSheet(); break;
    case 'offer-apply': { const k = el.dataset.offer; if (!S.ok[k]) return; if (C.offers.mode === 'one') S.offers.clear(); S.offers.add(k); repaintOffers(); flash(t('applied')); break; }
    case 'offer-remove': S.offers.delete(el.dataset.offer); repaintOffers(); break;
    case 'orders': if (typeof openTrackingModal === 'function') openTrackingModal(); break;
    default: break;
  }
}
document.addEventListener('input', e => { if (e.target.id === 'm17Note') { const n = byId('m17NoteN'); if (n) n.textContent = e.target.value.length; if (S.sheet) S.sheet.note = e.target.value; } });
document.addEventListener('change', e => { const el = e.target.closest && e.target.closest('#m17CartOffers [data-a="offer-ok"]'); if (el) { S.ok[el.dataset.offer] = el.checked; repaintOffers(); } });
function repaintOffers() {
  if (layer && !layer.hidden && layer.dataset.kind === 'offers') { const b = byId('m17SheetBody'); const html = `<h2 id="m17SheetTitle" class="m-sh-title">${esc(t('offersTitle'))}</h2>${offerCards('sheet') || `<p class="m-about">${esc(t('offerUsed'))}</p>`}`; b.innerHTML = html; }
  if (typeof updateCartUI === 'function') updateCartUI();
}

/* ---------- cart, totals, offers and order hooks (live menu only) ---------- */
const orig = {};
function paintCart() {
  const bar = byId('floatingCartBar'); if (!bar || !document.body.classList.contains('m17-on')) return;
  const n = Object.values(typeof cart === 'object' ? cart : {}).reduce((s, l) => s + l.qty, 0);
  const c = byId('cartItemsCount'); if (c && n) c.textContent = t(n === 1 ? 'itemAdded' : 'itemsAdded', { n });
  const v = bar.querySelector('.view-cart-btn-text span:first-child'); if (v) v.textContent = t('viewCart');
  const p = byId('m17Pill'); if (p) p.classList.toggle('lifted', n > 0);
  if (PREVIEW) return;
  const raw = orig.cartTotal ? orig.cartTotal() : 0, d = discountFor(raw), total = r2(raw - d);
  const tp = byId('cartTotalPrice'); if (tp && n) tp.textContent = money(total);
  const pa = byId('placeOrderAmount'); if (pa) pa.textContent = cur() + total;
  const bt = byId('billTotal'); if (bt) bt.textContent = cur() + total;
  const summary = document.querySelector('#cartDrawer .bill-summary');
  if (summary) {
    let row = byId('m17OfferRow');
    if (!row) { row = document.createElement('div'); row.className = 'bill-row m17-offer-row'; row.id = 'm17OfferRow'; row.innerHTML = '<span></span><span></span>'; const tot = summary.querySelector('.bill-row.total'); summary.insertBefore(row, tot || null); }
    row.hidden = !(d > 0); row.children[0].textContent = t('offerDiscount'); row.children[1].textContent = '−' + money(d);
    let box = byId('m17CartOffers');
    if (!box) { box = document.createElement('section'); box.id = 'm17CartOffers'; box.className = 'm17-cart-offers'; box.addEventListener('click', onClick); summary.before(box); }
    const html = C.show.offers && n ? offerCards('cart') : '';
    if (box._h !== html) { box.innerHTML = html; box._h = html; }
    box.hidden = !html;
  }
  for (const row of document.querySelectorAll('#cartItemsList .cart-item-row')) {
    const b = row.querySelector('[data-qty]'); if (!b) continue;
    const note = S.notes[keyOf(b.dataset.item, b.dataset.size || null)];
    let p2 = row.querySelector('.m17-line-note');
    if (note) { if (!p2) { p2 = document.createElement('p'); p2.className = 'm17-line-note'; row.querySelector('.cart-item-info').append(p2); } p2.textContent = '“' + note + '”'; } else if (p2) p2.remove();
  }
}
function noteLines() {
  const out = [];
  for (const [key, l] of Object.entries(cart)) { const n = S.notes[key]; if (n) out.push((typeof lineName === 'function' ? lineName(l) : l.item.name) + ': ' + n); }
  return out;
}
function hook() {
  if (PREVIEW || hook.done) return; hook.done = true;
  for (const f of ['renderMenuItems', 'renderCategories', 'selectCategory', 'handleSearch', 'updateCartUI', 'cartTotal', 'placeOrder', 'openCartDrawer']) orig[f] = window[f];
  window.renderMenuItems = function () { if (!C.enabled) return orig.renderMenuItems.apply(this, arguments); schedule(); };
  window.renderCategories = function () { if (!C.enabled) return orig.renderCategories.apply(this, arguments); schedule(); };
  window.handleSearch = function () { if (!C.enabled) return orig.handleSearch.apply(this, arguments); schedule(); };
  window.selectCategory = function (cat) { if (!C.enabled) return orig.selectCategory.apply(this, arguments); if (cat === 'Best Sellers') { S.f.add('best'); render(); } else if (cat === 'Recommended') { S.f.add('rec'); render(); } else if (cat && cat !== 'All') jump(cat); };
  window.updateCartUI = function () { const r = orig.updateCartUI.apply(this, arguments); try { if (C.enabled) { paintCart(); const n = Object.keys(cart).length; if (!n) for (const k of Object.keys(S.notes)) if (!cart[k]) delete S.notes[k]; } } catch (err) { console.warn('[menu] cart paint', err); } return r; };
  window.cartTotal = function () { const raw = orig.cartTotal.apply(this, arguments); return C.enabled ? r2(raw - discountFor(raw)) : raw; };
  let next = null, lastError = null;
  window.placeOrder = async function () {
    const field = byId('custNotesInput'); let userNote = null;
    if (!pendingAttempt && Object.keys(cart).length) {
      const raw = orig.cartTotal(), d = C.enabled ? discountFor(raw) : 0; next = { offers: d > 0 ? selected() : [], discount: d };
      const extra = noteLines(); if (extra.length && field) { userNote = field.value; field.value = [userNote.trim(), ...extra].filter(Boolean).join('\n').slice(0, 1000); }
    } else next = null;
    lastError = null;
    try { await orig.placeOrder.apply(this, arguments); } finally {
      const ok = !pendingAttempt && !Object.keys(cart).length && !lastError;
      if (userNote !== null && !ok && field) field.value = userNote;
      if (ok) { if (next && next.offers.length) markUsed(next.offers); S.offers.clear(); S.notes = {}; saveNotes(); }
      if (lastError && /offer/i.test(lastError)) {
        if (/already used/i.test(lastError) && next) markUsed(next.offers);
        S.offers.clear(); pendingAttempt = null; try { Cloud.remove(attemptKey()); } catch { /* storage */ }
        const pr = byId('pendingRetry'); if (pr) pr.hidden = true;
        const btn = byId('btnPlaceOrder'); if (btn) btn.innerHTML = `<span>Place Order</span><span id="placeOrderAmount">${esc(cur())}${cartTotal()}</span>`;
      }
      if (lastError && /Total changed/i.test(lastError) && window.Custom48) Custom48.sync(true).catch(() => {});
      next = null; updateCartUI(); schedule();
    }
  };
  if (typeof Cloud !== 'undefined' && typeof Cloud.rpc === 'function') {
    const rpc = Cloud.rpc;
    Cloud.rpc = async function (name, args, ...rest) {
      if (name !== 'restaurant_place_order_v13') return rpc.call(this, name, args, ...rest);
      const a = typeof pendingAttempt !== 'undefined' ? pendingAttempt : null;
      if (a && a.request_id === args.p_request_id && a.m17 === undefined) { a.m17 = next || { offers: [], discount: 0 }; try { Cloud.write(attemptKey(), a); } catch { /* storage */ } }
      const off = a && a.m17;
      try {
        if (!off || !off.offers || !off.offers.length) return await rpc.call(this, name, args, ...rest);
        return await rpc.call(this, 'restaurant_place_order_v17', { ...args, p_offers: off.offers }, ...rest);
      } catch (err) {
        let msg = err && err.message || String(err);
        if (off && off.offers && off.offers.length && /restaurant_place_order_v17|PGRST202|schema cache|Could not find the function/i.test(msg)) msg = 'Offers are not ready yet. The offer was removed — please place the order again.';
        lastError = msg; throw Error(msg);
      }
    };
  }
}

/* ---------- start ---------- */
let lastCustom = null;
function watch() {
  setInterval(() => { const c = custom(); if (c !== lastCustom) { lastCustom = c; schedule(); } const o = byId('m17OrdersBtn'), bar = byId('customerOrdersBar'); if (o && bar && o.hidden !== (!C.show.orders || bar.hidden)) renderActions(); }, 700);
  addEventListener('resize', () => requestAnimationFrame(measure), { passive: true });
}
if (PREVIEW) {
  addEventListener('message', e => {
    if (e.origin !== location.origin || !e.data || e.data.type !== 'm17-preview') return;
    P = e.data.payload || {}; window.__m17Preview = P; heroSig = '';
    if (root) { for (const id of ['m17Filters', 'm17Chips', 'm17Rail', 'm17Tiles', 'm17Spot', 'm17Mini']) { const n = byId(id); if (n) n._h = null; } }
    render();
  });
  window.M17 = { render: () => render(), get conf() { return C; } };
  document.addEventListener('DOMContentLoaded', () => { shell(); render(); try { parent.postMessage({ type: 'm17-preview-ready' }, location.origin); } catch { /* not framed */ } });
} else {
  if (!cached || !cached.m17 || cached.m17.enabled !== false) document.body.classList.add('m17-on');
  hook();
  document.addEventListener('DOMContentLoaded', () => { lastCustom = custom(); render(); watch(); });
  window.M17 = { render: () => render(), get conf() { return C; }, state: () => ({ offers: selected(), raw: rawTotal(), discount: discountFor(rawTotal()), notes: S.notes }) };
}
})();

