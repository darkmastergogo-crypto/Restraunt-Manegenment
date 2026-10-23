const sheets = {
  menu: [
    "menu-base.css",
    "menu-theme.css",
    "order-celebration.css",
    "yaar-theme.css",
    "dark-theme.css",
    "device-layouts.css",
    "yummy-momo.css",
    "menu-customization.css",
    "release42.css",
    "release43.css",
    "table-names.css",
  ],
  admin: [
    "admin-base.css",
    "call-requests.css",
    "tables.css",
    "request-ring.css",
    "yaar-theme.css",
    "dark-theme.css",
    "device-layouts.css",
    "analytics.css",
    "yummy-momo.css",
    "menu-customization.css",
    "release38.css",
    "release39.css",
    "release42.css",
    "release43.css",
    "table-names.css",
  ],
  waiter: [
    "waiter-base.css",
    "waiter.css",
    "call-requests.css",
    "request-ring.css",
    "yaar-theme.css",
    "dark-theme.css",
    "device-layouts.css",
    "yummy-momo.css",
    "menu-customization.css",
    "release38.css",
    "release39.css",
    "release43.css",
    "table-names.css",
  ],
};
export function installOriginalAppearance(screen) {
  for (let name of ["fonts.css", ...(sheets[screen] || sheets.admin)]) {
    let link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/original/" + name;
    document.head.append(link);
  }
  let adapter = document.createElement("link");
  adapter.rel = "stylesheet";
  adapter.href = "/appearance.css";
  document.head.append(adapter);
  let modern = document.createElement("link");
  modern.rel = "stylesheet";
  modern.href = "/modern-shell.css";
  document.head.append(modern);
}
