/* Supabase connection: sign-in, session refresh and secure function calls. */
'use strict';
const Cloud = (() => {
  const cfg = typeof SHOP_CONFIG === 'undefined' ? {} : SHOP_CONFIG;
  const url = String(cfg.supabaseUrl || '').replace(/\/$/, '');
  const key = String(cfg.supabaseAnonKey || '');
  const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) && key.length > 20 && !/YOUR|PASTE/i.test(url + key);
  const STORE = 'SHOPBILL_SESSION:' + url;
  let session = null, refreshing = null;
  try { session = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { session = null; }

  function save(s) {
    session = s ? { ...s, expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600) } : null;
    try { session ? localStorage.setItem(STORE, JSON.stringify(session)) : localStorage.removeItem(STORE); } catch { /* storage blocked */ }
    return session;
  }

  async function request(path, { method = 'GET', body, auth = false, timeout = 20000 } = {}) {
    if (!configured) throw Object.assign(new Error('This app is not connected yet. Add the Supabase URL and public key in config.js.'), { code: 'CONFIG' });
    if (auth) {
      if (!session) throw Object.assign(new Error('Please sign in again.'), { code: 'AUTH' });
      if (session.expires_at * 1000 < Date.now() + 60000) await refresh();
    }
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url + path, {
        method, cache: 'no-store', signal: ctrl.signal,
        headers: { apikey: key, 'Content-Type': 'application/json', Authorization: 'Bearer ' + (auth ? session.access_token : key) },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const text = await res.text(); let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
      if (!res.ok) {
        const msg = data?.message || data?.msg || data?.error_description || data?.error || ('Request failed (HTTP ' + res.status + ').');
        const err = new Error(friendly(msg)); err.status = res.status; err.raw = msg; err.hint = data?.hint || '';
        if (res.status === 401 && auth) { save(null); err.code = 'AUTH'; }
        if (err.hint === 'system_locked') { err.code = 'LOCKED'; dispatchEvent(new CustomEvent('system:locked', { detail: err.message })); }
        throw err;
      }
      return data;
    } catch (e) {
      if (e.name === 'AbortError') throw Object.assign(new Error('The connection timed out. Check the internet and try again.'), { code: 'NETWORK' });
      if (e instanceof TypeError) throw Object.assign(new Error('No internet connection. Check the network and try again.'), { code: 'NETWORK' });
      throw e;
    } finally { clearTimeout(timer); }
  }

  function friendly(msg) {
    if (/Invalid login credentials/i.test(msg)) return 'Wrong email or password.';
    if (/Email not confirmed/i.test(msg)) return 'This email is not confirmed yet. Confirm it in Supabase → Authentication → Users.';
    if (/Could not find the function|schema cache/i.test(msg)) return 'The database is not set up. Run SETUP-SHOP-BILLING.sql in the Supabase SQL Editor.';
    if (/JWT expired/i.test(msg)) return 'Your session expired. Please sign in again.';
    return msg;
  }

  async function refresh() {
    if (!refreshing) refreshing = request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token } })
      .then(save).catch(e => { if (e.code !== 'NETWORK') save(null); throw e; }).finally(() => { refreshing = null; });
    return refreshing;
  }

  return {
    cfg, configured,
    get signedIn() { return !!session; },
    get userEmail() { return session?.user?.email || ''; },
    async login(email, password) { return save(await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } })); },
    async logout() { try { if (session) await request('/auth/v1/logout', { method: 'POST', auth: true, timeout: 5000 }); } catch { /* ignore */ } finally { save(null); } },
    async recover(email) { return request('/auth/v1/recover', { method: 'POST', body: { email, redirect_to: location.origin + location.pathname } }); },
    useRecoveryToken(hash) { const p = new URLSearchParams(hash.replace(/^#/, '')); if (p.get('type') !== 'recovery' || !p.get('access_token')) return false; save({ access_token: p.get('access_token'), refresh_token: p.get('refresh_token'), expires_in: Number(p.get('expires_in')) || 3600, user: {} }); return true; },
    async setPassword(password) { return request('/auth/v1/user', { method: 'PUT', auth: true, body: { password } }); },
    rpc(name, args = {}) { return request('/rest/v1/rpc/' + name, { method: 'POST', auth: true, body: args }); },
    publicRpc(name, args = {}) { return request('/rest/v1/rpc/' + name, { method: 'POST', body: args, timeout: 8000 }); }
  };
})();
