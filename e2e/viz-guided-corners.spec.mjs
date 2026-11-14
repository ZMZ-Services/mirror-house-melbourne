// "Tap the corners", guided: the walls question sets the starting dots, prompts lead one dot at a time,
// silly dots get a plain warning (without blocking), and a one-wall photo makes a sensible room.
import { test, expect } from '@playwright/test';
import { watchErrors, openSample, uploadPhoto, finish, shot, mirrorOnScreen } from './viz-helpers.mjs';

const dot = (page, post, end) => page.locator(`#editor-dots .dot[data-post="${post}"][data-end="${end}"]`);
const corners = (page) => page.evaluate(() => window.mhViz.state.posts.filter((p) => !p.edge).length);
const pressed = (page, id) => page.locator('#' + id).getAttribute('aria-pressed');

// Drags a dot by (dx, dy) screen pixels with a pointer, like a shopper would.
async function dragDot(page, post, end, dx, dy) {
  await dot(page, post, end).scrollIntoViewIfNeeded();
  const b = await dot(page, post, end).boundingBox();
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 3 });
  await page.mouse.move(x + dx, y + dy, { steps: 3 });
  await page.mouse.up();
}

test('the walls question sets the starting layout', async ({ page }, info) => {
  const errors = watchErrors(page);
  await uploadPhoto(page, 'cropped-corner');
  await expect(page.locator('#walls-q')).toBeVisible();
  await expect(page.locator('#corner-line')).toContainText('how many walls');
  await expect(page.locator('#editor-dots')).toBeHidden();
  await shot(page, 'walls-question', info);

  await page.click('#walls-two');
  await expect(page.locator('#walls-q')).toBeHidden();
  await expect(page.locator('#editor-dots .dot').first()).toBeVisible();
  expect(await corners(page)).toBe(1);
  expect(await pressed(page, 'layout-two')).toBe('true');

  // The "More settings" chips stay in step, and can switch to one wall.
  await page.locator('#more-settings summary').click();
  await page.click('#layout-one');
  expect(await page.evaluate(() => window.mhViz.state.posts.map((p) => p.edge || 'c'))).toEqual(['l', 'r']);
  expect(await pressed(page, 'layout-one')).toBe('true');
  expect(await pressed(page, 'layout-two')).toBe('false');
  await page.click('#layout-three');
  expect(await corners(page)).toBe(2);
  expect(await pressed(page, 'layout-three')).toBe('true');
  expect(errors).toEqual([]);
});

