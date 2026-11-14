// Mirror House admin: product list and product editor (add, edit, duplicate, delete).
(function () {
  'use strict';
  var A = window.MHAdmin, D = window.MHData, esc = A.esc, money = A.money, $ = A.$;
  var SITE = 'https://mirrorhousemelbourne.com.au';
  var listState = { tab: 'all', q: '' };

  function stockText(p) {
    if (p.stock == null || p.stock === '') return '<span class="muted">Not tracked</span>';
    var n = +p.stock, lim = p.lowAt != null && p.lowAt !== '' ? +p.lowAt : 1;
    return n <= 0 ? '<span style="color:#8e1f0b">Out of stock</span>' : n <= lim ? '<span style="color:#5e4200">' + n + ' in stock (low)</span>' : n + ' in stock';
  }

  function renderList(main) {
    var products = D.load().products;
    main.innerHTML = '<div class="page wide"><div class="page-head"><h1>Products</h1><span class="grow"></span><button type="button" class="btn" id="export-products">Export</button><a class="btn primary" href="#/products/new">Add product</a></div>' +
      '<section class="card flush"><div class="tabs" role="tablist">' + [['all', 'All'], ['active', 'Active'], ['draft', 'Draft'], ['archived', 'Archived']].map(function (t) {
        return '<button type="button" role="tab" data-tab="' + t[0] + '" aria-selected="' + (listState.tab === t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      '<div class="toolbar"><label class="visually-hidden" for="prod-q">Filter products</label><input class="input" id="prod-q" type="search" placeholder="Search products, SKU or supplier code" value="' + esc(listState.q) + '"></div><div id="prod-table"></div></section>' +
      '<p class="muted small">Draft products are hidden from your shop. Set stock to 0 to show a mirror as sold out.</p></div>';
    function draw() {
      var q = listState.q.trim().toLowerCase();
      var rows = products.filter(function (p) { return (listState.tab === 'all' || p.status === listState.tab) && (!q || (p.title + ' ' + p.category + ' ' + (p.sku || '') + ' ' + (p.supplierCode || '')).toLowerCase().indexOf(q) >= 0); });
      $('#prod-table').innerHTML = rows.length ? '<div class="table-wrap"><table class="data"><thead><tr><th>Product</th><th>Status</th><th>Inventory</th><th class="hide-sm">Category</th><th class="right">Price</th></tr></thead><tbody>' +
        rows.map(function (p) {
          return '<tr data-id="' + esc(p.id) + '" tabindex="0"><td><div class="cell-prod">' + A.thumb(p.images && p.images[0]) + '<div><strong>' + esc(p.title) + '</strong>' + (p.sku || p.supplierCode ? '<br><span class="muted small">' + [p.sku ? 'SKU ' + esc(p.sku) : '', p.supplierCode ? 'Supplier code ' + esc(p.supplierCode) : ''].filter(Boolean).join(' · ') + '</span>' : '') + '</div></div></td><td>' + A.badgeFor('status', p.status) + '</td><td>' + stockText(p) + '</td><td class="hide-sm">' + esc(p.category) + '</td><td class="right num">' + money(p.price) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty"><strong>No products found</strong><a class="btn primary" href="#/products/new">Add product</a></div>';
    }
    draw();
    var page = main.querySelector('.page');
    page.addEventListener('click', function (e) {
      var t = e.target.closest('[data-tab]');
      if (t) { listState.tab = t.getAttribute('data-tab'); A.$all('[data-tab]', page).forEach(function (b) { b.setAttribute('aria-selected', String(b === t)); }); draw(); return; }
      var tr = e.target.closest('tr[data-id]'); if (tr) A.go('#/products/' + encodeURIComponent(tr.getAttribute('data-id')));
    });
    page.addEventListener('keydown', function (e) { var tr = e.target.closest('tr[data-id]'); if (tr && e.key === 'Enter') A.go('#/products/' + encodeURIComponent(tr.getAttribute('data-id'))); });
    $('#prod-q').addEventListener('input', function (e) { listState.q = e.target.value; draw(); });
    $('#export-products').addEventListener('click', function () {
      A.csv('mirror-house-products.csv', ['Handle', 'Title', 'Status', 'Category', 'Price', 'Compare-at price', 'Stock', 'SKU', 'Supplier code', 'Description'],
        products.map(function (p) { return [p.slug, p.title, p.status, p.category, (p.price / 100).toFixed(2), p.compareAt ? (p.compareAt / 100).toFixed(2) : '', p.stock == null ? '' : p.stock, p.sku || '', p.supplierCode || '', p.desc || '']; }));
    });
  }

  // Resize an uploaded photo so it fits in storage (max 1400px on the long side).
  function readImage(file) {
    return new Promise(function (resolve, reject) {
      if (!/^image\//.test(file.type)) { reject(new Error(file.name + ' isn\'t an image')); return; }
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var max = 1400, k = Math.min(1, max / Math.max(img.width, img.height));
        var c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Couldn\'t read ' + file.name + '. Try a JPG or PNG.')); };
      img.src = url;
    });
  }

  function cents(v) { var n = parseFloat(String(v).replace(/[^0-9.]/g, '')); return isNaN(n) ? null : Math.round(n * 100); }
  function dollars(c) { return c == null ? '' : (c / 100).toFixed(2); }

  function renderEditor(main, args) {
    var s = D.load();
    var isNew = args[0] === 'new';
    var orig = isNew ? null : s.products.filter(function (p) { return p.id === args[0] || p.slug === args[0]; })[0];
    if (!isNew && !orig) { main.innerHTML = '<div class="page"><div class="card"><div class="empty"><strong>Product not found</strong><a class="btn" href="#/products">Back to products</a></div></div></div>'; return; }
    var p = JSON.parse(JSON.stringify(orig || { id: '', slug: '', title: '', desc: '', category: 'Wall Mirrors', price: null, compareAt: null, cost: null, status: 'draft', stock: 1, sku: '', weight: '', size: '', badge: '', bothWays: false, images: [], specs: [], tags: '', seoTitle: '', seoDesc: '' }));
    var dirty = false;
    var cats = s.products.map(function (x) { return x.category; }).filter(function (c, i, a) { return c && a.indexOf(c) === i; });
    if (cats.indexOf('Wall Mirrors') < 0) cats.unshift('Wall Mirrors');
    if (cats.indexOf('Floor Mirrors') < 0) cats.unshift('Floor Mirrors');
    var soldUnits = 0; s.orders.forEach(function (o) { o.lines.forEach(function (l) { if (orig && l.slug === orig.slug && o.payment !== 'refunded') soldUnits += l.qty; }); });

    main.innerHTML = '<div class="save-bar" id="save-bar" hidden><span class="grow">Unsaved changes</span><button type="button" class="btn" id="discard">Discard</button><button type="button" class="btn primary" id="save-top">Save</button></div>' +
      '<form class="page" id="pform" novalidate>' +
      '<div class="page-head"><a class="back" href="#/products" aria-label="Back to products">←</a><h1>' + (isNew ? 'Add product' : esc(p.title)) + '</h1>' + (isNew ? '' : A.badgeFor('status', p.status)) +
      '<span class="grow"></span>' + (isNew ? '' : '<a class="btn" href="' + esc('product.html?slug=' + encodeURIComponent(p.slug)) + '" target="_blank" rel="noopener">View in shop</a><button type="button" class="btn" id="dup">Duplicate</button>') + '</div>' +
      '<div class="cols"><div>' +
      '<section class="card"><div class="field"><label for="p-title">Title</label><input id="p-title" required maxlength="120" placeholder="e.g. Statement Curve Mirror – Silver" value="' + esc(p.title) + '"></div>' +
      '<div class="field"><label for="p-desc">Description</label><textarea id="p-desc" rows="5" placeholder="What makes this mirror special: shape, frame, where it looks best.">' + esc(p.desc) + '</textarea></div></section>' +
      '<section class="card"><div class="card-head"><h2>Media</h2><span class="grow"></span><span class="muted small">First photo is the main one. JPG or PNG, resized automatically.</span></div><div class="media-grid" id="media"></div>' +
      '<input type="file" id="p-files" accept="image/*" multiple hidden><p class="form-msg small" id="media-msg" role="status"></p></section>' +
      '<section class="card"><h2>Pricing</h2><div class="form-grid">' +
      '<div class="field"><label for="p-price">Price (final price customers pay)</label><div class="input-affix"><span>$</span><input id="p-price" inputmode="decimal" required placeholder="0.00" value="' + dollars(p.price) + '"></div></div>' +
      '<div class="field"><label for="p-compare">Compare-at price</label><div class="input-affix"><span>$</span><input id="p-compare" inputmode="decimal" placeholder="0.00" value="' + dollars(p.compareAt) + '"></div><span class="help">Shows as a crossed-out price for a sale.</span></div>' +
      '<div class="field"><label for="p-cost">Cost per item</label><div class="input-affix"><span>$</span><input id="p-cost" inputmode="decimal" placeholder="0.00" value="' + dollars(p.cost) + '"></div><span class="help">Customers won\'t see this.</span></div>' +
      '<div class="margin-row" id="margin" style="align-self:end"></div></div></section>' +
      '<section class="card"><h2>Inventory</h2><div class="form-grid">' +
      '<label class="check full"><input type="checkbox" id="p-track"' + (p.stock != null ? ' checked' : '') + '><span>Track quantity</span></label>' +
      '<div class="field"><label for="p-stock">Quantity in stock</label><input id="p-stock" type="number" min="0" step="1" value="' + esc(p.stock == null ? '' : p.stock) + '"' + (p.stock == null ? ' disabled' : '') + '></div>' +
      '<div class="field"><label for="p-low">Remind me when stock reaches</label><input id="p-low" type="number" min="0" step="1" value="' + esc(p.lowAt != null ? p.lowAt : 1) + '"><span class="help">A low-stock reminder shows on your admin Home page' + '' + ' (and is emailed to you on the live site) when stock drops to this number. When it sells out it switches to Sold out automatically and you get a follow-up reminder.</span></div>' +
      '<div class="field"><label for="p-sku">SKU (your stock code)</label><input id="p-sku" value="' + esc(p.sku || '') + '"></div>' +
      '<div class="field"><label for="p-sup">Supplier code</label><input id="p-sup" placeholder="e.g. LPU 12302" value="' + esc(p.supplierCode || '') + '"><span class="help">Your supplier\'s product code, for reordering. Customers won\'t see this.</span></div></div>' +
      (isNew ? '' : '<p class="card-sub small">' + soldUnits + ' sold so far.</p>') + '</section>' +
      '<section class="card"><h2>Size, weight and hanging</h2><div class="form-grid">' +
      '<div class="field"><label for="p-size">Size</label><input id="p-size" placeholder="e.g. 200 cm high × 100 cm wide" value="' + esc(p.size || '') + '"></div>' +
      '<div class="field"><label for="p-weight">Weight (kg)</label><input id="p-weight" inputmode="decimal" value="' + esc(p.weight || '') + '"></div>' +
      '<label class="check full"><input type="checkbox" id="p-both"' + (p.bothWays ? ' checked' : '') + '><span>Can hang vertically or horizontally</span></label>' +
      '<div class="field full"><label for="p-specs">Product details (one per line)</label><textarea id="p-specs" rows="5" placeholder="Gold metal frame with curved detailing&#10;Ships in a heavy-duty cardboard box">' + esc((p.specs || []).join('\n')) + '</textarea><span class="help">Shown as a list on the product page.</span></div></div></section>' +
      '<section class="card"><div class="card-head"><h2>Search engine listing</h2></div><p class="card-sub">How this product could look in Google results.</p><div class="serp" id="serp"></div>' +
      '<div class="field"><label for="p-seo-title">Page title</label><input id="p-seo-title" maxlength="70" value="' + esc(p.seoTitle || '') + '"><span class="help" id="seo-title-count"></span></div>' +
      '<div class="field"><label for="p-seo-desc">Meta description</label><textarea id="p-seo-desc" rows="3" maxlength="320">' + esc(p.seoDesc || '') + '</textarea><span class="help" id="seo-desc-count"></span></div>' +
      '<div class="field"><label for="p-handle">URL handle</label><input id="p-handle" pattern="[a-z0-9-]+" value="' + esc(p.slug) + '"' + (isNew ? '' : ' readonly') + '><span class="help">' + (isNew ? 'Letters, numbers and dashes. Filled in from the title.' : 'Fixed once a product is live, so existing links keep working.') + '</span></div></section>' +
      '</div><div>' +
      '<section class="card"><h2>Status</h2><div class="field"><label class="visually-hidden" for="p-status">Status</label><select id="p-status">' +
      [['active', 'Active'], ['draft', 'Draft'], ['archived', 'Archived']].map(function (o) { return '<option value="' + o[0] + '"' + (p.status === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
      '</select><span class="help">Only Active products show in your shop.</span></div></section>' +
      '<section class="card"><h2>Product organisation</h2>' +
      '<div class="field"><label for="p-cat">Category</label><input id="p-cat" list="cat-list" value="' + esc(p.category) + '"><datalist id="cat-list">' + cats.map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist></div>' +
      '<div class="field"><label for="p-badge">Badge on product card</label><input id="p-badge" maxlength="20" placeholder="e.g. New, Signature" value="' + esc(p.badge || '') + '"></div>' +
      '<div class="field"><label for="p-tags">Tags</label><input id="p-tags" placeholder="e.g. gold, statement, living room" value="' + esc(p.tags || '') + '"></div></section>' +
      '<section class="card"><h2>Try It in Your Room</h2><p class="card-sub">New mirrors need their shape (arch, round, rectangle, wavy) added to the room preview by your developer before they appear there.</p></section>' +
      (isNew ? '' : '<section class="card"><button type="button" class="btn danger" id="del">Delete product</button></section>') +
      '</div></div>' +
      '<div style="display:flex;justify-content:flex-end;gap:8px"><a class="btn" href="#/products">Cancel</a><button type="submit" class="btn primary">Save product</button></div>' +
      '<p class="form-msg small" id="p-msg" role="alert" style="color:#8e1f0b"></p></form>';

    var form = $('#pform');
    function setDirty() { dirty = true; $('#save-bar').hidden = false; }
    A.setLeaveGuard(function () { return !dirty || confirm('Leave without saving your changes?'); });

    function drawMedia() {
      $('#media').innerHTML = p.images.map(function (src, i) {
        return '<div class="media-tile' + (i === 0 ? ' first' : '') + '"><img src="' + esc(src) + '" alt="Product photo ' + (i + 1) + '"><button type="button" data-rm="' + i + '" aria-label="Remove photo ' + (i + 1) + '">✕</button>' +
          (i ? '<button type="button" data-main="' + i + '" aria-label="Make photo ' + (i + 1) + ' the main photo" style="top:auto;bottom:4px;width:auto;padding:0 6px">Main</button>' : '') + '</div>';
      }).join('') + '<button type="button" class="media-add" id="add-media">+ Add photos</button>';
    }
    function drawMargin() {
      var price = cents($('#p-price').value), cost = cents($('#p-cost').value);
      $('#margin').innerHTML = price && cost != null ? '<span>Profit (before GST) <strong>' + money(Math.round(price / 1.1) - cost) + '</strong></span><span>Margin <strong>' + Math.round(100 * (Math.round(price / 1.1) - cost) / Math.round(price / 1.1)) + '%</strong></span>' : '';
    }
    function drawSerp() {
      var title = $('#p-seo-title').value.trim() || ($('#p-title').value.trim() ? $('#p-title').value.trim() + ' | Mirror House Melbourne' : 'Product title | Mirror House Melbourne');
      var desc = $('#p-seo-desc').value.trim() || $('#p-desc').value.trim() || 'Add a description to see how it looks in search results.';
      var handle = $('#p-handle').value || 'product';
      $('#serp').innerHTML = '<span class="s-url">' + esc(SITE.replace('https://', '') + ' › ' + handle) + '</span><span class="s-title">' + esc(title.slice(0, 65)) + (title.length > 65 ? '…' : '') + '</span><span class="s-desc">' + esc(desc.slice(0, 158)) + (desc.length > 158 ? '…' : '') + '</span>';
      var tl = $('#p-seo-title').value.length, dl = $('#p-seo-desc').value.length;
      $('#seo-title-count').textContent = tl ? tl + ' of 70 characters. Aim for 50–60.' : 'Leave blank to use the product title.';
      $('#seo-desc-count').textContent = dl ? dl + ' of 320 characters. Google shows about 155.' : 'Leave blank to use the start of the description.';
    }
    drawMedia(); drawMargin(); drawSerp();

    form.addEventListener('input', function (e) {
      setDirty();
      if (e.target.id === 'p-title' && isNew) $('#p-handle').value = D.slugify(e.target.value);
      if (/p-price|p-cost/.test(e.target.id)) drawMargin();
      drawSerp();
    });
    form.addEventListener('change', function (e) { if (e.target.id === 'p-track') { $('#p-stock').disabled = !e.target.checked; if (e.target.checked && $('#p-stock').value === '') $('#p-stock').value = '1'; } });
    $('#media').addEventListener('click', function (e) {
      if (e.target.closest('#add-media')) { $('#p-files').click(); return; }
      var rm = e.target.closest('[data-rm]'); if (rm) { p.images.splice(+rm.getAttribute('data-rm'), 1); drawMedia(); setDirty(); return; }
      var mk = e.target.closest('[data-main]'); if (mk) { var i = +mk.getAttribute('data-main'); p.images.unshift(p.images.splice(i, 1)[0]); drawMedia(); setDirty(); }
    });
    $('#p-files').addEventListener('change', function (e) {
      var files = Array.prototype.slice.call(e.target.files || []), msg = $('#media-msg');
      msg.textContent = files.length ? 'Adding ' + files.length + (files.length === 1 ? ' photo…' : ' photos…') : '';
      Promise.all(files.map(function (f) { return readImage(f).catch(function (err) { return { error: err.message }; }); })).then(function (res) {
        var errs = res.filter(function (r) { return r && r.error; }).map(function (r) { return r.error; });
        res.forEach(function (r) { if (typeof r === 'string') p.images.push(r); });
        drawMedia(); setDirty(); e.target.value = '';
        msg.textContent = errs.join(' ');
      });
    });

    function collect() {
      p.title = $('#p-title').value.trim();
      p.desc = $('#p-desc').value.trim();
      p.price = cents($('#p-price').value);
      p.compareAt = cents($('#p-compare').value);
      p.cost = cents($('#p-cost').value);
      p.stock = $('#p-track').checked ? Math.max(0, parseInt($('#p-stock').value, 10) || 0) : null;
      p.sku = $('#p-sku').value.trim();
      p.supplierCode = $('#p-sup').value.trim();
      var lv = $('#p-low').value.trim(); p.lowAt = lv === '' ? null : Math.max(0, parseInt(lv, 10) || 0);
      p.size = $('#p-size').value.trim();
      p.weight = $('#p-weight').value.trim();
      p.bothWays = $('#p-both').checked;
      p.specs = $('#p-specs').value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
      p.seoTitle = $('#p-seo-title').value.trim();
      p.seoDesc = $('#p-seo-desc').value.trim();
      p.status = $('#p-status').value;
      p.category = $('#p-cat').value.trim() || 'Wall Mirrors';
      p.badge = $('#p-badge').value.trim();
      p.tags = $('#p-tags').value.trim();
      if (isNew) p.slug = D.slugify($('#p-handle').value || p.title);
    }
    function save() {
      collect();
      var msg = $('#p-msg'); msg.textContent = '';
      if (!p.title) { msg.textContent = 'Add a title.'; $('#p-title').focus(); return; }
      if (p.price == null) { msg.textContent = 'Add a price.'; $('#p-price').focus(); return; }
      if (p.compareAt != null && p.compareAt <= p.price) { msg.textContent = 'The compare-at price should be higher than the price.'; $('#p-compare').focus(); return; }
      if (isNew && s.products.some(function (x) { return x.slug === p.slug; })) { msg.textContent = 'Another product already uses the URL handle "' + p.slug + '". Change the handle.'; $('#p-handle').focus(); return; }
      if (isNew) { p.id = p.slug; s.products.unshift(p); }
      else { var i = s.products.indexOf(orig); s.products[i] = p; }
      if (!D.save()) { msg.textContent = 'Couldn\'t save: this browser\'s storage is full. Remove a photo or two and try again.'; if (isNew) s.products.shift(); return; }
      dirty = false; A.setLeaveGuard(null);
      A.toast(isNew ? 'Product added' : 'Product saved');
      if (isNew) A.go('#/products/' + encodeURIComponent(p.id)); else A.render();
    }
    form.addEventListener('submit', function (e) { e.preventDefault(); save(); });
    $('#save-top').addEventListener('click', save);
    $('#discard').addEventListener('click', function () { dirty = false; A.setLeaveGuard(null); A.render(); });
    if ($('#dup')) $('#dup').addEventListener('click', function () {
      if (dirty && !confirm('Duplicate without saving your changes?')) return;
      var copy = JSON.parse(JSON.stringify(orig));
      copy.title = orig.title + ' (copy)'; copy.slug = D.slugify(copy.title); copy.id = copy.slug; copy.status = 'draft';
      while (s.products.some(function (x) { return x.slug === copy.slug; })) { copy.slug += '-2'; copy.id = copy.slug; }
      s.products.unshift(copy); D.save(); dirty = false; A.setLeaveGuard(null); A.toast('Duplicated as a draft'); A.go('#/products/' + encodeURIComponent(copy.id));
    });
    if ($('#del')) $('#del').addEventListener('click', function () {
      A.modal({ title: 'Delete ' + orig.title + '?', danger: true, submit: 'Delete product', body: '<p>This can\'t be undone. Past orders keep their details. To hide it from the shop instead, set it to Draft.</p>', onSubmit: function () {
        s.products.splice(s.products.indexOf(orig), 1); D.save(); dirty = false; A.setLeaveGuard(null); A.toast('Product deleted'); A.go('#/products');
      } });
    });
  }

  A.route(/^\/products$/, renderList, 'products');
  A.route(/^\/products\/([^/?]+)$/, renderEditor, 'products');
})();
