// Small helpers for JSON responses and request parsing.
export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
  });
}
export function error(message, status = 400, extra = {}) {
  return json({ error: message, ...extra }, status);
}
export async function readJson(req, maxBytes = 1_000_000) {
  const text = await req.text();
  if (text.length > maxBytes) throw Object.assign(new Error('That request is too large.'), { status: 413 });
  if (!text) return {};
  try { return JSON.parse(text); } catch { throw Object.assign(new Error('That request wasn\'t valid JSON.'), { status: 400 }); }
}
export function str(v, max = 500) {
  return String(v == null ? '' : v).trim().slice(0, max);
}
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
// Wraps a handler so thrown errors become tidy JSON responses and never leak details.
export function handle(fn) {
  return async (req, context) => {
    try {
      return await fn(req, context);
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500) console.error(err);
      return error(status >= 500 && !err.status ? 'Something went wrong on our side. Please try again.' : err.message, status);
    }
  };
}
export function siteUrl() {
  return (process.env.SITE_URL || process.env.URL || 'https://mirror-house-melbourne.netlify.app').replace(/\/+$/, '');
}
