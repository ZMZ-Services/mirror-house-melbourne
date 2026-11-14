// POST /api/track: counts shop visits for the admin's Analytics page. No cookies and no personal details:
// a random visit id (kept for the browser tab) and a random visitor id, the page, where the visit came from,
// the kind of device and the rough location Netlify gives for the request.
import { query } from '../lib/db.mjs';
import { handle } from '../lib/http.mjs';
import { sourceOf, deviceOf } from '../lib/tracking.mjs';

const TYPES = new Set(['page_view', 'view_item', 'add_to_cart', 'begin_checkout', 'try_in_your_room']);
const ID = /^[A-Za-z0-9-]{8,64}$/;

export default handle(async (req, context) => {
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  const text = (await req.text()).slice(0, 4000);
  let b;
  try { b = JSON.parse(text); } catch { return new Response(null, { status: 204 }); }
  if (!b || !TYPES.has(b.type) || !ID.test(String(b.sid || '')) || !ID.test(String(b.vid || ''))) return new Response(null, { status: 204 });
  if (/bot|crawl|spider|slurp|headless|lighthouse/i.test(req.headers.get('user-agent') || '') && !process.env.MH_TRACK_ALL) return new Response(null, { status: 204 });
  const host = new URL(req.url).hostname;
  const geo = (context && context.geo) || {};
  await query('INSERT INTO site_events (session_id, visitor_id, new_visitor, type, path, item, source, device, city, region) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [
    b.sid, b.vid, b.nv === true, b.type, String(b.path || '').slice(0, 200), String(b.item || '').slice(0, 120),
    sourceOf(b.ref, b.utm, host), deviceOf(req.headers.get('user-agent')),
    String(geo.city || '').slice(0, 80), String((geo.subdivision && geo.subdivision.name) || (geo.country && geo.country.code !== 'AU' ? geo.country.name : '') || '').slice(0, 80)
  ]);
  return new Response(null, { status: 204 });
});

export const config = { path: '/api/track', rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ['ip', 'domain'] } };
