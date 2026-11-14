// POST /api/discounts/check: looks up one discount code for the checkout's "Apply" button, so the full list of
// codes is never sent to the browser. The order itself is checked again on the server when it's placed.
import { json, error, handle, readJson, str } from '../lib/http.mjs';
import { getDiscount } from '../lib/store.mjs';

export default handle(async (req) => {
  if (req.method !== 'POST') return error('Method not allowed', 405);
  const b = await readJson(req, 2_000);
  const code = str(b.code, 40).toUpperCase();
  if (!/^[A-Z0-9_-]{2,40}$/.test(code)) return json({ discount: null });
  const d = await getDiscount(code);
  if (!d) return json({ discount: null });
  return json({ discount: { code: d.code, type: d.type, value: d.value, minSpend: d.minSpend, firstOrderOnly: d.firstOrderOnly, starts: d.starts, ends: d.ends, active: d.active } });
});

export const config = { path: '/api/discounts/check', rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ['ip', 'domain'] } };
