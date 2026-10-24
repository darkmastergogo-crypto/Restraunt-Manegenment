import { randomBytes, randomUUID } from "node:crypto";
import {
  FEATURES,
  DEFAULTS,
  FIELD_GROUPS,
  mergeConfig,
  enabled,
  clone,
} from "./schema.mjs";
import { hash } from "./store.mjs";
export function fail(message, status = 400) {
  throw Object.assign(Error(message), { status });
}
export const token = () => randomBytes(32).toString("hex");
export const clean = (v, max = 1000) =>
  String(v ?? "")
    .trim()
    .slice(0, max);
export const validSlug = (s) => /^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/.test(s);
export function dateKey(time, tz = "Asia/Kolkata") {
  let p = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(time));
  return ["year", "month", "day"]
    .map((k) => p.find((x) => x.type === k).value)
    .join("-");
}
export const moneyCents = (v) => {
  if (
    !Number.isFinite(Number(v)) ||
    Number(v) < 0 ||
    Number(v) > 100000 ||
    Math.abs(Number(v) * 100 - Math.round(Number(v) * 100)) > 0.0001
  )
    fail("Invalid monetary amount.");
  return Math.round(Number(v) * 100);
};
export function feature(t, k) {
  if (!enabled(t, k))
    fail("This feature is disabled for this restaurant.", 403);
}
function webURL(value, images = false) {
  let s = String(value || "");
  if (!s) return "";
  if (
    images &&
    /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s) &&
    s.length < 260000
  )
    return s;
  let u;
  try {
    u = new URL(s);
  } catch {
    fail("Use an HTTPS URL.");
  }
  if (u.protocol !== "https:" || u.username || u.password)
    fail("Use an HTTPS URL without login details.");
  return u.href;
}
export function validateConfig(raw, t) {
  let c = mergeConfig(raw);
  for (const group of Object.keys(raw))
    if (!(group in DEFAULTS)) fail("Unknown setting group.");
  for (const [group, fields] of Object.entries(FIELD_GROUPS))
    for (const [key, kind] of Object.entries(fields)) {
      let v = c[group][key];
      if (kind === "boolean" && typeof v !== "boolean")
        fail("Expected boolean: " + key);
      if (
        kind === "number" &&
        (!Number.isFinite(Number(v)) || Number(v) < 0 || Number(v) > 1000000)
      )
        fail("Invalid number: " + key);
      if (kind === "color" && !/^#[0-9a-f]{6}$/i.test(v))
        fail("Use six-digit hex colors.");
      if (kind === "image") c[group][key] = webURL(v, true);
      if (kind === "url") c[group][key] = webURL(v);
      if (["text", "textarea"].includes(kind) && String(v).length > 2000)
        fail("Text is too long: " + key);
    }
  const b = c.behavior;
  for (const key of [
    "visitMinutes",
    "currentMinutes",
    "historyMinutes",
    "notificationMinutes",
    "requestMinutes",
  ])
    if (!Number.isInteger(+b[key]) || +b[key] < 1 || +b[key] > 10080)
      fail("Retention values must be whole minutes 1–10080.");
  if (+b.maxLines > 25)
    fail("At most 25 cart lines fit the guarded transaction budget.");
  for (let k of [
    "callCooldown",
    "musicCooldown",
    "pendingHours",
    "ringSeconds",
  ])
    if (+b[k] < 1) fail(k + " must be at least 1.");
  if (+b.pendingHours > 168 || +b.ringSeconds > 60)
    fail(
      "Pending expiry is at most 168 hours; ring interval at most 60 seconds.",
    );
  if (+b.historyMinutes < +b.currentMinutes)
    fail("History must be at least as long as current orders.");
  for (const key of [
    "pendingCap",
    "maxQuantity",
    "maxLines",
    "loyaltyDays",
    "musicLimit",
  ])
    if (!Number.isInteger(+b[key]) || +b[key] < 1 || +b[key] > 50)
      fail("Count limits must be whole values 1–50.");
  if (b.lowStockPercent > 100 || (b.taxMode === "percent" && b.taxValue > 100))
    fail("Percentage must be 0–100.");
  moneyCents(b.taxValue);
  if (!["percent", "fixed"].includes(b.taxMode)) fail("Invalid tax mode.");
  if (!["original", "system-ui", "Georgia", "Arial", "Verdana"].includes(c.theme.font))
    fail("Invalid font.");
  if (c.theme.radius > 32) fail("Radius must be 0–32.");
  if (!["comfortable", "compact"].includes(c.theme.density))
    fail("Invalid density.");
  if (![58, 80].includes(+c.receipt.paper))
    fail("Receipt width must be 58 or 80 mm.");
  for (const k of ["orders", "requests", "notifications"])
    if (!["chime", "doorbell", "bell", "muted"].includes(c.audio[k]))
      fail("Invalid sound preset.");
  try {
    new Intl.NumberFormat(c.brand.locale, {
      style: "currency",
      currency: c.brand.currency,
    });
    dateKey(Date.now(), c.brand.timezone);
  } catch {
    fail("Invalid locale, currency or timezone.");
  }
  if (
    !Array.isArray(c.categories) ||
    c.categories.length > 60 ||
    c.categories.some(
      (x) => typeof x !== "string" || !x.trim() || x.length > 60,
    ) ||
    new Set(c.categories).size !== c.categories.length
  )
    fail("Use unique categories, up to 60 characters.");
  for (const [key, v] of Object.entries(c.texts))
    if (
      !/^[a-zA-Z0-9_.-]{1,100}$/.test(key) ||
      typeof v !== "string" ||
      v.length > 2000
    )
      fail("Invalid text override.");
  for (const [key, v] of Object.entries(c.visible))
    if (!(key in FEATURES) && !key.startsWith("ui."))
      fail("Unknown visibility key.");
    else if (typeof v !== "boolean") fail("Visibility must be boolean.");
  return c;
}
export function validateItem(x) {
  let sizes = x.sizes || [];
  if (sizes.length > 20) fail("Maximum 20 sizes.");
  let seen = new Set();
  const options = sizes.map((v) => {
    let label = clean(v.label, 40);
    if (!label || seen.has(label.toLowerCase()))
      fail("Size labels must be unique.");
    seen.add(label.toLowerCase());
    return {
      id: /^[a-zA-Z0-9_-]{1,64}$/.test(v.id || "") ? v.id : randomUUID(),
      label,
      price: moneyCents(v.price) / 100,
    };
  });
  let name = clean(x.name, 120);
  if (!name) fail("Dish name required.");
  return {
    id: x.id || randomUUID(),
    name,
    description: clean(x.description),
    category: clean(x.category, 60),
    price: moneyCents(x.price) / 100,
    veg: x.veg !== false,
    available: x.available !== false,
    recommended: !!x.recommended,
    bestSeller: !!x.bestSeller,
    image: webURL(x.image, true),
    sizes: options,
    position: Number(x.position) || 0,
  };
}
export async function getVisit(s, t, input, { ordering = false } = {}) {
  let v = await s.get(t.id, "visit", input.visit);
  if (!v || v.token !== hash(input.visitToken) || v.expires < Date.now())
    fail("Scan your current table QR again.", 401);
  let table = await s.get(t.id, "table", v.table);
  if (!table || !table.active || table.keyHash !== v.qrHash)
    fail("Table link revoked. Scan again.", 403);
  let d = await s.get(t.id, "device", v.device);
  if (!d || d.blocked) fail("This saved browser is blocked.", 403);
  if (ordering && table.reserved) fail("This table is reserved. Ask staff.");
  return { visit: v, table, device: d };
}
export function safeOrder(o) {
  let { tokenHash, actor, undo, ...r } = o;
  return r;
}
export async function composeOrder(s, t, input, actor) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(input.requestId || ""))
    fail("Valid submission ID required.");
  const manual = !!actor;
  const c = t.config,
    b = c.behavior;
  if (
    !Array.isArray(input.items) ||
    !input.items.length ||
    input.items.length > b.maxLines
  )
    fail("Invalid cart.");
  let identity = hash(
    (manual ? actor.id : input.deviceToken || input.visitToken) +
      "|" +
      input.requestId,
  );
  let existing = await s.get(t.id, "order", input.requestId);
  if (existing) {
    if (existing.tokenHash !== identity || existing.epoch !== t.epoch)
      fail("Submission identity mismatch.", 409);
    return safeOrder(existing);
  }
  let v = manual ? null : await getVisit(s, t, input, { ordering: true });
  if (v) {
    let pending = (
      await s.all(t.id, "order", { device: v.device.id, status: "Pending" })
    ).filter((o) => o.epoch === t.epoch);
    if (pending.length >= Math.min(2, b.pendingCap))
      fail("Pending order limit reached. Wait for acceptance.");
  }
  let lines = [],
    sum = 0,
    seen = new Set(),
    stockUpdates = [];
  for (const line of input.items) {
    let qty = +line.qty;
    if (!Number.isInteger(qty) || qty < 1 || qty > b.maxQuantity)
      fail("Invalid quantity.");
    let item = await s.get(t.id, "item", line.id);
    if (!item || !item.available) fail("Item unavailable. Refresh menu.");
    if (item.sizes.length && !enabled(t, "portions"))
      fail("Portioned dishes are disabled.", 403);
    let size = item.sizes.find((z) => z.id === line.size);
    if ((item.sizes.length && !size) || (!item.sizes.length && line.size))
      fail("Invalid size.");
    let key = item.id + "|" + (size?.id || "single");
    if (seen.has(key)) fail("Combine duplicate item/size lines.");
    seen.add(key);
    let st = await s.get(t.id, "stock", key);
    if (st?.tracked) {
      st = applyLoop(st);
      if (st.remaining < qty) fail("Insufficient stock.");
      st.remaining -= qty;
      st.revision = (st.revision || 0) + 1;
      stockUpdates.push({ key, value: st });
    }
    let price = moneyCents(size?.price ?? item.price);
    sum += price * qty;
    lines.push({
      id: item.id,
      size: size?.id || null,
      sizeLabel: size?.label || "",
      name: item.name,
      category: item.category,
      qty,
      price: price / 100,
      subtotal: (price * qty) / 100,
      stockGeneration: st?.tracked ? st.generation : null,
    });
  }
  let tax =
    b.taxEnabled && enabled(t, "tax")
      ? b.taxMode === "percent"
        ? Math.round((sum * b.taxValue) / 100)
        : moneyCents(b.taxValue)
      : 0;
  let total = sum + tax;
  if (
    input.expectedTotal !== undefined &&
    (!Number.isFinite(+input.expectedTotal) ||
      Math.round(+input.expectedTotal * 100) !== total)
  )
    fail("Prices or tax changed. Review the bill.");
  if (manual && !["Cash", "Online"].includes(input.payment))
    fail("Choose Cash or Online.");
  let day = dateKey(Date.now(), c.brand.timezone),
    counter = (await s.get(t.id, "counter", t.epoch + day)) || { number: 0 };
  counter.number++;
  await s.put(t.id, "counter", t.epoch + day, counter);
  let o = {
    id: input.requestId,
    created: Date.now(),
    updated: Date.now(),
    epoch: t.epoch,
    device: v?.device.id || "",
    table: v?.table.number || "Counter",
    tableName: v ? v.table.displayName || v.table.number : "Counter",
    name: enabled(t, "customerName")
      ? clean(input.name, 80) || "Guest"
      : "Guest",
    notes: enabled(t, "notes") ? clean(input.notes) : "",
    status: manual ? "Served" : "Pending",
    source: manual ? "manual" : "qr",
    payment: manual ? input.payment : "QR Scan Menu",
    number: counter.number,
    day,
    items: lines,
    subtotal: sum / 100,
    tax: tax / 100,
    total: total / 100,
    taxMode: b.taxMode,
    taxValue: b.taxValue,
    tokenHash: identity,
    actor: actor?.id || null,
  };
  await s.put(t.id, "order", o.id, o);
  for (const st of stockUpdates) {
    await s.put(t.id, "stock", st.key, st.value);
    if (
      enabled(t, "lowStock") &&
      st.value.baseline > 0 &&
      (st.value.remaining / st.value.baseline) * 100 <= b.lowStockPercent &&
      !st.value.alerted
    ) {
      st.value.alerted = true;
      await s.put(t.id, "stock", st.key, st.value);
      let noticeId = randomUUID();
      await s.put(t.id, "notice", noticeId, {
        id: noticeId,
        created: Date.now(),
        message: "Low stock: " + st.key,
        kind: "stock",
        read: false,
      });
    }
  }
  if (v)
    await s.put(t.id, "device", v.device.id, {
      ...v.device,
      orders: (v.device.orders || 0) + 1,
      lastOrder: Date.now(),
    });
  return safeOrder(o);
}
export function applyLoop(st) {
  let r = { ...st };
  if (r.loopEnabled && r.nextReset <= Date.now()) {
    r.remaining = r.loopQuantity;
    r.baseline = r.remaining;
    r.generation = hash(String(st.generation) + "|" + st.nextReset);
    r.alerted = false;
    r.nextReset +=
      Math.ceil((Date.now() - r.nextReset + 1) / 86400000) * 86400000;
    r.revision = (r.revision || 0) + 1;
  }
  return r;
}
export async function restoreStock(s, t, o) {
  for (const line of o.items) {
    let key = line.id + "|" + (line.size || "single"),
      st = await s.get(t.id, "stock", key);
    if (
      st?.tracked &&
      (!st.loopEnabled || st.nextReset > Date.now()) &&
      st.generation === line.stockGeneration
    ) {
      st.remaining += line.qty;
      st.revision = (st.revision || 0) + 1;
      await s.put(t.id, "stock", key, st);
    }
  }
}
