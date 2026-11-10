import { endpoint, HttpError, requireSlug, rpc } from '../server/supabase.js';

export default endpoint(['GET'], async (request, response) => {
  const slug = requireSlug(request.query.slug);
  const brand = await rpc('platform_brand', { p_slug: slug });
  if (!brand) throw new HttpError(404, 'Restaurant unavailable.');
  const path = `/r/${slug}/`;
  response.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  response.status(200).send(JSON.stringify({
    id: path,
    name: brand.name,
    short_name: brand.short_name || Array.from(brand.name).slice(0, 24).join(''),
    description: brand.slogan,
    start_url: path,
    scope: path,
    display: 'standalone',
    background_color: brand.background_color,
    theme_color: brand.theme_color,
    icons: [192, 512].map(size => ({ src: `${path}icon-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' }))
  }));
});
