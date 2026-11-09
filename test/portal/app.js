import { auth, rpc, worker } from './auth.js';

const view = document.querySelector('#view');
const status = document.querySelector('#status');
const nav = document.querySelector('#navigation');
const [, page, slug] = location.pathname.split('/');
const params = new URLSearchParams(location.search);
const slugRE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const currentLink = slug ? '/login/' + slug : '/login';
const fragment = new URLSearchParams(location.hash.slice(1));
if (location.hash && ['activate','recover'].includes(page)) history.replaceState(null,'',location.pathname);

function node(tag, props = {}, ...children) {
  const n = Object.assign(document.createElement(tag),props);
  n.append(...children.filter(child => child !== null && child !== undefined));
  return n;
}
const link = (text,href,primary = false) => node('a',{ href, className: primary ? 'button primary' : '' },text);
function button(text, run) {
  const b = node('button',{ type:'button' },text);
  b.addEventListener('click',() => perform(b,run));
  return b;
}
function note(text = '', error = false) {
  status.textContent = text;
  status.toggleAttribute('data-error',error);
}
async function perform(control,run) {
  if (control.disabled) return;
  control.disabled = true;
  note();
  try { await run(); } catch (error) { note(error.message,true); }
  finally { control.disabled = false; }
}
function screen(title, compact = true) {
  document.title = title + ' · Restaurant access';
  view.className = compact ? 'compact' : '';
  view.replaceChildren(node('h1',{ id:'title' },title));
}
function input(label,name,opts = {}) {
  return node('label',{},label,node('input',{ name, required:true, maxLength:254, ...opts }));
}
const emailInput = () => input('Email address','email',{ type:'email',autocomplete:'username' });
const passwordInput = (newPassword = false) => input(newPassword ? 'New password' : 'Password','password',{
  type:'password', minLength:newPassword ? 12 : 1, maxLength:72, autocomplete:newPassword ? 'new-password' : 'current-password'
});
const codeInput = () => input('Authenticator code','code',{ inputMode:'numeric', pattern:'[0-9]{6}', maxLength:6, autocomplete:'one-time-code' });
function form(label,fields,submit) {
  const go = node('button',{ type:'submit',className:'primary' },label);
  const f = node('form',{},...fields,go);
  f.addEventListener('submit',e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(f));
    perform(go,() => submit(data,f));
  });
  return f;
}
function actions(...children) { return node('div',{ className:'actions' },...children); }
function rows(...children) { return node('div',{ className:'rows' },...children); }
function card(...children) { return node('article',{ className:'row' },...children); }
function logo(restaurant) {
  if (!restaurant?.logo || !slugRE.test(restaurant.slug) || !/^[a-f0-9]{64}\.(png|jpeg|webp)$/.test(restaurant.logo)) return null;
  return node('img',{ className:'logo',alt:'',src:'/r/' + restaurant.slug + '/_media/' + restaurant.logo });
}
function destination(restaurant) {
  const path = '/r/' + restaurant.slug;
  return path + (restaurant.role === 'waiter' ? '/waiter.html' : '/billing-suite/index.html#/kitchen');
}
function navigation(mainOwner = false) {
  nav.replaceChildren(
    link(mainOwner ? 'Main Owner' : 'Restaurants',mainOwner ? '/owner' : '/restaurants'),
    link('Account','/account'),
    button('Sign out',async () => { try { await auth.logout(); } finally { location.replace(mainOwner ? '/owner' : '/login'); } })
  );
}
async function loginScreen(owner = false) {
  const brand = !owner && slug ? await rpc('brand',{ p_slug:slug },true).catch(() => null) : null;
  screen(owner ? 'Main Owner sign-in' : brand?.name || 'Restaurant sign-in');
  const image = logo(brand);
  if (image) view.prepend(image);
  view.append(node('p',{},owner ? 'Sign in to manage restaurant access.' : 'Sign in to your restaurant workspace.'));
  view.append(form('Sign in',[emailInput(),passwordInput()],async ({ email,password }) => {
    const current = await auth.login(email.trim(),password);
    await afterFactor(current,() => route());
  }), actions(link('Forgot password?','/recover'),link(owner ? 'Restaurant sign-in' : 'Main Owner sign-in',owner ? '/login' : '/owner')));
}
async function afterFactor(current,done,keep = true) {
  const user = await auth.user(current);
  const factor = auth.needsFactor(current,user);
  if (!factor) return done(current);
  screen('Verify your sign-in');
  view.append(node('p',{},'Enter the current code from your authenticator app.'));
  view.append(form('Verify',[codeInput()],async ({ code }) => done(await auth.factor(factor.id,code,current,keep))));
}
async function logoutAfterChange(current) {
  await auth.logout('global',current);
  location.replace('/login?password=updated');
}

