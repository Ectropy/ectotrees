import { test, expect, type Page } from '@playwright/test';

// World 1 is a P2P world guaranteed to exist in worlds.json
const W = 1;

test.beforeEach(async ({ page }) => {
  // Clear localStorage before each test so state doesn't bleed between tests.
  // addInitScript runs before the page loads, so React never sees stale data.
  // showBrowseOnStartup defaults to true, so explicitly disable it so tests
  // start on the grid instead of the session browser.
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('evilTree_settings', JSON.stringify({ showBrowseOnStartup: false }));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lightning health caps
// ─────────────────────────────────────────────────────────────────────────────

test('lightning cap: alive tree at 11 min auto-reduces health to 50%', async ({ page }) => {
  await page.addInitScript(() => {
    const matureAt = Date.now() - 11 * 60 * 1000;
    localStorage.setItem('evilTree_worldStates', JSON.stringify({
      1: { treeStatus: 'alive', matureAt, treeHealth: 80 },
    }));
  });

  await page.goto('/');
  const card = page.getByTestId(`world-card-${W}`);
  await expect(card).toContainText('50%');
});

// ─────────────────────────────────────────────────────────────────────────────
// Grid
// ─────────────────────────────────────────────────────────────────────────────

test('grid renders world cards', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId(`world-card-${W}`)).toBeVisible();
  // All 137 worlds should render
  const count = await page.locator('[data-testid^="world-card-"]').count();
  expect(count).toBeGreaterThan(100);
});

// ─────────────────────────────────────────────────────────────────────────────
// Spawn timer
// ─────────────────────────────────────────────────────────────────────────────

test('spawn timer: sets a timer and card shows countdown', async ({ page }) => {
  await page.goto('/');
  const card = page.getByTestId(`world-card-${W}`);

  // Open the spawn timer view
  await card.getByTitle('Set spawn timer').click();
  await expect(page.locator('h1').last()).toContainText('Set Spawn Timer');

  // Default is 0h 30m — no changes needed, submit button is already enabled
  await page.getByRole('button', { name: 'Set Timer' }).click();

  // Back on grid: card should show a spawn countdown
  await expect(card).toContainText('Next:');
});

// ─────────────────────────────────────────────────────────────────────────────
// Tree info
// ─────────────────────────────────────────────────────────────────────────────

test('tree info: record an oak and card shows tree status', async ({ page }) => {
  await page.goto('/');
  const card = page.getByTestId(`world-card-${W}`);

  // Open tree info view
  await card.getByTitle('Set tree info').click();
  await expect(page.locator('h1').last()).toContainText('Tree Info');

  // Select tree type via combobox: type to filter, then click the option
  const typeInput = page.getByPlaceholder('Select or type a tree type');
  await typeInput.fill('oak');
  await page.getByRole('option', { name: 'Oak' }).click();

  // Select a location hint via combobox (required). This hint has exactly one
  // location so exact location is auto-filled.
  const hintInput = page.getByPlaceholder('Select or type a location hint');
  await hintInput.fill('yew trees');
  await page.getByRole('option', { name: /yew trees/i }).click();

  await page.getByRole('button', { name: 'Confirm' }).click();

  // Back on grid: card should show the oak tree label
  await expect(card).toContainText('Oak');
});

// ─────────────────────────────────────────────────────────────────────────────
// Mark dead
// ─────────────────────────────────────────────────────────────────────────────

test('mark dead: confirm dead and card shows RIP', async ({ page }) => {
  await page.goto('/');
  const card = page.getByTestId(`world-card-${W}`);

  // Open the dead-confirmation view
  await card.getByTitle('Mark tree as dead').click();
  await expect(page.getByText('Confirm: Tree is dead?')).toBeVisible();

  // Confirm
  await page.getByRole('button', { name: 'Confirm Dead' }).click();

  // Back on grid: card shows R.I.P.
  await expect(card).toContainText('R.I.P.');
});

// ─────────────────────────────────────────────────────────────────────────────
// Performance: all worlds dead (spark effect on every card)
// ─────────────────────────────────────────────────────────────────────────────

