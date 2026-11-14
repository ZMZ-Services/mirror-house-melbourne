// POST /api/orders: the checkout. The server re-prices everything, holds the stock and takes the payment.
import { json, error, handle, readJson } from '../lib/http.mjs';
import { placeOrder } from '../lib/orders.mjs';

export default handle(async (req) => {
  if (req.method !== 'POST') return error('Method not allowed', 405);
  const body = await readJson(req, 50_000);
  const out = await placeOrder(body);
  return json(out.body, out.status);
});

export const config = { path: '/api/orders', rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ['ip', 'domain'] } };
