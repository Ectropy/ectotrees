/**
 * Ectotrees Scout — Alt1 Plugin entry point.
 * Wires the UI, session, scanner, and parser together.
 */

import './styles.css';
import 'alt1/base';

import { EctoSession, type SessionStatus } from './session';
import { scanSpiritTreeDialog, scanWorldFromFriendsList } from './scanner';
import { parseSpawnTime, parseHint, msToHoursMinutes } from './parser';

// ── Alt1 identification ─────────────────────────────────────────────────────

// Tell Alt1 which app this is (required for permission management)
if (typeof alt1 !== 'undefined') {
  alt1.identifyAppUrl('./appconfig.json');
}

// ── Element refs ────────────────────────────────────────────────────────────

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const elNoAlt1      = $<HTMLDivElement>('no-alt1');
const elApp         = $<HTMLDivElement>('app');
const elInstallLink = $<HTMLAnchorElement>('install-link');
const elErrorBanner = $<HTMLDivElement>('error-banner');

const elSessionCode  = $<HTMLInputElement>('session-code');
const elBtnJoin      = $<HTMLButtonElement>('btn-join');
const elBtnCreate    = $<HTMLButtonElement>('btn-create');
const elBtnLeave     = $<HTMLButtonElement>('btn-leave');
const elStatusDot    = $<HTMLSpanElement>('status-dot');
const elStatusLabel  = $<HTMLSpanElement>('status-label');

const elWorldInput    = $<HTMLInputElement>('world-input');
const elBtnScanWorld  = $<HTMLButtonElement>('btn-scan-world');
const elWorldDetected = $<HTMLSpanElement>('world-detected');

const elHoursInput   = $<HTMLInputElement>('hours-input');
const elMinutesInput = $<HTMLInputElement>('minutes-input');
const elHintInput    = $<HTMLInputElement>('hint-input');

const elBtnScan    = $<HTMLButtonElement>('btn-scan');
const elScanStatus = $<HTMLDivElement>('scan-status');

const elBtnSubmit = $<HTMLButtonElement>('btn-submit');
const elBtnClear  = $<HTMLButtonElement>('btn-clear');

// ── Session ─────────────────────────────────────────────────────────────────

const session = new EctoSession();

// ── UI state ─────────────────────────────────────────────────────────────────

/** True while a submit is pending ACK (prevents double-submit) */
let submitting = false;

// ── Helpers ──────────────────────────────────────────────────────────────────

function getWorldId(): number | null {
  const v = parseInt(elWorldInput.value.trim(), 10);
  return Number.isFinite(v) && v >= 1 && v <= 137 ? v : null;
}

function getTotalMs(): number {
  const h = parseInt(elHoursInput.value || '0', 10) || 0;
  const m = parseInt(elMinutesInput.value || '0', 10) || 0;
  return (h * 60 + m) * 60_000;
}

function setScanStatus(msg: string, kind: 'ok' | 'warn' | 'error' | '' = '') {
  elScanStatus.textContent = msg;
  elScanStatus.className = `scan-status${kind ? ' ' + kind : ''}`;
}

function setErrorBanner(msg: string | null) {
  if (msg) {
    elErrorBanner.textContent = msg;
    elErrorBanner.style.display = '';
  } else {
    elErrorBanner.style.display = 'none';
    elErrorBanner.textContent = '';
  }
}

function updateSubmitButton() {
  const hasWorld   = getWorldId() !== null;
  const hasTime    = getTotalMs() > 0;
  const hasSession = session.status !== 'disconnected';
  elBtnSubmit.disabled = !hasWorld || !hasTime || !hasSession || submitting;
}

// ── Session UI ────────────────────────────────────────────────────────────────

function updateSessionUI(status: SessionStatus) {
  const connected = status === 'connected';
  const connecting = status === 'connecting';

  // Status dot
  elStatusDot.className = `status-dot ${status}`;

  // Status label
  if (connected) {
    const count = session.clientCount;
    elStatusLabel.textContent = `${session.code} · ${count} scout${count !== 1 ? 's' : ''}`;
  } else if (connecting) {
    elStatusLabel.textContent = 'Connecting…';
  } else {
    elStatusLabel.textContent = 'Disconnected';
  }

  // Show/hide Leave button; disable/enable Join & Create
  elBtnLeave.style.display = connected || connecting ? '' : 'none';
  elBtnJoin.disabled   = connected || connecting;
  elBtnCreate.disabled = connected || connecting;

  // Pre-fill code field if we have a code
  if (session.code && !elSessionCode.value) {
    elSessionCode.value = session.code;
  }

  updateSubmitButton();
}

