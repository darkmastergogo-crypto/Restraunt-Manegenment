import { Client, TablesDB, Functions, ID, Role } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { AppwriteStore } from "../functions/restaurant-api/src/store.mjs";
import { service } from "../functions/restaurant-api/src/service.mjs";
const endpoint =
    process.env.APPWRITE_ENDPOINT || "https://fra.cloud.appwrite.io/v1",
  project = process.env.APPWRITE_PROJECT_ID || "6ad97acd003c74f33ec9",
  key = process.env.APPWRITE_API_KEY,
  owners = (process.env.PLATFORM_OWNER_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  database = process.env.DATABASE_ID || "restaurant_platform";
if (!key || !owners.length) {
  console.error(
    "Set APPWRITE_API_KEY privately in your shell and PLATFORM_OWNER_IDS to your existing Appwrite user ID(s). Read README first. Nothing was changed.",
  );
  process.exit(1);
}
const client = new Client()
    .setEndpoint(endpoint)
    .setProject(project)
    .setKey(key),
  db = new TablesDB(client),
  fn = new Functions(client),
  args = { databaseId: database, tableId: "entities" };
async function createOrExisting(create, get) {
  try {
    return await create();
  } catch (e) {
    if (e.code !== 409) throw e;
    return get();
  }
}
await createOrExisting(
  () => db.create({ databaseId: database, name: "Restaurant platform" }),
  () => db.get({ databaseId: database }),
);
let table = await createOrExisting(
  () =>
    db.createTable({
      ...args,
      name: "Private tenant entities",
      permissions: [],
      rowSecurity: true,
      enabled: true,
    }),
  () => db.getTable(args),
);
if (table.permissions?.length || !table.rowSecurity)
  throw Error(
    "Refusing an existing table with unexpected permissions. No guest/user grants are permitted.",
  );
for (let [name, size] of [
  ["tenant", 64],
  ["type", 40],
  ["key", 256],
  ["status", 40],
  ["device", 80],
  ["payload", 500000],
])
  await createOrExisting(
    () => db.createStringColumn({ ...args, key: name, size, required: true }),
    () => db.getColumn({ ...args, key: name }),
  );
await createOrExisting(
  () =>
    db.createFloatColumn({
      ...args,
      key: "created",
      required: true,
      min: 0,
      max: 9007199254740991,
    }),
  () => db.getColumn({ ...args, key: "created" }),
);
async function waitColumns() {
  for (let i = 0; i < 90; i++) {
    let t = await db.getTable(args),
      cols = t.columns || [];
    if (cols.some((c) => c.status === "failed"))
      throw Error("A column failed provisioning. Inspect table in Appwrite.");
    if (cols.length >= 7 && cols.every((c) => c.status === "available")) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw Error(
    "Columns are still provisioning. Rerun after they become available.",
  );
}
await waitColumns();
for (let cols of [
  ["tenant", "type", "created"],
  ["tenant", "type", "device", "created"],
  ["tenant", "type", "device", "status", "created"],
]) {
  let name = "idx_" + cols.map((x) => x.slice(0, 3)).join("_");
  await createOrExisting(
    () =>
      db.createIndex({
        ...args,
        key: name,
        type: "key",
        columns: cols,
        orders: cols.map((c) => (c === "created" ? "DESC" : "ASC")),
      }),
    () => db.getIndex({ ...args, key: name }),
  );
}
for (let i = 0; i < 90; i++) {
  let t = await db.getTable(args);
  if (t.indexes.some((x) => x.status === "failed"))
    throw Error("Index creation failed.");
  if (t.indexes.every((x) => x.status === "available")) break;
  if (i === 89) throw Error("Indexes still provisioning. Rerun later.");
  await new Promise((r) => setTimeout(r, 1000));
}
const store = new AppwriteStore({ endpoint, project, key, database });
if (!(await store.get("_platform", "lock", "write")))
  await store.put("_platform", "lock", "write", { created: Date.now() });
if (process.env.INITIAL_RESTAURANT_SLUG) {
  let slug = process.env.INITIAL_RESTAURANT_SLUG;
  if (!(await store.get(slug, "tenant", "meta")))
    await service(
      store,
      {
        action: "provision",
        slug,
        name: process.env.INITIAL_RESTAURANT_NAME || "My restaurant",
      },
      { $id: owners[0] },
      owners,
      { requireMfa: false },
    );
  console.log("Initial restaurant ready: " + slug);
}
if (process.env.DEPLOY_FUNCTIONS === "true") {
  fs.mkdirSync("build", { recursive: true });
  execFileSync("tar", [
    "-czf",
    "build/restaurant-function.tar.gz",
    "-C",
    "functions/restaurant-api",
    "package.json",
    "src",
  ]);
  for (let [id, entry, schedule, execute] of [
    ["restaurant-api", "src/main.mjs", "", [Role.any()]],
    ["restaurant-maintenance", "src/maintenance-main.mjs", "*/5 * * * *", []],
  ]) {
    let f = await createOrExisting(
      () =>
        fn.create({
          functionId: id,
          name: id,
          runtime: "node-22",
          execute,
          schedule,
          timeout: 900,
          enabled: true,
          logging: true,
          entrypoint: entry,
          commands: "npm install --omit=dev",
          scopes: ["rows.read", "rows.write"],
        }),
      () => fn.get({ functionId: id }),
    );
    if (
      JSON.stringify(f.execute) !== JSON.stringify(execute) ||
      f.entrypoint !== entry
    )
      throw Error(
        "Existing function " +
          id +
          " has unexpected execution permissions/entrypoint; inspect manually.",
      );
    let vars = (await fn.listVariables({ functionId: id })).variables;
    for (let [name, value] of Object.entries({
      PLATFORM_OWNER_IDS: owners.join(","),
      DATABASE_ID: database,
      REQUIRE_ADMIN_MFA: "true",
    })) {
      let existing = vars.find((v) => v.key === name);
      if (existing)
        await fn.updateVariable({
          functionId: id,
          variableId: existing.$id,
          key: name,
          value,
          secret: false,
        });
      else
        await fn.createVariable({
          functionId: id,
          variableId: ID.unique(),
          key: name,
          value,
          secret: false,
        });
    }
    let d = await fn.createDeployment({
      functionId: id,
      code: InputFile.fromPath(
        "build/restaurant-function.tar.gz",
        "code.tar.gz",
      ),
      activate: true,
      entrypoint: entry,
      commands: "npm install --omit=dev",
    });
    console.log(
      id + " deployment submitted: " + d.$id + " (wait for ready in Console)",
    );
  }
}
console.log(
  "Database setup finished. Do not grant browser access to the entities table. Run acceptance tests against your hosted project before production.",
);
