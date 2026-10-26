/**
 * The KOC palette.
 *
 * One ramp is *confirmed* (primary, anchored to the real brand blue). The rest
 * are *derived* — KOC has never defined a success/warning/danger palette, and
 * kockw.com simply inherits Bootstrap 4's stock #28a745 / #dc3545 / #ffc107.
 * Those are dated, mutually clashing, and unsafe for colour-vision deficiency,
 * so they are deliberately not carried forward. Each derived hue is documented
 * with its reasoning below.
 */

import { buildRamp, fromOklch, type Ramp } from "./color.js";
import { KOC_PRIMARY } from "./brand.js";

/**
 * PRIMARY — Kuwait Oil Company blue.
 *
 * Hue 250.61 and chroma 0.139 are measured from #0060A9 itself. The colour is
 * pinned at step 600, so `koc-primary-600` is byte-exact #0060A9 and the rest of
 * the ramp radiates from it.
 *
 * Validation: the generated 700 lands within ~0.02 L of KOC's own hover blues
 * (#054C82, #0C538A), meaning the ramp independently reproduces the darker blue
 * KOC already reaches for on interaction. That agreement is the reason to trust
 * the ramp elsewhere.
 */
export const primary: Ramp = buildRamp({
  hue: 250.61,
  peakChroma: 0.139,
  anchorStep: 600,
  pin: KOC_PRIMARY.value,
  hueDrift: 2,
});

/**
 * NEUTRAL — greys carrying a whisper of the brand hue.
 *
 * KOC's own greys are pure achromatic (#505050, #737373 both measure C=0.000).
 * We keep them near-neutral but add C≈0.02 at hue 250 so that greys sit beside
 * KOC blue without the dead, slightly-yellow cast pure grey takes on next to a
 * saturated blue. The tint is far below the threshold where anyone would call it
 * "blue" — it just stops the UI looking like two unrelated palettes.
 */
export const neutral: Ramp = buildRamp({
  hue: 250,
  peakChroma: 0.022,
  anchorStep: 600,
});

/**
 * Chart & status hues, derived from the Okabe–Ito colour-universal palette.
 *
 * Okabe–Ito is the reference set for colour-vision deficiency: its members stay
 * mutually distinguishable under deuteranopia, protanopia and tritanopia. This
 * matters more than usual here — deuteranopia affects roughly 1 in 12 men, and
 * KOC's operational readership skews heavily male, so a red/green status pair
 * chosen by eye would be genuinely unreadable for a meaningful share of staff.
 *
 * The happy accident: Okabe–Ito's blue (#0072B2) is almost exactly KOC's own
 * #0060A9. The brand colour is *already* a member of the colour-universal set,
 * so an Okabe–Ito-derived palette is simultaneously the most accessible choice
 * and the most on-brand one. Every hue below is tuned to sit beside KOC blue.
 */

/** SUCCESS — Okabe–Ito bluish-green. Deliberately teal-leaning, not grass green:
 *  a blue-green stays separable from red under deuteranopia, where a pure green
 *  does not. */
export const success: Ramp = buildRamp({
  hue: 164,
  peakChroma: 0.115,
  anchorStep: 600,
});

/** WARNING — Okabe–Ito orange. Chosen over yellow because yellow cannot reach
 *  4.5:1 on white at any usable chroma, so a yellow "warning" text token would
 *  be unusable by construction. */
export const warning: Ramp = buildRamp({
  hue: 70,
  peakChroma: 0.155,
  anchorStep: 600,
});

/** DANGER — Okabe–Ito vermillion. Shifted slightly orange of true red so it
 *  remains distinct from `warning` for protanopes while still reading as alarm.
 *  In an operations context this is the colour that means "act now", so it is
 *  the highest-chroma ramp in the system. */
export const danger: Ramp = buildRamp({
  hue: 27,
  peakChroma: 0.17,
  anchorStep: 600,
});

/** INFO — teal-cyan at hue 210.
 *
 *  This hue is boxed in: it has to stay clear of `success` at 164 on one side
 *  and `primary` at 250.6 on the other, and moving away from either walks it
 *  into the other. 210 is the maximin — measured ΔE2000 of 19.4 against primary
 *  and 19.6 against success, the point where the *worst* neighbour separation is
 *  as large as it can be. (220 gave a more comfortable 24.6 against success but
 *  collapsed to 14.2 against primary, which is where "info" starts looking like
 *  a broken primary button.)
 *
 *  ΔE≈19.5 is "clearly perceptible at a glance" rather than "unmistakable". That
 *  is acceptable only because colour is never the sole channel: per WCAG 1.4.1
 *  every status in this system also carries an icon and a label. Do not use info
 *  and success as the only distinguishing mark of anything. */
export const info: Ramp = buildRamp({
  hue: 210,
  peakChroma: 0.115,
  anchorStep: 600,
});

/** ACCENT — Okabe–Ito reddish-purple. The one non-functional hue, for chart
 *  series and highlights that must not imply a status. */
