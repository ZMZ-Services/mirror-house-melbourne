// Gives the end-to-end run a fresh database with Debbie's products.
import pg from 'pg';
import { migrate } from '../scripts/migrate.mjs';
import { E2E_DB } from './env.mjs';

export default async function () {
  const c = new pg.Client({ connectionString: E2E_DB });
  await c.connect();
  await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await c.end();
  await migrate(E2E_DB, () => {});
}
