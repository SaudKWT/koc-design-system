/**
 * Readings — the compact strip. v1's faceplate spent 200px on one dial and seven tall readouts;
 * v2 is read every morning, so the eight figures become one row of small instrument cells that
 * sits in the first viewport at 1440 × 900 and at 1280 × 630 alike (each cell carries `data-kpi`).
 *
 * Each cell: a mono LABEL (Cerebrium), the value with its unit, a 12-bar micro histogram (Vista
 * Energy's mini bars — bars, never a line), and the delta as text in its intent colour with the
 * verdict spelled out, so sentiment never rests on colour alone. Budget, the one proportion,
 * keeps the dial's language in miniature: the needle at 73 % and the year-elapsed tattletale.
 *
 * Nothing here moves. No count-up, no draw-on: a figure never changes while it is being read.
 */

import type { ReactNode } from "react";

import { cn } from "@koc/ui";

import { KPIS, formatKpi, type Kpi } from "../data";
import { SENTIMENT_TEXT, deltaSpeech, formatDelta, kpiSentiment } from "../shared";
import { MiniDial } from "./Dial";

export interface AsOf {
  time: string;
  /** Share of the year elapsed at DATA_AS_OF, 0–100, or null if the stamp can't be read. */
  yearElapsed: number | null;
}

export const kpi = (id: string) => KPIS.find((k) => k.id === id)!;
export const unitWord = (u: string) => ({ d: "days", h: "hours", "%": "percent" })[u] ?? u;

/** "On pace · −1 pt": budget spent against the share of the year gone. */
export function paceOf(budget: Kpi, yearElapsed: number | null) {
  if (yearElapsed === null) return null;
  const pace = budget.value - yearElapsed;
  return {
    pace,
    verdict: Math.abs(pace) <= 2 ? "On pace" : pace > 0 ? "Ahead of calendar" : "Behind calendar",
    points: pace === 0 ? "level" : `${pace > 0 ? "+" : "−"}${Math.abs(pace)} pt`,
  };
}

export function Readings({ asOf }: { asOf: AsOf }) {
  const sync = kpi("sync");
  // Budget leads, where v1's dial stood; the other seven keep the shared order.
  const ordered = [kpi("budget"), ...KPIS.filter((k) => k.id !== "budget")];
  const n = KPIS[0].trend.length;

  return (
    <section aria-labelledby="df2-readings">
      <div className="mb-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-2xs tracking-wider text-muted-foreground uppercase">
        <h2 id="df2-readings" className="font-semibold tracking-widest text-foreground">
          <span aria-hidden="true">Readings</span>
          <span className="sr-only">Group figures</span>
        </h2>
        {/* Kibo UI's Status anatomy (indicator + label), the ping stripped: a fixed stamp, never
            a feed, so the indicator is a static neutral square. */}
        <p className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="size-1.5 shrink-0 bg-muted-foreground" />
          <span>
            Updated {asOf.time} · DDR lag {formatKpi(sync, sync.value)}
            {/* Units keep their case: an uppercase "H" is the henry, not the hour. */}
            {sync.unit && <span className="normal-case">{` ${sync.unit}`}</span>} · Sample data
          </span>
        </p>
        <p aria-hidden="true" className="ml-auto hidden items-center gap-2 md:inline-flex">
          Bars · last {n} readings
          <span className="h-2.5 w-[3px] bg-muted-foreground/45" />
          earlier
          <span className="h-2.5 w-[3px] bg-primary" />
          latest
        </p>
      </div>

      <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-border bg-border md:grid-cols-4 xl:grid-cols-8">
        {ordered.map((k) =>
          k.id === "budget" ? <BudgetCell key={k.id} k={k} asOf={asOf} /> : <Readout key={k.id} k={k} />,
        )}
      </ul>
    </section>
  );
}

/** One instrument cell: label on top; value, bars and delta aligned to the foot of the row. */
function Cell({ k, children }: { k: Kpi; children: ReactNode }) {
  // "YTD" folds into the label; the no-break spaces keep "· YTD" off the start of a line.
  const label = k.tag === "YTD" ? `${k.label} · YTD` : k.label;
  return (
    <li data-kpi={k.id} className="flex min-w-0 flex-col bg-background px-3 pt-2 pb-2">
      <p className="font-mono text-2xs leading-snug tracking-wide text-muted-foreground uppercase">{label}</p>
      <div className="mt-auto pt-1.5">{children}</div>
    </li>
  );
}

