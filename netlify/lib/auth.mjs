// Admin sign-in check for every /api/admin route.
// The admin page signs in with Netlify Identity and sends the user's access token as "Authorization: Bearer ...".
// Here the token is checked with the site's Identity service (GET /.netlify/identity/user), so a forged or
// expired token is refused. The user must also be an admin: the "admin" role in Identity, or an email in ADMIN_EMAILS.
import { createHash } from 'node:crypto';
import { siteUrl } from './http.mjs';

const cache = new Map(); // token hash -> { user, until }

export function identityUrl() {
  return (process.env.MH_IDENTITY_URL || siteUrl() + '/.netlify/identity').replace(/\/+$/, '');
}

export function isAdmin(user) {
  if (!user || !user.email) return false;
  const roles = (user.app_metadata && user.app_metadata.roles) || [];
  if (roles.includes('admin')) return true;
  const list = String(process.env.ADMIN_EMAILS || '').toLowerCase().split(/[\s,;]+/).filter(Boolean);
  return list.includes(String(user.email).toLowerCase());
}

async function lookup(token) {
  const key = createHash('sha256').update(token).digest('hex');
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.user;
  let res;
  try {
    res = await fetch(identityUrl() + '/user', { headers: { authorization: 'Bearer ' + token } });
  } catch (err) {
    throw Object.assign(new Error('Sign-in couldn\'t be checked just now. Please try again.'), { status: 503 });
  }
  if (res.status === 401 || res.status === 403 || res.status === 404) return null;
  if (!res.ok) throw Object.assign(new Error('Sign-in couldn\'t be checked just now. Please try again.'), { status: 503 });
  const user = await res.json();
  if (cache.size > 200) cache.clear();
  cache.set(key, { user, until: Date.now() + 60_000 });
  return user;
}

// Returns the signed-in admin { email, name } or throws a 401/403 error.
export async function requireAdmin(req) {
  const h = req.headers.get('authorization') || '';
  const m = h.match(/^Bearer\s+([A-Za-z0-9._~+/=-]{20,4096})$/);
  if (!m) throw Object.assign(new Error('Please sign in to the admin.'), { status: 401 });
  const user = await lookup(m[1]);
  if (!user) throw Object.assign(new Error('Your sign-in has expired. Please sign in again.'), { status: 401 });
  if (!isAdmin(user)) throw Object.assign(new Error('This account doesn\'t have admin access.'), { status: 403 });
  return { email: String(user.email).toLowerCase(), name: (user.user_metadata && user.user_metadata.full_name) || '' };
}

export function _clearAuthCache() { cache.clear(); }
