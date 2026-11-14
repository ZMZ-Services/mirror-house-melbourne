// "Try It in Your Room": every sample room and the awkward photos (cropped corner, tilted phone, one wall)
// get from start to the finished 3D view without errors, at desktop and phone sizes.
import { test, expect } from '@playwright/test';
import { SAMPLES, AWKWARD, watchErrors, openSample, uploadPhoto, finish, shot } from './viz-helpers.mjs';

for (const key of SAMPLES) {
  test('sample room "' + key + '" reaches the finished view', async ({ page }, info) => {
    const errors = watchErrors(page);
    await openSample(page, key);
    await finish(page);
    await shot(page, key + '-done', info);
    expect(errors).toEqual([]);
  });
}

for (const name of AWKWARD) {
  test('own photo "' + name + '" reaches the finished view', async ({ page }, info) => {
    const errors = watchErrors(page);
    await uploadPhoto(page, name);
    await shot(page, name + '-corners', info);
    await finish(page);
    await shot(page, name + '-done', info);
    expect(errors).toEqual([]);
  });
}