test('perf: all 137 worlds dead — grid renders and stays responsive', async ({ page }) => {
  await page.addInitScript(() => {
    const ids = [1,2,3,4,5,6,7,8,9,10,11,12,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,91,92,94,96,97,98,99,100,101,102,103,104,105,106,108,114,115,116,117,118,119,120,121,122,123,124,134,135,136,137,138,139,140,141,210,215,225,236,239,245,249,250,251,252,255,256,257,258,259];
    const deadAt = Date.now() - 60_000; // 1 minute ago — still in reward window
    const state: Record<number, object> = {};
    for (const id of ids) state[id] = { treeStatus: 'dead', deadAt };
    localStorage.setItem('evilTree_worldStates', JSON.stringify(state));
  });

  await page.goto('/');

  // All 137 cards should render
  const cards = page.locator('[data-testid^="world-card-"]');
  await expect(cards).toHaveCount(137);

  // Spot-check: a card shows the dead state label
  await expect(page.getByTestId('world-card-1')).toContainText('R.I.P.');

  // Let sparks animate for 3 seconds — if GSAP or the DOM blows up,
  // the page will error and the next assertion will fail.
  await page.waitForTimeout(3000);

  // Grid must still be fully intact after animation
  await expect(cards).toHaveCount(137);
});

// ─────────────────────────────────────────────────────────────────────────────
// Session join via #join= hash fragment
// ─────────────────────────────────────────────────────────────────────────────

const JOIN_CODE = 'ABCD23';

test('#join= valid code: strips fragment from URL on load', async ({ page }) => {
  // URL stripping happens client-side before any WS connection — no mock needed
  await page.goto(`/#join=${JOIN_CODE}`);

  // URL must be cleaned regardless of whether the WS connection succeeds
  await expect(page).not.toHaveURL(/join=/);
});

test('#join= invalid code: URL is unchanged, no WS connection made', async ({ page }) => {
  let wsCalled = false;
  await page.routeWebSocket(/\/ws/, () => { wsCalled = true; });

  await page.goto('/#join=TOOLONG');

  // Invalid codes are silently ignored — URL left as-is, no WS attempted
  await expect(page).toHaveURL(/join=TOOLONG/);
  expect(wsCalled).toBe(false);
});

test('#join= session not found: URL is cleaned, error shown', async ({ page }) => {
  await page.routeWebSocket(/\/ws/, ws => {
    ws.onMessage(raw => {
      try {
        const msg = JSON.parse(raw as string);
        if (msg.type === 'authSession') {
          ws.send(JSON.stringify({ type: 'authError', reason: 'Session not found.', code: 'invalid' }));
        }
      } catch { /* ignore */ }
    });
  });

  await page.goto(`/#join=${JOIN_CODE}`);

  // URL is cleaned even when the session is not found
  await expect(page).not.toHaveURL(/join=/);

  // Error message is shown in the session bar
  await expect(page.locator('text=Session not found.')).toBeVisible();
});

test('#join= valid code: session code appears in bar when WS connects', async ({ page }) => {
  await page.routeWebSocket(/\/ws/, ws => {
    // Respond to client messages (ping → pong, mutations → ack)
    ws.onMessage(raw => {
      try {
        const msg = JSON.parse(raw as string);
        if (msg.type === 'authSession') {
          ws.send(JSON.stringify({ type: 'authSuccess', sessionCode: msg.code }));
          ws.send(JSON.stringify({ type: 'snapshot', worlds: {} }));
          ws.send(JSON.stringify({ type: 'clientCount', count: 1 }));
        } else if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        } else if (msg.msgId !== undefined) {
          ws.send(JSON.stringify({ type: 'ack', msgId: msg.msgId }));
        }
      } catch { /* ignore malformed */ }
    });
  });

  await page.goto(`/#join=${JOIN_CODE}`);

  // With no local world data and an empty server snapshot there is nothing to
  // compare, so the preview screen is skipped and the join is confirmed
  // automatically.  The app navigates to SessionView — wait for its heading.
  await expect(page.locator('h1').last()).toContainText('Session');
  // The session code is displayed in SessionView
  await expect(page.locator(`text=${JOIN_CODE}`).first()).toBeVisible();
});

// ─────────────────────────────────────────────────────────────────────────────
// Join input: paste validation
// ─────────────────────────────────────────────────────────────────────────────

