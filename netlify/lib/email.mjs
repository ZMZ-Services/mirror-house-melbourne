// Order emails, sent through Resend (https://resend.com). Wording follows the email previews Debbie approved
// (her emails.html). Sending is off until RESEND_API_KEY is set. A failed email never fails an order: it is
// logged and recorded on the order timeline instead.
//   RESEND_API_KEY  - turns sending on
//   EMAIL_FROM      - e.g. "Mirror House Melbourne <orders@mirrorhousemelbourne.com.au>" (a domain verified in Resend)
//   ADMIN_EMAIL     - where new-order alerts go (defaults to the store email in Settings)
import { money } from './pricing.mjs';
import { siteUrl } from './http.mjs';

export function emailConfigured() {
  return !!process.env.RESEND_API_KEY;
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export async function sendEmail({ to, subject, html, text, replyTo }) {
  if (!emailConfigured()) return { ok: false, skipped: true, reason: 'Email sending isn\'t switched on yet' };
  const from = process.env.EMAIL_FROM || 'Mirror House Melbourne <onboarding@resend.dev>';
  try {
    const res = await fetch((process.env.RESEND_API_BASE || 'https://api.resend.com') + '/emails', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html, text, reply_to: replyTo || undefined }),
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('email failed', res.status, body.slice(0, 300));
      return { ok: false, reason: 'The email service returned an error (' + res.status + ')' };
    }
    return { ok: true };
  } catch (err) {
    console.error('email failed', err.message);
    return { ok: false, reason: 'The email service couldn\'t be reached' };
  }
}

// ---------- layout ----------
function layout(store, inner) {
  const s = store || {};
  return '<!doctype html><html lang="en-AU"><body style="margin:0;background:#EFEBE5;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Arial,sans-serif;color:#1F1B17">' +
    '<div style="max-width:600px;margin:0 auto;padding:24px 16px">' +
    '<div style="background:#fff;border-radius:12px;padding:28px 24px;border:1px solid #E2DBD1">' +
    '<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:22px;letter-spacing:.24em;text-align:center">MIRROR HOUSE</div>' +
    '<div style="font-size:11px;letter-spacing:.3em;text-align:center;color:#5C554D;margin-bottom:22px">MELBOURNE</div>' + inner + '</div>' +
    '<p style="font-size:12px;color:#5C554D;line-height:1.6;text-align:center;margin:16px 0 0">' + esc(s.legalName || 'Mirrorhousemelbourne') +
    (s.abn ? ' · ABN ' + esc(s.abn) : '') + '<br>' + esc(s.address || 'Point Cook VIC 3030') + ' · ' + esc(s.phone1 || '') + ' · ' + esc(s.email || '') +
    '<br>Questions? Just reply to this email.</p></div></body></html>';
}
const h1 = (t) => '<h1 style="font-family:Georgia,serif;font-weight:500;font-size:26px;margin:0 0 8px">' + esc(t) + '</h1>';
const p = (t) => '<p style="line-height:1.6;margin:0 0 14px;color:#1F1B17">' + t + '</p>';
const btn = (href, label) => '<p style="margin:18px 0"><a href="' + esc(href) + '" style="display:inline-block;background:#1F1B17;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px">' + esc(label) + '</a></p>';
function linesTable(o) {
  const rows = o.lines.map((l) => '<tr><td style="padding:8px 0;border-bottom:1px solid #E2DBD1">' + esc(l.title) + ' · Qty ' + l.qty + '</td><td style="padding:8px 0;border-bottom:1px solid #E2DBD1;text-align:right">' + money(l.price * l.qty) + '</td></tr>').join('');
  const tot = (label, v) => '<tr><td style="padding:4px 0;color:#5C554D">' + esc(label) + '</td><td style="padding:4px 0;text-align:right">' + v + '</td></tr>';
  return '<table style="width:100%;border-collapse:collapse;font-size:15px;margin:10px 0 16px">' + rows +
    tot('Subtotal', money(o.subtotal)) +
    (o.discount ? tot('Discount (' + (o.discountCode || '') + ')', '−' + money(o.discount)) : '') +
    tot(o.method === 'pickup' ? 'Pick-up, Point Cook' : 'Delivery' + (o.zoneName ? ' (' + o.zoneName + ')' : ''), o.method === 'pickup' ? 'Free' : o.quote ? 'Quoted soon' : money(o.delivery)) +
    '<tr><td style="padding:8px 0;font-weight:600">' + (o.quote ? 'Mirror total' : 'Total paid') + '</td><td style="padding:8px 0;text-align:right;font-weight:600">' + money(o.total) + ' AUD</td></tr>' +
    (o.gstRegistered && !o.quote ? tot('Includes GST', money(Math.round(o.total / 11))) : '') + '</table>';
}
function addressHtml(o) {
  if (o.method === 'pickup') return 'Pick-up from our Point Cook studio, by appointment. We\'ll be in touch to arrange a time.';
  const a = o.address || {};
  return esc(o.name) + '<br>' + esc(a.line1) + '<br>' + esc([a.suburb, a.state, a.postcode].filter(Boolean).join(' '));
}
function first(name) { return String(name || '').split(' ')[0] || 'there'; }

