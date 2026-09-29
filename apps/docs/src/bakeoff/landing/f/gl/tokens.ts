/**
 * KOC tokens → linear-light RGB for the shaders. Invariant 1 holds in WebGL
 * too: no colour is written here, every one is read from a semantic token at
 * runtime and re-read when the theme flips.
 *
 * Tokens may be oklch(); the browser resolves them, a 1×1 2D canvas turns the
 * resolved colour into sRGB bytes, and we linearise.
 */

import type { Palette, Rgb } from "./renderer";

let ctx: CanvasRenderingContext2D | null = null;

function srgbToLinear(c: number) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function readToken(probe: HTMLElement, name: string): Rgb {
  probe.style.color = `var(${name})`;
  const resolved = getComputedStyle(probe).color;
  if (!ctx) {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    ctx = c.getContext("2d", { willReadFrequently: true });
  }
  if (!ctx) return [0.5, 0.5, 0.5];
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = resolved;
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return [srgbToLinear(d[0]), srgbToLinear(d[1]), srgbToLinear(d[2])];
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const mul = (a: Rgb, s: number): Rgb => [a[0] * s, a[1] * s, a[2] * s];

/**
 * The diorama's palette, derived from semantic tokens only:
 *   --background / --foreground / --muted-foreground  the fog and the matte models
 *   --primary        KOC blue: the cool left of the sky, today's rig, the glint
 *   --info, --success  the teal and the green the fog leans toward on the right
 */
export function readPalette(probe: HTMLElement): Palette {
  const dark = document.documentElement.classList.contains("dark");
  const bg = readToken(probe, "--background");
  const fg = readToken(probe, "--foreground");
  const mutedFg = readToken(probe, "--muted-foreground");
  const primary = readToken(probe, "--primary");
  const info = readToken(probe, "--info");
  const success = readToken(probe, "--success");
  const card = readToken(probe, "--card");

  if (!dark) {
    const haze = mix(bg, mutedFg, 0.2);
    return {
      dark,
      horizon: mix(bg, card, 0.5),
      left: mix(haze, primary, 0.2),
      right: mix(haze, mix(info, success, 0.55), 0.24),
      zenith: mix(haze, mutedFg, 0.3),
      floor: mix(haze, mutedFg, 0.16),
      albedoDark: mix(mutedFg, fg, 0.15),
      albedoLight: mix(bg, card, 0.5),
      accent: primary,
      sun: mul(mix(card, bg, 0.3), 0.78),
      ambSky: mul(mix(bg, info, 0.08), 0.5),
      ambGround: mul(mix(bg, mutedFg, 0.35), 0.3),
      streak: mix(card, info, 0.25),
      vignette: mix(haze, mutedFg, 0.35),
    };
  }
  const haze = mix(bg, mutedFg, 0.1);
  return {
    dark,
    horizon: mix(bg, mutedFg, 0.24),
    left: mix(haze, primary, 0.1),
    right: mix(haze, mix(info, success, 0.5), 0.08),
    zenith: mix(bg, fg, 0.015),
    floor: mul(bg, 0.85),
    albedoDark: mix(bg, mutedFg, 0.12),
    albedoLight: mix(bg, mutedFg, 0.55),
    accent: primary,
    sun: mul(mix(fg, primary, 0.25), 0.34),
    ambSky: mul(mix(fg, primary, 0.3), 0.26),
    ambGround: mul(bg, 0.9),
    streak: mix(primary, info, 0.35),
    vignette: mul(bg, 0.7),
  };
}
