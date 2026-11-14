// Mirror House Melbourne storefront: catalogue, quick view, bag, product page and checkout.
// Live prices, stock, names and photos come from the store's database (/api/products, a Netlify Function).
// If it isn't reachable, the built-in catalogue below is used so the shop still renders.
(function () {
  'use strict';

  // Keep in line with netlify/lib/pricing.mjs (SHOP_CATEGORIES).
  // Categories shown in the shop. Add 'Lighting', 'Ceramics & Vases' or 'Tableware' back here to show those products again.
  var SHOW_CATEGORIES = ['Floor Mirrors', 'Wall Mirrors'];
  // Products no longer sold. Hidden even if they're still in the database.
  var HIDDEN_PRODUCTS = ['grand-royale-arched-brass-floor-mirror', 'ondine-wavy-wall-mirror'];
  // Discount codes are set in the admin (Discounts) and checked on the server when an order is placed.
  var FREE_FREIGHT_FROM = 15000;
  var PREVIEW = !!window.MH_PREVIEW;

  // ---------- Google Analytics 4 ----------
  // The Measurement ID (G-...) comes from the live site's settings (window.MH_GA_ID), or in the preview
  // from Admin > Settings. Tracks page views plus shop events: product views, add to bag, checkout,
  // purchases, quote requests and Try It in Your Room.
  var GA_ID = (function () {
    var id = window.MH_GA_ID || '';
    if (!id && PREVIEW) { try { id = ((JSON.parse(localStorage.getItem('mh-admin-v1') || 'null') || {}).settings || {}).gaId || ''; } catch (e) { /* none */ } }
    return /^G-[A-Z0-9]{4,}$/i.test(id) ? id.toUpperCase() : '';
  })();
  if (GA_ID) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID, { currency: 'AUD' });
    var gs = document.createElement('script'); gs.async = true; gs.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
    document.head.appendChild(gs);
  }
  // GST: only shown (and receipts called tax invoices) once the business is registered for GST.
  // Prices are always the final price either way.
  function gstRegistered() {
    if (window.MH_GST_REGISTERED != null) return !!window.MH_GST_REGISTERED;
    if (PREVIEW) { try { return !!(((JSON.parse(localStorage.getItem('mh-admin-v1') || 'null') || {}).settings || {}).gstRegistered); } catch (e) { return false; } }
    return false;
  }
  function track(name, params) {
    try { if (GA_ID && window.gtag) window.gtag('event', name, params || {}); } catch (e) { /* never break the shop */ }
    var own = { view_item: 'view_item', add_to_cart: 'add_to_cart', begin_checkout: 'begin_checkout', try_in_your_room_open: 'try_in_your_room' }[name];
    if (own) visit(own, params && params.items && params.items[0] ? params.items[0].item_id : '');
  }
  // Visit counting for the admin's Analytics page (live site only). No cookies: a random id for this tab's visit
  // and a random id for this browser, sent with the page and where the visit came from.
  function rid() { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(36).slice(2, 12); }
  var VISIT = (function () {
    var v = { sid: '', vid: '', nv: false };
    try {
      v.sid = sessionStorage.getItem('mh-visit') || ''; if (!v.sid) { v.sid = rid(); sessionStorage.setItem('mh-visit', v.sid); v.first = true; }
      v.vid = localStorage.getItem('mh-visitor') || ''; if (!v.vid) { v.vid = rid(); localStorage.setItem('mh-visitor', v.vid); v.nv = true; }
    } catch (e) { v.sid = v.sid || rid(); v.vid = v.vid || rid(); }
    return v;
  })();
  function visit(type, item) {
    if (PREVIEW) return;
    try {
      var slug = /[?&]slug=([a-z0-9-]+)/.exec(location.search);
      var body = { sid: VISIT.sid, vid: VISIT.vid, nv: VISIT.nv, type: type, path: location.pathname + (slug ? '?slug=' + slug[1] : ''), item: item || '' };
      if (type === 'page_view' && VISIT.first) { body.ref = document.referrer || ''; body.utm = (/[?&]utm_source=([^&]+)/.exec(location.search) || [])[1] || ''; }
      var data = JSON.stringify(body);
      if (navigator.sendBeacon) navigator.sendBeacon('/api/track', new Blob([data], { type: 'text/plain' }));
      else fetch('/api/track', { method: 'POST', body: data, keepalive: true }).catch(function () {});
    } catch (e) { /* never break the shop */ }
  }
  visit('page_view');
  function gaItem(p, qty) { return { item_id: p.slug, item_name: p.name, item_category: p.category, item_variant: p.colour || undefined, price: (p.price_cents || 0) / 100, quantity: qty || 1 }; }
  if (/visualiser/.test(location.pathname)) track('try_in_your_room_open');
  var IMG = window.MH_IMAGES || {};
  IMG['statement-curve-mirror-gold'] = IMG['statement-curve-mirror-gold'] || 'images/signature-gold.jpg';
  IMG['statement-curve-mirror-black'] = IMG['statement-curve-mirror-black'] || 'images/signature-black.jpg';
  ['concrete', 'black'].forEach(function (c) { var k = 'monolith-arch-mirror-' + c; IMG[k] = IMG[k] || 'images/products/' + k + '.jpg'; });
  IMG['gatsby-arch-mirror-black'] = IMG['gatsby-arch-mirror-black'] || 'images/products/gatsby-arch-mirror-black-2.jpg';
  IMG['duchess-arch-mirror-black'] = IMG['duchess-arch-mirror-black'] || 'images/products/duchess-arch-mirror-black.jpg';
  IMG['wavy-edge-wall-mirror'] = IMG['wavy-edge-wall-mirror'] || 'images/products/wavy-edge-wall-mirror.jpg';
  // Extra photos shown as thumbnails on the product page and quick view.
  var GALLERY = {
    'wavy-edge-wall-mirror': [['images/products/wavy-edge-wall-mirror.jpg', 'Hung vertically in a living room'], ['images/products/wavy-edge-wall-mirror-horizontal.jpg', 'Hung horizontally above a sideboard'], ['images/products/wavy-edge-wall-mirror-leaned.jpg', 'Leaned against a bedroom wall'], ['images/products/wavy-edge-wall-mirror-hallway.jpg', 'Hung in a hallway']],
    'statement-curve-mirror-gold': [['images/signature-gold.jpg', 'Single gold mirror'], ['images/signature-gold-pair.jpg', 'A pair hung side by side']],
    'statement-curve-mirror-black': [['images/signature-black.jpg', 'Single black mirror'], ['images/signature-black-pair.jpg', 'A pair hung side by side']]
  };
  IMG['studio-box-mirror-black'] = IMG['studio-box-mirror-black'] || 'images/products/studio-box-mirror-black-2.jpg';
  ['black', 'walnut', 'natural-oak'].forEach(function (c) { var k = 'studio-box-mirror-' + c; IMG[k] = IMG[k] || 'images/products/' + k + '.jpg'; });

  IMG['belgravia-crest-mirror-gold'] = IMG['belgravia-crest-mirror-gold'] || 'images/products/belgravia-crest-mirror-gold-2.jpg';
  GALLERY['belgravia-crest-mirror-gold'] = [['images/products/belgravia-crest-mirror-gold-2.jpg', 'The Gold Belgravia'], ['images/products/belgravia-crest-mirror-trio.jpg', 'Gold, Champagne and Black side by side']];
  IMG['belgravia-crest-mirror-champagne'] = IMG['belgravia-crest-mirror-champagne'] || 'images/products/belgravia-crest-mirror-champagne-2.jpg';
  GALLERY['belgravia-crest-mirror-champagne'] = [['images/products/belgravia-crest-mirror-champagne-2.jpg', 'The Champagne Belgravia'], ['images/products/belgravia-crest-mirror-trio.jpg', 'Gold, Champagne and Black side by side']];
  IMG['belgravia-crest-mirror-black'] = IMG['belgravia-crest-mirror-black'] || 'images/products/belgravia-crest-mirror-black-2.jpg';
  GALLERY['belgravia-crest-mirror-black'] = [['images/products/belgravia-crest-mirror-black-2.jpg', 'The Black Belgravia'], ['images/products/belgravia-crest-mirror-trio.jpg', 'Gold, Champagne and Black side by side']];
  IMG['cathedral-arch-window-mirror-black'] = IMG['cathedral-arch-window-mirror-black'] || 'images/products/cathedral-arch-window-mirror-black-styled.jpg';
  GALLERY['cathedral-arch-window-mirror-black'] = [["images/products/cathedral-arch-window-mirror-black-styled.jpg", "Styled in a bright living room"], ["images/products/cathedral-arch-window-mirror-black-2.jpg", "Leaning in a real living room"], ["images/products/cathedral-arch-window-mirror-black-arch.jpg", "The arched top with its inner arch and window panes"], ["images/products/cathedral-arch-window-mirror-black-detail.jpg", "Close-up of the slim black metal frame"], ["images/products/cathedral-arch-window-mirror-black-back.jpg", "Wall hooks on the back for hanging"]];
  IMG['soho-slim-frame-mirror-black'] = IMG['soho-slim-frame-mirror-black'] || 'images/products/soho-slim-frame-mirror-black.jpg';
  GALLERY['soho-slim-frame-mirror-black'] = [["images/products/soho-slim-frame-mirror-black.jpg", "Leaning in a living room"], ["images/products/soho-slim-frame-mirror-black-detail.jpg", "Close-up of the slim mitred corner"]];
  IMG['riviera-rounded-floor-mirror-gold'] = IMG['riviera-rounded-floor-mirror-gold'] || 'images/products/riviera-rounded-floor-mirror-gold.jpg';
  GALLERY['riviera-rounded-floor-mirror-gold'] = [["images/products/riviera-rounded-floor-mirror-gold.jpg", "Leaning in a living room"], ["images/products/riviera-rounded-floor-mirror-gold-back.jpg", "D-ring hanger on the back for hanging"]];
  IMG['belle-beaded-mirror-silver'] = IMG['belle-beaded-mirror-silver'] || 'images/products/belle-beaded-mirror-silver.jpg';
  GALLERY['belle-beaded-mirror-silver'] = [["images/products/belle-beaded-mirror-silver.jpg", "Leaning in a living room"], ["images/products/belle-beaded-mirror-colours.jpg", "Gold, Black and Silver beading side by side"]];
  IMG['belle-beaded-mirror-black'] = IMG['belle-beaded-mirror-black'] || 'images/products/belle-beaded-mirror-black.jpg';
  GALLERY['belle-beaded-mirror-black'] = [["images/products/belle-beaded-mirror-black.jpg", "Leaning in a living room"], ["images/products/belle-beaded-mirror-colours.jpg", "Gold, Black and Silver beading side by side"]];
  IMG['belle-beaded-mirror-gold'] = IMG['belle-beaded-mirror-gold'] || 'images/products/belle-beaded-mirror-gold.jpg';
  GALLERY['belle-beaded-mirror-gold'] = [["images/products/belle-beaded-mirror-gold.jpg", "Leaning in a living room"], ["images/products/belle-beaded-mirror-colours.jpg", "Gold, Black and Silver beading side by side"]];
  IMG['haven-soft-arch-mirror-warm-wood'] = IMG['haven-soft-arch-mirror-warm-wood'] || 'images/products/haven-soft-arch-mirror-warm-wood.jpg';
  GALLERY['haven-soft-arch-mirror-warm-wood'] = [["images/products/haven-soft-arch-mirror-warm-wood.jpg", "Leaning in a living room"], ["images/products/haven-soft-arch-mirror-detail.jpg", "Close-up of the soft, rounded frame (Natural shown)"], ["images/products/haven-soft-arch-mirror-back.jpg", "Wall hangers on the back (Natural shown)"]];
  IMG['haven-soft-arch-mirror-walnut'] = IMG['haven-soft-arch-mirror-walnut'] || 'images/products/haven-soft-arch-mirror-walnut.jpg';
  GALLERY['haven-soft-arch-mirror-walnut'] = [["images/products/haven-soft-arch-mirror-walnut.jpg", "Leaning in a living room"], ["images/products/haven-soft-arch-mirror-detail.jpg", "Close-up of the soft, rounded frame (Natural shown)"], ["images/products/haven-soft-arch-mirror-back.jpg", "Wall hangers on the back (Natural shown)"]];
  IMG['haven-soft-arch-mirror-black'] = IMG['haven-soft-arch-mirror-black'] || 'images/products/haven-soft-arch-mirror-black.jpg';
  GALLERY['haven-soft-arch-mirror-black'] = [["images/products/haven-soft-arch-mirror-black.jpg", "Leaning in a living room"], ["images/products/haven-soft-arch-mirror-detail.jpg", "Close-up of the soft, rounded frame (Natural shown)"], ["images/products/haven-soft-arch-mirror-back.jpg", "Wall hangers on the back (Natural shown)"]];
  IMG['haven-soft-arch-mirror-natural'] = IMG['haven-soft-arch-mirror-natural'] || 'images/products/haven-soft-arch-mirror-natural.jpg';
  GALLERY['haven-soft-arch-mirror-natural'] = [["images/products/haven-soft-arch-mirror-natural.jpg", "Leaning in a living room"], ["images/products/haven-soft-arch-mirror-detail.jpg", "Close-up of the soft, rounded frame (Natural shown)"], ["images/products/haven-soft-arch-mirror-back.jpg", "Wall hangers on the back (Natural shown)"]];
  IMG['haven-soft-arch-mirror-white'] = IMG['haven-soft-arch-mirror-white'] || 'images/products/haven-soft-arch-mirror-white.jpg';
  GALLERY['haven-soft-arch-mirror-white'] = [["images/products/haven-soft-arch-mirror-white.jpg", "Leaning in a living room"], ["images/products/haven-soft-arch-mirror-detail.jpg", "Close-up of the soft, rounded frame (Natural shown)"], ["images/products/haven-soft-arch-mirror-back.jpg", "Wall hangers on the back (Natural shown)"]];
  IMG['cut-above-knife-mirror-black'] = IMG['cut-above-knife-mirror-black'] || 'images/products/cut-above-knife-mirror-black.jpg';
  GALLERY['cut-above-knife-mirror-black'] = [["images/products/cut-above-knife-mirror-black.jpg", "Freestanding in a modern kitchen"], ["images/products/cut-above-knife-mirror-black-venue.jpg", "Mounted on a restaurant feature wall"]];
  IMG['paris-window-pane-mirror-white'] = IMG['paris-window-pane-mirror-white'] || 'images/products/paris-window-pane-mirror-white.jpg';
  GALLERY['paris-window-pane-mirror-white'] = [["images/products/paris-window-pane-mirror-white.jpg", "The White Paris mirror"], ["images/products/paris-window-pane-mirror-pair.jpg", "Black and White side by side"]];
  IMG['paris-window-pane-mirror-black'] = IMG['paris-window-pane-mirror-black'] || 'images/products/paris-window-pane-mirror-black.jpg';
  GALLERY['paris-window-pane-mirror-black'] = [["images/products/paris-window-pane-mirror-black.jpg", "The Black Paris mirror"], ["images/products/paris-window-pane-mirror-pair.jpg", "Black and White side by side"]];
  IMG['luxe-ornate-arch-mirror-gold'] = IMG['luxe-ornate-arch-mirror-gold'] || 'images/products/luxe-ornate-arch-mirror-gold.jpg';
  IMG['halo-arch-floor-mirror-white'] = IMG['halo-arch-floor-mirror-white'] || 'images/products/halo-arch-floor-mirror-white.jpg';
  GALLERY['halo-arch-floor-mirror-white'] = [['images/products/halo-arch-floor-mirror-white.jpg', 'The full arched mirror'], ['images/products/halo-arch-floor-mirror-white-detail.jpg', 'Close-up of the slim arch']];
  IMG['halo-arch-floor-mirror-gold'] = IMG['halo-arch-floor-mirror-gold'] || 'images/products/halo-arch-floor-mirror-gold.jpg';
  GALLERY['halo-arch-floor-mirror-gold'] = [['images/products/halo-arch-floor-mirror-gold.jpg', 'The full arched mirror'], ['images/products/halo-arch-floor-mirror-gold-detail.jpg', 'Close-up of the slim arch']];
  IMG['halo-arch-floor-mirror-black'] = IMG['halo-arch-floor-mirror-black'] || 'images/products/halo-arch-floor-mirror-black.jpg';
  GALLERY['halo-arch-floor-mirror-black'] = [['images/products/halo-arch-floor-mirror-black.jpg', 'The full arched mirror'], ['images/products/halo-arch-floor-mirror-black-detail.jpg', 'Close-up of the slim arch']];
  IMG['halo-arch-floor-mirror-210-white'] = IMG['halo-arch-floor-mirror-210-white'] || 'images/products/halo-arch-floor-mirror-white.jpg';
  GALLERY['halo-arch-floor-mirror-210-white'] = [['images/products/halo-arch-floor-mirror-white.jpg', 'The full arched mirror'], ['images/products/halo-arch-floor-mirror-white-detail.jpg', 'Close-up of the slim arch']];
  IMG['halo-arch-floor-mirror-210-gold'] = IMG['halo-arch-floor-mirror-210-gold'] || 'images/products/halo-arch-floor-mirror-gold.jpg';
  GALLERY['halo-arch-floor-mirror-210-gold'] = [['images/products/halo-arch-floor-mirror-gold.jpg', 'The full arched mirror'], ['images/products/halo-arch-floor-mirror-gold-detail.jpg', 'Close-up of the slim arch']];
  IMG['halo-arch-floor-mirror-210-black'] = IMG['halo-arch-floor-mirror-210-black'] || 'images/products/halo-arch-floor-mirror-black.jpg';
  GALLERY['halo-arch-floor-mirror-210-black'] = [['images/products/halo-arch-floor-mirror-black.jpg', 'The full arched mirror'], ['images/products/halo-arch-floor-mirror-black-detail.jpg', 'Close-up of the slim arch']];
  IMG['halo-arch-floor-mirror-200-white'] = IMG['halo-arch-floor-mirror-200-white'] || 'images/products/halo-arch-floor-mirror-white.jpg';
  GALLERY['halo-arch-floor-mirror-200-white'] = [['images/products/halo-arch-floor-mirror-white.jpg', 'The full arched mirror'], ['images/products/halo-arch-floor-mirror-white-detail.jpg', 'Close-up of the slim arch']];
  IMG['halo-arch-floor-mirror-200-gold'] = IMG['halo-arch-floor-mirror-200-gold'] || 'images/products/halo-arch-floor-mirror-gold.jpg';
  GALLERY['halo-arch-floor-mirror-200-gold'] = [['images/products/halo-arch-floor-mirror-gold.jpg', 'The full arched mirror'], ['images/products/halo-arch-floor-mirror-gold-detail.jpg', 'Close-up of the slim arch']];
  IMG['halo-arch-floor-mirror-200-black'] = IMG['halo-arch-floor-mirror-200-black'] || 'images/products/halo-arch-floor-mirror-black.jpg';
  GALLERY['halo-arch-floor-mirror-200-black'] = [['images/products/halo-arch-floor-mirror-black.jpg', 'The full arched mirror'], ['images/products/halo-arch-floor-mirror-black-detail.jpg', 'Close-up of the slim arch']];
  IMG['florence-window-arch-mirror-black'] = IMG['florence-window-arch-mirror-black'] || 'images/products/florence-window-arch-mirror-black.jpg';
  IMG['versailles-ornate-mirror-190-gold'] = 'images/products/versailles-ornate-mirror-gold.jpg';
  IMG['versailles-ornate-mirror-190-black'] = 'images/products/versailles-ornate-mirror-black-2.jpg';
  IMG['versailles-ornate-mirror-190-champagne'] = 'images/products/versailles-ornate-mirror-champagne-2.jpg';
  IMG['versailles-ornate-mirror-gold'] = IMG['versailles-ornate-mirror-gold'] || 'images/products/versailles-ornate-mirror-gold.jpg';
  IMG['versailles-ornate-mirror-black'] = IMG['versailles-ornate-mirror-black'] || 'images/products/versailles-ornate-mirror-black-2.jpg';
  IMG['versailles-ornate-mirror-champagne'] = IMG['versailles-ornate-mirror-champagne'] || 'images/products/versailles-ornate-mirror-champagne-2.jpg';
  // Shop copy and imagery per product. Prices and stock come from the database when available.
  var CATALOGUE = [
    {
      slug: 'paris-window-pane-mirror-white', name: 'Paris Window Pane Mirror – White',
      category: 'Floor Mirrors', price_cents: 30000, badge: 'New',
      group: 'paris', groupName: 'Paris Window Pane Mirror', colour: 'White', swatch: '#F2EFEA',
      desc: "Bring the charm of a Parisian window into your home. The Paris is a 2-metre full-length mirror with a crisp white frame divided into 24 classic window panes, framing your room like a sunlit view. Fresh and coastal, it adds light, depth and character to living rooms, bedrooms and entryways. Hang it on the wall or lean it against it.",
      specs: ["200 cm high × 100 cm wide", "Window-pane design with a crisp white frame", "Hang on the wall or lean against it", "Also available in Black", "Ships in a heavy-duty cardboard box with protective foam"]
    },
    {
      slug: 'paris-window-pane-mirror-black', name: 'Paris Window Pane Mirror – Black',
      category: 'Floor Mirrors', price_cents: 30000, badge: 'New',
      group: 'paris', groupName: 'Paris Window Pane Mirror', colour: 'Black', swatch: '#1A1A1A',
      desc: "Bring the charm of a Parisian window into your home. The Paris is a 2-metre full-length mirror with a classic black frame divided into 24 classic window panes, framing your room like a sunlit view. Bold and architectural, it adds light, depth and character to living rooms, bedrooms and entryways. Hang it on the wall or lean it against it.",
      specs: ["200 cm high × 100 cm wide", "Window-pane design with a classic black frame", "Hang on the wall or lean against it", "Also available in White", "Ships in a heavy-duty cardboard box with protective foam"]
    },
    {
      slug: 'cut-above-knife-mirror-black', name: 'Cut Above Knife Mirror – Black',
      category: 'Wall Mirrors', price_cents: 25000, badge: 'New',
      desc: "A cut above the rest. Shaped like an oversized chef's knife, this 2-metre statement mirror pairs a sleek black handle, complete with polished rivet details, with a mirrored blade that reflects the room around it. Mount it on a feature wall or stand it freestanding, and watch it become the talking point of any restaurant, bar, café or modern home. Make your space stand out with a designer piece nobody will forget.",
      specs: ["200 cm high × 40 cm wide", "Unique knife-shaped design", "Stylish black finish with rivet details on the handle", "Mount on the wall or use freestanding", "Perfect for restaurants and bars, cafés and commercial fit-outs, feature walls, modern homes and entertainment areas", "Ships in a heavy-duty cardboard box with protective foam"]
    },
    {
      slug: 'belle-beaded-mirror-silver', name: 'Belle Beaded Mirror – Silver',
      category: 'Floor Mirrors', price_cents: 24000, badge: 'New',
      group: 'belle', groupName: 'Belle Beaded Mirror', colour: 'Silver', swatch: '#C8C8C6',
      desc: "Light-catching glamour from every angle. The Belle is a 190 cm full-length mirror framed by a wide border of bevelled mirror panels, edged inside and out with rows of polished silver beading. Mirror on mirror bounces light around the room for a look that's fresh, bright and endlessly versatile, perfect for bedrooms, dressing rooms, living rooms and entryways. Hang it on the wall or lean it against it.",
      specs: ["190 cm high × 90 cm wide", "Bevelled mirror border with polished silver beaded trim", "Hang on the wall or lean against it", "Full-length statement mirror", "Also available in Black and Gold", "Ships in a heavy-duty cardboard box with protective foam"]
    },
    {
      slug: 'belle-beaded-mirror-black', name: 'Belle Beaded Mirror – Black',
      category: 'Floor Mirrors', price_cents: 24000, badge: 'New',
      group: 'belle', groupName: 'Belle Beaded Mirror', colour: 'Black', swatch: '#1A1A1A',
      desc: "Light-catching glamour from every angle. The Belle is a 190 cm full-length mirror framed by a wide border of bevelled mirror panels, edged inside and out with rows of glossy black beading. Mirror on mirror bounces light around the room for a look that's bold, crisp and modern, perfect for bedrooms, dressing rooms, living rooms and entryways. Hang it on the wall or lean it against it.",
      specs: ["190 cm high × 90 cm wide", "Bevelled mirror border with glossy black beaded trim", "Hang on the wall or lean against it", "Full-length statement mirror", "Also available in Silver and Gold", "Ships in a heavy-duty cardboard box with protective foam"]
    },
    {
      slug: 'belle-beaded-mirror-gold', name: 'Belle Beaded Mirror – Gold',
      category: 'Floor Mirrors', price_cents: 24000, badge: 'New',
      group: 'belle', groupName: 'Belle Beaded Mirror', colour: 'Gold', swatch: '#C9A24E',
      desc: "Light-catching glamour from every angle. The Belle is a 190 cm full-length mirror framed by a wide border of bevelled mirror panels, edged inside and out with rows of warm gold beading. Mirror on mirror bounces light around the room for a look that's warm, glamorous and luxe, perfect for bedrooms, dressing rooms, living rooms and entryways. Hang it on the wall or lean it against it.",
      specs: ["190 cm high × 90 cm wide", "Bevelled mirror border with warm gold beaded trim", "Hang on the wall or lean against it", "Full-length statement mirror", "Also available in Silver and Black", "Ships in a heavy-duty cardboard box with protective foam"]
    },
    {
      slug: 'haven-soft-arch-mirror-warm-wood', name: 'Haven Soft Arch Mirror – Warm Wood',
      category: 'Floor Mirrors', price_cents: 30000, badge: 'New',
      group: 'haven', groupName: 'Haven Soft Arch Mirror', colour: 'Warm Wood', swatch: '#C68A4A',
      desc: "Soft, sculptural and beautifully simple. The Haven is a 190 cm arched floor mirror with a thick, rounded frame in a warm honey-toned wood that curves gently around every edge, from the arched top to the softly rounded base. Warm and inviting, it brings light and a relaxed, modern feel to bedrooms, living rooms and entryways. Lean it against the wall, or hang it using the sturdy hangers on the back.",
      specs: ["190 cm high × 100 cm wide", "Thick, rounded frame in warm honey-toned wood", "Arched top with softly rounded base corners", "Hang on the wall (hangers on the back) or lean against it", "Also available in Dark Brown, Black, Natural and White", "Ships in a heavy-duty cardboard box with protective foam"]
    },
    {
      slug: 'haven-soft-arch-mirror-walnut', name: 'Haven Soft Arch Mirror – Dark Brown',
      category: 'Floor Mirrors', price_cents: 30000, badge: 'New',
      group: 'haven', groupName: 'Haven Soft Arch Mirror', colour: 'Dark Brown', swatch: '#5A3A22',
      desc: "Soft, sculptural and beautifully simple. The Haven is a 190 cm arched floor mirror with a thick, rounded frame in a rich dark brown that curves gently around every edge, from the arched top to the softly rounded base. Warm and grounded, it brings light and a relaxed, modern feel to bedrooms, living rooms and entryways. Lean it against the wall, or hang it using the sturdy hangers on the back.",
      specs: ["190 cm high × 100 cm wide", "Thick, rounded frame in rich dark brown", "Arched top with softly rounded base corners", "Hang on the wall (hangers on the back) or lean against it", "Also available in Warm Wood, Black, Natural and White", "Ships in a heavy-duty cardboard box with protective foam"]
    },
    {
      slug: 'haven-soft-arch-mirror-black', name: 'Haven Soft Arch Mirror – Black',
      category: 'Floor Mirrors', price_cents: 30000, badge: 'New',
      group: 'haven', groupName: 'Haven Soft Arch Mirror', colour: 'Black', swatch: '#1A1A1A',
      desc: "Soft, sculptural and beautifully simple. The Haven is a 190 cm arched floor mirror with a thick, rounded frame in a deep black finish that curves gently around every edge, from the arched top to the softly rounded base. Bold and modern, it brings light and a relaxed, modern feel to bedrooms, living rooms and entryways. Lean it against the wall, or hang it using the sturdy hangers on the back.",
      specs: ["190 cm high × 100 cm wide", "Thick, rounded frame in deep black finish", "Arched top with softly rounded base corners", "Hang on the wall (hangers on the back) or lean against it", "Also available in Warm Wood, Dark Brown, Natural and White", "Ships in a heavy-duty cardboard box with protective foam"]
    },
    {
      slug: 'haven-soft-arch-mirror-natural', name: 'Haven Soft Arch Mirror – Natural',
      category: 'Floor Mirrors', price_cents: 30000, badge: 'New',
      group: 'haven', groupName: 'Haven Soft Arch Mirror', colour: 'Natural', swatch: '#D7B98E',
      desc: "Soft, sculptural and beautifully simple. The Haven is a 190 cm arched floor mirror with a thick, rounded frame in a light natural timber that curves gently around every edge, from the arched top to the softly rounded base. Calm and organic, it brings light and a relaxed, modern feel to bedrooms, living rooms and entryways. Lean it against the wall, or hang it using the sturdy hangers on the back.",
      specs: ["190 cm high × 100 cm wide", "Thick, rounded frame in light natural timber", "Arched top with softly rounded base corners", "Hang on the wall (hangers on the back) or lean against it", "Also available in Warm Wood, Dark Brown, Black and White", "Ships in a heavy-duty cardboard box with protective foam"]
    },
    {
      slug: 'haven-soft-arch-mirror-white', name: 'Haven Soft Arch Mirror – White',
      category: 'Floor Mirrors', price_cents: 30000, badge: 'New',
      group: 'haven', groupName: 'Haven Soft Arch Mirror', colour: 'White', swatch: '#F2EFEA',
      desc: "Soft, sculptural and beautifully simple. The Haven is a 190 cm arched floor mirror with a thick, rounded frame in a soft white finish that curves gently around every edge, from the arched top to the softly rounded base. Bright, fresh and airy, it brings light and a relaxed, modern feel to bedrooms, living rooms and entryways. Lean it against the wall, or hang it using the sturdy hangers on the back.",
      specs: ["190 cm high × 100 cm wide", "Thick, rounded frame in soft white finish", "Arched top with softly rounded base corners", "Hang on the wall (hangers on the back) or lean against it", "Also available in Warm Wood, Dark Brown, Black and Natural", "Ships in a heavy-duty cardboard box with protective foam"]
    },
    {
      slug: 'riviera-rounded-floor-mirror-gold', name: 'Riviera Rounded Floor Mirror – Gold',
      category: 'Floor Mirrors', price_cents: 33000, badge: '', in_stock: 0, // sold out: still shown, can't be bought
      desc: "Soft curves meet golden glamour. The Riviera is a 200 cm full-length floor mirror in a slim gold metal frame with gently rounded corners, bringing warmth, light and an elegant, modern-luxe feel to any room. Perfect for bedrooms, living rooms, dressing rooms and entryways. Lean it against the wall, or hang it using the sturdy D-ring hangers on the back.",
      specs: ["200 cm high × 100 cm wide", "Slim gold metal frame with softly rounded corners", "Hang on the wall (D-ring hangers on the back) or lean against it", "Full-length floor mirror", "Ships in a heavy-duty cardboard box with protective foam"]
    },
    {
      slug: 'soho-slim-frame-mirror-black', name: 'Soho Slim Frame Mirror – Black',
      category: 'Floor Mirrors', price_cents: 25000, badge: 'New',
      desc: "Clean, modern and effortlessly versatile. The Soho is a 190 cm full-length mirror in a slim black metal frame with crisp, mitred corners, letting the reflection take centre stage. It brightens and opens up bedrooms, living rooms, hallways and entryways, and suits everything from minimalist to Hamptons interiors. Hang it on the wall or lean it against it.",
      specs: ["190 cm high × 90 cm wide", "Slim black metal frame with mitred corners", "Hang on the wall or lean against it", "Full-length rectangle mirror", "Ships in a heavy-duty cardboard box with protective foam"]
    },
    {
      slug: 'cathedral-arch-window-mirror-black', name: 'Cathedral Arch Window Mirror – Black',
      category: 'Floor Mirrors', price_cents: 30000, badge: 'New',
      desc: "Step into timeless architecture with the Cathedral. A slim black metal frame traces a graceful arch, with a second arch set inside and fine window-pane bars fanning out above, like light through an old cathedral window. At 190 cm high and 100 cm wide, it brings height, light and character to living rooms, bedrooms and entryways. Lean it against the wall, or hang it using the sturdy wall hooks on the back.",
      specs: ["190 cm high × 100 cm wide", "Black metal frame with an inner arch and window-pane design", "Hang on the wall (wall hooks on the back) or lean against it", "Perfect for living rooms, bedrooms and entryways", "Ships in a heavy-duty cardboard box with protective foam"]
    },
    {
      slug: 'belgravia-crest-mirror-gold', name: 'Belgravia Crest Mirror – Gold',
      category: 'Floor Mirrors', price_cents: 59900, badge: 'New',
      group: 'belgravia', groupName: 'Belgravia Crest Mirror', colour: 'Gold', swatch: '#C9A24E',
      desc: "Grand, romantic and made to be noticed. The Belgravia is a 210 cm full-length mirror in a rich antique-gold frame, crowned with an ornate carved crest and finished with scrolled corner details and a fine beaded border. An inner panelled frame adds depth and old-world craftsmanship, making it a stunning focal point for living rooms, bedrooms, dressing rooms and grand entryways.",
      specs: ["210 cm high × 120 cm wide", "Ornate frame with a carved crest, scrolled corners and a beaded border", "Inner panelled frame for added depth", "Full-length statement mirror", "Also available in Champagne and Black", "Ships in a heavy-duty cardboard box with protective foam"]
    },
    {
      slug: 'belgravia-crest-mirror-champagne', name: 'Belgravia Crest Mirror – Champagne',
      category: 'Floor Mirrors', price_cents: 59900, badge: 'New',
      group: 'belgravia', groupName: 'Belgravia Crest Mirror', colour: 'Champagne', swatch: '#CDB68C',
      desc: "Grand, romantic and made to be noticed. The Belgravia is a 210 cm full-length mirror in a soft champagne frame, crowned with an ornate carved crest and finished with scrolled corner details and a fine beaded border. An inner panelled frame adds depth and old-world craftsmanship, bringing quiet luxury to living rooms, bedrooms, dressing rooms and grand entryways.",
      specs: ["210 cm high × 120 cm wide", "Ornate frame with a carved crest, scrolled corners and a beaded border", "Inner panelled frame for added depth", "Full-length statement mirror", "Also available in Gold and Black, and in 190 × 90 cm", "Ships in a heavy-duty cardboard box with protective foam"]
    },
    {
      slug: 'belgravia-crest-mirror-black', name: 'Belgravia Crest Mirror – Black',
      category: 'Floor Mirrors', price_cents: 59900, badge: 'New',
      group: 'belgravia', groupName: 'Belgravia Crest Mirror', colour: 'Black', swatch: '#1A1A1A',
      desc: "Grand, romantic and made to be noticed. The Belgravia is a 210 cm full-length mirror in a deep black frame, crowned with an ornate carved crest and finished with scrolled corner details and a fine beaded border. An inner panelled frame adds depth and old-world craftsmanship, giving a dramatic, modern edge to living rooms, bedrooms, dressing rooms and grand entryways.",
      specs: ["210 cm high × 120 cm wide", "Ornate frame with a carved crest, scrolled corners and a beaded border", "Inner panelled frame for added depth", "Full-length statement mirror", "Also available in Gold and Champagne, and in 190 × 90 cm", "Ships in a heavy-duty cardboard box with protective foam"]
    },
    {
      slug: 'luxe-ornate-arch-mirror-gold', name: 'Luxe Ornate Arch Mirror – Gold',
      category: 'Floor Mirrors', price_cents: 45000, badge: 'New',
      desc: "Pure old-world glamour. The Luxe is a full-length statement mirror with a gleaming gold arched frame, finished with a hand-detailed carved crest and ornate scrolled feet. At 200 cm high and a generous 128 cm wide, it fills a room with light and luxury, creating a breathtaking focal point in living rooms, bedrooms, dressing rooms and grand entryways.",
      specs: ["200 cm high × 128 cm wide", "Gold arched frame with a carved crest and ornate scrolled feet", "Full-length statement floor mirror", "Ships in a heavy-duty cardboard box with protective foam"]
    },
    {
      slug: 'halo-arch-floor-mirror-white', name: 'Halo Arch Floor Mirror 220 × 120 cm – White',
      category: 'Floor Mirrors', price_cents: 42000, badge: 'New',
      group: 'halo-210', groupName: 'Halo Arch Floor Mirror', colour: 'White', swatch: '#F4F1EC',
      desc: "Modern, elegant and timeless, the Halo is a generous 220 cm arched floor mirror in a slim white frame that suits any interior. Premium mirror glass gives a clear, bright reflection, bringing light and a sense of space to bedrooms, living rooms, entryways, salons and more. Hang it on the wall or lean it against it.",
      specs: ["220 cm high × 120 cm wide", "Premium mirror glass for a clear reflection", "Stylish slim white frame that suits any interior", "Hang on the wall or lean against it", "Also available in Gold and Black, and in 210 × 120 cm and 200 × 100 cm", "Perfect for bedrooms, living rooms, entryways, salons and more", "Ships in a heavy-duty cardboard box with protective foam"]
    },
    {
      slug: 'halo-arch-floor-mirror-gold', name: 'Halo Arch Floor Mirror 220 × 120 cm – Gold',
      category: 'Floor Mirrors', price_cents: 42000, badge: 'New',
      group: 'halo-210', groupName: 'Halo Arch Floor Mirror', colour: 'Gold', swatch: '#C9A24E',
      desc: "Modern, elegant and timeless, the Halo is a generous 220 cm arched floor mirror in a slim gold frame that suits any interior. Premium mirror glass gives a clear, bright reflection, bringing light and a sense of space to bedrooms, living rooms, entryways, salons and more. Hang it on the wall or lean it against it.",
      specs: ["220 cm high × 120 cm wide", "Premium mirror glass for a clear reflection", "Stylish slim gold frame that suits any interior", "Hang on the wall or lean against it", "Also available in White and Black, and in 210 × 120 cm and 200 × 100 cm", "Perfect for bedrooms, living rooms, entryways, salons and more", "Ships in a heavy-duty cardboard box with protective foam"]
    },
    {
      slug: 'halo-arch-floor-mirror-black', name: 'Halo Arch Floor Mirror 220 × 120 cm – Black',
      category: 'Floor Mirrors', price_cents: 42000, badge: 'New',
      group: 'halo-210', groupName: 'Halo Arch Floor Mirror', colour: 'Black', swatch: '#1A1A1A',
      desc: "Modern, elegant and timeless, the Halo is a generous 220 cm arched floor mirror in a slim black frame that suits any interior. Premium mirror glass gives a clear, bright reflection, bringing light and a sense of space to bedrooms, living rooms, entryways, salons and more. Hang it on the wall or lean it against it.",
      specs: ["220 cm high × 120 cm wide", "Premium mirror glass for a clear reflection", "Stylish slim black frame that suits any interior", "Hang on the wall or lean against it", "Also available in White and Gold, and in 210 × 120 cm and 200 × 100 cm", "Perfect for bedrooms, living rooms, entryways, salons and more", "Ships in a heavy-duty cardboard box with protective foam"]
    },
    {
      slug: 'halo-arch-floor-mirror-210-white', name: 'Halo Arch Floor Mirror 210 × 120 cm – White',
      category: 'Floor Mirrors', price_cents: 38000, badge: 'New',
      group: 'halo-210m', groupName: 'Halo Arch Floor Mirror', colour: 'White', swatch: '#F4F1EC',
      desc: "Modern, elegant and timeless, the Halo is a generous 210 cm arched floor mirror in a slim white frame that suits any interior. Premium mirror glass gives a clear, bright reflection, bringing light and a sense of space to bedrooms, living rooms, entryways, salons and more. Hang it on the wall or lean it against it.",
      specs: ["210 cm high × 120 cm wide", "Premium mirror glass for a clear reflection", "Stylish slim white frame that suits any interior", "Hang on the wall or lean against it", "Also available in Gold and Black, and in 220 × 120 cm and 200 × 100 cm", "Perfect for bedrooms, living rooms, entryways, salons and more", "Ships in a heavy-duty cardboard box with protective foam"]
    },
    {
      slug: 'halo-arch-floor-mirror-210-gold', name: 'Halo Arch Floor Mirror 210 × 120 cm – Gold',
      category: 'Floor Mirrors', price_cents: 38000, badge: 'New',
      group: 'halo-210m', groupName: 'Halo Arch Floor Mirror', colour: 'Gold', swatch: '#C9A24E',
      desc: "Modern, elegant and timeless, the Halo is a generous 210 cm arched floor mirror in a slim gold frame that suits any interior. Premium mirror glass gives a clear, bright reflection, bringing light and a sense of space to bedrooms, living rooms, entryways, salons and more. Hang it on the wall or lean it against it.",
      specs: ["210 cm high × 120 cm wide", "Premium mirror glass for a clear reflection", "Stylish slim gold frame that suits any interior", "Hang on the wall or lean against it", "Also available in White and Black, and in 220 × 120 cm and 200 × 100 cm", "Perfect for bedrooms, living rooms, entryways, salons and more", "Ships in a heavy-duty cardboard box with protective foam"]
    },
    {
      slug: 'halo-arch-floor-mirror-210-black', name: 'Halo Arch Floor Mirror 210 × 120 cm – Black',
      category: 'Floor Mirrors', price_cents: 38000, badge: 'New',
      group: 'halo-210m', groupName: 'Halo Arch Floor Mirror', colour: 'Black', swatch: '#1A1A1A',
      desc: "Modern, elegant and timeless, the Halo is a generous 210 cm arched floor mirror in a slim black frame that suits any interior. Premium mirror glass gives a clear, bright reflection, bringing light and a sense of space to bedrooms, living rooms, entryways, salons and more. Hang it on the wall or lean it against it.",
      specs: ["210 cm high × 120 cm wide", "Premium mirror glass for a clear reflection", "Stylish slim black frame that suits any interior", "Hang on the wall or lean against it", "Also available in White and Gold, and in 220 × 120 cm and 200 × 100 cm", "Perfect for bedrooms, living rooms, entryways, salons and more", "Ships in a heavy-duty cardboard box with protective foam"]
    },
    {
      slug: 'halo-arch-floor-mirror-200-white', name: 'Halo Arch Floor Mirror 200 × 100 cm – White',
      category: 'Floor Mirrors', price_cents: 33000, badge: 'New',
      group: 'halo-200', groupName: 'Halo Arch Floor Mirror', colour: 'White', swatch: '#F4F1EC',
      desc: "Modern, elegant and timeless, the Halo is a 200 cm arched floor mirror in a slim white frame that suits any interior. Premium mirror glass gives a clear, bright reflection, bringing light and a sense of space to bedrooms, living rooms, entryways, salons and more. Hang it on the wall or lean it against it.",
      specs: ["200 cm high × 100 cm wide", "Premium mirror glass for a clear reflection", "Stylish slim white frame that suits any interior", "Hang on the wall or lean against it", "Also available in Gold and Black, and in 220 × 120 cm and 210 × 120 cm", "Perfect for bedrooms, living rooms, entryways, salons and more", "Ships in a heavy-duty cardboard box with protective foam"]
    },
    {
      slug: 'halo-arch-floor-mirror-200-gold', name: 'Halo Arch Floor Mirror 200 × 100 cm – Gold',
      category: 'Floor Mirrors', price_cents: 33000, badge: 'New',
      group: 'halo-200', groupName: 'Halo Arch Floor Mirror', colour: 'Gold', swatch: '#C9A24E',
      desc: "Modern, elegant and timeless, the Halo is a 200 cm arched floor mirror in a slim gold frame that suits any interior. Premium mirror glass gives a clear, bright reflection, bringing light and a sense of space to bedrooms, living rooms, entryways, salons and more. Hang it on the wall or lean it against it.",
      specs: ["200 cm high × 100 cm wide", "Premium mirror glass for a clear reflection", "Stylish slim gold frame that suits any interior", "Hang on the wall or lean against it", "Also available in White and Black, and in 220 × 120 cm and 210 × 120 cm", "Perfect for bedrooms, living rooms, entryways, salons and more", "Ships in a heavy-duty cardboard box with protective foam"]
    },
    {
      slug: 'halo-arch-floor-mirror-200-black', name: 'Halo Arch Floor Mirror 200 × 100 cm – Black',
      category: 'Floor Mirrors', price_cents: 33000, badge: 'New',
      group: 'halo-200', groupName: 'Halo Arch Floor Mirror', colour: 'Black', swatch: '#1A1A1A',
      desc: "Modern, elegant and timeless, the Halo is a 200 cm arched floor mirror in a slim black frame that suits any interior. Premium mirror glass gives a clear, bright reflection, bringing light and a sense of space to bedrooms, living rooms, entryways, salons and more. Hang it on the wall or lean it against it.",
      specs: ["200 cm high × 100 cm wide", "Premium mirror glass for a clear reflection", "Stylish slim black frame that suits any interior", "Hang on the wall or lean against it", "Also available in White and Gold, and in 220 × 120 cm and 210 × 120 cm", "Perfect for bedrooms, living rooms, entryways, salons and more", "Ships in a heavy-duty cardboard box with protective foam"]
    },
    {
      slug: 'florence-window-arch-mirror-black', name: 'Florence Window Arch Mirror – Black',
      category: 'Floor Mirrors', price_cents: 40000, badge: 'New',
      desc: "Inspired by the grand arched windows of old-world Italian villas, the Florence brings timeless architecture into your home. A slim black metal frame divides the glass into classic window panes, framing your room like a view. At 200 cm high and 120 cm wide, it adds height, light and instant character to living rooms, entryways and bedrooms.",
      specs: ["200 cm high × 120 cm wide", "Black metal frame with an arched top and classic window-pane design", "Hang on the wall or lean against it", "Ships in a heavy-duty cardboard box with protective foam"]
    },
    {
      slug: 'versailles-ornate-mirror-190-gold', name: 'Versailles Ornate Mirror 190 × 90 cm – Gold',
      category: 'Floor Mirrors', price_cents: 25000, badge: 'New', in_stock: 0, // sold out
      group: 'versailles-190', groupName: 'Versailles Ornate Mirror', dims: '190 × 90 cm', colour: 'Gold', swatch: '#C9A24E',
      desc: "Make an entrance with the Versailles: a 190 cm full-length mirror framed in rich antique gold, with hand-detailed baroque scrollwork crowning every corner. All the opulence of our larger Versailles in a size that suits bedrooms, dressing rooms and hallways. Hang it vertically or horizontally, or lean it against the wall.",
      specs: ["190 cm high × 90 cm wide", "Ornate baroque frame in a rich antique gold", "Hang vertically or horizontally, or lean against the wall", "Also available in Black and Champagne, and in 220 × 110 cm", "Ships in a heavy-duty cardboard box with protective foam"]
    },
    {
      slug: 'versailles-ornate-mirror-190-black', name: 'Versailles Ornate Mirror 190 × 90 cm – Black',
      category: 'Floor Mirrors', price_cents: 25000, badge: 'New',
      group: 'versailles-190', groupName: 'Versailles Ornate Mirror', dims: '190 × 90 cm', colour: 'Black', swatch: '#1A1A1A',
      desc: "The Versailles in matte black, in a 190 cm full-length size: ornate baroque scrollwork with a dramatic, modern edge. Bold yet elegant, it suits bedrooms, dressing rooms and hallways. Hang it vertically or horizontally, or lean it against the wall.",
      specs: ["190 cm high × 90 cm wide", "Ornate baroque frame in a matte black", "Hang vertically or horizontally, or lean against the wall", "Also available in Gold and Champagne, and in 220 × 110 cm", "Ships in a heavy-duty cardboard box with protective foam"]
    },
    {
      slug: 'versailles-ornate-mirror-190-champagne', name: 'Versailles Ornate Mirror 190 × 90 cm – Champagne',
      category: 'Floor Mirrors', price_cents: 25000, badge: 'New',
      group: 'versailles-190', groupName: 'Versailles Ornate Mirror', dims: '190 × 90 cm', colour: 'Champagne', swatch: '#CDB68C',
      desc: "The Versailles in soft champagne, in a 190 cm full-length size: ornate baroque scrollwork in a gentle, pale-gold finish. Luxurious but understated, it brings quiet glamour to bedrooms, dressing rooms and hallways. Hang it vertically or horizontally, or lean it against the wall.",
      specs: ["190 cm high × 90 cm wide", "Ornate baroque frame in a soft champagne gold", "Hang vertically or horizontally, or lean against the wall", "Also available in Gold and Black, and in 220 × 110 cm", "Ships in a heavy-duty cardboard box with protective foam"]
    },
    {
      slug: 'versailles-ornate-mirror-gold', name: 'Versailles Ornate Mirror 220 × 110 cm – Gold',
      category: 'Floor Mirrors', price_cents: 34000, badge: 'New',
      group: 'versailles-220', groupName: 'Versailles Ornate Mirror', dims: '220 × 110 cm', colour: 'Gold', swatch: '#C9A24E',
      desc: "Make an entrance with the Versailles: a grand 220 cm mirror framed in rich antique gold, with hand-detailed baroque scrollwork crowning every corner. Timeless, opulent and full of light, it turns any living room, bedroom or entryway into something special. Hang it vertically or horizontally, or lean it against the wall.",
      specs: ["220 cm high × 110 cm wide", "Weight: 33.8 kg", "Ornate baroque frame in a rich antique gold", "Hang vertically or horizontally, or lean against the wall", "Also available in Black and Champagne, and in 190 × 90 cm", "Ships in a heavy-duty cardboard box with protective foam"]
    },
    {
      slug: 'versailles-ornate-mirror-black', name: 'Versailles Ornate Mirror 220 × 110 cm – Black',
      category: 'Floor Mirrors', price_cents: 34000, badge: 'New',
      group: 'versailles-220', groupName: 'Versailles Ornate Mirror', dims: '220 × 110 cm', colour: 'Black', swatch: '#1A1A1A',
      desc: "The Versailles in matte black: a grand 220 cm mirror whose ornate baroque scrollwork takes on a dramatic, modern edge. Bold yet elegant, it adds instant drama to living rooms, bedrooms and entryways. Hang it vertically or horizontally, or lean it against the wall.",
      specs: ["220 cm high × 110 cm wide", "Weight: 33.8 kg", "Ornate baroque frame in a matte black", "Hang vertically or horizontally, or lean against the wall", "Also available in Gold and Champagne, and in 190 × 90 cm", "Ships in a heavy-duty cardboard box with protective foam"]
    },
    {
      slug: 'versailles-ornate-mirror-champagne', name: 'Versailles Ornate Mirror 220 × 110 cm – Champagne',
      category: 'Floor Mirrors', price_cents: 34000, badge: 'New',
      group: 'versailles-220', groupName: 'Versailles Ornate Mirror', dims: '220 × 110 cm', colour: 'Champagne', swatch: '#CDB68C',
      desc: "The Versailles in soft champagne: a grand 220 cm mirror with ornate baroque scrollwork in a gentle, pale-gold finish. Luxurious but understated, it brings light and quiet glamour to living rooms, bedrooms and entryways. Hang it vertically or horizontally, or lean it against the wall.",
      specs: ["220 cm high × 110 cm wide", "Weight: 33.8 kg", "Ornate baroque frame in a soft champagne gold", "Hang vertically or horizontally, or lean against the wall", "Also available in Gold and Black, and in 190 × 90 cm", "Ships in a heavy-duty cardboard box with protective foam"]
    },
    {
      slug: 'monolith-arch-mirror-concrete', name: 'Monolith Arch Mirror – Concrete',
      category: 'Floor Mirrors', price_cents: 30000, badge: 'New',
      desc: 'Sculpted in a soft concrete finish, the Monolith is a 2-metre arched mirror with a stepped, layered frame that feels part architecture, part art. Hang it or lean it against the wall to bring light and calm, gallery-like presence to entryways, living rooms and bedrooms.',
      specs: ['200 cm high × 100 cm wide', 'Stepped arched frame in a concrete finish', 'Hang on the wall or lean against it', 'Also available in Black', 'Ships in a heavy-duty cardboard box with protective foam']
    },
    {
      slug: 'monolith-arch-mirror-black', name: 'Monolith Arch Mirror – Black',
      category: 'Floor Mirrors', price_cents: 30000, badge: 'New',
      desc: 'The Monolith in a bold black finish: a 2-metre arched mirror with a stepped, layered frame that adds striking architectural contrast. Hang it or lean it against the wall for a dramatic statement in entryways, living rooms and bedrooms.',
      specs: ['200 cm high × 100 cm wide', 'Stepped arched frame in a black finish', 'Hang on the wall or lean against it', 'Also available in Concrete', 'Ships in a heavy-duty cardboard box with protective foam']
    },
    {
      slug: 'gatsby-arch-mirror-black', name: 'Gatsby Arch Mirror – Black',
      category: 'Floor Mirrors', price_cents: 24000, badge: 'New',
      desc: 'Step into the Jazz Age with the Gatsby: a 2-metre arched mirror in a black metal frame of layered arches and sculptural round accents, inspired by Art Deco design. Hang it or lean it against the wall for a glamorous focal point in entryways, living rooms and bedrooms.',
      specs: ['200 cm high × 100 cm wide', 'Black metal frame with layered Art Deco arches and round accents', 'Hang on the wall or lean against it', 'Ships in a heavy-duty cardboard box with protective foam']
    },
    {
      slug: 'duchess-arch-mirror-black', name: 'Duchess Arch Mirror – Black',
      category: 'Floor Mirrors', price_cents: 30000, badge: '', in_stock: 0, // sold out: still shown, can't be bought
      desc: 'Meet the Duchess: a 2-metre arched mirror in a slim black metal frame, crowned with an ornate carved crest for a touch of old-world elegance. Hang it or lean it against the wall to bring light, height and quiet grandeur to bedrooms, hallways and living spaces.',
      specs: ['200 cm high × 100 cm wide', 'Slim black metal frame with an arched top and ornate carved crest', 'Hang on the wall or lean against it', 'Ships in a heavy-duty cardboard box with protective foam']
    },
    {
      slug: 'wavy-edge-wall-mirror', name: 'Wavy Edge Wall Mirror',
      category: 'Wall Mirrors', price_cents: 30000, badge: 'New',
      desc: 'A soft, wavy black timber frame turns this 2-metre mirror into a statement piece. Stylish and modern, it brightens bedrooms, living areas, hallways and entryways, and can be hung vertically or horizontally, or simply leaned against the wall.',
      specs: ['200 cm high × 100 cm wide', 'Durable wood frame in a timeless black finish', 'Hang vertically or horizontally, or lean against the wall', 'Perfect for bedrooms, living areas, hallways and entryways', 'Ships in a heavy-duty cardboard box with protective foam']
    },
    {
      slug: 'studio-box-mirror-black', name: 'Studio Box Mirror – Black',
      category: 'Floor Mirrors', price_cents: 25000, badge: 'New',
      desc: 'A generous 2-metre, full-length mirror in a natural timber box frame finished in matte black. Clean, modern lines frame the room and bounce light into hallways, bedrooms and living spaces. Hang it vertically or horizontally, or lean it against the wall.',
      specs: ['200 cm high × 100 cm wide', 'Natural timber box frame, finished in matte black', 'Hang vertically or horizontally, or lean against the wall', 'Also available in Walnut, Natural Oak', 'Ships in a heavy-duty cardboard box with protective foam']
    },
    {
      slug: 'studio-box-mirror-walnut', name: 'Studio Box Mirror – Walnut',
      category: 'Floor Mirrors', price_cents: 25000, badge: 'New',
      desc: 'A generous 2-metre, full-length mirror in a natural timber box frame with a rich walnut tone. Warm grain and clean lines add depth and a relaxed, crafted feel to any room. Hang it vertically or horizontally, or lean it against the wall.',
      specs: ['200 cm high × 100 cm wide', 'Natural timber box frame, in a rich walnut tone', 'Hang vertically or horizontally, or lean against the wall', 'Also available in Black, Natural Oak', 'Ships in a heavy-duty cardboard box with protective foam']
    },
    {
      slug: 'studio-box-mirror-natural-oak', name: 'Studio Box Mirror – Natural Oak',
      category: 'Floor Mirrors', price_cents: 25000, badge: 'New',
      desc: 'A generous 2-metre, full-length mirror in a light natural oak box frame. Soft, honey-toned timber and clean lines bring light, warmth and calm to hallways, bedrooms and living spaces. Hang it vertically or horizontally, or lean it against the wall.',
      specs: ['200 cm high × 100 cm wide', 'Natural timber box frame, in a light natural oak', 'Hang vertically or horizontally, or lean against the wall', 'Also available in Black, Walnut', 'Ships in a heavy-duty cardboard box with protective foam']
    },
    {
      slug: 'statement-curve-mirror-gold', name: 'Statement Curve Mirror – Gold',
      category: 'Wall Mirrors', price_cents: 35000, badge: 'New',
      desc: 'A 2-metre statement mirror with a bold gold metal frame and elegant curved detailing that adds style, light and depth to any space. Buy two for a 200 cm × 200 cm feature wall.',
      specs: ['200 cm high × 100 cm wide', 'Gold metal frame with curved detailing', 'Set of two: $700, forming a 200 cm × 200 cm feature wall', 'Ships in a heavy-duty cardboard box with protective foam']
    },
    {
      slug: 'statement-curve-mirror-black', name: 'Statement Curve Mirror – Black',
      category: 'Wall Mirrors', price_cents: 35000, badge: 'New',
      desc: 'A 2-metre statement mirror with a bold black metal frame and elegant curved detailing that adds style, light and depth to any space. Buy two for a 200 cm × 200 cm feature wall.',
      specs: ['200 cm high × 100 cm wide', 'Black metal frame with curved detailing', 'Set of two: $700, forming a 200 cm × 200 cm feature wall', 'Ships in a heavy-duty cardboard box with protective foam']
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
  function imageFor(slug) { return IMG[slug] || 'images/products/' + slug + '.jpg'; }
  function productUrl(slug) { return 'product.html?slug=' + encodeURIComponent(slug); }
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
        var list = data.products.map(function (p) { useServerPhotos(p); return Object.assign({}, META[p.slug] || { desc: '', specs: [] }, p); });
        // Live site: the database decides what's on sale, so a mirror set to Draft or deleted in the admin
        // disappears from the shop (the built-in list is only used if the database can't be reached at all).
        return list;
      })
      .catch(function () {
        if (!PREVIEW) return fallback;
        // Preview: stock comes from this browser's admin, so selling the last one marks it sold out.
        var admin = null; try { admin = JSON.parse(localStorage.getItem('mh-admin-v1') || 'null'); } catch (e) { /* none */ }
        if (!admin || !Array.isArray(admin.products)) return fallback;
        return fallback.map(function (p) {
          var a = admin.products.filter(function (x) { return x.slug === p.slug; })[0];
          if (!a || a.stock == null || a.stock === '') return p;
          var n = Math.max(0, parseInt(a.stock, 10) || 0);
          return Object.assign({}, p, { stock: n, in_stock: p.in_stock && n > 0 ? 1 : 0 });
        });
      })
      .then(function (list) { return list.filter(function (p) { return SHOW_CATEGORIES.indexOf(p.category) !== -1 && HIDDEN_PRODUCTS.indexOf(p.slug) === -1; }); })
      .then(function (list) {
        SOLD_OUT = {}; STOCK = {}; list.forEach(function (p) { if (!p.in_stock) SOLD_OUT[p.slug] = 1; if (p.stock != null) STOCK[p.slug] = p.stock; });
        var cart = readCart(), changed = false; // a sold-out mirror can't stay in a bag, and a bag can't hold more than are left
        Object.keys(cart).forEach(function (k) { if (SOLD_OUT[k]) { delete cart[k]; changed = true; } else if (STOCK[k] != null && cart[k] > STOCK[k]) { cart[k] = STOCK[k]; changed = true; } });
        if (changed) writeCart(cart);
        return list;
      });
    return productsPromise;
  }
  // Photos set in the admin: the first is the main photo; captions are kept for photos the shop already had.
  function useServerPhotos(p) {
    if (!p || !Array.isArray(p.images) || !p.images.length) return;
    var old = {}; (GALLERY[p.slug] || []).forEach(function (g) { old[g[0]] = g[1]; });
    IMG[p.slug] = p.images[0];
    if (p.images.length > 1) GALLERY[p.slug] = p.images.map(function (src, i) { return [src, old[src] || (p.name + ', photo ' + (i + 1))]; });
    else delete GALLERY[p.slug];
  }
  var SOLD_OUT = {}, STOCK = {};
  function maxQty(slug) { return STOCK[slug] != null ? Math.min(20, STOCK[slug]) : 20; }
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
    if (SOLD_OUT[slug]) return false;
    var mp = META[slug]; if (mp) track('add_to_cart', { currency: 'AUD', value: mp.price_cents * (qty || 1) / 100, items: [gaItem(mp, qty || 1)] });
    var cart = readCart();
    var before = cart[slug] || 0;
    cart[slug] = Math.min(maxQty(slug), before + (qty || 1));
    writeCart(cart);
    return cart[slug] > before;
  }
  function setQty(slug, qty) {
    var cart = readCart();
    if (qty <= 0) delete cart[slug]; else cart[slug] = Math.min(maxQty(slug), qty);
    if (STOCK[slug] != null && qty > STOCK[slug]) toast('Only ' + STOCK[slug] + ' left in stock.');
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
    '<p class="drawer-tax-note">Delivery is calculated at checkout by postcode.</p>' +
    '<a href="checkout.html" class="btn btn-primary drawer-checkout-btn" id="drawer-checkout-btn">Checkout Securely</a></div></aside>';

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
          '<a class="btn btn-secondary" href="' + ($('#collection-section') ? '' : 'index.html') + '#collection-section" data-close-drawer>Browse the collection</a></div>';
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
      $('#shipping-progress-text').textContent = 'Delivery by postcode, or free pick-up in Point Cook';
      $('#drawer-subtotal').textContent = money(subtotal);
      var co = $('#drawer-checkout-btn');
      co.setAttribute('aria-disabled', count ? 'false' : 'true');
      co.style.opacity = count ? '' : '0.5';
    });
  }

  // ---------- catalogue ----------
  // Colour options: products that share a "group" show as one card with colour dots.
  function variantsOf(list, p) { return p.group ? list.filter(function (x) { return x.group === p.group; }) : [p]; }
  function swatchesHtml(vars, current, attr) {
    return vars.map(function (v) {
      return '<button type="button" class="swatch" ' + attr + '="' + esc(v.slug) + '" style="--sw:' + esc(v.swatch || '#ccc') + '" aria-pressed="' + (v.slug === current.slug) + '" aria-label="' + esc(v.colour || v.name) + '" title="' + esc(v.colour || v.name) + '"></button>';
    }).join('');
  }
  // Size shown on the shop card: from p.dims, or the first spec line ("200 cm high × 100 cm wide" -> "200 × 100 cm").
  function dimsOf(p) {
    if (p.dims) return p.dims;
    var m = String((p.specs || [])[0] || '').match(/(\d+(?:\.\d+)?)\s*cm\s*high\s*×\s*(\d+(?:\.\d+)?)\s*cm\s*wide/i);
    return m ? m[1] + ' × ' + m[2] + ' cm' : '';
  }
  function cardHtml(p, vars) {
    vars = vars || [p];
    var multi = vars.length > 1;
    var badge = !p.in_stock ? ''
      : p.badge ? '<span class="product-badge">' + esc(p.badge) + '</span>' : '';
    return '<article class="product-card"' + (multi ? ' data-group="' + esc(p.group) + '"' : '') + '>' +
      '<div class="product-media' + (p.in_stock ? '' : ' is-sold-out') + '">' + badge + (p.in_stock ? '' : '<span class="sold-out-band" aria-hidden="true">Sold out</span>') +
      '<img src="' + esc(imageFor(p.slug)) + '" alt="' + esc(p.name) + '" width="800" height="1000" loading="lazy" decoding="async">' +
      '<button type="button" class="product-quick" data-quick="' + esc(p.slug) + '">Quick view</button></div>' +
      '<div class="product-info"><span class="product-cat">' + esc(p.category) + '</span>' +
      '<h3 class="product-name"><a href="' + esc(productUrl(p.slug)) + '" data-product-link="' + esc(p.slug) + '">' + esc(multi ? (p.groupName || p.name) : p.name) + '</a></h3>' +
      (dimsOf(p) ? '<div class="card-dims">' + esc(dimsOf(p)) + '</div>' : '') +
      (multi ? '<div class="card-swatches" role="group" aria-label="Colour"><span class="swatch-name">' + esc(p.colour || '') + '</span>' + swatchesHtml(vars, p, 'data-swatch') + '</div>' : '') +
      '<div class="product-row"><span class="product-price">' + money(p.price_cents) + '</span>' +
      '<button type="button" class="link-btn" data-add="' + esc(p.slug) + '"' + (p.in_stock ? '' : ' disabled') + '>' +
      (p.in_stock ? 'Add to bag' : 'Sold out') + '</button></div></div></article>';
  }

  // Shop filters ("collections"). New mirrors join automatically by the words in their name,
  // e.g. "Arch", "Ornate", "Black", "Gold", so name new mirrors with these words in mind.
  var COLLECTIONS = [
    { key: 'all', label: 'All', title: 'Architectural Floor & Wall Mirrors', test: function () { return true; } },
    { key: 'floor', label: 'Floor Mirrors', title: 'Floor Mirrors', cat: 'Floor Mirrors', test: function (p) { return p.category === 'Floor Mirrors'; } },
    { key: 'wall', label: 'Wall Mirrors', title: 'Statement & Wavy Wall Mirrors', cat: 'Wall Mirrors', test: function (p) { return p.category === 'Wall Mirrors'; } },
    { key: 'arch', label: 'Arch', title: 'Arch Mirrors', test: function (p) { return /\barch\b/i.test(p.name); } },
    { key: 'ornate', label: 'Ornate', title: 'Ornate & Baroque Mirrors', test: function (p) { return /ornate|baroque|versailles|beaded/i.test(p.name); } },
    { key: 'timber', label: 'Timber Box', title: 'Timber Box Mirrors', test: function (p) { return /studio box|timber|walnut|oak/i.test(p.name); } },
    { key: 'black', label: 'Black', title: 'Black Mirrors', test: function (p) { return /black/i.test(p.name) || /black (timber|wood|metal) frame/i.test(p.desc || ''); } },
    { key: 'gold', label: 'Gold & Champagne', title: 'Gold & Champagne Mirrors', test: function (p) { return /gold|champagne|brass/i.test(p.name); } }
  ];
  function collectionFromQuery(c, cat) {
    var k = null;
    COLLECTIONS.forEach(function (x) { if ((c && x.key === c) || (!c && cat && x.cat === cat)) k = x.key; });
    return k;
  }

  function renderCatalogue(products) {
    var grid = $('#products-grid');
    var pills = $('#category-pills');
    if (!grid) return;
    var title = $('#collection-section .section-title');
    var filters = COLLECTIONS.filter(function (f) { return f.key === 'all' || products.some(f.test); });
    var active = collectionFromQuery(query('collection'), query('category')) || 'all';
    if (!filters.some(function (f) { return f.key === active; })) active = 'all';
    function current() { return filters.filter(function (f) { return f.key === active; })[0]; }

    function draw() {
      var f = current();
      var shown = products.filter(f.test), seen = {};
      shown = shown.filter(function (p) { if (!p.group) return true; if (seen[p.group]) return false; seen[p.group] = 1; return true; })
        .map(function (p) { if (!p.group || p.in_stock) return p; return shown.filter(function (x) { return x.group === p.group && x.in_stock; })[0] || p; });
      grid.innerHTML = shown.length ? shown.map(function (p) { return cardHtml(p, variantsOf(products, p)); }).join('') : '<p class="grid-note">Nothing in this collection yet.</p>';
      cardProducts = products;
      if (title) title.textContent = f.title;
      if (pills) {
        pills.innerHTML = filters.map(function (c) {
          var g = {}, n = products.filter(c.test).filter(function (p) { if (!p.group) return true; if (g[p.group]) return false; g[p.group] = 1; return true; }).length;
          return '<button type="button" class="filter-pill" data-cat="' + esc(c.key) + '" aria-pressed="' + (c.key === active) + '">' +
            esc(c.label) + '<span class="count">' + n + '</span></button>';
        }).join('');
      }
    }
    draw();
    if (pills) {
      pills.setAttribute('role', 'group');
      pills.setAttribute('aria-label', 'Filter by collection');
      pills.addEventListener('click', function (e) {
        var b = e.target.closest('[data-cat]');
        if (b) setActive(b.getAttribute('data-cat'));
      });
    }
    function setActive(key) {
      active = filters.some(function (f) { return f.key === key; }) ? key : 'all';
      draw();
      try {
        var url = new URL(location.href);
        url.searchParams.delete('category');
        if (active !== 'all') url.searchParams.set('collection', active); else url.searchParams.delete('collection');
        history.replaceState(null, '', url);
      } catch (err) { /* preview frames may block history */ }
    }
    // Footer and menu collection links filter in place on the home page instead of reloading it.
    showCategory = function (key) {
      setActive(key);
      var section = $('#collection-section');
      if (section) section.scrollIntoView({ behavior: 'smooth' });
    };
    if (active !== 'all') {
      var section = $('#collection-section');
      if (section) section.scrollIntoView();
    }
  }
  var showCategory = null;
  var cardProducts = [];

  // ---------- product detail (quick view and product page share this) ----------
  function detailHtml(p, headingTag) {
    var h = headingTag || 'h2';
    var gal = GALLERY[p.slug];
    var thumbs = gal && gal.length > 1 ? '<div class="qv-thumbs" role="group" aria-label="More photos">' + gal.map(function (g, i) {
      return '<button type="button" data-gallery="' + esc(g[0]) + '" data-alt="' + esc(p.name + ': ' + g[1]) + '" aria-pressed="' + (i === 0) + '" aria-label="Show photo: ' + esc(g[1]) + '"><img src="' + esc(g[0]) + '" alt="" loading="lazy"></button>';
    }).join('') + '</div>' : '';
    return '<div class="qv-media' + (p.in_stock ? '' : ' is-sold-out') + '">' + (p.in_stock ? '' : '<span class="sold-out-band" aria-hidden="true">Sold out</span>') + '<button type="button" class="qv-zoom" data-enlarge aria-label="Enlarge photo of ' + esc(p.name) + '"><img class="qv-main" src="' + esc(imageFor(p.slug)) + '" alt="' + esc(p.name) + '" width="800" height="1000">' +
      '<span class="qv-zoom-hint" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M11 8v6M8 11h6"/></svg> View larger</span></button>' + thumbs + '</div>' +
      '<div class="qv-body"><span class="product-cat">' + esc(p.category) + '</span>' +
      '<' + h + ' id="detail-title">' + esc(p.name) + '</' + h + '>' +
      '<div class="qv-price">' + money(p.price_cents) + '</div>' +
      (p.group && detailVariants(p).length > 1 ? '<div class="detail-swatches" role="group" aria-label="Choose a colour"><span class="swatch-label">Colour: <strong>' + esc(p.colour || '') + '</strong></span><div class="swatch-row">' + swatchesHtml(detailVariants(p), p, 'data-variant') + '</div></div>' : '') +
      '<p class="qv-desc">' + esc(p.desc || '') + '</p>' +
      (p.specs && p.specs.length ? '<ul class="spec-list">' + p.specs.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>' : '') +
      '<div class="qv-actions"><div class="qty" role="group" aria-label="Quantity">' +
      '<button type="button" data-detail-qty="-1" aria-label="Fewer">−</button><span id="detail-qty">1</span>' +
      '<button type="button" data-detail-qty="1" aria-label="More">+</button></div>' +
      '<button type="button" class="btn btn-primary" data-detail-add="' + esc(p.slug) + '"' + (p.in_stock ? '' : ' disabled') + '>' +
      (p.in_stock ? 'Add to bag' : 'Sold out') + '</button></div>' +
      (p.in_stock && p.stock != null && p.stock <= 3 ? '<p class="stock-low">Only ' + p.stock + ' left in stock</p>' : '') +
      (p.in_stock ? '' : '<p class="co-warn" style="margin-top:12px">Currently sold out. We\'re hoping to get more in. Email <a href="mailto:hello@mirrorhousemelbourne.com.au?subject=' + encodeURIComponent('Let me know when the ' + p.name + ' is back') + '">hello@mirrorhousemelbourne.com.au</a> and we\'ll let you know when it\'s back.</p>') +
      '<p class="drawer-tax-note">Delivery by postcode, or free pick-up in Point Cook</p></div>';
  }

  var allProducts = [];
  function detailVariants(p) { return variantsOf(allProducts.length ? allProducts : CATALOGUE, p); }
  var qvLastFocus = null;
  function openQuickView(p) {
    var overlay = $('#quickview-overlay');
    var content = $('#quickview-content');
    if (!overlay || !content) { location.href = productUrl(p.slug); return; }
    qvLastFocus = document.activeElement;
    content.innerHTML = detailHtml(p);
    track('view_item', { currency: 'AUD', value: p.price_cents / 100, items: [gaItem(p)], source: 'quick_view' });
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
      root.innerHTML = '<div class="drawer-empty"><p>We couldn\'t find that piece.</p><a class="btn btn-secondary" href="index.html#collection-section">Browse the collection</a></div>';
      return;
    }
    document.title = p.name + ' | Mirror House Melbourne';
    var crumb = $('#crumb-name');
    if (crumb) crumb.textContent = p.name;
    root.innerHTML = detailHtml(p, 'h1');
    track('view_item', { currency: 'AUD', value: p.price_cents / 100, items: [gaItem(p)] });
  }

  // ---------- checkout ----------
  // One-page checkout: contact, delivery or pick-up, address, delivery price from the postcode, preferred day,
  // payment by Square, and an order summary that updates as you go. Addresses outside the delivery zones send a
  // quote request instead: no payment is taken until you send the customer a delivery quote from the admin.
  // Delivery zones and discount codes come from the admin (in the preview, from this browser's admin;
  // on the live site, from the server). The server must re-check every price before charging.
  var MAX_PER_DELIVERY = 4; // one delivery fee covers up to this many mirrors
  var CHECKOUT_DEFAULTS = {
    shipping: {
      zones: [
        { id: 'z1', name: 'Zone 1', price: 4900, postcodes: '3030, 3029, 3028, 3027, 3026, 3018' },
        { id: 'z2', name: 'Zone 2', price: 7900, postcodes: '3000, 3002, 3003, 3004, 3006, 3008, 3011, 3012, 3013, 3015, 3016, 3019, 3020, 3022, 3023, 3024, 3025, 3031, 3032, 3033, 3034, 3036, 3037, 3038, 3039, 3040, 3042, 3043, 3051, 3055, 3056, 3057, 3058, 3141, 3206, 3207, 3211, Tarneit 3029, Derrimut 3026' },
        { id: 'z3', name: 'Zone 3', price: 10900, postcodes: '3000-3115, 3117-3136, 3141-3172, 3174, 3181-3207, 3211-3214, 3335-3338, 3427-3429, 3750-3754, 3220, Keilor North 3036, Keilor Park 3042, Middle Park 3206' }
      ],
      quoteBeyond: true,
      pickup: { enabled: true, location: 'Point Cook VIC 3030', instructions: 'By appointment. We\'ll be in touch with the address and a time that suits once your order is confirmed.' },
      timeframe: '1–4 business days'
    },
    discounts: [{ code: 'WELCOME10', type: 'pct', value: 10, minSpend: 0, firstOrderOnly: true, starts: null, ends: null, active: true }]
  };
  function checkoutSettings() {
    var out = JSON.parse(JSON.stringify(CHECKOUT_DEFAULTS));
    if (PREVIEW) {
      try {
        var a = JSON.parse(localStorage.getItem('mh-admin-v1') || 'null');
        if (a && a.shipping) out.shipping = a.shipping;
        if (a && a.discounts) out.discounts = a.discounts;
      } catch (e) { /* use defaults */ }
    } else if (window.MH_CHECKOUT_SETTINGS) {
      out = Object.assign(out, window.MH_CHECKOUT_SETTINGS); // provided by the server
    }
    return out;
  }
  // Zone postcode lists are comma-separated: "3030", a range "3000-3099", or a suburb with its postcode,
  // "Tarneit 3029", for a postcode split between zones. A suburb + postcode match always wins.
  function zoneEntries(text) {
    return String(text || '').split(/[,;\n]+/).map(function (p) { return p.trim(); }).filter(Boolean).map(function (p) {
      var m;
      if ((m = p.match(/^(\d{4})\s*-\s*(\d{4})$/))) return { from: +m[1], to: +m[2] };
      if ((m = p.match(/^(\d{4})$/))) return { from: +m[1], to: +m[1] };
      if ((m = p.match(/^(.*?[A-Za-z].*?)\s+(\d{4})$/))) return { suburb: normSuburb(m[1]), from: +m[2], to: +m[2] };
      return null;
    }).filter(Boolean);
  }
  function normSuburb(s) { return String(s || '').toLowerCase().replace(/['’.]/g, '').replace(/\bst\b/g, 'saint').replace(/[^a-z]+/g, ' ').trim(); }
  function zoneForPostcode(pc, zones, suburb) {
    if (!/^\d{4}$/.test(pc)) return null;
    var n = parseInt(pc, 10), sub = normSuburb(suburb), i, j, e;
    if (sub) for (i = 0; i < zones.length; i++) { e = zoneEntries(zones[i].postcodes); for (j = 0; j < e.length; j++) if (e[j].suburb && e[j].suburb === sub && n === e[j].from) return zones[i]; }
    for (i = 0; i < zones.length; i++) { e = zoneEntries(zones[i].postcodes); for (j = 0; j < e.length; j++) if (!e[j].suburb && n >= e[j].from && n <= e[j].to) return zones[i]; }
    return null;
  }
  function dateKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  var CARD_ICONS = '<span class="co-cards" aria-label="Visa, Mastercard, American Express"><span>VISA</span><span>MC</span><span>AMEX</span></span>';

  function renderCheckout(products) {
    var root = $('#checkout-root');
    if (!root) return;
    var lines = bagLines(products);
    if (lines.length) track('begin_checkout', { currency: 'AUD', items: lines.map(function (l) { return gaItem(l.product, l.qty); }) });
    if (!lines.length) {
      root.innerHTML = '<div class="panel confirmation"><h2>Your bag is empty</h2><p class="section-desc">Add a mirror or two, then come back to check out.</p>' +
        '<a class="btn btn-primary" href="index.html#collection-section">Browse the collection</a></div>';
      return;
    }
    var cfg = checkoutSettings(), sh = cfg.shipping;
    var tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    var maxDay = new Date(); maxDay.setDate(maxDay.getDate() + 60);
    var field = function (id, label, attrs, extra) {
      return '<div class="field co-f" data-f="' + id + '"><label for="' + id + '">' + label + '</label><input id="' + id + '" ' + attrs + '>' +
        '<p class="co-err" id="' + id + '-err" role="alert"></p>' + (extra || '') + '</div>';
    };

    root.innerHTML =
      '<form class="co-layout" id="checkout-form" novalidate>' +
      '<div class="co-main">' +
      // express payment
      '<section class="panel co-express"><p class="co-express-title">Express checkout</p><div class="co-express-btns">' +
      '<button type="button" class="co-wallet co-apple" data-wallet="Apple Pay" aria-label="Pay with Apple Pay">Apple Pay</button>' +
      '<button type="button" class="co-wallet co-google" data-wallet="Google Pay" aria-label="Pay with Google Pay">Google Pay</button></div>' +
      '<p class="co-or"><span>or pay with card below</span></p></section>' +
      // contact
      '<section class="panel"><h2>Contact</h2>' +
      field('co-email', 'Email', 'type="email" autocomplete="email" inputmode="email" required placeholder="you@example.com"') +
      field('co-phone', 'Mobile number', 'type="tel" autocomplete="tel" inputmode="tel" required placeholder="04xx xxx xxx"', '<p class="co-help">So we can arrange a delivery or pick-up time with you.</p>') +
      '<label class="co-check"><input type="checkbox" id="co-news"><span>Email me about new mirrors and offers</span></label></section>' +
      // method
      '<section class="panel"><h2>Delivery or pick-up</h2><fieldset class="co-method"><legend class="visually-hidden">Choose delivery or pick-up</legend>' +
      '<label class="option" for="co-m-del"><input type="radio" name="co-method" id="co-m-del" value="delivery" checked><span><strong>Delivery from Point Cook</strong><small>Priced by postcode: $49, $79 or $109. Usually ' + esc(sh.timeframe || '1–4 business days') + '.</small></span><span class="price" id="co-del-price">By postcode</span></label>' +
      (sh.pickup && sh.pickup.enabled ? '<label class="option" for="co-m-pick"><input type="radio" name="co-method" id="co-m-pick" value="pickup"><span><strong>Free pick-up, ' + esc(sh.pickup.location || 'Point Cook') + '</strong><small>' + esc(sh.pickup.instructions || '') + '</small></span><span class="price">Free</span></label>' : '') +
      '</fieldset></section>' +
      // address
      '<section class="panel" id="co-address"><h2>Delivery address</h2><div class="co-grid">' +
      field('co-first', 'First name', 'autocomplete="given-name" required') + field('co-last', 'Last name', 'autocomplete="family-name" required') +
      '<div class="co-span">' + field('co-line1', 'Street address', 'autocomplete="address-line1" required placeholder="e.g. 12 Station St"') + '</div>' +
      '<div class="co-span"><button type="button" class="co-link" id="co-add-line2">+ Add apartment, unit or level</button><div id="co-line2-wrap" hidden>' + field('co-line2', 'Apartment, unit or level (optional)', 'autocomplete="address-line2"') + '</div></div>' +
      field('co-suburb', 'Suburb', 'autocomplete="address-level2" required') +
      '<div class="field co-f" data-f="co-state"><label for="co-state">State</label><select id="co-state" autocomplete="address-level1">' + ['VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT'].map(function (s) { return '<option>' + s + '</option>'; }).join('') + '</select><p class="co-err" id="co-state-err" role="alert"></p></div>' +
      field('co-postcode', 'Postcode', 'autocomplete="postal-code" inputmode="numeric" maxlength="4" pattern="\\d{4}" required') +
      '</div><div class="co-zone" id="co-zone" aria-live="polite"></div>' +
      '<div class="co-grid"><div class="field co-f" data-f="co-day"><label for="co-day">Preferred delivery day</label><input id="co-day" type="date" min="' + dateKey(tomorrow) + '" max="' + dateKey(maxDay) + '"><p class="co-help">Optional. We deliver Monday to Saturday and will confirm the day with you.</p><p class="co-err" id="co-day-err" role="alert"></p></div>' +
      '<div class="field co-f co-span"><label for="co-notes">Delivery notes (optional)</label><textarea id="co-notes" rows="2" placeholder="Stairs, lift, parking, gate code…"></textarea></div></div></section>' +
      // pick-up info
      '<section class="panel" id="co-pickup" hidden><h2>Pick-up details</h2><div class="co-grid">' +
      field('co-pfirst', 'First name', 'autocomplete="given-name" required') + field('co-plast', 'Last name', 'autocomplete="family-name" required') + '</div>' +
      '<p class="co-help">' + esc((sh.pickup && sh.pickup.instructions) || '') + ' A 200 cm mirror needs a large car, ute or van, and our team will help you load it.</p></section>' +
      // payment
      '<section class="panel" id="co-quote-box" hidden><h2>Delivery quote</h2><p>Your address is more than 50 km from Point Cook, so we\'ll arrange delivery and email you a price.</p>' +
      '<ol class="co-steps"><li>Send your request now. <strong>No payment is taken today.</strong></li><li>We\'ll email you a delivery quote within one business day, with a secure Square link to pay for your mirror and delivery together.</li><li>Once paid, your order is confirmed and we\'ll arrange your delivery day.</li></ol>' +
      '<p class="co-help">We\'ll hold your mirror for 7 days while you decide. Prefer to collect? Choose free pick-up above.</p></section>' +
      '<section class="panel" id="co-pay-panel"><h2>Payment</h2><p class="co-help">All transactions are secure and encrypted by Square. Your card details never touch our website.</p>' +
      '<div class="co-pay"><div class="co-pay-head"><span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Credit or debit card</span>' + CARD_ICONS + '</div>' +
      '<div id="card-container" class="co-card-box">' + (PREVIEW ? '<p><strong>Square\'s secure card form appears here on the live site.</strong> In this preview no card is needed and nothing is charged.</p>' : '') + '</div>' +
      '<label class="co-check"><input type="checkbox" id="co-billing" checked><span>Billing address same as delivery address</span></label></div>' +
      '<p class="co-err" id="co-pay-err" role="alert"></p></section>' +
      '<button type="submit" class="btn btn-primary co-submit" id="co-submit"><span id="co-btn-label">' + (PREVIEW ? 'Place test order' : 'Pay now') + '</span> · <span id="co-btn-total"></span></button>' +
      '<p class="co-terms">By placing your order you agree to our <a href="policies.html#delivery">Delivery</a> and <a href="policies.html#returns">Returns &amp; Refunds</a> policies.' + (gstRegistered() ? ' Prices include GST.' : ' All prices are final, in Australian dollars.') + '</p>' +
      '<p class="form-msg" id="co-msg" role="status"></p>' +
      '</div>' +
      // summary
      '<aside class="co-side"><details class="panel co-summary" id="co-summary" open><summary><span>Order summary</span><span id="co-sum-total"></span></summary>' +
      '<ul class="co-items">' + lines.map(function (l) {
        return '<li><span class="co-thumb"><img src="' + esc(imageFor(l.product.slug)) + '" alt="" width="64" height="80"><b>' + l.qty + '</b></span><span class="co-item-name">' + esc(l.product.name) + '</span><span class="co-item-price">' + money(l.product.price_cents * l.qty) + '</span></li>';
      }).join('') + '</ul>' +
      '<div class="field co-code-field"><label for="co-code">Discount code</label><div class="code-row"><input id="co-code" type="text" autocomplete="off" autocapitalize="characters" placeholder="e.g. WELCOME10"><button type="button" class="btn btn-secondary" id="co-apply">Apply</button></div><p class="form-msg" id="co-code-msg" role="status"></p></div>' +
      '<ul class="summary-lines" id="co-lines"></ul>' +
      '<div class="summary-total"><span>Total <small>AUD</small></span><span id="co-total"></span></div><p class="drawer-tax-note" id="co-gst"></p>' +
      '<ul class="co-trust"><li>Checked with you on delivery</li><li>Secure payment by Square</li><li>Free pick-up in Point Cook</li></ul></details></aside>' +
      '</form>';

    var summary = $('#co-summary');
    if (window.matchMedia('(max-width: 860px)').matches) summary.removeAttribute('open');

    var appliedCode = null;
    var subtotal = subtotalOf(lines);
    function method() { var p = $('#co-m-pick'); return p && p.checked ? 'pickup' : 'delivery'; }
    function discountFor(code) {
      var d = (cfg.discounts || []).filter(function (x) { return x.code === code; })[0];
      if (!d) return { error: 'Sorry, that code isn\'t valid.' };
      var now = Date.now();
      if (!d.active) return { error: 'Sorry, that code isn\'t active.' };
      if (d.starts && now < new Date(d.starts + 'T00:00:00').getTime()) return { error: 'That code isn\'t available yet.' };
      if ((d.ends || d.expires) && now > new Date((d.ends || d.expires) + 'T23:59:59').getTime()) return { error: 'Sorry, that code has expired.' };
      if (d.minSpend && subtotal < d.minSpend) return { error: 'Spend ' + money(d.minSpend) + ' or more to use this code.' };
      var amount = d.type === 'fixed' ? Math.min(subtotal, d.value) : Math.round(subtotal * (d.value || d.pct || 0) / 100);
      return { amount: amount, label: d.type === 'fixed' ? money(d.value) + ' off' : (d.value || d.pct) + '% off', firstOrderOnly: d.firstOrderOnly };
    }
    function discountAmt() { if (!appliedCode) return 0; var d = discountFor(appliedCode); return d.amount || 0; }
    function zone() {
      if (method() === 'pickup') return null;
      var pc = $('#co-postcode').value.trim();
      if (!/^\d{4}$/.test(pc)) return undefined;
      var z = zoneForPostcode(pc, sh.zones || [], $('#co-suburb') && $('#co-suburb').value) || (sh.quoteBeyond ? { id: 'quote', name: 'Outside our zones', quote: true, price: 0 } : { id: 'none', none: true, price: 0 });
      // One delivery fee covers up to 4 mirrors; each extra group of up to 4 adds another fee (5-8 mirrors = 2 fees).
      if (z && !z.quote && !z.none) { var n = deliveryLoads(); if (n > 1) z = Object.assign({}, z, { loads: n, unit: z.price, price: z.price * n }); }
      return z;
    }
    function deliveryLoads() { return Math.max(1, Math.ceil(mirrorCount() / MAX_PER_DELIVERY)); }
    function mirrorCount() { return lines.reduce(function (n, l) { return n + (l.qty || 0); }, 0); }

    function totals() {
      var pickup = method() === 'pickup';
      $('#co-address').hidden = pickup;
      $('#co-pickup').hidden = !pickup;
      var z = zone();
      var zoneBox = $('#co-zone');
      if (pickup) zoneBox.innerHTML = '';
      else if (z === undefined) zoneBox.innerHTML = '<p>Enter your postcode to see your delivery price.</p>';
      else if (z.none) zoneBox.innerHTML = '<p class="co-warn">Sorry, we don\'t deliver to this postcode yet. Choose free pick-up, or email hello@mirrorhousemelbourne.com.au.</p>';
      else if (z.quote) zoneBox.innerHTML = '<p class="co-warn"><strong>You\'re more than 50 km from Point Cook, outside our delivery zones.</strong> Place your order now with no payment, and we\'ll email your delivery quote within 1 business day. Nothing is charged until you accept it. Prefer to collect? Choose free pick-up in Point Cook above.</p>';
      else zoneBox.innerHTML = '<p class="co-ok"><strong>' + esc(z.name) + ' delivery: ' + money(z.price) + '</strong>' + (z.loads > 1 ? ' (' + z.loads + ' × ' + money(z.unit) + ', as each delivery fee covers up to ' + MAX_PER_DELIVERY + ' mirrors)' : '') + ' · usually ' + esc(sh.timeframe || '1–4 business days') + '</p>';
      $('#co-del-price').textContent = !pickup && z && !z.quote && !z.none ? money(z.price) : 'By postcode';

      var delivery = pickup ? 0 : z && !z.quote && !z.none ? z.price : 0;
      var discount = discountAmt();
      var quote = !pickup && !!(z && z.quote);
      $('#co-quote-box').hidden = !quote;
      $('#co-pay-panel').hidden = quote;
      if ($('.co-express')) $('.co-express').hidden = quote; // express pay would skip the delivery quote
      $('#co-btn-label').textContent = quote ? (PREVIEW ? 'Send test quote request' : 'Request delivery quote') : (PREVIEW ? 'Place test order' : 'Pay now');
      var total = subtotal - discount + delivery;
      var rows = [['Subtotal', money(subtotal)]];
      if (discount) rows.push(['Discount (' + appliedCode + ')', '−' + money(discount)]);
      rows.push([pickup ? 'Pick-up, Point Cook' : 'Delivery', pickup ? 'Free' : z === undefined ? 'Enter postcode' : z.quote ? 'Quoted later' : z.none ? '–' : money(delivery)]);
      $('#co-lines').innerHTML = rows.map(function (r) { return '<li><span>' + esc(r[0]) + '</span><span>' + r[1] + '</span></li>'; }).join('');
      $('#co-total').textContent = money(total);
      $('#co-sum-total').textContent = money(total);
      $('#co-btn-total').textContent = quote ? money(total) + ' + delivery' : money(total);
      $('#co-gst').textContent = gstRegistered() ? 'Including ' + money(Math.round(total / 11)) + ' GST' : '';
      return { subtotal: subtotal, discount: discount, delivery: delivery, total: total, zone: z, pickup: pickup, quote: quote };
    }

    // Live site: a code the page doesn't know yet is looked up on the server (the list of codes is never sent
    // to the browser). The server checks it again, with the first-order rule, when the order is placed.
    function applyCode() {
      var code = $('#co-code').value.trim().toUpperCase();
      var m = $('#co-code-msg');
      if (!PREVIEW && code && !(cfg.discounts || []).some(function (x) { return x.code === code; })) {
        m.className = 'form-msg'; m.textContent = 'Checking…';
        fetch('/api/discounts/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: code }) })
          .then(function (r) { return r.json(); })
          .then(function (d) { if (d && d.discount) (cfg.discounts = cfg.discounts || []).push(d.discount); applyKnownCode(code); })
          .catch(function () { m.textContent = 'We couldn\'t check that code just now. Please try again.'; m.className = 'form-msg error'; });
        return;
      }
      applyKnownCode(code);
    }
    function applyKnownCode(code) {
      var m = $('#co-code-msg');
      m.className = 'form-msg';
      if (!code) { appliedCode = null; m.textContent = ''; totals(); return; }
      var d = discountFor(code);
      if (d.error) { appliedCode = null; m.textContent = d.error; m.className = 'form-msg error'; }
      else { appliedCode = code; m.textContent = code + ' applied: ' + d.label + '.' + (d.firstOrderOnly ? ' First orders only, confirmed when your order is placed.' : ''); }
      totals();
    }

    // ---- validation ----
    function setErr(id, text) {
      var e = $('#' + id + '-err'), input = $('#' + id);
      if (e) e.textContent = text || '';
      if (input) { if (text) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); input.setAttribute('aria-describedby', id + '-err'); }
      return !text;
    }
    function check(id) {
      var el = $('#' + id); if (!el) return true;
      var v = el.value.trim();
      switch (id) {
        case 'co-email': return setErr(id, !v ? 'Enter your email' : !el.checkValidity() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? 'Enter an email like name@example.com' : '');
        case 'co-phone': var digits = v.replace(/[^\d+]/g, ''); return setErr(id, !v ? 'Enter a mobile number' : !/^(\+?61|0)[2-478]\d{8}$/.test(digits) ? 'Enter an Australian number, e.g. 0412 345 678' : '');
        case 'co-first': case 'co-pfirst': return setErr(id, v ? '' : 'Enter a first name');
        case 'co-last': case 'co-plast': return setErr(id, v ? '' : 'Enter a last name');
        case 'co-line1': return setErr(id, v ? '' : 'Enter a street address');
        case 'co-suburb': return setErr(id, v ? '' : 'Enter a suburb');
        case 'co-postcode': return setErr(id, !/^\d{4}$/.test(v) ? 'Enter a 4-digit postcode' : '');
        case 'co-day':
          if (!v) return setErr(id, '');
          var d = new Date(v + 'T12:00:00');
          return setErr(id, v < el.min ? 'Choose a day from tomorrow' : v > el.max ? 'Choose a day in the next 2 months' : d.getDay() === 0 ? 'We don\'t deliver on Sundays. Choose Monday to Saturday.' : '');
      }
      return true;
    }
    function required() {
      var ids = ['co-email', 'co-phone'];
      return ids.concat(method() === 'pickup' ? ['co-pfirst', 'co-plast'] : ['co-first', 'co-last', 'co-line1', 'co-suburb', 'co-postcode', 'co-day']);
    }

    totals();
    root.addEventListener('change', function (e) {
      if (e.target.name === 'co-method') totals();
      if (/^co-/.test(e.target.id)) check(e.target.id);
    });
    root.addEventListener('focusout', function (e) { if (e.target.value && /^co-/.test(e.target.id)) check(e.target.id); });
    root.addEventListener('input', function () { var m = $('#co-msg'); if (m && m.classList.contains('error')) { m.textContent = ''; m.className = 'form-msg'; } });
    $('#co-suburb').addEventListener('input', function () { totals(); });
    $('#co-postcode').addEventListener('input', function (e) { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); if (e.target.value.length === 4) check('co-postcode'); totals(); });
    $('#co-add-line2').addEventListener('click', function () { $('#co-line2-wrap').hidden = false; this.hidden = true; $('#co-line2').focus(); });
    $('#co-apply').addEventListener('click', applyCode);
    $('#co-code').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); applyCode(); } });
    root.querySelectorAll('[data-wallet]').forEach(function (b) {
      b.addEventListener('click', function () { toast(PREVIEW ? b.getAttribute('data-wallet') + ' works on the live site once Square is connected.' : 'Opening ' + b.getAttribute('data-wallet') + '…'); });
    });

    // ---- Square (live site) ----
    // /api/config.js sets window.MH_SQUARE = { appId, locationId, sandbox, sdkUrl } from the server's settings, and
    // Square's card form is loaded from sdkUrl. The card token is sent to /api/orders, and the server takes the
    // payment with Square's Payments API after re-checking prices, delivery, codes and stock.
    // Quote requests (outside the zones) are sent without a card token and saved as 'awaiting quote'.
    // Apple Pay and Google Pay need the shop's domain registered with Square first, so the express buttons stay
    // hidden on the live site until that's done.
    var card = null;
    // One payment key per checkout attempt. If the reply is lost (slow network, timeout), paying again sends the same
    // key, so the server and Square treat it as the same payment, never a second charge. A clear "no" (declined card,
    // changed price, sold out) starts a fresh attempt.
    var payKey = null, payToken = null;
    // Kept for this browser tab too, so reloading the page after a dropped connection still can't charge twice.
    // It only applies to the same bag, total and email; it's cleared once the order is confirmed or declined.
    var PAY = 'mh-pay-attempt';
    function attemptFor(sig) { try { var a = JSON.parse(sessionStorage.getItem(PAY) || 'null'); return a && a.sig === sig ? a : null; } catch (e) { return null; } }
    var paySig = null;
    function keepAttempt(sig) { paySig = sig; try { sessionStorage.setItem(PAY, JSON.stringify({ sig: sig, key: payKey, token: payToken })); } catch (e) { /* storage blocked */ } }
    function dropAttempt() { payKey = null; payToken = null; try { sessionStorage.removeItem(PAY); } catch (e) { /* storage blocked */ } }
    function loadSquare() {
      if (window.Square) return Promise.resolve();
      return new Promise(function (resolve, reject) {
        var sc = document.createElement('script'); sc.src = window.MH_SQUARE.sdkUrl; sc.onload = resolve; sc.onerror = reject;
        document.head.appendChild(sc);
      });
    }
    if (!PREVIEW) $('.co-express').remove();
    if (!PREVIEW && window.MH_SQUARE) {
      $('#card-container').innerHTML = '<p class="co-help">Loading Square\'s secure card form…</p>';
      loadSquare().then(function () {
        var payments = window.Square.payments(window.MH_SQUARE.appId, window.MH_SQUARE.locationId);
        return payments.card().then(function (c) { $('#card-container').innerHTML = ''; card = c; return c.attach('#card-container'); });
      }).catch(function () { $('#card-container').innerHTML = ''; $('#co-pay-err').textContent = 'The card form didn\'t load. Please refresh the page.'; });
    } else if (!PREVIEW) {
      $('#card-container').innerHTML = '<p>Card payments are being set up. Please email hello@mirrorhousemelbourne.com.au to order.</p>';
    }

    function collect(t) {
      var pickup = t.pickup;
      var first = (pickup ? $('#co-pfirst') : $('#co-first')).value.trim(), last = (pickup ? $('#co-plast') : $('#co-last')).value.trim();
      return {
        email: $('#co-email').value.trim(), phone: $('#co-phone').value.trim(), marketing: $('#co-news').checked,
        name: first + ' ' + last, method: pickup ? 'pickup' : 'delivery',
        address: pickup ? null : { line1: $('#co-line1').value.trim() + ($('#co-line2').value.trim() ? ', ' + $('#co-line2').value.trim() : ''), suburb: $('#co-suburb').value.trim(), state: $('#co-state').value, postcode: $('#co-postcode').value.trim() },
        deliveryDay: pickup ? null : $('#co-day').value || null, note: pickup ? '' : $('#co-notes').value.trim(),
        zone: t.zone ? t.zone.id : null, quote_request: !!t.quote, discount_code: appliedCode,
        items: lines.map(function (l) { return { slug: l.product.slug, qty: l.qty }; })
      };
    }

    function confirmation(number, t, data, previewNote) {
      writeCart({});
      if (!PREVIEW) dropAttempt();
      var gaItems = lines.map(function (l) { return gaItem(l.product, l.qty); });
      if (t.quote) track('generate_lead', { currency: 'AUD', value: t.total / 100, lead_source: 'delivery_quote', items: gaItems });
      else track('purchase', { transaction_id: String(number || ''), currency: 'AUD', value: t.total / 100, shipping: (t.delivery || 0) / 100, coupon: data.discount_code || undefined, items: gaItems });
      root.innerHTML = '<div class="panel confirmation co-confirm"><div class="tick" aria-hidden="true">✓</div>' +
        '<p class="section-subtitle">Thank you, ' + esc(data.name.split(' ')[0]) + '</p>' +
        (t.quote ? '<h2>Quote request ' + esc(number || '') + ' received</h2>' +
          '<p class="section-desc">Nothing has been charged. We\'ll email ' + esc(data.email) + ' a delivery quote within one business day, with a secure Square link to pay for your mirror and delivery together. Your mirror is held for 7 days.</p>'
        : '<h2>Order ' + esc(number || '') + ' confirmed</h2>' +
          '<p class="section-desc">We\'ve sent a confirmation to ' + esc(data.email) + '. ' + (data.method === 'pickup' ? 'We\'ll be in touch to arrange a pick-up time.' : 'We\'ll call or text ' + esc(data.phone) + ' to confirm your delivery day.') + '</p>') +
        '<div class="co-confirm-grid"><div><h3>' + (data.method === 'pickup' ? 'Pick-up' : 'Delivering to') + '</h3><p>' + (data.method === 'pickup' ? 'Point Cook studio, by appointment' : esc(data.name) + '<br>' + esc(data.address.line1) + '<br>' + esc(data.address.suburb + ' ' + data.address.state + ' ' + data.address.postcode)) + '</p>' +
        (data.deliveryDay ? '<p>Preferred day: ' + esc(new Date(data.deliveryDay + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })) + '</p>' : '') + '</div>' +
        '<div><h3>' + (t.quote ? 'Mirror total' : 'Paid') + '</h3><p>' + money(t.total) + (t.quote ? ' plus delivery (quote to follow)' : '') + (gstRegistered() ? '<br><span class="drawer-tax-note">Including ' + money(Math.round(t.total / 11)) + ' GST</span>' : '') + '</p></div></div>' +
        (t.quote ? '' : '<p class="drawer-tax-note">Please open and check your mirror with our team on delivery. If anything isn\'t perfect, email photos within 24 hours.</p>') +
        '<p class="drawer-tax-note">Mirrorhousemelbourne · ABN 50 417 829 779</p>' +
        (previewNote || '') +
        '<a class="btn btn-secondary" href="index.html">Continue shopping</a></div>';
      window.scrollTo(0, 0);
    }

    function previewOrder(t, data) {
      var number = null, saved = false;
      try {
        var admin = JSON.parse(localStorage.getItem('mh-admin-v1') || 'null');
        if (admin && admin.orders) {
          var id = admin.orders.reduce(function (m, o) { return Math.max(m, o.id); }, 1000) + 1, now = Date.now();
          admin.orders.push({ id: id, number: '#' + id, test: true, createdAt: now, customerId: data.email,
            customer: { name: data.name, email: data.email, phone: data.phone }, address: data.address, method: data.method, zone: data.zone, deliveryDay: data.deliveryDay,
            lines: lines.map(function (l) { return { slug: l.product.slug, title: l.product.name, price: l.product.price_cents, qty: l.qty }; }),
            subtotal: t.subtotal, discountCode: appliedCode, discount: t.discount, delivery: t.delivery, insurance: 0, total: t.total,
            payment: t.quote ? 'awaiting_quote' : 'pending', card: t.quote ? 'No payment yet: waiting for your delivery quote' : 'Not charged (preview)', fulfilment: t.quote ? 'on_hold' : 'unfulfilled', tracking: '', note: data.note,
            events: t.quote ? [{ at: now, text: 'Delivery quote requested from the preview checkout (address outside your zones). Nothing charged.' }] : [{ at: now, text: 'Test order placed from the preview checkout. Nothing was charged.' }],
            marketing: data.marketing });
          if (!t.quote) lines.forEach(function (l) { // paid orders take the mirrors out of stock
            var ap = (admin.products || []).filter(function (x) { return x.slug === l.product.slug; })[0];
            if (ap && ap.stock != null && ap.stock !== '') ap.stock = Math.max(0, (parseInt(ap.stock, 10) || 0) - l.qty);
          });
          localStorage.setItem('mh-admin-v1', JSON.stringify(admin));
          number = '#' + id; saved = true;
        }
      } catch (err) { saved = false; }
      confirmation(number, t, data, '<p class="co-preview-note"><strong>Preview:</strong> nothing was charged and no email was sent. ' +
        (saved ? 'This test ' + (t.quote ? 'quote request' : 'order') + ' is now in your admin under Orders. <a href="admin-dashboard.html#/orders/' + esc(number.slice(1)) + '">See it in the admin</a>' : 'Sign in to the admin once in this browser and test orders will appear there.') + '</p>');
    }

    $('#checkout-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = $('#co-msg'); msg.className = 'form-msg'; msg.textContent = '';
      var ok = true, firstBad = null;
      required().forEach(function (id) { if (!check(id)) { ok = false; firstBad = firstBad || id; } });
      var t = totals();
      if (!t.pickup && t.zone && t.zone.none) { ok = false; firstBad = firstBad || 'co-postcode'; setErr('co-postcode', 'We don\'t deliver here yet. Choose pick-up instead.'); }
      if (!ok) { msg.textContent = 'Please check the highlighted details.'; msg.className = 'form-msg error'; var el = $('#' + firstBad); if (el) { el.focus(); el.scrollIntoView({ block: 'center' }); } return; }
      var data = collect(t);
      if (PREVIEW) { previewOrder(t, data); return; }
      var submit = $('#co-submit');
      submit.disabled = true;
      msg.textContent = t.quote ? 'Sending your request…' : 'Processing your payment…';
      // A retry after a lost reply re-sends the same card token with the same key (see payKey above).
      var sig = JSON.stringify([data.items, t.total, data.email, data.method]);
      var saved = !t.quote && attemptFor(sig);
      if (saved) { payKey = saved.key; payToken = saved.token; } else if (payKey && paySig !== sig) { payKey = null; payToken = null; } // bag, total or email changed
      var tokenP = t.quote ? Promise.resolve(null) : payKey && payToken ? Promise.resolve(payToken) : card ? card.tokenize().then(function (r) { if (r.status !== 'OK') throw new Error('Please check your card details.'); payToken = r.token; return r.token; }) : Promise.reject(new Error('Card payments aren\'t available yet.'));
      tokenP.then(function (token) {
        if (token) data.source_id = token;
        payKey = payKey || rid();
        data.idempotency_key = payKey;
        if (token) keepAttempt(sig);
        data.session_id = VISIT.sid;
        data.expected_total = t.total; // the server refuses the payment if its total differs from what was shown
        return fetch('/api/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
          .then(function (r) {
            return r.json().catch(function () { return null; }).then(function (d) {
              if (!d || r.status >= 500) { var e = new Error('We couldn\'t hear back from our server. Please try again: you won\'t be charged twice.'); e.unsure = true; throw e; }
              return { ok: r.ok && r.status !== 202, status: r.status, d: d };
            });
          }, function () { var e = new Error('Your connection dropped. Please try again: you won\'t be charged twice.'); e.unsure = true; throw e; });
      }).then(function (res) {
        if (res.status === 202) { var p = new Error(res.d.error); p.pending = true; throw p; }
        if (!res.ok) { var e = new Error(res.d.error || 'We couldn\'t place the order.'); e.field = res.d.field; if (res.status !== 409 || res.d.field) dropAttempt(); throw e; }
        t.total = res.d.total_cents != null ? res.d.total_cents : t.total;
        confirmation('#' + res.d.order_id, t, data);
      }).catch(function (err) {
        if (err.pending) { msg.textContent = err.message; msg.className = 'form-msg error'; return; } // keep Pay switched off
        submit.disabled = false;
        msg.textContent = err.message || 'We couldn\'t place the order. Please try again.';
        msg.className = 'form-msg error';
        if (err.field === 'co-pay') $('#co-pay-err').textContent = err.message;
        else if (err.field === 'co-code') { var cm = $('#co-code-msg'); cm.textContent = err.message; cm.className = 'form-msg error'; appliedCode = null; totals(); }
        else if (err.field && $('#' + err.field)) { setErr(err.field, err.message); $('#' + err.field).focus(); }
      });
    });
  }

  // ---------- full-screen photo viewer ----------
  var lbLast = null;
  function openLightbox(media) {
    var main = media && media.querySelector('.qv-main');
    if (!main) return;
    lbLast = document.activeElement;
    var box = document.createElement('div');
    box.id = 'mh-lightbox'; box.className = 'lightbox'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Photo: ' + main.alt);
    box.innerHTML = '<div class="lb-stage"><img src="' + esc(main.getAttribute('src')) + '" alt="' + esc(main.alt) + '" draggable="false"></div>' +
      '<div class="lb-tools"><button type="button" class="lb-zoom" data-lb-zoom="-1" aria-label="Zoom out">−</button><button type="button" class="lb-zoom" data-lb-zoom="1" aria-label="Zoom in">+</button></div>' +
      '<button type="button" class="lightbox-close" aria-label="Close photo">✕</button><p class="lightbox-hint">Tap the photo to zoom in on the detail · drag to look around</p>';
    document.body.appendChild(box);
    setupZoom(box);
    setTimeout(function () { var c = box.querySelector('.lightbox-close'); if (c) c.focus(); }, 30);
  }
  // Zoom on the enlarged photo: tap or click to zoom where you tapped, drag (or move the mouse) to look around,
  // + and − buttons, mouse wheel or pinch to change the zoom.
  function setupZoom(box) {
    var stage = box.querySelector('.lb-stage'), img = stage.querySelector('img');
    var z = 1, x = 0, y = 0, drag = null, moved = false, pts = {}, pinch = null;
    function clamp() {
      var r = img.getBoundingClientRect(), w = r.width / z, h = r.height / z;
      var mx = Math.max(0, (w * z - w) / 2), my = Math.max(0, (h * z - h) / 2);
      x = Math.max(-mx, Math.min(mx, x)); y = Math.max(-my, Math.min(my, y));
    }
    function apply() {
      img.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + z + ')';
      box.classList.toggle('is-zoomed', z > 1);
    }
    function zoomTo(nz, cx, cy) {
      nz = Math.max(1, Math.min(4, nz));
      var r = img.getBoundingClientRect(), ox = r.left + r.width / 2, oy = r.top + r.height / 2;
      if (cx == null) { cx = ox; cy = oy; }
      x -= (cx - ox) * (nz / z - 1); y -= (cy - oy) * (nz / z - 1);
      z = nz; if (z === 1) { x = 0; y = 0; }
      clamp(); apply();
    }
    box.zoomBy = function (d) { zoomTo(d > 0 ? z * 1.6 : z / 1.6); };
    stage.addEventListener('pointerdown', function (e) {
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(pts);
      if (ids.length === 2) { var a = pts[ids[0]], b = pts[ids[1]]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: z }; drag = null; return; }
      drag = { sx: e.clientX, sy: e.clientY, x: x, y: y }; moved = false;
    });
    stage.addEventListener('pointermove', function (e) {
      if (pts[e.pointerId]) pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (pinch) { var ids = Object.keys(pts); if (ids.length === 2) { var a = pts[ids[0]], b = pts[ids[1]]; zoomTo(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2); moved = true; } return; }
      if (drag && z > 1) {
        var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
        if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
        x = drag.x + dx; y = drag.y + dy; clamp(); apply();
      }
    });
    function up(e) { delete pts[e.pointerId]; if (Object.keys(pts).length < 2) pinch = null; drag = null; }
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
    stage.addEventListener('wheel', function (e) { e.preventDefault(); zoomTo(z * (e.deltaY < 0 ? 1.25 : 0.8), e.clientX, e.clientY); }, { passive: false });
    img.addEventListener('click', function (e) {
      e.stopPropagation();
      if (moved) { moved = false; return; }
      if (z > 1) zoomTo(1); else zoomTo(2.5, e.clientX, e.clientY);
    });
  }
  function closeLightbox() {
    var box = $('#mh-lightbox');
    if (!box) return false;
    box.remove();
    if (lbLast && lbLast.focus) lbLast.focus();
    return true;
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
      return;
    }
    if ((el = t.closest('a[href*="category="], a[href*="collection="]')) && showCategory) {
      var key = null;
      try { var sp = new URL(el.getAttribute('href'), location.href).searchParams; key = collectionFromQuery(sp.get('collection'), sp.get('category')); } catch (err) { /* ignore */ }
      if (key) { e.preventDefault(); showCategory(key); return; }
    }
    if ((el = t.closest('[data-swatch]'))) { // colour dot on a shop card
      var sv = bySlug(cardProducts, el.getAttribute('data-swatch')), card = el.closest('.product-card');
      if (sv && card) {
        var tmp = document.createElement('div'); tmp.innerHTML = cardHtml(sv, variantsOf(cardProducts, sv));
        var fresh = tmp.firstChild; card.replaceWith(fresh);
        var again = fresh.querySelector('[data-swatch="' + sv.slug + '"]'); if (again) again.focus();
      }
      return;
    }
    if ((el = t.closest('[data-variant]'))) { // colour choice on the product page or quick view
      var dv = bySlug(allProducts, el.getAttribute('data-variant'));
      if (dv) {
        var qvc = el.closest('#quickview-content'), pd = el.closest('#product-detail');
        if (qvc) qvc.innerHTML = detailHtml(dv);
        else if (pd) {
          pd.innerHTML = detailHtml(dv, 'h1');
          document.title = dv.name + ' | Mirror House Melbourne';
          var cr = $('#crumb-name'); if (cr) cr.textContent = dv.name;
          try { var u = new URL(location.href); u.searchParams.set('slug', dv.slug); history.replaceState(null, '', u); } catch (err) { /* preview */ }
        }
        var b2 = document.querySelector('[data-variant="' + dv.slug + '"]'); if (b2) b2.focus();
      }
      return;
    }
    if ((el = t.closest('[data-add]'))) {
      if (SOLD_OUT[el.getAttribute('data-add')]) { e.preventDefault(); toast('Sorry, this mirror is sold out.'); return; }
      var as = el.getAttribute('data-add'), added = addToBag(as, 1);
      if (!added) { toast('Only ' + maxQty(as) + ' left in stock, and they\'re already in your bag.'); return; }
      loadProducts().then(function (ps) { var p = bySlug(ps, as); toast((p ? p.name : 'Item') + ' added to your bag'); });
      return;
    }
    if ((el = t.closest('[data-quick]')) || (PREVIEW && (el = t.closest('[data-product-link]')))) {
      e.preventDefault();
      var slug = el.getAttribute('data-quick') || el.getAttribute('data-product-link');
      loadProducts().then(function (ps) { var p = bySlug(ps, slug); if (p) openQuickView(p); });
      return;
    }
    if ((el = t.closest('[data-enlarge]'))) { openLightbox(el.closest('.qv-media')); return; }
    if ((el = t.closest('[data-lb-zoom]'))) { var lb = $('#mh-lightbox'); if (lb && lb.zoomBy) lb.zoomBy(+el.getAttribute('data-lb-zoom')); return; }
    if (t.closest('.lb-stage img')) return;
    if (t.closest('#mh-lightbox')) { closeLightbox(); return; }
    if ((el = t.closest('[data-gallery]'))) {
      var media = el.closest('.qv-media'), main = media && media.querySelector('.qv-main');
      var first = media.querySelector('[data-gallery]') === el;
      if (main) { main.src = el.getAttribute('data-gallery'); main.alt = el.getAttribute('data-alt'); main.style.objectFit = first ? '' : 'contain'; }
      media.querySelectorAll('[data-gallery]').forEach(function (b) { b.setAttribute('aria-pressed', String(b === el)); });
      return;
    }
    if ((el = t.closest('[data-detail-qty]'))) {
      var q = $('#detail-qty');
      var dq = $('[data-detail-add]'), lim = dq ? maxQty(dq.getAttribute('data-detail-add')) : 20;
      q.textContent = Math.max(1, Math.min(lim, parseInt(q.textContent, 10) + parseInt(el.getAttribute('data-detail-qty'), 10)));
      return;
    }
    if ((el = t.closest('[data-detail-add]'))) {
      if (SOLD_OUT[el.getAttribute('data-detail-add')]) { toast('Sorry, this mirror is sold out.'); return; }
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
    if (e.key === 'Escape') { if (closeLightbox()) return; closeQuickView(); closeDrawer(); }
  });
  window.addEventListener('storage', function (e) { if (e.key === 'mh-cart') renderBag(); });

  // ---------- boot ----------
  function boot() {
    ensureDrawer();
    var qv = $('#quickview-overlay');
    if (qv) qv.inert = true;
    renderBag();
    loadProducts().then(function (products) {
      allProducts = products;
      renderCatalogue(products);
      renderProductPage(products);
      renderCheckout(products);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

// Admin quick-access button.
// Only appears for you once you're signed in to the admin. Everyone else never sees it.
// Live site: shown only in a browser that's signed in to the admin (Netlify Identity keeps the sign-in in this
// browser). It's only a shortcut: the admin itself checks the sign-in on the server.
// Preview: shown while you're signed in to the preview admin in this browser (30 minutes without activity signs you out).
(function () {
  var actions = document.querySelector('.header-actions');
  if (!actions) return;
  var PREVIEW = !!window.MH_PREVIEW, IDLE = 30 * 60000, KEY = 'mh-admin-signed-in';
  function show() {
    if (actions.querySelector('.admin-link-pill')) return;
    var a = document.createElement('a');
    a.href = PREVIEW ? 'admin-dashboard.html' : '/admin-dashboard.html';
    a.className = 'admin-link-pill';
    a.title = 'Admin dashboard (only you can see this)';
    a.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true" focusable="false"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> <span class="label">Admin</span>';
    actions.insertBefore(a, actions.firstChild);
  }
  function hide() { var a = actions.querySelector('.admin-link-pill'); if (a) a.remove(); }
  if (PREVIEW) {
    var check = function () {
      var t = 0;
      try { t = parseInt(localStorage.getItem(KEY) || '0', 10); } catch (e) { t = 0; }
      if (t && Date.now() - t < IDLE) show(); else hide();
    };
    check();
    // Using the shop counts as activity, so you stay signed in while you move between shop and admin.
    var last = 0;
    ['pointerdown', 'keydown', 'scroll'].forEach(function (ev) {
      window.addEventListener(ev, function () {
        if (Date.now() - last < 20000) return;
        last = Date.now();
        try { var t = parseInt(localStorage.getItem(KEY) || '0', 10); if (t && Date.now() - t < IDLE) localStorage.setItem(KEY, String(Date.now())); } catch (e) { /* blocked */ }
      }, { passive: true });
    });
    window.addEventListener('storage', function (e) { if (e.key === KEY) check(); });
    setInterval(check, 60000);
    return;
  }
  try { if (localStorage.getItem('gotrue.user')) show(); } catch (e) { /* storage blocked */ }
})();

// Signature piece: switch the photos between the gold and black frames.
(function () {
  var buttons = document.querySelectorAll('.finish-btn');
  if (!buttons.length) return;
  Array.prototype.forEach.call(buttons, function (btn) {
    btn.addEventListener('click', function () {
      var finish = btn.getAttribute('data-finish');
      Array.prototype.forEach.call(buttons, function (b) {
        var on = b === btn;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      Array.prototype.forEach.call(document.querySelectorAll('.curated-gallery img[data-' + finish + ']'), function (img) {
        img.src = img.getAttribute('data-' + finish);
        img.alt = img.alt.replace(/gold|black/i, finish);
      });
      var shop = document.querySelector('.curated-shop-link[data-' + finish + ']');
      if (shop) shop.href = shop.getAttribute('data-' + finish);
    });
  });
})();

// Social media links, set in Admin → Settings (window.MH_SOCIAL from /api/config.js). An icon shows only when
// its link is set: in the footer, and in the header on wider screens. The links are also added to the
// Organization in the page's schema.org data (sameAs).
(function () {
  var s = window.MH_SOCIAL || {};
  var ICONS = {
    instagram: ['Instagram', '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>'],
    facebook: ['Facebook', '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true" focusable="false"><path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z"/></svg>']
  };
  var safe = function (u) { return /^https:\/\/(www\.)?(instagram|facebook)\.com\//.test(String(u || '')); };
  var links = ['instagram', 'facebook'].filter(function (k) { return safe(s[k]); });
  if (!links.length) return;
  function make(cls) {
    var wrap = document.createElement('div');
    wrap.className = cls;
    links.forEach(function (k) {
      var a = document.createElement('a');
      a.href = s[k]; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.className = 'social-link social-' + k;
      a.setAttribute('aria-label', 'Mirror House on ' + ICONS[k][0] + ' (opens in a new tab)');
      a.title = ICONS[k][0];
      a.innerHTML = ICONS[k][1];
      wrap.appendChild(a);
    });
    return wrap;
  }
  var col = document.querySelector('.site-footer .footer-col');
  if (col) col.appendChild(make('footer-social'));
  var actions = document.querySelector('.header-actions');
  if (actions) actions.insertBefore(make('header-social'), actions.querySelector('.open-cart-btn'));
  var ld = document.querySelector('script[type="application/ld+json"]');
  if (ld) {
    try {
      var data = JSON.parse(ld.textContent);
      (data['@graph'] || [data]).forEach(function (n) { if (n['@type'] === 'Organization') n.sameAs = links.map(function (k) { return s[k]; }); });
      ld.textContent = JSON.stringify(data);
    } catch (e) { /* leave the schema as it is */ }
  }
})();
