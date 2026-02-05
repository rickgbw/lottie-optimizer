# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server (default port 3000)
npm run build    # Production build
npm run lint     # Run ESLint
npm run start    # Start production server
```

## Architecture

This is a Next.js 16 app (App Router) that optimizes Lottie animation files client-side. All processing happens in the browser - no server uploads.

### Key Files

- `src/lib/lottie-optimizer.ts` - Core optimization logic with these strategies:
  - `removeHiddenLayers` - Removes layers with `hd: true` or null objects (`ty: 3`)
  - `removeMetadata` - Strips `meta`, `markers`, `fonts`, `chars`
  - `removeEmptyGroups` - Eliminates shape groups (`ty: 'gr'`) with <=1 items
  - `simplifyKeyframes` - Removes redundant bezier handles near 0.5
  - `removeDefaultValues` - Strips properties at defaults (`ddd=0`, `ao=0`, `sr=1`, `bm=0`, `ix`, `nm`)
  - `roundDecimals` - Reduces float precision (configurable 0-4 decimals)
  - `removeUnusedAssets` - Finds referenced `refId` values and removes orphan assets

- `src/components/LottiePreview.tsx` - Wrapper around `lottie-web` for animation playback
- `src/app/page.tsx` - Single page UI with drag-drop upload, side-by-side preview, options panel

### Lottie Format Reference

Required properties for valid Lottie: `v` (version), `fr` (framerate), `ip`/`op` (in/out points), `w`/`h` (dimensions). The optimizer preserves these while removing optional properties.

### Path Alias

`@/*` maps to `./src/*` (configured in tsconfig.json).
