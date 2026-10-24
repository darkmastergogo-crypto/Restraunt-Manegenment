// LOCAL TEST/DEMO ONLY. Never imported by the production Appwrite function.
import { randomUUID } from "node:crypto";
export class MemoryStore {
  constructor(rows = new Map()) {
    this.rows = rows;
    this.tail = Promise.resolve();
  }
  key(t, y, k) {
    return JSON.stringify([t, y, k]);
  }
  async get(t, y, k) {
    return structuredClone(this.rows.get(this.key(t, y, k)) || null);
  }
  async put(t, y, k, v) {
    let row = structuredClone({ ...v, _row: randomUUID() });
    this.rows.set(this.key(t, y, k), row);
    return structuredClone(row);
  }
  async remove(t, y, k) {
    this.rows.delete(this.key(t, y, k));
  }
  async all(t, y, opts = {}) {
    return [...this.rows]
      .filter(([key, v]) => {
        let [tt, yy] = JSON.parse(key);
        return (
          tt === t &&
          yy === y &&
          (!opts.device || v.device === opts.device) &&
          (!opts.status || v.status === opts.status)
        );
      })
      .map(([, v]) => structuredClone(v))
      .sort((a, b) => (b.created || 0) - (a.created || 0));
  }
  async transaction(t, fn) {
    let release;
    let before = this.tail;
    this.tail = new Promise((r) => (release = r));
    await before;
    let snapshot = structuredClone(this.rows);
    try {
      return await fn(this);
    } catch (e) {
      this.rows = snapshot;
      throw e;
    } finally {
      release();
    }
  }
}
