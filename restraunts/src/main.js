import { createClient } from '@supabase/supabase-js';
import './style.css';

const app = document.querySelector('#app');
const announcement = document.querySelector('#announcement');
const path = location.pathname.replace(/\/$/, '') || '/';
const match = /^\/r\/([a-z0-9][a-z0-9-]{0,46}[a-z0-9])(?:\/(team|manage))?$/.exec(path);
const slug = match?.[1];
const restaurantPath = slug ? `/r/${slug}/` : '';
const ownerRoute = ['/owner', '/owner/restaurants', '/owner/users', '/owner/activity'].includes(path);
const inviteToken = new URLSearchParams(location.hash.slice(1)).get('invite');
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const roles = { administrator: 'Administrator', manager: 'Manager', staff: 'Staff' };
const statuses = { active: 'Active', trial: 'Trial', suspended: 'Suspended' };
let client;
let brand;
let user;
let identity;
let recovering = false;

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fmtDate = date => date ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date)) : '—';
const badge = (text, state = '') => `<span class="badge ${escape(state)}">${escape(text)}</span>`;
const roleOptions = (role, allowAdmin) => Object.entries(roles).filter(([key]) => allowAdmin || key !== 'administrator')
  .map(([key, label]) => `<option value="${key}" ${key === role ? 'selected' : ''}>${label}</option>`).join('');
const unbox = result => {
  if (result.error) throw result.error;
  return result.data;
};
const rpc = async (name, args) => unbox(await client.rpc(name, args));
const read = async response => {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The request failed. Try again.');
  return data;
};

const paths = {
  login: 'M3 8l9-5 9 5v2H3z M5 10v8 M9 10v8 M15 10v8 M19 10v8 M3 19h18',
  grid: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z',
  store: 'M3 10l2-5h14l2 5 M4 10v10h16V10 M9 20v-6h6v6 M3 10c0 4 6 4 6 0 0 4 6 4 6 0 0 4 6 4 6 0',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-4 M16 3a4 4 0 0 1 0 8',
  pulse: 'M3 12h4l3-7 4 14 3-7h4',
  shield: 'M12 22s7-4 7-10V5l-7-3-7 3v7c0 6 7 10 7 10z M9 12l2 2 4-4',
  plate: 'M4 17a8 8 0 0 1 16 0 M2 19h20 M12 6V4 M5 22h14',
  plus: 'M12 5v14 M5 12h14',
  arrow: 'M4 12h16 M14 6l6 6-6 6',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2'
};
const icon = (name, size = 22) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]}"/></svg>`;

function showToast(message) {
  announcement.textContent = message;
  announcement.hidden = false;
}

function bindForm(id, work) {
  document.querySelector(`#${id}`)?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = event.submitter;
    if (form.getAttribute('aria-busy') === 'true') return;
    const error = form.querySelector('[role="alert"]');
    if (error) error.textContent = '';
    form.setAttribute('aria-busy', 'true');
    if (submit) submit.disabled = true;
    try {
      await work(Object.fromEntries(new FormData(form)), submit, form);
    } catch (problem) {
      const message = problem.message || 'The request failed. Try again.';
      if (error) error.textContent = message;
      else showToast(message);
    } finally {
      form.removeAttribute('aria-busy');
      if (submit) submit.disabled = false;
    }
  });
}

function replacePage(url) {
  location.replace(url);
}

function panel(title, description, content, { kicker = 'SERVICE DESK' } = {}) {
  const name = brand?.name || 'Restaurant Operations';
  const slogan = brand?.slogan || 'A home for restaurant teams';
  return `<div class="auth-layout"><aside class="auth-brand"><div class="auth-mark">${brand ? `<img src="${restaurantPath}icon-192.png" alt="">` : icon('plate', 44)}</div>
    <span>${escape(name)}</span><small>${escape(slogan)}</small><div class="brand-art" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <div class="brand-footer">RESTAURANT OPERATIONS</div></aside><main id="main" class="auth-main"><section class="auth-content">
    <div class="eyebrow">${escape(kicker)}</div><h1>${escape(title)}</h1><p class="subtle intro">${escape(description)}</p>${content}</section></main></div>`;
}

function signoutForms() {
  return `<form id="logout"><button class="button ghost" type="submit">Sign out</button><p class="form-error" role="alert"></p></form>`;
}

function bindLogout() {
  bindForm('logout', async () => {
    unbox(await client.auth.signOut({ scope: 'local' }));
    replacePage(restaurantPath || '/');
  });
}

function blocked(title, message, link = '') {
  app.innerHTML = panel(title, message, `${link}${user ? signoutForms() : ''}`);
  bindLogout();
}

function authView(mode = 'signin') {
  const accepting = path === '/accept';
  const signUp = mode === 'signup';
  const reset = mode === 'reset';
  const title = signUp ? 'Create your account' : reset ? 'Reset your password' : ownerRoute ? 'Platform owner sign-in' : 'Restaurant sign-in';
  const description = signUp ? 'Use the email address where you received your invitation.' : reset ? 'We’ll request a secure password reset link.'
    : accepting ? 'Sign in with your invited email to accept access.' : `Access ${brand ? brand.name : 'your restaurant account'}.`;
  app.innerHTML = panel(title, description, `<form id="auth-form" class="stack">
    <label>Email address<input name="email" type="email" autocomplete="email" maxlength="254" required></label>
    ${reset ? '' : `<label>Password<input name="password" type="password" autocomplete="${signUp ? 'new-password' : 'current-password'}" ${signUp ? 'minlength="12" maxlength="72"' : ''} required></label>`}
    <p role="alert" class="form-error"></p><p role="status" class="form-note"></p>
    <button class="button primary wide" type="submit">${signUp ? 'Create account' : reset ? 'Request reset link' : 'Sign in'}</button>
    <div class="auth-links">${signUp || reset ? '<button class="text-button" type="button" data-mode="signin">Back to sign-in</button>'
      : `<button class="text-button" type="button" data-mode="reset">Forgot password?</button>${accepting ? '<button class="text-button" type="button" data-mode="signup">Create an account</button>' : ''}`}</div></form>`,
    { kicker: ownerRoute ? 'PLATFORM ADMINISTRATION' : 'RESTAURANT ACCESS' });
  document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => authView(button.dataset.mode)));
  bindForm('auth-form', async ({ email, password }, _submit, form) => {
    const note = form.querySelector('[role="status"]');
    note.textContent = '';
    if (reset) {
      unbox(await client.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/account` }));
      note.textContent = 'If this address can reset its password, you’ll receive a link. Open it in this browser.';
      return;
    }
    if (signUp) {
      const result = unbox(await client.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/` } }));
      if (!result.session) {
        note.textContent = 'Check your email to confirm your account, then reopen the original invitation link.';
        return;
      }
    } else {
      unbox(await client.auth.signInWithPassword({ email, password }));
    }
    await render();
  });
}

