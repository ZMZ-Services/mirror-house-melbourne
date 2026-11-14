// The admin, end to end: refused when signed out or not an admin; signed in it shows the orders, saves a product
// edit that then shows in the shop, lists newsletter sign-ups, and records the edit in the activity log.
import { test, expect } from '@playwright/test';
import { sql, mockIdentity, signIn } from './helpers.mjs';

const SLUG = 'belle-beaded-mirror-gold';

async function anOrder(request, email) {
  const r = await request.post('/api/orders', { data: {
    email, phone: '0412 345 678', name: 'Admin Test', method: 'pickup', items: [{ slug: 'paris-window-pane-mirror-white', qty: 1 }],
    source_id: 'cnon:card-nonce-ok', idempotency_key: 'e2e-' + email.replace(/[^a-z0-9]/g, '') + '-' + Date.now()
  } });
  expect(r.status()).toBe(200);
  return (await r.json()).order_id;
}

test('signed out, the admin is refused', async ({ page, request }) => {
  await mockIdentity(page);
  await page.goto('/admin-dashboard.html');
  await expect(page.locator('#lock')).toBeVisible();
  await expect(page.locator('#lock-title')).toHaveText('Sign in to your admin');
  await expect(page.locator('#app')).toBeHidden();
  for (const path of ['/api/admin/state']) {
    const r = await request.get(path);
    expect(r.status()).toBe(401);
  }
  const forged = await request.get('/api/admin/state', { headers: { authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6ImhhY2tlckBleGFtcGxlLmNvbSJ9.forged' } });
  expect(forged.status()).toBe(401);
  const sync = await request.post('/api/admin/sync', { data: { products: { delete: [SLUG] } } });
  expect(sync.status()).toBe(401);
  expect((await sql('SELECT 1 FROM products WHERE slug = $1', [SLUG])).rowCount).toBe(1);
});

test('a signed-in account without the admin role is refused', async ({ page }) => {
  await mockIdentity(page, { email: 'helper@example.com', roles: [] });
  await page.goto('/admin-dashboard.html');
  await signIn(page, { email: 'helper@example.com' });
  await expect(page.locator('#lock-msg')).toContainText('doesn\'t have admin access');
  await expect(page.locator('#app')).toBeHidden();
});

test('signed in: orders, product edit shows in the shop, mailing list, activity log', async ({ page, request }, info) => {
  const tag = info.project.name;
  const orderId = await anOrder(request, 'admin-order-' + tag + '@example.com');
  const sub = 'list-' + tag + '@example.com';
  expect((await request.post('/api/newsletter', { data: { email: sub } })).status()).toBe(200);

  await mockIdentity(page);
  await page.goto('/admin-dashboard.html');
  await signIn(page);
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('.top-user .name')).toHaveText('Debbie');

  // Orders: the order is there and opens
  await page.goto('/admin-dashboard.html#/orders/' + orderId);
  await expect(page.locator('.page-head h1')).toHaveText('#' + orderId);
  await expect(page.locator('#main')).toContainText('Paris Window Pane Mirror');
  await expect(page.locator('#main')).toContainText('VISA ending 1111');

  // Products: edit the title and price
  const title = 'Belle Beaded Mirror – Gold (' + tag + ' edit)';
  const price = tag === 'phone' ? '265' : '255';
  await page.goto('/admin-dashboard.html#/products/' + SLUG);
  await expect(page.locator('#p-title')).toHaveValue(/Belle Beaded Mirror/);
  await page.locator('#p-title').fill(title);
  await page.locator('#p-price').fill(price);
  const saved = page.waitForResponse((r) => r.url().endsWith('/api/admin/sync') && r.status() === 200);
  await page.locator('#pform button[type="submit"]').click();
  await saved;
  await expect(page.locator('#save-status')).toHaveText('All changes saved');

  // The edit shows in the shop
  await page.goto('/product.html?slug=' + SLUG);
  await expect(page.locator('h1')).toHaveText(title);
  await expect(page.locator('main')).toContainText('$' + price);

  // Mailing list shows the footer sign-up
  await page.goto('/admin-dashboard.html#/mailing');
  await expect(page.locator('#app')).toBeVisible(); // still signed in after leaving the admin
  await expect(page.locator('#ml-table')).toContainText(sub);

  // Activity log records the edit, with who made it
  await page.goto('/admin-dashboard.html#/activity');
  const row = page.locator('tr[data-action="product.updated"]').first();
  await expect(row).toContainText('debbie@example.com');
  await expect(row).toContainText('Edited');
  await expect(row).toContainText('title');
  await expect(row).toContainText('$' + price + '.00');
  const log = await sql("SELECT * FROM activity_log WHERE action = 'product.updated' AND entity_id = $1 ORDER BY id DESC LIMIT 1", [SLUG]);
  expect(log.rows[0].actor).toBe('debbie@example.com');
  expect(log.rows[0].detail.title.to).toBe(title);

  // Sign out: back to the sign-in screen
  if (await page.locator('#menu-btn').isVisible()) await page.locator('#menu-btn').click();
  await page.locator('#sign-out').click();
  await expect(page.locator('#lock')).toBeVisible();
});
