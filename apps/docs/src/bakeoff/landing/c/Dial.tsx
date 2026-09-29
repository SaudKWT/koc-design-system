/**
 * The weight-indicator dial — the one crafted object on the page.
 *
 * Modelled on the driller's weight indicator: a full-circle scale, 0 at twelve o'clock running
 * clockwise, one needle, and a "tattletale" (the drag hand that marks a reference). The bezel's
 * 180 radial ticks, one every 2°, follow CoMinVi's gauge (https://www.awwwards.com/sites/cominvi).
 *
 * The SVG is decorative (`aria-hidden`); every fact it draws is also text — the figure in the
 * collar and the legend beside the dial.
 *
 * It is sized by its container (one drawing at every breakpoint, not one per size). The scale
 * figures are 11.6 view-box units: ~10px on the 176px desktop dial, ~9.3px on the 160px phone one.
 *
 * Motion: the needle's base style IS its final angle. A keyframe `from { rotate: 0 }` settles it
 * once at duration-slower / ease-spring; reduced motion sets `animation: none`, so the needle is
 * simply drawn where it belongs. The tattletale never moves. See drill-floor.css.
 */

import type { CSSProperties } from "react";

import { cn } from "@koc/ui";

const C = 100; // centre of the 200 × 200 view box
const R_RIM = 99; // outer edge of the bezel
const R_LIP = 95.5; // the bezel's machined inner lip
const R_TICK = 89; // outer end of every tick
const R_COLLAR = 50; // the recessed collar that holds the digital figure

/** A point `r` from the centre at `deg` clockwise from twelve o'clock. */
function polar(r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

function tickPath(filter: (i: number) => boolean, inner: number): string {
  let d = "";
  for (let i = 0; i < 180; i++) {
    if (!filter(i)) continue;
    const [x1, y1] = polar(R_TICK, i * 2);
    const [x2, y2] = polar(inner, i * 2);
    d += `M${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }
  return d;
}

// 180 ticks, one every 2°. Every 10 % (36°) is a major, every 5 % (18°) a mid, the rest minor.
const MAJOR = tickPath((i) => i % 18 === 0, 76);
const MID = tickPath((i) => i % 18 === 9, 81);
const MINOR = tickPath((i) => i % 9 !== 0, 85);
const LABELS = [0, 20, 40, 60, 80].map((pct) => {
  const [x, y] = polar(67, pct * 3.6);
  return { pct, x, y };
});

export function Dial({
  value,
  marker,
  className,
}: {
  /** Needle position, 0–100. */
  value: number;
  /** Tattletale position, 0–100. */
  marker: number;
  className?: string;
}) {
  const needleStyle = { "--c-needle-angle": `${value * 3.6}deg` } as CSSProperties;
  return (
    <svg viewBox="0 0 200 200" aria-hidden="true" className={cn("block size-full overflow-visible", className)}>
      {/* Bezel: rim, machined lip, and the recessed face */}
      <circle cx={C} cy={C} r={R_RIM} className="fill-background stroke-border" strokeWidth={1} />
      <circle cx={C} cy={C} r={R_LIP} className="fill-none stroke-foreground/10" strokeWidth={0.75} />
      <circle cx={C} cy={C} r={R_TICK + 1.5} className="fill-none stroke-border" strokeWidth={0.75} />

      {/* The 180 ticks */}
      <path d={MINOR} className="stroke-muted-foreground/55" strokeWidth={0.7} />
      <path d={MID} className="stroke-muted-foreground" strokeWidth={1.1} />
      <path d={MAJOR} className="stroke-foreground" strokeWidth={1.8} />

      {/* Scale figures, upright */}
      {LABELS.map((l) => (
        <text
          key={l.pct}
          x={l.x}
          y={l.y}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-muted-foreground font-mono"
          style={{ fontSize: 11.6 }}
        >
          {l.pct}
        </text>
      ))}

      {/* Collar round the digital figure, with its own lip */}
      <circle cx={C} cy={C} r={R_COLLAR + 3} className="fill-none stroke-foreground/10" strokeWidth={0.75} />
      <circle cx={C} cy={C} r={R_COLLAR} className="fill-card stroke-border" strokeWidth={1} />

      {/* Tattletale — hollow, neutral, static. It sits on the bezel and points in at the scale. */}
      <g transform={`rotate(${marker * 3.6} ${C} ${C})`}>
        <path
          d={`M${C} ${C - R_TICK - 1.5}L${C - 4.2} ${C - R_RIM + 0.7}L${C + 4.2} ${C - R_RIM + 0.7}Z`}
          className="fill-background stroke-foreground"
          strokeWidth={1.2}
          strokeLinejoin="round"
        />
      </g>

      {/* Needle — instrument ink. It rises out of the collar and runs to the tick ring, with a
          hairline of face colour round it so it reads cleanly where it crosses a tick. */}
      <g className="c-needle duration-slower" style={needleStyle}>
        <path
          d={`M${C - 3.2} ${C - R_COLLAR + 3}L${C - 0.5} ${C - R_TICK - 1}L${C + 0.5} ${C - R_TICK - 1}L${C + 3.2} ${C - R_COLLAR + 3}Z`}
          className="fill-primary stroke-background"
          strokeWidth={0.9}
          strokeLinejoin="round"
          paintOrder="stroke"
        />
        <circle cx={C} cy={C - R_COLLAR} r={2.1} className="fill-background stroke-primary" strokeWidth={1.2} />
      </g>
    </svg>
  );
}

/** The legend's glyphs, drawn to match the dial's hands. Decorative. */
export function NeedleGlyph() {
  return (
    <svg viewBox="0 0 10 12" aria-hidden="true" className="h-3 w-2.5 shrink-0">
      <path d="M3.4 12L4.6 0.5H5.4L6.6 12Z" className="fill-primary" />
    </svg>
  );
}

export function TattletaleGlyph() {
  return (
    <svg viewBox="0 0 10 12" aria-hidden="true" className="h-3 w-2.5 shrink-0">
      <path d="M5 11L1 3H9Z" className="fill-none stroke-foreground" strokeWidth={1.2} strokeLinejoin="round" />
    </svg>
  );
}
