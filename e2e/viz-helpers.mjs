// Helpers for the "Try It in Your Room" checks.
import path from 'node:path';
import fs from 'node:fs';
import { expect } from '@playwright/test';

export const SAMPLES = ['living', 'bedroom', 'vanity', 'entry'];
export const AWKWARD = ['cropped-corner', 'tilted', 'one-wall'];
export const fixture = (name) => path.resolve('e2e/fixtures/room-' + name + '.jpg');

// Collects page errors so a test can assert there were none.
export function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  return errors;
}

export async function open(page) {
  await page.goto('/visualiser.html');
  await expect(page.locator('#step-1')).toBeVisible();
  await page.waitForFunction(() => window.mhViz && window.mhViz.layout);
}

// A sample room goes straight to "Pick a mirror".
export async function openSample(page, key) {
  await open(page);
  await page.click('#sample-' + key);
  await expect(page.locator('#step-3')).toBeVisible();
}

// The shopper's own photo goes to "Tap the corners".
export async function uploadPhoto(page, name) {
  await open(page);
  await page.setInputFiles('#photo-input', fixture(name));
  await expect(page.locator('#step-2')).toBeVisible();
}

// From "Tap the corners" (or "Pick a mirror") through to the finished view, with the first mirror.
export async function finish(page) {
  if (await page.locator('#step-2').isVisible()) await page.click('#looks-right-btn');
  await expect(page.locator('#step-3')).toBeVisible();
  await page.click('#mirror-done-btn');
  await expect(page.locator('#step-4')).toBeVisible();
  await page.waitForTimeout(600); // let the 3D view settle
}

// Saves a screenshot for the PR's before/after record when VIZ_SHOTS is set (a folder path).
export async function shot(page, name, info) {
  const dir = process.env.VIZ_SHOTS;
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, info.project.name + '-' + name + '.png') });
}

// Where the mirror is on screen, and whether its middle is inside the 3D view.
export async function mirrorOnScreen(page) {
  return page.evaluate(() => {
    const p = window.mhViz.mirrorScreenPoint();
    const r = document.querySelector('#viewport canvas').getBoundingClientRect();
    return { p, r: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, inside: !!p && p.x > r.left && p.x < r.right && p.y > r.top && p.y < r.bottom };
  });
}
