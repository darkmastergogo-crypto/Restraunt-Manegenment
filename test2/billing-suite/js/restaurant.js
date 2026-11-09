/* Restaurant screens built from the billing design system. Same RPC contracts as the proven restaurant tools. */
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
      const access = full && !RX.isAdmin() ? RX.rpc('restaurant_manager_permissions', {}).catch(() => ({})) : Promise.resolve(perms);
      const names = RestaurantCloud.refreshTableNames({ staff: true }).catch(() => {});
      const [rows] = await Promise.all([RestaurantCloud.orders(), filter === 'Cancelled' ? loadCancelled() : null]);
      if (id !== req || !root?.isConnected) return;
      orders = rows; loaded = true; error = ''; render();
      perms = await access;
      if (id !== req || !root?.isConnected) return;
      await Promise.all([names, loadDevices()]);
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
    $('#kSummary', root).innerHTML = loaded ? RX.sum('Waiting to accept', pending.length, pending.length ? 'is-warn' : '') + RX.sum('In the kitchen', cooking.length) + RX.sum('Open orders value', Fmt.money(open.reduce((n, o) => n + Number(o.total || 0), 0)), 'big') + RX.sum('Served recently', orders.filter(o => o.status === 'Served').length) : '';
    $$('#kFilter button', root).forEach(b => { b.classList.toggle('on', b.dataset.f === filter); const c = b.querySelector('span'); if (c) c.textContent = !loaded ? '' : b.dataset.f === 'active' ? open.length : b.dataset.f === 'Pending' ? pending.length : b.dataset.f === 'Cooking' ? cooking.length : ''; });
    const ready = filter === 'Cancelled' ? !!cancelled : loaded;
    const list = filter === 'Cancelled' ? cancelledRows() : filter === 'active' ? open : filter === 'Cooking' ? cooking : pending;
    $('#kStatus', root).textContent = error || (!ready ? 'Loading orders…' : filter === 'Cancelled' ? 'Cancelled and rejected orders stay here for a few hours. Full history is in Records.' : `Live · updated ${Fmt.time(new Date().toISOString())}`);
    $('#kList', root).innerHTML = list.length ? list.map(card).join('') : ready ? `<div class="empty"><h3>${filter === 'Cancelled' ? 'No cancelled orders' : 'No orders here'}</h3><p>${filter === 'Cancelled' ? 'Nothing was cancelled or rejected recently.' : 'New customer orders appear here automatically.'}</p></div>` : '';
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
    root = view; orders = []; cancelled = null; devices = new Map(); perms = {}; cOffset = 0; loaded = false; error = '';
    view.innerHTML = `<div class="page rx">
      ${RX.head('Kitchen orders', 'New QR orders appear here automatically. Accept, cook and serve them in order.', `${RX.isAdmin() ? `<button type="button" class="btn" id="kOffers">${Icon('tag')} Offers</button>` : ''}<button type="button" class="btn" id="kCall">${Icon('bell')} Call waiter</button><button type="button" class="btn" id="kAlerts">${Icon('bell')} Alerts</button><button type="button" class="btn" id="kRefresh">${Icon('refresh')} Refresh</button>`)}
      <div class="summary" id="kSummary"></div>
      <div class="filters"><div class="seg seg-scroll" id="kFilter">${[['active', 'Open'], ['Pending', 'Pending'], ['Cooking', 'Cooking'], ['Cancelled', 'Cancelled']].map(([k, l]) => `<button type="button" data-f="${k}">${l} <span></span></button>`).join('')}</div></div>
      <p class="status-line" id="kStatus" role="status"></p>
      <div class="mgrid ogrid" id="kList"></div><div id="kPager"></div></div>`;
    $('#kFilter', view).onclick = async e => { const b = e.target.closest('[data-f]'); if (!b) return; filter = b.dataset.f; cOffset = 0; cancelled = null; render(); if (filter === 'Cancelled') { await refresh(); } };
    $('#kRefresh', view).onclick = async e => { busy(e.currentTarget, true, 'Refreshing…'); RestaurantCloud.invalidateOrders(); await refresh(true); busy(e.currentTarget, false); };
    $('#kCall', view).onclick = callWaiter;
    const ko = $('#kOffers', view); if (ko) ko.onclick = () => MenuDesign.offersModal();
    $('#kAlerts', view).onclick = () => AlertsPanel.open();
    $('#kPager', view).onclick = e => { const b = e.target.closest('[data-page]'); if (!b) return; cOffset = Math.max(0, cOffset + Number(b.dataset.page) * 50); cancelled = null; render(); refresh(); };
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
    const id = ++req, page = offset;
    try {
      let d;
      if (filter === 'Pending' && offset === 0) { const p = await RX.rpc('restaurant_staff_pulse47', { p_known: KNOWN }); const calls = Array.isArray(p.calls) ? p.calls : []; d = { calls, total: calls.length }; }
      else { d = await RX.rpc('restaurant_requests_page47', { p_key: null, p_status: filter, p_offset: offset, p_limit: 50 }); if (id !== req || !root?.isConnected) return; if (!Array.isArray(d.calls)) throw Error('Invalid request response.'); if (page > 0 && !d.calls.length) { offset = Math.max(0, page - 50); return load(); } }
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
    root = view; data = null; offset = 0; error = '';
    view.innerHTML = `<div class="page rx">${RX.head('Requests', 'Waiter calls, reserved-table scans and song requests from customers.', `<button type="button" class="btn" id="qAlerts">${Icon('bell')} Alerts</button><button type="button" class="btn" id="qRefresh">${Icon('refresh')} Refresh</button>`)}
      <div class="filters"><div class="seg seg-scroll" id="qFilter">${['Pending', 'Handled', 'Expired', 'All'].map(s => `<button type="button" data-f="${s}">${s}</button>`).join('')}</div></div>
      <p class="status-line" id="qStatus" role="status"></p><div class="mgrid ogrid" id="qList"></div><div id="qPager"></div></div>`;
    $('#qFilter', view).onclick = e => { const b = e.target.closest('[data-f]'); if (!b) return; filter = b.dataset.f; offset = 0; data = null; error = ''; render(); load(); };
    $('#qRefresh', view).onclick = load; $('#qAlerts', view).onclick = () => AlertsPanel.open();
    $('#qPager', view).onclick = e => { const b = e.target.closest('[data-page]'); if (b) { offset = Math.max(0, offset + Number(b.dataset.page) * 50); data = null; error = ''; render(); load(); } };
    $('#qList', view).addEventListener('click', e => { const a = e.target.closest('[data-id]'); const c = a && data?.calls.find(x => x.id === a.dataset.id); if (!c) return; if (e.target.closest('[data-onway]')) act(c, true); if (e.target.closest('[data-handle]')) act(c, false); });
    render(); load(); stop = RX.poll(5000, load);
  }
  return { mount, unmount() { stop?.(); stop = null; root = null; } };
})();

