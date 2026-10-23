import { pushConfiguration, dispatchTenantPush } from "./push.mjs";
import { Client, Account } from "node-appwrite";
import { AppwriteStore, authenticatedUser } from "./store.mjs";
import { service } from "./service.mjs";
import { AppwriteSites } from "./sites.mjs";
export default async ({ req, res, error }) => {
  try {
    const endpoint =
      process.env.APPWRITE_FUNCTION_API_ENDPOINT ||
      process.env.APPWRITE_ENDPOINT ||
      "https://fra.cloud.appwrite.io/v1";
    const project =
      process.env.APPWRITE_FUNCTION_PROJECT_ID || "6ad97acd003c74f33ec9";
    // Only Appwrite's per-execution key or a server environment key. Never accept a browser key/body identity.
    const key = req.headers["x-appwrite-key"] || process.env.APPWRITE_API_KEY;
    if (!key) throw Error("Server key unavailable. Configure function scopes.");
    let body = req.bodyJson;
    if (!body || typeof body !== "object")
      body =
        typeof req.body === "string"
          ? JSON.parse(req.body || "{}")
          : req.body || {};
    if (JSON.stringify(body).length > 700000)
      return res.json({ error: "Request too large." }, 413);
    const jwt = req.headers["x-appwrite-user-jwt"];
    const user = await authenticatedUser(endpoint, project, jwt);
    let verified = false;
    if (user?.mfa && jwt) {
      try {
        let session = await new Account(
          new Client().setEndpoint(endpoint).setProject(project).setJWT(jwt),
        ).getSession({ sessionId: "current" });
        verified = (session.factors || []).includes("totp");
      } catch {
        verified = false;
      }
    }
    const store = new AppwriteStore({
      endpoint,
      project,
      key,
      database: process.env.DATABASE_ID || "restaurant_platform",
      table: "entities",
    });
    const push=pushConfiguration();
    const data = await service(
      store,
      body,
      user,
      (process.env.PLATFORM_OWNER_IDS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      {
        push,
        requireMfa: true,
        mfaVerified: verified,
        hosting:new AppwriteSites({endpoint,project,key,
          functionId:process.env.SITES_PUBLIC_FUNCTION_ID || process.env.APPWRITE_FUNCTION_ID,
          restaurantBranch:process.env.SITES_RESTAURANT_BRANCH,
          templateId:process.env.SITES_TEMPLATE_ID, ownerURL:process.env.SITES_OWNER_URL}),
      },
    );
    if(push && ['place','request','counterCall','openVisit','manual','status','undo','handle','cancel'].includes(body.action)) {
      try {const registry=await store.get('_platform','registry',String(body.restaurant||''));
        if(registry)await dispatchTenantPush(store,registry.id,push,(process.env.PLATFORM_OWNER_IDS||'').split(',').map(x=>x.trim()),{limit:2});
      } catch {error('Push delivery deferred to private worker.');}
    }
    return res.json({ ok: true, data }, 200, { "Cache-Control": "no-store" });
  } catch (e) {
    if (!e.status && !e.code)
      error("Restaurant API internal error (details withheld)");
    let status =
      e.status ||
      ([400, 401, 403, 404, 409, 413, 429].includes(e.code) ? e.code : 500);
    return res.json(
      {
        error:
          status === 500
            ? "Server setup or service error. Check function logs."
            : e.message,
      },
      status,
      { "Cache-Control": "no-store" },
    );
  }
};
