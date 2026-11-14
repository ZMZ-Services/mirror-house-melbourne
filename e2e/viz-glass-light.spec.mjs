// "Try It in Your Room": contact shadow, glass and light matched to the photo (D+E).
// Pixel checks compare what's on screen with the room photo itself: the 3D view from the photo's own camera
// paints each wall point with the photo pixel it came from, so room pixels must match the photo exactly
// (no tone mapping on the room), and a shadow shows up as a darker ratio against the photo.
import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { watchErrors, open, openSample, finish, shot, mirrorOnScreen, fixture } from './viz-helpers.mjs';

const GOLD = { id: 'statement-gold', w: 1.0, h: 2.0, depth: 0.028 };
const BELLE = { id: 'belle-silver', w: 0.9, h: 1.9, depth: 0.04, frame: 0.12 };
const STANDOFF = 0.015;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('mh-viz-coach', '1'); } catch (e) { /* private mode */ } });
});

// In the page: wall points (wall index, metres along it, metres up, metres out) -> where they are on screen,
// where they are in the photo, and the photo's mean colour there (over the same area as the screen patch).
async function locate(page, pts, r) {
  return page.evaluate(({ pts, r }) => {
    const v = window.mhViz, L = v.layout, ph = v.state.photo;
    const canvas = document.querySelector('#viewport canvas'), cr = canvas.getBoundingClientRect();
    const ctx = ph.canvas.getContext('2d');
    const perCss = 1 / Math.max(cr.width / ph.w, cr.height / ph.h);   // the photo covers the view
    const pr = Math.max(1, Math.round(r * perCss));
    return pts.map(([wi, s, h, out]) => {
      const wl = L.walls[wi];
      const x = wl.A[0] + wl.t[0] * s + wl.n[0] * out, y = L.yF + h, z = wl.A[1] + wl.t[1] * s + wl.n[1] * out;
      const cp = Math.cos(L.pitch), sp = Math.sin(L.pitch), cy = y * cp + z * sp, cz = -y * sp + z * cp;
      if (cz > -0.05) return null;
      const px = L.cx + L.f * x / -cz, py = L.cy - L.f * cy / -cz;
      const scr = v.worldToScreen(x, y, z);
      const inView = scr.x > cr.left + 12 && scr.x < cr.right - 12 && scr.y > cr.top + 12 && scr.y < cr.bottom - 12;
      if (!inView || document.elementFromPoint(scr.x, scr.y) !== canvas) return null;
      if (px < pr || py < pr || px > ph.w - pr - 1 || py > ph.h - pr - 1) return null;
      const d = ctx.getImageData(Math.round(px) - pr, Math.round(py) - pr, pr * 2 + 1, pr * 2 + 1).data;
      const m = [0, 0, 0];
      for (let i = 0; i < d.length; i += 4) { m[0] += d[i]; m[1] += d[i + 1]; m[2] += d[i + 2]; }
      const n = d.length / 4;
      return { scr, photo: m.map((c) => c / n) };
    });
  }, { pts, r });
}

// Mean screen colour around each point (CSS pixels), read from a screenshot.
async function screenColours(page, points, r) {
  const png = (await page.screenshot({ scale: 'css' })).toString('base64');
  return page.evaluate(async ({ png, points, r }) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + png;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return points.map((p) => {
      const d = ctx.getImageData(Math.round(p.x) - r, Math.round(p.y) - r, r * 2 + 1, r * 2 + 1).data;
      const m = [0, 0, 0];
      for (let i = 0; i < d.length; i += 4) { m[0] += d[i]; m[1] += d[i + 1]; m[2] += d[i + 2]; }
      return m.map((v) => v / (d.length / 4));
    });
  }, { png, points, r });
}

const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

// Screen brightness / photo brightness at wall points: 1 means the wall shows exactly as photographed.
async function ratios(page, pts) {
  const loc = (await locate(page, pts, 2)).map((l, i) => l && { ...l, i }).filter(Boolean);
  const scr = await screenColours(page, loc.map((l) => l.scr), 2);
  return loc.map((l, k) => ({ i: l.i, ratio: lum(scr[k]) / Math.max(1, lum(l.photo)), scr: scr[k], photo: l.photo }));
}

