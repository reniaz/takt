import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],

  /*
   * Relative asset URLs.
   *
   * In production the bundle is served from `takt://app/`, and absolute `/assets/...`
   * paths would resolve against the scheme root rather than the app directory.
   */
  base: './',

  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  server: {
    port: 5273,
    strictPort: true,
  },

  build: {
    outDir: 'build',
    emptyOutDir: true,
    sourcemap: true,
    target: 'chrome136',
  },
});
