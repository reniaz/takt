<div align="center">

<img src="electron/assets/icon-takt-256.png" width="112" alt="">

# Takt

A music player for Windows.

</div>

**Takt** is German for *bar*, *beat*, *measure*. The icon is one 4/4 bar drawn as its metric
accent pattern — strong, weak, medium, weak.

Local files, indexed and searchable. Ten-band equalizer, nine themes, gapless playback, and
a queue that survives a restart. It updates itself.

## Install

Grab the latest `Takt-Setup-*.exe` from [Releases](https://github.com/reniaz/takt/releases).

The build is not code-signed, so SmartScreen will interrupt the first run — **More info →
Run anyway**. Signing needs a certificate; there isn't one.

After that it looks after itself: every launch checks for a newer release behind the splash
screen, and installs it before opening.

## Formats

MP3, M4A/AAC, FLAC, OGG, Opus, WAV — everything Chromium decodes natively, which is
essentially any ordinary library. ALAC, WMA and APE would need a bundled ffmpeg and are not
supported.

## Themes

Nine built in: caelus, Catppuccin Mocha, Catppuccin Latte, Nord, Gruvbox Dark, Dracula,
Tokyo Night, Rosé Pine, and Everforest Dark.

A theme is eleven colours; everything else — hover states, tints, the colour of a glyph on
the accent — is derived from them. Drop a JSON file in `%APPDATA%\Takt\themes\`:

```json
{
  "name": "Example",
  "author": "you",
  "colors": {
    "background": "#1b1d21",
    "surface":    "#23262b",
    "raised":     "#2c3038",
    "border":     "#343943",
    "text":       "#d5d8de",
    "textMuted":  "#868c99",
    "accent":     "#7aa2f7",
    "link":       "#7dcfff",
    "error":      "#f7768e",
    "success":    "#9ece6a",
    "deleted":    "#f7768e"
  }
}
```

The format is the same one [Draht](https://github.com/reniaz/draht) uses, so a theme written
for either works in both.

## Keyboard

| | |
|---|---|
| `Space` | Play / pause |
| `←` `→` | Seek ∓5 s (`Shift` for 30 s) |
| `Ctrl`+`←` `→` | Previous / next track |
| `↑` `↓` | Volume |
| `S` / `R` / `M` | Shuffle / repeat / mute |
| `Ctrl`+`Q` | Queue |

Click the elapsed time to type a position — `83`, `1:23`, `1:02:03`, `+15`, `-30` all work.

## Building

```bash
npm install
npm run dev
```

`npm run dev` starts Vite on port 5273 and serves the UI in a plain browser with a stubbed
bridge, which is the fast loop for layout and themes. Nothing plays there — audio needs the
`takt://` scheme, so run the real shell for that:

```bash
npm run build && npm start
```

| Script | |
|---|---|
| `npm run check` | Typecheck both projects |
| `npm test` | Unit tests |
| `npm run verify` | Both of the above |
| `npm run build` | Renderer, then main process |
| `npm run check:app` | Boot the built app and prove it works |
| `npm run package` | Build an installer into `release/` |
| `npm run icon` | Regenerate icon rasters from the SVG |
| `npm run release` | Tag, build, publish to GitHub |

## Releasing

```bash
npm version patch
npm run release
```

Needs `GH_TOKEN` with `repo` scope. The script refuses to publish unless the tree is clean
and pushed, so the tag always points at the commit the binary came from.

Release notes are opted into per commit, not scraped from the log:

```
Player: Keep the queue across restarts

Release-note: The queue and playback position survive a restart
```

## Notes

A few decisions that are easy to undo by accident:

- **The main process is CommonJS.** `electron-updater` pulls in `graceful-fs`, which
  dynamically `require()`s builtins. Bundled as ESM, esbuild replaces those with a shim
  that throws at import time and the app dies before it can open a window.
- **`noExternal` in `electron/tsup.config.ts` and `!node_modules/**/*` in
  `electron-builder.yml` are a pair.** The package ships no `node_modules`, so everything
  must be bundled. Change one without the other and the app throws *"Cannot find module"*
  the first time it reads a file's tags.
- **`takt://media/` must answer `Range` requests.** Without a `206`, `<audio>` cannot seek
  and reports `Infinity` for the duration of anything large.
- **`npm run check:app` is the gate.** It waits for a signal the *renderer* sends, not for
  a window — a window appears even when the protocol handler 404s.

## Licence

MIT.
