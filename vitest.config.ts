import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The store constructs an Audio element at module load, so even the pure queue logic
    // needs a DOM to import. The Web Audio graph is built lazily on first play and is
    // never reached from tests.
    environment: 'jsdom',
    // The stores call window.takt directly, as they can in the real renderer.
    setupFiles: ['./src/testSetup.ts'],
    include: ['src/**/*.test.ts', 'electron/**/*.test.ts', 'tools/**/*.test.mjs'],
  },
});
