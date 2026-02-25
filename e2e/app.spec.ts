import { test, expect } from '@playwright/test';

// World 1 is a P2P world guaranteed to exist in worlds.json
const W = 1;

test.beforeEach(async ({ page }) => {
  // Clear localStorage before each test so state doesn't bleed between tests.
  // addInitScript runs before the page loads, so React never sees stale data.
  await page.addInitScript(() => localStorage.clear());
});

// ─────────────────────────────────────────────────────────────────────────────
// Lightning health caps
// ─────────────────────────────────────────────────────────────────────────────

test('lightning cap: alive tree at 11 min auto-reduces health to 50%', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
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
  await expect(page.locator('h1')).toContainText('Set Spawn Timer');

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
  await expect(page.locator('h1')).toContainText('Tree Info');

  // Select tree type: Oak (option value = 'oak')
  await page.locator('select').first().selectOption('oak');

  // Select a location hint (required). This hint has exactly one location so
  // exact location is auto-filled.
  await page.locator('select').nth(1).selectOption('Close to a collection of yew trees (Seers)');

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
// Session join via ?join= query param
// ─────────────────────────────────────────────────────────────────────────────

const JOIN_CODE = 'ABCD23';

test('?join= valid code: strips param from URL on load', async ({ page }) => {
  await page.route(`/api/session/${JOIN_CODE}`, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: JOIN_CODE, clientCount: 0 }),
    })
  );

  await page.goto(`/?join=${JOIN_CODE}`);

  // URL must be cleaned regardless of whether the WS connection succeeds
  await expect(page).not.toHaveURL(/join=/);
});

test('?join= invalid code: URL is unchanged, no API call made', async ({ page }) => {
  let apiCalled = false;
  await page.route('/api/session/**', () => { apiCalled = true; });

  await page.goto('/?join=TOOLONG');

  // Invalid codes are silently ignored — URL left as-is
  await expect(page).toHaveURL(/join=TOOLONG/);
  expect(apiCalled).toBe(false);
});

test('?join= session not found: URL is cleaned, error shown', async ({ page }) => {
  await page.route(`/api/session/${JOIN_CODE}`, route =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Session not found.' }),
    })
  );

  await page.goto(`/?join=${JOIN_CODE}`);

  // URL is cleaned even when the session lookup fails
  await expect(page).not.toHaveURL(/join=/);

  // Error message is shown in the session bar
  await expect(page.locator('text=Session not found.')).toBeVisible();
});

test('?join= valid code: session code appears in bar when WS connects', async ({ page }) => {
  await page.route(`/api/session/${JOIN_CODE}`, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: JOIN_CODE, clientCount: 1 }),
    })
  );

  await page.routeWebSocket(/\/ws/, ws => {
    // Respond to client messages (ping → pong, mutations → ack)
    ws.onMessage(raw => {
      try {
        const msg = JSON.parse(raw as string);
        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        } else if (msg.msgId !== undefined) {
          ws.send(JSON.stringify({ type: 'ack', msgId: msg.msgId }));
        }
      } catch { /* ignore malformed */ }
    });
    // Simulate the server's initial snapshot + client count
    ws.send(JSON.stringify({ type: 'snapshot', worlds: {} }));
    ws.send(JSON.stringify({ type: 'clientCount', count: 1 }));
  });

  await page.goto(`/?join=${JOIN_CODE}`);

  // The session bar button showing the code confirms a successful join
  await expect(page.getByRole('button', { name: JOIN_CODE })).toBeVisible();
});

// ─────────────────────────────────────────────────────────────────────────────
// World detail view
// ─────────────────────────────────────────────────────────────────────────────

test('detail view: opens world status and back returns to grid', async ({ page }) => {
  await page.goto('/');

  // Click the "w1" label — it's inside the card div but not a button, so the
  // card's onClick fires and opens WorldDetailView
  await page.getByTestId(`world-card-${W}`).getByText(`w${W}`).click();

  // WorldDetailView heading is "W{id} Status"
  await expect(page.locator('h1')).toContainText(`W${W} Status`);

  // Navigate back
  await page.getByRole('button', { name: '← Back' }).click();

  // Grid is visible again
  await expect(page.getByTestId(`world-card-${W}`)).toBeVisible();
});
