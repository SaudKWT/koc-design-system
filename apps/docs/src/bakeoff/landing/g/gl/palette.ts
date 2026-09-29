/**
 * KOC semantic tokens, read at runtime and handed to WebGL as linear RGB.
 *
 * Invariant 1 holds here too: there is no colour literal in this folder. The
 * browser resolves `var(--primary)` (oklch in the source), a 1×1 canvas turns
 * whatever it resolved to into sRGB bytes, and those are linearised for
 * shading. Re-read whenever `dark` toggles on <html>.
 */

export type RGB = [number, number, number];

export interface Palette {
  background: RGB;
  foreground: RGB;
  card: RGB;
  muted: RGB;
  mutedForeground: RGB;
  primary: RGB;
  dark: boolean;
}

const TOKENS = {
  background: "--background",
  foreground: "--foreground",
  card: "--card",
  muted: "--muted",
  mutedForeground: "--muted-foreground",
  primary: "--primary",
} as const;

const toLinear = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

export function readPalette(): Palette {
  const cvs = document.createElement("canvas");
  cvs.width = cvs.height = 1;
  const ctx = cvs.getContext("2d", { willReadFrequently: true });
  const read = (token: string): RGB => {
    // A fresh probe per token, with transitions forced off. The token sheet's
    // reduced-motion rule sets `* { transition-duration: 0.01ms !important }`,
    // so re-colouring ONE probe starts a (tiny) transition and getComputedStyle
    // returns its START value: every token read back as the first one, and the
    // whole drawing went background-on-background whenever the page loaded with
    // reduced motion on. An inline !important beats the sheet's !important.
    const probe = document.createElement("span");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none";
    probe.style.setProperty("transition", "none", "important");
    probe.style.color = `var(${token})`;
    document.body.appendChild(probe);
    const css = getComputedStyle(probe).color;
    probe.remove();
    if (!ctx) return [0.5, 0.5, 0.5];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "transparent";
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [toLinear(d[0]), toLinear(d[1]), toLinear(d[2])];
  };
  const out = Object.fromEntries(Object.entries(TOKENS).map(([k, v]) => [k, read(v)])) as Omit<Palette, "dark">;
  const lum = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return { ...out, dark: lum(out.background) < 0.2 };
}

export const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** Linear → sRGB CSS string, for the 2D-canvas fallback. */
export function css(c: RGB, alpha = 1): string {
  const s = (v: number) => Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
  return `rgb(${s(c[0])} ${s(c[1])} ${s(c[2])} / ${alpha})`;
}