function recoveryView() {
  app.innerHTML = panel('Choose a new password', 'Use at least 12 characters.', `<form id="recover" class="stack">
    <label>New password<input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="72" required></label>
    <p class="form-error" role="alert"></p><button class="button primary">Update password</button></form>`);
  bindForm('recover', async ({ password }) => {
    unbox(await client.auth.updateUser({ password }));
    const revocation = await client.auth.signOut({ scope: 'others' });
    recovering = false;
    showToast(revocation.error ? 'Password updated. Other sessions could not be signed out. Use Account security to retry.' : 'Password updated.');
    await render();
  });
}

async function mfaView(enroll, back = '') {
  const factors = unbox(await client.auth.mfa.listFactors());
  const factor = factors.totp[0];
  const setup = enroll && !factor;
  app.innerHTML = panel(setup ? 'Set up your authenticator' : 'Verify your sign-in', setup
    ? 'Use an authenticator app to add a second factor to this account.' : 'Enter the current six-digit code from your authenticator app.',
  `${setup ? '<form id="mfa-start"><button class="button primary">Generate setup code</button><p class="form-error" role="alert"></p></form>' : ''}
    <div id="mfa-area"></div>${back}${signoutForms()}`, { kicker: 'ACCOUNT SECURITY' });
  bindLogout();
  function challenge(factorId, totp) {
    document.querySelector('#mfa-area').innerHTML = `<form id="mfa-verify" class="stack">${totp ? `<img class="mfa-qr" src="${escape(totp.qr_code)}" alt="Authenticator setup QR code">
      <details><summary>Enter the key manually</summary><p class="mono">${escape(totp.secret)}</p></details>` : ''}
      <label>Authenticator code<input name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required></label>
      <p class="form-error" role="alert"></p><button class="button primary">${setup ? 'Finish setup' : 'Verify code'}</button></form>`;
    bindForm('mfa-verify', async ({ code }) => {
      unbox(await client.auth.mfa.challengeAndVerify({ factorId, code }));
      await render();
    });
  }
  if (setup) {
    bindForm('mfa-start', async (_values, _button, form) => {
      const data = unbox(await client.auth.mfa.enroll({ factorType: 'totp' }));
      form.hidden = true;
      challenge(data.id, data.totp);
    });
  } else if (factor) challenge(factor.id);
  else document.querySelector('#mfa-area').textContent = 'The account has no supported authenticator. Contact your platform administrator.';
}

function acceptView() {
  app.innerHTML = panel('Accept your invitation', `You’re signed in as ${user.email}.`, `<form id="accept" class="stack">
    <label>Full name<input name="name" autocomplete="name" maxlength="100" required></label>
    <p class="form-error" role="alert"></p><button class="button primary">Accept invitation</button></form>${signoutForms()}`, { kicker: 'RESTAURANT ACCESS' });
  bindLogout();
  bindForm('accept', async ({ name }) => {
    const restaurant = await rpc('platform_accept_invite', { p_token: inviteToken, p_name: name });
    replacePage(`/r/${restaurant}/`);
  });
}

async function accountView() {
  const { totp } = unbox(await client.auth.mfa.listFactors());
  app.innerHTML = panel('Account security', user.email || '', `<div class="stack">
    <div class="security-line">${icon('shield')} <div><strong>Authenticator app</strong><p class="subtle">${totp.length ? 'Your authenticator is enabled.' : 'Add a verification code to your sign-in.'}</p></div></div>
    ${totp.length ? '' : '<button id="enable-mfa" class="button primary">Set up an authenticator</button>'}
    <form id="logout-all"><button class="button secondary">Sign out on all devices</button><p role="alert" class="form-error"></p></form>
    ${signoutForms()}<a class="text-link" href="/">Back to home</a></div>`, { kicker: 'ACCOUNT SECURITY' });
  document.querySelector('#enable-mfa')?.addEventListener('click', () => mfaView(true, '<a class="text-link" href="/account">Back to account</a>').catch(showProblem));
  bindForm('logout-all', async () => {
    if (!confirm('Sign out of this account on every device?')) return;
    unbox(await client.auth.signOut({ scope: 'global' }));
    replacePage('/');
  });
  bindLogout();
}

function navigation(links) {
  return links.map(([href, label, glyph]) => `<a href="${href}" ${path === (href.replace(/\/$/, '') || '/') ? 'aria-current="page"' : ''}>${icon(glyph)}${escape(label)}</a>`).join('');
}

function shell(label, links, body, kicker = 'WORKSPACE') {
  app.innerHTML = `<div class="layout"><aside class="sidebar"><a class="identity" href="${restaurantPath || '/owner'}" aria-label="${escape(label)} home">
      <span class="identity-icon">${brand ? `<img src="${restaurantPath}icon-192.png" alt="">` : icon('plate', 26)}</span><span><strong>${escape(label)}</strong><small>${escape(kicker)}</small></span></a>
    <nav aria-label="${escape(kicker)} navigation">${navigation(links)}</nav>
    <div class="sidebar-foot"><span class="signal"></span> Signed in securely</div></aside>
    <main id="main" class="workspace"><header class="topbar"><div class="top-label">${escape(kicker)}</div><div class="actions">
      <a class="button ghost" href="/account" ${standalone && slug ? 'target="_blank" rel="noopener"' : ''}>${icon('shield', 18)} <span>Account</span></a>${signoutForms()}</div></header>${body}</main></div>`;
  bindLogout();
}

const ownerNav = [ ['/owner', 'Dashboard', 'grid'], ['/owner/restaurants', 'Restaurants', 'store'], ['/owner/users', 'Users', 'users'], ['/owner/activity', 'Audit activity', 'pulse'] ];
const headings = (kicker, title, description) => `<div class="page-head"><div class="eyebrow">${escape(kicker)}</div><h1>${escape(title)}</h1><p class="subtle">${escape(description)}</p></div>`;
const empty = (title, message) => `<div class="empty">${icon('plate', 32)}<h3>${escape(title)}</h3><p>${escape(message)}</p></div>`;

