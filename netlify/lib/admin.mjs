// The admin's data: one call loads everything the admin shows (GET /api/admin/state), and changes made in the
// admin come back as a list of what changed (POST /api/admin/sync). Every change is checked here, saved, and
// written to the activity log with who made it and what it was before.
import { query, tx } from './db.mjs';
import { adminProduct, adminOrder, adminDiscount, getSetting, logActivity, event, takeStock, returnStock } from './store.mjs';
import { trafficSummary } from './traffic.mjs';
import { squareConfigured, squareEnv, refundPayment, createPaymentLink } from './square.mjs';
import { emailConfigured, sendEmail, deliveryQuote, fulfilmentUpdate, orderConfirmation } from './email.mjs';
import { money } from './pricing.mjs';
import { siteUrl } from './http.mjs';

const bad = (message, status = 400) => Object.assign(new Error(message), { status });

// ---------- state ----------
export async function loadState(user) {
  const [p, o, d, s, c, sub, act] = await Promise.all([
    query('SELECT * FROM products ORDER BY sort_order, created_at, slug'),
    query("SELECT * FROM orders WHERE payment <> 'pending' OR created_at < now() - interval '10 minutes' ORDER BY id"),
    query('SELECT * FROM discount_codes ORDER BY sort_order, created_at'),
    query("SELECT key, value FROM settings WHERE key IN ('store', 'shipping')"),
    query("SELECT email, note FROM customers WHERE note <> ''"),
    query('SELECT * FROM subscribers ORDER BY joined_at DESC'),
    query('SELECT * FROM activity_log ORDER BY at DESC, id DESC LIMIT 300')
  ]);
  const settings = {};
  s.rows.forEach((r) => { settings[r.key] = r.value; });
  const traffic = await trafficSummary({ query });
  return {
    version: 2, sampleData: false, live: true,
    products: p.rows.map(adminProduct),
    // Failed card payments stay out of the orders list; they're in the activity log.
    orders: o.rows.filter((r) => r.payment !== 'failed').map(adminOrder),
    discounts: d.rows.map(adminDiscount),
    settings: settings.store || {},
    shipping: settings.shipping || { zones: [] },
    customerNotes: Object.fromEntries(c.rows.map((r) => [r.email, r.note])),
    subscribers: sub.rows.map((r) => ({ email: r.email, joinedAt: new Date(r.joined_at).getTime(), source: r.source })),
    activity: act.rows.map((r) => ({ id: Number(r.id), at: new Date(r.at).getTime(), actorType: r.actor_type, actor: r.actor, action: r.action, entity: r.entity, entityId: r.entity_id, summary: r.summary, detail: r.detail })),
    traffic,
    integrations: {
      square: squareConfigured() ? (squareEnv() === 'production' ? 'Connected' : 'Connected (sandbox test mode)') : 'Not connected',
      email: emailConfigured() ? 'Connected' : 'Not connected',
      identity: 'Connected'
    },
    user: user ? { email: user.email, name: user.name } : null
  };
}

// ---------- validation ----------
const STATUS = ['active', 'draft', 'archived'];
function cents(v, { nullable = true } = {}) {
  if (v == null || v === '') { if (nullable) return null; throw bad('A price is missing.'); }
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 100_000_000) throw bad('A price isn\'t valid.');
  return n;
}
function count(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 100000) throw bad('A stock number isn\'t valid.');
  return n;
}
function text(v, max) { return String(v == null ? '' : v).slice(0, max); }
function image(v) {
  const s = String(v || '');
  if (/^images\/[A-Za-z0-9/_.-]+$/.test(s) || /^\/media\/[A-Za-z0-9/_.-]+$/.test(s)) return s;
  throw bad('A product photo hasn\'t finished uploading. Please try saving again.');
}
// Product fields the admin can change, as database columns.
const PRODUCT_FIELDS = {
  title: ['title', (v) => { const t = text(v, 200).trim(); if (!t) throw bad('Add a title.'); return t; }],
  category: ['category', (v) => text(v, 80).trim() || 'Wall Mirrors'],
  price: ['price', (v) => cents(v, { nullable: false })],
  compareAt: ['compare_at', cents],
  cost: ['cost', cents],
  status: ['status', (v) => { if (!STATUS.includes(v)) throw bad('Choose a status.'); return v; }],
  lowAt: ['low_at', count],
  supplierCode: ['supplier_code', (v) => text(v, 80)],
  sku: ['sku', (v) => text(v, 80)],
  weight: ['weight', (v) => text(v, 40)],
  size: ['size', (v) => text(v, 120)],
  badge: ['badge', (v) => text(v, 20)],
  bothWays: ['both_ways', (v) => !!v],
  images: ['images', (v) => JSON.stringify((Array.isArray(v) ? v : []).slice(0, 20).map(image))],
  desc: ['description', (v) => text(v, 5000)],
  specs: ['specs', (v) => JSON.stringify((Array.isArray(v) ? v : []).slice(0, 30).map((x) => text(x, 300)))],
  tags: ['tags', (v) => text(v, 300)],
  seoTitle: ['seo_title', (v) => text(v, 70)],
  seoDesc: ['seo_desc', (v) => text(v, 320)]
};

