/**
 * KOC semantic tokens → linear RGB for the shader.
 *
 * Invariant 1 holds inside the renderer too: no colour here is written by hand.
 * Each role is resolved from a CSS variable at runtime, so light and dark are
 * whatever `packages/tokens` says they are, and a token change reaches the 3D
 * without anyone touching this folder.
 *
 * The tokens are oklch(). `getComputedStyle` hands that string back unchanged,
 * so the browser's own colour pipeline does the conversion: paint it into a
 * 1×1 sRGB canvas and read the pixel.
 */

export type RGB = [number, number, number];

export interface Palette {
  background: RGB;
  card: RGB;
  foreground: RGB;
  primary: RGB;
  mutedForeground: RGB;
  border: RGB;
  /** True when the page is on the dark mapping — decided by luminance, not by a class name. */
  dark: boolean;
}

const TOKENS = {
  background: "--background",
  card: "--card",
  foreground: "--foreground",
  primary: "--primary",
  mutedForeground: "--muted-foreground",
  border: "--border",
} as const;

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

/** `probe` must be in the document, so `var()` resolves in the current theme scope. */
export function readPalette(probe: HTMLElement): Palette {
  const cvs = document.createElement("canvas");
  cvs.width = cvs.height = 1;
  const ctx = cvs.getContext("2d", { willReadFrequently: true, colorSpace: "srgb" })!;
  // TRAP: under prefers-reduced-motion the base layer sets
  // `transition-duration: 0.01ms !important` on every element, and
  // `transition-property` defaults to `all`. Every style write then starts a
  // transition, and a read in the same task returns its START value — the
  // inherited colour, for every token. The whole model rendered black.
  // An inline !important outranks the stylesheet's.
  probe.style.setProperty("transition-property", "none", "important");
  const read = (cssVar: string): RGB => {
    probe.style.color = `var(${cssVar})`;
    const css = getComputedStyle(probe).color;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [toLinear(d[0] / 255), toLinear(d[1] / 255), toLinear(d[2] / 255)];
  };
  const out = Object.fromEntries(
    Object.entries(TOKENS).map(([k, v]) => [k, read(v)]),
  ) as Omit<Palette, "dark">;
  const lum = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return { ...out, dark: lum(out.background) < lum(out.foreground) };
}

export const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
