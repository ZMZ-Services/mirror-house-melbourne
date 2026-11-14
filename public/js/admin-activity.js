// Mirror House admin: Activity log. Who changed what, and when: admin edits, orders, quote requests and sign-ups.
(function () {
  'use strict';
  var A = window.MHAdmin, D = window.MHData, esc = A.esc, $ = A.$;
  var tab = 'all';

  function who(a) {
    if (a.actorType === 'admin') return a.actor;
    if (a.actorType === 'customer') return a.actor === 'square' ? 'Square' : 'Customer · ' + a.actor;
    return 'Shop';
  }
  function fmt(v) {
    if (v == null || v === '') return '–';
    if (typeof v === 'object') return JSON.stringify(v).slice(0, 160);
    return String(v).slice(0, 160);
  }
  // The changed fields (from → to) for edits, shown under the summary.
  function details(a) {
    var d = a.detail;
    if (!d || typeof d !== 'object' || a.action === 'shipping.updated') return '';
    var rows = Object.keys(d).filter(function (k) { return d[k] && typeof d[k] === 'object' && 'from' in d[k]; });
    if (!rows.length) return '';
    return '<ul class="small muted" style="margin:6px 0 0;padding-left:18px">' + rows.map(function (k) {
      var from = d[k].from, to = d[k].to;
      if (k === 'price' || k === 'compareAt' || k === 'cost') { from = from == null ? null : A.money(from); to = to == null ? null : A.money(to); }
      return '<li><strong>' + esc(k) + '</strong>: ' + esc(fmt(from)) + ' → ' + esc(fmt(to)) + '</li>';
    }).join('') + '</ul>';
  }
  function link(a) {
    if (a.entity === 'order') return '#/orders/' + encodeURIComponent(a.entityId);
    if (a.entity === 'product' && D.load().products.some(function (p) { return p.slug === a.entityId; })) return '#/products/' + encodeURIComponent(a.entityId);
    if (a.entity === 'subscriber') return '#/mailing';
    if (a.entity === 'discount') return '#/discounts';
    if (a.entity === 'customer') return '#/customers/' + encodeURIComponent(a.entityId);
    if (a.entityId === 'shipping') return '#/shipping';
    if (a.entity === 'settings') return '#/settings';
    return '';
  }

  function render(main) {
    var all = D.load().activity || [];
    main.innerHTML = '<div class="page wide"><div class="page-head"><h1>Activity log</h1><span class="grow"></span><button type="button" class="btn" id="act-export"' + (all.length ? '' : ' disabled') + '>Download (CSV)</button></div>' +
      '<p class="muted" style="margin:-8px 0 0">Every change made in this admin, with who made it, plus orders, quote requests and mailing list sign-ups from the shop. The latest 300 are shown.</p>' +
      '<section class="card flush"><div class="tabs" role="tablist">' + [['all', 'Everything'], ['admin', 'Admin changes'], ['customer', 'Shop activity']].map(function (t) {
        return '<button type="button" role="tab" data-tab="' + t[0] + '" aria-selected="' + (tab === t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      '<div id="act-list"></div></section></div>';
    function draw() {
      var rows = all.filter(function (a) { return tab === 'all' || (tab === 'admin' ? a.actorType === 'admin' : a.actorType !== 'admin'); });
      $('#act-list').innerHTML = rows.length ? '<div class="table-wrap"><table class="data"><thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead><tbody>' + rows.map(function (a) {
        var href = link(a);
        return '<tr style="cursor:default" data-action="' + esc(a.action) + '"><td class="nowrap small">' + esc(A.dateTime(a.at)) + '</td><td class="small">' + esc(who(a)) + '</td><td>' +
          (href ? '<a href="' + esc(href) + '">' + esc(a.summary) + '</a>' : esc(a.summary)) + details(a) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="empty"><strong>Nothing here yet</strong><p>Changes you make and orders from the shop will show here.</p></div>';
    }
    draw();
    main.querySelector('.page').addEventListener('click', function (e) {
      var t = e.target.closest('[data-tab]'); if (!t) return;
      tab = t.getAttribute('data-tab');
      A.$all('[data-tab]', main).forEach(function (b) { b.setAttribute('aria-selected', String(b === t)); });
      draw();
    });
    $('#act-export').addEventListener('click', function () {
      A.csv('mirror-house-activity.csv', ['When', 'Who', 'Action', 'What'], all.map(function (a) { return [new Date(a.at).toISOString(), who(a), a.action, a.summary]; }));
    });
  }

  A.route(/^\/activity$/, render, 'activity');
})();
