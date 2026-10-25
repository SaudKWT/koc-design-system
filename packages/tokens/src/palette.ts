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
 * ── RE-DERIVED 2026-10-25: the old set failed colour-blind separation ───────
 *
 * The previous series (blue, orange, bluish-green, reddish-purple, teal) passed
 * every assertion this package made — ΔE2000 ≥ 15 and ≥ 1.2:1 greyscale between
 * neighbours — and still failed the dataviz palette validator, because nothing
 * here simulated colour-vision deficiency:
 *
 *   light  chart-4↔5 (purple↔teal) ΔE 6.9 under protanopia — both read as blue
 *          chart-5 (info[600]) chroma 0.083 — below the 0.10 floor, reads grey
 *   dark   every slot sat at step 400 (L 0.71) or 300 (L 0.81), above the dark
 *          band's 0.67 ceiling; chart-3↔4 ΔE 6.4 under deuteranopia; and
 *          adjacent pairs measured 1.03–1.09:1 in greyscale, because only the
 *          LIGHT series was ever audited for tone
 *
 * So the rig3 charts told consumers to stop at three series. contrast.test.ts
 * now runs the validator's checks — lightness band, chroma floor, CVD under
 * protan/deutan/tritan simulation, the normal-vision floor — on both themes'
 * shipped `--chart-*` tokens, and this set is what passes them.
 *
 * ── HOW THE SLOTS WERE CHOSEN ──────────────────────────────────────────────
 *
 * Not by eye. Slot 1 is fixed (the brand), slot 2 held at the warm pole, and
 * hue × chroma × lightness for slots 3–5 was searched in both themes at once
 * — same hue per slot in light and dark, so a series keeps its identity when
 * the theme flips — maximising the worst adjacent CVD separation under every
 * gate above, then the worst separation between NON-adjacent slots, which the
 * validator does not gate but a legend lookup on crossing lines needs.
 *
 *   slot  hue        light                     dark
 *   1     blue 251   primary[600] #0060A9      primary[500]
 *   2     orange 70  warning[500]              L 0.665
 *   3     purple 320 L 0.483                   L 0.585
 *   4     teal 175   L 0.598                   L 0.665
 *   5     olive 110  L 0.483                   L 0.575
 *
 * Lightness alternates high/low so neighbours stay apart in greyscale — a
 * printout, a dying projector or achromatopsia sees only tone. (An earlier
 * revision had series 4 and 5 both at 500: ΔE 42 apart in colour, 1.11:1 in
 * luminance, one line in greyscale.) Light uses the ramp grid's own 600/500
 * lightness; dark cannot, because the dark band holds one grid step (500), which
 * is why dark slots 2–5 come from `fromOklch` rather than a ramp.
 *
 * Purple, teal and olive are coordinates, not ramps: a series needs one colour
 * per theme, not eleven steps. Olive is in for the job the old teal-cyan
 * (info[600]) could not do — at slot 5's low lightness, cyan cannot reach the
 * 0.10 chroma floor inside sRGB at all; clamped, it stops at 0.083.
 *
 * ── WHAT IS STILL TRUE ──────────────────────────────────────────────────────
 *
 * Adjacent pairs are what the gate holds, because bars and stacks only touch
 * their neighbours. Two non-adjacent pairs stay weak under CVD and no ordering
 * of five hues fixes that (the dataviz method calls it the series cap):
 * series 1↔3 (blue/purple, ΔE 5.0 deutan in dark) and 2↔5 (orange/olive,
 * 5.2 protan in dark). So a scatter or bubble chart, where any two marks can
 * sit side by side, should still use three series — and never rely on colour
 * alone: label lines directly or give them markers.
 */
const chartSlot = (hue: number, chroma: number, l: { light: number; dark: number }) => ({
  light: fromOklch(l.light, chroma, hue),
  dark: fromOklch(l.dark, chroma, hue),
});

const chartOrange = { light: warning[500], dark: fromOklch(0.665, 0.14, 70) };
const chartPurple = chartSlot(320, 0.14, { light: 0.483, dark: 0.585 });
const chartTeal = chartSlot(175, 0.14, { light: 0.598, dark: 0.665 });
const chartOlive = chartSlot(110, 0.14, { light: 0.483, dark: 0.575 });

/** Chart series, light theme. `--chart-1..5` in light resolve to these. */
export const chartSeries = [
  primary[600], // KOC blue — series 1 is always the brand
  chartOrange.light, // the warm pole — maximal separation from blue
  chartPurple.light,
  chartTeal.light,
  chartOlive.light,
] as const;

/** Chart series, dark theme. Same hues, re-stepped into the dark band. */
export const chartSeriesDark = [
  primary[500], // 400 is above the dark band; 500 is the brand ramp's step inside it
  chartOrange.dark,
  chartPurple.dark,
  chartTeal.dark,
  chartOlive.dark,
] as const;
