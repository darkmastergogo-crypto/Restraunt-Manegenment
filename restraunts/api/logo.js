import { icon, normalizeLogo, store } from '../server/branding.js';
import { bearer, endpoint, HttpError, jsonBody, requireSlug, rpc } from '../server/supabase.js';

export default endpoint(['GET', 'POST', 'DELETE'], async (request, response) => {
  const slug = requireSlug(request.query.slug);
  if (request.method === 'GET') {
    const brand = await rpc('platform_brand', { p_slug: slug });
    if (!brand) throw new HttpError(404, 'Restaurant unavailable.');
    const size = request.query.size === '192' ? 192 : 512;
    const image = await icon(brand, size);
    response.setHeader('Content-Type', 'image/png');
    return response.status(200).send(image);
  }
  const token = bearer(request);
  const id = await rpc('platform_brand_target', { p_slug: slug }, token);
  if (!id) throw new HttpError(403, 'Restaurant branding access required.');
  const access = store(id);
  if (!access) throw new HttpError(503, 'Cloudflare R2 is not configured for this deployment.');
  const data = request.method === 'POST' ? await normalizeLogo(jsonBody(request).image) : undefined;
  const result = await access(request.method === 'POST' ? 'PUT' : 'DELETE', data);
  if (!result.ok) throw new HttpError(502, 'Logo storage did not confirm the change. Try again.');
  response.status(204).end();
});
