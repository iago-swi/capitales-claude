import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The Android shell.
 *
 * `webDir` points at the single-file build rather than a bundle of its own.
 * That build already carries everything — geometry, country data, styles — and
 * already stores scores in localStorage, which is exactly what a WebView
 * offers. So the mobile app needs no data layer, no server and no SQLite
 * plugin: the work done to make one HTML file self-sufficient is the same work
 * an offline mobile app needs.
 */
const config: CapacitorConfig = {
  appId: 'ch.noth.capitales',
  appName: 'Capitales',
  webDir: '../single/dist',
  android: {
    // Matches --abyss, so there is no white flash before the first paint.
    backgroundColor: '#0a1628',
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
