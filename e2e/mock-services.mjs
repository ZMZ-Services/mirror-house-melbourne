// Stand-ins for the outside services during the end-to-end run, on one local port:
//   Square's Payments API and a fake card form (square.js), Netlify Identity's /user check, and Resend.
// Nothing here is used by the live site.
import http from 'node:http';

const PORT = Number(process.env.MOCK_PORT || 4010);
const calls = [];
const b64 = (s) => Buffer.from(s, 'base64url').toString();

// A fake Square card form. Test cards: 4111 1111 1111 1111 is approved, 4000 0000 0000 0002 is declined.
const SDK = `window.Square = { payments: function () { return {
  card: function () { return Promise.resolve({
    attach: function (sel) { document.querySelector(sel).innerHTML = '<label style="display:block;padding:8px 0">Card number (test) <input id="fake-card" inputmode="numeric" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:6px"></label>'; return Promise.resolve(); },
    tokenize: function () { var v = (document.querySelector('#fake-card').value || '').replace(/\\s/g, '');
      if (v === '4111111111111111') return Promise.resolve({ status: 'OK', token: 'cnon:card-nonce-ok' });
      if (v === '4000000000000002') return Promise.resolve({ status: 'OK', token: 'cnon:card-nonce-declined' });
      return Promise.resolve({ status: 'Invalid', errors: [{ message: 'Card number is invalid' }] }); }
  }); }
}; } };`;

const server = http.createServer(async (req, res) => {
  let raw = '';
  for await (const c of req) raw += c;
  const body = raw ? (() => { try { return JSON.parse(raw); } catch { return raw; } })() : null;
  const send = (status, data, type = 'application/json') => { res.writeHead(status, { 'content-type': type, 'access-control-allow-origin': '*' }); res.end(type === 'application/json' ? JSON.stringify(data) : data); };
  if (req.url === '/square.js') return send(200, SDK, 'application/javascript');
  if (req.url === '/__calls') return send(200, calls);
  calls.push({ method: req.method, url: req.url, body });
  // Netlify Identity: the token is a JWT the test makes; a token signed "valid" is accepted.
  if (req.url === '/identity/user') {
    const tok = String(req.headers.authorization || '').replace(/^Bearer /, '').split('.');
    if (tok.length !== 3 || tok[2] !== 'valid') return send(401, { msg: 'Invalid token' });
    const p = JSON.parse(b64(tok[1]));
    if (p.exp * 1000 < Date.now()) return send(401, { msg: 'Expired' });
    return send(200, { id: p.sub, email: p.email, app_metadata: p.app_metadata || {}, user_metadata: p.user_metadata || {} });
  }
  if (req.url === '/square/v2/payments') {
    if (body.source_id === 'cnon:card-nonce-declined') return send(402, { errors: [{ code: 'CARD_DECLINED' }] });
    return send(200, { payment: { id: 'pay_' + calls.length, status: 'COMPLETED', amount_money: body.amount_money, receipt_url: 'https://squareup.com/receipt/preview/test', card_details: { card: { card_brand: 'VISA', last_4: '1111' } } } });
  }
  if (req.url === '/square/v2/refunds') return send(200, { refund: { id: 'ref_' + calls.length, status: 'COMPLETED' } });
  if (req.url === '/square/v2/online-checkout/payment-links') return send(200, { payment_link: { url: 'https://square.link/u/test', order_id: 'sqord_' + calls.length } });
  if (req.url === '/resend/emails') return send(200, { id: 'em_' + calls.length });
  send(404, { error: 'not mocked' });
});
server.listen(PORT, '127.0.0.1', () => console.log('mock services on ' + PORT));
