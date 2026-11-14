// GET /api/config.js: the live settings every shop page needs before js/store.js runs:
// Square's public card-form details, the Google Analytics ID, GST status and the delivery zones.
// No secrets and no discount codes are included.
import { query } from '../lib/db.mjs';
import { handle } from '../lib/http.mjs';
import { publicSquareConfig } from '../lib/square.mjs';

export default handle(async () => {
  let store = {}, shipping = null;
  try {
    const r = await query("SELECT key, value FROM settings WHERE key IN ('store', 'shipping')");
    for (const row of r.rows) { if (row.key === 'store') store = row.value || {}; else shipping = row.value; }
  } catch (err) {
    console.error('config: settings unavailable', err.message); // the shop still loads; checkout uses its defaults
  }
  const ga = /^G-[A-Z0-9]{4,}$/i.test(store.gaId || '') ? store.gaId : /^G-[A-Z0-9]{4,}$/i.test(process.env.GA_MEASUREMENT_ID || '') ? process.env.GA_MEASUREMENT_ID : '';
  const out = {
    MH_SQUARE: publicSquareConfig(),
    MH_GA_ID: ga.toUpperCase(),
    MH_GST_REGISTERED: !!store.gstRegistered,
    MH_CHECKOUT_SETTINGS: shipping ? { shipping: { zones: shipping.zones || [], quoteBeyond: !!shipping.quoteBeyond, pickup: shipping.pickup || null, timeframe: shipping.timeframe || '' }, discounts: [] } : null
  };
  const js = Object.entries(out).map(([k, v]) => 'window.' + k + ' = ' + JSON.stringify(v).replace(/</g, '\\u003c') + ';').join('\n') + '\n';
  return new Response(js, { headers: { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'public, max-age=60' } });
});

export const config = { path: '/api/config.js' };
