/* Serves the app logo saved in Admin → App name & logo as a PNG (for the installed app's icon). */
const { call } = require('./_shop');
const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
  const q = req.query || {};
  const r = await call('shop_app_icon');
  const data = (q.m && r && r.maskable) || (r && r.icon) || '';
  const m = /^data:image\/png;base64,(.+)$/.exec(data);
  let buf;
  if (m) buf = Buffer.from(m[1], 'base64');
  else {
    try { buf = fs.readFileSync(path.join(__dirname, '..', 'icons', q.m ? 'icon-maskable-512.png' : 'icon-512.png')); }
    catch { res.status(404).end(); return; }
  }
  res.setHeader('Content-Type', 'image/png');
  // the URL carries the logo version, so a new logo is a new URL
  res.setHeader('Cache-Control', q.v ? 'public, max-age=31536000, immutable' : 'public, max-age=300');
  res.status(200).send(buf);
};