function recover() {
  screen(fragment.has('token_hash') ? 'Choose a new password' : 'Recover your account');
  if (!fragment.has('token_hash')) {
    view.append(form('Send reset email',[emailInput()],async ({ email }) => {
      await auth.recover(email.trim());
      note('If an account can receive a reset email, a link will arrive shortly.');
    }));
  } else {
    let recovery;
    view.append(form('Set password',[passwordInput(true)],async ({ password }) => {
      recovery ||= await auth.verify(fragment.get('token_hash'),'recovery');
      await afterFactor(recovery,async verified => {
        recovery = verified;
        await auth.password(password,verified);
        await logoutAfterChange(verified);
      },false);
    }));
  }
  view.append(link('Back to sign-in','/login'));
}

async function activate() {
  screen('Accept your restaurant invitation');
  const invite = fragment.get('invite');
  if (!/^[a-f0-9]{64}$/.test(invite || '')) {
    view.append(node('p',{},'Open the complete invitation link from your email.'),link('Sign in','/login'));
    return;
  }
  const accept = async () => {
    const acceptedSlug = await rpc('accept_invitation',{ p_token:invite });
    location.replace('/login/' + acceptedSlug);
  };
  const bootstrap = fragment.get('bootstrap');
  if (bootstrap) {
    let provisional;
    view.append(node('p',{},'Create your password to activate your account and accept access.'));
    view.append(form('Create password and accept',[passwordInput(true)],async ({ password }) => {
      provisional ||= await auth.verify(bootstrap,'email');
      await auth.password(password,provisional);
      auth.saveSession(provisional);
      await accept();
    }));
    const existing = node('details',{},node('summary',{},'Already activated your account?'));
    existing.append(form('Sign in and accept',[emailInput(),passwordInput()],async ({ email,password }) => {
      await afterFactor(await auth.login(email.trim(),password),accept);
    }));
    view.append(existing);
  } else {
    view.append(node('p',{},'Sign in with the email address that received this invitation.'));
    const current = await auth.session().catch(() => null);
    if (current) view.append(button('Accept as ' + current.user.email,() => afterFactor(current,accept)));
    view.append(form('Sign in and accept',[emailInput(),passwordInput()],async ({ email,password }) => {
      await afterFactor(await auth.login(email.trim(),password),accept);
    }));
  }
  view.append(link('Recover your password','/recover'));
}

function selector(restaurants) {
  screen('Choose a restaurant',false);
  if (!restaurants.length) {
    view.append(node('p',{},'Your account has no active restaurant access. Contact the Main Owner if you are expecting an invitation.'));
    return;
  }
  view.append(rows(...restaurants.map(r => card(
    logo(r), node('h2',{},r.name),node('p',{},roleLabel(r.role)),link('Open workspace',destination(r),true)
  ))));
}
const roleLabel = role => ({ admin:'Administrator',manager:'Manager',waiter:'Waiter' })[role] || role;
const roleSelect = (owner, value = 'waiter') => node('label',{},'Role',node('select',{ name:'role' },
  ...((owner ? ['admin','manager','waiter'] : ['waiter']).map(role => node('option',{ value:role, selected:role===value },roleLabel(role))))));
const sendInvitation = (restaurant,email,role,name) => worker('/api/platform/invite',{
  method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ slug:restaurant,email,role,name })
});

