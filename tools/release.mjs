#!/usr/bin/env node
/**
 * Publishes a release, with the source and the binary guaranteed to match.
 *
 *   npm run release
 *
 * electron-builder on its own only uploads artefacts — it has no idea whether the code
 * that produced them was committed, let alone pushed. That makes it possible to ship a
 * binary nobody can reproduce, which is a debugging problem the first time a user reports
 * something that cannot be traced to a commit.
 *
 * So this refuses to publish unless the tree is clean and pushed, then tags the exact
 * commit the build came from.
 *
 * The ordering below is load-bearing. Each step is here because of a specific way a
 * release can go wrong; the comments say which.
 *
 * Requires GH_TOKEN (a GitHub token with `repo` scope).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { cleanRelease } from './clean-release.mjs';
import { buildNotes } from './notes.mjs';

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: 'pipe', ...opts }).trim();
}

function runLive(cmd, args) {
  execFileSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
}

function die(message, hint) {
  console.error(`\n  ${message}\n`);
  if (hint) console.error(`  ${hint}\n`);
  process.exit(1);
}

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const tag = `v${version}`;
const installer = `Takt-Setup-${version}.exe`;

// Single source of truth: the publish target is declared once, in the builder config that
// also writes it into the packaged app-update.yml.
const builderConfig = readFileSync('electron-builder.yml', 'utf8');
const owner = builderConfig.match(/^\s*owner:\s*(\S+)/m)?.[1];
const repo = builderConfig.match(/^\s*repo:\s*(\S+)/m)?.[1];

if (!owner || !repo) die('Could not read owner/repo out of electron-builder.yml.');

function gh(path, init = {}) {
  return fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${process.env.GH_TOKEN || process.env.GITHUB_TOKEN}`,
      'content-type': 'application/json',
      ...init.headers,
    },
  });
}

async function ensureRelease() {
  const existing = await gh(`/releases/tags/${tag}`);
  if (existing.ok) {
    console.log(`Release ${tag} already exists; uploading into it.\n`);
    return;
  }

  const created = await gh('/releases', {
    method: 'POST',
    body: JSON.stringify({
      tag_name: tag,
      name: version,
      body: buildNotes(tag, { owner, repo, version }).markdown,
      draft: false,
      prerelease: false,
    }),
  });

  if (!created.ok) {
    die(`Could not create release ${tag}: ${created.status} ${await created.text()}`);
  }

  console.log(`Created release ${tag}.\n`);
}

async function verifyRelease() {
  const all = await gh('/releases').then((r) => r.json());
  const forTag = all.filter((r) => r.tag_name === tag);

  if (forTag.length > 1) {
    die(
      `${forTag.length} releases exist for ${tag} — assets are split across them.`,
      `Delete the extras at https://github.com/${owner}/${repo}/releases and re-run.`,
    );
  }

  const assets = forTag[0]?.assets.map((a) => a.name) ?? [];
  const missing = ['latest.yml', installer].filter((name) => !assets.includes(name));

  if (missing.length) {
    die(
      `Release ${tag} is missing: ${missing.join(', ')}`,
      'Without latest.yml the updater cannot see this release.\n'
      + `    Found: ${assets.join(', ') || '(nothing)'}`,
    );
  }

  console.log(`  Verified: ${assets.join(', ')}`);
}

console.log(`\nReleasing Takt ${tag}\n`);

/* 1. The token has to exist before we spend minutes building. */
if (!process.env.GH_TOKEN && !process.env.GITHUB_TOKEN) {
  die(
    'GH_TOKEN is not set.',
    'Create a token with `repo` scope at https://github.com/settings/tokens, then:\n'
    + '    $env:GH_TOKEN="ghp_..."     (PowerShell)\n'
    + '    set GH_TOKEN=ghp_...        (cmd)',
  );
}

/* 2. Uncommitted work would not be in the tag. */
const dirty = run('git', ['status', '--porcelain']);
if (dirty) {
  die(
    'Working tree is not clean — the release would not match the repository.',
    `Commit or stash first:\n${dirty.split('\n').map((l) => `    ${l}`).join('\n')}`,
  );
}

/* 3. The tag must point at a commit others can actually fetch. */
const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
let unpushed;
try {
  unpushed = run('git', ['rev-list', '--count', '@{u}..HEAD']);
} catch {
  die(`Branch '${branch}' has no upstream.`, `    git push -u origin ${branch}`);
}

if (unpushed !== '0') {
  die(`${unpushed} commit(s) on '${branch}' are not pushed.`, `    git push origin ${branch}`);
}

/*
 * 4. A reused tag means the version was not bumped, and the updater keys off version.
 *
 * An existing tag whose release holds no assets is a different situation: an earlier run
 * was interrupted between tagging and uploading. That one is finished rather than refused.
 */
const remoteTag = run('git', ['ls-remote', '--tags', 'origin', tag]);
if (remoteTag) {
  const existing = await gh(`/releases/tags/${tag}`);
  const assets = existing.ok ? (await existing.json()).assets ?? [] : [];

  if (assets.length) {
    die(
      `Tag ${tag} already exists on the remote — version ${version} has been released.`,
      'Bump "version" in package.json first:\n    npm version patch',
    );
  }

  console.log(`Tag ${tag} is on the remote but its release is empty; finishing that run.\n`);
}

const hasLocalTag = Boolean(run('git', ['tag', '--list', tag]));
if (hasLocalTag) {
  console.log(`Reusing local tag ${tag} left behind by an earlier failed run.\n`);
}

/* 5. Only now spend time on the build. */
console.log('Verifying...\n');
runLive('npm', ['run', 'verify']);

console.log('\nBuilding...\n');
runLive('npm', ['run', 'build']);

console.log('\nChecking the app boots...\n');
runLive('npm', ['run', 'check:app']);

console.log(`\nTagging ${tag}...\n`);
if (!hasLocalTag) run('git', ['tag', '-a', tag, '-m', `Takt ${version}`]);
// Already there when finishing an interrupted run, and pushing it again is rejected.
if (!remoteTag) runLive('git', ['push', 'origin', tag]);

/*
 * 6. Create the GitHub release before electron-builder uploads anything.
 *
 * electron-builder uploads artefacts in parallel, and each upload independently does
 * "find or create the release for this tag". When they start together none of them sees a
 * release yet, so several get created for the same tag — and the assets scatter across
 * them. GitHub then picks one as "latest", and if that is not the one holding latest.yml,
 * every client's update check 404s silently.
 */
await ensureRelease();

console.log('\nPublishing...\n');
runLive('npx', ['electron-builder', '--win', 'nsis', '--publish', 'always']);

/* 7. Fail loudly if the assets did not all land on one release. */
await verifyRelease();

/* 8. The artefacts are on GitHub now; the local copies are just disk. */
console.log('');
cleanRelease(version);

/* 9. Announce it. Last, and unable to fail the release. */
try {
  runLive('node', ['tools/announce.mjs', version]);
} catch {
  console.error('\n  Announcing failed. The release itself is published and complete.');
  console.error(`  Re-run it with \`node tools/announce.mjs ${version}\`.`);
}

console.log(`\n  Released ${tag}.`);
console.log('  Installed copies will pick it up on their next launch.\n');
