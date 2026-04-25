# Storybook

Component playground and the source-of-truth for the Open Graph image.

## Files

```
.storybook/
  main.ts              # StorybookConfig — uses @storybook/react-vite, picks up src/**/*.stories.@(ts|tsx). Aliases @ → src and @shared-browser → shared-browser. Defines __APP_VERSION__ as 'storybook'.
  preview.tsx          # Global decorator: wraps every story in `dark` Tailwind class + TooltipProvider on a #111827 background. Imports src/index.css so Tailwind utilities work.
```

Stories live alongside the components they document, named `*.stories.tsx`:

- `src/components/WorldCard.stories.tsx`
- `src/components/UpdateBanner.stories.tsx`
- `src/components/OgImage.stories.tsx` — composes `MapView` + scaled `WorldCard` at 1200×630. **This is the story `scripts/generate-og-image.mjs` screenshots** (story id `marketing-ogimage--default`). Changing the OG image means editing this story (or its `default` args), running `npm run og:generate`, and committing the resulting `public/og-image.png`.

## Commands

```bash
npm run storybook         # dev server on :6006
npm run build-storybook   # static build → storybook-static/
npm run og:generate       # builds Storybook then renders OG story to public/og-image.png
```

## Notes

- The OG generator (`scripts/generate-og-image.mjs`) drives Playwright's bundled chromium against a static-served `storybook-static/`, waits for Leaflet tiles to settle, then screenshots `#storybook-root > *` — so anything that breaks the OG story (broken tile URL, missing font, layout regression) breaks `npm run og:generate`.
- New components added to Storybook only need a `*.stories.tsx` next to them — `main.ts` picks them up automatically.
- No addons are configured. Keep it lean unless we genuinely need a11y / interactions.
