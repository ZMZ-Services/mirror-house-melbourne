// Makes sure the D1 database exists and writes its id into wrangler.jsonc.
// Runs in the deploy workflow before migrations, so the first deploy needs no manual setup.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const NAME = 'mirror-house-db';
const CONFIG = 'wrangler.jsonc';

const wrangler = (...args) => execFileSync('npx', ['wrangler', ...args], { encoding: 'utf8' });
const findDb = () => JSON.parse(wrangler('d1', 'list', '--json')).find((db) => db.name === NAME);

let db = findDb();
if (!db) {
  console.log(`Creating D1 database ${NAME} (Oceania)…`);
  wrangler('d1', 'create', NAME, '--location', 'oc');
  db = findDb();
}
if (!db) throw new Error(`Could not find or create D1 database ${NAME}`);

const config = readFileSync(CONFIG, 'utf8');
if (config.includes('"database_id"')) {
  console.log('database_id already set in wrangler.jsonc');
} else {
  writeFileSync(
    CONFIG,
    config.replace(`"database_name": "${NAME}",`, `"database_name": "${NAME}",\n      "database_id": "${db.uuid}",`)
  );
  console.log(`Using D1 database ${NAME} (${db.uuid})`);
}
