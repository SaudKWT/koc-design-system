/**
 * Direction E v2 — "Wellpath", daily-use round.
 *
 * v1 optimised for the first visit: a full-screen tour down a well, the
 * dashboards a scroll below. v2 optimises for the hundredth. The first screen
 * is an instrument band — search (Ctrl+K), twelve figures, your pinned and
 * recent dashboards — then the directory with every link visible. The tour
 * survives intact as a large footer, lazy-mounted, never under a link.
 *
 * v1 stays in ../e as the backup.
 */

import "./landing-e2.css";

import { useMemo, useRef, useState } from "react";

import { GROUP } from "../data";
import { matchDashboards, useDashboardMemory, useFindShortcut, useReducedMotion } from "../shared";
import { Directory, teamDomId } from "./Directory";
import { WellStage } from "./Stage";
import { Header, KpiBand, YourDashboards } from "./Top";

const STAGE_ID = "dwe2-tour";

export default function DirectionE2() {
  const reduced = useReducedMotion();
  const findRef = useRef<HTMLInputElement>(null);
  const dirHeadingRef = useRef<HTMLHeadingElement>(null);
  const [query, setQuery] = useState("");
  const matches = useMemo(() => matchDashboards(query), [query]);
  const memory = useDashboardMemory();
  useFindShortcut(findRef);

  const behavior: ScrollBehavior = reduced ? "auto" : "smooth";
  const focusEl = (el: HTMLElement | null) => {
    if (!el) return;
    el.scrollIntoView({ behavior, block: "start" });
    el.focus({ preventScroll: true });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header
        query={query}
        onQuery={setQuery}
        inputRef={findRef}
        onSkip={() => focusEl(dirHeadingRef.current)}
        onFirstResult={() => {
          const first = document.querySelector<HTMLAnchorElement>("#dwe2-directory a[href]");
          first?.scrollIntoView({ behavior, block: "nearest" });
          first?.focus({ preventScroll: true });
        }}
        onTour={() => document.getElementById(STAGE_ID)?.scrollIntoView({ behavior, block: "start" })}
      />
      <main>
        <div className="dark border-b border-border bg-background text-foreground">
          <KpiBand />
          <YourDashboards {...memory} />
        </div>
        <Directory
          query={query}
          matches={matches}
          isPinned={memory.isPinned}
          togglePin={memory.togglePin}
          headingRef={dirHeadingRef}
          onJump={(code) => focusEl(document.getElementById(`${teamDomId(code)}-name`))}
        />
      </main>
      <footer className="dark bg-background text-foreground">
        <WellStage id={STAGE_ID} />
        <div className="border-t border-border">
          <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 pt-8 pb-24 text-xs text-muted-foreground sm:px-8 lg:flex-row lg:justify-between">
            <div className="font-mono uppercase tracking-wider">
              <div className="text-foreground">{GROUP.name}</div>
              <div className="mt-1">
                {GROUP.directorate} · {GROUP.company}
              </div>
            </div>
            <p className="max-w-2xl lg:text-right">
              The 3D well is illustrative, not a KOC well; its rig, casing, BHA and bit are modelled to standard
              dimensions. Formation names and order follow GeoExpro, “The Great Burgan field, Kuwait”; depths other than
              Wara’s are illustrative. Dashboard names and every figure on this page are placeholders. Pins and recent
              dashboards are kept in this browser only.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
