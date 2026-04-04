const SESSION_CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;

/** Returns true if the string is a valid 6-character session code. */
export function validateSessionCode(code: string): boolean {
  return SESSION_CODE_RE.test(code);
}

/**
 * Extracts a session code or invite token from either a raw string or a full URL.
 *
 * Accepts:
 *   - Plain code:     "ABC123"                        → "ABC123"
 *   - Plain token:    "SQ8BKS5JGAU2"                  → "SQ8BKS5JGAU2"
 *   - Join URL:       "https://…#join=ABC123"         → "ABC123"
 *   - Invite URL:     "https://…#invite=SQ8BKS5JGAU2" → "SQ8BKS5JGAU2"
 *
 * Always returns the value uppercased. Does not validate the code/token format —
 * use validateSessionCode() for codes or check token length for tokens.
 */
export function extractSessionCode(raw: string): string {
  try {
    const url = new URL(raw.trim());
    // Try #join= first (session code)
    const joinMatch = url.hash.match(/^#join=(.*)$/);
    if (joinMatch) return joinMatch[1].toUpperCase();
    // Then try #invite= (invite token)
    const inviteMatch = url.hash.match(/^#invite=(.*)$/);
    if (inviteMatch) return inviteMatch[1].toUpperCase();
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
