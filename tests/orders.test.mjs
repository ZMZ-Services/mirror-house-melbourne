// The checkout Function against a real Postgres, with Square and Resend mocked.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { setupEnv, resetDb, req, call, checkout, TEST_DB } from './helpers.mjs';

let env, orders, products, db, closePool;
before(async () => {
  env = await setupEnv();
  orders = (await import('../netlify/functions/orders.mjs')).default;
  products = (await import('../netlify/functions/products.mjs')).default;
  closePool = (await import('../netlify/lib/db.mjs')).closePool;
  db = new pg.Client({ connectionString: TEST_DB });
  await db.connect();
});
after(async () => { await db.end(); await closePool(); await env.close(); });
beforeEach(async () => { await resetDb(); env.square.calls.length = 0; env.resend.sent.length = 0; });

const stock = async (slug) => (await db.query('SELECT stock FROM products WHERE slug = $1', [slug])).rows[0].stock;
const order = async (id) => (await db.query('SELECT * FROM orders WHERE id = $1', [id])).rows[0];

test('a paid order is priced on the server, charged once, saved, and takes stock', async () => {
  const before = await stock('soho-slim-frame-mirror-black');
  const body = checkout({ total_cents: 1, subtotal: 1, items: [{ slug: 'soho-slim-frame-mirror-black', qty: 2, price_cents: 1 }] }); // browser totals are ignored
  const r = await call(orders, req('POST', '/api/orders', { body }));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.order_id, 1001);
  assert.equal(r.data.total_cents, 50000 + 4900);
  const pay = env.square.calls.filter((c) => c.url === '/v2/payments');
  assert.equal(pay.length, 1);
  assert.equal(pay[0].body.amount_money.amount, 54900);
  assert.equal(pay[0].body.amount_money.currency, 'AUD');
  assert.equal(pay[0].body.idempotency_key, body.idempotency_key);
  assert.equal(pay[0].body.location_id, 'LTEST');
  const o = await order(1001);
  assert.equal(o.payment, 'paid');
  assert.equal(o.fulfilment, 'unfulfilled');
  assert.equal(o.card, 'VISA ending 1111');
  assert.equal(o.stock_taken, true);
  assert.equal(await stock('soho-slim-frame-mirror-black'), before - 2);
  // Emails: confirmation to the customer and an alert to the admin.
  assert.equal(env.resend.sent.length, 2);
  assert.deepEqual(env.resend.sent.map((e) => e.to[0]).sort(), [body.email, 'debbie@example.com'].sort());
  assert.match(env.resend.sent.find((e) => e.to[0] === body.email).subject, /order #1001 is confirmed/);
  const act = (await db.query("SELECT * FROM activity_log WHERE action = 'order.paid'")).rows;
  assert.equal(act.length, 1);
  assert.equal(act[0].actor, body.email);
});

test('the same request twice makes one order and one charge', async () => {
  const body = checkout();
  const a = await call(orders, req('POST', '/api/orders', { body }));
  const b = await call(orders, req('POST', '/api/orders', { body }));
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(a.data.order_id, b.data.order_id);
  assert.equal(env.square.calls.filter((c) => c.url === '/v2/payments').length, 1);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM orders')).rows[0].n, 1);
});

test('selling the last one marks it sold out, and the next buyer is refused', async () => {
  await db.query("UPDATE products SET stock = 1 WHERE slug = 'florence-window-arch-mirror-black'");
  const first = await call(orders, req('POST', '/api/orders', { body: checkout({ items: [{ slug: 'florence-window-arch-mirror-black', qty: 1 }] }) }));
  assert.equal(first.status, 200);
  assert.equal(await stock('florence-window-arch-mirror-black'), 0);
  const list = await call(products, req('GET', '/api/products'));
  const p = list.data.products.find((x) => x.slug === 'florence-window-arch-mirror-black');
  assert.equal(p.in_stock, 0);
  const second = await call(orders, req('POST', '/api/orders', { body: checkout({ items: [{ slug: 'florence-window-arch-mirror-black', qty: 1 }] }) }));
  assert.equal(second.status, 400);
  assert.match(second.data.error, /sold out/);
  assert.equal(env.square.calls.filter((c) => c.url === '/v2/payments').length, 1);
  assert.ok((await db.query("SELECT 1 FROM activity_log WHERE action = 'product.sold_out'")).rowCount === 1);
});

