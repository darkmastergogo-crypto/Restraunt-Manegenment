const { url, key } = globalThis.PlatformConfig;
const sessionKey = 'restaurant-platform-session';

function readSession() {
  try { return JSON.parse(localStorage.getItem(sessionKey)); } catch { return null; }
}
function saveSession(session) {
  if (session) {
    session.expires_at ||= Math.floor(Date.now() / 1000) + (session.expires_in || 3600);
    localStorage.setItem(sessionKey, JSON.stringify(session));
  } else localStorage.removeItem(sessionKey);
  return session;
}
async function request(path, { body, token, method = 'POST' } = {}) {
  const res = await fetch(url + path, {
    method, cache: 'no-store', headers: {
      apikey: key, 'Content-Type': 'application/json',
      ...(token || key.startsWith('eyJ') ? { Authorization: 'Bearer ' + (token || key) } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(data?.message || data?.msg || data?.error_description || 'Request failed.'), { status: res.status });
  return data;
}

let pending;
async function session() {
  if (pending) return pending;
  const refresh = async () => {
    const current = readSession();
    if (!current || current.expires_at * 1000 > Date.now() + 60000) return current;
    try {
      return saveSession(await request('/auth/v1/token?grant_type=refresh_token', {
        body: { refresh_token: current.refresh_token }
      }));
    } catch (error) {
      if (error.status >= 400 && error.status < 500) saveSession(null);
      throw error;
    }
  };
  pending = (navigator.locks?.request ? navigator.locks.request(sessionKey, refresh) : refresh()).finally(() => { pending = null; });
  return pending;
}

export const auth = {
  session,
  saveSession,
  async login(email,password) {
    return saveSession(await request('/auth/v1/token?grant_type=password', { body: { email, password } }));
  },
  async logout(scope = 'local', current = undefined) {
    const active = current === undefined ? await session().catch(() => readSession()) : current;
    try {
      if (active) await request('/auth/v1/logout?scope=' + scope, { token: active.access_token });
    } finally {
      if (current === undefined || active?.user?.id === readSession()?.user?.id) saveSession(null);
    }
  },
  recover(email) {
    return request('/auth/v1/recover', { body: { email } });
  },
  verify(token_hash,type) {
    return request('/auth/v1/verify', { body: { token_hash, type } });
  },
  async user(current = undefined) {
    const active = current || await session();
    return request('/auth/v1/user', { method: 'GET', token: active?.access_token });
  },
  async password(password,current) {
    return request('/auth/v1/user', { method: 'PUT', token: current.access_token, body: { password } });
  },
  async enroll() {
    const active = await session();
    return request('/auth/v1/factors', {
      token: active.access_token, body: { factor_type: 'totp', friendly_name: 'Restaurant access' }
    });
  },
  async factor(id,code,current, keep = true) {
    const active = current || await session();
    const token = active.access_token;
    const path = '/auth/v1/factors/' + encodeURIComponent(id);
    const challenge = await request(path + '/challenge', { token, body: {} });
    const result = await request(path + '/verify', { token, body: { code, challenge_id: challenge.id } });
    result.user ||= active.user;
    return keep ? saveSession(result) : result;
  },
  needsFactor(current,user) {
    let level = '';
    try {
      const raw = current.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
      level = JSON.parse(atob(raw)).aal;
    } catch {}
    return level === 'aal2' ? null : user.factors?.find(factor => factor.status === 'verified' && factor.factor_type === 'totp');
  }
};

export async function rpc(name,body = {}, publicCall = false) {
  const active = publicCall ? null : await session();
  if (!publicCall && !active) throw Object.assign(new Error('Sign in to continue.'), { status: 401 });
  return request('/rest/v1/rpc/platform_' + name, { body, token: active?.access_token });
}

export async function worker(path, options = {}) {
  const active = await session();
  if (!active) throw Error('Sign in to continue.');
  const res = await fetch(path, { ...options, headers: { ...options.headers, Authorization: 'Bearer ' + active.access_token } });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw Error(data?.message || 'Request failed.');
  return data;
}
