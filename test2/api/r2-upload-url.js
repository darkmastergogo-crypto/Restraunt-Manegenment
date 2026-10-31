// Vercel serverless function (Node.js runtime).
//
// Purpose: hand the browser a short-lived, single-file presigned PUT URL so it
// can upload a dish/logo/banner photo DIRECTLY to Cloudflare R2. The image
// bytes never pass through this function or through Supabase, which is the
// whole point: R2 storage/requests are what you pay for, not egress, and
// Supabase's free-tier egress budget is left untouched.
//
// Security model: only a signed-in staff member of the restaurant's OWN
// Supabase project may request an upload URL. We verify that by calling that
// project's GoTrue "/auth/v1/user" endpoint with the bearer token the browser
// sends us. We never store or need a Supabase service-role key here.
//
// Required Vercel project environment variables (Project Settings -> Environment
// Variables). These are the same for every restaurant sharing this Cloudflare
// account/bucket:
//   R2_ACCOUNT_ID         Cloudflare account ID
//   R2_ACCESS_KEY_ID      R2 API token's Access Key ID
//   R2_SECRET_ACCESS_KEY  R2 API token's Secret Access Key
//   R2_BUCKET_NAME        R2 bucket name, e.g. "restaurant-images"
//   R2_PUBLIC_BASE_URL    Public URL that serves that bucket, no trailing
//                         slash, e.g. "https://images.yourdomain.com"
//                         (must be the SAME value as config.js's imagesBaseUrl)

const { AwsClient } = require('aws4fetch');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
  const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
  const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
  const BUCKET = process.env.R2_BUCKET_NAME;
  const PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL;

  if (!ACCOUNT_ID || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY || !BUCKET || !PUBLIC_BASE_URL) {
    res.status(500).json({ error: 'R2 is not configured on the server yet (missing environment variables).' });
    return;
  }

  try {
    const body = req.body || {};
    const restaurant = String(body.restaurant || '');
    const hash = String(body.hash || '');
    const ext = String(body.ext || '');
    const supabaseUrl = String(body.supabaseUrl || '').replace(/\/$/, '');
    const supabaseAnonKey = String(body.supabaseAnonKey || '');

    if (!/^[a-z0-9-]{2,60}$/.test(restaurant)) {
      res.status(400).json({ error: 'Invalid restaurant slug.' });
      return;
    }
    if (!/^[a-f0-9]{64}$/.test(hash)) {
      res.status(400).json({ error: 'Invalid image hash.' });
      return;
    }
    if (!['webp', 'png', 'jpeg'].includes(ext)) {
      res.status(400).json({ error: 'Invalid image type.' });
      return;
    }
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl) || supabaseAnonKey.length < 20) {
      res.status(400).json({ error: 'Missing or invalid Supabase project info.' });
      return;
    }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) {
      res.status(401).json({ error: 'Sign in as staff first.' });
      return;
    }

    const who = await fetch(supabaseUrl + '/auth/v1/user', {
      headers: { apikey: supabaseAnonKey, Authorization: 'Bearer ' + token }
    });
    if (!who.ok) {
      res.status(401).json({ error: 'Staff session is invalid or expired. Sign in again.' });
      return;
    }
    // Only admins and managers may upload. Waiter accounts (and any other
    // signed-in user) are real Supabase users too, so check the staff role.
    const user = await who.json().catch(() => ({}));
    const roleRes = await fetch(supabaseUrl + '/rest/v1/staff_users?select=role&user_id=eq.' + encodeURIComponent(String(user.id || '')), {
      headers: { apikey: supabaseAnonKey, Authorization: 'Bearer ' + token }
    });
    const roles = roleRes.ok ? await roleRes.json().catch(() => []) : [];
    if (!Array.isArray(roles) || !roles.some(r => r && (r.role === 'admin' || r.role === 'manager'))) {
      res.status(403).json({ error: 'Only an admin or manager can upload photos.' });
      return;
    }

    const objectKey = `restaurants/${restaurant}/thumbs/${hash}.${ext}`;
    const client = new AwsClient({
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET_ACCESS_KEY,
      service: 's3',
      region: 'auto'
    });
    const endpoint = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET}/${objectKey}`;

    const signedRequest = await client.sign(endpoint, {
      method: 'PUT',
      headers: { 'content-type': `image/${ext}` },
      aws: { signQuery: true, expires: 120 } // presigned URL is only valid for 2 minutes
    });

    res.status(200).json({
      uploadUrl: signedRequest.url,
      publicUrl: `${PUBLIC_BASE_URL.replace(/\/$/, '')}/${objectKey}`
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not create an upload URL.' });
  }
};
