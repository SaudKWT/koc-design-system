/**
 * The staging ledger.
 *
 * Every third-party component this project has evaluated, what happened to it,
 * and what it cost. This is the file to read before installing anything new —
 * and the file to update when something moves between stages.
 *
 * ── The pipeline ────────────────────────────────────────────────────────────
 *
 *   install → `bakeoff/`     staged. Compiles, renders, gated by nothing.
 *      ↓                     Never imported by @koc/ui.
 *   approve → `@koc/ui`      promoted. Subject to every gate: contrast, token
 *                            drift, motion scale, a11y, registry coverage.
 *
 * Promotion is a REWRITE, not a move. Nothing has ever crossed unchanged: each
 * one arrived with off-scale motion, hardcoded content, or a coupling to its
 * own shell. The rewrite is where those get fixed and where KOC-specific
 * meaning gets added.
 *
 * ── Why rejects stay ────────────────────────────────────────────────────────
 *
 * A ledger that records only what shipped cannot be audited. Six months on
 * nobody can tell whether a component was rejected on merit or never opened.
 * Everything installed stays on disk, excluded from the gates, and appears on
 * the Evaluation pages.
 */

export type Stage =
  | "promoted" // fully rewritten into @koc/ui
  | "partial" // pieces taken, the rest left
  | "staged" // installed, still deciding
  | "rejected"; // evaluated and declined, kept for the record

export interface LedgerEntry {
  /** Registry item, as installed. */
  id: string;
  name: string;
  source: string;
  installed: string;
  stage: Stage;
  /** Where it lives now — an `@koc/*` item, or the bake-off path. */
  landedAs?: string[];
  /** What the rewrite had to change. Empty means nothing crossed unchanged. */
  fixedOnPromotion?: string[];
  /** Why it was declined, or what is still undecided. */
  note?: string;
}

export const LEDGER: LedgerEntry[] = [
  // ── shadcn/ui canonical ───────────────────────────────────────────────────
  {
    id: "@shadcn/sidebar",
    name: "Sidebar primitives",
    source: "shadcn/ui",
    installed: "2026-08-09",
    stage: "promoted",
    landedAs: ["@koc/sidebar", "@koc/app-shell"],
    fixedOnPromotion: [
      "Injected stock Zinc theme tokens into styles.css on install — caught by check:drift.",
      "Collapsed padding lived in the base while `lg` carried p-0!; both !important, and Tailwind emits p-0 first, so lg never got zero padding. Moved into the size variants.",
      "duration-200 ease-linear on the collapse transition, off the motion scale.",
    ],
  },
  {
    id: "@shadcn/sidebar-01 / -07 / -16",
    name: "Sidebar block variants",
    source: "shadcn/ui blocks",
    installed: "2026-08-09",
    stage: "rejected",
    note: "Bake-off candidates only. sidebar-07's collapsible icon rail won on merit; the block itself was not adopted — AppShell is configured from a TeamConfig instead, because a hand-built sidebar per team is how a standard dies.",
  },
  {
    id: "@shadcn/dashboard-01",
    name: "Dashboard block",
    source: "shadcn/ui blocks",
    installed: "2026-08-09",
    stage: "rejected",
    note: "Read for its TanStack v9 wiring and pagination layout, both of which informed @koc/data-table. The block itself is 814 lines of demo — drag-to-reorder, a drawer with a chart, toasts for fake saves. Cost 12 dependencies including a second icon library, and silently bumped recharts 2.15 → 3.8. Its unused files were deleted 2026-08-10.",
  },

  // ── shadcn-space ──────────────────────────────────────────────────────────
  {
    id: "@shadcn-space/radix/dialog-02",
    name: "Dialog 02 — slide from bottom",
    source: "shadcn-space",
    installed: "2026-08-10",
    stage: "promoted",
    landedAs: ["@koc/dialog (entrance)", "@koc/confirm-dialog"],
    fixedOnPromotion: [
      "Two duration-300 literals → the motion scale.",
      'Hardcoded "Delete Item" → `subject` is a required prop, so it reads "Void report BG-1042?" and a mistake is catchable.',
      "Confirm button took initial focus. Cancel does now — a stray Enter must not destroy a record.",
    ],
  },
  {
    id: "@shadcn-space/radix/calendar-16",
    name: "Calendar 16 — compact trigger",
    source: "shadcn-space",
    installed: "2026-08-10",
    stage: "partial",
    landedAs: ["@koc/date-range-filter"],
    fixedOnPromotion: [
      "Two duration-200 literals → the motion scale.",
      "Its time-range half (start/end, 1h/2h/4h) was left: it belongs to scheduling, not filtering.",
    ],
  },
  {
    id: "@shadcn-space/radix/calendar-14",
    name: "Calendar 14 — grouped presets",
    source: "shadcn-space",
    installed: "2026-08-10",
    stage: "partial",
    landedAs: ["@koc/date-range-filter"],
    fixedOnPromotion: [
      "Presets sat in a 44px scroll area that hid two of three groups; moved beside the calendar.",
      "Forward-looking defaults (Tomorrow, Next 7 days) return nothing on a report list. PAST_PRESETS is the default; FUTURE_PRESETS is exported for scheduling.",
    ],
  },
  {
    id: "@shadcn-space/radix/topbar-05",
    name: "Topbar 05",
    source: "shadcn-space",
    installed: "2026-08-10",
    stage: "partial",
    landedAs: ["@koc/notification-menu", "@koc/user-menu", "@koc/page-nav"],
    fixedOnPromotion: [
      'Literal "5 New" badge that can disagree with its own list → the count is derived from the items.',
      "SaaS profile items (Billing, Subscription, Team) → the menu takes groups.",
      "PageNav's source called useSidebar() and threw outside a provider; the coupling was removed.",
      "One duration-400 literal, which is not on Tailwind's scale either.",
      "Sample nav needed lucide ≥ 1.x — the trigger for upgrading 0.469 → 1.31.",
    ],
    note: "The topbar itself was left: it competes with AppShell, and its language switcher is dead weight under ADR 0001.",
  },
  {
    id: "@shadcn-space/{dialog-02,calendar-16,topbar-05}",
    name: "Base UI builds of the above",
    source: "shadcn-space",
    installed: "2026-08-10",
    stage: "rejected",
    note: "Written for Base UI (`render={<Button/>}`, `data-open:`); this project is Radix. 20 type errors, 8 of them the same root cause. Deleted once the /radix/ variants were found. See CLAUDE.md for why KOC stays on Radix until shadcn canonical moves.",
  },
];

/** Counts by stage, for the evaluation page header. */
export function ledgerSummary() {
  return LEDGER.reduce<Record<Stage, number>>(
    (acc, e) => ({ ...acc, [e.stage]: (acc[e.stage] ?? 0) + 1 }),
    { promoted: 0, partial: 0, staged: 0, rejected: 0 },
  );
}
