import { describe, it, expect } from 'vitest';
import { extractSessionCode } from '../sessionUrl';

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

  // ── URLs with ?join= param ─────────────────────────────────────────────────

  it('extracts code from a full https join URL', () => {
    expect(extractSessionCode('https://ectotrees.app/?join=ABC123')).toBe('ABC123');
  });

  it('uppercases the extracted code from a URL', () => {
    expect(extractSessionCode('https://ectotrees.app/?join=abc123')).toBe('ABC123');
  });

  it('extracts code from a localhost URL', () => {
    expect(extractSessionCode('http://localhost:5173/?join=XY23AB')).toBe('XY23AB');
  });

  it('extracts code when URL has additional query params', () => {
    expect(extractSessionCode('https://ectotrees.app/?foo=bar&join=DEF456')).toBe('DEF456');
  });

  it('ignores unrelated query params (no join param)', () => {
    // Falls back to returning the raw URL string uppercased — callers must validate
    const result = extractSessionCode('https://ectotrees.app/?other=ABC123');
    expect(result).not.toBe('ABC123');
  });

  it('returns empty string when join param is empty', () => {
    expect(extractSessionCode('https://ectotrees.app/?join=')).toBe('');
  });

  // ── Whitespace handling ────────────────────────────────────────────────────

  it('trims leading/trailing whitespace before parsing', () => {
    expect(extractSessionCode('  ABC123  ')).toBe('ABC123');
  });

  it('trims whitespace from a pasted URL', () => {
    expect(extractSessionCode('  https://ectotrees.app/?join=ABC123  ')).toBe('ABC123');
  });

  // ── Non-URL strings that look URL-like ────────────────────────────────────

  it('treats a bare ?join=CODE string as a plain code (not a URL)', () => {
    // new URL('?join=ABC123') throws — falls back to raw uppercase
    expect(extractSessionCode('?join=ABC123')).toBe('?JOIN=ABC123');
  });
});
