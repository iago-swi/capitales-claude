import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [svelte(), tailwindcss()],
  server: {
    port: 5173,
    // The client fetches relative /api paths, so the browser only ever talks
    // to its own origin and CORS never enters the picture. This one line is
    // what lets packages/data stay free of any host configuration.
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false },
    },
  },
  // The workspace packages ship TypeScript source, not a build. Excluding them
  // from dependency pre-bundling lets Vite transform them like app code, so
  // edits in packages/* hot-reload instead of needing a rebuild.
  optimizeDeps: {
    exclude: [
      '@capitales/core',
      '@capitales/geo',
      '@capitales/data',
      '@capitales/ui',
    ],
  },
});
