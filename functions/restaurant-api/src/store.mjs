import { Client, TablesDB, Query, Account } from "node-appwrite";
import { createHash, randomUUID } from "node:crypto";
export const rowID = (tenant, type, key) =>
  "r" +
  createHash("sha256")
    .update([tenant, type, key].join("\0"))
    .digest("hex")
    .slice(0, 35);
export const hash = (s) => createHash("sha256").update(String(s)).digest("hex");
export class AppwriteStore {
  constructor(
    {
      endpoint,
      project,
      key,
      database = "restaurant_platform",
      table = "entities",
    },
    tx = null,
    shared = null,
  ) {
    this.options = { endpoint, project, key, database, table };
    this.db =
      shared ||
      new TablesDB(
        new Client().setEndpoint(endpoint).setProject(project).setKey(key),
      );
    this.tx = tx;
    this.writes = 0;
  }
  args() {
    return {
      databaseId: this.options.database,
      tableId: this.options.table,
      ...(this.tx ? { transactionId: this.tx } : {}),
    };
  }
  decode(r) {
    if (!r) return null;
    return { ...JSON.parse(r.payload), _row: r.$id };
  }
  async get(tenant, type, key) {
    try {
      const r = await this.db.getRow({
        ...this.args(),
        rowId: rowID(tenant, type, key),
      });
      if (r.tenant !== tenant || r.type !== type)
        throw Error("Tenant mismatch");
      return this.decode(r);
    } catch (e) {
      if (e.code === 404) return null;
      throw e;
    }
  }
  async put(tenant, type, key, value) {
    if (++this.writes > 85)
      throw Object.assign(Error("Operation too large. Use a smaller batch."), {
        status: 413,
      });
    const data = {
      tenant,
      type,
      key,
      status: String(value.status || ""),
      created: Number(value.created || Date.now()),
      device: String(value.device || ""),
      payload: JSON.stringify(value),
    };
    if (data.payload.length > 480000)
      throw Object.assign(
        Error("Record exceeds 480 KB; reduce image/detail size."),
        { status: 413 },
      );
    const old = await this.get(tenant, type, key);
    return this.decode(
      await this.db[old ? "updateRow" : "createRow"]({
        ...this.args(),
        rowId: rowID(tenant, type, key),
        data,
        permissions: [],
      }),
    );
  }
  async remove(tenant, type, key) {
    await this.db.deleteRow({
      ...this.args(),
      rowId: rowID(tenant, type, key),
    });
  }
  async list(tenant, type, { limit = 100, cursor, device, status } = {}) {
    if (!tenant) throw Error("Tenant required");
    let queries = [
      Query.equal("tenant", [tenant]),
      Query.equal("type", [type]),
      Query.orderDesc("created"),
      Query.limit(Math.min(100, limit)),
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    if (device) queries.push(Query.equal("device", [device]));
    if (status) queries.push(Query.equal("status", [status]));
    return (await this.db.listRows({ ...this.args(), queries })).rows.map((r) =>
      this.decode(r),
    );
  }
  async all(tenant, type, opts = {}) {
    let out = [],
      cursor;
    do {
      let page = await this.list(tenant, type, { ...opts, limit: 100, cursor });
      out.push(...page);
      if (page.length < 100) break;
      cursor = page.at(-1)._row;
      if (out.length > 20000)
        throw Object.assign(
          Error("Report too large; export in smaller date ranges."),
          { status: 413 },
        );
    } while (true);
    return out;
  }
  async transaction(tenant, fn) {
    for (let i = 0; i < 3; i++) {
      let tx = await this.db.createTransaction({ ttl: 60 });
      let store = new AppwriteStore(this.options, tx.$id, this.db);
      try {
        let lock = await store.get(tenant, "lock", "write");
        if (!lock) throw Error("Restaurant lock missing. Finish provisioning.");
        await store.put(tenant, "lock", "write", {
          ...lock,
          nonce: randomUUID(),
        });
        let result = await fn(store);
        await this.db.updateTransaction({
          transactionId: tx.$id,
          commit: true,
        });
        return result;
      } catch (e) {
        await this.db
          .updateTransaction({ transactionId: tx.$id, rollback: true })
          .catch(() => {});
        if (e.code === 409 && i < 2) continue;
        throw e;
      }
    }
  }
}
export async function authenticatedUser(endpoint, project, jwt) {
  if (!jwt) return null;
  try {
    return await new Account(
      new Client().setEndpoint(endpoint).setProject(project).setJWT(jwt),
    ).get();
  } catch {
    throw Object.assign(Error("Staff session expired. Sign in again."), {
      status: 401,
    });
  }
}
