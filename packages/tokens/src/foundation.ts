/**
 * Non-colour foundations: type, space, radius, elevation, motion.
 *
 * Scope note: this system is English-only by decision (see docs/adr/0001).
 * Tokens here therefore use physical properties (`padding-left`) rather than
 * logical ones (`padding-inline-start`), matching upstream shadcn/ui so that
 * components copied from ui.shadcn.com need no translation.
 */

/**
 * TYPOGRAPHY
 *
 * KOC currently renders in Tahoma — a 1994 screen font with no real weight range
 * (it ships regular and bold only), loose spacing built for 800×600 CRTs, and no
 * tabular figures. It is the single biggest reason KOC dashboards look dated.
 *
 * Inter replaces it: designed for UI at small sizes, ships a full weight axis,
 * and — decisively for dashboards — has true tabular numerals so that a column
 * of production figures aligns on the decimal instead of shimmying by digit.
 */
export const fontFamily = {
  sans: [
    "Inter var",
    "Inter",
    "-apple-system",
    "BlinkMacSystemFont",
    "Segoe UI",
    "Helvetica Neue",
    "Arial",
    "sans-serif",
  ],
  /** Well/tag identifiers, IDs, and code. Ligatures off — an operator must be
   *  able to distinguish `l` `1` `I` and `0` `O` in a well number. */
  mono: [
    "JetBrains Mono",
    "SF Mono",
    "Menlo",
    "Consolas",
    "Liberation Mono",
    "monospace",
  ],
} as const;

/**
 * Type scale, in rem.
 *
 * Denser at the small end than a classic editorial scale, because dashboard
 * chrome (labels, table cells, badges) lives between 12 and 14px and needs real
 * steps there — while display sizes are used once per page and can jump.
 */
export const fontSize = {
  "2xs": "0.6875rem", // 11px — dense table cells, badges. The floor; nothing smaller ships.
  xs: "0.75rem", // 12px — labels, captions, axis ticks
  sm: "0.8125rem", // 13px — secondary body, table cells
  base: "0.875rem", // 14px — DEFAULT body. 14 not 16: dashboards are information-dense
  //                          and 16px body forces scrolling that costs more than
  //                          the legibility it buys. Long-form prose overrides to md.
  md: "1rem", // 16px — long-form reading, dialogs
  lg: "1.125rem", // 18px — card titles
  xl: "1.25rem", // 20px — section headings
  "2xl": "1.5rem", // 24px — page titles
  "3xl": "1.875rem", // 30px — KPI values
  "4xl": "2.25rem", // 36px — hero KPI values
  "5xl": "3rem", // 48px — display
} as const;

export const fontWeight = {
  normal: "400",
  medium: "500", // default for UI labels — 400 reads limp in dense chrome
  semibold: "600",
  bold: "700",
} as const;

export const lineHeight = {
  none: "1",
  tight: "1.25", // headings and KPI values
  snug: "1.375",
  normal: "1.5", // body default
  relaxed: "1.625", // long-form prose
} as const;

export const letterSpacing = {
  tighter: "-0.03em", // large display sizes — big type needs negative tracking
  tight: "-0.015em", // headings
  normal: "0",
  wide: "0.025em",
  wider: "0.06em", // ALL-CAPS labels, which need air to stay readable
} as const;

/**
 * SPACING — a 4px base grid.
 *
 * 4 rather than 8, because dashboard chrome genuinely needs the half-steps: a
 * badge with 8px padding is bloated, with 4px is cramped, and 6px is right. An
 * 8px-only grid forces those decisions into one-off magic numbers.
 */
export const spacing = {
  0: "0",
  px: "1px",
  0.5: "0.125rem", // 2
  1: "0.25rem", // 4
  1.5: "0.375rem", // 6
  2: "0.5rem", // 8
  2.5: "0.625rem", // 10
  3: "0.75rem", // 12
  3.5: "0.875rem", // 14
  4: "1rem", // 16
  5: "1.25rem", // 20
  6: "1.5rem", // 24
  7: "1.75rem", // 28
  8: "2rem", // 32
  10: "2.5rem", // 40
  12: "3rem", // 48
  14: "3.5rem", // 56
  16: "4rem", // 64
  20: "5rem", // 80
  24: "6rem", // 96
  32: "8rem", // 128
} as const;

