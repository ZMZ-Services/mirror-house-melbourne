import pg from 'pg';
import { E2E_DB } from './env.mjs';

let client;
export async function db() {
  if (!client) { client = new pg.Client({ connectionString: E2E_DB }); await client.connect(); }
  return client;
}
export async function sql(text, params) { return (await db()).query(text, params); }

// A JWT-shaped Netlify Identity token. The mock accepts tokens signed "valid".
export function makeToken(email, roles = ['admin']) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return enc({ alg: 'HS256', typ: 'JWT' }) + '.' + enc({ sub: 'user-' + email, email, exp: Math.floor(Date.now() / 1000) + 3600, app_metadata: { provider: 'email', roles }, user_metadata: { full_name: 'Debbie' } }) + '.valid';
}

// Answers the Identity widget's calls (/.netlify/identity/...) in the browser, as Netlify would.
export async function mockIdentity(page, { email = 'debbie@example.com', password = 'correct-horse', roles = ['admin'], calls = [] } = {}) {
  const token = makeToken(email, roles);
  // On localhost the widget asks which Netlify site to use; point it at this one, as on the live site.
  await page.addInitScript((url) => { try { localStorage.setItem('netlifySiteURL', url); } catch (e) { /* ignore */ } }, 'http://localhost:8888');
  const user = { id: 'user-' + email, email, aud: '', role: '', confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email', roles }, user_metadata: { full_name: 'Debbie' }, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  await page.route('**/.netlify/identity/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/\.netlify\/identity/, '');
    if (path === '/settings') return route.fulfill({ json: { external: { bitbucket: false, github: false, gitlab: false, google: false }, disable_signup: true, autoconfirm: false } });
    if (path === '/token') {
      const form = new URLSearchParams(route.request().postData() || '');
      if (form.get('grant_type') === 'password' && form.get('username') === email && form.get('password') === password) {
        return route.fulfill({ json: { access_token: token, token_type: 'bearer', expires_in: 3600, refresh_token: 'refresh-' + email } });
      }
      if (form.get('grant_type') === 'refresh_token') return route.fulfill({ json: { access_token: token, token_type: 'bearer', expires_in: 3600, refresh_token: 'refresh-' + email } });
      return route.fulfill({ status: 400, json: { error: 'invalid_grant', error_description: 'Invalid email or password' } });
    }
    const body = route.request().postData() || '';
    calls.push({ method: route.request().method(), path, body });
    const tokens = { access_token: token, token_type: 'bearer', expires_in: 3600, refresh_token: 'refresh-' + email };
    // Email links: invite (with a password), confirmation and password recovery all go through /verify.
    if (path === '/verify') {
      const b = JSON.parse(body || '{}');
      return /^(invite|confirm|recover)-ok/.test(b.token || '') ? route.fulfill({ json: tokens }) : route.fulfill({ status: 404, json: { msg: 'Token expired' } });
    }
    if (path === '/user' && route.request().method() === 'PUT') {
      const b = JSON.parse(body || '{}');
      return route.fulfill({ json: Object.assign({}, user, b.email_change_token ? { email } : {}) });
    }
    if (path === '/user') return route.fulfill({ json: user });
    if (path === '/logout') return route.fulfill({ status: 204, body: '' });
    return route.fulfill({ status: 404, json: { msg: 'not mocked' } });
  });
  return { token, email, password };
}

// Signs in through the real Netlify Identity widget.
export async function signIn(page, { email = 'debbie@example.com', password = 'correct-horse' } = {}) {
  await page.getByRole('button', { name: 'Sign in' }).click();
  const w = page.frameLocator('#netlify-identity-widget');
  await w.locator('input[name="email"]').fill(email);
  await w.locator('input[name="password"]').fill(password);
  await w.locator('button[type="submit"]').click();
}
