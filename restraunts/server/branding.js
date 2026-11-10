import { AwsClient } from 'aws4fetch';
import sharp from 'sharp';
import { HttpError } from './supabase.js';

export function store(id) {
  const { R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
  if (!R2_ACCOUNT_ID || !R2_BUCKET || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) return null;
  const client = new AwsClient({ accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, service: 's3', region: 'auto', retries: 0 });
  const url = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/restaurants/${id}/branding/icon.png`;
  return (method, data) => client.fetch(url, {
    method, ...(data && { body: data, headers: { 'Content-Type': 'image/png' } }), signal: AbortSignal.timeout(9000)
  });
}

export async function normalizeLogo(value) {
  if (typeof value !== 'string' || value.length > 2_800_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new HttpError(400, 'Choose a PNG, JPEG or WebP image up to 2 MB.');
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length > 2_000_000) throw new HttpError(413, 'Choose an image up to 2 MB.');
  try {
    const input = sharp(bytes, { limitInputPixels: 16_000_000 });
    const metadata = await input.metadata();
    if (!['png', 'jpeg', 'webp'].includes(metadata.format) || (metadata.pages ?? 1) !== 1) throw new Error('Unsupported image');
    return await input.autoOrient().resize(512, 512, { fit: 'contain', background: '#ffffff' }).flatten({ background: '#ffffff' }).png().toBuffer();
  } catch {
    throw new HttpError(400, 'The image is unreadable or unsupported. Choose a still PNG, JPEG or WebP.');
  }
}

export async function icon(brand, size) {
  const access = store(brand.id);
  if (access) {
    const response = await access('GET');
    if (response.ok) return sharp(Buffer.from(await response.arrayBuffer()), { limitInputPixels: 262144 }).resize(size, size).png().toBuffer();
    if (response.status !== 404) throw new HttpError(502, 'Restaurant logo storage is unavailable.');
  }
  const color = /^#[\da-f]{6}$/i.test(brand.theme_color) ? brand.theme_color : '#571e2d';
  const monogram = (brand.short_name || brand.name).split(/\s+/).map(word => word.replace(/[^\p{L}\p{N}]/gu, '')[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'R';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="${color}"/><circle cx="256" cy="256" r="186" fill="#fff9f0"/><circle cx="256" cy="256" r="161" fill="none" stroke="${color}" stroke-width="3"/><text x="256" y="301" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="130" fill="#2b1518">${monogram}</text></svg>`;
  return sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
}
