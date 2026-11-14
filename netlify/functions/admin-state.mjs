// GET /api/admin/state: everything the admin shows. Signed-in admins only.
import { json, error, handle } from '../lib/http.mjs';
import { requireAdmin } from '../lib/auth.mjs';
import { loadState } from '../lib/admin.mjs';

export default handle(async (req) => {
  if (req.method !== 'GET') return error('Method not allowed', 405);
  const user = await requireAdmin(req);
  return json(await loadState(user));
});

export const config = { path: '/api/admin/state' };
