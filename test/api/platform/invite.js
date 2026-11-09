import crypto from 'node:crypto';
const URL = process.env.SUPABASE_URL || 'https://bcyzechgkczwbqfcaxan.supabase.co';
const KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
export default async function handler(req,res){
 if(req.method!=='POST') return res.status(405).json({message:'Method not allowed.'});
 const auth=req.headers.authorization||''; if(!auth.startsWith('Bearer ')) return res.status(401).json({message:'Sign in to continue.'});
 const b=typeof req.body==='string'?JSON.parse(req.body):req.body||{}; const slug=String(b.slug||'').trim(), email=String(b.email||'').trim().toLowerCase(), role=String(b.role||'waiter'), name=String(b.name||'').trim();
 if(!slug||!email) return res.status(400).json({message:'Restaurant and email are required.'});
 const token=crypto.randomBytes(32).toString('hex'), digest=crypto.createHash('sha256').update(token).digest('hex');
 const r=await fetch(URL+'/rest/v1/rpc/platform_issue_invitation',{method:'POST',headers:{apikey:KEY,Authorization:auth,'Content-Type':'application/json'},body:JSON.stringify({p_slug:slug,p_email:email,p_role:role,p_name:name,p_digest:digest})});
 const data=await r.json().catch(()=>null); if(!r.ok) return res.status(r.status).json({message:data?.message||data?.hint||'Invitation could not be created.'});
 const invite_url=(process.env.PUBLIC_APP_URL||'https://test501.vercel.app')+'/activate?token='+token;
 let delivered=false; const service=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(service){ const m=await fetch(URL+'/auth/v1/admin/invite',{method:'POST',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},body:JSON.stringify({email,redirect_to:invite_url})}); delivered=m.ok; }
 return res.status(200).json({ok:true,delivered,invite_url});
}