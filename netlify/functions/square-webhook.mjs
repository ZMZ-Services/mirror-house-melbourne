// POST /api/square/webhook: Square tells us when a delivery-quote payment link has been paid, and the order is
// confirmed automatically. Subscribe to "payment.created" and "payment.updated" in the Square Developer Dashboard,
// with this URL, and set SQUARE_WEBHOOK_SIGNATURE_KEY to the key Square shows.
import { query } from '../lib/db.mjs';
import { verifyWebhook } from '../lib/square.mjs';
import { siteUrl } from '../lib/http.mjs';
import { markPaid } from '../lib/admin.mjs';
import { logActivity } from '../lib/store.mjs';

export default async (req) => {
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  const raw = await req.text();
  const url = process.env.SQUARE_WEBHOOK_URL || siteUrl() + '/api/square/webhook';
  if (!verifyWebhook(raw, req.headers.get('x-square-hmacsha256-signature'), url)) return new Response('Bad signature', { status: 403 });
  let body;
  try { body = JSON.parse(raw); } catch { return new Response(null, { status: 400 }); }
  const pay = body && body.data && body.data.object && body.data.object.payment;
  if (!pay || pay.status !== 'COMPLETED' || !pay.order_id) return new Response(null, { status: 200 });
  const row = (await query("SELECT id, total FROM orders WHERE square_order_id = $1 AND payment IN ('quote_sent', 'awaiting_quote')", [pay.order_id])).rows[0];
  if (!row) {
    // Checkout card payments are already recorded. Anything else (e.g. an old quote link) is flagged for checking.
    // Checkout card payments carry the order number as their reference, even before "paid" is saved.
    const ref = /^\d{1,9}$/.test(String(pay.reference_id || '')) ? Number(pay.reference_id) : -1;
    const known = await query('SELECT 1 FROM orders WHERE square_payment_id = $1 OR square_order_id = $2 OR (id = $3 AND square_payment_id IS NULL AND payment_link_id IS NULL)', [pay.id, pay.order_id, ref]);
    const seen = await query("SELECT 1 FROM activity_log WHERE action = 'payment.unmatched' AND entity_id = $1", [String(pay.id)]);
    if (!known.rowCount && !seen.rowCount) {
      await logActivity({ query }, { actorType: 'system', action: 'payment.unmatched', entity: 'payment', entityId: pay.id,
        summary: 'Square received a payment of $' + (((pay.amount_money && pay.amount_money.amount) || 0) / 100).toFixed(2) + ' that doesn\'t match an open order. Check it in Square.', detail: { order_id: pay.order_id, note: pay.note || '' } });
    }
    return new Response(null, { status: 200 });
  }
  const paid = pay.amount_money && pay.amount_money.amount;
  if (paid !== row.total) {
    await query("UPDATE orders SET events = events || $2::jsonb WHERE id = $1", [row.id, JSON.stringify([{ at: Date.now(), text: 'Square reported a payment of ' + (paid / 100).toFixed(2) + ' for this quote, which doesn\'t match the total. Please check it in Square before confirming.' }])]);
    return new Response(null, { status: 200 });
  }
  const card = pay.card_details && pay.card_details.card ? (pay.card_details.card.card_brand || 'Card').replace(/_/g, ' ') + ' ending ' + (pay.card_details.card.last_4 || '') : 'Square payment link';
  await markPaid(row.id, { actorType: 'customer', actor: 'square', card, paymentId: pay.id, receiptUrl: pay.receipt_url || null, text: 'Paid through the Square payment link (' + card + '). Order confirmed.' });
  return new Response(null, { status: 200 });
};

export const config = { path: '/api/square/webhook' };
