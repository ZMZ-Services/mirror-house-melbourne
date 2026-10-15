# Mirror House Melbourne (demo store)

A demo storefront for architectural mirrors and artisan homewares, with a back-of-house dashboard. It's hosted on a Cloudflare Worker with a D1 database.

## Layout

| Path | What it is |
| --- | --- |
| `public/index.html` | Storefront home page. It also needs the main project's `/css/theme.css`, `/js/store.js`, `product.html`, `checkout.html` and `admin.html`; add them to `public/`. |
| `public/admin-dashboard.html` | Back-of-house dashboard (KPIs, charts, unit economics, stock, cash, customers, action list). |
| `public/images/` | Original imagery generated with Higgsfield. |
| `src/worker.js` | Cloudflare Worker: serves `public/`, runs the JSON API and password-protects `/admin*`. |
| `migrations/` | D1 database schema and demo product seed. |
| `wrangler.jsonc` | Worker and D1 config. |
| `.github/workflows/deploy.yml` | Deploys on every push to `main`, or by hand from the Actions tab. |

## API

| Route | Access | What it does |
| --- | --- | --- |
| `GET /api/products` | public | Active catalogue from D1 |
| `POST /api/newsletter` | public | `{ email }`: saves a newsletter signup (the footer form uses this) |
| `POST /api/orders` | public | `{ email, items: [{ slug, qty }], breakage_cover, white_glove }`: records a pending order. Prices come from D1, never the browser |
| `GET /api/admin/summary` | admin | Live 30-day revenue, orders, AOV, breakage-cover uptake, sales by category, low stock, recent orders, subscribers |

The admin pages (`/admin*`) and `/api/admin/*` use browser login: user `admin`, password = the `ADMIN_PASSWORD` secret. If that secret isn't set, admin stays locked.

## First deploy (one-off setup, about 5 minutes)

1. **Cloudflare API token.** In the ZMZ Services Cloudflare account (the account ID is pinned in `wrangler.jsonc`), go to My Profile → API Tokens → Create Token → use the **Edit Cloudflare Workers** template, then add the permission **Account → D1 → Edit**. Create it and copy the token.
2. **GitHub secrets.** In this repo go to Settings → Secrets and variables → Actions → New repository secret. Add:
   - `CLOUDFLARE_API_TOKEN`
   - `ADMIN_PASSWORD` (pick one for the admin pages)
3. **Deploy.** Merge to `main`, or open Actions → *Deploy to Cloudflare* → Run workflow. The first run creates the `mirror-house-db` database in Oceania, sets up the tables, seeds the demo products and publishes the site at `https://mirror-house-melbourne.zarko-ddc.workers.dev`.

Every later push to `main` redeploys and applies any new files in `migrations/`.

## Run locally

```sh
npm install
printf 'ADMIN_PASSWORD=localtest\n' > .dev.vars
npm run db:migrate:local
npm run dev            # http://localhost:8787
```

## Status

Demo. The reviews, rating, seed products and freight settings (top of `src/worker.js`) are placeholders. Orders are recorded as `pending`; Square payment isn't connected yet.

## Changes from the October 2026 review

- Breakage cover now reads the same everywhere: an optional $12.50 add-on at checkout, matching the checkout page.
- Hanging advice now says to fix into studs or masonry, not plasterboard alone.
- The FAQ structured data matches the visible FAQ word for word. White Glove and payment questions were added to the visible list, and the unused site-search markup was removed.
- New Higgsfield imagery: hero background, Grand Royale banner, a crating photo in the delivery section and a 1200×630 social share image.
- Emoji trust icons are replaced with line icons. The rating colour and reviewer-name contrast now pass WCAG AA.
- Screen-reader fixes: labelled close buttons, the quick view marked as a dialog, a labelled newsletter field, star ratings with text labels, and a fixed heading order.
- The newsletter form saves to D1 and confirms inline.
- Inline styles are moved into one `<style>` block, ready to fold into `theme.css`.
- Copy uses Australian spelling and plainer wording. Menu labels are tidied.
