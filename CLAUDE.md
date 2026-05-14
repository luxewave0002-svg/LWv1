# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Important: Next.js version note

This project runs Next.js **16.2.6**, which may have breaking changes from your training data. Before writing code that touches routing, server components, or config APIs, check `node_modules/next/dist/docs/` for the authoritative reference. Heed deprecation notices.

## Commands

```bash
npm run dev      # Start dev server (Turbopack) at http://localhost:3000
npm run build    # Production build
npm run start    # Serve production build
npm run lint     # ESLint check
```

No test runner is configured yet.

## Architecture

**Router:** App Router only — all routes live under `app/`. No `pages/` directory.

**Path alias:** `@/*` resolves to the project root (e.g. `@/app/layout.tsx`).

**Styling:** Tailwind CSS v4. Configuration is CSS-first — there is no `tailwind.config.js`. Instead, `app/globals.css` uses:
- `@import "tailwindcss"` (replaces the v3 directives)
- `@theme inline { ... }` to map CSS custom properties to Tailwind tokens

The global color tokens (`--background`, `--foreground`) and font tokens (`--font-geist-sans`, `--font-geist-mono`) are defined in `globals.css` and wired into Tailwind via `@theme inline`. Dark mode is handled via `@media (prefers-color-scheme: dark)` in CSS, not a Tailwind dark mode class.

**Fonts:** Geist Sans and Geist Mono are loaded from `next/font/google` in `app/layout.tsx` and injected as CSS variables on `<html>`. Reference them via `font-sans` / `font-mono` Tailwind utilities or the CSS variables directly.

**TypeScript:** Strict mode is enabled. `moduleResolution` is `bundler`.