test('join input: URL without a valid fragment is truncated and shows error', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Join a Session' }).click();
  const input = page.getByPlaceholder('Join code or link');

  // extractSessionCode returns the uppercased raw value for URLs without a
  // matching #join= or #identity= fragment.  The handler truncates anything
  // over 12 chars to the first 12 characters.
  await input.fill('http://localhost:8080');

  await expect(input).toHaveValue('HTTP://LOCAL');
  await expect(page.locator('text=Not a valid code or link')).toBeVisible();
});

test('join input: string longer than 12 chars is truncated and shows error', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Join a Session' }).click();
  const input = page.getByPlaceholder('Join code or link');

  await input.fill('ABCDEFGHIJKLMNO'); // 15 chars — not a valid code (6) or token (12)

  await expect(input).toHaveValue('ABCDEFGHIJKL'); // truncated to 12
  await expect(page.locator('text=Not a valid code or link')).toBeVisible();
});

test('join input: full URL with valid #join= extracts the code', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Join a Session' }).click();
  const input = page.getByPlaceholder('Join code or link');

  await input.fill('http://localhost:5173/#join=ABCD23');

  await expect(input).toHaveValue('ABCD23');
  await expect(page.locator('text=Not a valid code or link')).not.toBeVisible();
});

test('join input: plain 6-char code is accepted without modification', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Join a Session' }).click();
  const input = page.getByPlaceholder('Join code or link');

  await input.fill('ABCD23');

  await expect(input).toHaveValue('ABCD23');
  await expect(page.locator('text=Not a valid code or link')).not.toBeVisible();
});

// ─────────────────────────────────────────────────────────────────────────────
// World detail view
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// WebSocket race condition regressions
// ─────────────────────────────────────────────────────────────────────────────

test('ws race: mutations are queued until snapshot arrives (no double-send)', async ({ page }) => {
  // Pre-populate localStorage so the app has world state and auto-resumes a session
  await page.addInitScript(() => {
    localStorage.setItem('evilTree_sessionCode', 'ABCD23');
    localStorage.setItem('evilTree_worldStates', JSON.stringify({
      1: { treeStatus: 'alive', matureAt: Date.now() - 5 * 60 * 1000 },
    }));
  });

  // Track all messages from the client; send authSuccess but withhold snapshot
  const clientMessages: { type: string; msgId?: number }[] = [];
  let sendSnapshot: (() => void) | null = null;

  await page.routeWebSocket(/\/ws/, ws => {
    ws.onMessage(raw => {
      try {
        const msg = JSON.parse(raw as string);
        clientMessages.push(msg);
        if (msg.type === 'authSession') {
          ws.send(JSON.stringify({ type: 'authSuccess', sessionCode: msg.code }));
          // Deliberately do NOT send snapshot yet — expose the pre-snapshot window
          sendSnapshot = () => {
            ws.send(JSON.stringify({
              type: 'snapshot',
              worlds: { 1: { treeStatus: 'alive', matureAt: Date.now() - 5 * 60 * 1000 } },
            }));
          };
        } else if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        } else if (msg.msgId !== undefined) {
          ws.send(JSON.stringify({ type: 'ack', msgId: msg.msgId }));
        }
      } catch { /* ignore */ }
    });
  });

  await page.goto('/');

  // Wait for WS to connect and auth to complete (authSession should be in messages)
  await expect.poll(() => clientMessages.some(m => m.type === 'authSession')).toBe(true);

  // Trigger a mutation while snapshot hasn't arrived: mark world 1 dead
  const card = page.getByTestId('world-card-1');
  await card.getByTitle('Mark tree as dead').click();
  await page.getByRole('button', { name: 'Confirm Dead' }).click();

  // Give the client a moment to send the mutation (if it incorrectly did)
  await page.waitForTimeout(200);

  // The mutation should NOT have been sent yet — only auth messages
  const preMutations = clientMessages.filter(m => m.type === 'markDead');
  expect(preMutations).toHaveLength(0);

  // Now send the snapshot — this should trigger replayPendingMutations
  sendSnapshot!();

  // The mutation should now arrive
  await expect.poll(() => clientMessages.filter(m => m.type === 'markDead').length).toBe(1);
});