// Points just outside each edge of the placed mirror (past any part the frame hides at this angle), and
// the same edges 45 cm further out.
async function edgePoints(page, def) {
  return page.evaluate(({ def, STANDOFF }) => {
    const v = window.mhViz, L = v.layout, st = v.state, wl = L.walls[st.mirrorWall];
    const fw = st.turned ? def.h : def.w, fh = st.turned ? def.w : def.h, gap = STANDOFF + def.depth;
    const camS = -(wl.A[0] * wl.t[0] + wl.A[1] * wl.t[1]), camH = -L.yF;
    const dist = Math.abs(wl.A[0] * wl.n[0] + wl.A[1] * wl.n[1]);
    const near = [], far = [];
    for (const [ds, dh, half] of [[1, 0, fw / 2], [-1, 0, fw / 2], [0, 1, fh / 2], [0, -1, fh / 2]]) {
      const s0 = st.place.s + ds * half, h0 = st.place.h + dh * half;
      const away = ds ? ds * (s0 - camS) : dh * (h0 - camH);          // > 0: this edge faces away from the camera
      const hidden = Math.max(0, away) / dist * gap;
      for (const along of [-0.25, 0, 0.25]) {
        const s = ds ? s0 : st.place.s + along * fw, h = dh ? h0 : st.place.h + along * fh;
        const o = hidden + 0.02;
        near.push([st.mirrorWall, s + ds * o, h + dh * o, 0.001]);
        far.push([st.mirrorWall, s + ds * (o + 0.45), h + dh * (o + 0.45), 0.001]);
      }
    }
    return { near, far };
  }, { def, STANDOFF });
}

async function expectContactShadow(page, def) {
  const { near, far } = await edgePoints(page, def);
  const rn = await ratios(page, near), rf = await ratios(page, far);
  const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
  expect(rn.length, 'edge points in view').toBeGreaterThan(2);
  expect(rf.length, 'far points in view').toBeGreaterThan(2);
  const nearMin = Math.min(...rn.map((r) => r.ratio)), nearMed = median(rn.map((r) => r.ratio)), farMed = median(rf.map((r) => r.ratio));
  // The wall further away shows as photographed. Just outside the frame it is darker all round, and much
  // darker on the side away from the light (the old faint shadow measured about 0.8 there).
  expect(farMed).toBeGreaterThan(0.93);
  expect(farMed).toBeLessThan(1.07);
  expect(nearMed).toBeLessThan(farMed - 0.1);
  expect(nearMin).toBeLessThan(farMed - 0.3);
}

test('room pixels away from the mirror look exactly as photographed', async ({ page }, info) => {
  const errors = watchErrors(page);
  await openSample(page, 'living');
  await finish(page);
  await shot(page, 'glass-living', info);
  const pts = await page.evaluate(() => {
    const v = window.mhViz, L = v.layout, st = v.state, out = [];
    L.walls.forEach((wl, wi) => {
      for (let a = 0.08; a < 0.95; a += 0.12) for (let h = 0.3; h < L.roomH - 0.2; h += 0.35) {
        const s = a * wl.len;
        if (wi === st.mirrorWall && Math.abs(s - st.place.s) < 1.6) continue;   // well clear of the mirror and its shadow
        out.push([wi, s, h, 0]);
      }
    });
    return out;
  });
  const r = await ratios(page, pts);
  expect(r.length).toBeGreaterThan(20);
  const diffs = r.map((p) => Math.max(...p.scr.map((c, i) => Math.abs(c - p.photo[i])))).sort((a, b) => a - b);
  // Texture filtering and the screen's resampling leave a few levels of noise; tone mapping would shift by tens.
  expect(diffs[diffs.length >> 1]).toBeLessThan(5);
  expect(diffs[Math.floor(diffs.length * 0.9)]).toBeLessThan(14);
  const light = await page.evaluate(() => window.mhViz.light);
  expect(light.toneMapping).not.toBe(0);   // the frame is tone mapped; the room isn't
  expect(errors).toEqual([]);
});

