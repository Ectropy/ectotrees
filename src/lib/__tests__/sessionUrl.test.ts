import { describe, it, expect } from 'vitest';
import { extractSessionCode } from '../sessionUrl';
import { buildIdentityUrl } from '@shared-browser/sessionUrl';

describe('extractSessionCode', () => {
  // ── Plain codes ────────────────────────────────────────────────────────────

  it('returns an already-valid uppercase code unchanged', () => {
    expect(extractSessionCode('ABC123')).toBe('ABC123');
  });

  it('uppercases a plain lowercase code', () => {
    expect(extractSessionCode('abc123')).toBe('ABC123');
  });

  it('uppercases a mixed-case plain code', () => {
    expect(extractSessionCode('AbC2x9')).toBe('ABC2X9');
  });

  it('handles empty string', () => {
    expect(extractSessionCode('')).toBe('');
  });

  it('uppercases a non-code string (does not validate format)', () => {
    expect(extractSessionCode('toolong')).toBe('TOOLONG');
  });

  // ── URLs with #join= fragment ─────────────────────────────────────────────

  it('extracts code from a full https join URL with fragment', () => {
    expect(extractSessionCode('https://ectotrees.app/#join=ABC123')).toBe('ABC123');
  });

  it('uppercases the extracted code from a fragment URL', () => {
    expect(extractSessionCode('https://ectotrees.app/#join=abc123')).toBe('ABC123');
  });

  it('extracts code from a localhost URL with fragment', () => {
    expect(extractSessionCode('http://localhost:5173/#join=XY23AB')).toBe('XY23AB');
  });

  it('ignores unrelated hash fragments', () => {
    const result = extractSessionCode('https://ectotrees.app/#other=ABC123');
    expect(result).not.toBe('ABC123');
  });

  it('returns empty string when join fragment value is empty', () => {
    expect(extractSessionCode('https://ectotrees.app/#join=')).toBe('');
  });

  // ── Whitespace handling ────────────────────────────────────────────────────

  it('trims leading/trailing whitespace before parsing', () => {
    expect(extractSessionCode('  ABC123  ')).toBe('ABC123');
  });

  it('trims whitespace from a pasted URL', () => {
    expect(extractSessionCode('  https://ectotrees.app/#join=ABC123  ')).toBe('ABC123');
  });

  // ── Non-URL strings that look URL-like ────────────────────────────────────

  it('treats a bare #join=CODE string as a plain code (not a URL)', () => {
    // new URL('#join=ABC123') throws — falls back to raw uppercase
    expect(extractSessionCode('#join=ABC123')).toBe('#JOIN=ABC123');
  });
});

describe('buildIdentityUrl', () => {
  function withWindowLocation(origin: string, pathname: string, fn: () => void) {
    const orig = globalThis.window?.location;
    Object.defineProperty(globalThis, 'window', {
      value: { location: { origin, pathname } },
      writable: true,
      configurable: true,
    });
    try {
      fn();
    } finally {
      if (orig) {
        Object.defineProperty(globalThis.window, 'location', { value: orig, writable: true, configurable: true });
      } else {
        delete (globalThis as Record<string, unknown>).window;
      }
    }
  }

  it('builds a fragment-based identity URL using window.location.pathname by default', () => {
    withWindowLocation('https://ectotrees.app', '/', () => {
      expect(buildIdentityUrl('ABCD1234EF56')).toBe('https://ectotrees.app/#identity=ABCD1234EF56');
    });
  });

  it('overrides the path when basePath is passed (Alt1 plugin case)', () => {
    withWindowLocation('https://ectotrees.app', '/alt1/', () => {
      expect(buildIdentityUrl('ABCD1234EF56', '/')).toBe('https://ectotrees.app/#identity=ABCD1234EF56');
    });
  });
});
