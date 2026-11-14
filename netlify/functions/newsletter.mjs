// POST /api/newsletter: the footer "Join Our List" box. New sign-ups get the welcome email with WELCOME10.
import { query } from '../lib/db.mjs';
import { json, error, handle, readJson, str, EMAIL_RE } from '../lib/http.mjs';
import { logActivity, getSetting } from '../lib/store.mjs';
import { sendEmail, welcome } from '../lib/email.mjs';

export default handle(async (req) => {
  if (req.method !== 'POST') return error('Method not allowed', 405);
  const b = await readJson(req, 5_000);
  const email = str(b.email, 200).toLowerCase();
  if (!EMAIL_RE.test(email)) return error('Please enter a valid email address.');
  const r = await query("INSERT INTO subscribers (email, source) VALUES ($1, 'Website sign-up') ON CONFLICT (email) DO NOTHING RETURNING email", [email]);
  if (r.rowCount) {
    await logActivity({ query }, { actorType: 'customer', actor: email, action: 'newsletter.joined', entity: 'subscriber', entityId: email, summary: email + ' joined the mailing list' });
    const store = await getSetting('store');
    const sent = await sendEmail({ to: email, replyTo: store && store.email, ...welcome(store) });
    if (!sent.ok && !sent.skipped) console.error('welcome email not sent:', sent.reason);
  }
  return json({ ok: true });
});

export const config = { path: '/api/newsletter', rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ['ip', 'domain'] } };
