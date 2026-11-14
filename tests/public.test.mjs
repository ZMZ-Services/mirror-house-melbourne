// Public Functions: products, newsletter, live config, discount check, visit tracking and the sitemap.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { setupEnv, resetDb, req, call, TEST_DB } from './helpers.mjs';

let env, fn = {}, db, closePool;
before(async () => {
  env = await setupEnv();
  for (const n of ['products', 'newsletter', 'config', 'discount-check', 'track', 'sitemap']) fn[n] = (await import('../netlify/functions/' + n + '.mjs')).default;
  closePool = (await import('../netlify/lib/db.mjs')).closePool;
  db = new pg.Client({ connectionString: TEST_DB });
  await db.connect();
});
after(async () => { await db.end(); await closePool(); await env.close(); });
beforeEach(async () => { await resetDb(); env.resend.sent.length = 0; });

test('products: the 44 mirrors on sale, none of the hidden ones', async () => {
  const r = await call(fn.products, req('GET', '/api/products'));
  assert.equal(r.status, 200);
  assert.equal(r.data.products.length, 44);
  assert.ok(!r.data.products.some((p) => /travertine|vase|glassware/.test(p.slug)));
  const riv = r.data.products.find((p) => p.slug === 'riviera-rounded-floor-mirror-gold');
  assert.equal(riv.in_stock, 0); // sold out in her admin
  const halo = r.data.products.find((p) => p.slug === 'halo-arch-floor-mirror-black');
  assert.equal(halo.price_cents, 42000);
  assert.equal(halo.name, 'Halo Arch Floor Mirror 220 × 120 cm – Black');
});

test('newsletter: saved once, welcome email sent once, bad emails refused', async () => {
  const a = await call(fn.newsletter, req('POST', '/api/newsletter', { body: { email: 'New@Example.com' } }));
  assert.equal(a.status, 200);
  const b = await call(fn.newsletter, req('POST', '/api/newsletter', { body: { email: 'new@example.com' } }));
  assert.equal(b.status, 200);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM subscribers')).rows[0].n, 1);
  assert.equal(env.resend.sent.length, 1);
  assert.match(env.resend.sent[0].html, /WELCOME10/);
  const bad = await call(fn.newsletter, req('POST', '/api/newsletter', { body: { email: 'nope' } }));
  assert.equal(bad.status, 400);
});

test('config.js: Square public details, GA ID from settings or env, zones, and no secrets or codes', async () => {
  let r = await call(fn.config, req('GET', '/api/config.js'));
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /javascript/);
  assert.match(r.data, /window\.MH_SQUARE = \{"appId":"sandbox-sq0idb-test","locationId":"LTEST","sandbox":true/);
  assert.match(r.data, /sandbox\.web\.squarecdn\.com/);
  assert.ok(!r.data.includes('test-square-token'));
  assert.ok(!r.data.includes('WELCOME10'));
  assert.match(r.data, /window\.MH_GA_ID = "";/);
  assert.match(r.data, /"postcodes":"3030, 3029/);
  process.env.GA_MEASUREMENT_ID = 'G-ENVID123';
  r = await call(fn.config, req('GET', '/api/config.js'));
  assert.match(r.data, /window\.MH_GA_ID = "G-ENVID123";/);
  await db.query(`UPDATE settings SET value = value || '{"gaId":"G-ADMIN999"}'::jsonb WHERE key = 'store'`);
  r = await call(fn.config, req('GET', '/api/config.js'));
  assert.match(r.data, /window\.MH_GA_ID = "G-ADMIN999";/); // the admin's setting wins
  delete process.env.GA_MEASUREMENT_ID;
});

test('discount check returns one code\'s rule only', async () => {
  const r = await call(fn['discount-check'], req('POST', '/api/discounts/check', { body: { code: 'welcome10' } }));
  assert.equal(r.data.discount.code, 'WELCOME10');
  assert.equal(r.data.discount.value, 10);
  assert.equal(r.data.discount.firstOrderOnly, true);
  const none = await call(fn['discount-check'], req('POST', '/api/discounts/check', { body: { code: 'NOPE' } }));
  assert.equal(none.data.discount, null);
});

test('tracking: visits are counted and summarised for the admin', async () => {
  const ua = { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile' };
  const send = (body) => fn.track(new Request('https://shop.example.com/api/track', { method: 'POST', headers: ua, body: JSON.stringify(body) }), { geo: { city: 'Point Cook', subdivision: { name: 'Victoria' }, country: { code: 'AU' } } });
  const sid = 'session-aaaaaaaa', vid = 'visitor-aaaaaaaa';
  assert.equal((await send({ sid, vid, nv: true, type: 'page_view', path: '/', ref: 'https://www.instagram.com/' })).status, 204);
  await send({ sid, vid, type: 'view_item', path: '/product.html', item: 'soho-slim-frame-mirror-black' });
  await send({ sid, vid, type: 'page_view', path: '/product.html' });
  await send({ sid, vid, type: 'add_to_cart', path: '/product.html', item: 'soho-slim-frame-mirror-black' });
  await send({ sid: 'x', vid, type: 'page_view' }); // bad id: ignored
  await send({ sid, vid, type: 'hack', path: '/' }); // unknown type: ignored
  assert.equal((await db.query('SELECT count(*)::int AS n FROM site_events')).rows[0].n, 4);
  const { trafficSummary } = await import('../netlify/lib/traffic.mjs');
  const t = await trafficSummary(db);
  assert.equal(t.days.length, 1);
  assert.equal(t.days[0].sessions, 1);
  assert.equal(t.days[0].productViews, 1);
  assert.equal(t.days[0].addToBag, 1);
  assert.equal(t.days[0].pagesPer, 2);
  assert.deepEqual(t.breakdowns['7d'].sources, [{ label: 'Instagram', value: 1 }]);
  assert.deepEqual(t.breakdowns['7d'].devices, [{ label: 'Mobile', value: 1 }]);
  assert.deepEqual(t.breakdowns['7d'].locations, [{ label: 'Point Cook, Victoria', value: 1 }]);
  assert.equal(t.breakdowns['7d'].pages[0].views, 1);
});

test('sitemap lists the shop pages and every active mirror at the site address', async () => {
  const r = await call(fn.sitemap, req('GET', '/sitemap.xml'));
  assert.equal(r.status, 200);
  assert.match(r.data, /<loc>https:\/\/shop\.example\.com\/<\/loc>/);
  assert.equal((r.data.match(/product\.html\?slug=/g) || []).length, 44);
  assert.ok(!r.data.includes('travertine'));
});
