/* Same-origin session handoff: never exposes tokens in URLs or messages. */
(()=>{
 const url=SHOP_CONFIG.supabaseUrl.replace(/\/$/,'');
 const target='SHOPBILL_SESSION:'+url;
 if(localStorage.getItem(target))return;
 const key='YUMMY46:'+url+':public-device:RESTAURANT_STAFF_SESSION_v3';
 try{const raw=sessionStorage.getItem(key),s=raw&&JSON.parse(raw);if(s?.access_token&&s?.refresh_token&&s?.user?.id)localStorage.setItem(target,JSON.stringify(s));}catch{}
})();