function restaurantCards(restaurants) {
  if (!restaurants.length) return empty('Your portfolio starts here', 'Add a restaurant to set up its identity and invite its team.');
  return `<div class="portfolio">${restaurants.map(row => `<article class="restaurant-card"><div class="restaurant-art"><div class="plate-mark">${row.status === 'suspended' ? icon('plate', 34)
    : `<img src="/r/${escape(row.slug)}/icon-192.png" alt="" loading="lazy">`}</div>${badge(statuses[row.status], row.status)}</div>
    <div class="restaurant-details"><strong>${escape(row.name)}</strong><p class="subtle">/r/${escape(row.slug)}/</p>${row.status === 'suspended'
      ? '<a class="text-link" href="/owner/restaurants">Manage availability</a>' : `<a class="text-link" href="/r/${escape(row.slug)}/">Open workspace ${icon('arrow', 16)}</a>`}</div></article>`).join('')}</div>`;
}

const auditNames = {
  'restaurant.created': 'Restaurant created', 'restaurant.active': 'Restaurant activated', 'restaurant.suspended': 'Restaurant suspended',
  'restaurant.trial': 'Restaurant moved to trial', 'restaurant.renamed': 'Restaurant renamed', 'branding.updated': 'Branding updated',
  'invitation.created': 'Invitation created', 'invitation.accepted': 'Invitation accepted', 'invitation.cancelled': 'Invitation cancelled',
  'membership.updated': 'Membership updated', 'membership.suspended': 'Membership suspended',
  'account.restored': 'Account restored', 'account.suspended': 'Account suspended'
};

async function auditRows(limit, offset = 0) {
  return unbox(await client.from('platform_audit').select('id,occurred_at,event,restaurant_id,actor_id,target_id').order('id', { ascending: false }).range(offset, offset + limit - 1));
}

function activity(rows, full = false) {
  if (!rows.length) return empty('No activity recorded', 'Changes to restaurants, branding and access will appear here.');
  return `<ul class="activity">${rows.map(row => `<li><span class="stat-icon">${icon('clock', 18)}</span><div><strong>${escape(auditNames[row.event] || row.event)}</strong>
    <span class="subtle">${escape(fmtDate(row.occurred_at))}</span>${full ? `<small>Restaurant ${escape(row.restaurant_id || '—')} · Actor ${escape(row.actor_id || '—')} · Target ${escape(row.target_id || '—')}</small>` : ''}</div></li>`).join('')}</ul>`;
}

async function ownerDashboard() {
  const [overview, recent, portfolio] = await Promise.all([rpc('platform_overview'), auditRows(5),
    client.from('restaurants').select('id,slug,name,status').order('created_at', { ascending: false }).limit(3).then(unbox)]);
  const numbers = new Intl.NumberFormat();
  const kpis = [['store', 'Restaurants', overview.restaurants], ['plate', 'Active restaurants', overview.active], ['users', 'Active accounts', overview.users], ['clock', 'Pending invitations', overview.pending]];
  const activeShare = overview.restaurants ? 100 * overview.active / overview.restaurants : 0;
  const trialShare = overview.restaurants ? 100 * (overview.active + overview.trial) / overview.restaurants : 0;
  shell('Restaurant Operations', ownerNav, `<section class="hero"><div><span class="eyebrow">PORTFOLIO OVERVIEW</span><h1>Welcome back</h1>
    <p>Manage your restaurants and the teams behind every service.</p><a class="button primary" href="/owner/restaurants#add">${icon('plus', 20)} Add restaurant</a></div>
    <div class="hero-art" aria-hidden="true"><span></span><span></span><span></span><span></span></div></section>
    <div class="dashboard"><div class="stats">${kpis.map(([glyph, label, value]) => `<article class="card stat"><span class="stat-icon">${icon(glyph, 25)}</span><div><p>${label}</p><strong>${numbers.format(value)}</strong></div></article>`).join('')}</div>
    <div class="dashboard-columns"><div class="stack dashboard-stack"><section class="card inset"><div class="section-head"><div><h2>Restaurant portfolio</h2><p class="subtle">Recently added restaurants</p></div><a class="text-link" href="/owner/restaurants">View all ${icon('arrow', 16)}</a></div>
    ${restaurantCards(portfolio)}</section><section class="card inset"><h2>Restaurant status</h2><p class="subtle">Availability across the portfolio</p>
    <div class="status-visual"><div class="donut" aria-hidden="true" style="--active-stop:${activeShare}%;--trial-stop:${trialShare}%" ${overview.restaurants ? '' : 'data-empty'}><span><strong>${numbers.format(overview.restaurants)}</strong>total</span></div>
    <dl class="status-breakdown">${Object.entries(statuses).map(([key, label]) => `<div><dt>${badge(label, key)}</dt><dd>${numbers.format(overview[key])}</dd></div>`).join('')}</dl></div></section></div>
    <div class="stack dashboard-stack"><section class="card inset"><div class="section-head"><div><h2>Recent activity</h2><p class="subtle">Access and setup changes</p></div><a class="text-link" href="/owner/activity">Audit ${icon('arrow', 16)}</a></div>${activity(recent)}</section>
    <section class="card inset"><h2>Quick actions</h2><div class="quick-actions"><a href="/owner/restaurants">${icon('store', 18)} Manage restaurants ${icon('arrow', 16)}</a>
    <a href="/owner/users">${icon('users', 18)} Manage accounts ${icon('arrow', 16)}</a></div></section></div></div></div>`, 'PLATFORM OWNER');
}

function paging(page, hasNext, query = '') {
  const url = number => `?${escape(new URLSearchParams({ page: number, ...(query && { q: query }) }).toString())}`;
  if (page === 1 && !hasNext) return '';
  return `<nav class="pagination" aria-label="Result pages">${page > 1 ? `<a class="button secondary" href="${url(page - 1)}">Previous</a>` : ''}<span>Page ${page}</span>${hasNext ? `<a class="button secondary" href="${url(page + 1)}">Next</a>` : ''}</nav>`;
}

function pageNumber() {
  const page = Number(new URLSearchParams(location.search).get('page'));
  return Number.isInteger(page) && page > 0 && page <= 10_000 ? page : 1;
}

