'use strict';
let categorySignature='';
async function loadStaffCategories(){
 const list=await Cloud.rpc('restaurant_categories',{p_action:'list',p_name:null,p_replacement:null,p_item:null},true);Cloud.setCategories(list.map(c=>c.name));
 const signature=JSON.stringify(list);if(signature!==categorySignature){categorySignature=signature;
  const select=document.getElementById('newItemCategory'),previous=select.value;select.replaceChildren(...list.map(c=>new Option(c.name,c.name)));if(list.some(c=>c.name===previous))select.value=previous;
  if(staffRole==='admin')document.getElementById('categoryList').innerHTML=list.map(c=>`<article class="table-management-card"><h4>${Cloud.esc(c.name)}</h4><p>${Number(c.dish_count)} dishes</p><label>Move dishes to (if removing)<select data-category-replacement>${list.filter(x=>x.name!==c.name).map(x=>`<option value="${Cloud.esc(x.name)}">${Cloud.esc(x.name)}</option>`).join('')}</select></label><button class="danger-btn" data-category-remove="${Cloud.esc(c.name)}">Remove category</button></article>`).join('');
 }
 return list;
}
async function addDishCategory(e){e.preventDefault();const b=document.getElementById('categoryAdd');b.disabled=true;try{await Cloud.rpc('restaurant_categories',{p_action:'add',p_name:document.getElementById('newCategoryName').value,p_replacement:null,p_item:null},true);document.getElementById('newCategoryName').value='';await loadStaffCategories();renderAdminMenu();document.getElementById('categoryStatus').textContent='Category added.';}catch(e){document.getElementById('categoryStatus').textContent=e.message;}finally{b.disabled=false;}}
document.addEventListener('click',async e=>{const b=e.target.closest('[data-category-remove]');if(!b)return;const name=b.dataset.categoryRemove,replacement=b.closest('article').querySelector('select').value;
 if(!confirm('Remove category “'+name+'”? Its existing dishes will move to “'+replacement+'”. No dishes or bills will be deleted.'))return;
 b.disabled=true;try{await Cloud.rpc('restaurant_categories',{p_action:'remove',p_name:name,p_replacement:replacement||null,p_item:null},true);await loadStaffCategories();await refreshCloud();document.getElementById('categoryStatus').textContent='Category removed.';}catch(e){document.getElementById('categoryStatus').textContent=e.message;}finally{b.disabled=false;}
});
document.addEventListener('change',async e=>{const select=e.target.closest('[data-dish-category]');if(!select)return;select.disabled=true;try{await Cloud.rpc('restaurant_categories',{p_action:'assign',p_name:null,p_replacement:select.value,p_item:select.dataset.dishCategory},true);await refreshCloud();showToast('Dish category updated.');}catch(e){showToast(e.message);renderAdminMenu();}finally{select.disabled=false;}});
async function loadTaxSettings(){if(staffRole!=='admin')return;const form=document.getElementById('taxForm');for(const input of form.elements)input.disabled=true;try{const s=await Cloud.rpc('restaurant_commerce_settings',{p_enabled:null,p_mode:null,p_value:null},true);document.getElementById('taxEnabled').checked=s.tax_enabled;document.getElementById('taxMode').value=s.tax_mode;document.getElementById('taxValue').value=s.tax_value;document.getElementById('taxStatus').textContent='';for(const input of form.elements)input.disabled=false;}catch(e){document.getElementById('taxStatus').textContent=e.message;}}
async function saveTaxSettings(e){e.preventDefault();const b=document.getElementById('taxSave'),value=Number(document.getElementById('taxValue').value),mode=document.getElementById('taxMode').value;if(!Number.isFinite(value)||value<0||value>100000||(mode==='percent'&&value>100)||Math.abs(value*100-Math.round(value*100))>0.00001){document.getElementById('taxStatus').textContent='Enter a valid amount with up to two decimals (percentage: 0–100).';return;}b.disabled=true;try{await Cloud.rpc('restaurant_commerce_settings',{p_enabled:document.getElementById('taxEnabled').checked,p_mode:mode,p_value:value},true);document.getElementById('taxStatus').textContent='Tax settings saved. Existing bills are unchanged.';}catch(e){document.getElementById('taxStatus').textContent=e.message;}finally{b.disabled=false;}}
function billTaxRows(o){if(!o.tax_enabled&&!(Number(o.tax_amount)>0))return '';return `<div class="receipt-row"><span>Items subtotal</span><span>${money(o.items_subtotal)}</span></div><div class="receipt-row"><span>${o.tax_mode==='percent'?'Tax ('+Number(o.tax_value)+'%)':'Tax (fixed)'}</span><span>${money(o.tax_amount)}</span></div>`;}

