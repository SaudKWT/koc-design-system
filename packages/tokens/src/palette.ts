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

import { buildRamp, type Ramp } from "./color.js";
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
 * Categorical chart series.
 *
 * Ordered so that a 2-series chart gets the maximum separation available (blue
 * vs orange — the most CVD-safe pair there is), with separation degrading
 * gracefully as series are added rather than falling off a cliff at series 5.
 *
 * Steps strictly alternate 600 → 500 → 600 → 500…, which is load-bearing rather
 * than tidy. Hue alone is not enough: a greyscale printout, a dying projector,
 * or a reader with achromatopsia sees only *tone*. Two series at the same step
 * share a lightness by construction and merge into one line for all of them.
 *
 * This is not hypothetical — an earlier revision had series 4 and 5 both at 500.
 * They measured ΔE 42 apart (vividly different to a colour-sighted reader) yet
 * 1.11:1 in luminance: indistinguishable in greyscale. The alternation is what
 * prevents that, and the greyscale assertion in contrast.test.ts is what keeps
 * anyone from quietly undoing it.
 *
 * Even so: never rely on colour alone to identify a series. Direct-label the
 * lines or give them markers.
 */
export const chartSeries = [
  primary[600], // KOC blue — series 1 is always the brand
  warning[500], // orange — maximal separation from blue
  success[600], // bluish-green
  accent[500], // reddish-purple
  info[600], // teal-cyan. 600 not 400: 400 measured 2.30:1 on the light page
  //            background — a thin line in that series was effectively
  //            invisible on a bright office screen.
  danger[500], // vermillion — last, so it is never reached for decoratively
] as const;
