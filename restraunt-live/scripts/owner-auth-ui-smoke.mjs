// UI sequencing only: mocked SDK + local demo service. NOT a hosted Appwrite auth test.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_BIN || "/usr/local/bin/chromium",
  args: ["--no-sandbox"],
});
const base = "http://127.0.0.1:8744",
  checks = [];
const sdk = `(() => {
const state=()=>JSON.parse(sessionStorage.getItem('mockAuth')||'{"session":false,"verified":false}');
const save=x=>sessionStorage.setItem('mockAuth',JSON.stringify(x));
class Client {setEndpoint(){return this}setProject(){return this}}
class Account {
 async createEmailPasswordSession(){const s=state();s.session=true;save(s); if(sessionStorage.getItem('mockChallenge')==='1')throw {type:'user_more_factors_required'};return {};}
 async get(){if(!state().session)throw Error('Sign in first.');return {mfa:true};}
 async createMfaChallenge(){return {$id:'mock-challenge'};}
 async updateMfaChallenge(){const s=state();s.verified=true;save(s);return {};}
 async deleteSession(){save({session:false,verified:false});return {};}
}
class Functions {async createExecution({body}){
 const s=state();if(!s.session||!s.verified)return {responseBody:JSON.stringify({ok:false,error:'Authenticator verification required.'})};
 const response=await fetch('/demo-api',{method:'POST',headers:{'Content-Type':'application/json'},body}); const result=await response.json();return {responseBody:JSON.stringify({ok:response.ok,data:result.data,error:result.error})};
}}
window.Appwrite={Client,Account,Functions,AuthenticationFactor:{Totp:'totp'}};
})();`;
try {
  for (const mode of [
    "existing-totp-main",
    "session-then-challenge-main",
    "restaurant-redirect",
  ]) {
    const context = await browser.newContext();
    await context.route("**/vendor/appwrite.js", (r) =>
      r.fulfill({ contentType: "text/javascript", body: sdk }),
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(
      base + (mode === "restaurant-redirect" ? "/r/demo-cafe/admin" : "/admin"),
    );
    await page.locator("#loginForm").waitFor();
    if (mode !== "session-then-challenge-main")
      await page.evaluate(() => sessionStorage.setItem("mockChallenge", "1"));
    await page
      .locator('#loginForm [name="email"]')
      .fill("owner@example.invalid");
    await page
      .locator('#loginForm [name="password"]')
      .fill("local-test-fixture-only");
    await page.locator('#loginForm button[type="submit"]').click();
    if (mode === "session-then-challenge-main") {
      await page
        .locator("#loginError")
        .filter({ hasText: "Authenticator verification required." })
        .waitFor();
      await page.locator('[data-action="mfa"]').click();
    }
    await page.locator("#mfaChallengeForm").waitFor();
    await page.locator('#mfaChallengeForm [name="code"]').fill("123456");
    await page.locator('#mfaChallengeForm button[type="submit"]').click();
    await page
      .getByRole("heading", { name: "All restaurants", exact: true })
      .waitFor();
    assert.equal(new URL(page.url()).pathname, "/admin");
    assert.ok((await page.locator(".owner-restaurant").count()) >= 2);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page.getByRole("heading", { name: "Main admin sign-in" }).waitFor();
    assert.equal(await page.locator(".owner-restaurant").count(), 0);
    await page
      .getByRole("button", { name: "Sign out / switch account", exact: true })
      .click();
    assert.deepEqual(errors, []);
    checks.push("PASS mocked UI sequence: " + mode + "; logout clears list");
    await context.close();
  }
  fs.writeFileSync(
    "docs/main-admin-auth-ui-results.txt",
    checks.join("\n") +
      "\nUses mocked authentication responses; real passwords, TOTP, cookies, hosted JWT and ACLs NOT tested.\n",
  );
  console.log(checks.join("\n"));
} finally {
  await browser.close();
}
