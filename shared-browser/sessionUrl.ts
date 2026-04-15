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
