/* The installed app's name and icon come from Admin → App name & logo.
   vercel.json sends /manifest.webmanifest here. On other hosts the static manifest file is used instead. */
const { call } = require('./_shop');

const FALLBACK = { name: 'Restaurant', short: 'Restaurant', icon_v: '', bg: '#eef1f4', theme: '#1c2433' };

module.exports = async (req, res) => {
  const info = (await call('shop_public_info')) || {};
  const b = info.brand || {};
  const name = String(b.app_title || FALLBACK.name).slice(0, 45);
  const short = String(b.app_short_name || name).slice(0, 12);
  const v = info.icon_v || '';
  const icons = v ? [
    { src: `/api/billing-suite-icon?s=192&v=${v}`, sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: `/api/billing-suite-icon?s=512&v=${v}`, sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: `/api/billing-suite-icon?m=1&v=${v}`, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
  ] : [
    { src: '/billing-suite/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/billing-suite/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/billing-suite/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
  ];
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  // short cache: phones re-read it now and then and pick up a new name or icon by themselves
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=600');
  res.status(200).send(JSON.stringify({
    id: '/billing-suite/', name, short_name: short, description: 'Kitchen orders, tables, billing and records.',
    start_url: '/billing-suite/index.html', scope: '/billing-suite/', display: 'standalone', orientation: 'any',
    background_color: FALLBACK.bg, theme_color: FALLBACK.theme, icons
  }));
};