test('two buyers racing for the last one: only one is charged', async () => {
  await db.query("UPDATE products SET stock = 1 WHERE slug = 'luxe-ornate-arch-mirror-gold'");
  const items = [{ slug: 'luxe-ornate-arch-mirror-gold', qty: 1 }];
  const [a, b] = await Promise.all([call(orders, req('POST', '/api/orders', { body: checkout({ items }) })), call(orders, req('POST', '/api/orders', { body: checkout({ items }) }))]);
  assert.deepEqual([a.status, b.status].sort(), [200, 400]);
  assert.equal(env.square.calls.filter((c) => c.url === '/v2/payments').length, 1);
  assert.equal(await stock('luxe-ornate-arch-mirror-gold'), 0);
});

test('a declined card saves nothing paid and puts the stock back', async () => {
  const before = await stock('soho-slim-frame-mirror-black');
  const r = await call(orders, req('POST', '/api/orders', { body: checkout({ source_id: 'cnon:card-nonce-declined' }) }));
  assert.equal(r.status, 402);
  assert.match(r.data.error, /declined/);
  assert.equal(await stock('soho-slim-frame-mirror-black'), before);
  const o = (await db.query('SELECT * FROM orders')).rows[0];
  assert.equal(o.payment, 'failed');
  assert.equal(o.stock_taken, false);
  assert.equal(env.resend.sent.length, 0);
});

test('WELCOME10: 10% off a first order, refused on a second paid order', async () => {
  const email = 'first.timer@example.com';
  const a = await call(orders, req('POST', '/api/orders', { body: checkout({ email, discount_code: 'welcome10', items: [{ slug: 'halo-arch-floor-mirror-black', qty: 1 }] }) }));
  assert.equal(a.status, 200);
  assert.equal(a.data.total_cents, 42000 - 4200 + 4900);
  const o = await order(a.data.order_id);
  assert.equal(o.discount_code, 'WELCOME10');
  assert.equal(o.discount, 4200);
  const b = await call(orders, req('POST', '/api/orders', { body: checkout({ email: 'First.Timer@Example.com', discount_code: 'WELCOME10' }) }));
  assert.equal(b.status, 400);
  assert.equal(b.data.field, 'co-code');
  assert.match(b.data.error, /first orders only/);
});

test('WELCOME10 respects an expiry date set in the admin', async () => {
  await db.query("UPDATE discount_codes SET ends = '2020-01-01' WHERE code = 'WELCOME10'");
  const r = await call(orders, req('POST', '/api/orders', { body: checkout({ discount_code: 'WELCOME10' }) }));
  assert.equal(r.status, 400);
  assert.match(r.data.error, /expired/);
  const bogus = await call(orders, req('POST', '/api/orders', { body: checkout({ discount_code: 'FREESTUFF' }) }));
  assert.equal(bogus.status, 400);
  assert.match(bogus.data.error, /isn't valid/);
});

test('a quote request outside the zones takes no payment and holds no stock', async () => {
  const before = await stock('soho-slim-frame-mirror-black');
  const r = await call(orders, req('POST', '/api/orders', { body: checkout({ source_id: undefined, quote_request: true, address: { line1: '8 Lydiard St', suburb: 'Ballarat', state: 'VIC', postcode: '3350' } }) }));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.quote, true);
  assert.equal(r.data.total_cents, 25000);
  assert.equal(env.square.calls.length, 0);
  const o = await order(r.data.order_id);
  assert.equal(o.payment, 'awaiting_quote');
  assert.equal(o.fulfilment, 'on_hold');
  assert.equal(o.zone, 'quote');
  assert.equal(await stock('soho-slim-frame-mirror-black'), before);
  assert.match(env.resend.sent.find((e) => e.to[0] !== 'debbie@example.com').subject, /received your order request/);
});

