// Supabase Edge Function: restaurant-push. Paste ALL of this into its index.ts.
import webpush from 'npm:web-push@3.6.7';
// Private backend only. Keep the service-role and VAPID private key OUT of all website files.
function validEndpoint(endpoint: unknown): boolean {
 try {
  const u = new URL(String(endpoint));
  return u.protocol === 'https:' && !u.username && !u.password && !u.port &&
   (u.hostname === 'fcm.googleapis.com' || u.hostname === 'updates.push.services.mozilla.com' || /^[a-z0-9-]+\.notify\.windows\.com$/.test(u.hostname));
 } catch { return false; }
}
function createHandler(deps: any) {
 const env = deps.env;
 async function rpc(name: string, body = {}) {
  const base = env('SUPABASE_URL');
  let key='';try{key=JSON.parse(env('SUPABASE_SECRET_KEYS')||'{}').default||'';}catch{}
  if(!key)key=env('SUPABASE_SERVICE_ROLE_KEY')||'';
  if (!base || !key) throw new Error('Missing server credentials');
  const r = await deps.fetch(base + '/rest/v1/rpc/' + name, {
   method: 'POST', headers: { apikey: key, ...(key.startsWith('eyJ')?{Authorization:'Bearer '+key}:{}), 'Content-Type': 'application/json' },
   body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error('Queue RPC failed');
  return r.json();
 }
 async function authorized(actual: string, expected: string) {
  if (!/^[a-f0-9]{64}$/.test(expected) || actual.length !== expected.length) return false;
  const hash = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [a,b] = await Promise.all([hash(actual), hash(expected)]); let diff=0;
  for(let i=0;i<a.length;i++) diff |= a[i]^b[i];
  return diff === 0;
 }
 return async (req: Request): Promise<Response> => {
  if(req.method!=='POST') return new Response('Method not allowed',{status:405});
  if(!await authorized(req.headers.get('x-restaurant-push-secret')||'',env('PUSH_WEBHOOK_SECRET')||'')) return new Response('Unauthorized',{status:401});
  try {
   const pub=env('VAPID_PUBLIC_KEY'),priv=env('VAPID_PRIVATE_KEY'),subject=env('VAPID_SUBJECT');
   if(!pub||!priv||!subject) throw new Error('Missing VAPID settings');
   deps.webpush.setVapidDetails(subject,pub,priv);
   const jobs=await rpc('restaurant_claim_push');
   let accepted=0,expired=0,retry=0;
   // Up to 5 events x 30 devices. Ten workers, 5s per push, with a 3-minute DB lease.
   for(const job of jobs) {
    const sent:string[]=[],gone:string[]=[]; let again=false;
    const targets=[...job.targets];
    await Promise.all(Array.from({length:Math.min(10,targets.length)},async()=>{
     for(let target; (target=targets.shift());) {
      if(!validEndpoint(target.subscription?.endpoint)){gone.push(target.id);expired++;continue;}
      const remaining=Math.floor((Date.parse(job.payload.expiresAt)-Date.now())/1000);
      if(remaining<=0) continue;
      try {
       await deps.webpush.sendNotification(target.subscription,JSON.stringify(job.payload),{TTL:Math.min(120,remaining),urgency:'high',timeout:5000});
       sent.push(target.id);accepted++;
      } catch(e:any) {
       if(e.statusCode===404||e.statusCode===410){gone.push(target.id);expired++;}
       else {again=true;retry++;}
      }
     }
    }));
    await rpc('restaurant_finish_push',{p_id:job.id,p_lease:job.lease,p_sent:sent,p_gone:gone,p_retry:again});
   }
   // Aggregate counts only. Never log subscription endpoints/auth keys/customer details.
   return Response.json({events:jobs.length,accepted,expired,retry});
  } catch {
   return Response.json({error:'Push sender failed. Check function secrets, SQL setup, and function logs.'},{status:500});
  }
 };
}

Deno.serve(createHandler({env:(name:string)=>Deno.env.get(name),fetch:globalThis.fetch,webpush}));
