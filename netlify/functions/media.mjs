// GET /media/<key>: serves a product photo uploaded in the admin, from Netlify Blobs.
import { photoStore } from '../lib/media.mjs';

export default async (req) => {
  const key = decodeURIComponent(new URL(req.url).pathname.replace(/^\/media\//, ''));
  if (!/^[0-9]{4}-[0-9]{2}\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(key)) return new Response('Not found', { status: 404 });
  const r = await photoStore().getWithMetadata(key, { type: 'arrayBuffer' });
  if (!r) return new Response('Not found', { status: 404 });
  return new Response(r.data, { headers: { 'content-type': (r.metadata && r.metadata.contentType) || 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable' } });
};

export const config = { path: '/media/*' };
