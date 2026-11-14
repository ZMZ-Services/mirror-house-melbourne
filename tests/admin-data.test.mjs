// The admin's save logic in the browser (public/js/admin-data.js): edits made while a save is on its way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const win = {};
win.window = win;
vm.createContext(win);
vm.runInContext(fs.readFileSync('public/js/admin-data.js', 'utf8'), win);
const rebase = win.MHData._rebase;
const base = () => ({ products: [{ slug: 'a', title: 'A', stock: 3 }], orders: [{ id: 1, note: '', events: [{ text: 'placed' }] }], discounts: [], subscribers: [], settings: { hours: '9-5', abn: '1' }, shipping: {}, customerNotes: {} });

test('stock: the admin\'s change is added to the stock the server now has', () => {
  const sent = base();
  const local = base(); local.products[0].stock = 5;                 // admin: 3 -> 5 while the save was on its way
  const server = base(); server.products[0].stock = 2;               // a customer bought one meanwhile
  const out = rebase(JSON.parse(JSON.stringify(local)), sent, server);
  assert.equal(out.products[0].stock, 4);
});

test('timeline: the server\'s new entries are kept and the admin\'s new note follows them', () => {
  const sent = base();
  const local = base(); local.orders[0].events.push({ text: 'Called the customer' });
  const server = base(); server.orders[0].events.push({ text: 'Square refund started' });
  const out = rebase(local, sent, server);
  assert.deepEqual([...out.orders[0].events.map((e) => e.text)], ['placed', 'Square refund started', 'Called the customer']);
});

test('fields the admin didn\'t touch take the server\'s values; edited settings are kept', () => {
  const sent = base();
  const local = base(); local.settings.hours = '10-4';
  const server = base(); server.products[0].title = 'A (renamed elsewhere)'; server.settings.abn = '2';
  const out = rebase(local, sent, server);
  assert.equal(out.products[0].title, 'A (renamed elsewhere)');
  assert.equal(out.settings.hours, '10-4');
  assert.equal(out.settings.abn, '2');
});
