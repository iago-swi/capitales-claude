/**
 * Standalone API server for development: `npm run server`.
 *
 * The desktop shell does not use this file — it calls startHost() directly so
 * the server lives inside the Electron process. Both go through the same host.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startHost } from './host.js';
import { PORT } from './routes.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');

const host = await startHost({
  dbPath: path.join(ROOT, '.data', 'capitales.db'),
  port: PORT,
});

console.log(`capitales api on ${host.origin}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void host.close().then(() => process.exit(0));
  });
}
