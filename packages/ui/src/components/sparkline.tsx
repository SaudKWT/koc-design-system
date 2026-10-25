import * as React from "react";

import { cn } from "../lib/utils";

/**
 * Sparkline — a trend's shape, in `currentColor`, with no axes.
 *
 * Ported from the DWEG landing's rig3 page (2026-10-25), where every KPI tile
 * carries one under its figure. A sparkline answers one question — "which way,
 * and is that new?" — and nothing else, so it deliberately has no scale, no
 * tooltip and no values. When the numbers matter, use a chart from
 * `@koc/chart`, which has all three and a table view.
 *
 * DECORATIVE TO ASSISTIVE TECHNOLOGY, ON PURPOSE
 * ----------------------------------------------
 * `aria-hidden`: the figure and the change line beside it already say, in
 * words, what the line shows. A screen reader announcing "image" under every
 * tile adds noise and no information. If a sparkline is ever the ONLY place a
 * trend appears, it is the wrong component.
 *
 * SIZING
 * ------
 * The SVG stretches to its box (`preserveAspectRatio="none"`) and the stroke
 * does not (`vector-effect: non-scaling-stroke`), so a tile can give it a
 * fixed height or let it fill the space left over (`flex-1`) and the line
 * stays 1.5px either way.
 */
export interface SparklineProps extends Omit<React.SVGProps<SVGSVGElement>, "values"> {
  /** At least two points; fewer draws nothing. */
  values: number[];
  strokeWidth?: number;
}

const W = 100;
const H = 28;

export function Sparkline({ values, strokeWidth = 1.5, className, ...props }: SparklineProps) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * W},${H - ((v - min) / span) * (H - 4) - 2}`)
    .join(" ");

  return (
    <svg
      data-slot="sparkline"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      className={cn("h-7 w-full overflow-visible text-primary/70", className)}
      {...props}
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
