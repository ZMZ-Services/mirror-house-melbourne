// Builds the live site into dist/: copies public/, leaves out the email previews page, points canonical,
// Open Graph and schema.org links at the site's address, and writes robots.txt.
// The site address is one setting: SITE_URL (falls back to Netlify's URL for the site, then https://mirrorhousemelbourne.com.au).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'public');
const out = path.join(root, 'dist');
const DEFAULT_URL = 'https://mirrorhousemelbourne.com.au';
const siteUrl = (process.env.SITE_URL || process.env.URL || DEFAULT_URL).replace(/\/+$/, '');
const SKIP = new Set(['emails.html']); // a preview of example emails, not part of the live shop

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(src, out, { recursive: true, filter: (p) => !SKIP.has(path.relative(src, p)) });

let pages = 0;
for (const f of fs.readdirSync(out).filter((f) => f.endsWith('.html'))) {
  const file = path.join(out, f);
  const html = fs.readFileSync(file, 'utf8');
  const next = html.split(DEFAULT_URL).join(siteUrl);
  if (next !== html) { fs.writeFileSync(file, next); pages++; }
}

fs.writeFileSync(path.join(out, 'robots.txt'), [
  'User-agent: *',
  'Disallow: /admin-dashboard.html',
  'Disallow: /admin',
  'Disallow: /api/',
  'Disallow: /checkout.html',
  '',
  'Sitemap: ' + siteUrl + '/sitemap.xml',
  ''
].join('\n'));

console.log('Built dist/ for ' + siteUrl + (pages && siteUrl !== DEFAULT_URL ? ' (site address set in ' + pages + ' pages)' : ''));
