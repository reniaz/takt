/**
 * Release notes, built from the commits between two tags.
 *
 * Kept separate from `release.mjs` so the same notes go to the GitHub release body and to
 * every announcement — one source, so they cannot drift into three descriptions of the
 * same release.
 */
import { execFileSync } from 'node:child_process';

/**
 * Release notes are opted into, not derived from every commit.
 *
 * A commit log records how something was built — including the wrong turns, the fixes to
 * the fixes, and the tooling nobody using the app will ever see. Listing all of it tells a
 * reader nothing about what changed for them. A commit worth announcing says so:
 *
 *     Release-note: Remember the queue across restarts
 *
 * Anything without the trailer is invisible to the notes.
 */
const NOTE_TRAILER = /^[ \t]*Release-note:[ \t]*(.+?)[ \t]*$/gim;

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

/**
 * The tag released before `tag`.
 *
 * Sorted by version rather than by date: tags get pushed out of order often enough (a
 * failed push retried later, a hotfix cut from an older commit) that "the most recent tag
 * by time" is not reliably "the previous version".
 */
export function selectPreviousTag(tags, tag) {
  const index = tags.indexOf(tag);
  if (index === -1) return undefined;

  return tags[index + 1];
}

/**
 * The release notes declared in a range of commit messages, newest first.
 *
 * Duplicates are dropped: a feature reworked over several commits is one line to whoever
 * reads the release, however many times it was touched.
 *
 * So are earlier, shorter versions of the same line. A feature that grows over a few
 * commits tends to have its note extended with it — "Remember the queue across restarts"
 * becoming "...including the playback position" — and announcing both says the same thing
 * twice, the second time worse. Notes arrive newest first, so the fuller line is already
 * in hand when its own beginning turns up.
 */
export function extractNotes(log) {
  const notes = [];

  for (const [, note] of log.matchAll(NOTE_TRAILER)) {
    const text = note.trim();
    if (!text) continue;

    if (notes.some((kept) => kept === text || kept.startsWith(text))) continue;

    notes.push(text);
  }

  return notes;
}

/**
 * @returns {{ previous: string|undefined, changes: string[], markdown: string, download: string }}
 */
export function buildNotes(tag, { owner, repo, version }) {
  const tags = git(['tag', '--list', 'v*', '--sort=-v:refname']).split('\n').filter(Boolean);
  const previous = selectPreviousTag(tags, tag);

  const range = previous ? `${previous}..${tag}` : tag;
  // Whole messages, not subjects: the trailer lives in the body.
  const changes = extractNotes(git(['log', range, '--no-merges', '--format=%B']));

  const download = `https://github.com/${owner}/${repo}/releases/download/${tag}/Takt-Setup-${version}.exe`;

  const markdown = [
    changes.length ? changes.map((line) => `- ${line}`).join('\n') : '- Maintenance release.',
    '',
    `**[Download Takt ${version}](${download})**`,
    '',
    'Existing installs update themselves on the next launch.',
    previous
      ? `\n[Full changelog](https://github.com/${owner}/${repo}/compare/${previous}...${tag})`
      : '',
  ].join('\n').trim();

  return { previous, changes, markdown, download };
}
