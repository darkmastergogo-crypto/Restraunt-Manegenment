/* Release 73 — advanced manual billing settings.
   Additive management UI for the server-authoritative billing73 SQL layer. */
(() => {
 'use strict';
 const esc=v=>Cloud.esc(String(v??''));
 const root=()=>document.getElementById('managementSection');
 let built=false,loaded=false,busy=false,data=null;
 function missing(e){return /restaurant_billing_settings73|schema cache|PGRST202|Could not find the function/i.test(e?.message||'');}
 function panel(){
  let p=document.getElementById('billingAdvanced73Settings');if(p)return p;
  p=document.createElement('section');p.id='billingAdvanced73Settings';p.className='panel billing73-settings';
  p.innerHTML=`<div class="page-tools"><div><h3>Advanced counter billing</h3><p class="hint">Billing-grade discounts, cash/change and optional customer details. QR customer orders are not changed.</p></div><span class="badge73" id="billing73Badge">Checking…</span></div>
   <form id="billing73SettingsForm" class="billing73-settings-grid">
    <label>Maximum discount (%)<input name="max_discount_percent" type="number" min="0" max="100" step="0.01" inputmode="decimal" required></label>
    <label>Maximum short cash (${esc(Cloud.cfg.currency||'₹')})<input name="max_cash_short" type="number" min="0" max="999999.99" step="0.01" inputmode="decimal" required></label>
    <label class="waiter-permission"><input name="round_nearest_rupee" type="checkbox"> Round manual bill total to nearest ₹1</label>
    <label class="waiter-permission"><input name="ask_customer_phone" type="checkbox"> Show customer phone on manual billing</label>
    <label class="waiter-permission"><input name="ask_customer_address" type="checkbox"> Show customer address on manual billing</label>
    <div class="toolbar billing73-save"><button class="primary-btn" type="submit">Save billing controls</button><button class="secondary-btn" type="button" data-billing73-reload>Reload</button></div>
    <p id="billing73SettingsStatus" class="hint" role="status"></p>
   </form>`;
  root()?.append(p);built=true;
  p.querySelector('[data-billing73-reload]').onclick=()=>load(true);
  p.querySelector('form').onsubmit=save;
  return p;
 }
 function paint(){
  const p=panel(),f=p.querySelector('form'),badge=document.getElementById('billing73Badge');if(!data)return;
  for(const name of ['max_discount_percent','max_cash_short'])f.elements[name].value=data[name]??0;
  for(const name of ['round_nearest_rupee','ask_customer_phone','ask_customer_address'])f.elements[name].checked=!!data[name];
  const can=data.can_manage!==false;for(const c of f.elements)c.disabled=!can;badge.textContent=can?'Server enforced':'Read only';badge.dataset.state=can?'ok':'muted';
 }
 async function load(force=false){
  if(busy||loaded&&!force)return data;panel();busy=true;const st=document.getElementById('billing73SettingsStatus');if(st)st.textContent='Loading billing controls…';
  try{data=await Cloud.rpc('restaurant_billing_settings73',{p_action:'get',p:{}},true);loaded=true;paint();if(st)st.textContent='Discount, rounding and cash limits are enforced by Supabase.';return data;}
  catch(e){if(st)st.textContent=missing(e)?'Install SUPABASE/7-RUN-THIS-NOW (release 73 business parity).sql to enable these controls.':e.message;const b=document.getElementById('billing73Badge');if(b)b.textContent='SQL required';return null;}
  finally{busy=false;}
 }
 async function save(e){
  e.preventDefault();if(busy)return;const f=e.currentTarget,st=document.getElementById('billing73SettingsStatus');busy=true;for(const c of f.elements)c.disabled=true;st.textContent='Saving…';
  const payload={max_discount_percent:f.elements.max_discount_percent.value,max_cash_short:f.elements.max_cash_short.value,round_nearest_rupee:f.elements.round_nearest_rupee.checked,ask_customer_phone:f.elements.ask_customer_phone.checked,ask_customer_address:f.elements.ask_customer_address.checked};
  try{data=await Cloud.rpc('restaurant_billing_settings73',{p_action:'save',p:payload},true);loaded=true;paint();st.textContent='Saved. New manual bills use these limits immediately.';}
  catch(err){st.textContent=missing(err)?'Release 73 billing SQL is not installed.':err.message;}
  finally{busy=false;if(data)paint();}
 }
 function init(){panel();let tries=0;const t=setInterval(()=>{tries++;if((typeof loggedIn!=='undefined'&&loggedIn)||(typeof staffRole!=='undefined'&&staffRole)||tries>120){clearInterval(t);load().catch(()=>{});}},400);}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
 window.Billing73Settings={load,get data(){return data;}};
})();
