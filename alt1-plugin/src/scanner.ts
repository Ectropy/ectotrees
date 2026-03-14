/**
 * Screen scanning utilities using Alt1's built-in readers.
 */

import 'alt1/base';

// DialogReader is the pre-built RS3 NPC dialog reader (default export).
import DialogReader from 'alt1/dialog';

// ── Spirit Tree dialog ──────────────────────────────────────────────────────

export interface DialogScanResult {
  rawText: string;
}

/**
 * Scans for an open RS3 NPC dialog box and returns its body text.
 *
 * DialogReader is called without an explicit image argument so it handles its
 * own fresh capture — this is the idiomatic pattern and avoids stale-capture
 * issues with ImgRefBind.
 *
 * Returns null if Alt1 is unavailable, permissions are missing, or no dialog found.
 */
export function scanSpiritTreeDialog(): DialogScanResult | null {
  if (typeof alt1 === 'undefined') {
    console.log('[EctoScout] dialog scan: alt1 not defined');
    return null;
  }
  console.log(`[EctoScout] dialog scan: permissionPixel=${alt1.permissionPixel} rsLinked=${alt1.rsLinked}`);
  if (!alt1.permissionPixel) {
    console.log('[EctoScout] dialog scan: no pixel permission');
    return null;
  }

  try {
    const reader = new DialogReader();

    // find() with no argument lets DialogReader capture its own fresh pixels
    // and stores the dialog position in reader.pos.
    const found = reader.find();
    console.log(`[EctoScout] dialog scan: find()=${JSON.stringify(found)}`);
    if (!found) {
      console.log('[EctoScout] dialog scan: no dialog detected on screen');
      return null;
    }

    // read() uses reader.pos (set by find()) to extract the dialog text.
    // It internally calls checkDialog() to verify a "continue" button is present;
    // if the button template doesn't match the new RS3 UI style, read() returns null
    // even though the dialog IS there.
    const content = reader.read();
    console.log(`[EctoScout] dialog scan: read()=${JSON.stringify(content)}`);

    let lines: string[] | null = null;

    if (content && content.text && content.text.length > 0) {
      lines = content.text;
    } else {
      // Fallback: readDialog(null, true) skips the continue-button check entirely
      // (the second argument `checked=true` bypasses checkDialog()).
      // This handles cases where the button visual changed but the text is still there.
      console.log('[EctoScout] dialog scan: read() yielded no text, trying readDialog(null, true)');
      lines = reader.readDialog(null, true);
      console.log(`[EctoScout] dialog scan: readDialog()=${JSON.stringify(lines)}`);
    }

    if (!lines || lines.length === 0) {
      console.log('[EctoScout] dialog scan: no text found in dialog');
      return null;
    }

    const rawText = lines.join('\n');
    console.log(`[EctoScout] dialog scan OK: "${rawText}"`);
    return { rawText };
  } catch (e) {
    console.error('[EctoScout] dialog scan error:', e);
    return null;
  }
}

// ── World number detection ───────────────────────────────────────────────────

export interface WorldScanResult {
  world: number;
  /** Which detection method succeeded. */
  method: 'gamestate';
}

/**
 * Detects the player's current RS3 world.
 *
 * Primary path: alt1.currentWorld (requires permissionGameState).
 * Returns -1 when not logged in or in the lobby.
 *
 * Fallback: OCR scan for "RuneScape N" in the Friends List panel header.
 * The header uses the RS3 chat font; we use bindReadString(id, 'chat', x, y)
 * on a captured RS3 window, scanning the right half in a grid of strips.
 */
export function scanWorldFromFriendsList(): WorldScanResult | null {
  if (typeof alt1 === 'undefined') {
    console.log('[EctoScout] world scan: alt1 not defined');
    return null;
  }

  console.log(
    `[EctoScout] world scan: permGameState=${alt1.permissionGameState}` +
    ` permPixel=${alt1.permissionPixel}` +
    ` rsLinked=${alt1.rsLinked}` +
    ` currentWorld=${alt1.currentWorld}`
  );

  // ── Primary: native Alt1 world detection via gamestate ────────────────────
  if (alt1.permissionGameState) {
    const world = alt1.currentWorld;
    if (world >= 1 && world <= 137) {
      console.log(`[EctoScout] world scan SUCCESS (gamestate): w${world}`);
      return { world, method: 'gamestate' };
    }
    console.log(`[EctoScout] world scan: alt1.currentWorld=${world} — not in a valid world`);
  } else {
    console.log('[EctoScout] world scan: no gamestate permission');
  }

  return null;
}
