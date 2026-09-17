import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Placeholder that Vite stamps onto every `<script>` / `<link>` it emits
 * (`html.cspNonce` in vite.config.ts) and that index.html carries on the
 * hand-written GTM snippet. The server swaps it for a fresh random nonce on
 * every request so the CSP can drop `'unsafe-inline'` for scripts.
 */
export const CSP_NONCE_PLACEHOLDER = '__CSP_NONCE__';

/**
 * Read the built index.html once at startup. Throws if the placeholder is
 * absent — a build without `html.cspNonce` would ship a page whose scripts
 * the strict CSP refuses to run, so fail loudly instead of serving it.
 */
export function loadIndexTemplate(distDir: string): string {
  const template = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
  if (!template.includes(CSP_NONCE_PLACEHOLDER)) {
    throw new Error(`dist/index.html does not contain ${CSP_NONCE_PLACEHOLDER} — was it built with html.cspNonce set?`);
  }
  return template;
}

/** Pure: substitute every placeholder occurrence with the given nonce. */
export function renderIndex(template: string, nonce: string): string {
  return template.replaceAll(CSP_NONCE_PLACEHOLDER, nonce);
}

/** 128 bits of CSPRNG output, base64 — the format CSP expects in `'nonce-…'`. */
export function generateNonce(): string {
  return crypto.randomBytes(16).toString('base64');
}
