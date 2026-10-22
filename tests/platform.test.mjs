import test from "node:test";
import assert from "node:assert/strict";
import { MemoryStore } from "../scripts/memory-store.mjs";
import { service } from "../functions/restaurant-api/src/service.mjs";
import { maintain } from "../functions/restaurant-api/src/maintenance.mjs";
import {
  validateConfig,
  applyLoop,
  token,
} from "../functions/restaurant-api/src/domain.mjs";
import { mergeConfig } from "../shared/schema.mjs";
import { rowID } from "../functions/restaurant-api/src/store.mjs";
async function fixture() {
  let db = new MemoryStore(),
    owner = { $id: "owner" },
    opts = { requireMfa: false },
    call = (action, p = {}, user = owner) =>
      service(
        db,
        { action, restaurant: "alpha-cafe", ...p },
        user,
        ["owner"],
        opts,
      );
  await db.put("_platform", "lock", "write", {});
  await call("provision", { slug: "alpha-cafe", name: "Alpha" });
  await call("provision", { slug: "bravo-cafe", name: "Bravo" });
  let item = await call("item", {
    item: { id: "dish-001", name: "Momos", price: 10, category: "Food" },
  });
  await call("table", { number: "T1" });
  let table = await db.get("alpha-cafe", "table", "T1"),
    device = { device: "browser-0001", deviceToken: token() },
    visit = await call(
      "openVisit",
      { ...device, table: "T1", qr: table.qr },
      null,
    ),
    payload = {
      ...device,
      visit: visit.id,
      visitToken: visit.token,
      items: [{ id: item.id, qty: 1, size: null }],
      requestId: "request-0001",
      expectedTotal: 10,
    };
  return { db, call, owner, opts, item, device, visit, payload, table };
}
const denied = (promise, status) =>
  assert.rejects(promise, (e) => e.status === status);
