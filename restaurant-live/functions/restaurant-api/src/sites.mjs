import { Client, Sites, Proxy, Project, Query } from "node-appwrite";
import { createHash, randomUUID } from "node:crypto";
const idFor = (prefix, value) => prefix + createHash('sha256').update(value).digest('hex').slice(0, 32);
export function safeOrigin(value) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.username || u.password || u.pathname !== '/' || u.search || u.hash)
    throw Error('An HTTPS origin is required.');
  return u.origin;
}
// No browser-supplied repository, API key, host, build command or site ID is used here.
export class AppwriteSites {
  constructor({endpoint, project, key, functionId, templateId, ownerURL, restaurantBranch}, sdk = {}) {
    this.configured = !!(templateId && ownerURL && functionId && restaurantBranch);
    this.config = {endpoint, project, functionId, templateId, ownerURL, restaurantBranch};
    const client = new Client().setEndpoint(endpoint).setProject(project).setKey(key);
    this.sites = sdk.sites || new Sites(client);
    this.proxy = sdk.proxy || new Proxy(client);
    this.project = sdk.project || new Project(client);
  }
  async preflight() {
    if (!this.configured) throw Object.assign(Error('Finish the one-time Appwrite Sites setup before creating restaurants.'), {status:503});
    safeOrigin(this.config.ownerURL);
  }
  async step(job, restaurant) {
    await this.preflight();
    const siteId = idFor('r', restaurant.id);
    if (job.stage === 'queued') {
      let existing;
      try { existing = await this.sites.get({siteId}); } catch(e) { if (e.code !== 404) throw e; }
      if (!existing) {
        const template = await this.sites.get({siteId:this.config.templateId});
        if (!template.installationId || !template.providerRepositoryId || !template.providerBranch)
          throw Error('The owner/template site must be connected to the shared Git repository.');
        try {
          await this.sites.create({siteId, name:restaurant.name, framework:'other', buildRuntime:'node-22', adapter:'static',
            enabled:true, logging:true, installCommand:'npm ci', buildCommand:'node scripts/build-site.mjs', outputDirectory:'dist', fallbackFile:'index.html',
            installationId:template.installationId, providerRepositoryId:template.providerRepositoryId,
            providerBranch:this.config.restaurantBranch, providerRootDirectory:template.providerRootDirectory || '',
            providerBranches:[this.config.restaurantBranch], providerSilentMode:true, scopes:[],
            description:'Managed restaurant '+restaurant.id});
        } catch(e) {
          if (e.code !== 409) throw e;
          const concurrent=await this.sites.get({siteId});
          if(concurrent.description !== 'Managed restaurant '+restaurant.id) throw Error('Refusing to modify an unmanaged site.');
        }
      } else if (existing.description !== 'Managed restaurant '+restaurant.id) {
        throw Error('Refusing to modify an unmanaged site.');
      }
      return {...job, siteId, stage:'configure', status:'creating'};
    }
    if (job.stage === 'configure') {
      const vars = {
        SITE_MODE:'restaurant', RESTAURANT_SLUG:restaurant.slug, RESTAURANT_ID:restaurant.id,
        PUBLIC_APPWRITE_ENDPOINT:this.config.endpoint, PUBLIC_APPWRITE_PROJECT_ID:this.config.project,
        PUBLIC_APPWRITE_FUNCTION_ID:this.config.functionId, OWNER_APP_URL:safeOrigin(this.config.ownerURL),
      };
      // Stable IDs make a retry safe after partial configuration.
      for (const [key,value] of Object.entries(vars)) {
        const variableId = idFor('v', key);
        try { await this.sites.createVariable({siteId, variableId, key, value, secret:false}); }
        catch(e) { if (e.code !== 409) throw e; await this.sites.updateVariable({siteId,variableId,key,value,secret:false}); }
      }
      return {...job, stage:'deploy', status:'deploying', configuredAt:Date.now()};
    }
    if (job.stage === 'deploy') {
      const site = await this.sites.get({siteId});
      let deploymentId = site.latestDeploymentId;
      if (!deploymentId || !(Date.parse(site.latestDeploymentCreatedAt) >= job.configuredAt)) {
        const deployment = await this.sites.createVcsDeployment({siteId,type:'branch',reference:site.providerBranch,activate:true});
        deploymentId = deployment.$id;
      }
      return {...job, stage:'build', status:'deploying', deploymentId};
    }
    if (job.stage === 'build') {
      const deployment = await this.sites.getDeployment({siteId,deploymentId:job.deploymentId});
      if (['failed','canceled'].includes(deployment.status)) return {...job,status:'failed',message:'Site build failed. Review its Appwrite build logs, then retry.',stage:'deploy',configuredAt:Date.now()};
      if (deployment.status !== 'ready') return {...job,status:'deploying'};
      const site = await this.sites.get({siteId});
      if (site.deploymentId !== job.deploymentId) return {...job,status:'deploying'};
      return {...job,stage:'domain',status:'configuring_access'};
    }
    if (job.stage === 'domain') {
      const rules = await this.proxy.listRules({queries:[Query.equal('deploymentResourceId',[siteId]),Query.equal('deploymentResourceType',['site']),Query.limit(100)]});
      const rule = rules.rules.find(r=>r.type==='deployment' && r.deploymentResourceId===siteId && !r.deploymentVcsProviderBranch && (!r.deploymentId || r.trigger==='manual' && r.deploymentId===job.deploymentId) && r.status==='verified');
      if (!rule) return {...job,status:'configuring_access',message:'Waiting for Appwrite’s active site domain and HTTPS certificate.'};
      const origin = safeOrigin('https://'+rule.domain);
      const platformId = idFor('p', siteId);
      try { await this.project.createWebPlatform({platformId,name:restaurant.name,hostname:new URL(origin).hostname}); }
      catch(e) { if (e.code !== 409) throw e; const platform=await this.project.getPlatform({platformId}); if(platform.hostname !== new URL(origin).hostname) throw Error('Authentication origin mismatch.'); }
      return {...job,origin,stage:'ready',status:'ready',message:'',readyAt:Date.now()};
    }
    return job;
  }
}
export function hostingView(job) {
  if (!job) return null;
  const {status,stage,origin,siteId,deploymentId,message,readyAt,updated}=job;
  return {status,stage,siteId,deploymentId,message,readyAt,updated,...(status==='ready' && origin ? {origin:safeOrigin(origin)} : {})};
}
export async function advanceHosting(store, hosting, slug, {retry=false}={}) {
  let registry, job, lease;
  const claimed = await store.transaction('_platform', async s=>{
    registry=await s.get('_platform','registry',slug);
    if(!registry) throw Object.assign(Error('Restaurant not found.'),{status:404});
    job=await s.get('_platform','hosting',slug);
    if(!job) throw Object.assign(Error('This restaurant has not been assigned a managed site.'),{status:409});
    if(job.status==='ready' || (job.status==='failed' && !retry) || job.leaseUntil>Date.now() || (!retry && job.nextAttempt>Date.now())) return false;
    lease=randomUUID();
    job={...job,lease,leaseUntil:Date.now()+180000};
    await s.put('_platform','hosting',slug,job); return true;
  });
  if(!claimed) return hostingView(job);
  let next;
  try { next=await hosting.step(job,registry); }
  catch(e) {
    const transient=[408,409,429,500,502,503,504].includes(Number(e.code || e.status)) || !e.code && !e.status;
    const attempts=(job.attempts||0)+1;
    next={...job,attempts,status:transient && attempts<5 ? 'retrying':'failed',
      nextAttempt:Date.now()+Math.min(60000,2000*2**attempts),
      message:[401,403].includes(Number(e.code || e.status)) ? 'Provisioning permission denied. Check server Sites, platforms, rules and VCS scopes.' : 'Appwrite provisioning could not finish. Check configuration, quotas and Site logs; retry after correcting the issue.'};
  }
  return store.transaction('_platform',async s=>{
    const current=await s.get('_platform','hosting',slug);
    if(current.lease!==lease) return hostingView(current);
    const saved={...next,lease:null,leaseUntil:0,updated:Date.now()};
    if(next.stage!==job.stage) {saved.attempts=0;saved.nextAttempt=0;}
    await s.put('_platform','hosting',slug,saved);
    return hostingView(saved);
  });
}
// A private scheduled function can advance jobs even when the owner's browser is closed.
export async function advanceHostingBatch(store, hosting, limit=3) {
  const jobs=await store.all('_platform','hosting'); let advanced=0;
  for(const job of jobs.filter(j=>!['ready','failed'].includes(j.status)).sort((a,b)=>(a.updated||0)-(b.updated||0)).slice(0,limit)) {
    await advanceHosting(store,hosting,job.slug); advanced++;
  }
  return {advanced};
}
