import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import config from '../api/config.js';
import manifest from '../api/manifest.js';
import logo from '../api/logo.js';
import invite from '../api/invite.js';
import { as, openFixture } from './fixture.js';

const api = { config, manifest, logo, invite };
const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
const rpcArgs = {
  platform_identity: [], platform_overview: [], platform_brand: ['p_slug'], platform_brand_target: ['p_slug'],
  platform_save_brand: ['p_restaurant', 'p_name', 'p_short_name', 'p_slogan', 'p_theme_color', 'p_background_color'],
  platform_issue_invite: ['p_restaurant', 'p_email', 'p_role'], platform_accept_invite: ['p_token', 'p_name'],
  platform_cancel_invite: ['p_restaurant', 'p_invite'], platform_set_membership: ['p_restaurant', 'p_user', 'p_role', 'p_active']
};
const fields = {
  restaurants: ['id','slug','name','status','created_at'],
  restaurant_branding: ['restaurant_id','short_name','slogan','theme_color','background_color'],
  profiles: ['id','display_name','active','created_at'],
  memberships: ['restaurant_id','user_id','role','active','created_at'],
  invitations: ['id','restaurant_id','email','role','created_at','expires_at','accepted_at','cancelled_at'],
  platform_audit: ['id','occurred_at','event','restaurant_id','actor_id','target_id']
};

async function readRequest(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
}

function responder(res) {
  res.status = status => { res.statusCode = status; return res; };
  res.send = body => res.end(body);
  res.json = body => { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(body)); };
  return res;
}

