import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
const b = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_BIN || "/usr/local/bin/chromium",
  args: ["--no-sandbox"],
});
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
let checks = [];
try {
  for (let route of ["admin", "menu"]) {
    await p.goto("http://127.0.0.1:8744/r/demo-cafe/" + route + "?demo=1");
    await p.locator(route === "admin" ? "#managerNav" : "#dishGrid").waitFor();
    await p.evaluate(() => {
      document.body.classList.add("rp-custom-palette", "rp-custom-font");
      for (let [k, v] of Object.entries({
        background: "#101828",
        surface: "#182230",
        raised: "#253b50",
        text: "#eaf2ff",
        muted: "#b5c3d8",
        accent: "#2563eb",
        accentText: "#ffffff",
        border: "#718096",
        font: "Verdana",
      }))
        document.documentElement.style.setProperty("--" + k, v);
    });
    await p.waitForFunction(() =>
      [...document.querySelectorAll("link[rel=stylesheet]")].every(
        (l) => l.sheet,
      ),
    );
    await p.waitForTimeout(350);
    let s = route === "admin" ? "#managerNav .active" : ".cat-btn.active";
    assert.equal(
      await p.locator(s).evaluate((e) => getComputedStyle(e).backgroundColor),
      "rgb(37, 99, 235)",
    );
    assert.equal(
      await p
        .locator("header")
        .evaluate((e) => getComputedStyle(e).backgroundColor),
      "rgb(24, 34, 48)",
    );
    assert.match(
      await p
        .locator("header h1")
        .evaluate((e) => getComputedStyle(e).fontFamily),
      /Verdana/,
    );
    await p.screenshot({
      path: "docs/custom-theme-" + route + ".png",
      fullPage: false,
    });
    checks.push(
      route +
        " selected accent, header surface and font override the reference theme",
    );
  }
  fs.writeFileSync(
    "docs/theme-test-results.txt",
    checks.map((x) => "PASS " + x).join("\n") + "\n",
  );
  console.log(checks.join("\n"));
} finally {
  await b.close();
}
