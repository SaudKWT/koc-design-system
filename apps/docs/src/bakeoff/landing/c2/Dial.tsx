/**
 * The weight indicator — Drill Floor's one crafted object, now at two scales.
 *
 * Modelled on the driller's weight indicator: a full-circle scale, 0 at twelve o'clock running
 * clockwise, one needle, and a "tattletale" (the drag hand that marks a reference). The bezel's
 * 180 radial ticks, one every 2°, follow CoMinVi's gauge (https://www.awwwards.com/sites/cominvi).
 *
 *   <WeightIndicator>  the footer's full-size instrument, in a flanged mount with four hex-socket
 *                      screws. Its needle settles once, when the footer is first seen — a damped
 *                      swing, declared as AMBIENT motion in drill-floor.css.
 *   <MiniDial>         the same instrument at 36px, in the budget readout of the compact strip.
 *                      Ten majors, the needle and the tattletale; static.
 *
 * Both SVGs are decorative (`aria-hidden`): every fact they draw is also text beside them.
 * Colour is tokens only, through Tailwind fill/stroke utilities.
 */

import type { CSSProperties } from "react";

import { cn } from "@koc/ui";

/** A point `r` from (c, c) at `deg` clockwise from twelve o'clock. */
function polar(c: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [c + r * Math.cos(a), c + r * Math.sin(a)];
}

