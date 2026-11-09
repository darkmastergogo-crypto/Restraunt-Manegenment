const slugPattern = '[a-z0-9][a-z0-9-]{1,38}[a-z0-9]';
const slugRE = new RegExp('^' + slugPattern + '$');
const imageRE = /^([a-f0-9]{64})\.(png|jpeg|webp)$/;
const privateHeaders = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
const json = (data, status = 200) => Response.json(data, { status, headers: privateHeaders });
const fail = (message, status = 400) => json({ message }, status);
const redirect = path => new Response(null, { status: 303, headers: { ...privateHeaders, Location: path } });
const bearer = request => /^Bearer [\w.-]+$/.test(request.headers.get('Authorization') || '') ? request.headers.get('Authorization').slice(7) : '';
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
const hash = async bytes => hex(await crypto.subtle.digest('SHA-256', bytes));
const encode = s => new TextEncoder().encode(s);

function supabase(env, path, { token, method = 'POST', body, service = false, headers: extra } = {}) {
  const key = service ? env.SUPABASE_SERVICE_ROLE_KEY : env.SUPABASE_PUBLIC_KEY;
  const headers = new Headers(extra);
  headers.set('apikey', key);
  if (token || key.startsWith('eyJ')) headers.set('Authorization', 'Bearer ' + (token || key));
  if (body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(new URL(path, env.SUPABASE_URL), {
    method, headers, body: body === undefined || typeof body === 'string' ? body : JSON.stringify(body),
    redirect: 'error',
  });
}

const rpc = (env, name, body, opts = {}) => supabase(env, '/rest/v1/rpc/' + name, { ...opts, body });

async function branding(env, slug) {
  const result = await rpc(env, 'platform_brand', { p_slug: slug });
  if (!result.ok) return null;
  return result.json();
}

async function tenantData(request, env, slug, path, url) {
  if (/^\/auth\/v1\/(token|logout)$/.test(path) && request.method === 'POST') {
    const res = await supabase(env, path + url.search, {
      token: bearer(request), body: await request.text()
    });
    return new Response(res.body, { status: res.status, headers: { ...privateHeaders, 'Content-Type': 'application/json' } });
  }
  if (!/^\/rest\/v1\/(rpc\/[a-z][a-z0-9_]*|menu_items|staff_users|song_requests)$/.test(path) ||
      !['GET','HEAD','POST','PATCH','DELETE'].includes(request.method)) return fail('Endpoint not found.', 404);
  const schema = 'tenant_' + slug.replaceAll('-', '_');
  const headers = new Headers({ 'Accept-Profile': schema, 'Content-Profile': schema });
  for (const key of ['Content-Type', 'Prefer', 'Range', 'Range-Unit', 'Accept']) {
    if (request.headers.has(key)) headers.set(key, request.headers.get(key));
  }
  const method = request.method;
  const res = await supabase(env, path + url.search, {
    token: bearer(request), method, headers,
    body: ['POST', 'PATCH'].includes(method) ? await request.text() : undefined
  });
  const out = new Headers(res.headers);
  for (const key of ['Content-Length','Content-Encoding','Set-Cookie','Location']) out.delete(key);
  for (const [key,value] of Object.entries(privateHeaders)) out.set(key,value);
  return new Response(res.body, { status: res.status, headers: out });
}

async function invitation(request, env) {
  const token = bearer(request);
  if (!token) return fail('Sign in first.', 401);
  if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.RESEND_API_KEY || !env.INVITATION_FROM || !env.APP_ORIGIN) {
    return fail('Invitation delivery has not been configured.', 503);
  }
  const { slug, email, role, name } = await request.json();
  if (!slugRE.test(slug || '') || typeof email !== 'string' ||
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) || email.length > 254 ||
      typeof name !== 'string' || !name.trim() || name.length > 100 || !['admin','manager','waiter'].includes(role)) {
    return fail('Enter a restaurant, valid email, name, and role.');
  }
  const normalized = email.trim().toLowerCase();
  const secret = hex(crypto.getRandomValues(new Uint8Array(32)));
  const issued = await rpc(env, 'platform_issue_invitation', {
    p_slug: slug, p_email: normalized, p_name: name, p_role: role, p_digest: await hash(encode(secret))
  }, { token });
  if (!issued.ok) return json(await issued.json(), issued.status);
  const status = await rpc(env, 'platform_email_status', { p_email: normalized }, { service: true });
  if (!status.ok) return fail('Invitation saved. Account activation could not be prepared. Use resend.', 502);
  const link = new URL('/activate', env.APP_ORIGIN);
  const fragment = new URLSearchParams({ invite: secret, restaurant: slug });
  if (!(await status.json())) {
    const result = await supabase(env, '/auth/v1/admin/generate_link', {
      service: true, body: { type: 'magiclink', email: normalized }
    });
    const generated = await result.json();
    if (!result.ok || !generated.hashed_token) {
      return fail('Invitation saved. Account activation could not be prepared. Use resend.', 502);
    }
    fragment.set('bootstrap', generated.hashed_token);
  }
  link.hash = fragment.toString();
  const result = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.INVITATION_FROM, to: [normalized], subject: 'Your restaurant workspace invitation',
      text: 'Open this link to accept access to your restaurant workspace. The invitation expires in 24 hours.\n\n' + link.href
    }),
  });
  if (!result.ok) return fail('Invitation saved. Email delivery failed. Use resend.', 502);
  return json({ sent: true });
}

