import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The store constructs an Audio element at module load, so even the pure queue logic
    // needs a DOM to import. The Web Audio graph is built lazily on first play and is
    // never reached from tests.
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'electron/**/*.test.ts', 'tools/**/*.test.mjs'],
  },
});
