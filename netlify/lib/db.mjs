// Postgres connection for the Functions. On Netlify, Netlify Database provides the connection string
// (NETLIFY_DB_URL, pointing at the right database branch for production or a deploy preview).
// Locally and in tests, DATABASE_URL is used instead.
import pg from 'pg';
import { getConnectionString } from '@netlify/database';

// DATE columns come back as plain 'YYYY-MM-DD' strings, so a delivery day never shifts with time zones.
pg.types.setTypeParser(1082, (v) => v);

let pool = null;
export function dbUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.NETLIFY_DB_URL) return process.env.NETLIFY_DB_URL;
  try { return getConnectionString(); } catch { return ''; }
}
export function getPool() {
  if (!pool) {
    const url = dbUrl();
    if (!url) throw Object.assign(new Error('The database isn\'t connected yet.'), { status: 503 });
    pool = new pg.Pool({ connectionString: url, max: 3, idleTimeoutMillis: 10000 });
    pool.on('error', (err) => console.error('db pool error', err.message));
  }
  return pool;
}
export async function query(text, params) {
  return getPool().query(text, params);
}
// Runs fn(client) inside a transaction and returns its result.
export async function tx(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
export async function closePool() {
  if (pool) { const p = pool; pool = null; await p.end(); }
}