/**
 * RADIUS
 *
 * KOC's current site is effectively square (Bootstrap 4's 0.25rem, mostly
 * overridden to 0). Going fully rounded would read as a different company;
 * staying square reads as unmaintained. 6px on the default control is the
 * judgement call — modern, but restrained enough for a state energy company.
 */
export const radius = {
  none: "0",
  sm: "0.25rem", // 4 — badges, small chips
  DEFAULT: "0.375rem", // 6 — buttons, inputs. The system's voice.
  md: "0.5rem", // 8 — cards
  lg: "0.75rem", // 12 — modals, panels
  xl: "1rem", // 16 — feature surfaces
  full: "9999px", // pills, avatars
} as const;

/**
 * ELEVATION
 *
 * Shadows are tinted with the brand hue (250) rather than neutral black. A pure
 * black shadow over a blue-tinted surface goes slightly green; a hue-matched
 * shadow stays clean. Kept shallow throughout — deep shadows on a dense
 * dashboard turn into visual noise.
 */
export const shadow = {
  none: "none",
  xs: "0 1px 2px 0 oklch(0.28 0.02 250 / 0.05)",
  sm: "0 1px 3px 0 oklch(0.28 0.02 250 / 0.08), 0 1px 2px -1px oklch(0.28 0.02 250 / 0.06)",
  DEFAULT:
    "0 2px 4px -1px oklch(0.28 0.02 250 / 0.08), 0 1px 2px -1px oklch(0.28 0.02 250 / 0.06)",
  md: "0 4px 8px -2px oklch(0.28 0.02 250 / 0.10), 0 2px 4px -2px oklch(0.28 0.02 250 / 0.06)",
  lg: "0 12px 20px -4px oklch(0.28 0.02 250 / 0.12), 0 4px 8px -4px oklch(0.28 0.02 250 / 0.08)",
  xl: "0 24px 32px -8px oklch(0.28 0.02 250 / 0.16), 0 8px 12px -6px oklch(0.28 0.02 250 / 0.10)",
  /** Focus ring. Expressed as a shadow so it composes with existing borders
   *  without shifting layout. */
  focus: "0 0 0 3px oklch(0.483 0.139 250.61 / 0.35)",
} as const;

/**
 * MOTION
 *
 * Fast and unobtrusive. A dashboard is a tool someone uses for eight hours;
 * animation that delights on first view becomes an irritant by hour two.
 * Nothing here exceeds 300ms.
 */
export const duration = {
  instant: "0ms",
  fast: "120ms", // hover, focus — must feel immediate
  DEFAULT: "180ms", // most state changes
  slow: "240ms", // popovers, dropdowns
  slower: "300ms", // modals, drawers. The ceiling.
} as const;

export const easing = {
  /** Default. Decelerating — things arrive gently and leave briskly. */
  DEFAULT: "cubic-bezier(0.4, 0, 0.2, 1)",
  in: "cubic-bezier(0.4, 0, 1, 1)",
  out: "cubic-bezier(0, 0, 0.2, 1)",
  inOut: "cubic-bezier(0.4, 0, 0.2, 1)",
  /** Slight overshoot, for elements that should feel physical (toasts, switches).
   *  Used sparingly — never on anything safety-critical. */
  spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
} as const;

/** BREAKPOINTS. `3xl` exists because control rooms run 1440p+ wall displays and
 *  a dashboard that stops scaling at 1536px wastes half of one. */
export const screens = {
  sm: "640px",
  md: "768px",
  lg: "1024px",
  xl: "1280px",
  "2xl": "1536px",
  "3xl": "1920px",
} as const;

/** Z-INDEX — a named ladder. Ad-hoc z-index values are how stacking bugs start. */
export const zIndex = {
  base: "0",
  dropdown: "1000",
  sticky: "1100",
  banner: "1200",
  overlay: "1300",
  modal: "1400",
  popover: "1500",
  toast: "1600",
  tooltip: "1700",
} as const;

export const foundation = {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  letterSpacing,
  spacing,
  radius,
  shadow,
  duration,
  easing,
  screens,
  zIndex,
} as const;
