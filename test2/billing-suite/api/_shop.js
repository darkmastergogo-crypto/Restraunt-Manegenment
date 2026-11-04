/* Shared helper for the two small Vercel functions below: reads this shop's Supabase URL and public key
   from config.js (or the SUPABASE_URL / SUPABASE_ANON_KEY environment variables) and calls a public function. */
const fs = require('fs');
const path = require('path');

function config() {
  let url = process.env.SUPABASE_URL || '', key = process.env.SUPABASE_ANON_KEY || '';
  if (!url || !key) {
    try {
      const src = fs.readFileSync(path.join(__dirname, '..', '..', 'config.js'), 'utf8');
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
    const r = await fetch(`${c.url}/rest/v1/rpc/restaurant_custom48`, { method: 'POST', signal: ctrl.signal,
      headers: { apikey: c.key, Authorization: 'Bearer ' + c.key, 'Content-Type': 'application/json' }, body: JSON.stringify({p_known:null,p_settings:null,p_expected:null}) });
    if(!r.ok)return null;const d=await r.json(),s=d.settings||{},b=s.billingClone?.system?.brand||{};
    return name==='shop_app_icon'?{v:String(d.revision||''),icon:s.logo||''}:{brand:{app_title:b.app_title||s.name||'Billing',app_short_name:b.app_short_name||'Billing'},icon_v:String(d.revision||'')};
  } catch { return null; } finally { clearTimeout(t); }
}
module.exports = { call, config };
