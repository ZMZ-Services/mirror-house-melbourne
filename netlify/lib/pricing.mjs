// Server-side pricing. Mirrors the checkout in public/js/store.js so the customer pays exactly what they saw,
// but works only from the database: prices, stock, zones and discount rules. Browser totals are never used.

export const MAX_PER_DELIVERY = 4; // one delivery fee covers up to this many mirrors
export const MAX_QTY = 20;
export const SHOP_CATEGORIES = ['Floor Mirrors', 'Wall Mirrors'];

// ---------- delivery zones ----------
// Zone postcode lists are comma-separated: "3030", a range "3000-3099", or a suburb with its postcode
// ("Tarneit 3029") for a postcode split between zones. A suburb + postcode match always wins.
export function normSuburb(s) {
  return String(s || '').toLowerCase().replace(/['’.]/g, '').replace(/\bst\b/g, 'saint').replace(/[^a-z]+/g, ' ').trim();
}
export function zoneEntries(text) {
  return String(text || '').split(/[,;\n]+/).map((p) => p.trim()).filter(Boolean).map((p) => {
    let m;
    if ((m = p.match(/^(\d{4})\s*-\s*(\d{4})$/))) return { from: +m[1], to: +m[2] };
    if ((m = p.match(/^(\d{4})$/))) return { from: +m[1], to: +m[1] };
    if ((m = p.match(/^(.*?[A-Za-z].*?)\s+(\d{4})$/))) return { suburb: normSuburb(m[1]), from: +m[2], to: +m[2] };
    return null;
  }).filter(Boolean);
}
export function zoneForPostcode(pc, zones, suburb) {
  if (!/^\d{4}$/.test(String(pc || ''))) return null;
  const n = parseInt(pc, 10), sub = normSuburb(suburb);
  if (sub) for (const z of zones) for (const e of zoneEntries(z.postcodes)) if (e.suburb && e.suburb === sub && n === e.from) return z;
  for (const z of zones) for (const e of zoneEntries(z.postcodes)) if (!e.suburb && n >= e.from && n <= e.to) return z;
  return null;
}

// ---------- dates (Melbourne) ----------
export function melbourneDate(now = new Date()) {
  // YYYY-MM-DD in Melbourne, for comparing with discount start/end dates.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
function dateStr(d) {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

// ---------- discount codes ----------
// rule: { code, type: 'pct'|'fixed', value, minSpend, firstOrderOnly, starts, ends, limit, active }
// ctx: { subtotal, now, isFirstOrder, timesUsed }
export function checkDiscount(rule, ctx) {
  if (!rule) return { error: 'Sorry, that code isn\'t valid.' };
  const today = melbourneDate(ctx.now || new Date());
  if (!rule.active) return { error: 'Sorry, that code isn\'t active.' };
  const starts = dateStr(rule.starts), ends = dateStr(rule.ends);
  if (starts && today < starts) return { error: 'That code isn\'t available yet.' };
  if (ends && today > ends) return { error: 'Sorry, that code has expired.' };
  if (rule.minSpend && ctx.subtotal < rule.minSpend) return { error: 'Spend ' + money(rule.minSpend) + ' or more to use this code.' };
  if (rule.limit != null && ctx.timesUsed != null && ctx.timesUsed >= rule.limit) return { error: 'Sorry, that code has been fully used.' };
  if (rule.firstOrderOnly && ctx.isFirstOrder === false) return { error: 'Sorry, ' + rule.code + ' is for first orders only.' };
  const amount = rule.type === 'fixed' ? Math.min(ctx.subtotal, rule.value) : Math.round(ctx.subtotal * (rule.value || 0) / 100);
  return { amount, label: rule.type === 'fixed' ? money(rule.value) + ' off' : rule.value + '% off' };
}

export function money(c) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format((c || 0) / 100);
}

// ---------- the whole order ----------
// input: { items: [{ slug, qty }], method: 'delivery'|'pickup', postcode, suburb }
// products: { [slug]: { slug, title, price, stock, status, category } } from the database
// shipping: the 'shipping' settings document; discount: { rule, isFirstOrder, timesUsed } or null
// Returns { ok, error, field, lines, subtotal, discount, discountCode, delivery, total, zone, quote }.
export function priceOrder(input, products, shipping, discount, now = new Date()) {
  const fail = (error, field) => ({ ok: false, error, field });
  const raw = Array.isArray(input.items) ? input.items : [];
  if (!raw.length) return fail('Your bag is empty.');
  if (raw.length > 50) return fail('Too many items in one order.');
  const merged = new Map();
  for (const it of raw) {
    const slug = String((it && it.slug) || '');
    const qty = Number(it && it.qty);
    if (!slug || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return fail('Please check the quantities in your bag.');
    merged.set(slug, (merged.get(slug) || 0) + qty);
  }
  const lines = [];
  for (const [slug, qty] of merged) {
    const p = products[slug];
    if (!p || p.status !== 'active' || !SHOP_CATEGORIES.includes(p.category)) return fail('Sorry, one of the mirrors in your bag is no longer available. Please remove it and try again.', 'items');
    if (qty > MAX_QTY) return fail('Please check the quantities in your bag.');
    if (p.stock != null && p.stock < qty) {
      return fail(p.stock === 0 ? 'Sorry, ' + p.title + ' has just sold out. Please remove it from your bag.' : 'Sorry, only ' + p.stock + ' of ' + p.title + ' left. Please lower the quantity.', 'items');
    }
    lines.push({ slug, title: p.title, price: p.price, qty });
  }
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const count = lines.reduce((s, l) => s + l.qty, 0);

  const sh = shipping || {};
  const method = input.method === 'pickup' ? 'pickup' : 'delivery';
  let delivery = 0, zone = null, quote = false;
  if (method === 'pickup') {
    if (!sh.pickup || !sh.pickup.enabled) return fail('Pick-up isn\'t available at the moment. Please choose delivery.');
  } else {
    const pc = String(input.postcode || '').trim();
    if (!/^\d{4}$/.test(pc)) return fail('Enter a 4-digit postcode', 'co-postcode');
    const z = zoneForPostcode(pc, sh.zones || [], input.suburb);
    if (z) {
      const loads = Math.max(1, Math.ceil(count / MAX_PER_DELIVERY));
      zone = { id: z.id, name: z.name, price: z.price, loads };
      delivery = z.price * loads;
    } else if (sh.quoteBeyond) {
      zone = { id: 'quote', name: 'Outside our zones' };
      quote = true;
    } else {
      return fail('We don\'t deliver here yet. Choose pick-up instead.', 'co-postcode');
    }
  }

  let discountAmt = 0, discountCode = null;
  if (discount && discount.rule) {
    const d = checkDiscount(discount.rule, { subtotal, now, isFirstOrder: discount.isFirstOrder, timesUsed: discount.timesUsed });
    if (d.error) return fail(d.error, 'co-code');
    discountAmt = d.amount;
    discountCode = discount.rule.code;
  }
  const total = subtotal - discountAmt + delivery;
  return { ok: true, lines, subtotal, discount: discountAmt, discountCode, delivery, total, zone, quote, method };
}