function tickPath(c: number, outer: number, inner: number, filter: (i: number) => boolean): string {
  let d = "";
  for (let i = 0; i < 180; i++) {
    if (!filter(i)) continue;
    const [x1, y1] = polar(c, outer, i * 2);
    const [x2, y2] = polar(c, inner, i * 2);
    d += `M${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }
  return d;
}

// ── Full size ───────────────────────────────────────────────────────────────────────────────

const C = 200; // centre of the 400 × 400 view box
const R_RIM = 176; // outer edge of the bezel
const R_LIP = 169; // the bezel's machined inner lip
const R_TICK = 160; // outer end of every tick
const R_COLLAR = 54; // the recessed collar that holds the digital figure

// 180 ticks, one every 2°. Every 10 % (36°) a major, every 5 % (18°) a mid, the rest minor.
const MAJOR = tickPath(C, R_TICK, 136, (i) => i % 18 === 0);
const MID = tickPath(C, R_TICK, 145, (i) => i % 18 === 9);
const MINOR = tickPath(C, R_TICK, 152, (i) => i % 9 !== 0);
const LABELS = Array.from({ length: 10 }, (_, n) => {
  const pct = n * 10;
  const [x, y] = polar(C, 120, pct * 3.6);
  return { pct, x, y };
});
const SCREWS = [
  [24, 24],
  [376, 24],
  [24, 376],
  [376, 376],
] as const;
/** A hex socket, point-up — a screw head that is never a "+" (another direction owns those). */
const hex = (x: number, y: number, r: number) =>
  Array.from({ length: 6 }, (_, i) => polar(0, r, i * 60 + 30))
    .map(([px, py], i) => `${i ? "L" : "M"}${(x + px).toFixed(2)} ${(y + py).toFixed(2)}`)
    .join("") + "Z";

export function WeightIndicator({
  value,
  marker,
  unit,
  className,
}: {
  /** Needle position, 0–100. */
  value: number;
  /** Tattletale position, 0–100. */
  marker: number;
  unit?: string;
  className?: string;
}) {
  const needleStyle = { "--df2-needle-angle": `${value * 3.6}deg` } as CSSProperties;
  const [gx1, gy1] = polar(C, 150, 292);
  const [gx2, gy2] = polar(C, 150, 338);
  return (
    <svg viewBox="0 0 400 400" aria-hidden="true" className={cn("block size-full", className)}>
      {/* The mount: a flanged square plate, four hex-socket screws */}
      <rect x={0.5} y={0.5} width={399} height={399} rx={22} className="fill-background stroke-border" strokeWidth={1} />
      <rect x={8.5} y={8.5} width={383} height={383} rx={16} className="fill-none stroke-foreground/8" strokeWidth={1} />
      {SCREWS.map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r={8.5} className="fill-card stroke-border" strokeWidth={1} />
          <path d={hex(x, y, 3.6)} className="fill-background stroke-foreground/25" strokeWidth={0.8} />
        </g>
      ))}

      {/* Bezel: rim, machined lip, and the recessed face */}
      <circle cx={C} cy={C} r={R_RIM + 8} className="fill-card stroke-border" strokeWidth={1} />
      <circle cx={C} cy={C} r={R_RIM} className="fill-background stroke-foreground/15" strokeWidth={1} />
      <circle cx={C} cy={C} r={R_LIP} className="fill-none stroke-foreground/8" strokeWidth={1} />
      <circle cx={C} cy={C} r={R_TICK + 2} className="fill-none stroke-border" strokeWidth={1} />

      {/* The 180 ticks */}
      <path d={MINOR} className="stroke-muted-foreground/55" strokeWidth={1} />
      <path d={MID} className="stroke-muted-foreground" strokeWidth={1.6} />
      <path d={MAJOR} className="stroke-foreground" strokeWidth={2.6} />

      {/* Scale figures, upright, every 10 */}
      {LABELS.map((l) => (
        <text
          key={l.pct}
          x={l.x}
          y={l.y}
          textAnchor="middle"
          dominantBaseline="central"
          className={cn("font-mono", l.pct === 0 ? "fill-foreground" : "fill-muted-foreground")}
          style={{ fontSize: 15, fontWeight: l.pct === 0 ? 600 : 400 }}
        >
          {l.pct}
        </text>
      ))}

      {/* Engraving on the face */}
      <text
        x={C}
        y={C - 76}
        textAnchor="middle"
        className="fill-muted-foreground font-mono uppercase"
        style={{ fontSize: 9.5, letterSpacing: "0.18em" }}
      >
        Budget · % of annual
      </text>
      <text
        x={C}
        y={C + 84}
        textAnchor="middle"
        className="fill-muted-foreground font-mono uppercase"
        style={{ fontSize: 9.5, letterSpacing: "0.18em" }}
      >
        DWEG · Drill floor
      </text>

      {/* The glass: one faint highlight, upper left */}
      <path
        d={`M${gx1.toFixed(2)} ${gy1.toFixed(2)}A150 150 0 0 1 ${gx2.toFixed(2)} ${gy2.toFixed(2)}`}
        className="fill-none stroke-foreground/6"
        strokeWidth={12}
        strokeLinecap="round"
      />

      {/* Collar round the digital figure, with its own lip */}
      <circle cx={C} cy={C} r={R_COLLAR + 5} className="fill-none stroke-foreground/10" strokeWidth={1} />
      <circle cx={C} cy={C} r={R_COLLAR} className="fill-card stroke-border" strokeWidth={1.2} />
      <text
        x={C}
        y={C + 2}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-foreground font-mono tabular-nums"
        style={{ fontSize: 34, fontWeight: 600 }}
      >
        {value}
        <tspan className="fill-muted-foreground" style={{ fontSize: 17, fontWeight: 400 }}>
          {unit}
        </tspan>
      </text>

      {/* Tattletale — hollow, neutral, static. It sits on the bezel and points in at the scale. */}
      <g transform={`rotate(${marker * 3.6} ${C} ${C})`}>
        <path
          d={`M${C} ${C - R_TICK - 3}L${C - 7.5} ${C - R_RIM - 5}L${C + 7.5} ${C - R_RIM - 5}Z`}
          className="fill-background stroke-foreground"
          strokeWidth={1.8}
          strokeLinejoin="round"
        />
      </g>

      {/* Needle — instrument ink, rising out of the collar to the tick ring, with a hairline of
          face colour round it so it reads cleanly where it crosses a tick. */}
      <g className="df2-needle" style={needleStyle}>
        <path
          d={`M${C - 5.5} ${C - R_COLLAR + 4}L${C - 0.9} ${C - R_TICK - 2}L${C + 0.9} ${C - R_TICK - 2}L${C + 5.5} ${C - R_COLLAR + 4}Z`}
          className="fill-primary stroke-background"
          strokeWidth={1.6}
          strokeLinejoin="round"
          paintOrder="stroke"
        />
        <circle cx={C} cy={C - R_COLLAR} r={3.6} className="fill-background stroke-primary" strokeWidth={2} />
      </g>
    </svg>
  );
}

// ── Miniature ───────────────────────────────────────────────────────────────────────────────

const M = 20; // centre of the 40 × 40 view box
const MINI_MAJOR = tickPath(M, 17.2, 13.6, (i) => i % 18 === 0 && i !== 0);
const MINI_ZERO = tickPath(M, 17.2, 12.4, (i) => i === 0);

export function MiniDial({ value, marker, className }: { value: number; marker: number; className?: string }) {
  const [nx, ny] = polar(M, 14.6, value * 3.6);
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" className={cn("block shrink-0", className)}>
      <circle cx={M} cy={M} r={18.6} className="fill-card stroke-border" strokeWidth={1} />
      <path d={MINI_MAJOR} className="stroke-muted-foreground" strokeWidth={1.1} />
      <path d={MINI_ZERO} className="stroke-foreground" strokeWidth={1.6} />
      <g transform={`rotate(${marker * 3.6} ${M} ${M})`}>
        <path d={`M${M} ${M - 15.4}L${M - 2.6} ${M - 19.6}L${M + 2.6} ${M - 19.6}Z`} className="fill-card stroke-foreground" strokeWidth={0.9} strokeLinejoin="round" />
      </g>
      <path d={`M${M} ${M}L${nx.toFixed(2)} ${ny.toFixed(2)}`} className="stroke-primary" strokeWidth={2} strokeLinecap="round" />
      <circle cx={M} cy={M} r={2.4} className="fill-primary" />
    </svg>
  );
}

// ── Legend glyphs, drawn to match the hands ─────────────────────────────────────────────────

export function NeedleGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 10 12" aria-hidden="true" className={cn("h-3 w-2.5 shrink-0", className)}>
      <path d="M3.4 12L4.6 0.5H5.4L6.6 12Z" className="fill-primary" />
    </svg>
  );
}

export function TattletaleGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 10 12" aria-hidden="true" className={cn("h-3 w-2.5 shrink-0", className)}>
      <path d="M5 11L1 3H9Z" className="fill-none stroke-foreground" strokeWidth={1.2} strokeLinejoin="round" />
    </svg>
  );
}
