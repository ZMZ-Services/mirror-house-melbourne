// Mirror House Melbourne: static site + small JSON API backed by D1.
//
// Public:  GET  /api/products      active catalogue
//          POST /api/newsletter    { email }
//          POST /api/orders        { email, items: [{ slug, qty }], breakage_cover, white_glove }
// Admin:   GET  /api/admin/summary live numbers for the back-of-house dashboard
//          (open with no login: this is a demo store)

// Demo store settings (cents). Keep in line with the storefront copy.
const FREE_FREIGHT_FROM = 15000;
const FLAT_FREIGHT = 2995;
const BREAKAGE_COVER = 1250;
const WHITE_GLOVE = 14900;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith('/api/')) {
      try {
        return await routeApi(request, env, path);
      } catch (err) {
        console.error(err);
        return json({ error: 'Something went wrong. Please try again.' }, 500);
      }
    }

    return env.ASSETS.fetch(request);
  },
};

async function routeApi(request, env, path) {
  const method = request.method;
  if (path === '/api/products' && method === 'GET') return listProducts(env);
  if (path === '/api/newsletter' && method === 'POST') return subscribe(request, env);
  if (path === '/api/orders' && method === 'POST') return createOrder(request, env);
  if (path === '/api/admin/summary' && method === 'GET') return adminSummary(env);
  return json({ error: 'Not found' }, 404);
}

async function readJson(request) {
  if (!(request.headers.get('content-type') || '').includes('application/json')) return null;
  const text = await request.text();
  if (text.length > 10_000) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function listProducts(env) {
  const { results } = await env.DB.prepare(
    `SELECT slug, name, category, price_cents, stock > 0 AS in_stock
       FROM products WHERE active = 1 ORDER BY category, name`
  ).all();
  return json({ products: results });
}

async function subscribe(request, env) {
  const body = await readJson(request);
  const email = String(body?.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return json({ error: 'Please enter a valid email address.' }, 400);
  }
  await env.DB.prepare('INSERT OR IGNORE INTO newsletter_subscribers (email) VALUES (?)').bind(email).run();
  return json({ ok: true });
}

async function createOrder(request, env) {
  const body = await readJson(request);
  const email = String(body?.email || '').trim().toLowerCase();
  const items = Array.isArray(body?.items) ? body.items : [];
  if (!EMAIL_RE.test(email)) return json({ error: 'Please enter a valid email address.' }, 400);
  if (items.length === 0 || items.length > 50) return json({ error: 'Your bag is empty.' }, 400);

  // Prices always come from the database, never from the browser.
  const lines = [];
  for (const item of items) {
    const qty = Number.parseInt(item?.qty, 10);
    if (!Number.isInteger(qty) || qty < 1 || qty > 20) return json({ error: 'Invalid quantity.' }, 400);
    const product = await env.DB.prepare(
      'SELECT id, price_cents, stock FROM products WHERE slug = ? AND active = 1'
    ).bind(String(item?.slug || '')).first();
    if (!product) return json({ error: `Unknown product: ${item?.slug}` }, 400);
    if (product.stock < qty) return json({ error: `Only ${product.stock} left of ${item.slug}.` }, 409);
    lines.push({ ...product, qty });
  }

  const subtotal = lines.reduce((sum, l) => sum + l.price_cents * l.qty, 0);
  const shipping = subtotal >= FREE_FREIGHT_FROM ? 0 : FLAT_FREIGHT;
  const cover = body?.breakage_cover ? BREAKAGE_COVER : 0;
  const whiteGlove = body?.white_glove ? WHITE_GLOVE : 0;
  const total = subtotal + shipping + cover + whiteGlove;

  const order = await env.DB.prepare(
    `INSERT INTO orders (email, subtotal_cents, shipping_cents, cover_cents, white_glove, total_cents)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING id`
  ).bind(email, subtotal, shipping + whiteGlove, cover, whiteGlove ? 1 : 0, total).first();

  // Items and stock updates go in one batch, so they all succeed or all fail together.
  // The stock guard stops the count going negative if two orders race.
  await env.DB.batch(
    lines.flatMap((l) => [
      env.DB.prepare(
        'INSERT INTO order_items (order_id, product_id, qty, unit_price_cents) VALUES (?, ?, ?, ?)'
      ).bind(order.id, l.id, l.qty, l.price_cents),
      env.DB.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?').bind(l.qty, l.id, l.qty),
    ])
  );

  return json({ ok: true, order_id: order.id, status: 'pending', subtotal_cents: subtotal, shipping_cents: shipping + whiteGlove, cover_cents: cover, total_cents: total }, 201);
}

async function adminSummary(env) {
  const since = "datetime('now', '-30 days')";
  const live = "status NOT IN ('cancelled', 'refunded')";
  const [totals, subs, byCategory, lowStock, recent] = await env.DB.batch([
    env.DB.prepare(
      `SELECT COUNT(*) AS orders, COALESCE(SUM(total_cents), 0) AS revenue_cents,
              COALESCE(SUM(cover_cents > 0), 0) AS with_cover
         FROM orders WHERE ${live} AND created_at >= ${since}`
    ),
    env.DB.prepare(
      `SELECT COUNT(*) AS total, COALESCE(SUM(created_at >= ${since}), 0) AS last_30_days
         FROM newsletter_subscribers`
    ),
    env.DB.prepare(
      `SELECT p.category, SUM(oi.qty * oi.unit_price_cents) AS sales_cents,
              SUM(oi.qty * (oi.unit_price_cents - p.cost_cents)) AS margin_cents
         FROM order_items oi
         JOIN orders o   ON o.id = oi.order_id
         JOIN products p ON p.id = oi.product_id
        WHERE o.${live} AND o.created_at >= ${since}
        GROUP BY p.category ORDER BY sales_cents DESC`
    ),
    env.DB.prepare(
      `SELECT slug, name, stock, reorder_point FROM products
        WHERE active = 1 AND stock <= reorder_point ORDER BY stock ASC`
    ),
    env.DB.prepare(
      `SELECT id, email, status, total_cents, created_at FROM orders ORDER BY id DESC LIMIT 10`
    ),
  ]);

  const t = totals.results[0];
  return json({
    period: 'last_30_days',
    orders: t.orders,
    revenue_cents: t.revenue_cents,
    average_order_cents: t.orders ? Math.round(t.revenue_cents / t.orders) : 0,
    breakage_cover_attach_rate: t.orders ? t.with_cover / t.orders : 0,
    subscribers: subs.results[0],
    sales_by_category: byCategory.results,
    low_stock: lowStock.results,
    recent_orders: recent.results,
  });
}
