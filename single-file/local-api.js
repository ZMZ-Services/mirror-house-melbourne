// Local stand-in for the Cloudflare Worker API, used by the single-file version.
// It answers the same /api/* routes as src/worker.js, but keeps products, orders and
// newsletter signups in this browser's storage instead of the D1 database.
(function () {
  'use strict';
  if (window.__mhLocalApi) return;
  window.__mhLocalApi = true;

  // Same demo settings as src/worker.js (cents).
  var FREE_FREIGHT_FROM = 15000;
  var FLAT_FREIGHT = 2995;
  var BREAKAGE_COVER = 1250;
  var WHITE_GLOVE = 14900;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Same rows as migrations/0002_seed_demo_products.sql.
  var SEED = [
    ['grand-royale-arched-brass-floor-mirror', 'Grand Royale Arched Brass Floor Mirror', 'Floor Mirrors', 129000, 52000, 14, 6],
    ['ondine-wavy-wall-mirror', 'Ondine Wavy Wall Mirror', 'Wall Mirrors', 59000, 21500, 22, 8],
    ['travertine-mushroom-table-lamp', 'Travertine Mushroom Table Lamp', 'Lighting', 34500, 13800, 5, 6],
    ['hand-thrown-ceramic-vase', 'Hand-Thrown Ceramic Vase', 'Ceramics & Vases', 12900, 4200, 31, 10],
    ['ribbed-amber-glassware-set', 'Ribbed Amber Glassware (Set of 4)', 'Tableware', 7900, 2600, 48, 15],
    ['travertine-catch-all-tray', 'Travertine Catch-All Tray', 'Ceramics & Vases', 9500, 3100, 9, 8]
  ].map(function (r) {
    return { slug: r[0], name: r[1], category: r[2], price_cents: r[3], cost_cents: r[4], stock: r[5], reorder_point: r[6], active: 1 };
  });

  var KEY = 'mh-local-db';
  var memory = null;
  function load() {
    try {
      var d = JSON.parse(localStorage.getItem(KEY));
      if (d && d.products) return d;
    } catch (e) { /* storage blocked: fall through */ }
    return memory || { products: SEED.map(function (p) { return Object.assign({}, p); }), orders: [], subscribers: [] };
  }
  function save(d) {
    memory = d;
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* keep in memory */ }
  }
  function json(data, status) {
    return new Response(JSON.stringify(data), { status: status || 200, headers: { 'content-type': 'application/json; charset=utf-8' } });
  }
  function now() { return new Date().toISOString().replace('T', ' ').slice(0, 19); }
  function daysAgo(n) { return new Date(Date.now() - n * 864e5).toISOString().replace('T', ' ').slice(0, 19); }

  function products() {
    var d = load();
    var list = d.products.filter(function (p) { return p.active; }).map(function (p) {
      return { slug: p.slug, name: p.name, category: p.category, price_cents: p.price_cents, in_stock: p.stock > 0 ? 1 : 0 };
    });
    list.sort(function (a, b) { return a.category.localeCompare(b.category) || a.name.localeCompare(b.name); });
    return json({ products: list });
  }

  function subscribe(body) {
    var email = String((body && body.email) || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) return json({ error: 'Please enter a valid email address.' }, 400);
    var d = load();
    if (!d.subscribers.some(function (s) { return s.email === email; })) d.subscribers.push({ email: email, created_at: now() });
    save(d);
    return json({ ok: true });
  }

  function createOrder(body) {
    var email = String((body && body.email) || '').trim().toLowerCase();
    var items = Array.isArray(body && body.items) ? body.items : [];
    if (!EMAIL_RE.test(email)) return json({ error: 'Please enter a valid email address.' }, 400);
    if (!items.length || items.length > 50) return json({ error: 'Your bag is empty.' }, 400);
    var d = load();
    var lines = [];
    for (var i = 0; i < items.length; i++) {
      var qty = parseInt(items[i] && items[i].qty, 10);
      if (!(qty >= 1 && qty <= 20)) return json({ error: 'Invalid quantity.' }, 400);
      var slug = String((items[i] && items[i].slug) || '');
      var p = d.products.filter(function (x) { return x.slug === slug && x.active; })[0];
      if (!p) return json({ error: 'Unknown product: ' + slug }, 400);
      if (p.stock < qty) return json({ error: 'Only ' + p.stock + ' left of ' + slug + '.' }, 409);
      lines.push({ p: p, qty: qty });
    }
    var subtotal = lines.reduce(function (s, l) { return s + l.p.price_cents * l.qty; }, 0);
    var shipping = subtotal >= FREE_FREIGHT_FROM ? 0 : FLAT_FREIGHT;
    var cover = body.breakage_cover ? BREAKAGE_COVER : 0;
    var wg = body.white_glove ? WHITE_GLOVE : 0;
    var total = subtotal + shipping + cover + wg;
    var id = d.orders.reduce(function (m, o) { return Math.max(m, o.id); }, 0) + 1;
    lines.forEach(function (l) { l.p.stock -= l.qty; });
    d.orders.push({
      id: id, email: email, status: 'pending', subtotal_cents: subtotal, shipping_cents: shipping + wg,
      cover_cents: cover, white_glove: wg ? 1 : 0, total_cents: total, created_at: now(),
      items: lines.map(function (l) { return { slug: l.p.slug, qty: l.qty, unit_price_cents: l.p.price_cents }; })
    });
    save(d);
    return json({ ok: true, order_id: id, status: 'pending', subtotal_cents: subtotal, shipping_cents: shipping + wg, cover_cents: cover, total_cents: total }, 201);
  }

  function adminSummary() {
    var d = load();
    var since = daysAgo(30);
    var live = d.orders.filter(function (o) { return o.status !== 'cancelled' && o.status !== 'refunded' && o.created_at >= since; });
    var revenue = live.reduce(function (s, o) { return s + o.total_cents; }, 0);
    var byCat = {};
    live.forEach(function (o) {
      o.items.forEach(function (it) {
        var p = d.products.filter(function (x) { return x.slug === it.slug; })[0];
        if (!p) return;
        var c = byCat[p.category] || (byCat[p.category] = { category: p.category, sales_cents: 0, margin_cents: 0 });
        c.sales_cents += it.qty * it.unit_price_cents;
        c.margin_cents += it.qty * (it.unit_price_cents - p.cost_cents);
      });
    });
    return json({
      period: 'last_30_days',
      orders: live.length,
      revenue_cents: revenue,
      average_order_cents: live.length ? Math.round(revenue / live.length) : 0,
      breakage_cover_attach_rate: live.length ? live.filter(function (o) { return o.cover_cents > 0; }).length / live.length : 0,
      subscribers: { total: d.subscribers.length, last_30_days: d.subscribers.filter(function (s) { return s.created_at >= since; }).length },
      sales_by_category: Object.keys(byCat).map(function (k) { return byCat[k]; }).sort(function (a, b) { return b.sales_cents - a.sales_cents; }),
      low_stock: d.products.filter(function (p) { return p.active && p.stock <= p.reorder_point; })
        .sort(function (a, b) { return a.stock - b.stock; })
        .map(function (p) { return { slug: p.slug, name: p.name, stock: p.stock, reorder_point: p.reorder_point }; }),
      recent_orders: d.orders.slice().reverse().slice(0, 10).map(function (o) {
        return { id: o.id, email: o.email, status: o.status, total_cents: o.total_cents, created_at: o.created_at };
      })
    });
  }

  function apiPath(input) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var m = /^(?:https?:\/\/[^/]+)?(\/api\/[^?#]*)/.exec(url);
    return m ? m[1] : null;
  }

  var realFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (input, init) {
    var path = apiPath(input);
    if (!path) return realFetch(input, init);
    var method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    var body = null;
    try { body = init && init.body ? JSON.parse(init.body) : null; } catch (e) { body = null; }
    return new Promise(function (resolve) {
      setTimeout(function () {
        if (path === '/api/products' && method === 'GET') return resolve(products());
        if (path === '/api/newsletter' && method === 'POST') return resolve(subscribe(body));
        if (path === '/api/orders' && method === 'POST') return resolve(createOrder(body));
        if (path === '/api/admin/summary' && method === 'GET') return resolve(adminSummary());
        resolve(json({ error: 'Not found' }, 404));
      }, 60);
    });
  };
})();
