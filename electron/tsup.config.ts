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
   * Everything except `electron` and the Node builtins.
   *
   * `noExternal` wins over `external`, so a blanket /.*​/ here also swallows `electron` —
   * and what gets bundled is the npm package's index.js, a shim whose only job is to
   * return the path of the binary. Inside the app that shim runs *as* the app, finds no
   * binary beside itself, and throws "Electron failed to install correctly" at load.
   *
   * `node:` has to be excluded for a subtler reason. esbuild only leaves a `node:` import
   * alone if it recognises the name as a builtin, and its list predates `node:sqlite`.
   * Forced to bundle one it does not know, it strips the prefix and looks for a package
   * called `sqlite` — so the app dies at load with "Cannot find module 'sqlite'".
   *
   * The lookaheads are anchored so `electron-updater` and `electron/...` subpaths still
   * get bundled; only the bare module and the builtins stay external, because the runtime
   * provides both.
   */
  /*
   * An explicit list, not a catch-all.
   *
   * tsup leaves everything in package.json `dependencies` external by default — right for
   * a library, wrong here, because the packaged app ships no node_modules and a surviving
   * bare `require` throws "Cannot find module" on first use. So these three are named.
   *
   * Their own sub-dependencies need no mention: anything in node_modules that is *not* a
   * declared dependency is bundled by default.
   *
   * A blanket regex was tried and does not work. tsup implements this as an esbuild
   * resolve plugin, so it also captures `node:sqlite` — which esbuild does not recognise
   * as a builtin, its list predating that module. Forced to bundle it, esbuild strips the
   * prefix and looks for a package called `sqlite`, and the app dies at load with
   * "Cannot find module 'sqlite'". Setting esbuild's own `external` does not help either;
   * the plugin has already decided by then.
   */
  noExternal: ['music-metadata', 'electron-updater', 'chokidar'],

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
