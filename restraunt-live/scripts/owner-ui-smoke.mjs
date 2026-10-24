// Optional local-only browser test; requires Playwright + Chromium and npm run dev.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_BIN || "/usr/local/bin/chromium",
  args: ["--no-sandbox"],
});
const base = "http://127.0.0.1:8744",
  errors = [],
  checks = [];
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
const noOverflow = async (label) => {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    label,
  );
  checks.push(label);
};
try {
  await page.goto(base + "/admin?demo=1");
  await page
    .getByRole("heading", { name: "All restaurants", exact: true })
    .waitFor();
  assert.ok((await page.locator(".owner-restaurant").count()) >= 2);
  await noOverflow("main admin desktop fits");
  await page.screenshot({
    path: "docs/main-admin-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Create restaurant", exact: true })
    .click();
  await page.screenshot({ path: "docs/main-admin-create.png", fullPage: true });
  const slug = "owner-ui-" + Date.now();
  await page.locator('#provisionForm [name="slug"]').fill(slug);
  await page
    .locator('#provisionForm [name="name"]')
    .fill("Owner QA Restaurant");
  await page.locator('#provisionForm button[type="submit"]').click();
  await page
    .getByRole("heading", { name: "Your restaurant URLs are ready" })
    .waitFor();
  assert.equal(new URL(page.url()).pathname, "/admin");
  assert.equal(
    await page.locator("#modal input").first().inputValue(),
    base + "/r/" + slug + "/menu?demo=1",
  );
  await page.screenshot({
    path: "docs/main-admin-created-urls.png",
    fullPage: true,
  });
  await page.locator("#modalClose").click();
  await page.locator("#ownerSearch").fill(slug);
  assert.equal(await page.locator(".owner-restaurant").count(), 1);
  await page.locator("#ownerSearch").fill("No such restaurant xyz");
  await page
    .getByRole("heading", { name: "No matching restaurants" })
    .waitFor();
  await page.locator("#ownerSearch").fill("");
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (v) => {
          window.copiedURL = v;
        },
      },
    });
  });
  await page
    .locator(
      '[data-restaurant="' + slug + '"] [data-action="copyRestaurantURL"]',
    )
    .first()
    .click();
  assert.equal(
    await page.evaluate(() => window.copiedURL),
    base + "/r/" + slug + "/menu?demo=1",
  );
  checks.push("creation stays in main admin; search and copy URLs work");
  await page.waitForTimeout(3300);
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow("main admin mobile fits");
  await page.screenshot({ path: "docs/main-admin-mobile.png", fullPage: true });
  await page
    .locator('[data-restaurant="' + slug + '"] a')
    .filter({ hasText: /^Settings$/ })
    .click();
  await page.locator('[data-setting="brand.name"]').waitFor();
  checks.push("Settings opens selected restaurant directly");
  await page.goto(base + "/r/demo-cafe/admin?demo=1&view=platform");
  await page
    .getByRole("heading", { name: "Features supplied to this restaurant" })
    .waitFor();
  assert.equal(await page.locator('[data-action="provision"]').count(), 0);
  await page
    .getByRole("link", { name: "Main admin · all restaurants", exact: true })
    .first()
    .click();
  await page
    .getByRole("heading", { name: "All restaurants", exact: true })
    .waitFor();
  checks.push(
    "restaurant owner controls have no Create restaurant and link back to main admin",
  );
  await page.route("**/demo-api", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "platform")
      return route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ error: "Platform owner access required." }),
      });
    return route.continue();
  });
  await page.reload();
  await page.getByRole("heading", { name: "Main admin sign-in" }).waitFor();
  assert.equal(await page.locator(".owner-restaurant").count(), 0);
  assert.equal(await page.locator('[data-action="provision"]').count(), 0);
  await noOverflow("main admin sign-in mobile fits");
  await page.waitForTimeout(3300);
  await page.screenshot({
    path: "docs/main-admin-login-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "docs/main-admin-login-desktop.png",
    fullPage: true,
  });
  await page.unroute("**/demo-api");
  await page.route("**/demo-api", async (route) => {
    if (route.request().postDataJSON().action === "platform")
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ data: { restaurants: [] } }),
      });
    return route.continue();
  });
  await page.reload();
  await page
    .getByRole("heading", { name: "Your first restaurant starts here" })
    .waitFor();
  await page.screenshot({ path: "docs/main-admin-empty.png", fullPage: true });
  checks.push(
    "denied response clears restaurant list; empty authorized state renders",
  );
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "docs/main-admin-ui-results.txt",
    checks.join("\n") +
      "\nNo uncaught browser errors. Local demo/mocked error states only; hosted authentication not exercised.\n",
  );
  console.log(checks.join("\n"));
} catch (e) {
  await page.screenshot({
    path: "/data/main-admin-failure.png",
    fullPage: true,
  });
  throw e;
} finally {
  await browser.close();
}
