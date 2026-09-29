/**
 * KOC semantic tokens, read at runtime and handed to WebGL as linear RGB.
 *
 * Invariant 1 holds in the GPU too: no colour in this folder is typed. A probe
 * element takes `color: var(--token)` (which may resolve to oklch()), a 1×1 2D
 * canvas paints it, and the pixel comes back as sRGB bytes — the browser does
 * the colour-space conversion, so this works for any colour syntax the token
 * pipeline emits. Re-read whenever `.dark` toggles on <html>.
 */

export type RGB = [number, number, number];

const NAMES = [
  "background",
  "foreground",
  "card",
  "muted",
  "muted-foreground",
  "border",
  "primary",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "success",
  "warning",
  "info",
] as const;

export type TokenName = (typeof NAMES)[number];
export type Palette = Record<TokenName, RGB> & { dark: boolean };

const toLinear = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

export function readPalette(scope: Element = document.body): Palette {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  const out = {} as Palette;
  for (const name of NAMES) {
    // A fresh probe per token, with transitions forced off. Re-using one probe
    // reads stale values: under reduced motion the base layer gives everything
    // a near-zero transition, and a computed colour mid-transition is still the
    // PREVIOUS token — every read came back as --background.
    const probe = document.createElement("span");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;visibility:hidden";
    probe.style.setProperty("transition", "none", "important");
    probe.style.color = `var(--${name})`;
    scope.appendChild(probe);
    const css = getComputedStyle(probe).color;
    probe.remove();
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    out[name] = [toLinear(r), toLinear(g), toLinear(b)];
  }
  const lum = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  out.dark = lum(out.background) < lum(out.foreground);
  return out;
}

export const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** Call `cb` whenever the theme class on <html> changes. Returns the disposer. */
export function onThemeChange(cb: () => void): () => void {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
  return () => obs.disconnect();
}
