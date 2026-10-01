/**
 * HOSTED COMPARISON ONLY: always animate, whatever Windows says.
 *
 * Decided by Saud on 2026-10-01, after the work-PC check showed that KOC's Edge
 * reports `prefers-reduced-motion: reduce` (Windows "Animation effects" off),
 * which stilled every direction. The hosted site therefore ignores that OS
 * signal. The viewer's turtle button still stops motion on demand, because it
 * works through `data-force-reduced-motion`, not the media query.
 *
 * This file only covers what JavaScript asks. The CSS half (the
 * `@media (prefers-reduced-motion…)` rules) is rewritten at build time by
 * vite.landing.config.ts. The docs app is untouched and keeps honouring the
 * OS setting. This is NOT a pattern for @koc/ui or for a production app.
 *
 * Must be imported before anything else in landing-main.tsx.
 */

const REDUCE = /\(\s*prefers-reduced-motion\s*(?::\s*reduce\s*)?\)/g;
const NO_PREFERENCE = /\(\s*prefers-reduced-motion\s*:\s*no-preference\s*\)/g;

// Media features that are never / always true, so compound queries stay valid.
import { ALWAYS, NEVER } from "./landing-motion-css";

export function ignoreReducedMotion(query: string): string {
  return query.replace(NO_PREFERENCE, ALWAYS).replace(REDUCE, NEVER);
}

const original = window.matchMedia.bind(window);
// A real MediaQueryList for the rewritten query, so listeners and `.matches`
// behave exactly as callers expect.
window.matchMedia = (query: string) => original(ignoreReducedMotion(query));
