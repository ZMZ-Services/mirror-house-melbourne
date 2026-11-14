// Product photos uploaded in the admin are kept in Netlify Blobs (store "product-photos") and served at /media/<key>.
import { getStore } from '@netlify/blobs';

export function photoStore() {
  // Tests and local runs without Netlify can point at a local Blobs server.
  if (process.env.MH_BLOBS_API_URL) {
    return getStore({ name: 'product-photos', siteID: process.env.MH_BLOBS_SITE_ID || 'local', token: process.env.MH_BLOBS_TOKEN || 'local', apiURL: process.env.MH_BLOBS_API_URL });
  }
  return getStore({ name: 'product-photos', consistency: 'strong' });
}
