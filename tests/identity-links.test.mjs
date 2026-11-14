// Netlify Identity email links (invite, password reset, confirmation, email change) point at the site root
// with a #..._token=... hash. Every public page must send those straight to the admin, where the sign-in
// widget finishes the job. Any other hash must be left alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const PUBLIC = fs.readdirSync('public').filter((f) => f.endsWith('.html') && f !== 'admin-dashboard.html' && f !== 'emails.html');

function redirectScript(html) {
  const m = html.match(/<head>\s*<script>([\s\S]*?)<\/script>/);
  return m && /invite\|recovery\|confirmation\|email_change/.test(m[1]) ? m[1] : null;
}
function run(script, hash) {
  let went = null;
  vm.runInNewContext(script, { location: { hash, replace: (u) => { went = u; } } });
  return went;
}

test('every public page sends Identity email links to the admin, first thing in <head>', () => {
  assert.ok(PUBLIC.length >= 5, PUBLIC.join(','));
  for (const f of PUBLIC) assert.ok(redirectScript(fs.readFileSync('public/' + f, 'utf8')), f + ' is missing the redirect');
  // The admin page itself must not redirect (it handles the link).
  assert.equal(redirectScript(fs.readFileSync('public/admin-dashboard.html', 'utf8')), null);
});

test('each token type goes to the admin with its hash; other hashes stay put', () => {
  const script = redirectScript(fs.readFileSync('public/index.html', 'utf8'));
  for (const t of ['invite', 'recovery', 'confirmation', 'email_change']) {
    assert.equal(run(script, '#' + t + '_token=abc123'), '/admin-dashboard.html#' + t + '_token=abc123');
    assert.equal(run(script, '#/' + t + '_token=abc123'), '/admin-dashboard.html#/' + t + '_token=abc123');
  }
  for (const h of ['', '#collection-section', '#/orders', '#access_token=x', '#something_token=x', '#newsletter-form']) assert.equal(run(script, h), null, h);
});
