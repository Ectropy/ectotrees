/**
 * Shared input attributes for RuneScape username fields: plain text with all
 * browser autocomplete/correction features disabled, since usernames aren't
 * dictionary words and should never be stored by the browser.
 */
export const RUNESCAPE_USERNAME_INPUT_PROPS = {
  type: 'text' as const,
  autoComplete: 'off',
  autoCorrect: 'off',
  autoCapitalize: 'none',
  spellCheck: false,
  inputMode: 'text' as const,
};