// ---------- templates ----------
export function orderConfirmation(o, store) {
  const kind = o.gstRegistered ? 'Tax invoice' : 'Receipt';
  const html = layout(store,
    '<p style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#B8913F;margin:0 0 6px">Order confirmed · ' + kind + '</p>' + h1('Thank you, ' + first(o.name)) +
    p('Your order is confirmed and paid. We\'ll be in touch within one business day to arrange your ' + (o.method === 'pickup' ? 'pick-up time' : 'delivery day') + '. This email is your ' + kind.toLowerCase() + '.') +
    p('<strong>Order number</strong> ' + esc(o.number) + '<br><strong>Order date</strong> ' + esc(o.dateText) + (o.card ? '<br><strong>Paid with</strong> ' + esc(o.card) : '')) +
    linesTable(o) + p('<strong>' + (o.method === 'pickup' ? 'Pick-up' : 'Delivering to') + '</strong><br>' + addressHtml(o)) +
    (o.receiptUrl ? btn(o.receiptUrl, 'View Square payment receipt') : '') +
    p('<strong>When your mirror arrives</strong> Please check it with our delivery team, or within 24 hours, and email photos of any damage to ' + esc((store && store.email) || 'hello@mirrorhousemelbourne.com.au') + '. See our <a href="' + siteUrl() + '/policies.html">delivery, returns &amp; care policies</a>.'));
  return { subject: 'Your Mirror House order ' + o.number + ' is confirmed', html, text: 'Thank you, ' + first(o.name) + '. Your order ' + o.number + ' is confirmed and paid: ' + money(o.total) + '.' };
}

export function quoteReceived(o, store) {
  const html = layout(store, h1('We\'re working out your delivery') +
    p('Hi ' + esc(first(o.name)) + ', thanks for your order request ' + esc(o.number) + '. Your address is more than 50 km from Point Cook, so we\'ll email you a delivery quote within one business day, with a secure Square link to pay for your mirror and delivery together.') +
    p('<strong>Nothing has been charged.</strong> We\'ll hold your mirror for 7 days while you decide.') + linesTable(o) + p('<strong>Delivering to</strong><br>' + addressHtml(o)));
  return { subject: 'We\'ve received your order request ' + o.number, html, text: 'Thanks for your order request ' + o.number + '. We\'ll email your delivery quote within one business day. Nothing has been charged.' };
}

