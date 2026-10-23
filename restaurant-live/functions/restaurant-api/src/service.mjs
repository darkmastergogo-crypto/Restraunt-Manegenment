import { eventStore, pushID, validateSubscription } from "./push.mjs";
import { randomUUID } from "node:crypto";
import { FEATURES, DEFAULTS, mergeConfig, clone, enabled } from "./schema.mjs";
import { hash } from "./store.mjs";
import { advanceHosting, hostingView } from "./sites.mjs";
import {
  fail,
  token,
  clean,
  validSlug,
  validateConfig,
  validateItem,
  getVisit,
  composeOrder,
  safeOrder,
  restoreStock,
  applyLoop,
  dateKey,
  feature,
} from "./domain.mjs";
const READS = new Set([
  "public",
  "customerOrders",
  "staff",
  "platform",
  "waiter",
]);
export async function service(
  root,
  input,
  user,
  owners = [],
  { requireMfa = true, mfaVerified = false, hosting = null, push = null } = {},
) {
  const action = String(input.action || "public"),
    slug = String(input.restaurant || "");
  const owner = !!user && owners.includes(user.$id);
  const now = Date.now();
  if (action === "platform") {
    if (!owner) fail("Platform owner access required.", 403);
    if (requireMfa && !mfaVerified)
      fail("Platform owner authenticator verification required.", 403);
    const registry = await root.all("_platform", "registry");
    const restaurants = [];
    for (const row of registry) {
      const tenant = await root.get(row.id, "tenant", "meta");
      restaurants.push({
        id: row.id,
        slug: row.slug,
        name: tenant?.config?.brand?.name || row.name,
        status: tenant?.status || "unavailable",
        created: row.created,
        restaurant_id: row.id,
        ...(await root.get("_platform", "hosting", row.slug) ? {hosting:hostingView(await root.get("_platform", "hosting", row.slug))} : {}),
      });
    }
    return { restaurants };
  }
  if (["siteStatus", "retrySite", "attachSite"].includes(action)) {
    if (!owner) fail("Platform owner access required.",403);
    if (requireMfa && !mfaVerified) fail("Authenticator verification required.",403);
    if (!hosting) fail("Appwrite Sites provisioning is not configured.",503);
    await hosting.preflight();
    if (!validSlug(input.restaurant)) fail("Select a restaurant.",404);
    if (action === "attachSite") {
      await root.transaction("_platform",async s=>{
        const r=await s.get("_platform","registry",input.restaurant);
        if(!r) fail("Restaurant not found.",404);
        if(!await s.get("_platform","hosting",r.slug))
          await s.put("_platform","hosting",r.slug,{slug:r.slug,stage:"queued",status:"queued",created:now});
      });
    }
    return {hosting:await advanceHosting(root,hosting,input.restaurant,{retry:action==="retrySite"})};
  }
  if (action === "provision") {
    if (!owner) fail("Platform owner access required.", 403);
    if (requireMfa && !mfaVerified) fail("Authenticator verification required.", 403);
    const name=clean(input.name,120).trim();
    if(!name) fail("Enter a restaurant name.");
    const automatic=!input.slug;
    if(automatic) {
      if(!hosting) fail("Finish the one-time Appwrite Sites setup first.",503);
      await hosting.preflight();
      if(!/^[a-zA-Z0-9_-]{16,64}$/.test(input.requestId||"")) fail("A creation request ID is required.");
    }
    const result=await root.transaction("_platform", async (s) => {
      if(automatic) {
        const previous=await s.get("_platform","create-request",input.requestId);
        if(previous) return {id:previous.id,slug:previous.slug};
      }
      const id=automatic ? randomUUID() : input.slug;
      const base=name.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,32) || "restaurant";
      const newSlug=automatic ? base+"-"+id.slice(0,8) : input.slug;
      if(!validSlug(newSlug)) fail("Use a restaurant URL slug of 3–48 lowercase letters, digits or hyphens.");
      if (await s.get("_platform", "registry", newSlug)) fail("Restaurant URL already used.", 409);
      const t = {
        id, slug:newSlug, created:now, status:"active", epoch:randomUUID(), revision:1,
        config:mergeConfig({brand:{name}}), editableGroups:Object.keys(DEFAULTS),
        entitlements:Object.fromEntries(Object.keys(FEATURES).map(k=>[k,k!=="push"])), waiterHash:hash(token()),
      };
      await s.put(t.id,"tenant","meta",t);
      await s.put(t.id,"lock","write",{created:now});
      await s.put("_platform","registry",newSlug,{id:t.id,slug:t.slug,name,created:now});
      if(automatic || hosting) await s.put("_platform","hosting",newSlug,{slug:newSlug,stage:"queued",status:"queued",created:now});
      if(automatic) await s.put("_platform","create-request",input.requestId,{id:t.id,slug:t.slug,created:now});
      return {id:t.id,...(automatic ? {slug:t.slug} : {})};
    });
    return result;
  }
  if (!validSlug(slug)) fail("Select a restaurant URL.", 404);
  const registry = await root.get("_platform", "registry", slug);
  let tenant = await root.get(registry?.id || slug, "tenant", "meta");
  if (!tenant || tenant.status !== "active")
    fail("Restaurant unavailable.", 404);
  async function actor(s, t) {
    if (owner) {
      if (requireMfa && !mfaVerified)
        fail("Authenticator verification required.", 403);
      return { id: user.$id, role: "owner" };
    }
    if (input.waiterKey) {
      if (
        !enabled(t, "waiter") ||
        !t.config.waiter.enabled ||
        hash(input.waiterKey) !== t.waiterHash
      )
        fail("Invalid/revoked waiter link.", 403);
      return { id: "waiter", role: "waiter" };
    }
    if (!user) fail("Sign in to access staff tools.", 401);
    let m = await s.get(t.id, "member", user.$id);
    if (!m || !m.active) fail("No access to this restaurant.", 403);
    if (m.role === "admin" && requireMfa && !mfaVerified)
      fail("Admin authenticator verification required.", 403);
    return { id: user.$id, role: m.role };
  }
  function requireRole(a, roles = ["owner", "admin"]) {
    if (!roles.includes(a.role)) fail("Permission denied.", 403);
  }
  async function run(s, t) {
    t.config = mergeConfig(t.config);
    const c = t.config,
      b = c.behavior;
    if (action === "public") {
      feature(t, "menu");
      return {
        id: t.id,
        restaurant_id:t.id,
        revision: t.revision,
        config: c,
        entitlements: t.entitlements,
        items: (await s.all(t.id, "item"))
          .filter(
            (x) => x.available && (enabled(t, "portions") || !x.sizes.length),
          )
          .sort((a, z) => a.position - z.position),
        stocks: (await s.all(t.id, "stock")).map(applyLoop).map((x) => ({
          key: x.key,
          tracked: x.tracked,
          remaining: x.remaining,
        })),
        serverNow: now,
      };
    }
    if (action === "openVisit") {
      if (
        !/^[a-zA-Z0-9_-]{8,80}$/.test(input.device || "") ||
        !/^[a-f0-9]{64}$/.test(input.deviceToken || "")
      )
        fail("Browser storage identity required.");
      let table = await s.get(t.id, "table", input.table);
      if (!table || !table.active || table.keyHash !== hash(input.qr || ""))
        fail("Scan a current table QR.", 403);
      let d = await s.get(t.id, "device", input.device);
      if (d && d.token !== hash(input.deviceToken))
        fail("Browser identity mismatch.", 403);
      if (d?.blocked) {
        if (enabled(t, "securityAlerts")) {
          let key =
            input.device + "|" + input.table + "|" + Math.floor(now / 300000);
          let existing = await s.get(t.id, "notice", key);
          await s.put(t.id, "notice", key, {
            id: key,
            created: existing?.created || now,
            kind: "security",
            message: "Blocked browser scanned " + input.table,
            device: input.device,
            read: existing?.read || false,
            attempts: (existing?.attempts || 0) + 1,
          });
        }
        return { blocked: true };
      }
      d = {
        ...d,
        id: input.device,
        token: hash(input.deviceToken),
        created: d?.created || now,
        lastSeen: now,
        lastTable: input.table,
        info: clean(input.info, 500),
        blocked: false,
        orders: d?.orders || 0,
      };
      await s.put(t.id, "device", d.id, d);
      let v = {
        id: randomUUID(),
        device: d.id,
        table: input.table,
        token: "",
        created: now,
        expires: now + b.visitMinutes * 60000,
        qrHash: table.keyHash,
      };
      let key = token();
      v.token = hash(key);
      await s.put(t.id, "visit", v.id, v);
      if (table.reserved && enabled(t, "reservedAlerts")) {
        let k = "reserved|" + input.table + "|" + Math.floor(now / 300000);
        if (!(await s.get(t.id, "request", k)))
          await s.put(t.id, "request", k, {
            id: k,
            type: "reserved",
            table: input.table,
            status: "Pending",
            created: now,
          });
      }
      return {
        id: v.id,
        token: key,
        expires: v.expires,
        reserved: table.reserved,
        table: input.table,
      };
    }
    if (action === "place") {
      feature(t, "cart");
      feature(t, "menu");
      return composeOrder(s, t, input, null);
    }
    if (action === "customerOrders") {
      if (!enabled(t, "tracking") && !enabled(t, "history"))
        fail("Order visibility is disabled.", 403);
      let d = await s.get(t.id, "device", input.device);
      if (!d || d.token !== hash(input.deviceToken || ""))
        fail("Invalid browser receipt identity.", 403);
      if (d.blocked) fail("Device blocked.", 403);
      return {
        orders: (await s.all(t.id, "order", { device: input.device }))
          .filter(
            (o) =>
              o.epoch === t.epoch &&
              o.created >
                now -
                  (enabled(t, "history")
                    ? b.historyMinutes
                    : b.currentMinutes) *
                    60000,
          )
          .map(safeOrder),
      };
    }
    if (action === "cancel") {
      feature(t, "cancel");
      let d = await s.get(t.id, "device", input.device),
        o = await s.get(t.id, "order", input.id);
      if (
        !d ||
        d.blocked ||
        d.token !== hash(input.deviceToken || "") ||
        !o ||
        o.device !== d.id
      )
        fail("Receipt access denied.", 403);
      if (o.status !== "Pending" || o.created + b.cancelSeconds * 1000 < now)
        fail("Cancellation is closed.");
      await restoreStock(s, t, o);
      o.status = "Cancelled";
      o.updated = now;
      o.cancelled = now;
      await s.put(t.id, "order", o.id, o);
      return safeOrder(o);
    }
    if (action === "request") {
      const kind = input.kind === "music" ? "music" : "assistance";
      feature(t, kind === "music" ? "music" : "callWaiter");
      feature(t, "requests");
      if (kind === "music") feature(t, "musicQueue");
      let v = await getVisit(s, t, input);
      if (!/^[A-Za-z0-9_-]{8,80}$/.test(input.requestId || ""))
        fail("Valid request ID required.");
      let replay = await s.get(t.id, "request", input.requestId);
      if (replay) {
        if (replay.device !== v.device.id || replay.type !== kind)
          fail("Request identity mismatch.", 409);
        return { saved: true };
      }
      let previous = (
        await s.all(t.id, "request", { device: v.device.id })
      ).filter((r) => r.type === kind && r.created > now - 86400000);
      if (
        previous.some(
          (r) =>
            r.created >
            now - (kind === "music" ? b.musicCooldown : b.callCooldown) * 1000,
        )
      )
        fail("Please wait before another request.");
      if (
        kind === "music" &&
        previous.filter(
          (r) =>
            ["Pending", "Playing"].includes(r.status) &&
            r.created > now - b.requestMinutes * 60000,
        ).length >= b.musicLimit
      )
        fail("Your music request queue limit is reached.");
      if (kind === "assistance") feature(t, "waiterCalls");
      let title = clean(input.title, 160);
      if (kind === "music" && !title) fail("Enter a song title.");
      let url = "";
      if (input.url) {
        try {
          url = new URL(input.url);
          if (
            url.protocol !== "https:" ||
            url.username ||
            url.password ||
            ![
              "youtube.com",
              "www.youtube.com",
              "youtu.be",
              "open.spotify.com",
              "music.youtube.com",
            ].includes(url.hostname)
          )
            throw 0;
          url = url.href;
        } catch {
          fail("Use an HTTPS YouTube or Spotify link.");
        }
      }
      let r = {
        id: input.requestId || randomUUID(),
        created: now,
        type: kind,
        status: "Pending",
        table: v.table.number,
        device: v.device.id,
        title,
        artist: clean(input.artist, 120),
        url,
      };
      if (await s.get(t.id, "request", r.id)) return { saved: true };
      await s.put(t.id, "request", r.id, r);
      return { saved: true };
    }
    let a = await actor(s, t);
    const staff = ["owner", "admin", "manager"];
    if (["pushInfo","pushSubscribe","pushUnsubscribe"].includes(action)) {
      requireRole(a,staff);
      if(!user || input.waiterKey) fail("Staff account required.",403);
      if(action==="pushInfo")return {configured:!!push,enabled:enabled(t,'push'),publicKey:push?.publicKey||null};
      if(action==="pushUnsubscribe"){
        const id=pushID(String(input.endpoint||''));const old=await s.get(t.id,'push-subscription',id);
        if(old?.userId===user.$id)await s.remove(t.id,'push-subscription',id);
        return {saved:true};
      }
      feature(t,'push');
      if(!push)fail("Push server keys are not configured.",503);
      const subscription=validateSubscription(input.subscription),id=pushID(subscription.endpoint);
      const existing=await s.get(t.id,'push-subscription',id);
      const mine=(await s.all(t.id,'push-subscription')).filter(x=>x.userId===user.$id);
      if(!existing && (mine.length>=5 || (await s.all(t.id,'push-subscription')).length>=100))fail("Device limit reached. Remove an old subscription first.",409);
      const categories=['orders','requests','alerts'].filter(k=>input.categories?.includes(k));
      if(!categories.length)fail("Select at least one notification type.");
      await s.put(t.id,'push-subscription',id,{id,userId:user.$id,subscription,categories,created:now,updated:now});
      return {saved:true};
    }
    if (action === "staff" || action === "waiter") {
      if (a.role === "waiter" && action !== "waiter")
        fail("Waiter access only.", 403);
      let orders =
        (enabled(t, "orders") ||
          enabled(t, "records") ||
          enabled(t, "analytics") ||
          enabled(t, "dishSales")) &&
        (a.role !== "waiter" || c.waiter.viewOrders)
          ? (await s.all(t.id, "order"))
              .filter((o) => o.epoch === t.epoch)
              .map(safeOrder)
          : [];
      let req =
        enabled(t, "requests") && (a.role !== "waiter" || c.waiter.viewRequests)
          ? (await s.all(t.id, "request"))
              .filter(
                (r) =>
                  r.created > now - b.requestMinutes * 60000 &&
                  !(a.role !== "waiter" && r.type === "counter"),
              )
              .map((r) => ({
                ...r,
                status:
                  r.status === "Pending" &&
                  r.created < now - Math.min(b.requestMinutes, 30) * 60000
                    ? "Expired"
                    : r.status,
              }))
          : [];
      if (
        !enabled(t, "records") &&
        !enabled(t, "analytics") &&
        !enabled(t, "dishSales")
      )
        orders = orders.filter((o) =>
          ["Pending", "Cooking", "Ready"].includes(o.status),
        );
      if (a.role === "waiter")
        orders = orders.filter((o) =>
          ["Pending", "Cooking", "Ready"].includes(o.status),
        );
      return {
        id: t.id,
        restaurant_id:t.id,
        role: a.role,
        siteOrigin:hostingView(await s.get("_platform","hosting",t.slug))?.origin || null,
        config: c,
        entitlements: t.entitlements,
        revision: t.revision,
        editableGroups: t.editableGroups || Object.keys(DEFAULTS),
        orders,
        requests: req,
        items:
          enabled(t, "menuEditor") || enabled(t, "billing")
            ? await s.all(t.id, "item")
            : [],
        stocks:
          a.role !== "waiter" && enabled(t, "stocks")
            ? (await s.all(t.id, "stock")).map(applyLoop)
            : [],
        tables:
          a.role !== "waiter" && enabled(t, "tables")
            ? (await s.all(t.id, "table")).map(({ qr, keyHash, ...r }) => ({
                ...r,
                ...(["owner", "admin"].includes(a.role) ? { qr } : {}),
              }))
            : [],
        devices:
          a.role !== "waiter" &&
          enabled(t, "devices") &&
          (a.role !== "manager" || c.manager.devices)
            ? (await s.all(t.id, "device")).map(({ token, ...r }) => r)
            : [],
        notices:
          a.role !== "waiter" && enabled(t, "notifications")
            ? (await s.all(t.id, "notice")).filter(
                (n) =>
                  n.created > now - b.notificationMinutes * 60000 &&
                  (n.kind !== "security" ||
                    a.role !== "manager" ||
                    c.manager.devices ||
                    c.manager.blocking),
              )
            : [],
        members: ["owner", "admin"].includes(a.role)
          ? await s.all(t.id, "member")
          : [],
        analyticsReset: t.analyticsReset || 0,
        dishReset: t.dishReset || 0,
      };
    }
    if (action === "settings") {
      requireRole(a);
      if (input.revision !== t.revision)
        fail("Settings changed elsewhere. Reload before saving.", 409);
      let next = validateConfig(input.config, t);
      if (a.role !== "owner")
        for (let k of Object.keys(DEFAULTS))
          if (
            !(t.editableGroups || Object.keys(DEFAULTS)).includes(k) &&
            JSON.stringify(next[k]) !== JSON.stringify(c[k])
          )
            fail(
              "The platform owner has locked this settings group: " + k,
              403,
            );
      t.config = next;
      t.revision++;
      await s.put(t.id, "tenant", "meta", t);
      return { revision: t.revision };
    }
    if (action === "entitlements") {
      requireRole(a, ["owner"]);

      for (let [k, v] of Object.entries(input.features || {})) {
        if (!(k in FEATURES) || typeof v !== "boolean")
          fail("Invalid feature control.");
        t.entitlements[k] = v;
      }
      t.revision++;
      await s.put(t.id, "tenant", "meta", t);
      return { saved: true };
    }
    if (action === "customizationAccess") {
      requireRole(a, ["owner"]);
      if (
        !Array.isArray(input.groups) ||
        input.groups.some((k) => !(k in DEFAULTS))
      )
        fail("Invalid settings group.");
      t.editableGroups = input.groups;
      t.revision++;
      await s.put(t.id, "tenant", "meta", t);
      return { saved: true };
    }
    if (action === "member") {
      requireRole(a);
      let role = input.role;
      if (!["admin", "manager"].includes(role)) fail("Invalid staff role.");
      if (!/^[A-Za-z0-9._-]{1,36}$/.test(input.userId || ""))
        fail("Valid Appwrite user ID required.");
      await s.put(t.id, "member", input.userId, {
        id: input.userId,
        name: clean(input.name, 120),
        role,
        active: input.active !== false,
        created: now,
      });
      return { saved: true };
    }
    if (action === "item") {
      feature(t, "menuEditor");
      requireRole(a, staff);
      let item = validateItem(input.item);
      if (item.sizes.length) feature(t, "portions");
      let old = await s.get(t.id, "item", item.id);
      if (a.role === "manager") {
        if (!old) fail("Admin required to add dishes.", 403);
        for (const k of ["name", "description", "category", "veg", "image"])
          item[k] = old[k];
      }
      if (old && input.version !== old.updated)
        fail("Dish changed elsewhere. Reload.", 409);
      item.updated = now;
      await s.put(t.id, "item", item.id, item);
      return item;
    }
    if (action === "deleteItem") {
      feature(t, "menuEditor");
      requireRole(a);
      await s.remove(t.id, "item", input.id);
      return { saved: true };
    }
    if (action === "table") {
      feature(t, "tables");
      requireRole(a, staff);
      if (!/^T[1-9][0-9]{0,3}$/.test(input.number || ""))
        fail("Use T1 through T9999.");
      let old = await s.get(t.id, "table", input.number);
      if (a.role === "manager" && (!old || input.rotate || input.remove))
        fail("Admin required.", 403);
      let qr = !old || input.rotate ? token() : old.qr;
      let row = {
        ...old,
        number: input.number,
        id: input.number,
        active: !input.remove,
        reserved:
          input.reserved === undefined ? !!old?.reserved : !!input.reserved,
        qr,
        keyHash: hash(qr),
        created: old?.created || now,
      };
      await s.put(t.id, "table", row.id, row);
      return { saved: true };
    }
    if (action === "stock") {
      feature(t, "stocks");
      requireRole(a, staff);
      let item = await s.get(t.id, "item", input.item);
      if (!item) fail("Dish missing.");
      let variant = input.size || "single";
      if (variant !== "single" && !item.sizes.some((z) => z.id === variant))
        fail("Invalid stock portion.");
      let key = item.id + "|" + variant,
        old = await s.get(t.id, "stock", key);
      if (old && input.revision !== old.revision)
        fail("Stock changed. Reload row.", 409);
      let qty = +input.remaining;
      if (!Number.isInteger(qty) || qty < 0 || qty > 1000000)
        fail("Stock must be a whole number 0–1000000.");
      let loop = !!input.loopEnabled;
      if (loop) feature(t, "stockLoops");
      let lq = +input.loopQuantity || 0;
      if (!Number.isInteger(lq) || lq < 0 || lq > 1000000)
        fail("Invalid loop count.");
      let st = {
        key,
        id: key,
        created: now,
        tracked: !!input.tracked,
        remaining: qty,
        baseline: qty,
        generation: randomUUID(),
        alerted: false,
        revision: (old?.revision || 0) + 1,
        loopEnabled: loop && !!input.tracked,
        loopQuantity: lq,
        nextReset: loop && old?.loopEnabled ? old.nextReset : now + 86400000,
      };
      await s.put(t.id, "stock", key, st);
      return st;
    }
    if (action === "manual") {
      feature(t, "billing");
      requireRole(a, [...staff, "waiter"]);
      if (
        a.role === "waiter" &&
        (!c.waiter.billing || !enabled(t, "waiterBilling"))
      )
        fail("Waiter billing disabled.", 403);
      return composeOrder(s, t, input, a);
    }
    if (action === "status") {
      feature(t, "orders");
      let o = await s.get(t.id, "order", input.id);
      if (!o || o.epoch !== t.epoch) fail("Order missing.", 404);
      if (o.status !== input.expected) fail("Order changed. Refresh.", 409);
      let next = input.next;
      feature(
        t,
        next === "Cooking"
          ? "accept"
          : next === "Rejected"
            ? "reject"
            : "serve",
      );
      requireRole(a, [...staff, "waiter"]);
      if (
        a.role === "waiter" &&
        (next === "Rejected" ||
          (next === "Cooking" && !c.waiter.accept) ||
          (next === "Served" && !c.waiter.serve))
      )
        fail("Waiter permission denied.", 403);
      if (!(
        (o.status === "Pending" && ["Cooking", "Rejected"].includes(next)) ||
        (["Cooking", "Ready"].includes(o.status) && next === "Served")
      ))
        fail("Invalid transition.");
      if (next === "Rejected") await restoreStock(s, t, o);
      o.undo =
        next !== "Served"
          ? { actor: a.id, status: next, token: token() }
          : null;
      o.status = next;
      o.reason = next === "Rejected" ? clean(input.reason, 200) : "";
      o.updated = now;
      await s.put(t.id, "order", o.id, o);
      return { ...safeOrder(o), undoToken: o.undo?.token };
    }
    if (action === "undo") {
      feature(t, "undo");
      requireRole(a, staff);
      let o = await s.get(t.id, "order", input.id);
      if (
        !o ||
        o.undo?.actor !== a.id ||
        o.undo?.token !== input.undoToken ||
        o.undo?.status !== o.status
      )
        fail("Undo is no longer available.");
      if (o.created + b.pendingHours * 3600000 < now)
        fail("Original pending deadline passed.");
      if (o.status === "Rejected") {
        for (let line of o.items) {
          let key = line.id + "|" + (line.size || "single"),
            st = await s.get(t.id, "stock", key);
          if (st?.tracked) {
            if (
              st.generation !== line.stockGeneration ||
              st.remaining < line.qty
            )
              fail("Stock changed; cannot safely undo.");
            st.remaining -= line.qty;
            st.revision++;
            await s.put(t.id, "stock", key, st);
          }
        }
      }
      o.status = "Pending";
      o.reason = "";
      o.undo = null;
      o.updated = now;
      await s.put(t.id, "order", o.id, o);
      return safeOrder(o);
    }
    if (action === "handle") {
      feature(t, "requests");
      let r = await s.get(t.id, "request", input.id);
      if (!r) fail("Request missing.");
      if (r.type === "music") {
        feature(t, "musicQueue");
        feature(t, "music");
      } else if (r.type === "assistance") feature(t, "waiterCalls");
      if (a.role === "waiter" && (!c.waiter.handle || !c.waiter.viewRequests))
        fail("Waiter request handling disabled.", 403);
      const allowed =
        r.type === "music"
          ? ["Playing", "Played", "Rejected"]
          : ["On the way", "Handled"];
      if (!allowed.includes(input.next)) fail("Invalid request action.");
      if (["Played", "Rejected", "Handled", "Expired"].includes(r.status))
        fail("Request already closed.");
      if (input.next === "On the way") r.onWay = now;
      else r.status = input.next;
      r.updated = now;
      await s.put(t.id, "request", r.id, r);
      return { saved: true };
    }
    if (action === "counterCall") {
      feature(t, "callWaiter");
      requireRole(a, staff);
      let id = "counter|" + Math.floor(now / (b.callCooldown * 1000));
      await s.put(t.id, "request", id, {
        id,
        type: "counter",
        table: "Counter",
        created: now,
        status: "Pending",
      });
      return { saved: true };
    }
    if (action === "block") {
      feature(t, "blocking");
      requireRole(a, staff);
      if (a.role === "manager" && !c.manager.blocking && !c.manager.devices)
        fail("Device permission denied.", 403);
      let d = await s.get(t.id, "device", input.id);
      if (!d) fail("Device missing.");
      d.blocked = !!input.blocked;
      d.updated = now;
      await s.put(t.id, "device", d.id, d);
      return { saved: true };
    }
    if (action === "noticeRead") {
      feature(t, "notifications");
      requireRole(a, staff);
      let n = await s.get(t.id, "notice", input.id);
      if (
        !n ||
        (n.kind === "security" &&
          a.role === "manager" &&
          !c.manager.devices &&
          !c.manager.blocking)
      )
        fail("Notice access denied.", 403);
      n.read = true;
      await s.put(t.id, "notice", input.id, n);
      return { saved: true };
    }
    if (action === "waiterLink") {
      requireRole(a);
      feature(t, "waiter");
      let key = token();
      t.waiterHash = hash(key);
      await s.put(t.id, "tenant", "meta", t);
      return { key };
    }
    if (action === "reset") {
      requireRole(a);
      feature(t, "resets");
      if (input.confirm !== "RESET " + String(input.scope).toUpperCase())
        fail("Incorrect confirmation phrase.");
      if (input.scope === "analytics") t.analyticsReset = now;
      else if (input.scope === "dishSales") t.dishReset = now;
      else if (input.scope === "records") {
        if (
          (await s.all(t.id, "order")).some(
            (o) =>
              o.epoch === t.epoch &&
              ["Pending", "Cooking", "Ready"].includes(o.status),
          )
        )
          fail("Finish active orders first.");
        t.epoch = randomUUID();
      } else fail("Unsupported reset.");
      await s.put(t.id, "tenant", "meta", t);
      return { saved: true };
    }
    fail("Unknown action.", 404);
  }
  if (READS.has(action)) return run(root, tenant);
  return root.transaction(tenant.id, async (s) => {
    let fresh = await s.get(tenant.id, "tenant", "meta");
    return run(eventStore(s,fresh), fresh);
  });
}
