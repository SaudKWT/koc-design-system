/**
 * The footer console — where v1's hero instrument now lives in full.
 *
 * A second dark faceplate closes the page, bookending the first: the weight indicator at full
 * size in its flanged mount, the engraved nameplate that states every fact the dial draws, and
 * the operating card for the daily controls. The daily reader never needs to scroll here; it is
 * the page's showpiece, and the place its one piece of ambient motion is allowed to live.
 *
 * Motion: the needle is parked at zero until the gauge is first well into view, then settles
 * once with a damped swing (drill-floor.css, `df2-needle-swing`, AMBIENT). The observer is the
 * shared `useInView`, which fires once and disconnects. Reduced motion (OS or the viewer's
 * toggle): the needle is simply drawn at its reading — never parked, never swinging.
 */

import type { ReactNode } from "react";
import { CornerDownLeft, Pin } from "lucide-react";

import { DATA_AS_OF, GROUP, formatKpi } from "../data";
import { useInView } from "../shared";
import { NeedleGlyph, TattletaleGlyph, WeightIndicator } from "./Dial";
import { Graticule } from "./Graticule";
import { kpi, paceOf, type AsOf } from "./Readings";
import { Corners } from "./Corners";

export function Console({ asOf }: { asOf: AsOf }) {
  const budget = kpi("budget");
  const pace = paceOf(budget, asOf.yearElapsed);
  // Fires once the gauge's top has passed ~70% of the viewport height.
  const [gaugeRef, seen] = useInView<HTMLDivElement>("0px 0px -30% 0px");

  return (
    <footer className="df2-foot dark relative isolate overflow-hidden border-t border-border bg-card text-foreground">
      <Graticule className="df2-graticule-foot" />
      <Corners />

      <div className="relative mx-auto grid max-w-[90rem] gap-x-12 gap-y-8 px-4 pt-10 pb-8 md:px-6 lg:grid-cols-[auto_minmax(0,1fr)] lg:pt-12">
        {/* The instrument */}
        <div
          ref={gaugeRef}
          data-df2-live={seen || undefined}
          className="df2-gauge mx-auto aspect-square w-full max-w-[22rem] lg:w-[23rem] lg:max-w-none"
        >
          <WeightIndicator value={budget.value} marker={asOf.yearElapsed ?? budget.value} unit={budget.unit} />
        </div>

        <div className="flex min-w-0 flex-col gap-8 xl:flex-row xl:gap-12">
          {/* The nameplate: every fact the dial draws, as text */}
          <section aria-labelledby="df2-gauge-h" className="flex min-w-0 flex-col gap-4 xl:flex-[1.35]">
            <p className="font-mono text-2xs tracking-widest text-muted-foreground uppercase">
              Instrument 01 · Weight indicator
            </p>
            <h2 id="df2-gauge-h" className="font-mono text-xl leading-tight font-semibold tracking-wide uppercase">
              {budget.label}
            </h2>
            <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
              {budget.description} The needle reads what has been spent; the hollow tattletale marks how much of the
              year had passed at {DATA_AS_OF}, so the gap between the two is the pace.
            </p>
            <dl className="mt-2 grid grid-cols-3 lg:mt-auto gap-px overflow-hidden rounded-sm border border-border bg-border font-mono">
              <div className="flex flex-col gap-2 bg-background px-3 py-3">
                <dt className="flex items-center gap-2 text-2xs tracking-wider text-muted-foreground uppercase">
                  <NeedleGlyph />
                  Spent
                </dt>
                <dd className="text-2xl leading-none font-semibold tabular-nums">
                  {formatKpi(budget, budget.value)}
                  <span className="text-sm font-normal text-muted-foreground">{budget.unit}</span>
                </dd>
              </div>
              <div className="flex flex-col gap-2 bg-background px-3 py-3">
                <dt className="flex items-center gap-2 text-2xs tracking-wider text-muted-foreground uppercase">
                  <TattletaleGlyph />
                  Year elapsed
                </dt>
                <dd className="text-2xl leading-none font-semibold tabular-nums">
                  {asOf.yearElapsed ?? "—"}
                  <span className="text-sm font-normal text-muted-foreground">%</span>
                </dd>
              </div>
              <div className="flex flex-col gap-2 bg-background px-3 py-3">
                <dt className="text-2xs tracking-wider text-muted-foreground uppercase">Pace</dt>
                <dd className="flex flex-col gap-1.5">
                  <span className="text-2xl leading-none font-semibold tabular-nums">{pace?.points ?? "—"}</span>
                  {pace && <span className="text-2xs tracking-wider text-muted-foreground uppercase">{pace.verdict}</span>}
                </dd>
              </div>
            </dl>
          </section>

          {/* The operating card: the daily controls, engraved */}
          <section aria-labelledby="df2-card-h" className="flex min-w-0 flex-col gap-4 xl:flex-1">
            <h2 id="df2-card-h" className="font-mono text-2xs font-semibold tracking-widest text-muted-foreground uppercase">
              Operating card
            </h2>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] overflow-hidden rounded-sm border border-border font-mono text-2xs tracking-wider uppercase">
              <OperatingRow keys={<Key>Ctrl K</Key>}>Find a dashboard by name, team code or platform</OperatingRow>
              <OperatingRow keys={<Key>↓</Key>}>From the find field, step to the first match</OperatingRow>
              <OperatingRow
                keys={
                  <Key>
                    <CornerDownLeft aria-hidden="true" className="size-3" />
                    <span className="sr-only">Enter</span>
                  </Key>
                }
              >
                Open the first match in a new tab
              </OperatingRow>
              <OperatingRow keys={<Key>Esc</Key>}>Clear the find</OperatingRow>
              <OperatingRow
                keys={
                  <Key>
                    <Pin aria-hidden="true" className="size-3" />
                    <span className="sr-only">Pin</span>
                  </Key>
                }
              >
                Keep a dashboard on the preset bank, in this browser
              </OperatingRow>
            </dl>
          </section>
        </div>
      </div>

      {/* The identity line, and the one stamp every figure on the page answers to. Below md the
          viewer's bar floats over the page foot, so the line is padded clear of it. */}
      <div className="relative border-t border-border">
        <p className="mx-auto flex max-w-[90rem] flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3 pb-20 font-mono text-2xs tracking-wider text-muted-foreground uppercase md:px-6 md:pb-3">
          <span>
            <span className="font-semibold text-foreground">{GROUP.abbr}</span> · {GROUP.name} · {GROUP.directorate}
            {" · "}
            {GROUP.company}
          </span>
          {/* The stamp wraps as a whole, never between "28" and "Sep". */}
          <span className="whitespace-nowrap md:ml-auto">Data as of {DATA_AS_OF} · Sample data</span>
        </p>
      </div>
    </footer>
  );
}

function OperatingRow({ keys, children }: { keys: ReactNode; children: ReactNode }) {
  return (
    <div className="col-span-2 grid grid-cols-subgrid border-b border-border last:border-b-0">
      <dt className="flex items-center border-r border-border bg-background px-3 py-2">{keys}</dt>
      <dd className="flex items-center px-3 py-2 leading-snug text-muted-foreground">{children}</dd>
    </div>
  );
}

function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center gap-1 rounded-sm border border-border bg-muted px-1.5 font-mono text-2xs tracking-normal text-foreground normal-case">
      {children}
    </kbd>
  );
}
