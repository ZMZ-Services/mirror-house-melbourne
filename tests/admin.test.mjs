// Admin Functions: sign-in checks, saving changes, the activity log, refunds, quotes, uploads and the Square webhook.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import pg from 'pg';
import { setupEnv, resetDb, req, call, checkout, TEST_DB, ADMIN_TOKEN, STAFF_TOKEN } from './helpers.mjs';

let env, fn = {}, db, closePool;
before(async () => {
  env = await setupEnv();
  for (const n of ['admin-state', 'admin-sync', 'admin-upload', 'orders', 'products', 'newsletter', 'square-webhook']) fn[n] = (await import('../netlify/functions/' + n + '.mjs')).default;
  closePool = (await import('../netlify/lib/db.mjs')).closePool;
  db = new pg.Client({ connectionString: TEST_DB });
  await db.connect();
});
after(async () => { await db.end(); await closePool(); await env.close(); });
beforeEach(async () => { await resetDb(); env.square.calls.length = 0; env.resend.sent.length = 0; });

const sync = (body, token = ADMIN_TOKEN) => call(fn['admin-sync'], req('POST', '/api/admin/sync', { body, token }));
const placeOrder = async (over) => (await call(fn.orders, req('POST', '/api/orders', { body: checkout(over) }))).data.order_id;

test('every admin route refuses signed-out, forged and non-admin users', async () => {
  const routes = [['admin-state', 'GET', '/api/admin/state'], ['admin-sync', 'POST', '/api/admin/sync'], ['admin-upload', 'POST', '/api/admin/uploads']];
  for (const [name, method, path] of routes) {
    const body = method === 'POST' ? {} : undefined;
    const none = await call(fn[name], req(method, path, { body }));
    assert.equal(none.status, 401, name + ' signed out');
    const forged = await call(fn[name], req(method, path, { body, token: 'forged-token-cccccccccccccccccccccc' }));
    assert.equal(forged.status, 401, name + ' forged');
    const staff = await call(fn[name], req(method, path, { body, token: STAFF_TOKEN }));
    assert.equal(staff.status, 403, name + ' not an admin');
  }
  // ADMIN_EMAILS also grants access.
  process.env.ADMIN_EMAILS = 'someone@example.com';
  try {
    const ok = await call(fn['admin-state'], req('GET', '/api/admin/state', { token: STAFF_TOKEN }));
    assert.equal(ok.status, 200);
  } finally { delete process.env.ADMIN_EMAILS; }
});

test('signed in, the admin sees products, orders, settings and the mailing list', async () => {
  const id = await placeOrder();
  await call(fn.newsletter, req('POST', '/api/newsletter', { body: { email: 'Fan@Example.com' } }));
  const s = await call(fn['admin-state'], req('GET', '/api/admin/state', { token: ADMIN_TOKEN }));
  assert.equal(s.status, 200);
  assert.equal(s.data.products.length, 48);
  assert.equal(s.data.orders.length, 1);
  assert.equal(s.data.orders[0].id, id);
  assert.equal(s.data.orders[0].number, '#' + id);
  assert.equal(s.data.settings.storeName, 'Mirror House Melbourne');
  assert.equal(s.data.shipping.zones.length, 3);
  assert.deepEqual(s.data.subscribers.map((x) => x.email), ['fan@example.com']);
  assert.equal(s.data.user.email, 'debbie@example.com');
  assert.equal(s.data.integrations.square, 'Connected (sandbox test mode)');
  assert.ok(s.data.activity.some((a) => a.action === 'newsletter.joined'));
  assert.ok(Array.isArray(s.data.traffic.days));
});

