/**
 * Graticule — the faceplate's fine square grid.
 *
 * Ported from Magic UI's Grid Pattern (https://21st.dev/@dillionverma/components/grid-pattern,
 * upstream magicuidesign/magicui). Kept: the SVG `<pattern>` drawing the top and left edge of
 * each cell on the half pixel, so a 1px line lands on one device pixel. Changed:
 *   - lines only — the `strokeDasharray` option and the highlighted `squares` are gone
 *     (dashes read as dots, and dots belong to another direction);
 *   - a second, coarser pattern draws a major line every `majorEvery` cells, like an
 *     oscilloscope graticule;
 *   - colour is tokens only (see `.df2-graticule` in drill-floor.css), never gray-400/30;
 *   - the pattern ids come from `useId()`, sanitised, so two instances cannot collide.
 * Static: nothing moves, so there is no reduced-motion path to provide.
 */

import { useId } from "react";

import { cn } from "@koc/ui";

export function Graticule({
  cell = 16,
  majorEvery = 5,
  className,
}: {
  cell?: number;
  majorEvery?: number;
  className?: string;
}) {
  const raw = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const minorId = `df2-grat-minor-${raw}`;
  const majorId = `df2-grat-major-${raw}`;
  const major = cell * majorEvery;
  return (
    <svg aria-hidden="true" className={cn("df2-graticule pointer-events-none absolute inset-0 size-full", className)}>
      <defs>
        <pattern id={minorId} width={cell} height={cell} patternUnits="userSpaceOnUse" x={-1} y={-1}>
          <path d={`M.5 ${cell}V.5H${cell}`} fill="none" className="df2-graticule-minor" />
        </pattern>
        <pattern id={majorId} width={major} height={major} patternUnits="userSpaceOnUse" x={-1} y={-1}>
          <path d={`M.5 ${major}V.5H${major}`} fill="none" className="df2-graticule-major" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" strokeWidth={0} fill={`url(#${minorId})`} />
      <rect width="100%" height="100%" strokeWidth={0} fill={`url(#${majorId})`} />
    </svg>
  );
}
