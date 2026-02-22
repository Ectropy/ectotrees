import { test, expect } from '@playwright/test';

// World 1 is a P2P world guaranteed to exist in worlds.json
const W = 1;

test.beforeEach(async ({ page }) => {
  // Clear localStorage before each test so state doesn't bleed between tests.
  // addInitScript runs before the page loads, so React never sees stale data.
  await page.addInitScript(() => localStorage.clear());
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