/* ---------------- Tables & QR codes ---------------- */
const Tables = (() => {
  let root = null, rows = [], busyAll = false, error = '', loaded = false, owner = null, req = 0;
  const canRename = () => RX.isAdmin() || Cloud.custom().managerCanRenameTables !== false;
  const link = t => { const u = new URL(RestaurantCloud.cfg.publicMenuUrl || '../', location.href); u.searchParams.set('table', t.table_number); u.searchParams.set('qr', t.qr_key); u.hash = ''; return u.href; };
  async function load() {
    const id = ++req;
    try {
      const list = await RX.rpc('restaurant_manage_tables', { p_action: 'list', p_table: null, p_status: null });
      if (id !== req || !root?.isConnected) return;
      rows = list; loaded = true; RestaurantCloud.setTableNames(rows); error = '';
    } catch (e) { if (id === req) error = 'Tables could not load: ' + e.message; }
    if (id === req) render();
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
    if (!loaded) {
      $('#tStatus', root).textContent = error || 'Loading tables…';
      if ($('#tExport', root)) $('#tExport', root).disabled = true;
      return;
    }
    if ($('#tExport', root)) $('#tExport', root).disabled = false;
    const admin = RX.isAdmin(), reserved = rows.filter(t => t.status === 'Reserved').length;
    $('#tSummary', root).innerHTML = RX.sum('Tables', rows.length) + RX.sum('Available', rows.length - reserved) + RX.sum('Reserved', reserved, reserved ? 'is-warn' : '');
    $('#tStatus', root).textContent = error;
    $('#tList', root).innerHTML = rows.length ? rows.map(t => `<article class="ocard tcard" data-t="${esc(t.table_number)}">
      <header class="ocard-head"><div><b>${esc(RX.table(t.table_number))}</b><small>ID ${esc(t.table_number)}</small></div><span class="badge ${t.status === 'Reserved' ? 'badge-amber' : 'badge-green'}">${t.status === 'Reserved' ? 'Reserved' : 'Available'}</span></header>
      <div class="ocard-body stack">
        <form class="inline-form" data-rename><label class="field grow"><span>Table name</span><input name="name" value="${esc(RX.table(t.table_number))}" maxlength="60" required ${canRename() ? '' : 'disabled'}></label><button class="btn" ${canRename() ? '' : 'disabled'}>Save name</button></form>
        ${canRename() ? '' : '<p class="hint">Table name editing is turned off.</p>'}
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
    root = view; error = '';
    if (owner !== Cloud.userId) { owner = Cloud.userId; loaded = false; rows = []; }
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
  let root = null, stock = null, sec = null, sOff = 0, nOff = 0, stop = null, busyIds = new Set(), req = 0;
  const canSecurity = perms => RX.isAdmin() || perms?.customer_devices === true || perms?.order_device_block === true;
  const sizeName = n => n.variant === 'single' || !n.variant ? '' : ' — ' + (n.size_label || n.variant);
  async function load() {
    const id = ++req;
    const fetchPage = async (name, offset) => {
      try {
        let data = await RX.rpc(name, { p_offset: offset });
        if (offset > 0 && !data.notifications?.length) {
          offset = Math.max(0, Math.floor(Math.max(0, data.total - 1) / 50) * 50);
          data = await RX.rpc(name, { p_offset: offset });
        }
        return { data, offset };
      } catch (e) { return { data: { error: e.message }, offset }; }
    };
    const security = async () => {
      const perms = RX.isAdmin() ? null : await RX.rpc('restaurant_manager_permissions', {}).catch(() => null);
      return canSecurity(perms) ? fetchPage('restaurant_notifications', nOff) : { data: null, offset: 0 };
    };
    const [low, blocked] = await Promise.all([fetchPage('restaurant_stock_alerts', sOff), security()]);
    if (id !== req || !root?.isConnected) return;
    stock = low.data; sOff = low.offset; sec = blocked.data; nOff = blocked.offset;
    render();
  }
  function render() {
    if (!root?.isConnected) return;
    const su = stock?.unread || 0, nu = sec?.unread || 0;
    $('#nSummary', root).innerHTML = stock && !stock.error ? RX.sum('Unread low-stock alerts', su, su ? 'is-warn' : '') + (sec ? RX.sum('Unread blocked-browser alerts', nu, nu ? 'is-bad' : '') : '') + RX.sum('Kept for', Math.round(Number(stock?.retention_minutes || 1440) / 60) + ' hours') : '';
    const sRows = stock?.notifications || [];
    $('#nStock', root).innerHTML = `<div class="card-title-row"><div><h2>${Icon('box')} Low stock</h2><p class="hint">A dish or size with 5% or less of its tracked stock left.</p></div><div class="toolbar"><button type="button" class="btn btn-sm" data-s-refresh>${Icon('refresh')} Refresh</button><button type="button" class="btn btn-sm" data-s-all ${su ? '' : 'disabled'}>${Icon('check')} Mark all read</button></div></div>
      ${stock?.error ? `<p class="status-line">Stock alerts could not load: ${esc(stock.error)}</p>` : ''}
      <div class="table-wrap"><table class="table cards-on-mobile"><thead><tr><th>Dish</th><th class="num">Left at alert</th><th>When</th><th>Status</th><th></th></tr></thead><tbody>
      ${sRows.length ? sRows.map(n => `<tr class="${n.read_at ? 'is-muted' : ''}"><td data-label="Dish"><b>${esc(n.dish_name)}${esc(sizeName(n))}</b><small>${esc(n.category || '')}</small></td><td class="num" data-label="Left at alert">${Number(n.remaining)} of ${Number(n.baseline)}<small>${n.baseline ? (100 * n.remaining / n.baseline).toFixed(1) + '%' : ''}</small></td><td data-label="When">${esc(RX.when(n.created_at))}</td><td data-label="Status">${n.read_at ? '<span class="badge">Read</span>' : '<span class="badge badge-amber">New</span>'}</td><td class="row-act">${n.read_at ? '' : `<button type="button" class="btn btn-sm btn-ghost" data-s-read="${esc(n.id)}">Mark read</button>`}</td></tr>`).join('') : !stock || stock.error ? '' : '<tr><td colspan="5"><div class="empty slim"><p>No low-stock alerts.</p></div></td></tr>'}
      </tbody></table></div>${RX.pager(stock?.offset ?? sOff, sRows.length, stock?.total || 0, 'alerts').replace(/data-page/g, 'data-s-page')}`;
    const box = $('#nSec', root); box.hidden = !sec;
    if (!sec) return;
    const nRows = sec.notifications || [];
    box.innerHTML = `<div class="card-title-row"><div><h2>${Icon('ban')} Blocked-browser alerts</h2><p class="hint">A blocked customer browser tried to open a table QR.</p></div><div class="toolbar"><button type="button" class="btn btn-sm" data-n-refresh>${Icon('refresh')} Refresh</button><button type="button" class="btn btn-sm" data-n-all ${nu ? '' : 'disabled'}>${Icon('check')} Mark all read</button></div></div>
      ${sec.error ? `<p class="status-line">${esc(sec.error)}</p>` : ''}
      <div class="table-wrap"><table class="table cards-on-mobile"><thead><tr><th>Table</th><th>Browser</th><th>When</th><th class="num">Tries</th><th>Status</th><th></th></tr></thead><tbody>
      ${nRows.length ? nRows.map(n => `<tr class="${n.read_at ? 'is-muted' : ''}"><td data-label="Table"><b>${esc(RX.table(n.table_number))}</b></td><td data-label="Browser">${esc(RX.deviceLabel(n.browser_info))}<small class="mono">${esc(String(n.device_id || '').slice(0, 8))}</small></td><td data-label="When">${esc(RX.when(n.created_at))}<small>Last try ${esc(RX.when(n.last_attempt_at))}</small></td><td class="num" data-label="Tries">${Number(n.attempts || 1)}</td><td data-label="Status">${n.read_at ? '<span class="badge">Read</span>' : '<span class="badge badge-red">New</span>'}</td>
        <td class="row-act"><button type="button" class="btn btn-sm ${n.blocked ? '' : 'btn-danger-ghost'}" data-n-block="${esc(n.id)}" data-blocked="${!n.blocked}" ${!n.device_exists || busyIds.has(n.id) ? 'disabled' : ''}>${!n.device_exists ? 'No device' : n.blocked ? 'Unblock' : 'Block'}</button>${n.read_at ? '' : `<button type="button" class="btn btn-sm btn-ghost" data-n-read="${esc(n.id)}">Mark read</button>`}</td></tr>`).join('') : sec.error ? '' : '<tr><td colspan="6"><div class="empty slim"><p>No blocked-browser alerts.</p></div></td></tr>'}
      </tbody></table></div>${RX.pager(sec.offset ?? nOff, nRows.length, sec.total || 0, 'alerts').replace(/data-page/g, 'data-n-page')}`;
  }
  async function run(work, ok) { try { await work(); if (ok) toast(ok, 'ok'); RestaurantWorkspace.command('refresh'); } catch (e) { toast(e.message, 'error', 6000); } await load(); }
  function mount(view) {
    root = view; stock = null; sec = null; sOff = 0; nOff = 0;
    view.innerHTML = `<div class="page rx">${RX.head('Notifications', 'Low-stock warnings and blocked customer browsers.', `<button type="button" class="btn" id="nAlerts">${Icon('bell')} Alerts</button>`)}
      <div class="summary" id="nSummary"></div><div class="stack"><section class="card" id="nStock"><p class="status-line" role="status">Loading alerts…</p></section><section class="card" id="nSec" hidden></section></div></div>`;
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
    load(); stop = RX.poll(20000, load);
  }
  return { mount, unmount() { stop?.(); stop = null; root = null; } };
})();

/* ---------------- Customer devices ---------------- */
const Devices = (() => {
  let root = null, data = null, offset = 0, sort = 'date', dir = 'desc', perms = {}, busyIds = new Set(), stop = null, error = '', req = 0;
  const args = () => ({ p_action: 'list', p_device: null, p_blocked: null, p_sort: sort, p_direction: dir, p_offset: offset, p_limit: 50 });
  async function load() {
    const id = ++req;
    const permissions = RX.isAdmin() ? RX.rpc('restaurant_manager_permissions', {}).catch(() => null) : Promise.resolve(null);
    try {
      const [result, access] = await Promise.all([RX.rpc('restaurant_admin_devices', args()), permissions]);
      if (id !== req || !root?.isConnected) return;
      data = result; perms = access; error = '';
      if (offset > 0 && !data.devices?.length) { offset = Math.max(0, offset - 50); return load(); }
    } catch (e) { if (id === req) { data = null; error = 'Devices could not load: ' + e.message; } }
    if (id === req) render();
  }
  function render() {
    if (!root?.isConnected) return;
    const admin = RX.isAdmin() && !!perms;
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
      : !data ? '' : `<tr><td colspan="6"><div class="empty"><h3>No customer browsers yet</h3><p>A browser is saved here after a customer opens a table QR.</p></div></td></tr>`;
    $('#dPager', root).innerHTML = data ? RX.pager(offset, rows.length, data.total || 0, 'devices') : '';
  }
  function info(d) {
    const b = d.browser_info || {};
    modal('Browser ' + d.id.slice(0, 8), `<dl class="facts"><dt>Browser</dt><dd>${esc(RX.deviceLabel(b))}</dd><dt>Status</dt><dd>${d.blocked ? '<span class="badge badge-red">Blocked</span>' : '<span class="badge badge-green">Allowed</span>'}</dd><dt>Orders</dt><dd>${Number(d.order_count || 0)}</dd>
      <dt>First seen</dt><dd>${esc(RX.when(d.first_seen))}</dd><dt>Last seen</dt><dd>${esc(RX.when(d.last_seen))}</dd><dt>Last changed</dt><dd>${esc(RX.when(d.updated_at))}</dd><dt>Last table</dt><dd>${esc(d.last_table_number ? RX.table(d.last_table_number) : '—')}</dd>
      <dt>Platform</dt><dd>${esc(b.platform || 'Unknown')} · ${esc(b.language || 'Unknown')}</dd><dt>Time zone</dt><dd>${esc(b.time_zone || 'Unknown')}</dd><dt>ID</dt><dd class="mono small">${esc(d.id)}</dd><dt>Reported browser</dt><dd class="small">${esc(b.user_agent || 'Unknown')}</dd></dl>`, { size: 'modal-md' });
  }
  function mount(view) {
    root = view; data = null; perms = null; offset = 0; error = '';
    view.innerHTML = `<div class="page rx">${RX.head('Customer devices', 'Browsers that opened a table QR. Block a browser that misuses the menu.', `<button type="button" class="btn" id="dRefresh">${Icon('refresh')} Refresh</button>`)}
      <section class="card" id="dAccess" hidden></section>
      <div class="summary" id="dSummary"></div>
      <div class="filters"><select id="dSort" aria-label="Sort by"><option value="date">First seen</option><option value="seen">Last seen</option><option value="orders">Number of orders</option><option value="edited">Last changed</option></select><select id="dDir" aria-label="Direction"><option value="desc">Newest / highest first</option><option value="asc">Oldest / lowest first</option></select></div>
      <p class="status-line" id="dStatus" role="status"></p>
      <div class="table-wrap"><table class="table cards-on-mobile"><thead><tr><th>Browser</th><th class="num">Orders</th><th>Last table</th><th>Last seen</th><th>Status</th><th></th></tr></thead><tbody id="dBody"></tbody></table></div><div id="dPager"></div></div>`;
    $('#dSort', view).value = sort; $('#dDir', view).value = dir;
    $('#dSort', view).onchange = e => { sort = e.target.value; offset = 0; data = null; error = ''; render(); load(); };
    $('#dDir', view).onchange = e => { dir = e.target.value; offset = 0; data = null; error = ''; render(); load(); };
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
    const id = ++req; loading = true;
    if (reset) { items = []; total = 0; render(); } else paintMore();
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
    const hidePhotos = (() => { try { return localStorage.getItem('SHOPBILL_HIDE_DISH_PHOTOS') === '1' && !admin; } catch { return false; } })();
    $('#mdBody', root).innerHTML = items.length ? items.map(i => {
      const img = hidePhotos ? '' : RestaurantCloud.safeImage(i.image);
      return `<tr data-id="${esc(i.id)}" class="${shown(i) ? '' : 'is-muted'}">
        <td data-label="Dish"><div class="dish-cell">${hidePhotos ? '' : `<span class="dish-thumb">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : Icon('image')}</span>`}<span><b>${esc(i.name)}</b><small>${esc(i.category)}${i.veg === false ? ' · Non-veg' : ''}</small></span></div></td>
        <td data-label="Price" class="num"><b>${i.sizes_enabled ? 'From ' : ''}${Fmt.money(priceOf(i))}</b>${i.sizes_enabled ? `<small>${sizes(i).map(k => esc(label(i, k)) + ' ' + Fmt.money(i.size_prices[k])).join(' · ')}</small>` : ''}</td>
        <td data-label="Labels"><div class="toolbar">${i.stock_sold_out ? '<span class="badge badge-red">Sold out</span>' : shown(i) ? '<span class="badge badge-green">On menu</span>' : '<span class="badge">Hidden</span>'}${i.recommended ? '<span class="badge badge-soft">Recommended</span>' : ''}${i.best_seller ? '<span class="badge badge-amber">Best seller</span>' : ''}</div></td>
        <td class="row-act"><button type="button" class="btn btn-sm" data-act="price">Prices & sizes</button>${hidePhotos ? '' : `<button type="button" class="btn btn-sm btn-ghost" data-act="photo">${Icon('image')} Photo</button>`}<button type="button" class="btn btn-sm btn-ghost" data-act="more" ${busyIds.has(i.id) ? 'disabled' : ''}>More</button></td></tr>`;
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
    load();
  }
  return { mount, unmount() { clearTimeout(timer); req++; root = null; } };
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
    $('#srSummary', root).innerHTML = loaded ? RX.sum('Tracked dishes & sizes', tracked.length) + RX.sum('24-hour loops on', looping.length, looping.length ? 'big' : '') + RX.sum('Sold out', tracked.filter(r => Number(r.remaining) === 0).length, tracked.some(r => Number(r.remaining) === 0) ? 'is-bad' : '') : '';
    const list = rows.filter(r => (cat === 'All' || r.category === cat) && (!s || [name(r), r.category].some(x => String(x).toLowerCase().includes(s))) && (show === 'all' || (show === 'tracked' && r.tracked) || (show === 'loop' && r.loop_enabled) || (show === 'untracked' && !r.tracked))).sort((a, b) => (b.loop_enabled - a.loop_enabled) || (b.tracked - a.tracked) || name(a).localeCompare(name(b)));
    $('#srStatus', root).textContent = error || (!loaded ? 'Loading stock…' : '');
    $('#srBody', root).innerHTML = list.length ? list.map(r => `<tr data-k="${esc(key(r))}">
      <td data-label="Dish"><b>${esc(name(r))}</b><small>${esc(r.category)}${r.manual_available === false ? ' · hidden on menu' : ''}</small></td>
      <td data-label="In stock">${r.tracked ? `<div class="level level-${Number(r.remaining) === 0 ? 'out' : 'ok'}"><b>${Fmt.qty(r.remaining)}</b> <small>left</small></div>` : '<span class="muted">Not tracked</span>'}</td>
      <td data-label="24-hour loop">${r.loop_enabled ? `<span class="badge badge-green">${Icon('repeat')} Back to ${Fmt.qty(r.loop_quantity)}</span><small>Next reset ${esc(RX.when(r.loop_next_reset_at))}</small>` : '<span class="badge">Off</span>'}</td>
      <td class="row-act">${r.tracked ? `<button type="button" class="btn btn-sm" data-loop ${busyKeys.has(key(r)) ? 'disabled' : ''}>${Icon('repeat')} ${r.loop_enabled ? 'Change loop' : 'Set loop'}</button>${r.loop_enabled ? `<button type="button" class="btn btn-sm btn-danger-ghost" data-stop ${busyKeys.has(key(r)) ? 'disabled' : ''}>Stop</button>` : ''}` : '<a class="btn btn-sm btn-ghost" href="#/stocks">Track in Stocks</a>'}</td></tr>`).join('')
      : !loaded ? '' : `<tr><td colspan="4"><div class="empty"><h3>Nothing here</h3><p>${show === 'tracked' ? 'Start tracking a dish in Stocks first, then set its 24-hour loop here.' : 'Try another filter.'}</p></div></td></tr>`;
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
    const id = ++req; data = null; error = ''; render();
    try { const d = await RX.rpc('restaurant_dish_sales', args()); if (id !== req) return; if (offset > 0 && !d.rows.length) { offset = Math.max(0, Math.floor(Math.max(0, d.total_rows - 1) / 50) * 50); return load(); } data = d; error = ''; }
    catch (e) { if (id === req) { data = null; error = 'Dish sales could not load: ' + e.message; } }
    if (id === req) render();
  }
  function render() {
    if (!root?.isConnected) return;
    $$('#dsPeriod button', root).forEach(b => b.classList.toggle('on', b.dataset.p === period));
    const rows = data?.rows || [];
    $('#dsStatus', root).textContent = error || (data ? `${ref ? 'Selected' : 'Current'} ${period} · ${range(data)} · served orders, before tax` : 'Loading dish sales…');
    const units = rows.reduce((n, r) => n + Number(r.quantity || 0), 0), rev = rows.reduce((n, r) => n + Number(r.revenue || 0), 0);
    const part = (data?.total_rows || 0) > rows.length ? ' (this page)' : '';
    $('#dsSummary', root).innerHTML = data ? RX.sum('Item revenue' + part, Fmt.money(rev), 'big') + RX.sum('Units sold' + part, Fmt.qty(units)) + RX.sum(mode === 'daily' ? 'Day & dish rows' : 'Dishes sold', data.total_rows || 0) : '';
    $('#dsBody', root).innerHTML = rows.length ? rows.map(r => `<tr><td class="num" data-label="Rank">${r.position}</td><td data-label="Date">${r.sale_day ? esc(Fmt.date(r.sale_day)) : esc(range(data))}</td><td data-label="Dish"><b>${esc(r.dish_name)}</b>${r.size_label ? `<small>${esc(r.size_label)}</small>` : ''}</td><td class="num" data-label="Qty sold">${Fmt.qty(r.quantity)}</td><td class="num" data-label="Orders">${r.order_count}</td><td class="num" data-label="Revenue"><b>${Fmt.money(r.revenue)}</b></td></tr>`).join('')
      : !data ? '' : `<tr><td colspan="6"><div class="empty"><h3>No dish sales</h3><p>No served orders in this period.</p></div></td></tr>`;
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
      ${admin ? `<form class="card form-grid" id="rsMgr"><header class="span-2 card-head"><h2>What managers can do</h2></header>
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
    body.innerHTML = `<div class="card"><header class="card-head"><h2>Staff & logins</h2><p class="hint">Waiters sign in on the waiter app with their mobile number or email, and their password.</p></header>
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
    try { const [d] = await Promise.all([RX.rpc('restaurant_waiter_accounts66', { p_action: 'list', p_email: null, p_password: null, p_name: null, p_user: null }), loadPhones()]); if (root === body && $('#waBody', body)) paint(d); } catch (e) { $('#waStatus', body).textContent = /waiter_accounts66|schema cache|PGRST202/i.test(e.message) ? 'Waiter logins need a database update. Ask support to install it.' : e.message; }
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
