/**
 * Extracts a session code from either a raw code string or a full join URL.
 *
 * Accepts:
 *   - Plain code:  "ABC123"        → "ABC123"
 *   - Join URL:    "https://…?join=ABC123" → "ABC123"
 *
 * Always returns the value uppercased. Does not validate the code format —
 * callers are responsible for checking against /^[A-HJ-NP-Z2-9]{6}$/.
 */
export function extractSessionCode(raw: string): string {
  try {
    const url = new URL(raw.trim());
    const param = url.searchParams.get('join');
    if (param !== null) return param.toUpperCase();
  } catch { /* not a URL — fall through */ }
  return raw.trim().toUpperCase();
}

/** Builds a shareable join URL for the given session code. */
export function buildSessionUrl(code: string): string {
  return `${window.location.origin}${window.location.pathname}?join=${code}`;
}