test("row IDs are tenant-scoped and within Appwrite ID length", () => {
  assert.notEqual(
    rowID("alpha", "order", "123"),
    rowID("bravo", "order", "123"),
  );
  assert.equal(rowID("alpha", "order", "123").length, 36);
});
test("public menu exposes no device, member or order data", async () => {
  let { call } = await fixture(),
    p = await call("public", {}, null);
  assert.equal(p.items.length, 1);
  for (let k of ["devices", "members", "orders", "waiterHash"])
    assert.equal(p[k], undefined);
});
test("unauthenticated staff access is rejected", async () => {
  let { call } = await fixture();
  await denied(call("staff", {}, null), 401);
});
test("membership in A does not grant access to B even with a forged body role", async () => {
  let { call } = await fixture();
  await call("member", { userId: "staff-1", role: "admin" });
  let u = { $id: "staff-1" };
  assert.equal((await call("staff", {}, u)).role, "admin");
  await denied(
    call(
      "staff",
      { restaurant: "bravo-cafe", role: "owner", userId: "owner" },
      u,
    ),
    403,
  );
  await denied(call("entitlements", { features: { music: false } }, u), 403);
});
test("forged restaurant URL cannot retrieve or cancel A orders", async () => {
  let { call, payload, device } = await fixture();
  await call("place", payload, null);
  await denied(
    call("customerOrders", { restaurant: "bravo-cafe", ...device }, null),
    403,
  );
  await denied(
    call(
      "cancel",
      { restaurant: "bravo-cafe", ...device, id: payload.requestId },
      null,
    ),
    403,
  );
});
test("QR and visit capabilities cannot be reused across tenants", async () => {
  let { call, payload, device, table } = await fixture();
  await denied(
    call(
      "openVisit",
      { restaurant: "bravo-cafe", ...device, table: "T1", qr: table.qr },
      null,
    ),
    403,
  );
  await denied(
    call("place", { ...payload, restaurant: "bravo-cafe" }, null),
    401,
  );
});
test("server feature entitlement disables music even if caller forges visibility", async () => {
  let { call, payload } = await fixture();
  await call("entitlements", { features: { music: false } });
  await denied(
    call(
      "request",
      { ...payload, kind: "music", title: "A song", visible: { music: true } },
      null,
    ),
    403,
  );
});
test("restaurant hide/show music is also enforced by backend", async () => {
  let { call, payload } = await fixture(),
    state = await call("staff");
  state.config.visible.music = false;
  await call("settings", { config: state.config, revision: state.revision });
  await denied(
    call("request", { ...payload, kind: "music", title: "A song" }, null),
    403,
  );
});
test("music arrives in Requests and transitions Playing → Played", async () => {
  let { call, payload } = await fixture();
  await call(
    "request",
    { ...payload, kind: "music", title: "A song", artist: "An artist" },
    null,
  );
  let state = await call("staff");
  assert.equal(state.requests[0].title, "A song");
  await call("handle", { id: payload.requestId, next: "Playing" });
  await call("handle", { id: payload.requestId, next: "Played" });
  assert.equal((await call("staff")).requests[0].status, "Played");
  await denied(call("handle", { id: payload.requestId, next: "Playing" }), 400);
});
test("music submission replay is idempotent before cooldown check", async () => {
  let { call, payload } = await fixture(),
    x = { ...payload, kind: "music", title: "A song" };
  await call("request", x, null);
  await call("request", x, null);
  assert.equal((await call("staff")).requests.length, 1);
  await denied(call("request", { ...x, requestId: "request-0002" }, null), 400);
});
test("music links reject javascript and unsupported hosts", async () => {
  let { call, payload } = await fixture();
  for (let url of ["javascript:alert(1)", "https://evil.test/a"])
    await denied(
      call("request", { ...payload, kind: "music", title: "Song", url }, null),
      400,
    );
});
test("prices come from server; client price cannot reduce bill", async () => {
  let { call, payload } = await fixture();
  await denied(
    call(
      "place",
      {
        ...payload,
        items: [{ id: "dish-001", qty: 1, price: 0.01 }],
        expectedTotal: 0.01,
      },
      null,
    ),
    400,
  );
  assert.equal((await call("place", payload, null)).total, 10);
});
test("duplicate order submission charges stock exactly once", async () => {
  let { call, payload } = await fixture();
  await call("stock", { item: "dish-001", tracked: true, remaining: 5 });
  let a = await call("place", payload, null),
    b = await call("place", payload, null);
  assert.equal(a.id, b.id);
  assert.equal((await call("staff")).stocks[0].remaining, 4);
});
test("pending cap under concurrent submissions prevents third order", async () => {
  let { call, payload } = await fixture();
  let result = await Promise.allSettled(
    [1, 2, 3].map((n) =>
      call("place", { ...payload, requestId: "request-000" + n }, null),
    ),
  );
  assert.equal(result.filter((x) => x.status === "fulfilled").length, 2);
  assert.equal((await call("staff")).orders.length, 2);
});
test("stock reservation, rejection, undo and cancel preserve quantities", async () => {
  let { call, payload, device } = await fixture();
  await call("stock", { item: "dish-001", tracked: true, remaining: 5 });
  let o = await call("place", payload, null);
  let rejected = await call("status", {
    id: o.id,
    expected: "Pending",
    next: "Rejected",
    reason: "Unavailable",
  });
  assert.equal((await call("staff")).stocks[0].remaining, 5);
  await call("undo", { id: o.id, undoToken: rejected.undoToken });
  assert.equal((await call("staff")).stocks[0].remaining, 4);
  await call("cancel", { ...device, id: o.id }, null);
  assert.equal((await call("staff")).stocks[0].remaining, 5);
  await denied(call("cancel", { ...device, id: o.id }, null), 400);
});
test("failed cart rolls back stock and counter writes", async () => {
  let { call, payload } = await fixture();
  await call("stock", { item: "dish-001", tracked: true, remaining: 5 });
  await denied(
    call(
      "place",
      {
        ...payload,
        items: [
          { id: "dish-001", qty: 1 },
          { id: "missing", qty: 1 },
        ],
      },
      null,
    ),
    400,
  );
  assert.equal((await call("staff")).stocks[0].remaining, 5);
  assert.equal((await call("staff")).orders.length, 0);
});
test("blocked browser cannot order or open its receipt history", async () => {
  let { call, payload, device } = await fixture();
  await call("block", { id: device.device, blocked: true });
  await denied(call("place", payload, null), 403);
  await denied(call("customerOrders", device, null), 403);
});
test("manager cannot access devices by default or grant roles", async () => {
  let { call } = await fixture();
  await call("member", { userId: "manager", role: "manager" });
  let user = { $id: "manager" },
    s = await call("staff", {}, user);
  assert.equal(s.devices.length, 0);
  await denied(
    call("member", { userId: "somebody", role: "admin" }, user),
    403,
  );
});
test("waiter URL rotation revokes old link", async () => {
  let { call } = await fixture(),
    a = await call("waiterLink");
  assert.equal(
    (await call("waiter", { waiterKey: a.key }, null)).role,
    "waiter",
  );
  await call("waiterLink");
  await denied(call("waiter", { waiterKey: a.key }, null), 403);
});
test("settings optimistic revision detects overwrite", async () => {
  let { call } = await fixture(),
    s = await call("staff");
  s.config.brand.name = "Changed";
  await call("settings", { config: s.config, revision: s.revision });
  await denied(
    call("settings", { config: s.config, revision: s.revision }),
    409,
  );
});
test("owner locked groups cannot be changed by restaurant admin", async () => {
  let { call } = await fixture();
  await call("member", { userId: "admin", role: "admin" });
  await call("customizationAccess", { groups: ["brand"] });
  let s = await call("staff");
  s.config.theme.accent = "#123456";
  await denied(
    call(
      "settings",
      { config: s.config, revision: s.revision },
      { $id: "admin" },
    ),
    403,
  );
  s.config.theme.accent = mergeConfig().theme.accent;
  s.config.brand.name = "Allowed";
  await call(
    "settings",
    { config: s.config, revision: s.revision },
    { $id: "admin" },
  );
});
test("MFA required for owner and restaurant admin in production mode", async () => {
  let { db, owner } = await fixture();
  await denied(
    service(db, { action: "staff", restaurant: "alpha-cafe" }, owner, [
      "owner",
    ]),
    403,
  );
  assert.equal(
    (
      await service(
        db,
        { action: "staff", restaurant: "alpha-cafe" },
        owner,
        ["owner"],
        { mfaVerified: true },
      )
    ).role,
    "owner",
  );
});
test("receipt logo URLs reject script injection; unsafe colors rejected", () => {
  let c = mergeConfig();
  c.receipt.logo = "javascript:alert(1)";
  assert.throws(() => validateConfig(c, {}));
  c = mergeConfig();
  c.theme.accent = "red;background:url(x)";
  assert.throws(() => validateConfig(c, {}));
});
test("record reset is blocked with active orders and then archives epoch", async () => {
  let { call, payload } = await fixture();
  let o = await call("place", payload, null);
  await denied(
    call("reset", { scope: "records", confirm: "RESET RECORDS" }),
    400,
  );
  await call("status", { id: o.id, expected: "Pending", next: "Cooking" });
  await call("status", { id: o.id, expected: "Cooking", next: "Served" });
  await call("reset", { scope: "records", confirm: "RESET RECORDS" });
  assert.equal((await call("staff")).orders.length, 0);
});
test("manual billing needs valid payment and server prices", async () => {
  let { call } = await fixture();
  let p = {
    requestId: "manual-00001",
    items: [{ id: "dish-001", qty: 2 }],
    payment: "Cash",
    expectedTotal: 20,
  };
  await denied(call("manual", { ...p, payment: "Fake" }), 400);
  assert.equal((await call("manual", p)).status, "Served");
});
test("lazy loop generation deterministic across repeated reads", () => {
  let st = {
    remaining: 0,
    baseline: 4,
    generation: "old",
    loopEnabled: true,
    loopQuantity: 8,
    nextReset: Date.now() - 1000,
  };
  assert.equal(applyLoop(st).generation, applyLoop(st).generation);
  assert.equal(applyLoop(st).remaining, 8);
});
test("maintenance expires stale pending orders and restores same-generation stock", async () => {
  let { call, payload, db } = await fixture();
  await call("stock", { item: "dish-001", tracked: true, remaining: 3 });
  let o = await call("place", payload, null),
    raw = await db.get("alpha-cafe", "order", o.id);
  raw.created = Date.now() - 25 * 3600000;
  await db.put("alpha-cafe", "order", o.id, raw);
  await maintain(db);
  let s = await call("staff");
  assert.equal(s.orders[0].status, "Expired");
  assert.equal(s.stocks[0].remaining, 3);
});
test("disabling kitchen orders does not erase enabled records access", async () => {
  let { call, payload } = await fixture();
  await call("manual", { ...payload, payment: "Cash" });
  await call("entitlements", { features: { orders: false, records: true } });
  assert.equal((await call("staff")).orders.length, 1);
});
test("revoking a table QR revokes already-open customer visits", async () => {
  let { call, payload } = await fixture();
  await call("table", { number: "T1", rotate: true });
  await denied(call("place", payload, null), 403);
});
test("waiter cannot use manual billing until explicitly allowed", async () => {
  let { call, payload } = await fixture(),
    link = await call("waiterLink");
  await denied(
    call("manual", { ...payload, payment: "Cash", waiterKey: link.key }, null),
    403,
  );
});
test("owner cannot activate unported background push", async () => {
  let { call } = await fixture();
  await denied(call("entitlements", { features: { push: true } }), 400);
});
test("public config exposes the exact key expected by the browser SDK", async () => {
  let fs = await import("node:fs"),
    vm = await import("node:vm"),
    ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync("public/config.js", "utf8"), ctx);
  let c = ctx.window.PLATFORM_CONFIG;
  assert.equal(c.projectId, "6ad97acd003c74f33ec9");
  assert.equal(c.endpoint, "https://fra.cloud.appwrite.io/v1");
  assert.equal(c.functionId, "restaurant-api");
  assert.equal(c.key, undefined);
});
test("Appwrite adapter scopes all list queries and uses private row permissions", async () => {
  let { AppwriteStore } =
      await import("../functions/restaurant-api/src/store.mjs"),
    calls = [];
  let fake = {
    getRow: async () => {
      throw Object.assign(Error(), { code: 404 });
    },
    createRow: async (x) => {
      calls.push(x);
      return { ...x.data, $id: x.rowId };
    },
    listRows: async (x) => {
      calls.push(x);
      return { rows: [] };
    },
  };
  let store = new AppwriteStore(
    {
      endpoint: "https://example.test/v1",
      project: "test",
      key: "TEST-ONLY-NOT-A-REAL-KEY",
    },
    null,
    fake,
  );
  await store.put("tenant-a", "item", "item-id", { id: "item-id" });
  assert.deepEqual(calls[0].permissions, []);
  await store.list("tenant-a", "order", { device: "customer1" });
  let queries = calls[1].queries.map((s) => JSON.parse(s));
  for (let [k, v] of [
    ["tenant", "tenant-a"],
    ["type", "order"],
    ["device", "customer1"],
  ])
    assert.ok(
      queries.some(
        (q) => q.method === "equal" && q.attribute === k && q.values[0] === v,
      ),
    );
});
test("Appwrite adapter stages tenant lock and commits using one transaction ID", async () => {
  let { AppwriteStore } =
      await import("../functions/restaurant-api/src/store.mjs"),
    calls = [],
    fake = {
      createTransaction: async () => ({ $id: "tx-001" }),
      getRow: async (x) => ({
        $id: x.rowId,
        tenant: "alpha-cafe",
        type:
          x.rowId === rowID("alpha-cafe", "lock", "write") ? "lock" : "tenant",
        payload: JSON.stringify({ created: 1 }),
      }),
      updateRow: async (x) => {
        calls.push(["write", x]);
        return { ...x.data, $id: x.rowId };
      },
      updateTransaction: async (x) => {
        calls.push(["commit", x]);
        return {};
      },
    };
  let s = new AppwriteStore(
    {
      endpoint: "https://example.test/v1",
      project: "test",
      key: "TEST-ONLY-NOT-A-REAL-KEY",
    },
    null,
    fake,
  );
  await s.transaction("alpha-cafe", async (tx) => {
    assert.equal(tx.tx, "tx-001");
  });
  assert.equal(calls[0][1].rowId, rowID("alpha-cafe", "lock", "write"));
  assert.equal(calls[0][1].transactionId, "tx-001");
  assert.equal(calls.at(-1)[1].commit, true);
});
test("table QR rotation preserves reservation state", async () => {
  let { call, db } = await fixture();
  await call("table", { number: "T1", reserved: true });
  await call("table", { number: "T1", rotate: true });
  assert.equal((await db.get("alpha-cafe", "table", "T1")).reserved, true);
});
test("portion entitlement also denies stale client cart submissions", async () => {
  let { call, payload } = await fixture(),
    old = (await call("staff")).items[0];
  await call("item", {
    version: old.updated,
    item: { ...old, sizes: [{ id: "regular", label: "Regular", price: 10 }] },
  });
  await call("entitlements", { features: { portions: false } });
  assert.equal((await call("public", {}, null)).items.length, 0);
  await denied(
    call(
      "place",
      { ...payload, items: [{ id: "dish-001", size: "regular", qty: 1 }] },
      null,
    ),
    403,
  );
});
test("all literal interface keys are present in the customization registry", async () => {
  let fs = await import("node:fs"),
    { TEXTS } = await import("../public/texts.mjs"),
    s = fs.readFileSync("public/app.mjs", "utf8");
  let keys = [...s.matchAll(/["']([a-z][A-Za-z]+\.[A-Za-z][A-Za-z0-9]+)["']/g)]
    .map((m) => m[1])
    .filter((k) => !k.endsWith(".html"));
  assert.deepEqual(
    [...new Set(keys)].filter((k) => !(k in TEXTS)),
    [],
  );
  assert.equal(TEXTS["cart.place"], "Place Order");
  assert.equal(TEXTS["customer.music"], "Request music");
});

test("main admin list and creation work without an existing restaurant URL", async () => {
  const db = new MemoryStore();
  await db.put("_platform", "lock", "write", {});
  const verified = { requireMfa: true, mfaVerified: true };
  const owner = { $id: "main-owner" };
  assert.deepEqual(
    await service(db, { action: "platform" }, owner, ["main-owner"], verified),
    { restaurants: [] },
  );
  await service(
    db,
    { action: "provision", slug: "first-cafe", name: "First Cafe" },
    owner,
    ["main-owner"],
    verified,
  );
  const result = await service(
    db,
    { action: "platform" },
    owner,
    ["main-owner"],
    verified,
  );
  assert.equal(result.restaurants.length, 1);
  assert.equal(result.restaurants[0].slug, "first-cafe");
  assert.equal(result.restaurants[0].status, "active");
  assert.deepEqual(Object.keys(result.restaurants[0]).sort(), [
    "created",
    "id",
    "name",
    "slug",
    "status",
  ]);
  assert.equal(
    (
      await service(
        db,
        { action: "staff", restaurant: "first-cafe" },
        owner,
        ["main-owner"],
        verified,
      )
    ).role,
    "owner",
  );
});

test("main admin denies anonymous and restaurant staff even with forged owner fields", async () => {
  const { db, call } = await fixture();
  await call("member", { userId: "tenant-admin", role: "admin" });
  for (const user of [null, { $id: "tenant-admin" }, { $id: "stranger" }]) {
    for (const action of ["platform", "provision"]) {
      await denied(
        service(
          db,
          {
            action,
            slug: "forged-cafe",
            name: "Forged",
            role: "owner",
            userId: "owner",
          },
          user,
          ["owner"],
          { mfaVerified: true },
        ),
        403,
      );
    }
  }
  assert.equal(await db.get("_platform", "registry", "forged-cafe"), null);
});

test("main admin requires owner MFA for both listing and creation", async () => {
  const { db, owner } = await fixture();
  for (const action of ["platform", "provision"]) {
    await denied(
      service(db, { action, slug: "mfa-cafe", name: "MFA" }, owner, ["owner"]),
      403,
    );
  }
});

test("owner list reflects current restaurant names and does not expose configuration", async () => {
  const { db, call } = await fixture();
  const current = await call("staff");
  current.config.brand.name = "Renamed Alpha";
  await call("settings", {
    config: current.config,
    revision: current.revision,
  });
  const result = await call("platform", { restaurant: "" });
  const alpha = result.restaurants.find((r) => r.slug === "alpha-cafe");
  assert.equal(alpha.name, "Renamed Alpha");
  for (const r of result.restaurants)
    for (const key of ["config", "waiterHash", "members", "orders", "epoch"])
      assert.equal(r[key], undefined);
  const tenant = await db.get("bravo-cafe", "tenant", "meta");
  tenant.status = "inactive";
  await db.put("bravo-cafe", "tenant", "meta", tenant);
  assert.equal(
    (await call("platform")).restaurants.find((r) => r.slug === "bravo-cafe")
      .status,
    "inactive",
  );
});