test('ws race: authError on join surfaces error message', async ({ page }) => {
  await page.routeWebSocket(/\/ws/, ws => {
    ws.onMessage(raw => {
      try {
        const msg = JSON.parse(raw as string);
        if (msg.type === 'authSession') {
          ws.send(JSON.stringify({
            type: 'authError',
            reason: 'This is a private session. You need an invite link to join.',
            code: 'banned',
          }));
        }
      } catch { /* ignore */ }
    });
  });

  await page.goto('/');

  // Open the SessionBrowserView and submit a code
  await page.getByRole('button', { name: 'Join a Session' }).click();
  const input = page.getByPlaceholder('Join code or link');
  await input.fill(JOIN_CODE);
  // Auto-trigger fires after ~100ms and attempts the join — no button click needed

  // The authError reason should be visible — rendered in both SessionBar and
  // the sidebar session browser since the shell stays mounted in all modes
  await expect(page.locator('text=This is a private session').first()).toBeVisible();
});

// ─────────────────────────────────────────────────────────────────────────────
// Tree info: lightning preset
// ─────────────────────────────────────────────────────────────────────────────

test('tree info: 50% lightning button stays highlighted after clicking', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId(`world-card-${W}`).getByTitle('Set tree info').click();
  await expect(page.locator('h1').last()).toContainText('Tree Info');

  const lightningBtn = page.getByRole('button', { name: /Report 50% lightning strike/i });
  await lightningBtn.click();

  // Button must remain highlighted (gets ring-2 class when selectedLightning matches)
  await expect(lightningBtn).toHaveClass(/ring-2/);
});

test('tree info: submitting 50% lightning preset records 50% health and backdates the timer', async ({ page }) => {
  await page.goto('/');
  const card = page.getByTestId(`world-card-${W}`);

  await card.getByTitle('Set tree info').click();

  const typeInput = page.getByPlaceholder('Select or type a tree type');
  await typeInput.fill('oak');
  await page.getByRole('option', { name: 'Oak' }).click();

  const hintInput = page.getByPlaceholder('Select or type a location hint');
  await hintInput.fill('yew trees');
  await page.getByRole('option', { name: /yew trees/i }).click();

  await page.getByRole('button', { name: /Report 50% lightning strike/i }).click();
  await page.getByRole('button', { name: 'Confirm' }).click();

  // Card must show 50% health and a backdated timer (well under the base 30 min)
  await expect(card).toContainText('50%');
  await expect(card).not.toContainText('~30m or less');
});

test('tree info: submitting 25% lightning preset records 25% health and backdates the timer', async ({ page }) => {
  await page.goto('/');
  const card = page.getByTestId(`world-card-${W}`);

  await card.getByTitle('Set tree info').click();

  const typeInput = page.getByPlaceholder('Select or type a tree type');
  await typeInput.fill('oak');
  await page.getByRole('option', { name: 'Oak' }).click();

  const hintInput = page.getByPlaceholder('Select or type a location hint');
  await hintInput.fill('yew trees');
  await page.getByRole('option', { name: /yew trees/i }).click();

  await page.getByRole('button', { name: /Report 25% lightning strike/i }).click();
  await page.getByRole('button', { name: 'Confirm' }).click();

  // Card must show 25% health and a backdated timer (well under the base 30 min)
  await expect(card).toContainText('25%');
  await expect(card).not.toContainText('~30m or less');
});

test('lightning preset state: 50% health shows ~20 min death timer', async ({ page }) => {
  await page.addInitScript(() => {
    const LIGHTNING_1_MS = 10 * 60 * 1000;
    // 30-second buffer keeps the minute counter stable throughout test execution
    const matureAt = Date.now() - LIGHTNING_1_MS + 30_000;
    localStorage.setItem('evilTree_worldStates', JSON.stringify({
      1: { treeStatus: 'alive', matureAt, treeHealth: 50 },
    }));
  });
  await page.goto('/');
  const card = page.getByTestId('world-card-1');
  await expect(card).toContainText('50%');
  await expect(card).toContainText('~20m or less');
});

test('lightning preset state: 25% health shows ~10 min death timer', async ({ page }) => {
  await page.addInitScript(() => {
    const LIGHTNING_2_MS = 20 * 60 * 1000;
    // 30-second buffer keeps the minute counter stable throughout test execution
    const matureAt = Date.now() - LIGHTNING_2_MS + 30_000;
    localStorage.setItem('evilTree_worldStates', JSON.stringify({
      1: { treeStatus: 'alive', matureAt, treeHealth: 25 },
    }));
  });
  await page.goto('/');
  const card = page.getByTestId('world-card-1');
  await expect(card).toContainText('25%');
  await expect(card).toContainText('~10m or less');
});

