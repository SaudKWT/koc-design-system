/**
 * Re-export of the canonical `cn` from `@koc/ui`.
 *
 * The shadcn CLI hardcodes `@/lib/utils` as the import path for `cn` in every
 * component it writes. Rather than let it install a second copy — which is how
 * a codebase quietly ends up with two class mergers that disagree about
 * Tailwind conflict resolution — this file points that path at the one in
 * `@koc/ui`. Installed components then share the design system's merger.
 */

export { cn } from "@koc/ui";
