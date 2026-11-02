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
//   R2_RESTAURANT_SLUG   Exact restaurantSlug in this deployment's config.js
//   R2_SUPABASE_URL      Exact supabaseUrl for this restaurant's own project
//   R2_SUPABASE_ANON_KEY Public/anon key for that project (never service-role)
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
  // Each deployment MUST bind to its own restaurant and Supabase project.
  const BOUND_RESTAURANT = process.env.R2_RESTAURANT_SLUG;
  const BOUND_SUPABASE_URL = String(process.env.R2_SUPABASE_URL || '').replace(/\/$/, '');
  const BOUND_SUPABASE_ANON_KEY = process.env.R2_SUPABASE_ANON_KEY;

  if (!ACCOUNT_ID || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY || !BUCKET || !PUBLIC_BASE_URL || !BOUND_RESTAURANT || !BOUND_SUPABASE_URL || !BOUND_SUPABASE_ANON_KEY) {
    res.status(500).json({ error: 'R2 is not configured on the server yet (missing environment variables).' });
    return;
  }

  try {
    const body = req.body || {};
    const restaurant = String(body.restaurant || '');
    const hash = String(body.hash || '');
    const ext = String(body.ext || '');
    const supabaseUrl = BOUND_SUPABASE_URL;
    const supabaseAnonKey = BOUND_SUPABASE_ANON_KEY;
    // Browser-provided project identity is never trusted as authorization.
    if (restaurant !== BOUND_RESTAURANT || String(body.supabaseUrl || '').replace(/\/$/, '') !== supabaseUrl || String(body.supabaseAnonKey || '') !== supabaseAnonKey) {
      res.status(403).json({ error: 'This upload is not for the configured restaurant.' });
      return;
    }

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
    // Use the same authenticated SECURITY DEFINER role verification as the staff UI;
    // direct staff_users reads are denied by RLS in some restaurant installations.
    const roleRes = await fetch(supabaseUrl + '/rest/v1/rpc/restaurant_admin_auth_status', {
      method: 'POST',
      headers: { apikey: supabaseAnonKey, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: '{}'
    });
    const roleInfo = roleRes.ok ? await roleRes.json().catch(() => null) : null;
    if (!roleRes.ok || roleInfo?.role !== 'admin') {
      res.status(403).json({ error: 'Only an administrator may upload images.' });
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
