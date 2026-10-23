import {phonePushPanel,disablePhonePush} from "./push-client.mjs";
import { portionEditorHTML, mountPortionEditor } from "./portion-editor.mjs";
import { installOriginalAppearance } from "./original-appearance.mjs";
import {
  FEATURES,
  DEFAULTS,
  FIELD_GROUPS,
  NAV,
  mergeConfig,
  enabled,
  human,
  clone,
} from "./schema.mjs";
import { TEXTS } from "./texts.mjs";
const $ = (s) => document.querySelector(s),
  esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const siteConfig = window.PLATFORM_CONFIG || {};
let path = location.pathname.split("/").filter(Boolean);
if(siteConfig.siteMode === "restaurant") {
  const bound = siteConfig.restaurantSlug;
  const destination = path[0] === "r" ? path[2] || "menu" : path[0] || "menu";
  path = ["r",bound,["menu","admin","kitchen","waiter"].includes(destination) ? destination : "menu"];
  history.replaceState(null,"","/"+path.map(encodeURIComponent).join("/")+location.search+location.hash);
}
let slug = path[0] === "r" ? path[1] || "" : "",
  screen = path[2] || "menu";
if(screen === "kitchen") screen = "admin";
const isMainAdmin =
  path.length === 0 ||
  (path.length === 1 && ["admin", "login"].includes(path[0]));
if (isMainAdmin) screen = "platform";
let ownerRestaurants = [],
  ownerQuery = "",
  ownerError = "";
var tabFromURL;
if (
  screen === "admin" &&
  ["platform", "customize"].includes(
    new URLSearchParams(location.search).get("view"),
  )
)
  tabFromURL = new URLSearchParams(location.search).get("view");
if (screen === "kitchen.html") screen = "admin";
if (screen === "waiter.html") screen = "waiter";
installOriginalAppearance(screen);
const selectedSizes = {};
let voiceMuted = false;
let client,
  account,
  functions,
  config = mergeConfig(),
  data = {},
  role = "",
  tab = tabFromURL || "orders",
  settingsTab = "brand",
  draft = null,
  dirty = false,
  cart = new Map(),
  visit = null,
  device = null,
  query = "",
  category = "All",
  diet = "all",
  reqFilter = "All",
  recordPeriod = "day",
  recordDate = "",
  recordStatus = "All",
  page = 0,
  undo = {},
  noticeSeen = new Set(),
  alarmMuted = false,
  snoozedUntil = 0,
  lastRing = 0,
  audioCtx = null,
  voiceName = "",
  wake = null,
  manual = false,
  payment = "",
  busy = false,
  refreshing = false,
  localTone = null;
const demo =
  location.hostname === "127.0.0.1" &&
  new URLSearchParams(location.search).get("demo") === "1";
const waiterKey =
  new URLSearchParams(location.hash.slice(1)).get("key") ||
  sessionStorage.getItem("waiter:" + slug) ||
  "";
if (waiterKey) sessionStorage.setItem("waiter:" + slug, waiterKey);
const storageKey = (k) => "rp:" + slug + ":" + k;
const read = (k, f) => {
  try {
    return JSON.parse(localStorage.getItem(storageKey(k))) ?? f;
  } catch {
    return f;
  }
};
const write = (k, v) => localStorage.setItem(storageKey(k), JSON.stringify(v));
function T(key, fallback) {
  return (
    config.texts?.[key] ??
    TEXTS[key] ??
    fallback ??
    human(key.split(".").at(-1))
  );
}
function L(key, fallback) {
  return `<span data-i18n="${esc(key)}">${esc(T(key, fallback))}</span>`;
}
function B(action, key, fallback, attrs = "", primary = false) {
  if (
    config.visible?.["ui." + key] === false &&
    !["settings.save", "nav.customize", "auth.signOut"].includes(key)
  )
    return "";
  let extra = (attrs.match(/class="([^"]*)"/) || [])[1] || "";
  attrs = attrs.replace(/class="[^"]*"/g, "");
  return `<button type="button" data-action="${esc(action)}" ${attrs} class="${primary ? "primary primary-btn" : "secondary-btn"} ${extra}">${L(key, fallback)}</button>`;
}

