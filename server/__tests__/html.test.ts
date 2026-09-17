import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CSP_NONCE_PLACEHOLDER, loadIndexTemplate, renderIndex, generateNonce } from '../html.ts';

describe('renderIndex', () => {
  it('replaces every placeholder occurrence with the nonce', () => {
    const template = `<script nonce="${CSP_NONCE_PLACEHOLDER}"></script><link nonce="${CSP_NONCE_PLACEHOLDER}">`;
    const out = renderIndex(template, 'abc123');
    expect(out).toBe('<script nonce="abc123"></script><link nonce="abc123">');
    expect(out).not.toContain(CSP_NONCE_PLACEHOLDER);
  });

  it('leaves templates without the placeholder untouched', () => {
    expect(renderIndex('<p>hi</p>', 'n')).toBe('<p>hi</p>');
  });
});

describe('generateNonce', () => {
  it('produces distinct base64 values of 128 bits', () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});

describe('loadIndexTemplate', () => {
  function withDist(html: string, fn: (dir: string) => void) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ectotrees-html-'));
    try {
      fs.writeFileSync(path.join(dir, 'index.html'), html);
      fn(dir);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  it('returns the file contents when the placeholder is present', () => {
    withDist(`<script nonce="${CSP_NONCE_PLACEHOLDER}"></script>`, (dir) => {
      expect(loadIndexTemplate(dir)).toContain(CSP_NONCE_PLACEHOLDER);
    });
  });

  it('throws when a build shipped without the placeholder', () => {
    withDist('<script></script>', (dir) => {
      expect(() => loadIndexTemplate(dir)).toThrow(/cspNonce/);
    });
  });
});
