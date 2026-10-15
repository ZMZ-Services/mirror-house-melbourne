# Mirror House Melbourne (demo store)

A demo storefront for architectural mirrors and artisan homewares, with a back-of-house dashboard and a 3D "try it in your room" visualiser. Hosted on a Cloudflare Worker with a D1 database, deployed by Cloudflare Workers Builds on every push to `main`.

Live: <https://mirror-house-melbourne.zarko-ddc.workers.dev>

## Layout

| Path | What it is |
| --- | --- |
| `public/index.html` | Storefront home page |
| `public/product.html`, `public/checkout.html` | Product page (`?slug=`) and checkout |
| `public/visualiser.html` | Upload a room photo, mark the back wall, place a mirror in 3D with live reflections |
| `public/admin-dashboard.html` | Back-of-house dashboard (KPIs, charts, unit economics, stock, cash, actions) plus live D1 figures |
| `public/css/theme.css`, `public/js/store.js` | Storefront styles; catalogue, bag, quick view, product page and checkout logic |
| `public/images/` | Original imagery generated with Higgsfield |
| `src/worker.js` | Cloudflare Worker: serves `public/`, runs the JSON API and password-protects `/admin*` |
| `migrations/` | D1 schema and demo product seed |
| `wrangler.jsonc` | Worker and D1 config (worker `mirror-house-melbourne`, ZMZ Services account) |

## API

| Route | Access | What it does |
| --- | --- | --- |
| `GET /api/products` | public | Active catalogue from D1 |
| `POST /api/newsletter` | public | `{ email }`: saves a newsletter signup |
| `POST /api/orders` | public | `{ email, items: [{ slug, qty }], breakage_cover, white_glove }`: records a pending order. Prices come from D1, never the browser |
| `GET /api/admin/summary` | admin | Live 30-day revenue, orders, AOV, breakage-cover uptake, sales by category, low stock, recent orders, subscribers |

The admin pages (`/admin*`) and `/api/admin/*` use browser login: user `admin`, password = the `ADMIN_PASSWORD` Worker secret. Until that secret is set, admin stays locked (503).

## Deploying (Cloudflare Workers Builds)

Cloudflare pulls this repo through its GitHub app and deploys on every push to `main`, the same way as the other ZMZ Workers. No API tokens or GitHub secrets are involved.

Workers Builds settings:

| Setting | Value |
| --- | --- |
| Account | zarko@zmzservices.com.au (`zarko-ddc.workers.dev`) |
| Worker name | `mirror-house-melbourne` (must match `name` in `wrangler.jsonc`) |
| Repository | `vojinoviczarko95-tech/mirror-house-melbourne` |
| Production branch | `main` |
| Root directory | `/` |
| Build command | *(empty)* |
| Deploy command | `npm run deploy` |
| Non-production branch builds | Off |

`npm run deploy` runs `wrangler deploy` and then `wrangler d1 migrations apply DB --remote`.

- **Database.** `wrangler.jsonc` names the D1 database `mirror-house-db` without an ID, so the first deploy creates it automatically (Wrangler's automatic provisioning). Every deploy after that finds it by name and applies any new files in `migrations/`.
- **Admin password.** After the first deploy, open the Worker in the Cloudflare dashboard → Settings → Variables and Secrets → Add → type **Secret**, name `ADMIN_PASSWORD`. Secrets survive later deploys.

## Run locally

```sh
npm install
printf 'ADMIN_PASSWORD=localtest\n' > .dev.vars
npm run db:migrate:local
npm run dev            # http://localhost:8787
```

## Status

Demo. The reviews, rating, seed products and freight settings (top of `src/worker.js` and `public/js/store.js`) are placeholders. Orders are recorded as `pending`; Square payment isn't connected.

## Changes from the October 2026 review

- Breakage cover now reads the same everywhere: an optional $12.50 add-on at checkout.
- Hanging advice now says to fix into studs or masonry, not plasterboard alone.
- The FAQ structured data matches the visible FAQ. White Glove and payment questions were added to the visible list, and the unused site-search markup was removed.
- New Higgsfield imagery: hero background, Grand Royale banner, crating photo, product photos, sample rooms and a 1200×630 social share image.
- Emoji trust icons are replaced with line icons. Contrast fixes bring the text to WCAG AA.
- Screen-reader fixes: labelled close buttons, dialogs for the quick view and bag, a labelled newsletter field, star ratings with text labels, and a fixed heading order.
- The newsletter form saves to D1 and confirms inline.
- Copy uses Australian spelling and plainer wording.
