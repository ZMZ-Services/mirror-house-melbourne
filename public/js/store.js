// Mirror House Melbourne storefront: catalogue, quick view, bag, product page and checkout.
// Products come from the Worker (/api/products). If the API isn't reachable (a static preview),
// the built-in catalogue below is used so the shop still renders.
(function () {
  'use strict';

  // Keep in line with src/worker.js.
  var FREE_FREIGHT_FROM = 15000;
  var FLAT_FREIGHT = 2995;
  var BREAKAGE_COVER = 1250;
  var WHITE_GLOVE = 14900;
  var PREVIEW = !!window.MH_PREVIEW;
  var IMG = window.MH_IMAGES || {};

  // Shop copy and imagery per product. Prices and stock come from the database when available.
  var CATALOGUE = [
    {
      slug: 'grand-royale-arched-brass-floor-mirror', name: 'Grand Royale Arched Brass Floor Mirror',
      category: 'Floor Mirrors', price_cents: 129000, badge: 'Signature',
      desc: 'A 195cm arch of 5mm high-definition silvered glass in a slim brass frame. Leans or wall-fixes, and makes a small room feel twice the size.',
      specs: ['195 × 75cm, 24kg', 'Brass-plated steel frame, 5mm silvered glass', 'Ships upright in a custom timber crate', 'Wall anchor kit included; fix into studs or masonry']
    },
    {
      slug: 'ondine-wavy-wall-mirror', name: 'Ondine Wavy Wall Mirror',
      category: 'Wall Mirrors', price_cents: 59000,
      desc: 'A frameless, fluid-edged wall mirror with softly bevelled curves. Hangs portrait or landscape above a console, basin or bed.',
      specs: ['90 × 52cm, 9kg', '5mm silvered glass with polished edges', 'Heavy-gauge French cleat included', 'Hang portrait or landscape']
    },
    {
      slug: 'travertine-mushroom-table-lamp', name: 'Travertine Mushroom Table Lamp',
      category: 'Lighting', price_cents: 34500,
      desc: 'Turned from a single block of honed travertine, with natural pitting left intact. Gives a warm, low glow on a side table or console.',
      specs: ['32cm tall, 26cm shade diameter, 7kg', 'Natural travertine; every piece varies', 'E14 globe, rotary dimmer on the cord', 'Australian plug, SAA approved']
    },
    {
      slug: 'hand-thrown-ceramic-vase', name: 'Hand-Thrown Ceramic Vase',
      category: 'Ceramics & Vases', price_cents: 12900,
      desc: 'Wheel-thrown stoneware in a matte oatmeal glaze, with the throwing rings left visible. Holds water for fresh stems.',
      specs: ['24cm tall', 'Stoneware, glazed inside and out', 'Made in small batches; glaze varies', 'Hand wash only']
    },
    {
      slug: 'ribbed-amber-glassware-set', name: 'Ribbed Amber Glassware (Set of 4)',
      category: 'Tableware', price_cents: 7900,
      desc: 'Four mouth-blown tumblers in warm amber glass with a fine vertical rib. Weighty in the hand and they stack neatly.',
      specs: ['Set of 4, 300ml each', 'Mouth-blown soda-lime glass', 'Dishwasher safe on a gentle cycle']
    },
    {
      slug: 'travertine-catch-all-tray', name: 'Travertine Catch-All Tray',
      category: 'Ceramics & Vases', price_cents: 9500,
      desc: 'A shallow oval of honed travertine for keys, rings and small things by the door or bed.',
      specs: ['24 × 12cm', 'Natural travertine, sealed', 'Felt pads underneath']
    }
  ];
  var META = {};
  CATALOGUE.forEach(function (p) { META[p.slug] = p; });

  // ---------- helpers ----------
  var aud = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
  var audWhole = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
  function money(cents) { return cents % 100 ? aud.format(cents / 100) : audWhole.format(cents / 100); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function imageFor(slug) { return IMG[slug] || '/images/products/' + slug + '.jpg'; }
  function productUrl(slug) { return '/product.html?slug=' + encodeURIComponent(slug); }
  // The single-file version passes the route's query string in MH_ROUTE_QUERY.
  function query(name) {
    try { return new URLSearchParams(window.MH_ROUTE_QUERY != null ? window.MH_ROUTE_QUERY : location.search).get(name); } catch (e) { return null; }
  }

  var toastTimer;
  function toast(text) {
    var t = $('#mh-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'mh-toast'; t.className = 'toast'; t.setAttribute('role', 'status');
      document.body.appendChild(t);
    }
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  // ---------- products ----------
  var productsPromise;
  function loadProducts() {
    if (productsPromise) return productsPromise;
    var fallback = CATALOGUE.map(function (p) { return Object.assign({ in_stock: 1 }, p); });
    productsPromise = (PREVIEW ? Promise.reject() : fetch('/api/products').then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }))
      .then(function (data) {
        if (!data || !Array.isArray(data.products) || !data.products.length) return fallback;
        return data.products.map(function (p) { return Object.assign({}, META[p.slug] || { desc: '', specs: [] }, p); });
      })
      .catch(function () { return fallback; });
    return productsPromise;
  }
  function bySlug(list, slug) { return list.filter(function (p) { return p.slug === slug; })[0]; }

  // ---------- bag (per browser) ----------
  var memoryCart = {};
  function readCart() {
    try { return JSON.parse(localStorage.getItem('mh-cart') || '{}') || {}; } catch (e) { return memoryCart; }
  }
  function writeCart(cart) {
    memoryCart = cart;
    try { localStorage.setItem('mh-cart', JSON.stringify(cart)); } catch (e) { /* storage blocked: keep in memory */ }
    renderBag();
  }
  function addToBag(slug, qty) {
    var cart = readCart();
    cart[slug] = Math.min(20, (cart[slug] || 0) + (qty || 1));
    writeCart(cart);
  }
  function setQty(slug, qty) {
    var cart = readCart();
    if (qty <= 0) delete cart[slug]; else cart[slug] = Math.min(20, qty);
    writeCart(cart);
  }
  function bagLines(products) {
    var cart = readCart();
    return Object.keys(cart).map(function (slug) {
      var p = bySlug(products, slug);
      return p ? { product: p, qty: cart[slug] } : null;
    }).filter(Boolean);
  }
  function subtotalOf(lines) { return lines.reduce(function (s, l) { return s + l.product.price_cents * l.qty; }, 0); }

  // ---------- drawer ----------
  var DRAWER_HTML =
    '<div class="cart-drawer-overlay" id="cart-overlay"></div>' +
    '<aside class="cart-drawer" id="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cart-drawer-title">' +
    '<div class="drawer-header"><h2 class="drawer-title" id="cart-drawer-title">Shopping Bag</h2>' +
    '<button class="drawer-close" id="close-cart-btn" aria-label="Close shopping bag"><span aria-hidden="true">✕</span></button></div>' +
    '<div class="free-shipping-goal"><div class="shipping-bar-text" id="shipping-progress-text" aria-live="polite"></div>' +
    '<div class="shipping-progress-track"><div class="shipping-progress-fill" id="shipping-progress-fill"></div></div></div>' +
    '<div class="drawer-items" id="drawer-items-list"></div>' +
    '<div class="drawer-footer"><div class="drawer-subtotal-line"><span class="drawer-subtotal-label">Subtotal</span>' +
    '<span class="drawer-subtotal-val" id="drawer-subtotal">$0</span></div>' +
    '<p class="drawer-tax-note">Shipping and optional breakage cover are calculated at checkout.</p>' +
    '<a href="/checkout.html" class="btn btn-primary drawer-checkout-btn" id="drawer-checkout-btn">Checkout Securely</a></div></aside>';

  function ensureDrawer() {
    if (!$('#cart-drawer')) document.body.insertAdjacentHTML('beforeend', DRAWER_HTML);
    var drawer = $('#cart-drawer');
    drawer.inert = true;
    drawer.setAttribute('aria-hidden', 'true');
  }

  var lastFocus = null;
  function openDrawer() {
    var drawer = $('#cart-drawer');
    lastFocus = document.activeElement;
    drawer.inert = false;
    drawer.removeAttribute('aria-hidden');
    drawer.classList.add('is-open');
    $('#cart-overlay').classList.add('is-open');
    document.body.classList.add('no-scroll');
    setTimeout(function () { var c = $('#close-cart-btn'); if (c) c.focus(); }, 60);
  }
  function closeDrawer() {
    var drawer = $('#cart-drawer');
    if (!drawer.classList.contains('is-open')) return;
    drawer.classList.remove('is-open');
    $('#cart-overlay').classList.remove('is-open');
    drawer.inert = true;
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function renderBag() {
    loadProducts().then(function (products) {
      var lines = bagLines(products);
      var count = lines.reduce(function (s, l) { return s + l.qty; }, 0);
      var subtotal = subtotalOf(lines);
      document.querySelectorAll('.cart-count-badge').forEach(function (b) {
        b.textContent = count;
        b.setAttribute('data-empty', count ? 'false' : 'true');
      });
      var btn = $('.open-cart-btn');
      if (btn) btn.setAttribute('aria-label', 'View shopping bag, ' + count + (count === 1 ? ' item' : ' items'));

      var list = $('#drawer-items-list');
      if (!list) return;
      if (!lines.length) {
        list.innerHTML = '<div class="drawer-empty"><p>Your bag is empty.</p>' +
          '<a class="btn btn-secondary" href="' + ($('#collection-section') ? '' : '/') + '#collection-section" data-close-drawer>Browse the collection</a></div>';
      } else {
        list.innerHTML = lines.map(function (l) {
          var p = l.product;
          return '<div class="drawer-item">' +
            '<img src="' + esc(imageFor(p.slug)) + '" alt="" width="76" height="95" loading="lazy">' +
            '<div><p class="drawer-item-name">' + esc(p.name) + '</p>' +
            '<div class="qty" role="group" aria-label="Quantity for ' + esc(p.name) + '">' +
            '<button type="button" data-qty="' + esc(p.slug) + '" data-delta="-1" aria-label="Remove one">−</button>' +
            '<span>' + l.qty + '</span>' +
            '<button type="button" data-qty="' + esc(p.slug) + '" data-delta="1" aria-label="Add one">+</button></div>' +
            '<br><button type="button" class="remove-btn" data-remove="' + esc(p.slug) + '">Remove</button></div>' +
            '<div class="drawer-item-price">' + money(p.price_cents * l.qty) + '</div></div>';
        }).join('');
      }
      var left = Math.max(0, FREE_FREIGHT_FROM - subtotal);
      $('#shipping-progress-text').textContent = !count
        ? 'Free fragile freight on orders over ' + money(FREE_FREIGHT_FROM)
        : left ? 'Add ' + money(left) + ' for free fragile freight' : 'Your order ships free, crated and tracked';
      $('#shipping-progress-fill').style.width = Math.min(100, (subtotal / FREE_FREIGHT_FROM) * 100) + '%';
      $('#drawer-subtotal').textContent = money(subtotal);
      var co = $('#drawer-checkout-btn');
      co.setAttribute('aria-disabled', count ? 'false' : 'true');
      co.style.opacity = count ? '' : '0.5';
    });
  }

  // ---------- catalogue ----------
  function cardHtml(p) {
    var badge = !p.in_stock ? '<span class="product-badge low">Sold out</span>'
      : p.badge ? '<span class="product-badge">' + esc(p.badge) + '</span>' : '';
    return '<article class="product-card">' +
      '<div class="product-media">' + badge +
      '<img src="' + esc(imageFor(p.slug)) + '" alt="' + esc(p.name) + '" width="800" height="1000" loading="lazy" decoding="async">' +
      '<button type="button" class="product-quick" data-quick="' + esc(p.slug) + '">Quick view</button></div>' +
      '<div class="product-info"><span class="product-cat">' + esc(p.category) + '</span>' +
      '<h3 class="product-name"><a href="' + esc(productUrl(p.slug)) + '" data-product-link="' + esc(p.slug) + '">' + esc(p.name) + '</a></h3>' +
      '<div class="product-row"><span class="product-price">' + money(p.price_cents) + '</span>' +
      '<button type="button" class="link-btn" data-add="' + esc(p.slug) + '"' + (p.in_stock ? '' : ' disabled') + '>' +
      (p.in_stock ? 'Add to bag' : 'Sold out') + '</button></div></div></article>';
  }

  function renderCatalogue(products) {
    var grid = $('#products-grid');
    var pills = $('#category-pills');
    if (!grid) return;
    var cats = [];
    products.forEach(function (p) { if (cats.indexOf(p.category) < 0) cats.push(p.category); });
    var active = query('category');
    if (active && cats.indexOf(active) < 0) active = null;

    function draw() {
      var shown = products.filter(function (p) { return !active || p.category === active; });
      grid.innerHTML = shown.length ? shown.map(cardHtml).join('') : '<p class="grid-note">Nothing in this category yet.</p>';
      if (pills) {
        pills.innerHTML = [null].concat(cats).map(function (c) {
          var n = c ? products.filter(function (p) { return p.category === c; }).length : products.length;
          return '<button type="button" class="filter-pill" data-cat="' + esc(c || '') + '" aria-pressed="' + (c === active) + '">' +
            esc(c || 'All') + '<span class="count">' + n + '</span></button>';
        }).join('');
      }
    }
    draw();
    if (pills) {
      pills.setAttribute('role', 'group');
      pills.setAttribute('aria-label', 'Filter by category');
      pills.addEventListener('click', function (e) {
        var b = e.target.closest('[data-cat]');
        if (b) setActive(b.getAttribute('data-cat') || null);
      });
    }
    function setActive(cat) {
      active = cats.indexOf(cat) >= 0 ? cat : null;
      draw();
      try {
        var url = new URL(location.href);
        if (active) url.searchParams.set('category', active); else url.searchParams.delete('category');
        history.replaceState(null, '', url);
      } catch (err) { /* preview frames may block history */ }
    }
    // Footer collection links filter in place on the home page instead of reloading it.
    showCategory = function (cat) {
      setActive(cat);
      var section = $('#collection-section');
      if (section) section.scrollIntoView({ behavior: 'smooth' });
    };
    if (active) {
      var section = $('#collection-section');
      if (section) section.scrollIntoView();
    }
  }
  var showCategory = null;

  // ---------- product detail (quick view and product page share this) ----------
  function detailHtml(p, headingTag) {
    var h = headingTag || 'h2';
    return '<div class="qv-media"><img src="' + esc(imageFor(p.slug)) + '" alt="' + esc(p.name) + '" width="800" height="1000"></div>' +
      '<div class="qv-body"><span class="product-cat">' + esc(p.category) + '</span>' +
      '<' + h + ' id="detail-title">' + esc(p.name) + '</' + h + '>' +
      '<div class="qv-price">' + money(p.price_cents) + '</div>' +
      '<p class="qv-desc">' + esc(p.desc || '') + '</p>' +
      (p.specs && p.specs.length ? '<ul class="spec-list">' + p.specs.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>' : '') +
      '<div class="qv-actions"><div class="qty" role="group" aria-label="Quantity">' +
      '<button type="button" data-detail-qty="-1" aria-label="Fewer">−</button><span id="detail-qty">1</span>' +
      '<button type="button" data-detail-qty="1" aria-label="More">+</button></div>' +
      '<button type="button" class="btn btn-primary" data-detail-add="' + esc(p.slug) + '"' + (p.in_stock ? '' : ' disabled') + '>' +
      (p.in_stock ? 'Add to bag' : 'Sold out') + '</button></div>' +
      '<p class="drawer-tax-note">Free fragile freight over ' + money(FREE_FREIGHT_FROM) + ' · 30-day in-home trial</p></div>';
  }

  var qvLastFocus = null;
  function openQuickView(p) {
    var overlay = $('#quickview-overlay');
    var content = $('#quickview-content');
    if (!overlay || !content) { location.href = productUrl(p.slug); return; }
    qvLastFocus = document.activeElement;
    content.innerHTML = detailHtml(p);
    var card = $('.quickview-card', overlay);
    if (card) { card.setAttribute('aria-labelledby', 'detail-title'); card.removeAttribute('aria-label'); }
    overlay.inert = false;
    overlay.classList.add('is-open');
    document.body.classList.add('no-scroll');
    setTimeout(function () { var c = $('#close-quickview-btn'); if (c) c.focus(); }, 60);
  }
  function closeQuickView() {
    var overlay = $('#quickview-overlay');
    if (!overlay || !overlay.classList.contains('is-open')) return;
    overlay.classList.remove('is-open');
    overlay.inert = true;
    document.body.classList.remove('no-scroll');
    if (qvLastFocus && qvLastFocus.focus) qvLastFocus.focus();
  }

  function renderProductPage(products) {
    var root = $('#product-detail');
    if (!root) return;
    var p = bySlug(products, query('slug') || '');
    if (!p) {
      root.innerHTML = '<div class="drawer-empty"><p>We couldn\'t find that piece.</p><a class="btn btn-secondary" href="/#collection-section">Browse the collection</a></div>';
      return;
    }
    document.title = p.name + ' | Mirror House Melbourne';
    var crumb = $('#crumb-name');
    if (crumb) crumb.textContent = p.name;
    root.innerHTML = detailHtml(p, 'h1');
  }

  // ---------- checkout ----------
  function renderCheckout(products) {
    var root = $('#checkout-root');
    if (!root) return;
    var lines = bagLines(products);
    if (!lines.length) {
      root.innerHTML = '<div class="panel confirmation"><h2>Your bag is empty</h2><p class="section-desc">Add a mirror or two, then come back to check out.</p>' +
        '<a class="btn btn-primary" href="/#collection-section">Browse the collection</a></div>';
      return;
    }
    root.innerHTML =
      '<form class="checkout-layout" id="checkout-form" novalidate>' +
      '<div class="panel"><h2>Delivery & options</h2>' +
      '<div class="field"><label for="co-email">Email for order updates</label><input id="co-email" type="email" autocomplete="email" required placeholder="you@example.com"></div>' +
      '<label class="option" for="co-cover"><input type="checkbox" id="co-cover"><span><strong>Transit & Breakage Cover</strong><small>Priority replacement if anything arrives damaged. Send photos within 48 hours.</small></span><span class="price">' + money(BREAKAGE_COVER) + '</span></label>' +
      '<label class="option" for="co-wg"><input type="checkbox" id="co-wg"><span><strong>White Glove delivery</strong><small>Two-person team carries it to your room of choice, unpacks it and takes the crate away.</small></span><span class="price">' + money(WHITE_GLOVE) + '</span></label>' +
      '<p class="drawer-tax-note">Payment by Square isn\'t connected in this demo. Your order is saved as pending and no card is charged.</p></div>' +
      '<div class="panel"><h2>Order summary</h2><ul class="summary-lines" id="co-lines"></ul>' +
      '<div class="summary-total"><span>Total (incl. GST)</span><span id="co-total"></span></div>' +
      '<button type="submit" class="btn btn-primary" id="co-submit">Place order</button>' +
      '<p class="form-msg" id="co-msg" role="status"></p></div></form>';

    function totals() {
      var subtotal = subtotalOf(lines);
      var freight = subtotal >= FREE_FREIGHT_FROM ? 0 : FLAT_FREIGHT;
      var cover = $('#co-cover').checked ? BREAKAGE_COVER : 0;
      var wg = $('#co-wg').checked ? WHITE_GLOVE : 0;
      var rows = lines.map(function (l) { return [l.product.name + ' × ' + l.qty, money(l.product.price_cents * l.qty)]; });
      rows.push(['Fragile freight', freight ? money(freight) : 'Free']);
      if (cover) rows.push(['Breakage cover', money(cover)]);
      if (wg) rows.push(['White Glove delivery', money(wg)]);
      $('#co-lines').innerHTML = rows.map(function (r) { return '<li><span>' + esc(r[0]) + '</span><span>' + r[1] + '</span></li>'; }).join('');
      $('#co-total').textContent = money(subtotal + freight + cover + wg);
    }
    totals();
    $('#co-cover').addEventListener('change', totals);
    $('#co-wg').addEventListener('change', totals);

    $('#checkout-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = $('#co-msg');
      var email = $('#co-email');
      msg.className = 'form-msg';
      if (!email.checkValidity()) { msg.textContent = 'Enter a valid email so we can send tracking updates.'; msg.className = 'form-msg error'; email.focus(); return; }
      if (PREVIEW) { msg.textContent = 'Orders are saved on the live site. This preview doesn\'t have the database behind it.'; return; }
      var submit = $('#co-submit');
      submit.disabled = true;
      msg.textContent = 'Placing your order…';
      fetch('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: email.value,
          items: lines.map(function (l) { return { slug: l.product.slug, qty: l.qty }; }),
          breakage_cover: $('#co-cover').checked,
          white_glove: $('#co-wg').checked
        })
      })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.d.error || 'We couldn\'t place the order.');
          writeCart({});
          root.innerHTML = '<div class="panel confirmation"><div class="tick" aria-hidden="true">✓</div>' +
            '<h2>Order #' + esc(res.d.order_id) + ' received</h2>' +
            '<p class="section-desc">Total ' + money(res.d.total_cents) + '. We\'ll email ' + esc(email.value) + ' when it\'s crated and on its way.</p>' +
            '<a class="btn btn-secondary" href="/">Back to the shop</a></div>';
          root.scrollIntoView();
        })
        .catch(function (err) {
          submit.disabled = false;
          msg.textContent = err.message || 'We couldn\'t place the order. Please try again.';
          msg.className = 'form-msg error';
        });
    });
  }

  // ---------- events ----------
  document.addEventListener('click', function (e) {
    var t = e.target;
    var el;
    if ((el = t.closest('.open-cart-btn'))) { e.preventDefault(); openDrawer(); return; }
    if (t.closest('#close-cart-btn') || t.id === 'cart-overlay' || t.closest('[data-close-drawer]')) { closeDrawer(); return; }
    if (t.closest('#close-quickview-btn') || t.id === 'quickview-overlay') { closeQuickView(); return; }
    if ((el = t.closest('#drawer-checkout-btn'))) {
      if (el.getAttribute('aria-disabled') === 'true') { e.preventDefault(); toast('Your bag is empty.'); }
      else if (PREVIEW) { e.preventDefault(); toast('This is a preview. Check out on the live shop: mirror-house-melbourne.zarko-ddc.workers.dev'); }
      return;
    }
    if ((el = t.closest('a[href*="category="]')) && showCategory) {
      var cat = null;
      try { cat = new URL(el.getAttribute('href'), location.href).searchParams.get('category'); } catch (err) { /* ignore */ }
      if (cat) { e.preventDefault(); showCategory(cat); return; }
    }
    if ((el = t.closest('[data-add]'))) {
      addToBag(el.getAttribute('data-add'), 1);
      loadProducts().then(function (ps) { var p = bySlug(ps, el.getAttribute('data-add')); toast((p ? p.name : 'Item') + ' added to your bag'); });
      return;
    }
    if ((el = t.closest('[data-quick]')) || (PREVIEW && (el = t.closest('[data-product-link]')))) {
      e.preventDefault();
      var slug = el.getAttribute('data-quick') || el.getAttribute('data-product-link');
      loadProducts().then(function (ps) { var p = bySlug(ps, slug); if (p) openQuickView(p); });
      return;
    }
    if ((el = t.closest('[data-detail-qty]'))) {
      var q = $('#detail-qty');
      q.textContent = Math.max(1, Math.min(20, parseInt(q.textContent, 10) + parseInt(el.getAttribute('data-detail-qty'), 10)));
      return;
    }
    if ((el = t.closest('[data-detail-add]'))) {
      addToBag(el.getAttribute('data-detail-add'), parseInt($('#detail-qty').textContent, 10) || 1);
      closeQuickView();
      openDrawer();
      return;
    }
    if ((el = t.closest('[data-qty]'))) {
      var s = el.getAttribute('data-qty');
      setQty(s, (readCart()[s] || 0) + parseInt(el.getAttribute('data-delta'), 10));
      return;
    }
    if ((el = t.closest('[data-remove]'))) { setQty(el.getAttribute('data-remove'), 0); return; }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeQuickView(); closeDrawer(); }
  });
  window.addEventListener('storage', function (e) { if (e.key === 'mh-cart') renderBag(); });

  // ---------- boot ----------
  function boot() {
    ensureDrawer();
    var qv = $('#quickview-overlay');
    if (qv) qv.inert = true;
    renderBag();
    loadProducts().then(function (products) {
      renderCatalogue(products);
      renderProductPage(products);
      renderCheckout(products);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