async function uploadLogo(restaurant,file) {
  if (!file?.size) return null;
  const ext = { 'image/png':'png','image/jpeg':'jpeg','image/webp':'webp' }[file.type];
  if (!ext || file.size > 1048576) throw Error('Use a PNG, JPEG, or WebP image under 1 MB.');
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),
    b => b.toString(16).padStart(2,'0')).join('');
  const filename = digest + '.' + ext;
  await worker('/r/' + restaurant + '/_media/' + filename,{ method:'PUT',body:file,headers:{ 'Content-Type':file.type } });
  return filename;
}
const logoInput = () => input('Logo','logo',{ type:'file',accept:'image/png,image/jpeg,image/webp',required:false });

async function ownerPage() {
  screen('Main Owner portal',false);
  document.body.classList.add('owner-dashboard');
  const overview = await rpc('overview');
  const suspended = overview.total - overview.active;
  const activityRows = overview.activity || [];
  const metric = (icon,label,value,kind) => node('article',{className:'owner-metric '+kind},
    node('span',{className:'metric-icon','aria-hidden':'true'},icon),
    node('div',{},node('small',{},label),node('strong',{},String(value))));
  const side = node('aside',{className:'owner-sidebar'},
    node('div',{className:'owner-sidebar-brand'},'RESTAURANT',node('span',{},'CONTROL')),
    link('⌂  Dashboard','/owner'),link('▣  Restaurants','#restaurants'),
    link('♧  Clients','#restaurants'),link('♙  Users','#restaurants'),
    link('▥  Analytics','#insights'),link('⚙  Settings','/account'));
  const hero = node('section',{className:'owner-hero'},
    node('div',{},node('span',{className:'owner-kicker'},'MAIN OWNER WORKSPACE'),
      node('h1',{},'Welcome back!'),node('p',{},'Manage all your restaurant clients from one place.')),
    node('a',{href:'#add-restaurant',className:'button primary owner-add-link'},'+  Add Restaurant'));
  const metrics = node('section',{className:'owner-metrics','aria-label':'Platform totals'},
    metric('▣','Total Restaurants',overview.total,'red'),metric('♧','Active Restaurants',overview.active,'purple'),
    metric('▥','Recent Activity',activityRows.length,'green'),metric('◉','Suspended',suspended,'orange'));
  const ring = node('div',{className:'owner-ring',style:'--active-ratio:'+
    (overview.total ? Math.round(overview.active/overview.total*100) : 0)+'%'},
    node('div',{},node('strong',{},String(overview.total)),node('small',{},'Restaurants')));
  const insights = node('section',{className:'owner-insights',id:'insights'},
    node('article',{className:'owner-panel'},node('h2',{},'Platform overview'),
      node('p',{},'Live restaurant counts from your platform'),
      node('div',{className:'owner-overview-bars'},
        node('span',{},'Active',node('b',{},String(overview.active))),
        node('div',{className:'owner-bar'},node('i',{style:'width:'+
          (overview.total ? Math.round(overview.active/overview.total*100) : 0)+'%'})),
        node('span',{},'Suspended',node('b',{},String(suspended))),
        node('div',{className:'owner-bar suspended'},node('i',{style:'width:'+
          (overview.total ? Math.round(suspended/overview.total*100) : 0)+'%'})))),
    node('article',{className:'owner-panel'},node('h2',{},'Restaurants by Status'),ring,
      node('p',{className:'owner-legend'},'🟢 Active '+overview.active+'   •   🟠 Suspended '+suspended)),
    node('article',{className:'owner-panel'},node('h2',{},'Recent Activity'),
      node('ul',{className:'owner-activity'},...activityRows.slice(0,5).map(a=>
        node('li',{},node('strong',{},a.action),node('small',{},
          (a.slug||'Platform')+' · '+new Date(a.created_at).toLocaleString()))))));
  view.replaceChildren(side,node('div',{className:'owner-content'},hero,metrics,insights));
  const content = view.querySelector('.owner-content');
  const add = node('details',{id:'add-restaurant',className:'owner-panel owner-add-form'},node('summary',{},'Add restaurant'));
  add.append(form('Create restaurant and invite owner',[
    input('Restaurant name','name',{ maxLength:100 }),
    input('URL code','slug',{ pattern:slugRE.source.slice(1,-1), maxLength:40, placeholder:'restaurant-name' }),
    input('Owner email','email',{ type:'email' }),logoInput()
  ],async ({ name,slug:code,email,logo:file },f) => {
    await rpc('create_restaurant',{ p_slug:code,p_name:name });
    const jobs = [sendInvitation(code,email,'admin',email.split('@')[0].slice(0,100))];
    if (file?.size) jobs.push(uploadLogo(code,file).then(filename => rpc('update_restaurant',{ p_slug:code,p_name:name,p_active:true,p_logo:filename })));
    const results = await Promise.allSettled(jobs);
    f.reset();
    await ownerPage();
    const errors = results.filter(r => r.status === 'rejected').map(r => r.reason.message);
    note(errors.length ? 'Restaurant created. ' + errors.join(' ') : 'Restaurant created and owner invitation sent.', !!errors.length);
  }));
  content.append(add);
  let query = '', active = null, offset = 0;
  const checked = new Set();
  const listing = node('section',{id:'restaurants',className:'owner-listing'},node('h2',{},'Your Restaurants'));
  const filters = node('section',{className:'owner-panel owner-filters'});
  const filter = node('label',{},'Status',node('select',{ name:'active' },
    node('option',{ value:'' },'All statuses'),node('option',{ value:'active' },'Active'),
    node('option',{ value:'suspended' },'Suspended')));
  const bulk = next => async () => {
    if (!checked.size) throw Error('Select at least one restaurant.');
    const action = next ? 'Resume' : 'Suspend';
    if (!confirm(action + ' access for ' + checked.size + ' selected restaurants?')) return;
    const count = await rpc('bulk_status',{ p_slugs:[...checked],p_active:next });
    await ownerPage();
    note(count + ' restaurants updated.');
  };
  filters.append(form('Search',[input('Find a restaurant','query',{ required:false,type:'search' }),filter],async data => {
    query = data.query.trim();
    active = data.active ? data.active==='active' : null;
    offset = 0;
    await load();
  }),actions(button('Suspend selected',bulk(false)),button('Resume selected',bulk(true))));
  content.append(filters,listing);
  async function load() {
    checked.clear();
    const records = await rpc('restaurants',{ p_query:query,p_offset:offset,p_active:active });
    listing.replaceChildren(node('h2',{},'Your Restaurants'));
    listing.append(rows(...records.slice(0,50).map(r => {
      const edit = node('details',{},node('summary',{},'Edit restaurant'));
      edit.append(form('Save restaurant',[input('Restaurant name','name',{ value:r.name,maxLength:100 }),logoInput(),
        input('Restaurant active','active',{ type:'checkbox',required:false,checked:r.active })
      ],async ({ name,logo:file,active }) => {
        const filename = await uploadLogo(r.slug,file);
        await rpc('update_restaurant',{ p_slug:r.slug,p_name:name,p_active:!!active,p_logo:filename });
        await ownerPage();
        note('Restaurant updated.');
      }));
      const select = node('input',{ type:'checkbox' });
      select.addEventListener('change',() => select.checked ? checked.add(r.slug) : checked.delete(r.slug));
      return card(logo(r),node('h2',{},r.name),node('p',{},r.slug + (r.active ? ' · Active' : ' · Suspended')),
        node('label',{ className:'bulk-select' },select,'Select ' + r.name),
        actions(link('Enter restaurant',destination(r),true),link('Manage users','/members/' + r.slug),
          link('Client login','/login/' + r.slug)),edit);
    })));
    if (!records.length) listing.append(node('p',{},'No restaurants found.'));
    listing.append(actions(
      offset > 0 ? button('Previous',async () => { offset -= 50; await load(); }) : null,
      records.length > 50 ? button('Next',async () => { offset += 50; await load(); }) : null
    ));
  }
  await load();
}

