// Prints fi3's no-WebGL line elevation (Fallback.tsx) as a static SVG, from
// the same dimensions as the 3D model. Colours are CSS classes the report's
// stylesheet resolves from tokens.
import { D, elevation } from "@fi3gl/bit";

const f = (n: number) => +n.toFixed(3);
const { profile, pinThread, cutters } = elevation();
const half = (side: 1 | -1) => [
  ...profile.map(([r, y]) => `${f(side * r)},${f(-y)}`),
  `${f(side * D.R)},${f(-D.yGB)}`,
  `${f(side * D.rCore)},${f(-(D.yGB - 1.1))}`,
  `${f(side * D.rShank)},${f(-8)}`,
  `${f(side * D.rShank)},${f(-4.62)}`,
  `${f(side * (D.rShank - 0.12))},${f(-4.5)}`,
  ...pinThread.filter((_, k) => k % 2 === 0).slice().reverse().map(([r, y]) => `${f(side * r)},${f(-y)}`),
];
const outline = `M ${half(1).join(" L ")} L ${half(-1).reverse().join(" L ")} Z`;
const dots = [1, -1].flatMap((side) => cutters.map(([r, y]) =>
  `<circle class="bc" cx="${f(side * r)}" cy="${f(-y)}" r="${f(D.cutterR)}"/>`)).join("");
process.stdout.write(
  `<svg class="bit-line" viewBox="-7 -16 14 17.5" aria-hidden="true" focusable="false">` +
  `<path class="bo" d="${outline}"/>` +
  `<line class="bl" x1="0" y1="0.6" x2="0" y2="-14.6" stroke-dasharray="0.8 0.15 0.15 0.15"/>` +
  `<line class="bl" x1="${f(-D.rShank)}" y1="${f(-D.ySplit)}" x2="${f(D.rShank)}" y2="${f(-D.ySplit)}"/>` +
  dots + `</svg>\n`);