async function ownerRestaurants() {
  const page = pageNumber();
  const query = (new URLSearchParams(location.search).get('q') || '').trim().slice(0, 80);
  let request = client.from('restaurants').select('id,slug,name,status,created_at').order('created_at', { ascending: false }).order('id').range((page - 1) * 20, page * 20);
  if (query) request = request.ilike('name', `%${query.replace(/[\\%_]/g, '\\$&')}%`);
  const rows = unbox(await request);
  shell('Restaurant Operations', ownerNav, `<div class="page-body">${headings('PORTFOLIO', 'Restaurants', 'Create, find and manage independent restaurant workspaces.')}
    <details class="card inset create-panel" id="add" ${location.hash === '#add' || !rows.length && !query ? 'open' : ''}><summary>${icon('plus', 20)} Add restaurant</summary>
      <form id="create-restaurant" class="form-grid"><label>Restaurant name<input name="name" maxlength="80" required></label>
      <label>Permanent URL slug<input name="slug" pattern="[a-z0-9][a-z0-9\\-]{0,46}[a-z0-9]" maxlength="48" placeholder="maple-table" required></label>
      <p class="form-error full" role="alert"></p><div class="full"><button class="button primary">Create restaurant</button></div></form></details>
    <section class="card inset"><div class="section-head"><h2>Restaurant directory</h2><form class="search" method="get"><label class="sr-only" for="q">Search restaurants</label><input id="q" name="q" value="${escape(query)}" maxlength="80" type="search" placeholder="Search by restaurant name"><button class="button secondary">Search</button>${query ? '<a class="text-link" href="/owner/restaurants">Clear</a>' : ''}</form></div>
      ${rows.length ? `<div class="table-scroll"><table><thead><tr><th>Restaurant</th><th>Status</th><th>Access</th></tr></thead><tbody>${rows.slice(0, 20).map((row, index) => `<tr>
      <td><strong>${escape(row.name)}</strong><small>/r/${escape(row.slug)}/</small></td><td>${badge(statuses[row.status], row.status)}</td><td><div class="row-actions">
      ${row.status !== 'suspended' ? `<a class="text-link" href="/r/${escape(row.slug)}/team">Manage team</a>` : ''}
      <form id="state-${index}"><label class="sr-only" for="status-${index}">Change ${escape(row.name)} status</label><select id="status-${index}" name="status">${Object.entries(statuses).map(([key, label]) => `<option value="${key}" ${key === row.status ? 'selected' : ''}>${label}</option>`).join('')}</select><button class="button secondary">Apply</button></form></div></td></tr>`).join('')}</tbody></table></div>` : empty('No restaurants found', 'Try another search or create a restaurant.')}
      ${paging(page, rows.length > 20, query)}</section></div>`, 'PLATFORM OWNER');
  bindForm('create-restaurant', async ({ name, slug: newSlug }) => {
    unbox(await client.from('restaurants').insert({ name: name.trim(), slug: newSlug }).select('slug').single());
    replacePage(`/r/${newSlug}/team`);
  });
  rows.slice(0, 20).forEach((row, index) => bindForm(`state-${index}`, async ({ status }) => {
    if (status === row.status) return;
    if (status === 'suspended' && !confirm(`Suspend ${row.name}? Staff will lose access immediately.`)) return;
    unbox(await client.from('restaurants').update({ status }).eq('id', row.id).select('id').single());
    replacePage(location.href);
  }));
}

async function ownerActivity() {
  const page = pageNumber();
  const rows = await auditRows(26, (page - 1) * 25);
  shell('Restaurant Operations', ownerNav, `<div class="page-body">${headings('PLATFORM SECURITY', 'Audit activity', 'Review restaurant, branding and access changes.')}
    <section class="card inset">${activity(rows.slice(0, 25), true)}${paging(page, rows.length > 25)}</section></div>`, 'PLATFORM OWNER');
}

async function ownerUsers() {
  const page = pageNumber();
  const rows = unbox(await client.from('profiles').select('id,display_name,active,created_at').order('created_at', { ascending: false }).order('id')
    .range((page - 1) * 25, page * 25));
  shell('Restaurant Operations', ownerNav, `<div class="page-body">${headings('PLATFORM ACCESS', 'User accounts', 'Manage account access across all restaurants.')}
    <section class="card inset"><h2>Account directory</h2><div class="table-scroll"><table><thead><tr><th>Account</th><th>Joined</th><th>Status</th><th>Action</th></tr></thead><tbody>
    ${rows.slice(0, 25).map((row, index) => `<tr><td><strong>${escape(row.display_name)}</strong><small>${escape(row.id)}</small></td><td>${escape(fmtDate(row.created_at))}</td>
    <td>${badge(row.active ? 'Active' : 'Suspended', row.active ? 'active' : 'suspended')}</td><td>${row.id !== user.id ? `<form id="user-${index}"><button class="button secondary">${row.active ? 'Suspend account' : 'Restore account'}</button></form>` : 'Your account'}</td></tr>`).join('')}
    </tbody></table></div>${paging(page, rows.length > 25)}</section></div>`, 'PLATFORM OWNER');
  rows.slice(0, 25).forEach((row, index) => bindForm(`user-${index}`, async () => {
    if (row.active && !confirm(`Suspend ${row.display_name} across all restaurants?`)) return;
    unbox(await client.from('profiles').update({ active: !row.active }).eq('id', row.id).select('id').single());
    replacePage(location.href);
  }));
}

async function chooseRestaurant() {
  const page = pageNumber();
  const rows = unbox(await client.from('restaurants').select('slug,name').order('name').order('slug').range((page - 1) * 20, page * 20));
  if (page === 1 && rows.length === 1) return replacePage(`/r/${rows[0].slug}/`);
  if (page === 1 && !rows.length) return blocked('No restaurant access', 'Ask your administrator to invite you to a restaurant.');
  app.innerHTML = panel('Choose a restaurant', 'Open one of your authorized workspaces.', `<div class="choices">${rows.slice(0, 20).map(row => `<a href="/r/${escape(row.slug)}/" class="choice">
    <img src="/r/${escape(row.slug)}/icon-192.png" alt="" loading="lazy"><span><strong>${escape(row.name)}</strong><small>Restaurant workspace</small></span>${icon('arrow', 18)}</a>`).join('')}</div>
    ${paging(page, rows.length > 20)}${signoutForms()}`, { kicker: 'RESTAURANT ACCESS' });
  bindLogout();
}

