// GET /api/products: the shop's active products, with live prices and stock.
import { query } from '../lib/db.mjs';
import { json, error, handle } from '../lib/http.mjs';
import { shopProduct } from '../lib/store.mjs';

export default handle(async (req) => {
  if (req.method !== 'GET') return error('Method not allowed', 405);
  const r = await query("SELECT * FROM products WHERE status = 'active' ORDER BY sort_order, slug");
  return json({ products: r.rows.map(shopProduct) });
});

export const config = { path: '/api/products' };
