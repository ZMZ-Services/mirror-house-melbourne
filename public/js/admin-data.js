// Mirror House admin: data layer.
// In this preview everything is kept in this browser (localStorage). On the live site your developer
// swaps the load/save functions for calls to the Worker API (/api/admin/...) backed by the D1 database.
(function () {
  'use strict';

  var KEY = 'mh-admin-v1';
  var DAY = 86400000;

  // ---------- helpers ----------
  function rng(seed) { // mulberry32: same sample data every time
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }
  function weighted(r, items) { // [[value, weight], ...]
    var total = items.reduce(function (s, i) { return s + i[1]; }, 0), x = r() * total;
    for (var i = 0; i < items.length; i++) { x -= items[i][1]; if (x <= 0) return items[i][0]; }
    return items[items.length - 1][0];
  }
  function poisson(r, lambda) {
    var L = Math.exp(-lambda), k = 0, p = 1;
    do { k++; p *= r(); } while (p > L);
    return k - 1;
  }
  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function dayKey(d) { var x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); }
  function slugify(s) { return String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80); }

  // ---------- default store set-up ----------
  var PRODUCTS = [
    { slug: 'paris-window-pane-mirror-white', title: 'Paris Window Pane Mirror – White', category: 'Floor Mirrors', price: 30000, compareAt: null, cost: null,
      status: 'active', stock: 3, lowAt: 1, supplierCode: '24Ld052702', sku: 'MH-PARIS-WHT', weight: '', size: '200 cm high × 100 cm wide', badge: 'New', bothWays: false,
      images: ["images/products/paris-window-pane-mirror-white.jpg", "images/products/paris-window-pane-mirror-pair.jpg"],
      desc: "Bring the charm of a Parisian window into your home. The Paris is a 2-metre full-length mirror with a crisp white frame divided into 24 classic window panes, framing your room like a sunlit view. Fresh and coastal, it adds light, depth and character to living rooms, bedrooms and entryways. Hang it on the wall or lean it against it.",
      specs: ["200 cm high × 100 cm wide", "Window-pane design with a crisp white frame", "Hang on the wall or lean against it", "Also available in Black", "Ships in a heavy-duty cardboard box with protective foam"] },
    { slug: 'paris-window-pane-mirror-black', title: 'Paris Window Pane Mirror – Black', category: 'Floor Mirrors', price: 30000, compareAt: null, cost: null,
      status: 'active', stock: 2, lowAt: 1, supplierCode: '24Ld052702', sku: 'MH-PARIS-BLK', weight: '', size: '200 cm high × 100 cm wide', badge: 'New', bothWays: false,
      images: ["images/products/paris-window-pane-mirror-black.jpg", "images/products/paris-window-pane-mirror-pair.jpg"],
      desc: "Bring the charm of a Parisian window into your home. The Paris is a 2-metre full-length mirror with a classic black frame divided into 24 classic window panes, framing your room like a sunlit view. Bold and architectural, it adds light, depth and character to living rooms, bedrooms and entryways. Hang it on the wall or lean it against it.",
      specs: ["200 cm high × 100 cm wide", "Window-pane design with a classic black frame", "Hang on the wall or lean against it", "Also available in White", "Ships in a heavy-duty cardboard box with protective foam"] },
    { slug: 'cut-above-knife-mirror-black', title: 'Cut Above Knife Mirror – Black', category: 'Wall Mirrors', price: 25000, compareAt: null, cost: null,
      status: 'active', stock: 4, lowAt: 1, supplierCode: '24LD062402', sku: 'MH-KNIFE-BLK', weight: '', size: '200 cm high × 40 cm wide', badge: 'New', bothWays: false,
      images: ["images/products/cut-above-knife-mirror-black.jpg", "images/products/cut-above-knife-mirror-black-venue.jpg"],
      desc: "A cut above the rest. Shaped like an oversized chef's knife, this 2-metre statement mirror pairs a sleek black handle, complete with polished rivet details, with a mirrored blade that reflects the room around it. Mount it on a feature wall or stand it freestanding, and watch it become the talking point of any restaurant, bar, café or modern home. Make your space stand out with a designer piece nobody will forget.",
      specs: ["200 cm high × 40 cm wide", "Unique knife-shaped design", "Stylish black finish with rivet details on the handle", "Mount on the wall or use freestanding", "Perfect for restaurants and bars, cafés and commercial fit-outs, feature walls, modern homes and entertainment areas", "Ships in a heavy-duty cardboard box with protective foam"] },
    { slug: 'belle-beaded-mirror-silver', title: 'Belle Beaded Mirror – Silver', category: 'Floor Mirrors', price: 24000, compareAt: null, cost: null,
      status: 'active', stock: 4, lowAt: 1, supplierCode: '123D302-BIG', sku: 'MH-BELLE-SLV', weight: '', size: '190 cm high × 90 cm wide', badge: 'New', bothWays: false,
      images: ["images/products/belle-beaded-mirror-silver.jpg", "images/products/belle-beaded-mirror-colours.jpg"],
      desc: "Light-catching glamour from every angle. The Belle is a 190 cm full-length mirror framed by a wide border of bevelled mirror panels, edged inside and out with rows of polished silver beading. Mirror on mirror bounces light around the room for a look that's fresh, bright and endlessly versatile, perfect for bedrooms, dressing rooms, living rooms and entryways. Hang it on the wall or lean it against it.",
      specs: ["190 cm high × 90 cm wide", "Bevelled mirror border with polished silver beaded trim", "Hang on the wall or lean against it", "Full-length statement mirror", "Also available in Black and Gold", "Ships in a heavy-duty cardboard box with protective foam"] },
    { slug: 'belle-beaded-mirror-black', title: 'Belle Beaded Mirror – Black', category: 'Floor Mirrors', price: 24000, compareAt: null, cost: null,
      status: 'active', stock: 4, lowAt: 1, supplierCode: '123D302-BIG', sku: 'MH-BELLE-BLK', weight: '', size: '190 cm high × 90 cm wide', badge: 'New', bothWays: false,
      images: ["images/products/belle-beaded-mirror-black.jpg", "images/products/belle-beaded-mirror-colours.jpg"],
      desc: "Light-catching glamour from every angle. The Belle is a 190 cm full-length mirror framed by a wide border of bevelled mirror panels, edged inside and out with rows of glossy black beading. Mirror on mirror bounces light around the room for a look that's bold, crisp and modern, perfect for bedrooms, dressing rooms, living rooms and entryways. Hang it on the wall or lean it against it.",
      specs: ["190 cm high × 90 cm wide", "Bevelled mirror border with glossy black beaded trim", "Hang on the wall or lean against it", "Full-length statement mirror", "Also available in Silver and Gold", "Ships in a heavy-duty cardboard box with protective foam"] },
    { slug: 'belle-beaded-mirror-gold', title: 'Belle Beaded Mirror – Gold', category: 'Floor Mirrors', price: 24000, compareAt: null, cost: null,
      status: 'active', stock: 4, lowAt: 1, supplierCode: '123D302-BIG', sku: 'MH-BELLE-GLD', weight: '', size: '190 cm high × 90 cm wide', badge: 'New', bothWays: false,
      images: ["images/products/belle-beaded-mirror-gold.jpg", "images/products/belle-beaded-mirror-colours.jpg"],
      desc: "Light-catching glamour from every angle. The Belle is a 190 cm full-length mirror framed by a wide border of bevelled mirror panels, edged inside and out with rows of warm gold beading. Mirror on mirror bounces light around the room for a look that's warm, glamorous and luxe, perfect for bedrooms, dressing rooms, living rooms and entryways. Hang it on the wall or lean it against it.",
      specs: ["190 cm high × 90 cm wide", "Bevelled mirror border with warm gold beaded trim", "Hang on the wall or lean against it", "Full-length statement mirror", "Also available in Silver and Black", "Ships in a heavy-duty cardboard box with protective foam"] },
    { slug: 'haven-soft-arch-mirror-warm-wood', title: 'Haven Soft Arch Mirror – Warm Wood', category: 'Floor Mirrors', price: 30000, compareAt: null, cost: null,
      status: 'active', stock: 4, lowAt: 1, supplierCode: '25LD091004', sku: 'MH-HAVEN-WWD', weight: '', size: '190 cm high × 100 cm wide', badge: 'New', bothWays: false,
      images: ["images/products/haven-soft-arch-mirror-warm-wood.jpg", "images/products/haven-soft-arch-mirror-detail.jpg", "images/products/haven-soft-arch-mirror-back.jpg"],
      desc: "Soft, sculptural and beautifully simple. The Haven is a 190 cm arched floor mirror with a thick, rounded frame in a warm honey-toned wood that curves gently around every edge, from the arched top to the softly rounded base. Warm and inviting, it brings light and a relaxed, modern feel to bedrooms, living rooms and entryways. Lean it against the wall, or hang it using the sturdy hangers on the back.",
      specs: ["190 cm high × 100 cm wide", "Thick, rounded frame in warm honey-toned wood", "Arched top with softly rounded base corners", "Hang on the wall (hangers on the back) or lean against it", "Also available in Dark Brown, Black, Natural and White", "Ships in a heavy-duty cardboard box with protective foam"] },
    { slug: 'haven-soft-arch-mirror-walnut', title: 'Haven Soft Arch Mirror – Dark Brown', category: 'Floor Mirrors', price: 30000, compareAt: null, cost: null,
      status: 'active', stock: 4, lowAt: 1, supplierCode: '25LD091004', sku: 'MH-HAVEN-DBR', weight: '', size: '190 cm high × 100 cm wide', badge: 'New', bothWays: false,
      images: ["images/products/haven-soft-arch-mirror-walnut.jpg", "images/products/haven-soft-arch-mirror-detail.jpg", "images/products/haven-soft-arch-mirror-back.jpg"],
      desc: "Soft, sculptural and beautifully simple. The Haven is a 190 cm arched floor mirror with a thick, rounded frame in a rich dark brown that curves gently around every edge, from the arched top to the softly rounded base. Warm and grounded, it brings light and a relaxed, modern feel to bedrooms, living rooms and entryways. Lean it against the wall, or hang it using the sturdy hangers on the back.",
      specs: ["190 cm high × 100 cm wide", "Thick, rounded frame in rich dark brown", "Arched top with softly rounded base corners", "Hang on the wall (hangers on the back) or lean against it", "Also available in Warm Wood, Black, Natural and White", "Ships in a heavy-duty cardboard box with protective foam"] },
    { slug: 'haven-soft-arch-mirror-black', title: 'Haven Soft Arch Mirror – Black', category: 'Floor Mirrors', price: 30000, compareAt: null, cost: null,
      status: 'active', stock: 4, lowAt: 1, supplierCode: '25LD091004', sku: 'MH-HAVEN-BLK', weight: '', size: '190 cm high × 100 cm wide', badge: 'New', bothWays: false,
      images: ["images/products/haven-soft-arch-mirror-black.jpg", "images/products/haven-soft-arch-mirror-detail.jpg", "images/products/haven-soft-arch-mirror-back.jpg"],
      desc: "Soft, sculptural and beautifully simple. The Haven is a 190 cm arched floor mirror with a thick, rounded frame in a deep black finish that curves gently around every edge, from the arched top to the softly rounded base. Bold and modern, it brings light and a relaxed, modern feel to bedrooms, living rooms and entryways. Lean it against the wall, or hang it using the sturdy hangers on the back.",
      specs: ["190 cm high × 100 cm wide", "Thick, rounded frame in deep black finish", "Arched top with softly rounded base corners", "Hang on the wall (hangers on the back) or lean against it", "Also available in Warm Wood, Dark Brown, Natural and White", "Ships in a heavy-duty cardboard box with protective foam"] },
    { slug: 'haven-soft-arch-mirror-natural', title: 'Haven Soft Arch Mirror – Natural', category: 'Floor Mirrors', price: 30000, compareAt: null, cost: null,
      status: 'active', stock: 4, lowAt: 1, supplierCode: '25LD091004', sku: 'MH-HAVEN-NAT', weight: '', size: '190 cm high × 100 cm wide', badge: 'New', bothWays: false,
      images: ["images/products/haven-soft-arch-mirror-natural.jpg", "images/products/haven-soft-arch-mirror-detail.jpg", "images/products/haven-soft-arch-mirror-back.jpg"],
      desc: "Soft, sculptural and beautifully simple. The Haven is a 190 cm arched floor mirror with a thick, rounded frame in a light natural timber that curves gently around every edge, from the arched top to the softly rounded base. Calm and organic, it brings light and a relaxed, modern feel to bedrooms, living rooms and entryways. Lean it against the wall, or hang it using the sturdy hangers on the back.",
      specs: ["190 cm high × 100 cm wide", "Thick, rounded frame in light natural timber", "Arched top with softly rounded base corners", "Hang on the wall (hangers on the back) or lean against it", "Also available in Warm Wood, Dark Brown, Black and White", "Ships in a heavy-duty cardboard box with protective foam"] },
    { slug: 'haven-soft-arch-mirror-white', title: 'Haven Soft Arch Mirror – White', category: 'Floor Mirrors', price: 30000, compareAt: null, cost: null,
      status: 'active', stock: 4, lowAt: 1, supplierCode: '25LD091004', sku: 'MH-HAVEN-WHT', weight: '', size: '190 cm high × 100 cm wide', badge: 'New', bothWays: false,
      images: ["images/products/haven-soft-arch-mirror-white.jpg", "images/products/haven-soft-arch-mirror-detail.jpg", "images/products/haven-soft-arch-mirror-back.jpg"],
      desc: "Soft, sculptural and beautifully simple. The Haven is a 190 cm arched floor mirror with a thick, rounded frame in a soft white finish that curves gently around every edge, from the arched top to the softly rounded base. Bright, fresh and airy, it brings light and a relaxed, modern feel to bedrooms, living rooms and entryways. Lean it against the wall, or hang it using the sturdy hangers on the back.",
      specs: ["190 cm high × 100 cm wide", "Thick, rounded frame in soft white finish", "Arched top with softly rounded base corners", "Hang on the wall (hangers on the back) or lean against it", "Also available in Warm Wood, Dark Brown, Black and Natural", "Ships in a heavy-duty cardboard box with protective foam"] },
    { slug: 'riviera-rounded-floor-mirror-gold', title: 'Riviera Rounded Floor Mirror – Gold', category: 'Floor Mirrors', price: 33000, compareAt: null, cost: null,
      status: 'active', stock: 0, sku: 'MH-RIV-GLD', weight: '', size: '200 cm high × 100 cm wide', badge: '', bothWays: false,
      images: ["images/products/riviera-rounded-floor-mirror-gold.jpg", "images/products/riviera-rounded-floor-mirror-gold-back.jpg"],
      desc: "Soft curves meet golden glamour. The Riviera is a 200 cm full-length floor mirror in a slim gold metal frame with gently rounded corners, bringing warmth, light and an elegant, modern-luxe feel to any room. Perfect for bedrooms, living rooms, dressing rooms and entryways. Lean it against the wall, or hang it using the sturdy D-ring hangers on the back.",
      specs: ["200 cm high × 100 cm wide", "Slim gold metal frame with softly rounded corners", "Hang on the wall (D-ring hangers on the back) or lean against it", "Full-length floor mirror", "Ships in a heavy-duty cardboard box with protective foam"] },
    { slug: 'soho-slim-frame-mirror-black', title: 'Soho Slim Frame Mirror – Black', category: 'Floor Mirrors', price: 25000, compareAt: null, cost: null,
      status: 'active', stock: 8, lowAt: 1, supplierCode: 'Q1085', sku: 'MH-SOHO-BLK', weight: '', size: '190 cm high × 90 cm wide', badge: 'New', bothWays: false,
      images: ["images/products/soho-slim-frame-mirror-black.jpg", "images/products/soho-slim-frame-mirror-black-detail.jpg"],
      desc: "Clean, modern and effortlessly versatile. The Soho is a 190 cm full-length mirror in a slim black metal frame with crisp, mitred corners, letting the reflection take centre stage. It brightens and opens up bedrooms, living rooms, hallways and entryways, and suits everything from minimalist to Hamptons interiors. Hang it on the wall or lean it against it.",
      specs: ["190 cm high × 90 cm wide", "Slim black metal frame with mitred corners", "Hang on the wall or lean against it", "Full-length rectangle mirror", "Ships in a heavy-duty cardboard box with protective foam"] },
    { slug: 'cathedral-arch-window-mirror-black', title: 'Cathedral Arch Window Mirror – Black', category: 'Floor Mirrors', price: 30000, compareAt: null, cost: null,
      status: 'active', stock: 2, sku: 'MH-CATH-BLK', weight: '', size: '190 cm high × 100 cm wide', badge: 'New', bothWays: false,
      images: ["images/products/cathedral-arch-window-mirror-black-styled.jpg", "images/products/cathedral-arch-window-mirror-black-2.jpg", "images/products/cathedral-arch-window-mirror-black-arch.jpg", "images/products/cathedral-arch-window-mirror-black-detail.jpg", "images/products/cathedral-arch-window-mirror-black-back.jpg"],
      desc: "Step into timeless architecture with the Cathedral. A slim black metal frame traces a graceful arch, with a second arch set inside and fine window-pane bars fanning out above, like light through an old cathedral window. At 190 cm high and 100 cm wide, it brings height, light and character to living rooms, bedrooms and entryways. Lean it against the wall, or hang it using the sturdy wall hooks on the back.",
      specs: ["190 cm high × 100 cm wide", "Black metal frame with an inner arch and window-pane design", "Hang on the wall (wall hooks on the back) or lean against it", "Perfect for living rooms, bedrooms and entryways", "Ships in a heavy-duty cardboard box with protective foam"] },
    { slug: 'belgravia-crest-mirror-gold', title: 'Belgravia Crest Mirror – Gold', category: 'Floor Mirrors', price: 59900, compareAt: null, cost: null,
      status: 'active', stock: 2, lowAt: 1, supplierCode: 'LPU12302', sku: 'MH-BELG-GLD', weight: '', size: '210 cm high × 120 cm wide', badge: 'New', bothWays: false,
      images: ['images/products/belgravia-crest-mirror-gold-2.jpg', 'images/products/belgravia-crest-mirror-trio.jpg'],
      desc: "Grand, romantic and made to be noticed. The Belgravia is a 210 cm full-length mirror in a rich antique-gold frame, crowned with an ornate carved crest and finished with scrolled corner details and a fine beaded border. An inner panelled frame adds depth and old-world craftsmanship, making it a stunning focal point for living rooms, bedrooms, dressing rooms and grand entryways.",
      specs: ["210 cm high × 120 cm wide", "Ornate frame with a carved crest, scrolled corners and a beaded border", "Inner panelled frame for added depth", "Full-length statement mirror", "Also available in Champagne and Black", "Ships in a heavy-duty cardboard box with protective foam"] },
    { slug: 'belgravia-crest-mirror-champagne', title: 'Belgravia Crest Mirror – Champagne', category: 'Floor Mirrors', price: 59900, compareAt: null, cost: null,
      status: 'active', stock: 4, lowAt: 1, supplierCode: 'LPU12302', sku: 'MH-BELG-CHA', weight: '', size: '210 cm high × 120 cm wide', badge: 'New', bothWays: false,
      images: ['images/products/belgravia-crest-mirror-champagne-2.jpg', 'images/products/belgravia-crest-mirror-trio.jpg'],
      desc: "Grand, romantic and made to be noticed. The Belgravia is a 210 cm full-length mirror in a soft champagne frame, crowned with an ornate carved crest and finished with scrolled corner details and a fine beaded border. An inner panelled frame adds depth and old-world craftsmanship, bringing quiet luxury to living rooms, bedrooms, dressing rooms and grand entryways.",
      specs: ["210 cm high × 120 cm wide", "Ornate frame with a carved crest, scrolled corners and a beaded border", "Inner panelled frame for added depth", "Full-length statement mirror", "Also available in Gold and Black, and in 190 × 90 cm", "Ships in a heavy-duty cardboard box with protective foam"] },
    { slug: 'belgravia-crest-mirror-black', title: 'Belgravia Crest Mirror – Black', category: 'Floor Mirrors', price: 59900, compareAt: null, cost: null,
      status: 'active', stock: 4, lowAt: 1, supplierCode: 'LPU12302', sku: 'MH-BELG-BLK', weight: '', size: '210 cm high × 120 cm wide', badge: 'New', bothWays: false,
      images: ['images/products/belgravia-crest-mirror-black-2.jpg', 'images/products/belgravia-crest-mirror-trio.jpg'],
      desc: "Grand, romantic and made to be noticed. The Belgravia is a 210 cm full-length mirror in a deep black frame, crowned with an ornate carved crest and finished with scrolled corner details and a fine beaded border. An inner panelled frame adds depth and old-world craftsmanship, giving a dramatic, modern edge to living rooms, bedrooms, dressing rooms and grand entryways.",
      specs: ["210 cm high × 120 cm wide", "Ornate frame with a carved crest, scrolled corners and a beaded border", "Inner panelled frame for added depth", "Full-length statement mirror", "Also available in Gold and Champagne, and in 190 × 90 cm", "Ships in a heavy-duty cardboard box with protective foam"] },
    { slug: 'luxe-ornate-arch-mirror-gold', title: 'Luxe Ornate Arch Mirror – Gold', category: 'Floor Mirrors', price: 45000, compareAt: null, cost: null,
      status: 'active', stock: 4, lowAt: 1, supplierCode: '21lm2151-F', sku: 'MH-LUXE-GLD', weight: '', size: '200 cm high × 128 cm wide', badge: 'New', bothWays: false,
      images: ['images/products/luxe-ornate-arch-mirror-gold.jpg'],
      desc: "Pure old-world glamour. The Luxe is a full-length statement mirror with a gleaming gold arched frame, finished with a hand-detailed carved crest and ornate scrolled feet. At 200 cm high and a generous 128 cm wide, it fills a room with light and luxury, creating a breathtaking focal point in living rooms, bedrooms, dressing rooms and grand entryways.",
      specs: ["200 cm high × 128 cm wide", "Gold arched frame with a carved crest and ornate scrolled feet", "Full-length statement floor mirror", "Ships in a heavy-duty cardboard box with protective foam"] },
    { slug: 'halo-arch-floor-mirror-white', title: 'Halo Arch Floor Mirror 220 × 120 cm – White', category: 'Floor Mirrors', price: 42000, compareAt: null, cost: null,
      status: 'active', stock: 6, lowAt: 1, supplierCode: 'Q4011', sku: 'MH-HALO-WHT', weight: '', size: '220 cm high × 120 cm wide', badge: 'New', bothWays: false,
      images: ['images/products/halo-arch-floor-mirror-white.jpg', 'images/products/halo-arch-floor-mirror-white-detail.jpg'],
      desc: "Modern, elegant and timeless, the Halo is a generous 220 cm arched floor mirror in a slim white frame that suits any interior. Premium mirror glass gives a clear, bright reflection, bringing light and a sense of space to bedrooms, living rooms, entryways, salons and more. Hang it on the wall or lean it against it.",
      specs: ["220 cm high × 120 cm wide", "Premium mirror glass for a clear reflection", "Stylish slim white frame that suits any interior", "Hang on the wall or lean against it", "Also available in Gold and Black, and in 210 × 120 cm and 200 × 100 cm", "Perfect for bedrooms, living rooms, entryways, salons and more", "Ships in a heavy-duty cardboard box with protective foam"] },
    { slug: 'halo-arch-floor-mirror-gold', title: 'Halo Arch Floor Mirror 220 × 120 cm – Gold', category: 'Floor Mirrors', price: 42000, compareAt: null, cost: null,
      status: 'active', stock: 3, lowAt: 1, supplierCode: 'Q4011', sku: 'MH-HALO-GLD', weight: '', size: '220 cm high × 120 cm wide', badge: 'New', bothWays: false,
      images: ['images/products/halo-arch-floor-mirror-gold.jpg', 'images/products/halo-arch-floor-mirror-gold-detail.jpg'],
      desc: "Modern, elegant and timeless, the Halo is a generous 220 cm arched floor mirror in a slim gold frame that suits any interior. Premium mirror glass gives a clear, bright reflection, bringing light and a sense of space to bedrooms, living rooms, entryways, salons and more. Hang it on the wall or lean it against it.",
      specs: ["220 cm high × 120 cm wide", "Premium mirror glass for a clear reflection", "Stylish slim gold frame that suits any interior", "Hang on the wall or lean against it", "Also available in White and Black, and in 210 × 120 cm and 200 × 100 cm", "Perfect for bedrooms, living rooms, entryways, salons and more", "Ships in a heavy-duty cardboard box with protective foam"] },
    { slug: 'halo-arch-floor-mirror-black', title: 'Halo Arch Floor Mirror 220 × 120 cm – Black', category: 'Floor Mirrors', price: 42000, compareAt: null, cost: null,
      status: 'active', stock: 2, lowAt: 1, supplierCode: 'Q4011', sku: 'MH-HALO-BLK', weight: '', size: '220 cm high × 120 cm wide', badge: 'New', bothWays: false,
      images: ['images/products/halo-arch-floor-mirror-black.jpg', 'images/products/halo-arch-floor-mirror-black-detail.jpg'],
      desc: "Modern, elegant and timeless, the Halo is a generous 220 cm arched floor mirror in a slim black frame that suits any interior. Premium mirror glass gives a clear, bright reflection, bringing light and a sense of space to bedrooms, living rooms, entryways, salons and more. Hang it on the wall or lean it against it.",
      specs: ["220 cm high × 120 cm wide", "Premium mirror glass for a clear reflection", "Stylish slim black frame that suits any interior", "Hang on the wall or lean against it", "Also available in White and Gold, and in 210 × 120 cm and 200 × 100 cm", "Perfect for bedrooms, living rooms, entryways, salons and more", "Ships in a heavy-duty cardboard box with protective foam"] },
    { slug: 'halo-arch-floor-mirror-210-white', title: 'Halo Arch Floor Mirror 210 × 120 cm – White', category: 'Floor Mirrors', price: 38000, compareAt: null, cost: null,
      status: 'active', stock: 3, lowAt: 1, supplierCode: 'Q4011', sku: 'MH-HALO210-WHT', weight: '', size: '210 cm high × 120 cm wide', badge: 'New', bothWays: false,
      images: ['images/products/halo-arch-floor-mirror-white.jpg', 'images/products/halo-arch-floor-mirror-white-detail.jpg'],
      desc: "Modern, elegant and timeless, the Halo is a generous 210 cm arched floor mirror in a slim white frame that suits any interior. Premium mirror glass gives a clear, bright reflection, bringing light and a sense of space to bedrooms, living rooms, entryways, salons and more. Hang it on the wall or lean it against it.",
      specs: ["210 cm high × 120 cm wide", "Premium mirror glass for a clear reflection", "Stylish slim white frame that suits any interior", "Hang on the wall or lean against it", "Also available in Gold and Black, and in 220 × 120 cm and 200 × 100 cm", "Perfect for bedrooms, living rooms, entryways, salons and more", "Ships in a heavy-duty cardboard box with protective foam"] },
    { slug: 'halo-arch-floor-mirror-210-gold', title: 'Halo Arch Floor Mirror 210 × 120 cm – Gold', category: 'Floor Mirrors', price: 38000, compareAt: null, cost: null,
      status: 'active', stock: 3, lowAt: 1, supplierCode: 'Q4011', sku: 'MH-HALO210-GLD', weight: '', size: '210 cm high × 120 cm wide', badge: 'New', bothWays: false,
      images: ['images/products/halo-arch-floor-mirror-gold.jpg', 'images/products/halo-arch-floor-mirror-gold-detail.jpg'],
      desc: "Modern, elegant and timeless, the Halo is a generous 210 cm arched floor mirror in a slim gold frame that suits any interior. Premium mirror glass gives a clear, bright reflection, bringing light and a sense of space to bedrooms, living rooms, entryways, salons and more. Hang it on the wall or lean it against it.",
      specs: ["210 cm high × 120 cm wide", "Premium mirror glass for a clear reflection", "Stylish slim gold frame that suits any interior", "Hang on the wall or lean against it", "Also available in White and Black, and in 220 × 120 cm and 200 × 100 cm", "Perfect for bedrooms, living rooms, entryways, salons and more", "Ships in a heavy-duty cardboard box with protective foam"] },
    { slug: 'halo-arch-floor-mirror-210-black', title: 'Halo Arch Floor Mirror 210 × 120 cm – Black', category: 'Floor Mirrors', price: 38000, compareAt: null, cost: null,
      status: 'active', stock: 3, lowAt: 1, supplierCode: 'Q4011', sku: 'MH-HALO210-BLK', weight: '', size: '210 cm high × 120 cm wide', badge: 'New', bothWays: false,
      images: ['images/products/halo-arch-floor-mirror-black.jpg', 'images/products/halo-arch-floor-mirror-black-detail.jpg'],
      desc: "Modern, elegant and timeless, the Halo is a generous 210 cm arched floor mirror in a slim black frame that suits any interior. Premium mirror glass gives a clear, bright reflection, bringing light and a sense of space to bedrooms, living rooms, entryways, salons and more. Hang it on the wall or lean it against it.",
      specs: ["210 cm high × 120 cm wide", "Premium mirror glass for a clear reflection", "Stylish slim black frame that suits any interior", "Hang on the wall or lean against it", "Also available in White and Gold, and in 220 × 120 cm and 200 × 100 cm", "Perfect for bedrooms, living rooms, entryways, salons and more", "Ships in a heavy-duty cardboard box with protective foam"] },
    { slug: 'halo-arch-floor-mirror-200-white', title: 'Halo Arch Floor Mirror 200 × 100 cm – White', category: 'Floor Mirrors', price: 33000, compareAt: null, cost: null,
      status: 'active', stock: 2, lowAt: 1, supplierCode: 'Q4011', sku: 'MH-HALO200-WHT', weight: '', size: '200 cm high × 100 cm wide', badge: 'New', bothWays: false,
      images: ['images/products/halo-arch-floor-mirror-white.jpg', 'images/products/halo-arch-floor-mirror-white-detail.jpg'],
      desc: "Modern, elegant and timeless, the Halo is a 200 cm arched floor mirror in a slim white frame that suits any interior. Premium mirror glass gives a clear, bright reflection, bringing light and a sense of space to bedrooms, living rooms, entryways, salons and more. Hang it on the wall or lean it against it.",
      specs: ["200 cm high × 100 cm wide", "Premium mirror glass for a clear reflection", "Stylish slim white frame that suits any interior", "Hang on the wall or lean against it", "Also available in Gold and Black, and in 220 × 120 cm and 210 × 120 cm", "Perfect for bedrooms, living rooms, entryways, salons and more", "Ships in a heavy-duty cardboard box with protective foam"] },
    { slug: 'halo-arch-floor-mirror-200-gold', title: 'Halo Arch Floor Mirror 200 × 100 cm – Gold', category: 'Floor Mirrors', price: 33000, compareAt: null, cost: null,
      status: 'active', stock: 2, lowAt: 1, supplierCode: 'Q4011', sku: 'MH-HALO200-GLD', weight: '', size: '200 cm high × 100 cm wide', badge: 'New', bothWays: false,
      images: ['images/products/halo-arch-floor-mirror-gold.jpg', 'images/products/halo-arch-floor-mirror-gold-detail.jpg'],
      desc: "Modern, elegant and timeless, the Halo is a 200 cm arched floor mirror in a slim gold frame that suits any interior. Premium mirror glass gives a clear, bright reflection, bringing light and a sense of space to bedrooms, living rooms, entryways, salons and more. Hang it on the wall or lean it against it.",
      specs: ["200 cm high × 100 cm wide", "Premium mirror glass for a clear reflection", "Stylish slim gold frame that suits any interior", "Hang on the wall or lean against it", "Also available in White and Black, and in 220 × 120 cm and 210 × 120 cm", "Perfect for bedrooms, living rooms, entryways, salons and more", "Ships in a heavy-duty cardboard box with protective foam"] },
    { slug: 'halo-arch-floor-mirror-200-black', title: 'Halo Arch Floor Mirror 200 × 100 cm – Black', category: 'Floor Mirrors', price: 33000, compareAt: null, cost: null,
      status: 'active', stock: 2, lowAt: 1, supplierCode: 'Q4011', sku: 'MH-HALO200-BLK', weight: '', size: '200 cm high × 100 cm wide', badge: 'New', bothWays: false,
      images: ['images/products/halo-arch-floor-mirror-black.jpg', 'images/products/halo-arch-floor-mirror-black-detail.jpg'],
      desc: "Modern, elegant and timeless, the Halo is a 200 cm arched floor mirror in a slim black frame that suits any interior. Premium mirror glass gives a clear, bright reflection, bringing light and a sense of space to bedrooms, living rooms, entryways, salons and more. Hang it on the wall or lean it against it.",
      specs: ["200 cm high × 100 cm wide", "Premium mirror glass for a clear reflection", "Stylish slim black frame that suits any interior", "Hang on the wall or lean against it", "Also available in White and Gold, and in 220 × 120 cm and 210 × 120 cm", "Perfect for bedrooms, living rooms, entryways, salons and more", "Ships in a heavy-duty cardboard box with protective foam"] },
    { slug: 'florence-window-arch-mirror-black', title: 'Florence Window Arch Mirror – Black', category: 'Floor Mirrors', price: 40000, compareAt: null, cost: null,
      status: 'active', stock: 1, lowAt: 1, supplierCode: '25Ld061804', sku: 'MH-FLOR-BLK', weight: '', size: '200 cm high × 120 cm wide', badge: 'New', bothWays: false,
      images: ['images/products/florence-window-arch-mirror-black.jpg'],
      desc: "Inspired by the grand arched windows of old-world Italian villas, the Florence brings timeless architecture into your home. A slim black metal frame divides the glass into classic window panes, framing your room like a view. At 200 cm high and 120 cm wide, it adds height, light and instant character to living rooms, entryways and bedrooms.",
      specs: ["200 cm high × 120 cm wide", "Black metal frame with an arched top and classic window-pane design", "Hang on the wall or lean against it", "Ships in a heavy-duty cardboard box with protective foam"] },
    { slug: 'versailles-ornate-mirror-190-gold', title: 'Versailles Ornate Mirror 190 × 90 cm – Gold', category: 'Floor Mirrors', price: 25000, compareAt: null, cost: null,
      status: 'active', stock: 0, lowAt: 1, supplierCode: 'RF 11002', sku: 'MH-VERS190-GLD', weight: '', size: '190 cm high × 90 cm wide', badge: 'New', bothWays: true,
      images: ['images/products/versailles-ornate-mirror-gold.jpg'],
      desc: "Make an entrance with the Versailles: a 190 cm full-length mirror framed in rich antique gold, with hand-detailed baroque scrollwork crowning every corner. All the opulence of our larger Versailles in a size that suits bedrooms, dressing rooms and hallways. Hang it vertically or horizontally, or lean it against the wall.",
      specs: ["190 cm high × 90 cm wide", "Ornate baroque frame in a rich antique gold", "Hang vertically or horizontally, or lean against the wall", "Also available in Black and Champagne, and in 220 × 110 cm", "Ships in a heavy-duty cardboard box with protective foam"] },
    { slug: 'versailles-ornate-mirror-190-black', title: 'Versailles Ornate Mirror 190 × 90 cm – Black', category: 'Floor Mirrors', price: 25000, compareAt: null, cost: null,
      status: 'active', stock: 1, lowAt: 1, supplierCode: 'RF 11002', sku: 'MH-VERS190-BLK', weight: '', size: '190 cm high × 90 cm wide', badge: 'New', bothWays: true,
      images: ['images/products/versailles-ornate-mirror-black-2.jpg'],
      desc: "The Versailles in matte black, in a 190 cm full-length size: ornate baroque scrollwork with a dramatic, modern edge. Bold yet elegant, it suits bedrooms, dressing rooms and hallways. Hang it vertically or horizontally, or lean it against the wall.",
      specs: ["190 cm high × 90 cm wide", "Ornate baroque frame in a matte black", "Hang vertically or horizontally, or lean against the wall", "Also available in Gold and Champagne, and in 220 × 110 cm", "Ships in a heavy-duty cardboard box with protective foam"] },
    { slug: 'versailles-ornate-mirror-190-champagne', title: 'Versailles Ornate Mirror 190 × 90 cm – Champagne', category: 'Floor Mirrors', price: 25000, compareAt: null, cost: null,
      status: 'active', stock: 1, lowAt: 1, supplierCode: 'RF 11002', sku: 'MH-VERS190-CHA', weight: '', size: '190 cm high × 90 cm wide', badge: 'New', bothWays: true,
      images: ['images/products/versailles-ornate-mirror-champagne-2.jpg'],
      desc: "The Versailles in soft champagne, in a 190 cm full-length size: ornate baroque scrollwork in a gentle, pale-gold finish. Luxurious but understated, it brings quiet glamour to bedrooms, dressing rooms and hallways. Hang it vertically or horizontally, or lean it against the wall.",
      specs: ["190 cm high × 90 cm wide", "Ornate baroque frame in a soft champagne gold", "Hang vertically or horizontally, or lean against the wall", "Also available in Gold and Black, and in 220 × 110 cm", "Ships in a heavy-duty cardboard box with protective foam"] },
    { slug: 'versailles-ornate-mirror-gold', title: 'Versailles Ornate Mirror 220 × 110 cm – Gold', category: 'Floor Mirrors', price: 34000, compareAt: null, cost: null,
      status: 'active', stock: 3, lowAt: 1, supplierCode: 'RF 11002-F', sku: 'MH-VERS-GLD', weight: '33.8', size: '220 cm high × 110 cm wide', badge: 'New', bothWays: true,
      images: ['images/products/versailles-ornate-mirror-gold.jpg'],
      desc: "Make an entrance with the Versailles: a grand 220 cm mirror framed in rich antique gold, with hand-detailed baroque scrollwork crowning every corner. Timeless, opulent and full of light, it turns any living room, bedroom or entryway into something special. Hang it vertically or horizontally, or lean it against the wall.",
      specs: ["220 cm high × 110 cm wide", "Weight: 33.8 kg", "Ornate baroque frame in a rich antique gold", "Hang vertically or horizontally, or lean against the wall", "Also available in Black and Champagne, and in 190 × 90 cm", "Ships in a heavy-duty cardboard box with protective foam"] },
    { slug: 'versailles-ornate-mirror-black', title: 'Versailles Ornate Mirror 220 × 110 cm – Black', category: 'Floor Mirrors', price: 34000, compareAt: null, cost: null,
      status: 'active', stock: 3, lowAt: 1, supplierCode: 'RF 11002-F', sku: 'MH-VERS-BLK', weight: '33.8', size: '220 cm high × 110 cm wide', badge: 'New', bothWays: true,
      images: ['images/products/versailles-ornate-mirror-black-2.jpg'],
      desc: "The Versailles in matte black: a grand 220 cm mirror whose ornate baroque scrollwork takes on a dramatic, modern edge. Bold yet elegant, it adds instant drama to living rooms, bedrooms and entryways. Hang it vertically or horizontally, or lean it against the wall.",
      specs: ["220 cm high × 110 cm wide", "Weight: 33.8 kg", "Ornate baroque frame in a matte black", "Hang vertically or horizontally, or lean against the wall", "Also available in Gold and Champagne, and in 190 × 90 cm", "Ships in a heavy-duty cardboard box with protective foam"] },
    { slug: 'versailles-ornate-mirror-champagne', title: 'Versailles Ornate Mirror 220 × 110 cm – Champagne', category: 'Floor Mirrors', price: 34000, compareAt: null, cost: null,
      status: 'active', stock: 3, lowAt: 1, supplierCode: 'RF 11002-F', sku: 'MH-VERS-CHA', weight: '33.8', size: '220 cm high × 110 cm wide', badge: 'New', bothWays: true,
      images: ['images/products/versailles-ornate-mirror-champagne-2.jpg'],
      desc: "The Versailles in soft champagne: a grand 220 cm mirror with ornate baroque scrollwork in a gentle, pale-gold finish. Luxurious but understated, it brings light and quiet glamour to living rooms, bedrooms and entryways. Hang it vertically or horizontally, or lean it against the wall.",
      specs: ["220 cm high × 110 cm wide", "Weight: 33.8 kg", "Ornate baroque frame in a soft champagne gold", "Hang vertically or horizontally, or lean against the wall", "Also available in Gold and Black, and in 190 × 90 cm", "Ships in a heavy-duty cardboard box with protective foam"] },
    { slug: 'monolith-arch-mirror-concrete', title: 'Monolith Arch Mirror – Concrete', category: 'Floor Mirrors', price: 30000, compareAt: null, cost: null,
      status: 'active', stock: 3, lowAt: 1, supplierCode: 'HS45131-Brad', sku: 'MH-MONO-CON', weight: '', size: '200 cm high × 100 cm wide', badge: 'New', bothWays: false,
      images: ['images/products/monolith-arch-mirror-concrete.jpg'],
      desc: 'Sculpted in a soft concrete finish, the Monolith is a 2-metre arched mirror with a stepped, layered frame that feels part architecture, part art. Hang it or lean it against the wall to bring light and calm, gallery-like presence to entryways, living rooms and bedrooms.',
      specs: ['200 cm high × 100 cm wide', 'Stepped arched frame in a concrete finish', 'Hang on the wall or lean against it', 'Also available in Black', 'Ships in a heavy-duty cardboard box with protective foam'] },
    { slug: 'monolith-arch-mirror-black', title: 'Monolith Arch Mirror – Black', category: 'Floor Mirrors', price: 30000, compareAt: null, cost: null,
      status: 'active', stock: 3, lowAt: 1, supplierCode: 'HS45131-Brad', sku: 'MH-MONO-BLK', weight: '', size: '200 cm high × 100 cm wide', badge: 'New', bothWays: false,
      images: ['images/products/monolith-arch-mirror-black.jpg'],
      desc: 'The Monolith in a bold black finish: a 2-metre arched mirror with a stepped, layered frame that adds striking architectural contrast. Hang it or lean it against the wall for a dramatic statement in entryways, living rooms and bedrooms.',
      specs: ['200 cm high × 100 cm wide', 'Stepped arched frame in a black finish', 'Hang on the wall or lean against it', 'Also available in Concrete', 'Ships in a heavy-duty cardboard box with protective foam'] },
    { slug: 'gatsby-arch-mirror-black', title: 'Gatsby Arch Mirror – Black', category: 'Floor Mirrors', price: 24000, compareAt: null, cost: null,
      status: 'active', stock: 7, lowAt: 1, supplierCode: 'HS302010B-BRAD', sku: 'MH-GATS-BLK', weight: '', size: '200 cm high × 100 cm wide', badge: 'New', bothWays: false,
      images: ['images/products/gatsby-arch-mirror-black-2.jpg'],
      desc: 'Step into the Jazz Age with the Gatsby: a 2-metre arched mirror in a black metal frame of layered arches and sculptural round accents, inspired by Art Deco design. Hang it or lean it against the wall for a glamorous focal point in entryways, living rooms and bedrooms.',
      specs: ['200 cm high × 100 cm wide', 'Black metal frame with layered Art Deco arches and round accents', 'Hang on the wall or lean against it', 'Ships in a heavy-duty cardboard box with protective foam'] },
    { slug: 'duchess-arch-mirror-black', title: 'Duchess Arch Mirror – Black', category: 'Floor Mirrors', price: 30000, compareAt: null, cost: null,
      status: 'active', stock: 0, sku: 'MH-DUCH-BLK', weight: '', size: '200 cm high × 100 cm wide', badge: '', bothWays: false,
      images: ['images/products/duchess-arch-mirror-black.jpg'],
      desc: 'Meet the Duchess: a 2-metre arched mirror in a slim black metal frame, crowned with an ornate carved crest for a touch of old-world elegance. Hang it or lean it against the wall to bring light, height and quiet grandeur to bedrooms, hallways and living spaces.',
      specs: ['200 cm high × 100 cm wide', 'Slim black metal frame with an arched top and ornate carved crest', 'Hang on the wall or lean against it', 'Ships in a heavy-duty cardboard box with protective foam'] },
    { slug: 'wavy-edge-wall-mirror', title: 'Wavy Edge Wall Mirror', category: 'Wall Mirrors', price: 30000, compareAt: null, cost: null,
      status: 'active', stock: 10, sku: 'MH-WAVE-BLK', weight: '', size: '200 cm high × 100 cm wide', badge: 'New', bothWays: true,
      images: ['images/products/wavy-edge-wall-mirror.jpg', 'images/products/wavy-edge-wall-mirror-horizontal.jpg', 'images/products/wavy-edge-wall-mirror-leaned.jpg', 'images/products/wavy-edge-wall-mirror-hallway.jpg'],
      desc: 'A soft, wavy black timber frame turns this 2-metre mirror into a statement piece. Stylish and modern, it brightens bedrooms, living areas, hallways and entryways, and can be hung vertically or horizontally, or simply leaned against the wall.',
      specs: ['200 cm high × 100 cm wide', 'Durable wood frame in a timeless black finish', 'Hang vertically or horizontally, or lean against the wall', 'Perfect for bedrooms, living areas, hallways and entryways', 'Ships in a heavy-duty cardboard box with protective foam'] },
    { slug: 'studio-box-mirror-black', title: 'Studio Box Mirror – Black', category: 'Floor Mirrors', price: 25000, compareAt: null, cost: null,
      status: 'active', stock: 3, lowAt: 1, supplierCode: 'D3155', sku: 'MH-SB-BLK', weight: '', badge: 'New', bothWays: true, images: ['images/products/studio-box-mirror-black-2.jpg'],
      desc: 'A generous 2-metre, full-length mirror in a natural timber box frame finished in matte black. Clean, modern lines frame the room and bounce light into hallways, bedrooms and living spaces. Hang it vertically or horizontally, or lean it against the wall.',
      specs: ['200 cm high × 100 cm wide', 'Natural timber box frame, finished in matte black', 'Hang vertically or horizontally, or lean against the wall', 'Ships in a heavy-duty cardboard box with protective foam'] },
    { slug: 'studio-box-mirror-walnut', title: 'Studio Box Mirror – Walnut', category: 'Floor Mirrors', price: 25000, compareAt: null, cost: null,
      status: 'active', stock: 3, lowAt: 1, supplierCode: 'D3155', sku: 'MH-SB-WAL', weight: '', badge: 'New', bothWays: true, images: ['images/products/studio-box-mirror-walnut.jpg'],
      desc: 'A generous 2-metre, full-length mirror in a natural timber box frame with a rich walnut tone. Warm grain and clean lines add depth and a relaxed, crafted feel to any room. Hang it vertically or horizontally, or lean it against the wall.',
      specs: ['200 cm high × 100 cm wide', 'Natural timber box frame, in a rich walnut tone', 'Hang vertically or horizontally, or lean against the wall', 'Ships in a heavy-duty cardboard box with protective foam'] },
    { slug: 'studio-box-mirror-natural-oak', title: 'Studio Box Mirror – Natural Oak', category: 'Floor Mirrors', price: 25000, compareAt: null, cost: null,
      status: 'active', stock: 3, lowAt: 1, supplierCode: 'D3155', sku: 'MH-SB-OAK', weight: '', badge: 'New', bothWays: true, images: ['images/products/studio-box-mirror-natural-oak.jpg'],
      desc: 'A generous 2-metre, full-length mirror in a light natural oak box frame. Soft, honey-toned timber and clean lines bring light, warmth and calm to hallways, bedrooms and living spaces. Hang it vertically or horizontally, or lean it against the wall.',
      specs: ['200 cm high × 100 cm wide', 'Natural timber box frame, in a light natural oak', 'Hang vertically or horizontally, or lean against the wall', 'Ships in a heavy-duty cardboard box with protective foam'] },
    { slug: 'statement-curve-mirror-gold', title: 'Statement Curve Mirror – Gold', category: 'Wall Mirrors', price: 35000, compareAt: null, cost: null,
      status: 'active', stock: 5, lowAt: 1, supplierCode: '22Ld091609', sku: 'MH-SC-GLD', weight: '', badge: 'New', bothWays: true, images: ['images/signature-gold.jpg', 'images/signature-gold-pair.jpg'],
      desc: 'A 2-metre statement mirror with a bold gold metal frame and elegant curved detailing that adds style, light and depth to any space. Buy two for a 200 cm × 200 cm feature wall.',
      specs: ['200 cm high × 100 cm wide', 'Gold metal frame with curved detailing', 'Set of two: $700, forming a 200 cm × 200 cm feature wall', 'Ships in a heavy-duty cardboard box with protective foam'] },
    { slug: 'statement-curve-mirror-black', title: 'Statement Curve Mirror – Black', category: 'Wall Mirrors', price: 35000, compareAt: null, cost: null,
      status: 'active', stock: 5, lowAt: 1, supplierCode: '22Ld091609', sku: 'MH-SC-BLK', weight: '', badge: 'New', bothWays: true, images: ['images/signature-black.jpg', 'images/signature-black-pair.jpg'],
      desc: 'A 2-metre statement mirror with a bold black metal frame and elegant curved detailing that adds style, light and depth to any space. Buy two for a 200 cm × 200 cm feature wall.',
      specs: ['200 cm high × 100 cm wide', 'Black metal frame with curved detailing', 'Set of two: $700, forming a 200 cm × 200 cm feature wall', 'Ships in a heavy-duty cardboard box with protective foam'] },
  ];

  var SHIPPING = {
    zones: [
      { id: 'z1', name: 'Zone 1', areas: 'Within about 15 km of Point Cook: Point Cook, Werribee, Werribee South, Hoppers Crossing, Truganina, Williams Landing, Laverton, Laverton North, Seabrook, Altona Meadows, Altona and Seaholm', price: 4900,
        postcodes: '3030, 3029, 3028, 3027, 3026, 3018' },
      { id: 'z2', name: 'Zone 2', areas: 'About 15–30 km from Point Cook: Tarneit, Wyndham Vale, Manor Lakes, Derrimut, Little River, Altona North, Brooklyn, Newport, Williamstown, Spotswood, Yarraville, Footscray, Seddon, Sunshine, Braybrook, Ardeer, Deer Park, Caroline Springs, Taylors Hill, Taylors Lakes, Keilor, Avondale Heights, Maribyrnong, Essendon, Moonee Ponds, Airport West, Niddrie, Tullamarine, Flemington, Kensington, North Melbourne, Melbourne CBD, Docklands, Southbank, Port Melbourne, Albert Park, South Yarra, Brunswick, Coburg and surrounds', price: 7900,
        postcodes: '3000, 3002, 3003, 3004, 3006, 3008, 3011, 3012, 3013, 3015, 3016, 3019, 3020, 3022, 3023, 3024, 3025, 3031, 3032, 3033, 3034, 3036, 3037, 3038, 3039, 3040, 3042, 3043, 3051, 3055, 3056, 3057, 3058, 3141, 3206, 3207, 3211, Tarneit 3029, Derrimut 3026' },
      { id: 'z3', name: 'Zone 3', areas: 'About 31–50 km from Point Cook: Melton, Melton South, Melton West, Kurunjang, Brookfield, Cobblebank, Weir Views, Strathtulloh, Aintree, Fraser Rise, Rockbank, Thornhill Park, St Albans, Keilor North, Keilor Park, Glenroy, Pascoe Vale, Oak Park, Broadmeadows, Meadow Heights, Greenvale, Roxburgh Park, Craigieburn, Somerton, Campbellfield, Fawkner, Thomastown, Lalor, Epping, Reservoir, Preston, Thornbury, Bundoora, Mill Park, South Morang, Doreen, Greensborough, Montmorency, Diamond Creek, Carlton, Carlton North, Parkville, Richmond, Kew, Hawthorn, Camberwell, Burwood, Box Hill, Ringwood, South Melbourne, Middle Park, St Kilda, Elwood, Prahran, Windsor, Brighton, Bentleigh, Moorabbin, Cheltenham, Mentone, Geelong and surrounds', price: 10900,
        postcodes: '3000-3115, 3117-3136, 3141-3172, 3174, 3181-3207, 3211-3214, 3335-3338, 3427-3429, 3750-3754, 3220, Keilor North 3036, Keilor Park 3042, Middle Park 3206' }
    ],
    quoteBeyond: true,
    pickup: { enabled: true, location: 'Point Cook VIC 3030', instructions: 'By appointment. We\'ll be in touch with the address and a time that suits once your order is confirmed.' },
    timeframe: '1–4 business days',
    redeliveryFee: null
  };

  var DISCOUNTS = [
    { code: 'WELCOME10', type: 'pct', value: 10, minSpend: 0, firstOrderOnly: true, starts: null, ends: null, limit: null, active: true }
  ];

  var SETTINGS = {
    storeName: 'Mirror House Melbourne', email: 'hello@mirrorhousemelbourne.com.au', phone1: '0413 173 705', phone2: '0406 224 524',
    address: 'Point Cook, VIC 3030', legalName: 'Mirrorhousemelbourne', abn: '50 417 829 779', hours: 'Mon–Sat, 9am–5pm', currency: 'AUD', gstIncluded: true, gstRegistered: false
  };

  // ---------- sample orders (clearly flagged as sample) ----------
  var FIRST = ['Olivia', 'Charlotte', 'Amelia', 'Isla', 'Mia', 'Ava', 'Grace', 'Chloe', 'Sophie', 'Ruby', 'Zoe', 'Emily', 'Hannah', 'Lucy', 'Ella',
    'Jack', 'Oliver', 'Noah', 'William', 'Thomas', 'James', 'Henry', 'Leo', 'Lucas', 'Harrison', 'Priya', 'Mei', 'Sofia', 'Ahmed', 'Nikos'];
  var LAST = ['Nguyen', 'Smith', 'Jones', 'Williams', 'Brown', 'Wilson', 'Taylor', 'Martin', 'Anderson', 'Thompson', 'White', 'Walker', 'Kelly',
    'Papadopoulos', 'Singh', 'Chen', 'Rossi', 'Murphy', 'Ryan', 'Clarke'];
  var PLACES = [
    ['Point Cook', '3030', 'z1'], ['Werribee', '3030', 'z1'], ['Hoppers Crossing', '3029', 'z1'], ['Tarneit', '3029', 'z1'], ['Altona', '3018', 'z1'],
    ['Williams Landing', '3027', 'z1'], ['Footscray', '3011', 'z2'], ['Yarraville', '3013', 'z2'], ['Williamstown', '3016', 'z2'], ['Richmond', '3121', 'z2'],
    ['South Yarra', '3141', 'z2'], ['Brunswick', '3056', 'z2'], ['Port Melbourne', '3207', 'z2'], ['Coburg', '3058', 'z2'], ['Melbourne', '3000', 'z2'],
    ['Essendon', '3040', 'z3'], ['Hawthorn', '3122', 'z3'], ['Camberwell', '3124', 'z3'], ['Brighton', '3186', 'z3'], ['Glen Waverley', '3150', 'z3'],
    ['Box Hill', '3128', 'z3'], ['St Kilda', '3182', 'z3'], ['Northcote', '3070', 'z3'], ['Preston', '3072', 'z3'], ['Sunbury', '3429', 'z3']];
  var STREETS = ['Station St', 'Main Rd', 'Park Ave', 'Church St', 'High St', 'Elm Gr', 'Bay St', 'Victoria St', 'Albert Rd', 'Wattle Way', 'Banksia Cres', 'Ocean Dr'];

  function buildSampleOrders(now) {
    var r = rng(20261105);
    var orders = [], customers = {};
    var today = startOfDay(now).getTime();
    var n = 1001;
    var weights = [['statement-curve-mirror-gold', 40], ['statement-curve-mirror-black', 34], ['ondine-wavy-wall-mirror', 16], ['grand-royale-arched-brass-floor-mirror', 10]];
    var prices = {}; PRODUCTS.forEach(function (p) { prices[p.slug] = p; });
    var zonePrice = { z1: 4900, z2: 7900, z3: 10900 };
    var pool = [];
    for (var i = 0; i < 700; i++) {
      var f = pick(r, FIRST), l = pick(r, LAST), place = pick(r, PLACES);
      pool.push({ id: 'c' + (i + 1), name: f + ' ' + l, email: (f + '.' + l).toLowerCase().replace(/[^a-z.]/g, '') + (i % 7 === 0 ? i : '') + '@example.com',
        phone: '04' + String(Math.floor(r() * 1e8)).padStart(8, '0').replace(/(\d{2})(\d{3})(\d{3})/, '$1 $2 $3'),
        address: { line1: (1 + Math.floor(r() * 180)) + ' ' + pick(r, STREETS), suburb: place[0], state: 'VIC', postcode: place[1] }, zone: place[2],
        marketing: r() < 0.55 });
    }
    for (var d = 364; d >= 0; d--) {
      var dayStart = today - d * DAY;
      var dow = new Date(dayStart).getDay();
      var growth = 0.35 + 1.1 * (1 - d / 364);
      var weekend = dow === 0 || dow === 6 ? 1.35 : 1;
      var count = poisson(r, 0.55 * growth * weekend);
      for (var k = 0; k < count; k++) {
        var cust = r() < 0.12 && orders.length > 10 ? customers[pick(r, Object.keys(customers))] : pool[Math.floor(r() * pool.length)];
        customers[cust.id] = cust;
        var hour = weighted(r, [[8, 2], [9, 3], [10, 4], [11, 4], [12, 5], [13, 5], [14, 4], [15, 4], [16, 4], [17, 4], [18, 5], [19, 7], [20, 8], [21, 7], [22, 4], [23, 2], [7, 1]]);
        var created = dayStart + hour * 3600000 + Math.floor(r() * 3600000);
        if (created > now.getTime()) created = now.getTime() - Math.floor(r() * 3600000);
        var lines = [], slug = weighted(r, weights);
        var qty = slug.indexOf('statement') === 0 && r() < 0.34 ? 2 : 1;
        lines.push({ slug: slug, title: prices[slug].title, price: prices[slug].price, qty: qty });
        if (r() < 0.08) { var s2 = weighted(r, weights); if (s2 !== slug) lines.push({ slug: s2, title: prices[s2].title, price: prices[s2].price, qty: 1 }); }
        var subtotal = lines.reduce(function (s, x) { return s + x.price * x.qty; }, 0);
        var pickup = r() < 0.17;
        var insurance = 0;
        var discountCode = r() < 0.24 ? 'WELCOME10' : null;
        var discount = discountCode ? Math.round(subtotal * 0.1) : 0;
        var delivery = pickup ? 0 : zonePrice[cust.zone];
        var total = subtotal - discount + delivery + insurance;
        var age = (now.getTime() - created) / DAY;
        var fulfilment, events = [{ at: created, text: 'Order placed on the online store' }, { at: created + 60000, text: 'Payment of ' + (total / 100).toFixed(2) + ' AUD captured by Square' }];
        if (age > 6) {
          fulfilment = pickup ? 'picked_up' : 'delivered';
          events.push({ at: created + 1.5 * DAY, text: pickup ? 'Marked ready for pick-up' : 'Marked out for delivery' });
          events.push({ at: created + 3 * DAY, text: pickup ? 'Picked up by customer' : 'Delivered and checked with customer' });
        } else if (age > 2.5) {
          fulfilment = pickup ? 'ready' : 'out_for_delivery';
          events.push({ at: created + 1.5 * DAY, text: pickup ? 'Marked ready for pick-up' : 'Marked out for delivery' });
        } else fulfilment = 'unfulfilled';
        var refunded = age > 10 && r() < 0.02;
        if (refunded) events.push({ at: created + 4 * DAY, text: 'Refund issued (damaged on arrival, replacement declined)' });
        orders.push({
          id: n, number: '#' + n, sample: true, createdAt: created, customerId: cust.id,
          customer: { name: cust.name, email: cust.email, phone: cust.phone }, address: pickup ? null : cust.address,
          method: pickup ? 'pickup' : 'delivery', zone: pickup ? null : cust.zone, deliveryDay: pickup ? null : dayKey(created + (2 + Math.floor(r() * 3)) * DAY),
          lines: lines, subtotal: subtotal, discountCode: discountCode, discount: discount, delivery: delivery, insurance: insurance, total: total,
          payment: refunded ? 'refunded' : 'paid', card: pick(r, ['Visa', 'Mastercard', 'Amex', 'Apple Pay', 'Google Pay']) + ' via Square',
          fulfilment: fulfilment, tracking: '', note: r() < 0.12 ? pick(r, ['Please call 30 min before arriving.', 'Two flights of stairs, no lift.', 'Gate code 2468.', 'Leave with building manager is NOT ok, please arrange time.']) : '',
          events: events, marketing: cust.marketing
        });
        n++;
      }
    }
    addSampleQuotes(orders, customers, prices, now);
    return orders;
  }

  // Two sample quote requests from outside the delivery zones, so the quote flow can be tried.
  function addSampleQuotes(orders, _c, prices, now) {
    var t = now.getTime(), next = orders.reduce(function (m, o) { return Math.max(m, o.id); }, 1000) + 1;
    [[ 'Megan Walsh', 'megan.walsh@example.com', '0423 118 904', '8 Lydiard St', 'Ballarat', '3350', 'statement-curve-mirror-black', 2, 'awaiting_quote', 0.4 ],
     [ 'Tom Fraser', 'tom.fraser@example.com', '0438 772 015', '41 Pall Mall', 'Bendigo', '3550', 'grand-royale-arched-brass-floor-mirror', 1, 'quote_sent', 1.6 ]].forEach(function (q, i) {
      var p = prices[q[6]], created = t - q[9] * DAY, subtotal = p.price * q[7];
      var events = [{ at: created, text: 'Delivery quote requested from the online store (address outside your zones). Nothing charged.' }];
      if (q[8] === 'quote_sent') events.push({ at: created + 0.3 * DAY, text: 'Delivery quote of $189.00 sent to ' + q[1] + ' with a Square payment link' });
      orders.push({ id: next + i, number: '#' + (next + i), sample: true, createdAt: created, customerId: 'q' + i,
        customer: { name: q[0], email: q[1], phone: q[2] }, address: { line1: q[3], suburb: q[4], state: 'VIC', postcode: q[5] },
        method: 'delivery', zone: 'quote', deliveryDay: null, lines: [{ slug: q[6], title: p.title, price: p.price, qty: q[7] }],
        subtotal: subtotal, discountCode: null, discount: 0, delivery: q[8] === 'quote_sent' ? 18900 : 0, insurance: 0, total: subtotal + (q[8] === 'quote_sent' ? 18900 : 0),
        payment: q[8], card: q[8] === 'quote_sent' ? 'Square payment link sent' : 'No payment yet', fulfilment: 'on_hold', tracking: '', note: '', events: events, marketing: false });
    });
  }

  // ---------- visitor analytics (sample) ----------
  // Built from the same seed as the orders so numbers agree: orders ≈ sessions × conversion.
  function buildSampleTraffic(orders, now) {
    var r = rng(77123);
    var today = startOfDay(now).getTime();
    var byDay = {};
    orders.forEach(function (o) { var k = dayKey(o.createdAt); byDay[k] = (byDay[k] || 0) + 1; });
    var days = [];
    for (var d = 364; d >= 0; d--) {
      var t = today - d * DAY, k = dayKey(t), dow = new Date(t).getDay();
      var growth = 0.35 + 1.1 * (1 - d / 364), weekend = dow === 0 || dow === 6 ? 1.3 : 1;
      var sessions = Math.max((byDay[k] || 0) * 40, Math.round((38 + r() * 26) * growth * weekend));
      if (d === 0) sessions = Math.round(sessions * Math.min(1, (now.getHours() + now.getMinutes() / 60) / 24 + 0.05));
      var visitors = Math.round(sessions * (0.78 + r() * 0.08));
      var productViews = Math.round(sessions * (0.5 + r() * 0.12));
      var visualiser = Math.round(sessions * (0.09 + r() * 0.05));
      var addToBag = Math.max(byDay[k] || 0, Math.round(sessions * (0.045 + r() * 0.025)));
      var checkout = Math.max(byDay[k] || 0, Math.round(addToBag * (0.48 + r() * 0.15)));
      days.push({ date: k, t: t, sessions: sessions, visitors: visitors, productViews: productViews, visualiser: visualiser, addToBag: addToBag, checkout: checkout, orders: byDay[k] || 0,
        bounce: 0.38 + r() * 0.12, duration: 95 + r() * 80, pagesPer: 2.4 + r() * 1.3, returning: 0.18 + r() * 0.1 });
    }
    return days;
  }
  var SOURCES = [['Direct', 31], ['Google search', 27], ['Instagram', 18], ['Facebook', 10], ['Pinterest', 6], ['Referral sites', 5], ['Email', 3]];
  var DEVICES = [['Mobile', 67], ['Desktop', 28], ['Tablet', 5]];
  var PAGES = [['Home', 'index.html', 100], ['Try It in Your Room', 'visualiser.html', 31], ['Haven Soft Arch', 'product.html?slug=haven-soft-arch-mirror-natural', 22],
    ['Versailles Ornate', 'product.html?slug=versailles-ornate-mirror-gold', 20], ['Statement Curve – Gold', 'product.html?slug=statement-curve-mirror-gold', 18],
    ['Checkout', 'checkout.html', 9], ['Delivery, Returns & Care', 'policies.html', 7]];
  var HOURS = [1, 0.6, 0.4, 0.3, 0.3, 0.5, 1.2, 2.2, 3.2, 3.8, 4.1, 4.4, 5, 4.7, 4.3, 4.2, 4.5, 5.2, 6.4, 7.8, 8.6, 7.7, 5.4, 2.6];
  var LOCATIONS = [['Wyndham (Point Cook, Werribee, Tarneit)', 29], ['Inner west', 17], ['Inner Melbourne', 15], ['Eastern suburbs', 13], ['Northern suburbs', 11], ['Bayside', 8], ['Regional Victoria', 4], ['Interstate', 3]];

  // ---------- store ----------
  var state = null;
  function defaults() {
    var now = new Date();
    return {
      version: 2, createdAt: now.getTime(), sampleData: false,
      products: PRODUCTS.map(function (p) { return Object.assign({ id: p.slug, compareAt: null, cost: null, weight: '', badge: '', bothWays: false, tags: '', seoTitle: '', seoDesc: '' }, p); }),
      orders: [],
      shipping: JSON.parse(JSON.stringify(SHIPPING)),
      discounts: JSON.parse(JSON.stringify(DISCOUNTS)),
      settings: Object.assign({}, SETTINGS),
      customerNotes: {},
      subscribers: []
    };
  }
  function load() {
    if (state) return state;
    try { state = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { state = null; }
    if (state && state.version === 1) migrate1to2(state);
    if (state && !state.sizeWording) { // tidy size wording in products saved before the change
      var fix = function (t) { return String(t).replace(/200cm high × 100cm wide/g, '200 cm high × 100 cm wide').replace(/200cm wide × 200cm high/g, '200 cm × 200 cm').replace(/200cm × 200cm/g, '200 cm × 200 cm')
        .replace(/^A bold (gold|black) metal frame with elegant curved detailing/, 'A 2-metre statement mirror with a bold $1 metal frame and elegant curved detailing').replace(/^A generous full-length mirror/, 'A generous 2-metre, full-length mirror'); };
      (state.products || []).forEach(function (p) { p.desc = fix(p.desc || ''); p.specs = (p.specs || []).map(fix); });
      state.sizeWording = true; save();
    }
    if (state && !state.studioLandscape) { (state.products || []).forEach(function (p) { if (p.slug.indexOf('studio-box-mirror-') === 0) p.images = (p.images || []).map(function (i) { return i.replace('-horizontal.jpg', '-landscape.jpg'); }); }); state.studioLandscape = true; save(); }
    if (state && !state.studioHorizontal) { (state.products || []).forEach(function (p) { if (p.slug.indexOf('studio-box-mirror-') === 0) { var d = PRODUCTS.filter(function (x) { return x.slug === p.slug; })[0]; if (d) { p.images = d.images.slice(); p.desc = d.desc; p.specs = d.specs.slice(); p.bothWays = true; } } }); state.studioHorizontal = true; save(); }
    if (state && !state.studioNoTrio) { (state.products || []).forEach(function (p) { if (p.slug.indexOf('studio-box-mirror-') === 0) p.images = (p.images || []).filter(function (i) { return i.indexOf('trio') < 0; }); }); state.studioNoTrio = true; save(); }
    if (state && !state.gatsbyPhoto2) { (state.products || []).forEach(function (p) { if (p.slug === 'gatsby-arch-mirror-black') p.images = ['images/products/gatsby-arch-mirror-black-2.jpg']; }); state.gatsbyPhoto2 = true; save(); }
    if (state && !state.versaillesChampPhoto) { (state.products || []).forEach(function (p) { if (p.slug === 'versailles-ornate-mirror-champagne') p.images = (p.images || []).map(function (i) { return i.replace('versailles-ornate-mirror-champagne.jpg', 'versailles-ornate-mirror-champagne-2.jpg'); }); }); state.versaillesChampPhoto = true; save(); }
    if (state && !state.versaillesBlackPhoto) { (state.products || []).forEach(function (p) { if (p.slug === 'versailles-ornate-mirror-black') { p.images = (p.images || []).map(function (i) { return i.replace('versailles-ornate-mirror-black.jpg', 'versailles-ornate-mirror-black-2.jpg'); }); var d = PRODUCTS.filter(function (x) { return x.slug === p.slug; })[0]; if (d) { p.desc = d.desc; p.specs = d.specs.slice(); } } }); state.versaillesBlackPhoto = true; save(); }
    if (state && state.settings && state.settings.gstRegistered === undefined) { state.settings.gstRegistered = false; save(); }
    if (state && !Array.isArray(state.subscribers)) { state.subscribers = []; save(); }
    if (state && !state.launchClean) { // ready for launch: remove sample and test orders/visitors and products that aren't Mirror House's; keep every mirror
      var notOurs = ['grand-royale-arched-brass-floor-mirror', 'ondine-wavy-wall-mirror', 'travertine-mushroom-table-lamp', 'hand-thrown-ceramic-vase', 'ribbed-amber-glassware-set', 'travertine-catch-all-tray'];
      state.orders = (state.orders || []).filter(function (o) { return !o.sample && !o.test; });
      state.products = (state.products || []).filter(function (p) { return notOurs.indexOf(p.slug) < 0; });
      state.customerNotes = {};
      state.sampleData = false;
      state.launchClean = true; save();
    }
    if (state && !state.versaillesSizes) { // Versailles now in two sizes; 190 × 90 cm Gold sold out
      var vD = PRODUCTS.filter(function (p) { return p.slug.indexOf('versailles-ornate-mirror-') === 0; });
      (state.products || []).forEach(function (p) { var d = vD.filter(function (x) { return x.slug === p.slug; })[0]; if (d) { p.title = d.title; p.specs = d.specs.slice(); } });
      vD.filter(function (p) { return p.slug.indexOf('-190-') > 0; }).reverse().forEach(function (p) {
        if (!state.products.some(function (x) { return x.slug === p.slug; })) state.products.unshift(Object.assign({ id: p.slug, tags: '', seoTitle: '', seoDesc: '' }, JSON.parse(JSON.stringify(p))));
      });
      state.versaillesSizes = true; save();
    }
    if (state && !state.halo220) { // large Halo is 220 × 120 cm (was listed as 210)
      var h2 = PRODUCTS.filter(function (p) { return p.slug.indexOf('halo-arch-floor-mirror-') === 0; });
      (state.products || []).forEach(function (p) { var d = h2.filter(function (x) { return x.slug === p.slug; })[0]; if (d) { p.title = d.title; p.desc = d.desc; p.specs = d.specs.slice(); p.size = d.size; } });
      state.halo220 = true; save();
    }
    if (state && !state.halo220Stock) { var hq = { white: 6, gold: 3, black: 2 }; (state.products || []).forEach(function (p) { var m = p.slug.match(/^halo-arch-floor-mirror-(white|gold|black)$/); if (m) { p.price = 42000; p.stock = hq[m[1]]; p.lowAt = 2; p.supplierCode = 'Q4011'; } }); state.halo220Stock = true; save(); }
    if (state && !state.addedParis) {
      PRODUCTS.filter(function (p) { return p.slug.indexOf('paris-window-pane-mirror-') === 0; }).reverse().forEach(function (p) {
        if (!state.products.some(function (x) { return x.slug === p.slug; })) state.products.unshift(Object.assign({ id: p.slug, tags: '', seoTitle: '', seoDesc: '' }, JSON.parse(JSON.stringify(p))));
      });
      state.addedParis = true; save();
    }
    if (state && !state.addedKnife) {
      PRODUCTS.filter(function (p) { return p.slug === 'cut-above-knife-mirror-black'; }).forEach(function (p) {
        if (!state.products.some(function (x) { return x.slug === p.slug; })) state.products.unshift(Object.assign({ id: p.slug, tags: '', seoTitle: '', seoDesc: '' }, JSON.parse(JSON.stringify(p))));
      });
      state.addedKnife = true; save();
    }
    if (state && !state.knifeStock) { (state.products || []).forEach(function (p) { if (p.slug === 'cut-above-knife-mirror-black') { p.stock = 4; p.lowAt = 1; p.supplierCode = '24LD062402'; } }); state.knifeStock = true; save(); }
    if (state && !state.statementStock) { (state.products || []).forEach(function (p) { if (p.slug.indexOf('statement-curve-mirror-') === 0) { p.stock = 5; p.lowAt = 1; p.supplierCode = '22Ld091609'; } }); state.statementStock = true; save(); }
    if (state && !state.studioStock) { (state.products || []).forEach(function (p) { if (p.slug.indexOf('studio-box-mirror-') === 0) { p.stock = 3; p.lowAt = 1; p.supplierCode = 'D3155'; } }); state.studioStock = true; save(); }
    if (state && !state.gatsbyStock) { (state.products || []).forEach(function (p) { if (p.slug === 'gatsby-arch-mirror-black') { p.stock = 7; p.lowAt = 1; p.supplierCode = 'HS302010B-BRAD'; } }); state.gatsbyStock = true; save(); }
    if (state && !state.monoBlkStock) { (state.products || []).forEach(function (p) { if (p.slug === 'monolith-arch-mirror-black') { p.stock = 3; p.lowAt = 2; p.supplierCode = 'HS45131-Brad'; } }); state.monoBlkStock = true; save(); }
    if (state && !state.monoConStock) { (state.products || []).forEach(function (p) { if (p.slug === 'monolith-arch-mirror-concrete') { p.stock = 3; p.lowAt = 2; p.supplierCode = 'HS45131-Brad'; } }); state.monoConStock = true; save(); }
    if (state && !state.vers220Stock) { (state.products || []).forEach(function (p) { if (/^versailles-ornate-mirror-(gold|black|champagne)$/.test(p.slug)) { p.stock = 3; p.lowAt = 2; p.supplierCode = 'RF 11002-F'; } }); state.vers220Stock = true; save(); }
    if (state && !state.vers190Stock) { var vq = { gold: 0, black: 1, champagne: 1 }; (state.products || []).forEach(function (p) { var m = p.slug.match(/^versailles-ornate-mirror-190-(gold|black|champagne)$/); if (m) { p.stock = vq[m[1]]; p.lowAt = 2; p.supplierCode = 'RF 11002'; } }); state.vers190Stock = true; save(); }
    if (state && !state.halo200Price) { (state.products || []).forEach(function (p) { if (/^halo-arch-floor-mirror-200-/.test(p.slug)) p.price = 33000; }); state.halo200Price = true; save(); }
    if (state && !state.florenceStock) { (state.products || []).forEach(function (p) { if (p.slug === 'florence-window-arch-mirror-black') { p.stock = 1; p.lowAt = 2; p.supplierCode = '25Ld061804'; } }); state.florenceStock = true; save(); }
    if (state && !state.halo200Stock) { (state.products || []).forEach(function (p) { if (/^halo-arch-floor-mirror-200-/.test(p.slug)) { p.stock = 2; p.lowAt = 2; p.supplierCode = 'Q4011'; } }); state.halo200Stock = true; save(); }
    if (state && !state.halo210Added) { // middle Halo size 210 × 120 cm
      var hm = PRODUCTS.filter(function (p) { return p.slug.indexOf('halo-arch-floor-mirror-') === 0; });
      (state.products || []).forEach(function (p) { var d = hm.filter(function (x) { return x.slug === p.slug; })[0]; if (d) p.specs = d.specs.slice(); });
      hm.filter(function (p) { return p.slug.indexOf('-210-') > 0; }).reverse().forEach(function (p) { if (!state.products.some(function (x) { return x.slug === p.slug; })) state.products.unshift(Object.assign({ id: p.slug, tags: '', seoTitle: '', seoDesc: '' }, JSON.parse(JSON.stringify(p)))); });
      state.halo210Added = true; save();
    }
    if (state && !state.luxeStock) { (state.products || []).forEach(function (p) { if (p.slug === 'luxe-ornate-arch-mirror-gold') { p.stock = 4; p.lowAt = 2; p.supplierCode = '21lm2151-F'; } }); state.luxeStock = true; save(); }
    if (state && !state.belgraviaStock) { var bq = { gold: 2, champagne: 4, black: 4 }; (state.products || []).forEach(function (p) { var m = p.slug.match(/^belgravia-crest-mirror-(gold|champagne|black)$/); if (m) { p.stock = bq[m[1]]; p.lowAt = 2; p.supplierCode = 'LPU12302'; } }); state.belgraviaStock = true; save(); }
    if (state && !state.belgraviaGoldAt1) { (state.products || []).forEach(function (p) { if (p.slug === 'belgravia-crest-mirror-gold') p.lowAt = 1; }); state.belgraviaGoldAt1 = true; save(); }
    if (state && !state.belgraviaGoldBack2) { (state.products || []).forEach(function (p) { if (p.slug === 'belgravia-crest-mirror-gold') p.lowAt = 2; }); state.belgraviaGoldBack2 = true; save(); }
    if (state && !state.belleStock4) { (state.products || []).forEach(function (p) { if (p.slug.indexOf('belle-beaded-mirror-') === 0) { p.stock = 4; p.lowAt = 2; } }); state.belleStock4 = true; save(); }
    if (state && !state.havenStock4) { (state.products || []).forEach(function (p) { if (p.slug.indexOf('haven-soft-arch-mirror-') === 0) { p.stock = 4; p.lowAt = 2; } }); state.havenStock4 = true; save(); }
    if (state && !state.sohoStock8) { (state.products || []).forEach(function (p) { if (p.slug === 'soho-slim-frame-mirror-black') { p.stock = 8; p.lowAt = 2; p.supplierCode = 'Q1085'; } }); state.sohoStock8 = true; save(); }
    if (state && !state.havenSupplier) { (state.products || []).forEach(function (p) { if (p.slug.indexOf('haven-soft-arch-mirror-') === 0) p.supplierCode = '25LD091004'; }); state.havenSupplier = true; save(); }
    if (state && !state.belleSupplier) { (state.products || []).forEach(function (p) { if (p.slug.indexOf('belle-beaded-mirror-') === 0) p.supplierCode = '123D302-BIG'; }); state.belleSupplier = true; save(); }
    if (state && !state.belgraviaSupplier) { (state.products || []).forEach(function (p) { if (p.slug.indexOf('belgravia-crest-mirror-') === 0 && !p.supplierCode) p.supplierCode = 'LPU12302'; }); state.belgraviaSupplier = true; save(); }
    if (state && !state.cathedralQty2) { (state.products || []).forEach(function (p) { if (p.slug === 'cathedral-arch-window-mirror-black') p.stock = 2; }); state.cathedralQty2 = true; save(); }
    if (state && !state.rivieraSoldOut) { (state.products || []).forEach(function (p) { if (p.slug === 'riviera-rounded-floor-mirror-gold') { p.stock = 0; p.badge = ''; } }); state.rivieraSoldOut = true; save(); }
    if (state && !state.havenFiveColours) { // Haven: Warm Wood added, Walnut renamed Dark Brown
      var hD = PRODUCTS.filter(function (p) { return p.slug.indexOf('haven-soft-arch-mirror-') === 0; });
      (state.products || []).forEach(function (p) { var d = hD.filter(function (x) { return x.slug === p.slug; })[0]; if (d) { p.title = d.title; p.desc = d.desc; p.specs = d.specs.slice(); p.sku = d.sku; } });
      hD.slice().reverse().forEach(function (p) { if (!state.products.some(function (x) { return x.slug === p.slug; })) state.products.unshift(Object.assign({ id: p.slug, tags: '', seoTitle: '', seoDesc: '' }, JSON.parse(JSON.stringify(p)))); });
      state.havenFiveColours = true; save();
    }
    if (state && !state.belleHang) { (state.products || []).forEach(function (p) { if (p.slug.indexOf('belle-beaded-mirror-') === 0) { var d = PRODUCTS.filter(function (x) { return x.slug === p.slug; })[0]; if (d) { p.desc = d.desc; p.specs = d.specs.slice(); } } }); state.belleHang = true; save(); }
    if (state && !state.addedBelle) {
      PRODUCTS.filter(function (p) { return p.slug.indexOf('belle-beaded-mirror-') === 0; }).reverse().forEach(function (p) {
        if (!state.products.some(function (x) { return x.slug === p.slug; })) state.products.unshift(Object.assign({ id: p.slug, tags: '', seoTitle: '', seoDesc: '' }, JSON.parse(JSON.stringify(p))));
      });
      state.addedBelle = true; save();
    }
    if (state && !state.addedHaven) {
      PRODUCTS.filter(function (p) { return p.slug.indexOf('haven-soft-arch-mirror-') === 0; }).reverse().forEach(function (p) {
        if (!state.products.some(function (x) { return x.slug === p.slug; })) state.products.unshift(Object.assign({ id: p.slug, tags: '', seoTitle: '', seoDesc: '' }, JSON.parse(JSON.stringify(p))));
      });
      state.addedHaven = true; save();
    }
    if (state && !state.duchessSoldOut) { (state.products || []).forEach(function (p) { if (p.slug === 'duchess-arch-mirror-black') { p.stock = 0; p.badge = ''; } }); state.duchessSoldOut = true; save(); }
    if (state && !state.addedRiviera) {
      PRODUCTS.filter(function (p) { return p.slug === 'riviera-rounded-floor-mirror-gold'; }).forEach(function (p) {
        if (!state.products.some(function (x) { return x.slug === p.slug; })) state.products.unshift(Object.assign({ id: p.slug, tags: '', seoTitle: '', seoDesc: '' }, JSON.parse(JSON.stringify(p))));
      });
      state.addedRiviera = true; save();
    }
    if (state && !state.addedSoho) {
      PRODUCTS.filter(function (p) { return p.slug === 'soho-slim-frame-mirror-black'; }).forEach(function (p) {
        if (!state.products.some(function (x) { return x.slug === p.slug; })) state.products.unshift(Object.assign({ id: p.slug, tags: '', seoTitle: '', seoDesc: '' }, JSON.parse(JSON.stringify(p))));
      });
      state.addedSoho = true; save();
    }
    if (state && !state.zone3Trim50) { ((state.shipping || {}).zones || []).forEach(function (z) { if (z.id === 'z3') z.postcodes = String(z.postcodes || '').replace('3000-3138', '3000-3115, 3117-3136'); }); state.zone3Trim50 = true; save(); }
    if (state && !state.zone3List) { // Zone 3 = about 31-50 km; Richmond 3121 and South Melbourne 3205 move to Zone 3; Keilor North, Keilor Park, Middle Park by suburb
      ((state.shipping || {}).zones || []).forEach(function (z) {
        if (z.id === 'z2') { z.postcodes = String(z.postcodes || '').split(/\s*,\s*/).filter(function (x) { return x && x !== '3121' && x !== '3205'; }).join(', '); z.areas = String(z.areas || '').replace(', South Melbourne', '').replace(', Richmond', ''); }
        if (z.id === 'z3') { ['Keilor North 3036', 'Keilor Park 3042', 'Middle Park 3206'].forEach(function (e) { if (String(z.postcodes || '').indexOf(e) < 0) z.postcodes = (z.postcodes ? z.postcodes + ', ' : '') + e; }); z.areas = 'About 31–50 km from Point Cook: Melton, Melton South, Melton West, Kurunjang, Brookfield, Cobblebank, Weir Views, Strathtulloh, Aintree, Fraser Rise, Rockbank, Thornhill Park, St Albans, Keilor North, Keilor Park, Glenroy, Pascoe Vale, Oak Park, Broadmeadows, Meadow Heights, Greenvale, Roxburgh Park, Craigieburn, Somerton, Campbellfield, Fawkner, Thomastown, Lalor, Epping, Reservoir, Preston, Thornbury, Bundoora, Mill Park, South Morang, Doreen, Greensborough, Montmorency, Diamond Creek, Carlton, Carlton North, Parkville, Richmond, Kew, Hawthorn, Camberwell, Burwood, Box Hill, Ringwood, South Melbourne, Middle Park, St Kilda, Elwood, Prahran, Windsor, Brighton, Bentleigh, Moorabbin, Cheltenham, Mentone, Geelong and surrounds'; }
      });
      state.zone3List = true; save();
    }
    if (state && !state.eastMelbZ2) { ((state.shipping || {}).zones || []).forEach(function (z) { if (z.id === 'z2' && !/(^|[,\s])3002($|[,\s])/.test(z.postcodes || '')) z.postcodes = '3002, ' + (z.postcodes || ''); }); state.eastMelbZ2 = true; save(); }
    if (state && !state.zones15and30) { // Zone 1 = within ~15 km, Zone 2 = ~15-30 km (Debbie's list); Tarneit and Derrimut by suburb
      ((state.shipping || {}).zones || []).forEach(function (z) {
        if (z.id === 'z1') { z.postcodes = '3030, 3029, 3028, 3027, 3026, 3018'; z.areas = 'Within about 15 km of Point Cook: Point Cook, Werribee, Werribee South, Hoppers Crossing, Truganina, Williams Landing, Laverton, Laverton North, Seabrook, Altona Meadows, Altona and Seaholm'; }
        if (z.id === 'z2') { z.postcodes = '3000, 3002, 3003, 3004, 3006, 3008, 3011, 3012, 3013, 3015, 3016, 3019, 3020, 3022, 3023, 3024, 3025, 3031, 3032, 3033, 3034, 3036, 3037, 3038, 3039, 3040, 3042, 3043, 3051, 3055, 3056, 3057, 3058, 3141, 3206, 3207, 3211, Tarneit 3029, Derrimut 3026'; z.areas = 'About 15–30 km from Point Cook: Tarneit, Wyndham Vale, Manor Lakes, Derrimut, Little River, Altona North, Brooklyn, Newport, Williamstown, Spotswood, Yarraville, Footscray, Seddon, Sunshine, Braybrook, Ardeer, Deer Park, Caroline Springs, Taylors Hill, Taylors Lakes, Keilor, Avondale Heights, Maribyrnong, Essendon, Moonee Ponds, Airport West, Niddrie, Tullamarine, Flemington, Kensington, North Melbourne, Melbourne CBD, Docklands, Southbank, Port Melbourne, Albert Park, South Yarra, Brunswick, Coburg and surrounds'; }
      });
      state.zones15and30 = true; save();
    }
    if (state && !state.zone1Within15) { // Zone 1 = suburbs within about 15 km of Point Cook; Williamstown 3016 moves to Zone 1
      ((state.shipping || {}).zones || []).forEach(function (z) {
        var list = String(z.postcodes || '').split(/[,\s]+/).filter(Boolean);
        if (z.id === 'z1') { ['3012', '3015', '3016'].forEach(function (pc) { if (list.indexOf(pc) < 0) list.push(pc); }); z.areas = 'Within about 15 km of Point Cook: Point Cook, Werribee, Werribee South, Hoppers Crossing, Truganina, Williams Landing, Laverton, Laverton North, Seabrook, Altona Meadows, Altona and Seaholm'; }
        if (z.id === 'z2') list = list.filter(function (pc) { return ['3012', '3015', '3016'].indexOf(pc) < 0; });
        z.postcodes = list.join(', ');
      });
      state.zone1Within15 = true; save();
    }
    if (state && !state.zone1Suburbs) { // Brooklyn 3012 and Newport 3015 move to Zone 1; Zone 1 suburb list updated
      ((state.shipping || {}).zones || []).forEach(function (z) {
        var list = String(z.postcodes || '').split(/[,\s]+/).filter(Boolean);
        if (z.id === 'z1') { ['3012', '3015'].forEach(function (pc) { if (list.indexOf(pc) < 0) list.push(pc); }); z.areas = 'Within about 15 km of Point Cook: Point Cook, Werribee, Werribee South, Hoppers Crossing, Truganina, Williams Landing, Laverton, Laverton North, Seabrook, Altona Meadows, Altona and Seaholm'; }
        if (z.id === 'z2') list = list.filter(function (pc) { return pc !== '3012' && pc !== '3015'; });
        z.postcodes = list.join(', ');
      });
      state.zone1Suburbs = true; save();
    }
    if (state && !state.geelongZone3) { ((state.shipping || {}).zones || []).forEach(function (z) { if (z.id === 'z3' && !/(^|[,\s])3220($|[,\s])/.test(z.postcodes || '')) z.postcodes = (z.postcodes ? z.postcodes + ', ' : '') + '3220'; }); state.geelongZone3 = true; save(); }
    if (state && !state.studioPhotosFix) { (state.products || []).forEach(function (p) { if (p.slug.indexOf('studio-box-mirror-') === 0) { var d = PRODUCTS.filter(function (x) { return x.slug === p.slug; })[0]; if (d) p.images = d.images.slice(); } }); state.studioPhotosFix = true; save(); }
    if (state && !state.cathedralStyled) { (state.products || []).forEach(function (p) { if (p.slug === 'cathedral-arch-window-mirror-black') { var d = PRODUCTS.filter(function (x) { return x.slug === p.slug; })[0]; if (d) p.images = d.images.slice(); } }); state.cathedralStyled = true; save(); }
    if (state && !state.cathedralPhoto2) { (state.products || []).forEach(function (p) { if (p.slug === 'cathedral-arch-window-mirror-black') p.images = (p.images || []).map(function (i) { return i.replace('cathedral-arch-window-mirror-black.jpg', 'cathedral-arch-window-mirror-black-2.jpg'); }); }); state.cathedralPhoto2 = true; save(); }
    if (state && !state.addedCathedral) {
      PRODUCTS.filter(function (p) { return p.slug === 'cathedral-arch-window-mirror-black'; }).forEach(function (p) {
        if (!state.products.some(function (x) { return x.slug === p.slug; })) state.products.unshift(Object.assign({ id: p.slug, tags: '', seoTitle: '', seoDesc: '' }, JSON.parse(JSON.stringify(p))));
      });
      state.addedCathedral = true; save();
    }
    if (state && !state.belgraviaPhotos) { (state.products || []).forEach(function (p) { if (p.slug.indexOf('belgravia-crest-mirror-') === 0) { var d = PRODUCTS.filter(function (x) { return x.slug === p.slug; })[0]; if (d) { p.images = d.images.slice(); p.price = d.price; } } }); state.belgraviaPhotos = true; save(); }
    if (state && !state.addedBelgravia) {
      PRODUCTS.filter(function (p) { return p.slug.indexOf('belgravia-crest-mirror-') === 0; }).reverse().forEach(function (p) {
        if (!state.products.some(function (x) { return x.slug === p.slug; })) state.products.unshift(Object.assign({ id: p.slug, tags: '', seoTitle: '', seoDesc: '' }, JSON.parse(JSON.stringify(p))));
      });
      state.addedBelgravia = true; save();
    }
    if (state && !state.haloVariants) { // Halo now comes in White, Gold and Black, in 210 × 120 cm and 200 × 100 cm
      var haloD = PRODUCTS.filter(function (p) { return p.slug.indexOf('halo-arch-floor-mirror-') === 0; });
      (state.products || []).forEach(function (p) { var d = haloD.filter(function (x) { return x.slug === p.slug; })[0]; if (d) { p.title = d.title; p.desc = d.desc; p.specs = d.specs.slice(); p.images = d.images.slice(); p.size = d.size; p.sku = d.sku; } });
      haloD.slice().reverse().forEach(function (p) {
        if (!state.products.some(function (x) { return x.slug === p.slug; })) state.products.unshift(Object.assign({ id: p.slug, tags: '', seoTitle: '', seoDesc: '' }, JSON.parse(JSON.stringify(p))));
      });
      state.haloVariants = true; save();
    }
    if (state && !state.addedLuxe) {
      PRODUCTS.filter(function (p) { return p.slug === 'luxe-ornate-arch-mirror-gold'; }).forEach(function (p) {
        if (!state.products.some(function (x) { return x.slug === p.slug; })) state.products.unshift(Object.assign({ id: p.slug, tags: '', seoTitle: '', seoDesc: '' }, JSON.parse(JSON.stringify(p))));
      });
      state.addedLuxe = true; save();
    }
    if (state && !state.haloHang) { (state.products || []).forEach(function (p) { if (p.slug === 'halo-arch-floor-mirror-white') { var d = PRODUCTS.filter(function (x) { return x.slug === p.slug; })[0]; if (d) { p.desc = d.desc; p.specs = d.specs.slice(); } } }); state.haloHang = true; save(); }
    if (state && !state.addedHalo) {
      PRODUCTS.filter(function (p) { return p.slug === 'halo-arch-floor-mirror-white'; }).forEach(function (p) {
        if (!state.products.some(function (x) { return x.slug === p.slug; })) state.products.unshift(Object.assign({ id: p.slug, tags: '', seoTitle: '', seoDesc: '' }, JSON.parse(JSON.stringify(p))));
      });
      state.addedHalo = true; save();
    }
    if (state && !state.addedFlorence) {
      PRODUCTS.filter(function (p) { return p.slug === 'florence-window-arch-mirror-black'; }).forEach(function (p) {
        if (!state.products.some(function (x) { return x.slug === p.slug; })) state.products.unshift(Object.assign({ id: p.slug, tags: '', seoTitle: '', seoDesc: '' }, JSON.parse(JSON.stringify(p))));
      });
      state.addedFlorence = true; save();
    }
    if (state && !state.addedVersailles) {
      PRODUCTS.filter(function (p) { return p.slug.indexOf('versailles-ornate-mirror-') === 0; }).reverse().forEach(function (p) {
        if (!state.products.some(function (x) { return x.slug === p.slug; })) state.products.unshift(Object.assign({ id: p.slug, tags: '', seoTitle: '', seoDesc: '' }, JSON.parse(JSON.stringify(p))));
      });
      state.addedVersailles = true; save();
    }
    if (state && !state.addedMonolith) {
      PRODUCTS.filter(function (p) { return p.slug.indexOf('monolith-arch-mirror-') === 0; }).reverse().forEach(function (p) {
        if (!state.products.some(function (x) { return x.slug === p.slug; })) state.products.unshift(Object.assign({ id: p.slug, tags: '', seoTitle: '', seoDesc: '' }, JSON.parse(JSON.stringify(p))));
      });
      state.addedMonolith = true; save();
    }
    if (state && !state.gatsbyMetal) { (state.products || []).forEach(function (p) { if (p.slug === 'gatsby-arch-mirror-black') { var d = PRODUCTS.filter(function (x) { return x.slug === p.slug; })[0]; p.desc = d.desc; p.specs = d.specs.slice(); } }); state.gatsbyMetal = true; save(); }
    if (state && !state.addedGatsby) {
      PRODUCTS.filter(function (p) { return p.slug === 'gatsby-arch-mirror-black'; }).forEach(function (p) {
        if (!state.products.some(function (x) { return x.slug === p.slug; })) state.products.unshift(Object.assign({ id: p.slug, tags: '', seoTitle: '', seoDesc: '' }, JSON.parse(JSON.stringify(p))));
      });
      state.addedGatsby = true; save();
    }
    if (state && !state.renamedDuchess) { // Crown Arch renamed to Duchess Arch, metal frame, hangs or leans
      (state.products || []).forEach(function (p) {
        if (p.slug === 'crown-arch-mirror-black') {
          var d = PRODUCTS.filter(function (x) { return x.slug === 'duchess-arch-mirror-black'; })[0];
          Object.assign(p, { slug: d.slug, id: d.slug, title: d.title, sku: d.sku, desc: d.desc, specs: d.specs.slice(), images: d.images.slice() });
        }
      });
      state.renamedDuchess = true; save();
    }
    if (state && !state.addedCrownArch) {
      PRODUCTS.filter(function (p) { return p.slug === 'duchess-arch-mirror-black'; }).forEach(function (p) {
        if (!state.products.some(function (x) { return x.slug === p.slug; })) state.products.unshift(Object.assign({ id: p.slug, tags: '', seoTitle: '', seoDesc: '' }, JSON.parse(JSON.stringify(p))));
      });
      state.addedCrownArch = true; save();
    }
    if (state && !state.addedWavyEdge) {
      PRODUCTS.filter(function (p) { return p.slug === 'wavy-edge-wall-mirror'; }).forEach(function (p) {
        if (!state.products.some(function (x) { return x.slug === p.slug; })) state.products.unshift(Object.assign({ id: p.slug, tags: '', seoTitle: '', seoDesc: '' }, JSON.parse(JSON.stringify(p))));
      });
      state.addedWavyEdge = true; save();
    }
    if (state && !state.addedStudioBox) { // add the Studio Box mirrors to an existing admin
      PRODUCTS.filter(function (p) { return p.slug.indexOf('studio-box-mirror-') === 0; }).reverse().forEach(function (p) {
        if (!state.products.some(function (x) { return x.slug === p.slug; })) state.products.unshift(Object.assign({ id: p.slug, tags: '', seoTitle: '', seoDesc: '' }, JSON.parse(JSON.stringify(p))));
      });
      state.addedStudioBox = true; save();
    }
    if (state && !state.removedGrandOndine) { (state.products || []).forEach(function (p) { if (p.slug === 'grand-royale-arched-brass-floor-mirror' || p.slug === 'ondine-wavy-wall-mirror') p.status = 'archived'; }); state.removedGrandOndine = true; save(); }
    if (state && state.settings && (!state.settings.abn || !state.settings.legalName)) { state.settings.abn = state.settings.abn || '50 417 829 779'; state.settings.legalName = state.settings.legalName || 'Mirrorhousemelbourne'; save(); }
    if (state && !state.lowAtOne) { (state.products || []).forEach(function (p) { p.lowAt = 1; }); state.lowAtOne = true; save(); }
    if (!state || state.version !== 2) { state = defaults(); save(); }
    if (state) { try { var pend = JSON.parse(localStorage.getItem('mh-preview-subs') || '[]'); if (pend.length) { pend.forEach(function (x) { if (!state.subscribers.some(function (y) { return String(y.email).toLowerCase() === String(x.email).toLowerCase(); })) state.subscribers.push(x); }); localStorage.removeItem('mh-preview-subs'); save(); } } catch (e) { /* ignore */ } }
    return state;
  }
  // Version 2: delivery insurance removed; quote requests added. Keeps everything you've changed.
  function migrate1to2(s) {
    if (s.shipping) delete s.shipping.insurance;
    (s.orders || []).forEach(function (o) { if (o.sample && o.insurance) { o.total -= o.insurance; o.insurance = 0; } });
    if (s.sampleData && !(s.orders || []).some(function (o) { return o.zone === 'quote'; })) {
      var prices = {}; (s.products || []).forEach(function (p) { prices[p.slug] = p; });
      if (prices['statement-curve-mirror-black'] && prices['grand-royale-arched-brass-floor-mirror']) addSampleQuotes(s.orders, null, prices, new Date());
    }
    s.version = 2;
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* keep in memory */ }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
    catch (e) { return false; } // storage full or blocked: keep working in memory
  }
  function reset() { state = defaults(); save(); return state; }
  function clearSample() { load(); state.orders = state.orders.filter(function (o) { return !o.sample; }); state.sampleData = false; save(); }

  var trafficCache = null;
  function traffic() {
    load();
    if (!state.sampleData) return [];
    if (!trafficCache) trafficCache = buildSampleTraffic(state.orders.filter(function (o) { return o.sample; }), new Date());
    return trafficCache;
  }

  // ---------- postcode → zone ----------
  // Comma-separated: "3030", "3000-3099", or "Tarneit 3029" (a suburb with its postcode, for postcodes split between zones).
  function parsePostcodes(text) {
    var out = [];
    String(text || '').split(/[,;\n]+/).forEach(function (part) {
      part = part.trim(); if (!part) return;
      var m;
      if ((m = part.match(/^(\d{4})\s*-\s*(\d{4})$/))) out.push([+m[1], +m[2]]);
      else if (/^\d{4}$/.test(part)) out.push([+part, +part]);
      else if ((m = part.match(/^(.*?[A-Za-z].*?)\s+(\d{4})$/))) { var r = [+m[2], +m[2]]; r.suburb = normSuburb(m[1]); out.push(r); }
    });
    return out;
  }
  function normSuburb(s) { return String(s || '').toLowerCase().replace(/['’.]/g, '').replace(/\bst\b/g, 'saint').replace(/[^a-z]+/g, ' ').trim(); }
  function zoneFor(postcode, shipping, suburb) {
    var pc = parseInt(postcode, 10);
    if (!pc) return null;
    var zones = (shipping || load().shipping).zones, sub = normSuburb(suburb), i, j, r;
    if (sub) for (i = 0; i < zones.length; i++) { r = parsePostcodes(zones[i].postcodes); for (j = 0; j < r.length; j++) if (r[j].suburb === sub && pc === r[j][0]) return zones[i]; }
    for (i = 0; i < zones.length; i++) { // first matching zone wins, so list the closest zone first
      r = parsePostcodes(zones[i].postcodes);
      for (j = 0; j < r.length; j++) if (!r[j].suburb && pc >= r[j][0] && pc <= r[j][1]) return zones[i];
    }
    return null;
  }

  // ---------- mailing list: footer sign-ups plus customers who ticked "email me" at checkout ----------
  function mailingList() {
    var st = load(), map = {};
    (st.subscribers || []).forEach(function (x) { var k = String(x.email || '').toLowerCase(); if (k) map[k] = { email: x.email, joinedAt: x.joinedAt, source: x.source || 'Website sign-up', name: '' }; });
    (st.orders || []).forEach(function (o) {
      if (!o.marketing || !o.customer || !o.customer.email) return;
      var k = o.customer.email.toLowerCase();
      if (!map[k]) map[k] = { email: o.customer.email, joinedAt: o.createdAt, source: 'Checkout', name: o.customer.name || '' };
      else if (!map[k].name) map[k].name = o.customer.name || '';
    });
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return (b.joinedAt || 0) - (a.joinedAt || 0); });
  }

  // ---------- customers (built from orders) ----------
  function customers() {
    var map = {};
    load().orders.forEach(function (o) {
      var key = (o.customer.email || '').toLowerCase();
      var c = map[key] || (map[key] = { id: key, name: o.customer.name, email: o.customer.email, phone: o.customer.phone, address: null, orders: [], spent: 0, marketing: false, first: o.createdAt, last: o.createdAt, sample: o.sample });
      c.orders.push(o);
      if (o.payment !== 'refunded') c.spent += o.total;
      if (o.address) c.address = o.address;
      c.marketing = c.marketing || !!o.marketing;
      c.first = Math.min(c.first, o.createdAt); c.last = Math.max(c.last, o.createdAt);
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  window.MHData = {
    mailingList: mailingList, load: load, save: save, reset: reset, clearSample: clearSample, traffic: traffic,
    zoneFor: zoneFor, parsePostcodes: parsePostcodes, customers: customers, slugify: slugify, dayKey: dayKey, startOfDay: startOfDay, DAY: DAY,
    SOURCES: SOURCES, DEVICES: DEVICES, PAGES: PAGES, HOURS: HOURS, LOCATIONS: LOCATIONS
  };
})();
