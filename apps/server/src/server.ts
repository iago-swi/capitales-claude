import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { countCountries, openDb } from './db.js';
import { createServer, HOST, PORT } from './routes.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const DB_PATH = path.join(ROOT, '.data', 'capitales.db');

mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = openDb(DB_PATH);
const server = createServer(db);

server.listen(PORT, HOST, () => {
  const n = countCountries(db);
  console.log(`capitales api on http://${HOST}:${PORT}`);
  console.log(
    n === 0
      ? 'countries table is empty — run: npm run seed'
      : `${n} countries loaded`,
  );
});

// Close the database cleanly so WAL checkpoints on the way out.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
