// Vercel serverless function; Cloudflare R2 credentials never reach the browser.
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { randomUUID } = require('node:crypto');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({error:'Method not allowed'}); }
  const token = /^Bearer (.+)$/.exec(req.headers.authorization || '')?.[1];
  if (!token) return res.status(401).json({error:'Admin sign-in required'});
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  const publicBase = (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/$/, '');
  // Reject malformed configuration instead of forming an arbitrary endpoint or public URL.
  let publicUrl;
  try { publicUrl = new URL(publicBase); } catch { /* handled below */ }
  if (!supabaseUrl || !anonKey || !/^[a-f0-9]{32}$/i.test(accountId || '') ||
      !accessKeyId || !secretAccessKey || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket || '') ||
      !publicUrl || publicUrl.protocol !== 'https:' || !publicUrl.hostname ||
      publicUrl.username || publicUrl.password || publicUrl.search || publicUrl.hash ||
      publicUrl.hostname.endsWith('.r2.cloudflarestorage.com')) {
    return res.status(503).json({error:'Server R2 storage configuration missing or invalid'});
  }
  try {
    // RPC must independently verify the caller's admin role AND MFA assurance.
    // Do not trust client-supplied role or user metadata.
    const check = await fetch(supabaseUrl.replace(/\/$/, '') + '/rest/v1/rpc/restaurant_admin_auth_status', {
      method:'POST', headers:{apikey:anonKey,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}',cache:'no-store'
    });
    if (!check.ok) return res.status(403).json({error:'Admin verification failed'});
    const status = await check.json();
    if (status?.role !== 'admin' || status?.verified !== true || status?.mfa_required !== true || status?.verification_method !== 'totp')
      return res.status(403).json({error:'Verified admin access required'});
    const image = req.body?.image;
    if (typeof image !== 'string' || image.length > 1500000) return res.status(413).json({error:'Image exceeds the 1 MB limit'});
    const match = /^data:image\/(webp|png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(image);
    if (!match) return res.status(400).json({error:'Only WebP, PNG and JPEG images are supported'});
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.length > 1048576) return res.status(413).json({error:'Image exceeds the 1 MB limit'});
    const signatures = {png:bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')),
      jpeg:bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff,
      webp:bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'};
    if (!signatures[match[1]]) return res.status(400).json({error:'Image content does not match its type'});
    // Fresh UUID per upload guarantees a new URL even when replacing with identical bytes.
    const name = `menu-images/${randomUUID()}.${match[1]}`;
    const client = new S3Client({
      region:'auto', endpoint:`https://${accountId}.r2.cloudflarestorage.com`,
      credentials:{accessKeyId,secretAccessKey},
    });
    await client.send(new PutObjectCommand({
      Bucket:bucket, Key:name, Body:bytes, ContentType:`image/${match[1]}`,
      CacheControl:'public, max-age=31536000, immutable',
    }));
    return res.status(200).json({url:publicBase + '/' + name});
  } catch (e) {
    console.error('Menu image upload failed:', e);
    return res.status(500).json({error:'Image upload failed. Check server configuration and logs.'});
  }
};
