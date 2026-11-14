// Mirror House admin: data layer.
// Live site: everything is kept in the store's database. The admin loads it through /api/admin/state after
// sign-in, and save() sends what changed to /api/admin/sync (see netlify/functions).
(function () {
  'use strict';

  var DAY = 86400000;

  // ---------- helpers ----------
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

  // ---------- store (live: the database, through /api/admin) ----------
  // After sign-in the admin loads everything once (init) and keeps it in memory, so every page stays quick.
  // save() works out what changed since the last load and sends only that to /api/admin/sync. The server checks
  // and saves it, records it in the activity log, and sends back the fresh state.
  var state = null, synced = null, getToken = null, queue = Promise.resolve(), pending = 0;
  // Debbie's starting set-up. The live database was seeded from this (scripts/gen-seed.mjs).
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
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function api(path, opts) {
    opts = opts || {};
    return getToken().then(function (token) {
      var headers = Object.assign({ authorization: 'Bearer ' + token }, opts.headers || {});
      return fetch(path, Object.assign({}, opts, { headers: headers, cache: 'no-store' }));
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) { var e = new Error(d.error || 'The server couldn\'t save that (error ' + r.status + ').'); e.status = r.status; throw e; }
        return d;
      });
    });
  }
  function setState(s) {
    ((s.traffic && s.traffic.days) || []).forEach(function (d) { var p = d.date.split('-'); d.t = new Date(+p[0], +p[1] - 1, +p[2]).getTime(); });
    state = s; synced = clone(s); trafficCache = null;
  }
  // tokenFn returns a promise of the signed-in user's access token (Netlify Identity).
  function init(tokenFn) {
    getToken = tokenFn;
    return api('/api/admin/state').then(function (s) { setState(s); return s; });
  }
  function refresh() { return api('/api/admin/state').then(function (s) { setState(s); notify(); return s; }); }
  function load() { return state; }

  // ---- working out what changed ----
  var PRODUCT_KEYS = ['title', 'category', 'price', 'compareAt', 'cost', 'status', 'stock', 'lowAt', 'supplierCode', 'sku', 'weight', 'size', 'badge', 'bothWays', 'images', 'desc', 'specs', 'tags', 'seoTitle', 'seoDesc'];
  var ORDER_KEYS = ['payment', 'fulfilment', 'tracking', 'note', 'delivery', 'refunded', 'card', 'deliveryDay'];
  function same(a, b) { return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b); }
  function byKey(list, k) { var m = {}; (list || []).forEach(function (x) { m[x[k]] = x; }); return m; }
  function changes(cur, old) {
    var out = {}, any = false;
    var oldP = byKey(old.products, 'slug'), curP = byKey(cur.products, 'slug'), ups = [], dels = [];
    cur.products.forEach(function (p) {
      var o = oldP[p.slug], f = {};
      PRODUCT_KEYS.forEach(function (k) { if (!o || !same(p[k], o[k])) f[k] = p[k] === undefined ? null : p[k]; });
      if (!o) ups.push({ slug: p.slug, isNew: true, fields: f });
      else if (Object.keys(f).length) { var u = { slug: p.slug, fields: f }; if ('stock' in f && o.stock != null && p.stock != null) u.stockDelta = p.stock - o.stock; ups.push(u); }
    });
    old.products.forEach(function (o) { if (!curP[o.slug]) dels.push(o.slug); });
    if (ups.length || dels.length) { out.products = { upsert: ups, delete: dels }; any = true; }

    var oldO = byKey(old.orders, 'id'), ords = [];
    cur.orders.forEach(function (o) {
      var p = oldO[o.id]; if (!p) return;
      var set = {}, c = { id: o.id };
      ORDER_KEYS.forEach(function (k) { if (!same(o[k], p[k])) set[k] = o[k]; });
      var added = (o.events || []).slice((p.events || []).length);
      if (Object.keys(set).length) c.set = set;
      if (added.length) c.addEvents = added;
      if (o._notify) c.notify = o._notify;
      if (o._quoteMessage) c.quoteMessage = o._quoteMessage;
      if (o._refundReason) c.refundReason = o._refundReason;
      if (c.set || c.addEvents || c.notify) ords.push(c);
    });
    if (ords.length) { out.orders = ords; any = true; }

    var oldD = byKey(old.discounts, 'code'), curD = byKey(cur.discounts, 'code'), dUp = [], dDel = [];
    cur.discounts.forEach(function (d) { if (!oldD[d.code] || !same(d, oldD[d.code])) dUp.push(d); });
    old.discounts.forEach(function (d) { if (!curD[d.code]) dDel.push(d.code); });
    if (dUp.length || dDel.length) { out.discounts = { upsert: dUp, delete: dDel }; any = true; }

    if (!same(cur.settings, old.settings)) { out.settings = cur.settings; any = true; }
    if (!same(cur.shipping, old.shipping)) { out.shipping = cur.shipping; any = true; }
    var notes = {};
    Object.keys(cur.customerNotes || {}).forEach(function (k) { if ((cur.customerNotes[k] || '') !== ((old.customerNotes || {})[k] || '')) notes[k] = cur.customerNotes[k]; });
    if (Object.keys(notes).length) { out.customerNotes = notes; any = true; }
    var curS = byKey(cur.subscribers, 'email'), gone = (old.subscribers || []).filter(function (x) { return !curS[x.email]; }).map(function (x) { return x.email; });
    if (gone.length) { out.subscribers = { delete: gone }; any = true; }
    return any ? out : null;
  }
  function clearTransient(s) { (s.orders || []).forEach(function (o) { delete o._notify; delete o._quoteMessage; delete o._refundReason; }); }

  // Photos added in the product editor are kept as data until saved; upload them to Netlify Blobs first.
  function uploadPhotos(ch) {
    var jobs = [];
    ((ch.products && ch.products.upsert) || []).forEach(function (u) {
      (u.fields.images || []).forEach(function (src, i) {
        if (!/^data:image\//.test(src)) return;
        jobs.push(fetch(src).then(function (r) { return r.blob(); }).then(function (blob) {
          return api('/api/admin/uploads', { method: 'POST', headers: { 'content-type': blob.type }, body: blob });
        }).then(function (d) {
          u.fields.images[i] = d.url;
          var p = state.products.filter(function (x) { return x.slug === u.slug; })[0];
          if (p) p.images = p.images.map(function (x) { return x === src ? d.url : x; });
        }));
      });
    });
    return Promise.all(jobs);
  }
  function notify() { if (window.MHAdmin && window.MHAdmin.refreshView) window.MHAdmin.refreshView(); }
  function status(text, error) { if (window.MHAdmin && window.MHAdmin.saveStatus) window.MHAdmin.saveStatus(text, error); }

  // Saves in the background, one save at a time. Returns true straight away so the admin stays quick;
  // if the server refuses a change, the admin shows why and reloads what's really saved.
  function save() {
    if (!state || !synced) return false;
    pending++; status('Saving…');
    queue = queue.then(function () {
      var ch = changes(state, synced);
      clearTransient(state);
      if (!ch) return;
      var sentAs = null;
      return uploadPhotos(ch).then(function () {
        sentAs = JSON.stringify(state);
        return api('/api/admin/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ch) });
      }).then(function (res) {
        if (JSON.stringify(state) === sentAs) { setState(res.state); notify(); }
        else synced = clone(res.state); // more edits were made meanwhile: they're saved next
        if (res.notes && res.notes.length && window.MHAdmin) window.MHAdmin.toast(res.notes[0]);
      });
    }).then(function () {
      if (--pending === 0) status('All changes saved');
    }, function (err) {
      pending = Math.max(0, pending - 1);
      status('Not saved: ' + err.message, true);
      if (window.MHAdmin) window.MHAdmin.toast('Not saved: ' + err.message);
      return refresh().catch(function () { /* keep what's on screen */ });
    });
    return true;
  }
  function saved() { return queue; } // resolves once everything has been sent
  function reset() { return state; }
  function clearSample() { /* the live admin has no sample data */ }

  var trafficCache = null;
  function traffic() {
    if (!state || !state.traffic) return [];
    return state.traffic.days || [];
  }
  function trafficBreakdown(range) { return state && state.traffic && state.traffic.breakdowns ? state.traffic.breakdowns[range] || null : null; }

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
    init: init, refresh: refresh, saved: saved, defaults: defaults, trafficBreakdown: trafficBreakdown,
    mailingList: mailingList, load: load, save: save, reset: reset, clearSample: clearSample, traffic: traffic,
    zoneFor: zoneFor, parsePostcodes: parsePostcodes, customers: customers, slugify: slugify, dayKey: dayKey, startOfDay: startOfDay, DAY: DAY
  };
})();
