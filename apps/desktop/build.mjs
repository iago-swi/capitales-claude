/**
 * Bundles the Electron main process.
 *
 * The workspace ships TypeScript source with no build step, which Vite and
 * Vitest consume directly. Electron's main process cannot: a packaged app runs
 * plain JavaScript. So this bundles main.ts together with apps/server and
 * capitals.json into one CommonJS file.
 *
 * node:sqlite stays external because it is built into Node, and electron is
 * external because the runtime provides it.
 */
import { build } from 'esbuild';
import { cp, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const OUT = path.join(HERE, 'dist');
const WEB_DIST = path.join(ROOT, 'apps', 'web', 'dist');

if (!existsSync(WEB_DIST)) {
  console.error(
    'apps/web/dist is missing. Run `npm run build` first — the desktop shell ' +
      'serves that bundle rather than reimplementing the UI.',
  );
  process.exit(1);
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

await build({
  entryPoints: [path.join(HERE, 'src', 'main.ts')],
  outfile: path.join(OUT, 'main.cjs'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['electron', 'node:sqlite'],
  loader: { '.json': 'json' },
  logLevel: 'info',
});

// The renderer bundle rides along, served by the in-process host.
await cp(WEB_DIST, path.join(OUT, 'web'), { recursive: true });

console.log('desktop main bundled -> apps/desktop/dist/main.cjs');