function tenantNav(admin) {
  return [ [restaurantPath, 'Client menu', 'plate'], [ `${restaurantPath}manage`, 'Restaurant profile', 'store'], ...(admin ? [[`${restaurantPath}team`, 'Team & invitations', 'users']] : []),
    ...(standalone ? [] : [[identity.owner ? '/owner' : '/', identity.owner ? 'Owner dashboard' : 'My restaurants', 'grid']]) ];
}

const price = value => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value || 0));

async function clientMenu(row) {
  let categories = [];
  let items = [];
  try {
    [categories, items] = await Promise.all([
      client.from('restaurant_menu_categories').select('id,name,sort_order').eq('restaurant_id', row.id).order('sort_order').order('name').then(unbox),
      client.from('restaurant_menu_items').select('id,category_id,name,description,price,image_url,available,featured,sort_order').eq('restaurant_id', row.id).eq('available', true).order('featured', { ascending: false }).order('sort_order').order('name').then(unbox)
    ]);
  } catch (error) {
    // A brand can be published before its first catalog migration reaches an
    // environment. Keep the client page available and show its empty state.
    console.warn('Client catalog is unavailable', error.message);
  }
  const grouped = categories.map(category => ({ ...category, items: items.filter(item => item.category_id === category.id) }));
  const ungrouped = items.filter(item => !item.category_id);
  if (ungrouped.length) grouped.push({ id: 'other', name: 'More to try', items: ungrouped });
  app.innerHTML = `<main class="client-menu" id="main"><header class="client-top"><a class="client-brand" href="${restaurantPath}" aria-label="${escape(row.name)} menu"><img src="${restaurantPath}icon-192.png" alt="" width="46" height="46"><span><strong>${escape(brand.short_name || row.name)}</strong><small>${escape(brand.slogan || 'Order from our menu')}</small></span></a><a class="button ghost client-manage" href="${restaurantPath}manage">Restaurant sign-in</a></header>
    <section class="client-hero"><div><span class="eyebrow">WELCOME TO</span><h1>${escape(row.name)}</h1><p>${escape(brand.slogan || 'Freshly prepared for every table.')}</p><div class="client-actions"><a href="#menu" class="button primary">Browse menu</a><button id="client-install" class="button secondary" type="button">Download app</button></div></div><img src="${restaurantPath}icon-512.png" alt="${escape(row.name)} logo"></section>
    <nav class="client-categories" aria-label="Menu categories"><a href="#menu">All</a>${grouped.map(group => `<a href="#cat-${escape(group.id)}">${escape(group.name)}</a>`).join('')}</nav>
    <section class="client-content" id="menu"><div class="client-heading"><div><span class="eyebrow">CLIENT MENU</span><h2>Order your favourites</h2></div><p>${items.length ? `${items.length} dishes available today` : 'The menu is being prepared.'}</p></div>${grouped.length ? grouped.map(group => `<section class="client-category" id="cat-${escape(group.id)}"><h2>${escape(group.name)}</h2><div class="client-grid">${group.items.map(item => `<article class="client-dish"><div class="client-dish-image">${item.image_url ? `<img src="${escape(item.image_url)}" alt="${escape(item.name)}">` : `<img src="${restaurantPath}icon-192.png" alt="">`}${item.featured ? '<span>Chef\'s pick</span>' : ''}</div><div class="client-dish-body"><h3>${escape(item.name)}</h3><p>${escape(item.description)}</p><div><strong>${price(item.price)}</strong><button class="client-add" type="button" data-name="${escape(item.name)}" data-price="${escape(item.price)}">Add</button></div></div></article>`).join('')}</div></section>`).join('') : `<div class="client-empty"><img src="${restaurantPath}icon-192.png" alt=""><h2>Menu coming soon</h2><p>The restaurant is getting its menu ready. Please check back shortly.</p></div>`}</section>
    <footer class="client-footer">${escape(row.name)} · Secure restaurant ordering</footer></main>`;
  document.querySelectorAll('.client-add').forEach(button => button.addEventListener('click', () => showToast(`${button.dataset.name} added to your order. Ordering checkout will be enabled with the restaurant's payment setup.`)));
  const install = document.querySelector('#client-install');
  install?.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return showToast('Use your browser menu and choose “Install page as app” to download this restaurant app.');
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
  });
}

async function sessionToken() {
  const { session } = unbox(await client.auth.getSession());
  if (!session) throw new Error('Your session ended. Sign in again.');
  return session.access_token;
}

async function sendInvite(row, { email, role }) {
  const token = await sessionToken();
  return read(await fetch('/api/invite', { method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ restaurant: row.id, email, role }) }));
}

function inviteState(invite) {
  if (invite.accepted_at) return ['Accepted', 'active'];
  if (invite.cancelled_at) return ['Cancelled', 'suspended'];
  if (new Date(invite.expires_at) <= new Date()) return ['Expired', 'suspended'];
  return ['Pending', 'trial'];
}

function inviteReceipt(result) {
  const message = result.email === 'submitted' ? 'Invitation submitted to the email provider.'
    : 'Invitation created. Email delivery could not be confirmed.';
  document.querySelector('#invite-result').innerHTML = `<p role="status">${message}</p>${result.link ? `<label>Private invitation link
    <input readonly value="${escape(result.link)}"></label>` : ''}<a href="${restaurantPath}team" class="text-link">Refresh invitation list</a>`;
}

