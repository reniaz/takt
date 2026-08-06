#!/usr/bin/env node
/**
 * Creates the public GitHub repository and pushes the first commit.
 *
 *   npm run bootstrap
 *
 * Run once, before the first release. electron-updater reads its feed from a public
 * release, so the repo has to exist and be public before `npm run release` can work.
 *
 * Uses the GitHub REST API with GH_TOKEN rather than the `gh` CLI, which keeps the tooling
 * to one dependency that `release.mjs` already needs anyway.
 *
 * Idempotent: every step checks for the state it would create, so a run interrupted
 * halfway can simply be run again.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: 'pipe', ...opts }).trim();
}

function runLive(cmd, args) {
  execFileSync(cmd, args, { stdio: 'inherit' });
}

function die(message, hint) {
  console.error(`\n  ${message}\n`);
  if (hint) console.error(`  ${hint}\n`);
  process.exit(1);
}

const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!token) {
  die(
    'GH_TOKEN is not set.',
    'Create a token with `repo` scope at https://github.com/settings/tokens, then:\n'
    + '    $env:GH_TOKEN="ghp_..."     (PowerShell)',
  );
}

const builderConfig = readFileSync('electron-builder.yml', 'utf8');
const owner = builderConfig.match(/^\s*owner:\s*(\S+)/m)?.[1];
const repo = builderConfig.match(/^\s*repo:\s*(\S+)/m)?.[1];
const { description } = JSON.parse(readFileSync('package.json', 'utf8'));

if (!owner || !repo) die('Could not read owner/repo out of electron-builder.yml.');

const api = (path, init = {}) => fetch(`https://api.github.com${path}`, {
  ...init,
  headers: {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    ...init.headers,
  },
});

console.log(`\nBootstrapping ${owner}/${repo}\n`);

/* 1. The token must actually belong to the account that owns the repo path. */
const me = await api('/user');
if (!me.ok) die(`GH_TOKEN is not valid: ${me.status} ${await me.text()}`);

const login = (await me.json()).login;
if (login.toLowerCase() !== owner.toLowerCase()) {
  die(
    `GH_TOKEN belongs to "${login}" but electron-builder.yml says owner is "${owner}".`,
    'Fix whichever is wrong before publishing — the updater reads the feed from `owner`.',
  );
}

/* 2. Create the repository, or accept one that is already there. */
const existing = await api(`/repos/${owner}/${repo}`);

if (existing.ok) {
  const info = await existing.json();
  console.log(`Repository already exists: ${info.html_url}`);

  /*
   * A private repo is the one state that looks fine and silently breaks updates: the
   * release feed is fetched without credentials, so every client's check 404s.
   */
  if (info.private) {
    die(
      `${owner}/${repo} is private — electron-updater fetches the feed unauthenticated.`,
      'Make it public in Settings, or updates will silently never arrive.',
    );
  }
} else {
  const created = await api('/user/repos', {
    method: 'POST',
    body: JSON.stringify({
      name: repo,
      description,
      private: false,
      has_issues: true,
      has_wiki: false,
      has_projects: false,
    }),
  });

  if (!created.ok) die(`Could not create the repository: ${created.status} ${await created.text()}`);
  console.log(`Created ${(await created.json()).html_url}`);
}

/* 3. Local git. */
let isRepo = false;
try {
  run('git', ['rev-parse', '--git-dir']);
  isRepo = true;
} catch {
  /* not a repo yet */
}

if (!isRepo) {
  run('git', ['init', '-b', 'main']);
  console.log('Initialised a git repository on `main`.');
}

const remoteUrl = `https://github.com/${owner}/${repo}.git`;
let hasOrigin = false;
try {
  const current = run('git', ['remote', 'get-url', 'origin']);
  hasOrigin = true;
  if (current !== remoteUrl) {
    run('git', ['remote', 'set-url', 'origin', remoteUrl]);
    console.log(`Repointed origin at ${remoteUrl}`);
  }
} catch {
  /* no origin yet */
}

if (!hasOrigin) {
  run('git', ['remote', 'add', 'origin', remoteUrl]);
  console.log(`Added origin ${remoteUrl}`);
}

/* 4. First commit, if there is nothing yet. */
let hasCommits = false;
try {
  run('git', ['rev-parse', 'HEAD']);
  hasCommits = true;
} catch {
  /* unborn branch */
}

if (!hasCommits) {
  runLive('git', ['add', '-A']);
  runLive('git', ['commit', '-m', 'Takt: initial commit']);
  console.log('Committed the initial tree.');
}

const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
runLive('git', ['push', '-u', 'origin', branch]);

console.log(`\n  ${owner}/${repo} is public and pushed.`);
console.log('  Next: npm run release\n');
