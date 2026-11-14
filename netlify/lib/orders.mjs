// Placing an order from the checkout: re-price everything on the server, hold the stock, take the card
// payment with Square, then send the emails. Quote requests (outside the delivery zones) take no payment.
import { query, tx } from './db.mjs';
import { priceOrder, melbourneDate, money } from './pricing.mjs';
import { str, EMAIL_RE } from './http.mjs';
import { getSetting, getDiscount, isFirstOrder, timesUsed, logActivity, event, takeStock, returnStock, upsertCustomer, adminOrder } from './store.mjs';
import { createPayment } from './square.mjs';
import { sendEmail, orderConfirmation, quoteReceived, adminAlert } from './email.mjs';

const STATES = ['VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT'];
const bad = (message, field, status = 400) => Object.assign(new Error(message), { status, field });

function addDays(ymd, n) {
  const d = new Date(ymd + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Checks and tidies what the checkout sent. Throws a 400 with the field to highlight.
export function validateCheckout(b, now = new Date()) {
  const email = str(b.email, 200).toLowerCase();
  if (!EMAIL_RE.test(email)) throw bad('Enter an email like name@example.com', 'co-email');
  const phone = str(b.phone, 40);
  if (!/^(\+?61|0)[2-478]\d{8}$/.test(phone.replace(/[^\d+]/g, ''))) throw bad('Enter an Australian number, e.g. 0412 345 678', 'co-phone');
  const name = str(b.name, 120).replace(/\s+/g, ' ');
  if (name.split(' ').filter(Boolean).length < 2) throw bad('Enter a first and last name', 'co-first');
  const method = b.method === 'pickup' ? 'pickup' : 'delivery';
  let address = null, deliveryDay = null;
  if (method === 'delivery') {
    const a = b.address || {};
    address = { line1: str(a.line1, 200), suburb: str(a.suburb, 80), state: str(a.state, 3).toUpperCase(), postcode: str(a.postcode, 4) };
    if (!address.line1) throw bad('Enter a street address', 'co-line1');
    if (!address.suburb) throw bad('Enter a suburb', 'co-suburb');
    if (!STATES.includes(address.state)) throw bad('Choose a state', 'co-state');
    if (!/^\d{4}$/.test(address.postcode)) throw bad('Enter a 4-digit postcode', 'co-postcode');
    if (b.deliveryDay) {
      deliveryDay = str(b.deliveryDay, 10);
      const today = melbourneDate(now);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDay)) throw bad('Choose a delivery day', 'co-day');
      if (deliveryDay < addDays(today, 1)) throw bad('Choose a day from tomorrow', 'co-day');
      if (deliveryDay > addDays(today, 61)) throw bad('Choose a day in the next 2 months', 'co-day');
      if (new Date(deliveryDay + 'T12:00:00Z').getUTCDay() === 0) throw bad('We don\'t deliver on Sundays. Choose Monday to Saturday.', 'co-day');
    }
  }
  const key = str(b.idempotency_key, 100);
  if (!/^[A-Za-z0-9-]{8,100}$/.test(key)) throw bad('Please refresh the page and try again.');
  return {
    email, phone, name, method, address, deliveryDay,
    note: method === 'delivery' ? str(b.note, 1000) : '',
    marketing: b.marketing === true,
    items: Array.isArray(b.items) ? b.items.slice(0, 50).map((i) => ({ slug: str(i && i.slug, 120), qty: Number(i && i.qty) })) : [],
    code: b.discount_code ? str(b.discount_code, 40).toUpperCase() : null,
    sourceId: b.source_id ? str(b.source_id, 500) : null,
    idempotencyKey: key,
    sessionId: /^[A-Za-z0-9-]{8,64}$/.test(String(b.session_id || '')) ? String(b.session_id) : null,
    expectedTotal: Number.isInteger(b.expected_total) ? b.expected_total : null
  };
}

