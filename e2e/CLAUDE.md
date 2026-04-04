# E2E Tests

Playwright E2E tests in `app.spec.ts`. Covers: grid render, spawn timer, tree info, mark dead, detail view, sort/filter, session join, and WebSocket race conditions.

Run with:
```bash
npm run test:e2e       # headless (auto-starts dev server)
npm run test:e2e:ui    # visual test runner UI
```

Unit tests (Vitest) live alongside the code they test:
- `shared/__tests__/mutations.test.ts` — mutation functions
- `server/__tests__/validation.test.ts` — message validation
- `src/constants/__tests__/evilTree.test.ts` — evilTree helpers
- `src/lib/__tests__/analytics.test.ts` — analytics helpers
- `src/lib/__tests__/sessionUrl.test.ts` — session URL parsing