async function team(row) {
  const page = pageNumber();
  const [members, invites] = await Promise.all([
    client.from('memberships').select('user_id,role,active,profiles!memberships_user_id_fkey(display_name)').eq('restaurant_id', row.id).order('created_at').order('user_id')
      .range((page - 1) * 25, page * 25).then(unbox),
    client.from('invitations').select('id,email,role,created_at,expires_at,accepted_at,cancelled_at').eq('restaurant_id', row.id)
      .order('created_at', { ascending: false }).order('id').range((page - 1) * 25, page * 25).then(unbox)
  ]);
  const canManage = member => member.user_id !== user.id && (identity.owner || member.role !== 'administrator');
  const canReplace = invite => !invite.accepted_at && !invite.cancelled_at && (identity.owner || invite.role !== 'administrator');
  shell(row.name, tenantNav(true), `<div class="page-body">${headings('RESTAURANT ACCESS', 'Team & invitations', 'Grant access to this restaurant and manage who can sign in.')}
    <section class="card inset"><h2>Invite a team member</h2><p class="subtle">Each invitation expires after 48 hours and can be accepted once.</p>
    <form id="new-invite" class="form-grid"><label>Email address<input type="email" name="email" maxlength="254" required></label><label>Role<select name="role">${roleOptions('staff', identity.owner)}</select></label>
    <p class="form-error full" role="alert"></p><div class="full"><button class="button primary">${icon('plus', 18)} Create invitation</button></div></form><div id="invite-result" class="form-note"></div></section>
    <section class="card inset"><h2>Restaurant memberships</h2>${members.length ? `<div class="table-scroll"><table><thead><tr><th>Name</th><th>Role</th><th>Membership status</th><th>Actions</th></tr></thead>
      <tbody>${members.slice(0, 25).map((member, index) => `<tr><td><strong>${escape(member.profiles?.display_name || 'Account')}</strong>${member.user_id === user.id ? '<small>Your account</small>' : ''}</td>
      <td>${roles[member.role]}</td><td>${badge(member.active ? 'Active' : 'Suspended', member.active ? 'active' : 'suspended')}</td><td>${canManage(member) ? `<form id="member-${index}" class="row-actions">
      <label class="sr-only" for="role-${index}">New role for ${escape(member.profiles?.display_name)}</label><select id="role-${index}" name="role">${roleOptions(member.role, identity.owner)}</select>
      <button class="button secondary" name="action" value="save">Save role</button><button class="button secondary" name="action" value="toggle">${member.active ? 'Suspend' : 'Restore'}</button></form>` : '—'}</td></tr>`).join('')}</tbody></table></div>`
      : empty('No members on this page', 'Accepted invitations appear in the team list.')}</section>
    <section class="card inset"><h2>Invitation history</h2>${invites.length ? `<div class="table-scroll"><table><thead><tr><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${invites.slice(0, 25).map((invite, index) => `<tr><td><strong>${escape(invite.email)}</strong><small>Expires ${escape(fmtDate(invite.expires_at))}</small></td><td>${roles[invite.role]}</td>
      <td>${badge(...inviteState(invite))}</td><td>${canReplace(invite) ? `<form id="invite-${index}" class="row-actions"><button class="button secondary" name="action" value="resend">Resend</button>
      <button class="button secondary" name="action" value="cancel">Cancel</button></form>` : '—'}</td></tr>`).join('')}</tbody></table></div>` : empty('No invitations on this page', 'Create an invitation to onboard a team member.')}
      ${paging(page, members.length > 25 || invites.length > 25)}</section></div>`, 'RESTAURANT WORKSPACE');
  bindForm('new-invite', async (values, _button, form) => {
    inviteReceipt(await sendInvite(row, values));
    form.reset();
  });
  members.slice(0, 25).forEach((member, index) => bindForm(`member-${index}`, async ({ role }, button) => {
    const toggle = button?.value === 'toggle';
    if (toggle && member.active && !confirm('Suspend this team member’s restaurant access?')) return;
    await rpc('platform_set_membership', { p_restaurant: row.id, p_user: member.user_id,
      p_role: toggle ? member.role : role, p_active: toggle ? !member.active : member.active });
    replacePage(location.href);
  }));
  invites.slice(0, 25).forEach((invite, index) => bindForm(`invite-${index}`, async (_values, button) => {
    if (button?.value === 'resend') {
      if (!confirm('Replace the current invitation with a new link?')) return;
      inviteReceipt(await sendInvite(row, invite));
      document.querySelector('#invite-result').scrollIntoView({ block: 'nearest' });
      return;
    }
    if (!confirm('Cancel this invitation?')) return;
    await rpc('platform_cancel_invite', { p_restaurant: row.id, p_invite: invite.id });
    replacePage(location.href);
  }));
}

async function encodedImage(file) {
  if (!file?.size || file.size > 2_000_000 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new Error('Choose a PNG, JPEG or WebP image up to 2 MB.');
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('The selected file could not be read.'));
    reader.readAsDataURL(file);
  });
}

async function changeLogo(action, file, progress) {
  const token = await sessionToken();
  const image = action === 'upload' ? await encodedImage(file) : null;
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(image ? 'POST' : 'DELETE', `/api/logo?slug=${slug}`);
    request.setRequestHeader('Authorization', `Bearer ${token}`);
    request.timeout = 25000;
    if (image) request.setRequestHeader('Content-Type', 'application/json');
    request.upload.onprogress = event => {
      if (event.lengthComputable) progress.value = event.loaded / event.total;
    };
    request.onload = () => {
      if (request.status === 204) return resolve();
      try { reject(new Error(JSON.parse(request.responseText).error || 'Logo change failed.')); }
      catch { reject(new Error('Logo change failed. Try again.')); }
    };
    request.onerror = request.ontimeout = () => reject(new Error('The logo request could not reach the server. Try again.'));
    request.send(image ? JSON.stringify({ image }) : null);
  });
}

