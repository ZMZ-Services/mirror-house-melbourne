// Mirror House admin: orders list, order detail, fulfilment, refunds, packing slip.
(function () {
  'use strict';
  var A = window.MHAdmin, D = window.MHData, esc = A.esc, money = A.money, $ = A.$;
  var PAGE = 25;
  var TABS = [
    ['all', 'All', function () { return true; }],
    ['unfulfilled', 'Unfulfilled', function (o) { return o.fulfilment === 'unfulfilled' && o.payment !== 'refunded'; }],
    ['quotes', 'Delivery quotes', function (o) { return o.payment === 'awaiting_quote' || o.payment === 'quote_sent'; }],
    ['progress', 'In progress', function (o) { return o.fulfilment === 'out_for_delivery' || o.fulfilment === 'ready'; }],
    ['pickup', 'Pick-ups', function (o) { return o.method === 'pickup'; }],
    ['completed', 'Completed', function (o) { return o.fulfilment === 'delivered' || o.fulfilment === 'picked_up'; }],
    ['refunded', 'Refunded', function (o) { return o.payment === 'refunded' || o.payment === 'partially_refunded'; }]
  ];
  var listState = { tab: 'all', q: '', page: 0 };

  function zoneName(o) {
    if (o.method === 'pickup') return 'Pick-up, Point Cook';
    var z = D.load().shipping.zones.filter(function (x) { return x.id === o.zone; })[0];
    return z ? z.name : (o.zone === 'quote' ? 'Delivery by quote' : 'Delivery');
  }
  function itemsCount(o) { return o.lines.reduce(function (s, l) { return s + l.qty; }, 0); }
  function find(id) { return D.load().orders.filter(function (o) { return String(o.id) === String(id); })[0]; }
  function addEvent(o, text) { o.events.push({ at: Date.now(), text: text }); }

  // ---------- list ----------
  function renderList(main, args) {
    var params = new URLSearchParams(args[0] || '');
    if (params.get('tab')) { listState.tab = params.get('tab'); listState.page = 0; }
    var all = D.load().orders.slice().reverse();
    main.innerHTML = '<div class="page wide">' + A.sampleBanner() +
      '<div class="page-head"><h1>Orders</h1><span class="grow"></span><button type="button" class="btn" id="export-orders">Export</button></div>' +
      '<section class="card flush"><div class="tabs" role="tablist">' + TABS.map(function (t) {
        var n = all.filter(t[2]).length;
        return '<button type="button" role="tab" data-tab="' + t[0] + '" aria-selected="' + (listState.tab === t[0]) + '">' + t[1] + (t[0] !== 'all' ? '<span class="count">' + n + '</span>' : '') + '</button>';
      }).join('') + '</div>' +
      '<div class="toolbar"><label class="visually-hidden" for="order-q">Filter orders</label><input class="input" id="order-q" type="search" placeholder="Search by order number, name, email or suburb" value="' + esc(listState.q) + '"></div>' +
      '<div id="order-table"></div></section></div>';
    function draw() {
      var tab = TABS.filter(function (t) { return t[0] === listState.tab; })[0] || TABS[0];
      var q = listState.q.trim().toLowerCase();
      var rows = all.filter(tab[2]).filter(function (o) {
        return !q || [o.number, o.customer.name, o.customer.email, o.address ? o.address.suburb : '', o.address ? o.address.postcode : ''].join(' ').toLowerCase().indexOf(q) >= 0;
      });
      var pages = Math.max(1, Math.ceil(rows.length / PAGE));
      listState.page = Math.min(listState.page, pages - 1);
      var shown = rows.slice(listState.page * PAGE, listState.page * PAGE + PAGE);
      $('#order-table').innerHTML = shown.length ? '<div class="table-wrap"><table class="data"><thead><tr><th>Order</th><th>Date</th><th>Customer</th><th class="right">Total</th><th>Payment</th><th>Fulfilment</th><th class="hide-sm">Items</th><th class="hide-sm">Delivery</th></tr></thead><tbody>' +
        shown.map(function (o) {
          return '<tr data-id="' + o.id + '" tabindex="0"><td><strong>' + esc(o.number) + '</strong>' + (o.test ? ' <span class="badge plain">Test</span>' : '') + (o.note ? ' <span title="Has a note" aria-label="Has a note">📝</span>' : '') + '</td><td>' + esc(A.dateTime(o.createdAt)) + '</td><td>' + esc(o.customer.name) + '</td>' +
            '<td class="right num">' + money(o.total) + '</td><td>' + A.badgeFor('payment', o.payment) + '</td><td>' + A.badgeFor('fulfil', o.fulfilment) + '</td>' +
            '<td class="hide-sm">' + itemsCount(o) + (itemsCount(o) === 1 ? ' item' : ' items') + '</td><td class="hide-sm">' + esc(zoneName(o)) + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        (pages > 1 ? '<div class="pager"><button type="button" class="btn" data-page="-1"' + (listState.page ? '' : ' disabled') + '>‹ Previous</button><span class="muted" style="align-self:center">Page ' + (listState.page + 1) + ' of ' + pages + '</span><button type="button" class="btn" data-page="1"' + (listState.page < pages - 1 ? '' : ' disabled') + '>Next ›</button></div>' : '')
        : '<div class="empty"><strong>No orders here</strong><span>' + (q ? 'Try a different search.' : 'Orders that match this tab will show here.') + '</span></div>';
    }
    draw();
    var pageEl = main.querySelector('.page');
    pageEl.addEventListener('click', function (e) {
      var t = e.target.closest('[data-tab]');
      if (t) { listState.tab = t.getAttribute('data-tab'); listState.page = 0; A.$all('[data-tab]', main).forEach(function (b) { b.setAttribute('aria-selected', String(b === t)); }); draw(); return; }
      var p = e.target.closest('[data-page]'); if (p) { listState.page += +p.getAttribute('data-page'); draw(); return; }
      var tr = e.target.closest('tr[data-id]'); if (tr) A.go('#/orders/' + tr.getAttribute('data-id'));
    });
    pageEl.addEventListener('keydown', function (e) { var tr = e.target.closest('tr[data-id]'); if (tr && e.key === 'Enter') A.go('#/orders/' + tr.getAttribute('data-id')); });
    $('#order-q').addEventListener('input', function (e) { listState.q = e.target.value; listState.page = 0; draw(); });
    $('#export-orders').addEventListener('click', function () {
      A.csv('mirror-house-orders.csv', ['Order', 'Date', 'Customer', 'Email', 'Phone', 'Items', 'Subtotal', 'Discount', 'Delivery', 'Total', 'Payment', 'Fulfilment', 'Method', 'Address', 'Suburb', 'Postcode', 'Preferred delivery day'],
        D.load().orders.map(function (o) {
          return [o.number, new Date(o.createdAt).toISOString(), o.customer.name, o.customer.email, o.customer.phone, o.lines.map(function (l) { return l.qty + ' × ' + l.title; }).join('; '),
            (o.subtotal / 100).toFixed(2), (o.discount / 100).toFixed(2), (o.delivery / 100).toFixed(2), (o.total / 100).toFixed(2), o.payment, o.fulfilment, zoneName(o),
            o.address ? o.address.line1 : '', o.address ? o.address.suburb : '', o.address ? o.address.postcode : '', o.deliveryDay || ''];
        }));
    });
  }

  // ---------- detail ----------
  function nextActions(o) {
    if (o.payment === 'refunded' || o.fulfilment === 'on_hold' || o.fulfilment === 'cancelled') return '';
    if (o.method === 'pickup') {
      if (o.fulfilment === 'unfulfilled') return '<button type="button" class="btn primary" data-act="ready">Mark ready for pick-up</button>';
      if (o.fulfilment === 'ready') return '<button type="button" class="btn primary" data-act="picked_up">Mark as picked up</button>';
    } else {
      if (o.fulfilment === 'unfulfilled') return '<button type="button" class="btn primary" data-act="out_for_delivery">Mark as out for delivery</button>';
      if (o.fulfilment === 'out_for_delivery') return '<button type="button" class="btn primary" data-act="delivered">Mark as delivered</button>';
    }
    return '';
  }
  function isQuote(o) { return o.payment === 'awaiting_quote' || o.payment === 'quote_sent'; }
  // Quote requests: you enter the delivery price, send the quote (live site: email + Square payment link),
  // and the order is confirmed once the customer pays (live site: Square tells the server automatically).
  function quoteCard(o) {
    if (!isQuote(o)) return '';
    var sent = o.payment === 'quote_sent';
    var held = Math.max(0, Math.ceil((o.createdAt + 7 * D.DAY - Date.now()) / D.DAY));
    return '<section class="card" style="box-shadow:inset 0 0 0 2px #ffd79d,var(--shadow)"><div class="card-head">' + A.badgeFor('payment', o.payment) + '<h2>Delivery quote</h2><span class="grow"></span><span class="muted small">Mirror held ' + (held ? 'for ' + held + ' more ' + (held === 1 ? 'day' : 'days') : '(7 days are up)') + '</span></div>' +
      (sent ? '<p class="card-sub">Quote of <strong>' + money(o.delivery) + '</strong> sent. Waiting for ' + esc(o.customer.name.split(' ')[0]) + ' to pay ' + money(o.total) + ' through the Square link. On the live site this order is confirmed automatically when they pay.</p>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"><button type="button" class="btn" data-act="quote-cancel">Cancel request</button><button type="button" class="btn" data-act="quote-edit">Change quote</button><button type="button" class="btn primary" data-act="quote-paid">Mark as paid</button></div>'
      : '<p class="card-sub">' + esc(o.customer.name.split(' ')[0]) + ' is outside your delivery zones' + (o.address ? ' (' + esc(o.address.suburb + ' ' + o.address.postcode) + ')' : '') + '. Work out the delivery price, then send the quote. Nothing has been charged.</p>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"><button type="button" class="btn" data-act="quote-cancel">Can\'t deliver there</button><button type="button" class="btn primary" data-act="quote-edit">Enter delivery price</button></div>') +
      '</section>';
  }
  function editQuote(o) {
    A.modal({ title: 'Delivery quote · ' + o.number, submit: o.payment === 'quote_sent' ? 'Send updated quote' : 'Send quote',
      body: '<div class="field"><label for="q-amt">Delivery price</label><div class="input-affix"><span>$</span><input id="q-amt" inputmode="decimal" required value="' + (o.delivery ? (o.delivery / 100).toFixed(2) : '') + '" placeholder="0.00"></div>' +
        '<span class="help">To ' + esc(o.address ? o.address.suburb + ' VIC ' + o.address.postcode : 'the customer') + ' · mirrors ' + money(o.subtotal - o.discount) + '</span></div>' +
        '<div class="field"><label for="q-msg">Message to the customer (optional)</label><textarea id="q-msg" rows="3" placeholder="e.g. We can deliver on Saturdays to Ballarat."></textarea></div>' +
        '<div class="card" style="box-shadow:none;border:1px solid #e3e3e3"><strong>What ' + esc(o.customer.name.split(' ')[0]) + ' receives</strong><p class="card-sub small" id="q-preview"></p></div>' +
        '<p class="help small muted">' + 'Sent by email with a secure Square payment link for the mirror and delivery together. When they pay, the order is confirmed automatically.' + '</p>',
      onOpen: function (f) {
        var amt = f.querySelector('#q-amt'), pv = f.querySelector('#q-preview');
        function draw() { var c = Math.round((parseFloat(amt.value) || 0) * 100); pv.textContent = 'Delivery to ' + (o.address ? o.address.suburb : 'you') + ': ' + money(c) + '. Total to pay: ' + money(o.subtotal - o.discount + c) + ' (mirror and delivery). Pay securely with Square. Your mirror is held for 7 days.'; }
        amt.addEventListener('input', draw); draw();
      },
      onSubmit: function (f) {
        var c = Math.round(parseFloat(f.querySelector('#q-amt').value.replace(/[^0-9.]/g, '')) * 100);
        if (!(c >= 0) || isNaN(c)) { f.querySelector('#q-amt').setCustomValidity('Enter the delivery price'); f.querySelector('#q-amt').reportValidity(); return false; }
        o.delivery = c; o.total = o.subtotal - o.discount + c; o.payment = 'quote_sent'; o.card = 'Square payment link sent';
        var m = f.querySelector('#q-msg').value.trim();
        o._quoteMessage = m; // for the email; not kept on the order
        addEvent(o, 'Delivery quote of ' + money(c) + ' sent to ' + o.customer.email + ' (total ' + money(o.total) + ')' + (m ? ': "' + m + '"' : '') + (o.sample || o.test ? ' (preview: not sent)' : ''));
        D.save(); A.toast('Quote sent'); A.render();
      } });
  }
  function quotePaid(o) {
    A.modal({ title: 'Mark ' + o.number + ' as paid?', submit: 'Mark as paid', body: '<p>Use this if ' + esc(o.customer.name.split(' ')[0]) + ' paid ' + money(o.total) + ' another way. On the live site, paying through the Square link does this automatically.</p><p>The order then moves to Unfulfilled, ready to arrange delivery.</p>',
      onSubmit: function () { o.payment = 'paid'; o.fulfilment = 'unfulfilled'; o.card = 'Square payment link'; addEvent(o, 'Payment of ' + money(o.total) + ' received. Order confirmed.'); D.save(); A.toast('Order confirmed'); A.render(); } });
  }
  function quoteCancel(o) {
    A.modal({ title: 'Cancel ' + o.number + '?', danger: true, submit: 'Cancel request', body: '<p>The customer hasn\'t been charged, so there\'s nothing to refund. Their mirror is released back into stock.</p><div class="field"><label for="q-why">Reason (for your records)</label><input id="q-why" placeholder="e.g. Too far to deliver, customer chose not to go ahead"></div>',
      onSubmit: function (f) { var w = f.querySelector('#q-why').value.trim(); o.payment = 'voided'; o.fulfilment = 'cancelled'; addEvent(o, 'Quote request cancelled' + (w ? ' (' + w + ')' : '')); D.save(); A.toast('Request cancelled'); A.render(); } });
  }
  function progress(o) {
    if (o.fulfilment === 'on_hold' || o.fulfilment === 'cancelled') return '';
    var steps = o.method === 'pickup' ? [['unfulfilled', 'Ordered'], ['ready', 'Ready for pick-up'], ['picked_up', 'Picked up']] : [['unfulfilled', 'Ordered'], ['out_for_delivery', 'Out for delivery'], ['delivered', 'Delivered']];
    var idx = steps.map(function (s) { return s[0]; }).indexOf(o.fulfilment);
    return '<div class="steps" aria-label="Fulfilment progress">' + steps.map(function (s, i) {
      return '<span class="badge ' + (i < idx ? 'plain' : i === idx ? (i === steps.length - 1 ? 'good' : 'info') : 'hollow plain') + '">' + (i < idx ? '✓ ' : '') + esc(s[1]) + '</span>';
    }).join('<span class="muted">→</span>') + '</div>';
  }
  function addressText(a) { return a ? [a.name, a.line1, a.suburb + ' ' + a.state + ' ' + a.postcode, 'Australia'].filter(Boolean).join('\n') : ''; }

  function renderDetail(main, args) {
    var o = find(args[0]);
    if (!o) { main.innerHTML = '<div class="page"><div class="card"><div class="empty"><strong>Order not found</strong><a class="btn" href="#/orders">Back to orders</a></div></div></div>'; return; }
    var gst = Math.round((o.payment === 'refunded' ? 0 : o.total) / 11);
    var mapQ = o.address ? encodeURIComponent(o.address.line1 + ', ' + o.address.suburb + ' VIC ' + o.address.postcode) : '';
    main.innerHTML = '<div class="page">' +
      '<div class="page-head no-print"><a class="back" href="#/orders" aria-label="Back to orders">←</a><h1>' + esc(o.number) + '</h1>' + A.badgeFor('payment', o.payment) + A.badgeFor('fulfil', o.fulfilment) +
      '<span class="grow"></span><button type="button" class="btn" data-act="print">Print packing slip</button>' + (o.payment === 'paid' ? '<button type="button" class="btn" data-act="refund">Refund</button>' : '') + '</div>' +
      '<p class="muted no-print" style="margin:-10px 0 0">' + esc(A.dateTime(o.createdAt)) + ' · Online store' + (o.sample ? ' · <span class="badge plain">Sample order</span>' : '') + (o.test ? ' · <span class="badge plain">Test order from the preview</span>' : '') + '</p>' +
      '<div class="cols screen-only"><div>' + quoteCard(o) +
      '<section class="card"><div class="card-head">' + A.badgeFor('fulfil', o.fulfilment) + '<h2>' + esc(o.method === 'pickup' ? 'Pick-up from Point Cook' : /^Zone/.test(zoneName(o)) ? zoneName(o) + ' delivery' : zoneName(o)) + '</h2></div>' + progress(o) +
      o.lines.map(function (l) {
        return '<div class="line-item">' + A.thumb(A.productImage(l.slug)) + '<div><a href="#/products/' + encodeURIComponent(l.slug) + '">' + esc(l.title) + '</a></div><span class="num muted">' + money(l.price) + ' × ' + l.qty + '</span><span class="num">' + money(l.price * l.qty) + '</span></div>';
      }).join('') +
      (o.tracking ? '<p class="card-sub">Tracking / reference: <strong>' + esc(o.tracking) + '</strong></p>' : '') +
      '<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">' + nextActions(o) + '</div></section>' +
      '<section class="card"><div class="card-head">' + A.badgeFor('payment', o.payment) + '<h2>Payment</h2></div><div class="totals">' +
      '<div><span>Subtotal</span><span class="muted">' + itemsCount(o) + (itemsCount(o) === 1 ? ' item' : ' items') + '</span><span>' + money(o.subtotal) + '</span></div>' +
      (o.discount ? '<div><span>Discount</span><span class="muted">' + esc(o.discountCode || '') + '</span><span>−' + money(o.discount) + '</span></div>' : '') +
      '<div><span>Delivery</span><span class="muted">' + esc(zoneName(o)) + '</span><span>' + (o.method === 'pickup' ? 'Free' : o.payment === 'awaiting_quote' ? 'To be quoted' : money(o.delivery)) + '</span></div>' +
      (o.insurance ? '<div><span>Delivery insurance</span><span></span><span>' + money(o.insurance) + '</span></div>' : '') +
      '<div class="grand"><span>Total</span><span>' + money(o.total) + '</span></div>' +
      ((D.load().settings || {}).gstRegistered ? '<div class="muted"><span>Includes GST</span><span>' + money(gst) + '</span></div>' : '') +
      '<div><span>' + (o.payment === 'refunded' ? 'Refunded' : (o.payment === 'paid' || o.payment === 'partially_refunded') ? 'Paid' : 'Not charged yet') + '</span><span class="muted">' + esc(o.card || 'Square') + '</span><span>' + money(o.payment === 'refunded' ? o.refunded || o.total : o.total) + '</span></div></div></section>' +
      '<section class="card"><h2>Timeline</h2><form class="field" id="comment-form"><label for="comment">Leave a note on the timeline</label><div style="display:flex;gap:8px"><input class="input" id="comment" placeholder="e.g. Called customer to confirm delivery time"><button class="btn" type="submit">Post</button></div><span class="help">Only you can see notes.</span></form>' +
      '<ol class="timeline">' + o.events.slice().reverse().map(function (ev) { return '<li><time>' + esc(A.dateTime(ev.at)) + '</time>' + esc(ev.text) + '</li>'; }).join('') + '</ol></section>' +
      '</div><div>' +
      '<section class="card"><div class="card-head"><h2>Notes</h2><span class="grow"></span><button type="button" class="btn plain" data-act="note">Edit</button></div><p class="card-sub">' + (o.note ? esc(o.note) : 'No notes from the customer') + '</p></section>' +
      '<section class="card"><h2>Customer</h2><div class="kv"><a href="#/customers/' + encodeURIComponent(o.customer.email.toLowerCase()) + '">' + esc(o.customer.name) + '</a>' +
      '<span class="muted">' + D.customers().filter(function (c) { return c.email.toLowerCase() === o.customer.email.toLowerCase(); }).map(function (c) { return c.orders.length + (c.orders.length === 1 ? ' order' : ' orders'); })[0] + '</span></div>' +
      '<div class="kv"><span class="k">Contact</span><a href="mailto:' + esc(o.customer.email) + '">' + esc(o.customer.email) + '</a><a href="tel:' + esc(o.customer.phone.replace(/\s/g, '')) + '">' + esc(o.customer.phone) + '</a>' +
      '<span class="muted small">' + (o.marketing ? 'Subscribed to email' : 'Not subscribed to email') + '</span></div>' +
      (o.address ? '<div class="kv"><span class="k">Delivery address</span><span class="address">' + esc(addressText(Object.assign({ name: o.customer.name }, o.address))) + '</span><a href="https://www.google.com/maps/search/?api=1&query=' + mapQ + '" target="_blank" rel="noopener">View map</a></div>' : (o.method === 'pickup' ? '<div class="kv"><span class="k">Pick-up</span><span>Point Cook studio, by appointment</span></div>' : '<div class="kv"><span class="k">Delivery address</span><span class="muted">Not collected. The current checkout doesn\'t ask for an address yet.</span></div>')) +
      (o.deliveryDay ? '<div class="kv"><span class="k">Preferred delivery day</span><span>' + esc(A.fDayLong.format(new Date(o.deliveryDay + 'T12:00:00'))) + '</span></div>' : '') +
      '</section>' +
      '</div></div>' +
      packingSlip(o) + '</div>';

    main.querySelector('.page').addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return;
      var act = b.getAttribute('data-act');
      if (act === 'print') { window.print(); return; }
      if (act === 'note') return editNote(o, main);
      if (act === 'refund') return refund(o, main);
      if (act === 'quote-edit') return editQuote(o);
      if (act === 'quote-paid') return quotePaid(o);
      if (act === 'quote-cancel') return quoteCancel(o);
      fulfil(o, act, main);
    });
    $('#comment-form').addEventListener('submit', function (e) {
      e.preventDefault(); var v = $('#comment').value.trim(); if (!v) return;
      addEvent(o, v); D.save(); A.render();
    });
  }

  function fulfil(o, to, main) {
    var labels = { out_for_delivery: 'Mark as out for delivery', delivered: 'Mark as delivered', ready: 'Mark ready for pick-up', picked_up: 'Mark as picked up' };
    var body = '';
    if (to === 'out_for_delivery') body = '<div class="field"><label for="m-when">Delivery date</label><input id="m-when" type="date" value="' + esc(o.deliveryDay || D.dayKey(Date.now())) + '"></div>' +
      '<div class="field"><label for="m-track">Courier and tracking number (optional)</label><input id="m-track" placeholder="e.g. Our van, or courier name and tracking number" value="' + esc(o.tracking || '') + '"></div>';
    if (to === 'ready') body = '<div class="field"><label for="m-track">Pick-up time agreed (optional)</label><input id="m-track" placeholder="e.g. Saturday 10am"></div>';
    if (to === 'delivered') body = '<label class="check"><input type="checkbox" id="m-checked" checked><span>Mirror checked with the customer on delivery</span></label>';
    if (to === 'picked_up') body = '<label class="check"><input type="checkbox" id="m-checked" checked><span>Mirror checked with the customer at pick-up</span></label>';
    body += '<label class="check"><input type="checkbox" id="m-notify" checked><span>Email ' + esc(o.customer.name.split(' ')[0]) + ' an update</span></label>' +
      '<p class="help small muted">' + 'The email goes out as soon as you save.' + '</p>';
    A.modal({ title: labels[to] + ' · ' + o.number, body: body, submit: labels[to], onSubmit: function (f) {
      var track = f.querySelector('#m-track'), when = f.querySelector('#m-when'), checked = f.querySelector('#m-checked');
      o.fulfilment = to;
      if (track && track.value.trim()) o.tracking = track.value.trim();
      var text = { out_for_delivery: 'Marked out for delivery' + (when && when.value ? ' for ' + A.fDayLong.format(new Date(when.value + 'T12:00:00')) : ''),
        delivered: 'Delivered' + (checked && checked.checked ? ' and checked with customer' : ''), ready: 'Marked ready for pick-up' + (track && track.value.trim() ? ' (' + track.value.trim() + ')' : ''),
        picked_up: 'Picked up by customer' + (checked && checked.checked ? ', checked together' : '') }[to];
      addEvent(o, text);
      if (f.querySelector('#m-notify').checked) o._notify = to; // the server sends the email and notes it on the timeline
      D.save(); A.toast(labels[to].replace('Mark as ', 'Marked ').replace('Mark ', 'Marked ')); A.render();
    } });
  }
  function editNote(o) {
    A.modal({ title: 'Edit note', body: '<div class="field"><label for="m-note">Note</label><textarea id="m-note">' + esc(o.note || '') + '</textarea></div>', onSubmit: function (f) {
      o.note = f.querySelector('#m-note').value.trim(); D.save(); A.render();
    } });
  }
  function refund(o) {
    A.modal({ title: 'Refund ' + o.number, submit: 'Refund',
      body: '<div class="field"><label for="m-amt">Refund amount</label><div class="input-affix"><span>$</span><input id="m-amt" inputmode="decimal" value="' + (o.total / 100).toFixed(2) + '"></div><span class="help">Up to ' + money(o.total) + '. Refunds go back to the customer\'s card through Square.</span></div>' +
        '<div class="field"><label for="m-why">Reason (for your records)</label><input id="m-why" placeholder="e.g. Damaged on arrival"></div>' +
        '<label class="check"><input type="checkbox" id="m-restock"><span>Put items back in stock</span></label>' +
        '<p class="help small muted">This asks Square to refund the customer\'s card straight away.</p>',
      onSubmit: function (f) {
        var amt = Math.round(parseFloat(f.querySelector('#m-amt').value.replace(/[^0-9.]/g, '')) * 100);
        if (!(amt > 0) || amt > o.total) { f.querySelector('#m-amt').setCustomValidity('Enter an amount up to ' + money(o.total)); f.querySelector('#m-amt').reportValidity(); return false; }
        o.payment = amt >= o.total ? 'refunded' : 'partially_refunded';
        o.refunded = amt;
        var why = f.querySelector('#m-why').value.trim();
        o._refundReason = why;
        addEvent(o, 'Refunded ' + money(amt) + (why ? ' (' + why + ')' : ''));
        if (f.querySelector('#m-restock').checked) {
          o.lines.forEach(function (l) { var p = D.load().products.filter(function (x) { return x.slug === l.slug; })[0]; if (p && p.stock != null) p.stock += l.qty; });
          addEvent(o, 'Items returned to stock');
        }
        D.save(); A.toast('Refund recorded'); A.render();
      } });
  }

  function packingSlip(o) {
    var s = D.load().settings;
    return '<div class="print-only" style="font-size:12pt;color:#000">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:16px">' +
      '<div><div style="font-family:Georgia,serif;font-size:20pt;letter-spacing:.2em">MIRROR HOUSE</div><div>' + esc(s.address) + ' · ' + esc(s.email) + ' · ' + esc(s.phone1) + '</div>' + '<div>' + esc(s.legalName || 'Mirrorhousemelbourne') + (s.abn ? ' · ABN ' + esc(s.abn) : '') + '</div>' + '</div>' +
      '<div style="text-align:right"><strong>Packing slip</strong><br>Order ' + esc(o.number) + '<br>' + esc(A.fDate.format(new Date(o.createdAt))) + '</div></div>' +
      '<div style="display:flex;gap:40px;margin-bottom:16px"><div><strong>' + (o.method === 'pickup' ? 'Pick-up' : 'Deliver to') + '</strong><br><span style="white-space:pre-line">' +
      esc(o.address ? addressText(Object.assign({ name: o.customer.name }, o.address)) : o.customer.name + '\nPoint Cook studio, by appointment') + '</span><br>' + esc(o.customer.phone) + '</div>' +
      (o.deliveryDay ? '<div><strong>Preferred day</strong><br>' + esc(A.fDayLong.format(new Date(o.deliveryDay + 'T12:00:00'))) + '</div>' : '') + '</div>' +
      '<table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;border-bottom:1px solid #000;padding:6px 0">Item</th><th style="text-align:right;border-bottom:1px solid #000">Qty</th></tr></thead><tbody>' +
      o.lines.map(function (l) { return '<tr><td style="padding:8px 0;border-bottom:1px solid #ccc">' + esc(l.title) + '</td><td style="text-align:right;border-bottom:1px solid #ccc">' + l.qty + '</td></tr>'; }).join('') + '</tbody></table>' +
      (o.note ? '<p><strong>Customer note:</strong> ' + esc(o.note) + '</p>' : '') +
      '<p style="margin-top:24px">Please open and check your mirror with our team on delivery. If anything isn\'t perfect, email photos within 24 hours to ' + esc(s.email) + '.</p>' +
      '<p>Thank you for choosing Mirror House.</p></div>';
  }

  A.route(/^\/orders(?:\?(.*))?$/, renderList, 'orders');
  A.route(/^\/orders\/([^/?]+)$/, renderDetail, 'orders');
})();
