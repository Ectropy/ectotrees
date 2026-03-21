export const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];
export const MAX_RECONNECT_ATTEMPTS = 10;

/**
 * Returns a reconnection status string for display in the UI, or null if not
 * in a reconnecting state.
 *
 * @param reconnectAttempt  Current attempt number (0 = first connect, not a retry)
 * @param countdown         Seconds until next retry (null = actively retrying now)
 */
export function formatReconnectMessage(
  reconnectAttempt: number,
  countdown: number | null,
): string | null {
  if (reconnectAttempt === 0) return null;
  if (countdown && countdown > 0) return `Connection lost, retrying in ${countdown}s.`;
  return `Connection lost, retrying…`;
}