// ── Event: session status changes ─────────────────────────────────────────────

session.on('statusChange', (status) => {
  updateSessionUI(status);
});

session.on('clientCount', () => {
  updateSessionUI(session.status);
});

session.on('codeChange', (code) => {
  if (code) elSessionCode.value = code;
  updateSessionUI(session.status);
});

session.on('error', (msg) => {
  setErrorBanner(msg);
  updateSessionUI(session.status);
});

// ── Helpers: session code input ───────────────────────────────────────────────

function extractSessionCode(raw: string): string {
  try {
    const url = new URL(raw.trim());
    const param = url.searchParams.get('join');
    if (param) return param.toUpperCase();
  } catch { /* not a URL */ }
  return raw.toUpperCase();
}

// Strip URL immediately when the user pastes into the code field
elSessionCode.addEventListener('input', () => {
  const extracted = extractSessionCode(elSessionCode.value);
  // Only rewrite if extraction changed the value (i.e. a URL was pasted)
  if (extracted !== elSessionCode.value.toUpperCase()) {
    elSessionCode.value = extracted;
  }
});

// ── Event: Join button ────────────────────────────────────────────────────────

elBtnJoin.addEventListener('click', async () => {
  const code = extractSessionCode(elSessionCode.value);
  if (!/^[A-Z2-9]{6}$/.test(code)) {
    setErrorBanner('Enter a valid 6-character session code.');
    return;
  }
  elSessionCode.value = code;
  setErrorBanner(null);
  elBtnJoin.disabled = true;
  await session.joinSession(code);
  elBtnJoin.disabled = false;
});

// ── Event: Create button ──────────────────────────────────────────────────────

elBtnCreate.addEventListener('click', async () => {
  setErrorBanner(null);
  elBtnCreate.disabled = true;
  const code = await session.createSession();
  if (code) elSessionCode.value = code;
  elBtnCreate.disabled = false;
});

// ── Event: Leave button ───────────────────────────────────────────────────────

elBtnLeave.addEventListener('click', () => {
  session.leaveSession();
  setErrorBanner(null);
  updateSessionUI('disconnected');
});

// ── Event: Scan World (Friends List) ──────────────────────────────────────────

elBtnScanWorld.addEventListener('click', () => {
  if (typeof alt1 === 'undefined') {
    setScanStatus('Not running in Alt1.', 'error');
    return;
  }
  const permPixel = alt1.permissionPixel;
  const permGame  = alt1.permissionGameState;
  const linked    = alt1.rsLinked;

  if (!permPixel && !permGame) {
    setScanStatus(`No pixel/gamestate permission — grant them in Alt1 settings.`, 'error');
    return;
  }
  if (!linked) {
    setScanStatus('RS3 client not detected by Alt1 (rsLinked=false).', 'warn');
    return;
  }
  setScanStatus(`Scanning… (perm pixel=${permPixel} gamestate=${permGame})`);
  const result = scanWorldFromFriendsList();
  if (result !== null) {
    elWorldInput.value = String(result.world);
    elWorldDetected.style.display = '';
    const via = result.method === 'gamestate' ? 'via Alt1 gamestate' : 'via Friends List OCR';
    setScanStatus(`World ${result.world} detected (${via}).`, 'ok');
    updateSubmitButton();
  } else {
    elWorldDetected.style.display = 'none';
    setScanStatus(
      'Could not detect world — make sure you are logged in (not in lobby).',
      'warn'
    );
  }
});

// ── Event: Scan Spirit Tree Dialog ────────────────────────────────────────────

