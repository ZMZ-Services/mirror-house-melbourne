// Test helpers: a fresh local Postgres schema, and small mock servers standing in for Square, Netlify Identity
// and Resend, so the Functions run end to end without any real keys.
import http from 'node:http';
import pg from 'pg';
import { migrate } from '../scripts/migrate.mjs';

export const TEST_DB = process.env.TEST_DATABASE_URL || 'postgres://mh:mh@localhost:5432/mh_test';

export async function resetDb() {
  const c = new pg.Client({ connectionString: TEST_DB });
  await c.connect();
  await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await c.end();
  await migrate(TEST_DB, () => {});
}

export function listen(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      let body = '';
      for await (const chunk of req) body += chunk;
      let data = null;
      try { data = body ? JSON.parse(body) : null; } catch { data = body; }
      const out = await handler({ method: req.method, url: req.url, headers: req.headers, body: data });
      res.writeHead(out.status || 200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(out.body || {}));
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, url: 'http://127.0.0.1:' + server.address().port, close: () => new Promise((r) => server.close(r)) }));
  });
}

// Square: card nonce "cnon:card-nonce-ok" is approved, "cnon:card-nonce-declined" is declined (as in Square's sandbox).
export async function mockSquare() {
  const calls = [];
  const seen = new Map();
  const m = await listen(({ method, url, headers, body }) => {
    calls.push({ method, url, headers, body });
    if (headers.authorization !== 'Bearer test-square-token') return { status: 401, body: { errors: [{ code: 'UNAUTHORIZED' }] } };
    if (url === '/v2/payments') {
      if (seen.has(body.idempotency_key)) return { body: seen.get(body.idempotency_key) };
      if (body.source_id === 'cnon:card-nonce-declined') return { status: 402, body: { errors: [{ code: 'CARD_DECLINED', category: 'PAYMENT_METHOD_ERROR' }] } };
      const out = { payment: { id: 'pay_' + calls.length, status: 'COMPLETED', amount_money: body.amount_money, receipt_url: 'https://squareup.com/receipt/preview/test', card_details: { card: { card_brand: 'VISA', last_4: '1111' } } } };
      seen.set(body.idempotency_key, out);
      return { body: out };
    }
    if (url === '/v2/refunds') return { body: { refund: { id: 'ref_' + calls.length, status: 'COMPLETED', amount_money: body.amount_money } } };
    if (url === '/v2/online-checkout/payment-links') return { body: { payment_link: { id: 'pl_1', url: 'https://square.link/u/test' + calls.length, order_id: 'sqord_' + calls.length } } };
    return { status: 404, body: { errors: [{ code: 'NOT_FOUND' }] } };
  });
  return Object.assign(m, { calls });
}

// Netlify Identity: GET /user with a known token returns that user.
export async function mockIdentity(users) {
  return listen(({ url, headers }) => {
    if (url !== '/user') return { status: 404 };
    const tok = String(headers.authorization || '').replace(/^Bearer /, '');
    const u = users[tok];
    return u ? { body: u } : { status: 401, body: { msg: 'Invalid token' } };
  });
}

export async function mockResend() {
  const sent = [];
  const m = await listen(({ url, body }) => { if (url === '/emails') { sent.push(body); return { body: { id: 'em_' + sent.length } }; } return { status: 404 }; });
  return Object.assign(m, { sent });
}

export const ADMIN_TOKEN = 'admin-token-aaaaaaaaaaaaaaaaaaaaaaaa';
export const STAFF_TOKEN = 'staff-token-bbbbbbbbbbbbbbbbbbbbbbbb';
export const USERS = {
  [ADMIN_TOKEN]: { email: 'debbie@example.com', app_metadata: { roles: ['admin'] }, user_metadata: { full_name: 'Debbie' } },
  [STAFF_TOKEN]: { email: 'someone@example.com', app_metadata: { roles: [] }, user_metadata: {} }
};

// Starts the mocks and points the Functions at them. Call before importing any Function.
export async function setupEnv() {
  const square = await mockSquare();
  const identity = await mockIdentity(USERS);
  const resend = await mockResend();
  Object.assign(process.env, {
    DATABASE_URL: TEST_DB,
    SQUARE_ACCESS_TOKEN: 'test-square-token', SQUARE_LOCATION_ID: 'LTEST', SQUARE_APPLICATION_ID: 'sandbox-sq0idb-test', SQUARE_ENVIRONMENT: 'sandbox',
    SQUARE_API_BASE: square.url, SQUARE_WEBHOOK_SIGNATURE_KEY: 'test-signature-key',
    MH_IDENTITY_URL: identity.url,
    RESEND_API_KEY: 'test-resend-key', RESEND_API_BASE: resend.url, EMAIL_FROM: 'Mirror House <orders@example.com>', ADMIN_EMAIL: 'debbie@example.com',
    SITE_URL: 'https://shop.example.com', MH_TRACK_ALL: '1'
  });
  return { square, identity, resend, close: () => Promise.all([square.close(), identity.close(), resend.close()]) };
}

export function req(method, path, { body, token, headers = {} } = {}) {
  const h = { ...headers };
  if (body !== undefined && !h['content-type']) h['content-type'] = 'application/json';
  if (token) h.authorization = 'Bearer ' + token;
  return new Request('https://shop.example.com' + path, { method, headers: h, body: body === undefined ? undefined : typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body) });
}
export async function call(fn, request, context = {}) {
  const res = await fn(request, context);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

// A valid checkout body; override any field.
let n = 0;
export function checkout(over = {}) {
  n++;
  return Object.assign({
    email: 'sarah' + n + '@example.com', phone: '0412 345 678', name: 'Sarah Example', method: 'delivery', marketing: false,
    address: { line1: '12 Example St', suburb: 'Point Cook', state: 'VIC', postcode: '3030' },
    deliveryDay: null, note: '', items: [{ slug: 'soho-slim-frame-mirror-black', qty: 1 }],
    discount_code: null, source_id: 'cnon:card-nonce-ok', idempotency_key: 'test-key-' + Date.now() + '-' + n
  }, over);
}
