// Reading and writing the store's data, and turning database rows into the shapes the shop and admin use.
import { query } from './db.mjs';

// ---------- rows -> shapes ----------
export function adminProduct(r) {
  return {
    id: r.slug, slug: r.slug, title: r.title, category: r.category, price: r.price, compareAt: r.compare_at, cost: r.cost,
    status: r.status, stock: r.stock, lowAt: r.low_at, supplierCode: r.supplier_code, sku: r.sku, weight: r.weight, size: r.size,
    badge: r.badge, bothWays: r.both_ways, images: r.images || [], desc: r.description, specs: r.specs || [],
    tags: r.tags, seoTitle: r.seo_title, seoDesc: r.seo_desc
  };
}
export function shopProduct(r) {
  return {
    slug: r.slug, name: r.title, category: r.category, price_cents: r.price, compare_at_cents: r.compare_at, badge: r.badge,
    desc: r.description, specs: r.specs || [], images: r.images || [], stock: r.stock, in_stock: r.stock == null || r.stock > 0 ? 1 : 0,
    seo_title: r.seo_title || '', seo_desc: r.seo_desc || ''
  };
}
export function adminOrder(r) {
  return {
    id: r.id, number: '#' + r.id, createdAt: new Date(r.created_at).getTime(), customerId: r.email,
    customer: { name: r.name, email: r.email, phone: r.phone }, address: r.address, method: r.method, zone: r.zone,
    deliveryDay: r.delivery_day ? dateOnly(r.delivery_day) : null, lines: r.lines, subtotal: r.subtotal, discountCode: r.discount_code,
    discount: r.discount, delivery: r.delivery, insurance: 0, total: r.total, payment: r.payment, card: r.card, fulfilment: r.fulfilment,
    tracking: r.tracking, note: r.note, events: r.events || [], marketing: r.marketing, refunded: r.refunded || 0,
    receiptUrl: r.square_receipt_url || '', paymentLinkUrl: r.payment_link_url || ''
  };
}
export function adminDiscount(r) {
  return {
    code: r.code, type: r.type, value: r.value, minSpend: r.min_spend, firstOrderOnly: r.first_order_only,
    starts: r.starts ? dateOnly(r.starts) : null, ends: r.ends ? dateOnly(r.ends) : null, limit: r.usage_limit, active: r.active
  };
}
export function dateOnly(d) {
  if (typeof d === 'string') return d.slice(0, 10);
  // pg returns DATE columns as local-midnight Date objects; format in local time to keep the same day.
  const x = new Date(d);
  return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
}

// ---------- reads ----------
export async function getSetting(key, db = { query }) {
  const r = await db.query('SELECT value FROM settings WHERE key = $1', [key]);
  return r.rows[0] ? r.rows[0].value : null;
}
export async function getDiscount(code, db = { query }) {
  const r = await db.query('SELECT * FROM discount_codes WHERE code = $1', [String(code || '').trim().toUpperCase()]);
  return r.rows[0] ? adminDiscount(r.rows[0]) : null;
}
// Paid orders only: a quote that was never paid or a failed payment doesn't use up a first-order code.
const COUNTED = "payment IN ('paid', 'partially_refunded', 'refunded')";
export async function isFirstOrder(email, db = { query }) {
  const r = await db.query('SELECT 1 FROM orders WHERE email = $1 AND ' + COUNTED + ' LIMIT 1', [String(email).toLowerCase()]);
  return r.rowCount === 0;
}
export async function timesUsed(code, db = { query }) {
  const r = await db.query('SELECT count(*)::int AS n FROM orders WHERE discount_code = $1 AND ' + COUNTED, [code]);
  return r.rows[0].n;
}

// ---------- activity log ----------
export async function logActivity(db, { actorType, actor = '', action, entity = '', entityId = '', summary = '', detail = null }) {
  await db.query('INSERT INTO activity_log (actor_type, actor, action, entity, entity_id, summary, detail) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [actorType, actor, action, entity, String(entityId), String(summary).slice(0, 1000), detail == null ? null : JSON.stringify(detail)]);
}

// ---------- order events ----------
export function event(text) {
  return { at: Date.now(), text };
}
export async function addOrderEvents(db, id, events) {
  await db.query("UPDATE orders SET events = events || $2::jsonb, updated_at = now() WHERE id = $1", [id, JSON.stringify(events)]);
}

// Takes the order's mirrors out of stock, once. A tracked product that reaches 0 shows as sold out.
// Returns the slugs that sold out. Throws if there isn't enough stock left.
export async function takeStock(db, order) {
  const soldOut = [];
  for (const l of order.lines) {
    const r = await db.query('UPDATE products SET stock = stock - $2, updated_at = now() WHERE slug = $1 AND stock IS NOT NULL AND stock >= $2 RETURNING stock', [l.slug, l.qty]);
    if (r.rowCount === 0) {
      const cur = await db.query('SELECT stock, title FROM products WHERE slug = $1', [l.slug]);
      if (cur.rows[0] && cur.rows[0].stock == null) continue; // not tracked
      const left = cur.rows[0] ? cur.rows[0].stock : 0;
      throw Object.assign(new Error(left === 0 ? 'Sorry, ' + l.title + ' has just sold out.' : 'Sorry, only ' + left + ' of ' + l.title + ' left.'), { status: 409, code: 'stock' });
    }
    if (r.rows[0].stock === 0) soldOut.push(l.slug);
  }
  await db.query('UPDATE orders SET stock_taken = true WHERE id = $1', [order.id]);
  return soldOut;
}
export async function returnStock(db, order) {
  for (const l of order.lines) {
    await db.query('UPDATE products SET stock = stock + $2, updated_at = now() WHERE slug = $1 AND stock IS NOT NULL', [l.slug, l.qty]);
  }
  await db.query('UPDATE orders SET stock_taken = false WHERE id = $1', [order.id]);
}

export async function upsertCustomer(db, c) {
  await db.query(
    `INSERT INTO customers (email, name, phone, address, marketing) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone,
       address = COALESCE(EXCLUDED.address, customers.address), marketing = customers.marketing OR EXCLUDED.marketing, updated_at = now()`,
    [c.email.toLowerCase(), c.name, c.phone, c.address ? JSON.stringify(c.address) : null, !!c.marketing]);
}
