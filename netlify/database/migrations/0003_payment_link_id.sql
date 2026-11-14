-- The Square payment link sent with a delivery quote, so an older link can be switched off when a new quote
-- is sent or the request is cancelled.
ALTER TABLE orders ADD COLUMN payment_link_id text;
