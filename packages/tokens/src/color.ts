/**
 * Colour ramp generation for the KOC Design System.
 *
 * Ramps are built in OKLCH rather than by hand-picking hex values, so that each
 * step is a perceptually even distance from its neighbours. Two colours with the
 * same OKLCH lightness look equally light to the eye regardless of hue, which is
 * what makes a `-600` of one hue swappable for a `-600` of another.
 *
 * The primary ramp is *anchored*: KOC's real blue is pinned to a step and the
 * rest of the ramp is generated around it, so #0060A9 survives the process
 * byte-exact instead of being approximated.
 */

import { oklch, formatHex, formatCss, wcagContrast, clampChroma } from "culori";

export type Step = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950;

export const STEPS: readonly Step[] = [
  50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950,
] as const;

export type Ramp = Record<Step, string>;

/**
 * Target lightness per step.
 *
 * Calibrated so that step 600 lands on L=0.483 — the measured lightness of
 * #0060A9 — and step 700 lands on L≈0.42, which is where KOC's own hover and
 * pressed blues (#054C82 L=0.408, #0C538A L=0.432) already sit. The ramp is
 * therefore not an invention: it reproduces how KOC already uses its blue.
 *
 * Spacing is tighter at the light end because the eye discriminates lightness
 * more finely there; a linear ramp would look like it "jumps" between 50 and 200.
 */
const LIGHTNESS: Record<Step, number> = {
  50: 0.971,
  100: 0.936,
  200: 0.882,
  300: 0.813,
  400: 0.709,
  500: 0.598,
  600: 0.483, // anchor — measured from #0060A9
  700: 0.421,
  800: 0.354,
  900: 0.286,
  950: 0.206,
};

/**
 * Chroma as a fraction of the ramp's peak chroma.
 *
 * A bell curve peaking at the anchor. Saturation has to fall away at both ends
 * or the light steps turn chalky-pastel and the dark steps turn to ink — both
 * of which stop reading as the same colour family.
 */
const CHROMA_CURVE: Record<Step, number> = {
  50: 0.09,
  100: 0.20,
  200: 0.40,
  300: 0.61,
  400: 0.83,
  500: 0.95,
  600: 1.0, // peak — the brand colour itself
  700: 0.92,
  800: 0.76,
  900: 0.58,
  950: 0.40,
};

export interface RampOptions {
  /** Hue in OKLCH degrees. */
  hue: number;
  /** Peak chroma, reached at `anchorStep`. */
  peakChroma: number;
  /** Which step the peak chroma belongs to. */
  anchorStep?: Step;
  /**
   * Pin this exact hex at `anchorStep`, bypassing generation for that one step.
   * Used so the real brand colour is preserved exactly rather than round-tripped.
   */
  pin?: string;
  /**
   * Gentle hue drift across the ramp, in degrees. Positive shifts dark steps
   * warmer. Mimics how real pigments shift and stops the ramp feeling synthetic.
   */
  hueDrift?: number;
}

/**
 * Build one perceptually-even ramp.
 *
 * Every generated colour is gamut-clamped to sRGB. `clampChroma` reduces chroma
 * while holding lightness and hue, which is the right trade — a slightly duller
 * colour reads as the same hue, whereas a naive clip shifts the hue visibly.
 */
export function buildRamp(opts: RampOptions): Ramp {
  const { hue, peakChroma, anchorStep = 600, pin, hueDrift = 0 } = opts;
  const ramp = {} as Ramp;

  for (const step of STEPS) {
    if (pin && step === anchorStep) {
      ramp[step] = pin.toUpperCase();
      continue;
    }

    // Drift is applied on a -1..+1 axis centred on the anchor.
    const idx = STEPS.indexOf(step);
    const anchorIdx = STEPS.indexOf(anchorStep);
    const position = (idx - anchorIdx) / (STEPS.length - 1);

    const color = clampChroma(
      {
        mode: "oklch" as const,
        l: LIGHTNESS[step],
        c: peakChroma * CHROMA_CURVE[step],
        h: hue + hueDrift * position,
      },
      "oklch",
      "rgb",
    );

    ramp[step] = formatHex(color)!.toUpperCase();
  }

  return ramp;
}

/** WCAG 2.1 contrast ratio between two colours. */
export function contrast(a: string, b: string): number {
  return wcagContrast(a, b) ?? 0;
}

/**
 * Pick whichever of white/near-black is legible on `bg`.
 *
 * Prefers white on the assumption that coloured surfaces are usually brand
 * surfaces, but only if white actually clears the threshold.
 */
export function foregroundFor(bg: string, threshold = 4.5): string {
  const onWhite = contrast(bg, "#FFFFFF");
  return onWhite >= threshold ? "#FFFFFF" : "#0A0F14";
}

/** Format a hex as an OKLCH CSS string — the form Tailwind v4 and shadcn expect. */
export function toOklchCss(hex: string): string {
  const c = oklch(hex);
  if (!c) throw new Error(`Cannot parse colour: ${hex}`);
  const l = Number(c.l.toFixed(4));
  const ch = Number((c.c ?? 0).toFixed(4));
  const h = Number((c.h ?? 0).toFixed(2));
  return `oklch(${l} ${ch} ${h})`;
}

/** Describe a colour in OKLCH terms — used by the build report. */
export function describe(hex: string) {
  const c = oklch(hex)!;
  return {
    hex: hex.toUpperCase(),
    l: Number(c.l.toFixed(4)),
    c: Number((c.c ?? 0).toFixed(4)),
    h: Number((c.h ?? 0).toFixed(2)),
    onWhite: Number(contrast(hex, "#FFFFFF").toFixed(2)),
    onBlack: Number(contrast(hex, "#000000").toFixed(2)),
  };
}

export { formatCss };
