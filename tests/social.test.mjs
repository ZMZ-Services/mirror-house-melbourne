// Social media links: the admin setting, its checks, the default Instagram, and what the shop pages receive.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv, resetDb, req, call, ADMIN_TOKEN } from './helpers.mjs';

let env, sync, config, socialLink, closePool;
before(async () => {
  env = await setupEnv();
  sync = (await import('../netlify/functions/admin-sync.mjs')).default;
  config = (await import('../netlify/functions/config.mjs')).default;
  socialLink = (await import('../netlify/lib/admin.mjs')).socialLink;
  closePool = (await import('../netlify/lib/db.mjs')).closePool;
});
after(async () => { await closePool(); await env.close(); });
beforeEach(resetDb);

const settings = async () => (await call(sync, req('POST', '/api/admin/sync', { body: {}, token: ADMIN_TOKEN }))).data.state.settings;
const save = (s) => call(sync, req('POST', '/api/admin/sync', { body: { settings: s }, token: ADMIN_TOKEN }));

test('page addresses are tidied, and only that site\'s https pages are accepted', () => {
  assert.equal(socialLink('', 'instagram.com', 'Instagram'), '');
  assert.equal(socialLink('instagram.com/mirrorhousemelbourne/', 'instagram.com', 'Instagram'), 'https://www.instagram.com/mirrorhousemelbourne/');
  assert.equal(socialLink('http://m.facebook.com/mirrorhouse', 'facebook.com', 'Facebook'), 'https://www.facebook.com/mirrorhouse');
  for (const bad of ['https://evil.example/instagram.com/x', 'javascript:alert(1)', 'https://instagram.com.evil.com/x', 'https://www.instagram.com/', 'https://user:pw@instagram.com/x']) {
    assert.throws(() => socialLink(bad, 'instagram.com', 'Instagram'), /Instagram page address/, bad);
  }
});

test('Instagram starts with the shop\'s account; Facebook starts empty', async () => {
  const s = await settings();
  assert.equal(s.instagram, 'https://www.instagram.com/mirrorhousemelbourne/');
  assert.equal(s.facebook, '');
  const js = (await call(config, req('GET', '/api/config.js'))).data;
  assert.match(js, /window\.MH_SOCIAL = \{"instagram":"https:\/\/www\.instagram\.com\/mirrorhousemelbourne\/","facebook":""\};/);
});

test('saving and clearing the links in the admin', async () => {
  const r = await save({ facebook: 'facebook.com/mirrorhousemelbourne', instagram: '' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.state.settings.facebook, 'https://www.facebook.com/mirrorhousemelbourne');
  assert.equal(r.data.state.settings.instagram, '');
  const js = (await call(config, req('GET', '/api/config.js'))).data;
  assert.match(js, /"instagram":"","facebook":"https:\/\/www\.facebook\.com\/mirrorhousemelbourne"/);
  const bad = await save({ facebook: 'https://evil.example/facebook.com/x' });
  assert.equal(bad.status, 400);
  assert.match(bad.data.error, /Facebook page address/);
  assert.equal((await settings()).facebook, 'https://www.facebook.com/mirrorhousemelbourne');
});
