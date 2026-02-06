# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server (default port 3000)
npm run build    # Production build
npm run lint     # Run ESLint (v9 flat config)
npm run start    # Start production server
```

## Architecture

Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS 4. All Lottie optimization happens client-side — no server uploads or API routes.

### Key Files

- **`src/app/page.tsx`** — Single `'use client'` component containing all UI logic: file management, drag-drop, optimization controls, color overrides, background preview, download handling. This is the main file you'll edit for UI changes.
- **`src/lib/lottie-optimizer.ts`** — Pure optimization functions, no DOM or React dependencies. Exports `optimizeLottie()`, `validateLottie()`, `formatBytes()`, and the `OptimizationOptions`/`OptimizationResult` types.
- **`src/components/LottiePreview.tsx`** — Thin wrapper around `lottie-web`. Takes `animationData` and `className` props. Remounts via React `key` prop to restart animations.
- **`src/app/olive.css`** — Custom "Olive" design system. All classes prefixed `ba-`. CSS variables prefixed `--bn-`.
- **`src/app/globals.css`** — Tailwind 4 imports with inline `@theme` block (no tailwind.config file).

### Optimization Tiers

**Safe (enabled by default):** removeHiddenLayers, removeMetadata, removeEmptyGroups, simplifyKeyframes, removeDefaultValues, roundDecimals (precision 0-4).

**Aggressive (opt-in):** removeExpressions, removeEffects, collapseTransforms, collapseDuplicateKeyframes.

### State Patterns in page.tsx

- `items: LottieItem[]` — uploaded files with their optimization results
- `colorOverrides` vs `appliedColors` — two-tier state. Users pick colors live, but changes only apply to the output when clicking "Re-generate" (which copies colorOverrides → appliedColors).
- `downloadData` useMemo — pre-computes `JSON.stringify` for each item once. Both the size display and the download blob use this same string, guaranteeing sizes match.
- `previewKey` — incremented on re-generate to force `LottiePreview` remount via React `key`.
- Inspector sections use `useState` booleans for accordion open/close (`statsOpen`, `safeOpen`, `aggressiveOpen`, `colorsOpen`, `bgOpen`).

### Lottie Color Format

Colors in Lottie are `[r, g, b, a]` arrays with values 0-1, found in fill (`ty: "fl"`) and stroke (`ty: "st"`) shapes under `c.k`. The color utilities in page.tsx convert between this format and hex strings. Colors can be static (array) or keyframed (array of objects with `s`/`e` values).

### Size Display

`formatBytes()` uses base-1000 (SI KB/MB) to match macOS Finder and Chrome. Original size uses `file.size` from the File API (actual disk size). Optimized size is computed from the pre-built download string.

### Path Alias

`@/*` maps to `./src/*` (configured in tsconfig.json).

### Dependencies

- `lottie-web` — animation rendering in preview wells
- `jszip` — batch ZIP export for multi-file downloads
- `pako` — compression utilities

### CSS Conventions (olive.css)

- Fonts: General Sans (body), Azeret Mono (mono) — loaded via Google Fonts
- Layout: three-column with fixed sidebar (240px), fluid workspace, fixed inspector (260px)
- Both sidebar and inspector use scroll wrapper + fixed footer pattern for constrained height
- Animations: staggered entrance delays via `.ba-d1` through `.ba-d4`
