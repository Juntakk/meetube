/**
 * TypeScript 5.6 added TS2882, "Cannot find module or type declarations for
 * side-effect import", and Next 14's bundled types don't declare plain `.css`.
 * Without this, `import './globals.css'` in app/layout.tsx shows as an error —
 * and an editor "remove unused import" quick-fix will happily delete it, which
 * silently unstyles the entire app (Tailwind is loaded by that one line).
 *
 * `*.module.css` is a more specific pattern, so Next's own CSS Modules typing
 * still wins for those imports.
 */
declare module '*.css'
