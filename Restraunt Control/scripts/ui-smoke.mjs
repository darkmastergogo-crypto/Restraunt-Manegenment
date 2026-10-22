// Optional local browser smoke test. Requires Playwright + Chromium and npm run dev.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
let bin =
  process.env.CHROMIUM_BIN ||
  execFileSync("which", ["chromium"], { encoding: "utf8" }).trim();
let browser = await chromium.launch({
  headless: true,
  executablePath: bin,
  args: ["--no-sandbox"],
});
const songLabel = "Customer music QA " + Date.now();
let checks = [],
  errors = [];
const base = "http://127.0.0.1:8744",
  slug = "demo-cafe";
let context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  }),
  admin = await context.newPage();
admin.on("pageerror", (e) => errors.push(e.message));
try {
  await admin.goto(base + "/r/" + slug + "/admin?demo=1");
  await admin.locator("#liveSection h2").first().waitFor();
  for (let tab of [
    "billing",
    "records",
    "analytics",
    "requests",
    "tables",
    "devices",
    "menuEditor",
    "stocks",
    "notifications",
    "customize",
    "platform",
  ]) {
    await admin.locator(`[data-tab="${tab}"]`).first().click();
    await admin.locator("#staffMain .page-tools h2").waitFor();
    assert.equal(
      await admin.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      tab + " desktop overflow",
    );
    checks.push(tab + " screen rendered");
  }
  let info = await admin.evaluate(async () => {
      let r = await fetch("/demo-api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "staff", restaurant: "demo-cafe" }),
      });
      return (await r.json()).data;
    }),
    table = info.tables.find((t) => t.number === "T1");
  let customer = await context.newPage();
  customer.on("pageerror", (e) => errors.push(e.message));
  await customer.goto(
    base + "/r/" + slug + "/menu?demo=1&table=T1&qr=" + table.qr,
  );
  await customer
    .getByRole("button", { name: "Request music", exact: true })
    .waitFor();
  await customer.locator('[data-action="qty"]').first().click();
  await customer.locator('[data-action="checkout"]').click();
  await customer.screenshot({
    path: "docs/checkout-desktop.png",
    fullPage: true,
  });
  await customer.locator('[data-action="submit"]').click();
  await customer.waitForFunction(() =>
    document.querySelector("#toast")?.textContent.includes("Order saved"),
  );
  checks.push("QR checkout saved");
  await customer
    .getByRole("button", { name: "Request music", exact: true })
    .click();
  await customer.locator('[name="title"]').fill(songLabel);
  await customer.locator('[name="artist"]').fill("Local QA");
  await customer.locator('#musicForm button[type="submit"]').click();
  await customer.waitForFunction(() => !document.querySelector("#modal").open);
  checks.push("Customer music form submitted");
  await admin.locator('[data-tab="requests"]').first().click();
  await admin.reload();
  await admin.locator('[data-tab="requests"]').first().click();
  await admin.getByRole("heading", { name: songLabel, exact: true }).waitFor();
  await admin.screenshot({ path: "docs/music-requests.png", fullPage: true });
  checks.push("Customer music appeared in kitchen Requests");
  await admin.getByRole("button", { name: "Management", exact: true }).click();
  await admin.getByRole("button", { name: "Visibility", exact: true }).click();
  await admin.locator('[data-visible="music"]').uncheck();
  await admin
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await admin.waitForFunction(
    () =>
      document.querySelector("#toast")?.textContent ===
      "Restaurant settings saved.",
  );
  await customer.reload();
  await customer.waitForTimeout(400);
  assert.equal(
    await customer
      .getByRole("button", { name: "Request music", exact: true })
      .count(),
    0,
  );
  checks.push("Music visibility disabled customer button");
  await admin.locator('[data-visible="music"]').check();
  await admin
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await admin.waitForTimeout(300);
  await admin.getByRole("button", { name: "Brand", exact: true }).click();
  await admin
    .locator('[data-setting="brand.tagline"]')
    .fill("A shared platform. Your own restaurant.");
  await admin
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await admin.waitForTimeout(300);
  await customer.reload();
  await customer
    .getByText("A shared platform. Your own restaurant.", { exact: true })
    .waitFor();
  checks.push("Admin customization propagated to menu");
  await customer.screenshot({
    path: "docs/customer-desktop.png",
    fullPage: true,
  });
  await customer.setViewportSize({ width: 390, height: 844 });
  await customer.screenshot({
    path: "docs/customer-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await customer.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  checks.push("Customer mobile width 390: no page overflow");
  await admin.screenshot({ path: "docs/admin-customize.png", fullPage: true });
  await admin.setViewportSize({ width: 390, height: 844 });
  await admin.screenshot({ path: "docs/admin-mobile.png", fullPage: true });
  assert.equal(
    await admin.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  checks.push("Admin mobile width 390: no page overflow");
  await admin.setViewportSize({ width: 1440, height: 1000 });
  await admin.locator('[data-tab="orders"]').first().click();
  await admin.screenshot({ path: "docs/admin-desktop.png", fullPage: true });
  assert.deepEqual(errors, []);
  checks.push("No uncaught browser exceptions");
  fs.writeFileSync(
    "docs/ui-test-results.txt",
    checks.map((s) => "PASS " + s).join("\n") + "\n",
  );
  console.log(checks.join("\n"));
} catch (e) {
  await admin.screenshot({
    path: "/data/restaurant-ui-failure.png",
    fullPage: true,
  });
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