const STORE_KEYS = ['storeName', 'email', 'phone1', 'phone2', 'address', 'legalName', 'abn', 'hours', 'currency', 'gstIncluded', 'gstRegistered', 'gaId'];
function cleanStore(s, prev) {
  const out = Object.assign({}, prev);
  for (const k of STORE_KEYS) if (k in s) out[k] = typeof prev[k] === 'boolean' || k === 'gstRegistered' || k === 'gstIncluded' ? !!s[k] : text(s[k], 200);
  if (out.gaId && !/^G-[A-Z0-9]{4,}$/i.test(out.gaId)) throw bad('That doesn\'t look like a Google Analytics Measurement ID.');
  if (out.abn && !/^\d{2} ?\d{3} ?\d{3} ?\d{3}$/.test(out.abn)) throw bad('An ABN has 11 digits.');
  return out;
}
function cleanShipping(s) {
  const zones = (Array.isArray(s.zones) ? s.zones : []).slice(0, 20).map((z, i) => ({
    id: /^[a-z0-9-]{1,20}$/i.test(String(z.id || '')) ? String(z.id) : 'z' + (i + 1),
    name: text(z.name, 60) || 'Zone ' + (i + 1), areas: text(z.areas, 2000), price: cents(z.price, { nullable: false }), postcodes: text(z.postcodes, 4000)
  }));
  const pu = s.pickup || {};
  return {
    zones, quoteBeyond: !!s.quoteBeyond,
    pickup: { enabled: !!pu.enabled, location: text(pu.location, 200), instructions: text(pu.instructions, 1000) },
    timeframe: text(s.timeframe, 80), redeliveryFee: s.redeliveryFee == null ? null : cents(s.redeliveryFee)
  };
}
function cleanDiscount(d) {
  const code = String(d.code || '').trim().toUpperCase();
  if (!/^[A-Z0-9_-]{2,40}$/.test(code)) throw bad('A discount code can use letters, numbers, dashes and underscores.');
  const type = d.type === 'fixed' ? 'fixed' : 'pct';
  const value = Number(d.value);
  if (!Number.isInteger(value) || value < 0 || (type === 'pct' && value > 100)) throw bad('The discount amount for ' + code + ' isn\'t valid.');
  const day = (v) => (v ? (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : (() => { throw bad('A discount date isn\'t valid.'); })()) : null);
  return { code, type, value, minSpend: cents(d.minSpend) || 0, firstOrderOnly: !!d.firstOrderOnly, starts: day(d.starts), ends: day(d.ends || d.expires), limit: d.limit == null || d.limit === '' ? null : count(d.limit), active: d.active !== false };
}
function diffKeys(a, b) {
  return Object.keys(Object.assign({}, a, b)).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}

