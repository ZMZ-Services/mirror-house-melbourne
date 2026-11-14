// POST /api/admin/uploads: one product photo (JPEG, PNG or WebP, up to 4 MB). Returns its /media/ address.
// Signed-in admins only.
import { randomUUID } from 'node:crypto';
import { json, error, handle } from '../lib/http.mjs';
import { requireAdmin } from '../lib/auth.mjs';
import { photoStore } from '../lib/media.mjs';
import { query } from '../lib/db.mjs';
import { logActivity } from '../lib/store.mjs';

const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export default handle(async (req) => {
  if (req.method !== 'POST') return error('Method not allowed', 405);
  const user = await requireAdmin(req);
  const type = (req.headers.get('content-type') || '').split(';')[0].trim();
  if (!TYPES[type]) return error('Please upload a JPEG, PNG or WebP photo.', 415);
  const buf = await req.arrayBuffer();
  if (!buf.byteLength) return error('That photo was empty.');
  if (buf.byteLength > 4 * 1024 * 1024) return error('That photo is over 4 MB. Please use a smaller one.', 413);
  const key = new Date().toISOString().slice(0, 7) + '/' + randomUUID() + '.' + TYPES[type];
  await photoStore().set(key, buf, { metadata: { contentType: type, uploadedBy: user.email } });
  await logActivity({ query }, { actorType: 'admin', actor: user.email, action: 'photo.uploaded', entity: 'photo', entityId: key, summary: 'Uploaded a product photo' });
  return json({ url: '/media/' + key }, 201);
});

export const config = { path: '/api/admin/uploads' };
