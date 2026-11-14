// The shop, end to end: browse, product page, add to bag, checkout and pay, order saved and stock reduced.
import { test, expect } from '@playwright/test';
import { sql } from './helpers.mjs';

const SLUG = 'soho-slim-frame-mirror-black';
const stockOf = async (slug) => (await sql('SELECT stock FROM products WHERE slug = $1', [slug])).rows[0].stock;

async function fillCheckout(page, email) {
  await page.locator('#co-email').fill(email);
  await page.locator('#co-phone').fill('0412 345 678');
  await page.locator('#co-first').fill('Sarah');
  await page.locator('#co-last').fill('Example');
  await page.locator('#co-line1').fill('12 Example St');
  await page.locator('#co-suburb').fill('Point Cook');
  await page.locator('#co-postcode').fill('3030');
}

test('browse, add to bag, pay by card, order saved and stock reduced', async ({ page }, info) => {
  const email = 'shopper-' + info.project.name + '@example.com';
  const before = await stockOf(SLUG);

  await page.goto('/');
  await expect(page).toHaveTitle(/Mirror House Melbourne/);
  const cards = page.locator('.product-card');
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThan(10);

  // Product page
  await page.locator('[data-product-link="' + SLUG + '"]').first().click();
  await expect(page).toHaveURL(/product\.html\?slug=soho-slim-frame-mirror-black/);
  await expect(page.locator('h1')).toContainText('Soho Slim Frame Mirror');
  await expect(page.locator('[data-detail-add="' + SLUG + '"]')).toBeEnabled();

  // Add to bag, then check out from the bag
  await page.locator('[data-detail-add="' + SLUG + '"]').click();
  await expect(page.locator('.cart-count-badge').first()).toHaveText('1');
  await page.goto('/checkout.html');
  await expect(page.locator('#checkout-form')).toBeVisible();

  // The Square card form loads (the test stand-in for Square's form)
  await expect(page.locator('#fake-card')).toBeVisible();
  await fillCheckout(page, email);
  await expect(page.locator('#co-zone')).toContainText('Zone 1 delivery: $49');

  // WELCOME10 is checked with the server (on a phone the order summary starts folded)
  if (!(await page.locator('#co-code').isVisible())) await page.locator('#co-summary > summary').click();
  await page.locator('#co-code').fill('welcome10');
  await page.locator('#co-apply').click();
  await expect(page.locator('#co-code-msg')).toContainText('WELCOME10 applied');
  await expect(page.locator('#co-total')).toHaveText(/^\$274(\.00)?$/); // 250 − 25 + 49

  await page.locator('#fake-card').fill('4111 1111 1111 1111');
  await page.locator('#co-submit').click();
  await expect(page.locator('.co-confirm h2')).toContainText(/Order #\d+ confirmed/);
  await expect(page.locator('.co-confirm')).toContainText(/\$274(\.00)?/);
  await expect(page.locator('.co-confirm')).toContainText(email);

  // Saved in the database, paid, and the stock went down by one
  const id = Number((await page.locator('.co-confirm h2').textContent()).match(/#(\d+)/)[1]);
  const o = (await sql('SELECT * FROM orders WHERE id = $1', [id])).rows[0];
  expect(o.payment).toBe('paid');
  expect(o.total).toBe(27400);
  expect(o.discount_code).toBe('WELCOME10');
  expect(o.email).toBe(email);
  expect(o.session_id).toBeTruthy();
  expect(await stockOf(SLUG)).toBe(before - 1);
  // The bag is empty again
  await expect(page.locator('.cart-count-badge').first()).toHaveText('0');
});

test('a declined card shows a clear message and nothing is sold', async ({ page }, info) => {
  const before = await stockOf(SLUG);
  await page.goto('/product.html?slug=' + SLUG);
  await page.locator('[data-detail-add="' + SLUG + '"]').click();
  await page.goto('/checkout.html');
  await fillCheckout(page, 'declined-' + info.project.name + '@example.com');
  await page.locator('#fake-card').fill('4000 0000 0000 0002');
  await page.locator('#co-submit').click();
  await expect(page.locator('#co-msg')).toContainText('Your card was declined');
  await expect(page.locator('#co-submit')).toBeEnabled();
  expect(await stockOf(SLUG)).toBe(before);
  const paid = await sql("SELECT count(*)::int AS n FROM orders WHERE email = $1 AND payment = 'paid'", ['declined-' + info.project.name + '@example.com']);
  expect(paid.rows[0].n).toBe(0);
});

test('outside the delivery zones: quote request, no payment taken', async ({ page }, info) => {
  const email = 'quote-' + info.project.name + '@example.com';
  await page.goto('/product.html?slug=' + SLUG);
  await page.locator('[data-detail-add="' + SLUG + '"]').click();
  await page.goto('/checkout.html');
  await fillCheckout(page, email);
  await page.locator('#co-suburb').fill('Ballarat');
  await page.locator('#co-postcode').fill('3350');
  await expect(page.locator('#co-zone')).toContainText('outside our delivery zones');
  await expect(page.locator('#co-pay-panel')).toBeHidden();
  await page.locator('#co-submit').click();
  await expect(page.locator('.co-confirm h2')).toContainText(/Quote request #\d+ received/);
  const o = (await sql('SELECT * FROM orders WHERE email = $1', [email])).rows[0];
  expect(o.payment).toBe('awaiting_quote');
  expect(o.square_payment_id).toBeNull();
});

test('a sold-out mirror can\'t be added to the bag', async ({ page }) => {
  await page.goto('/product.html?slug=riviera-rounded-floor-mirror-gold');
  await expect(page.locator('[data-detail-add="riviera-rounded-floor-mirror-gold"]')).toBeDisabled();
});

test('newsletter sign-up from the footer', async ({ page }, info) => {
  const email = 'fan-' + info.project.name + '@example.com';
  await page.goto('/');
  await page.locator('#newsletter-email').fill(email);
  await page.locator('#newsletter-form button[type="submit"]').click();
  await expect(page.locator('#newsletter-status')).toContainText('on the list');
  expect((await sql('SELECT 1 FROM subscribers WHERE email = $1', [email])).rowCount).toBe(1);
});
