import { defineConfig, type Options } from 'tsup';

/**
 * The main process is built as CommonJS, not ESM.
 *
 * electron-updater pulls in fs-extra -> graceful-fs, which uses dynamic `require()` of
 * node builtins. Bundling that into an ESM output makes esbuild replace those calls with
 * a shim that throws "Dynamic require of \"fs\" is not supported" — and it throws at
 * import time, so the app dies on launch with a JavaScript error dialog before it can
 * open a window.
 *
 * `electron` is the only external. Everything else is bundled in, which is what lets
 * electron-builder.yml exclude node_modules entirely from the package.
 *
 * `noExternal` is not optional here. tsup leaves everything in package.json
 * `dependencies` external by default, which is right for a library and wrong for this —
 * the packaged app ships no node_modules at all, so a surviving bare `require` throws
 * "Cannot find module" on the first call rather than at startup. That makes it a bug that
 * reaches users: the app launches fine and only dies when someone adds a file.
 */
const shared: Options = {
  outDir: 'electron/dist',
  format: ['cjs'],
  outExtension: () => ({ js: '.cjs' }),
  target: 'node22',
  platform: 'node',
  external: ['electron'],
  /*
   * Everything except `electron` itself.
   *
   * `noExternal` wins over `external`, so a blanket /.*​/ here also swallows `electron` —
   * and what gets bundled is the npm package's index.js, a shim whose only job is to
   * return the path of the binary. Inside the app that shim runs *as* the app, finds no
   * binary beside itself, and throws "Electron failed to install correctly" at load.
   *
   * The lookahead is anchored to the exact specifier so `electron-updater` and
   * `electron/...` subpaths still get bundled — only the bare module stays external,
   * because the runtime provides it.
   */
  noExternal: [/^(?!electron$)/],
  sourcemap: true,
};

export default defineConfig([
  {
    ...shared,
    entry: { main: 'electron/main.ts' },
    clean: true,
  },
  {
    ...shared,
    // Sandboxed preloads must be CommonJS — Electron loads them with a plain `require`.
    entry: { preload: 'electron/preload.ts' },
    clean: false,
  },
]);
