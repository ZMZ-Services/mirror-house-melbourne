// Mirror House admin: small hand-built SVG charts (no outside libraries), each with a hover tooltip
// and a "View as table" toggle so the numbers can always be read without the picture.
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // Round the top of the axis up to a tidy number with 3–5 even steps (e.g. 0, 1k, 2k … 5k).
  function niceScale(v) {
    if (!(v > 0)) return { max: 4, step: 1, n: 4 };
    var raw = v / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    var step = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
    var n = Math.max(1, Math.ceil(v / step));
    return { max: step * n, step: step, n: n };
  }
  function tooltip(host) {
    var t = host.querySelector('.viz-tip');
    if (!t) { t = document.createElement('div'); t.className = 'viz-tip'; t.setAttribute('role', 'status'); host.appendChild(t); }
    return t;
  }
  function placeTip(tip, host, x, y) {
    var hw = host.clientWidth, tw = tip.offsetWidth;
    var left = Math.min(Math.max(8, x + 14), hw - tw - 8);
    if (x + 14 + tw > hw - 8) left = Math.max(8, x - tw - 14);
    tip.style.left = left + 'px'; tip.style.top = Math.max(0, y - 10) + 'px';
  }

  function tableToggle(host, headers, rows) {
    var wrap = document.createElement('div');
    wrap.className = 'viz-table-wrap';
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'viz-table-btn'; btn.textContent = 'View as table';
    var table = document.createElement('div');
    table.className = 'viz-table'; table.hidden = true;
    table.innerHTML = '<table><thead><tr>' + headers.map(function (h) { return '<th scope="col">' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr>' + r.map(function (c, i) { return i ? '<td>' + esc(c) + '</td>' : '<th scope="row">' + esc(c) + '</th>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
    btn.addEventListener('click', function () { table.hidden = !table.hidden; btn.textContent = table.hidden ? 'View as table' : 'Hide table'; });
    wrap.appendChild(btn); wrap.appendChild(table);
    host.appendChild(wrap);
  }

  // series: [{ name, values:[number], className }], labels: [string] (x), fmt: value formatter
  function line(host, opts) {
    host.innerHTML = '';
    host.classList.add('viz');
    var labels = opts.labels, series = opts.series, fmt = opts.fmt || String;
    var W = Math.max(280, host.clientWidth || 600), H = opts.height || 240;
    var pad = { l: 56, r: 12, t: 12, b: 28 };
    var sc = niceScale(Math.max.apply(null, series.reduce(function (a, s) { return a.concat(s.values); }, [0])) || opts.zeroMax || 4), max = sc.max;
    var n = labels.length;
    var x = function (i) { return pad.l + (n <= 1 ? 0 : i * (W - pad.l - pad.r) / (n - 1)); };
    var y = function (v) { return pad.t + (1 - v / max) * (H - pad.t - pad.b); };

    if (series.length > 1) {
      var legend = document.createElement('div');
      legend.className = 'viz-legend';
      legend.innerHTML = series.map(function (s) { return '<span class="viz-key ' + s.className + '"><i></i>' + esc(s.name) + '</span>'; }).join('');
      host.appendChild(legend);
    }
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', height: H, role: 'img', 'aria-label': opts.label || 'Line chart' }, host);
    for (var g = 0; g <= sc.n; g++) {
      var gv = sc.step * g, gy = y(gv);
      el('line', { x1: pad.l, x2: W - pad.r, y1: gy, y2: gy, class: 'viz-grid' + (g === 0 ? ' base' : '') }, svg);
      var tx = el('text', { x: pad.l - 8, y: gy + 4, 'text-anchor': 'end', class: 'viz-axis' }, svg); tx.textContent = fmt(gv, true);
    }
    var every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - pad.l) / 72))));
    labels.forEach(function (lb, i) {
      if (i % every && i !== n - 1) return;
      if (i !== n - 1 && n - 1 - i < every * 0.6) return;
      var t = el('text', { x: x(i), y: H - 8, 'text-anchor': i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle', class: 'viz-axis' }, svg); t.textContent = lb;
    });
    series.slice().reverse().forEach(function (s) {
      var d = s.values.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1); }).join('');
      if (!s.dashed && opts.area !== false) el('path', { d: d + 'L' + x(n - 1) + ',' + y(0) + 'L' + x(0) + ',' + y(0) + 'Z', class: 'viz-area ' + s.className }, svg);
      el('path', { d: d, class: 'viz-line ' + s.className + (s.dashed ? ' dashed' : '') }, svg);
    });
    var cross = el('line', { y1: pad.t, y2: H - pad.b, class: 'viz-cross', visibility: 'hidden' }, svg);
    var dots = series.map(function (s) { return el('circle', { r: 4.5, class: 'viz-dot ' + s.className, visibility: 'hidden' }, svg); });
    var hit = el('rect', { x: pad.l, y: pad.t, width: W - pad.l - pad.r, height: H - pad.t - pad.b, fill: 'transparent' }, svg);
    var tip = tooltip(host);
    function show(evt) {
      var r = svg.getBoundingClientRect(), px = (evt.clientX - r.left) * W / r.width;
      var i = Math.round((px - pad.l) / ((W - pad.l - pad.r) / Math.max(1, n - 1)));
      i = Math.max(0, Math.min(n - 1, i));
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
      dots.forEach(function (dt, k) { dt.setAttribute('cx', x(i)); dt.setAttribute('cy', y(series[k].values[i])); dt.setAttribute('visibility', 'visible'); });
      tip.innerHTML = '<strong>' + esc((opts.tipLabels || labels)[i]) + '</strong>' + series.map(function (s) {
        return '<span class="viz-tip-row"><i class="' + s.className + '"></i>' + esc(s.tipName || s.name) + '<b>' + esc(fmt(s.values[i])) + '</b></span>';
      }).join('');
      tip.classList.add('show');
      placeTip(tip, host, x(i) * r.width / W + (r.left - host.getBoundingClientRect().left), y(series[0].values[i]) * r.height / H + (r.top - host.getBoundingClientRect().top));
    }
    function hide() { cross.setAttribute('visibility', 'hidden'); dots.forEach(function (dt) { dt.setAttribute('visibility', 'hidden'); }); tip.classList.remove('show'); }
    hit.addEventListener('pointermove', show); hit.addEventListener('pointerdown', show); hit.addEventListener('pointerleave', hide);
    tableToggle(host, [opts.xName || 'Period'].concat(series.map(function (s) { return s.name; })),
      labels.map(function (lb, i) { return [(opts.tipLabels || labels)[i]].concat(series.map(function (s) { return fmt(s.values[i]); })); }));
  }

  // Vertical columns, one series. values: [number], labels: [string]
  function columns(host, opts) {
    host.innerHTML = '';
    host.classList.add('viz');
    var labels = opts.labels, values = opts.values, fmt = opts.fmt || String;
    var W = Math.max(280, host.clientWidth || 600), H = opts.height || 200;
    var pad = { l: 44, r: 8, t: 10, b: 26 };
    var sc = niceScale(Math.max.apply(null, values.concat([0])) || opts.zeroMax || 4), max = sc.max;
    var n = values.length, slot = (W - pad.l - pad.r) / n, bw = Math.max(3, Math.min(28, slot - 2));
    var y = function (v) { return pad.t + (1 - v / max) * (H - pad.t - pad.b); };
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', height: H, role: 'img', 'aria-label': opts.label || 'Column chart' }, host);
    for (var g = 0; g <= sc.n; g++) {
      var gv = sc.step * g, gy = y(gv);
      el('line', { x1: pad.l, x2: W - pad.r, y1: gy, y2: gy, class: 'viz-grid' + (g === 0 ? ' base' : '') }, svg);
      var tx = el('text', { x: pad.l - 8, y: gy + 4, 'text-anchor': 'end', class: 'viz-axis' }, svg); tx.textContent = fmt(gv, true);
    }
    var every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - pad.l) / 36))));
    var tip = tooltip(host);
    values.forEach(function (v, i) {
      var cx = pad.l + slot * i + slot / 2, top = y(v), h = Math.max(0, y(0) - top);
      var r = Math.min(4, bw / 2, h);
      var d = 'M' + (cx - bw / 2) + ',' + y(0) + 'V' + (top + r) + 'Q' + (cx - bw / 2) + ',' + top + ' ' + (cx - bw / 2 + r) + ',' + top +
        'H' + (cx + bw / 2 - r) + 'Q' + (cx + bw / 2) + ',' + top + ' ' + (cx + bw / 2) + ',' + (top + r) + 'V' + y(0) + 'Z';
      var bar = el('path', { d: d, class: 'viz-bar' + (opts.highlight === i ? ' hi' : '') }, svg);
      var hitR = el('rect', { x: pad.l + slot * i, y: pad.t, width: slot, height: H - pad.t - pad.b, fill: 'transparent' }, svg);
      function show() {
        bar.classList.add('hover');
        tip.innerHTML = '<strong>' + esc((opts.tipLabels || labels)[i]) + '</strong><span class="viz-tip-row"><i class="s1"></i>' + esc(opts.name || 'Value') + '<b>' + esc(fmt(v)) + '</b></span>';
        tip.classList.add('show');
        var rr = svg.getBoundingClientRect(), hr = host.getBoundingClientRect();
        placeTip(tip, host, cx * rr.width / W + rr.left - hr.left, top * rr.height / H + rr.top - hr.top);
      }
      hitR.addEventListener('pointerenter', show); hitR.addEventListener('pointerdown', show);
      hitR.addEventListener('pointerleave', function () { bar.classList.remove('hover'); tip.classList.remove('show'); });
      if (i % every === 0) { var t = el('text', { x: cx, y: H - 8, 'text-anchor': 'middle', class: 'viz-axis' }, svg); t.textContent = labels[i]; }
    });
    tableToggle(host, [opts.xName || 'Period', opts.name || 'Value'], labels.map(function (lb, i) { return [(opts.tipLabels || labels)[i], fmt(values[i])]; }));
  }

  // Horizontal ranked bars in HTML. rows: [{ label, value, note }]
  function bars(host, opts) {
    var rows = opts.rows, fmt = opts.fmt || String;
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; }).concat([1]));
    host.classList.add('viz');
    host.innerHTML = '<ul class="hbars" role="list">' + rows.map(function (r) {
      return '<li title="' + esc(r.label + ': ' + fmt(r.value)) + '"><span class="hbar-label">' + esc(r.label) + '</span>' +
        '<span class="hbar-track"><span class="hbar-fill" style="width:' + (100 * r.value / max).toFixed(1) + '%"></span></span>' +
        '<span class="hbar-val">' + esc(fmt(r.value)) + (r.note ? ' <small>' + esc(r.note) + '</small>' : '') + '</span></li>';
    }).join('') + '</ul>';
  }

  // Funnel: stages [{ label, value }]; shows reach and the drop between stages.
  function funnel(host, stages) {
    var top = stages[0].value || 1;
    host.classList.add('viz');
    host.innerHTML = '<ol class="funnel">' + stages.map(function (s, i) {
      var pct = 100 * s.value / top, prev = i ? stages[i - 1].value : null;
      var keep = prev ? (100 * s.value / Math.max(1, prev)) : 100;
      return '<li class="funnel-row" style="--w:' + Math.max(pct, 1.5).toFixed(1) + '%" title="' + esc(s.label + ': ' + s.value.toLocaleString('en-AU')) + '">' +
        '<div class="funnel-head"><span class="funnel-label">' + esc(s.label) + '</span><span class="funnel-val">' + s.value.toLocaleString('en-AU') + ' <small>' + pct.toFixed(pct < 10 ? 1 : 0) + '%</small></span></div>' +
        '<div class="funnel-track"><div class="funnel-fill step' + i + '"></div></div>' +
        (i && stages[0].value ? '<div class="funnel-drop">' + keep.toFixed(0) + '% continued from the step before · ' + (100 - keep).toFixed(0) + '% dropped off</div>' : '') + '</li>';
    }).join('') + '</ol>';
  }

  function spark(values) {
    var W = 96, H = 28, max = Math.max.apply(null, values.concat([1])), min = Math.min.apply(null, values.concat([0]));
    var span = max - min || 1, n = values.length;
    var d = values.map(function (v, i) { return (i ? 'L' : 'M') + (i * W / Math.max(1, n - 1)).toFixed(1) + ',' + (H - 2 - (v - min) / span * (H - 4)).toFixed(1); }).join('');
    return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" aria-hidden="true"><path d="' + d + '"/></svg>';
  }

  window.MHCharts = { line: line, columns: columns, bars: bars, funnel: funnel, spark: spark };
})();
