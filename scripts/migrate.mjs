// Local development and tests only: applies any new files in netlify/database/migrations to DATABASE_URL, in name
// order, each in its own transaction. On Netlify, Netlify Database applies the same migrations itself on every deploy.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'netlify/database/migrations');

export function databaseUrl() {
  return process.env.DATABASE_URL || '';
}

export async function migrate(url = databaseUrl(), log = console.log) {
  if (!url) throw new Error('No database URL. Set DATABASE_URL to a local Postgres, e.g. postgres://user:pass@localhost:5432/mirrorhouse');
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    // One migration run at a time, even if two deploys overlap.
    await client.query('SELECT pg_advisory_lock(727001)');
    await client.query('CREATE TABLE IF NOT EXISTS local_schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const done = new Set((await client.query('SELECT name FROM local_schema_migrations')).rows.map((r) => r.name));
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    let applied = 0;
    for (const f of files) {
      if (done.has(f)) continue;
      await client.query('BEGIN');
      try {
        await client.query(fs.readFileSync(path.join(dir, f), 'utf8'));
        await client.query('INSERT INTO local_schema_migrations (name) VALUES ($1)', [f]);
        await client.query('COMMIT');
        applied++;
        log('Applied ' + f);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error('Migration ' + f + ' failed: ' + err.message);
      }
    }
    if (!applied) log('Database is up to date.');
    return applied;
  } finally {
    await client.query('SELECT pg_advisory_unlock(727001)').catch(() => {});
    await client.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  migrate().catch((err) => { console.error(err.message); process.exit(1); });
}