async function tenantProfile(row, role, admin) {
  let categories = [];
  let menuItems = [];
  if (admin) {
    try {
      [categories, menuItems] = await Promise.all([
        client.from('restaurant_menu_categories').select('id,name,sort_order').eq('restaurant_id', row.id).order('sort_order').order('name').then(unbox),
        client.from('restaurant_menu_items').select('id,category_id,name,description,price,available,featured,sort_order').eq('restaurant_id', row.id).order('sort_order').order('name').then(unbox)
      ]);
    } catch (error) { console.warn('Client catalog administration is unavailable', error.message); }
  }
  shell(row.name, tenantNav(admin), `<div class="page-body">${headings('RESTAURANT PROFILE', row.name, brand.slogan || 'Manage your restaurant identity and access.')}
    <section class="card inset profile"><div class="section-head"><div><h2>Brand identity</h2><p class="subtle">Used for your branded sign-in and installed app.</p></div>${badge(roles[role] || 'Platform owner', 'active')}</div>
    <div class="profile-columns"><div class="logo-panel"><img id="restaurant-logo" src="${restaurantPath}icon-192.png" alt="${escape(row.name)} logo" width="144" height="144">
    ${admin ? `<form id="logo-form" class="stack"><label>Restaurant logo<input type="file" name="file" accept="image/png,image/jpeg,image/webp"></label>
      <small>PNG, JPEG or WebP · up to 2 MB</small><progress id="upload-progress" max="1" value="0" aria-label="Upload progress" hidden></progress><p class="form-error" role="alert"></p>
      <div class="row-actions"><button class="button secondary" name="action" value="upload">Upload logo</button><button class="button secondary" name="action" value="remove">Use monogram</button></div></form>` : ''}</div>
    ${admin ? `<form id="branding" class="form-grid"><label class="full">Restaurant name<input name="name" value="${escape(row.name)}" maxlength="80" required></label>
      <label class="full">App short name<input name="short_name" value="${escape(brand.short_name)}" maxlength="24"></label>
      <label class="full">Slogan<input name="slogan" value="${escape(brand.slogan)}" maxlength="120"></label>
      <label>Theme color<input name="theme_color" type="color" value="${escape(brand.theme_color)}"></label><label>Background color<input name="background_color" type="color" value="${escape(brand.background_color)}"></label>
      <p class="form-error full" role="alert"></p><div class="full"><button class="button primary">Save branding</button></div></form>`
      : `<dl class="status-breakdown"><div><dt>Restaurant</dt><dd>${escape(row.name)}</dd></div><div><dt>App name</dt><dd>${escape(brand.short_name || row.name)}</dd></div>
      <div><dt>Status</dt><dd>${badge(statuses[row.status], row.status)}</dd></div></dl>`}</div></section>
    ${admin ? `<section class="card inset"><div class="section-head"><div><h2>Client menu</h2><p class="subtle">This is the menu your client sees at <a class="text-link" href="${restaurantPath}" target="_blank" rel="noopener">${restaurantPath}</a>.</p></div></div>
      <div class="catalog-admin"><form id="new-category" class="form-grid"><label>Category name<input name="name" maxlength="60" required placeholder="e.g. Starters"></label><label>Display order<input name="sort_order" type="number" min="0" max="100000" value="0"></label><p class="form-error full" role="alert"></p><div class="full"><button class="button secondary" type="submit">${icon('plus', 16)} Add category</button></div></form>
      <form id="new-menu-item" class="form-grid"><label>Dish name<input name="name" maxlength="120" required placeholder="e.g. Truffle mushroom risotto"></label><label>Price (INR)<input name="price" type="number" min="0" max="1000000" step="0.01" required></label><label>Category<select name="category_id"><option value="">More to try</option>${categories.map(category => `<option value="${escape(category.id)}">${escape(category.name)}</option>`).join('')}</select></label><label>Display order<input name="sort_order" type="number" min="0" max="100000" value="0"></label><label class="full">Description<input name="description" maxlength="600" placeholder="A short description for clients"></label><label class="full">Photo URL (optional)<input name="image_url" type="url" maxlength="2048" placeholder="https://..."></label><label class="check"><input name="featured" type="checkbox"> Feature this dish</label><p class="form-error full" role="alert"></p><div class="full"><button class="button primary" type="submit">${icon('plus', 16)} Add to client menu</button></div></form></div>
      ${menuItems.length ? `<div class="table-scroll"><table><thead><tr><th>Dish</th><th>Price</th><th>Client status</th><th></th></tr></thead><tbody>${menuItems.map((item, index) => `<tr><td><strong>${escape(item.name)}</strong><small>${escape(item.description)}</small></td><td>${price(item.price)}</td><td>${badge(item.available ? 'Available' : 'Hidden', item.available ? 'active' : 'suspended')}</td><td><form id="menu-item-${index}" class="row-actions"><button class="button secondary" name="action" value="toggle">${item.available ? 'Hide' : 'Show'}</button><button class="button secondary" name="action" value="delete">Remove</button></form></td></tr>`).join('')}</tbody></table></div>` : empty('No menu items yet', 'Add dishes here. They appear immediately on the client URL.')}</section>` : ''}
    <section class="card inset"><h2>Install this restaurant app</h2><p class="subtle">Download a shortcut that opens directly to this restaurant’s client menu.</p>
    <div class="row-actions"><button id="install-app" class="button primary" type="button">Download app</button><a class="text-link" href="${restaurantPath}manifest.webmanifest">View app manifest ${icon('arrow', 16)}</a></div>
    <p id="install-help" class="subtle">If the download prompt is unavailable, use your browser’s menu and choose “Install page as app”.</p></section></div>`, 'RESTAURANT WORKSPACE');
  const installButton = document.querySelector('#install-app');
  installButton?.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return showToast('Use your browser’s menu and choose “Install page as app” to download this restaurant app.');
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installButton.hidden = true;
  });
  bindForm('branding', async ({ name, short_name, slogan, theme_color, background_color }) => {
    await rpc('platform_save_brand', { p_restaurant: row.id, p_name: name, p_short_name: short_name, p_slogan: slogan,
      p_theme_color: theme_color, p_background_color: background_color });
    showToast('Branding saved.');
    await render();
  });
  bindForm('logo-form', async ({ file }, button, form) => {
    const action = button?.value || 'upload';
    if (action === 'remove' && !confirm('Remove the uploaded logo and use the restaurant monogram?')) return;
    const progress = document.querySelector('#upload-progress');
    progress.value = 0;
    progress.hidden = action !== 'upload';
    try {
      await changeLogo(action, file, progress);
      form.reset();
      document.querySelectorAll(`img[src^="${restaurantPath}icon-192.png"]`).forEach(element => { element.src = `${restaurantPath}icon-192.png?v=${Date.now()}`; });
      showToast(action === 'upload' ? 'Logo uploaded.' : 'Restaurant monogram restored.');
    } finally { progress.hidden = true; }
  });
  bindForm('new-category', async ({ name, sort_order }, _button, form) => {
    unbox(await client.from('restaurant_menu_categories').insert({ restaurant_id: row.id, name: name.trim(), sort_order: Number(sort_order) || 0 }));
    form.reset();
    await tenantProfile(row, role, admin);
  });
  bindForm('new-menu-item', async ({ name, price: itemPrice, category_id, sort_order, description, image_url, featured }, _button, form) => {
    unbox(await client.from('restaurant_menu_items').insert({ restaurant_id: row.id, name: name.trim(), price: Number(itemPrice), category_id: category_id || null,
      sort_order: Number(sort_order) || 0, description: description.trim(), image_url: image_url.trim(), featured: featured === 'on' }));
    form.reset();
    await tenantProfile(row, role, admin);
  });
  menuItems.forEach((item, index) => bindForm(`menu-item-${index}`, async (_values, button) => {
    if (button?.value === 'delete') {
      unbox(await client.from('restaurant_menu_items').delete().eq('id', item.id));
    } else {
      unbox(await client.from('restaurant_menu_items').update({ available: !item.available }).eq('id', item.id));
    }
    await tenantProfile(row, role, admin);
  }));
}

