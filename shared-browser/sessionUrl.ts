/**
 * Builds a shareable identity URL (`…#identity=TOKEN`) for the given token.
 *
 * `basePath` defaults to `window.location.pathname`, which preserves the
 * current app path — appropriate for the dashboard. The Alt1 plugin (served
 * under `/alt1/`) should pass `'/'` so the copied URL opens the dashboard
 * root instead of the plugin.
 */
export function buildIdentityUrl(token: string, basePath?: string): string {
  const path = basePath ?? window.location.pathname;
  return `${window.location.origin}${path}#identity=${token}`;
}

const IDENTITY_TOKEN_RE = /^[A-HJ-NP-Z2-9]{12}$/;

/**
 * Extracts and validates a 12-char identity token from either a raw string or a full URL.
 *
 * Accepts:
 *   - Plain token:   "SQ8BKS5JGAU2"                    → "SQ8BKS5JGAU2"
 *   - Identity URL:  "https://…#identity=SQ8BKS5JGAU2"  → "SQ8BKS5JGAU2"
 *
 * Returns null if the input doesn't contain a valid 12-char identity token.
 */
export function extractIdentityToken(raw: string): string | null {
  const trimmed = raw.trim();
  try {
    const url = new URL(trimmed);
    const hashMatch = url.hash.match(/^#identity=([A-Za-z0-9]+)$/);
    if (hashMatch && IDENTITY_TOKEN_RE.test(hashMatch[1].toUpperCase())) {
      return hashMatch[1].toUpperCase();
    }
  } catch { /* not a URL */ }
  const upper = trimmed.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '');
  if (IDENTITY_TOKEN_RE.test(upper)) return upper;
  return null;
}
