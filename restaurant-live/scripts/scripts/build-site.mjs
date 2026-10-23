// Static Appwrite Sites build. Only explicit PUBLIC values are written to the frontend.
import fs from 'node:fs';
import {safeOrigin} from '../functions/restaurant-api/src/sites.mjs';
const env=process.env;
const mode=env.SITE_MODE;
if(!['owner','restaurant'].includes(mode)) throw Error('Set SITE_MODE to owner or restaurant.');
for(const key of ['PUBLIC_APPWRITE_ENDPOINT','PUBLIC_APPWRITE_PROJECT_ID','PUBLIC_APPWRITE_FUNCTION_ID'])
  if(!env[key]) throw Error('Missing public build setting: '+key);
const api=new URL(env.PUBLIC_APPWRITE_ENDPOINT);
if(api.protocol!=='https:' || api.username || api.password) throw Error('Use an HTTPS Appwrite API endpoint.');
const cfg={endpoint:env.PUBLIC_APPWRITE_ENDPOINT,projectId:env.PUBLIC_APPWRITE_PROJECT_ID,functionId:env.PUBLIC_APPWRITE_FUNCTION_ID,siteMode:mode};
if(mode==='restaurant') {
  if(!/^[a-z0-9-]{3,48}$/.test(env.RESTAURANT_SLUG||'') || !/^[a-zA-Z0-9_-]{3,64}$/.test(env.RESTAURANT_ID||'')) throw Error('Restaurant build identity missing.');
  Object.assign(cfg,{restaurantSlug:env.RESTAURANT_SLUG,restaurantId:env.RESTAURANT_ID,ownerURL:safeOrigin(env.OWNER_APP_URL)});
}
fs.rmSync('dist',{recursive:true,force:true});fs.cpSync('public','dist',{recursive:true});
fs.copyFileSync('shared/schema.mjs','dist/schema.mjs');
fs.writeFileSync('dist/config.js','window.PLATFORM_CONFIG = '+JSON.stringify(cfg,null,2)+';\n');
fs.writeFileSync('dist/release.json',JSON.stringify({mode,revision:env.APPWRITE_VCS_COMMIT_HASH || env.RELEASE_VERSION || 'unversioned'}));
console.log('Built static '+mode+' site. No server credentials copied.');
