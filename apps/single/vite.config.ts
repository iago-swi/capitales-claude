import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

export default defineConfig({
  plugins: [
    svelte(),
    tailwindcss(),
    // Inlines every script and stylesheet into index.html. Nothing is fetched
    // at runtime, so the file works from a USB stick, an email attachment, or
    // a file:// URL with no server at all.
    viteSingleFile(),
  ],
  resolve: {
    alias: [
      {
        // The whole trick. `apps/web` imports loadCountries/saveRun/topScores
        // from '@capitales/data'; here those resolve to the localStorage
        // implementation instead of the HTTP client. No application code
        // changes, and no code that talks to a server reaches the bundle.
        //
        // Anchored to an exact match: a bare string alias also matches the
        // prefix of '@capitales/data/capitals.json', which rewrote that
        // subpath onto the replacement file and broke the build.
        find: /^@capitales\/data$/,
        replacement: path.join(ROOT, 'packages/data-local/src/index.ts'),
      },
    ],
  },
  build: {
    // One file means one chunk, and inlining assets rather than emitting them.
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    reportCompressedSize: true,
  },
  optimizeDeps: {
    exclude: [
      '@capitales/core',
      '@capitales/geo',
      '@capitales/data',
      '@capitales/data-local',
      '@capitales/ui',
    ],
  },
});
