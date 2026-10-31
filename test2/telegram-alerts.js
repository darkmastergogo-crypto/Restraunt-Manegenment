/* Release 67 — Telegram alerts (admin-only, Management tab).
   Needs SUPABASE/"3-RUN-FOR-TELEGRAM (update 67).sql". */
'use strict';
let telegramSettingsBusy=false;
const TELEGRAM_NEED_SQL='Run SUPABASE/“3-RUN-FOR-TELEGRAM (update 67).sql” in Supabase, then refresh this page.';
const telegramMissing=e=>/restaurant_telegram_|schema cache|PGRST202|Could not find the function/i.test(e?.message||'');
function telegramEl(id){return document.getElementById(id);}
function telegramBusy(on){
 telegramSettingsBusy=on;
 for(const b of document.querySelectorAll('#telegramAlertsPanel button,#telegramAlertsPanel input,#telegramAlertsPanel select'))b.disabled=on;
}
function telegramStatus(id,text){const el=telegramEl(id);if(el)el.textContent=text||'';}
function telegramApply(s){
 const token=telegramEl('telegramBotToken'),enabled=telegramEl('telegramEnabled');
 if(token){token.value='';token.placeholder=s.token_set?`Token saved (bot ${s.token_hint||''}) — enter new to replace`:'Paste the bot token from @BotFather';}
 if(enabled)enabled.checked=s.enabled===true;
 const notes=[];if(s.pg_net===false)notes.push('pg_net is off: enable it in Supabase → Database → Extensions.');if(s.pg_cron===false)notes.push('pg_cron is off: enable it in Supabase → Database → Extensions, then run update 67 again.');
 const warn=telegramEl('telegramSetupWarning');if(warn){warn.hidden=!notes.length;warn.textContent=notes.join(' ');}
 renderTelegramRecipients(s.recipients||[]);
}
async function loadTelegramSettings(){
 if(typeof staffRole==='undefined'||staffRole!=='admin')return;
 if(!telegramEl('telegramAlertsPanel')||telegramSettingsBusy)return;
 telegramBusy(true);
 try{const s=await Cloud.rpc('restaurant_telegram_settings',{p_bot_token:null,p_enabled:null,p_send_test:false},true);telegramApply(s);telegramStatus('telegramConfigStatus','');}
 catch(e){telegramStatus('telegramConfigStatus',telegramMissing(e)?TELEGRAM_NEED_SQL:e.message);}
 finally{telegramBusy(false);}
}
async function saveTelegramConfig(event){
 event?.preventDefault();if(telegramSettingsBusy)return;
 const token=telegramEl('telegramBotToken').value.trim(),enabled=telegramEl('telegramEnabled').checked;
 if(token&&!/^[0-9]{5,15}:[A-Za-z0-9_-]{30,60}$/.test(token)){telegramStatus('telegramConfigStatus','That does not look like a bot token. It looks like 123456789:ABCdef… (from @BotFather).');return;}
 telegramBusy(true);telegramStatus('telegramConfigStatus','Saving…');
 try{const s=await Cloud.rpc('restaurant_telegram_settings',{p_bot_token:token||null,p_enabled:enabled,p_send_test:false},true);telegramApply(s);telegramStatus('telegramConfigStatus',s.enabled?'Saved. Alerts are ON.':'Saved. Alerts are OFF.');}
 catch(e){telegramStatus('telegramConfigStatus',telegramMissing(e)?TELEGRAM_NEED_SQL:e.message);}
 finally{telegramBusy(false);}
}
async function testTelegramAlert(){
 if(telegramSettingsBusy)return;telegramBusy(true);telegramStatus('telegramConfigStatus','Sending test…');
 try{const s=await Cloud.rpc('restaurant_telegram_settings',{p_bot_token:null,p_enabled:null,p_send_test:true},true);telegramApply(s);telegramStatus('telegramConfigStatus',`Test sent to ${s.test_sent} recipient${s.test_sent===1?'':'s'}. If someone did not get it, they must open your bot in Telegram and press Start first.`);}
 catch(e){telegramStatus('telegramConfigStatus',telegramMissing(e)?TELEGRAM_NEED_SQL:e.message);}
 finally{telegramBusy(false);}
}
function renderTelegramRecipients(recipients){
 const root=telegramEl('telegramRecipientList');if(!root)return;
 const esc=v=>Cloud.esc(String(v??''));
 const label={kitchen:'Kitchen',waiter:'Waiter',both:'Kitchen + waiter'};
 root.innerHTML=recipients.length?recipients.map(r=>`<article class="tg-card" data-telegram-id="${esc(r.id)}"><div class="tg-info"><strong>${esc(r.name)}</strong><span>Chat ID ${esc(r.chat_id)}</span></div><span class="tg-role tg-role-${esc(r.role)}">${esc(label[r.role]||r.role)}</span><div class="tg-actions"><button type="button" class="secondary-btn" data-telegram-edit="${esc(r.id)}" data-name="${esc(r.name)}" data-chat="${esc(r.chat_id)}" data-role="${esc(r.role)}">Edit</button><button type="button" class="danger-btn" data-telegram-remove="${esc(r.id)}">Remove</button></div></article>`).join(''):'<p class="hint">No recipients yet. Add the first person below.</p>';
}
async function addTelegramRecipient(event){
 event?.preventDefault();if(telegramSettingsBusy)return;
 const name=telegramEl('telegramNewName').value.trim(),chat=telegramEl('telegramNewChatId').value.trim(),role=telegramEl('telegramNewRole').value;
 if(!name){telegramStatus('telegramAddStatus','Enter a name.');return;}
 if(!/^(-?[0-9]{3,20}|@[A-Za-z0-9_]{5,32})$/.test(chat)){telegramStatus('telegramAddStatus','Chat ID must be a number like 123456789 (groups start with -100…) or @channelname.');return;}
 telegramBusy(true);telegramStatus('telegramAddStatus','Adding…');
 try{await Cloud.rpc('restaurant_telegram_add_recipient',{p_name:name,p_chat_id:chat,p_role:role},true);telegramEl('telegramAddForm').reset();telegramStatus('telegramAddStatus',`${name} added. Press “Send test to all” to check.`);}
 catch(e){telegramStatus('telegramAddStatus',telegramMissing(e)?TELEGRAM_NEED_SQL:e.message);}
 finally{telegramBusy(false);}
 await loadTelegramSettings();
}
document.addEventListener('click',async e=>{
 const remove=e.target.closest('[data-telegram-remove]');
 if(remove){
  if(telegramSettingsBusy)return;const name=remove.closest('.tg-card')?.querySelector('strong')?.textContent||'this recipient';
  if(!confirm(`Remove ${name} from Telegram alerts?`))return;
  telegramBusy(true);
  try{await Cloud.rpc('restaurant_telegram_remove_recipient',{p_id:remove.dataset.telegramRemove},true);telegramStatus('telegramAddStatus',`${name} removed.`);}
  catch(err){telegramStatus('telegramAddStatus',err.message);}
  finally{telegramBusy(false);}
  await loadTelegramSettings();return;
 }
 const edit=e.target.closest('[data-telegram-edit]');
 if(edit){
  if(telegramSettingsBusy)return;
  const name=prompt('Name',edit.dataset.name);if(name===null)return;
  const chat=prompt('Telegram chat ID',edit.dataset.chat);if(chat===null)return;
  const role=prompt('Alerts for: kitchen, waiter or both',edit.dataset.role);if(role===null)return;
  telegramBusy(true);
  try{await Cloud.rpc('restaurant_telegram_update_recipient',{p_id:edit.dataset.telegramEdit,p_name:name.trim(),p_chat_id:chat.trim(),p_role:role.trim().toLowerCase()},true);telegramStatus('telegramAddStatus','Recipient updated.');}
  catch(err){telegramStatus('telegramAddStatus',err.message);}
  finally{telegramBusy(false);}
  await loadTelegramSettings();
 }
});
