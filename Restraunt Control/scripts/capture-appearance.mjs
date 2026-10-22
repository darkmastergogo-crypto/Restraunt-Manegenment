import { chromium } from "playwright";
import fs from "node:fs/promises";
const browser = await chromium.launch({
  headless: true,
  executablePath: "/usr/local/bin/chromium",
  args: ["--no-sandbox"],
});
const base = "http://127.0.0.1:8744";
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on("pageerror", (e) => console.log("ERROR", e.message));
await page.goto(base + "/r/demo-cafe/admin?demo=1");
await page.locator('[data-tab="requests"]').first().click();
await page.screenshot({ path: "docs/appearance-requests.png", fullPage: true });
let info = await page.evaluate(
  async () =>
    (
      await (
        await fetch("/demo-api", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "staff", restaurant: "demo-cafe" }),
        })
      ).json()
    ).data,
);
let t = info.tables[0];
await page.goto(
  base + "/r/demo-cafe/menu?demo=1&table=" + t.number + "&qr=" + t.qr,
);
await page.locator("#dishGrid").waitFor();
await page.screenshot({ path: "docs/appearance-menu.png", fullPage: true });
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({
  path: "docs/appearance-menu-mobile.png",
  fullPage: true,
});
await page.locator('[data-action="qty"]').first().click();
await page.locator('[data-action="checkout"]').click();
await page.screenshot({
  path: "docs/appearance-checkout-mobile.png",
  fullPage: true,
});
let key = await page.evaluate(
  async () =>
    (
      await (
        await fetch("/demo-api", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "waiterLink",
            restaurant: "demo-cafe",
          }),
        })
      ).json()
    ).data.key,
);
await page.goto(base + "/r/demo-cafe/waiter?demo=1#key=" + key);
await page.waitForTimeout(800);
await page.screenshot({
  path: "docs/appearance-waiter-mobile.png",
  fullPage: true,
});
await page.setViewportSize({ width: 1440, height: 1000 });
await page.screenshot({ path: "docs/appearance-waiter.png", fullPage: true });
await browser.close();
