// Square Payments API (REST). Card payments from the checkout, refunds from the admin, and payment links for
// delivery quotes. Keys come only from environment variables:
//   SQUARE_ACCESS_TOKEN, SQUARE_LOCATION_ID, SQUARE_APPLICATION_ID, SQUARE_ENVIRONMENT ('sandbox' or 'production'),
//   SQUARE_WEBHOOK_SIGNATURE_KEY (for /api/square/webhook).
import { createHmac, timingSafeEqual } from 'node:crypto';

const VERSION = '2024-10-17'; // Square API version this code was written against

export function squareEnv() {
  return process.env.SQUARE_ENVIRONMENT === 'production' ? 'production' : 'sandbox';
}
export function squareConfigured() {
  return !!(process.env.SQUARE_ACCESS_TOKEN && process.env.SQUARE_LOCATION_ID && process.env.SQUARE_APPLICATION_ID);
}
function apiBase() {
  if (process.env.SQUARE_API_BASE) return process.env.SQUARE_API_BASE.replace(/\/+$/, ''); // tests point this at a mock
  return squareEnv() === 'production' ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com';
}
// What the browser needs to show Square's card form. No secrets.
export function publicSquareConfig() {
  if (!squareConfigured()) return null;
  const prod = squareEnv() === 'production';
  return {
    appId: process.env.SQUARE_APPLICATION_ID,
    locationId: process.env.SQUARE_LOCATION_ID,
    sandbox: !prod,
    sdkUrl: process.env.SQUARE_SDK_URL || (prod ? 'https://web.squarecdn.com/v1/square.js' : 'https://sandbox.web.squarecdn.com/v1/square.js')
  };
}

async function call(method, path, body) {
  if (!squareConfigured()) throw Object.assign(new Error('Card payments aren\'t set up yet. Please email hello@mirrorhousemelbourne.com.au to order.'), { status: 503 });
  let res;
  try {
    res = await fetch(apiBase() + path, {
      method,
      headers: { authorization: 'Bearer ' + process.env.SQUARE_ACCESS_TOKEN, 'square-version': VERSION, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (err) {
    return { ok: false, status: 0, errors: [{ code: 'NETWORK', detail: err.message }] };
  }
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data, errors: data.errors || [] };
}

// Plain-English message for a declined or failed card payment.
export function cardErrorMessage(errors) {
  const code = (errors && errors[0] && errors[0].code) || '';
  const map = {
    CARD_DECLINED: 'Your card was declined. Please try another card.',
    GENERIC_DECLINE: 'Your card was declined. Please try another card.',
    INSUFFICIENT_FUNDS: 'Your card was declined for insufficient funds. Please try another card.',
    CVV_FAILURE: 'The security code (CVV) didn\'t match. Please check it and try again.',
    ADDRESS_VERIFICATION_FAILURE: 'The postcode didn\'t match your card. Please check it and try again.',
    INVALID_EXPIRATION: 'The card expiry date isn\'t right. Please check it and try again.',
    EXPIRATION_FAILURE: 'The card expiry date isn\'t right. Please check it and try again.',
    INVALID_CARD: 'Those card details aren\'t valid. Please check them and try again.',
    CARD_NOT_SUPPORTED: 'That card type isn\'t supported. Please try another card.',
    TRANSACTION_LIMIT: 'This payment is over your card\'s limit. Please try another card.',
    VERIFY_CVV_FAILURE: 'The security code (CVV) didn\'t match. Please check it and try again.',
    NETWORK: 'We couldn\'t reach our payment provider. You haven\'t been charged. Please try again.'
  };
  return map[code] || 'Your payment didn\'t go through, and you haven\'t been charged. Please check your card details and try again.';
}

// Charges a card token from the Web Payments SDK.
export async function createPayment({ sourceId, idempotencyKey, amount, orderId, email, note }) {
  const r = await call('POST', '/v2/payments', {
    source_id: sourceId,
    idempotency_key: idempotencyKey,
    amount_money: { amount, currency: 'AUD' },
    location_id: process.env.SQUARE_LOCATION_ID,
    reference_id: String(orderId),
    buyer_email_address: email || undefined,
    note: note ? String(note).slice(0, 500) : undefined,
    autocomplete: true
  });
  if (!r.ok || !r.data.payment || !['COMPLETED', 'APPROVED'].includes(r.data.payment.status)) {
    return { ok: false, message: cardErrorMessage(r.errors), errors: r.errors };
  }
  const p = r.data.payment;
  const card = p.card_details && p.card_details.card;
  return { ok: true, id: p.id, receiptUrl: p.receipt_url || '', card: card ? (card.card_brand || 'Card').replace(/_/g, ' ') + ' ending ' + (card.last_4 || '') : 'Square' };
}

export async function refundPayment({ paymentId, amount, idempotencyKey, reason }) {
  const r = await call('POST', '/v2/refunds', {
    idempotency_key: idempotencyKey,
    payment_id: paymentId,
    amount_money: { amount, currency: 'AUD' },
    reason: reason ? String(reason).slice(0, 190) : undefined
  });
  if (!r.ok || !r.data.refund || ['REJECTED', 'FAILED'].includes(r.data.refund.status)) {
    const detail = r.errors[0] && r.errors[0].detail;
    return { ok: false, message: 'Square couldn\'t make the refund' + (detail ? ': ' + detail : '.') };
  }
  return { ok: true, id: r.data.refund.id, status: r.data.refund.status };
}

// A secure Square checkout link for a delivery quote: mirrors plus the quoted delivery.
export async function createPaymentLink({ orderId, amount, email, idempotencyKey, redirectUrl }) {
  const r = await call('POST', '/v2/online-checkout/payment-links', {
    idempotency_key: idempotencyKey,
    quick_pay: { name: 'Mirror House order #' + orderId + ' (mirrors and delivery)', price_money: { amount, currency: 'AUD' }, location_id: process.env.SQUARE_LOCATION_ID },
    checkout_options: redirectUrl ? { redirect_url: redirectUrl } : undefined,
    pre_populated_data: email ? { buyer_email: email } : undefined,
    payment_note: 'Mirror House order #' + orderId
  });
  if (!r.ok || !r.data.payment_link) {
    const detail = r.errors[0] && r.errors[0].detail;
    return { ok: false, message: 'Square couldn\'t create the payment link' + (detail ? ': ' + detail : '.') };
  }
  return { ok: true, url: r.data.payment_link.url, squareOrderId: r.data.payment_link.order_id };
}

// Square signs each webhook: base64 HMAC-SHA256 of (notification URL + raw body) with the signature key.
export function verifyWebhook(rawBody, signature, notificationUrl) {
  const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  if (!key || !signature) return false;
  const expected = createHmac('sha256', key).update(notificationUrl + rawBody).digest('base64');
  const a = Buffer.from(expected), b = Buffer.from(String(signature));
  return a.length === b.length && timingSafeEqual(a, b);
}
