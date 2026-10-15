-- Demo catalogue so the API and dashboard have something to show.
-- Replace with the real catalogue (or delete rows) before going live.

INSERT INTO products (slug, name, category, price_cents, cost_cents, stock, reorder_point) VALUES
  ('grand-royale-arched-brass-floor-mirror', 'Grand Royale Arched Brass Floor Mirror', 'Floor Mirrors',     129000, 52000, 14, 6),
  ('ondine-wavy-wall-mirror',                'Ondine Wavy Wall Mirror',                'Wall Mirrors',       59000, 21500, 22, 8),
  ('travertine-mushroom-table-lamp',         'Travertine Mushroom Table Lamp',         'Lighting',           34500, 13800,  5, 6),
  ('hand-thrown-ceramic-vase',               'Hand-Thrown Ceramic Vase',               'Ceramics & Vases',   12900,  4200, 31, 10),
  ('ribbed-amber-glassware-set',             'Ribbed Amber Glassware (Set of 4)',      'Tableware',           7900,  2600, 48, 15),
  ('travertine-catch-all-tray',              'Travertine Catch-All Tray',              'Ceramics & Vases',    9500,  3100,  9, 8);
