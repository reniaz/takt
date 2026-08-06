import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';

import { app, protocol } from 'electron';

/**
 * Everything the renderer loads comes through the `takt://` scheme: the app bundle in
 * production, and audio, cover art and waveform peaks always.
 *
 * A custom scheme rather than a loopback HTTP server, because nothing here needs a real
 * HTTP origin — there is no Cache API use and no third-party code expecting one. A server
 * would mean a port to allocate, a secret to keep, and a socket any other local process
 * could knock on.
 *
 * Media is addressed by track id, never by path. Two reasons: Windows paths carry
 * characters (`#`, `?`, spaces, non-ASCII, UNC prefixes) that have to survive a round trip
 * through a URL, and an id-keyed handler physically cannot be talked into reading a file
 * outside the library.
 */

export const SCHEME = 'takt';
export const APP_ORIGIN = `${SCHEME}://app`;

/*
 * Must run before `app.ready`.
 *
 * `standard` gives the scheme normal URL parsing and a real origin, which localStorage,
 * IndexedDB and module scripts all require. `stream` is what allows a Response whose body
 * is a ReadableStream — without it the whole file would have to be buffered before
 * anything played.
 */
export function registerScheme() {
  protocol.registerSchemesAsPrivileged([{
    scheme: SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  }]);
}

/* ---------- track id -> path ---------- */

type Resolver = (id: string) => string | undefined;

let resolveTrack: Resolver = () => undefined;

/**
 * Points the media handler at the library. Called once at startup; exists so `protocol.ts`
 * does not have to import the database and can be tested on its own.
 */
export function setTrackResolver(fn: Resolver) {
  resolveTrack = fn;
}

/* ---------- mime ---------- */

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
};

function mimeFor(path: string) {
  return MIME[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

/* ---------- byte serving ---------- */

function body(path: string, start: number, end: number) {
  // `end` is inclusive in HTTP ranges and in createReadStream, so they line up directly.
  return Readable.toWeb(createReadStream(path, { start, end })) as unknown as ReadableStream;
}

export type ResolvedRange =
  | { kind: 'full' }
  | { kind: 'partial'; start: number; end: number }
  | { kind: 'unsatisfiable' };

/**
 * Works out which bytes a `Range` header is asking for.
 *
 * Split out from the response building because this is the part that has to be right and
 * the part that is worth testing — an off-by-one here means audio that plays but cannot
 * seek, which looks nothing like a byte-range bug from the outside.
 *
 * Only the single-range form is handled. Multipart ranges are legal HTTP but no media
 * element sends them, and answering one wrongly is worse than answering it with the whole
 * file.
 */
export function resolveRange(header: string | null, size: number): ResolvedRange {
  const match = header ? /^bytes=(\d*)-(\d*)$/.exec(header.trim()) : undefined;
  if (!match) return { kind: 'full' };

  const [, rawStart = '', rawEnd = ''] = match;

  // An empty file has no satisfiable range, and `size - 1` would be -1.
  if (size === 0) return { kind: 'unsatisfiable' };

  let start: number;
  let end: number;

  if (rawStart === '') {
    // `bytes=-500` is the *last* 500 bytes, not "from 0 to 500". Chromium uses this form
    // to read the trailing metadata of a container.
    if (rawEnd === '') return { kind: 'unsatisfiable' };
    const wanted = Number(rawEnd);
    start = Math.max(0, size - wanted);
    end = size - 1;
  } else {
    start = Number(rawStart);
    // An open-ended `bytes=1000-` runs to the end of the file.
    end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
    return { kind: 'unsatisfiable' };
  }

  return { kind: 'partial', start, end };
}

/**
 * Serves a file, honouring `Range`.
 *
 * Range is not optional for audio. Chromium asks for a short prefix, reads the container
 * header, then seeks by issuing further range requests. A handler that always returns the
 * whole file with 200 leaves `<audio>` unable to seek at all and reporting a duration of
 * `Infinity` on anything large — which presents as a broken seek bar and gets debugged in
 * the player code rather than here.
 */
function serveFile(path: string, request: Request): Response {
  let size: number;
  try {
    const stat = statSync(path);
    if (!stat.isFile()) return new Response('Not found', { status: 404 });
    size = stat.size;
  } catch {
    return new Response('Not found', { status: 404 });
  }

  const type = mimeFor(path);
  const range = resolveRange(request.headers.get('range'), size);

  if (range.kind === 'unsatisfiable') {
    return new Response('Range not satisfiable', {
      status: 416,
      headers: { 'content-range': `bytes */${size}` },
    });
  }

  if (range.kind === 'full') {
    return new Response(body(path, 0, Math.max(0, size - 1)), {
      status: 200,
      headers: {
        'content-type': type,
        'content-length': String(size),
        // Advertised even on the full response, or Chromium never tries to seek.
        'accept-ranges': 'bytes',
      },
    });
  }

  const { start, end } = range;

  return new Response(body(path, start, end), {
    status: 206,
    headers: {
      'content-type': type,
      'content-length': String(end - start + 1),
      'content-range': `bytes ${start}-${end}/${size}`,
      'accept-ranges': 'bytes',
    },
  });
}

/* ---------- routing ---------- */

/** Blocks `..` escapes out of the served root. */
function within(root: string, requested: string) {
  const full = resolve(root, `.${sep}${normalize(requested)}`);
  return full === root || full.startsWith(root + sep) ? full : undefined;
}

export function registerHandlers(rendererRoot: string) {
  const artworkRoot = resolve(join(app.getPath('userData'), 'artwork'));
  const appRoot = resolve(rendererRoot);

  protocol.handle(SCHEME, (request) => {
    const url = new URL(request.url);
    // `takt://media/<id>` — host is "media", pathname is "/<id>".
    const target = decodeURIComponent(url.pathname).replace(/^\/+/, '');

    switch (url.host) {
      case 'app': {
        // A deep link like takt://app/#/mini still has to serve the entry document.
        const file = within(appRoot, target || 'index.html');
        if (!file) return new Response('Forbidden', { status: 403 });
        return serveFile(existsSync(file) ? file : join(appRoot, 'index.html'), request);
      }

      case 'media': {
        const path = resolveTrack(target);
        if (!path) return new Response('Unknown track', { status: 404 });
        return serveFile(path, request);
      }

      case 'art': {
        // Hashes only — the handler never takes a caller-supplied path.
        if (!/^[a-f0-9]{40}(\.(jpg|png|webp))?$/i.test(target)) {
          return new Response('Bad artwork id', { status: 400 });
        }
        const file = within(artworkRoot, target);
        if (!file) return new Response('Forbidden', { status: 403 });
        return serveFile(file, request);
      }

      default:
        return new Response('Not found', { status: 404 });
    }
  });
}