const imageKind = bytes => {
  const starts = (...values) => values.every((v,i) => bytes[i] === v);
  if (starts(137,80,78,71,13,10,26,10)) return 'png';
  if (starts(255,216,255)) return 'jpeg';
  if (starts(82,73,70,70) && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80) return 'webp';
  return '';
};

async function media(request, env, slug, filename) {
  const match = imageRE.exec(filename);
  if (!match || !env.RESTAURANT_MEDIA) return fail('Image not found.', 404);
  const [,digest, ext] = match;
  const key = 'restaurants/' + slug + '/thumbs/' + filename;
  if (request.method === 'PUT') {
    const token = bearer(request);
    if (!token) return fail('Sign in first.', 401);
    const access = await rpc(env, 'platform_access', { p_slug: slug }, { token });
    if (!access.ok || !['admin','manager'].includes(await access.json())) return fail('Image upload denied.', 403);
    if (Number(request.headers.get('Content-Length')) > 1048576 || !request.body) return fail('Image exceeds 1 MB.', 413);
    const reader = request.body.getReader();
    const buffer = new Uint8Array(1048576);
    let size = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (size + value.length > buffer.length) {
        await reader.cancel();
        return fail('Image exceeds 1 MB.', 413);
      }
      buffer.set(value, size);
      size += value.length;
    }
    const bytes = buffer.subarray(0,size);
    if (imageKind(bytes) !== ext || await hash(bytes) !== digest) return fail('The file does not match its image type or digest.');
    await env.RESTAURANT_MEDIA.put(key, bytes, { httpMetadata: { contentType: 'image/' + ext } });
    return json({ url: '/r/' + slug + '/_media/' + filename }, 201);
  }
  if (!['GET','HEAD'].includes(request.method)) return fail('Method not allowed.', 405);
  // This route serves public menu and branding images exclusively. No staff documents go here.
  if (!(await branding(env, slug))) return fail('Image not found.', 404);
  const image = request.method === 'HEAD' ? await env.RESTAURANT_MEDIA.head(key) : await env.RESTAURANT_MEDIA.get(key);
  if (!image) return fail('Image not found.', 404);
  return new Response(request.method === 'HEAD' ? null : image.body, {
    headers: { ...privateHeaders, 'Content-Type': 'image/' + ext, ETag: image.httpEtag }
  });
}

async function asset(request, env, url, path, slug) {
  const resolved = path.endsWith('/') ? path + 'index.html' : path;
  const target = new URL(resolved, url);
  target.search = url.search;
  const result = await env.ASSETS.fetch(new Request(target, { method: request.method, headers: request.headers }));
  if (!result.ok || !slug || !path.endsWith('.html') && path !== '/' && path !== '/billing-suite/') return result;
  if (request.method === 'HEAD') return result;
  const html = await result.text();
  const relative = '/r/' + slug + '/_storage.js';
  return new Response(html.replace(/<head(?:\s[^>]*)?>/i, match => match + '<script src="' + relative + '"></script>'), {
    headers: { ...privateHeaders, 'Content-Type': 'text/html; charset=utf-8' }
  });
}