elBtnScan.addEventListener('click', () => {
  if (typeof alt1 === 'undefined' || !alt1.permissionPixel) {
    setScanStatus('Alt1 pixel permission required to scan.', 'error');
    return;
  }

  setScanStatus('Scanning…');
  const result = scanSpiritTreeDialog();

  if (!result) {
    setScanStatus('No dialog found — open the Spirit Tree chat first.', 'warn');
    return;
  }

  const rawText = result.rawText;
  let detected: string[] = [];

  // Try to parse a spawn time
  const ms = parseSpawnTime(rawText);
  if (ms !== null) {
    const { hours, minutes } = msToHoursMinutes(ms);
    elHoursInput.value = String(hours);
    elMinutesInput.value = String(minutes);
    detected.push(`${hours}h ${minutes}m`);
    updateSubmitButton();
  }

  // Try to parse a hint
  const hint = parseHint(rawText);
  if (hint !== null) {
    elHintInput.value = hint;
    detected.push(`"${hint.slice(0, 40)}${hint.length > 40 ? '…' : ''}"`);
  }

  if (detected.length > 0) {
    setScanStatus(`Detected: ${detected.join(' · ')}`, 'ok');
  } else {
    // Text was found but neither pattern matched — show a snippet for debugging
    const snippet = rawText.slice(0, 80).replace(/\n/g, ' ');
    setScanStatus(`Found dialog but no timer/hint: "${snippet}"`, 'warn');
  }
});

// ── Event: input changes → update submit button ───────────────────────────────

elWorldInput.addEventListener('input', updateSubmitButton);
elHoursInput.addEventListener('input', updateSubmitButton);
elMinutesInput.addEventListener('input', updateSubmitButton);

// ── Event: Submit ─────────────────────────────────────────────────────────────

elBtnSubmit.addEventListener('click', () => {
  const worldId = getWorldId();
  const msFromNow = getTotalMs();
  if (!worldId || msFromNow <= 0 || session.status === 'disconnected') return;

  const hint = elHintInput.value.trim().slice(0, 200);

  submitting = true;
  updateSubmitButton();
  setScanStatus('Submitting…');

  // Register a one-time ACK listener to confirm the server received it
  const unsubAck = session.on('ack', () => {
    unsubAck();
    submitting = false;
    setScanStatus('Submitted!', 'ok');
    // Reset data fields; keep world + session code
    elHoursInput.value = '';
    elMinutesInput.value = '';
    elHintInput.value = '';
    updateSubmitButton();
    // Clear the confirmation after 3s
    setTimeout(() => setScanStatus(''), 3000);
  });

  // Also handle if submit fails (session disconnects before ACK)
  const unsubStatus = session.on('statusChange', (status) => {
    if (status === 'disconnected' && submitting) {
      unsubStatus();
      unsubAck();
      submitting = false;
      setScanStatus('Disconnected before submit was confirmed.', 'error');
      updateSubmitButton();
    }
  });

  session.sendMutation({
    type: 'setSpawnTimer',
    worldId,
    msFromNow,
    treeInfo: hint ? { treeHint: hint } : undefined,
  });
});

// ── Event: Clear ──────────────────────────────────────────────────────────────

elBtnClear.addEventListener('click', () => {
  elHoursInput.value = '';
  elMinutesInput.value = '';
  elHintInput.value = '';
  elWorldDetected.style.display = 'none';
  setScanStatus('');
  updateSubmitButton();
});

// ── Boot ──────────────────────────────────────────────────────────────────────

function boot() {
  if (typeof alt1 === 'undefined') {
    // Not running in Alt1 — show install prompt
    elNoAlt1.style.display = '';
    elApp.style.display = 'none';

    // Construct the alt1:// install link using the current page URL
    const configUrl = new URL('./appconfig.json', window.location.href).href;
    elInstallLink.href = `alt1://addapp/${configUrl}`;
    return;
  }

  elNoAlt1.style.display = 'none';
  elApp.style.display = '';

  // Grey out the scan buttons if pixel permission is missing
  if (!alt1.permissionPixel) {
    elBtnScan.disabled = true;
    elBtnScanWorld.disabled = true;
    setScanStatus('Grant pixel permission in Alt1 settings to enable scanning.', 'warn');
  }

  // Initial UI state
  updateSessionUI(session.status);

  // Auto-resume a prior session from localStorage
  session.resume();
}

document.addEventListener('DOMContentLoaded', boot);
