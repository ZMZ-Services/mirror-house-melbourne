// POST /api/admin/sync: saves the changes made in the admin, then returns the fresh state. Signed-in admins only.
import { json, error, handle, readJson } from '../lib/http.mjs';
import { requireAdmin } from '../lib/auth.mjs';
import { applySync, loadState } from '../lib/admin.mjs';

export default handle(async (req, context) => {
  if (req.method !== 'POST') return error('Method not allowed', 405);
  const user = await requireAdmin(req);
  const changes = await readJson(req, 2_000_000);
  const defer = context && typeof context.waitUntil === 'function' ? (p) => context.waitUntil(p) : undefined;
  const { notes, failed } = await applySync(changes, user, { defer });
  return json({ ok: failed.length === 0, notes, failed, state: await loadState(user) });
});

export const config = { path: '/api/admin/sync' };
