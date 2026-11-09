/* Talks to the local PostgREST exactly the way the app talks to Supabase, and can be
   "unplugged" to simulate no internet. */
const crypto = require('node:crypto');
const SECRET = 'local-test-secret-local-test-secret-123456';
const b64 = o => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function jwt(claims) { const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64({ ...claims, exp: Math.floor(Date.now()/1000)+3600 });
  return h + '.' + p + '.' + crypto.createHmac('sha256', SECRET).update(h + '.' + p).digest('base64url'); }
module.exports = function makeCloud(sub = '11111111-1111-4111-8111-111111111111') {
  const token = jwt({ sub, role: 'authenticated', aud: 'authenticated' });
  const api = { online: true, calls: 0, failNext: 0, cutAfter: Infinity };
  api.rpc = async (name, args = {}) => {
    api.calls++;
    if (!api.online) { const e = new Error('Could not reach the server.'); e.code = 'NETWORK'; throw e; }
    if (api.failNext > 0) { api.failNext--; const e = new Error('Could not reach the server.'); e.code = 'NETWORK'; throw e; }
    if (api.calls > api.cutAfter) { api.online = false; const e = new Error('Connection lost mid-way.'); e.code = 'NETWORK'; throw e; }
    const res = await fetch('http://127.0.0.1:3000/rpc/' + name, { method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify(args) });
    const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
    if (!res.ok) { const e = new Error(data?.message || text); e.httpStatus = res.status; throw e; }
    return data;
  };
  return api;
};