function accessToken(claims) {
  const base64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const content = `${base64({ alg: 'HS256', typ: 'JWT' })}.${base64({ ...claims, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  return `${content}.${createHmac('sha256', 'local-fixture-key').update(content).digest('base64url')}`;
}

async function tableRequest(db, claims, req, url, table) {
  const allow = fields[table];
  if (!allow) throw new Error(`Unexpected table ${table}`);
  const filter = url.searchParams;
  const select = (filter.get('select') || 'id').split(',').map(field => {
    if (allow.includes(field)) return `t.${field}`;
    if (table === 'memberships' && field === 'profiles!memberships_user_id_fkey(display_name)') {
      return "(select jsonb_build_object('display_name',p.display_name) from public.profiles p where p.id=t.user_id) as profiles";
    }
    throw new Error(`Unexpected field ${field}`);
  }).join(',');
  const params = [];
  const value = input => { params.push(input); return `$${params.length}`; };
  const where = [...filter].filter(([field]) => allow.includes(field)).map(([field, criterion]) => {
    const [operation] = criterion.split('.', 1);
    const sql = operation === 'eq' ? '=' : operation === 'ilike' ? 'ilike' : null;
    if (!sql) throw new Error(`Unexpected filter ${operation}`);
    return `t.${field} ${sql} ${value(criterion.slice(operation.length + 1))}`;
  });
  const clauses = where.length ? ` where ${where.join(' and ')}` : '';
  const relation = `public.${table} as t`;
  if (req.method === 'POST') {
    const { slug, name } = req.body;
    return as(db, claims, `insert into ${relation}(slug,name) values(${value(slug)},${value(name)}) returning ${select}`, params);
  }
  if (req.method === 'PATCH') {
    const updates = Object.entries(req.body).map(([field, item]) => {
      if (!allow.includes(field)) throw new Error(`Unexpected field ${field}`);
      return `${field}=${value(item)}`;
    });
    return as(db, claims, `update ${relation} set ${updates.join(',')}${clauses} returning ${select}`, params);
  }
  const order = (filter.get('order') || '').split(',').filter(Boolean).map(part => {
    const [field, direction] = part.split('.');
    if (!allow.includes(field) || !['asc', 'desc'].includes(direction)) throw new Error(`Unexpected order ${part}`);
    return `t.${field} ${direction}`;
  });
  const sort = order.length ? ` order by ${order.join(',')}` : '';
  return as(db, claims, `select ${select} from ${relation}${clauses}${sort} limit ${value(filter.get('limit') || 1000)} offset ${value(filter.get('offset') || 0)}`, params);
}

export async function startFixture({ dist = false } = {}) {
  const db = await openFixture();
  const credentials = new Map();
  const tokens = new Map();
  const server = createServer(async (req, rawRes) => {
    const res = responder(rawRes);
    for (const { key, value } of vercel.headers[0].headers) res.setHeader(key, value);
    const url = new URL(req.url, 'http://127.0.0.1');
    const path = url.pathname;
    try {
      req.query = Object.fromEntries(url.searchParams);
      if (req.headers['content-type']?.startsWith('application/json')) req.body = await readRequest(req);
      const token = req.headers.authorization?.replace(/^Bearer /, '');
      const claims = tokens.get(token) || null;
      if (path === '/auth/v1/token' && req.method === 'POST') {
        const account = credentials.get(req.body.email);
        if (!account || req.body.password !== 'fixture-password') return res.status(400).json({ message: 'Invalid login credentials', code: 'invalid_credentials' });
        const result = accessToken(account);
        tokens.set(result, account);
        return res.json({ access_token: result, refresh_token: result, expires_in: 3600, token_type: 'bearer', user: authUser(account) });
      }
      if (path === '/auth/v1/user' && claims) return res.json(authUser(claims));
      if (path === '/auth/v1/logout' && claims) {
        await db.query('delete from auth.sessions where id=$1', [claims.session_id]);
        return res.status(204).end();
      }
      if (path.startsWith('/rest/v1/')) {
        if (token && token !== process.env.SUPABASE_PUBLISHABLE_KEY && !claims) return res.status(401).json({ message: 'Invalid fixture token' });
        const action = path.slice('/rest/v1/'.length);
        if (action.startsWith('rpc/')) {
          const name = action.slice(4);
          const names = rpcArgs[name];
          if (!names) throw new Error(`Unexpected RPC ${name}`);
          const inputs = names.map(key => req.body[key]);
          const placeholders = names.map((_, index) => `$${index + 1}`).join(',');
          const [row] = await as(db, claims, `select public.${name}(${placeholders}) as data`, inputs);
          return res.json(row.data);
        }
        const rows = await tableRequest(db, claims, req, url, action);
        return res.json(req.headers.accept === 'application/vnd.pgrst.object+json' ? rows[0] ?? null : rows);
      }
      const fn = api[path.replace(/^\/api\//, '')];
      if (fn) return fn(req, res);
      const publicRoute = /^\/r\/([a-z0-9-]+)\/(manifest\.webmanifest|icon-(192|512)\.png|sw\.js)$/.exec(path);
      if (publicRoute) {
        req.query = { slug: publicRoute[1], size: publicRoute[3] };
        if (publicRoute[2] === 'manifest.webmanifest') return manifest(req, res);
        if (publicRoute[3]) return logo(req, res);
      }
      if (!dist) return res.status(404).end();
      const asset = /^\/assets\/[\w.-]+\.(?:js|css)$/.test(path);
      const file = publicRoute?.[2] === 'sw.js' ? 'restaurant-worker.js' : asset ? path.slice(1) : path === '/offline.html' ? 'offline.html' : 'index.html';
      const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html';
      res.setHeader('Content-Type', type);
      return res.send(await readFile(new URL(`../dist/${file}`, import.meta.url)));
    } catch (error) {
      if (!/^[\dA-Z]{5}$/.test(error.code || '')) console.error('Fixture HTTP failure', error.message);
      return res.status(400).json({ code: error.code, message: error.message });
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  process.env.SUPABASE_URL = url;
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_local_fixture';
  process.env.APP_ORIGIN = url;
  process.env.ALLOW_INVITATION_LINKS = 'true';
  delete process.env.RESEND_API_KEY;
  delete process.env.INVITATION_FROM;
  for (const key of ['R2_ACCOUNT_ID', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) delete process.env[key];
  return {
    db, url,
    login(claims) { credentials.set(claims.email, claims); },
    token(claims) { const token = accessToken(claims); tokens.set(token, claims); return token; },
    async close() { await new Promise(resolve => server.close(resolve)); await db.close(); }
  };
}

function authUser(claims) {
  return { id: claims.sub, email: claims.email, role: 'authenticated', aud: 'authenticated', created_at: '2026-01-01T00:00:00Z',
    user_metadata: {}, app_metadata: { provider: 'email' }, factors: [] };
}