export function deliveryQuote(o, store, message) {
  const html = layout(store, h1('Your delivery quote') +
    p('Hi ' + esc(first(o.name)) + ', delivery to ' + esc((o.address && o.address.suburb) || 'you') + ' is <strong>' + money(o.delivery) + '</strong>.') +
    (message ? p('“' + esc(message) + '”') : '') + linesTable(Object.assign({}, o, { quote: false })) +
    (o.paymentLinkUrl ? btn(o.paymentLinkUrl, 'Pay ' + money(o.total) + ' securely with Square') : p('We\'ll send you a secure payment link shortly.')) +
    p('Your mirror is held for 7 days. Once paid, your order is confirmed and we\'ll arrange your delivery day.'));
  return { subject: 'Your Mirror House delivery quote for ' + o.number, html, text: 'Delivery to ' + ((o.address && o.address.suburb) || 'you') + ': ' + money(o.delivery) + '. Total ' + money(o.total) + '. Pay here: ' + (o.paymentLinkUrl || '') };
}

export function fulfilmentUpdate(o, store, status) {
  const a = o.address || {};
  const map = {
    out_for_delivery: ['Your mirror is on its way', 'Hi ' + esc(first(o.name)) + ', our team is heading to ' + esc(a.line1 || 'you') + (a.suburb ? ', ' + esc(a.suburb) : '') + ' with your order ' + esc(o.number) + '. Please check it on arrival. If anything isn\'t right, tell our team, or email photos within 24 hours and we\'ll make it right. Hanging it? Always fix into studs or masonry.'],
    ready: ['Your mirror is ready to collect', 'Hi ' + esc(first(o.name)) + ', your order ' + esc(o.number) + ' is ready to collect from our Point Cook studio.' + (o.tracking ? ' Your pick-up time: <strong>' + esc(o.tracking) + '</strong>.' : '') + ' A 200 cm mirror needs a large car, ute or van. Our team will help you load it.'],
    delivered: ['Your mirror has been delivered', 'Hi ' + esc(first(o.name)) + ', your order ' + esc(o.number) + ' has been delivered. Thank you for choosing Mirror House. If anything isn\'t perfect, email photos within 24 hours.'],
    picked_up: ['Thanks for collecting your mirror', 'Hi ' + esc(first(o.name)) + ', thanks for collecting order ' + esc(o.number) + '. Enjoy your new mirror.']
  };
  const m = map[status];
  if (!m) return null;
  return { subject: m[0], html: layout(store, h1(m[0]) + p(m[1])), text: m[1].replace(/<[^>]+>/g, '') };
}

export function adminAlert(o, store) {
  const kind = o.quote ? 'New quote request' : 'New paid order';
  const a = o.address || {};
  const html = layout(store,
    '<p style="margin:0 0 6px;color:' + (o.quote ? '#8a6d1f' : '#2e7d32') + '">● ' + kind + '</p>' + h1(o.number + ' · ' + money(o.total)) +
    p(esc(o.name) + ' · ' + esc(o.phone) + ' · ' + esc(o.email) + '<br>' + (o.method === 'pickup' ? 'Pick-up from Point Cook' : esc([a.line1, a.suburb, a.state, a.postcode].filter(Boolean).join(', ')) + ' · ' + esc(o.zoneName || '')) + (o.deliveryDay ? ' · preferred ' + esc(o.deliveryDay) : '')) +
    linesTable(o) + (o.note ? p('Note from customer: “' + esc(o.note) + '”') : '') + btn(siteUrl() + '/admin-dashboard.html#/orders/' + o.id, 'Open order in admin'));
  return { subject: kind + ' ' + o.number + ': ' + money(o.total) + ' from ' + o.name, html, text: kind + ' ' + o.number + ' from ' + o.name + ': ' + money(o.total) };
}

export function welcome(store) {
  const html = layout(store, h1('Welcome to Mirror House') +
    p('Thanks for joining our list. You\'ll be first to hear about new mirrors and offers.') +
    p('Here\'s <strong>10% off your first order</strong>. Use code <strong style="letter-spacing:.08em">WELCOME10</strong> at checkout.') + btn(siteUrl() + '/', 'Browse the collection'));
  return { subject: 'Welcome to Mirror House: 10% off your first order', html, text: 'Thanks for joining our list. Use code WELCOME10 for 10% off your first order.' };
}
