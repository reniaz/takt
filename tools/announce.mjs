#!/usr/bin/env node
/**
 * Posts a release announcement, where one is configured.
 *
 *   node tools/announce.mjs 0.1.0
 *
 * Every destination is opt-in through the environment and silently skipped when unset, so
 * this is safe to call unconditionally from the release script — and a machine without the
 * webhooks configured still cuts a perfectly good release.
 *
 *   TAKT_DISCORD_WEBHOOK   a Discord webhook URL
 *   TAKT_TELEGRAM_TOKEN    a bot token, with
 *   TAKT_TELEGRAM_CHAT     the chat to post into
 */
import { readFileSync } from 'node:fs';

import { buildNotes } from './notes.mjs';

const version = process.argv[2] ?? JSON.parse(readFileSync('package.json', 'utf8')).version;
const tag = `v${version}`;

const builderConfig = readFileSync('electron-builder.yml', 'utf8');
const owner = builderConfig.match(/^\s*owner:\s*(\S+)/m)?.[1];
const repo = builderConfig.match(/^\s*repo:\s*(\S+)/m)?.[1];

const { changes, download } = buildNotes(tag, { owner, repo, version });
const bullets = changes.length ? changes : ['Maintenance release.'];
const releaseUrl = `https://github.com/${owner}/${repo}/releases/tag/${tag}`;

async function post(label, url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    console.error(`  ${label}: ${response.status} ${await response.text()}`);
    return;
  }

  console.log(`  Announced on ${label}.`);
}

if (process.env.TAKT_DISCORD_WEBHOOK) {
  await post('Discord', process.env.TAKT_DISCORD_WEBHOOK, {
    embeds: [{
      title: `Takt ${version}`,
      url: releaseUrl,
      description: `${bullets.map((line) => `• ${line}`).join('\n')}\n\n[Download](${download})`,
      // The amber from the app icon, so the embed stripe matches the product.
      color: 0xE0A33E,
    }],
  });
}

if (process.env.TAKT_TELEGRAM_TOKEN && process.env.TAKT_TELEGRAM_CHAT) {
  const text = [
    `<b>Takt ${version}</b>`,
    '',
    ...bullets.map((line) => `• ${line}`),
    '',
    `<a href="${download}">Download</a>`,
  ].join('\n');

  await post('Telegram', `https://api.telegram.org/bot${process.env.TAKT_TELEGRAM_TOKEN}/sendMessage`, {
    chat_id: process.env.TAKT_TELEGRAM_CHAT,
    text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
  });
}
