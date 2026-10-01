/**
 * Screen scanning utilities using Alt1's built-in readers.
 */

import 'alt1/base';
import * as A1lib from 'alt1/base';
import * as OCR from 'alt1/ocr';
import { isActiveWorldId } from '@shared/worlds';
import boxtlUrl from './dialog-templates/boxtl.png?inline';
import boxtrUrl from './dialog-templates/boxtr.png?inline';
// alt1/dialog keeps its body-text font private and the package's `exports` map
// blocks deep imports, so the font is rebuilt from alt1's own source sheet.
import dialogFontUrl from '../node_modules/alt1/src/dialog/imgs/12pt.data.png?inline';
import dialogFontMeta from '../node_modules/alt1/src/dialog/imgs/12pt.fontmeta.json';

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

const PNG_DATA_URL_HEADER = 'data:image/png;base64,';

/**
 * Decodes an inlined PNG with its colorspace chunks stripped, so the browser
 * doesn't gamma-correct the pixels (alt1 does the same for its own images).
 * Stays on data: URLs end to end — the server CSP blocks fetch() of data: URLs
 * (connect-src) and blob: images (img-src), which rules out alt1's own
 * imageDataFromFileBuffer.
 */
export function loadPngData(dataUrl: string): Promise<ImageData> {
  const bytes = Uint8Array.from(atob(dataUrl.slice(PNG_DATA_URL_HEADER.length)), c => c.charCodeAt(0));
  A1lib.ImageDetect.clearPngColorspace(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return A1lib.imageDataFromUrl(PNG_DATA_URL_HEADER + btoa(binary));
}

let dialogTemplates: { boxtl: ImageData; boxtr: ImageData } | null = null;
Promise.all([loadPngData(boxtlUrl), loadPngData(boxtrUrl)])
  .then(([boxtl, boxtr]) => { dialogTemplates = { boxtl, boxtr }; })
  .catch(e => console.error('[EctoScout] failed to load dialog templates:', e));

let dialogFont: OCR.FontDefinition | null = null;
loadPngData(dialogFontUrl)
  .then(img => { dialogFont = OCR.loadFontImage(img, dialogFontMeta as OCR.GenerateFontMeta); })
  .catch(e => console.error('[EctoScout] failed to load dialog font:', e));

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

// ── Dialog body text ────────────────────────────────────────────────────────

// Body text sits below the 33px title bar and above the continue button.
const BODY_TOP = 33;
const BODY_HEIGHT = 80;
// Columns searched for a starting character. Left of this is the NPC portrait;
// centred text always crosses the range, and readLine() then reads outwards in
// both directions, so a line may extend past either end.
const PROBE_X_START = 140;
const PROBE_X_END = 400;
const PROBE_STEP = 12;
// Rows below the first dark row of a line where its baseline may sit: 7 with an
// ascender or capital in the probed columns, less for a run of x-height letters.
const BASELINE_MIN = 3;
const BASELINE_MAX = 8;
const TEXT_COLOR: OCR.ColortTriplet = [0, 0, 0];

/**
 * Reads the dialog's body text from `img`, one string per line, or null when
 * the font hasn't loaded or nothing was read.
 *
 * Replaces alt1's readDialog(), which looks for a starting character at only
 * three columns per line and, when the best match there is a stray glyph,
 * silently skips the line — dropping "and 47 minutes." off a timer turns it
 * into a wrong but valid-looking one. Here every candidate across the probe
 * range is read and the longest result wins.
 */
export function readDialogLines(
  img: A1lib.ImgRef,
  pos: NonNullable<InstanceType<typeof DialogReader>['pos']>,
): string[] | null {
  if (!dialogFont) return null;
  const buf = img.toData(pos.x, pos.y + BODY_TOP, pos.width, BODY_HEIGHT);

  const lines: string[] = [];
  for (let y = 0; y < buf.height; y++) {
    let hasText = false;
    for (let x = PROBE_X_START; x < PROBE_X_END; x++) {
      const i = (x + y * buf.width) * 4;
      if (buf.data[i] + buf.data[i + 1] + buf.data[i + 2] < 50) { hasText = true; break; }
    }
    if (!hasText) continue;

    let best: { text: string; y: number } | null = null;
    for (let x = PROBE_X_START; x < PROBE_X_END; x += PROBE_STEP) {
      const chr = OCR.findChar(buf, dialogFont, TEXT_COLOR, x, y + BASELINE_MIN, PROBE_STEP, BASELINE_MAX - BASELINE_MIN + 1);
      if (!chr) continue;
      const { text } = OCR.readLine(buf, dialogFont, TEXT_COLOR, chr.x, chr.y, true, true);
      if (!best || text.length > best.text.length) best = { text, y: chr.y };
    }
    if (best && best.text.length >= 3) {
      lines.push(best.text);
      y = best.y + 5; // past this line's descenders
    }
  }
  return lines.length > 0 ? lines : null;
}

// ── Spirit Tree dialog ──────────────────────────────────────────────────────

export interface DialogScanResult {
  rawText: string;
}

/**
 * Scans for an open RS3 NPC dialog box and returns its body text.
 *
 * The box is located and its text read from one fresh full-window capture.
 * alt1's own reader is the fallback; its read() and readDialog() are called
 * without an image so each takes its own fresh capture of just the dialog.
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

    const img = A1lib.captureHoldFullRs();
    const found = findDialog(reader, img);
    console.log(`[EctoScout] dialog scan: find()=${JSON.stringify(found && reader.pos)}`);
    if (!found || !reader.pos) {
      console.log('[EctoScout] dialog scan: no dialog detected on screen');
      return null;
    }

    let lines = readDialogLines(img, reader.pos);
    console.log(`[EctoScout] dialog scan: readDialogLines()=${JSON.stringify(lines)}`);

    if (!lines) {
      // alt1's read() checks for a "continue" button first and returns null
      // without one; readDialog(null, true) skips that check.
      const content = reader.read();
      console.log(`[EctoScout] dialog scan: read()=${JSON.stringify(content)}`);
      lines = content && content.text && content.text.length > 0
        ? content.text
        : reader.readDialog(null, true);
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