async function membersPage(owner) {
  if (!slug) { location.replace(owner ? '/owner' : '/restaurants'); return; }
  const data = await rpc('members',{ p_slug:slug });
  screen('Manage restaurant access',false);
  view.append(node('p',{},slug),link('Return to workspace',destination({ slug,role:'admin' })),
    form('Send invitation',[emailInput(),input('Name','name',{ maxLength:100 }),roleSelect(owner)],async ({ email,role,name }) => {
      await sendInvitation(slug,email,role,name).catch(async error => { await membersPage(owner); throw error; });
      await membersPage(owner);
      note('Invitation sent.');
    }));
  view.append(node('h2',{},'Pending invitations'),rows(...data.invitations.map(i => card(
    node('p',{},i.email + ' · ' + roleLabel(i.role) + ' · ' + (new Date(i.expires_at)>new Date() ? 'Pending' : 'Expired')),
    actions(button('Resend',async () => { await sendInvitation(slug,i.email,i.role,i.name); await membersPage(owner); note('New invitation sent.'); }),
      button('Cancel invitation',async () => { await rpc('cancel_invitation',{ p_slug:slug,p_email:i.email }); await membersPage(owner); }))
  ))));
  view.append(node('h2',{},'Current users'),rows(...data.members.map(m => {
    const change = async (action, extras = {}) => {
      await rpc('update_member',{ p_slug:slug,p_user:m.user_id,p_action:action,...extras });
      await membersPage(owner);
    };
    return card(node('h2',{},m.name),node('p',{},m.email + ' · ' + roleLabel(m.role) + (m.active ? ' · Active' : ' · Suspended')),
      actions(button(m.active ? 'Suspend' : 'Resume',() => change(m.active ? 'suspend' : 'resume')),
        button('Remove',async () => { if (confirm('Remove this account’s access to this restaurant?')) await change('remove'); })),
      form('Save membership',[input('Name','name',{ value:m.name,maxLength:100 }),roleSelect(owner,m.role)],
        ({ name,role }) => change('edit',{ p_name:name,p_role:role }))
    );
  })));
}