function tenantConfig(env, slug, url, brand) {
  const cfg = {
    platform: true, restaurantSlug: slug, restaurantName: brand?.name || 'Restaurant',
    currency: '₹', categories: ['All'], menuItems: [],
    supabaseUrl: url.origin + '/r/' + slug + '/_data', supabaseAnonKey: env.SUPABASE_PUBLIC_KEY,
    publicMenuUrl: url.origin + '/r/' + slug + '/', imagesBaseUrl: '',
    tagline: '', googleReviewUrl: '',
  };
  return new Response('const RESTAURANT_CONFIG = ' + JSON.stringify(cfg) + ';', {
    headers: { ...privateHeaders, 'Content-Type': 'text/javascript; charset=utf-8' }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path === '/') return redirect('/login');
      if (path === '/portal/config.js') return new Response(
        'globalThis.PlatformConfig = ' + JSON.stringify({ url: env.SUPABASE_URL, key: env.SUPABASE_PUBLIC_KEY }) + ';',
        { headers: { ...privateHeaders, 'Content-Type': 'text/javascript; charset=utf-8' } }
      );
      if (path === '/api/platform/invite' && request.method === 'POST') return await invitation(request,env);
      if (new RegExp('^/(login|members)(/' + slugPattern + ')?$').test(path) ||
          ['/owner','/restaurants','/account','/activate','/recover'].includes(path)) {
        const response = await asset(request, env, url, '/portal/index.html');
        const headers = new Headers(response.headers);
        for (const [key,value] of Object.entries(privateHeaders)) headers.set(key,value);
        headers.set('Content-Security-Policy', "default-src 'self'; connect-src 'self' " + new URL(env.SUPABASE_URL).origin + "; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
        return new Response(response.body,{ status:response.status,headers });
      }
      if (/^\/portal\/(app\.js|auth\.js|style\.css)$/.test(path)) return await asset(request,env,url,path);
      const tenant = new RegExp('^/r/(' + slugPattern + ')(/.*)?$').exec(path);
      if (!tenant) return fail('Page not found.',404);
      const [, slug, tail] = tenant;
      if (!tail || tail === '/billing-suite') return redirect(path + '/' + url.search);
      if (tail.startsWith('/_data/')) return await tenantData(request,env,slug,tail.slice(6),url);
      if (tail.startsWith('/_media/')) return await media(request,env,slug,tail.slice(8));
      if (tail === '/_storage.js') return await asset(request,env,url,'/portal/storage.js');
      if (tail === '/config.js') return tenantConfig(env,slug,url,await branding(env,slug));
      if (/^(\/api\/|\/portal\/)|\.src\.html$|\.json$/.test(tail) && tail !== '/text-catalog48.json') return fail('Page not found.',404);
      if (tail === '/billing-suite/manifest.webmanifest') {
        const brand = await branding(env,slug);
        const root = '/r/' + slug + '/billing-suite/';
        const schema = 'tenant_' + slug.replaceAll('-', '_');
        const settings = await rpc(env,'restaurant_custom48',{}, { headers: { 'Content-Profile':schema } })
          .then(async response => response.ok ? (await response.json()).settings : null).catch(() => null);
        const app = settings?.billingClone?.system?.brand;
        const name = String(app?.app_title || settings?.name || brand?.name || 'Restaurant workspace').slice(0,45);
        const icon = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(settings?.logo || '') ? settings.logo :
          imageRE.test(brand?.logo || '') ? '/r/' + slug + '/_media/' + brand.logo : null;
        return Response.json({ id:root, name, short_name:String(app?.app_short_name || name).slice(0,12),
          description:'Kitchen orders, tables, billing and records.', start_url:root + 'index.html',
          scope:root, display:'standalone', orientation:'any', background_color:'#eef1f4', theme_color:'#1c2433',
          icons:[192,512].map(size => ({ src:icon || root + 'icons/icon-' + size + '.png', sizes:size + 'x' + size })) },
          { headers:{ ...privateHeaders, 'Content-Type':'application/manifest+json; charset=utf-8' } });
      }
      return await asset(request,env,url,tail,slug);
    } catch {
      return fail('The request could not be completed. Try again.',502);
    }
  }
};
