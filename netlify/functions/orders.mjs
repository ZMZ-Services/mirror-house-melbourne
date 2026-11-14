// POST /api/orders: the checkout. The server re-prices everything, holds the stock and takes the payment.
import { json, error, handle, readJson } from '../lib/http.mjs';
import { placeOrder } from '../lib/orders.mjs';

export default handle(async (req, context) => {
  if (req.method !== 'POST') return error('Method not allowed', 405);
  const body = await readJson(req, 50_000);
  // Emails are sent after the reply, so a slow email service never holds up the customer's confirmation.
  const defer = context && typeof context.waitUntil === 'function' ? (p) => context.waitUntil(p) : undefined;
  const out = await placeOrder(body, { defer });
  return json(out.body, out.status);
});

export const config = { path: '/api/orders', rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ['ip', 'domain'] } };
