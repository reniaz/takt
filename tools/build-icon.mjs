#!/usr/bin/env node
/**
 * Rasterises electron/assets/icon-takt.svg into the formats the packager needs.
 *
 *   npm run icon
 *
 * Run this after editing the SVG. The generated files are committed, because
 * electron-builder needs them at package time and a release must not depend on `sharp`
 * having installed correctly on whatever machine is building.
 */
import { readdir } from 'node:fs/promises';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import pngToIco from 'png-to-ico';
import sharp from 'sharp';

const ASSETS = 'electron/assets';

/**
 * Windows expects every one of these in the .ico. The shell picks the nearest size and
 * scales it, so a missing 24 or 48 shows up as a visibly soft icon in exactly one place
 * (the taskbar, or the alt-tab switcher) while every other size looks fine.
 */
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

/** Standalone PNGs, for the Linux/mac targets and the runtime window icon. */
const PNG_SIZES = [256, 512];

/*
 * `density` is the DPI sharp rasterises the SVG at before resizing. The default (72)
 * renders a 16-unit viewBox as a 16px bitmap and then upscales it, which turns the round
 * stroke caps into mush. 384 renders large enough that every output size is a downscale.
 */
const DENSITY = 384;

async function render(svg, size) {
  return sharp(svg, { density: DENSITY })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

const svgs = (await readdir(ASSETS)).filter((f) => f.startsWith('icon-') && f.endsWith('.svg'));

if (!svgs.length) {
  console.error(`\n  No icon-*.svg in ${ASSETS}\n`);
  process.exit(1);
}

for (const file of svgs) {
  const svg = join(ASSETS, file);
  const stem = file.replace(/\.svg$/, '');

  for (const size of PNG_SIZES) {
    const out = join(ASSETS, `${stem}-${size}.png`);
    await writeFile(out, await render(svg, size));
    console.log(`  ${out}`);
  }

  const ico = join(ASSETS, `${stem}.ico`);
  await writeFile(ico, await pngToIco(await Promise.all(ICO_SIZES.map((s) => render(svg, s)))));
  console.log(`  ${ico}  (${ICO_SIZES.join(', ')})`);
}

console.log('');
