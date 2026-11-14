// Quick wins: the whole mirror is in the first view, looking around stays near the photo, and on a phone the
// 3D view gets most of the screen with the tip clear of the mirror.
import { test, expect } from '@playwright/test';
import { SAMPLES, AWKWARD, openSample, uploadPhoto, finish, mirrorOnScreen, shot } from './viz-helpers.mjs';

for (const key of SAMPLES) {
  test('sample "' + key + '": the whole mirror is on screen at the start', async ({ page }, info) => {
    await openSample(page, key);
    await finish(page);
    expect(await page.evaluate(() => window.mhViz.mirrorViewFit())).toBeLessThanOrEqual(1);
    expect((await mirrorOnScreen(page)).inside).toBe(true);
    await shot(page, key + '-done', info);
  });
}

for (const name of AWKWARD) {
  test('own photo "' + name + '": the whole mirror is on screen at the start', async ({ page }) => {
    await uploadPhoto(page, name);
    await finish(page);
    expect(await page.evaluate(() => window.mhViz.mirrorViewFit())).toBeLessThanOrEqual(1);
  });
}

test('looking around is limited to angles the photo can show', async ({ page }) => {
  await openSample(page, 'living');
  await finish(page);
  const lim = await page.evaluate(() => { const c = window.mhViz.controls; return { az: c.maxAzimuthAngle - c.minAzimuthAngle, polar: c.maxPolarAngle - c.minPolarAngle }; });
  expect(lim.az).toBeLessThanOrEqual((56 * Math.PI) / 180 + 1e-6);
  expect(lim.polar).toBeLessThanOrEqual((32 * Math.PI) / 180 + 1e-6);
});

test('the tip sits at the top of the view, clear of the mirror', async ({ page }) => {
  await openSample(page, 'bedroom');
  await page.evaluate(() => { try { localStorage.removeItem('mh-viz-coach'); } catch (e) { /* ignore */ } });
  await finish(page);
  const coach = page.locator('#coach');
  await expect(coach).toBeVisible();
  const c = await coach.boundingBox();
  const m = (await mirrorOnScreen(page)).p;
  expect(m.y < c.y || m.y > c.y + c.height).toBe(true);
});

test('phone: the 3D view gets most of the screen in the last step', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'phone layout');
  await openSample(page, 'living');
  await finish(page);
  const v = await page.locator('#viewport').boundingBox();
  const vh = page.viewportSize().height;
  expect(v.height).toBeGreaterThan(vh * 0.45);
  await expect(page.locator('#add-to-bag-btn')).toBeInViewport();
});

test('a tap on the mirror without dragging still lets the view keep it on screen', async ({ page }) => {
  await openSample(page, 'living');
  await finish(page);
  const pt = await page.evaluate(() => window.mhViz.mirrorScreenPoint());
  await page.mouse.move(pt.x, pt.y);
  await page.mouse.down();
  await page.mouse.up();
  expect(await page.evaluate(() => window.mhViz.state.movedByHand)).toBe(false);
});

test('another mirror is placed beside the first, never on top of it, and stays in view', async ({ page }) => {
  for (const key of SAMPLES) {
    await openSample(page, key);
    await finish(page);
    await page.locator('#add-mirror-btn:visible, #add-mirror-btn-3:visible').first().click();
    await expect.poll(() => page.evaluate(() => window.mhViz.mirrors().length)).toBe(2);
    await page.waitForTimeout(150); // let the step's resize run
    const [a, b] = await page.evaluate(() => window.mhViz.mirrors());
    if (a.wall === b.wall) expect(Math.abs(a.s - b.s), key).toBeGreaterThan((a.w + b.w) / 2);
    expect(await page.evaluate(() => window.mhViz.mirrorViewFit()), key).toBeLessThanOrEqual(1);
  }
});
