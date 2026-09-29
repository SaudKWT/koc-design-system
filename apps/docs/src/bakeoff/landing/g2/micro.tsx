/**
 * Petronex's in-tile micro-graphics, ported to SVG in KOC tokens: tick
 * histograms with the latest bar picked out, dot trails, a stepped trace, a
 * pictogram of squares, a ring. Every mark is derived from data.ts — nothing
 * here invents a figure — and all of it is decorative (`aria-hidden`); the
 * number it illustrates is always in the text beside it.
 */

import { cn } from "@koc/ui";

import type { Kpi } from "../data";

const W = 120;
const H = 32;

function scale(values: number[]) {
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  return (v: number) => H - 3 - ((v - min) / span) * (H - 8);
}

/**
 * Vertical ticks, latest one in primary — Petronex's "P1 Oil" strip. `relative`
 * scales min→max instead of 0→max, for series (like crude at 2.31–2.41 mb/d)
 * whose movement would be invisible against zero. The number beside it is the
 * truth; this only shows shape.
 */
export function Ticks({ values, className, relative = false }: { values: number[]; className?: string; relative?: boolean }) {
  const max = Math.max(...values) || 1;
  const min = relative ? Math.min(...values) : 0;
  const span = max - min || 1;
  const step = W / values.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" className={cn("h-8 w-full", className)}>
      {values.map((v, i) => {
        const h = relative ? 4 + ((v - min) / span) * (H - 6) : Math.max(2, (v / max) * (H - 2));
        const last = i === values.length - 1;
        return (
          <rect
            key={i}
            x={i * step + step * 0.4}
            y={H - h}
            width={Math.max(1, step * 0.2)}
            height={h}
            className={last ? "fill-primary" : "fill-muted-foreground/35"}
          />
        );
      })}
    </svg>
  );
}

/** Dots along the trend — Petronex's "OPEX" row of points. */
export function Dots({ values, className }: { values: number[]; className?: string }) {
  // HTML dots, not SVG circles: a stretched viewBox would squash them to ellipses
  const y = scale(values);
  return (
    <div aria-hidden="true" className={cn("relative h-8 w-full", className)}>
      {values.map((v, i) => {
        const last = i === values.length - 1;
        return (
          <span
            key={i}
            className={cn(
              "absolute -translate-x-1/2 -translate-y-1/2 rounded-full",
              last ? "size-1.5 bg-primary" : "size-1 bg-foreground/60",
            )}
            style={{ left: `${(i / (values.length - 1)) * 100}%`, top: `${(y(v) / H) * 100}%` }}
          />
        );
      })}
    </div>
  );
}

/** A stepped trace with the final step highlighted — Petronex's "BOPD" line. */
export function Steps({ values, className }: { values: number[]; className?: string }) {
  const y = scale(values);
  const step = W / values.length;
  const d = values.map((v, i) => `${i ? "L" : "M"}${i * step},${y(v)} L${(i + 1) * step},${y(v)}`).join(" ");
  const lastY = y(values[values.length - 1]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" className={cn("h-8 w-full overflow-visible", className)}>
      <path d={d} fill="none" strokeWidth={1.25} vectorEffect="non-scaling-stroke" className="stroke-foreground/70" />
      <rect x={W - step} y={lastY - 3} width={step} height={6} className="fill-primary" />
    </svg>
  );
}

/** One square per unit, for small counts — Petronex's "Wells" pictogram. */
export function Squares({ count, className }: { count: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cn("flex flex-wrap gap-1", className)}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={cn("size-2", i === count - 1 ? "bg-primary" : "bg-foreground/70")} />
      ))}
    </div>
  );
}

/** A progress ring for a share — Petronex's "Uptime" dial. */
export function Ring({ share, className }: { share: number; className?: string }) {
  const r = 12, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-8 -rotate-90", className)}>
      <circle cx={16} cy={16} r={r} fill="none" strokeWidth={3} className="stroke-muted" />
      <circle cx={16} cy={16} r={r} fill="none" strokeWidth={3} strokeDasharray={`${c * share} ${c}`} className="stroke-primary" />
    </svg>
  );
}

const diffs = (v: number[]) => v.map((x, i) => (i ? x - v[i - 1] : x));

/** The right micro-graphic for each KPI's shape. */
export function MicroFor({ k, className }: { k: Kpi; className?: string }) {
  switch (k.id) {
    case "rigs":
    case "requests":
      return <Squares count={k.value} className={className} />;
    case "wells":
    case "workovers":
      return <Ticks values={diffs(k.trend)} className={className} />;
    case "budget":
      return <Ring share={k.value / 100} className={className} />;
    case "npt":
      return <Steps values={k.trend} className={className} />;
    default:
      return <Dots values={k.trend} className={className} />;
  }
}
