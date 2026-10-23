import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryStore } from "./memory-store.mjs";
import { service } from "../functions/restaurant-api/src/service.mjs";
import { token } from "../functions/restaurant-api/src/domain.mjs";
const root = path.resolve(fileURLToPath(new URL("../public", import.meta.url))),
  db = new MemoryStore(),
  owner = { $id: "local-owner" },
  opts = { requireMfa: false, ...(process.env.SITES_DEMO === "1" ? {hosting:{
      preflight:async()=>{},
      step:async(j,r)=>j.stage === "queued" ? {...j,stage:"configure",status:"creating"} : j.stage === "configure" ? {...j,stage:"build",status:"deploying"} : {...j,stage:"ready",status:"ready",origin:"https://demo-"+r.id.slice(0,8)+".example.invalid"}
    }} : {}) },
  call = (input) =>
    service(db, input, input.waiterKey ? null : owner, ["local-owner"], opts);
await db.put("_platform", "lock", "write", {});
await call({ action: "provision", slug: "demo-cafe", name: "Yummy Momo" });
await call({
  action: "provision",
  slug: "second-cafe",
  name: "Another restaurant",
});
let initial = await call({ action: "staff", restaurant: "demo-cafe" });
initial.config.brand.logo =
  "data:image/webp;base64," +
  (await fs.readFile(path.join(root, "assets/yummy-momo-logo.webp"))).toString(
    "base64",
  );
initial.config.brand.tagline = "Yummy in your tummy"; // Demo-only local asset; hosted settings accept HTTPS URLs.
let initialTenant = await db.get("demo-cafe", "tenant", "meta");
initialTenant.config = initial.config;
await db.put("demo-cafe", "tenant", "meta", initialTenant);
let items = [
  [
    "Vegetable momos",
    "Hand-folded dumplings with ginger, cabbage and our house chilli dip.",
    "Starters",
    145,
  ],
  [
    "Paneer chilli",
    "Crisp paneer, peppers and a lively sweet-chilli glaze.",
    "Starters",
    210,
  ],
  [
    "Hakka noodles",
    "Wok-tossed noodles with crunchy vegetables and spring onion.",
    "Main course",
    185,
  ],
  [
    "Masala lemonade",
    "Fresh lime, roasted cumin and a little sparkle.",
    "Drinks",
    85,
  ],
];
for (let [name, description, category, price] of items)
  await call({
    action: "item",
    restaurant: "demo-cafe",
    item: {
      name,
      description,
      category,
      price,
      recommended: price === 145,
      bestSeller: price === 210,
    },
  });
await call({ action: "table", restaurant: "demo-cafe", number: "T1" });
let table = await db.get("demo-cafe", "table", "T1");
const device = { device: "demo-browser", deviceToken: token() };
let visit = await call({
  action: "openVisit",
  restaurant: "demo-cafe",
  ...device,
  table: "T1",
  qr: table.qr,
});
await call({
  action: "request",
  restaurant: "demo-cafe",
  ...device,
  visit: visit.id,
  visitToken: visit.token,
  kind: "music",
  requestId: "demo-song-001",
  title: "Here Comes the Sun",
  artist: "The Beatles",
});
const types = {
  ".webmanifest": "application/manifest+json",
  ".webp": "image/webp",
  ".mjs": "text/javascript",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".html": "text/html",
};
http
  .createServer(async (req, res) => {
    try {
      let u = new URL(req.url, "http://127.0.0.1");
      if (u.pathname === "/demo-api" && req.method === "POST") {
        let b = "";
        for await (let chunk of req) {
          b += chunk;
          if (b.length > 800000) throw Error("Too large");
        }
        let x = JSON.parse(b),
          result = await call(x);
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        });
        res.end(JSON.stringify({ data: result }));
        return;
      }
      let requested = path.resolve(root, "." + decodeURIComponent(u.pathname));
      if (requested === root) requested = path.join(root, "index.html");
      if (!requested.startsWith(root + path.sep)) throw Error("Invalid path");
      let f;
      try {
        f = await fs.readFile(requested);
      } catch {
        requested = path.join(root, "index.html");
        f = await fs.readFile(requested);
      }
      res.writeHead(200, {
        "Content-Type":
          types[path.extname(requested)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(f);
    } catch (e) {
      res.writeHead(e.status || 400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
    }
  })
  .listen(Number(process.env.PORT || 8744), process.env.HOST || "0.0.0.0", () => {
    const port = Number(process.env.PORT || 8744);
    console.log(`MAIN ADMIN DEMO http://127.0.0.1:${port}/admin?demo=1`);
    console.log(
      `LOCAL DEMO ONLY http://127.0.0.1:${port}/r/demo-cafe/admin?demo=1`,
    );
    console.log(
      `Customer QR demo: http://127.0.0.1:${port}/r/demo-cafe/menu?demo=1&table=T1&qr=` +
        table.qr,
    );
  });
