# E2E Tests

Playwright E2E tests in `app.spec.ts`. Covers: grid render, spawn timer, tree info, mark dead, detail view, sort/filter, Main/Leagues world modes, session join, and WebSocket race conditions.

Note: the `beforeEach` `addInitScript` re-runs `localStorage.clear()` on **every** navigation, including `page.reload()` — so persistence must be tested by asserting the stored value and by seeding it from a later `addInitScript`, not with a reload.

Note: Leagues worlds are gated by the `worlds.json` `leaguesWindow`, so the Leagues tests pin the browser clock with `page.clock.setFixedTime` (inside the window for the mode tests, at its end for the hidden-switcher tests) instead of depending on the date the suite runs.

Run with:
```bash
npm run test:e2e       # headless (auto-starts dev server)
npm run test:e2e:ui    # visual test runner UI
```

Unit tests (Vitest) live alongside the code they test:
- `shared/__tests__/mutations.test.ts` — mutation functions
- `shared/__tests__/worlds.test.ts` — Leagues date window and world gating
- `server/__tests__/validation.test.ts` — message validation
- `src/constants/__tests__/evilTree.test.ts` — evilTree helpers
- `src/lib/__tests__/analytics.test.ts` — analytics helpers
- `src/lib/__tests__/sessionUrl.test.ts` — session URL parsing
- `src/lib/__tests__/worldMode.test.ts` — Main/Leagues world partitioning and mode persistence
