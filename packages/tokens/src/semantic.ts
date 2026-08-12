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

  // Hover and active surfaces.
  //
  // ── SEMANTIC TOKENS MAY SHARE A VALUE. STATES MAY NOT SHARE A TOKEN. ──────
  //
  // `accent`, `secondary` and `muted` are all one neutral here, and `border`
  // joins them in dark. That is not a mistake and it is not unusual — shadcn's
  // own theme collapses secondary and muted, and those two were already equal
  // here before accent joined them in v0.1.4. Distinct NAMES mean distinct
  // ROLES; they have never meant distinct values.
  //
  // The DWOS app found out the hard way. Its Nil/Reportable toggle marked the
  // selected half with `bg-secondary` and hovered the other with
  // `hover:bg-accent` — two colours until v0.1.4, one colour after it, so
  // hovering the unselected half made it pixel-identical to the selected one.
  // The exact fault that release existed to fix, reproduced by fixing it.
  //
  // THE RULE, for anyone building on this system:
  //
  //   Never distinguish two states of one control by reaching for two semantic
  //   tokens. Vary alpha or weight WITHIN one.
  //
  // `@koc/table` is the model: `hover:bg-muted/50` against
  // `data-[state=selected]:bg-accent`. Those two survived the collapse because
  // the difference was never the hue — it was the alpha. `@koc/sidebar` does
  // the same, hover at 60% of the selected fill.
  //
  // A colour change cannot break that pattern. It can always break the other one,
  // which is why `npm run release:status` now reports every pair of tokens that
  // becomes identical in a release, so the decision is visible before the tag
  // rather than discovered in someone's app after it.
  //
  // NEUTRAL, NOT A BLUE TINT — changed 2026-08-12 after seeing it in the app.
  //
  // This was primary[100], a pale blue. On a nav list it read as a second brand
  // statement: hover tinted blue, selected tinted blue harder, and with a
  // dozen rows on screen the sidebar became the loudest thing on the page.
  // Saud's note was that the blue highlights were distracting "especially on
  // the hover effects", and that blue should be selective.
  //
  // The move is hue only. Measured against white:
  //
  //   primary[100]  1.204:1   <- was here
  //   neutral[100]  1.205:1   <- here now
  //
  // A thousandth apart, so the pill is exactly as findable as it was; what
  // changed is that it no longer competes with the brand. The label on it went
  // from 6.97:1 to 11.83:1 as a side effect, because neutral[900] on a grey is
  // a stronger pairing than primary[700] on a blue.
  //
  // WITH HUE GONE, WEIGHT CARRIES THE ACTIVE STATE. sidebar.tsx steps resting
  // font-medium to selected font-semibold, and hover fills at 60% rather than
  // the full accent — previously hover and selected were the SAME fill, which
  // is why a passing cursor looked like a selection.
  //
  // Blue now appears in the chrome only where it is doing work: the logo tile,
  // the focus ring, primary buttons, links, and chart-1.
  //
  // WCAG has nothing to say about the surface itself — a hover background
  // carries no information a sighted user must *read* — so the tested
  // constraint is the label on top of it.
  accent: neutral[100],
  "accent-foreground": neutral[900],

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

  // The sidebar is a quiet surface, not a brand panel.
  //
  // It was primary[800] — a full-height slab of KOC blue. That reads as strong
  // branding for about a day, and as noise every day after: navigation is the
  // one element on screen at all times, so it is the worst place to spend
  // saturation. A dashboard's colour budget should be carried by the data, where
  // colour means something (a status, a series, a threshold). Nav chrome
  // competing with a chart for attention is a competition the chart should win.
  //
  // So the brand now appears in the sidebar in exactly two places: the active
  // item, and the focus ring. Both are places where colour is doing work —
  // signalling where you are and where your keyboard is — rather than decorating.
  //
  // Consequence to know about: the KOC logo SVG ships fill="white" only, and it
  // is unreadable on a light surface. Consumers must put it on a `bg-primary`
  // tile (see the docs sidebar header) rather than dropping it straight onto
  // `bg-sidebar`. That is a real constraint the old dark slab was hiding.
  sidebar: "#FFFFFF",
  "sidebar-foreground": neutral[800],
  "sidebar-primary": primary[600],
  "sidebar-primary-foreground": "#FFFFFF",
  // Active item: a blue wash with the label in brand blue — enough to locate
  // yourself at a glance, far short of a slab. Moves with `accent`, because a
  // current nav item and a hovered button should read as the same idea.
  "sidebar-accent": neutral[100],
  "sidebar-accent-foreground": neutral[900],
  "sidebar-border": neutral[200],
  "sidebar-ring": primary[600],
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

  accent: neutral[800],
  "accent-foreground": neutral[50],

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

  // Dark was already restrained, but its active item was a neutral grey — which
  // means in dark mode you could not tell "hovered" from "current page" by
  // colour alone. Light now marks the active item in brand blue, so dark does
  // the same, one rung brighter to survive the dark surface.
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