// ---------- sync ----------
// changes: { products: { upsert: [{ slug, isNew, fields, stockDelta }], delete: [slug] }, discounts: { upsert: [...], delete: [code] },
//            settings, shipping, customerNotes: { email: note }, subscribers: { delete: [email] }, orders: [{ id, set, addEvents, notify, quoteMessage, refundReason }] }
export async function applySync(changes, user) {
  const who = { actorType: 'admin', actor: user.email };
  const notes = [];

  await tx(async (db) => {
    // Products
    const pc = changes.products || {};
    for (const u of (pc.upsert || []).slice(0, 200)) {
      const slug = String(u.slug || '');
      if (!/^[a-z0-9-]{1,80}$/.test(slug)) throw bad('A product URL handle can only use lower-case letters, numbers and dashes.');
      const f = u.fields || {};
      const before = (await db.query('SELECT * FROM products WHERE slug = $1 FOR UPDATE', [slug])).rows[0];
      if (u.isNew || !before) {
        if (before) throw bad('Another product already uses the URL handle "' + slug + '". Change the handle.');
        const cols = ['slug'], vals = [slug];
        for (const [k, [col, fn]] of Object.entries(PRODUCT_FIELDS)) if (k in f) { cols.push(col); vals.push(fn(f[k])); }
        if (!('title' in f) || !('price' in f)) throw bad('A new product needs a title and a price.');
        cols.push('stock'); vals.push(count(f.stock));
        cols.push('sort_order'); vals.push(-Math.floor(Date.now() / 1000)); // newest first, as in the admin
        await db.query('INSERT INTO products (' + cols.join(', ') + ') VALUES (' + cols.map((_, i) => '$' + (i + 1)).join(', ') + ')', vals);
        await logActivity(db, { ...who, action: 'product.created', entity: 'product', entityId: slug, summary: 'Added product ' + (f.title || slug), detail: { after: f } });
        continue;
      }
      const sets = [], vals = [slug], changed = {};
      for (const [k, [col, fn]] of Object.entries(PRODUCT_FIELDS)) {
        if (!(k in f)) continue;
        const v = fn(f[k]);
        vals.push(v); sets.push(col + ' = $' + vals.length);
        changed[k] = { from: adminProduct(before)[k], to: f[k] };
      }
      // Stock: an adjustment (e.g. +2 back in stock) is added to the current stock, so a sale made while the admin
      // was open isn't overwritten. Turning stock tracking on or off sets it outright.
      if ('stock' in f || u.stockDelta != null) {
        if (u.stockDelta != null && before.stock != null && f.stock != null) {
          const delta = Number(u.stockDelta);
          if (!Number.isInteger(delta)) throw bad('A stock number isn\'t valid.');
          vals.push(delta); sets.push('stock = GREATEST(0, stock + $' + vals.length + ')');
          changed.stock = { from: before.stock, to: Math.max(0, before.stock + delta), change: delta };
        } else {
          vals.push(count(f.stock)); sets.push('stock = $' + vals.length);
          changed.stock = { from: before.stock, to: f.stock };
        }
      }
      if (!sets.length) continue;
      await db.query('UPDATE products SET ' + sets.join(', ') + ', updated_at = now() WHERE slug = $1', vals);
      const names = Object.keys(changed).map((k) => ({ title: 'title', price: 'price', stock: 'stock', status: 'status', desc: 'description', images: 'photos', specs: 'details' }[k] || k));
      await logActivity(db, { ...who, action: 'product.updated', entity: 'product', entityId: slug, summary: 'Edited ' + before.title + ': ' + names.join(', '), detail: changed });
    }
    for (const slug of (pc.delete || []).slice(0, 50)) {
      const r = await db.query('DELETE FROM products WHERE slug = $1 RETURNING title', [String(slug)]);
      if (r.rowCount) await logActivity(db, { ...who, action: 'product.deleted', entity: 'product', entityId: slug, summary: 'Deleted product ' + r.rows[0].title });
    }

    // Discount codes
    const dc = changes.discounts || {};
    for (const raw of (dc.upsert || []).slice(0, 50)) {
      const d = cleanDiscount(raw);
      const prev = (await db.query('SELECT * FROM discount_codes WHERE code = $1', [d.code])).rows[0];
      await db.query(`INSERT INTO discount_codes (code, type, value, min_spend, first_order_only, starts, ends, usage_limit, active)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (code) DO UPDATE SET type = EXCLUDED.type, value = EXCLUDED.value, min_spend = EXCLUDED.min_spend,
        first_order_only = EXCLUDED.first_order_only, starts = EXCLUDED.starts, ends = EXCLUDED.ends, usage_limit = EXCLUDED.usage_limit, active = EXCLUDED.active, updated_at = now()`,
      [d.code, d.type, d.value, d.minSpend, d.firstOrderOnly, d.starts, d.ends, d.limit, d.active]);
      await logActivity(db, { ...who, action: prev ? 'discount.updated' : 'discount.created', entity: 'discount', entityId: d.code, summary: (prev ? 'Edited' : 'Created') + ' discount ' + d.code, detail: { before: prev ? adminDiscount(prev) : null, after: d } });
    }
    for (const code of (dc.delete || []).slice(0, 50)) {
      const r = await db.query('DELETE FROM discount_codes WHERE code = $1', [String(code).toUpperCase()]);
      if (r.rowCount) await logActivity(db, { ...who, action: 'discount.deleted', entity: 'discount', entityId: code, summary: 'Deleted discount ' + code });
    }

    // Store settings and shipping
    if (changes.settings) {
      const prev = (await getSetting('store', db)) || {};
      const next = cleanStore(changes.settings, prev);
      const keys = diffKeys(prev, next);
      if (keys.length) {
        await db.query("INSERT INTO settings (key, value) VALUES ('store', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()", [JSON.stringify(next)]);
        await logActivity(db, { ...who, action: 'settings.updated', entity: 'settings', entityId: 'store', summary: 'Changed store settings: ' + keys.join(', '), detail: Object.fromEntries(keys.map((k) => [k, { from: prev[k], to: next[k] }])) });
      }
    }
    if (changes.shipping) {
      const prev = (await getSetting('shipping', db)) || {};
      const next = cleanShipping(changes.shipping);
      const keys = diffKeys(prev, next);
      if (keys.length) {
        await db.query("INSERT INTO settings (key, value) VALUES ('shipping', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()", [JSON.stringify(next)]);
        await logActivity(db, { ...who, action: 'shipping.updated', entity: 'settings', entityId: 'shipping', summary: 'Changed shipping and delivery: ' + keys.join(', '), detail: { before: prev, after: next } });
      }
    }

    // Customer notes and mailing list
    for (const [email, note] of Object.entries(changes.customerNotes || {}).slice(0, 100)) {
      const e = String(email).toLowerCase();
      const r = await db.query('UPDATE customers SET note = $2, updated_at = now() WHERE email = $1', [e, text(note, 5000)]);
      if (r.rowCount) await logActivity(db, { ...who, action: 'customer.note', entity: 'customer', entityId: e, summary: 'Updated the note on ' + e });
    }
    for (const email of ((changes.subscribers || {}).delete || []).slice(0, 100)) {
      const e = String(email).toLowerCase();
      const r = await db.query('DELETE FROM subscribers WHERE email = $1', [e]);
      if (r.rowCount) await logActivity(db, { ...who, action: 'subscriber.removed', entity: 'subscriber', entityId: e, summary: 'Removed ' + e + ' from the mailing list' });
    }
  });

  // Orders: one at a time, because some changes talk to Square or send an email.
  for (const oc of (changes.orders || []).slice(0, 50)) {
    const msg = await applyOrderChange(oc, user);
    if (msg) notes.push(msg);
  }
  return { notes };
}