// ─────────────────────────────────────────────────────────────────────────────
// World detail view
// ─────────────────────────────────────────────────────────────────────────────

test('detail view: opens world status and back returns to grid', async ({ page }) => {
  await page.goto('/');

  // Click the "w1" label — it's inside the card div but not a button, so the
  // card's onClick fires and opens WorldDetailView
  await page.getByTestId(`world-card-${W}`).getByText(`w${W}`).click();

  // WorldDetailView heading is "World Status" (world ID is in the subtitle)
  await expect(page.locator('h1').last()).toContainText('World Status');

  // Navigate back (second "Close" button — the in-view one, not the toolbar X)
  await page.getByRole('button', { name: 'Close' }).nth(1).click();

  // Grid is visible again
  await expect(page.getByTestId(`world-card-${W}`)).toBeVisible();
});

// ─────────────────────────────────────────────────────────────────────────────
// Session leave confirmation panel
// ─────────────────────────────────────────────────────────────────────────────

const PERSONAL_TOKEN = 'AABBCCDDEEFF12';

/**
 * Seeds localStorage with a session code so the app auto-resumes the session
 * on page load (bypasses the preview flow entirely).  Sets up a WS mock that
 * responds to authSession with authSuccess + snapshot + clientCount.
 * If `sendIdentityToken` is true, also sends an identityToken message after
 * auth — simulating the "Link with Alt1" personal-token flow.
 * Returns with SessionView open and ready for interaction.
 */
async function openConnectedAnonSessionView(page: Page, { sendIdentityToken = false } = {}) {
  // addInitScript runs after beforeEach (which clears localStorage), so setting
  // the session code here makes the app auto-resume on load without a preview.
  await page.addInitScript((code) => {
    localStorage.setItem('evilTree_sessionCode', code);
  }, JOIN_CODE);

  await page.routeWebSocket(/\/ws/, ws => {
    ws.onMessage(raw => {
      try {
        const msg = JSON.parse(raw as string);
        if (msg.type === 'authSession') {
          ws.send(JSON.stringify({ type: 'authSuccess', sessionCode: msg.code }));
          ws.send(JSON.stringify({ type: 'snapshot', worlds: {} }));
          ws.send(JSON.stringify({ type: 'clientCount', count: 1 }));
          if (sendIdentityToken) {
            ws.send(JSON.stringify({ type: 'identityToken', token: PERSONAL_TOKEN }));
          }
        } else if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        } else if (msg.msgId !== undefined) {
          ws.send(JSON.stringify({ type: 'ack', msgId: msg.msgId }));
        }
      } catch { /* ignore malformed */ }
    });
  });

  await page.goto('/');
  await expect(page.getByRole('button', { name: JOIN_CODE })).toBeVisible();

  // Open the session panel by clicking the code button in the session bar
  await page.getByRole('button', { name: JOIN_CODE }).click();
  await expect(page.locator('h1').last()).toContainText('Session');
}

test('leave panel: anon session without identity token shows session join link', async ({ page }) => {
  await openConnectedAnonSessionView(page);

  // Click "Leave Session" in idle state → enters confirming state
  await page.getByRole('button', { name: 'Leave Session' }).click();

  // Confirming panel: correct title and body text
  await expect(page.locator('text=Leave session?')).toBeVisible();
  await expect(page.locator('text=Save this link to rejoin this session later.')).toBeVisible();
  await expect(page.getByText('Session link', { exact: true })).toBeVisible();

  // The link input is readonly — select it specifically to avoid strict-mode
  // violations from other text inputs on the page
  const linkInput = page.locator('input[readonly]');
  await expect(linkInput).toHaveValue(new RegExp(`#join=${JOIN_CODE}`));
});

test('leave panel: anon session with identity token shows personal identity link', async ({ page }) => {
  await openConnectedAnonSessionView(page, { sendIdentityToken: true });

  await page.getByRole('button', { name: 'Leave Session' }).click();

  await expect(page.locator('text=Leave session?')).toBeVisible();
  await expect(page.locator('text=Save your personal link to rejoin as the same person later.')).toBeVisible();
  await expect(page.getByText('Your personal link', { exact: true })).toBeVisible();

  // The link input is readonly — select it specifically to avoid strict-mode
  // violations from other text inputs on the page
  const linkInput = page.locator('input[readonly]');
  await expect(linkInput).toHaveValue(new RegExp(`#identity=${PERSONAL_TOKEN}`));
});

