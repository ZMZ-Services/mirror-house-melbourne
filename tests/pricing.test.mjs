// Pricing rules, checked without a database: zones, delivery loads, pick-up, quotes, discount codes and stock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceOrder, zoneForPostcode, checkDiscount, melbourneDate } from '../netlify/lib/pricing.mjs';
import { readClientData } from '../scripts/lib-client-data.mjs';

const { admin } = readClientData('public');
const shipping = admin.shipping; // Debbie's real zones
const products = Object.fromEntries(admin.products.map((p) => [p.slug, { slug: p.slug, title: p.title, price: p.price, stock: p.stock, status: p.status, category: p.category }]));
const W10 = { code: 'WELCOME10', type: 'pct', value: 10, minSpend: 0, firstOrderOnly: true, starts: null, ends: null, limit: null, active: true };
const one = (slug, qty = 1) => [{ slug, qty }];

test('postcodes map to Debbie\'s zones, suburb matches first', () => {
  assert.equal(zoneForPostcode('3030', shipping.zones).id, 'z1');          // Point Cook
  assert.equal(zoneForPostcode('3011', shipping.zones).id, 'z2');          // Footscray
  assert.equal(zoneForPostcode('3122', shipping.zones).id, 'z3');          // Hawthorn
  assert.equal(zoneForPostcode('3029', shipping.zones, 'Tarneit').id, 'z2'); // split postcode, by suburb
  assert.equal(zoneForPostcode('3029', shipping.zones, 'Hoppers Crossing').id, 'z1');
  assert.equal(zoneForPostcode('3350', shipping.zones), null);             // Ballarat: outside
  assert.equal(zoneForPostcode('30', shipping.zones), null);
});

test('delivery is the zone price, one fee per 4 mirrors', () => {
  const r = priceOrder({ items: one('soho-slim-frame-mirror-black'), method: 'delivery', postcode: '3030' }, products, shipping, null);
  assert.equal(r.ok, true);
  assert.equal(r.subtotal, 25000);
  assert.equal(r.delivery, 4900);
  assert.equal(r.total, 29900);
  const five = priceOrder({ items: one('soho-slim-frame-mirror-black', 5), method: 'delivery', postcode: '3011' }, products, shipping, null);
  assert.equal(five.delivery, 7900 * 2);
  assert.equal(five.total, 25000 * 5 + 15800);
});

test('pick-up is free; outside the zones is a quote with no delivery charge', () => {
  const p = priceOrder({ items: one('soho-slim-frame-mirror-black'), method: 'pickup' }, products, shipping, null);
  assert.equal(p.delivery, 0);
  assert.equal(p.total, 25000);
  const q = priceOrder({ items: one('soho-slim-frame-mirror-black'), method: 'delivery', postcode: '3350', suburb: 'Ballarat' }, products, shipping, null);
  assert.equal(q.quote, true);
  assert.equal(q.delivery, 0);
  assert.equal(q.total, 25000);
  const noQuotes = priceOrder({ items: one('soho-slim-frame-mirror-black'), method: 'delivery', postcode: '3350' }, products, { ...shipping, quoteBeyond: false }, null);
  assert.equal(noQuotes.ok, false);
});

test('WELCOME10 takes 10% off the mirrors only, first order only', () => {
  const r = priceOrder({ items: one('halo-arch-floor-mirror-black'), method: 'delivery', postcode: '3030' }, products, shipping, { rule: W10, isFirstOrder: true });
  assert.equal(r.subtotal, 42000);
  assert.equal(r.discount, 4200);
  assert.equal(r.delivery, 4900);
  assert.equal(r.total, 42700); // matches the example in her emails.html
  const again = priceOrder({ items: one('halo-arch-floor-mirror-black'), method: 'delivery', postcode: '3030' }, products, shipping, { rule: W10, isFirstOrder: false });
  assert.equal(again.ok, false);
  assert.match(again.error, /first orders only/);
});

test('discount dates, minimum spend, limits and fixed amounts', () => {
  const now = new Date('2026-11-14T02:00:00Z'); // 1pm, 14 Nov in Melbourne
  assert.equal(melbourneDate(now), '2026-11-14');
  assert.match(checkDiscount({ ...W10, ends: '2026-11-13' }, { subtotal: 10000, now }).error, /expired/);
  assert.equal(checkDiscount({ ...W10, ends: '2026-11-14' }, { subtotal: 10000, now }).amount, 1000); // last day still works
  assert.match(checkDiscount({ ...W10, starts: '2026-11-15' }, { subtotal: 10000, now }).error, /isn't available yet/);
  assert.match(checkDiscount({ ...W10, active: false }, { subtotal: 10000, now }).error, /isn't active/);
  assert.match(checkDiscount({ ...W10, minSpend: 50000 }, { subtotal: 10000, now }).error, /Spend \$500\.00/);
  assert.match(checkDiscount({ ...W10, limit: 3 }, { subtotal: 10000, now, timesUsed: 3 }).error, /fully used/);
  assert.equal(checkDiscount({ ...W10, type: 'fixed', value: 5000 }, { subtotal: 3000, now }).amount, 3000); // never more than the mirrors
  // Melbourne midnight: 11:30pm UTC on the 13th is already the 14th in Melbourne.
  assert.match(checkDiscount({ ...W10, ends: '2026-11-13' }, { subtotal: 10000, now: new Date('2026-11-13T23:30:00Z') }).error, /expired/);
});

test('stock: sold out and not enough left are refused; untracked stock is unlimited', () => {
  const sold = priceOrder({ items: one('riviera-rounded-floor-mirror-gold'), method: 'pickup' }, products, shipping, null);
  assert.equal(sold.ok, false);
  assert.match(sold.error, /sold out/);
  const many = priceOrder({ items: one('cathedral-arch-window-mirror-black', 3), method: 'pickup' }, products, shipping, null);
  assert.match(many.error, /only 2 of/);
  const untracked = { ...products, x: { slug: 'x', title: 'X', price: 100, stock: null, status: 'active', category: 'Wall Mirrors' } };
  assert.equal(priceOrder({ items: one('x', 20), method: 'pickup' }, untracked, shipping, null).ok, true);
});

test('bad items are refused: unknown, hidden, archived, silly quantities', () => {
  const hidden = { ...products, lamp: { slug: 'lamp', title: 'Lamp', price: 100, stock: null, status: 'active', category: 'Lighting' } };
  assert.equal(priceOrder({ items: one('nope'), method: 'pickup' }, products, shipping, null).ok, false);
  assert.equal(priceOrder({ items: one('lamp'), method: 'pickup' }, hidden, shipping, null).ok, false);
  assert.equal(priceOrder({ items: [{ slug: 'soho-slim-frame-mirror-black', qty: 0 }], method: 'pickup' }, products, shipping, null).ok, false);
  assert.equal(priceOrder({ items: [{ slug: 'soho-slim-frame-mirror-black', qty: 1.5 }], method: 'pickup' }, products, shipping, null).ok, false);
  assert.equal(priceOrder({ items: [{ slug: 'soho-slim-frame-mirror-black', qty: 21 }], method: 'pickup' }, products, shipping, null).ok, false);
  assert.equal(priceOrder({ items: [], method: 'pickup' }, products, shipping, null).ok, false);
  // The same mirror twice is added together before the stock check.
  const twice = priceOrder({ items: [{ slug: 'cathedral-arch-window-mirror-black', qty: 2 }, { slug: 'cathedral-arch-window-mirror-black', qty: 1 }], method: 'pickup' }, products, shipping, null);
  assert.equal(twice.ok, false);
});
