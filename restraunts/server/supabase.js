export function configuration() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key?.startsWith('sb_publishable_')) return null;
  return { url, key };
}

export async function rpc(name, args, token) {
  const config = configuration();
  if (!config) throw new HttpError(503, 'Supabase is not configured for this deployment.');
  const headers = { apikey: config.key, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${config.url}/rest/v1/rpc/${name}`, {
    method: 'POST', headers, body: JSON.stringify(args), signal: AbortSignal.timeout(9000)
  });
  if (response.ok) return response.json();
  const error = await response.json().catch(() => ({}));
  const expected = ['42501', '22023', '23505'].includes(error.code);
  if (expected) throw new HttpError(error.code === '42501' ? 403 : 400, error.message);
  if (response.status === 401) throw new HttpError(401, 'Your session ended. Sign in again.');
  throw new HttpError(502, 'The database request failed. Try again.');
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function bearer(request) {
  const match = /^Bearer ([^\s]+)$/i.exec(request.headers.authorization ?? '');
  if (!match) throw new HttpError(401, 'Sign in first.');
  return match[1];
}

export function requireSlug(value) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{0,46}[a-z0-9]$/.test(value)) {
    throw new HttpError(404, 'Restaurant unavailable.');
  }
  return value;
}

export function jsonBody(request) {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new HttpError(415, 'Expected JSON.');
  if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) throw new HttpError(400, 'Invalid request.');
  return request.body;
}

export function endpoint(methods, handle) {
  return async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    if (!methods.includes(request.method)) {
      response.setHeader('Allow', methods.join(', '));
      return response.status(405).json({ error: 'Method not allowed.' });
    }
    try {
      await handle(request, response);
    } catch (error) {
      if (error instanceof HttpError) return response.status(error.status).json({ error: error.message });
      console.error('Platform API request failed', { method: request.method, type: error?.name });
      return response.status(502).json({ error: 'The service is temporarily unavailable. Try again.' });
    }
  };
}
