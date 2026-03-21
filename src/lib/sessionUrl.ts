const SESSION_CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;

/** Returns true if the string is a valid 6-character session code. */
export function validateSessionCode(code: string): boolean {
  return SESSION_CODE_RE.test(code);
}

/**
 * Extracts a session code from either a raw code string or a full join URL.
 *
 * Accepts:
 *   - Plain code:  "ABC123"                        → "ABC123"
 *   - Join URL:    "https://…#join=ABC123"          → "ABC123"
 *
 * Always returns the value uppercased. Does not validate the code format —
 * use validateSessionCode() to check the result.
 */
export function extractSessionCode(raw: string): string {
  try {
    const url = new URL(raw.trim());
    const hashMatch = url.hash.match(/^#join=(.*)$/);
    if (hashMatch) return hashMatch[1].toUpperCase();
  } catch { /* not a URL — fall through */ }
  return raw.trim().toUpperCase();
}

/** Builds a shareable join URL for the given session code. */
export function buildSessionUrl(code: string): string {
  return `${window.location.origin}${window.location.pathname}#join=${code}`;
}

/** Builds a shareable invite URL for the given invite/personal token. */
export function buildInviteUrl(token: string): string {
  return `${window.location.origin}${window.location.pathname}#invite=${token}`;
}
