// Mirror House admin: customers, discounts, shipping & delivery, settings. Starts the app at the end.
(function () {
  'use strict';
  var A = window.MHAdmin, D = window.MHData, esc = A.esc, money = A.money, $ = A.$;

  // ---------- customers ----------
  var cState = { tab: 'all', q: '' };
  function renderCustomers(main) {
    var list = D.customers().sort(function (a, b) { return b.last - a.last; });
    main.innerHTML = '<div class="page wide">' + A.sampleBanner() + '<div class="page-head"><h1>Customers</h1><span class="grow"></span><button type="button" class="btn" id="export-customers">Export</button></div>' +
      '<section class="card flush"><div class="tabs" role="tablist">' + [['all', 'All customers'], ['repeat', 'Repeat customers'], ['subscribed', 'Email subscribers']].map(function (t) {
        return '<button type="button" role="tab" data-tab="' + t[0] + '" aria-selected="' + (cState.tab === t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      '<div class="toolbar"><label class="visually-hidden" for="cust-q">Filter customers</label><input class="input" id="cust-q" type="search" placeholder="Search by name, email or suburb" value="' + esc(cState.q) + '"><span class="muted" id="cust-count"></span></div><div id="cust-table"></div></section></div>';
    function draw() {
      var q = cState.q.trim().toLowerCase();
      var rows = list.filter(function (c) {
        if (cState.tab === 'repeat' && c.orders.length < 2) return false;
        if (cState.tab === 'subscribed' && !c.marketing) return false;
        return !q || [c.name, c.email, c.address ? c.address.suburb : ''].join(' ').toLowerCase().indexOf(q) >= 0;
      });
      $('#cust-count').textContent = rows.length + (rows.length === 1 ? ' customer' : ' customers');
      $('#cust-table').innerHTML = rows.length ? '<div class="table-wrap"><table class="data"><thead><tr><th>Customer</th><th>Email subscription</th><th class="hide-sm">Location</th><th class="right">Orders</th><th class="right">Amount spent</th></tr></thead><tbody>' +
        rows.slice(0, 200).map(function (c) {
          return '<tr data-id="' + esc(c.id) + '" tabindex="0"><td><strong>' + esc(c.name) + '</strong><br><span class="muted small">' + esc(c.email) + '</span></td><td>' + (c.marketing ? '<span class="badge good">Subscribed</span>' : '<span class="badge">Not subscribed</span>') + '</td>' +
            '<td class="hide-sm">' + esc(c.address ? c.address.suburb + ' VIC' : 'Pick-up only') + '</td><td class="right num">' + c.orders.length + '</td><td class="right num">' + money(c.spent) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty"><strong>No customers found</strong></div>';
    }
    draw();
    var page = main.querySelector('.page');
    page.addEventListener('click', function (e) {
      var t = e.target.closest('[data-tab]'); if (t) { cState.tab = t.getAttribute('data-tab'); A.$all('[data-tab]', page).forEach(function (b) { b.setAttribute('aria-selected', String(b === t)); }); draw(); return; }
      var tr = e.target.closest('tr[data-id]'); if (tr) A.go('#/customers/' + encodeURIComponent(tr.getAttribute('data-id')));
    });
    page.addEventListener('keydown', function (e) { var tr = e.target.closest('tr[data-id]'); if (tr && e.key === 'Enter') A.go('#/customers/' + encodeURIComponent(tr.getAttribute('data-id'))); });
    $('#cust-q').addEventListener('input', function (e) { cState.q = e.target.value; draw(); });
    $('#export-customers').addEventListener('click', function () {
      A.csv('mirror-house-customers.csv', ['Name', 'Email', 'Phone', 'Address', 'Suburb', 'Postcode', 'Orders', 'Amount spent', 'Email subscription', 'First order', 'Last order'],
        list.map(function (c) { return [c.name, c.email, c.phone, c.address ? c.address.line1 : '', c.address ? c.address.suburb : '', c.address ? c.address.postcode : '', c.orders.length, (c.spent / 100).toFixed(2), c.marketing ? 'Subscribed' : 'Not subscribed', new Date(c.first).toISOString().slice(0, 10), new Date(c.last).toISOString().slice(0, 10)]; }));
    });
  }

  // ---------- mailing list ----------
  function renderMailing(main) {
    var list = D.mailingList();
    var weekAgo = Date.now() - 7 * 864e5, newWeek = list.filter(function (x) { return x.joinedAt >= weekAgo; }).length;
    main.innerHTML = '<div class="page wide"><div class="page-head"><h1>Mailing list</h1><span class="grow"></span><button type="button" class="btn" id="ml-export"' + (list.length ? '' : ' disabled') + '>Download list (CSV)</button></div>' +
      '<section class="card"><div class="grid-2"><div class="kv"><span class="k">Subscribers</span><strong style="font-size:24px">' + list.length + '</strong></div><div class="kv"><span class="k">Joined in the last 7 days</span><strong style="font-size:24px">' + newWeek + '</strong></div></div>' +
      '<p class="card-sub small">People who joined from the footer “Join Our List” box, plus customers who ticked “Email me about new mirrors and offers” at checkout. Each new sign-up automatically gets a welcome email with the WELCOME10 code. To send “New arrivals” emails, download this list and import it into Square Marketing or Mailchimp (every marketing email must include an unsubscribe link and your business details).</p></section>' +
      '<section class="card flush"><div class="toolbar"><label class="visually-hidden" for="ml-q">Search</label><input class="input" id="ml-q" type="search" placeholder="Search email or name"><span class="muted" id="ml-count"></span></div><div id="ml-table"></div></section></div>';
    function draw() {
      var q = $('#ml-q').value.trim().toLowerCase();
      var rows = list.filter(function (x) { return !q || (x.email + ' ' + x.name).toLowerCase().indexOf(q) >= 0; });
      $('#ml-count').textContent = rows.length + (rows.length === 1 ? ' subscriber' : ' subscribers');
      $('#ml-table').innerHTML = rows.length ? '<div class="table-wrap"><table class="data"><thead><tr><th>Email</th><th class="hide-sm">Name</th><th>Joined</th><th>Signed up from</th><th class="right"><span class="visually-hidden">Remove</span></th></tr></thead><tbody>' +
        rows.map(function (x) {
          return '<tr style="cursor:default"><td><strong>' + esc(x.email) + '</strong></td><td class="hide-sm">' + esc(x.name || '–') + '</td><td>' + esc(x.joinedAt ? A.dateTime(x.joinedAt) : '') + '</td><td>' + esc(x.source) + '</td>' +
            '<td class="right">' + (x.source === 'Checkout' ? '' : '<button type="button" class="btn plain small" data-unsub="' + esc(x.email) + '">Remove</button>') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty"><strong>No subscribers yet</strong><p>When someone joins your mailing list on the shop, they\'ll appear here.</p></div>';
    }
    draw();
    $('#ml-q').addEventListener('input', draw);
    main.querySelector('.page').addEventListener('click', function (e) {
      var b = e.target.closest('[data-unsub]'); if (!b) return;
      var em = b.getAttribute('data-unsub').toLowerCase();
      if (!confirm('Remove ' + em + ' from your mailing list?')) return;
      var st = D.load(); st.subscribers = (st.subscribers || []).filter(function (x) { return String(x.email).toLowerCase() !== em; }); D.save();
      list = D.mailingList(); A.toast('Removed'); renderMailing(main);
    });
    $('#ml-export').addEventListener('click', function () {
      A.csv('mirror-house-mailing-list.csv', ['Email', 'Name', 'Joined', 'Source'], list.map(function (x) { return [x.email, x.name, x.joinedAt ? new Date(x.joinedAt).toISOString().slice(0, 10) : '', x.source]; }));
    });
  }

  function renderCustomer(main, args) {
    var c = D.customers().filter(function (x) { return x.id === args[0].toLowerCase(); })[0];
    if (!c) { main.innerHTML = '<div class="page"><div class="card"><div class="empty"><strong>Customer not found</strong><a class="btn" href="#/customers">Back to customers</a></div></div></div>'; return; }
    var s = D.load(), note = s.customerNotes[c.id] || '';
    var orders = c.orders.slice().sort(function (a, b) { return b.createdAt - a.createdAt; });
    main.innerHTML = '<div class="page"><div class="page-head"><a class="back" href="#/customers" aria-label="Back to customers">←</a><h1>' + esc(c.name) + '</h1>' + (c.sample ? '<span class="badge plain">Sample customer</span>' : '') + '</div>' +
      '<p class="muted" style="margin:-10px 0 0">' + esc(c.address ? c.address.suburb + ' VIC, Australia' : 'Pick-up customer') + ' · Customer since ' + esc(A.fDate.format(new Date(c.first))) + '</p>' +
      '<div class="cols"><div>' +
      '<section class="card flush"><div class="kpis" style="grid-template-columns:repeat(3,minmax(0,1fr))"><div class="kpi"><span class="k-label">Amount spent</span><span class="k-val">' + money(c.spent) + '</span></div>' +
      '<div class="kpi"><span class="k-label">Orders</span><span class="k-val">' + c.orders.length + '</span></div><div class="kpi"><span class="k-label">Average order</span><span class="k-val">' + money(c.orders.length ? c.spent / c.orders.length : 0) + '</span></div></div></section>' +
      '<section class="card flush"><div class="card-head" style="padding:16px 16px 8px"><h2>Orders</h2></div><div class="table-wrap"><table class="data"><thead><tr><th>Order</th><th>Date</th><th>Items</th><th class="right">Total</th><th>Fulfilment</th></tr></thead><tbody>' +
      orders.map(function (o) { return '<tr data-href="#/orders/' + o.id + '"><td><strong>' + esc(o.number) + '</strong></td><td>' + esc(A.dateTime(o.createdAt)) + '</td><td class="wrap">' + esc(o.lines.map(function (l) { return l.qty + ' × ' + l.title; }).join(', ')) + '</td><td class="right num">' + money(o.total) + '</td><td>' + A.badgeFor('fulfil', o.fulfilment) + '</td></tr>'; }).join('') +
      '</tbody></table></div></section></div><div>' +
      '<section class="card"><h2>Contact</h2><div class="kv"><a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a><a href="tel:' + esc((c.phone || '').replace(/\s/g, '')) + '">' + esc(c.phone || '') + '</a></div>' +
      '<div class="kv"><span class="k">Email marketing</span><span>' + (c.marketing ? '<span class="badge good">Subscribed</span>' : '<span class="badge">Not subscribed</span>') + '</span></div>' +
      (c.address ? '<div class="kv"><span class="k">Default address</span><span class="address">' + esc(c.address.line1 + '\n' + c.address.suburb + ' VIC ' + c.address.postcode) + '</span></div>' : '') + '</section>' +
      '<section class="card"><form class="field" id="cnote"><label for="cnote-t"><strong>Notes</strong></label><textarea id="cnote-t" rows="4" placeholder="e.g. Prefers Saturday deliveries">' + esc(note) + '</textarea><button type="submit" class="btn" style="justify-self:end">Save note</button></form></section>' +
      '</div></div></div>';
    main.querySelector('.page').addEventListener('click', function (e) { var tr = e.target.closest('tr[data-href]'); if (tr) A.go(tr.getAttribute('data-href')); });
    $('#cnote').addEventListener('submit', function (e) { e.preventDefault(); s.customerNotes[c.id] = $('#cnote-t').value.trim(); D.save(); A.toast('Note saved'); });
  }

  // ---------- discounts ----------
  function discountStatus(d) {
    var now = Date.now();
    if (!d.active) return ['', 'Disabled'];
    if (d.starts && now < new Date(d.starts + 'T00:00:00').getTime()) return ['info', 'Scheduled'];
    if (d.ends && now > new Date(d.ends + 'T23:59:59').getTime()) return ['', 'Expired'];
    return ['good', 'Active'];
  }
  function renderDiscounts(main) {
    var s = D.load();
    var uses = {}; s.orders.forEach(function (o) { if (o.discountCode) uses[o.discountCode] = (uses[o.discountCode] || 0) + 1; });
    var noEnd = s.discounts.filter(function (d) { return d.active && !d.ends; });
    main.innerHTML = '<div class="page"><div class="page-head"><h1>Discounts</h1><span class="grow"></span><button type="button" class="btn primary" id="add-disc">Create discount</button></div>' +
      (noEnd.length ? '<div class="banner warn"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="10" cy="10" r="8"/><path d="M10 6v5M10 14h.01"/></svg><p>' + esc(noEnd.map(function (d) { return d.code; }).join(', ')) + (noEnd.length === 1 ? ' has' : ' have') + ' no end date yet. Set one when you know when the launch offer finishes.</p></div>' : '') +
      '<section class="card flush">' + (s.discounts.length ? '<div class="table-wrap"><table class="data"><thead><tr><th>Code</th><th>Status</th><th>Discount</th><th class="hide-sm">Conditions</th><th class="right">Used</th></tr></thead><tbody>' +
        s.discounts.map(function (d, i) {
          var st = discountStatus(d);
          var cond = [d.firstOrderOnly ? 'First order only' : '', d.minSpend ? 'Min. spend ' + money(d.minSpend) : '', d.ends ? 'Ends ' + A.fDate.format(new Date(d.ends + 'T12:00:00')) : 'No end date', d.limit ? 'Limit ' + d.limit + ' uses' : ''].filter(Boolean).join(' · ');
          return '<tr data-i="' + i + '" tabindex="0"><td><strong>' + esc(d.code) + '</strong></td><td><span class="badge ' + st[0] + '">' + st[1] + '</span></td><td>' + (d.type === 'pct' ? d.value + '% off' : money(d.value) + ' off') + ' order</td><td class="hide-sm wrap">' + esc(cond) + '</td><td class="right num">' + (uses[d.code] || 0) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty"><strong>No discounts yet</strong></div>') + '</section>' +
      '<p class="muted small">Codes are checked again on the server before a customer is charged, so a code can\'t be used after it ends.</p></div>';
    $('#add-disc').addEventListener('click', function () { editDiscount(null); });
    var page = main.querySelector('.page');
    page.addEventListener('click', function (e) { var tr = e.target.closest('tr[data-i]'); if (tr) editDiscount(+tr.getAttribute('data-i')); });
    page.addEventListener('keydown', function (e) { var tr = e.target.closest('tr[data-i]'); if (tr && e.key === 'Enter') editDiscount(+tr.getAttribute('data-i')); });
  }
  function editDiscount(i) {
    var s = D.load(), d = i == null ? { code: '', type: 'pct', value: 10, minSpend: 0, firstOrderOnly: false, starts: null, ends: null, limit: null, active: true } : s.discounts[i];
    var m = A.modal({ title: i == null ? 'Create discount' : 'Edit ' + d.code, submit: i == null ? 'Create discount' : 'Save',
      body: '<div class="field"><label for="d-code">Discount code</label><input id="d-code" required maxlength="24" style="text-transform:uppercase" value="' + esc(d.code) + '"><span class="help">Customers type this at checkout.</span></div>' +
        '<div class="form-grid"><div class="field"><label for="d-type">Type</label><select id="d-type"><option value="pct"' + (d.type === 'pct' ? ' selected' : '') + '>Percentage off</option><option value="fixed"' + (d.type === 'fixed' ? ' selected' : '') + '>Dollar amount off</option></select></div>' +
        '<div class="field"><label for="d-val">Value</label><input id="d-val" inputmode="decimal" required value="' + esc(d.type === 'fixed' ? (d.value / 100).toFixed(2) : d.value) + '"></div>' +
        '<div class="field"><label for="d-min">Minimum spend ($)</label><input id="d-min" inputmode="decimal" value="' + (d.minSpend ? (d.minSpend / 100).toFixed(2) : '') + '" placeholder="None"></div>' +
        '<div class="field"><label for="d-limit">Total uses allowed</label><input id="d-limit" type="number" min="1" value="' + esc(d.limit || '') + '" placeholder="Unlimited"></div>' +
        '<div class="field"><label for="d-start">Starts</label><input id="d-start" type="date" value="' + esc(d.starts || '') + '"></div>' +
        '<div class="field"><label for="d-end">Ends</label><input id="d-end" type="date" value="' + esc(d.ends || '') + '"></div></div>' +
        '<label class="check"><input type="checkbox" id="d-first"' + (d.firstOrderOnly ? ' checked' : '') + '><span>First order only</span></label>' +
        '<label class="check"><input type="checkbox" id="d-active"' + (d.active ? ' checked' : '') + '><span>Active</span></label>' +
        (i == null ? '' : '<button type="button" class="btn plain" id="d-del" style="justify-self:start;color:#8e1f0b">Delete this discount</button>'),
      onSubmit: function (f) {
        var code = f.querySelector('#d-code').value.trim().toUpperCase().replace(/\s+/g, '');
        var type = f.querySelector('#d-type').value, raw = parseFloat(f.querySelector('#d-val').value.replace(/[^0-9.]/g, ''));
        var err = !code ? 'Add a code.' : s.discounts.some(function (x, j) { return j !== i && x.code === code; }) ? 'That code already exists.' :
          !(raw > 0) ? 'Enter a value above 0.' : type === 'pct' && raw > 100 ? 'A percentage can\'t be over 100.' : '';
        var st = f.querySelector('#d-start').value, en = f.querySelector('#d-end').value;
        if (!err && st && en && en < st) err = 'The end date is before the start date.';
        if (err) { alert(err); return false; }
        var out = { code: code, type: type, value: type === 'pct' ? raw : Math.round(raw * 100), minSpend: Math.round((parseFloat(f.querySelector('#d-min').value) || 0) * 100),
          firstOrderOnly: f.querySelector('#d-first').checked, starts: st || null, ends: en || null, limit: parseInt(f.querySelector('#d-limit').value, 10) || null, active: f.querySelector('#d-active').checked };
        if (i == null) s.discounts.push(out); else s.discounts[i] = out;
        D.save(); A.toast(i == null ? 'Discount created' : 'Discount saved'); A.render();
      } });
    var del = m.form.querySelector('#d-del');
    if (del) del.addEventListener('click', function () { if (confirm('Delete ' + d.code + '?')) { s.discounts.splice(i, 1); D.save(); m.close(); A.toast('Discount deleted'); A.render(); } });
  }

  // ---------- shipping & delivery ----------
  function renderShipping(main) {
    var s = D.load(), sh = s.shipping;
    main.innerHTML = '<div class="page"><div class="page-head"><h1>Shipping and delivery</h1></div>' +
      '<section class="card"><div class="card-head"><h2>Delivery zones</h2><span class="grow"></span><button type="button" class="btn" id="add-zone">Add zone</button></div>' +
      '<p class="card-sub">Checkout works out the price from the customer\'s postcode. When a postcode is in more than one zone, the zone higher in this list wins.</p>' +
      '<div class="table-wrap"><table class="data"><thead><tr><th>Zone</th><th class="hide-sm">Areas</th><th class="right">Price</th><th></th></tr></thead><tbody>' +
      sh.zones.map(function (z, i) { return '<tr data-z="' + i + '" tabindex="0"><td><strong>' + esc(z.name) + '</strong><br><span class="muted small">' + D.parsePostcodes(z.postcodes).length + ' postcode groups</span></td><td class="hide-sm wrap">' + esc(z.areas) + '</td><td class="right num">' + money(z.price) + '</td><td class="right"><span class="btn plain">Edit</span></td></tr>'; }).join('') +
      '<tr style="cursor:default"><td><strong>Further than Zone 3</strong></td><td class="hide-sm wrap">Regional Victoria and further. The order is held with no payment until you send a delivery quote from the order page.</td><td class="right">' + (sh.quoteBeyond ? 'By quote' : 'Not offered') + '</td><td class="right"><label class="check" style="justify-content:flex-end"><input type="checkbox" id="quote"' + (sh.quoteBeyond ? ' checked' : '') + '><span>Offer quotes</span></label></td></tr>' +
      '</tbody></table></div>' +
      '<form class="field" id="pc-check" style="max-width:360px"><label for="pc">Check a postcode</label><div style="display:flex;gap:8px"><input class="input" id="pc" inputmode="numeric" maxlength="4" placeholder="e.g. 3121"><button class="btn" type="submit">Check</button></div><span class="help" id="pc-out" role="status"></span></form>' +
      '<p class="muted small">The postcode lists are a starting point based on your zone descriptions. Please check them against the suburbs you deliver to.</p></section>' +

      '<form class="card" id="f-pickup"><h2>Local pick-up</h2><label class="check"><input type="checkbox" id="pu-on"' + (sh.pickup.enabled ? ' checked' : '') + '><span>Offer free pick-up at checkout</span></label>' +
      '<div class="field"><label for="pu-loc">Pick-up location shown to customers</label><input id="pu-loc" value="' + esc(sh.pickup.location) + '"></div>' +
      '<div class="field"><label for="pu-ins">Pick-up instructions</label><textarea id="pu-ins" rows="3">' + esc(sh.pickup.instructions) + '</textarea></div>' +
      '<button type="submit" class="btn primary" style="justify-self:end">Save</button></form>' +

      '<form class="card" id="f-del"><h2>Delivery details</h2><div class="form-grid">' +
      '<div class="field"><label for="dl-time">Usual delivery time</label><input id="dl-time" value="' + esc(sh.timeframe) + '"></div>' +
      '<div class="field"><label for="dl-fee">Redelivery fee ($)</label><input id="dl-fee" inputmode="decimal" placeholder="Not set" value="' + (sh.redeliveryFee ? (sh.redeliveryFee / 100).toFixed(2) : '') + '"><span class="help">Charged when no one is home. Paid before you reschedule.</span></div></div>' +
      '<button type="submit" class="btn primary" style="justify-self:end">Save</button></form></div>';

    var page = main.querySelector('.page');
    page.addEventListener('click', function (e) { var tr = e.target.closest('tr[data-z]'); if (tr) editZone(+tr.getAttribute('data-z')); });
    page.addEventListener('keydown', function (e) { var tr = e.target.closest('tr[data-z]'); if (tr && e.key === 'Enter') editZone(+tr.getAttribute('data-z')); });
    $('#add-zone').addEventListener('click', function () { editZone(null); });
    $('#quote').addEventListener('change', function (e) { sh.quoteBeyond = e.target.checked; D.save(); A.toast('Saved'); });
    $('#pc-check').addEventListener('submit', function (e) {
      e.preventDefault();
      var pc = $('#pc').value.trim(), out = $('#pc-out');
      if (!/^\d{4}$/.test(pc)) { out.textContent = 'Enter a 4-digit postcode.'; return; }
      var z = D.zoneFor(pc, sh);
      out.textContent = z ? pc + ' is in ' + z.name + ': ' + money(z.price) + ' delivery.' : pc + ' is outside your zones: ' + (sh.quoteBeyond ? 'delivery by quote.' : 'delivery not offered (pick-up only).');
    });
    $('#f-pickup').addEventListener('submit', function (e) {
      e.preventDefault(); sh.pickup = { enabled: $('#pu-on').checked, location: $('#pu-loc').value.trim(), instructions: $('#pu-ins').value.trim() }; D.save(); A.toast('Pick-up saved');
    });
    $('#f-del').addEventListener('submit', function (e) {
      e.preventDefault(); sh.timeframe = $('#dl-time').value.trim(); var f = parseFloat($('#dl-fee').value); sh.redeliveryFee = f > 0 ? Math.round(f * 100) : null; D.save(); A.toast('Delivery details saved');
    });
  }
  function editZone(i) {
    var sh = D.load().shipping, z = i == null ? { id: 'z' + Date.now(), name: 'Zone ' + (sh.zones.length + 1), areas: '', price: 0, postcodes: '' } : sh.zones[i];
    var m = A.modal({ title: i == null ? 'Add delivery zone' : 'Edit ' + z.name, submit: 'Save zone',
      body: '<div class="form-grid"><div class="field"><label for="z-name">Zone name</label><input id="z-name" value="' + esc(z.name) + '"></div>' +
        '<div class="field"><label for="z-price">Delivery price ($)</label><input id="z-price" inputmode="decimal" value="' + (z.price / 100).toFixed(2) + '"></div></div>' +
        '<div class="field"><label for="z-areas">Areas (shown to customers)</label><input id="z-areas" value="' + esc(z.areas) + '"></div>' +
        '<div class="field"><label for="z-pc">Postcodes</label><textarea id="z-pc" rows="4">' + esc(z.postcodes) + '</textarea><span class="help">Separate with commas. Use a dash for a range, e.g. 3000-3099. For a postcode split between zones, add the suburb with it, e.g. Tarneit 3029.</span></div>' +
        (i == null ? '' : '<button type="button" class="btn plain" id="z-del" style="justify-self:start;color:#8e1f0b">Delete this zone</button>'),
      onSubmit: function (f) {
        var price = parseFloat(f.querySelector('#z-price').value);
        if (!(price >= 0)) { alert('Enter a price (0 or more).'); return false; }
        var out = { id: z.id, name: f.querySelector('#z-name').value.trim() || 'Zone', areas: f.querySelector('#z-areas').value.trim(), price: Math.round(price * 100), postcodes: f.querySelector('#z-pc').value.trim() };
        if (i == null) sh.zones.push(out); else sh.zones[i] = out;
        D.save(); A.toast('Zone saved'); A.render();
      } });
    var del = m.form.querySelector('#z-del');
    if (del) del.addEventListener('click', function () { if (confirm('Delete ' + z.name + '?')) { sh.zones.splice(i, 1); D.save(); m.close(); A.render(); } });
  }

  // ---------- settings ----------
  function renderSettings(main) {
    var s = D.load(), st = s.settings;
    var live = s.integrations || {};
    var integ = [
      ['Sq', 'Square payments', 'Takes card payments at checkout, refunds from an order, and payment links for delivery quotes. Keys are set on the server (Netlify environment variables).', live.square || 'Not connected'],
      ['GA', 'Google Analytics 4', 'Counts visitors, where they came from and what they viewed, added to bag and bought. Add your Measurement ID below.', st.gaId ? 'Connected: ' + st.gaId : 'Not connected'],
      ['G', 'Google Search Console', 'Shows how your shop appears in Google search and which searches bring visitors. Verify your domain and submit your sitemap (/sitemap.xml).', 'Not connected'],
      ['ID', 'Admin sign-in', 'Netlify Identity: only people invited with the admin role can open this admin. You\'re signed out after 30 minutes without activity.', live.identity || 'Connected'],
      ['@', 'Order emails', 'Sends order confirmations, quotes and delivery updates to customers, a welcome email to new subscribers, and a new-order alert to you.', live.email || 'Not connected']
    ];
    main.innerHTML = '<div class="page"><div class="page-head"><h1>Settings</h1></div>' +
      '<form class="card" id="f-store"><h2>Store details</h2><div class="form-grid">' +
      [['st-name', 'Store name', st.storeName], ['st-legal', 'Registered business name', st.legalName || 'Mirrorhousemelbourne'], ['st-email', 'Contact email', st.email], ['st-p1', 'Phone', st.phone1], ['st-p2', 'Second phone', st.phone2], ['st-addr', 'Address', st.address], ['st-abn', 'ABN', st.abn], ['st-hours', 'Opening hours', st.hours]].map(function (f) {
        return '<div class="field"><label for="' + f[0] + '">' + f[1] + '</label><input id="' + f[0] + '" value="' + esc(f[2]) + '"' + (f[0] === 'st-abn' ? ' inputmode="numeric" placeholder="11 digits" maxlength="14"' : '') + '></div>';
      }).join('') + '</div><label class="check" style="display:flex;gap:10px;align-items:flex-start;margin:4px 0"><input type="checkbox" id="st-gst"' + (st.gstRegistered ? ' checked' : '') + ' style="margin-top:3px"><span><strong>Registered for GST</strong><br><span class="card-sub small">Tick once you\'ve registered for GST with the ATO. Receipts then become <b>Tax invoices</b> showing the GST included, and checkout shows the GST amount. Your prices don\'t change: the price customers see is always the final price.</span></span></label><p class="card-sub small">Your registered business name and ABN appear on packing slips, receipts and in the shop footer.</p><button type="submit" class="btn primary" style="justify-self:end">Save</button></form>' +
      '<form class="card" id="f-ga"><h2>Google Analytics</h2><div class="form-grid"><div class="field"><label for="ga-id">Measurement ID</label><input id="ga-id" placeholder="G-XXXXXXXXXX" autocapitalize="characters" spellcheck="false" value="' + esc(st.gaId || '') + '"><span class="help">In Google Analytics: Admin → Data streams → your website → Measurement ID.</span></div></div>' +
      '<p class="card-sub small">Once saved, the shop tracks visits, product views, add to bag, checkout, purchases, quote requests and Try It in Your Room. Data starts from the day it\'s connected. Your Analytics page here shows sales now; visitor numbers in this admin are counted by the shop itself (you can always see them at analytics.google.com).</p>' +
      '<p class="form-msg small" id="ga-msg" role="status"></p><button type="submit" class="btn primary" style="justify-self:end">Save</button></form>' +
      '<section class="card"><h2>Connections</h2>' + integ.map(function (x) {
        return '<div class="integ"><span class="integ-ico">' + esc(x[0]) + '</span><div><strong>' + esc(x[1]) + '</strong><p class="card-sub small">' + esc(x[2]) + '</p></div><span class="badge ' + (x[3] === 'Required for launch' ? 'warn' : '') + '">' + esc(x[3]) + '</span></div>';
      }).join('') + '</section>' +
      '<section class="card"><h2>Backup</h2><p class="card-sub">Everything in this admin is saved in your store\'s database. You can also download a copy.</p><div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button type="button" class="btn" id="export-all">Download a backup (JSON)</button></div></section></div>';
    $('#f-store').addEventListener('submit', function (e) {
      e.preventDefault();
      var abn = $('#st-abn').value.replace(/\s/g, '');
      if (abn && !/^\d{11}$/.test(abn)) { alert('An ABN has 11 digits.'); return; }
      Object.assign(st, { storeName: $('#st-name').value.trim(), email: $('#st-email').value.trim(), phone1: $('#st-p1').value.trim(), phone2: $('#st-p2').value.trim(), address: $('#st-addr').value.trim(),
        abn: abn ? abn.replace(/(\d{2})(\d{3})(\d{3})(\d{3})/, '$1 $2 $3 $4') : '', legalName: $('#st-legal').value.trim(), hours: $('#st-hours').value.trim(), gstRegistered: $('#st-gst').checked });
      D.save(); A.toast('Store details saved');
    });
    $('#f-ga').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = $('#ga-id').value.trim().toUpperCase(), msg = $('#ga-msg');
      if (v && !/^G-[A-Z0-9]{4,}$/.test(v)) { msg.textContent = 'That doesn\'t look like a Measurement ID. It starts with G-, for example G-AB12CD34EF.'; return; }
      st.gaId = v; msg.textContent = ''; D.save(); A.toast(v ? 'Google Analytics connected' : 'Google Analytics removed'); A.render();
    });
    $('#export-all').addEventListener('click', function () {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(D.load(), null, 2)], { type: 'application/json' }));
      a.download = 'mirror-house-admin-backup.json'; document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 300);
    });
  }

  A.route(/^\/customers$/, renderCustomers, 'customers');
  A.route(/^\/mailing$/, renderMailing, 'mailing');
  A.route(/^\/customers\/([^/?]+)$/, renderCustomer, 'customers');
  A.route(/^\/discounts$/, renderDiscounts, 'discounts');
  A.route(/^\/shipping$/, renderShipping, 'shipping');
  A.route(/^\/settings$/, renderSettings, 'settings');

  A.boot();
})();