export const accent: Ramp = buildRamp({
  hue: 330,
  peakChroma: 0.12,
  anchorStep: 600,
});

export const palette = {
  primary,
  neutral,
  success,
  warning,
  danger,
  info,
  accent,
} as const;

export type PaletteName = keyof typeof palette;

/**
 * Categorical chart series — five slots, each defined for light AND dark.
 *
 * ── CHOSEN BY SAUD, 2026-10-25: "jewel tones" ────────────────────────────────
 *
 *   slot  colour    hue   light                      dark
 *   1     KOC blue  251   primary[600] #0060A9       L 0.62  C 0.13
 *   2     coral      18   L 0.62  C 0.14             L 0.59  C 0.14
 *   3     indigo    278   L 0.56  C 0.14             L 0.65  C 0.16
 *   4     magenta   338   L 0.50  C 0.14             L 0.59  C 0.16
 *   5     emerald   160   L 0.59  C 0.14             L 0.65  C 0.16
 *
 * The same morning's colour-blind fix (see below) passed the gates with an
 * orange and an olive, and Saud rejected the look: "the orange and olives are
 * bad looking" — the set should sit with the KOC blue theme. Three sets were
 * then searched under the SAME gates with orange, yellow and olive excluded,
 * drawing only on hues that sit beside the brand blue (teal, aqua, sky, slate,
 * indigo, violet, plum, magenta, rose, coral, emerald), and this is the one he
 * picked.
 *
 * WHY SLOT 2 IS CORAL, and why no all-cool set exists. To a protanope or a
 * deuteranope, teal, aqua, sky, slate, indigo and violet all collapse toward
 * the brand blue; only lightness tells them apart, and the light theme's 3:1
 * floor against a white card leaves too little lightness to separate four of
 * them. Every passing set in the search put a warm red/coral beside the blue —
 * the one hue every dichromacy keeps clear of it. Coral (h 18) is that hue
 * without the orange Saud did not want.
 *
 * ── THE GATES (contrast.test.ts → auditChartSeries) ─────────────────────────
 *
 * Re-derived 2026-10-25 because the original set (blue, orange, bluish-green,
 * reddish-purple, teal) passed ΔE2000 and greyscale between neighbours and still
 * failed the dataviz validator: nothing simulated colour-vision deficiency, a
 * slot sat below the chroma floor, and the dark series was never audited. Both
 * themes' shipped `--chart-*` are now held to: the lightness band per theme,
 * chroma ≥ 0.10, ΔE2000 ≥ 15 and OKLab ΔE ≥ 15 between neighbours, ≥ 1.2:1 in
 * greyscale, ≥ 8 under protanopia, deuteranopia and tritanopia, and 3:1 against
 * the page and the card.
 *
 * Lightness alternates between neighbours so they stay apart in greyscale — a
 * printout, a dying projector or achromatopsia sees only tone.
 *
 * ── WHAT IS STILL TRUE ──────────────────────────────────────────────────────
 *
 * The gate holds adjacent pairs, because bars and stacks only touch their
 * neighbours. Non-adjacent pairs are weaker under CVD (the worst is ΔE 3.9),
 * which no ordering of five hues fixes. So a scatter or bubble chart, where any
 * two marks can sit side by side, should still use three series — and never
 * rely on colour alone: label lines directly or give them markers, as
 * @koc/chart's TrendChart already does at each line's end.
 *
 * These are coordinates, not ramps: a series needs one colour per theme, not
 * eleven steps. `fromOklch` keeps invariant 1 — the colour is derived, and
 * changing it means changing a coordinate.
 */
const chartSlot = (
  hue: number,
  light: { l: number; c: number },
  dark: { l: number; c: number },
) => ({
  light: fromOklch(light.l, light.c, hue),
  dark: fromOklch(dark.l, dark.c, hue),
});

const chartCoral = chartSlot(18, { l: 0.62, c: 0.14 }, { l: 0.59, c: 0.14 });
const chartIndigo = chartSlot(278, { l: 0.56, c: 0.14 }, { l: 0.65, c: 0.16 });
const chartMagenta = chartSlot(338, { l: 0.5, c: 0.14 }, { l: 0.59, c: 0.16 });
const chartEmerald = chartSlot(160, { l: 0.59, c: 0.14 }, { l: 0.65, c: 0.16 });

/** Chart series, light theme. `--chart-1..5` in light resolve to these. */
export const chartSeries = [
  primary[600], // KOC blue — series 1 is always the brand
  chartCoral.light, // the warm partner every dichromacy keeps clear of blue
  chartIndigo.light,
  chartMagenta.light,
  chartEmerald.light,
] as const;

/** Chart series, dark theme. Same hues, re-stepped into the dark band. */
export const chartSeriesDark = [
  // The brand blue lifted into the dark band: 3:1 on the dark card needs more
  // lightness than primary[500] has, and coral beside it needs the step apart.
  fromOklch(0.62, 0.13, 250),
  chartCoral.dark,
  chartIndigo.dark,
  chartMagenta.dark,
  chartEmerald.dark,
] as const;
