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
 function requireConfig(){if(!configured)throw Error('Cloud not configured. The owner must upload config.js with the Supabase Project URL and PUBLIC key.');}
 async function request(path,{method='GET',body,staff=false,headers={}}={}) {
  requireConfig();
  if(staff){if(!session)throw Error('Please sign in as staff.');if(session.expires_at*1000<Date.now()+60000)await refresh();}
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),15000);
  try {
   const res=await fetch(url+path,{method,headers:{apikey:key,...(staff?{Authorization:'Bearer '+session.access_token}:key.startsWith('eyJ')?{Authorization:'Bearer '+key}:{}),'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal,cache:'no-store'});
   const text=await res.text();let data;try{data=JSON.parse(text);}catch{data=text;}
   if(!res.ok)throw Error(data?.message||data?.msg||data?.error_description||data?.error||('Cloud request failed (HTTP '+res.status+').'));
   return data;
  }catch(e){if(e.name==='AbortError')throw Error('Cloud request timed out. Check your connection and retry.');throw e;}finally{clearTimeout(timer);}
 }
 function saveSession(s){session={...s,expires_at:s.expires_at||Math.floor(Date.now()/1000)+(s.expires_in||3600)};sessionStorage.setItem('RESTAURANT_STAFF_SESSION_v3',JSON.stringify(session));return session;}
 async function refresh(){if(!refreshPromise)refreshPromise=request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token}}).then(saveSession).catch(e=>{session=null;try{sessionStorage.removeItem('RESTAURANT_STAFF_SESSION_v3');}catch{}throw e;}).finally(()=>refreshPromise=null);return refreshPromise;}
 async function login(email,password){return saveSession(await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}}));}
 async function logout(){try{if(session)await request('/auth/v1/logout',{method:'POST',staff:true});}finally{session=null;sessionStorage.removeItem('RESTAURANT_STAFF_SESSION_v3');orderCache=null;}}
 const menuCache={};let orderCache=null;
 async function orders(){
  const revision=await request('/rest/v1/orders?select=id,updated_at&order=updated_at.desc,id.desc&limit=1',{staff:true});
  const signature=JSON.stringify(revision);if(orderCache?.signature===signature)return orderCache.rows;
  const rows=await request('/rest/v1/orders?select=id,order_id,order_day,daily_number,created_at,table_number,customer_name,items,kitchen_notes,total,items_subtotal,tax_amount,tax_enabled,tax_mode,tax_value,status,cooking_started_at,rejection_reason,updated_at&status=in.(Pending,Accepted,Cooking,Ready)&order=created_at.asc&limit=1000',{staff:true});orderCache={signature,rows};return rows;
 }
 async function menu(staff){
  if(!staff){const access=await TableAccess.credentials(false);return rpc('restaurant_customer_menu',{...access,p_table:currentTable});}
 const mode=staff?'staff':'public';
  const revision=await request('/rest/v1/menu_items?select=id,updated_at,available&order=id.asc',{staff:!!staff});
  const signature=JSON.stringify(revision);
  if(menuCache[mode]?.signature===signature)return menuCache[mode].rows;
  const rows=await request('/rest/v1/menu_items?select=*&order=name.asc',{staff:!!staff});menuCache[mode]={signature,rows};return rows;
 }
 const rpc=(name,body,staff=false)=>request('/rest/v1/rpc/'+name,{method:'POST',body,staff});
 const categories=['All', 'Heart Shape Pizza', 'New Pizza Flavours', 'Pizza', 'Hot Lava Cake', 'Kurkure Momos', 'Chutney & Dips', 'Drinks (Beverages)'];
 const normalizeCategory=v=>String(v||'').trim();
 const setCategories=names=>{categories.splice(0,categories.length,'All',...names);};
 function menuRow(item){return {id:String(item.id??crypto.randomUUID()),name:String(item.name||'').slice(0,120),price:Number(item.price)||0,category:normalizeCategory(item.category),description:String(item.description??item.desc??'').slice(0,1000),image:safeImage(item.photo||item.image||''),veg:item.veg!==false,available:item.available!==false,recommended:item.recommended===true,best_seller:item.best_seller===true,updated_at:new Date().toISOString()};}
 const orderLabel=o=>Number.isSafeInteger(Number(o?.daily_number))&&Number(o.daily_number)>0?'Order no. '+Number(o.daily_number):'Order number pending sync';
 return {cfg,configured,orderLabel,esc,safeImage,read,write,categories,setCategories,normalizeCategory,menuRow,rpc,request,login,logout,hasSession:()=>!!session,
  mfaFactors:async()=>{const user=await request('/auth/v1/user',{staff:true});return (user.factors||[]).filter(f=>f.factor_type==='totp');},
  mfaEnroll:()=>request('/auth/v1/factors',{method:'POST',body:{factor_type:'totp',friendly_name:'Pizza With Yaar admin '+new Date().toISOString(),issuer:'Pizza With Yaar'},staff:true}),
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
  saveMenu:rows=>request('/rest/v1/menu_items?on_conflict=id',{method:'POST',body:rows,staff:true,headers:{Prefer:'resolution=merge-duplicates,return=representation'}}),
  patchMenu:(id,body)=>request('/rest/v1/menu_items?id=eq.'+encodeURIComponent(id),{method:'PATCH',body,staff:true,headers:{Prefer:'return=representation'}}),
  deleteMenu:id=>request('/rest/v1/menu_items?id=eq.'+encodeURIComponent(id),{method:'DELETE',staff:true}),
  orders,invalidateOrders:()=>{orderCache=null;},
  records:(period,reference,offset=0,limit=50)=>rpc('restaurant_records',{p_period:period,p_reference:reference||null,p_offset:offset,p_limit:limit},true),
  songs:()=>request('/rest/v1/song_requests?select=id,queue_no,created_at,updated_at,table_number,title,artist,song_url,status&status=in.(Queued,Playing)&order=queue_no.asc&limit=500',{staff:true}),
  playedSongs:()=>request('/rest/v1/song_requests?select=id,queue_no,created_at,finished_at,table_number,title,artist,status&status=eq.Played&order=finished_at.desc&limit=20',{staff:true})
 };
})();
