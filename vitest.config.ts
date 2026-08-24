import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Both roots: packages/* hold the pure logic, apps/server holds the API
    // tests. A pattern covering only packages/ would silently run zero server
    // tests and still report success.
    include: ['{packages,apps}/**/src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    environment: 'node',
  },
});
