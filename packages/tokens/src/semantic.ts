/**
 * Semantic tokens — the layer components actually consume.
 *
 * Components must never reference `primary[600]` directly. They reference
 * `--primary`, and this file decides what that means in each theme. That
 * indirection is what lets KOC re-theme without touching component source, and
 * what lets dark mode be a different mapping rather than a different codebase.
 *
 * Names follow the shadcn/ui contract exactly (`--background`, `--foreground`,
 * `--primary`, `--ring`, `--chart-*`, `--sidebar-*`). Matching that contract is
 * deliberate: it means any component from ui.shadcn.com, Origin UI, or Kibo UI
 * drops into a KOC app and is automatically on-brand, with no re-styling.
 */

import { palette, chartSeries } from "./palette.js";

const { primary, neutral, success, warning, danger, info, accent } = palette;

export interface SemanticTheme {
  [token: string]: string;
}

/**
 * LIGHT — the default for office and field use.
 *
 * Surfaces are near-white but not pure white: #FFFFFF against a bright Kuwaiti
 * office window is fatiguing, so `background` carries the faintest neutral tint
 * while `card` stays pure white. That small step is what makes cards read as
 * raised without needing a heavy shadow.
 */
export const light: SemanticTheme = {
  background: neutral[50],
  foreground: neutral[950],

  card: "#FFFFFF",
  "card-foreground": neutral[950],
  popover: "#FFFFFF",
  "popover-foreground": neutral[950],

  // #0060A9 itself. White on it measures 6.47:1 — clears AA for body text and
  // AAA for large text, so the primary button needs no special-casing.
  primary: primary[600],
  "primary-foreground": "#FFFFFF",

  secondary: neutral[100],
  "secondary-foreground": neutral[900],

  muted: neutral[100],
  // 500 would be prettier but only reaches ~4.0:1 on the muted surface. 600
  // clears 4.5:1, so "muted" text stays legible rather than merely decorative.
  "muted-foreground": neutral[600],

  accent: primary[50],
  "accent-foreground": primary[700],

  destructive: danger[600],
  "destructive-foreground": "#FFFFFF",

  success: success[600],
  "success-foreground": "#FFFFFF",
  warning: warning[600],
  "warning-foreground": "#FFFFFF",
  info: info[600],
  "info-foreground": "#FFFFFF",

  // Decorative separators only — card edges, dividers, table rules. These are
  // exempt from WCAG 1.4.11 (nothing about them is "required to identify a
  // component"), so they are tuned to be quiet: ~1.3:1, in line with every
  // mainstream system.
  border: neutral[200],

  // `input` is NOT decorative and is NOT the same token as `border`. An input's
  // boundary is the only thing that tells a user a control is there, which puts
  // it squarely inside WCAG 1.4.11's 3:1 requirement. neutral[300] measured
  // 1.63:1 and failed; neutral[500] measures 3.63:1 on the page background and
  // 3.96:1 on a card.
  //
  // This reads slightly heavier than most design systems' input borders — and
  // most design systems fail 1.4.11 here. As a state entity KOC is the wrong
  // place to inherit that bug.
  input: neutral[500],

  // The focus ring is the brand blue at full strength. Focus is an
  // accessibility affordance before it is a decorative one — it must be the
  // most visible thing on the screen when it appears.
  ring: primary[600],

  "chart-1": chartSeries[0],
  "chart-2": chartSeries[1],
  "chart-3": chartSeries[2],
  "chart-4": chartSeries[3],
  "chart-5": chartSeries[4],

  // The sidebar is KOC blue. This is where the brand lives in a dashboard —
  // and it doubles as the dark backdrop the white-only KOC logo requires.
  sidebar: primary[800],
  "sidebar-foreground": primary[50],
  "sidebar-primary": "#FFFFFF",
  "sidebar-primary-foreground": primary[800],
  "sidebar-accent": primary[700],
  "sidebar-accent-foreground": "#FFFFFF",
  "sidebar-border": primary[700],
  "sidebar-ring": primary[300],
};

/**
 * DARK — for control rooms and night shift.
 *
 * Not an inversion of light. Two things change on purpose:
 *
 * 1. Surfaces are blue-black (neutral[950] at hue 250), never #000000. Pure
 *    black next to a bright chart causes halation — the light bleeds visually
 *    into the dark — which is precisely the wrong failure mode for someone
 *    reading a pressure trend at 3am.
 * 2. `primary` lifts from 600 to 400. #0060A9 on a dark surface manages only
 *    ~3.2:1 and would fail AA; the lighter step restores legibility. This is the
 *    single most important reason dark mode cannot be a filter over light mode.
 */
export const dark: SemanticTheme = {
  background: neutral[950],
  foreground: neutral[50],

  card: neutral[900],
  "card-foreground": neutral[50],
  popover: neutral[900],
  "popover-foreground": neutral[50],

  // Lifted from 600 → 400 for legibility on dark. Foreground flips to near-black.
  primary: primary[400],
  "primary-foreground": neutral[950],

  secondary: neutral[800],
  "secondary-foreground": neutral[100],

  muted: neutral[800],
  // 400 is the intuitive pick and measures 4.32:1 on the muted surface — a miss
  // against AA's 4.5 by a margin invisible to the eye but real to a screen in
  // sunlight. 300 clears it at 6.27:1.
  "muted-foreground": neutral[300],

  accent: primary[900],
  "accent-foreground": primary[100],

  // Status hues also lift on dark — a 600 red on a 950 surface is muddy and,
  // worse, reads as less urgent than it is.
  destructive: danger[400],
  "destructive-foreground": neutral[950],
  success: success[400],
  "success-foreground": neutral[950],
  warning: warning[400],
  "warning-foreground": neutral[950],
  info: info[400],
  "info-foreground": neutral[950],

  border: neutral[800], // decorative — see light theme note
  // Same 1.4.11 reasoning as light. neutral[700] measured 2.11:1 against the
  // page and neutral[600] only reached 2.78:1 — close enough to look fine and
  // still a failure. neutral[500] clears it.
  input: neutral[500],
  ring: primary[400],

  // Charts lift one step on dark so series keep their punch against a dark plot.
  "chart-1": primary[400],
  "chart-2": warning[400],
  "chart-3": success[400],
  "chart-4": accent[400],
  "chart-5": info[300],

  sidebar: neutral[900],
  "sidebar-foreground": neutral[100],
  "sidebar-primary": primary[400],
  "sidebar-primary-foreground": neutral[950],
  "sidebar-accent": neutral[800],
  "sidebar-accent-foreground": neutral[50],
  "sidebar-border": neutral[800],
  "sidebar-ring": primary[400],
};

export const themes = { light, dark } as const;
export type ThemeName = keyof typeof themes;
