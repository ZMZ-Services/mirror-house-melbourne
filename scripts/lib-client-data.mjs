// Reads Debbie's product, shipping, discount and settings set-up straight out of her admin and shop
// scripts (public/js/admin-data.js and public/js/store.js), so the database seed matches her build exactly.
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';

export function readClientData(publicDir) {
  const store = {};
  const ls = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  const win = { localStorage: ls };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(fs.readFileSync(path.join(publicDir, 'js/admin-data.js'), 'utf8'), win);
  const admin = JSON.parse(JSON.stringify(win.MHData.defaults()));

  const s = fs.readFileSync(path.join(publicDir, 'js/store.js'), 'utf8');
  const start = s.indexOf('var CATALOGUE = [');
  const end = s.indexOf('\n  ];', start);
  if (start < 0 || end < 0) throw new Error('CATALOGUE not found in store.js');
  const catalogue = vm.runInNewContext('(' + s.slice(start + 'var CATALOGUE = '.length, end + 4) + ')');
  return { admin, catalogue: JSON.parse(JSON.stringify(catalogue)) };
}

// The shop's photo for each product (IMG) and its extra photos with captions (GALLERY), from store.js.
export function readShopImages(publicDir) {
  const s = fs.readFileSync(path.join(publicDir, 'js/store.js'), 'utf8');
  const a = s.indexOf('var IMG = window.MH_IMAGES');
  const b = s.indexOf('var CATALOGUE = [');
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(s.slice(a, b) + '\nthis.__out = { IMG: IMG, GALLERY: GALLERY };', ctx);
  return JSON.parse(JSON.stringify(ctx.__out));
}