function emailView(row, shipping, store) {
  const o = adminOrder(row);
  const z = (shipping && shipping.zones || []).find((x) => x.id === o.zone);
  return Object.assign({}, o, {
    name: o.customer.name, email: o.customer.email, phone: o.customer.phone, quote: o.payment === 'awaiting_quote',
    zoneName: z ? z.name : o.zone === 'quote' ? 'Outside our zones' : '', gstRegistered: !!(store && store.gstRegistered),
    dateText: new Date(o.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Melbourne' })
  });
}

// Sends the customer and admin emails for a new order. Never throws; notes the outcome on the order timeline.
export async function sendOrderEmails(orderId) {
  try {
    const row = (await query('SELECT * FROM orders WHERE id = $1', [orderId])).rows[0];
    const [shipping, store] = await Promise.all([getSetting('shipping'), getSetting('store')]);
    const o = emailView(row, shipping, store);
    const toCustomer = o.quote ? quoteReceived(o, store) : orderConfirmation(o, store);
    const adminTo = process.env.ADMIN_EMAIL || (store && store.email);
    const [c, a] = await Promise.all([
      sendEmail({ to: o.email, replyTo: store && store.email, ...toCustomer }),
      adminTo ? sendEmail({ to: adminTo, replyTo: o.email, ...adminAlert(o, store) }) : Promise.resolve({ ok: false, reason: 'No admin email set' })
    ]);
    const ev = [];
    ev.push(event(c.ok ? (o.quote ? 'Quote request email' : 'Order confirmation') + ' sent to ' + o.email : (o.quote ? 'Quote request email' : 'Order confirmation') + ' not sent: ' + c.reason));
    if (!a.ok && !a.skipped) ev.push(event('New-order alert not sent: ' + a.reason));
    await query("UPDATE orders SET events = events || $2::jsonb WHERE id = $1", [orderId, JSON.stringify(ev)]);
  } catch (err) {
    console.error('order emails failed', err);
  }
}

// The whole checkout. Returns { status, body } for the HTTP response.
export async function placeOrder(body, { now = new Date(), waitForEmails = true } = {}) {
  let d;
  try { d = validateCheckout(body || {}, now); } catch (err) {
    if (err.status === 400) return { status: 400, body: { error: err.message, field: err.field } };
    throw err;
  }

  // A repeated request (double click, retry) gets the first result instead of a second order.
  const prior = (await query('SELECT * FROM orders WHERE idempotency_key = $1', [d.idempotencyKey])).rows[0];
  if (prior) {
    if (prior.payment === 'paid' || prior.payment === 'awaiting_quote') return { status: 200, body: { order_id: prior.id, total_cents: prior.total, quote: prior.payment === 'awaiting_quote' } };
    if (prior.payment === 'pending') return { status: 409, body: { error: 'Your order is still being processed. Please wait a moment before trying again.' } };
    return { status: 402, body: { error: 'That payment didn\'t go through. Please try again.' } };
  }

  // 1. Price it from the database and hold the stock, inside one transaction with the products locked.
  let order;
  try {
    order = await tx(async (db) => {
      const slugs = [...new Set(d.items.map((i) => i.slug))];
      const prows = (await db.query('SELECT slug, title, price, stock, status, category FROM products WHERE slug = ANY($1) ORDER BY slug FOR UPDATE', [slugs])).rows;
      const products = Object.fromEntries(prows.map((p) => [p.slug, p]));
      const shipping = await getSetting('shipping', db);
      let discount = null;
      if (d.code) {
        const rule = await getDiscount(d.code, db);
        if (!rule) throw bad('Sorry, that code isn\'t valid.', 'co-code');
        discount = { rule, isFirstOrder: rule.firstOrderOnly ? await isFirstOrder(d.email, db) : true, timesUsed: rule.limit != null ? await timesUsed(rule.code, db) : 0 };
      }
      const priced = priceOrder({ items: d.items, method: d.method, postcode: d.address && d.address.postcode, suburb: d.address && d.address.suburb }, products, shipping, discount, now);
      if (!priced.ok) throw bad(priced.error, priced.field);
      // If a price changed since the page loaded, ask the customer to check the new total before paying.
      if (d.expectedTotal != null && d.expectedTotal !== priced.total) {
        throw bad('A price in your bag has changed since the page loaded. The new total is ' + money(priced.total) + (priced.quote ? ' plus delivery' : '') + '. Please refresh the page to check it.', 'items', 409);
      }
      if (!priced.quote && priced.total > 0 && !d.sourceId) throw bad('Please enter your card details.', 'co-pay');

      await upsertCustomer(db, { email: d.email, name: d.name, phone: d.phone, address: d.address, marketing: d.marketing });
      const quote = priced.quote;
      const events = [event(quote ? 'Delivery quote requested from the checkout (address outside the delivery zones). Nothing charged.' : 'Order placed from the checkout.')];
      const r = await db.query(
        `INSERT INTO orders (email, name, phone, address, method, zone, delivery_day, note, marketing, lines, subtotal, discount_code, discount, delivery, total,
           payment, fulfilment, card, events, idempotency_key, session_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *`,
        [d.email, d.name, d.phone, d.address ? JSON.stringify(d.address) : null, d.method, priced.zone ? priced.zone.id : null, d.deliveryDay, d.note, d.marketing,
          JSON.stringify(priced.lines), priced.subtotal, priced.discountCode, priced.discount, priced.delivery, priced.total,
          quote ? 'awaiting_quote' : 'pending', quote ? 'on_hold' : 'unfulfilled', quote ? 'No payment yet: waiting for your delivery quote' : '',
          JSON.stringify(events), d.idempotencyKey, d.sessionId]);
      const row = r.rows[0];
      // Paid orders hold their mirrors now, so two people can't buy the last one.
      if (!quote) row.soldOut = await takeStock(db, row);
      return row;
    });
  } catch (err) {
    if (err.code === '23505') return { status: 409, body: { error: 'Your order is still being processed. Please wait a moment before trying again.' } };
    if (err.status && err.status < 500) return { status: err.status, body: { error: err.message, field: err.field || (err.code === 'stock' ? 'items' : undefined) } };
    throw err;
  }

  const who = { actorType: 'customer', actor: d.email };
  if (order.payment === 'awaiting_quote') {
    await logActivity({ query }, { ...who, action: 'quote.requested', entity: 'order', entityId: order.id, summary: 'Quote request #' + order.id + ' from ' + d.name + ' (' + money(order.total) + ' plus delivery)' });
    const mail = sendOrderEmails(order.id);
    if (waitForEmails) await mail;
    return { status: 200, body: { order_id: order.id, total_cents: order.total, quote: true } };
  }

  // 2. Take the payment. The order id goes to Square as the reference, and the checkout's key stops double charges.
  let pay = { ok: true, id: null, receiptUrl: '', card: 'Nothing to pay (fully discounted)' };
  if (order.total > 0) {
    pay = await createPayment({ sourceId: d.sourceId, idempotencyKey: d.idempotencyKey, amount: order.total, orderId: order.id, email: d.email, note: 'Mirror House order #' + order.id });
  }
  if (!pay.ok) {
    await tx(async (db) => {
      await returnStock(db, order);
      await db.query("UPDATE orders SET payment = 'failed', fulfilment = 'cancelled', card = $2, events = events || $3::jsonb, updated_at = now() WHERE id = $1",
        [order.id, 'Card payment declined', JSON.stringify([event('Card payment didn\'t go through: ' + pay.message + ' Mirrors released back into stock.')])]);
      await logActivity(db, { ...who, action: 'payment.failed', entity: 'order', entityId: order.id, summary: 'Card payment for #' + order.id + ' didn\'t go through', detail: { errors: (pay.errors || []).map((e) => e.code) } });
    });
    return { status: 402, body: { error: pay.message, field: 'co-pay' } };
  }

  await tx(async (db) => {
    await db.query("UPDATE orders SET payment = 'paid', card = $2, square_payment_id = $3, square_receipt_url = $4, events = events || $5::jsonb, updated_at = now() WHERE id = $1",
      [order.id, pay.card, pay.id, pay.receiptUrl, JSON.stringify([event('Payment of ' + money(order.total) + ' received by Square (' + pay.card + ').')])]);
    await logActivity(db, { ...who, action: 'order.paid', entity: 'order', entityId: order.id, summary: 'Order #' + order.id + ' paid: ' + money(order.total) + ' from ' + d.name });
    for (const slug of order.soldOut || []) {
      await logActivity(db, { actorType: 'system', action: 'product.sold_out', entity: 'product', entityId: slug, summary: slug + ' sold out with order #' + order.id });
    }
  });
  const mail = sendOrderEmails(order.id);
  if (waitForEmails) await mail;
  return { status: 200, body: { order_id: order.id, total_cents: order.total, quote: false } };
}
