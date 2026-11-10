import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { accept, addUser, as, createRestaurant, issue } from './fixture.js';
import { startFixture } from './http-fixture.js';

test('owner provisions a restaurant, invites a client, and tenant navigation denies edited URLs', { timeout: 70_000 }, async t => {
  const fixture = await startFixture({ dist: true });
  t.after(() => fixture.close());
  const { db, url } = fixture;
  const owner = await addUser(db, 'owner@example.invalid', { name: 'Platform owner', owner: true, aal: 'aal2' });
  const staff = await addUser(db, 'staff@example.invalid');
  const outside = await createRestaurant(db, owner, 'night-market', 'Night Market');
  fixture.login(owner);
  fixture.login(staff);

  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
  t.after(() => browser.close());
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const ownerPage = await desktop.newPage();
  const clientPage = await mobile.newPage();
  const errors = [];
  for (const page of [ownerPage, clientPage]) {
    page.setDefaultTimeout(10_000);
    page.on('pageerror', problem => errors.push(problem.message));
    page.on('console', message => {
      if (/content security policy/i.test(message.text())) errors.push(message.text());
    });
  }
  async function heading(page, name) {
    try { await page.getByRole('heading', { name, exact: true }).waitFor(); }
    catch (error) { throw new Error(`Expected ${name} at ${new URL(page.url()).pathname}. Page text: ${(await page.locator('body').innerText()).slice(0, 500)}`, { cause: error }); }
  }
  async function login(page, user) {
    await page.getByLabel('Email address').fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill('fixture-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  }
  const capture = (page, file) => process.env.QA_SCREENSHOTS_DIR && page.screenshot({ path: `${process.env.QA_SCREENSHOTS_DIR}/${file}.png`, fullPage: true });

  await ownerPage.goto(`${url}/owner`);
  await heading(ownerPage, 'Platform owner sign-in');
  await login(ownerPage, owner);
  await heading(ownerPage, 'Welcome back');
  await ownerPage.getByRole('link', { name: 'Add restaurant' }).click();
  await ownerPage.getByLabel('Restaurant name').fill('Maple and Ember');
  await ownerPage.getByLabel('Permanent URL slug').fill('maple-ember');
  await ownerPage.getByRole('button', { name: 'Create restaurant', exact: true }).click();
  await heading(ownerPage, 'Team & invitations');
  await ownerPage.getByLabel('Email address').fill(staff.email);
  await ownerPage.getByRole('button', { name: 'Create invitation', exact: true }).click();
  const link = await ownerPage.getByLabel('Private invitation link').inputValue();
  assert.equal(new URL(link).pathname, '/accept');
  await clientPage.goto(link);
  await heading(clientPage, 'Restaurant sign-in');
  await login(clientPage, staff);
  await heading(clientPage, 'Accept your invitation');
  await clientPage.getByLabel('Full name').fill('Floor staff');
  await clientPage.getByRole('button', { name: 'Accept invitation' }).click();
  await heading(clientPage, 'Maple and Ember');
  assert.equal(new URL(clientPage.url()).pathname, '/r/maple-ember/');
  assert.equal(await clientPage.getByRole('link', { name: 'Team & invitations' }).count(), 0);
  assert.equal(await clientPage.evaluate(() => document.documentElement.scrollWidth === innerWidth), true);
  await capture(clientPage, 'restaurant-mobile');

  await ownerPage.getByRole('link', { name: 'Restaurant profile', exact: true }).click();
  await heading(ownerPage, 'Maple and Ember');
  await ownerPage.getByLabel('App short name').fill('Maple');
  await ownerPage.getByLabel('Slogan').fill('Seasonal food, served simply');
  await ownerPage.getByRole('button', { name: 'Save branding' }).click();
  await ownerPage.getByText('Seasonal food, served simply', { exact: true }).waitFor();
  await capture(ownerPage, 'restaurant-profile');
  assert.equal(await ownerPage.locator('link[rel="manifest"]').getAttribute('href'), '/r/maple-ember/manifest.webmanifest');

  await clientPage.goto(`${url}/r/${outside.slug}/`);
  await heading(clientPage, 'Restaurant unavailable');
  assert.equal(await clientPage.getByText('Night Market', { exact: true }).count(), 0);
  assert.equal(await clientPage.locator('link[rel="manifest"]').count(), 0);
  await clientPage.goto(`${url}/owner`);
  await heading(clientPage, 'Platform access unavailable');
  await clientPage.goto(`${url}/r/maple-ember/team`);
  await heading(clientPage, 'Team access unavailable');
  await clientPage.goto(`${url}/`);
  await heading(clientPage, 'Maple and Ember');

  await accept(db, staff, await issue(db, owner, outside.id, staff.email));
  await clientPage.goto(`${url}/`);
  await heading(clientPage, 'Choose a restaurant');
  await capture(clientPage, 'restaurant-selector-mobile');
  await clientPage.getByRole('link', { name: /Night Market/ }).click();
  await heading(clientPage, 'Night Market');
  await clientPage.evaluate(() => navigator.serviceWorker.ready);
  assert.equal(await clientPage.evaluate(() => navigator.serviceWorker.getRegistrations().then(list => list.map(worker => new URL(worker.scope).pathname).sort()).then(list => list.join(','))), '/r/maple-ember/,/r/night-market/');
  await mobile.setOffline(true);
  await clientPage.reload();
  await heading(clientPage, 'You’re offline');
  await mobile.setOffline(false);

  await as(db, owner, "update public.restaurants set status='suspended' where id=$1", [outside.id]);
  await clientPage.reload();
  await heading(clientPage, 'Restaurant unavailable');
  await ownerPage.goto(`${url}/owner`);
  await heading(ownerPage, 'Welcome back');
  await capture(ownerPage, 'owner-dashboard');
  await ownerPage.getByRole('link', { name: 'Restaurants', exact: true }).click();
  await ownerPage.getByRole('searchbox', { name: 'Search restaurants' }).fill('Maple');
  await ownerPage.getByRole('button', { name: 'Search', exact: true }).click();
  await ownerPage.getByRole('cell', { name: /^Maple and Ember/ }).waitFor();
  assert.equal(await ownerPage.getByRole('cell', { name: /^Night Market/ }).count(), 0);
  await ownerPage.getByRole('link', { name: 'Users', exact: true }).click();
  await heading(ownerPage, 'User accounts');
  ownerPage.once('dialog', dialog => dialog.accept());
  await ownerPage.getByRole('button', { name: 'Suspend account', exact: true }).click();
  await ownerPage.getByRole('button', { name: 'Restore account', exact: true }).waitFor();
  await clientPage.goto(`${url}/r/maple-ember/`);
  await heading(clientPage, 'Account access unavailable');
  await ownerPage.getByRole('link', { name: 'Audit activity', exact: true }).click();
  await heading(ownerPage, 'Audit activity');
  await ownerPage.getByText('Branding updated', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
});