let footerSettingsBusy=false;
function footerWebUrl(value){
 const raw=value.trim();if(!raw)return '';
 if(raw.length>2048||/[\s<>"\\]/.test(raw))throw Error('Enter a valid http:// or https:// website link.');
 let url;try{url=new URL(raw);}catch{throw Error('Enter a valid http:// or https:// website link.');}
 if(!['http:','https:'].includes(url.protocol)||!/^https?:\/\//i.test(raw)||url.username||url.password||!url.hostname)throw Error('Enter a valid http:// or https:// website link without login details.');
 return raw;
}
function fillFooterSettings(s){document.getElementById('footerShowCredit').checked=!!s.show_credit;document.getElementById('footerShowLink').checked=!!s.show_link;document.getElementById('footerRedirectUrl').value=s.url||'';}
async function loadFooterSettings(){
 if(staffRole!=='admin'||footerSettingsBusy)return;footerSettingsBusy=true;
 const form=document.getElementById('footerSettingsForm'),status=document.getElementById('footerSettingsStatus');for(const input of form.elements)input.disabled=true;
 try{const s=await Cloud.rpc('restaurant_footer_settings',{p_show_credit:null,p_show_link:null,p_url:null},true);fillFooterSettings(s);status.textContent='';for(const input of form.elements)input.disabled=false;}
 catch(e){status.textContent=/restaurant_footer_settings|schema cache/.test(e.message)?'Footer setup missing: run SUPABASE/FIX-CURRENT-INSTALL.sql, then refresh.':e.message;}
 finally{footerSettingsBusy=false;}
}
async function saveFooterSettings(event){
 event.preventDefault();if(staffRole!=='admin'||footerSettingsBusy)return;
 const form=document.getElementById('footerSettingsForm'),status=document.getElementById('footerSettingsStatus');let url;
 try{url=footerWebUrl(document.getElementById('footerRedirectUrl').value);if(document.getElementById('footerShowLink').checked&&!url)throw Error('Add a website link before showing Click here.');}catch(e){status.textContent=e.message;return;}
 const args={p_show_credit:document.getElementById('footerShowCredit').checked,p_show_link:document.getElementById('footerShowLink').checked,p_url:url};footerSettingsBusy=true;for(const input of form.elements)input.disabled=true;
 try{fillFooterSettings(await Cloud.rpc('restaurant_footer_settings',args,true));status.textContent='Footer settings saved. Online menus update on their next refresh (normally within 30 seconds).';}
 catch(e){status.textContent=e.message;}
 finally{footerSettingsBusy=false;for(const input of form.elements)input.disabled=false;}
}
// ── Telegram Alerts — multi-recipient (admin-only) ─────────────────────────
// Append to the bottom of admin-controls.js

let telegramSettingsBusy = false;

// ── Load: fetch config + recipients list and render ──────────────────────────
async function loadTelegramSettings() {
  if (staffRole !== 'admin') return;
  if (telegramSettingsBusy) return;
  telegramSettingsBusy = true;
  const status = document.getElementById('telegramSettingsStatus');
  const tokenInput = document.getElementById('telegramBotToken');
  const enabledCheck = document.getElementById('telegramEnabled');
  const saveBtn = document.getElementById('telegramSaveConfig');
  const testBtn = document.getElementById('telegramTestBtn');
  tokenInput.disabled = true; enabledCheck.disabled = true;
  saveBtn.disabled = true; testBtn.disabled = true;
  try {
    const s = await Cloud.rpc('restaurant_telegram_settings', {
      p_bot_token: null, p_enabled: null, p_send_test: false
    }, true);
    enabledCheck.checked = !!s.enabled;
    tokenInput.value = '';
    tokenInput.placeholder = s.bot_token_set
      ? 'Token saved — enter new to replace (' + s.bot_token_hint + ')'
      : 'Paste token from @BotFather';
    status.textContent = '';
    renderTelegramRecipients(s.recipients || []);
    tokenInput.disabled = false; enabledCheck.disabled = false;
    saveBtn.disabled = false; testBtn.disabled = false;
  } catch (e) {
    status.textContent = /restaurant_telegram_settings|schema cache/.test(e.message)
      ? 'Telegram setup missing — run TELEGRAM-SELF-SERVE.sql in the Supabase SQL Editor, then refresh.'
      : e.message;
  } finally {
    telegramSettingsBusy = false;
  }
}

// ── Save config (token + enabled) ────────────────────────────────────────────
async function saveTelegramConfig(event) {
  event.preventDefault();
  if (staffRole !== 'admin' || telegramSettingsBusy) return;
  telegramSettingsBusy = true;
  const status = document.getElementById('telegramSettingsStatus');
  const tokenInput = document.getElementById('telegramBotToken');
  const enabledCheck = document.getElementById('telegramEnabled');
  const saveBtn = document.getElementById('telegramSaveConfig');
  const token = tokenInput.value.trim();
  if (token && !/^\d+:[A-Za-z0-9_-]{35,}$/.test(token)) {
    status.textContent = 'Invalid bot token — copy it from @BotFather exactly.';
    telegramSettingsBusy = false;
    return;
  }
  saveBtn.disabled = true;
  try {
    const s = await Cloud.rpc('restaurant_telegram_settings', {
      p_bot_token: token || null,
      p_enabled: enabledCheck.checked,
      p_send_test: false
    }, true);
    tokenInput.value = '';
    tokenInput.placeholder = s.bot_token_set
      ? 'Token saved — enter new to replace (' + s.bot_token_hint + ')'
      : 'Paste token from @BotFather';
    enabledCheck.checked = !!s.enabled;
    status.textContent = 'Telegram settings saved.';
  } catch (e) {
    status.textContent = e.message;
  } finally {
    saveBtn.disabled = false;
    telegramSettingsBusy = false;
  }
}

// ── Send test message to ALL recipients ──────────────────────────────────────
async function testTelegramAlert() {
  if (staffRole !== 'admin' || telegramSettingsBusy) return;
  telegramSettingsBusy = true;
  const btn = document.getElementById('telegramTestBtn');
  const status = document.getElementById('telegramSettingsStatus');
  btn.disabled = true;
  try {
    const s = await Cloud.rpc('restaurant_telegram_settings', {
      p_bot_token: null, p_enabled: null, p_send_test: true
    }, true);
    status.textContent = s.test_sent
      ? '✅ Test message sent to all recipients — check Telegram!'
      : 'Could not send: make sure the bot token is saved, Alerts Enabled is on, and at least one recipient is added.';
  } catch (e) {
    status.textContent = e.message;
  } finally {
    btn.disabled = false;
    telegramSettingsBusy = false;
  }
}

// ── Render the recipients list ────────────────────────────────────────────────
function renderTelegramRecipients(recipients) {
  const list = document.getElementById('telegramRecipientList');
  if (!recipients.length) {
    list.innerHTML = '<p class="hint" id="telegramNoRecipients">No recipients yet. Add one below.</p>';
    return;
  }
  list.innerHTML = recipients.map(r => `
    <article class="telegram-recipient-card" data-recipient-id="${Cloud.esc(r.id)}">
      <div class="telegram-recipient-info">
        <strong>${Cloud.esc(r.name)}</strong>
        <span class="hint">${Cloud.esc(r.chat_id)}</span>
        <span class="telegram-role-badge telegram-role-${Cloud.esc(r.role)}">${roleName(r.role)}</span>
      </div>
      <button class="danger-btn" data-telegram-remove="${Cloud.esc(r.id)}" type="button">Remove</button>
    </article>
  `).join('');
}
function roleName(role) {
  return role === 'kitchen' ? '🍳 Kitchen' : role === 'waiter' ? '🙋 Waiter' : '🔔 Both';
}

// ── Add recipient ─────────────────────────────────────────────────────────────
async function addTelegramRecipient(event) {
  event.preventDefault();
  if (staffRole !== 'admin') return;
  const nameEl = document.getElementById('telegramNewName');
  const chatEl = document.getElementById('telegramNewChatId');
  const roleEl = document.getElementById('telegramNewRole');
  const addBtn = document.getElementById('telegramAddBtn');
  const status = document.getElementById('telegramAddStatus');
  const name = nameEl.value.trim();
  const chatId = chatEl.value.trim();
  const role = roleEl.value;
  if (!name) { status.textContent = 'Enter a name.'; return; }
  if (!/^-?[0-9]{5,20}$/.test(chatId)) { status.textContent = 'Enter a valid chat ID (number like -1001234567890).'; return; }
  addBtn.disabled = true; status.textContent = '';
  try {
    await Cloud.rpc('restaurant_telegram_add_recipient', {
      p_name: name, p_chat_id: chatId, p_role: role
    }, true);
    nameEl.value = ''; chatEl.value = ''; roleEl.value = 'both';
    status.textContent = name + ' added.';
    // Reload full settings to refresh list
    await loadTelegramSettings();
    document.getElementById('telegramAddStatus').textContent = name + ' added.';
  } catch (e) {
    status.textContent = e.message;
  } finally {
    addBtn.disabled = false;
  }
}

// ── Remove recipient (event delegation) ──────────────────────────────────────
document.addEventListener('click', async e => {
  const btn = e.target.closest('[data-telegram-remove]');
  if (!btn || staffRole !== 'admin') return;
  const id = btn.dataset.telegramRemove;
  const card = btn.closest('[data-recipient-id]');
  const name = card?.querySelector('strong')?.textContent || 'This recipient';
  if (!confirm('Remove ' + name + ' from Telegram alerts?')) return;
  btn.disabled = true;
  const status = document.getElementById('telegramSettingsStatus');
  try {
    await Cloud.rpc('restaurant_telegram_remove_recipient', { p_id: id }, true);
    await loadTelegramSettings();
    document.getElementById('telegramSettingsStatus').textContent = name + ' removed.';
  } catch (e) {
    status.textContent = e.message;
    btn.disabled = false;
  }
});
// ════════════════════════════════════════════════════════════════
//  MENU IMPORT / EXPORT  (admin-only)
// ════════════════════════════════════════════════════════════════

// ── Visibility toggle ─────────────────────────────────────────
// Persisted in localStorage so it survives page refreshes.
const MENU_IO_HIDDEN_KEY = 'menuIOPanelHidden';

function menuIOPanelHidden() {
  try { return localStorage.getItem(MENU_IO_HIDDEN_KEY) === '1'; } catch { return false; }
}
function setMenuIOPanelHidden(v) {
  try { localStorage.setItem(MENU_IO_HIDDEN_KEY, v ? '1' : '0'); } catch {}
}

function toggleMenuIOPanel() {
  const hidden = !menuIOPanelHidden();
  setMenuIOPanelHidden(hidden);
  applyMenuIOVisibility();
}

function applyMenuIOVisibility() {
  const panel = document.getElementById('menuIOPanel');
  const btn   = document.getElementById('menuIOToggleBtn');
  if (!panel || !btn) return;
  const hidden = menuIOPanelHidden();
  panel.hidden = hidden;
  btn.textContent = hidden ? 'Show import / export' : 'Hide import / export';
}

// Called when the Menu tab opens (admin only).
function initMenuIO() {
  applyMenuIOVisibility();
}

// ── Helpers ───────────────────────────────────────────────────

function menuIOSlug(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'menu';
}

// CSV cell quoting (same pattern as order export)
function menuIOQuote(v) {
  const s = String(v ?? '');
  // Prefix formula-injection chars
  const safe = /^[=+@\-\t\r]/.test(s) ? "'" + s : s;
  return '"' + safe.replace(/"/g, '""') + '"';
}

// Build a clean export row from an item (strip server-only fields)
function menuIOExportItem(item, includeCategory) {
  const row = {
    name:        item.name        ?? '',
    price:       Number(item.price ?? 0),
    description: item.description ?? '',
    veg:         item.veg         !== false,
    available:   item.available   !== false,
    recommended: item.recommended === true,
    best_seller: item.best_seller  === true,
    sizes_enabled: item.sizes_enabled === true,
    size_prices: item.size_prices  ?? {},
    size_labels: item.size_labels  ?? {},
  };
  if (includeCategory) row.category = item.category ?? '';
  return row;
}

// ── Export ────────────────────────────────────────────────────

async function downloadMenuJSON(includeCategory) {
  const btn = document.getElementById(includeCategory ? 'menuExportJsonCat' : 'menuExportJsonNoCat');
  if (btn) btn.disabled = true;
  try {
    const result = await Cloud.rpc('restaurant_menu_export', {}, true);
    if (result?.error) throw new Error(result.error);
    const items = (result?.items ?? []).map(i => menuIOExportItem(i, includeCategory));
    const payload = includeCategory
      ? { categories: result?.categories ?? [], items }
      : { items };
    const slug = menuIOSlug(config.restaurantName);
    const suffix = includeCategory ? '-with-categories' : '';
    download(`${slug}-menu${suffix}.json`, JSON.stringify(payload, null, 2), 'application/json');
    document.getElementById('menuIOStatus').textContent = `Downloaded ${items.length} dish${items.length !== 1 ? 'es' : ''} as JSON.`;
  } catch (e) {
    document.getElementById('menuIOStatus').textContent = 'Export failed: ' + e.message;
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function downloadMenuCSV(includeCategory) {
  const btn = document.getElementById(includeCategory ? 'menuExportCsvCat' : 'menuExportCsvNoCat');
  if (btn) btn.disabled = true;
  try {
    const result = await Cloud.rpc('restaurant_menu_export', {}, true);
    if (result?.error) throw new Error(result.error);
    const items = result?.items ?? [];
    const headers = includeCategory
      ? ['name','category','price','description','veg','available','recommended','best_seller','sizes_enabled','size_prices_json','size_labels_json']
      : ['name','price','description','veg','available','recommended','best_seller','sizes_enabled','size_prices_json','size_labels_json'];
    const rows = items.map(i => {
      const base = [
        menuIOQuote(i.name),
        ...(includeCategory ? [menuIOQuote(i.category)] : []),
        menuIOQuote(Number(i.price ?? 0).toFixed(2)),
        menuIOQuote(i.description ?? ''),
        menuIOQuote(i.veg !== false ? 'true' : 'false'),
        menuIOQuote(i.available !== false ? 'true' : 'false'),
        menuIOQuote(i.recommended === true ? 'true' : 'false'),
        menuIOQuote(i.best_seller === true ? 'true' : 'false'),
        menuIOQuote(i.sizes_enabled === true ? 'true' : 'false'),
        menuIOQuote(JSON.stringify(i.size_prices ?? {})),
        menuIOQuote(JSON.stringify(i.size_labels ?? {})),
      ];
      return base.join(',');
    });
    const csv = '﻿' + headers.map(menuIOQuote).join(',') + '\r\n' + rows.join('\r\n');
    const slug = menuIOSlug(config.restaurantName);
    const suffix = includeCategory ? '-with-categories' : '';
    download(`${slug}-menu${suffix}.csv`, csv, 'text/csv');
    document.getElementById('menuIOStatus').textContent = `Downloaded ${items.length} dish${items.length !== 1 ? 'es' : ''} as CSV.`;
  } catch (e) {
    document.getElementById('menuIOStatus').textContent = 'Export failed: ' + e.message;
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ── Import — file picker & parse ──────────────────────────────

function openMenuImport() {
  const input = document.getElementById('menuImportFile');
  if (input) { input.value = ''; input.click(); }
}

async function handleMenuImportFile(input) {
  const file = input.files?.[0];
  if (!file) return;
  document.getElementById('menuIOStatus').textContent = 'Reading file…';

  try {
    const text = await file.text();
    let parsed;
    if (file.name.toLowerCase().endsWith('.csv')) {
      parsed = parseMenuCSV(text);
    } else {
      parsed = parseMenuJSON(text);
    }

    if (!parsed.items?.length) {
      document.getElementById('menuIOStatus').textContent = 'No items found in file. Check the format.';
      return;
    }

    openMenuImportDialog(parsed);
  } catch (e) {
    document.getElementById('menuIOStatus').textContent = 'Could not read file: ' + e.message;
  }
}

// ── JSON parser ───────────────────────────────────────────────

function parseMenuJSON(text) {
  const data = JSON.parse(text);
  // Accept: { items: [...], categories: [...] }  OR  just [...]
  const items  = Array.isArray(data) ? data : (Array.isArray(data.items) ? data.items : []);
  const cats   = Array.isArray(data.categories) ? data.categories : null;
  return { items, categories: cats };
}

// ── CSV parser ────────────────────────────────────────────────
// Handles quoted fields, embedded commas, embedded newlines.
function parseMenuCSV(text) {
  const rows = csvSplit(text.replace(/\r\n/g, '\n').replace(/\r/g, '\n'));
  if (rows.length < 2) return { items: [], categories: null };
  const headers = rows[0].map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const col = k => headers.indexOf(k);
  const items = [];
  const seenCategories = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length === 1 && !row[0]) continue; // blank line
    const get = (key, fallback = '') => {
      const i = col(key);
      return i >= 0 ? (row[i] ?? fallback) : fallback;
    };
    const parseBool = v => {
      if (v === true || v === false) return v;
      const s = String(v).trim().toLowerCase();
      return s === 'true' || s === '1' || s === 'yes';
    };
    const parseJSON = v => {
      try { return typeof v === 'object' ? v : JSON.parse(v || '{}'); } catch { return {}; }
    };
    const cat = get('category', '');
    if (cat && !seenCategories.includes(cat)) seenCategories.push(cat);
    items.push({
      name:          get('name'),
      category:      cat,
      price:         Number(get('price', 0)) || 0,
      description:   get('description', ''),
      veg:           parseBool(get('veg', 'true')),
      available:     parseBool(get('available', 'true')),
      recommended:   parseBool(get('recommended', 'false')),
      best_seller:   parseBool(get('best_seller', 'false')),
      sizes_enabled: parseBool(get('sizes_enabled', 'false')),
      size_prices:   parseJSON(get('size_prices_json', '{}')),
      size_labels:   parseJSON(get('size_labels_json', '{}')),
    });
  }
  // Only surface categories if the CSV had a category column
  const hasCatCol = col('category') >= 0;
  return { items, categories: hasCatCol ? seenCategories : null };
}

// Minimal RFC 4180 CSV splitter (handles quotes + embedded newlines)
function csvSplit(text) {
  const rows = [];
  let row = [], field = '', inQuote = false, i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuote = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuote = true; i++; continue; }
    if (ch === ',') { row.push(field); field = ''; i++; continue; }
    if (ch === '\n') { row.push(field); field = ''; rows.push(row); row = []; i++; continue; }
    field += ch; i++;
  }
  row.push(field);
  if (row.some(c => c !== '')) rows.push(row);
  return rows;
}

// ── Import dialog ─────────────────────────────────────────────

let _importParsed = null;

function openMenuImportDialog(parsed) {
  _importParsed = parsed;
  const dlg = document.getElementById('menuImportDialog');
  if (!dlg) return;

  // Show/hide category options based on whether the file has category data
  const hasCats = parsed.categories && parsed.categories.length > 0;
  const catSection = document.getElementById('menuImportCatSection');
  const noCatNote  = document.getElementById('menuImportNoCatNote');
  if (catSection) catSection.hidden = !hasCats;
  if (noCatNote)  noCatNote.hidden  = hasCats;

  // Item count
  const count = document.getElementById('menuImportCount');
  if (count) count.textContent = `${parsed.items.length} dish${parsed.items.length !== 1 ? 'es' : ''} found in file.`;

  // Category list preview
  if (hasCats) {
    const list = document.getElementById('menuImportCatList');
    if (list) list.textContent = parsed.categories.join(', ');
    // Reset radio to default
    const withCat = document.getElementById('menuImportWithCat');
    if (withCat) withCat.checked = true;
  }

  document.getElementById('menuImportStatus').textContent = '';
  dlg.showModal();
}

function closeMenuImportDialog() {
  const dlg = document.getElementById('menuImportDialog');
  if (dlg && dlg.open) dlg.close();
  _importParsed = null;
}

async function confirmMenuImport() {
  if (!_importParsed) return;
  const btn = document.getElementById('menuImportConfirmBtn');
  if (btn) btn.disabled = true;

  const withCatEl = document.getElementById('menuImportWithCat');
  const withCategories = withCatEl?.checked ?? false;
  const status = document.getElementById('menuImportStatus');

  try {
    const { items, categories } = _importParsed;

    // 1. Add categories first if requested
    if (withCategories && categories?.length) {
      status.textContent = 'Adding categories…';
      const existing = Cloud.categories.slice(1); // exclude 'All'
      for (const cat of categories) {
        if (!cat || existing.includes(cat)) continue;
        await Cloud.rpc('restaurant_categories', {
          p_action: 'add', p_name: cat, p_replacement: null, p_item: null
        }, true);
        existing.push(cat);
      }
      await loadStaffCategories(); // refresh Cloud.categories
    }

    // 2. Build menu rows — assign a fresh UUID to each
    const knownCategories = Cloud.categories.slice(1);
    const defaultCategory = knownCategories[0] ?? 'Main';

    const rows = items
      .filter(i => String(i.name ?? '').trim())
      .map(i => Cloud.menuRow({
        id:            crypto.randomUUID(),
        name:          String(i.name ?? '').trim(),
        category:      withCategories && i.category && knownCategories.includes(i.category)
                         ? i.category
                         : (knownCategories.includes(i.category) ? i.category : defaultCategory),
        price:         Number(i.price ?? 0) || 0,
        description:   String(i.description ?? ''),
        veg:           i.veg !== false,
        available:     i.available !== false,
        recommended:   i.recommended === true,
        best_seller:   i.best_seller === true,
        sizes_enabled: i.sizes_enabled === true,
        size_prices:   i.size_prices ?? {},
        size_labels:   i.size_labels ?? {},
        image:         '',
      }));

    if (!rows.length) {
      status.textContent = 'No valid dish names found. Nothing was imported.';
      return;
    }

    // 3. Save in batches of 20 (to avoid request size limits)
    status.textContent = `Importing ${rows.length} dishes…`;
    const BATCH = 20;
    for (let start = 0; start < rows.length; start += BATCH) {
      await Cloud.saveMenu(rows.slice(start, start + BATCH));
    }

    status.textContent = `✓ Imported ${rows.length} dish${rows.length !== 1 ? 'es' : ''}.`;
    await refreshCloud();
    if (typeof renderAdminMenu === 'function') renderAdminMenu();
    showToast(`${rows.length} dish${rows.length !== 1 ? 'es' : ''} imported.`);

    setTimeout(() => closeMenuImportDialog(), 1500);
  } catch (e) {
    status.textContent = 'Import failed: ' + e.message;
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ── Wire up toggle button when menu tab opens ─────────────────
// kitchen.js calls renderAdminMenu() when the admin panel shows.
// We hook into that via a MutationObserver on adminMenuPanel.
(function () {
  let menuIOObserver = null;
  const orig = window.addEventListener;
  // Observe adminMenuPanel becoming visible and initialise the IO panel.
  function tryHookMenuIO() {
    const panel = document.getElementById('adminMenuPanel');
    if (!panel || menuIOObserver) return;
    menuIOObserver = new MutationObserver(() => {
      if (!panel.hidden && staffRole === 'admin') initMenuIO();
    });
    menuIOObserver.observe(panel, { attributes: true, attributeFilter: ['hidden'] });
  }
  document.addEventListener('DOMContentLoaded', tryHookMenuIO);
})();
