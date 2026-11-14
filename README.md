# Mirror House Melbourne

The online store for Mirror House Melbourne (architectural floor and wall mirrors, Point Cook VIC), hosted on Netlify.
Customers browse, buy and pay by card through Square. The owner signs in to the admin to manage orders, products,
the mailing list, discounts, delivery zones and settings. Everything is saved in a Postgres database (Netlify Database).

The shop's design, copy and layout are Debbie's own build (imported unchanged in PR #1). This repository adds the
server side and wires her pages to it.

## How it fits together

| Part | Where | What it does |
| --- | --- | --- |
| Shop pages | `public/*.html`, `public/js/store.js`, `public/css/` | Her storefront. Loads live products, prices and stock from `/api/products`, and the live settings from `/api/config.js`. |
| Admin | `public/admin-dashboard.html`, `public/js/admin-*.js` | Her admin. Sign-in with Netlify Identity; data loads from `/api/admin/state` and changes save through `/api/admin/sync`. |
| Functions | `netlify/functions/` | The API (one file per route; the route is in each file's `config.path`). |
| Server code | `netlify/lib/` | Pricing, orders, Square, emails, admin changes, visit counting. |
| Database | `netlify/database/migrations/` | Schema and the starting data (her 48 products, zones, WELCOME10, store settings). Netlify applies new migrations on every deploy. |
| Build | `scripts/build.mjs` | Copies `public/` to `dist/`, sets the site address in canonical/Open Graph/schema.org links, writes `robots.txt`. |

### API

| Route | Who | What |
| --- | --- | --- |
| `GET /api/products` | public | Active products with live price, stock and photos |
| `GET /api/config.js` | public | Square's public card-form details, GA4 ID, GST status, delivery zones (no secrets, no codes) |
| `POST /api/orders` | public | The checkout. Re-prices on the server, holds stock, charges the card with Square, sends emails |
| `POST /api/discounts/check` | public | Looks up one discount code for the Apply button |
| `POST /api/newsletter` | public | Footer sign-up; sends the welcome email with WELCOME10 |
| `POST /api/track` | public | Counts visits for the admin's Analytics page (no cookies) |
| `POST /api/square/webhook` | Square | Confirms a delivery quote once the customer pays the Square link |
| `GET /sitemap.xml` | public | Shop pages and every active product |
| `GET /media/*` | public | Product photos uploaded in the admin (Netlify Blobs) |
| `GET /api/admin/state` | admin | Everything the admin shows |
| `POST /api/admin/sync` | admin | Saves admin changes; each one goes in the activity log |
| `POST /api/admin/uploads` | admin | Uploads a product photo to Netlify Blobs |

Every `/api/admin` route checks the signed-in Netlify Identity user on the server (the token is verified with the
site's Identity service), and the user needs the `admin` role or an email listed in `ADMIN_EMAILS`.

### Pricing (server side)

The server never uses totals from the browser. It works out:

- **Delivery** by postcode zone, as set in Admin → Shipping & delivery (Zone 1 $49, Zone 2 $79, Zone 3 $109 at launch),
  one fee per up to 4 mirrors. Pick-up in Point Cook is free.
- **Outside the zones**: a quote request. No payment is taken; the admin sends a delivery quote with a Square
  payment link, and the order confirms itself when the customer pays (Square webhook).
- **Discount codes** from Admin → Discounts: active, start and end dates (Melbourne time), minimum spend, usage limit,
  and first-order-only (WELCOME10: 10% off the mirrors, first paid order per email).
- **Stock**: the products are locked while an order is priced, so two people can't buy the last one. Selling the last
  unit marks it sold out. A declined card puts the stock back.

## Environment variables

Set these in Netlify (Site configuration → Environment variables). Never put values in the code.

| Name | Needed for | Notes |
| --- | --- | --- |
| `SQUARE_APPLICATION_ID` | Card payments | Square Developer Dashboard → your app → Credentials |
| `SQUARE_ACCESS_TOKEN` | Card payments | Same page. Secret. |
| `SQUARE_LOCATION_ID` | Card payments | Square Developer Dashboard → Locations |
| `SQUARE_ENVIRONMENT` | Card payments | `production` for real payments, `sandbox` for testing |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | Quote payment links | Square Developer Dashboard → Webhooks, subscription to `payment.created` and `payment.updated` at `https://<site>/api/square/webhook` |
| `RESEND_API_KEY` | Emails | From resend.com. Emails are off until it's set; orders still work. Secret. |
| `EMAIL_FROM` | Emails | e.g. `Mirror House Melbourne <orders@mirrorhousemelbourne.com.au>` (domain verified in Resend) |
| `ADMIN_EMAIL` | New-order alerts | Defaults to the store email in Admin → Settings |
| `ADMIN_EMAILS` | Admin access (optional) | Comma-separated emails allowed in, as well as Identity users with the `admin` role |
| `SITE_URL` | Links, sitemap | e.g. `https://mirrorhousemelbourne.com.au`. Defaults to Netlify's site address |
| `GA_MEASUREMENT_ID` | Google Analytics (optional) | Used only if no ID is saved in Admin → Settings |

The database connection is provided by Netlify Database automatically (`NETLIFY_DB_URL`).

## Deploying

Production deploys are made by hand with the Netlify CLI (`npx netlify-cli deploy --build --prod`), never from
pull requests. Deploy previews and branch deploys are switched off in `netlify.toml`, because Netlify Database would
give each one a copy of the production data behind a public link. The site isn't linked to Git in Netlify (it was a
drag-and-drop site), so merging a pull request never deploys by itself.

## Run it locally

Needs Node 22 and a local Postgres.

```sh
npm install
DATABASE_URL=postgres://user:pass@localhost:5432/mirrorhouse npm run migrate
DATABASE_URL=postgres://user:pass@localhost:5432/mirrorhouse npm run dev      # http://localhost:8888
```

Without Square keys the checkout shows "Card payments are being set up". To try payments locally, use Square
**sandbox** keys (`SQUARE_ENVIRONMENT=sandbox`) and Square's test card 4111 1111 1111 1111.

## Tests

```sh
npm test        # Function tests: pricing, promo, stock, payments, refunds, quotes, auth, uploads (local Postgres)
npm run e2e     # Playwright, desktop and phone: shop checkout and the admin, under `netlify dev`
```

Both use a local Postgres (`mh_test` and `mh_e2e` databases, user `mh`; override with `TEST_DATABASE_URL` and
`E2E_DATABASE_URL`) and stand-ins for Square, Netlify Identity and Resend, so no real keys are needed.

## Changing the starting data

`netlify/database/migrations/0002_seed.sql` was generated from Debbie's build by `node scripts/gen-seed.mjs`. Once the
site is live, change products and settings in the admin, not here. Schema changes go in a new numbered migration.
