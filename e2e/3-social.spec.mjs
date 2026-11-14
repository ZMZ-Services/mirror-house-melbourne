// Social media icons: shown only when their link is set in Admin → Settings, with safe links and labels,
// and added to the page's schema.org data.
import { test, expect } from '@playwright/test';
import { sql, mockIdentity, signIn } from './helpers.mjs';

const IG = 'https://www.instagram.com/mirrorhousemelbourne/';
const setLinks = (ig, fb) => sql("UPDATE settings SET value = value || jsonb_build_object('instagram', $1::text, 'facebook', $2::text) WHERE key = 'store'", [ig, fb]);
const sameAs = (page) => page.evaluate(() => {
  const d = JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent);
  return (d['@graph'].find((n) => n['@type'] === 'Organization') || {}).sameAs || null;
});

test.afterAll(() => setLinks(IG, ''));
// The shop's settings script is cached for a minute, as on the live site, so each check opens a fresh browser.
async function fresh(browser, info) { const ctx = await browser.newContext(info.project.use); return ctx.newPage(); }

test('Instagram shows by default; Facebook is hidden until it\'s set', async ({ page }, info) => {
  await setLinks(IG, '');
  await page.goto('/');
  const ig = page.locator('.footer-social a.social-instagram');
  await expect(ig).toBeVisible();
  await expect(ig).toHaveAttribute('href', IG);
  await expect(ig).toHaveAttribute('target', '_blank');
  await expect(ig).toHaveAttribute('rel', /noopener/);
  await expect(ig).toHaveAttribute('aria-label', 'Mirror House on Instagram (opens in a new tab)');
  await expect(page.locator('.social-facebook')).toHaveCount(0);
  // Header icon on wider screens only
  if (info.project.name === 'desktop') await expect(page.locator('.header-social a.social-instagram')).toBeVisible();
  else await expect(page.locator('.header-social')).toBeHidden();
  expect(await sameAs(page)).toEqual([IG]);
  // Other pages too
  await page.goto('/product.html?slug=soho-slim-frame-mirror-black');
  await expect(page.locator('.footer-social a.social-instagram')).toBeVisible();
});

test('both links set: both icons; both empty: no icons and no sameAs', async ({ browser }, info) => {
  await setLinks(IG, 'https://www.facebook.com/mirrorhousemelbourne');
  let page = await fresh(browser, info);
  await page.goto('/');
  await expect(page.locator('.footer-social a')).toHaveCount(2);
  await expect(page.locator('.footer-social a.social-facebook')).toHaveAttribute('aria-label', 'Mirror House on Facebook (opens in a new tab)');
  expect(await sameAs(page)).toEqual([IG, 'https://www.facebook.com/mirrorhousemelbourne']);
  await setLinks('', '');
  page = await fresh(browser, info);
  await page.goto('/');
  await expect(page.locator('.footer-social')).toHaveCount(0);
  await expect(page.locator('.header-social')).toHaveCount(0);
  expect(await sameAs(page)).toBeNull();
});

test('set in the admin, the Facebook icon appears in the shop', async ({ page, browser }, info) => {
  await setLinks(IG, '');
  await mockIdentity(page);
  await page.goto('/admin-dashboard.html');
  await signIn(page);
  await expect(page.locator('#app')).toBeVisible();
  await page.goto('/admin-dashboard.html#/settings');
  await expect(page.locator('#so-ig')).toHaveValue(IG);
  await page.locator('#so-fb').fill('not a link');
  await page.locator('#f-social button[type="submit"]').click();
  await expect(page.locator('#so-msg')).toContainText('Facebook page address');
  await page.locator('#so-fb').fill('facebook.com/mirrorhousemelbourne');
  const saved = page.waitForResponse((r) => r.url().endsWith('/api/admin/sync') && r.status() === 200);
  await page.locator('#f-social button[type="submit"]').click();
  await saved;
  const shop = await fresh(browser, info);
  await shop.goto('/');
  await expect(shop.locator('.footer-social a.social-facebook')).toHaveAttribute('href', 'https://www.facebook.com/mirrorhousemelbourne');
});