test('guided prompts advance one dot at a time, and can be skipped', async ({ page }, info) => {
  const errors = watchErrors(page);
  await uploadPhoto(page, 'cropped-corner');
  await page.click('#walls-three');
  const line = page.locator('#corner-line');
  await expect(line).toContainText('Dot 1 of 8');
  await expect(line).toContainText('the left wall meets the floor');
  await expect(dot(page, 0, 'floor')).toHaveClass(/\bguide\b/);
  await expect(dot(page, 1, 'floor')).toHaveClass(/\bdim\b/);
  await shot(page, 'guided', info);

  // Placing the active dot moves the prompt on to its top dot.
  await dragDot(page, 0, 'floor', 0, 12);
  await expect(line).toContainText('Dot 2 of 8');
  await expect(line).toContainText('ceiling');
  await expect(dot(page, 0, 'ceil')).toHaveClass(/\bguide\b/);
  await expect(dot(page, 0, 'floor')).not.toHaveClass(/\bguide\b/);

  // Moving some other dot doesn't skip ahead.
  await dragDot(page, 2, 'floor', 6, 0);
  await expect(line).toContainText('Dot 2 of 8');

  // "Next dot" accepts a dot that is already right.
  await page.click('#guide-next-btn');
  await expect(line).toContainText('Dot 3 of 8');
  await expect(line).toContainText('the left wall meets the back wall');
  await expect(dot(page, 1, 'floor')).toHaveClass(/\bguide\b/);

  await page.click('#guide-skip-btn');
  await expect(page.locator('#guide-row')).toBeHidden();
  await expect(line).toHaveText("Drag the dots onto the room's corners.");
  await expect(page.locator('#editor-dots .dot.guide')).toHaveCount(0);
  await expect(page.locator('#editor-dots .dot.dim')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('finishing the guide says so, and sample rooms skip it', async ({ page }) => {
  await uploadPhoto(page, 'one-wall');
  await page.click('#walls-one');
  for (let k = 1; k <= 4; k++) {
    await expect(page.locator('#corner-line')).toContainText(`Dot ${k} of 4`);
    await page.click('#guide-next-btn');
  }
  await expect(page.locator('#corner-line')).toContainText('All dots placed');
  await expect(page.locator('#guide-row')).toBeHidden();

  await openSample(page, 'bedroom');
  await page.click('#back-btn');
  await expect(page.locator('#step-2')).toBeVisible();
  await expect(page.locator('#walls-q')).toBeHidden();
  await expect(page.locator('#guide-row')).toBeHidden();
  await expect(page.locator('#corner-check')).toBeHidden();
  expect(await pressed(page, 'layout-three')).toBe('true');
});

test('dots that make no sense get a plain warning, without blocking', async ({ page }, info) => {
  const errors = watchErrors(page);
  await uploadPhoto(page, 'tilted');
  await page.click('#walls-three');
  await page.click('#guide-skip-btn');
  const check = page.locator('#corner-check');
  await expect(check).toBeHidden();

  // A top dot dragged below its floor dot.
  const f = await dot(page, 1, 'floor').boundingBox(), t = await dot(page, 1, 'ceil').boundingBox();
  await dragDot(page, 1, 'ceil', 0, f.y - t.y + 40);
  await expect(check).toBeVisible();
  await expect(check).toContainText('below its floor dot');
  await expect(dot(page, 1, 'ceil')).toHaveClass(/\bwarn\b/);
  await page.click('#undo-btn');
  await expect(check).toBeHidden();

  // Crossed corners.
  await page.evaluate(() => window.mhViz.setPosts([
    { edge: 'l', fx: 0, fy: 0.8, cx: 0, cy: 0.2 },
    { fx: 0.7, fy: 0.7, cx: 0.3, cy: 0.3 },
    { fx: 0.4, fy: 0.7, cx: 0.75, cy: 0.3 },
    { edge: 'r', fx: 1, fy: 0.8, cx: 1, cy: 0.2 }
  ]));
  await expect(check).toContainText('crossed over');
  await shot(page, 'crossed-warning', info);

  // A room far too big (floor dots up near the eye line).
  await page.evaluate(() => window.mhViz.setPosts([
    { edge: 'l', fx: 0, fy: 0.505, cx: 0, cy: 0.1 },
    { edge: 'r', fx: 1, fy: 0.505, cx: 1, cy: 0.1 }
  ]));
  await expect(check).toContainText('which seems unlikely');

  // The shopper can still carry on.
  await page.click('#looks-right-btn');
  await expect(page.locator('#step-3')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the sample rooms raise no warnings', async ({ page }) => {
  await openSample(page, 'living');
  for (const key of ['living', 'bedroom', 'vanity', 'entry']) {
    await page.click('#back-btn');
    await page.click('#back-btn');
    await page.click('#sample-' + key);
    await expect(page.locator('#step-3')).toBeVisible();
    expect(await page.evaluate(() => window.mhViz.guide.issue)).toBeNull();
  }
});

test('a one-wall photo sets up and reaches the finished view with a sensible room', async ({ page }, info) => {
  const errors = watchErrors(page);
  await uploadPhoto(page, 'one-wall');
  await page.click('#walls-one');
  await expect(page.locator('#corner-check')).toBeHidden();
  await shot(page, 'one-wall-guided-corners', info);
  await finish(page);
  const L = await page.evaluate(() => {
    const l = window.mhViz.layout;
    return { walls: l.walls.length, width: l.size.width, depth: l.size.depth, roomH: l.roomH, H: l.H, facing: l.walls[0].facing };
  });
  expect(L.walls).toBe(1);
  expect(L.facing).toBeGreaterThan(0.9);
  expect(L.width).toBeGreaterThan(2);
  expect(L.width).toBeLessThan(10);
  expect(L.depth).toBeGreaterThan(1.5);
  expect(L.depth).toBeLessThan(8);
  expect(L.roomH).toBeGreaterThan(2.2);
  expect(L.roomH).toBeLessThan(3.4);
  expect((await mirrorOnScreen(page)).inside).toBe(true);
  await shot(page, 'one-wall-guided-done', info);
  expect(errors).toEqual([]);
});

test('on a phone-sized editor the photo fills the width and edge dots stay on screen', async ({ page }) => {
  await uploadPhoto(page, 'tilted');
  await page.click('#walls-three');
  const ed = await page.locator('#wall-editor').boundingBox();
  const left = await dot(page, 0, 'floor').boundingBox(), right = await dot(page, 3, 'floor').boundingBox();
  const photoW = (right.x + right.width / 2) - (left.x + left.width / 2);
  expect(photoW / ed.width).toBeGreaterThan(ed.width < 600 ? 0.9 : 0.6);
  // At least 40 px of each edge dot's touch target is inside the editor.
  expect(left.x + left.width - ed.x).toBeGreaterThanOrEqual(40);
  expect(ed.x + ed.width - right.x).toBeGreaterThanOrEqual(40);
  // On a phone the step sheet overlaps the bottom of the photo area: floor dots stay clear of it.
  if (ed.width < 600) {
    const card = await page.locator('#step-card').boundingBox();
    expect(left.y + left.height / 2).toBeLessThan(card.y - 10);
  }
});