function Value({ k }: { k: Kpi }) {
  return (
    <p className="font-mono text-xl leading-none font-semibold whitespace-nowrap tabular-nums">
      {formatKpi(k, k.value)}
      {k.unit && (
        // Units keep their case: "18.4 d", "2.5 h".
        <span className="ml-0.5 text-xs font-normal text-muted-foreground">
          {k.unit}
          <span className="sr-only"> ({unitWord(k.unit)})</span>
        </span>
      )}
    </p>
  );
}

function Readout({ k }: { k: Kpi }) {
  const s = kpiSentiment(k.delta, k.intent);
  const delta = formatDelta(k);
  const glyph = k.delta === undefined || k.delta === 0 ? "■" : k.delta > 0 ? "▲" : "▼";
  return (
    <Cell k={k}>
      <div className="flex items-end justify-between gap-2">
        <Value k={k} />
        <Bars values={k.trend} />
      </div>
      {/* Two fixed lines, so every cell's foot aligns: the arithmetic and its verdict, then the
          comparator. BETTER / WORSE is the meaning; neutral KPIs (rigs) carry no verdict.
          Screen readers get deltaSpeech() instead of the glyphs. */}
      <div className="mt-1.5 font-mono text-2xs leading-snug tracking-wide uppercase">
        {delta ? (
          <>
            <p aria-hidden="true" className={cn("font-semibold whitespace-nowrap tabular-nums", SENTIMENT_TEXT[s])}>
              {glyph} {delta}
              {s !== "flat" && <span className="ml-1.5">{s === "good" ? "Better" : "Worse"}</span>}
            </p>
            <p aria-hidden="true" className="truncate text-muted-foreground">
              {k.deltaLabel}
            </p>
            <p className="sr-only">{deltaSpeech(k)}</p>
          </>
        ) : (
          <p className="text-muted-foreground">No comparison</p>
        )}
      </div>
      <p className="sr-only">{k.description}</p>
    </Cell>
  );
}

/** Budget: the weight indicator in miniature, and the tattletale's reading as text. */
function BudgetCell({ k, asOf }: { k: Kpi; asOf: AsOf }) {
  const p = paceOf(k, asOf.yearElapsed);
  return (
    <Cell k={k}>
      <div className="flex items-end justify-between gap-2">
        <Value k={k} />
        <MiniDial value={k.value} marker={asOf.yearElapsed ?? k.value} className="-my-1 size-9" />
      </div>
      <div className="mt-1.5 font-mono text-2xs leading-snug tracking-wide text-muted-foreground uppercase">
        {p ? (
          <>
            <p className="font-semibold whitespace-nowrap text-foreground">
              {p.verdict} · {p.points}
            </p>
            <p className="truncate">Year elapsed {asOf.yearElapsed}%</p>
          </>
        ) : (
          <p>Year to date</p>
        )}
      </div>
      <p className="sr-only">{k.description}</p>
    </Cell>
  );
}

/**
 * Twelve bars of `k.trend`, oldest first; the last, the current reading, in instrument blue.
 * Drawn in whole device pixels (3px bars, 2px gaps) so the bars stay crisp at this size.
 * Floored just below the series minimum so a flat-ish series still shows its shape. Static.
 */
function Bars({ values }: { values: number[] }) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const floor = Math.max(0, min - (max - min) * 0.6);
  const H = 20;
  const W = values.length * 5 - 2;
  return (
    <svg
      width={W}
      height={H + 2}
      viewBox={`0 0 ${W} ${H + 2}`}
      aria-hidden="true"
      className="block shrink-0"
      shapeRendering="crispEdges"
    >
      {values.map((v, i) => {
        const h = Math.round(2 + ((v - floor) / (max - floor || 1)) * (H - 2));
        return (
          <rect
            key={i}
            x={i * 5}
            y={H - h}
            width={3}
            height={h}
            className={i === values.length - 1 ? "fill-primary" : "fill-muted-foreground/45"}
          />
        );
      })}
      <rect x={0} y={H + 1} width={W} height={1} className="fill-border" />
    </svg>
  );
}
