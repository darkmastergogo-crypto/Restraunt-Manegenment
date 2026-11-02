/* Shared helper for the two small Vercel functions below: reads this shop's Supabase URL and public key
   from config.js (or the SUPABASE_URL / SUPABASE_ANON_KEY environment variables) and calls a public function. */
const fs = require('fs');
const path = require('path');

function config() {
  let url = process.env.SUPABASE_URL || '', key = process.env.SUPABASE_ANON_KEY || '';
  if (!url || !key) {
    try {
      const src = fs.readFileSync(path.join(__dirname, '..', 'config.js'), 'utf8');
      url = url || (src.match(/supabaseUrl\s*:\s*["']([^"']+)["']/) || [])[1] || '';
      key = key || (src.match(/supabaseAnonKey\s*:\s*["']([^"']+)["']/) || [])[1] || '';
    } catch { /* no config.js next to the function */ }
  }
  url = url.replace(/\/$/, '');
  const ok = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) && key.length > 20 && !/YOUR|PASTE/i.test(url + key);
  return ok ? { url, key } : null;
}

async function call(name, args = {}) {
  const c = config(); if (!c) return null;
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(`${c.url}/rest/v1/rpc/${name}`, { method: 'POST', signal: ctrl.signal,
      headers: { apikey: c.key, Authorization: 'Bearer ' + c.key, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
    return r.ok ? await r.json() : null;
  } catch { return null; } finally { clearTimeout(t); }
}
module.exports = { call, config };