let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  document.querySelector('#install-app')?.removeAttribute('hidden');
});

async function tenantWorkspace(row) {
  const membership = identity.owner ? null : unbox(await client.from('memberships').select('role').eq('restaurant_id', row.id).eq('user_id', user.id).eq('active', true).maybeSingle());
  const admin = identity.owner || membership?.role === 'administrator';
  if (match[2] === 'team') {
    if (!admin) return blocked('Team access unavailable', 'Only the restaurant administrator can manage team access.', `<a class="text-link" href="${restaurantPath}">Back to restaurant profile</a>`);
    return team(row);
  }
  if (match[2] === 'manage') return tenantProfile(row, membership?.role, admin);
  return clientMenu(row);
}

async function setupPwa() {
  for (const [rel, href] of [['manifest', `${restaurantPath}manifest.webmanifest`], ['icon', `${restaurantPath}icon-192.png`], ['apple-touch-icon', `${restaurantPath}icon-192.png`]]) {
    const link = document.head.querySelector(`link[rel="${rel}"]`) || document.createElement('link');
    link.rel = rel;
    link.href = href;
    if (!link.isConnected) document.head.append(link);
  }
  if (!('serviceWorker' in navigator) || document.documentElement.dataset.worker) return;
  document.documentElement.dataset.worker = 'true';
  const registration = await navigator.serviceWorker.register(`${restaurantPath}sw.js`, { scope: restaurantPath });
  function promptUpdate() {
    if (!registration.waiting || !navigator.serviceWorker.controller || document.querySelector('#pwa-update')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'pwa-update';
    button.className = 'button primary update';
    button.textContent = 'Reload for app update';
    button.onclick = () => {
      navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
      registration.waiting?.postMessage('activate-update');
    };
    document.body.append(button);
  }
  promptUpdate();
  registration.addEventListener('updatefound', () => registration.installing?.addEventListener('statechange', promptUpdate));
}

async function loadBrand() {
  brand = await rpc('platform_brand', { p_slug: slug });
  if (!brand) return false;
  document.title = `${brand.name} · Restaurant Operations`;
  document.querySelector('meta[name="theme-color"]').content = brand.theme_color;
  document.documentElement.style.setProperty('--brand-theme', brand.theme_color);
  setupPwa().catch(error => console.warn('Restaurant app install is unavailable', error.name));
  return true;
}

function tenantUnavailable() {
  brand = null;
  document.title = 'Restaurant Operations';
  document.documentElement.style.removeProperty('--brand-theme');
  for (const link of document.head.querySelectorAll('link[rel="manifest"], link[rel="icon"], link[rel="apple-touch-icon"]')) link.remove();
  return blocked('Restaurant unavailable', 'Check your access or contact your administrator.', standalone ? '' : '<a class="text-link" href="/">Back to sign-in</a>');
}

async function render() {
  if (!slug && !ownerRoute && !['/', '/account', '/accept'].includes(path)) return blocked('Page unavailable', 'This address does not match a workspace page.', '<a class="text-link" href="/">Go to sign-in</a>');
  if (path === '/accept' && !/^[a-f0-9]{64}$/.test(inviteToken || '')) return blocked('Invitation unavailable', 'Open the original link from your invitation.', '<a class="text-link" href="/">Go to sign-in</a>');
  // The canonical restaurant URL is the public client menu. Management lives at
  // /r/{slug}/manage, so a client never lands in the owner console.
  if (slug && !match[2]) {
    if (!(await loadBrand())) return tenantUnavailable();
    return clientMenu({ id: brand.id, slug: brand.slug, name: brand.name, status: 'active' });
  }
  const { session } = unbox(await client.auth.getSession());
  user = session?.user;
  if (!user) {
    if (slug && !(await loadBrand())) return tenantUnavailable();
    return authView();
  }
  if (recovering) return recoveryView();
  const assurance = unbox(await client.auth.mfa.getAuthenticatorAssuranceLevel());
  if (assurance.currentLevel !== 'aal2' && assurance.nextLevel === 'aal2') return mfaView(false);
  identity = await rpc('platform_identity');
  if (identity.owner_enrollment) return mfaView(true);
  if (path === '/accept') return acceptView();
  if (path === '/account') return accountView();
  if (!identity.active) return blocked('Account access unavailable', 'Contact your administrator or open a valid restaurant invitation.');
  if (ownerRoute && !identity.owner) return blocked('Platform access unavailable', 'This account can open its assigned restaurant workspaces.', '<a class="text-link" href="/">Back to my restaurants</a>');
  if (path === '/owner') return ownerDashboard();
  if (path === '/owner/restaurants') return ownerRestaurants();
  if (path === '/owner/users') return ownerUsers();
  if (path === '/owner/activity') return ownerActivity();
  if (slug) {
    const row = unbox(await client.from('restaurants').select('id,slug,name,status').eq('slug', slug).maybeSingle());
    if (!row || row.status === 'suspended' || !(await loadBrand())) return tenantUnavailable();
    return tenantWorkspace(row);
  }
  if (identity.owner) return replacePage('/owner');
  return chooseRestaurant();
}

function showProblem(error) {
  app.innerHTML = panel('Could not open the workspace', error.message || 'Try again in a moment.', '<button type="button" class="button primary" id="retry">Try again</button>');
  document.querySelector('#retry').onclick = () => location.reload();
}

async function boot() {
  const config = await read(await fetch('/api/config'));
  client = createClient(config.url, config.key, { auth: { flowType: 'pkce', storageKey: 'restaurant-operations-auth' } });
  client.auth.onAuthStateChange(event => {
    if (event === 'PASSWORD_RECOVERY') {
      recovering = true;
      setTimeout(() => render().catch(showProblem));
    }
    if (event === 'SIGNED_OUT' && user) setTimeout(() => replacePage(restaurantPath || '/'));
  });
  await render();
}

boot().catch(showProblem);
