// Local-only visual/position audit; requires npm run dev and Playwright.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_BIN || "/usr/local/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } }),
  base = "http://127.0.0.1:8744";
let checks = [];
try {
  await p.goto(base + "/r/demo-cafe/admin?demo=1");
  await p.locator('[data-tab="requests"]').first().click();
  let r = await p.evaluate(() => ({
    nav: document.querySelector("#managerNav").getBoundingClientRect().toJSON(),
    main: document.querySelector("#staffMain").getBoundingClientRect().toJSON(),
    banner: document.querySelector("#banner").getBoundingClientRect().toJSON(),
  }));
  assert.ok(
    r.nav.left === 0 && r.main.left >= 200 && r.nav.top >= r.banner.bottom - 1,
  );
  checks.push(
    "Desktop navigation is left of main content and clear of the demo banner",
  );
  let d = await p.evaluate(
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
  let t = d.tables[0];
  await p.goto(
    base + "/r/demo-cafe/menu?demo=1&table=" + t.number + "&qr=" + t.qr,
  );
  await p.locator("#dishGrid").waitFor();
  assert.ok((await p.locator("#dishGrid").boundingBox()).width <= 800);
  checks.push("Desktop customer menu retains the original compact width");
  for (let size of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await p.setViewportSize(size);
    let q = p.locator('#dishGrid [data-action="qty"]');
    for (let i = 0; i < (await q.count()); i++) await q.nth(i).click();
    await p.locator('[data-action="checkout"]').click();
    let btn = await p.locator('#modal [data-action="submit"]').boundingBox();
    assert.ok(btn.y >= 0 && btn.y + btn.height <= size.height + 1);
    await p
      .locator('#modal [data-action="submit"]')
      .isVisible()
      .then((v) => assert.ok(v));
    await p
      .locator("#modal .drawer-body")
      .evaluate((e) => (e.scrollTop = e.scrollHeight));
    assert.ok(await p.locator("#modalClose").isVisible());
    await p.screenshot({
      path: "docs/checkout-" + size.width + "-multiple-items.png",
      fullPage: false,
    });
    checks.push(
      "Long checkout stays scrollable with visible submit/close at " +
        size.width +
        "px",
    );
    await p.locator("#modalClose").click();
  }
  fs.writeFileSync(
    "docs/layout-test-results.txt",
    checks.map((x) => "PASS " + x).join("\n") + "\n",
  );
  console.log(checks.join("\n"));
} finally {
  await b.close();
}