function on(k) {
  return enabled({ config, entitlements: data.entitlements }, k);
}
function money(v) {
  try {
    return new Intl.NumberFormat(config.brand.locale, {
      style: "currency",
      currency: config.brand.currency,
    }).format(+v || 0);
  } catch {
    return Number(v || 0).toFixed(2);
  }
}
function day(v) {
  let p = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.brand.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(v));
  return ["year", "month", "day"]
    .map((k) => p.find((x) => x.type === k).value)
    .join("-");
}
function time(v) {
  return new Date(v).toLocaleString(config.brand.locale, {
    timeZone: config.brand.timezone,
  });
}
function toast(s) {
  $("#toast").textContent = s;
  $("#toast").hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("#toast").hidden = true), 6000);
}
function modal(html, kind = "") {
  $("#modal").className =
    kind === "checkout" ? "cart-drawer open rp-checkout" : "rp-dialog";
  $("#modalBody").innerHTML = html;
  $("#modalClose").textContent = T("common.close", "Close");
  if (!$("#modal").open) $("#modal").showModal();
}
$("#modalClose").onclick = () => $("#modal").close();
async function api(action, extra = {}) {
  if (demo) {
    let r = await fetch("/demo-api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, restaurant: slug, waiterKey, ...extra }),
    });
    let j = await r.json();
    if (!r.ok) throw Error(j.error);
    return j.data;
  }
  if (!functions) throw Error("Appwrite SDK unavailable.");
  let result = await functions.createExecution({
    functionId: window.PLATFORM_CONFIG.functionId,
    body: JSON.stringify({
      action,
      restaurant: slug,
      ...(screen === "waiter" ? { waiterKey } : {}),
      ...extra,
    }),
    async: false,
  });
  let body;
  try {
    body = JSON.parse(result.responseBody);
  } catch {
    throw Error("Function did not return JSON. Finish backend deployment.");
  }
  if (!body.ok) throw Error(body.error || "Request failed.");
  return body.data;
}
function applyTheme() {
  document.body.classList.toggle(
    "rp-custom-palette",
    [
      "background",
      "surface",
      "raised",
      "text",
      "muted",
      "accent",
      "accentText",
      "border",
    ].some((k) => config.theme[k] !== DEFAULTS.theme[k]),
  );
  document.body.classList.toggle(
    "rp-custom-font",
    config.theme.font !== "original",
  );
  for (let c of ["customer-site", "staff-site", "waiter-site"])
    document.body.classList.remove(c);
  document.body.classList.add(
    screen === "menu"
      ? "customer-site"
      : screen === "waiter"
        ? "waiter-site"
        : "staff-site",
  );
  document.body.classList.toggle(
    "dark-site",
    !document.body.classList.contains("light"),
  );
  document.body.classList.toggle("signed-out", screen !== "menu" && !role);
  document.body.classList.toggle("owner-console", isMainAdmin);
  for (const k of [
    "background",
    "surface",
    "raised",
    "text",
    "muted",
    "accent",
    "accentText",
    "border",
    "danger",
    "success",
  ])
    document.documentElement.style.setProperty("--" + k, config.theme[k]);
  document.documentElement.style.setProperty(
    "--radius",
    config.theme.radius + "px",
  );
  document.documentElement.style.setProperty("--font", config.theme.font);
  document.body.classList.toggle("compact", config.theme.density === "compact");
  document.title = isMainAdmin
    ? "Main admin · Restaurant Platform"
    : config.brand.name + " · " + T("app.title", "Restaurant");
  let fav = document.querySelector("link[rel=icon]");
  if (config.brand.favicon) {
    if (!fav) {
      fav = document.createElement("link");
      fav.rel = "icon";
      document.head.append(fav);
    }
    fav.href = config.brand.favicon;
  }
}
function brand() {
  return `<div class="staff-brand">${config.brand.logo ? `<img class="brand-logo" src="${esc(config.brand.logo)}" alt="${esc(config.brand.name)}">` : `<span class="brand-mark">${esc(config.brand.name.slice(0, 1))}</span>`}<strong>${esc(config.brand.name)}</strong></div>`;
}
function header() {
  if (screen === "menu")
    return `<header><div class="header-top"><a class="brand-box" href="#home">${config.brand.logo ? `<img class="brand-logo" src="${esc(config.brand.logo)}" alt="${esc(config.brand.name)}">` : ""}<div><h1>${esc(config.brand.name)}</h1><p class="brand-caption">${esc(config.brand.tagline)}</p></div></a><div class="header-actions"><span class="table-badge"><span class="dot"></span>${esc(visit?.table || T("table.scan", "Scan table QR"))}</span>${on("callWaiter") && on("waiterCalls") && on("requests") ? `<div class="waiter-call-action">${appearanceButton("call", "customer.call", "Call waiter", "bell", "call-waiter-button")}</div>` : ""}${on("tracking") || on("history") ? appearanceButton("history", "customer.status", "Order status", "plate", "header-cart") : ""}</div></div></header>`;
  const tools = `<details class="staff-account"><summary><span class="account-avatar"><svg fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3Z"/></svg></span><span><strong>${esc(role === "owner" ? T("role.owner", "Platform owner") : role === "admin" ? T("role.admin", "Admin") : role === "waiter" ? T("role.waiter", "Waiter") : T("role.manager", "Manager"))}</strong><small>${L("auth.signedIn", "Signed in")}</small></span><span class="account-chevron" aria-hidden="true"></span></summary><div class="account-menu">${role === "owner" ? `<a class="button" href="${esc(mainAdminURL())}">${L("owner.back", "Main admin · all restaurants")}</a>` : ""}${on("themeSwitch") ? B("theme", "common.theme", "Use light theme") : ""}${on("contact") ? B("contact", "contact.open", "Contact us") : ""}${["owner","admin","manager"].includes(role) ? B("phonePush", "push.phone", "Phone notifications") : ""}${B("logout", "auth.signOut", "Sign out")}<div class="toolbar">${B("refresh", "common.refresh", "Refresh")}${B("testAudio", "audio.test", "Volume test")}${on("wakeLock") ? B("wake", "device.awake", "Keep screen awake") : ""}</div></div></details>`;
  if (screen === "waiter")
    return `<header class="waiter-header"><div class="waiter-header-brand">${brand()}<h1>${L("waiter.heading", "Waiter Display & Requests")}</h1><span class="connection">${L("connection.live", "Live")}</span></div>${tools}</header>`;
  return `<header><div class="header-left">${brand()}<h1>${L("staff.heading", "Kitchen Display & Orders")}</h1><div class="badge-live"><span class="connection-dot"></span><span id="syncBadge">${L("connection.live", "Live")} · ${L("connection.sync", "Last successful sync")} ${esc(time(Date.now()))}</span></div></div><div class="staff-header-actions">${role && on("callWaiter") ? appearanceButton("counter", "staff.call", "Call waiter", "bell", "secondary-btn") : ""}${role ? tools : ""}</div>${role ? originalNavigation() : ""}</header>`;
}
function activateVisibility() {
  for (const e of document.querySelectorAll("[data-i18n]")) {
    let k = e.dataset.i18n;
    if (config.visible?.["ui." + k] === false && !e.closest("[data-protected]"))
      e.hidden = true;
  }
}
function render() {
  applyTheme();
  if (isMainAdmin) renderOwnerConsole();
  else if (screen === "menu") renderCustomer();
  else if (role) renderStaff();
  else renderLogin();
  activateVisibility();
}
function filteredItems() {
  let items = data.items || [];
  return items
    .filter(
      (i) =>
        ((tab === "menuEditor" && screen !== "menu") ||
          i.available !== false) &&
        (category === "All" ||
          (category === "Recommended" && i.recommended) ||
          (category === "Best Sellers" && i.bestSeller) ||
          i.category === category) &&
        (!query ||
          [i.name, i.description, i.category]
            .join(" ")
            .toLowerCase()
            .includes(query.toLowerCase())) &&
        (diet === "all" || (diet === "veg" ? i.veg : !i.veg)),
    )
    .sort((a, b) => a.position - b.position);
}
function stockLeft(item, size) {
  let st = data.stocks?.find(
    (s) => s.key === item.id + "|" + (size || "single"),
  );
  return st?.tracked ? st.remaining : Infinity;
}
function itemCards() {
  if (screen !== "menu") return staffItemCards();
  return (
    filteredItems()
      .map((i) => {
        let size = i.sizes.find((v) => v.id === selectedSizes[i.id]) ||
            i.sizes[0] || { id: null, label: "", price: i.price },
          key = JSON.stringify([i.id, size.id]),
          qty = cart.get(key)?.qty || 0,
          left = stockLeft(i, size.id);
        return `<article class="item-card"><div class="item-info"><span class="badge-veg-nonveg ${i.veg ? "badge-veg" : "badge-nonveg"}" aria-label="${esc(T(i.veg ? "diet.veg" : "diet.nonveg", i.veg ? "Vegetarian" : "Non-vegetarian"))}"><span class="dot"></span></span><h3 class="item-title">${esc(i.name)}</h3>${i.recommended && on("recommended") ? `<span class="menu-label">${L("menu.recommended", "Recommended")}</span>` : ""}${i.bestSeller && on("bestSellers") ? `<span class="menu-label">${L("menu.bestSeller", "Best seller")}</span>` : ""}<p class="item-desc">${esc(i.description)}</p></div>${on("photos") && i.image ? `<div class="item-img-container"><img class="item-img" src="${esc(i.image)}" alt="${esc(i.name)}" loading="lazy"></div>` : ""}${i.sizes.length ? `<div class="item-size-options">${i.sizes.map((v) => `<button type="button" class="pizza-size-button ${size.id === v.id ? "selected" : ""}" data-action="selectSize" data-id="${esc(i.id)}" data-size="${esc(v.id)}"><span>${esc(v.label)}</span><small>${money(v.price)}</small></button>`).join("")}</div>` : ""}<div class="item-purchase-row"><div><div class="item-price">${money(size.price)}</div>${left <= 0 ? `<small>${L("menu.soldOut", "Sold out")}</small>` : ""}</div>${on("cart") ? `<div class="action-btn-wrapper">${qty ? `<div class="qty-counter">${B("qty", "cart.minus", "−", `data-id="${esc(i.id)}" data-size="${size.id || ""}" data-delta="-1"`)}<span>${qty}</span>${B("qty", "cart.plus", "+", `data-id="${esc(i.id)}" data-size="${size.id || ""}" data-delta="1" ${left <= qty ? "disabled" : ""}`)}</div>` : B("qty", "cart.add", "ADD", `data-id="${esc(i.id)}" data-size="${size.id || ""}" data-delta="1" class="btn-add" ${left <= 0 ? "disabled" : ""}`)}</div>` : ""}</div></article>`;
      })
      .join("") ||
    `<p class="empty">${L("menu.empty", "No dishes match these filters.")}</p>`
  );
}
function filters() {
  return `<div class="toolbar">${on("search") ? `<label>${L("menu.search", "Search menu")}<input id="menuSearch" type="search" value="${esc(query)}" placeholder="${esc(T("menu.searchPlaceholder", "Find a dish"))}"></label>` : ""}${on("categories") ? `<label>${L("menu.category", "Category")}<select id="category">${["All", ...(on("recommended") ? ["Recommended"] : []), ...(on("bestSellers") ? ["Best Sellers"] : []), ...config.categories].map((c) => `<option ${category === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>` : ""}${
    on("diet")
      ? `<label>${L("menu.diet", "Dietary filter")}<select id="diet">${[
          ["all", "All dishes"],
          ["veg", "Vegetarian"],
          ["nonveg", "Non-vegetarian"],
        ]
          .map(
            ([v, l]) =>
              `<option value="${v}" ${diet === v ? "selected" : ""}>${esc(T("diet." + v, l))}</option>`,
          )
          .join("")}</select></label>`
      : ""
  }</div>`;
}
function totals() {
  let subtotal =
    Math.round(
      [...cart.values()].reduce((n, l) => n + l.price * l.qty, 0) * 100,
    ) / 100;
  let b = config.behavior,
    tax =
      on("tax") && b.taxEnabled
        ? b.taxMode === "percent"
          ? Math.round(subtotal * b.taxValue) / 100
          : b.taxValue
        : 0;
  return { subtotal, tax, total: Math.round((subtotal + tax) * 100) / 100 };
}
function cartHTML() {
  let t = totals();
  return `<aside class="panel sticky"><h2>${L(manual ? "billing.title" : "cart.title", manual ? "New bill" : "Your order")}</h2>${!cart.size ? `<p class="muted">${L("cart.empty", "Add something delicious from the menu.")}</p>` : [...cart.values()].map((l) => `<div class="line"><span>${l.qty} × ${esc(l.name)}${l.label ? " · " + esc(l.label) : ""}</span><b>${money(l.qty * l.price)}</b></div>`).join("")}<hr class="divider"><div class="line"><span>${L("bill.subtotal", "Subtotal")}</span><b>${money(t.subtotal)}</b></div>${t.tax ? `<div class="line"><span>${L("bill.tax", "Tax")}</span><b>${money(t.tax)}</b></div>` : ""}<div class="line"><strong>${L("bill.total", "Total")}</strong><strong>${money(t.total)}</strong></div>${!manual && on("customerName") ? `<label>${L("cart.name", "Your name (optional)")}<input id="customerName" maxlength="80"></label>` : ""}${!manual && on("notes") ? `<label>${L("cart.notes", "Instructions for the kitchen")}<textarea id="customerNotes" maxlength="1000"></textarea></label>${on("noteChips") ? `<div class="toolbar">${["Less spicy", "No onion", "Extra cheese"].map((s, i) => B("note", "notes." + i, s, `data-note="${esc(T("notes." + i, s))}"`)).join("")}</div>` : ""}` : ""}${manual ? `<label>${L("billing.payment", "Paid through")}<select id="payment"><option value="">${esc(T("billing.choose", "Select payment"))}</option><option ${payment === "Cash" ? "selected" : ""}>Cash</option><option ${payment === "Online" ? "selected" : ""}>Online</option></select></label>` : ""}<div class="toolbar">${B("submit", manual ? "billing.done" : "cart.place", manual ? "Done" : "Place order", `${!cart.size || (!manual && !visit) ? "disabled" : ""}`, true)}${B("clearCart", "cart.clear", "Clear")}</div>${read("pending", null) ? `<p class="muted">${L("order.uncertain", "Previous submission needs confirmation.")}</p>${B("retry", "order.retry", "Retry original submission")}` : ""}${!manual && !visit ? `<p class="muted">${L("qr.required", "Scan your table QR before ordering.")}</p>` : ""}</aside>`;
}
function renderCustomer() {
  manual = false;
  let cats = [
      "All",
      ...(on("bestSellers") ? ["Best Sellers"] : []),
      ...(on("recommended") ? ["Recommended"] : []),
      ...config.categories,
    ],
    t = totals(),
    qty = [...cart.values()].reduce((n, l) => n + l.qty, 0);
  $("#app").innerHTML =
    `${header()}<section class="menu-hero" id="home"><div class="hero-copy"><p class="hero-eyebrow"><span aria-hidden="true"></span>${L("menu.eyebrow", "FRESH INGREDIENTS · BOLD FLAVORS")}</p><h2>${L("menu.headline", "Our Menu")}</h2><p class="hero-description">${L("menu.subtitle", "Steamed, crispy or spicy — find your favourite momos, dips and delicious bites.")}</p>${on("music") && on("musicQueue") && on("requests") ? `<div class="customer-tools">${appearanceButton("music", "customer.music", "Request music", "music", "song-request-button")}</div>` : ""}</div>${config.brand.hero ? `<div class="hero-photo"><img src="${esc(config.brand.hero)}" alt=""></div>` : ""}</section><div class="menu-workspace">${on("categories") ? `<section class="browse-menu"><div class="browse-heading"><h2>${L("menu.categoriesHeading", "Categories")}</h2></div><div class="categories-bar" id="categoriesBar">${cats.map((c) => `<button type="button" class="cat-btn ${category === c ? "active" : ""}" data-action="categoryChip" data-category="${esc(c)}">${esc(categoryLabel(c))}</button>`).join("")}</div></section>` : ""}<section class="menu-main"><div class="menu-search-tools">${on("search") ? `<div class="search-container"><input class="search-input" id="menuSearch" type="search" value="${esc(query)}" placeholder="${esc(T("menu.searchPlaceholder", "Search dishes, drinks, desserts..."))}" aria-label="${esc(T("menu.search", "Search menu"))}"></div>` : ""}${on("categories") ? `<select id="category" aria-label="${esc(T("menu.category", "Category"))}">${cats.map((c) => `<option value="${esc(c)}" ${category === c ? "selected" : ""}>${esc(categoryLabel(c))}</option>`).join("")}</select>` : ""}${
      on("diet")
        ? `<select id="diet" aria-label="${esc(T("menu.diet", "Dietary filter"))}">${[
            ["all", "Veg / Non-Veg"],
            ["veg", "Veg only"],
            ["nonveg", "Non-Veg only"],
          ]
            .map(
              ([v, l]) =>
                `<option value="${v}" ${diet === v ? "selected" : ""}>${esc(T("diet." + v, l))}</option>`,
            )
            .join("")}</select>`
        : ""
    }</div><div class="menu-list-heading"><h2>${L("menu.listTitle", "Our menu")}</h2><p>${L("menu.listDescription", "Find your next favourite.")}</p></div>${!visit ? `<p class="scan-hint">${L("qr.required", "Scan your table QR before ordering.")}</p>` : ""}<main id="dishGrid" class="menu-container">${itemCards()}</main></section></div>${on("footer") ? `<footer class="system-footer">${on("credit") ? `<p>${esc(config.links.credit)}</p>` : ""}${on("footerLink") && config.links.footer ? `<a href="${esc(config.links.footer)}" target="_blank" rel="noopener">${L("footer.link", "Click here")}</a>` : ""}</footer>` : ""}${on("cart") && qty ? `<button type="button" class="floating-cart-bar" id="floatingCartBar" data-action="checkout" style="display: flex"><span class="cart-summary-text"><span class="cart-items-count">${qty} ${L("cart.items", "ITEMS")}</span><span class="cart-total-price">${money(t.total)}</span></span><span class="view-cart-btn-text">${L("cart.view", "View Order")} →</span></button>` : ""}`;
}
function renderLogin() {
  $("#app").innerHTML =
    `<div class="customer">${header()}<section class="panel" style="max-width:500px;margin:48px auto"><h1>${L("auth.title", "Staff sign-in")}</h1><p class="muted">${L("auth.explain", "Use your Appwrite staff account. Admins require an authenticator.")}</p><form id="loginForm"><label>${L("auth.email", "Email")}<input name="email" type="email" autocomplete="username" required></label><label>${L("auth.password", "Password")}<input name="password" type="password" autocomplete="current-password" required></label><div class="toolbar"><button class="primary" type="submit">${L("auth.signIn", "Sign in")}</button>${B("mfa", "auth.authenticator", "Authenticator options")}</div></form><p id="loginError" class="danger" role="alert"></p></section></div>`;
}
function allowedTab(k) {
  if (k === "customize") return ["owner", "admin"].includes(role);
  if (k === "platform") return role === "owner";
  if (role === "waiter")
    return (
      (k === "orders" && config.waiter.viewOrders) ||
      (k === "requests" && config.waiter.viewRequests) ||
      (k === "billing" && config.waiter.billing && on("waiterBilling"))
    );
  return (
    on(k) && !(k === "devices" && role === "manager" && !config.manager.devices)
  );
}
function renderStaff() {
  if (!allowedTab(tab)) tab = role === "waiter" ? "requests" : "orders";
  let content =
    tab === "customize"
      ? settingsHTML()
      : tab === "platform"
        ? platformHTML()
        : tab === "orders"
          ? ordersHTML()
          : tab === "requests"
            ? requestsHTML()
            : tab === "menuEditor"
              ? menuEditorHTML()
              : tab === "tables"
                ? tablesHTML()
                : tab === "stocks"
                  ? stocksHTML()
                  : tab === "devices"
                    ? devicesHTML()
                    : tab === "records"
                      ? recordsHTML()
                      : tab === "dishSales"
                        ? recordTabs() + dishSalesHTML()
                        : tab === "analytics"
                          ? analyticsHTML()
                          : tab === "notifications"
                            ? notificationsHTML()
                            : tab === "billing"
                              ? billingHTML()
                              : "";
  let title =
    tab === "orders"
      ? "Pending Orders"
      : tab === "records"
        ? "Order Records"
        : tab === "analytics"
          ? "Sales analytics"
          : tab === "menuEditor"
            ? "Menu"
            : tab === "customize"
              ? "Management"
              : human(tab);
  let controls =
    tab === "requests"
      ? `<div class="toolbar">${B("audio", "audio.enable", "Enable sounds")}${B("mute", "audio.requestMute", "Call sound on · mute")}${B("customAudio", "audio.setup", "Alert setup / test")}</div>`
      : tab === "orders"
        ? `<div class="toolbar">${B("toggleVoice", "audio.voiceToggle", "Enable voice alerts")}${B("audio", "audio.orderEnable", "Enable order sound")}</div>`
        : tab === "analytics"
          ? ""
          : B("refresh", "common.refresh", "Refresh");
  if (role === "waiter") {
    let dual = allowedTab("orders") && allowedTab("requests");
    $("#app").innerHTML = `${header()}<main><nav class="waiter-mobile-nav">${[
      "requests",
      "orders",
      ...(allowedTab("billing") ? ["billing"] : []),
    ]
      .filter(allowedTab)
      .map(
        (k) =>
          `<button data-action="tab" data-tab="${k}" aria-pressed="${tab === k}">${L("nav." + k, k === "orders" ? "Orders" : human(k))}</button>`,
      )
      .join(
        "",
      )}</nav>${tab === "billing" ? content : `<div class="waiter-workspace ${dual ? "rp-dual" : ""}">${allowedTab("requests") ? `<section class="waiter-pane rp-requests ${tab === "requests" ? "rp-active" : ""}"><div class="page-heading"><h2>${L("nav.requests", "Requests")}</h2></div>${requestsHTML()}</section>` : ""}${allowedTab("orders") ? `<section class="waiter-pane rp-orders ${tab === "orders" ? "rp-active" : ""}"><div class="page-heading"><h2>${L("waiter.orders", "Pending orders")}</h2></div>${ordersHTML()}</section>` : ""}</div>`}</main>`;
    return;
  }
  $("#app").innerHTML =
    `${header()}<main id="staffMain"><section id="${originalSectionID(tab)}"><div class="page-tools"><h2>${L("page." + tab, title)}</h2>${controls}</div>${content}</section></main>`;
}
function orderCard(o) {
  let next =
    o.status === "Pending"
      ? "Cooking"
      : ["Cooking", "Ready"].includes(o.status)
        ? "Served"
        : null;
  let isRegular = on("loyalty") && regularDevices().has(o.device);
  return `<article class="order-card card ${isRegular ? "regular" : ""}"><div class="order-header"><h3>${L("order.table", "Table")} ${esc(o.table)}</h3><span class="badge status-${esc(o.status)}">${L("status." + o.status, o.status)}</span></div><div class="order-body">${isRegular ? `<span class="badge">★ ${L("loyalty.regular", "Monthly regular")}</span>` : ""}<p class="muted">${L("order.number", "Order no.")} ${o.number} · ${esc(time(o.created))}</p><p>${esc(o.name)}</p>${o.items.map((l) => `<div class="line"><span>${l.qty} × ${esc(l.name)} ${esc(l.sizeLabel)}</span><b>${money(l.subtotal)}</b></div>`).join("")}${o.notes ? `<p class="security">${esc(o.notes)}</p>` : ""}${o.reason ? `<p class="danger">${esc(o.reason)}</p>` : ""}</div><div class="order-footer"><b>${money(o.total)}</b><div class="toolbar">${next && on(next === "Cooking" ? "accept" : "serve") ? B("status", next === "Cooking" ? "order.accept" : "order.serve", next === "Cooking" ? "Accept order" : "Mark served", `data-id="${o.id}" data-next="${next}" data-expected="${o.status}"`, true) : ""}${o.status === "Pending" && on("reject") && role !== "waiter" ? B("status", "order.reject", "Reject / unavailable", `data-id="${o.id}" data-next="Rejected" data-expected="${o.status}"`) : ""}${on("receipts") ? B("receipt", "order.bill", "Bill", `data-id="${o.id}"`) : ""}${undo[o.id] && on("undo") ? B("undo", "order.undo", "Undo", `data-id="${o.id}"`) : ""}${on("blocking") && role !== "waiter" && o.device && (role !== "manager" || config.manager.blocking) ? B("block", "device.block", "Block device", `data-id="${o.device}" data-blocked="true"`) : ""}</div></div></article>`;
}
function regularDevices() {
  let result = new Set(),
    map = new Map(),
    month = day(Date.now()).slice(0, 7);
  for (let o of data.orders || [])
    if (
      o.device &&
      !["Cancelled", "Rejected"].includes(o.status) &&
      day(o.created).startsWith(month)
    ) {
      if (!map.has(o.device)) map.set(o.device, new Set());
      map.get(o.device).add(day(o.created));
    }
  for (let [id, days] of map)
    if (days.size >= config.behavior.loyaltyDays) result.add(id);
  return result;
}
function ordersHTML() {
  let list = (data.orders || []).filter((o) =>
    reqFilter === "Cancelled"
      ? o.status === "Cancelled" &&
        o.updated > Date.now() - config.behavior.cancelledHours * 3600000
      : reqFilter === "Pending"
        ? o.status === "Pending"
        : ["Pending", "Cooking", "Ready"].includes(o.status) ||
          (o.status === "Rejected" &&
            o.updated > Date.now() - config.behavior.rejectedMinutes * 60000 &&
            undo[o.id]),
  );
  return `<div class="tabs">${["All", "Pending", "Cancelled"].map((k) => B("orderFilter", "filter." + k, k, `data-value="${k}"`)).join("")}</div><div class="grid">${list.map(orderCard).join("") || `<p class="empty">${L("order.empty", "No orders in this view.")}</p>`}</div>`;
}
function requestsHTML() {
  let list = (data.requests || []).filter(
    (r) =>
      (reqFilter === "All" ||
        (reqFilter === "Music" && r.type === "music") ||
        r.status === reqFilter) &&
      (r.type !== "music" || on("musicQueue")),
  );
  return `<div class="requests-board" data-theme="${document.body.classList.contains("light") ? "light" : "dark"}"><div class="request-filters">${["All", "Pending", "Handled", "Expired", ...(on("musicQueue") ? ["Music"] : [])].map((k) => B("requestFilter", "filter." + k, k, `data-value="${k}" class="request-filter ${reqFilter === k ? "selected" : ""}"`)).join("")}</div><div class="request-cards">${list.map((r) => `<article class="request-card"><div class="request-card-heading"><h3>${r.type === "music" ? L("request.music", "Music request") : r.type === "reserved" ? L("request.reserved", "Reserved table opened") : L("request.assistance", "Waiter requested")}</h3><span class="request-state">${L("status." + r.status, r.status)}</span></div><p>${L("order.table", "Table")} ${esc(r.table)} · ${esc(time(r.created))}</p>${r.type === "music" ? `<h3>${esc(r.title)}</h3><p>${esc(r.artist)}</p>${r.url ? `<a class="button" href="${esc(r.url)}" target="_blank" rel="noopener">${L("music.open", "Open song link")}</a>` : ""}` : ""}${r.onWay ? `<p>${L("request.onWay", "Waiter is on the way")}</p>` : ""}<div class="toolbar">${!["Handled", "Expired", "Played", "Rejected"].includes(r.status) ? (r.type === "music" ? ["Playing", "Played", "Rejected"] : ["On the way", "Handled"]).map((n) => B("handle", "request." + n.replaceAll(" ", ""), n, `data-id="${esc(r.id)}" data-next="${n}"`)).join("") : ""}</div></article>`).join("") || `<div class="request-empty">${L("request.empty", "No requests.")}</div>`}</div><div class="request-pagination">${B("requestPage", "common.previous", "Previous", "disabled")}<span>${list.length} ${L("request.count", "requests")}</span>${B("requestPage", "common.next", "Next", "disabled")}</div></div>`;
}
function menuEditorHTML() {
  return `<div class="toolbar">${role !== "manager" ? B("editItem", "menu.add", "Add dish", "", true) : ""}${on("arrangement") ? B("categories", "menu.arrange", "Categories & arrangement") : ""}</div>${filters()}<div class="grid">${filteredItems()
    .map(
      (i) =>
        `<article class="card"><h3>${esc(i.name)}</h3><p class="muted">${esc(i.category)} · ${money(i.price)}</p><p>${esc(i.description)}</p><span class="badge">${L(i.available ? "menu.available" : "menu.unavailable", i.available ? "Available" : "Unavailable")}</span><div class="toolbar">${B("editItem", "menu.edit", "Edit / prices / sizes", `data-id="${i.id}"`)}${on("portions") ? `<button type="button" data-action="customizePortions" data-id="${esc(i.id)}">Customize portions</button>` : ""}${role !== "manager" ? B("deleteItem", "menu.delete", "Delete dish", `data-id="${i.id}"`) : ""}</div></article>`,
    )
    .join("")}</div>`;
}
function tablesHTML() {
  return `${role !== "manager" ? B("addTable", "table.add", "Add table", "", true) : ""}<div class="grid" style="margin-top:24px">${(
    data.tables || []
  )
    .filter((t) => t.active)
    .map((t) => {
      let url =
        (data.siteOrigin || location.origin) +
        "/r/" +
        slug +
        "/menu?table=" +
        t.number +
        "&qr=" +
        t.qr;
      return `<article class="card"><h3>${esc(t.number)}</h3><p>${L(t.reserved ? "table.reserved" : "table.available", t.reserved ? "Reserved" : "Available")}</p>${on("qr") && t.qr ? `<div class="qr">${qrHTML(url)}</div><div class="toolbar">${B("copy", "table.copy", "Copy link", `data-text="${esc(url)}"`)}${B("downloadQR", "table.download", "Download QR", `data-text="${esc(url)}" data-name="${t.number}"`)}</div>` : ""}<div class="toolbar">${B("reserveTable", "table.toggle", "Available / reserved", `data-id="${t.number}" data-reserved="${!t.reserved}"`)}${role !== "manager" ? B("rotateTable", "table.rotate", "Revoke QR", `data-id="${t.number}"`) + B("removeTable", "table.remove", "Remove table", `data-id="${t.number}"`) : ""}</div></article>`;
    })
    .join("")}</div>`;
}
function qrHTML(url) {
  try {
    let q = window.qrcode(0, "M");
    q.addData(url);
    q.make();
    return q.createSvgTag({ cellSize: 4, margin: 8, scalable: true });
  } catch {
    return "<p>" + L("qr.copyFallback", "Copy the link instead.") + "</p>";
  }
}
function stocksHTML() {
  let rows = (data.items || []).flatMap((i) =>
    (i.sizes.length ? i.sizes : [{ id: null, label: "", price: i.price }]).map(
      (v) => ({
        item: i,
        size: v,
        stock: data.stocks?.find(
          (s) => s.key === i.id + "|" + (v.id || "single"),
        ),
      }),
    ),
  );
  let units = rows.reduce(
    (n, r) => n + (r.stock?.tracked ? r.stock.remaining : 0),
    0,
  );
  return `${on("stockSummary") ? `<div class="metrics"><div class="card metric"><small>${L("stock.units", "Units remaining")}</small><strong>${units}</strong></div><div class="card metric"><small>${L("stock.value", "Value at selling prices")}</small><strong>${money(rows.reduce((n, r) => n + (r.stock?.tracked ? r.stock.remaining * r.size.price : 0), 0))}</strong></div></div>` : ""}<div class="grid">${rows.map((r) => `<article class="card"><h3>${esc(r.item.name)} ${esc(r.size.label)}</h3><p>${r.stock?.tracked ? r.stock.remaining + " " + T("stock.remaining", "remaining") : T("stock.untracked", "Not tracked")}</p>${on("stockChart") && r.stock?.tracked ? `<div class="bar"><span style="width:${units ? (r.stock.remaining / units) * 100 : 0}%"></span></div>` : ""}<div class="toolbar">${B("editStock", "stock.edit", "Count / loop settings", `data-id="${r.item.id}" data-size="${r.size.id || ""}"`)}</div></article>`).join("")}</div>`;
}
function devicesHTML() {
  return `<div class="grid">${(data.devices || []).map((d) => `<article class="card ${regularDevices().has(d.id) ? "regular" : ""}"><h3>${esc(d.id.slice(0, 12))}</h3><span class="badge">${L(d.blocked ? "device.blocked" : "device.allowed", d.blocked ? "Blocked" : "Allowed")}</span><p>${esc(d.info)}</p><p>${L("device.orders", "Orders")}: ${d.orders || 0}</p><small>${L("device.lastSeen", "Last seen")}: ${esc(time(d.lastSeen))}</small><div class="toolbar">${on("blocking") ? B("block", d.blocked ? "device.unblock" : "device.block", d.blocked ? "Unblock device" : "Block device", `data-id="${d.id}" data-blocked="${!d.blocked}"`) : ""}</div></article>`).join("") || `<p class="empty">${L("device.empty", "No saved customer browsers.")}</p>`}</div>`;
}
function selectedRecords() {
  let list = data.orders || [],
    d = recordDate || day(Date.now());
  return list.filter(
    (o) =>
      (recordPeriod === "all" ||
        (recordPeriod === "month"
          ? day(o.created).slice(0, 7) === d.slice(0, 7)
          : day(o.created) === d)) &&
      (recordStatus === "All" || o.status === recordStatus),
  );
}
function recordTabs() {
  return `<div class="record-subtabs">${B("tab", "records.orders", "Order Records", 'data-tab="records"')}${on("dishSales") ? B("tab", "records.dishes", "Dish Sales", 'data-tab="dishSales"') : ""}</div>`;
}
function recordsHTML() {
  let list = selectedRecords().sort((a, b) => b.created - a.created),
    per = 24;
  return `${recordTabs()}<div class="toolbar"><label>${L("records.period", "Period")}<select id="recordPeriod">${["day", "month", "all"].map((x) => `<option ${recordPeriod === x ? "selected" : ""}>${x}</option>`).join("")}</select></label><label>${L("records.date", "Date")}<input id="recordDate" type="date" value="${esc(recordDate || day(Date.now()))}"></label><label>${L("records.status", "Status")}<select id="recordStatus">${["All", "Pending", "Cooking", "Served", "Rejected", "Cancelled"].map((x) => `<option ${recordStatus === x ? "selected" : ""}>${x}</option>`).join("")}</select></label>${on("csv") ? B("csv", "records.export", "Export filtered CSV") : ""}</div><p>${list.length} ${L("records.results", "matching orders")}</p><div class="grid">${list
    .slice(page * per, (page + 1) * per)
    .map(orderCard)
    .join(
      "",
    )}</div><div class="toolbar">${B("page", "common.previous", "Previous", `data-page="${Math.max(0, page - 1)}" ${page === 0 ? "disabled" : ""}`)}<span>${page + 1} / ${Math.max(1, Math.ceil(list.length / per))}</span>${B("page", "common.next", "Next", `data-page="${page + 1}" ${(page + 1) * per >= list.length ? "disabled" : ""}`)}</div>`;
}
function breakdown(rows, key, value = (o) => o.total) {
  let m = new Map();
  for (let o of rows) {
    let k = key(o);
    m.set(k, (m.get(k) || 0) + value(o));
  }
  return [...m].sort((a, b) => b[1] - a[1]);
}
function statsTable(title, rows, amount = true) {
  return `<section class="panel"><h2>${esc(title)}</h2><div class="table-scroll"><table><tbody>${
    rows
      .slice(0, 50)
      .map(
        ([k, v]) =>
          `<tr><td>${esc(k)}</td><td>${amount ? money(v) : v}</td></tr>`,
      )
      .join("") ||
    `<tr><td>${L("report.empty", "No data in this period.")}</td></tr>`
  }</tbody></table></div></section>`;
}
function analyticsHTML() {
  let orders = (data.orders || []).filter(
      (o) => o.created > data.analyticsReset,
    ),
    served = orders.filter((o) => o.status === "Served"),
    lines = served.flatMap((o) =>
      o.items.map((i) => ({ ...i, created: o.created, table: o.table })),
    ),
    total = served.reduce((n, o) => n + o.total, 0);
  return `<p class="muted">${L("report.basis", "Revenue includes served orders only. Reports cover the current reporting epoch.")}</p><div class="metrics"><div class="card metric"><small>${L("report.revenue", "Served revenue")}</small><strong>${money(total)}</strong></div><div class="card metric"><small>${L("report.orders", "Served orders")}</small><strong>${served.length}</strong></div><div class="card metric"><small>${L("report.average", "Average bill")}</small><strong>${money(served.length ? total / served.length : 0)}</strong></div></div><div class="grid">${
    on("trend")
      ? statsTable(
          T("report.trend", "Daily sales"),
          breakdown(served, (o) => day(o.created)),
        )
      : ""
  }${
    on("outcomes")
      ? statsTable(
          T("report.outcomes", "Order outcomes"),
          breakdown(
            orders,
            (o) => o.status,
            () => 1,
          ),
          false,
        )
      : ""
  }${
    on("weekdays")
      ? statsTable(
          T("report.weekdays", "Weekday sales"),
          breakdown(served, (o) =>
            new Date(o.created).toLocaleDateString(config.brand.locale, {
              weekday: "long",
              timeZone: config.brand.timezone,
            }),
          ),
        )
      : ""
  }${
    on("dishPerformance")
      ? statsTable(
          T("report.dishes", "Dish revenue"),
          breakdown(
            lines,
            (o) => o.name,
            (o) => o.subtotal,
          ),
        )
      : ""
  }${
    on("dishSales")
      ? statsTable(
          T("report.units", "Dish units sold"),
          breakdown(
            (data.orders || [])
              .filter(
                (o) => o.status === "Served" && o.created > data.dishReset,
              )
              .flatMap((o) => o.items),
            (i) => i.name,
            (i) => i.qty,
          ),
          false,
        )
      : ""
  }${
    on("categorySales")
      ? statsTable(
          T("report.categories", "Category revenue"),
          breakdown(
            lines,
            (o) => o.category,
            (o) => o.subtotal,
          ),
        )
      : ""
  }${
    on("sizeSales")
      ? statsTable(
          T("report.sizes", "Portion revenue"),
          breakdown(
            lines,
            (o) => o.sizeLabel || T("menu.standard", "Standard"),
            (o) => o.subtotal,
          ),
        )
      : ""
  }${
    on("tablePerformance")
      ? statsTable(
          T("report.tables", "Table revenue"),
          breakdown(served, (o) => o.table),
        )
      : ""
  }${
    on("hourSales")
      ? statsTable(
          T("report.hours", "Hourly revenue"),
          breakdown(served, (o) =>
            new Date(o.created).toLocaleTimeString(config.brand.locale, {
              hour: "2-digit",
              timeZone: config.brand.timezone,
            }),
          ),
        )
      : ""
  }</div>${on("recentOrders") ? `<h2>${L("report.recent", "Recent served orders")}</h2><div class="grid">${served.slice(0, 6).map(orderCard).join("")}</div>` : ""}`;
}
function notificationsHTML() {
  return `<div class="grid">${(data.notices || []).map((n) => `<article class="card ${n.kind === "security" ? "security" : ""}"><span class="badge">${esc(n.kind)}</span><h3>${esc(n.message)}</h3><p>${esc(time(n.created))}</p>${n.attempts ? `<p>${n.attempts} ${L("notice.attempts", "attempts")}</p>` : ""}${!n.read ? B("readNotice", "notice.read", "Mark read", `data-id="${esc(n.id)}"`) : L("notice.done", "Read")}</article>`).join("") || `<p class="empty">${L("notice.empty", "No notifications.")}</p>`}</div>`;
}
function billingHTML() {
  manual = true;
  return `${filters()}<div class="split"><div class="grid">${itemCards()}</div>${cartHTML()}</div>`;
}
function fieldControl(group, key, kind) {
  let value = draft[group][key],
    attrs = `data-setting="${group}.${key}"`,
    label = T("setting." + group + "." + key, human(key));
  if (kind === "boolean")
    return `<label class="visibility-row"><span>${esc(label)}</span><input ${attrs} type="checkbox" ${value ? "checked" : ""}></label>`;
  let choices = {
    font: ["original", "system-ui", "Georgia", "Arial", "Verdana"],
    density: ["comfortable", "compact"],
    paper: [58, 80],
    taxMode: ["percent", "fixed"],
    tone: ["chime", "doorbell", "bell", "muted"],
  }[kind];
  return `<label>${esc(label)}${choices ? `<select ${attrs}>${choices.map((v) => `<option value="${v}" ${String(value) === String(v) ? "selected" : ""}>${esc(v)}</option>`).join("")}</select>` : kind === "textarea" ? `<textarea ${attrs}>${esc(value)}</textarea>` : `<input ${attrs} type="${kind === "number" ? "number" : kind === "color" ? "color" : "text"}" ${kind === "number" ? 'min="0" step="any"' : ""} value="${esc(value)}">`}${kind === "image" ? `<input type="file" data-upload="${group}.${key}" accept="image/png,image/jpeg,image/webp"><small>${L("image.limit", "HTTPS image URL or PNG/JPEG/WebP upload, up to 180 KB.")}</small>` : ""}</label>`;
}
function settingsHTML() {
  if (!draft) draft = clone(config);
  let groups = [
    ...Object.keys(FIELD_GROUPS),
    "visibility",
    "texts",
    "staff",
    "tools",
  ];
  return `<div data-protected><div class="savebar"><p>${L("settings.explain", "These settings belong only to this restaurant. Owner feature permissions take priority.")}</p>${B("saveSettings", "settings.save", "Save changes", "", true)}${B("discardSettings", "settings.discard", "Discard changes")}</div><div class="tabs">${groups
    .filter(
      (g) =>
        role === "owner" ||
        !FIELD_GROUPS[g] ||
        (data.editableGroups || Object.keys(DEFAULTS)).includes(g),
    )
    .map((g) =>
      B("settingsTab", "settings." + g, human(g), `data-value="${g}"`),
    )
    .join("")}</div>${
    FIELD_GROUPS[settingsTab]
      ? `<div class="settings-grid">${Object.entries(FIELD_GROUPS[settingsTab])
          .map(([k, kind]) => fieldControl(settingsTab, k, kind))
          .join(
            "",
          )}</div>${settingsTab === "receipt" ? `<h2>${L("receipt.preview", "Receipt preview")}</h2>${receiptHTML(sampleOrder(), draft)}` : ""}`
      : settingsTab === "visibility"
        ? `<p>${L("settings.visibilityHelp", "Hide modules or individual interface elements. Hiding a label is presentation only; module controls are enforced by the server.")}</p><div class="settings-grid">${Object.entries(
            FEATURES,
          )
            .map(
              ([k, l]) =>
                `<label class="visibility-row"><span>${esc(T("feature." + k, l))}${data.entitlements?.[k] === false ? " 🔒" : ""}</span><input data-visible="${k}" type="checkbox" ${draft.visible[k] !== false ? "checked" : ""} ${data.entitlements?.[k] === false ? "disabled" : ""}></label>`,
            )
            .join("")}</div>`
        : settingsTab === "texts"
          ? `<label>${L("settings.findText", "Find interface text")}<input id="textSearch" type="search"></label><p>${L("settings.textHelp", "Edit registered text and hide/show individual labels and buttons. Blank overrides intentionally show blank text. Clear overrides with Discard after reloading or restore the default value.")}</p><div class="settings-grid" id="textFields">${Object.entries(
              TEXTS,
            )
              .sort()
              .map(
                ([k, v]) =>
                  `<label class="text-field" data-text-search="${esc((k + " " + v).toLowerCase())}"><small>${esc(k)}</small><input data-text-key="${esc(k)}" value="${esc(draft.texts[k] ?? v)}"><span>${L("settings.show", "Show")} <input type="checkbox" data-visible="ui.${esc(k)}" ${draft.visible["ui." + k] !== false ? "checked" : ""}></span></label>`,
              )
              .join("")}</div>`
          : settingsTab === "staff"
            ? `<h2>${L("staff.members", "Restaurant staff")}</h2><div class="grid">${(data.members || []).map((m) => `<div class="card"><h3>${esc(m.name || m.id)}</h3><p>${esc(m.id)} · ${esc(m.role)} · ${m.active ? "Active" : "Inactive"}</p>${B("disableMember", "staff.disable", "Disable / enable", `data-id="${esc(m.id)}" data-role="${m.role}" data-active="${!m.active}"`)}</div>`).join("")}</div>${B("addMember", "staff.add", "Add existing Appwrite user")}${B("waiterLink", "waiter.link", "Generate / revoke waiter link")}${on("contact") ? `<p>${esc(config.contact.name)} ${esc(config.contact.phone)} ${esc(config.contact.details)}</p>` : ""}`
            : `<p>${L("tools.explain", "Export settings before major edits. Reporting resets archive earlier reporting data; they do not physically delete records.")}</p><div class="toolbar">${B("exportConfig", "settings.export", "Export settings JSON")}${B("importConfig", "settings.import", "Import settings JSON")}${on("resets") ? ["analytics", "dishSales", "records"].map((x) => B("reset", "reset." + x, "Reset " + human(x), `data-scope="${x}"`)).join("") : ""}</div>`
  }</div>`;
}
function platformHTML() {
  return `<p>${L("platform.explain", "Owner-only controls. Disabled features are denied by the backend, not merely hidden.")}</p><p><a class="button" href="${esc(mainAdminURL())}">${L("owner.back", "Main admin · all restaurants")}</a></p><h2>${L("platform.entitlements", "Features supplied to this restaurant")}</h2><form id="customizationAccessForm"><h3>${L("platform.customization", "Settings groups restaurant admins may edit")}</h3><div class="settings-grid">${Object.keys(
    DEFAULTS,
  )
    .map(
      (k) =>
        `<label class="visibility-row">${esc(human(k))}<input name="${k}" type="checkbox" ${(data.editableGroups || Object.keys(DEFAULTS)).includes(k) ? "checked" : ""}></label>`,
    )
    .join(
      "",
    )}</div><button type="submit">${L("platform.saveAccess", "Save customization access")}</button></form><form id="featuresForm"><div class="settings-grid">${Object.entries(
    FEATURES,
  )
    .map(
      ([k, v]) =>
        `<label class="visibility-row"><span>${esc(v)}</span><input name="${k}" type="checkbox" ${data.entitlements?.[k] !== false ? "checked" : ""} ></label>`,
    )
    .join(
      "",
    )}</div><button class="primary" type="submit">${L("platform.save", "Save supplied features")}</button></form>`;
}
function sampleOrder() {
  return {
    number: 42,
    table: "T3",
    created: Date.now(),
    payment: "Cash",
    items: [
      {
        name: "Sample dish",
        qty: 2,
        price: 125,
        subtotal: 250,
        sizeLabel: "Regular",
      },
    ],
    subtotal: 250,
    tax: 12.5,
    total: 262.5,
  };
}
function receiptHTML(o, c = config) {
  let r = c.receipt,
    rows = [],
    t = (k, f) => esc(c.texts[k] ?? TEXTS[k] ?? f),
    line = (l, v) => `<div class="line"><span>${l}</span><b>${v}</b></div>`;
  if (r.showNumber) rows.push(line(t("bill.number", "Bill no."), o.number));
  if (r.showTable) rows.push(line(t("order.table", "Table"), esc(o.table)));
  if (r.showTime) rows.push(line(t("bill.time", "Time"), esc(time(o.created))));
  if (r.showPayment && on("payment"))
    rows.push(line(t("billing.payment", "Paid through"), esc(o.payment)));
  return `<article class="receipt" style="max-width:${r.paper}mm;background:#fff;color:#111;padding:20px;margin:16px auto;font-family:monospace">${r.showLogo && (r.logo || c.brand.logo) ? `<img style="max-width:80px" src="${esc(r.logo || c.brand.logo)}" alt="">` : ""}<h2>${esc(r.name || c.brand.name)}</h2><p>${esc(r.tagline)}</p><p style="white-space:pre-wrap">${esc(r.address)}</p><p>${esc(r.phone)}</p>${r.showTaxId && r.taxId ? `<p>${esc(r.taxIdLabel)}: ${esc(r.taxId)}</p>` : ""}${rows.join("")}<hr>${r.showItems ? o.items.map((i) => line(`${r.showQuantity ? i.qty + " × " : ""}${esc(i.name)} ${esc(i.sizeLabel)}${r.showRate ? " @ " + money(i.price) : ""}`, r.showLineTotal ? money(i.subtotal) : "")).join("") : ""}<hr>${r.showSubtotal ? line(t("bill.subtotal", "Subtotal"), money(o.subtotal)) : ""}${r.showTax ? line(t("bill.tax", "Tax"), money(o.tax)) : ""}${r.showTotal ? line(t("bill.total", "Total"), money(o.total)) : ""}${r.showFooter ? `<p style="white-space:pre-wrap">${esc(r.footer)}</p>` : ""}</article>`;
}
function showReceipt(o) {
  modal(
    receiptHTML(o) +
      (on("print") ? B("print", "bill.print", "Print receipt") : ""),
  );
  $("#printArea").innerHTML = receiptHTML(o);
}
async function refresh(force = false) {
  if (refreshing) return;
  refreshing = true;
  try {
    if (isMainAdmin) {
      try {
        const result = await api("platform");
        ownerRestaurants = result.restaurants || [];
        for(const r of ownerRestaurants.filter(r=>r.hosting && !["ready","failed"].includes(r.hosting.status)).sort((a,b)=>(a.hosting.updated||0)-(b.hosting.updated||0)).slice(0,3)) {
          try { r.hosting=(await api("siteStatus",{restaurant:r.slug})).hosting; }
          catch { /* Keep the last recorded state; never invent ready links. */ }
        }
        data = {};
        config = mergeConfig();
        role = "owner";
        ownerError = "";
        if (location.pathname !== "/admin")
          history.replaceState(null, "", mainAdminURL());
        render();
        return;
      } catch (err) {
        ownerRestaurants = [];
        data = {};
        config = mergeConfig();
        role = "";
        ownerError = err.message;
        render();
        throw err;
      }
    }
    if (screen === "menu") {
      data = await api("public");
      config = mergeConfig(data.config);
    } else {
      if (dirty && !force) return;
      let next = await api(screen === "waiter" ? "waiter" : "staff");
      let newEvents = [
        ...(next.orders || []).filter((o) => o.status === "Pending"),
        ...(next.requests || []).filter((r) => r.status === "Pending"),
      ].filter((x) => !noticeSeen.has(x.id));
      for (let x of [...(next.orders || []), ...(next.requests || [])])
        noticeSeen.add(x.id);
      data = next;
      role = data.role;
      config = mergeConfig(data.config);
      if (force) draft = null;
      if (newEvents.length && on("alarms"))
        ring(
          false,
          next.requests?.some((r) => r.status === "Pending")
            ? "requests"
            : "orders",
        );
    }
    render();
  } finally {
    refreshing = false;
  }
}
function resetCart() {
  cart.clear();
  manual = false;
  payment = "";
}
function download(name, content, type = "application/json") {
  let a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function csvExport() {
  const cell = (v) =>
    '"' +
    String(v ?? "")
      .replace(/^[=+@\-\t\r]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  let rows = [
    ["Order", "Date", "Table", "Status", "Payment", "Subtotal", "Tax", "Total"],
    ...selectedRecords().map((o) => [
      o.number,
      time(o.created),
      o.table,
      o.status,
      o.payment,
      o.subtotal,
      o.tax,
      o.total,
    ]),
  ];
  download(
    slug + "-orders.csv",
    "\ufeff" + rows.map((r) => r.map(cell).join(",")).join("\r\n"),
    "text/csv;charset=utf-8",
  );
}
async function ring(test = false, kind = "orders") {
  if (
    !test &&
    (alarmMuted || Date.now() < snoozedUntil || !audioCtx || !on("alarms"))
  )
    return;
  try {
    audioCtx ||= new AudioContext();
    await audioCtx.resume();
    if (localTone) {
      new Audio(localTone).play().catch(() => {});
      return;
    }
    if (
      !test &&
      (config.audio[kind] === "muted" ||
        (role === "waiter" && !config.waiter.alerts))
    )
      return;
    let o = audioCtx.createOscillator(),
      g = audioCtx.createGain();
    o.connect(g);
    g.connect(audioCtx.destination);
    let frequencies = {
      chime: [660, 880],
      doorbell: [784, 622],
      bell: [1047, 1318],
    }[config.audio[kind]] || [660, 880];
    o.frequency.setValueAtTime(frequencies[0], audioCtx.currentTime);
    o.frequency.setValueAtTime(frequencies[1], audioCtx.currentTime + 0.13);
    g.gain.value = 0.12;
    o.start();
    o.stop(audioCtx.currentTime + 0.28);
    if (
      !voiceMuted &&
      on("voice") &&
      config.audio.voice &&
      "speechSynthesis" in window
    ) {
      let u = new SpeechSynthesisUtterance(
        T("audio.announcement", "New restaurant activity"),
      );
      let v = speechSynthesis.getVoices().find((v) => v.name === voiceName);
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    }
  } catch {
    toast(T("audio.failed", "Audio is not available in this browser."));
  }
}
function formModal(id, title, fields) {
  modal(
    `<h2>${esc(title)}</h2><form id="${id}">${fields}<button class="primary" type="submit">${L("common.save", "Save")}</button></form>`,
  );
}
const input = (name, label, value = "", type = "text", extra = "") =>
  `<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
const check = (name, label, value) =>
  `<label class="visibility-row">${esc(label)}<input name="${name}" type="checkbox" ${value ? "checked" : ""}></label>`;
function itemForm(id) {
  let i = data.items.find((x) => x.id === id) || {
    name: "",
    description: "",
    category: config.categories[0],
    price: 0,
    veg: true,
    available: true,
    sizes: [],
  };
  formModal(
    "itemForm",
    T("menu.edit", "Edit / prices / sizes"),
    `<input name="id" type="hidden" value="${esc(i.id || "")}"><input name="version" type="hidden" value="${i.updated || 0}">${input("name", T("item.name", "Dish name"), i.name, "text", "required")}${input("description", T("item.description", "Description"), i.description)}${input("category", T("item.category", "Category"), i.category)}${input("price", T("item.price", "Base price"), i.price, "number", 'min="0" step="0.01" required')}${input("position", T("item.position", "Sort position"), i.position || 0, "number")}${input("image", T("item.image", "Image HTTPS URL"), i.image)}${check("veg", T("diet.veg", "Vegetarian"), i.veg)}${check("available", T("menu.available", "Available"), i.available)}${check("recommended", T("menu.recommended", "Recommended"), i.recommended)}${check("bestSeller", T("menu.bestSeller", "Best seller"), i.bestSeller)}${portionEditorHTML()}`,
  );
  $("#itemForm").portionEditor = mountPortionEditor($("#itemForm"), i.sizes);
}
function customizePortions(id) {
  const item = data.items.find(i => i.id === id);
  if (!item) throw Error("Dish not found. Refresh the menu.");
  modal(`<div class="portion-modal-heading"><h2>Customize menu item</h2><button type="button" data-portion-cancel aria-label="Close customization">×</button></div><p class="muted">${esc(item.name)}</p><form id="portionForm"><input type="hidden" name="id" value="${esc(item.id)}">${portionEditorHTML()}<div class="toolbar"><button class="primary primary-btn" type="submit">Save changes</button><button type="button" data-portion-cancel>Cancel</button></div></form>`);
  $("#modalClose").hidden = true;
  $("#modal").addEventListener("close", () => {$("#modalClose").hidden = false;}, {once:true});
  const form = $("#portionForm");
  form.portionEditor = mountPortionEditor(form, item.sizes);
  form.originalItem = clone(item);
  document.querySelectorAll("[data-portion-cancel]").forEach(b => b.onclick = () => $("#modal").close());
}
async function customerHistory() {
  let result = await api("customerOrders", device);
  let list = result.orders;
  modal(
    `<h2>${L("customer.status", "Order status")}</h2>${list.map((o) => `<div class="card"><h3>#${o.number} · ${esc(T("status." + o.status, o.status))}</h3><p>${money(o.total)} · ${esc(time(o.created))}</p>${o.status === "Pending" && Date.now() < o.created + config.behavior.cancelSeconds * 1000 && on("cancel") ? B("cancel", "order.cancel", "Cancel order", `data-id="${o.id}"`) : ""}${on("receipts") ? B("customerReceipt", "order.bill", "Bill", `data-id="${o.id}"`) : ""}${o.status === "Served" && on("reviews") && config.links.review && Date.now() > o.updated + config.behavior.reviewDelay * 1000 ? `<a class="button" href="${esc(config.links.review)}" rel="noopener" target="_blank">${L("review.open", "Leave a review")}</a>` : ""}</div>`).join("") || L("history.empty", "No recent orders on this browser.")}`,
  );
  window.customerOrderCache = list;
}
async function submitCart(retry = false) {
  if (!manual && !visit)
    throw Error(T("qr.required", "Scan your table QR before ordering."));
  let payload = retry
    ? read("pending", null)
    : {
        requestId: crypto.randomUUID(),
        items: [...cart.values()].map((l) => ({
          id: l.id,
          size: l.size || null,
          qty: l.qty,
        })),
        expectedTotal: totals().total,
        ...device,
        visit: visit?.id,
        visitToken: visit?.token,
        name: $("#customerName")?.value || "",
        notes: $("#customerNotes")?.value || "",
        payment: $("#payment")?.value || "",
      };
  if (!payload) throw Error("No original submission saved.");
  write("pending", payload);
  let result = await api(manual ? "manual" : "place", payload);
  write("pending", null);
  resetCart();
  toast(T("order.saved", "Order saved") + " #" + result.number);
  if (screen === "menu") $("#modal").close();
  if (screen !== "menu" && on("receipts")) showReceipt(result);
  await refresh(true);
}
document.addEventListener("click", async (e) => {
  let b = e.target.closest("[data-action]");
  if (!b || busy) return;
  let a = b.dataset.action;
  try {
    busy = true;
    b.disabled = true;
    switch (a) {
      case "checkout":
        modal(checkoutHTML(), "checkout");
        break;
      case "categoryChip":
        category = b.dataset.category;
        render();
        break;
      case "selectSize":
        selectedSizes[b.dataset.id] = b.dataset.size;
        render();
        break;
      case "toggleVoice":
        voiceMuted = !voiceMuted;
        toast(
          voiceMuted
            ? T("audio.voiceOff", "Voice alerts off")
            : T("audio.voiceOn", "Voice alerts on"),
        );
        break;
      case "tab":
        if (
          dirty &&
          !confirm(T("settings.unsaved", "Discard unsaved settings?"))
        )
          break;
        tab = b.dataset.tab;
        manual = tab === "billing";
        draft = null;
        dirty = false;
        reqFilter = "All";
        page = 0;
        query = "";
        category = "All";
        render();
        break;
      case "refresh":
        await refresh(true);
        break;
      case "theme":
        document.body.classList.toggle("light");
        document.body.classList.toggle(
          "dark-site",
          !document.body.classList.contains("light"),
        );
        break;
      case "qty": {
        let i = data.items.find((i) => i.id === b.dataset.id),
          size = i.sizes.find((s) => s.id === b.dataset.size),
          key = JSON.stringify([i.id, size?.id || null]),
          old = cart.get(key),
          qty = (old?.qty || 0) + Number(b.dataset.delta);
        if (qty > config.behavior.maxQuantity)
          throw Error("Quantity limit reached.");
        if (qty <= 0) cart.delete(key);
        else
          cart.set(key, {
            id: i.id,
            size: size?.id || null,
            name: i.name,
            label: size?.label || "",
            price: size?.price ?? i.price,
            qty,
          });
        let name = $("#customerName")?.value,
          notes = $("#customerNotes")?.value;
        render();
        if ($("#modal").open && $("#modal").classList.contains("rp-checkout"))
          $("#modalBody").innerHTML = checkoutHTML();
        if ($("#customerName")) $("#customerName").value = name || "";
        if ($("#customerNotes")) $("#customerNotes").value = notes || "";
        break;
      }
      case "note":
        if ($("#customerNotes"))
          $("#customerNotes").value = (
            $("#customerNotes").value +
            " " +
            b.dataset.note
          ).trim();
        break;
      case "clearCart":
        resetCart();
        render();
        break;
      case "submit":
        await submitCart();
        break;
      case "retry":
        await submitCart(true);
        break;
      case "history":
        await customerHistory();
        break;
      case "customerReceipt":
        showReceipt(
          window.customerOrderCache.find((o) => o.id === b.dataset.id),
        );
        break;
      case "cancel":
        await api("cancel", { ...device, id: b.dataset.id });
        await customerHistory();
        break;
      case "music":
        if (!visit)
          throw Error(T("qr.required", "Scan your table QR before ordering."));
        formModal(
          "musicForm",
          T("customer.music", "Request music"),
          input(
            "title",
            T("music.title", "Song title"),
            "",
            "text",
            'required maxlength="160"',
          ) +
            input("artist", T("music.artist", "Artist (optional)")) +
            input(
              "url",
              T("music.url", "YouTube / Spotify link (optional)"),
              "",
              "url",
            ),
        );
        break;
      case "call":
        await api("request", {
          ...device,
          visit: visit?.id,
          visitToken: visit?.token,
          kind: "assistance",
          requestId: crypto.randomUUID(),
        });
        toast(T("request.sent", "Request sent to the kitchen."));
        break;
      case "contact":
        modal(
          `<h2>${L("contact.open", "Contact us")}</h2><p>${esc(config.contact.name)}</p><p>${esc(config.contact.phone)}</p><p>${esc(config.contact.details)}</p>`,
        );
        break;
      case "counter":
        await api("counterCall");
        toast(T("request.sent", "Request sent to the kitchen."));
        break;
      case "orderFilter":
      case "requestFilter":
        reqFilter = b.dataset.value;
        render();
        break;
      case "status": {
        let reason =
          b.dataset.next === "Rejected"
            ? prompt(T("order.reason", "Reason for rejection"), "")
            : "";
        if (reason === null) break;
        let o = await api("status", {
          id: b.dataset.id,
          next: b.dataset.next,
          expected: b.dataset.expected,
          reason,
        });
        if (o.undoToken) undo[o.id] = o.undoToken;
        await refresh(true);
        break;
      }
      case "undo":
        await api("undo", { id: b.dataset.id, undoToken: undo[b.dataset.id] });
        delete undo[b.dataset.id];
        await refresh(true);
        break;
      case "receipt":
        showReceipt(data.orders.find((o) => o.id === b.dataset.id));
        break;
      case "print":
        window.print();
        break;
      case "handle":
        await api("handle", { id: b.dataset.id, next: b.dataset.next });
        await refresh(true);
        break;
      case "settingsTab":
        settingsTab = b.dataset.value;
        render();
        break;
      case "saveSettings":
        await api("settings", { config: draft, revision: data.revision });
        dirty = false;
        await refresh(true);
        toast(T("settings.saved", "Restaurant settings saved."));
        break;
      case "discardSettings":
        draft = clone(config);
        dirty = false;
        render();
        break;
      case "customizePortions":
        customizePortions(b.dataset.id);
        break;
      case "editItem":
        itemForm(b.dataset.id);
        break;
      case "deleteItem":
        if (confirm(T("menu.confirmDelete", "Delete this dish?")))
          await api("deleteItem", { id: b.dataset.id });
        await refresh(true);
        break;
      case "categories":
        formModal(
          "categoriesForm",
          T("menu.arrange", "Categories & arrangement"),
          `<label>${L("menu.categoriesHelp", "Categories, one per line. Dish sort positions control arrangement.")}<textarea name="categories">${esc(config.categories.join("\n"))}</textarea></label>`,
        );
        break;
      case "addTable": {
        let n = prompt(T("table.prompt", "Table number, for example T1"), "T1");
        if (n) await api("table", { number: n });
        await refresh(true);
        break;
      }
      case "reserveTable":
      case "rotateTable":
      case "removeTable":
        if (
          a !== "reserveTable" &&
          !confirm(
            T("table.confirm", "This invalidates table access. Continue?"),
          )
        )
          break;
        await api("table", {
          number: b.dataset.id,
          reserved: b.dataset.reserved === "true",
          rotate: a === "rotateTable",
          remove: a === "removeTable",
        });
        await refresh(true);
        break;
      case "copy":
        await navigator.clipboard.writeText(b.dataset.text);
        toast(T("common.copied", "Copied."));
        break;
      case "downloadQR": {
        let q = window.qrcode(0, "M");
        q.addData(b.dataset.text);
        q.make();
        download(
          slug + "-" + b.dataset.name + ".svg",
          q.createSvgTag({ cellSize: 8, margin: 16 }),
          "image/svg+xml",
        );
        break;
      }
      case "editStock": {
        let key = b.dataset.id + "|" + (b.dataset.size || "single"),
          s = data.stocks.find((s) => s.key === key) || {};
        formModal(
          "stockForm",
          T("stock.edit", "Count / loop settings"),
          `<input name="item" type="hidden" value="${esc(b.dataset.id)}"><input name="size" type="hidden" value="${esc(b.dataset.size)}"><input name="revision" type="hidden" value="${s.revision || 0}">${check("tracked", T("stock.tracked", "Track stock"), s.tracked)}${input("remaining", T("stock.remaining", "Units remaining"), s.remaining || 0, "number", 'min="0" step="1" required')}${on("stockLoops") ? check("loopEnabled", T("stock.loop", "Reset every 24 hours"), s.loopEnabled) + input("loopQuantity", T("stock.loopQuantity", "Reset quantity"), s.loopQuantity || 0, "number", 'min="0" step="1"') : ""}`,
        );
        break;
      }
      case "block":
        if (confirm(T("device.confirm", "Change this browser’s access?")))
          await api("block", {
            id: b.dataset.id,
            blocked: b.dataset.blocked === "true",
          });
        await refresh(true);
        break;
      case "readNotice":
        await api("noticeRead", { id: b.dataset.id });
        await refresh(true);
        break;
      case "page":
        page = +b.dataset.page;
        render();
        break;
      case "csv":
        csvExport();
        break;
      case "addMember":
        formModal(
          "memberForm",
          T("staff.add", "Add existing Appwrite user"),
          input(
            "userId",
            T("staff.userId", "Appwrite user ID"),
            "",
            "text",
            "required",
          ) +
            input("name", T("staff.name", "Display name")) +
            `<label>${L("staff.role", "Role")}<select name="role"><option value="manager">Manager</option><option value="admin">Admin</option></select></label>`,
        );
        break;
      case "disableMember":
        await api("member", {
          userId: b.dataset.id,
          role: b.dataset.role,
          active: b.dataset.active === "true",
        });
        await refresh(true);
        break;
      case "waiterLink":
        if (
          !confirm(
            T(
              "waiter.confirm",
              "Revoke the previous waiter link and generate a new one?",
            ),
          )
        )
          break;
        {
          let r = await api("waiterLink"),
            url = (data.siteOrigin || location.origin) + "/r/" + slug + "/waiter#key=" + r.key;
          modal(
            `<h2>${L("waiter.link", "Private waiter link")}</h2><p class="security">${L("waiter.secret", "Anyone holding this link has the configured waiter permissions. Share privately.")}</p><textarea readonly>${esc(url)}</textarea>${B("copy", "common.copy", "Copy", `data-text="${esc(url)}"`)}`,
          );
        }
        break;
      case "exportConfig":
        download(slug + "-settings.json", JSON.stringify(config, null, 2));
        break;
      case "importConfig": {
        let f = document.createElement("input");
        f.type = "file";
        f.accept = ".json";
        f.onchange = async () => {
          try {
            draft = mergeConfig(JSON.parse(await f.files[0].text()));
            dirty = true;
            render();
          } catch (e) {
            toast(e.message);
          }
        };
        f.click();
        break;
      }
      case "reset": {
        let phrase = prompt(
          "Type RESET " +
            b.dataset.scope.toUpperCase() +
            " to confirm. Earlier records are archived, not erased.",
        );
        if (phrase)
          await api("reset", { scope: b.dataset.scope, confirm: phrase });
        await refresh(true);
        break;
      }
      case "copyRestaurantURL":
        await copyURL(new URL(b.dataset.url, location.origin).href);
        break;
      case "provision":
        if (!isMainAdmin || role !== "owner")
          throw Error("Create restaurants from Main admin.");
        formModal(
          "provisionForm",
          T("platform.create", "Create restaurant"),
          input("name", T("brand.name", "Restaurant name"), "", "text", 'maxlength="120" required'),
        );
        $("#provisionForm").dataset.requestId=crypto.randomUUID();
        $("#provisionForm button[type=submit]").textContent="Create restaurant";
        break;
      case "retrySite":
      case "attachSite":
        await api(a,{restaurant:b.dataset.slug});
        await refresh(true);
        break;
      case "restaurants":
        location.assign(mainAdminURL());
        break;
      case "audio":
        audioCtx ||= new AudioContext();
        await audioCtx.resume();
        toast(T("audio.enabled", "Sound enabled for this open tab."));
        break;
      case "mute":
        alarmMuted = !alarmMuted;
        toast(
          alarmMuted
            ? T("audio.muted", "Muted")
            : T("audio.unmuted", "Unmuted"),
        );
        break;
      case "snooze":
        snoozedUntil = Date.now() + config.behavior.snoozeSeconds * 1000;
        toast(T("audio.snoozed", "Alerts snoozed."));
        break;
      case "testAudio":
        await ring(true);
        break;
      case "customAudio":
        modal(
          `<h2>${L("audio.custom", "Custom audio / voice")}</h2><label>${L("audio.upload", "Local audio file, this browser only")}<input id="audioUpload" type="file" accept="audio/*"></label><label>${L("audio.voice", "System voice")}<select id="voiceName"><option value="">${esc(T("audio.default", "Default"))}</option>${speechSynthesis
            .getVoices()
            .map(
              (v) =>
                `<option ${v.name === voiceName ? "selected" : ""}>${esc(v.name)}</option>`,
            )
            .join("")}</select></label>`,
        );
        break;
      case "wake":
        if (!navigator.wakeLock)
          throw Error("Screen wake lock is unsupported in this browser.");
        wake = await navigator.wakeLock.request("screen");
        toast(T("device.awakeEnabled", "Screen wake lock requested."));
        break;
      case "phonePush":
        await phonePushPanel(api,modal);
        break;
      case "logout":
        await disablePhonePush(api);
        if (account) {
          try {
            await account.deleteSession({ sessionId: "current" });
          } catch (err) {
            if (err.code !== 401) throw err;
          }
        }
        role = "";
        ownerRestaurants = [];
        data = {};
        draft = null;
        dirty = false;
        ownerError = "";
        render();
        break;
      case "mfa":
        await mfaOptions();
        break;
    }
  } catch (err) {
    toast(err.message);
  } finally {
    busy = false;
    if (b.isConnected) b.disabled = false;
  }
});
document.addEventListener("input", (e) => {
  let el = e.target;
  if (el.dataset.setting) {
    let [g, k] = el.dataset.setting.split("."),
      kind = FIELD_GROUPS[g][k];
    draft[g][k] =
      kind === "boolean"
        ? el.checked
        : ["number", "paper"].includes(kind)
          ? +el.value
          : el.value;
    dirty = true;
  }
  if (el.dataset.visible) {
    draft.visible[el.dataset.visible] = el.checked;
    dirty = true;
  }
  if (el.dataset.textKey) {
    draft.texts[el.dataset.textKey] = el.value;
    dirty = true;
  }
  if (el.id === "ownerSearch") {
    ownerQuery = el.value;
    renderOwnerList();
  }
  if (el.id === "menuSearch") {
    query = el.value;
    let grid = $("#dishGrid");
    if (grid) grid.innerHTML = itemCards();
  }
  if (el.id === "textSearch") {
    let q = el.value.toLowerCase();
    for (let f of document.querySelectorAll("[data-text-search]"))
      f.hidden = !f.dataset.textSearch.includes(q);
  }
});
document.addEventListener("change", async (e) => {
  let el = e.target;
  try {
    if (el.dataset.upload) {
      let file = el.files[0];
      if (!file) return;
      if (
        file.size > 180000 ||
        !["image/png", "image/jpeg", "image/webp"].includes(file.type)
      )
        throw Error(
          T("image.limit", "Image must be PNG/JPEG/WebP under 180 KB."),
        );
      let val = await new Promise((r) => {
          let fr = new FileReader();
          fr.onload = () => r(fr.result);
          fr.readAsDataURL(file);
        }),
        [g, k] = el.dataset.upload.split(".");
      draft[g][k] = val;
      dirty = true;
      render();
    }
    if (el.id === "category") {
      category = el.value;
      render();
    }
    if (el.id === "diet") {
      diet = el.value;
      render();
    }
    if (el.id === "payment") payment = el.value;
    if (el.id === "recordPeriod") {
      recordPeriod = el.value;
      page = 0;
      render();
    }
    if (el.id === "recordDate") {
      recordDate = el.value;
      page = 0;
      render();
    }
    if (el.id === "recordStatus") {
      recordStatus = el.value;
      page = 0;
      render();
    }
    if (el.id === "voiceName") voiceName = el.value;
    if (el.id === "audioUpload" && el.files[0]) {
      if (localTone) URL.revokeObjectURL(localTone);
      localTone = URL.createObjectURL(el.files[0]);
    }
  } catch (err) {
    toast(err.message);
  }
});
document.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (busy) return;
  let f = e.target,
    fd = new FormData(f),
    x = Object.fromEntries(fd);
  try {
    busy = true;
    switch (f.getAttribute("id")) {
      case "loginForm":
        try {
          await account.createEmailPasswordSession({
            email: x.email,
            password: x.password,
          });
        } catch (err) {
          if (err.type !== "user_more_factors_required") throw err;
          await mfaChallenge();
          break;
        }
        await afterSignIn();
        break;
      case "musicForm":
        await api("request", {
          ...device,
          ...x,
          visit: visit.id,
          visitToken: visit.token,
          kind: "music",
          requestId: crypto.randomUUID(),
        });
        $("#modal").close();
        toast(T("request.sent", "Request sent to the kitchen."));
        break;
      case "portionForm": {
        const item = e.target.originalItem;
        await api("item", {version:item.updated, item:{...item, sizes:e.target.portionEditor.read()}});
        $("#modal").close();
        await refresh(true);
        toast("Portion sizes saved.");
        break;
      }
      case "itemForm": {
        let old = data.items.find((i) => i.id === x.id);
        await api("item", {
          version: old?.updated,
          item: {
            ...x,
            id: x.id || undefined,
            sizes: e.target.portionEditor.read(),
            veg: fd.has("veg"),
            available: fd.has("available"),
            recommended: fd.has("recommended"),
            bestSeller: fd.has("bestSeller"),
          },
        });
        $("#modal").close();
        await refresh(true);
        break;
      }
      case "stockForm":
        await api("stock", {
          ...x,
          revision: +x.revision,
          tracked: fd.has("tracked"),
          loopEnabled: fd.has("loopEnabled"),
        });
        $("#modal").close();
        await refresh(true);
        break;
      case "categoriesForm":
        draft = clone(config);
        draft.categories = x.categories
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
        await api("settings", { config: draft, revision: data.revision });
        dirty = false;
        $("#modal").close();
        await refresh(true);
        break;
      case "memberForm":
        await api("member", x);
        $("#modal").close();
        await refresh(true);
        break;
      case "provisionForm": {
        let r = await api("provision", {...x, requestId:f.dataset.requestId});
        $("#modal").close();
        ownerQuery = "";
        await refresh(true);
        const created = ownerRestaurants.find((v) => v.id === r.id);
        if (created && (!created.hosting || created.hosting.status === "ready")) showRestaurantURLs(created);
        toast(T("owner.created", "Restaurant created. Its website is being prepared; links appear when Ready."));
        break;
      }
      case "customizationAccessForm":
        await api("customizationAccess", {
          groups: Object.keys(DEFAULTS).filter((k) => fd.has(k)),
        });
        await refresh(true);
        break;
      case "featuresForm":
        await api("entitlements", {
          features: Object.fromEntries(
            Object.keys(FEATURES).map((k) => [
              k,
              fd.has(k),
            ]),
          ),
        });
        await refresh(true);
        toast(T("platform.saved", "Owner permissions saved."));
        break;
      case "mfaVerifyForm":
        await account.updateMfaAuthenticator({ type: "totp", otp: x.code });
        await account.updateMFA({ mfa: true });
        $("#modal").close();
        await mfaChallenge();
        break;
      case "mfaChallengeForm":
        await account.updateMfaChallenge({
          challengeId: x.challengeId,
          otp: x.code,
        });
        $("#modal").close();
        await afterSignIn();
        break;
    }
  } catch (err) {
    toast(err.message);
    if ($("#loginError")) $("#loginError").textContent = err.message;
  } finally {
    busy = false;
  }
});
async function mfaChallenge() {
  let ch = await account.createMfaChallenge({
    factor: Appwrite.AuthenticationFactor.Totp,
  });
  formModal(
    "mfaChallengeForm",
    T("auth.verify", "Verify authenticator"),
    `<input name="challengeId" type="hidden" value="${esc(ch.$id)}">${input("code", T("auth.code", "Authenticator code"), "", "text", 'autocomplete="one-time-code" required')}`,
  );
}
async function mfaOptions() {
  if (!account) throw Error("Connect Appwrite before configuring MFA.");
  let user = await account.get();
  if (user.mfa) return mfaChallenge();
  let a = await account.createMfaAuthenticator({ type: "totp" });
  formModal(
    "mfaVerifyForm",
    T("auth.setup", "Set up authenticator"),
    `<p>${L("auth.secretHelp", "Add this secret to your authenticator app, then enter the generated code. Keep it private.")}</p><code>${esc(a.secret)}</code>${input("code", T("auth.code", "Authenticator code"), "", "text", 'autocomplete="one-time-code" required')}`,
  );
}
async function init() {
  try {
    if (!slug && !isMainAdmin) {
      $("#app").innerHTML =
        `<main class="customer"><h1>Page not found</h1><a href="/admin">Main admin sign-in</a></main>`;
      return;
    }
    if (demo) {
      $("#banner").hidden = false;
      $("#banner").textContent =
        "LOCAL DEMO — sample data in memory. Not connected to Appwrite.";
    } else {
      client = new Appwrite.Client()
        .setEndpoint(PLATFORM_CONFIG.endpoint)
        .setProject(PLATFORM_CONFIG.projectId);
      account = new Appwrite.Account(client);
      functions = new Appwrite.Functions(client);
    }
    device = read("device", null);
    if (!device) {
      device = {
        device: crypto.randomUUID(),
        deviceToken: Array.from(
          crypto.getRandomValues(new Uint8Array(32)),
          (b) => b.toString(16).padStart(2, "0"),
        ).join(""),
      };
      write("device", device);
    }
    if (screen === "menu") {
      await refresh();
      let q = new URLSearchParams(location.search);
      visit = read("visit", null);
      if (visit?.expires < Date.now()) visit = null;
      if (q.has("qr") && q.has("table")) {
        visit = await api("openVisit", {
          ...device,
          qr: q.get("qr"),
          table: q.get("table"),
          info: navigator.userAgent,
        });
        if (visit.blocked) {
          visit = null;
          throw Error(
            T(
              "device.denied",
              "This browser has been blocked by restaurant staff.",
            ),
          );
        }
        write("visit", visit);
      }
      render();
    } else {
      try {
        await refresh(true);
      } catch (err) {
        role = "";
        try {
          if (isMainAdmin) throw err;
          let pub = await api("public");
          data = pub;
          config = mergeConfig(pub.config);
        } catch {}
        render();
        toast(err.message);
      }
    }
    setInterval(async () => {
      if (
        document.hidden ||
        (isMainAdmin && !role) ||
        $("#modal").open ||
        dirty ||
        busy ||
        cart.size ||
        document.activeElement?.matches("input,textarea,select")
      )
        return;
      try {
        await refresh();
      } catch (err) {
        $("#banner").hidden = false;
        $("#banner").textContent = T(
          "connection.failed",
          "Connection interrupted. Showing the last received data.",
        );
      }
    }, isMainAdmin ? 5000 : 10000);
  } catch (err) {
    $("#app").innerHTML =
      `<div class="customer"><h1>${L("connection.setup", "Connection needs attention")}</h1><p>${esc(err.message)}</p><p>${L("connection.guide", "Finish Appwrite setup using the included README. This project does not silently switch to demo data.")}</p></div>`;
  }
}
setInterval(() => {
  if (
    screen === "menu" ||
    !role ||
    document.hidden ||
    Date.now() - lastRing < config.behavior.ringSeconds * 1000
  )
    return;
  let kind = (data.requests || []).some((r) => r.status === "Pending")
    ? "requests"
    : (data.orders || []).some((o) => o.status === "Pending")
      ? "orders"
      : null;
  if (kind) {
    lastRing = Date.now();
    ring(false, kind);
  }
}, 1000);
window.addEventListener("beforeunload", (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
init();

function dishSalesHTML() {
  let list = (data.orders || [])
    .filter((o) => o.status === "Served" && o.created > data.dishReset)
    .flatMap((o) => o.items);
  return `<div class="grid">${statsTable(
    T("report.units", "Dish units sold"),
    breakdown(
      list,
      (i) => i.name,
      (i) => i.qty,
    ),
    false,
  )}${statsTable(
    T("report.dishes", "Dish revenue"),
    breakdown(
      list,
      (i) => i.name,
      (i) => i.subtotal,
    ),
  )}</div>`;
}

function staffItemCards() {
  return (
    filteredItems()
      .map(
        (i) =>
          `<article class="card dish">${on("photos") && i.image ? `<img src="${esc(i.image)}" alt="${esc(i.name)}" loading="lazy">` : ""}<small>${esc(i.category)} · ${L(i.veg ? "diet.veg" : "diet.nonveg", i.veg ? "Vegetarian" : "Non-vegetarian")}</small><h3>${esc(i.name)}</h3>${i.recommended && on("recommended") ? `<span class="badge">${L("menu.recommended", "Recommended")}</span>` : ""}${i.bestSeller && on("bestSellers") ? `<span class="badge">${L("menu.bestSeller", "Best seller")}</span>` : ""}<p class="description">${esc(i.description)}</p>${(i
            .sizes.length
            ? i.sizes
            : [
                {
                  id: null,
                  label: T("menu.standard", "Standard"),
                  price: i.price,
                },
              ]
          )
            .map((s) => {
              let key = JSON.stringify([i.id, s.id]),
                qty = cart.get(key)?.qty || 0,
                left = stockLeft(i, s.id);
              return `<div class="line"><div>${i.sizes.length ? `<b>${esc(s.label)}</b><br>` : ""}<span class="price">${money(s.price)}</span>${left <= 0 ? `<small> · ${L("menu.soldOut", "Sold out")}</small>` : ""}</div>${on("cart") || manual ? `<div class="stepper">${qty ? B("qty", "cart.minus", "−", `data-id="${esc(i.id)}" data-size="${esc(s.id || "")}" data-delta="-1"`) : ""}${qty ? `<b>${qty}</b>` : ""}${B("qty", qty ? "cart.plus" : "cart.add", qty ? "+" : "Add", `data-id="${esc(i.id)}" data-size="${esc(s.id || "")}" data-delta="1" ${left <= qty ? "disabled" : ""}`, true)}</div>` : ""}</div>`;
            })
            .join("")}</article>`,
      )
      .join("") ||
    `<p class="empty">${L("menu.empty", "No dishes match these filters.")}</p>`
  );
}
function icon(name) {
  return `<svg class="ui-icon" aria-hidden="true"><use href="/assets/icons.svg#${name}"></use></svg>`;
}
function appearanceButton(action, key, fallback, ico, cls) {
  return B(action, key, fallback, `class="${cls}"`).replace(
    "<span data-i18n=",
    icon(ico) + "<span data-i18n=",
  );
}
function categoryLabel(c) {
  return c === "All"
    ? T("category.all", "All")
    : c === "Best Sellers"
      ? T("category.best", "Best Sellers")
      : c === "Recommended"
        ? T("category.recommended", "Recommended")
        : c;
}
function originalNavigation() {
  let order = [
      "orders",
      "billing",
      "records",
      "analytics",
      "requests",
      "tables",
      "devices",
      "menuEditor",
      "stocks",
      "customize",
      "notifications",
      ...(role === "owner" ? ["platform"] : []),
    ],
    names = {
      orders: "Pending Orders",
      billing: "Billing",
      records: "Order Records",
      analytics: "Dashboard",
      requests: "Requests",
      tables: "Tables",
      devices: "Customer devices",
      menuEditor: "Menu",
      stocks: "Stocks",
      customize: "Management",
      notifications: "Notifications",
      platform: "Platform",
    },
    icons = {
      orders: "clipboard",
      records: "history",
      analytics: "grid",
      requests: "chat",
      tables: "plate",
      devices: "device",
      menuEditor: "book",
      stocks: "grid",
      customize: "settings",
      notifications: "bell",
      platform: "settings",
    };
  return `<nav id="managerNav" class="nav-tabs" aria-label="${esc(T("staff.navigation", "Staff navigation"))}">${order
    .filter(allowedTab)
    .map((k) => {
      let count =
        k === "orders"
          ? (data.orders || []).filter((o) =>
              ["Pending", "Cooking", "Ready"].includes(o.status),
            ).length
          : k === "requests"
            ? (data.requests || []).filter((r) => r.status === "Pending").length
            : k === "notifications"
              ? (data.notices || []).filter((n) => !n.read).length
              : null;
      return B(
        "tab",
        "nav." + k,
        names[k],
        `data-tab="${k}" class="nav-tab-btn ${tab === k || (tab === "dishSales" && k === "records") ? "active" : ""}"`,
      )
        .replace(
          "<span data-i18n=",
          (icons[k] ? icon(icons[k]) : "") + "<span data-i18n=",
        )
        .replace(
          "</span></button>",
          `${count !== null ? " (" + count + ")" : ""}</span></button>`,
        );
    })
    .join("")}</nav>`;
}
function originalSectionID(t) {
  return (
    {
      orders: "liveSection",
      records: "historySection",
      analytics: "dashboardSection",
      requests: "requestsSection",
      menuEditor: "menuSection",
      customize: "managementSection",
      tables: "tablesSection",
      devices: "devicesSection",
      stocks: "stocksSection",
      notifications: "notificationsSection",
      billing: "billingSection",
    }[t] || "platformSection"
  );
}
function checkoutHTML() {
  let t = totals();
  return `<div class="drawer-header"><div><h2>${L("cart.title", "Your order")}</h2><p class="cart-table-label">${esc(visit?.table || "")}</p></div></div><div class="drawer-body"><div class="cart-lines">${[...cart.values()].map((l) => `<div class="cart-item-row"><div><strong>${esc(l.name)} ${esc(l.label)}</strong><p>${money(l.price)}</p></div><div class="cart-item-stepper">${B("qty", "cart.minus", "−", `data-id="${esc(l.id)}" data-size="${l.size || ""}" data-delta="-1"`)}<span>${l.qty}</span>${B("qty", "cart.plus", "+", `data-id="${esc(l.id)}" data-size="${l.size || ""}" data-delta="1"`)}</div><b>${money(l.price * l.qty)}</b></div>`).join("")}</div><div class="order-form-section">${on("customerName") ? `<div class="form-group"><label for="customerName">${L("cart.name", "Your Name (Optional)")}</label><input id="customerName" maxlength="80" autocomplete="name" placeholder="${esc(T("cart.namePlaceholder", "Enter your name (optional)"))}"></div>` : ""}${on("notes") ? `<div class="form-group"><label for="customerNotes">${L("cart.notes", "Special Instructions for Kitchen")}</label>${on("noteChips") ? `<div class="note-chips">${["Less spicy", "No onion", "Extra cheese"].map((v, i) => B("note", "notes." + i, v, `data-note="${esc(T("notes." + i, v))}"`)).join("")}</div><p class="note-hint">${L("cart.extras", "Extras may cost more. Confirm with staff.")}</p>` : ""}<textarea id="customerNotes" maxlength="1000" rows="2"></textarea></div>` : ""}</div><div class="bill-summary"><div class="bill-row"><span>${L("bill.subtotal", "Items Subtotal")}</span><b>${money(t.subtotal)}</b></div>${t.tax ? `<div class="bill-row"><span>${L("bill.tax", "Tax")}</span><b>${money(t.tax)}</b></div>` : ""}<div class="bill-row total"><span>${L("bill.total", "Total to Pay")}</span><b>${money(t.total)}</b></div></div></div><div class="drawer-footer">${B("submit", "cart.place", "Place Order", `class="btn-place-order" ${!cart.size || !visit ? "disabled" : ""}`, true)}${read("pending", null) ? B("retry", "order.retry", "Retry original submission") : ""}</div>`;
}

// Platform-owner workspace. No tenant configuration or slug is needed to enter.
function mainAdminURL() {
  return siteConfig.ownerURL ? new URL("/admin",siteConfig.ownerURL).href : "/admin" + (demo ? "?demo=1" : "");
}
function restaurantURL(r, destination = "admin", view = "") {
  const url = new URL(
    "/r/" + encodeURIComponent(r.slug) + "/" + destination,
    r.hosting?.origin || location.origin,
  );
  if (demo) url.searchParams.set("demo", "1");
  if (view) url.searchParams.set("view", view);
  return url;
}
async function copyURL(value) {
  try {
    await navigator.clipboard.writeText(value);
    toast(T("owner.copied", "URL copied."));
  } catch {
    modal(
      `<h2>${L("owner.copyTitle", "Copy this URL")}</h2><label>${L("owner.url", "Website URL")}<input class="owner-copy-value" readonly value="${esc(value)}"></label>`,
    );
    $(".owner-copy-value").select();
  }
}
function ownerHeader() {
  return `<header class="owner-header"><a class="owner-brand" href="${esc(mainAdminURL())}"><span class="owner-mark" aria-hidden="true">${icon("grid")}</span><span><strong>${L("owner.platformName", "Restaurant Platform")}</strong><small>${L("owner.workspace", "Main admin workspace")}</small></span></a>${role === "owner" ? `<div class="owner-header-tools"><span class="owner-role">${L("owner.role", "Platform owner")}</span>${B("logout", "auth.signOut", "Sign out")}</div>` : `<span class="owner-role">${L("owner.secure", "Owner access only")}</span>`}</header>`;
}
function renderOwnerConsole() {
  if (role !== "owner") {
    $("#app").innerHTML =
      `${ownerHeader()}<main class="owner-main owner-login-main"><section class="owner-login panel"><p class="owner-eyebrow">${L("owner.signInEyebrow", "YOUR PLATFORM. ALL RESTAURANTS.")}</p><h1>${L("owner.signInTitle", "Main admin sign-in")}</h1><p>${L("owner.signInHelp", "Sign in with your Appwrite platform-owner account to manage all restaurants. Restaurant staff cannot access this workspace.")}</p><form id="loginForm"><label>${L("auth.email", "Email")}<input name="email" type="email" autocomplete="username" required></label><label>${L("auth.password", "Password")}<input name="password" type="password" autocomplete="current-password" required></label><button class="primary primary-btn" type="submit">${L("owner.signIn", "Sign in to main admin")}</button>${B("mfa", "auth.authenticator", "Authenticator options")}${B("logout", "owner.switchAccount", "Sign out / switch account")}</form><p class="owner-mfa-note">${L("owner.mfaHelp", "After password sign-in, complete authenticator verification. For first-time enrollment, use Authenticator options.")}</p><p id="loginError" class="danger" role="alert">${esc(ownerError)}</p></section></main>`;
    return;
  }
  $("#app").innerHTML =
    `${ownerHeader()}<main class="owner-main"><div class="owner-page-heading"><div><p class="owner-eyebrow">${L("owner.eyebrow", "PLATFORM OVERVIEW")}</p><h1>${L("owner.title", "All restaurants")}</h1><p>${L("owner.intro", "Create restaurants, open their dashboards and manage what each restaurant can use.")}</p></div><div class="owner-heading-actions">${B("refresh", "common.refresh", "Refresh")}${B("provision", "platform.create", "Create restaurant", "", true)}</div></div><div class="owner-summary"><div><span>${L("owner.total", "Restaurants added")}</span><strong>${ownerRestaurants.length}</strong></div><p>${L("owner.shared", "One shared app. Separate restaurant settings and data.")}</p></div><div class="owner-list-tools"><label for="ownerSearch">${L("owner.search", "Find a restaurant")}</label><input id="ownerSearch" type="search" value="${esc(ownerQuery)}" placeholder="${esc(T("owner.searchPlaceholder", "Search by restaurant name or URL slug"))}"></div><div id="ownerList" aria-live="polite"></div><aside class="owner-url-note"><h2>${L("owner.howURLs", "How restaurant URLs work")}</h2><p>${L("owner.urlHelp", "Enter a restaurant name. Appwrite creates its separate website from the shared codebase. Copy menu, dashboard and kitchen links when the status is Ready.")}</p><p>${L("owner.notHosting", "Each managed website uses an automatic Appwrite HTTPS address. Dashboard and kitchen links require authorized staff sign-in. Custom domains are optional and are not registered by this action.")}</p></aside></main>`;
  renderOwnerList();
}
function renderOwnerList() {
  const target = $("#ownerList");
  if (!target) return;
  const q = ownerQuery.trim().toLowerCase();
  const list = ownerRestaurants
    .filter((r) =>
      [r.name, r.slug].some((v) => String(v).toLowerCase().includes(q)),
    )
    .sort(
      (a, b) =>
        Number(b.created) - Number(a.created) || a.slug.localeCompare(b.slug),
    );
  target.innerHTML = `<p class="owner-list-count">${list.length} ${L("owner.matching", "restaurants shown")}</p><div class="owner-restaurants">${list.map(ownerRestaurantCard).join("") || `<div class="owner-empty panel"><h2>${ownerRestaurants.length ? "No matching restaurants" : "Your first restaurant starts here"}</h2><p>Choose Create restaurant and enter its name. Its permanent ID, URL slug and website are created automatically.</p></div>`}</div>`;
}
function ownerRestaurantCard(r) {
  const ready=r.status === "active" && (!r.hosting || r.hosting.status === "ready");
  const states={queued:"Queued",creating:"Creating website",deploying:"Deploying",configuring_access:"Configuring secure access",retrying:"Retrying",failed:"Needs attention",ready:"Ready"};
  const status=r.status!=="active" ? "Unavailable" : r.hosting ? states[r.hosting.status] || "Preparing" : "Existing shared website";
  const linkRow=(label,destination)=>{
    const url=restaurantURL(r,destination).href;
    return `<div class="owner-url-row"><label>${esc(label)}<input readonly aria-label="${esc(label)}" value="${esc(url)}"></label><button type="button" data-action="copyRestaurantURL" data-url="${esc(url)}">Copy link</button></div>`;
  };
  const central=new URL('/r/'+encodeURIComponent(r.slug)+'/admin',location.origin);
  if(demo) central.searchParams.set('demo','1');
  return `<article class="owner-restaurant" data-restaurant="${esc(r.slug)}"><div class="owner-card-heading"><div><h2>${esc(r.name)}</h2><p class="owner-slug">${esc(r.slug)}</p><p class="owner-restaurant-id">Restaurant ID: <code>${esc(r.restaurant_id || r.id)}</code></p></div><span class="badge">${esc(status)}</span></div>
    ${r.hosting && !ready ? `<div class="owner-site-progress" role="status"><p>${esc(r.hosting.message || "Preparing the restaurant’s own Appwrite website. Links will appear after deployment and sign-in access are configured.")}</p>${r.hosting.status === 'failed' ? `<button type="button" data-action="retrySite" data-slug="${esc(r.slug)}">Retry website setup</button>` : '<progress aria-label="Website setup in progress"></progress>'}</div>` : ''}
    <div class="owner-card-actions"><a class="button" href="${esc(central.href)}">Customize restaurant</a>${ready ? `<a class="button primary primary-btn" href="${esc(restaurantURL(r).href)}">Open dashboard</a>` : ''}${!r.hosting ? `<button type="button" data-action="attachSite" data-slug="${esc(r.slug)}">Create separate Appwrite website</button>` : ''}</div>
    ${ready ? linkRow('Customer menu URL','menu')+linkRow('Restaurant dashboard URL','admin')+linkRow('Kitchen URL','kitchen')+'<p class="muted">Menu is public. Dashboard and kitchen require staff sign-in and restaurant membership. Assign the client an account under Management before sharing access.</p>' : ''}</article>`;

}
function showRestaurantURLs(r) {
  modal(
    `<h2>${L("owner.ready", "Your restaurant URLs are ready")}</h2><p><strong>${esc(r.name)}</strong></p><label>${L("owner.menuURL", "Customer menu URL")}<input readonly value="${esc(restaurantURL(r, "menu").href)}"></label><div class="toolbar">${B("copyRestaurantURL", "owner.copyMenu", "Copy menu URL", `data-url="${esc(restaurantURL(r, "menu").href)}"`)}</div><label>${L("owner.adminURL", "Restaurant admin URL")}<input readonly value="${esc(restaurantURL(r).href)}"></label><div class="toolbar">${B("copyRestaurantURL", "owner.copyAdmin", "Copy admin URL", `data-url="${esc(restaurantURL(r).href)}"`)}<a class="button primary primary-btn" href="${esc(restaurantURL(r).href)}">${L("owner.open", "Open restaurant")}</a></div><p>${L("owner.qrHelp", "Next: add dishes, configure this restaurant, then create table QR codes under Tables.")}</p>`,
  );
}
async function afterSignIn() {
  await refresh(true);
  // Stay on the restaurant dashboard after signing in; owner console has its own link.
}