test('editing a product saves it, shows in the shop, and is in the activity log', async () => {
  const r = await sync({ products: { upsert: [{ slug: 'soho-slim-frame-mirror-black', fields: { title: 'Soho Slim Mirror – Black', price: 27500 } }] } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const shop = await call(fn.products, req('GET', '/api/products'));
  const p = shop.data.products.find((x) => x.slug === 'soho-slim-frame-mirror-black');
  assert.equal(p.name, 'Soho Slim Mirror – Black');
  assert.equal(p.price_cents, 27500);
  const log = (await db.query("SELECT * FROM activity_log WHERE action = 'product.updated'")).rows;
  assert.equal(log.length, 1);
  assert.equal(log[0].actor, 'debbie@example.com');
  assert.equal(log[0].entity_id, 'soho-slim-frame-mirror-black');
  assert.deepEqual(log[0].detail.price, { from: 25000, to: 27500 });
  assert.match(log[0].summary, /title, price/);
  // The fresh state comes back with the change.
  assert.equal(r.data.state.products.find((x) => x.slug === 'soho-slim-frame-mirror-black').price, 27500);
});

test('a stock adjustment is added to live stock, so a sale made meanwhile isn\'t lost', async () => {
  // The admin loaded stock 8 and adds 2 (8 -> 10); meanwhile a customer bought 1 (8 -> 7). Result: 9.
  await placeOrder({ items: [{ slug: 'soho-slim-frame-mirror-black', qty: 1 }] });
  await sync({ products: { upsert: [{ slug: 'soho-slim-frame-mirror-black', fields: { stock: 10 }, stockDelta: 2 }] } });
  assert.equal((await db.query("SELECT stock FROM products WHERE slug = 'soho-slim-frame-mirror-black'")).rows[0].stock, 9);
});

test('new products, duplicates of a handle, bad values and deletes', async () => {
  const add = await sync({ products: { upsert: [{ slug: 'test-mirror', isNew: true, fields: { title: 'Test Mirror', price: 10000, category: 'Wall Mirrors', status: 'draft', stock: 3, images: ['images/hero.jpg'] } }] } });
  assert.equal(add.status, 200, JSON.stringify(add.data));
  const again = await sync({ products: { upsert: [{ slug: 'test-mirror', isNew: true, fields: { title: 'Again', price: 1 } }] } });
  assert.equal(again.status, 400);
  assert.match(again.data.error, /already uses the URL handle/);
  const badPrice = await sync({ products: { upsert: [{ slug: 'test-mirror', fields: { price: -5 } }] } });
  assert.equal(badPrice.status, 400);
  const badImage = await sync({ products: { upsert: [{ slug: 'test-mirror', fields: { images: ['data:image/png;base64,AAAA'] } }] } });
  assert.equal(badImage.status, 400);
  const evilImage = await sync({ products: { upsert: [{ slug: 'test-mirror', fields: { images: ['javascript:alert(1)'] } }] } });
  assert.equal(evilImage.status, 400);
  // Draft products don't show in the shop.
  const shop = await call(fn.products, req('GET', '/api/products'));
  assert.ok(!shop.data.products.some((x) => x.slug === 'test-mirror'));
  const del = await sync({ products: { delete: ['test-mirror'] } });
  assert.equal(del.status, 200);
  assert.equal((await db.query("SELECT 1 FROM products WHERE slug = 'test-mirror'")).rowCount, 0);
  const actions = (await db.query('SELECT action FROM activity_log ORDER BY id')).rows.map((r) => r.action);
  assert.deepEqual(actions, ['product.created', 'product.deleted']);
});

test('settings, shipping zones, discounts, customer notes and mailing list removals', async () => {
  await placeOrder({ email: 'note.me@example.com' });
  await call(fn.newsletter, req('POST', '/api/newsletter', { body: { email: 'bye@example.com' } }));
  const s = (await call(fn['admin-state'], req('GET', '/api/admin/state', { token: ADMIN_TOKEN }))).data;
  const shipping = JSON.parse(JSON.stringify(s.shipping));
  shipping.zones[0].price = 5500;
  const r = await sync({
    settings: { ...s.settings, gaId: 'G-TEST1234', gstRegistered: true },
    shipping,
    discounts: { upsert: [{ code: 'spring15', type: 'pct', value: 15, minSpend: 20000, firstOrderOnly: false, ends: '2027-01-31', active: true }] },
    customerNotes: { 'note.me@example.com': 'Prefers Saturday delivery' },
    subscribers: { delete: ['bye@example.com'] }
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const st = r.data.state;
  assert.equal(st.settings.gaId, 'G-TEST1234');
  assert.equal(st.shipping.zones[0].price, 5500);
  assert.ok(st.discounts.some((d) => d.code === 'SPRING15' && d.value === 15 && d.ends === '2027-01-31'));
  assert.equal(st.customerNotes['note.me@example.com'], 'Prefers Saturday delivery');
  assert.equal(st.subscribers.length, 0);
  const actions = new Set((await db.query('SELECT action FROM activity_log').then((x) => x.rows)).map((x) => x.action));
  for (const a of ['settings.updated', 'shipping.updated', 'discount.created', 'customer.note', 'subscriber.removed']) assert.ok(actions.has(a), a);
  // The new zone price is what the checkout now charges.
  const o = await call(fn.orders, req('POST', '/api/orders', { body: checkout() }));
  assert.equal(o.data.total_cents, 25000 + 5500);
  const badGa = await sync({ settings: { ...s.settings, gaId: 'UA-123' } });
  assert.equal(badGa.status, 400);
});

test('fulfilment, timeline notes and the customer update email', async () => {
  const id = await placeOrder();
  env.resend.sent.length = 0;
  const r = await sync({ orders: [{ id, set: { fulfilment: 'out_for_delivery', tracking: 'Our van' }, addEvents: [{ at: Date.now(), text: 'Called to confirm' }], notify: 'out_for_delivery' }] });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const o = r.data.state.orders.find((x) => x.id === id);
  assert.equal(o.fulfilment, 'out_for_delivery');
  assert.equal(o.tracking, 'Our van');
  assert.ok(o.events.some((e) => e.text === 'Called to confirm'));
  assert.ok(o.events.some((e) => /Update email sent/.test(e.text)));
  assert.equal(env.resend.sent.length, 1);
  assert.equal(env.resend.sent[0].subject, 'Your mirror is on its way');
  const bad = await sync({ orders: [{ id, set: { fulfilment: 'teleported' } }] });
  assert.equal(bad.status, 400);
});

test('refunds go through Square for the amount entered', async () => {
  const id = await placeOrder();
  const r = await sync({ orders: [{ id, set: { payment: 'partially_refunded', refunded: 5000 }, refundReason: 'Small chip' }] });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const refunds = env.square.calls.filter((c) => c.url === '/v2/refunds');
  assert.equal(refunds.length, 1);
  assert.equal(refunds[0].body.amount_money.amount, 5000);
  assert.equal(refunds[0].body.payment_id, 'pay_1');
  let o = r.data.state.orders[0];
  assert.equal(o.payment, 'partially_refunded');
  assert.equal(o.refunded, 5000);
  // Refunding the rest: only the remaining amount goes to Square.
  const rest = await sync({ orders: [{ id, set: { payment: 'refunded', refunded: o.total } }] });
  assert.equal(rest.status, 200);
  assert.equal(env.square.calls.filter((c) => c.url === '/v2/refunds')[1].body.amount_money.amount, o.total - 5000);
  o = rest.data.state.orders[0];
  assert.equal(o.payment, 'refunded');
  const tooMuch = await sync({ orders: [{ id, set: { payment: 'refunded', refunded: o.total + 1 } }] });
  assert.equal(tooMuch.status, 400);
});

test('quote flow: send quote with a Square link, then Square\'s webhook confirms payment and takes stock', async () => {
  const id = (await call(fn.orders, req('POST', '/api/orders', { body: checkout({ source_id: undefined, address: { line1: '41 Pall Mall', suburb: 'Bendigo', state: 'VIC', postcode: '3550' } }) }))).data.order_id;
  const before = (await db.query("SELECT stock FROM products WHERE slug = 'soho-slim-frame-mirror-black'")).rows[0].stock;
  env.resend.sent.length = 0;
  const q = await sync({ orders: [{ id, set: { payment: 'quote_sent', delivery: 18000 }, quoteMessage: 'We deliver to Bendigo on Fridays.' }] });
  assert.equal(q.status, 200, JSON.stringify(q.data));
  let o = q.data.state.orders[0];
  assert.equal(o.payment, 'quote_sent');
  assert.equal(o.delivery, 18000);
  assert.equal(o.total, 25000 + 18000);
  assert.match(o.paymentLinkUrl, /^https:\/\/square\.link\//);
  const link = env.square.calls.find((c) => c.url === '/v2/online-checkout/payment-links');
  assert.equal(link.body.quick_pay.price_money.amount, 43000);
  assert.equal(env.resend.sent.length, 1);
  assert.match(env.resend.sent[0].html, /Fridays/);
  assert.match(env.resend.sent[0].html, /square\.link/);

  const sqOrder = (await db.query('SELECT square_order_id FROM orders WHERE id = $1', [id])).rows[0].square_order_id;
  const payload = JSON.stringify({ type: 'payment.updated', data: { object: { payment: { id: 'pay_link', status: 'COMPLETED', order_id: sqOrder, amount_money: { amount: 43000, currency: 'AUD' }, card_details: { card: { card_brand: 'MASTERCARD', last_4: '4444' } } } } } });
  const url = 'https://shop.example.com/api/square/webhook';
  const forged = await fn['square-webhook'](req('POST', '/api/square/webhook', { body: payload, headers: { 'x-square-hmacsha256-signature': 'nope' } }));
  assert.equal(forged.status, 403);
  const sig = createHmac('sha256', 'test-signature-key').update(url + payload).digest('base64');
  const ok = await fn['square-webhook'](req('POST', '/api/square/webhook', { body: payload, headers: { 'x-square-hmacsha256-signature': sig } }));
  assert.equal(ok.status, 200);
  const row = (await db.query('SELECT * FROM orders WHERE id = $1', [id])).rows[0];
  assert.equal(row.payment, 'paid');
  assert.equal(row.fulfilment, 'unfulfilled');
  assert.equal(row.card, 'MASTERCARD ending 4444');
  assert.equal(row.stock_taken, true);
  assert.equal((await db.query("SELECT stock FROM products WHERE slug = 'soho-slim-frame-mirror-black'")).rows[0].stock, before - 1);
  // Sent twice by Square: no double stock change.
  await fn['square-webhook'](req('POST', '/api/square/webhook', { body: payload, headers: { 'x-square-hmacsha256-signature': sig } }));
  assert.equal((await db.query("SELECT stock FROM products WHERE slug = 'soho-slim-frame-mirror-black'")).rows[0].stock, before - 1);
});

test('quote marked paid by hand, or cancelled', async () => {
  const quote = () => call(fn.orders, req('POST', '/api/orders', { body: checkout({ source_id: undefined, address: { line1: '1 Main Rd', suburb: 'Ballarat', state: 'VIC', postcode: '3350' } }) })).then((r) => r.data.order_id);
  const a = await quote(), b = await quote();
  const r = await sync({ orders: [{ id: a, set: { payment: 'paid', fulfilment: 'unfulfilled', card: 'Square payment link' } }, { id: b, set: { payment: 'voided', fulfilment: 'cancelled' } }] });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const byId = Object.fromEntries(r.data.state.orders.map((o) => [o.id, o]));
  assert.equal(byId[a].payment, 'paid');
  assert.equal(byId[b].payment, 'voided');
  assert.equal(byId[b].fulfilment, 'cancelled');
  // A refunded order can't be "un-refunded".
  const c = await sync({ orders: [{ id: b, set: { payment: 'paid' } }] });
  assert.equal(c.status, 400);
});

test('photo uploads: images only, and they are served back from /media/', async () => {
  const { BlobsServer } = await import('@netlify/blobs/server');
  const { mkdtempSync } = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const server = new BlobsServer({ directory: mkdtempSync(path.join(os.tmpdir(), 'blobs-')), token: 'local', port: 0 });
  const { port } = await server.start();
  process.env.MH_BLOBS_API_URL = 'http://127.0.0.1:' + port;
  try {
    const media = (await import('../netlify/functions/media.mjs')).default;
    const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
    const up = await call(fn['admin-upload'], req('POST', '/api/admin/uploads', { body: png, token: ADMIN_TOKEN, headers: { 'content-type': 'image/png' } }));
    assert.equal(up.status, 201, JSON.stringify(up.data));
    assert.match(up.data.url, /^\/media\/\d{4}-\d{2}\/[0-9a-f-]{36}\.png$/);
    const got = await media(new Request('https://shop.example.com' + up.data.url));
    assert.equal(got.status, 200);
    assert.equal(got.headers.get('content-type'), 'image/png');
    assert.equal((await got.arrayBuffer()).byteLength, png.byteLength);
    const notImage = await call(fn['admin-upload'], req('POST', '/api/admin/uploads', { body: '<svg onload=alert(1)>', token: ADMIN_TOKEN, headers: { 'content-type': 'image/svg+xml' } }));
    assert.equal(notImage.status, 415);
    const missing = await media(new Request('https://shop.example.com/media/../../etc/passwd'));
    assert.equal(missing.status, 404);
    // The uploaded photo can now be used on a product.
    const r = await sync({ products: { upsert: [{ slug: 'soho-slim-frame-mirror-black', fields: { images: [up.data.url, 'images/products/soho-slim-frame-mirror-black.jpg'] } }] } });
    assert.equal(r.status, 200);
  } finally {
    delete process.env.MH_BLOBS_API_URL;
    await server.stop();
  }
});
