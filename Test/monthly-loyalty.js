/* Server-derived India-calendar loyalty; no client-side order counting or fingerprinting. */
'use strict';
const MonthlyLoyalty=(()=>{
 let badges=new Map(),month='',verifiedAt=0,lastScope='';
 function indiaMonth(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit'}).format(new Date()).replace('/','-');}
 async function refresh(rows,key=null){if(!rows.length){badges.clear();verifiedAt=0;lastScope='';return;}const scope=String(key||'staff')+JSON.stringify(rows.map(o=>[o.id,o.status]));if(scope===lastScope&&Date.now()-verifiedAt<30000)return;try{const r=await Cloud.rpc('restaurant_order_loyalty',{p_ids:rows.map(o=>o.id).slice(0,1000),p_key:key},!key);month=r.month;badges=new Map((r.orders||[]).map(o=>[o.id,o]));verifiedAt=Date.now();lastScope=scope;}catch{badges.clear();verifiedAt=0;}}
 function star(id){return verifiedAt&&Date.now()-verifiedAt<120000&&month===indiaMonth()&&badges.get(id)?.is_star===true;}
 function badge(id){return star(id)?'<span class="monthly-star" title="Ordered on at least 4 distinct days this month">★ Monthly regular</span>':'';}
 document.addEventListener('restaurant-private-cache-clear',()=>{badges.clear();verifiedAt=0;lastScope='';});
 return {refresh,star,badge};
})();