function accountPage(current) {
  screen('Account and security');
  view.append(node('p',{},current.user.email),link('Reset password by email','/recover'));
  view.append(node('h2',{},'Multifactor authentication'),
    button('Add authenticator',async () => {
      const enrolled = await auth.enroll();
      const box = node('section',{},node('p',{},'Scan this code or enter the setup key in your authenticator app.'));
      if (/^data:image\/svg\+xml[;,]/.test(enrolled.totp.qr_code)) box.append(node('img',{ className:'qr',src:enrolled.totp.qr_code,alt:'Authenticator setup QR code' }));
      box.append(node('code',{},enrolled.totp.secret),form('Enable authenticator',[codeInput()],async ({ code }) => {
        await auth.factor(enrolled.id,code);
        box.remove();
        note('Authenticator enabled.');
      }));
      view.append(box);
    }),
    node('h2',{},'Sessions'),
    button('Sign out everywhere',async () => { await auth.logout('global'); location.replace('/login'); })
  );
}

async function route(verified) {
  if (page === 'activate') return activate();
  if (page === 'recover') return recover();
  const current = verified || await auth.session().catch(error => {
    if (error.status >= 400 && error.status < 500) return null;
    throw error;
  });
  if (!current) {
    if (page !== 'owner' && page !== 'login') { location.replace('/login'); return; }
    await loginScreen(page === 'owner');
    if (params.get('password') === 'updated') note('Password updated. Sign in again.');
    return;
  }
  if (!verified) return afterFactor(current,session => route(session));
  const access = await rpc('me');
  navigation(access.main_owner);
  if (page === 'owner') {
    if (access.main_owner) return ownerPage();
    screen('Main Owner access required');
    view.append(link('Open restaurant access','/restaurants'));
    return;
  }
  if (page === 'account') return accountPage(current);
  if (page === 'members') return membersPage(access.main_owner);
  if (access.main_owner) { location.replace('/owner'); return; }
  if (page === 'login') {
    const selected = slug ? access.restaurants.find(r => r.slug === slug) : access.restaurants.length === 1 ? access.restaurants[0] : null;
    if (selected) { location.replace(destination(selected)); return; }
    if (slug) note('Your account has no active access to that restaurant.',true);
  }
  selector(access.restaurants);
}

route().catch(async error => {
  if (error.status === 401) {
    auth.saveSession(null);
    if (page === 'owner' || page === 'login') await loginScreen(page === 'owner');
    else location.replace(currentLink);
    return;
  }
  screen('Access could not be loaded');
  view.append(link('Try again',location.pathname),button('Sign out',async () => {
    try { await auth.logout(); } finally { location.replace('/login'); }
  }));
  note(error.message,true);
});

addEventListener('hashchange', () => {
  if (location.hash && ['activate','recover'].includes(page)) location.reload();
});
