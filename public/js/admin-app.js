// Mirror House admin: app shell, sign-in, routing, shared helpers, Home and Analytics.
// Orders, Products and the store settings pages live in admin-orders.js, admin-products.js and admin-store.js.
(function () {
  'use strict';
  var D = window.MHData, C = window.MHCharts, DAY = D.DAY;

  // ---------- helpers ----------
  var aud = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
  var audWhole = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
  function money(c) { return aud.format((c || 0) / 100); }
  function moneyShort(c, axis) {
    var v = (c || 0) / 100;
    if (axis && v >= 1000) return '$' + (v / 1000).toFixed(v >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k';
    return audWhole.format(v);
  }
  function int(n) { return Math.round(n || 0).toLocaleString('en-AU'); }
  function pct(n, dp) { return (100 * (n || 0)).toFixed(dp == null ? 1 : dp) + '%'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var fDate = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  var fDay = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short' });
  var fDayLong = new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
  var fTime = new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit' });
  var fMonth = new Intl.DateTimeFormat('en-AU', { month: 'short' });
  var fMonthLong = new Intl.DateTimeFormat('en-AU', { month: 'long', year: 'numeric' });
  function dateTime(t) {
    var d = new Date(t), today = D.startOfDay(new Date()).getTime();
    if (t >= today) return 'Today at ' + fTime.format(d);
    if (t >= today - DAY) return 'Yesterday at ' + fTime.format(d);
    return fDate.format(d) + ' at ' + fTime.format(d);
  }
  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  var toastTimer;
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  // Simple modal. fields: html string; onSubmit(form) returns false to keep it open.
  function modal(opts) {
    var wrap = document.createElement('div');
    wrap.className = 'modal';
    wrap.innerHTML = '<form class="modal-card" role="dialog" aria-modal="true" aria-labelledby="m-title" novalidate>' +
      '<div class="modal-head"><h2 id="m-title">' + esc(opts.title) + '</h2><button type="button" class="icon-btn" data-close aria-label="Close" style="color:#303030">✕</button></div>' +
      '<div class="modal-body">' + opts.body + '</div>' +
      '<div class="modal-foot"><button type="button" class="btn" data-close>Cancel</button>' +
      (opts.danger ? '<button type="submit" class="btn danger">' + esc(opts.submit || 'Delete') + '</button>' : '<button type="submit" class="btn primary">' + esc(opts.submit || 'Save') + '</button>') +
      '</div></form>';
    var last = document.activeElement;
    document.body.appendChild(wrap);
    var form = wrap.querySelector('form');
    function close() { wrap.remove(); document.removeEventListener('keydown', key); if (last && last.focus) last.focus(); }
    function key(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', key);
    wrap.addEventListener('click', function (e) { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
    form.addEventListener('submit', function (e) { e.preventDefault(); if (opts.onSubmit(form) !== false) close(); });
    if (opts.onOpen) opts.onOpen(form);
    var first = form.querySelector('.modal-body input, .modal-body select, .modal-body textarea, .modal-foot .primary, .modal-foot .danger');
    setTimeout(function () { if (first) first.focus(); }, 30);
    return { close: close, form: form };
  }

  function badgeFor(kind, v) {
    var map = {
      payment: { paid: ['good', 'Paid'], pending: ['warn', 'Payment pending'], refunded: ['', 'Refunded'], partially_refunded: ['', 'Partially refunded'], awaiting_quote: ['warn', 'Awaiting delivery quote'], quote_sent: ['info', 'Quote sent'], voided: ['', 'Cancelled'] },
      fulfil: { unfulfilled: ['warn', 'Unfulfilled'], out_for_delivery: ['info', 'Out for delivery'], ready: ['info', 'Ready for pick-up'], delivered: ['', 'Delivered'], picked_up: ['', 'Picked up'], cancelled: ['', 'Cancelled'], on_hold: ['warn', 'On hold'] },
      status: { active: ['good', 'Active'], draft: ['info', 'Draft'], archived: ['', 'Archived'] }
    };
    var b = (map[kind] || {})[v] || ['', v];
    return '<span class="badge ' + b[0] + '">' + esc(b[1]) + '</span>';
  }
  var EMPTY_IMG = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="14" height="14" rx="2"/><path d="M3 14l4-4 3 3 2-2 5 5"/></svg>';
  function thumb(src, cls) {
    return src ? '<img class="thumb ' + (cls || '') + '" src="' + esc(src) + '" alt="" loading="lazy">'
      : '<span class="thumb thumb-empty ' + (cls || '') + '">' + EMPTY_IMG + '</span>';
  }
  // Missing photos fall back to a plain placeholder.
  document.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t.tagName === 'IMG' && t.classList.contains('thumb')) {
      var span = document.createElement('span');
      span.className = t.className + ' thumb-empty'; span.innerHTML = EMPTY_IMG; t.replaceWith(span);
    }
  }, true);
  function productImage(slug) {
    var p = D.load().products.filter(function (x) { return x.slug === slug; })[0];
    return p && p.images && p.images[0] ? p.images[0] : '';
  }
  function sampleBanner() {
    if (!D.load().sampleData) return '';
    return '<div class="banner warn no-print"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="10" cy="10" r="8"/><path d="M10 6v5M10 14h.01"/></svg>' +
      '<div class="grow"><p><strong>You\'re looking at sample data.</strong> These orders, customers and visitor numbers are made up so you can see how everything works. Your real ones appear here once your developer connects the live database, Square and analytics.</p></div>' +
      '<a class="btn" href="#/settings">Manage</a></div>';
  }
  function csv(name, headers, rows) {
    var q = function (v) {
      v = v == null ? '' : String(v);
      if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; // a customer's text can't run as a spreadsheet formula
      return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    };
    var text = [headers.map(q).join(',')].concat(rows.map(function (r) { return r.map(q).join(','); })).join('\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function delta(cur, prev, invert) {
    if (!prev) return cur ? '<span class="delta flat">New</span>' : '<span class="delta flat">–</span>';
    var ch = (cur - prev) / prev, up = ch >= 0;
    if (Math.abs(ch) < 0.005) return '<span class="delta flat">0%</span>';
    return '<span class="delta ' + ((up !== !!invert) ? 'up' : 'down') + '">' + (up ? '↑' : '↓') + ' ' + Math.abs(ch * 100).toFixed(0) + '%</span>';
  }

  // ---------- period maths ----------
  function rangeBounds(range) {
    var now = new Date(), end = now.getTime(), today = D.startOfDay(now).getTime();
    var days = { today: 1, '7d': 7, '30d': 30, '90d': 90, '365d': 365 }[range] || 30;
    var start = today - (days - 1) * DAY;
    // Compare like with like: today so far vs yesterday up to the same time.
    return { start: start, end: end, days: days, prevStart: start - days * DAY, prevEnd: range === 'today' ? end - DAY : start - 1, partial: range === 'today' ? (end - today) / DAY : 1 };
  }
  function ordersIn(a, b) { return D.load().orders.filter(function (o) { return o.createdAt >= a && o.createdAt <= b; }); }
  // Quote requests aren't sales until the customer pays.
  function isSale(o) { return ['awaiting_quote', 'quote_sent', 'voided', 'refunded'].indexOf(o.payment) < 0; }
  function salesOf(list) { return list.reduce(function (s, o) { return s + (isSale(o) ? o.total - (o.refunded || 0) : 0); }, 0); }
  function trafficIn(a, b) { return D.traffic().filter(function (d) { return d.t >= D.startOfDay(a).getTime() && d.t <= b; }); }
  function sum(list, k) { return list.reduce(function (s, d) { return s + (d[k] || 0); }, 0); }

  // Buckets for the sales chart. mode: day | week | month
  function salesSeries(mode, count, offsetBuckets) {
    var now = new Date(), out = [];
    var orders = D.load().orders;
    for (var i = count - 1; i >= 0; i--) {
      var idx = i + (offsetBuckets || 0), a, b, label, tip;
      if (mode === 'day') {
        a = D.startOfDay(now).getTime() - idx * DAY; b = a + DAY - 1;
        label = fDay.format(new Date(a)); tip = fDayLong.format(new Date(a));
      } else if (mode === 'week') {
        var mon = D.startOfDay(now); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
        a = mon.getTime() - idx * 7 * DAY; b = a + 7 * DAY - 1;
        label = fDay.format(new Date(a)); tip = 'Week of ' + fDay.format(new Date(a));
      } else {
        var m = new Date(now.getFullYear(), now.getMonth() - idx, 1);
        a = m.getTime(); b = new Date(now.getFullYear(), now.getMonth() - idx + 1, 1).getTime() - 1;
        label = fMonth.format(m); tip = fMonthLong.format(m);
      }
      var list = orders.filter(function (o) { return o.createdAt >= a && o.createdAt <= b; });
      out.push({ label: label, tip: tip, sales: salesOf(list), orders: list.length, a: a, b: b });
    }
    return out;
  }

  // ---------- routing ----------
  var routes = [];
  function route(pattern, render, nav) { routes.push({ re: pattern, render: render, nav: nav }); }
  var leaveGuard = null; // set by editors with unsaved changes
  function go(hash) { location.hash = hash; }
  function render() {
    if (!D.load()) return; // not signed in yet (e.g. an Identity email link's #invite_token is being handled)
    var h = location.hash.replace(/^#/, '') || '/';
    var main = $('#main');
    for (var i = 0; i < routes.length; i++) {
      var m = h.match(routes[i].re);
      if (m) {
        $all('[data-nav]').forEach(function (a) { if (a.getAttribute('data-nav') === routes[i].nav) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
        main.innerHTML = '';
        routes[i].render(main, m.slice(1).map(decodeURIComponent));
        closeMenu();
        updateCounts();
        window.scrollTo(0, 0);
        return;
      }
    }
    go('#/');
  }
  window.addEventListener('hashchange', function (e) {
    if (leaveGuard && !leaveGuard()) {
      // Stay on the editor: restore the old hash without re-rendering.
      var old = e.oldURL.split('#')[1] || '/';
      history.replaceState(null, '', '#' + old);
      return;
    }
    leaveGuard = null;
    render();
  });

  function updateCounts() {
    var n = D.load().orders.filter(function (o) { return o.fulfilment === 'unfulfilled' && o.payment !== 'refunded'; }).length;
    var c = $('#nav-unfulfilled'); c.hidden = !n; c.textContent = n;
  }

  // ---------- mobile menu ----------
  function closeMenu() { $('#sidebar').classList.remove('open'); $('#scrim').classList.remove('open'); $('#menu-btn').setAttribute('aria-expanded', 'false'); }
  function openMenu() { $('#sidebar').classList.add('open'); $('#scrim').classList.add('open'); $('#menu-btn').setAttribute('aria-expanded', 'true'); }

  // ---------- sign-in (Netlify Identity) ----------
  // Only people invited to the site's Netlify Identity, with the admin role, can sign in. The page itself holds
  // no store data: everything loads from /api/admin after sign-in, and the server checks the sign-in every time.
  var IDLE = 30 * 60000, lastActive = Date.now(), started = false;
  function identity() { return window.netlifyIdentity; }
  function token() {
    var u = identity() && identity().currentUser();
    return u ? u.jwt() : Promise.reject(Object.assign(new Error('Please sign in again.'), { status: 401 }));
  }
  function showLock(msg) {
    started = false;
    $('#app').hidden = true; $('#app-top').hidden = true; $('#lock').hidden = false;
    $('#lock-msg').textContent = msg || '';
    $('#lock-btn').disabled = false;
    setTimeout(function () { $('#lock-btn').focus(); }, 30);
  }
  var lockMsg = '';
  function lock(msg) {
    var id = identity();
    lockMsg = msg || '';
    showLock(lockMsg);
    if (id && id.currentUser()) id.logout(); // fires 'logout', which shows the sign-in screen again
  }
  function start(user) {
    if (started) return;
    started = true;
    $('#lock-msg').textContent = 'Opening your admin…';
    $('#lock-btn').disabled = true;
    D.init(token).then(function () {
      var name = (user.user_metadata && user.user_metadata.full_name) || String(user.email || '').split('@')[0];
      $('.top-user .name').textContent = name;
      $('.top-user .avatar').textContent = (name.charAt(0) || 'A').toUpperCase();
      lastActive = Date.now();
      unlock();
    }, function (err) {
      started = false;
      if (err.status === 401 || err.status === 403) lock(err.status === 403 ? 'This account doesn\'t have admin access. Ask the store owner to give it the admin role in Netlify Identity.' : err.message);
      else showLock('Your admin couldn\'t load: ' + err.message + ' Please try again.');
    });
  }
  function unlock() {
    $('#lock').hidden = true; $('#app').hidden = false; $('#app-top').hidden = false;
    render();
  }
  function initLock() {
    var id = identity();
    if (!id) { showLock('The sign-in service didn\'t load. Check your connection and refresh the page.'); $('#lock-btn').disabled = true; return; }
    $('#lock-form').addEventListener('submit', function (e) { e.preventDefault(); id.open('login'); });
    id.on('init', function (user) { if (user) start(user); else showLock(); });
    id.on('login', function (user) { id.close(); start(user); });
    id.on('logout', function () { showLock(lockMsg); lockMsg = ''; });
    id.on('error', function (err) { $('#lock-msg').textContent = (err && err.message) || 'Sign-in didn\'t work. Please try again.'; });
    ['pointerdown', 'keydown'].forEach(function (ev) { document.addEventListener(ev, function () { lastActive = Date.now(); }, { passive: true }); });
    setInterval(function () {
      if (started && Date.now() - lastActive > IDLE) {
        started = false; // finish any saves first, then sign out
        D.saved().then(function () { lock(); toast('Signed out after 30 minutes without activity'); });
      }
    }, 30000);
    if (id.currentUser()) start(id.currentUser());
  }
  // Shows "Saving…" / "All changes saved" in the top bar.
  var statusTimer;
  function saveStatus(text, isError) {
    var el = $('#save-status'); if (!el) return;
    el.textContent = text; el.classList.toggle('error', !!isError); el.hidden = false;
    clearTimeout(statusTimer);
    if (!isError && text === 'All changes saved') statusTimer = setTimeout(function () { el.hidden = true; }, 2500);
  }
  // Re-draws the page after a save, unless an editor or a dialog is open.
  function refreshView() {
    if (!started || leaveGuard || document.querySelector('.modal')) return;
    var y = window.scrollY; render(); window.scrollTo(0, y);
  }

  // ---------- search ----------
  function initSearch() {
    var input = $('#search'), box = $('#search-results');
    function run() {
      var q = input.value.trim().toLowerCase();
      if (q.length < 2) { box.hidden = true; return; }
      var s = D.load(), hits = [];
      s.orders.slice().reverse().forEach(function (o) {
        if (hits.length < 6 && (o.number.toLowerCase().indexOf(q) >= 0 || o.customer.name.toLowerCase().indexOf(q) >= 0 || o.customer.email.toLowerCase().indexOf(q) >= 0))
          hits.push(['#/orders/' + o.id, o.number + ' · ' + o.customer.name, money(o.total)]);
      });
      s.products.forEach(function (p) { if (p.title.toLowerCase().indexOf(q) >= 0) hits.push(['#/products/' + encodeURIComponent(p.id), p.title, 'Product']); });
      D.customers().forEach(function (c) { if (hits.length < 14 && (c.name.toLowerCase().indexOf(q) >= 0 || c.email.toLowerCase().indexOf(q) >= 0)) hits.push(['#/customers/' + encodeURIComponent(c.id), c.name, 'Customer']); });
      box.innerHTML = hits.length ? hits.slice(0, 12).map(function (h) { return '<a href="' + esc(h[0]) + '"><span>' + esc(h[1]) + '</span><small>' + esc(h[2]) + '</small></a>'; }).join('') : '<div class="empty">No matches</div>';
      box.hidden = false;
    }
    input.addEventListener('input', run);
    input.addEventListener('focus', run);
    input.addEventListener('keydown', function (e) { if (e.key === 'Escape') { box.hidden = true; input.blur(); } });
    box.addEventListener('click', function () { box.hidden = true; input.value = ''; });
    document.addEventListener('click', function (e) { if (!e.target.closest('.top-search')) box.hidden = true; });
  }

  // ---------- Home ----------
  var homeRange = '7d', salesMode = 'day';
  function kpiCard(items) {
    return '<div class="card flush"><div class="kpis">' + items.map(function (k) {
      return '<div class="kpi"><span class="k-label" title="' + esc(k.help || '') + '">' + esc(k.label) + '</span>' +
        '<span class="k-val">' + esc(k.value) + ' ' + (k.delta || '') + '</span>' + (k.spark ? C.spark(k.spark) : '') + '</div>';
    }).join('') + '</div></div>';
  }
  function salesChart(host, mode) {
    var counts = { day: 30, week: 12, month: 12 }[mode];
    var cur = salesSeries(mode, counts, 0);
    var series = [{ name: mode === 'day' ? 'Last 30 days' : mode === 'week' ? 'Last 12 weeks' : 'Last 12 months', tipName: 'Sales', className: 's1', values: cur.map(function (b) { return b.sales; }) }];
    if (mode !== 'month') {
      var prev = salesSeries(mode, counts, counts);
      series.push({ name: 'Previous period', tipName: 'Previous period', className: 'prev', dashed: true, values: prev.map(function (b) { return b.sales; }) });
    }
    C.line(host, { labels: cur.map(function (b) { return b.label; }), tipLabels: cur.map(function (b) { return b.tip + ' · ' + b.orders + (b.orders === 1 ? ' order' : ' orders'); }),
      series: series, fmt: moneyShort, zeroMax: 100000, height: 240, label: 'Sales over time', xName: mode === 'day' ? 'Day' : mode === 'week' ? 'Week' : 'Month' });
  }
  function renderHome(main) {
    var s = D.load(), b = rangeBounds(homeRange);
    var cur = ordersIn(b.start, b.end), prev = ordersIn(b.prevStart, b.prevEnd);
    var tr = trafficIn(b.start, b.end), trp = trafficIn(b.prevStart, b.prevEnd);
    var sess = sum(tr, 'sessions'), sessP = Math.round(sum(trp, 'sessions') * b.partial);
    var conv = sess ? cur.length / sess : 0, convP = sessP ? prev.length / sessP : 0;
    var last14 = salesSeries('day', 14, 0);
    var hour = new Date().getHours();
    var hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    var todo = s.orders.filter(function (o) { return o.fulfilment === 'unfulfilled' && o.payment !== 'refunded'; });
    var pick = s.orders.filter(function (o) { return o.fulfilment === 'ready'; });
    var transit = s.orders.filter(function (o) { return o.fulfilment === 'out_for_delivery'; });
    var quotes = s.orders.filter(function (o) { return o.payment === 'awaiting_quote'; }), quotesSent = s.orders.filter(function (o) { return o.payment === 'quote_sent'; });
    var low = s.products.filter(function (p) { return p.status === 'active' && p.stock != null && p.stock !== '' && +p.stock > 0 && +p.stock <= (p.lowAt != null && p.lowAt !== '' ? +p.lowAt : 1); });
    var soldOut = s.products.filter(function (p) { return p.status === 'active' && p.stock != null && p.stock !== '' && +p.stock <= 0; });
    var top = {};
    cur.forEach(function (o) { if (o.payment === 'refunded') return; o.lines.forEach(function (l) { top[l.slug] = top[l.slug] || { title: l.title, qty: 0, sales: 0 }; top[l.slug].qty += l.qty; top[l.slug].sales += l.price * l.qty; }); });
    var topList = Object.keys(top).map(function (k) { return Object.assign({ slug: k }, top[k]); }).sort(function (a, c) { return c.sales - a.sales; });

    main.innerHTML = '<div class="page wide">' + sampleBanner() +
      '<div class="page-head"><h1>' + hello + ', Debbie</h1><span class="grow"></span>' +
      '<div class="seg" role="group" aria-label="Date range">' + [['today', 'Today'], ['7d', '7 days'], ['30d', '30 days']].map(function (r) {
        return '<button type="button" data-range="' + r[0] + '" aria-pressed="' + (homeRange === r[0]) + '">' + r[1] + '</button>'; }).join('') + '</div></div>' +
      kpiCard([
        { label: 'Total sales', value: money(salesOf(cur)), delta: delta(salesOf(cur), salesOf(prev)), spark: last14.map(function (x) { return x.sales; }), help: 'Order totals including delivery, insurance and GST, less refunds' },
        { label: 'Orders', value: int(cur.length), delta: delta(cur.length, prev.length), spark: last14.map(function (x) { return x.orders; }) },
        { label: 'Sessions', value: int(sess), delta: delta(sess, sessP), spark: trafficIn(Date.now() - 13 * DAY, Date.now()).map(function (d) { return d.sessions; }), help: 'Visits to your online store' },
        { label: 'Conversion rate', value: pct(conv, 2), delta: delta(conv, convP), help: 'Share of sessions that ended in an order' }
      ]) +
      '<div class="cols"><div>' +
      '<section class="card"><div class="card-head"><h2>Sales over time</h2><span class="grow"></span><div class="seg" role="group" aria-label="Group sales by">' +
      [['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly']].map(function (m) { return '<button type="button" data-mode="' + m[0] + '" aria-pressed="' + (salesMode === m[0]) + '">' + m[1] + '</button>'; }).join('') +
      '</div></div><div id="sales-chart"></div></section>' +
      '<section class="card flush"><div class="card-head" style="padding:16px 16px 8px"><h2>Recent orders</h2><span class="grow"></span><a class="btn plain" href="#/orders">View all</a></div>' +
      (s.orders.length ? '<div class="table-wrap"><table class="data"><thead><tr><th>Order</th><th>Date</th><th>Customer</th><th class="right">Total</th><th>Fulfilment</th></tr></thead><tbody>' +
        s.orders.slice(-6).reverse().map(function (o) {
          return '<tr data-href="#/orders/' + o.id + '"><td><strong>' + esc(o.number) + '</strong></td><td>' + esc(dateTime(o.createdAt)) + '</td><td>' + esc(o.customer.name) + '</td><td class="right num">' + money(o.total) + '</td><td>' + badgeFor('fulfil', o.fulfilment) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">No orders yet. They\'ll show here as soon as they come in.</div>') + '</section>' +
      '</div><div>' +
      '<section class="card"><h2>Things to do</h2>' +
      (quotes.length || quotesSent.length ? '<a class="btn" style="justify-content:space-between" href="#/orders?tab=quotes"><span>' + quotes.length + ' delivery ' + (quotes.length === 1 ? 'quote' : 'quotes') + ' to send · ' + quotesSent.length + ' awaiting payment</span><span>→</span></a>' : '') +
      '<a class="btn" style="justify-content:space-between" href="#/orders?tab=unfulfilled"><span>' + todo.length + ' ' + (todo.length === 1 ? 'order' : 'orders') + ' to fulfil</span><span>→</span></a>' +
      '<a class="btn" style="justify-content:space-between" href="#/orders?tab=progress"><span>' + transit.length + ' out for delivery · ' + pick.length + ' awaiting pick-up</span><span>→</span></a>' +
      soldOut.map(function (p) { return '<a class="btn" style="justify-content:space-between;text-align:left;white-space:normal;height:auto;min-width:0;border-color:#d9a3a3;background:#fdf0f0" href="#/products/' + encodeURIComponent(p.id) + '"><span><strong>Sold out: ' + esc(p.title) + '</strong><br><span class="small">Showing as Sold out in your shop. Follow up with your supplier' + (p.supplierCode ? ' (code ' + esc(p.supplierCode) + ')' : '') + ', then update the stock when more arrive.</span></span><span>→</span></a>'; }).join('') +
      low.map(function (p) { return '<a class="btn" style="justify-content:space-between;text-align:left;white-space:normal;height:auto;min-width:0;border-color:#e2b74a;background:#fff8e6" href="#/products/' + encodeURIComponent(p.id) + '"><span><strong>Low stock: ' + esc(p.title) + '</strong><br><span class="small">Only ' + p.stock + ' left. Check if more are available' + (p.supplierCode ? ' (supplier code ' + esc(p.supplierCode) + ')' : '') + '.</span></span><span>→</span></a>'; }).join('') +
      '<a class="btn" style="justify-content:space-between" href="#/settings"><span>Finish set-up: Square, analytics, Google</span><span>→</span></a></section>' +
      '<section class="card"><div class="card-head"><h2>Top products</h2><span class="grow"></span><span class="muted small">' + esc({ today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days' }[homeRange]) + '</span></div>' +
      (topList.length ? '<div id="top-products"></div>' : '<p class="card-sub">No sales in this period yet.</p>') + '</section>' +
      '</div></div></div>';

    salesChart($('#sales-chart'), salesMode);
    if (topList.length) C.bars($('#top-products'), { rows: topList.slice(0, 5).map(function (t) { return { label: t.title.replace('Statement Curve Mirror', 'Statement Curve'), value: t.sales, note: t.qty + ' sold' }; }), fmt: moneyShort });
    main.querySelector('.page').addEventListener('click', function (e) {
      var r = e.target.closest('[data-range]'); if (r) { homeRange = r.getAttribute('data-range'); renderHome(main); return; }
      var m = e.target.closest('[data-mode]'); if (m) { salesMode = m.getAttribute('data-mode'); renderHome(main); return; }
      var tr = e.target.closest('tr[data-href]'); if (tr) go(tr.getAttribute('data-href'));
    });
  }

  // ---------- Analytics ----------
  var anRange = '30d';
  function renderAnalytics(main) {
    var s = D.load(), b = rangeBounds(anRange);
    var cur = ordersIn(b.start, b.end), prev = ordersIn(b.prevStart, b.prevEnd);
    var tr = trafficIn(b.start, b.end), trp = trafficIn(b.prevStart, b.prevEnd);
    var sales = salesOf(cur), salesP = salesOf(prev);
    var paid = cur.filter(isSale), paidP = prev.filter(isSale);
    var aov = paid.length ? sales / paid.length : 0, aovP = paidP.length ? salesP / paidP.length : 0;
    var sess = sum(tr, 'sessions'), sessP = sum(trp, 'sessions');
    var visitors = sum(tr, 'visitors');
    var conv = sess ? cur.length / sess : 0, convP = sessP ? prev.length / sessP : 0;
    var emails = {}; s.orders.forEach(function (o) { if (o.createdAt < b.start) emails[o.customer.email] = 1; });
    var returning = cur.filter(function (o) { return emails[o.customer.email]; }).length;
    var avg = function (k) { return tr.length ? sum(tr, k) / tr.length : 0; };
    var hasTraffic = true, noTraffic = tr.length === 0; // always show every section; zeros until the first visits
    var bk = D.trafficBreakdown(anRange) || { sources: [], devices: [], locations: [], hours: [], pages: [], visualiserOrders: 0 };

    var groupBy = b.days > 90 ? 'month' : b.days > 31 ? 'week' : 'day';
    var count = groupBy === 'day' ? b.days : groupBy === 'week' ? Math.ceil(b.days / 7) : 12;
    var curS = salesSeries(groupBy, count, 0), prevS = groupBy === 'month' ? null : salesSeries(groupBy, count, count);
    // sessions per bucket
    function sessBuckets(series) {
      return series.map(function (bk) { return sum(trafficIn(bk.a, bk.b), 'sessions'); });
    }

    main.innerHTML = '<div class="page wide">' + sampleBanner() +
      '<div class="page-head"><h1>Analytics</h1><span class="grow"></span><div class="seg" role="group" aria-label="Date range">' +
      [['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days'], ['365d', '12 months']].map(function (r) { return '<button type="button" data-range="' + r[0] + '" aria-pressed="' + (anRange === r[0]) + '">' + r[1] + '</button>'; }).join('') +
      '</div></div><p class="muted" style="margin:-8px 0 0">' + fDate.format(new Date(b.start)) + ' – ' + fDate.format(new Date(b.end)) + ', compared with the ' + b.days + ' days before.</p>' +
      (noTraffic ? '<section class="card" style="border-left:4px solid #b8913f"><p style="margin:0"><strong>No visits counted in this period yet.</strong> Sales and orders below are live from your shop. Visitor numbers, sources, devices, pages and the shopper journey are counted by the shop itself from the day it goes live, with no cookies. Google Analytics, if you add it in <a href="#/settings">Settings</a>, keeps its own report at analytics.google.com.</p></section>' : '') +
      kpiCard([
        { label: 'Total sales', value: money(sales), delta: delta(sales, salesP) },
        { label: 'Orders', value: int(cur.length), delta: delta(cur.length, prev.length) },
        { label: 'Average order value', value: money(aov), delta: delta(aov, aovP) },
        { label: 'Returning customer rate', value: pct(cur.length ? returning / cur.length : 0), help: 'Orders from people who had ordered before' }
      ]) +
      (hasTraffic ? kpiCard([
        { label: 'Sessions', value: int(sess), delta: delta(sess, sessP) },
        { label: 'Visitors', value: int(visitors), help: 'Different people, roughly' },
        { label: 'Conversion rate', value: pct(conv, 2), delta: delta(conv, convP) },
        { label: 'Avg time on site', value: Math.floor(avg('duration') / 60) + 'm ' + String(Math.round(avg('duration') % 60)).padStart(2, '0') + 's' }
      ]) : '') +
      '<section class="card"><div class="card-head"><h2>Sales over time</h2></div><div id="an-sales"></div></section>' +
      (hasTraffic ?
        '<section class="card"><div class="card-head"><h2>Sessions over time</h2></div><div id="an-sessions"></div></section>' +
        '<div class="grid-2">' +
        '<section class="card"><div class="card-head"><h2>Shopper journey</h2></div><p class="card-sub">How far visitors get, from arriving to placing an order.</p><div id="an-funnel"></div></section>' +
        '<section class="card"><div class="card-head"><h2>Try It in Your Room</h2></div><div id="an-viz"></div></section>' +
        '</div><div class="grid-2">' +
        '<section class="card"><h2>Where visitors come from</h2><div id="an-sources"></div></section>' +
        '<section class="card"><h2>Devices</h2><div id="an-devices"></div><h2 style="margin-top:8px">Visitor locations</h2><div id="an-loc"></div></section>' +
        '</div><div class="grid-2">' +
        '<section class="card"><h2>Busiest times of day</h2><p class="card-sub">Sessions by hour, this period.</p><div id="an-hours"></div></section>' +
        '<section class="card"><h2>Busiest days of the week</h2><p class="card-sub">Average sessions per day.</p><div id="an-dow"></div></section>' +
        '</div>' +
        '<section class="card flush"><div class="card-head" style="padding:16px 16px 8px"><h2>Most viewed pages</h2></div><div class="table-wrap"><table class="data"><thead><tr><th>Page</th><th class="right">Views</th><th class="right">Avg time on page</th><th class="right">Left the site here</th></tr></thead><tbody id="an-pages"></tbody></table></div></section>' +
        '<div class="grid-2"><section class="card"><h2>Sales by product</h2><div id="an-products"></div></section>' +
        '<section class="card"><h2>Visitor behaviour</h2><div class="grid-2" id="an-behaviour"></div></section></div>'
        : '<section class="card"><div class="empty"><strong>No visitor data yet</strong><p>Connect Google Analytics 4 (or Plausible) in Settings and your visitor numbers, sources and shopper journey will show here.</p><a class="btn primary" href="#/settings">Go to Settings</a></div></section>') +
      '</div>';

    C.line($('#an-sales'), { labels: curS.map(function (x) { return x.label; }), tipLabels: curS.map(function (x) { return x.tip + ' · ' + x.orders + (x.orders === 1 ? ' order' : ' orders'); }),
      series: [{ name: 'This period', tipName: 'Sales', className: 's1', values: curS.map(function (x) { return x.sales; }) }].concat(prevS ? [{ name: 'Previous period', className: 'prev', dashed: true, values: prevS.map(function (x) { return x.sales; }) }] : []),
      fmt: moneyShort, zeroMax: 100000, label: 'Sales over time', xName: groupBy });
    if (!hasTraffic) { bindRange(main); return; }

    C.line($('#an-sessions'), { labels: curS.map(function (x) { return x.label; }), tipLabels: curS.map(function (x) { return x.tip; }),
      series: [{ name: 'This period', tipName: 'Sessions', className: 's1', values: sessBuckets(curS) }].concat(prevS ? [{ name: 'Previous period', className: 'prev', dashed: true, values: sessBuckets(prevS) }] : []),
      fmt: function (v) { return int(v); }, label: 'Sessions over time', xName: groupBy });

    C.funnel($('#an-funnel'), [
      { label: 'Visited the store', value: sess }, { label: 'Viewed a mirror', value: sum(tr, 'productViews') },
      { label: 'Added to bag', value: sum(tr, 'addToBag') }, { label: 'Reached checkout', value: sum(tr, 'checkout') }, { label: 'Placed an order', value: cur.length }
    ]);
    var vz = sum(tr, 'visualiser'), vzOrders = Math.min(cur.length, bk.visualiserOrders || 0);
    var vzConv = vz ? vzOrders / vz : 0, otherConv = (sess - vz) ? (cur.length - vzOrders) / (sess - vz) : 0;
    $('#an-viz').innerHTML = '<div class="grid-2"><div class="kv"><span class="k">Sessions that used it</span><strong style="font-size:20px">' + int(vz) + '</strong><span class="muted">' + pct(sess ? vz / sess : 0) + ' of all sessions</span></div>' +
      '<div class="kv"><span class="k">Orders after using it</span><strong style="font-size:20px">' + int(vzOrders) + '</strong><span class="muted">' + pct(cur.length ? vzOrders / cur.length : 0, 0) + ' of all orders</span></div></div>' +
      '<div id="an-viz-bars"></div><p class="card-sub small">Visitors who try a mirror in their room are about ' + (otherConv ? (vzConv / otherConv).toFixed(1) : '–') + '× more likely to order.</p>';
    C.bars($('#an-viz-bars'), { rows: [{ label: 'Used Try It in Your Room', value: vzConv * 100 }, { label: 'Didn\'t use it', value: otherConv * 100 }], fmt: function (v) { return v.toFixed(2) + '%'; } });

    var bkTotal = function (rows) { return rows.reduce(function (n, r) { return n + r.value; }, 0) || 1; };
    var noRows = function (rows, text) { return rows.length ? rows : [{ label: text, value: 0 }]; };
    C.bars($('#an-sources'), { rows: noRows(bk.sources.map(function (r) { return { label: r.label, value: r.value, note: pct(r.value / bkTotal(bk.sources), 0) }; }), 'No visits yet'), fmt: int });
    C.bars($('#an-devices'), { rows: noRows(bk.devices.map(function (r) { return { label: r.label, value: r.value, note: pct(r.value / bkTotal(bk.devices), 0) }; }), 'No visits yet'), fmt: int });
    C.bars($('#an-loc'), { rows: noRows(bk.locations.map(function (r) { return { label: r.label, value: r.value }; }), 'No visits yet'), fmt: int });
    var hrs = (bk.hours.length ? bk.hours : new Array(24).fill(0)).map(function (v) { return { value: v }; });
    C.columns($('#an-hours'), { labels: hrs.map(function (h, i) { return i % 6 === 0 ? (i === 0 ? '12am' : i < 12 ? i + 'am' : i === 12 ? '12pm' : (i - 12) + 'pm') : ''; }),
      tipLabels: hrs.map(function (h, i) { var a = function (x) { return x === 0 ? '12am' : x < 12 ? x + 'am' : x === 12 ? '12pm' : (x - 12) + 'pm'; }; return a(i) + '–' + a((i + 1) % 24); }),
      values: hrs.map(function (h) { return h.value; }), name: 'Sessions', fmt: function (v) { return int(v); }, height: 180, xName: 'Hour' });
    var dow = [0, 0, 0, 0, 0, 0, 0], dn = [0, 0, 0, 0, 0, 0, 0];
    tr.forEach(function (d) { var k = (new Date(d.t).getDay() + 6) % 7; dow[k] += d.sessions; dn[k]++; });
    C.columns($('#an-dow'), { labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], tipLabels: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      values: dow.map(function (v, i) { return dn[i] ? Math.round(v / dn[i]) : 0; }), name: 'Avg sessions', fmt: function (v) { return int(v); }, height: 180, xName: 'Day' });
    var pageName = function (path) {
      var m = /slug=([a-z0-9-]+)/.exec(path || ''), p = m && s.products.filter(function (x) { return x.slug === m[1]; })[0];
      if (p) return p.title;
      return { '/': 'Home', '/index.html': 'Home', '/visualiser.html': 'Try It in Your Room', '/checkout.html': 'Checkout', '/policies.html': 'Delivery, Returns & Care', '/product.html': 'Product page' }[(path || '').split('?')[0]] || path;
    };
    if (!bk.pages.length) $('#an-pages').innerHTML = '<tr style="cursor:default"><td colspan="4" class="muted">Your most viewed pages, time on page and exit rates will show here.</td></tr>';
    else $('#an-pages').innerHTML = bk.pages.map(function (p) {
      return '<tr style="cursor:default"><td><strong>' + esc(pageName(p.path)) + '</strong> <span class="muted small hide-sm">' + esc(p.path) + '</span></td><td class="right num">' + int(p.views) + '</td><td class="right num">' + (p.secs >= 60 ? Math.floor(p.secs / 60) + 'm ' + String(p.secs % 60).padStart(2, '0') + 's' : p.secs + 's') + '</td><td class="right num">' + pct(p.exitRate, 0) + '</td></tr>';
    }).join('');
    var bySlug = {};
    paid.forEach(function (o) { o.lines.forEach(function (l) { bySlug[l.title] = (bySlug[l.title] || 0) + l.price * l.qty; }); });
    if (!paid.length) $('#an-products').innerHTML = '<p class="card-sub">Sales for each mirror will show here.</p>'; else C.bars($('#an-products'), { rows: Object.keys(bySlug).map(function (k) { return { label: k.replace('Statement Curve Mirror', 'Statement Curve'), value: bySlug[k] }; }).sort(function (a, c) { return c.value - a.value; }), fmt: moneyShort });
    $('#an-behaviour').innerHTML = [
      ['Bounce rate', pct(avg('bounce'), 0), 'Left after one page'], ['Pages per session', avg('pagesPer').toFixed(1), ''],
      ['Returning visitors', pct(avg('returning'), 0), 'Had visited before'], ['Visitors', int(visitors), 'Different browsers, roughly']
    ].map(function (k) { return '<div class="kv"><span class="k">' + esc(k[0]) + '</span><strong style="font-size:20px">' + esc(k[1]) + '</strong><span class="muted small">' + esc(k[2]) + '</span></div>'; }).join('');
    bindRange(main);
  }
  function bindRange(main) {
    main.querySelector('.page').addEventListener('click', function (e) {
      var r = e.target.closest('[data-range]'); if (r) { anRange = r.getAttribute('data-range'); renderAnalytics(main); }
    });
  }

  // ---------- boot ----------
  route(/^\/$/, renderHome, 'home');
  route(/^\/analytics$/, renderAnalytics, 'analytics');

  function boot() {
    initSearch(); initLock();
    $('#menu-btn').addEventListener('click', function () { if ($('#sidebar').classList.contains('open')) closeMenu(); else openMenu(); });
    $('#scrim').addEventListener('click', closeMenu);
    $('#sign-out').addEventListener('click', function () { lock(); });
    var resizeT; window.addEventListener('resize', function () { clearTimeout(resizeT); resizeT = setTimeout(function () { var h = location.hash.replace(/^#/, '') || '/'; if ($('#lock').hidden && (h === '/' || h === '/analytics')) render(); }, 250); });
  }

  window.MHAdmin = {
    route: route, go: go, render: render, boot: boot, toast: toast, modal: modal, esc: esc, money: money, moneyShort: moneyShort, int: int, pct: pct,
    dateTime: dateTime, fDate: fDate, fDayLong: fDayLong, badgeFor: badgeFor, thumb: thumb, productImage: productImage, sampleBanner: sampleBanner, csv: csv,
    $: $, $all: $all, setLeaveGuard: function (fn) { leaveGuard = fn; }, updateCounts: updateCounts,
    lock: lock, saveStatus: saveStatus, refreshView: refreshView
  };
})();