test('pick-up is free; Zone 2 with five mirrors pays two delivery fees', async () => {
  const p = await call(orders, req('POST', '/api/orders', { body: checkout({ method: 'pickup', address: null }) }));
  assert.equal(p.data.total_cents, 25000);
  assert.equal((await order(p.data.order_id)).address, null);
  await db.query("UPDATE products SET stock = 10 WHERE slug = 'soho-slim-frame-mirror-black'");
  const z2 = await call(orders, req('POST', '/api/orders', { body: checkout({ items: [{ slug: 'soho-slim-frame-mirror-black', qty: 5 }], address: { line1: '1 Barkly St', suburb: 'Footscray', state: 'VIC', postcode: '3011' } }) }));
  assert.equal(z2.data.total_cents, 125000 + 2 * 7900);
});

test('if the total shown differs from the server\'s total, nothing is charged', async () => {
  const r = await call(orders, req('POST', '/api/orders', { body: checkout({ expected_total: 100 }) }));
  assert.equal(r.status, 409);
  assert.match(r.data.error, /changed since the page loaded/);
  assert.equal(env.square.calls.length, 0);
  const ok = await call(orders, req('POST', '/api/orders', { body: checkout({ expected_total: 29900 }) }));
  assert.equal(ok.status, 200);
});

test('checkout details are checked on the server', async () => {
  const cases = [
    [{ email: 'not-an-email' }, 'co-email'],
    [{ phone: '123' }, 'co-phone'],
    [{ name: 'Sarah' }, 'co-first'],
    [{ address: { line1: '', suburb: 'Point Cook', state: 'VIC', postcode: '3030' } }, 'co-line1'],
    [{ address: { line1: '1 St', suburb: 'Point Cook', state: 'VIC', postcode: '30' } }, 'co-postcode'],
    [{ deliveryDay: '2020-01-01' }, 'co-day'],
    [{ source_id: undefined }, 'co-pay'],
    [{ items: [{ slug: 'travertine-mushroom-table-lamp', qty: 1 }] }, 'items']
  ];
  for (const [over, field] of cases) {
    const r = await call(orders, req('POST', '/api/orders', { body: checkout(over) }));
    assert.equal(r.status, 400, JSON.stringify(over));
    assert.equal(r.data.field, field, JSON.stringify(over) + ' ' + JSON.stringify(r.data));
  }
  assert.equal(env.square.calls.length, 0);
});

test('a Sunday delivery day is refused', async () => {
  const today = new Date();
  let d = new Date(today.getTime() + 3 * 86400000);
  while (d.getUTCDay() !== 0) d = new Date(d.getTime() + 86400000);
  const r = await call(orders, req('POST', '/api/orders', { body: checkout({ deliveryDay: d.toISOString().slice(0, 10) }) }));
  assert.equal(r.status, 400);
  assert.match(r.data.error, /Sundays/);
});

test('an email failure doesn\'t fail the order', async () => {
  const saved = process.env.RESEND_API_BASE;
  process.env.RESEND_API_BASE = 'http://127.0.0.1:9'; // nothing listens here
  try {
    const r = await call(orders, req('POST', '/api/orders', { body: checkout() }));
    assert.equal(r.status, 200);
    const o = await order(r.data.order_id);
    assert.equal(o.payment, 'paid');
    assert.ok(o.events.some((e) => /Order confirmation not sent/.test(e.text)));
  } finally { process.env.RESEND_API_BASE = saved; }
});

test('with no email key, orders still work and nothing is sent', async () => {
  const saved = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  try {
    const r = await call(orders, req('POST', '/api/orders', { body: checkout() }));
    assert.equal(r.status, 200);
    assert.equal(env.resend.sent.length, 0);
    assert.ok((await order(r.data.order_id)).events.some((e) => /isn't switched on yet/.test(e.text)));
  } finally { process.env.RESEND_API_KEY = saved; }
});
