-- Mirror House Melbourne: store schema (Netlify DB / Postgres).
-- Money is stored in cents (integers). Times are timestamptz.

CREATE TABLE products (
  slug            text PRIMARY KEY,
  title           text NOT NULL,
  category        text NOT NULL DEFAULT 'Wall Mirrors',
  price           integer NOT NULL CHECK (price >= 0),
  compare_at      integer CHECK (compare_at >= 0),
  cost            integer CHECK (cost >= 0),
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft', 'archived')),
  stock           integer CHECK (stock >= 0),          -- NULL = not tracked (always available)
  low_at          integer CHECK (low_at >= 0),
  supplier_code   text NOT NULL DEFAULT '',
  sku             text NOT NULL DEFAULT '',
  weight          text NOT NULL DEFAULT '',
  size            text NOT NULL DEFAULT '',
  badge           text NOT NULL DEFAULT '',
  both_ways       boolean NOT NULL DEFAULT false,
  images          jsonb NOT NULL DEFAULT '[]'::jsonb,
  description     text NOT NULL DEFAULT '',
  specs           jsonb NOT NULL DEFAULT '[]'::jsonb,
  tags            text NOT NULL DEFAULT '',
  seo_title       text NOT NULL DEFAULT '',
  seo_desc        text NOT NULL DEFAULT '',
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE customers (
  email           text PRIMARY KEY,                    -- always lower case
  name            text NOT NULL DEFAULT '',
  phone           text NOT NULL DEFAULT '',
  address         jsonb,
  marketing       boolean NOT NULL DEFAULT false,
  note            text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE SEQUENCE order_number_seq START WITH 1001;

CREATE TABLE orders (
  id                  integer PRIMARY KEY DEFAULT nextval('order_number_seq'),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  email               text NOT NULL REFERENCES customers (email) ON UPDATE CASCADE,
  name                text NOT NULL,
  phone               text NOT NULL DEFAULT '',
  address             jsonb,
  method              text NOT NULL CHECK (method IN ('delivery', 'pickup')),
  zone                text,
  delivery_day        date,
  note                text NOT NULL DEFAULT '',
  marketing           boolean NOT NULL DEFAULT false,
  lines               jsonb NOT NULL,                  -- [{ slug, title, price, qty }]
  subtotal            integer NOT NULL,
  discount_code       text,
  discount            integer NOT NULL DEFAULT 0,
  delivery            integer NOT NULL DEFAULT 0,
  total               integer NOT NULL,
  payment             text NOT NULL CHECK (payment IN ('pending', 'paid', 'failed', 'awaiting_quote', 'quote_sent', 'voided', 'refunded', 'partially_refunded')),
  fulfilment          text NOT NULL CHECK (fulfilment IN ('unfulfilled', 'on_hold', 'ready', 'picked_up', 'out_for_delivery', 'delivered', 'cancelled')),
  stock_taken         boolean NOT NULL DEFAULT false,  -- true once the mirrors have come out of stock
  tracking            text NOT NULL DEFAULT '',
  card                text NOT NULL DEFAULT '',
  refunded            integer NOT NULL DEFAULT 0,
  events              jsonb NOT NULL DEFAULT '[]'::jsonb,
  idempotency_key     text UNIQUE,
  square_payment_id   text,
  square_order_id     text,
  square_receipt_url  text,
  payment_link_url    text,
  session_id          text
);
CREATE INDEX orders_email_idx ON orders (email);
CREATE INDEX orders_created_idx ON orders (created_at);
CREATE INDEX orders_square_order_idx ON orders (square_order_id);

CREATE TABLE subscribers (
  email           text PRIMARY KEY,                    -- lower case
  source          text NOT NULL DEFAULT 'Website sign-up',
  joined_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE discount_codes (
  code              text PRIMARY KEY,                  -- upper case
  type              text NOT NULL DEFAULT 'pct' CHECK (type IN ('pct', 'fixed')),
  value             integer NOT NULL CHECK (value >= 0), -- percent, or cents for fixed
  min_spend         integer NOT NULL DEFAULT 0,
  first_order_only  boolean NOT NULL DEFAULT false,
  starts            date,
  ends              date,
  usage_limit       integer,
  active            boolean NOT NULL DEFAULT true,
  sort_order        integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Store settings, shipping zones and pick-up details, as JSON documents.
CREATE TABLE settings (
  key             text PRIMARY KEY,
  value           jsonb NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Who changed what, and when. Admin edits, orders and sign-ups.
CREATE TABLE activity_log (
  id              bigserial PRIMARY KEY,
  at              timestamptz NOT NULL DEFAULT now(),
  actor_type      text NOT NULL CHECK (actor_type IN ('admin', 'customer', 'system')),
  actor           text NOT NULL DEFAULT '',
  action          text NOT NULL,
  entity          text NOT NULL DEFAULT '',
  entity_id       text NOT NULL DEFAULT '',
  summary         text NOT NULL DEFAULT '',
  detail          jsonb
);
CREATE INDEX activity_log_at_idx ON activity_log (at DESC);

-- Shop visits: page views and shop steps, counted on the site itself (no cookies).
CREATE TABLE site_events (
  id              bigserial PRIMARY KEY,
  at              timestamptz NOT NULL DEFAULT now(),
  session_id      text NOT NULL,
  visitor_id      text NOT NULL,
  new_visitor     boolean NOT NULL DEFAULT false,
  type            text NOT NULL,
  path            text NOT NULL DEFAULT '',
  item            text NOT NULL DEFAULT '',
  source          text NOT NULL DEFAULT '',
  device          text NOT NULL DEFAULT '',
  city            text NOT NULL DEFAULT '',
  region          text NOT NULL DEFAULT ''
);
CREATE INDEX site_events_at_idx ON site_events (at);
CREATE INDEX site_events_session_idx ON site_events (session_id);
