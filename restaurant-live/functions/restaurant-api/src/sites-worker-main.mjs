import {pushConfiguration,dispatchPushBatch} from './push.mjs';
import { AppwriteStore } from './store.mjs';
import { AppwriteSites, advanceHostingBatch } from './sites.mjs';
// Deploy as a separate scheduled function, execute permissions [], schedule every minute.
export default async ({req,res,error})=>{
  try {
    const endpoint=process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.APPWRITE_ENDPOINT;
    const project=process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.APPWRITE_PROJECT_ID;
    // Scheduled execution's dynamic API key is exposed as an environment variable.
    const key=req.headers["x-appwrite-key"] || process.env.APPWRITE_FUNCTION_API_KEY || process.env.APPWRITE_API_KEY;
    if(!key) throw Error('Scheduled worker key missing.');
    const hosting=new AppwriteSites({endpoint,project,key,functionId:process.env.SITES_PUBLIC_FUNCTION_ID,
      restaurantBranch:process.env.SITES_RESTAURANT_BRANCH,templateId:process.env.SITES_TEMPLATE_ID,ownerURL:process.env.SITES_OWNER_URL});

    const store=new AppwriteStore({endpoint,project,key,database:process.env.DATABASE_ID || 'restaurant_platform',table:'entities'});
    const push=await dispatchPushBatch(store,pushConfiguration(),(process.env.PLATFORM_OWNER_IDS||'').split(',').map(x=>x.trim()));
    await hosting.preflight();
    return res.json({ok:true,push,...await advanceHostingBatch(store,hosting)});
  } catch { error('Site worker could not advance provisioning. Check server configuration and scopes.'); return res.json({ok:false},500); }
};