test('a hung mirror has a soft contact shadow on the wall, upright and turned', async ({ page }, info) => {
  const errors = watchErrors(page);
  await openSample(page, 'vanity');
  await finish(page);
  expect((await mirrorOnScreen(page)).inside).toBe(true);
  await expectContactShadow(page, GOLD);
  await shot(page, 'glass-vanity', info);

  await page.locator('[data-turn="h"]:visible').click();
  await expect(page.locator('[data-turn="h"]:visible')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.mhViz.state.turned)).toBe(true);
  await page.waitForTimeout(400);
  expect((await mirrorOnScreen(page)).inside).toBe(true);
  await expectContactShadow(page, GOLD);
  await shot(page, 'glass-vanity-turned', info);

  // Leaning is switched off at this stage (every mirror hangs): the switch stays hidden and the mirror hangs.
  await expect(page.locator('#lean-toggle')).toBeHidden();
  expect(await page.evaluate(() => window.mhViz.state.mount)).toBe('hang');
  expect(errors).toEqual([]);
});

// The same photo, made dim and warm, or bright and cool, on the device.
async function variant(page, kind) {
  const b64 = fs.readFileSync(fixture('one-wall')).toString('base64');
  const out = await page.evaluate(async ({ b64, kind }) => {
    const img = new Image();
    img.src = 'data:image/jpeg;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    const k = kind === 'dim' ? [0.42, 0.34, 0.24] : [1.02, 1.08, 1.25];
    for (let i = 0; i < d.data.length; i += 4) for (let j = 0; j < 3; j++) d.data[i + j] = Math.min(255, d.data[i + j] * k[j]);
    ctx.putImageData(d, 0, 0);
    return c.toDataURL('image/jpeg', 0.92).split(',')[1];
  }, { b64, kind });
  return Buffer.from(out, 'base64');
}

async function frameInRoom(page, buffer, info, name) {
  await page.setInputFiles('#photo-input', { name: 'room.jpg', mimeType: 'image/jpeg', buffer });
  await expect(page.locator('#step-2')).toBeVisible();
  await page.click('#looks-right-btn');
  await expect(page.locator('#step-3')).toBeVisible();
  await page.click(`[data-mirror="${BELLE.id}"]`);
  await finish(page);
  await shot(page, name, info);
  const light = await page.evaluate(() => window.mhViz.light);
  // Middle of the frame's side rails, on its front face.
  const pts = await page.evaluate(({ def, STANDOFF }) => {
    const v = window.mhViz, L = v.layout, st = v.state, wl = L.walls[st.mirrorWall], out = STANDOFF + def.depth;
    return [-1, 1].flatMap((side) => [-0.2, 0, 0.2].map((dh) => {
      const s = st.place.s + side * (def.w / 2 - def.frame / 2), h = st.place.h + dh;
      return v.worldToScreen(wl.A[0] + wl.t[0] * s + wl.n[0] * out, L.yF + h, wl.A[1] + wl.t[1] * s + wl.n[1] * out);
    }));
  }, { def: BELLE, STANDOFF });
  const cols = await screenColours(page, pts, 1);
  return { light, frame: cols.reduce((a, c) => a + lum(c), 0) / cols.length };
}

test('the frame is lit to match the room: dim and warm versus bright and cool', async ({ page }, info) => {
  const errors = watchErrors(page);
  await open(page);
  const dimPhoto = await variant(page, 'dim'), brightPhoto = await variant(page, 'bright');
  const dim = await frameInRoom(page, dimPhoto, info, 'glass-dim-warm');
  await open(page);
  const bright = await frameInRoom(page, brightPhoto, info, 'glass-bright-cool');
  expect(dim.light.level).toBeLessThan(bright.light.level * 0.7);
  expect(dim.light.key).toBeLessThan(bright.light.key);
  expect(dim.light.warmth).toBeGreaterThan(bright.light.warmth + 0.1);
  expect(dim.frame).toBeLessThan(bright.frame * 0.75);
  expect(errors).toEqual([]);
});
