/**
 * Mineralsoft's component language, ported to KOC tokens:
 *   - the square-bullet eyebrow ("■ Problem & Solutions")
 *   - the two-weight title (Light line over Medium line)
 *   - the tick histogram under "Today Mined Oil 13,642 barrels"
 *   - the hatched bars of the "Spar Platform Productivity" panel
 *   - the dark tab that heads each "Insight" card
 * All CSS/SVG; nothing installed.
 */

import type { ReactNode } from "react";

import { cn } from "@koc/ui";

import { formatKpi, type Kpi } from "../data";
import {
  SENTIMENT_TEXT,
  deltaSpeech,
  formatDelta,
  kpiSentiment,
  useCountUp,
  useInView,
} from "../shared";

export function Eyebrow({ children, className, tone = "primary" }: { children: ReactNode; className?: string; tone?: "primary" | "ink" }) {
  return (
    <p className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)}>
      <span aria-hidden="true" className={cn("size-1.5 shrink-0", tone === "primary" ? "bg-primary" : "bg-foreground")} />
      {children}
    </p>
  );
}

/** "Turning Friction / into Flow": a light line over a medium one. */
export function TwoWeight({
  as: Tag = "h2",
  light,
  strong,
  className,
  id,
}: {
  as?: "h1" | "h2" | "h3";
  light: ReactNode;
  strong: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <Tag id={id} className={cn("tracking-tight text-foreground", className)}>
      <span className="block font-light">{light}</span>
      <span className="block font-medium">{strong}</span>
    </Tag>
  );
}

/**
 * Tick histogram: a dotted lead-in, then one tick per period, heights scaled
 * to the series' own range. The last tick is the current value.
 */
export function TickHistogram({
  values,
  className,
  lead = 10,
}: {
  values: number[];
  className?: string;
  lead?: number;
}) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const n = values.length + lead;
  const W = 200;
  const H = 28;
  const step = W / n;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" className={cn("h-7 w-full", className)}>
      {Array.from({ length: lead }, (_, i) => (
        <rect key={`d${i}`} x={i * step + step / 2 - 0.6} y={H - 1.2} width={1.2} height={1.2} className="fill-muted-foreground/50" />
      ))}
      {values.map((v, i) => {
        const h = 5 + ((v - min) / span) * (H - 6);
        const last = i === values.length - 1;
        return (
          <rect
            key={i}
            x={(lead + i) * step + step / 2 - 0.9}
            y={H - h}
            width={1.8}
            height={h}
            className={last ? "fill-primary" : "fill-primary/45"}
          />
        );
      })}
    </svg>
  );
}

/** Hatched bars on a filled panel — the "Spar Platform Productivity" chart. */
export function HatchBars({ values, className }: { values: number[]; className?: string }) {
  const max = Math.max(...values);
  const W = 240;
  const H = 120;
  const gap = 5;
  const bw = (W - gap * (values.length - 1)) / values.length;
  const id = "h2-hatch";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" className={cn("w-full", className)}>
      <defs>
        <pattern id={id} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="1.4" height="5" className="fill-current" />
        </pattern>
      </defs>
      {values.map((v, i) => {
        const h = Math.max(3, (v / max) * (H - 4));
        const x = i * (bw + gap);
        const last = i === values.length - 1;
        return (
          <g key={i}>
            <rect x={x} y={H - h} width={bw} height={h} fill={`url(#${id})`} className={last ? "opacity-100" : "opacity-55"} />
            <rect x={x} y={H - h} width={bw} height={1.4} className="fill-current" />
          </g>
        );
      })}
    </svg>
  );
}

/** Animated figure (aria-hidden) + the final value for assistive tech. */
export function KpiFigure({ k, start, className, unitClassName }: { k: Kpi; start: boolean; className?: string; unitClassName?: string }) {
  const v = useCountUp(k.value, start, 1100);
  return (
    <span className={cn("tabular-nums", className)}>
      <span aria-hidden="true">{formatKpi(k, v)}</span>
      <span className="sr-only">{`${formatKpi(k, k.value)}${k.unit ? ` ${k.unit}` : ""}`}</span>
      {k.unit && (
        <span aria-hidden="true" className={cn("ml-1 text-sm font-normal text-muted-foreground", unitClassName)}>
          {k.unit}
        </span>
      )}
    </span>
  );
}

export function Delta({ k, className, onFill = false }: { k: Kpi; className?: string; onFill?: boolean }) {
  const d = formatDelta(k);
  if (!d) return <span className={cn("text-2xs text-muted-foreground", onFill && "text-primary-foreground/75", className)}>No comparison</span>;
  const s = kpiSentiment(k.delta, k.intent);
  return (
    <span className={cn("text-2xs", className)}>
      <span aria-hidden="true">
        {/* On the primary panel the sentiment colour sits on a light pill, so
            green/red never has to read against KOC blue. */}
        <span className={cn("font-mono font-semibold", SENTIMENT_TEXT[s], onFill && "rounded-sm bg-primary-foreground px-1 py-px")}>{d}</span>
        <span className={onFill ? "text-primary-foreground/75" : "text-muted-foreground"}>{k.deltaLabel ? ` ${k.deltaLabel}` : ""}</span>
      </span>
      <span className="sr-only">{deltaSpeech(k)}</span>
    </span>
  );
}

export { useInView };
