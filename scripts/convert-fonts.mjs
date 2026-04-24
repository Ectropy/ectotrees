#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import wawoff from 'wawoff2';

const OUT_DIR = 'src/assets/fonts';
const VALID_EXT = new Set(['.ttf', '.otf']);

const inputs = process.argv.slice(2);
if (inputs.length === 0) {
  console.error('Usage: node scripts/convert-fonts.mjs <font.ttf|font.otf> [...]');
  process.exit(1);
}

await mkdir(OUT_DIR, { recursive: true });

for (const src of inputs) {
  const ext = extname(src).toLowerCase();
  if (!VALID_EXT.has(ext)) {
    console.warn(`skip: ${src} (not .ttf/.otf)`);
    continue;
  }
  const srcBytes = await readFile(src);
  const outBytes = await wawoff.compress(srcBytes);
  const outPath = join(OUT_DIR, basename(src, ext) + '.woff2');
  await writeFile(outPath, outBytes);
  const ratio = ((1 - outBytes.length / srcBytes.length) * 100).toFixed(1);
  console.log(`${src} → ${outPath} (${srcBytes.length} → ${outBytes.length} bytes, −${ratio}%)`);
}
