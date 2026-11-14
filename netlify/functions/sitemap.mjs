// GET /sitemap.xml: the shop's pages and every active product, from the database, so new mirrors are included.
import { query } from '../lib/db.mjs';
import { siteUrl } from '../lib/http.mjs';

const SHOP = ['Floor Mirrors', 'Wall Mirrors'];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

export default async () => {
  const base = siteUrl();
  const urls = [[base + '/', null], [base + '/visualiser.html', null], [base + '/policies.html', null]];
  try {
    const r = await query("SELECT slug, updated_at FROM products WHERE status = 'active' AND category = ANY($1) ORDER BY sort_order, slug", [SHOP]);
    r.rows.forEach((p) => urls.push([base + '/product.html?slug=' + encodeURIComponent(p.slug), new Date(p.updated_at).toISOString().slice(0, 10)]));
  } catch (err) {
    console.error('sitemap: products unavailable', err.message);
  }
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(([u, d]) => '  <url><loc>' + esc(u) + '</loc>' + (d ? '<lastmod>' + d + '</lastmod>' : '') + '</url>').join('\n') + '\n</urlset>\n';
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
};

export const config = { path: '/sitemap.xml' };
