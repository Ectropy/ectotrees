import { useState } from 'react';
import { copyToClipboard } from '../lib/utils';

/**
 * Returns `{ copied, copy }`.
 * Call `copy(text)` to write to clipboard; `copied` flips to true for
 * `duration` ms (default 2000ms) to drive a visual confirmation.
 */
export function useCopyFeedback(duration = 2000) {
  const [copied, setCopied] = useState(false);

  async function copy(text: string): Promise<boolean> {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), duration);
    }
    return ok;
  }

  return { copied, copy };
}
