#!/usr/bin/env node
// Generate public/og-image.png by screenshotting the Marketing/OgImage
// Storybook story at 1200x630. Run after visual changes to the map/cards:
//   npm run og:generate
//
// Pass --skip-build to re-use an existing storybook-static build.

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, extname } from 'node:path';
import { chromium } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const STORYBOOK_DIR = join(ROOT, 'storybook-static');
const OUTPUT_PATH = join(ROOT, 'public', 'og-image.png');
const STORY_ID = 'marketing-ogimage--default';
const VIEWPORT = { width: 1200, height: 630 };
const PORT = 6007;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

function run(cmd, args, opts = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(cmd, args, { stdio: 'inherit', shell: true, cwd: ROOT, ...opts });
    child.on('exit', code => code === 0 ? resolvePromise() : rejectPromise(new Error(`${cmd} exited ${code}`)));
    child.on('error', rejectPromise);
  });
}

function startStaticServer(dir, port) {
  const server = createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
      const filePath = join(dir, urlPath === '/' ? '/index.html' : urlPath);
      if (!filePath.startsWith(dir)) {
        res.writeHead(403).end('Forbidden');
        return;
      }
      const s = await stat(filePath).catch(() => null);
      if (!s || !s.isFile()) {
        res.writeHead(404).end('Not found');
        return;
      }
      const body = await readFile(filePath);
      res.writeHead(200, { 'Content-Type': MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream' });
      res.end(body);
    } catch (err) {
      res.writeHead(500).end(String(err));
    }
  });
  return new Promise(resolvePromise => server.listen(port, () => resolvePromise(server)));
}

async function waitForMapReady(page) {
  await page.waitForFunction(() => {
    const tileCount = document.querySelectorAll('.leaflet-tile-loaded').length;
    const w = window;

    if (tileCount === 0) return false; //0 tiles loaded, not ready
    if (tileCount === w.__tileCount) return true; //same number of tiles as last check, assume stable and ready

    w.__tileCount = tileCount; // store count on window for next check
  }, null, { polling: 500, timeout: 30_000 });
}

async function main() {
  const skipBuild = process.argv.includes('--skip-build');

  if (!skipBuild) {
    console.log('→ Building Storybook...');
    await run('npm', ['run', 'build-storybook', '--', '--quiet']);
  } else if (!existsSync(STORYBOOK_DIR)) {
    throw new Error(`--skip-build passed but ${STORYBOOK_DIR} does not exist.`);
  }

  console.log(`→ Serving ${STORYBOOK_DIR} on http://localhost:${PORT}`);
  const server = await startStaticServer(STORYBOOK_DIR, PORT);

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    const url = `http://localhost:${PORT}/iframe.html?id=${STORY_ID}&viewMode=story`;
    console.log(`→ Loading story: ${url}`);
    await page.goto(url, { waitUntil: 'load' });

    // Story content renders inside #storybook-root.
    await page.waitForSelector('#storybook-root > *', { timeout: 15_000 });

    console.log('→ Waiting for map to finish loading...');
    await waitForMapReady(page);

    await mkdir(dirname(OUTPUT_PATH), { recursive: true });
    const root = await page.$('#storybook-root > *');
    if (!root) throw new Error('Could not find rendered story root.');
    await root.screenshot({ path: OUTPUT_PATH, type: 'png' });
    console.log(`✓ Wrote ${OUTPUT_PATH}`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
