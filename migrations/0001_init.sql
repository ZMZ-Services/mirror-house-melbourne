-- Core store tables. Money is stored in cents to avoid rounding errors.

CREATE TABLE products (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT    NOT NULL UNIQUE,
  name          TEXT    NOT NULL,
  category      TEXT    NOT NULL,
  price_cents   INTEGER NOT NULL CHECK (price_cents >= 0),
  cost_cents    INTEGER NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
  stock         INTEGER NOT NULL DEFAULT 0,
  reorder_point INTEGER NOT NULL DEFAULT 0,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE orders (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  email           TEXT    NOT NULL,
  status          TEXT    NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded')),
  subtotal_cents  INTEGER NOT NULL,
  shipping_cents  INTEGER NOT NULL DEFAULT 0,
  cover_cents     INTEGER NOT NULL DEFAULT 0,
  white_glove     INTEGER NOT NULL DEFAULT 0,
  total_cents     INTEGER NOT NULL,
  created_at      TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_orders_created_at ON orders (created_at);

CREATE TABLE order_items (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id         INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  product_id       INTEGER NOT NULL REFERENCES products (id),
  qty              INTEGER NOT NULL CHECK (qty > 0),
  unit_price_cents INTEGER NOT NULL
);
CREATE INDEX idx_order_items_order ON order_items (order_id);

CREATE TABLE newsletter_subscribers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
