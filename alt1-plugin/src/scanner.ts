/**
 * Screen scanning utilities using Alt1's built-in readers.
 */

import 'alt1/base';
import * as A1lib from 'alt1/base';
import { isActiveWorldId } from '@shared/worlds';
import boxtlUrl from './dialog-templates/boxtl.png?inline';
import boxtrUrl from './dialog-templates/boxtr.png?inline';

// DialogReader is the pre-built RS3 NPC dialog reader.
// Vite 8's Rolldown CJS interop wraps modules that already declare
// `__esModule: true` (alt1/* UMD bundles) as `{ default: <exports> }` — so
// the class actually lives at `<import>.default`, one level deeper than
// TypeScript's types claim. The `?? _DialogReader` fallback keeps the code
// working if a future Rolldown release stops double-wrapping.
import _DialogReader from 'alt1/dialog';
const DialogReader: typeof _DialogReader =
  (_DialogReader as unknown as { default?: typeof _DialogReader }).default ?? _DialogReader;

// ── Dialog box detection ────────────────────────────────────────────────────

// alt1 0.1.3's DialogReader.find() no longer matches the RS3 dialog frame: the
// outer corner pixels changed colour and the box grew 2px wider, so its corner
// templates miss and its fixed 492px corner spacing is off. These templates are
// alt1's (same alpha masks) recoloured from a live capture of the current frame.
const DIALOG_CORNER_OFFSET = 494;

let dialogTemplates: { boxtl: ImageData; boxtr: ImageData } | null = null;
Promise.all([A1lib.imageDataFromUrl(boxtlUrl), A1lib.imageDataFromUrl(boxtrUrl)])
  .then(([boxtl, boxtr]) => { dialogTemplates = { boxtl, boxtr }; })
  .catch(e => console.error('[EctoScout] failed to load dialog templates:', e));

/**
 * Locates the NPC dialog box and stores it in `reader.pos`.
 *
 * Tries alt1's own find() first, so a fixed upstream release (and the legacy
 * interface, which it still handles) takes precedence, then falls back to the
 * templates above.
 */
export function findDialog(
  reader: InstanceType<typeof DialogReader>,
  img: A1lib.ImgRef = A1lib.captureHoldFullRs(),
): boolean {
  if (reader.find(img)) return true;
  if (!dialogTemplates) return false;

  for (const p of img.findSubimage(dialogTemplates.boxtl)) {
    if (img.findSubimage(dialogTemplates.boxtr, p.x + DIALOG_CORNER_OFFSET, p.y, 16, 16).length === 0) continue;
    // alt1 uses x + 1; the extra pixel keeps its fixed 506px text layout
    // centred in the wider box. At x + 1 the short last line of the timer
    // dialog ("and 47 minutes.") is dropped.
    reader.pos = { x: p.x + 2, y: p.y + 1, width: 506, height: 130, legacy: false };
    return true;
  }
  return false;
}

// ── Spirit Tree dialog ──────────────────────────────────────────────────────

export interface DialogScanResult {
  rawText: string;
}

/**
 * Scans for an open RS3 NPC dialog box and returns its body text.
 *
 * The box is located on one fresh full-window capture; read() and readDialog()
 * are then called without an image so each takes its own fresh capture of
 * just the dialog — this avoids stale-capture issues with ImgRefBind.
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

    const found = findDialog(reader);
    console.log(`[EctoScout] dialog scan: find()=${JSON.stringify(found && reader.pos)}`);
    if (!found) {
      console.log('[EctoScout] dialog scan: no dialog detected on screen');
      return null;
    }

    // read() uses reader.pos (set by findDialog()) to extract the dialog text.
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
    if (isActiveWorldId(world)) {
      console.log(`[EctoScout] world scan SUCCESS (gamestate): w${world}`);
      return { world, method: 'gamestate' };
    }
    console.log(`[EctoScout] world scan: alt1.currentWorld=${world} — not in a valid world`);
  } else {
    console.log('[EctoScout] world scan: no gamestate permission');
  }

  return null;
}
