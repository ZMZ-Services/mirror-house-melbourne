// Netlify Identity's emails link to the shop's home page with a token. Each one must end up in the admin,
// where the sign-in box finishes it: set a password (invite), set a new password (reset), confirm, change email.
import { test, expect } from '@playwright/test';
import { mockIdentity, signIn } from './helpers.mjs';

const widget = (page) => page.frameLocator('#netlify-identity-widget');

test('invite: the email link opens the admin, the new admin sets a password and is in', async ({ page }) => {
  const calls = [];
  await mockIdentity(page, { calls });
  await page.goto('/#invite_token=invite-ok-1');
  await expect(page).toHaveURL(/\/admin-dashboard\.html/);
  const pw = widget(page).locator('input[name="password"]');
  await expect(pw).toBeVisible();
  await pw.fill('a-new-password-1');
  await widget(page).locator('button[type="submit"]').click();
  await expect(page.locator('#app')).toBeVisible();
  const verify = calls.find((c) => c.path === '/verify');
  expect(JSON.parse(verify.body)).toMatchObject({ token: 'invite-ok-1', password: 'a-new-password-1', type: 'signup' });
});

test('password reset: the link from any shop page opens the admin and asks for a new password', async ({ page }) => {
  const calls = [];
  await mockIdentity(page, { calls });
  await page.goto('/product.html?slug=soho-slim-frame-mirror-black#recovery_token=recover-ok-1');
  await expect(page).toHaveURL(/\/admin-dashboard\.html/);
  const pw = widget(page).locator('input[name="password"]');
  await expect(pw).toBeVisible();
  await pw.fill('another-password-2');
  await widget(page).locator('button[type="submit"]').click();
  await expect(page.locator('#app')).toBeVisible();
  expect(JSON.parse(calls.find((c) => c.path === '/verify').body)).toMatchObject({ token: 'recover-ok-1', type: 'recovery' });
  const update = calls.find((c) => c.path === '/user' && c.method === 'PUT');
  expect(JSON.parse(update.body)).toMatchObject({ password: 'another-password-2' });
});

test('confirmation: the link confirms the account and opens the admin', async ({ page }) => {
  const calls = [];
  await mockIdentity(page, { calls });
  await page.goto('/#confirmation_token=confirm-ok-1');
  await expect(page).toHaveURL(/\/admin-dashboard\.html/);
  await expect(page.locator('#app')).toBeVisible();
  expect(JSON.parse(calls.find((c) => c.path === '/verify').body)).toMatchObject({ token: 'confirm-ok-1', type: 'signup' });
});

test('email change: a signed-in admin following the link has the change confirmed', async ({ page }) => {
  const calls = [];
  await mockIdentity(page, { calls });
  await page.goto('/admin-dashboard.html');
  await signIn(page);
  await expect(page.locator('#app')).toBeVisible();
  await page.goto('/visualiser.html#email_change_token=change-ok-1');
  await expect(page).toHaveURL(/\/admin-dashboard\.html/);
  await expect.poll(() => calls.some((c) => c.path === '/user' && c.method === 'PUT' && /change-ok-1/.test(c.body))).toBe(true);
  await expect(page.locator('#app')).toBeVisible();
});

test('an expired link shows a message instead of a blank page', async ({ page }) => {
  await mockIdentity(page);
  await page.goto('/#recovery_token=expired-1');
  await expect(page).toHaveURL(/\/admin-dashboard\.html/);
  await expect(page.locator('#lock')).toBeVisible();
  await expect(widget(page).locator('body')).toContainText(/expired|invalid|not found/i);
});

test('ordinary links with a hash still work on the shop', async ({ page }) => {
  await page.goto('/#collection-section');
  await expect(page).toHaveURL(/\/#collection-section$/);
});
