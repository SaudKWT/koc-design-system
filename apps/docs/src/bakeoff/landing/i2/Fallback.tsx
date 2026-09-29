/**
 * No WebGL2, or the context is gone: the same bit as a line elevation, drawn
 * from the same dimensions as the 3D model — the INFRA plate falls back to
 * being a technical drawing, which is what it was imitating anyway.
 */

import { D, elevation } from "./gl/bit";

const X = (r: number) => r;
const Y = (y: number) => -y;

/** The bit's silhouette in elevation, as one closed path in inches (y flipped). */
function outlinePath(): string {
  const { profile, pinThread } = elevation();
  const half = (side: 1 | -1) => {
    const crown = profile.map(([r, y]) => `${X(side * r)},${Y(y)}`);
    return [
      ...crown,
      `${X(side * D.R)},${Y(D.yGB)}`,
      `${X(side * D.rCore)},${Y(D.yGB - 1.1)}`,
      `${X(side * D.rShank)},${Y(8)}`,
      `${X(side * D.rShank)},${Y(4.62)}`,
      `${X(side * (D.rShank - 0.12))},${Y(4.5)}`,
      ...pinThread
        .slice()
        .reverse()
        .map(([r, y]) => `${X(side * r)},${Y(y)}`),
    ];
  };
  const right = half(1);
  const left = half(-1).reverse();
  return `M ${right.join(" L ")} L ${left.join(" L ")} Z`;
}

/**
 * The same elevation at logo size — v2's masthead mark, standing where INFRA
 * puts its blue tile. Static: nothing moves in the working part of the page.
 */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="-5 -15 10 16" className={className} aria-hidden="true">
      <path d={outlinePath()} className="fill-primary/10 stroke-primary" strokeWidth={0.28} strokeLinejoin="round" />
      <line x1={0} y1={0.8} x2={0} y2={-14.6} className="stroke-primary" strokeWidth={0.18} strokeDasharray="1.2 0.5 0.3 0.5" />
    </svg>
  );
}

export function Fallback() {
  const { cutters } = elevation();
  const outline = outlinePath();
  return (
    <svg
      viewBox="-7 -16 14 17.5"
      className="h-full w-full text-primary"
      aria-hidden="true"
    >
      <path d={outline} className="fill-card" stroke="currentColor" strokeWidth={0.03} strokeLinejoin="round" />
      <line x1={0} y1={0.6} x2={0} y2={-14.6} stroke="currentColor" strokeWidth={0.02} strokeDasharray="0.8 0.15 0.15 0.15" />
      <line x1={-D.rShank} y1={Y(D.ySplit)} x2={D.rShank} y2={Y(D.ySplit)} stroke="currentColor" strokeWidth={0.02} />
      {[1, -1].flatMap((side) =>
        cutters.map(([r, y], k) => (
          <circle
            key={`${side}-${k}`}
            cx={side * r}
            cy={Y(y)}
            r={D.cutterR}
            className="fill-primary/15"
            stroke="currentColor"
            strokeWidth={0.025}
          />
        )),
      )}
    </svg>
  );
}