test('leave panel: cancel resets from confirming back to idle state', async ({ page }) => {
  await openConnectedAnonSessionView(page);

  // Enter confirming state
  await page.getByRole('button', { name: 'Leave Session' }).click();
  await expect(page.locator('text=Leave session?')).toBeVisible();

  // Cancel — should return to idle (confirming panel disappears)
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('text=Leave session?')).not.toBeVisible();

  // Idle state shows "Leave Session" button again
  await expect(page.getByRole('button', { name: 'Leave Session' })).toBeVisible();
});

test('leave panel: confirming leave disconnects the session', async ({ page }) => {
  let wsClosed = false;
  await page.addInitScript((code) => {
    localStorage.setItem('evilTree_sessionCode', code);
  }, JOIN_CODE);
  await page.routeWebSocket(/\/ws/, ws => {
    ws.onMessage(raw => {
      try {
        const msg = JSON.parse(raw as string);
        if (msg.type === 'authSession') {
          ws.send(JSON.stringify({ type: 'authSuccess', sessionCode: msg.code }));
          ws.send(JSON.stringify({ type: 'snapshot', worlds: {} }));
          ws.send(JSON.stringify({ type: 'clientCount', count: 1 }));
        } else if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        } else if (msg.msgId !== undefined) {
          ws.send(JSON.stringify({ type: 'ack', msgId: msg.msgId }));
        }
      } catch { /* ignore malformed */ }
    });
    ws.onClose(() => { wsClosed = true; });
  });

  await page.goto('/');
  await expect(page.getByRole('button', { name: JOIN_CODE })).toBeVisible();
  await page.getByRole('button', { name: JOIN_CODE }).click();
  await expect(page.locator('h1').last()).toContainText('Session');

  // Enter confirming state, then click Leave Session
  await page.getByRole('button', { name: 'Leave Session' }).click();
  await expect(page.locator('text=Leave session?')).toBeVisible();
  await page.getByRole('button', { name: 'Leave Session' }).click();

  // After leaving, the fullscreen view switches to SessionBrowserView (session
  // code is null so App.tsx renders the browser instead of SessionView).
  // The WS is also closed by this point.
  await expect(page.locator('h1').last()).toContainText('Sessions');
  expect(wsClosed).toBe(true);
});

test('leave panel: managed owner session shows owner warning with identity link', async ({ page }) => {
  await page.addInitScript((token) => {
    localStorage.setItem('evilTree_sessionCode', 'ABCD23');
    localStorage.setItem('evilTree_identityToken', token);
  }, PERSONAL_TOKEN);

  await page.routeWebSocket(/\/ws/, ws => {
    ws.onMessage(raw => {
      try {
        const msg = JSON.parse(raw as string);
        if (msg.type === 'authIdentity') {
          ws.send(JSON.stringify({ type: 'authSuccess', sessionCode: 'ABCD23', managed: true }));
          ws.send(JSON.stringify({ type: 'snapshot', worlds: {} }));
          ws.send(JSON.stringify({ type: 'clientCount', count: 1 }));
          // identity message sets the member's name and role for this managed session
          ws.send(JSON.stringify({ type: 'identity', name: 'Ectropy', role: 'owner' }));
        } else if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        } else if (msg.msgId !== undefined) {
          ws.send(JSON.stringify({ type: 'ack', msgId: msg.msgId }));
        }
      } catch { /* ignore malformed */ }
    });
  });

  await page.goto('/');

  // Session auto-resumes from localStorage — wait for the code button to appear
  await expect(page.getByRole('button', { name: 'ABCD23' })).toBeVisible();
  await page.getByRole('button', { name: 'ABCD23' }).click();
  await expect(page.locator('h1').last()).toContainText('Session');

  // Enter confirming state
  await page.getByRole('button', { name: 'Leave Session' }).click();

  await expect(page.locator('text=Leave managed session?')).toBeVisible();
  await expect(page.locator("text=You're the owner of this session!")).toBeVisible();
  await expect(page.getByText('Your personal link', { exact: true })).toBeVisible();

  const linkInput = page.locator('input[readonly]');
  await expect(linkInput).toHaveValue(new RegExp(`#identity=${PERSONAL_TOKEN}`));
});
