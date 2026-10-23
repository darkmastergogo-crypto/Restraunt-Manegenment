import fs from "node:fs";
import { FEATURES, FIELD_GROUPS, NAV, human } from "../shared/schema.mjs";
let s = fs.readFileSync("public/app.mjs", "utf8"),
  texts = {};
const STR = String.raw`("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')`;
const parse = (raw) =>
  raw[0] === '"'
    ? JSON.parse(raw)
    : raw.slice(1, -1).replace(/\\(['"\\])/g, "$1");
for (const m of s.matchAll(
  new RegExp(String.raw`(?:L|T)\(\s*${STR}\s*,\s*${STR}`, "g"),
))
  texts[parse(m[1])] = parse(m[2]);
for (const m of s.matchAll(
  new RegExp(String.raw`B\(\s*${STR}\s*,\s*${STR}\s*,\s*${STR}`, "g"),
))
  texts[parse(m[2])] = parse(m[3]);
for (let [g, fields] of Object.entries(FIELD_GROUPS))
  for (let k of Object.keys(fields)) texts["setting." + g + "." + k] = human(k);
for (let [k, v] of Object.entries(FEATURES)) texts["feature." + k] = v;
for (let k of NAV) texts["nav." + k] = human(k);
for (let k of [
  ...Object.keys(FIELD_GROUPS),
  "visibility",
  "texts",
  "staff",
  "tools",
])
  texts["settings." + k] = human(k);
for (let k of [
  "Pending",
  "Cooking",
  "Ready",
  "Served",
  "Rejected",
  "Cancelled",
  "Playing",
  "Played",
  "Handled",
  "Expired",
])
  texts["status." + k] = k;
for (let k of ["All", "Pending", "Cancelled", "Handled", "Expired", "Music"])
  texts["filter." + k] = k;
Object.assign(texts, {
  "billing.title": "New bill",
  "cart.title": "Your order",
  "billing.done": "Done",
  "cart.place": "Place order",
  "menu.unavailable": "Unavailable",
  "bill.number": "Bill no.",
  "bill.time": "Time",
  "reset.analytics": "Reset Analytics",
  "reset.dishSales": "Reset Dish Sales",
  "reset.records": "Reset Records",
  "diet.all": "All dishes",
  "diet.veg": "Vegetarian",
  "diet.nonveg": "Non-vegetarian",
  "cart.minus": "−",
  "cart.plus": "+",
  "cart.add": "Add",
  "order.accept": "Accept order",
  "order.serve": "Mark served",
  "order.reject": "Reject / unavailable",
  "device.unblock": "Unblock device",
  "device.allowed": "Allowed",
  "device.blocked": "Blocked",
  "table.available": "Available",
  "table.reserved": "Reserved",
  "request.Playing": "Playing",
  "request.Played": "Played",
  "request.Rejected": "Rejected",
  "request.Ontheway": "On the way",
  "request.Handled": "Handled",
  "notes.0": "Less spicy",
  "notes.1": "No onion",
  "notes.2": "Extra cheese",
  "nav.platform": "Owner controls",
  "nav.customize": "Customize",
});
Object.assign(texts, {
  "customer.call": "Call waiter",
  "staff.call": "Call waiter",
  "nav.orders": "Pending Orders",
  "nav.records": "Order Records",
  "nav.analytics": "Dashboard",
  "nav.menuEditor": "Menu",
  "nav.devices": "Customer devices",
  "nav.customize": "Management",
  "page.orders": "Pending Orders",
  "page.records": "Order Records",
  "page.analytics": "Dashboard",
  "page.requests": "Requests",
  "page.menuEditor": "Menu",
  "page.customize": "Management",
  "page.tables": "Tables",
  "page.devices": "Customer devices",
  "page.stocks": "Stocks",
  "page.notifications": "Notifications",
  "page.billing": "Billing",
  "page.platform": "Owner controls",
  "page.dishSales": "Dish Sales",
  "menu.headline": "Our Menu",
  "menu.searchPlaceholder": "Search dishes, drinks, desserts...",
  "cart.add": "ADD",
  "cart.place": "Place Order",
  "cart.name": "Your Name (Optional)",
  "cart.notes": "Special Instructions for Kitchen",
  "bill.subtotal": "Items Subtotal",
  "bill.total": "Total to Pay",
  "connection.live": "Live",
  "common.theme": "Use light theme",
});
fs.writeFileSync(
  "public/texts.mjs",
  "export const TEXTS = " + JSON.stringify(texts, null, 2) + ";\n",
);
console.log(
  Object.keys(texts).length + " interface/setting/feature texts registered.",
);