const PAYMENT = ['pending', 'paid', 'awaiting_quote', 'quote_sent', 'voided', 'refunded', 'partially_refunded'];
const FULFIL = ['unfulfilled', 'on_hold', 'ready', 'picked_up', 'out_for_delivery', 'delivered', 'cancelled'];

async function loadOrder(id) {
  const row = (await query('SELECT * FROM orders WHERE id = $1', [id])).rows[0];
  if (!row) throw bad('Order ' + id + ' wasn\'t found.', 404);
  return row;
}
function orderForEmail(row, store, shipping) {
  const o = adminOrder(row);
  const z = ((shipping && shipping.zones) || []).find((x) => x.id === o.zone);
  return Object.assign({}, o, { name: o.customer.name, email: o.customer.email, phone: o.customer.phone, zoneName: z ? z.name : '', gstRegistered: !!(store && store.gstRegistered),
    dateText: new Date(o.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Melbourne' }) });
}

// Marks a quote (or any unpaid order) as paid: takes the mirrors out of stock and confirms the order.
export async function markPaid(orderId, { actorType, actor, card, paymentId, receiptUrl, text }) {
  let row;
  await tx(async (db) => {
    row = (await db.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId])).rows[0];
    if (!row || !['awaiting_quote', 'quote_sent', 'pending'].includes(row.payment)) { row = null; return; }
    const ev = [event(text || 'Payment of ' + money(row.total) + ' received. Order confirmed.')];
    if (!row.stock_taken) {
      try { await takeStock(db, row); } catch (err) {
        if (err.code !== 'stock') throw err;
        ev.push(event('Stock warning: ' + err.message + ' Please check stock for this order.'));
      }
    }
    await db.query("UPDATE orders SET payment = 'paid', fulfilment = 'unfulfilled', card = $2, square_payment_id = COALESCE($3, square_payment_id), square_receipt_url = COALESCE($4, square_receipt_url), events = events || $5::jsonb, updated_at = now() WHERE id = $1",
      [orderId, card || 'Square payment link', paymentId || null, receiptUrl || null, JSON.stringify(ev)]);
    await logActivity(db, { actorType, actor, action: 'order.paid', entity: 'order', entityId: orderId, summary: 'Order #' + orderId + ' marked paid (' + money(row.total) + ')' });
  });
  if (!row) return false;
  const [store, shipping] = await Promise.all([getSetting('store'), getSetting('shipping')]);
  const fresh = await loadOrder(orderId);
  const sent = await sendEmail({ to: fresh.email, replyTo: store && store.email, ...orderConfirmation(orderForEmail(fresh, store, shipping), store) });
  await query("UPDATE orders SET events = events || $2::jsonb WHERE id = $1", [orderId, JSON.stringify([event(sent.ok ? 'Order confirmation sent to ' + fresh.email : 'Order confirmation not sent: ' + sent.reason)])]);
  return true;
}

async function applyOrderChange(oc, user) {
  const id = Number(oc.id);
  if (!Number.isInteger(id)) throw bad('An order number isn\'t valid.');
  const set = oc.set || {};
  const who = { actorType: 'admin', actor: user.email };
  let row = await loadOrder(id);
  const added = (Array.isArray(oc.addEvents) ? oc.addEvents : []).slice(0, 20).map((e) => ({ at: Number(e.at) || Date.now(), text: text(e.text, 1000) })).filter((e) => e.text);
  const log = [];
  let note = null;

  // Delivery quote sent: price the delivery, make a Square payment link and email it.
  if (set.payment === 'quote_sent' && ['awaiting_quote', 'quote_sent'].includes(row.payment)) {
    const delivery = cents(set.delivery, { nullable: false });
    const total = row.subtotal - row.discount + delivery;
    let link = null, linkNote = '';
    if (squareConfigured()) {
      const r = await createPaymentLink({ orderId: id, amount: total, email: row.email, idempotencyKey: 'quote-' + id + '-' + total + '-' + Date.now(), redirectUrl: siteUrl() + '/' });
      if (r.ok) link = r; else linkNote = r.message;
    } else linkNote = 'Square isn\'t connected yet, so no payment link was made.';
    await query("UPDATE orders SET delivery = $2, total = $3, payment = 'quote_sent', card = $4, payment_link_url = COALESCE($5, payment_link_url), square_order_id = COALESCE($6, square_order_id), updated_at = now() WHERE id = $1",
      [id, delivery, total, link ? 'Square payment link sent' : 'Quote sent', link && link.url, link && link.squareOrderId]);
    row = await loadOrder(id);
    const [store, shipping] = await Promise.all([getSetting('store'), getSetting('shipping')]);
    const o = orderForEmail(row, store, shipping);
    const sent = link || row.payment_link_url ? await sendEmail({ to: row.email, replyTo: store && store.email, ...deliveryQuote(o, store, text(oc.quoteMessage, 1000)) }) : { ok: false, reason: 'no payment link' };
    if (linkNote) added.push(event('Payment link not made: ' + linkNote));
    added.push(event(sent.ok ? 'Quote email with the Square payment link sent to ' + row.email : 'Quote email not sent: ' + sent.reason));
    log.push('Sent a delivery quote of ' + money(delivery) + ' (total ' + money(total) + ')');
    if (!sent.ok) note = 'Quote saved, but the email wasn\'t sent (' + sent.reason + ').';
  } else if (set.payment === 'paid' && ['awaiting_quote', 'quote_sent', 'pending'].includes(row.payment)) {
    await markPaid(id, { ...who, card: text(set.card, 100) || 'Paid another way', text: 'Marked as paid by ' + user.email + '.' });
    row = await loadOrder(id);
  } else if (set.payment === 'voided' && ['awaiting_quote', 'quote_sent', 'pending'].includes(row.payment)) {
    await tx(async (db) => {
      if (row.stock_taken) await returnStock(db, row);
      await db.query("UPDATE orders SET payment = 'voided', fulfilment = 'cancelled', updated_at = now() WHERE id = $1", [id]);
    });
    log.push('Cancelled the request');
    row = await loadOrder(id);
  } else if ((set.payment === 'refunded' || set.payment === 'partially_refunded') && ['paid', 'partially_refunded'].includes(row.payment)) {
    const newTotal = cents(set.refunded, { nullable: false });
    const amount = newTotal - (row.refunded || 0);
    if (amount <= 0 || newTotal > row.total) throw bad('Enter a refund amount up to ' + money(row.total - (row.refunded || 0)) + '.');
    if (row.square_payment_id) {
      const r = await refundPayment({ paymentId: row.square_payment_id, amount, idempotencyKey: 'refund-' + id + '-' + newTotal, reason: oc.refundReason });
      if (!r.ok) throw bad(r.message, 502);
      added.push(event('Square refund of ' + money(amount) + ' ' + (r.status === 'COMPLETED' ? 'completed' : 'started') + '.'));
    } else {
      added.push(event('Refund of ' + money(amount) + ' recorded. This order wasn\'t paid through Square, so refund the customer directly.'));
    }
    await query('UPDATE orders SET payment = $2, refunded = $3, updated_at = now() WHERE id = $1', [id, newTotal >= row.total ? 'refunded' : 'partially_refunded', newTotal]);
    log.push('Refunded ' + money(amount));
    row = await loadOrder(id);
  } else if ('refunded' in set && Number(set.refunded) !== row.refunded) {
    throw bad(row.payment === 'refunded' ? 'Order ' + row.id + ' has already been fully refunded.' : 'Only paid orders can be refunded.');
  } else if (set.payment && set.payment !== row.payment) {
    if (!PAYMENT.includes(set.payment)) throw bad('That payment status isn\'t valid.');
    throw bad('Order ' + row.id + ' can\'t go from ' + row.payment.replace(/_/g, ' ') + ' to ' + set.payment.replace(/_/g, ' ') + '.');
  }

  // Fulfilment, tracking and the customer's note.
  const plain = [], vals = [id];
  if ('fulfilment' in set && set.fulfilment !== row.fulfilment && set.payment === undefined) {
    if (!FULFIL.includes(set.fulfilment)) throw bad('That fulfilment status isn\'t valid.');
    vals.push(set.fulfilment); plain.push('fulfilment = $' + vals.length); log.push('Marked ' + set.fulfilment.replace(/_/g, ' '));
  }
  if ('tracking' in set) { vals.push(text(set.tracking, 200)); plain.push('tracking = $' + vals.length); }
  if ('note' in set) { vals.push(text(set.note, 2000)); plain.push('note = $' + vals.length); log.push('Edited the note'); }
  if ('deliveryDay' in set) {
    const dd = set.deliveryDay ? String(set.deliveryDay) : null;
    if (dd && !/^\d{4}-\d{2}-\d{2}$/.test(dd)) throw bad('That delivery day isn\'t valid.');
    vals.push(dd); plain.push('delivery_day = $' + vals.length);
  }
  if (plain.length) await query('UPDATE orders SET ' + plain.join(', ') + ', updated_at = now() WHERE id = $1', vals);

  // "Email the customer an update" when marking out for delivery, ready, delivered or picked up.
  if (oc.notify && FULFIL.includes(oc.notify)) {
    row = await loadOrder(id);
    const [store, shipping] = await Promise.all([getSetting('store'), getSetting('shipping')]);
    const mail = fulfilmentUpdate(orderForEmail(row, store, shipping), store, oc.notify);
    if (mail) {
      const sent = await sendEmail({ to: row.email, replyTo: store && store.email, ...mail });
      added.push(event(sent.ok ? 'Update email sent to ' + row.email : 'Update email not sent: ' + sent.reason));
    }
  }
  if (added.length) await query("UPDATE orders SET events = events || $2::jsonb, updated_at = now() WHERE id = $1", [id, JSON.stringify(added)]);
  const comments = added.filter((e) => !/^(Update email|Quote email|Payment link|Square refund|Refund of|Order confirmation)/.test(e.text));
  if (comments.length && !log.length) log.push('Added to the timeline');
  if (log.length) await logActivity({ query }, { ...who, action: 'order.updated', entity: 'order', entityId: id, summary: 'Order #' + id + ': ' + log.join('; '), detail: { set, addEvents: added.map((e) => e.text) } });
  return note;
}
