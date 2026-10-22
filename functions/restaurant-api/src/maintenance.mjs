import { restoreStock, applyLoop } from "./domain.mjs";
import { mergeConfig } from "./schema.mjs";
// Invoke only through the separate, private scheduled function. No public maintenance action exists.
export async function maintain(store) {
  let changed = 0,
    now = Date.now();
  for (let r of await store.all("_platform", "registry")) {
    let t = await store.get(r.id, "tenant", "meta");
    if (!t || t.status !== "active") continue;
    t.config = mergeConfig(t.config);
    for (let order of (await store.all(t.id, "order")).filter(
      (o) =>
        o.status === "Pending" &&
        o.created + t.config.behavior.pendingHours * 3600000 < now,
    )) {
      await store.transaction(t.id, async (s) => {
        let o = await s.get(t.id, "order", order.id);
        if (
          !o ||
          o.status !== "Pending" ||
          o.created + t.config.behavior.pendingHours * 3600000 >= Date.now()
        )
          return;
        await restoreStock(s, t, o);
        o.status = "Expired";
        o.updated = Date.now();
        o.reason = "Pending order expired";
        o.undo = null;
        await s.put(t.id, "order", o.id, o);
        changed++;
      });
    }
    for (let old of (await store.all(t.id, "stock")).filter(
      (x) => x.loopEnabled && x.nextReset <= now,
    ))
      await store.transaction(t.id, async (s) => {
        let st = await s.get(t.id, "stock", old.key);
        if (st?.loopEnabled && st.nextReset <= Date.now()) {
          await s.put(t.id, "stock", st.key, applyLoop(st));
          changed++;
        }
      });
    for (let v of (await store.all(t.id, "visit")).filter(
      (v) => v.expires < now - 86400000,
    )) {
      await store.transaction(t.id, (s) => s.remove(t.id, "visit", v.id));
      changed++;
    }
  }
  return { changed };
}
