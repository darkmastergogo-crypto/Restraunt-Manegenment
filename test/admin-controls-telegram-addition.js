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
